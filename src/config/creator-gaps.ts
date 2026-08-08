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
//                   conversion, already simulated under `/financial-gap/v0`
//                   and reused here rather than forked.
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

export interface CreatorGap {
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
    key: 'profile',
    title: 'Creator profile and status projection',
    feature: '§5 Creator Dashboard · §6 Creator Profile · §7 Creator Status',
    frontendBehaviour:
      'The dashboard, the creator profile editor and every status badge read a simulated creator projection. Identity, display name and country come from the real auth session; everything creator-specific — status, categories, audience counters, completeness — is simulated and marked.',
    missingContract: [
      'GET /api/v1/creators/me — the caller’s creator projection: status, categories, expertise, languages, audience counters, discoverability and profile completeness',
      'PUT /api/v1/creators/me — edit the creator-facing fields (bio, categories, expertise, languages, cover image)',
      'GET /api/v1/creators/{id} — the public projection, with the private fields absent rather than nulled',
      'A `CreatorStatus` enum: NotACreator, Contributor, EmergingCreator, VerifiedCreator, EstablishedCreator, TopCreator, PendingVerification, Restricted, Suspended',
      'A documented rule set for what moves a member between statuses, served as `nextStatus.requirements` rather than implemented in the client',
      'A `creator.status.changed` integration event so B13 can notify on promotion',
    ],
    existingSeams: [
      '`AccountState` and the Trust profile already carry identity, country memberships and restriction state',
      '`UserReputation` in `types/reputation.ts` already models a level ladder with thresholds and benefits — a creator status is a different projection of the same underlying contribution history',
      '`PublishingIdentity` in `types/creator.ts` already models publishing as a personal or organizational identity',
    ],
    whyNotImplementable:
      'There is no creator aggregate. The platform knows a member has published guides, and it knows their reputation level, but nothing anywhere says "this person is an Established Creator" — and §7 forbids the UI inventing that rule from a point count. A client that derived a status from `combinedScore` would be shipping the business rule, and it would disagree with the backend the day the rule changed.',
    owner: 'creator-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Creator Platform',
  },

  verification: {
    id: 'CREATOR-GAP-002',
    key: 'verification',
    title: 'Creator programme verification',
    feature: '§8 Creator Verification',
    frontendBehaviour:
      'The eligibility check, requirement list, application, submission, review, more-information, approval, rejection, resubmission and appeal states are all built and run against simulated persistence. Identity verification — the requirement underneath it — routes to the real Trust flow and is never simulated.',
    missingContract: [
      'GET /api/v1/creators/me/verification — the caller’s application state and the programme’s requirements, with `isMet` decided server-side',
      'POST /api/v1/creators/me/verification — start or update a draft application',
      'POST /api/v1/creators/me/verification/submit — submit for review, idempotent',
      'POST /api/v1/creators/me/verification/appeal — contest a rejection',
      'POST /api/v1/creators/me/verification/evidence — attach supporting material, returning a server-issued reference and never echoing the file',
      'A `CreatorVerificationState` enum covering NotEligible … AppealPending',
      'A `creator.verification.decided` integration event',
    ],
    existingSeams: [
      '`POST /trust/verify/identity` and `POST /trust/verify/diaspora` run real verification, and `POST /trust/verify/diaspora/appeal` establishes the appeal pattern',
      '`VerificationStatus` — Pending, Approved, Rejected, NeedMoreInfo, Expired — is the vocabulary a creator application should reuse',
      '`AccountState.VerificationUnderReview` and `RequiresMoreInformation` already gate navigation through `access-gateway`',
    ],
    whyNotImplementable:
      'Trust verifies people, not programmes. There is no application aggregate for "verified creator" and no route that would accept one. §8 is explicit that identity logic must not be implemented in the frontend, so the identity requirement is rendered as an unmet requirement pointing at the real Trust flow, and only the programme wrapper around it is simulated.',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform, with Trust',
  },

  milestones: {
    id: 'CREATOR-GAP-003',
    key: 'milestones',
    title: 'Creator milestones',
    feature: '§22 Creator Milestones',
    frontendBehaviour:
      'The milestone catalogue, per-milestone progress, the locked / in-progress / almost-complete / completed / claimed / expired states and the claim action are complete and simulated. Milestones are data, not components — one card renders whatever the repository returns.',
    missingContract: [
      'GET /api/v1/creators/me/milestones — the catalogue with this member’s state and progress against each',
      'POST /api/v1/creators/me/milestones/{id}/claim — claim a completed milestone, idempotent, returning the granted reward',
      'A `CreatorMilestoneState` enum: Locked, InProgress, AlmostComplete, Completed, Claimed, Expired',
      'A server-computed `progress { current, target, percentage }` per milestone — weighted and capped milestones make `current / target` wrong',
      'A `creator.milestone.completed` integration event so B13 can notify',
    ],
    existingSeams: [
      '`ALL_CREATOR_BADGES` in `components/creator/AchievementsModal.tsx` is a hard-coded badge shelf that a real milestone contract would replace',
      '`CreatorTimelineEvent.type` already has `milestone_achieved` and `followers_milestone` members',
      'The reputation engine already counts the underlying events — guides published, helpful votes, verifications',
    ],
    whyNotImplementable:
      'Nothing on the platform stores "this member has completed First 10 Guides and has not yet claimed it". The counters exist; the milestone aggregate, its state machine and its reward grant do not. Computing completion on the device would put the client in charge of when a reward is owed, which §12 of the success criteria forbids.',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform',
  },

  challenges: {
    id: 'CREATOR-GAP-004',
    key: 'challenges',
    title: 'Creator challenges',
    feature: '§23 Creator Challenges',
    frontendBehaviour:
      'Discovery, detail, eligibility, rules, join, per-task progress, leaderboard, completion, reward claim and history all run against simulated persistence. Challenge rules are served as data and rendered as a list; no rule is encoded in a component.',
    missingContract: [
      'GET /api/v1/challenges?state=&take= — open, upcoming and completed challenges with this member’s participation state',
      'GET /api/v1/challenges/{id} — one challenge with its task list and the caller’s progress',
      'POST /api/v1/challenges/{id}/join — enrol, idempotent',
      'POST /api/v1/challenges/{id}/claim — claim the reward on completion',
      'GET /api/v1/challenges/{id}/leaderboard?take= — ranked participants, with the caller’s own position included even when off-page',
      'A `CreatorChallengeState` enum and a per-task progress projection',
      'A `challenge.progress.changed` and `challenge.completed` integration event',
    ],
    existingSeams: [
      'Every underlying action a challenge would count — publishing a guide, hosting an event, referring a member — is already a real platform action with a real event',
      'B14 already ranks entities, so the leaderboard side has infrastructure',
    ],
    whyNotImplementable:
      'There is no challenge entity, no enrolment, and no task-progress projection. Counting a member’s own guides on the device to advance "create 3 helpful guides" would produce a number that is wrong on a second device and wrong the moment a guide is unpublished — and it would let the client decide when a reward is due.',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform',
  },

  grants: {
    id: 'CREATOR-GAP-005',
    key: 'grants',
    title: 'Community grants',
    feature: '§24 Community Grants · §25 Grant Dashboard',
    frontendBehaviour:
      'Grant discovery, categories, detail, eligibility, the served application form, draft, submit, withdraw, under-review, more-information, approved, rejected, active and reporting states are complete and simulated. No decision is ever made on the device.',
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
    existingSeams: [
      'B15 can move the money once a decision exists: `ContributionFund` and `DonationCause` already model directed community funding',
      'B12/moderation runs a real review queue, which is the closest existing analogue to a grant panel',
      'B13.2 conversations could carry the applicant/reviewer correspondence a grant needs',
    ],
    whyNotImplementable:
      'No grant programme, application or review exists anywhere on the platform, and §24 forbids implementing grant decision logic in the frontend. The funding leg is the sharper problem: an approved grant has to become money, and there is no documented route from a grant decision to a wallet credit.',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform, with B15 for funding',
  },

  academy: {
    id: 'CREATOR-GAP-006',
    key: 'academy',
    title: 'Creator Academy content and progress',
    feature: '§12 Creator Education · §13 Creator Academy',
    frontendBehaviour:
      'The Academy is a complete content platform — sections, courses, lessons, structured lesson blocks, quizzes, progress, certificates, saved courses and recommended learning — running against a development content provider. The provider is an interface, so a CMS or a backend content service replaces it without touching a screen.',
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
    existingSeams: [
      '`src/app/explore/tutorial/[id].tsx` and `types/explore.ts` already model tutorial content and completion, which is the same shape one level down',
      '`FEATURE_TOURS` in `config/featureRegistry.ts` includes a `creator` tour titled "Creator Studio Academy" — the entry point exists and leads nowhere',
      '`exploreStorage` already persists per-member content progress locally',
    ],
    whyNotImplementable:
      'There is no content service. §12 says not to assume education content is hard-coded into the app, so the courses live behind a `CreatorEducationRepository` with a development provider — but the grading and progress *persistence* genuinely cannot be client-owned: a quiz whose answer key ships in the bundle is decorative, and progress kept only on the device is lost on reinstall.',
    owner: 'future-evolution',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform, or a content service',
  },

  analytics: {
    id: 'CREATOR-GAP-007',
    key: 'analytics',
    title: 'Creator analytics and content performance',
    feature: '§14 Creator Analytics · §15 Analytics Periods · §27 Content Performance',
    frontendBehaviour:
      'The full analytics surface — period selection across today/7d/30d/90d/year/custom, headline metrics, trend series, per-content performance and audience growth — renders from a development analytics provider behind a visible marker. Every metric carries the platform’s own definition, and none is computed on the device.',
    missingContract: [
      'GET /api/v1/creators/me/analytics?period=&from=&to= — headline metrics and trend series for a period the server validates',
      'GET /api/v1/creators/me/analytics/content?cursor=&take=&period= — per-item performance, cursor-paged',
      'GET /api/v1/creators/me/analytics/audience?period= — follower growth and reach',
      'A metric definition per key — what counts as a view, what deduplication is applied, what the reporting lag is',
      'A statement of which periods the backend supports, so the client does not offer one it cannot serve',
    ],
    existingSeams: [
      '`UnifiedContentItem` already carries `views`, `bookmarks`, `commentsCount` and `helpfulVotes` per item, and `useContentInsightsStore` renders a client-side analytics view today',
      'MON-GAP-002 asks for placement and campaign performance, which is the paid half of the same reporting problem',
      'MON-GAP-010 asks for the premium analytics dataset the `analytics.advanced` entitlement already gates',
    ],
    whyNotImplementable:
      'No view, impression or engagement event is recorded in any certified contract, and §14 forbids inventing metric definitions. The existing per-item counters are a different question — a lifetime total, not a figure for a period — so a "30-day views" number derived from them would be wrong in a way nobody could see.',
    owner: 'creator-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Creator Platform, with the analytics module',
  },

  revenue: {
    id: 'CREATOR-GAP-008',
    key: 'revenue',
    title: 'Creator earnings and revenue attribution',
    feature: '§16 Revenue Dashboard · §17 Revenue State',
    frontendBehaviour:
      'The wallet balance, the transaction list and every payment on the revenue dashboard are **real** — read from B15. What is simulated is the *attribution*: which earning came from sponsored content rather than a referral, what is pending versus available, and the per-source breakdown. The screen separates the two and says which is which.',
    missingContract: [
      'GET /api/v1/creators/me/earnings?state=&source=&cursor= — individual earnings with a source, a state and a settlement reference',
      'GET /api/v1/creators/me/revenue/summary?period= — lifetime, available, pending, processing, paid-out and a per-source breakdown, all as `Money`',
      'GET /api/v1/creators/me/payouts — scheduled and completed payouts',
      'A `CreatorEarningState` enum: Pending, Available, Processing, Paid, Failed, Reversed, Refunded, Cancelled',
      'A `TransactionType` member, or a transaction `source` field, that distinguishes creator revenue from every other credit — today a creator earning and a refund are the same shape',
      'A documented clearing rule: how long an earning is Pending before it becomes Available',
    ],
    existingSeams: [
      '`GET /financial/wallets/me` serves a real `available`, `pending` and `reserved` balance, and the dashboard shows those verbatim',
      '`GET /financial/wallets/me/transactions` and `GET /financial/payment-intents` carry every movement that has actually happened',
      '`WalletType.Revenue` exists as an enum member — the seam for a creator revenue wallet is declared',
      'Phase 5’s points→credit conversion is the one creator earning path that already reaches the wallet, albeit simulated',
    ],
    whyNotImplementable:
      'B15 records money movements, not their business meaning. A transaction says "+£12.00 credit"; nothing says it was a sponsorship share rather than a refund. Attributing them on the device would mean the client inventing the revenue model, and §11 of the success criteria forbids revenue being authoritative client-side data.',
    owner: 'B15-financial',
    priority: 'critical',
    recommendedPhase: 'B15.1, with B18 for attribution',
  },

  referrals: {
    id: 'CREATOR-GAP-009',
    key: 'referrals',
    title: 'Referral programme and qualification',
    feature: '§18 Referral Earnings',
    frontendBehaviour:
      'The referral code, share link, share sheet, invited/signed-up/qualified counts, per-referral state, pending and confirmed rewards, terms and referral history are complete and simulated. Every count is kept distinct — a signup is never presented as a qualified referral.',
    missingContract: [
      'GET /api/v1/referrals/me — the caller’s code, share URL, counts, reward description and the programme’s qualification rule in words',
      'GET /api/v1/referrals/me/history?cursor= — individual referrals with a state and a reason',
      'POST /api/v1/referrals/code — issue a code where one is not issued at registration',
      'A `ReferralState` enum: Invited, SignedUp, Pending, Qualified, Rewarded, Expired, Rejected',
      'A documented qualification rule — what a referred member has to do before the reward is owed — and the anti-abuse checks that can reject one',
      'A `referral.qualified` integration event that grants the points, so the frontend never does',
    ],
    existingSeams: [
      '`PromotionKind.ReferralReward` and `CreditKind.Referral` both exist in B15 as operator-granted credit',
      '`REWARD_SOURCES` in `types/financial-gaps.ts` already includes `ReferralJoined`, so the points side has a vocabulary',
      'Registration collects an invite context today, so the attribution seam exists at signup',
    ],
    whyNotImplementable:
      'There is no referral aggregate and no qualification rule anywhere. B15 can grant referral credit but only as an operator action, and §18 is explicit that not every signup qualifies — so a client that counted signups and promised a reward would be promising money the platform never agreed to pay.',
    owner: 'creator-platform',
    priority: 'high',
    recommendedPhase: 'B18 Creator Platform, with B15 for the reward grant',
  },

  signupBonus: {
    id: 'CREATOR-GAP-010',
    key: 'signupBonus',
    title: 'Sign-up point bonus',
    feature: '§19 Sign-up Point Bonus',
    frontendBehaviour:
      'Eligibility, pending, awarded, already-claimed, expired, not-eligible and risk-blocked states are all rendered, with the outstanding requirements listed. The frontend never awards a point: acknowledging the bonus is a round trip, and the balance it then shows is whatever the server reports.',
    missingContract: [
      'GET /api/v1/rewards/signup-bonus/me — the bonus state, the points on offer and what is still outstanding',
      'POST /api/v1/rewards/signup-bonus/acknowledge — record that the member accepted; the server decides whether to award',
      'A `SignupBonusState` enum including a `Blocked` member for a risk refusal, with a member-safe reason',
      'A `rewards.signup-bonus.awarded` integration event so B13 can notify and the points balance can invalidate',
    ],
    existingSeams: [
      '`CreditKind.Bonus` exists in B15 for operator-granted bonus credit',
      'The Phase 5 rewards balance and history are the surface an awarded bonus would appear on, and already handle a `SeasonalBonus` source',
      'Registration already produces an `AccountState` progression that a bonus rule could hang off',
    ],
    whyNotImplementable:
      'No signup bonus exists. The dangerous version of this feature is the one where the client optimistically shows a credited balance — §19 says the backend must award the actual points, so the client shows a *state* and re-reads the balance rather than incrementing anything.',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform',
  },

  pointRules: {
    id: 'CREATOR-GAP-011',
    key: 'pointRules',
    title: 'Points rules catalogue',
    feature: '§11 Points System',
    frontendBehaviour:
      'The "how points are earned" catalogue — every action, what it pays, any cap, and where to go and do it — renders from a simulated catalogue behind a marker. The balance and history beside it come from Phase 5’s rewards adapter, which is a separate, already-registered gap.',
    missingContract: [
      'GET /api/v1/rewards/rules — the point-earning catalogue: rule key, label, points, cap, category and an action route',
      'A per-rule cap and cooldown, matching what `ScoringRule` in `types/reputation.ts` already models for reputation',
      'An expiry policy — whether points lapse, after how long, and what the member is warned about',
      'A version or `updatedAt` on the catalogue, so a changed award value is visible rather than silently different',
    ],
    existingSeams: [
      '`ScoringRule { actionType, points, dimension, maxOccurrences, cooldownHours }` already exists for reputation and is very nearly the contract needed here',
      'Phase 5’s `REWARD_SOURCES` enumerates the earning actions the platform already recognises',
      '`RewardBalance` and `RewardHistoryEntry` already model the balance and the ledger this catalogue would explain',
    ],
    whyNotImplementable:
      'B15 contains no occurrence of "points" at all — Phase 5 established that — and the reputation engine’s scoring rules are not served to clients. §11 forbids hard-coding award amounts where the backend is authoritative; since nothing is served, the catalogue is simulated in one place rather than sprinkled through the UI as literals.',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Creator Platform',
  },

  leaderboards: {
    id: 'CREATOR-GAP-012',
    key: 'leaderboards',
    title: 'Creator leaderboards',
    feature: '§32 Creator Leaderboards',
    frontendBehaviour:
      'Top creators, top contributors, country and community boards and the per-challenge board all render from simulated rankings, with the period and the meaning of the score both labelled. No ranking is computed on the device.',
    missingContract: [
      'GET /api/v1/creators/leaderboard?scope=&period=&country=&take= — a ranked page with the caller’s own entry included even when it falls off the page',
      'A documented score definition per scope, so a rank is never a bare number',
      'A privacy rule: which creators may appear, and how a member opts out',
      'A refresh cadence, so "updated 3 hours ago" is true rather than decorative',
    ],
    existingSeams: [
      '`src/app/(tabs)/knowledge/contributors.tsx` already renders a contributor directory ordered by contribution',
      'The reputation engine already produces a comparable score per member',
      'B14 ranks entities for recommendation, which is the same infrastructure problem',
    ],
    whyNotImplementable:
      'No ranking endpoint exists, and §32 forbids authoritative ranking logic in the frontend. Ranking the contributor list the app already has would rank only the members this device happened to fetch, which is not a leaderboard.',
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
      'The "what to do next" rail on the dashboard and the recommended course, challenge and grant rails render simulated suggestions behind a marker. Nothing is inferred on the device, and dismissal is a round trip rather than a local filter.',
    missingContract: [
      'GET /api/v1/recommendations/creator?surface=&take= — ranked creator suggestions with a kind, a reason code and an action route',
      'POST /api/v1/recommendations/{id}/dismiss — so a dismissed suggestion stays dismissed across devices',
      'A `CreatorRecommendationKind` enum covering course, challenge, grant, monetization, content, community, improvement, sponsored, verification and referral',
    ],
    existingSeams: [
      'B14 already ranks content, providers and people',
      'MON-GAP-011 asks B14 for the monetization surface, which is the same request one domain over',
      '`AIInsightCard` on the existing creator dashboard renders a hard-coded version of exactly this rail',
    ],
    whyNotImplementable:
      'B14 exposes no creator surface. §28 forbids creating a separate recommendation engine, so the rail is served by the development adapter rather than by rules living in the dashboard.',
    owner: 'B14-recommendation',
    priority: 'low',
    recommendedPhase: 'B14.1',
  },

  discovery: {
    id: 'CREATOR-GAP-014',
    key: 'discovery',
    title: 'Creator directory and discovery facets',
    feature: '§31 Creator Discovery',
    frontendBehaviour:
      'Creator search, the category, country, expertise, language and verification facets and the creator cards run against the simulated projection. The existing contributor directory remains, unchanged and real, and the creator directory is a distinct surface rather than a fork of it.',
    missingContract: [
      'GET /api/v1/creators?query=&country=&category=&expertise=&verified=&cursor= — a cursor-paged directory returning the public projection only',
      'A server-enforced visibility rule, so a creator who opted out is absent from the response rather than filtered by the client',
      'Facet counts, so a filter that would return nothing can be disabled before it is tapped',
    ],
    existingSeams: [
      '`GET /discovery/contributors` already serves a contributor directory, and `src/app/contributor/[id].tsx` renders a public contributor profile',
      '`AuthorExpertise` already renders expertise on a public surface',
      'The search infrastructure in `types/search.ts` already models faceted search',
    ],
    whyNotImplementable:
      'The contributor directory is not a creator directory: it has no creator status, no creator categories and no programme verification, and it applies no creator visibility rule. §31 requires that creators who should not be discoverable are not returned — which is a server decision, not a client filter.',
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
      'No notification is invented and none is delivered by this phase. The client registers the creator routes so a creator notification resolves when B13 starts sending one, and the notification preferences screen shows the creator category only when the backend serves it.',
    missingContract: [
      'A `creator` notification category seeded by the platform contributor, alongside `billing`, `trust` and `community`',
      'Templates for: creator.verification.decided, creator.milestone.completed, creator.challenge.progress, creator.challenge.completed, creator.grant.decided, creator.reward.earned, creator.points.awarded, creator.referral.qualified, creator.revenue.received, creator.course.completed, creator.academy.announcement',
      'A `targetRoute` per template pointing into `/creator/…`',
    ],
    existingSeams: [
      'B13 is real and complete: categories, preferences, delivery, digest and deep links all work',
      '`notification-routes.ts` already refuses an unresolvable route and falls back to the inbox, so an unknown creator route degrades correctly today',
      'B15’s `billing.*` templates prove the pattern — a module declares its templates and the client’s route tree matches',
    ],
    whyNotImplementable:
      'Not a frontend problem at all, and §29 says so: "Do not implement notification delivery in this phase." The gap is recorded because the creator events that should produce notifications have no templates, and the register is where a backend phase should find that out.',
    owner: 'B13-notifications',
    priority: 'medium',
    recommendedPhase: 'B13.2, once B18 emits the events',
  },

  telemetry: {
    id: 'CREATOR-GAP-016',
    key: 'telemetry',
    title: 'Product analytics event ingestion',
    feature: '§40 Analytics instrumentation',
    frontendBehaviour:
      'Every creator UX event §40 lists is instrumented through one typed emitter with a redaction allow-list. In a development build it logs; in a release build it buffers and drops, because there is nowhere to send it. No event carries a credential, an amount, or an identity document reference.',
    missingContract: [
      'POST /api/v1/telemetry/events — a batched, fire-and-forget ingestion endpoint that never blocks a user action',
      'A documented event schema and property allow-list, so a client cannot send a field the platform did not ask for',
      'A retention and residency statement, since creator events describe named members',
    ],
    existingSeams: [
      'Nothing. There is no analytics client, no provider and no ingestion route anywhere in the codebase — this was verified by search, not assumed.',
    ],
    whyNotImplementable:
      '§40 says to use the existing analytics infrastructure and there is none. Adding a third-party SDK would be a product and privacy decision this phase has no mandate to make, so the emitter is real, typed and tested, and its transport is a documented no-op with one place to change when a destination exists.',
    owner: 'future-evolution',
    priority: 'medium',
    recommendedPhase: 'Platform infrastructure',
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
