// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a listing's landlord, as the housing screen's host
//
// **Found with a second account, 14 Sep 2026.** Aisha tapped Message on David's
// apartment and read "Cannot start this conversation". The button had been
// pointed at `host.ownerUserId` — the member who owns the landlord profile, and
// therefore who a message reaches — but the screen built its host field by
// field from `landlord`, and `ownerUserId` was not one of the fields. The type
// marks it optional, so nothing complained: every message about every home was
// addressed to `''`, and the server refused it.
//
// The same missing field made the owner check compare `providerId` with the
// member's user id. A provider id is not a person's id and is null for most
// landlords, so a landlord on their own home was offered Message, Call and
// "Ask to view" as if it were somebody else's.
//
// The mapping lives here rather than inline so a test can hold every field the
// wire sends to the host it becomes.
// ─────────────────────────────────────────────────────────────────────────────

import type { HousingHost, LandlordRating } from '@/types/housing';

/** `LandlordSummaryResponse`, as `GET /housing/listings/{idOrSlug}` sends it. */
export interface LandlordSummaryWire {
  id?: string | null;
  ownerUserId?: string | null;
  slug?: string | null;
  displayName?: string | null;
  kind?: string | null;
  isVerified?: boolean | null;
  badge?: string | null;
  logoMediaId?: string | null;
  providerId?: string | null;
  rating?: LandlordRating | null;
}

/**
 * The host a listing screen renders, from the summary the server sends.
 *
 * Only fields the summary carries: no tenure, no languages, no telephone
 * number. A missing owner stays `null` — never `''` — so the one caller that
 * needs a person can tell there is nobody to reach.
 */
export function hostFromLandlord(landlord: LandlordSummaryWire | null | undefined): HousingHost {
  return {
    landlordId: landlord?.id ?? '',
    ownerUserId: landlord?.ownerUserId ?? null,
    name: landlord?.displayName ?? 'Landlord',
    slug: landlord?.slug ?? undefined,
    kind: landlord?.kind ?? undefined,
    isVerified: landlord?.isVerified ?? false,
    badge: landlord?.badge ?? null,
    logoMediaId: landlord?.logoMediaId ?? null,
    providerId: landlord?.providerId ?? null,
    rating: landlord?.rating ?? null,
  };
}

/**
 * The line under a home's title on the conversation its Message button opens.
 *
 * The server keeps this line with the conversation, so whatever is written here
 * is what both people read for as long as the thread exists. It interpolated
 * `listing.location.areaName`, a field the listing read does not send, and the
 * first real enquiry about a home was stored as "Host: Mensah Property Rentals
 * · undefined". An unknown place is left off rather than spelled out.
 */
export function homeConversationSubtitle(hostName: string, place: string | null | undefined): string {
  const where = place?.trim();
  return where ? `Host: ${hostName} · ${where}` : `Host: ${hostName}`;
}

/**
 * Whether the signed-in member owns the landlord profile behind a listing.
 *
 * By user id against user id. False when either side is missing: an unknown
 * owner is not the member, and a signed-out viewer owns nothing.
 */
export function isHostedBy(host: HousingHost | null | undefined, userId: string | null | undefined): boolean {
  const owner = host?.ownerUserId;
  return !!owner && !!userId && owner.toLowerCase() === userId.toLowerCase();
}
