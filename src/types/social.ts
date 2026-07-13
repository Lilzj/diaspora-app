// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Social Types (Follows, Author Expertise)
// ─────────────────────────────────────────────────────────────────────────────

import type { ReputationLevel } from './reputation';
import type { GuideCategory } from './guide';
import type { CountryVerificationSummary } from './verification';

export interface Follow {
  followId: string;
  followerId: string;
  followeeId: string;
  createdAt: string;
}

export interface AuthorExpertise {
  userId: string;
  name: string;
  avatarUrl: string | null;
  reputationLevel: ReputationLevel;
  countryVerifications: CountryVerificationSummary[];
  expertiseCategories: GuideCategory[];
  followerCount: number;
  followingCount: number;
  totalHelpfulVotes: number;
  guidesPublished: number;
  updatesPublished: number;
  isTopContributor: boolean;
  topContributorMonth: string | null;
  topContributorCountries: string[];
  isFollowedByUser: boolean;
}

/** Compact author info for cards */
export interface AuthorSummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
  reputationLevel: ReputationLevel;
  isCountryVerified: boolean;
  primaryCountry: CountryVerificationSummary | null;
  expertiseCategories: GuideCategory[];
  followerCount: number;
  isFollowedByUser: boolean;
}

export type ReactionType = 'Helpful' | 'Confirmed' | 'Useful' | 'Save';

export type ReactionContentType = 'Guide' | 'CommunityUpdate';

export interface CommunityReaction {
  reactionId: string;
  userId: string;
  contentType: ReactionContentType;
  contentId: string;
  reactionType: ReactionType;
  createdAt: string;
}
