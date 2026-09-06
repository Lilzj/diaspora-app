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
      'The dashboard, the creator profile editor and every status badge read a simulated creator projection. Identity, display name and country come from the real auth session; everything creator-specific — status, categories, audience counters, completeness — is simulated and marked.',
    missingContract: [
      'GET /api/v1/creators/me — the caller’s creator projection: status, categories, expertise, languages, audience counters, discoverability and profile completeness',
      'PUT /api/v1/creators/me — edit the creator-facing fields (bio, categories, expertise, languages, cover image)',
      'GET /api/v1/creators/{id} — the public projection, with the private fields absent rather than nulled',
      'A `CreatorStatus` enum: NotACreator, Contributor, EmergingCreator, VerifiedCreator, EstablishedCreator, TopCreator, PendingVerification, Restricted, Suspended',
      'A documented rule set for what moves a member between statuses, served as `nextStatus.requirements` rather than implemented in the client',
      'A `creator.status.changed` integration event so B13 can notify on promotion',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `Diaspora.Modules.Creator` serves the projection: `GET /api/v1/creators/me`, `PUT /api/v1/creators/me` and `GET /api/v1/creators/{id}`, plus the directory at `GET /api/v1/creators`. `CreatorStatus` is the nine-member enum this entry asked for, decided by `CreatorStatusPolicy` and served with `nextStatus.requirements` in words. `hooks/creator-economy.ts` reads them through `lib/creator/certified-client.ts`.',
      'The sentence this entry used to rest on — “There is no creator aggregate” — was true when written and had stopped being true without anybody re-reading it. It is kept in `whyNotImplementable` rather than deleted, because the register is a historical record and should show when it was wrong.',
      '**Two divergences the entry could not have known.** `PUT /api/v1/creators/me` binds bio, categories, expertise, languages, coverImageUrl and isDiscoverable and *not* displayName — the display name is Identity’s, and the client had a field for it the server would have silently dropped. And `audience.reach` is served as **0 with `reachAvailable: false` beside it**: reach is an audience measurement, it belongs to CREATOR-GAP-007, and this module refuses to invent it from the lifetime counters it does hold. That is a live route with a switched-off field, and the client now carries the flag so a screen says “not measured” rather than printing a zero that reads as “nobody”.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/creators/me/verification`, `POST /api/v1/creators/me/verification`, `POST /api/v1/creators/me/verification/evidence`, `POST /api/v1/creators/me/verification/submit` and `POST /api/v1/creators/me/verification/appeal` all exist, with the eleven-state `CreatorVerificationState` and every `isMet` decided against real state — identity verification is re-checked against Trust rather than taken from the member’s word.',
      'The entry’s premise — “Trust verifies people, not programmes” — is still exactly right, and is why this is a separate state machine rather than a reuse of `VerificationStatus`. What changed is that the programme wrapper around it now exists.',
      '`POST /api/v1/creators/verification/{id}/decide` is the reviewer’s route and is deliberately **not** exposed on the client: it needs `creator:verification:review`, which no member screen holds, and a client function for it would be a control nothing may press.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/creators/me/milestones` serves the whole catalogue with this creator’s standing against each — a milestone nobody has started is `Locked` at 0% rather than absent — and `POST /api/v1/creators/me/milestones/{id}/claim` claims one. `progress` is weighted and capped server-side, which is exactly what this entry said `current / target` on a device would get wrong.',
      'Three barriers stand against a double reward and each catches a different race: the state check, a unique index on the claim key, and B15’s own unique index on the grant reference. The idempotency key is accepted in the body **and** in the `Idempotency-Key` header, and the header wins — worth stating because Automation ships no header reader at all and requires the key in the body.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/challenges`, `GET /api/v1/challenges/{id}`, `POST /api/v1/challenges/{id}/join`, `POST /api/v1/challenges/{id}/claim` and `GET /api/v1/challenges/{id}/leaderboard` all exist. Tasks and rules are served as data exactly as this entry asked, and `ChallengeTaskWindow` defaults to `SinceJoined` so a challenge cannot pay for work somebody has already been paid for.',
      'The state is resolved server-side from the challenge’s half and the member’s, and served as one field. The entry’s objection — that counting a member’s own guides on the device would be wrong on a second device and wrong the moment a guide is unpublished — is answered by the server owning the count.',
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
    backendStatus: 'partial',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/grants`, `GET /api/v1/grants/{id}`, `GET /api/v1/grants/{id}/form`, `GET /api/v1/grants/applications/me`, `POST /api/v1/grants/{id}/applications`, `POST /api/v1/grants/applications/{id}/withdraw` and `POST /api/v1/grants/applications/{id}/reports` all exist, with the nine-state `GrantApplicationState` matching the client’s `GRANT_APPLICATION_STATES` exactly.',
      '**The submit route is not the one this entry declared.** It asked for a submit keyed on the application id — POST /grants/applications/{id}/submit, deliberately left unquoted here because the drift check reads backticked routes as claims that they exist, and this one never has; the backend serves `POST /api/v1/grants/{id}/applications/submit`, keyed on the grant rather than on an application that may not exist yet. The simulated client happened to call the real shape, which was luck rather than agreement, and is recorded here so the next reader does not re-derive it.',
      '**A declaration is accepted by key, and the client was sending the sentence.** `GrantApplication.SaveAnswers` matches `acceptedDeclarations` against `grant.Declarations[].Key`, and the served form carries `{ key, text }` pairs. The client’s form type was a `string[]` of the sentences the member had read, so every submission would have been refused with `GrantDeclarationRequired` — on the last screen of a funding application, for a reason the member could do nothing about. Fixed in this wave.',
      'The funding leg this entry called the sharper problem is answered by `GrantFundingBoundary`: an approved application carries a `fundingReference` that stays null until B15 has executed it, so “approved” and “paid” remain two facts.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/academy/sections`, `GET /api/v1/academy/courses`, `GET /api/v1/academy/courses/{id}/lessons`, `PUT /api/v1/academy/courses/{id}/saved`, `POST /api/v1/academy/lessons/{id}/complete`, `POST /api/v1/academy/quizzes/{id}/submit` and `GET /api/v1/academy/certificates/me` all exist. Grading is server-side and the answer key never leaves it — `LessonQuizOptionResponse` carries no `isCorrect`, which is what makes the assessment mean anything.',
      'The content-versioning rule this entry asked for is served: a lesson carries `contentVersion`, the version this member completed, and `hasBeenRevised`.',
      '**There is no route for a single course and none for a single lesson.** A course is read out of the catalogue and a lesson out of its course’s ordered list, so the lesson screen now carries `courseId` in its URL. `useCreatorLesson` keeps a simulated arm for a deep link saved before that, because guessing a course returns somebody else’s lesson under the right title.',
      '**`SubmitQuizRequest.Answers` is a map of questionId → optionId**, not the array of pairs the simulated adapter accepted; a JSON array posted into a `Dictionary<Guid, Guid>` is a model-binding failure. The client builds the map, so the screens keep the array they already produce.',
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
    // Served as GET /analytics/creators/me, /me/summary and /me/content — all 200. The 'metric definition per key' this entry wants is GET /analytics/definitions.
    backendStatus: 'connected',
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
    backendStatus: 'partial',
    key: 'revenue',
    title: 'Creator earnings and revenue attribution',
    feature: '§16 Revenue Dashboard · §17 Revenue State',
    frontendBehaviour:
      'Nothing on the revenue dashboard is simulated any more. The wallet balance, the transaction list and every payment were always **real** — read from B15 — and the *attribution* beside them is now real too: `Diaspora.Modules.Creator` records an earning against every payment it can attribute, with a source, a state, both the gross and the creator’s share, and a per-source breakdown the server totals. `<PartiallyRealNotice>` and `<SimulatedFigure>` were removed from the screen rather than left to be silenced by this flag, because `<SimulatedFigure>` gates on the build and would have gone on stamping “simulated” over served figures.',
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
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    existingBackendCapability: [
      'RESOLVED, except for payouts. `GET /api/v1/creators/me/earnings` and `GET /api/v1/creators/me/revenue/summary` both exist. `CreatorEarningState` is the eight-member enum this entry asked for, spelled exactly as the client’s `CREATOR_EARNING_STATES`, and `creator-earning-drift.test.ts` fails in both directions if either side moves.',
      '**GET /creators/me/payouts is deliberately still missing** — left unquoted here, because the drift suite reads a backticked route as a claim that it exists, and this one never has. It is why this entry is `partial` rather than `connected`. There is no payout aggregate, so the route would answer an empty list for ever — indistinguishable from “you have never been paid”, and the same defect as a filter that can only come back empty. `creator-earning-api.ts` has no payouts function for the same reason. `CreatorPayout` stays in the client’s types with nothing rendering it.',
      '**The source enum is four values, not the ten the client listed.** `RewardConversion`, `Contribution`, `Grant`, `Challenge`, `Milestone` and `Other` had no producer anywhere on the platform, so “Grants” as a revenue filter would have returned an empty list for ever — the campaign-objective mismatch again. `CREATOR_REVENUE_SOURCES` was narrowed to match, and the revenue screen’s empty state stopped naming grants and converted points.',
      '**The rate per source is configuration, not code.** `Creator:RevenueShare` seeds a donation at 100% (a donation naming a beneficiary is unambiguously theirs) and every other source at **zero**, so an attributed earning is recorded with its gross intact and an honest zero share until somebody with the authority to set a revenue rate sets one. A made-up 70% would have read as policy.',
      '**A summary is one currency and says so.** `hasOtherCurrencies` is served because summing across currencies produces a figure that is not money in any of them; the client carries the flag through to the screen rather than dropping it and turning an honest partial total into a wrong complete one. `lifetimeEarned` likewise **excludes** reversals, which are carried separately in `reversed`.',
      '**The earnings route pages, and the first draft of it did not.** It answered the most recent fifty and carried nothing to say there were more — a ledger with rows missing that a creator cannot see are missing. It now takes an opaque `cursor` keyed on `(occurredAt, id)` together, because two earnings settling in the same instant is ordinary and a timestamp-only cursor drops one of them.',
      'The transaction-type seam this entry asked for is still open: an earning carries no B15 transaction reference, so `CreatorEarning.transactionId` is served as null and no earning row opens a transaction. An earning is a claim; the transaction that settles it belongs to the payout that does not exist yet.',
    ],
    whyNotImplementable:
      'B15 records money movements, not their business meaning. A transaction says "+£12.00 credit"; nothing says it was a sponsorship share rather than a refund. Attributing them on the device would mean the client inventing the revenue model, and §11 of the success criteria forbids revenue being authoritative client-side data. Answered by a module that records the meaning as an earning of its own, beside the movement rather than instead of it.',
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
      'The referral code, share link, share sheet, invited/signed-up/qualified counts, per-referral state, pending and confirmed rewards, terms and referral history are complete and simulated. Every count is kept distinct — a signup is never presented as a qualified referral.',
    missingContract: [
      'GET /api/v1/referrals/me — the caller’s code, share URL, counts, reward description and the programme’s qualification rule in words',
      'GET /api/v1/referrals/me/history?cursor= — individual referrals with a state and a reason',
      'POST /api/v1/referrals/code — issue a code where one is not issued at registration',
      'A `ReferralState` enum: Invited, SignedUp, Pending, Qualified, Rewarded, Expired, Rejected',
      'A documented qualification rule — what a referred member has to do before the reward is owed — and the anti-abuse checks that can reject one',
      'A `referral.qualified` integration event that grants the points, so the frontend never does',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/referrals/me`, `GET /api/v1/referrals/me/history` and `POST /api/v1/referrals/code` all exist. `ReferralState` keeps Invited, SignedUp, Qualified and Rewarded as four separate facts, which is this entry’s central point and §18’s.',
      'The share URL is built server-side from `CreatorOptions.ReferralShareBaseUrl`, so the domain is never guessed by a device — exactly what the entry asked for.',
      '**The history page names its rows `referrals`, not `items`.** `readPage` keys on `Array.isArray(payload.items)` and would have returned an empty page with no error at all. Recorded in `backend-row-property-drift.test.ts`.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/rewards/signup-bonus/me` and `POST /api/v1/rewards/signup-bonus/acknowledge` exist. The bonus is served as a state with a member-safe reason that never names a risk check, the points figure is the deployment’s `CreatorOptions.SignupBonusPoints`, and the acknowledgement carries no points figure at all — §19 kept on the server rather than promised on the client.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/rewards/rules`, `GET /api/v1/rewards/catalogue`, `GET /api/v1/rewards/redemptions/me` and `POST /api/v1/rewards/redemptions` all exist. A redemption request carries a reward identifier and a key and no price at all — the server loads the authoritative catalogue and charges what it says.',
      '**Neither catalogue route returns an array.** `GET /api/v1/rewards/rules` returns `{ rules, catalogueVersion, expiryPolicy, expiryDescription, updatedAt }` and `GET /api/v1/rewards/catalogue` returns `{ rewards, catalogueVersion, availablePoints, updatedAt }`. This entry declared both as bare lists; a client reading `data` as an array gets `undefined.map`, and one reading it through `readPage` gets an empty page with no error. Both row names are now in `backend-row-property-drift.test.ts`.',
      'The catalogue version and the expiry statement the entry asked for are served and are now rendered, so “do my points expire” has the platform’s answer rather than a guess. **Nothing under `/api/v1/rewards` returns a points balance** — B15 serves that at `/api/v1/financial/rewards/me`, the two spaces do not collide, and `useCreatorPoints` still reads B15’s.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/creators/leaderboard` serves the ranking with the caller’s own row even when it falls off the page, a score *definition* as well as a label, and `viewerIsOptedOut` so an absent row can be explained rather than implied to be a zero. The per-challenge board is `GET /api/v1/challenges/{id}/leaderboard`, which ranks enrolments rather than the activity ledger.',
      'The scope is the client’s own kebab spelling — `top-creators`, `top-contributors`, `country`, `community`, `challenge` — parsed case-insensitively and echoed back verbatim, so no adaptation was needed in either direction.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `GET /api/v1/creators` serves the public directory with facets, cursor-paged. A creator who opted out is absent rather than filtered, and the facet counts are computed under the same visibility rule the search applies.',
      '**The page names its rows `creators`, not `items`.** Recorded in `backend-row-property-drift.test.ts`, where it had already been listed as unconsumed.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-03). `POST /api/v1/telemetry/events` exists, served by `Diaspora.Modules.Analytics` under its own prefix because it is its own trust boundary — everything under `/api/v1/analytics` is a read the caller must already be entitled to, and this is the one write, open to every authenticated member and treated as untrusted from the first line of the handler.',
      'The shape is the one this client has emitted into a buffer since Phase 7 — `{ event, properties, occurredAt }` — and the server restates the client’s own property allow-list rather than widening it. **There is no user identifier on the request and there must never be one:** the server attributes every row to the authenticated caller, and a field for it here would make the client’s four-phase-old sanitiser advisory.',
      'It answers **202, not 200**: the batch is accepted for processing and the per-event verdicts are in the body under `results`, so nothing a client does with the response implies the figures have moved yet.',
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
