// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `creator-gaps.ts`, derived by
// `node scripts/generate-production-registers.js`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// `metro.config.js` and `scripts/production-stubs.js`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
//   existingBackendCapability — community/gaps only
//   frontendBehaviour — analytics/gaps, community/gaps, creator/gaps, map/diagnostics
//   existingSeams — creator/gaps only
//   whyNotImplementable — analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection
//   privacyConsiderations — analytics/gaps, community/gaps
//   securityConsiderations — analytics/gaps, community/gaps
//   caching — community/gaps only
//   integrationWork — map/diagnostics only
//   considerations — no reader outside the registers
//   requiredContracts — analytics/gaps, community/gaps — and emptying it takes the nested request, response, authorization, idempotency, aggregation and retryBehaviour shapes with it
//   currentBehaviour — map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS
//   missingBackendCapability — analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS and MULTI_COMMUNITY_GAPS
//
// Edit the source. `production-registers-drift.test.ts` fails if this file
// stops matching what this script would produce from it.

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 7, Creator Economy)
//
// ⚠ EVERYTHING REGISTERED HERE IS UNSUPPORTED BY THE CERTIFIED BACKEND. ⚠
//
// Phase 7 is an orchestration layer, not a new platform. Most of what the
// creator economy needs already exists somewhere and this phase uses it:
//
//   B15 Financial   real wallets, transactions, catalogue, purchases,
//                   placements, subscriptions and entitlements. The revenue
//                   dashboard reads a real balance; sponsored content buys a
//                   real product and produces a real placement.
//   B13/B13.1/.2    real notifications and conversations. No creator
//                   notification is delivered by this phase; the platform's
//                   inbox carries them.
//   Trust/Identity  real verification. The creator programme *requires*
//                   identity verification and routes to it; it never
//                   re-implements it.
//   Phase 5         the points balance, points history and points→credit
//                   conversion, reused here rather than forked. Simulated under
//                   `/financial-gap/v0` when this was written; all three are
//                   on the certified `/financial/rewards/*` routes now.
//   Phase 6         promotion products, placements, checkout, entitlements
//                   and the simulated approval and performance layers.
//
// What is left over is this file: sixteen capabilities with no contract behind
// them anywhere on the platform. Each entry was written after searching the
// certified surface for it and not finding it — not from a roadmap.
//
// The three mechanisms Phase 5 established, unchanged, because they work:
//
//   1. **A different URL space.** Creator gap endpoints live under
//      `/creator-gap/v0/…`. Never `/financial`, never `/trust`, never
//      `/creator` (which the existing Creator Studio workspace mocks already
//      own). A gap call that escaped to a real deployment 404s at the gateway.
//   2. **A visible marker.** Every gap-backed surface renders
//      `<CreatorGapNotice>`, which names the missing contract on the screen.
//   3. **A single switch.** `areCreatorGapsEnabled()` is false in release
//      builds, so a production binary ships no simulated grant approval, no
//      invented audience figure and no fake points award.
//
// When a gap closes, the entry moves out of this file, the repository swaps its
// development arm for the backend arm, and the notice disappears. The screens
// do not change — which is the entire reason to build them now.
//
// Gap identifiers are `CREATOR-GAP-0xx` and are quoted verbatim in
// `frontend-phase-7-creator-economy-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Which backend module should own the work, so a later phase can scope it. */
export type CreatorGapOwner =
  /** A creator/community platform module that does not exist yet. */
  | 'creator-platform'
  /** B15's domain — money, earnings, payouts. */
  | 'B15-financial'
  /** B14's domain — ranking and personalization. */
  | 'B14-recommendation'
  /** B13's domain — notification templates and event contracts. */
  | 'B13-notifications'
  /** Trust/Identity's domain — verification and reputation projection. */
  | 'trust-identity'
  /** Nobody's brief yet. Platform infrastructure. */
  | 'future-evolution';

export type CreatorGapPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * How much of a gap the certified backend now answers.
 *
 * Added by Remediation Wave C-03, and it is what *retires* an entry rather than
 * deleting it. `backend-gap-register-drift.test.ts` skips a gap whose status
 * says CONNECTED or PARTIAL: its `missingContract` lines stay in the file as the
 * historical record — a register entry is a claim with a date on it, and the
 * value of this file is as much in showing when it was wrong as in what it asks
 * for — while dropping out of the live comparison.
 *
 * Absent means the entry is still making a claim of absence, and the drift check
 * still reads it.
 */
