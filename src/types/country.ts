// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Country & Seasonal Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CountryStatistics {
  countryCode: string;
  countryName: string;
  flag: string;
  landmarkImageUrl: string | null;

  providerCount: number;
  guideCount: number;
  updatesToday: number;
  verifiedContributorCount: number;
  expertCount: number;

  trendingGuideIds: string[];
  topContributorIds: string[];

  lastUpdatedAt: string;
}

export interface SeasonalContent {
  seasonId: string;
  title: string;
  description: string;
  activeFrom: string;
  activeTo: string;
  guideIds: string[];
  countryCode: string | null;
  isAIGenerated: boolean;
  isActive: boolean;
}
