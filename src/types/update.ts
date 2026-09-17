// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Community Update Types
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactionSummaryResponse } from './community-social';

export type UpdateCategory =
  | 'Traffic'
  | 'Police'
  | 'Immigration'
  | 'Weather'
  | 'Education'
  | 'Healthcare'
  | 'Shopping'
  | 'MarketPrices'
  | 'Employment'
  | 'Emergency'
  | 'Community'
  | 'Transportation'
  | 'Utilities'
  | 'Other';

// ── The server's spelling ────────────────────────────────────────────────────
//
// These three were declared in PascalCase and the wire has never used it.
// `CommunityWireNames.ToWire` lower-cases the first character of every enum it
// publishes, so B6 sends `communityVerified`, `emergency`, `active`. The card's
// `verificationStatus === 'CommunityVerified'` could therefore never be true,
// and its urgency lookup — keyed `Emergency` — returned `undefined` and read a
// colour off it, which is a crash rather than a wrong colour.
//
// Nothing caught it because every one of these values arrives through an
// `apiClient.get<Envelope<CommunityUpdate>>` cast: the compiler is told the
// shape rather than shown it.

export type UrgencyLevel = 'emergency' | 'urgent' | 'normal' | 'low';

/**
 * A category as the wire spells it, onto the union the client switches on.
 *
 * `CommunityWireNames.ToWire` camel-cases every enum it publishes, so the wire
 * says `traffic` and `marketPrices` while this union says `Traffic` and
 * `MarketPrices`. `toAlertKind` switches on the union with no default, so an
 * unnormalised value returned `undefined` and the alert was drawn with no kind
 * — the same shape as the urgency lookup recorded above, which crashed.
 *
 * Unknown values become `Other` rather than throwing: a category this app has
 * never heard of is still an update worth showing.
 */
export function toUpdateCategory(value: string | null | undefined): UpdateCategory {
  const wire = value?.trim().toLowerCase();

  if (!wire) return 'Other';

  return (
    UPDATE_CATEGORIES.find((category) => category.toLowerCase() === wire) ?? 'Other'
  );
}

const UPDATE_CATEGORIES: readonly UpdateCategory[] = [
  'Traffic',
  'Police',
  'Immigration',
  'Weather',
  'Education',
  'Healthcare',
  'Shopping',
  'MarketPrices',
  'Employment',
  'Emergency',
  'Community',
  'Transportation',
  'Utilities',
  'Other',
];

/** An urgency as the wire spells it. Already lower case there; normalised anyway. */
export function toUrgencyLevel(value: string | null | undefined): UrgencyLevel {
  switch (value?.trim().toLowerCase()) {
    case 'emergency':
      return 'emergency';
    case 'urgent':
      return 'urgent';
    case 'low':
      return 'low';
    default:
      return 'normal';
  }
}

export type UpdateVerificationStatus = 'unverified' | 'communityVerified' | 'disputed';

/**
 * Where an update is in its life, as the wire spells it.
 *
 * `withdrawn` (the report was wrong) and `cancelled` (what it reported is over)
 * arrived on 16 Sep 2026. Both stay readable and are marked, rather than
 * vanishing — a member who acted on an alert needs to be told it was taken back.
 * `active` is the older client name for `published` and is kept for the data
 * that still says it.
 */
export type UpdateStatus =
  | 'active'
  | 'published'
  | 'expired'
  | 'archived'
  | 'hidden'
  | 'removed'
  | 'withdrawn'
  | 'cancelled';

export interface UpdateLocation {
  latitude: number;
  longitude: number;
  areaName: string;
  cityName: string;
  countryCode: string;
  /** True when the author pinned it; false when it sits at a town's centre. */
  pointIsExact?: boolean;
}

export interface CommunityUpdate {
  updateId: string;
  authorId: string;
  title: string;
  description: string;
  category: UpdateCategory;
  urgency: UrgencyLevel;

  location: UpdateLocation;

  publishedAt: string;
  expiresAt: string;
  isExpired: boolean;
  /** Set when the author amended it after the first five minutes. */
  editedAt?: string | null;
  /** When its author withdrew or cancelled it. */
  closedAt?: string | null;
  /** How far around its pin it applies, in metres. Null for a point. */
  affectedRadiusMetres?: number | null;

  imageUrls: string[];

  // Scaled verification
  confirmationCount: number;
  verifiedResidentConfirmationCount: number;
  requiredConfirmations: number;
  requiredVerifiedConfirmations: number;
  reportCount: number;
  commentCount: number;
  verificationStatus: UpdateVerificationStatus;

  status: UpdateStatus;
  createdAt: string;
}

/** Compact for cards and lists */
export interface UpdateSummary {
  updateId: string;
  title: string;
  description: string;
  category: UpdateCategory;
  urgency: UrgencyLevel;
  location: { areaName: string; cityName: string; distanceKm?: number };
  publishedAt: string;
  expiresAt: string;
  confirmationCount: number;
  verifiedResidentConfirmationCount: number;
  requiredConfirmations: number;
  commentCount: number;
  verificationStatus: UpdateVerificationStatus;
  status: UpdateStatus;
  authorId: string;

  /**
   * B6 serves the reaction tally on the summary and the client type dropped it.
   * It is the only honest answer to "have I already confirmed this" — the card
   * used to keep that in `useState`, so it reset on every remount and told a
   * member they had never confirmed something they had.
   */
  reactions?: ReactionSummaryResponse;
}

export const UPDATE_CATEGORY_LABELS: Record<UpdateCategory, string> = {
  Traffic: 'Traffic',
  Police: 'Police',
  Immigration: 'Immigration',
  Weather: 'Weather',
  Education: 'Education',
  Healthcare: 'Healthcare',
  Shopping: 'Shopping',
  MarketPrices: 'Market Prices',
  Employment: 'Employment',
  Emergency: 'Emergency',
  Community: 'Community',
  Transportation: 'Transportation',
  Utilities: 'Utilities',
  Other: 'Other',
};

export const UPDATE_CATEGORY_ICONS: Record<UpdateCategory, string> = {
  Traffic: '🚗',
  Police: '👮',
  Immigration: '🛂',
  Weather: '🌦️',
  Education: '🎓',
  Healthcare: '🏥',
  Shopping: '🛒',
  MarketPrices: '💲',
  Employment: '💼',
  Emergency: '🚨',
  Community: '👥',
  Transportation: '🚌',
  Utilities: '⚡',
  Other: '📌',
};

export const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  emergency: '#DC2626',
  urgent: '#D97706',
  normal: '#2563EB',
  low: '#6B7280',
};

/** Default expiration hours per category (admin-configurable) */
export const DEFAULT_EXPIRATION_HOURS: Record<UpdateCategory, number> = {
  Traffic: 4,
  Police: 6,
  Emergency: 24,
  MarketPrices: 24,
  Weather: 12,
  Immigration: 168,
  Community: 168,
  Education: 720,
  Employment: 720,
  Healthcare: 168,
  Utilities: 12,
  Shopping: 24,
  Transportation: 12,
  Other: 24,
};

// `VERIFICATION_THRESHOLDS` was here: a verbatim copy of B6's
// `ConfirmationThresholds.For(urgency)`, unused by anything. The wire serves
// `requiredConfirmations` and `requiredVerifiedConfirmations` on every post, so
// a second copy of the policy could only ever be the stale one — it had no
// reader to notice if it drifted.