export type CreatorGapStatus =
  | 'IMPLEMENTED + BACKEND CONNECTED'
  | 'IMPLEMENTED + BACKEND PARTIAL'
  | 'IMPLEMENTED + SIMULATED';

export interface CreatorGap {
  /**
   * Whether the backend has since shipped this.
   *
   * The register is a historical record and entries are deliberately not deleted
   * when a gap closes — that is the whole point of the file. But a notice that
   * keeps rendering after the capability arrives tells members the platform
   * cannot do something it does, which is the one failure this pattern exists to
   * prevent, pointing the other way.
   *
   * `connected` means every declared endpoint is served, verified against the
   * deployment rather than assumed. The notice stops rendering; nothing else
   * changes. `partial` means some are, and the notice stays because the screen
   * still has a hole in it.
   */
  backendStatus?: 'connected' | 'partial';
  /** `CREATOR-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  /** What a member would call it. */
  title: string;
  /** The Phase 7 scope section this belongs to. */
  feature: string;
  /** One sentence on what the frontend does today. */
  frontendBehaviour: string;
  /** What the backend would have to expose. Route-level, not hand-waving. */
  missingContract: string[];
  /** What exists already, so a future phase does not rebuild it. */
  existingSeams: string[];
  /**
   * How much of this gap the certified backend now serves.
   *
   * Absent on an entry nobody has re-read against `diaspora-backend`.
   */
  frontendStatus?: CreatorGapStatus;
  /**
   * What the backend serves **today**, written when the gap was closed.
   *
   * Every route named here is quoted in backticks and checked the other way
   * round by the drift suite: a register that vouches for a route the backend
   * has never served costs a screen that 404s and reports "check your
   * connection", which is the failure Wave K found and the reason the inverse
   * check exists.
   */
  existingBackendCapability?: string[];
  /** Why the frontend cannot safely implement it against what exists. */
  whyNotImplementable: string;
  owner: CreatorGapOwner;
  priority: CreatorGapPriority;
  /** Which backend phase should pick it up. */
  recommendedPhase: string;
}

