// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Guide Types
// ─────────────────────────────────────────────────────────────────────────────

export type GuideCategory =
  | 'Accommodation'
  | 'Banking'
  | 'Food'
  | 'Employment'
  | 'Immigration'
  | 'Transport'
  | 'CostOfLiving'
  | 'AreasToLive'
  | 'Safety'
  | 'Activities'
  | 'Healthcare'
  | 'Education'
  | 'Legal'
  | 'Culture'
  | 'Shopping'
  | 'Other';

export type GuideStatus =
  | 'Draft'
  | 'Submitted'
  | 'AIReview'
  | 'PendingReview'
  | 'Published'
  | 'Rejected'
  | 'Archived';

export type AIReviewStatus = 'Pending' | 'Clean' | 'Flagged' | 'Rejected';

export type QualityLabel = 'Excellent' | 'VeryGood' | 'Good' | 'NeedsUpdate';

export interface CountryRef {
  code: string;
  name: string;
  flag: string;
}

export interface GuideSection {
  sectionId: string;
  heading: string;
  order: number;
  startOffset: number;
}

export interface GuideVersion {
  versionId: string;
  guideId: string;
  versionNumber: number;
  title: string;
  content: string;
  changeSummary: string[];
  createdBy: string;
  createdAt: string;
}

export interface Guide {
  guideId: string;
  authorId: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  sections: GuideSection[];
  coverImageUrl: string | null;
  category: GuideCategory;
  tags: string[];
  country: CountryRef;
  originalLanguage: string;

  // Metrics
  helpfulCount: number;
  confirmedCount: number;
  commentCount: number;
  viewCount: number;
  saveCount: number;
  shareCount: number;
  readingTimeMinutes: number;

  // Quality (AI-computed, displayed as label only)
  qualityScore: number;
  qualityLabel: QualityLabel;

  // Dates
  lastUpdatedAt: string;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  createdAt: string;

  // Version
  currentVersionId: string;
  versionCount: number;
  latestChangeSummary: string[];

  // Status & AI moderation
  status: GuideStatus;
  aiReviewStatus: AIReviewStatus;
  aiReviewFlags: string[];
  moderationNote: string | null;
}

export interface GuideBookmark {
  bookmarkId: string;
  userId: string;
  guideId: string;
  sectionId: string;
  scrollPosition: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Compact guide for cards and lists */
export interface GuideSummary {
  guideId: string;
  title: string;
  summary: string;
  category: GuideCategory;
  country: CountryRef;
  coverImageUrl: string | null;
  readingTimeMinutes: number;
  helpfulCount: number;
  confirmedCount: number;
  commentCount: number;
  qualityLabel: QualityLabel;
  lastUpdatedAt: string;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  authorId: string;
}

export const GUIDE_CATEGORY_LABELS: Record<GuideCategory, string> = {
  Accommodation: 'Accommodation',
  Banking: 'Banking & Finance',
  Food: 'Food & Dining',
  Employment: 'Employment',
  Immigration: 'Immigration',
  Transport: 'Transport',
  CostOfLiving: 'Cost of Living',
  AreasToLive: 'Areas to Live',
  Safety: 'Safety & Scams',
  Activities: 'Activities & Leisure',
  Healthcare: 'Healthcare',
  Education: 'Education',
  Legal: 'Legal',
  Culture: 'Culture',
  Shopping: 'Shopping',
  Other: 'Other',
};

export const GUIDE_CATEGORY_ICONS: Record<GuideCategory, string> = {
  Accommodation: '🏠',
  Banking: '🏦',
  Food: '🍛',
  Employment: '💼',
  Immigration: '🛂',
  Transport: '🚌',
  CostOfLiving: '💰',
  AreasToLive: '📍',
  Safety: '🛡️',
  Activities: '🎯',
  Healthcare: '🏥',
  Education: '🎓',
  Legal: '⚖️',
  Culture: '🎭',
  Shopping: '🛍️',
  Other: '📄',
};
