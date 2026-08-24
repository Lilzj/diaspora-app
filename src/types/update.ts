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

export type UpdateVerificationStatus = 'unverified' | 'communityVerified' | 'disputed';

export type UpdateStatus = 'active' | 'expired' | 'archived' | 'hidden' | 'removed';

export interface UpdateLocation {
  latitude: number;
  longitude: number;
  areaName: string;
  cityName: string;
  countryCode: string;
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