export const CREATOR_GAPS: Record<string, CreatorGap> = {
  profile: {
    id: 'CREATOR-GAP-001',
    backendStatus: 'connected',
    key: 'profile',
    title: 'Creator profile and status projection',
    feature: '§5 Creator Dashboard · §6 Creator Profile · §7 Creator Status',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me — the caller’s creator projection: status, categories, expertise, languages, audience counters, discoverability and profile completeness',
      'PUT /api/v1/creators/me — edit the creator-facing fields (bio, categories, expertise, languages, cover image)',
      'GET /api/v1/creators/{id} — the public projection, with the private fields absent rather than nulled',
      'A `CreatorStatus` enum: NotACreator, Contributor, EmergingCreator, VerifiedCreator, EstablishedCreator, TopCreator, PendingVerification, Restricted, Suspended',
      'A documented rule set for what moves a member between statuses, served as `nextStatus.requirements` rather than implemented in the client',
      'A `creator.status.changed` integration event so B13 can notify on promotion',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Creator Platform',
  },

  verification: {
    id: 'CREATOR-GAP-002',
    backendStatus: 'connected',
    key: 'verification',
    title: 'Creator programme verification',
    feature: '§8 Creator Verification',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me/verification — the caller’s application state and the programme’s requirements, with `isMet` decided server-side',
      'POST /api/v1/creators/me/verification — start or update a draft application',
      'POST /api/v1/creators/me/verification/submit — submit for review, idempotent',
      'POST /api/v1/creators/me/verification/appeal — contest a rejection',
      'POST /api/v1/creators/me/verification/evidence — attach supporting material, returning a server-issued reference and never echoing the file',
      'A `CreatorVerificationState` enum covering NotEligible … AppealPending',
      'A `creator.verification.decided` integration event',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform, with Trust',
  },

  milestones: {
    id: 'CREATOR-GAP-003',
    backendStatus: 'connected',
    key: 'milestones',
    title: 'Creator milestones',
    feature: '§22 Creator Milestones',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me/milestones — the catalogue with this member’s state and progress against each',
      'POST /api/v1/creators/me/milestones/{id}/claim — claim a completed milestone, idempotent, returning the granted reward',
      'A `CreatorMilestoneState` enum: Locked, InProgress, AlmostComplete, Completed, Claimed, Expired',
      'A server-computed `progress { current, target, percentage }` per milestone — weighted and capped milestones make `current / target` wrong',
      'A `creator.milestone.completed` integration event so B13 can notify',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform',
  },

  challenges: {
    id: 'CREATOR-GAP-004',
    backendStatus: 'connected',
    key: 'challenges',
    title: 'Creator challenges',
    feature: '§23 Creator Challenges',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/challenges?state=&take= — open, upcoming and completed challenges with this member’s participation state',
      'GET /api/v1/challenges/{id} — one challenge with its task list and the caller’s progress',
      'POST /api/v1/challenges/{id}/join — enrol, idempotent',
      'POST /api/v1/challenges/{id}/claim — claim the reward on completion',
      'GET /api/v1/challenges/{id}/leaderboard?take= — ranked participants, with the caller’s own position included even when off-page',
      'A `CreatorChallengeState` enum and a per-task progress projection',
      'A `challenge.progress.changed` and `challenge.completed` integration event',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform',
  },

  grants: {
    id: 'CREATOR-GAP-005',
    backendStatus: 'connected',
    key: 'grants',
    title: 'Community grants',
    feature: '§24 Community Grants · §25 Grant Dashboard',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/grants?category=&country=&state= — open grant programmes with eligibility resolved for the caller',
      'GET /api/v1/grants/{id} — one programme with requirements, deliverables and deadline',
      'GET /api/v1/grants/{id}/form — the application form as data, so the fields are not hard-coded in the app',
      'POST /api/v1/grants/{id}/applications — create or update a draft',
      'POST /api/v1/grants/applications/{id}/submit — submit, idempotent',
      'POST /api/v1/grants/applications/{id}/withdraw — withdraw before a decision',
      'GET /api/v1/grants/applications/me — the caller’s applications and their states',
      'POST /api/v1/grants/applications/{id}/reports — submit a required report on an active grant',
      'A `GrantApplicationState` enum and a documented rule for how an approved grant is funded — a B15 payout, a wallet credit, or an off-platform transfer',
      'A `grant.application.decided` integration event',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform, with B15 for funding',
  },

  academy: {
    id: 'CREATOR-GAP-006',
    backendStatus: 'connected',
    key: 'academy',
    title: 'Creator Academy content and progress',
    feature: '§12 Creator Education · §13 Creator Academy',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/academy/sections — the Academy’s structure',
      'GET /api/v1/academy/courses?section=&level= — the catalogue with the caller’s progress folded in',
      'GET /api/v1/academy/courses/{id}/lessons — ordered lessons as structured blocks, never as HTML',
      'POST /api/v1/academy/lessons/{id}/complete — mark a lesson done, idempotent',
      'POST /api/v1/academy/quizzes/{id}/submit — grade a quiz server-side and return per-question outcomes',
      'PUT /api/v1/academy/courses/{id}/saved — save or unsave',
      'GET /api/v1/academy/certificates/me — issued certificates with a verifiable reference',
      'A content-versioning rule, so a member’s progress survives a lesson being rewritten',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'future-evolution',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform, or a content service',
  },

  analytics: {
    id: 'CREATOR-GAP-007',
    // Served as GET /analytics/creators/me, /me/summary and /me/content — all 200. The 'metric definition per key' this entry wants is GET /analytics/definitions.
    backendStatus: 'connected',
    key: 'analytics',
    title: 'Creator analytics and content performance',
    feature: '§14 Creator Analytics · §15 Analytics Periods · §27 Content Performance',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me/analytics?period=&from=&to= — headline metrics and trend series for a period the server validates',
      'GET /api/v1/creators/me/analytics/content?cursor=&take=&period= — per-item performance, cursor-paged',
      'GET /api/v1/creators/me/analytics/audience?period= — follower growth and reach',
      'A metric definition per key — what counts as a view, what deduplication is applied, what the reporting lag is',
      'A statement of which periods the backend supports, so the client does not offer one it cannot serve',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Creator Platform, with the analytics module',
  },

  revenue: {
    id: 'CREATOR-GAP-008',
    backendStatus: 'partial',
    key: 'revenue',
    title: 'Creator earnings and revenue attribution',
    feature: '§16 Revenue Dashboard · §17 Revenue State',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me/earnings?state=&source=&cursor= — individual earnings with a source, a state and a settlement reference',
      'GET /api/v1/creators/me/revenue/summary?period= — lifetime, available, pending, processing, paid-out and a per-source breakdown, all as `Money`',
      'GET /api/v1/creators/me/payouts — scheduled and completed payouts',
      'A `CreatorEarningState` enum: Pending, Available, Processing, Paid, Failed, Reversed, Refunded, Cancelled',
      'A `TransactionType` member, or a transaction `source` field, that distinguishes creator revenue from every other credit — today a creator earning and a refund are the same shape',
      'A documented clearing rule: how long an earning is Pending before it becomes Available',
    ],
    existingSeams: [],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    existingBackendCapability: [],
    whyNotImplementable:
      '',
    owner: 'B15-financial',
    priority: 'critical',
    recommendedPhase: 'B15.1, with B18 for attribution',
  },

  referrals: {
    id: 'CREATOR-GAP-009',
    backendStatus: 'connected',
    key: 'referrals',
    title: 'Referral programme and qualification',
    feature: '§18 Referral Earnings',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/referrals/me — the caller’s code, share URL, counts, reward description and the programme’s qualification rule in words',
      'GET /api/v1/referrals/me/history?cursor= — individual referrals with a state and a reason',
      'POST /api/v1/referrals/code — issue a code where one is not issued at registration',
      'A `ReferralState` enum: Invited, SignedUp, Pending, Qualified, Rewarded, Expired, Rejected',
      'A documented qualification rule — what a referred member has to do before the reward is owed — and the anti-abuse checks that can reject one',
      'A `referral.qualified` integration event that grants the points, so the frontend never does',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform, with B15 for the reward grant',
  },

  signupBonus: {
    id: 'CREATOR-GAP-010',
    backendStatus: 'connected',
    key: 'signupBonus',
    title: 'Sign-up point bonus',
    feature: '§19 Sign-up Point Bonus',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/rewards/signup-bonus/me — the bonus state, the points on offer and what is still outstanding',
      'POST /api/v1/rewards/signup-bonus/acknowledge — record that the member accepted; the server decides whether to award',
      'A `SignupBonusState` enum including a `Blocked` member for a risk refusal, with a member-safe reason',
      'A `rewards.signup-bonus.awarded` integration event so B13 can notify and the points balance can invalidate',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform',
  },

  pointRules: {
    id: 'CREATOR-GAP-011',
    backendStatus: 'connected',
    key: 'pointRules',
    title: 'Points rules catalogue',
    feature: '§11 Points System',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/rewards/rules — the point-earning catalogue: rule key, label, points, cap, category and an action route',
      'A per-rule cap and cooldown, matching what `ScoringRule` in `types/reputation.ts` already models for reputation',
      'An expiry policy — whether points lapse, after how long, and what the member is warned about',
      'A version or `updatedAt` on the catalogue, so a changed award value is visible rather than silently different',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform',
  },

  leaderboards: {
    id: 'CREATOR-GAP-012',
    backendStatus: 'connected',
    key: 'leaderboards',
    title: 'Creator leaderboards',
    feature: '§32 Creator Leaderboards',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/leaderboard?scope=&period=&country=&take= — a ranked page with the caller’s own entry included even when it falls off the page',
      'A documented score definition per scope, so a rank is never a bare number',
      'A privacy rule: which creators may appear, and how a member opts out',
      'A refresh cadence, so "updated 3 hours ago" is true rather than decorative',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'low',
    recommendedPhase: 'B18 Creator Platform, with B14',
  },

  recommendations: {
    id: 'CREATOR-GAP-013',
    key: 'recommendations',
    title: 'Creator recommendations',
    feature: '§28 Creator Recommendations',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/recommendations/creator?surface=&take= — ranked creator suggestions with a kind, a reason code and an action route',
      'POST /api/v1/recommendations/{id}/dismiss — so a dismissed suggestion stays dismissed across devices',
      'A `CreatorRecommendationKind` enum covering course, challenge, grant, monetization, content, community, improvement, sponsored, verification and referral',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B14-recommendation',
    priority: 'low',
    recommendedPhase: 'B14.1',
  },

  discovery: {
    id: 'CREATOR-GAP-014',
    backendStatus: 'connected',
    key: 'discovery',
    title: 'Creator directory and discovery facets',
    feature: '§31 Creator Discovery',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators?query=&country=&category=&expertise=&verified=&cursor= — a cursor-paged directory returning the public projection only',
      'A server-enforced visibility rule, so a creator who opted out is absent from the response rather than filtered by the client',
      'Facet counts, so a filter that would return nothing can be disabled before it is tapped',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'low',
    recommendedPhase: 'B18 Creator Platform',
  },

  notifications: {
    id: 'CREATOR-GAP-015',
    key: 'notifications',
    title: 'Creator notification templates and events',
    feature: '§29 Creator Notifications',
    frontendBehaviour:
      '',
    missingContract: [
      'A `creator` notification category seeded by the platform contributor, alongside `billing`, `trust` and `community`',
      'Templates for: creator.verification.decided, creator.milestone.completed, creator.challenge.progress, creator.challenge.completed, creator.grant.decided, creator.reward.earned, creator.points.awarded, creator.referral.qualified, creator.revenue.received, creator.course.completed, creator.academy.announcement',
      'A `targetRoute` per template pointing into `/creator/…`',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B13-notifications',
    priority: 'medium',
    recommendedPhase: 'B13.2, once B18 emits the events',
  },

  telemetry: {
    id: 'CREATOR-GAP-016',
    backendStatus: 'connected',
    key: 'telemetry',
    title: 'Product analytics event ingestion',
    feature: '§40 Analytics instrumentation',
    frontendBehaviour:
      '',
    missingContract: [
      'POST /api/v1/telemetry/events — a batched, fire-and-forget ingestion endpoint that never blocks a user action',
      'A documented event schema and property allow-list, so a client cannot send a field the platform did not ask for',
      'A retention and residency statement, since creator events describe named members',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'future-evolution',
    priority: 'medium',
    recommendedPhase: 'Platform infrastructure',
  },

  /**
   * Split out of `profile`.
   *
   * A gap key covers several capabilities and `backendStatus` is one boolean
   * over all of them. `profile` is connected — `GET /creators/me` is served and
   * the client reads it — but the composite dashboard summary is not, and
   * marking the key connected silenced the notice for the half that is missing.
   * The dashboard rendered nothing, with no explanation.
   */
  dashboardSummary: {
    id: 'CREATOR-GAP-021',
    key: 'dashboardSummary',
    title: 'The creator dashboard summary',
    feature: 'Creator home',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me/dashboard — status, headline metrics, points, revenue and the section counts, in one call',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform',
  },

  /**
   * Split out of `analytics`.
   *
   * Creator analytics and content performance are both served and the client
   * now reads them. Sponsorship is not served anywhere: whether an item carries
   * a paid placement is B15's, and `CreatorContentPerformanceResponse` says
   * outright that `isSponsored` is "always false on this deployment, and that
   * is a stated absence rather than a default".
   */
  sponsorship: {
    id: 'CREATOR-GAP-022',
    key: 'sponsorship',
    title: 'Sponsored content and paid placements',
    feature: 'Creator sponsorship',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/creators/me/sponsorships — active and past placements with advertiser, period and fee',
      'Whether a given content item carries a live placement, which B15 holds and no analytics contract carries',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'creator-platform',
    priority: 'low',
    recommendedPhase: 'B18 Creator Platform',
  },
} as const;

export type CreatorGapKey = keyof typeof CREATOR_GAPS;

/** Every gap, ordered by priority then id. For the register and the dev screen. */
export function listCreatorGaps(): CreatorGap[] {
  const rank: Record<CreatorGapPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return Object.values(CREATOR_GAPS)
    .slice()
    .sort((left, right) => rank[left.priority] - rank[right.priority] || left.id.localeCompare(right.id));
}

/**
 * Whether CreatorGaps features are reachable in this build.
 *
 * Delegates to `areSimulatedFeaturesEnabled()`, the single switch shared by
 * Phases 5, 6, 7 and 12.
 *
 * True under Metro and in a debug binary, and in an internal test build that
 * explicitly opted in with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. False in every
 * production build, which therefore ships no simulated grant approval, no invented audience figure, no fake points award and no fabricated earning.
 *
 * Still not a runtime toggle and still not a remote flag: the opt-in is
 * inlined by Babel at build time. A simulated capability a support engineer
 * could switch on in production is one that will one day be switched on.
 * See `src/config/gap-preview.ts`.
 */
export function areCreatorGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/**
 * The prefix every simulated creator endpoint sits behind.
 *
 * Note it is not `/creator` — the existing Creator Studio workspace mocks own
 * that space and they mirror routes the platform is expected to grow. A gap
 * route has to be unmistakable.
 */
export const CREATOR_GAP_PREFIX = '/creator-gap/v0';
