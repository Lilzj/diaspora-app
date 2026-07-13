// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Community Update Types
// ─────────────────────────────────────────────────────────────────────────────

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

export type UrgencyLevel = 'Emergency' | 'Urgent' | 'Normal' | 'Low';

export type UpdateVerificationStatus = 'Unverified' | 'CommunityVerified' | 'Disputed';

export type UpdateStatus = 'Active' | 'Expired' | 'Archived' | 'Hidden' | 'Removed';

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
  Emergency: '#DC2626',
  Urgent: '#D97706',
  Normal: '#2563EB',
  Low: '#6B7280',
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

/** Scaled verification thresholds */
export const VERIFICATION_THRESHOLDS: Record<UrgencyLevel, { total: number; verified: number }> = {
  Low: { total: 3, verified: 1 },
  Normal: { total: 3, verified: 1 },
  Urgent: { total: 7, verified: 3 },
  Emergency: { total: 10, verified: 4 },
};
