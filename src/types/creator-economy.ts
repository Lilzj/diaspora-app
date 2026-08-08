// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator Economy domain model (Frontend Phase 7)
//
// This is the frontend's own vocabulary for the creator economy. It is **not** a
// mirror of a backend contract, because for most of this surface there is no
// backend contract to mirror — see `src/config/creator-gaps.ts` for the sixteen
// capabilities that do not exist yet and what each would have to look like.
//
// Three rules shaped every type in this file, and each of them is a rule the
// brief states directly:
//
//   **The backend is authoritative and the type says so.** A creator's status,
//   their reputation, whether a milestone is complete, whether a referral
//   qualified, how much money they have earned — every one of those arrives as
//   a value the platform decided. Nothing in this file is a rule the client
//   evaluates. `CreatorStatus` is a served string, not a function of a point
//   count; `CreatorMilestone.isComplete` is served, not `progress >= target`.
//   Where the client does compute something it is presentation only, it lives
//   in `src/lib/creator-economy.ts`, and it is named so (`describe…`,
//   `format…`, `present…`).
//
//   **Money is `Money`, points are a number.** Phase 5 established this and it
//   matters more here than anywhere: the creator economy is the one place where
//   a count of contribution points sits on the same screen as an amount of
//   real money. They never share a type, so they can never accidentally share a
//   code path. `CreatorPoints.available` is a `number`; `CreatorEarning.amount`
//   is a `Money` carrying `minorUnits`.
//
//   **Adapters map into these types; components never see a DTO.** §34 forbids
//   a component depending on a temporary mock structure. Everything the UI
//   renders is declared here, and both arms of every repository — the real B15
//   arm and the simulated `/creator-gap/v0` arm — produce these shapes.
//
// Statuses are open strings (`(string & {})`) for the same reason B15's are: a
// client that narrows to a closed union stops rendering the day a deployment is
// ahead of the app in the store. Known members are `const` arrays so mapping
// tables can be exhaustive where that matters.
// ─────────────────────────────────────────────────────────────────────────────

import type { Money } from './financial';
import type { ContentType } from './creator';

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR · STATUS · PROFILE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Where somebody sits in the creator programme.
 *
 * §7 forbids hard-coding the business rules that move a member between these
 * into the UI. So this is the *name of a state the backend reported*, and the
 * only thing the client does with it is choose a label, a colour and which
 * calls to action to offer. There is no client-side function anywhere in this
 * codebase that computes a `CreatorStatus` from a score.
 */
export const CREATOR_STATUSES = [
  'NotACreator',
  'Contributor',
  'EmergingCreator',
  'VerifiedCreator',
  'EstablishedCreator',
  'TopCreator',
  'PendingVerification',
  'Restricted',
  'Suspended',
] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number] | (string & {});

/** A creator category the platform recognises. Served, never hard-coded. */
export interface CreatorCategory {
  key: string;
  label: string;
  /** Optional grouping — "Settling in", "Money", "Work". */
  group?: string | null;
}

/**
 * The creator projection for the signed-in member.
 *
 * Deliberately *not* the same object as `UserProfile`. A creator profile is a
 * different privacy surface: it carries audience figures and programme state
 * that the member's public profile does not, and §6 requires the private and
 * public views to be distinguishable in the type system rather than by a
 * comment on a component.
 */
export interface CreatorProfile {
  creatorId: string;
  /** The platform user this creator record belongs to. */
  userId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  bio?: string | null;

  status: CreatorStatus;
  /** When the status last changed. Renders "Verified since March". */
  statusChangedAt?: string | null;
  /** What the platform says has to happen to reach the next status. */
  nextStatus?: CreatorStatusTarget | null;

  countryCode?: string | null;
  communityIds: string[];
  languages: string[];
  /** Areas this creator contributes in. Keys from `CreatorCategory`. */
  categories: string[];
  expertise: string[];

  /** Whether the creator record is discoverable at all. Backend decides. */
  isDiscoverable: boolean;
  /** Whether this creator has completed the creator-programme verification. */
  isVerifiedCreator: boolean;

  /** Public counters the backend serves. Never counted on the device. */
  audience: CreatorAudienceSummary;
  /** How complete the profile is, and what is missing. Served. */
  completeness: CreatorProfileCompleteness;

  joinedAt: string;
  updatedAt: string;
}

/** What the platform says the next rung needs. Presented, never evaluated. */
export interface CreatorStatusTarget {
  status: CreatorStatus;
  label: string;
  /** Human-readable requirements the backend authored. */
  requirements: CreatorRequirement[];
}

/**
 * One requirement toward a status, a verification or a grant.
 *
 * `isMet` is served. A client that decided "3 of 5 guides, so not met" would be
 * re-implementing an eligibility rule it does not own — and would disagree with
 * the server the first time the rule changed.
 */
export interface CreatorRequirement {
  key: string;
  label: string;
  description?: string | null;
  isMet: boolean;
  /** Where the member goes to satisfy it, when there is somewhere. */
  actionRoute?: string | null;
  actionLabel?: string | null;
  /** Progress toward it, when the requirement is countable. */
  current?: number | null;
  target?: number | null;
}

