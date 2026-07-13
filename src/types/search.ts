// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Unified Search Types
// ─────────────────────────────────────────────────────────────────────────────

import type { CountryRef, GuideCategory, QualityLabel } from './guide';
import type { UpdateCategory, UrgencyLevel } from './update';

export type SearchContentType = 'listing' | 'guide' | 'update' | 'user' | 'job';

export interface UnifiedSearchResult {
  type: SearchContentType;
  id: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  metadata: ListingSearchMeta | GuideSearchMeta | UpdateSearchMeta | UserSearchMeta | JobSearchMeta;
}

export interface ListingSearchMeta {
  type: 'listing';
  category: string;
  areaName: string;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  isOpenNow: boolean;
  coverImageUrl: string | null;
}

export interface GuideSearchMeta {
  type: 'guide';
  category: GuideCategory;
  country: CountryRef;
  authorName: string;
  authorLevel: string;
  readingTimeMinutes: number;
  helpfulCount: number;
  qualityLabel: QualityLabel;
  lastUpdatedAt: string;
  lastVerifiedAt: string | null;
}

export interface UpdateSearchMeta {
  type: 'update';
  category: UpdateCategory;
  urgency: UrgencyLevel;
  location: string;
  expiresAt: string;
  confirmationCount: number;
  verificationStatus: string;
}

export interface UserSearchMeta {
  type: 'user';
  reputationLevel: string;
  guidesPublished: number;
  followerCount: number;
}

export interface JobSearchMeta {
  type: 'job';
  category: string;
  employmentType: string;
  salary: string;
  location: string;
  isVerified: boolean;
  urgency: string;
}

export interface SearchFilters {
  query: string;
  contentType: SearchContentType | 'all';
  country?: string;
  category?: string;
  location?: string;
  sortBy?: 'relevance' | 'recent' | 'popular';
  page: number;
  pageSize: number;
}
