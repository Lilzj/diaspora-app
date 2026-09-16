// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a landlord's own page, from what the platform sends
//
// **"View profile" on a home opened a screen that could never fill in.** It
// read `data.host` and `data.listings` from `GET /housing/landlords/{idOrSlug}`,
// and that route sends neither: it answers one `LandlordProfileResponse` —
// `displayName`, `kind`, `bio`, `trust`, `statistics`, and contact details only
// where the landlord published them. Every field the old screen rendered
// (`description`, `followerCount`, `responseTime`, `verificationDate`) was
// invented by the fixture it was written against, and the homes it listed came
// from a field that does not exist.
//
// The homes come from the ordinary search instead, narrowed by `landlordId`
// (added to `SearchHousingRequest` on 16 Sep 2026) — so the page lists exactly
// the homes anybody could already find, gathered under the landlord who let
// them, and nothing about a draft leaks into a public page.
//
// Nothing here invents. A field the server did not send stays null and the
// screen leaves the row out.
// ─────────────────────────────────────────────────────────────────────────────

/** `LandlordProfileResponse`, loosely — every member optional but the id. */
export interface LandlordProfileWire {
  id?: string | null;
  ownerUserId?: string | null;
  slug?: string | null;
  displayName?: string | null;
  kind?: string | null;
  legalName?: string | null;
  primaryCountryCode?: string | null;
  bio?: string | null;
  logoMediaId?: string | null;
  providerId?: string | null;
  status?: string | null;
  trust?: { state?: string | null; isVerified?: boolean | null; badge?: string | null } | null;
  statistics?: {
    activeListings?: number | null;
    totalListings?: number | null;
    completedLets?: number | null;
    /** A share of viewing requests answered, 0–1 — never a percentage. */
    responseRate?: number | null;
  } | null;
  phoneNumber?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  isOwner?: boolean | null;
  createdAt?: string | null;
}

export interface LandlordProfile {
  landlordId: string;
  /** The member a message reaches. A profile id is not a person; null means nobody to write to. */
  ownerUserId: string | null;
  name: string;
  kind: string | null;
  legalName: string | null;
  bio: string | null;
  logoMediaId: string | null;
  isVerified: boolean;
  badge: string | null;
  countryCode: string | null;
  phoneNumber: string | null;
  email: string | null;
  websiteUrl: string | null;
  completedLets: number;
  /** 0–1, or null until the platform has seen enough requests for it to mean anything. */
  responseRate: number | null;
  isOwner: boolean;
  memberSince: string | null;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The profile, or null when the response was not one.
 *
 * Null rather than a half-built object, so the screen can tell "no such
 * landlord" from "we could not ask".
 */
export function landlordProfileFromWire(raw: LandlordProfileWire | null | undefined): LandlordProfile | null {
  const landlordId = text(raw?.id);

  if (!landlordId) return null;

  return {
    landlordId,
    ownerUserId: text(raw?.ownerUserId),
    // A landlord always has a display name on the wire; the fallback is for a
    // response that predates one, and it never reads "undefined".
    name: text(raw?.displayName) ?? 'Landlord',
    kind: text(raw?.kind),
    legalName: text(raw?.legalName),
    bio: text(raw?.bio),
    logoMediaId: text(raw?.logoMediaId),
    isVerified: raw?.trust?.isVerified === true,
    badge: text(raw?.trust?.badge),
    countryCode: text(raw?.primaryCountryCode),
    phoneNumber: text(raw?.phoneNumber),
    email: text(raw?.email),
    websiteUrl: text(raw?.websiteUrl),
    completedLets: Math.max(0, Math.trunc(raw?.statistics?.completedLets ?? 0)),
    responseRate:
      typeof raw?.statistics?.responseRate === 'number' && Number.isFinite(raw.statistics.responseRate)
        ? raw.statistics.responseRate
        : null,
    isOwner: raw?.isOwner === true,
    memberSince: text(raw?.createdAt),
  };
}

/**
 * What `GET /housing/search` binds for "this landlord's homes".
 *
 * The published ones, newest first, and the same twenty a search page holds.
 * `landlordId` narrows; every other visibility rule still applies on top.
 */
export function landlordHomesParams(landlordId: string, limit = 20): Record<string, string | number> {
  return { landlordId, limit };
}

/** "Private landlord" / "Letting agency" — the word a member reads for a `LandlordKind`. */
export function landlordKindLabel(kind: string | null | undefined): string | null {
  switch (kind?.trim().toLowerCase()) {
    case 'individual':
      return 'Private landlord';
    case 'agency':
      return 'Letting agency';
    case 'company':
      return 'Property company';
    case 'institution':
      return 'Institution';
    default:
      return null;
  }
}

/**
 * "Answers 8 in 10 viewing requests", or null when the platform has not said.
 *
 * The rate arrives as a share, never a percentage — the shape that made every
 * analytics rate read a hundred times too high in September.
 */
export function landlordResponseLabel(rate: number | null | undefined): string | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) return null;

  return `Answers ${Math.round(Math.min(1, rate) * 100)}% of viewing requests`;
}

/** "Member since 2026", or null when the platform did not say. */
export function memberSinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const when = new Date(iso);

  return Number.isNaN(when.getTime()) ? null : `Member since ${when.getFullYear()}`;
}