/** Audience figures. Every one of them a number the backend sent. */
export interface CreatorAudienceSummary {
  followers: number;
  following: number;
  /** People reached across all content in the platform's reporting window. */
  reach: number;
  totalContentPublished: number;
  totalHelpfulVotes: number;
}

export interface CreatorProfileCompleteness {
  /** 0–100. Served, so the app and the web dashboard agree. */
  percentage: number;
  /** What is still missing, in the order the platform wants it done. */
  missing: CreatorRequirement[];
}

/**
 * The public view of a creator — what the directory and a profile page show.
 *
 * A strict subset of `CreatorProfile`. §6: "Do not expose private information."
 * The way to guarantee that is for the public type not to have the fields, so
 * a component rendering a `PublicCreator` *cannot* accidentally print an
 * earnings figure.
 */
export interface PublicCreator {
  creatorId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  status: CreatorStatus;
  isVerifiedCreator: boolean;
  countryCode?: string | null;
  categories: string[];
  expertise: string[];
  languages: string[];
  followers: number;
  contentPublished: number;
  /** The public reputation figure, when the member allows it to be shown. */
  reputationScore?: number | null;
  badges: CreatorBadge[];
}

// ═════════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator-programme application lifecycle.
 *
 * Distinct from identity verification, which Trust owns and which this phase
 * does not touch (§8). A member can be identity-verified and not a verified
 * *creator*; the reverse is impossible, and the backend enforces that — this
 * client renders the identity requirement as an unmet `CreatorRequirement` and
 * routes to `/verification/identity` rather than collecting anything itself.
 */
export const CREATOR_VERIFICATION_STATES = [
  'NotEligible',
  'Eligible',
  'Draft',
  'Submitted',
  'UnderReview',
  'MoreInformationRequired',
  'Approved',
  'Rejected',
  'Expired',
  'Suspended',
  'AppealPending',
] as const;
export type CreatorVerificationState =
  | (typeof CREATOR_VERIFICATION_STATES)[number]
  | (string & {});

export interface CreatorVerification {
  applicationId?: string | null;
  state: CreatorVerificationState;
  /** Everything the programme asks for, with `isMet` decided by the server. */
  requirements: CreatorRequirement[];
  /** Supporting material the member has attached, by server-issued reference. */
  evidence: CreatorVerificationEvidence[];

  submittedAt?: string | null;
  reviewStartedAt?: string | null;
  decidedAt?: string | null;
  /** When an approval lapses, where the programme expires one. */
  expiresAt?: string | null;

  /** Why it was refused, in the reviewer's words. Shown verbatim. */
  decisionReason?: string | null;
  /** What else the reviewer needs, when the state is MoreInformationRequired. */
  informationRequested?: string[] | null;

  canResubmit: boolean;
  canAppeal: boolean;
  /** How long the member has to act, when a deadline applies. */
  respondByAt?: string | null;
}

/**
 * A piece of supporting material.
 *
 * **Note what is absent.** No file contents, no base64, no local URI that
 * outlives the upload. Evidence is a server-issued id and a label the server
 * produced, for the same reason Phase 5's `PayoutDestination` carries no account
 * number: the way to guarantee the client never persists something sensitive is
 * for the client never to hold it.
 */
export interface CreatorVerificationEvidence {
  evidenceId: string;
  kind: string;
  label: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | (string & {});
  rejectionReason?: string | null;
  uploadedAt: string;
}

