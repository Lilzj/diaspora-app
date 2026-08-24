// ─────────────────────────────────────────────────────────────────────────────
// A member's own purchases and tenancies
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// `GET /marketplace/reservations` and `GET /housing/reservations` have been
// serving a member's own transactions the whole time, and **no screen in the
// application called either.** So a member could buy something or move into a
// property and then find no record of it anywhere in the app.
//
// It also left the ratings work unreachable. Both review routes are gated on a
// completed transaction, so the only sensible place to offer "rate this" is
// beside the transaction — and there was no such place.
//
// ── The two shapes disagree in the way that keeps biting ─────────────────────
//
//     marketplace   reservationId   Seller: { sellerId, displayName, … }   completedAt
//     housing       id              landlordId + landlordName (flat)       occupiedAt
//
// Same concept, three different spellings apiece. Reading one shape and hoping
// is how `listing.host.*` crashed the housing screen and how `evt.id` sent every
// event row to `/event/undefined`. Both are normalised here, once, with the
// difference stated rather than smoothed over.
//
// ── What counts as rateable is the server's rule, not a guess ────────────────
//
// Marketplace gates a review on `Completed`; housing on `Occupied` — deliberately
// **not** `LeaseSigned`, which is a promise rather than a tenancy. Those two
// strings are the whole eligibility rule and they are pinned by tests, because
// widening them would offer a control the server then refuses.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { readPage } from './platform-envelope';
import type { ReviewSubject } from './reviews/write-target';

/** One transaction, in the shape a list row needs. */
export interface MemberReservation {
  /** The reservation. Named `id` here whatever the module called it. */
  id: string;
  /** What was bought or rented. */
  listingId: string;
  listingTitle: string;
  /** Who to rate: the seller or the landlord. */
  counterpartyId: string | null;
  counterpartyName: string | null;
  status: string;
  /** `seller` or `landlord` — which review route this row would use. */
  subject: Extract<ReviewSubject, 'seller' | 'landlord'>;
  /** When it completed, if it has. Null is not "recently". */
  settledAt: string | null;
  /** Whether the server would accept a review for this row today. */
  isRateable: boolean;
}

/**
 * The status each module requires before it will accept a review.
 *
 * Housing is `Occupied` rather than `LeaseSigned` on purpose: a signed lease is
 * an intention, and only occupancy gives somebody a tenancy to describe.
 */
export const RATEABLE_STATUS = {
  seller: 'Completed',
  landlord: 'Occupied',
} as const;

function marketplaceRow(row: any): MemberReservation {
  const status = String(row?.status ?? '');
  return {
    // `reservationId` here, `id` on the housing side.
    id: String(row?.reservationId ?? ''),
    listingId: String(row?.listingId ?? ''),
    listingTitle: String(row?.listingTitle ?? 'Untitled listing'),
    // Nested under `seller`, flat on the housing side.
    counterpartyId: row?.seller?.sellerId ?? null,
    counterpartyName: row?.seller?.displayName ?? null,
    status,
    subject: 'seller',
    settledAt: row?.completedAt ?? null,
    isRateable: status === RATEABLE_STATUS.seller,
  };
}

function housingRow(row: any): MemberReservation {
  const status = String(row?.status ?? '');
  return {
    id: String(row?.id ?? ''),
    listingId: String(row?.listingId ?? ''),
    listingTitle: String(row?.listingTitle ?? 'Untitled listing'),
    counterpartyId: row?.landlordId ?? null,
    counterpartyName: row?.landlordName ?? null,
    status,
    subject: 'landlord',
    settledAt: row?.occupiedAt ?? null,
    isRateable: status === RATEABLE_STATUS.landlord,
  };
}

/**
 * Everything this member has bought or rented.
 *
 * **`side` is deliberately omitted.** Both handlers compare it only against the
 * owner's side — `string.Equals(query.Side, "Selling")` in marketplace,
 * `"landlord"` in housing — so anything else, including nothing, means the
 * member's own side. The first draft of this file passed `buyer` and `seeker`,
 * which are not values either module knows; they worked only by failing that
 * comparison, which is a coincidence rather than a contract.
 *
 * One failing module does not empty the other — a member with purchases and no
 * tenancies should see their purchases, not an error page.
 */
export async function fetchMemberReservations(): Promise<{
  reservations: MemberReservation[];
  failed: ('marketplace' | 'housing')[];
}> {
  const failed: ('marketplace' | 'housing')[] = [];

  const [purchases, tenancies] = await Promise.all([
    apiClient
      .get('/marketplace/reservations', { params: { limit: 50 } })
      .then((res) => readPage<any>(res.data).items.map(marketplaceRow))
      .catch(() => {
        failed.push('marketplace');
        return [] as MemberReservation[];
      }),
    apiClient
      .get('/housing/reservations', { params: { limit: 50 } })
      .then((res) => readPage<any>(res.data).items.map(housingRow))
      .catch(() => {
        failed.push('housing');
        return [] as MemberReservation[];
      }),
  ]);

  return { reservations: sortBySettledThenTitle([...purchases, ...tenancies]), failed };
}

/**
 * Most recently settled first; anything unsettled after, by title.
 *
 * A null `settledAt` is *unknown*, not *old* — sorting it as a zero date would
 * bury an in-progress purchase below one from last year.
 */
export function sortBySettledThenTitle(rows: MemberReservation[]): MemberReservation[] {
  return [...rows].sort((a, b) => {
    if (a.settledAt && b.settledAt) return b.settledAt.localeCompare(a.settledAt);
    if (a.settledAt) return -1;
    if (b.settledAt) return 1;
    return a.listingTitle.localeCompare(b.listingTitle);
  });
}
