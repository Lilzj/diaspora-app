// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — whether an owner dashboard has anything to be about
//
// **Letting and Your business showed a wall of zeros to members who had never
// listed a home or registered a business.** Views 0, Viewings 0, Enquiries 0,
// "UP TO DATE" — which reads as "nobody looked at your homes", not "you have no
// homes". Found by tapping through Phase 6 as a member who owns neither.
//
// Analytics cannot tell the two apart: `/analytics/landlords/me` sums the
// caller's housing rollups, and a member with no homes and a member whose homes
// had a quiet month both sum to nought. The module that *can* tell is the one
// that owns the thing — Housing for homes, Marketplace for items, Providers for
// businesses, Jobs for postings — so the dashboard asks it.
//
// ── Three answers, not two ───────────────────────────────────────────────────
//
// `true`   the platform holds at least one; the figures are about something.
// `false`  it holds none, and says so — the dashboard shows what to do instead.
// `null`   we could not ask. **Nothing is claimed**: the figures render exactly
//          as they did before. A refusal we never received is not a "no" — the
//          rule this codebase keeps relearning.
//
// Only a 403 or a 404 is the platform saying "you hold none of these": Housing
// refuses `/housing/listings/mine` with `NotLandlord` for a member with no
// landlord profile, and Jobs refuses the employer dashboard the same way. A 500,
// a timeout or a lapsed session establishes nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { readPage } from '@/lib/platform-envelope';

/** The four dashboards that are about a member's own things. */
export type OwnerRole = 'landlord' | 'seller' | 'provider' | 'employer';

/** What a member reads when the dashboard has nothing to be about. */
export interface OwnerHoldingsEmpty {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}

/**
 * The route that answers "what do you hold in this role".
 *
 * Each is the owning module's own list, not an analytics rollup:
 *
 *   landlord  `GET /housing/listings/mine`        refuses without a landlord profile
 *   seller    `GET /marketplace/listings/mine`    empty page without a seller profile
 *   provider  `GET /providers/me`                 empty list without a business
 *   employer  `GET /jobs/employers/dashboard`     refuses without an employer profile
 */
export const OWNER_HOLDINGS_ROUTE: Readonly<Record<OwnerRole, string>> = {
  landlord: '/housing/listings/mine',
  seller: '/marketplace/listings/mine',
  provider: '/providers/me',
  employer: '/jobs/employers/dashboard',
};

/**
 * What each empty dashboard says, and where it sends the member.
 *
 * The sentence names the figures that dashboard would carry, so somebody who
 * has not listed yet knows what listing would get them.
 */
export const OWNER_HOLDINGS_EMPTY: Readonly<Record<OwnerRole, OwnerHoldingsEmpty>> = {
  landlord: {
    title: 'You have not listed a home yet',
    body: 'When you list one, the views, viewings and enquiries it gets are counted here.',
    actionLabel: 'List a home',
    actionHref: '/housing/create',
  },
  seller: {
    title: 'You have not listed anything for sale yet',
    body: 'When you list an item, the views and enquiries it gets are counted here.',
    actionLabel: 'List an item',
    actionHref: '/marketplace/create',
  },
  provider: {
    title: 'You have not registered a business yet',
    body: 'When you do, the views, enquiries and reviews your profile gets are counted here.',
    actionLabel: 'Register your business',
    // The provider wizard, which the create hub calls "Provider Listing".
    actionHref: '/post',
  },
  employer: {
    title: 'You have not posted a job yet',
    body: 'When you post one, the views and applications it gets are counted here.',
    actionLabel: 'Post a job',
    actionHref: '/job/create',
  },
};

/**
 * Whether a successful read means the member holds anything.
 *
 * Three different shapes, because three modules answer differently: a cursor
 * page of listings, a bare array of businesses, and the employer dashboard's
 * four job counters. Read per role rather than guessed from the body, so a
 * shape that changes fails a test instead of quietly answering "none".
 */
export function holdsAnything(role: OwnerRole, body: unknown): boolean {
  if (role === 'employer') {
    const dashboard = unwrap<Record<string, unknown>>(body);

    return (
      count(dashboard?.draftCount)
        + count(dashboard?.openCount)
        + count(dashboard?.closedCount)
        + count(dashboard?.filledCount) > 0
    );
  }

  // `readPage` knows the four list shapes these routes answer between them,
  // including the bare array `/providers/me` sends.
  return readPage<unknown>(body).items.length > 0;
}

/**
 * What a failed read established: "you hold none", or nothing at all.
 *
 * 403 and 404 are the platform's own refusals for a member without the profile.
 * Everything else — no response, a 500, a lapsed session — leaves the question
 * unanswered, and an unanswered question must not be shown as an answer.
 */
export function holdingsFromFailure(cause: unknown): false | null {
  const status = statusOf(cause);

  return status === 403 || status === 404 ? false : null;
}

/**
 * The HTTP status a failure carries, wherever it carries it.
 *
 * A raw axios error keeps it on `response`; one that has been through
 * `toFinancialError` keeps it as `httpStatus`. Reading only the first made a
 * typed client's refusal look like a transport failure.
 */
export function statusOf(cause: unknown): number | undefined {
  const failure = cause as { response?: { status?: number }; httpStatus?: number } | null;

  return failure?.response?.status ?? failure?.httpStatus;
}

function unwrap<T>(body: unknown): T | null {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return ((body as { data?: unknown }).data ?? null) as T | null;
  }

  return (body ?? null) as T | null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