export interface SubmitCreatorVerificationRequest {
  /** Which requirements the member asserts they have met. */
  acknowledgedRequirements: string[];
  evidenceIds: string[];
  note?: string;
  idempotencyKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// REPUTATION · BADGES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator presentation of reputation.
 *
 * §9: the backend remains authoritative and the frontend does not calculate a
 * reputation score. This type carries what the platform decided plus the
 * labels it wants shown — `tierLabel` is served rather than looked up in a
 * client-side table, so a renamed tier does not require an app release.
 */
export interface CreatorReputation {
  /** The public score, when the platform publishes one. */
  score?: number | null;
  tier?: string | null;
  tierLabel?: string | null;
  /** How the score is distributed, for the breakdown chart. */
  dimensions: CreatorReputationDimension[];
  badges: CreatorBadge[];
  /** Points to the next tier, when the platform discloses it. */
  pointsToNextTier?: number | null;
  nextTierLabel?: string | null;
  updatedAt: string;
}

export interface CreatorReputationDimension {
  key: string;
  label: string;
  score: number;
  /** The maximum the platform scores this dimension out of. */
  maxScore?: number | null;
  description?: string | null;
}

export interface CreatorBadge {
  badgeId: string;
  key: string;
  label: string;
  description?: string | null;
  /** An emoji or an icon name. Never the only carrier of meaning. */
  icon?: string | null;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | (string & {});
  isEarned: boolean;
  earnedAt?: string | null;
  /** Progress toward an unearned badge, when the platform discloses it. */
  progress?: CreatorProgress | null;
}

/**
 * A progress figure the backend computed.
 *
 * `percentage` is served rather than `current / target`, because a milestone
 * can be weighted, stepped or capped in ways a division does not capture — and
 * a progress bar that disagrees with the number beside it is a bug that ships.
 */
export interface CreatorProgress {
  current: number;
  target: number;
  percentage: number;
  unit?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// POINTS · REWARDS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A points balance.
 *
 * Structurally identical to Phase 5's `RewardBalance` because it *is* Phase 5's
 * balance: the creator rewards surface reads `/financial-gap/v0/rewards/me`
 * rather than opening a second points ledger. Re-declared here so the creator
 * domain has one vocabulary, and adapted at the repository boundary.
 *
 * Points are a count. They are never a `Money` and never rendered with a
 * currency symbol. The one place they acquire a monetary value is the
 * conversion preview, which is asked for and never computed.
 */
export interface CreatorPoints {
  available: number;
  pending: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  lifetimeConverted: number;
  /** Points that lapsed unused, where the programme expires them. */
  lifetimeExpired: number;
  nextThreshold?: number | null;
  nextThresholdLabel?: string | null;
  /** The soonest expiry, when points expire. Null when they do not. */
  nextExpiryAt?: string | null;
  nextExpiryPoints?: number | null;
  updatedAt: string;
}

export const CREATOR_POINT_ENTRY_STATES = [
  'Pending', 'Awarded', 'Spent', 'Converted', 'Expired', 'Reversed',
] as const;
export type CreatorPointEntryState =
  | (typeof CREATOR_POINT_ENTRY_STATES)[number]
  | (string & {});

export interface CreatorPointEntry {
  entryId: string;
  /** The rule that produced it, so the row can link to the catalogue. */
  ruleKey?: string | null;
  source: string;
  /** Negative when spent, converted or reversed. */
  points: number;
  state: CreatorPointEntryState;
  reason: string;
  subjectType?: string | null;
  subjectId?: string | null;
  occurredAt: string;
  expiresAt?: string | null;
}

export interface CreatorPointsPage {
  entries: CreatorPointEntry[];
  nextCursor?: string | null;
  hasMore: boolean;
}

/**
 * The catalogue of how points are earned.
 *
 * §11: "Do not hardcode reward amounts if the backend is authoritative." The
 * backend is authoritative and does not serve this, so the whole catalogue is
 * simulated and marked — but the *type* is the one a real catalogue would use,
 * so the screen does not change when the contract arrives.
 */
export interface CreatorPointRule {
  ruleKey: string;
  label: string;
  description: string;
  points: number;
  /** What the member has to do. Routed to from the rule row. */
  actionRoute?: string | null;
  /** A cap, where one applies: "up to 5 times a month". */
  limitLabel?: string | null;
  category?: string | null;
  isActive: boolean;
}

/**
 * Something points can be exchanged for.
 *
 * Distinct from conversion-to-money, which goes through Phase 5's wallet
 * conversion and never through this type.
 */
export const CREATOR_REWARD_STATES = [
  'Available', 'Locked', 'Pending', 'Redeemed', 'Rejected', 'Expired',
] as const;
export type CreatorRewardState = (typeof CREATOR_REWARD_STATES)[number] | (string & {});

export interface CreatorReward {
  rewardId: string;
  title: string;
  description: string;
  /** What it costs in points. A count. */
  pointsCost: number;
  state: CreatorRewardState;
  category?: string | null;
  icon?: string | null;
  /** Why it is locked, when it is. */
  lockedReason?: string | null;
  /** What the member gets — an entitlement key, a promotion code, a placement. */
  grantKind?: string | null;
  expiresAt?: string | null;
}

export interface CreatorRewardRedemption {
  redemptionId: string;
  rewardId: string;
  rewardTitle: string;
  pointsSpent: number;
  state: CreatorRewardState;
  /** What the platform issued, when it issued something the member can use. */
  grantReference?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface RedeemRewardRequest {
  rewardId: string;
  idempotencyKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// MILESTONES
// ═════════════════════════════════════════════════════════════════════════════

export const CREATOR_MILESTONE_STATES = [
  'Locked', 'InProgress', 'AlmostComplete', 'Completed', 'Claimed', 'Expired',
] as const;
export type CreatorMilestoneState =
  | (typeof CREATOR_MILESTONE_STATES)[number]
  | (string & {});

/**
 * A milestone.
 *
 * §22: "Milestones should be represented as data-driven entities. Do not
 * hardcode every milestone directly into UI components." So there is no
 * `FirstGuideMilestone` component anywhere in this phase — there is one
 * `<MilestoneCard>` that renders whatever the repository returned, and the
 * simulated catalogue lives in the mock data file rather than in JSX.
 */
export interface CreatorMilestone {
  milestoneId: string;
  key: string;
  title: string;
  description: string;
  icon?: string | null;
  category?: string | null;
  state: CreatorMilestoneState;
  progress: CreatorProgress;
  /** What completing it pays, when it pays something. */
  reward?: CreatorMilestoneReward | null;
  completedAt?: string | null;
  claimedAt?: string | null;
  expiresAt?: string | null;
  /** Ordering the platform wants. Never sorted by title on the device. */
  sortOrder: number;
}

export interface CreatorMilestoneReward {
  kind: 'points' | 'badge' | 'entitlement' | 'money' | (string & {});
  /** For a points reward. A count. */
  points?: number | null;
  /** For a money reward. Always `Money`, never a number. */
  amount?: Money | null;
  badgeKey?: string | null;
  entitlementKey?: string | null;
  label: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHALLENGES
// ═════════════════════════════════════════════════════════════════════════════

export const CREATOR_CHALLENGE_STATES = [
  'Upcoming', 'Open', 'Joined', 'InProgress', 'Completed',
  'Claimed', 'Failed', 'Expired', 'Cancelled',
] as const;
export type CreatorChallengeState =
  | (typeof CREATOR_CHALLENGE_STATES)[number]
  | (string & {});

/**
 * A challenge and the member's participation in it.
 *
 * §23 forbids hard-coding challenge rules into components. `tasks` is the whole
 * rule set, served as data; the card renders a list, not a switch statement.
 */
export interface CreatorChallenge {
  challengeId: string;
  title: string;
  description: string;
  icon?: string | null;
  category?: string | null;

  state: CreatorChallengeState;
  /** Whether this member may join. Decided by the server. */
  isEligible: boolean;
  ineligibleReason?: string | null;

  /** The rules, as data. */
  tasks: CreatorChallengeTask[];
  /** Overall progress the backend computed across the tasks. */
  progress: CreatorProgress;

  reward?: CreatorMilestoneReward | null;
  /** Free-text rules the platform authored. Rendered, never parsed. */
  rules: string[];

  startsAt?: string | null;
  endsAt?: string | null;
  joinedAt?: string | null;
  completedAt?: string | null;

  participantCount?: number | null;
  /** Whether this challenge ranks its participants. */
  hasLeaderboard: boolean;
}

export interface CreatorChallengeTask {
  taskId: string;
  label: string;
  description?: string | null;
  isComplete: boolean;
  progress?: CreatorProgress | null;
  /** Where the member goes to make progress. */
  actionRoute?: string | null;
  actionLabel?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARDS
// ═════════════════════════════════════════════════════════════════════════════

export const LEADERBOARD_SCOPES = [
  'top-creators', 'top-contributors', 'challenge', 'community', 'country',
] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number] | (string & {});

export interface CreatorLeaderboard {
  scope: LeaderboardScope;
  title: string;
  /** The period this ranking covers, in the platform's words. */
  periodLabel: string;
  /** What the score means. Rendered so a rank is never a bare number. */
  scoreLabel: string;
  entries: CreatorLeaderboardEntry[];
  /** Where the signed-in member sits, when they are ranked at all. */
  viewerEntry?: CreatorLeaderboardEntry | null;
  updatedAt: string;
}

export interface CreatorLeaderboardEntry {
  rank: number;
  creatorId: string;
  displayName: string;
  avatarUrl?: string | null;
  score: number;
  isVerifiedCreator: boolean;
  countryCode?: string | null;
  /** Movement since the last ranking, when the platform tracks it. */
  rankDelta?: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════

/** §15's period set. `custom` carries its own bounds. */
export const ANALYTICS_PERIODS = ['today', '7d', '30d', '90d', 'year', 'custom'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface AnalyticsRange {
  period: AnalyticsPeriod;
  /** ISO dates. Required when `period` is `custom`, echoed by the server otherwise. */
  from?: string | null;
  to?: string | null;
}

/**
 * One metric.
 *
 * §14: "Do not invent metric definitions." `definition` is served — it is the
 * platform's own sentence describing what the number counts — and the UI shows
 * it on demand rather than the app shipping its own glossary that drifts.
 */
export interface CreatorMetric {
  key: string;
  label: string;
  value: number;
  /** How to render it: a count, a percentage, a duration, an amount. */
  format: 'count' | 'percentage' | 'currency' | 'duration' | (string & {});
  /** Present when `format` is `currency`. */
  amount?: Money | null;
  /** Change against the previous comparable period, as a percentage. Served. */
  changePercentage?: number | null;
  /** Whether an increase is good. Not every metric is. */
  higherIsBetter?: boolean;
  definition?: string | null;
}

export interface CreatorAnalyticsSummary {
  range: AnalyticsRange;
  /** The headline tiles, in the order the platform wants them. */
  metrics: CreatorMetric[];
  /** A sparkline series per metric key, when the platform serves one. */
  series: CreatorMetricSeries[];
  /** When the figures were last recomputed. Reporting lag is never hidden. */
  generatedAt: string;
  /** How stale the data can be, in the platform's words. */
  freshnessNote?: string | null;
}

export interface CreatorMetricSeries {
  key: string;
  label: string;
  points: CreatorSeriesPoint[];
}

export interface CreatorSeriesPoint {
  /** ISO date of the bucket. */
  at: string;
  value: number;
}

/** Per-item performance, for the content list. */
export interface CreatorContentPerformance {
  contentId: string;
  contentType: ContentType | (string & {});
  title: string;
  publishedAt?: string | null;
  status: string;
  metrics: CreatorMetric[];
  /** Revenue attributable to this item, when the platform attributes any. */
  revenue?: Money | null;
  /** Whether this item currently carries a paid placement. */
  isSponsored: boolean;
}

export interface CreatorContentPerformancePage {
  items: CreatorContentPerformance[];
  nextCursor?: string | null;
  hasMore: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// REVENUE · EARNINGS · PAYOUTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §17's states.
 *
 * The distinction between `Pending` and `Available` is the most important one
 * in this file: §17 says pending revenue must never be presented as available
 * money. The type keeps the two in separate fields on `CreatorRevenueSummary`
 * so a screen cannot add them together by accident, and `AmountDisplay` renders
 * the pending figure in a different tone.
 */
export const CREATOR_EARNING_STATES = [
  'Pending', 'Available', 'Processing', 'Paid', 'Failed',
  'Reversed', 'Refunded', 'Cancelled',
] as const;
export type CreatorEarningState =
  | (typeof CREATOR_EARNING_STATES)[number]
  | (string & {});

export const CREATOR_REVENUE_SOURCES = [
  'SponsoredContent', 'Referral', 'RewardConversion', 'Donation',
  'Contribution', 'Subscription', 'Grant', 'Challenge', 'Milestone', 'Other',
] as const;
export type CreatorRevenueSource =
  | (typeof CREATOR_REVENUE_SOURCES)[number]
  | (string & {});

/**
 * The revenue headline.
 *
 * Every figure is a `Money` the backend sent. §11 of the success criteria:
 * "Revenue is never calculated as authoritative client-side data." There is no
 * sum, no subtraction and no currency conversion anywhere in the revenue
 * surface — the breakdown rows are served alongside the total, and when they
 * disagree the served total wins and the screen says the figures are the
 * platform's.
 */
export interface CreatorRevenueSummary {
  currency: string;
  /** Everything ever earned, in every state. */
  lifetimeEarned: Money;
  /** Cleared and withdrawable. Matches the wallet's available balance. */
  available: Money;
  /** Earned but not yet cleared. Never added to `available` on the device. */
  pending: Money;
  /** In flight to a payout destination. */
  processing: Money;
  /** Paid out to date. */
  paidOut: Money;
  /** This reporting period, with the period named. */
  currentPeriod: Money;
  currentPeriodLabel: string;
  /** Where it came from. Served, never derived from the earnings list. */
  breakdown: CreatorRevenueBreakdownRow[];
  generatedAt: string;
}

export interface CreatorRevenueBreakdownRow {
  source: CreatorRevenueSource;
  label: string;
  amount: Money;
  /** Share of the total, as a percentage the server computed. */
  sharePercentage: number;
  transactionCount: number;
}

export interface CreatorEarning {
  earningId: string;
  source: CreatorRevenueSource;
  state: CreatorEarningState;
  amount: Money;
  /** What the platform took, where it takes anything. */
  fee?: Money | null;
  /** What actually reaches the creator: `amount` less `fee`. Served. */
  netAmount: Money;
  description: string;
  /** What produced it — a placement, a referral, a grant. */
  subjectType?: string | null;
  subjectId?: string | null;
  /** The B15 transaction this settled through, when it settled. */
  transactionId?: string | null;
  /** When the money becomes available, for a pending earning. */
  availableAt?: string | null;
  occurredAt: string;
  settledAt?: string | null;
}

export interface CreatorEarningsPage {
  earnings: CreatorEarning[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export const CREATOR_PAYOUT_STATES = [
  'Scheduled', 'Processing', 'Paid', 'Failed', 'Cancelled',
] as const;
export type CreatorPayoutState = (typeof CREATOR_PAYOUT_STATES)[number] | (string & {});

export interface CreatorPayout {
  payoutId: string;
  state: CreatorPayoutState;
  amount: Money;
  /** A masked label the server produced. Never account details. */
  destinationLabel?: string | null;
  scheduledFor?: string | null;
  paidAt?: string | null;
  failureReason?: string | null;
  receiptReference?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// REFERRALS · SIGN-UP BONUS
// ═════════════════════════════════════════════════════════════════════════════

export const REFERRAL_STATES = [
  'Invited', 'Signed Up', 'Pending', 'Qualified', 'Rewarded', 'Expired', 'Rejected',
] as const;
export type ReferralState = (typeof REFERRAL_STATES)[number] | (string & {});

/**
 * The member's referral programme state.
 *
 * §18: "Do not assume every signup is a qualifying referral." The counts are
 * kept separate — `signedUp` is not `qualified` — because collapsing them is
 * exactly the mistake that produces a dashboard promising money the platform
 * never owed.
 */
export interface CreatorReferralProgramme {
  /** The code the member shares. Issued by the server. */
  code: string;
  /** The full share URL, built by the server so the domain is never guessed. */
  shareUrl: string;
  /** What the platform pays, in its own words. Never computed here. */
  rewardDescription: string;
  /** The terms, as the platform wrote them. */
  terms: string[];
  /** What makes a signup *qualify*. Served, because the client cannot know. */
  qualificationDescription: string;

  invited: number;
  signedUp: number;
  qualified: number;
  /** Rewards earned but not yet released. */
  pendingRewards: number;
  confirmedRewards: number;
  /** Total value earned from referrals. `Money`, and served. */
  totalEarned?: Money | null;
  /** Points earned from referrals, where the programme pays points. */
  totalPointsEarned?: number | null;

  isEligible: boolean;
  ineligibleReason?: string | null;
  updatedAt: string;
}

export interface CreatorReferral {
  referralId: string;
  /** A display name the server chose to reveal. Often a first name only. */
  inviteeLabel: string;
  state: ReferralState;
  /** Why it has not qualified yet, in the platform's words. */
  stateReason?: string | null;
  invitedAt: string;
  signedUpAt?: string | null;
  qualifiedAt?: string | null;
  /** What it paid, once it paid. */
  rewardPoints?: number | null;
  rewardAmount?: Money | null;
}

export interface CreatorReferralPage {
  referrals: CreatorReferral[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export const SIGNUP_BONUS_STATES = [
  'NotEligible', 'Eligible', 'Pending', 'Awarded', 'AlreadyClaimed', 'Expired', 'Blocked',
] as const;
export type SignupBonusState = (typeof SIGNUP_BONUS_STATES)[number] | (string & {});

/**
 * The sign-up bonus.
 *
 * §19: "Do not award points locally. Frontend can present the state. Backend
 * must award the actual points." There is deliberately no `claim` that credits
 * anything on the device — `acknowledgeSignupBonus` tells the server the member
 * accepted, and the server decides what that is worth.
 */
export interface SignupBonus {
  state: SignupBonusState;
  /** The points on offer. A count, and the server's number. */
  points: number;
  /** Why the member cannot have it, when they cannot. Includes risk refusals. */
  ineligibleReason?: string | null;
  /** What still has to happen before a pending bonus is awarded. */
  requirements: CreatorRequirement[];
  awardedAt?: string | null;
  expiresAt?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// SPONSORED CONTENT
// ═════════════════════════════════════════════════════════════════════════════

export const SPONSORED_CONTENT_STATES = [
  'Draft', 'PendingPayment', 'PendingApproval', 'Approved', 'Scheduled',
  'Active', 'Paused', 'Expired', 'Rejected', 'Cancelled', 'Completed',
] as const;
export type SponsoredContentState =
  | (typeof SPONSORED_CONTENT_STATES)[number]
  | (string & {});

/**
 * A creator's sponsored placement over one of their own content items.
 *
 * This is a *view* over B15's `Placement` plus Phase 6's simulated approval
 * layer — not a second monetization system. §20 forbids duplicating the
 * monetization logic, so `productCode` and `placementId` are real B15
 * identifiers and the purchase goes through `usePurchaseProduct()`.
 */
export interface SponsoredContentItem {
  /** The B15 placement, once one exists. Null for a draft. */
  placementId?: string | null;
  contentId: string;
  contentType: ContentType | (string & {});
  contentTitle: string;
  /** The B15 catalogue product that funds it. */
  productCode?: string | null;
  packageLabel?: string | null;

  state: SponsoredContentState;
  /** Set only when the platform refused it. Shown verbatim. */
  rejectionReason?: string | null;

  amountPaid?: Money | null;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Whether the placement can be renewed from here. */
  isRenewable: boolean;

  /** Delivery figures, when the platform reports any. */
  performance?: CreatorMetric[] | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// EDUCATION · ACADEMY
// ═════════════════════════════════════════════════════════════════════════════

export const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number] | (string & {});

/**
 * An Academy section — "Start Here", "Monetization", "Community Safety".
 *
 * §13 wants the Academy designed as a scalable content platform rather than a
 * pile of one-off screens, so a section is data and the renderer is generic.
 */
export interface CreatorAcademySection {
  key: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  courseIds: string[];
  sortOrder: number;
}

export interface CreatorCourse {
  courseId: string;
  slug: string;
  title: string;
  summary: string;
  /** The section this belongs to. */
  sectionKey?: string | null;
  level: CourseLevel;
  /** Minutes. A number, so it can be summed for a section total. */
  estimatedMinutes: number;
  coverImageUrl?: string | null;
  icon?: string | null;
  tags: string[];
  lessonCount: number;
  /** Whether finishing it issues something. */
  awardsCertificate: boolean;
  /** A badge the course grants on completion, when it grants one. */
  awardsBadgeKey?: string | null;
  /** Courses the platform wants done first. Rendered as a prerequisite notice. */
  prerequisiteCourseIds: string[];
  /** The member's progress, when they have started. */
  progress?: CreatorCourseProgress | null;
  isSaved: boolean;
  sortOrder: number;
}

export const LESSON_KINDS = ['reading', 'video', 'checklist', 'quiz'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number] | (string & {});

export interface CreatorLesson {
  lessonId: string;
  courseId: string;
  title: string;
  kind: LessonKind;
  estimatedMinutes: number;
  /** Ordered blocks. The viewer renders blocks; it does not parse markdown. */
  blocks: LessonBlock[];
  /** The assessment, for a `quiz` lesson. */
  quiz?: LessonQuiz | null;
  isComplete: boolean;
  completedAt?: string | null;
  sortOrder: number;
}

/**
 * One piece of lesson content.
 *
 * A discriminated union rather than an HTML string, so the viewer never renders
 * remote markup and a content service cannot inject a component. §37: content
 * arrives as data, and the app decides how data is drawn.
 */
export type LessonBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'callout'; tone: 'info' | 'success' | 'warning'; title?: string; text: string }
  | { kind: 'checklist'; items: string[] }
  | { kind: 'quote'; text: string; attribution?: string }
  | { kind: 'action'; label: string; route: string; description?: string };

export interface LessonQuiz {
  quizId: string;
  /** How many of `questions` must be right. Served. */
  passMark: number;
  questions: LessonQuizQuestion[];
}

export interface LessonQuizQuestion {
  questionId: string;
  prompt: string;
  options: LessonQuizOption[];
  /** Shown after answering, whichever way it went. */
  explanation?: string | null;
}

/**
 * A quiz option.
 *
 * **`isCorrect` is deliberately absent.** Sending the answer key to the device
 * makes the quiz decorative. The member's selection goes to
 * `submitQuiz`, which returns a `LessonQuizResult` — the same shape whether
 * the grader is a real service or the development adapter.
 */
export interface LessonQuizOption {
  optionId: string;
  label: string;
}

export interface LessonQuizResult {
  passed: boolean;
  correctCount: number;
  totalCount: number;
  /** Per-question outcome, so the review screen can mark each one. */
  outcomes: { questionId: string; isCorrect: boolean; explanation?: string | null }[];
  /** Whether the member may try again, and when. */
  canRetry: boolean;
  retryAvailableAt?: string | null;
}

export const COURSE_PROGRESS_STATES = [
  'NotStarted', 'InProgress', 'Completed',
] as const;
export type CourseProgressState =
  | (typeof COURSE_PROGRESS_STATES)[number]
  | (string & {});

export interface CreatorCourseProgress {
  courseId: string;
  state: CourseProgressState;
  lessonsCompleted: number;
  lessonCount: number;
  percentage: number;
  /** Where "Continue" goes. */
  nextLessonId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  /** Issued on completion, when the course awards one. */
  certificateId?: string | null;
}

export interface CreatorCertificate {
  certificateId: string;
  courseId: string;
  courseTitle: string;
  /** The name printed on it, as the platform holds it. */
  recipientName: string;
  issuedAt: string;
  /** A server-issued reference somebody else can check. */
  verificationReference: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMUNITY GRANTS
// ═════════════════════════════════════════════════════════════════════════════

export const GRANT_STATES = ['Open', 'ClosingSoon', 'Closed', 'Upcoming'] as const;
export type GrantState = (typeof GRANT_STATES)[number] | (string & {});

export interface CommunityGrant {
  grantId: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  state: GrantState;

  /** What is on offer. `Money`, always. */
  fundingAmount: Money;
  /** A range, where the programme awards variable amounts. */
  fundingMinimum?: Money | null;
  fundingMaximum?: Money | null;

  /** What the programme asks for. `isMet` decided by the server. */
  requirements: CreatorRequirement[];
  /** What a successful applicant has to deliver. */
  deliverables: string[];
  /** Whether this member may apply at all. */
  isEligible: boolean;
  ineligibleReason?: string | null;

  opensAt?: string | null;
  deadlineAt?: string | null;
  /** How many applications the programme has had, when it discloses that. */
  applicantCount?: number | null;
  /** The member's own application, when they have one. */
  applicationId?: string | null;
  applicationState?: GrantApplicationState | null;
  countryCodes: string[];
}

export const GRANT_APPLICATION_STATES = [
  'Draft', 'Submitted', 'UnderReview', 'MoreInformationRequested',
  'Approved', 'Rejected', 'Withdrawn', 'Active', 'Completed',
] as const;
export type GrantApplicationState =
  | (typeof GRANT_APPLICATION_STATES)[number]
  | (string & {});

export interface GrantApplication {
  applicationId: string;
  grantId: string;
  grantTitle: string;
  state: GrantApplicationState;

  /** The member's answers, keyed by the question the form asked. */
  answers: Record<string, string>;
  /** Amount requested, where the programme lets the applicant ask. */
  requestedAmount?: Money | null;
  /** Supporting material, by server-issued reference. Never file contents. */
  attachments: CreatorVerificationEvidence[];

  submittedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  informationRequested?: string[] | null;
  respondByAt?: string | null;

  /** What was actually awarded, once approved. */
  awardedAmount?: Money | null;
  /** Reporting the grant requires, once active. */
  reports: GrantReport[];

  canWithdraw: boolean;
  canResubmit: boolean;
}

export interface GrantReport {
  reportId: string;
  title: string;
  dueAt: string;
  state: 'Pending' | 'Submitted' | 'Accepted' | 'Overdue' | (string & {});
  submittedAt?: string | null;
}

/** One question on a grant form. Served, so the form is not hard-coded. */
export interface GrantApplicationField {
  key: string;
  label: string;
  helpText?: string | null;
  kind: 'text' | 'longText' | 'number' | 'select' | (string & {});
  isRequired: boolean;
  maxLength?: number | null;
  options?: { value: string; label: string }[] | null;
}

export interface GrantApplicationForm {
  grantId: string;
  fields: GrantApplicationField[];
  /** What the applicant has to agree to. */
  declarations: string[];
  allowsAttachments: boolean;
  allowsAmountRequest: boolean;
}

export interface SubmitGrantApplicationRequest {
  grantId: string;
  answers: Record<string, string>;
  requestedAmountMinorUnits?: number | null;
  currency?: string | null;
  attachmentIds: string[];
  acceptedDeclarations: string[];
  idempotencyKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS
// ═════════════════════════════════════════════════════════════════════════════

export const CREATOR_RECOMMENDATION_KINDS = [
  'course', 'challenge', 'grant', 'monetization', 'content',
  'community', 'improvement', 'sponsored', 'verification', 'referral',
] as const;
export type CreatorRecommendationKind =
  | (typeof CREATOR_RECOMMENDATION_KINDS)[number]
  | (string & {});

/**
 * One suggestion.
 *
 * §28 forbids building a second recommendation engine. Nothing on the device
 * ranks these: the list arrives ordered, `reason` is the platform's own
 * explanation, and dismissal is a round trip rather than a local filter — so a
 * suggestion dismissed on the phone is dismissed on the web too.
 */
export interface CreatorRecommendation {
  recommendationId: string;
  kind: CreatorRecommendationKind;
  title: string;
  body: string;
  /** Why the platform is suggesting it. Shown, so the rail is not a black box. */
  reason: string;
  icon?: string | null;
  actionLabel: string;
  actionRoute: string;
  /** 0–1. Used to decide emphasis, never to reorder. */
  confidence?: number | null;
  expiresAt?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The dashboard summary.
 *
 * §39: the dashboard must not become an API waterfall. This one object is the
 * first paint — status, the four headline counters, and the counts that decide
 * whether a section is worth showing — and every deeper dataset is fetched by
 * the screen that needs it. A dashboard that fetched thirteen datasets to draw
 * one card would be the failure mode that section names.
 */
export interface CreatorDashboardSummary {
  status: CreatorStatus;
  statusLabel: string;
  /** The tiles across the top. Served in order. */
  headline: CreatorMetric[];

  points: { available: number; pending: number };
  /** Deliberately only two figures, and both `Money`. */
  revenue: { available: Money; pending: Money } | null;

  /** Counts that decide what to surface. Zero means the section collapses. */
  counts: {
    activeChallenges: number;
    claimableMilestones: number;
    openGrants: number;
    coursesInProgress: number;
    activeSponsoredContent: number;
    pendingReferrals: number;
    unreadNotifications: number;
  };

  /** What the platform wants the member to do next. Ordered, never sorted here. */
  nextActions: CreatorRecommendation[];
  /** Verification, when there is something to say about it. */
  verificationState: CreatorVerificationState;
  generatedAt: string;
}

/**
 * A named creator surface.
 *
 * Used for three things that must agree with each other: which gap notice a
 * screen shows, which analytics `surface` property it sends, and which
 * recommendation rail it asks for. A closed union rather than a free string,
 * so a screen cannot invent a surface name that the recommendation adapter has
 * never heard of and silently receive an empty rail.
 */
export const CREATOR_SURFACES = [
  'dashboard', 'profile', 'verification', 'rewards', 'points', 'analytics',
  'revenue', 'referrals', 'milestones', 'challenges', 'grants', 'academy',
  'sponsored', 'directory', 'leaderboard',
] as const;
export type CreatorAccessSurface = (typeof CREATOR_SURFACES)[number];

// ═════════════════════════════════════════════════════════════════════════════
// ENTITLEMENTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the creator programme has unlocked for this member.
 *
 * Resolved from B15's real entitlement set where a key exists there, and from
 * the creator projection where it does not. The client never decides an
 * entitlement — §37 — it renders one, and the server re-decides on the request
 * that follows.
 */
export interface CreatorEntitlement {
  key: string;
  label: string;
  isGranted: boolean;
  /** Where it came from: a subscription, a status, a reward, a milestone. */
  grantedBy?: string | null;
  /** What the member would have to do. Rendered on a locked feature. */
  unlockHint?: string | null;
  /** A limit the entitlement carries, where it carries one. */
  value?: string | null;
}
