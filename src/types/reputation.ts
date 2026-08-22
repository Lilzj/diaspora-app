// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Reputation System Types (Three-Dimensional)
// ─────────────────────────────────────────────────────────────────────────────

export type ReputationLevel =
  | 'Member'
  | 'VerifiedResident'
  | 'TrustedContributor'
  | 'CommunityExpert'
  | 'CommunityAmbassador';

export type ReputationDimension = 'contribution' | 'verification' | 'trust';

export interface UserReputation {
  userId: string;

  // Three dimensions
  contributionScore: number;
  verificationScore: number;
  trustScore: number;

  // Combined for level calculation
  combinedScore: number;
  level: ReputationLevel;

  // Next level info
  nextLevel: {
    name: ReputationLevel;
    minScore: number;
    pointsNeeded: number;
  } | null;

  // Contribution detail
  guidesPublished: number;
  guidesApproved: number;
  updatesPublished: number;
  updatesVerified: number;
  commentsWritten: number;
  guidesUpdated: number;

  // Verification detail
  phoneVerified: boolean;
  emailVerified: boolean;
  governmentIdVerified: boolean;
  profilePhotoAdded: boolean;
  profileCompleted: boolean;
  providerVerified: boolean;
  countryVerificationsCount: number;

  // Trust detail
  helpfulVotesReceived: number;
  communityConfirmationsReceived: number;
  violationCount: number;
  reportsResolved: number;
  noViolationStreakDays: number;

  // Badges
  badges: ReputationBadge[];

  // Level benefits
  levelBenefits: LevelBenefits;

  lastCalculatedAt: string;
  levelChangedAt: string | null;
}

/**
 * One badge.
 *
 * `type` was a closed seven-member union. `BadgeType` on the server has
 * **fourteen** members — the seven below plus `VerifiedMember`,
 * `TrustedContributor`, `CommunityGuide`, `VerifiedBusiness`,
 * `VerifiedOrganization`, `EarlyMember` and `Moderator` — and new ones are
 * added by whichever module ships the `IBadgeRule` that awards them. A closed
 * union here would turn "the platform added a badge" into a type error in a
 * client whose only job is to render `label`, which the server composes anyway.
 *
 * `since` and `countryCode` are nullable rather than merely optional because
 * the wire sends explicit nulls for both.
 */
export interface ReputationBadge {
  type:
    | 'CountryVerified'
    | 'PhoneVerified'
    | 'EmailVerified'
    | 'GovernmentIdVerified'
    | 'ProfilePhoto'
    | 'ProviderVerified'
    | 'TopContributor'
    | (string & Record<never, never>);
  label: string;
  since?: number | null;
  countryCode?: string | null;
}

export interface LevelBenefits {
  canPublishImmediately: boolean;
  canModerate: boolean;
  isFeaturedEligible: boolean;
  isRewardsEligible: boolean;
  hasBetaAccess: boolean;
  hasExclusiveBadge: boolean;
  searchBoostFactor: number;
}

export interface ReputationEvent {
  eventId: string;
  userId: string;
  eventType: string;
  dimension: ReputationDimension;
  points: number;
  sourceType: string | null;
  sourceId: string | null;
  description: string;
  createdAt: string;
}

export interface ReputationLevelConfig {
  level: ReputationLevel;
  minScore: number;
  sortOrder: number;
  canPublishImmediately: boolean;
  canModerate: boolean;
  searchBoostFactor: number;
  isFeaturedEligible: boolean;
  isRewardsEligible: boolean;
  hasBetaAccess: boolean;
  hasExclusiveBadge: boolean;
}

export interface ScoringRule {
  ruleId: string;
  actionType: string;
  points: number;
  dimension: ReputationDimension;
  maxOccurrences: number | null;
  cooldownHours: number | null;
  description: string;
  isActive: boolean;
}

export const REPUTATION_LEVEL_THRESHOLDS: Record<ReputationLevel, number> = {
  Member: 0,
  VerifiedResident: 100,
  TrustedContributor: 350,
  CommunityExpert: 1000,
  CommunityAmbassador: 2500,
};

export const REPUTATION_LEVEL_LABELS: Record<ReputationLevel, string> = {
  Member: 'Member',
  VerifiedResident: 'Verified Resident',
  TrustedContributor: 'Trusted Contributor',
  CommunityExpert: 'Community Expert',
  CommunityAmbassador: 'Community Ambassador',
};

export const REPUTATION_LEVEL_ICONS: Record<ReputationLevel, string> = {
  Member: '👤',
  VerifiedResident: '✅',
  TrustedContributor: '🏅',
  CommunityExpert: '⭐',
  CommunityAmbassador: '🏆',
};

export const DIMENSION_LABELS: Record<ReputationDimension, { label: string; icon: string; description: string }> = {
  contribution: {
    label: 'Contribution',
    icon: '📝',
    description: 'Points earned by creating and maintaining content',
  },
  verification: {
    label: 'Verification',
    icon: '✅',
    description: 'Points from verifying your identity and experience',
  },
  trust: {
    label: 'Trust',
    icon: '🛡️',
    description: 'Points from community feedback — can decrease with violations',
  },
};
