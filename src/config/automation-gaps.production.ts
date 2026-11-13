// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `automation-gaps.ts`, derived by
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
// Diaspora Platform — Backend capability gaps (Frontend Phase 18, Automation)
//
// ⚠ EVERY CAPABILITY REGISTERED HERE IS UNSUPPORTED, OR ONLY PARTLY SUPPORTED,
//   BY THE CERTIFIED BACKEND. ⚠
//
// ── What the audit found, stated plainly ─────────────────────────────────────
//
// **There is no automation engine.** Not a partial one, not a disabled one. The
// audit searched the whole frontend for automation, workflow, trigger, rule,
// scheduler, job, queue and outbox, and found no automation infrastructure of
// any kind — which means this phase has the opposite problem to Phase 16's:
// nothing to reuse, and therefore nothing to accidentally duplicate at the
// automation layer.
//
// What it *does* have is four pieces of the machinery an automation needs, all
// real, all owned by other phases, and all of which this phase consumes rather
// than rebuilds:
//
//   **B13 notifications — real and complete.** `GET/PUT /notifications/
//   preferences`, `/notifications/categories`, `/notifications/devices`, the
//   inbox, priorities, digests, quiet hours and a `criticalOverrideEnabled`
//   flag. `lib/notifications-api.ts` wraps all of it. §28 and §73 say do not
//   build a second notification system, and this phase does not: every
//   automation action that notifies names a B13 channel and a B13 category, and
//   there is no `AutomationNotification` type anywhere in the domain model.
//   What is missing is only the *dispatch on an automation's behalf* — GAP-025.
//
//   **Phase 16 calendar — one implementation, half real.** `lib/integrations/
//   calendar.ts` is the only place a Diaspora event becomes a calendar entry,
//   and it already solves §42's hard problem: converting a wall clock in an
//   event's own zone to an absolute instant, DST-aware, in two passes. This
//   phase reuses that function for every event-relative schedule and writes no
//   second converter. The device calendar genuinely works; Google is Phase 16's
//   GAP-004 and is referenced rather than restated.
//
//   **Phase 5 idempotency — real and reusable.** `lib/idempotency.ts` holds a
//   key across retries and app restarts, scoped to an operation. §39's
//   requirement is served by the same module with an `automation` operation
//   rather than by a second key store.
//
//   **Phase 13 community capabilities — server-evaluated, gap-backed.** The
//   shape §46 needs already exists: a server-produced capability set the client
//   reads booleans from and never derives. This phase copies the shape for
//   `AutomationAccess` (GAP-005) rather than inventing a role check.
//
// ── The finding that shapes the whole register ───────────────────────────────
//
// §8 warns: "Do not assume an event can be used as an automation trigger simply
// because it exists in code." That warning is the register's central finding.
//
// Diaspora has a genuinely rich domain — events, jobs, listings, housing,
// guides, communities, organizations, creator milestones, wallet transactions.
// It has **no observable domain-event stream**. Nothing in the certified surface
// publishes, persists or exposes an event an automation consumer could
// subscribe to. `realtime-mock.ts` simulates a socket for presence and typing
// and is explicitly a mock. So for every trigger in §8's list the honest answer
// is the same one, and stating it thirty times would be noise: it is stated
// once, here, and each trigger gap records only what is specific to it.
//
// The consequence is that **GAP-002 blocks almost everything else**. An
// automation registry without an execution engine stores rules nobody runs. The
// register is ordered so that the six foundation gaps come first, and every
// trigger gap names its `blockedBy`.
//
// ── Where the simulated surfaces live ────────────────────────────────────────
//
// `lib/automation-gap-api.ts`, under `/automation-gap/v0`, behind
// `areSimulatedFeaturesEnabled()` — the same single switch Phases 5, 6, 7, 8,
// 12, 13, 15 and 16 use. Never its own switch.
//
// The guarantee is a **runtime** one and it is real: in a production export the
// switch inlines to `function(){return!1}`, so `assertEnabled()` rejects on
// every path into this arm and `setupAutomationGapMocks()` registers nothing.
// It is **not** a stripping guarantee — the modules survive minification, as
// verified against a real export for the earlier phases. A production bundle
// contains unreachable adapter code and route strings; it contains no member
// data and exposes no way to make a fabricated automation appear to have run.
//
// ── What nothing in this phase can do, by construction ───────────────────────
//
// Move money. Send a message to another member unattended. Grant a permission.
// Write to a certified route. Mint a session. Schedule anything on a local
// timer and call it scheduled. Each of those is asserted structurally by
// `automation-boundary.test.ts` rather than promised here.
//
// Every gap id below is quoted verbatim in
// `frontend-phase-18-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';
import type { AutomationDomainKey } from '@/types/automation';

/** Where the simulated automation routes live. Never `/automations`. */
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ CORRECTION — Remediation Wave C-02, 17 August 2026
//
// **Ten of the gaps below are no longer gaps, and this register said they were.**
//
// `Diaspora.Modules.Automation` now serves 24 routes under `/api/v1/automations`
// — a registry, an engine, a durable scheduler with dead-lettering, run history,
// diagnostics, a live capability set, simulation, audience estimation, an audit
// trail, saved searches, reminders, a catalogue and templates. The register's
// paths and parameters matched the real routes almost exactly, which is the
// gap-adapter pattern working as designed: closing them was a client, not a
// redesign.
//
// The entries are corrected in place rather than deleted, and the sentences they
// used to carry are quoted inside them. GAP-001 opened with *"None. No
// automation, rule, workflow or trigger contract exists anywhere in the
// certified surface"* — true when written, and untrue for some time before
// anybody re-read it. That is the pattern the platform audit found 164 times
// over, and a register is only worth having if it records when it was wrong.
//
// **What is genuinely still missing** is the trigger half rather than the engine
// half: the thirteen trigger-context routes, and five of the catalogue's 49
// triggers that this deployment reports it cannot observe — the two `location.*`
// and three `community.*`. Those entries are unchanged.
//
// The rule this wave kept paying for: **read the contract from source before
// changing a call, and distrust any development handler that agrees with the
// client.** Three details would have produced a broken client if the swap had
// been done from this register alone — the body-not-header idempotency key, the
// `parameters` string/object asymmetry, and a page shape returned inside `data`
// rather than beside it — and three more were found in the client itself: a
// non-GUID `ownerId` that binds as a 400, an audience request missing its
// action keys, and a reminder with no moment to count back from.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTOMATION_GAP_PREFIX = '/automation-gap/v0';

/**
 * Whether this build may reach the automation development adapter.
 *
 * Delegates. Phases 5 through 16 each learned that a phase-local switch is a
 * phase-local mistake, and this is the ninth file to make the same delegation.
 */
export function areAutomationGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/** Which backend module should own the work. Extends Phase 16's vocabulary. */
export type AutomationGapOwner =
  /** A dedicated automation/workflow service. Does not exist in any brief yet. */
  | 'automation-platform'
  | 'B13-notifications'
  | 'B15-financial'
  | 'B12-community-life'
  | 'community-platform'
  | 'creator-platform'
  | 'jobs-platform'
  | 'marketplace-platform'
  | 'housing-platform'
  | 'directory-platform'
  | 'search-platform'
  | 'location-platform'
  | 'government-data-platform'
  | 'integration-platform'
  | 'analytics-platform'
  | 'identity-platform';

export type AutomationGapPriority = 'critical' | 'high' | 'medium' | 'low';

/** How much of the capability the certified backend already carries. */
export type AutomationGapCoverage = 'none' | 'partial';

/**
 * The frontend's own status, in the phase's vocabulary.
 *
 * There is no `incomplete` member, deliberately — the same enforcement Phase 16
 * used. The final principle forbids leaving an automation screen unfinished
 * because the backend is behind, and a type with nowhere to record "unfinished"
 * is the cheapest available way to keep that true.
 */
export type AutomationGapFrontendStatus =
  | 'IMPLEMENTED + BACKEND CONNECTED'
  | 'IMPLEMENTED + BACKEND PARTIAL'
  | 'IMPLEMENTED + DEVELOPMENT ADAPTER';

/** The required contract, at the level of detail §69 asks for. */
export interface AutomationGapContract {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request: string;
  response: string;
  authentication: string;
  authorization: string;
  permission?: string;
  /** §69 asks for idempotency explicitly. `null` where the verb is naturally safe. */
  idempotency: string | null;
}

export interface AutomationGap {
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
  /** `FRONTEND-PHASE18-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  domain: AutomationDomainKey | 'platform';
  capability: string;
  /** The §-references this belongs to. */
  feature: string;
  /** The trigger keys this gap blocks. Empty for a non-trigger gap. */
  triggerKeys: string[];
  /** The action keys this gap blocks. */
  actionKeys: string[];
  /** Which screens depend on it. §69. */
  screens: string[];
  frontendStatus: AutomationGapFrontendStatus;
  frontendBehaviour: string;
  coverage: AutomationGapCoverage;
  existingBackendCapability: string[];
  missingBackendCapability: string[];
  requiredContracts: AutomationGapContract[];
  /** The domain event an automation consumer would subscribe to. §71. */
  eventDependency: string;
  /** Whether this needs a scheduler, and of what kind. §41 · §69. */
  schedulingRequirement: string;
  /** Queue, worker and retry shape. §69. */
  queueRequirement: string;
  /** What must not happen twice, and what the key is. §39 · §69. */
  idempotencyRequirement: string;
  /** Who may create and who may be reached. §45–§48 · §69. */
  authorizationRequirement: string;
  privacyRequirements: string;
  securityRequirements: string;
  /** Whether an automatic retry is safe here, and dead-lettering. §38 · §69. */
  retryBehaviour: string;
  /** What must be observable for this to be operable. §69. */
  observability: string;
  caching: string;
  /** Another phase's gap that already covers part of this. */
  partiallyCoveredBy?: string | null;
  /** A gap in *this* register that must land first. */
  blockedBy?: string | null;
  owner: AutomationGapOwner;
  priority: AutomationGapPriority;
  recommendedPhase: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared prose
//
// Several gaps state the same rule. Naming it keeps the register honest: if the
// rule for twenty gaps is genuinely one rule, twenty paraphrases would drift
// into twenty different rules, and a backend team would implement the drift.
// ─────────────────────────────────────────────────────────────────────────────

const NO_DOMAIN_EVENT_STREAM =
  'No observable domain-event stream exists. The certified surface publishes nothing an automation consumer could subscribe to: there is no outbox, no message bus contract, no webhook registry and no event log. `realtime-mock.ts` simulates a socket for presence and typing and is explicitly a mock. Every trigger gap in this register therefore depends on the same missing foundation, which is recorded once here and referenced rather than restated.';

const SERVER_AUTHORITATIVE =
  'Authorization is entirely server-side. The client renders what it is given; a caller who edits an automation id, an owner id or a scope in a request must receive a 403 rather than being stopped by the client. §49: frontend state is never trusted as a permission, an audience or a scope.';

const OWNER_SCOPED =
  'Every automation is scoped to its owner and must be re-fetched, not merely re-rendered, when the session changes. An automation belonging to one member must be unreachable by another under any identifier they can supply, and a community automation must be unreachable by a member of a different community. §58 requires this to be proved and `automation-cache-isolation.test.ts` proves the client half.';

const NO_CLIENT_EXECUTION =
  'The client never executes this and never reports it as executed. §77 forbids the frontend claiming an automation ran when the backend has not confirmed it, so a run record may only originate from a server response — the client has no code path that constructs one, which is asserted structurally rather than reviewed.';

const NO_LOCAL_SCHEDULER =
  '§41 forbids local timers as authoritative scheduling. The client renders `nextRunAt` from the server and never computes one it presents as authoritative; a device that is off, offline, or has the app killed must not change whether an automation runs.';

const PREFERENCES_ARE_AUTHORITATIVE =
  "B13's notification preferences are evaluated server-side at dispatch, after the automation has decided to act. §53 forbids an automation bypassing a member's global preferences, quiet hours or per-category switches, and the only exception is B13's existing `criticalOverrideEnabled` path, which automation must not be able to set. A suppressed delivery is reported to the run record as `suppressed`, not as a failure — §36 and §38 both depend on the difference.";

const AUDIT_NOT_FABRICATED =
  '§51 forbids the frontend fabricating audit records. Every audit entry the UI shows carries `provenance`, and a locally-known change renders as "on this device" rather than as an audited fact until the server confirms it.';

const NO_MONEY =
  '§48 and §42 of the success criteria: no automation may transfer, withdraw, credit, refund, charge or settle. This capability notifies about money that has already moved and has no contract that could move any. The action catalogue contains no money-moving action and `automation-boundary.test.ts` asserts the adapter exports no function that could create one.';

const CONDITION_SERVER_SIDE =
  '§9: sensitive conditions must not be evaluated on client-side data. Subscription state, wallet balance, role, application status, entitlement and analytics thresholds are evaluated server-side at execution time; the client sends the condition, never its answer. A run record reports which side evaluated each condition, so a sensitive condition answered by the client is observable rather than invisible.';

const DEAD_LETTER =
  'Exhausted retries move the run to a dead-letter state that is visible in execution history as FAILED with a `failureKind`, never silently dropped. §38 requires actionable recovery guidance, which needs a durable record of what failed and why.';

export const AUTOMATION_GAPS: Record<string, AutomationGap> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // THE FOUNDATION — §3 · §4 · §5 · §36 · §41 · §55
  //
  // Six gaps. Nothing else in this register can ship before them, and GAP-002
  // is the one that turns stored rules into an automation platform.
  // ═══════════════════════════════════════════════════════════════════════════

  automationRegistry: {
    id: 'FRONTEND-PHASE18-GAP-001',
    backendStatus: 'connected',
    key: 'automationRegistry',
    domain: 'platform',
    capability:
      'An automation registry — durable storage for a member’s, community’s or organization’s automations, with their triggers, conditions, actions, schedule, scope and lifecycle state',
    feature: '§3 Automation Domain · §5 Lifecycle · §6 Automation Center · §45 Ownership',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation', '/automation/create', '/automation/[id]', '/automation/[id]/edit'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency:
      'None for the registry itself. It stores rules; GAP-002 runs them. Separating the two is what lets storage ship first and be useful — a member can configure, and the engine starts honouring configurations that already exist.',
    schedulingRequirement:
      'None. The registry holds a schedule; it does not act on one. `nextRunAt` is computed by GAP-003 and written here.',
    queueRequirement: 'None.',
    idempotencyRequirement:
      'Creation must be idempotent per attempt. See the contract above; the duplicate-automation failure is silent and compounding, which makes it worse than a visible error.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} §45: every automation has exactly one owner scope and the server enforces it. §46: a community automation requires a community role the server verifies. §47: an organization automation requires an organization role. An ordinary member must not be able to create either by editing a request.`,
    privacyRequirements:
      'An automation’s rule contents can be personal — a saved housing search reveals a budget and a neighbourhood; a wallet trigger reveals financial activity; a location trigger reveals where somebody goes. The record is readable only by its owner and by a manager of its owning scope. §52 forbids tracking rule contents in analytics, and the analytics vocabulary carries trigger and action *keys* only, never parameter values.',
    securityRequirements: `${OWNER_SCOPED} The rule must be re-validated server-side against the catalogue on every write: a client that invents a trigger key, an action key or a capability must receive 400, because a permissive registry is how an unauthorized action key becomes an authorized one later.`,
    retryBehaviour:
      'Reads are safe to retry with backoff. Creation retries only with the idempotency key. A 4xx is never retried.',
    observability:
      'Per-owner counts of automations by status, and creation/activation rates. No rule contents in logs.',
    caching:
      '',
    owner: 'automation-platform',
    priority: 'critical',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationEngine: {
    id: 'FRONTEND-PHASE18-GAP-002',
    backendStatus: 'connected',
    key: 'automationEngine',
    domain: 'platform',
    capability:
      'An execution engine — the consumer that observes domain events, evaluates conditions, dispatches actions and records the outcome',
    feature: '§4 Provider Abstraction · §8 Triggers · §9 Conditions · §10 Actions · §36 History',
    triggerKeys: ['*'],
    actionKeys: ['*'],
    screens: ['/automation', '/automation/[id]', '/automation/history', '/automation/run/[runId]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} The engine is the first consumer, so building it means building the stream. The recommended shape is a transactional outbox per owning module, drained into a durable queue, because the alternative — each module calling the engine synchronously — makes every domain write depend on the automation platform being up.`,
    schedulingRequirement:
      'Event-driven execution needs no scheduler. Time-driven execution is GAP-003 and is deliberately separate: an engine that could only be woken by a timer would make every trigger a poll.',
    queueRequirement:
      'A durable queue with at-least-once delivery, per-automation ordering, a visibility timeout longer than the slowest action, and a dead-letter queue. At-least-once plus an idempotent handler is the correct pairing; exactly-once is not available and designing for it produces a system that silently drops work when it turns out not to be.',
    idempotencyRequirement:
      'The handler must be idempotent on (automationId, triggerEventId). A redelivered event must produce the *same* run record, not a second one — and the client must be told, so §39’s "AlreadyProcessed renders as a safe completed state rather than an error" has something to render. `AutomationRun.wasDeduplicated` is that field.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} The engine re-derives the owner’s authority at execution time, not at configuration time. A moderator who created a community automation and then lost the role must stop being able to broadcast through it, and the only place that can be enforced is the moment before dispatch. ${NO_CLIENT_EXECUTION}`,
    privacyRequirements: `${PREFERENCES_ARE_AUTHORITATIVE} A run record must not contain the *values* a sensitive condition compared — "your balance condition matched" rather than "your balance is £412.60" — because execution history is a durable log with a longer retention than the data it would quote.`,
    securityRequirements: `${CONDITION_SERVER_SIDE} ${NO_MONEY} The engine must treat the stored rule as untrusted input: it was authored by a client, and a stored action key that no longer exists, or that the owner may no longer use, must fail closed.`,
    retryBehaviour: `Retry per action, not per run, with exponential backoff and jitter — retrying a whole run re-sends the actions that already succeeded. Only network failures and 5xx are retried; a 4xx and a permission denial are terminal. ${DEAD_LETTER}`,
    observability:
      'Per-automation run counts by status, action success and failure rates by action key, queue depth, dead-letter depth, and end-to-end latency from domain event to action dispatch. A correlation id per run, surfaced to the member in run detail (§36) so a support conversation can start from something they can read.',
    caching:
      '',
    blockedBy: 'FRONTEND-PHASE18-GAP-001',
    owner: 'automation-platform',
    priority: 'critical',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationScheduler: {
    id: 'FRONTEND-PHASE18-GAP-003',
    backendStatus: 'partial',
    key: 'automationScheduler',
    domain: 'platform',
    capability:
      'A server-side scheduler — timezone-correct, DST-aware, durable, and the only authority on when a time-based automation runs',
    feature: '§41 Scheduling · §42 Timezone · §43 Conflicts · §12 Reminders',
    triggerKeys: ['event.startingSoon', 'subscription.expiring', 'listing.expiring'],
    actionKeys: ['reminder.schedule'],
    screens: ['/automation/create', '/automation/[id]', '/automation/settings'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency:
      'The scheduler is itself an event source: it emits a `schedule.due` event the engine consumes, rather than dispatching actions directly. Keeping the two apart means a time-based and an event-based automation take the same path through conditions, dispatch, idempotency and history — one execution model rather than two.',
    schedulingRequirement:
      'This gap *is* the scheduling requirement. Three properties the contract must have: **durability** (a restart loses nothing), **timezone correctness** (a stored IANA identifier, never a fixed offset, because an offset is wrong for half the year), and **a stated catch-up policy** (what happens to a 09:00 daily reminder when the scheduler was down until 11:00 — fire late, skip, or coalesce — decided server-side and documented, because a client that guessed would show a different answer on two devices).',
    queueRequirement:
      'Due occurrences enter the same durable queue as event-driven executions. A scheduler that dispatched directly would need its own retry, its own dead-letter and its own idempotency, which is three duplicated mechanisms.',
    idempotencyRequirement:
      'Keyed on (automationId, scheduledOccurrenceAt). A scheduler that fires twice for one occurrence — a restart mid-dispatch, a clock adjustment — must produce one run. This is the single most likely duplicate-notification source in the whole phase, because a timer is retried by infrastructure the automation platform does not control.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} A pause must cancel pending occurrences rather than let them fire (§44), and a delete must cancel them irrevocably — the response carries a cancelled-run count so the UI can say what happened rather than implying it.`,
    privacyRequirements:
      'A schedule reveals a routine. "Every weekday at 07:45" is a commute; a set of them is a pattern of life. Schedules are readable only by the owner and by a manager of the owning scope, and never enter analytics: §52’s vocabulary carries a frequency *kind* and no times.',
    securityRequirements: `${NO_LOCAL_SCHEDULER} The device’s clock is never an input to whether something is due. A member who moves their device clock forward must not thereby trigger their own automation, and must certainly not trigger one that notifies other people.`,
    retryBehaviour:
      'A missed occurrence is retried according to the catch-up policy, not indefinitely. An occurrence more than one interval late is dropped with a record rather than fired — a daily reminder that arrives eleven hours late is worse than one that does not arrive, and history must show it was skipped and why.',
    observability:
      'Scheduler lag (due-at versus dispatched-at), missed-occurrence counts, and a per-timezone breakdown — a bug in DST handling shows up as a one-hour lag spike in one zone twice a year and is otherwise invisible.',
    caching:
      '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'automation-platform',
    priority: 'critical',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationHistory: {
    id: 'FRONTEND-PHASE18-GAP-004',
    backendStatus: 'connected',
    key: 'automationHistory',
    domain: 'platform',
    capability:
      'Durable, paginated execution history with per-condition and per-action outcomes',
    feature: '§36 Execution History · §37 Run Detail · §38 Failure UX · §67 Performance',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation/history', '/automation/run/[runId]', '/automation/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'Written by the engine (GAP-002). Not an independent source.',
    schedulingRequirement: 'None.',
    queueRequirement:
      'Run records are written on the execution path and must not block it: a history store that is down must degrade to a queued write rather than failing the action that already succeeded.',
    idempotencyRequirement:
      'One run record per (automationId, triggerEventId). A redelivered event updates the existing record rather than appending a second, or history becomes a duplicate-delivery log.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} §66: a member must not be able to read another member’s runs by supplying a run id. The route takes no owner parameter for this reason.`,
    privacyRequirements:
      '§36: do not expose internal infrastructure detail to ordinary members. A run record carries a member-facing failure message and a correlation id; it carries no host name, no queue name, no stack trace and no provider payload. It also carries no sensitive condition *values* — see GAP-002. Retention must be finite and stated, because an execution log over a location trigger is a movement history.',
    securityRequirements: `${OWNER_SCOPED} A correlation id must be opaque and must not encode an internal identifier.`,
    retryBehaviour: 'Reads are safe to retry with backoff.',
    observability:
      'History write failures are themselves an alertable condition: a run that happened and was not recorded is a member telling support "it did not fire" and nobody able to say otherwise.',
    caching:
      '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'automation-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationAccess: {
    id: 'FRONTEND-PHASE18-GAP-005',
    backendStatus: 'connected',
    key: 'automationAccess',
    domain: 'platform',
    capability:
      'A server-evaluated capability set for automation — what this member may create, for which scopes, and who they may reach',
    feature: '§45 Ownership · §46 Community Permissions · §47 Organization Permissions · §49 Security',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation', '/automation/create', '/automation/templates', '/automation/settings'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None.',
    schedulingRequirement: 'None.',
    queueRequirement: 'None.',
    idempotencyRequirement: 'None — a capability read is safe.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} This contract is *the* authorization surface, and the rule it must not break is that it is advisory to the client and binding on the server: every write re-checks. A capability set that the write path trusted would be a permission the client could cache past its revocation.`,
    privacyRequirements:
      'A capability set discloses a member’s roles. It is readable only by that member and must not be returned for another subject.',
    securityRequirements:
      '§66: normal members must not be able to create platform-wide automation, and unauthorized organization members must not be able to create organization automation. Both are server rules; the client’s hidden controls are a courtesy, and a courtesy is not a control.',
    retryBehaviour: 'Safe to retry with backoff.',
    observability: 'Denied-write counts by capability — a spike means the client is offering something it should not.',
    caching:
      '',
    owner: 'automation-platform',
    priority: 'critical',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationSimulation: {
    id: 'FRONTEND-PHASE18-GAP-006',
    backendStatus: 'connected',
    key: 'automationSimulation',
    domain: 'platform',
    capability:
      'A server-side dry run — evaluate an automation against real state and report what would happen, performing nothing',
    feature: '§35 Test / Simulation · §34 Preview · §55 Dependency Check',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation/create', '/automation/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency:
      'None, but a good simulation borrows a *real recent* trigger context where one exists — "the last job that matched this search" — which is far more convincing than a synthetic one and requires read access to recent domain events.',
    schedulingRequirement: 'None. A simulation is immediate by definition.',
    queueRequirement: 'None. Synchronous, with a short timeout.',
    idempotencyRequirement: 'None.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} §35: no real financial transaction, no real external message and no irreversible action may occur. The dry run must be enforced at the dispatcher, not by the caller passing a flag — a flag that the dispatcher ignored once is a member’s community receiving a test broadcast.`,
    privacyRequirements:
      'An audience estimate must be a count and a description, never a list of members. §50 and §66: a simulation must not become a way to enumerate who is in a community or who matches a segment. Counts below a small threshold should be suppressed rather than shown precisely, for the same reason analytics suppresses small cohorts.',
    securityRequirements: `${NO_MONEY} ${CONDITION_SERVER_SIDE} The response must state which conditions it could not evaluate rather than defaulting them to matched — a simulation that optimistically matched everything would show a member a success that the real run will not reproduce.`,
    retryBehaviour: 'Safe to retry. Rate-limited with a member-visible cooldown per §38.',
    observability: 'Simulation counts by trigger key, and the ratio of simulations to activations — a template people test and never activate is a template that does not explain itself.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'automation-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRIGGER SOURCES — §8 · §71
  //
  // Each entry records only what is specific to it. The shared finding — that
  // no observable domain-event stream exists — is stated once above and
  // referenced by `eventDependency`.
  // ═══════════════════════════════════════════════════════════════════════════

  eventTriggers: {
    id: 'FRONTEND-PHASE18-GAP-007',
    key: 'eventTriggers',
    domain: 'events',
    capability:
      'Event lifecycle triggers — created, updated, cancelled, starting soon, RSVP confirmed, occurrence changed',
    feature: '§8 Triggers · §11 Calendar Automation · §12 Reminders',
    triggerKeys: [
      'event.created',
      'event.updated',
      'event.cancelled',
      'event.startingSoon',
      'event.rsvpConfirmed',
      'event.occurrenceChanged',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/community-life/event/[id]', '/community-life/occurrence/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    // Checked against the backend on 10 Sep 2026 rather than carried forward.
    // Three of the four claims here were already met; only the last survives.
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} Specifically required: EventCreated, EventUpdated (with changed fields), EventCancelled, EventOccurrenceRescheduled, EventRegistrationConfirmed.`,
    schedulingRequirement:
      '`event.startingSoon` is a scheduled projection, not an event: the platform must derive "one hour before start, in the event’s own timezone" for every event with an automation watching it, and re-derive it when the event moves. An event rescheduled from Friday to Saturday must cancel the Friday reminder — §43’s conflict handling, server-side.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement:
      'Keyed on (automationId, eventId, occurrenceAt). An event updated three times in a minute must not produce three "the event changed" notifications; the engine coalesces within a window and the window is a server decision.',
    authorizationRequirement:
      'The automation owner must still be able to see the event at execution time. An event that becomes private, or a member removed from the organization hosting it, must stop producing notifications.',
    privacyRequirements:
      'An event reminder discloses that the member is interested in that event. Where the automation notifies anybody other than the owner, attendee identity must not be included — §50, and the same rule Phase 16 applied to calendar export.',
    securityRequirements: SERVER_AUTHORITATIVE,
    retryBehaviour: 'Retryable. A reminder that arrives after the event has started is dropped rather than delivered late, with a skipped record.',
    observability: 'Reminder delivery latency against the intended send time, per timezone.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'B12-community-life',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Event Triggers',
  },

  eventReminders: {
    id: 'FRONTEND-PHASE18-GAP-008',
    backendStatus: 'connected',
    key: 'eventReminders',
    domain: 'events',
    capability:
      'Reminder scheduling with an observable state — configured, scheduled, sent, failed, cancelled',
    feature: '§12 Event Reminders · §41 Scheduling',
    triggerKeys: ['event.startingSoon'],
    actionKeys: ['reminder.schedule', 'reminder.cancel'],
    screens: ['/community-life/event/[id]', '/automation/[id]', '/automation/create'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'EventUpdated and EventCancelled, to reschedule or cancel a pending reminder.',
    schedulingRequirement:
      'The offset is computed in the **subject’s** timezone, not the device’s. "One day before" an event at 18:00 `Africa/Lagos` is 18:00 Lagos time the previous day, and stays so if the member travels. Phase 16’s two-pass DST-aware conversion is the reference implementation; the server needs its own.',
    queueRequirement: 'Shared with GAP-003.',
    idempotencyRequirement: 'See the contract. Also required at dispatch: a redelivered due-event must not send twice.',
    authorizationRequirement: 'Self-scoped. A member cannot set a reminder for another member.',
    privacyRequirements:
      'A reminder is a statement that this member intends to attend. It must not be visible to the event’s organizer as an attendance signal unless the member registered, which is a separate act.',
    securityRequirements: `${NO_LOCAL_SCHEDULER} A reminder held only on the device would be lost on reinstall and would not fire if the app were force-quit, so the UI must not claim a device-held reminder is scheduled.`,
    retryBehaviour: 'One retry within a short window. A reminder is time-sensitive and a late one is worse than none: past the event start it is dropped with a skipped record.',
    observability: 'Scheduled-versus-delivered counts and delivery lag, per offset.',
    caching: '',
    partiallyCoveredBy:
      'Phase 16 GAP-004 covers writing a reminder into an *external* calendar. That is a different capability with a different failure mode and is deliberately not conflated with this one.',
    blockedBy: 'FRONTEND-PHASE18-GAP-003',
    owner: 'automation-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Reminders',
  },

  savedSearches: {
    id: 'FRONTEND-PHASE18-GAP-009',
    backendStatus: 'connected',
    key: 'savedSearches',
    domain: 'search',
    capability:
      'Saved searches with server-side evaluation against new content — one implementation shared by jobs, marketplace, housing, providers and events',
    feature: '§30 Saved Search Automation · §18 Jobs · §19 Marketplace · §20 Housing',
    triggerKeys: [
      'savedSearch.newMatch',
      'savedSearch.priceChanged',
      'savedSearch.availabilityChanged',
    ],
    actionKeys: [],
    screens: ['/automation/searches', '/automation/create', '/job', '/marketplace', '/housing'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency:
      'JobPublished, ListingPublished, ListingPriceChanged, HousingPublished, HousingAvailabilityChanged, ProviderPublished, EventPublished. Matching on publication is what makes an alert an alert; a nightly re-query of every saved search is the fallback and is both slower to notify and heavier to run.',
    schedulingRequirement:
      'Instant alerts are event-driven. Daily and weekly alerts need the scheduler (GAP-003) and must respect the member’s digest hour and timezone from B13’s existing preferences rather than introducing a second digest schedule.',
    queueRequirement:
      'Matching is fan-out: one published job may match thousands of saved searches. It must be a queued batch job with backpressure, not synchronous work on the publish path — a publish that waits for automation is a publish that fails when automation is down.',
    idempotencyRequirement:
      'Keyed on (savedSearchId, matchedItemId). A member must be told about a listing **once**, ever, even if it is republished, edited or re-indexed. This is the single most visible correctness property of the feature.',
    authorizationRequirement:
      'Self-scoped. The evaluator must apply the same visibility rules the list route applies: a saved search must never surface an item the member could not have found by searching, which is how a saved search becomes a privacy bypass.',
    privacyRequirements:
      'Saved criteria are personal: a housing search states a budget and a neighbourhood; a job search states a career intention. They are readable only by the member and must never appear in analytics — §52’s vocabulary carries the subject and a criteria *count*, never the criteria.',
    securityRequirements: `${SERVER_AUTHORITATIVE} §18: client-side matching must not be authoritative. The client may highlight "this looks like your saved search" on a list it already fetched; it must never claim a match nobody evaluated.`,
    retryBehaviour: 'Matching is retryable and convergent. Notification dispatch retries per GAP-025.',
    observability: 'Matches per search, alerts suppressed by deduplication, and the ratio of alerts to opens — a saved search that notifies constantly and is never opened is a member about to disable notifications entirely.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'search-platform',
    priority: 'critical',
    recommendedPhase: 'B22 Automation Platform — Saved Searches',
  },

  jobTriggers: {
    id: 'FRONTEND-PHASE18-GAP-010',
    key: 'jobTriggers',
    domain: 'jobs',
    capability:
      'Job lifecycle and application triggers — published, closing soon, application submitted, application status changed, application threshold reached',
    feature: '§18 Job Automation',
    triggerKeys: [
      'savedSearch.newMatch',
      'job.closingSoon',
      'job.applicationSubmitted',
      'job.applicationStatusChanged',
      'job.applicationThreshold',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/job/[id]', '/employer'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} Required: JobPublished, JobClosed, ApplicationSubmitted, ApplicationStatusChanged.`,
    schedulingRequirement: '`job.closingSoon` is a scheduled projection over `closesAt`, in the job’s own timezone.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement: 'One notification per (automationId, jobId, transition). A status that flips back and forth must not produce a stream.',
    authorizationRequirement:
      '§18: an employer automation requires a server-verified employer role on the posting. A candidate may automate only over their own applications.',
    privacyRequirements:
      '§50: an application status is sensitive to the candidate and an application volume is sensitive to the employer. Neither may be disclosed across that line. An automation must not tell an employer which candidates set up alerts, and must not tell a candidate how many others applied.',
    securityRequirements: SERVER_AUTHORITATIVE,
    retryBehaviour: 'Retryable.',
    observability: 'Alert volume per employer, to catch a threshold automation firing per application.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'jobs-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Marketplace & Jobs Triggers',
  },

  marketplaceTriggers: {
    id: 'FRONTEND-PHASE18-GAP-011',
    key: 'marketplaceTriggers',
    domain: 'marketplace',
    capability:
      'Marketplace triggers — listing published, price changed, offer received, reservation created or ending, listing expiring or sold, inquiry received',
    feature: '§19 Marketplace Automation',
    triggerKeys: [
      'savedSearch.newMatch',
      'savedSearch.priceChanged',
      'listing.expiring',
      'listing.offerReceived',
      'listing.reservationEnding',
      'listing.inquiryReceived',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/marketplace/[id]', '/automation/searches'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} Required: ListingPublished, ListingPriceChanged (with old and new), ListingStatusChanged, OfferReceived, ReservationCreated, ReservationEnding.`,
    schedulingRequirement: '`listing.expiring` and `listing.reservationEnding` are scheduled projections over real dates.',
    queueRequirement: 'Shared with GAP-002. Price-change fan-out is the same shape as saved-search fan-out and should share the batch mechanism.',
    idempotencyRequirement:
      'Price changes keyed on (automationId, listingId, newPrice). A seller adjusting a price three times must not produce three alerts to every watcher; the engine coalesces within a window.',
    authorizationRequirement: 'Seller triggers require a server-verified seller role on the listing.',
    privacyRequirements:
      'An offer amount and an inquirer’s identity are private to the seller and the party involved. §19: a buyer’s watch on a listing must not be visible to the seller — it is a purchase intention.',
    securityRequirements: `${NO_MONEY} §19 forbids automatic financial action: no automation may accept an offer, place a reservation or complete a purchase. The catalogue has no such action and the adapter exports no function that could.`,
    retryBehaviour: 'Retryable.',
    observability: 'Alerts per listing, to catch a price-oscillation loop.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'marketplace-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Marketplace & Jobs Triggers',
  },

  housingTriggers: {
    id: 'FRONTEND-PHASE18-GAP-012',
    key: 'housingTriggers',
    domain: 'housing',
    capability:
      'Housing triggers — listing published, price changed, availability changed, listing expiring, inquiry received, application status changed, viewing reminder',
    feature: '§20 Housing Automation',
    triggerKeys: [
      'savedSearch.newMatch',
      'savedSearch.priceChanged',
      'savedSearch.availabilityChanged',
      'housing.inquiryReceived',
      'housing.applicationStatusChanged',
      'housing.viewingReminder',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/housing/[id]', '/housing/host', '/automation/searches'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} Required: HousingPublished, HousingPriceChanged, HousingAvailabilityChanged, HousingInquiryReceived, HousingApplicationStatusChanged, ViewingScheduled.`,
    schedulingRequirement: 'Viewing reminders and expiry warnings need the scheduler, in the property’s local timezone.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement: 'As GAP-009 and GAP-011: one alert per member per item, ever.',
    authorizationRequirement: 'Landlord triggers require a server-verified role on the listing.',
    privacyRequirements:
      '§20 is emphatic and this is the most sensitive listing domain in the platform: a housing application discloses financial circumstances, household composition and immigration situation. **No automation may disclose applicant detail to anybody but the parties.** A landlord automation must be able to say "you have a new inquiry" and must not be able to broadcast who it was from. A tenant’s saved housing search must never be visible to landlords.',
    securityRequirements: `${SERVER_AUTHORITATIVE} A housing automation must not become a way to enumerate applicants or to profile who is looking in a neighbourhood.`,
    retryBehaviour: 'Retryable.',
    observability: 'As GAP-011.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'housing-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Housing Triggers',
  },

  communityTriggers: {
    id: 'FRONTEND-PHASE18-GAP-013',
    // ── Connected, 21 Oct 2026 (backend 3df412e) ─────────────────────────────
    //
    // Was 'partial': "CommunityMilestoneReached is the one with nothing behind
    // it", and after that shipped (11 Sep) `memberJoined` and `eventCreated`
    // were the two the catalogue reported unavailable. Both are wired now:
    // CommunityProgramme publishes `CommunityMemberJoinedIntegrationEvent` once
    // per transition into membership, and an event can be posted in a
    // community at creation (`communityId` on `POST /community-life/events`),
    // firing `community.eventCreated` on its first publication. All five
    // triggers are `isAvailable: true` in the served catalogue.
    backendStatus: 'connected',
    key: 'communityTriggers',
    domain: 'community',
    capability:
      'Community triggers — member joined, announcement published, update published, milestone reached, event created',
    feature: '§13 Community Automation · §14 Multi-Community · §46 Community Permissions',
    triggerKeys: [
      'community.memberJoined',
      'community.announcementPublished',
      'community.updatePublished',
      'community.milestoneReached',
      'community.eventCreated',
    ],
    actionKeys: ['notify.community'],
    screens: ['/automation/create', '/community/[slug]', '/automation'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency:
      'Served (21 Oct 2026): CommunityMemberJoined, CommunityAnnouncementPublished, CommunityUpdatePublished, CommunityMilestoneReached, and EventPublished carrying the community an event was posted in. Previously: "' +
      `${NO_DOMAIN_EVENT_STREAM} Required: CommunityMemberJoined, CommunityAnnouncementPublished, CommunityUpdatePublished, CommunityMilestoneReached, CommunityEventCreated."`,
    schedulingRequirement:
      'A community-wide send must respect **each recipient’s** quiet hours and timezone, not the sender’s. A moderator in London scheduling an 09:00 announcement to a community spread across four timezones is the case that makes this non-trivial, and it must be decided server-side per recipient.',
    queueRequirement:
      'Fan-out to a whole community must be batched with backpressure and a per-community rate limit. An unbounded fan-out is how one automation becomes a platform incident.',
    idempotencyRequirement: 'Keyed on (automationId, communityEventId, recipientId). A retried batch must not re-notify the members it already reached.',
    authorizationRequirement: `§46: a normal member must not be able to create broad community-wide automation. The capability is a server-verified moderator, ambassador or owner role, re-checked **at execution time** — a moderator who created a broadcast automation and then lost the role must stop broadcasting. ${SERVER_AUTHORITATIVE}`,
    privacyRequirements:
      '§13: do not notify ineligible members. Eligibility is a server decision over membership state and preferences. The audience preview is a count and a description; it is never a member list, because a moderator being able to enumerate their community through an automation preview is a disclosure the community never agreed to.',
    securityRequirements: `${SERVER_AUTHORITATIVE} The community id in a request is a name, not a capability.`,
    retryBehaviour: 'Retry per recipient batch, never per whole fan-out.',
    observability: 'Per-community automation send volume and opt-out rate. A rising opt-out rate after an automation is activated is the signal that matters.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-005',
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Community Triggers',
  },

  organizationTriggers: {
    id: 'FRONTEND-PHASE18-GAP-014',
    // OrganizationMemberJoined is consumed today, EventCreated covers organization events,
    // and ProgrammeMembershipStatusChanged covers the renewal case.
    // OrganizationRegistrationReceived is the gap. Recorded as 'none'.
    backendStatus: 'partial',
    key: 'organizationTriggers',
    domain: 'organizations',
    capability:
      'Organization triggers — new member, event created, registration received, announcement, membership renewal due, milestone',
    feature: '§22 Organization Automation · §47 Organization Permissions',
    triggerKeys: [
      'organization.memberJoined',
      'organization.registrationReceived',
      'community.announcementPublished',
      'organization.membershipRenewalDue',
    ],
    actionKeys: ['notify.organization'],
    screens: ['/automation/create', '/community-life/org/[id]', '/automation'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM}`,
    schedulingRequirement: 'Membership renewal reminders are scheduled against a real renewal date, in the member’s timezone.',
    queueRequirement: 'Shared with GAP-013’s fan-out mechanism.',
    idempotencyRequirement: 'Keyed on (automationId, organizationEventId, recipientId).',
    authorizationRequirement:
      '§47: ordinary members must not automate organization-wide actions. Owner, admin, event organizer, moderator and staff are distinguishable roles and the capability set names which of them may do what, re-checked at execution.',
    privacyRequirements: 'Member lists are never returned to an automation surface. Counts and descriptions only.',
    securityRequirements: SERVER_AUTHORITATIVE,
    retryBehaviour: 'As GAP-013.',
    observability: 'As GAP-013.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-005',
    owner: 'community-platform',
    priority: 'medium',
    recommendedPhase: 'B22 Automation Platform — Community Triggers',
  },

  guideTriggers: {
    id: 'FRONTEND-PHASE18-GAP-015',
    key: 'guideTriggers',
    domain: 'guides',
    capability: 'Guide triggers — published, updated, saved-guide changed, country guide changed, milestone reached',
    feature: '§17 Guide Automation',
    triggerKeys: ['guide.published', 'guide.savedChanged', 'guide.milestoneReached'],
    actionKeys: [],
    screens: ['/automation/create', '/guide/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM}`,
    schedulingRequirement: 'None; event-driven.',
    queueRequirement: 'Fan-out to savers of a guide. Shared mechanism.',
    idempotencyRequirement: 'One notification per (automationId, guideId, revisionId). A guide edited five times in an hour produces one.',
    authorizationRequirement: 'Reader triggers are self-scoped. Author triggers require ownership of the guide.',
    privacyRequirements:
      'Which guides a member saved is a strong signal — a set of visa and asylum guides is an immigration situation. It is never disclosed to the guide’s author, and an author-side milestone notification carries counts only.',
    securityRequirements: SERVER_AUTHORITATIVE,
    retryBehaviour: 'Retryable.',
    observability: 'Notification volume per guide edit, to catch a fix-typo storm.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'directory-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Content Triggers',
  },

  creatorTriggers: {
    id: 'FRONTEND-PHASE18-GAP-017',
    // CreatorMilestoneCompleted and CreatorReferralQualified are consumed today, and
    // RewardPointsGranted covers the reward case. ChallengeCompleted is the one that is
    // missing. Recorded as 'none' when three of four events exist.
    backendStatus: 'partial',
    key: 'creatorTriggers',
    domain: 'creator',
    capability:
      'Creator triggers — milestone reached, reward available, referral completed, content published, performance threshold, challenge completed',
    feature: '§23 Creator Automation · §26 Creator Rewards',
    triggerKeys: [
      'creator.milestoneReached',
      'creator.rewardAvailable',
      'creator.referralCompleted',
      'creator.performanceThreshold',
      'creator.challengeCompleted',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/creator', '/creator/analytics'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM}`,
    schedulingRequirement: 'None; event-driven. Performance thresholds are GAP-022.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement:
      'One notification per (automationId, milestoneId). A milestone crossed, uncrossed by a deletion and recrossed must not pay out attention twice — and must certainly never trigger a second reward, which is why the reward itself stays behind Phase 7’s claim flow.',
    authorizationRequirement: 'Self-scoped and gated on a server-verified creator status.',
    privacyRequirements:
      '§23: do not expose financial information without authorization. A creator’s earnings figures must not appear in a notification body that could be read on a lock screen — the notification says a reward is available and the amount is behind authentication.',
    securityRequirements: `${NO_MONEY} No automation may claim a reward, convert points or credit a wallet. Phase 7’s claim flow remains the only path and it is member-initiated.`,
    retryBehaviour: 'Retryable.',
    observability: 'Milestone notification volume against claim rate.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'creator-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Creator & Money Triggers',
  },

  financialTriggers: {
    id: 'FRONTEND-PHASE18-GAP-018',
    key: 'financialTriggers',
    domain: 'wallet',
    capability:
      'Wallet and payment triggers — payment completed, payment failed, refund completed, deposit, withdrawal, donation, contribution, reward credited',
    feature: '§24 Wallet & Payment Automation · §48 Financial Permissions',
    triggerKeys: [
      'payment.completed',
      'payment.failed',
      'payment.refunded',
      'giving.donationCompleted',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/wallet', '/automation'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency:
      'PaymentCompleted, PaymentFailed, RefundCompleted, WalletCredited, WalletDebited, DonationCompleted, ContributionRecorded. These almost certainly exist inside B15 as internal state transitions; what is missing is their **exposure** with ordering and idempotency guarantees. A financial event stream is not an ordinary one — it must not be lossy and must not reorder, because "payment failed" arriving after "payment completed" for one intent is a member told their money did not go through when it did.',
    schedulingRequirement: 'None; event-driven. Subscription expiry warnings are GAP-019.',
    queueRequirement: 'Ordered per member per payment intent. Shared queue, partitioned key.',
    idempotencyRequirement:
      'Keyed on (automationId, financialEventId). §39 names payment notification explicitly, and the backend’s `AlreadyProcessed` must render as a completed state rather than an error — `AutomationRun.wasDeduplicated` carries it.',
    authorizationRequirement: `§48: financial automations require stronger authorization. The capability is a separate field — canUseFinancialTriggers — so it can be granted independently, and it is re-checked at execution. ${SERVER_AUTHORITATIVE}`,
    privacyRequirements:
      '§50: financial privacy. An amount must not appear in a push notification body — a lock screen is a public surface. The notification says a payment completed and the amount is behind authentication. Analytics carries no amount, no currency and no band.',
    securityRequirements: `${NO_MONEY} This is the gap where that rule matters most, and it is enforced three ways: no action in the catalogue moves money, the AutomationAction type has no amount or destination field, and automation-gap-api.ts exports no function that could create a payment — asserted structurally by the boundary test. §24: the backend and the payment provider remain authoritative and the frontend implements no settlement.`,
    retryBehaviour:
      'Notification dispatch is retryable. **The financial event itself is never replayed by automation** — an automation platform that could re-emit a payment event would be a platform that could cause a duplicate reconciliation.',
    observability: 'Delivery latency for payment-failure notifications specifically: it is the one a member needs quickly.',
    caching: '',
    partiallyCoveredBy:
      'B15 for the payments themselves and B13 for the existing billing notification templates. The member-authored rule layer is what is missing.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Creator & Money Triggers',
  },

  monetizationTriggers: {
    id: 'FRONTEND-PHASE18-GAP-019',
    key: 'monetizationTriggers',
    domain: 'monetization',
    capability:
      'Expiry and renewal triggers — subscription expiring or renewed, featured placement ending, boost ending, plan ending',
    feature: '§25 Monetization Automation',
    triggerKeys: [
      'subscription.expiring',
      'placement.ending',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/monetization', '/wallet/placements/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'SubscriptionExpiring, SubscriptionRenewed, PlacementEnding, BoostEnding.',
    schedulingRequirement:
      'A scheduled projection over an end date with the member’s chosen lead time, in the member’s timezone. Re-derived when the subscription changes — a renewal must cancel the pending "expiring" reminder or the member is warned about something that already resolved.',
    queueRequirement: 'Shared with GAP-003.',
    idempotencyRequirement: 'One warning per (automationId, subscriptionId, periodEnd). A member must not be warned twice about one period.',
    authorizationRequirement: 'Self-scoped, over the member’s own subscriptions and placements.',
    privacyRequirements: 'Plan names and amounts stay out of notification bodies for the same lock-screen reason as GAP-018.',
    securityRequirements: `${NO_MONEY} §25: no automatic charge, no automatic renewal.`,
    retryBehaviour: 'Retryable; a warning delivered after expiry is dropped with a skipped record rather than delivered pointlessly.',
    observability: 'Lead-time distribution against renewal rate.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-003',
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Creator & Money Triggers',
  },

  providerTriggers: {
    id: 'FRONTEND-PHASE18-GAP-020',
    key: 'providerTriggers',
    domain: 'providers',
    capability:
      'Provider triggers — new lead, new inquiry, new review, featured placement starting or ending, performance threshold',
    feature: '§21 Provider Automation',
    triggerKeys: [
      'provider.leadReceived',
      'provider.reviewReceived',
      'provider.featuredEnding',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/provider/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM}`,
    schedulingRequirement: 'Featured start and end are scheduled projections over real dates.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement: 'One notification per (automationId, leadId).',
    authorizationRequirement: 'Server-verified provider role, re-checked at execution.',
    privacyRequirements:
      '§21: do not expose private customer data. A lead notification carries that a lead arrived, not who from and not what they said. A review notification carries the rating and links to the review; it does not quote it into a push body, because a review can contain anything.',
    securityRequirements: SERVER_AUTHORITATIVE,
    retryBehaviour: 'Retryable.',
    observability: 'Lead-notification latency — this one is commercially time-sensitive.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'directory-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Content Triggers',
  },

  messagingTriggers: {
    id: 'FRONTEND-PHASE18-GAP-021',
    key: 'messagingTriggers',
    domain: 'messaging',
    capability: 'Messaging triggers — message received, new conversation, conversation inactive, unread reminder',
    feature: '§29 Messaging Automation',
    triggerKeys: [
      'conversation.inactive',
      'conversation.unreadReminder',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/conversation'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'MessageReceived and ConversationCreated, which B13.2 must already have internally for its own notifications.',
    schedulingRequirement: '`conversation.inactive` is a scheduled projection over last-activity time, in the member’s timezone and respecting quiet hours.',
    queueRequirement: 'Shared with GAP-003.',
    idempotencyRequirement: 'One reminder per conversation per period. A nagging reminder is worse than no reminder.',
    authorizationRequirement: 'Self-scoped only. There is no automation over another member’s conversations, at any permission level.',
    privacyRequirements:
      '§29 and §50: message content must not be exposed unnecessarily. No trigger, condition or action in this phase reads message *content* — only counts and timestamps. A condition on message text would be a content filter over private conversations and is deliberately absent from the condition catalogue.',
    securityRequirements: 'No send capability exists. This is structural, not a policy.',
    retryBehaviour: 'Retryable, with a hard cap on reminder frequency per conversation.',
    observability: 'Reminder-to-reply rate; a low one means the reminder is noise.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-003',
    owner: 'B13-notifications',
    priority: 'low',
    recommendedPhase: 'B24 Automation Platform — Engagement Triggers',
  },

  analyticsThresholds: {
    id: 'FRONTEND-PHASE18-GAP-022',
    key: 'analyticsThresholds',
    domain: 'analytics',
    capability:
      'Server-side analytics threshold evaluation — views above X, engagement dropping, applications above X, attendance reaching a target',
    feature: '§27 Analytics-Driven Automation · §52 Automation Analytics',
    triggerKeys: ['creator.performanceThreshold', ],
    actionKeys: [],
    screens: ['/automation/create', '/analytics', '/creator/analytics'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None. This is evaluation on a schedule, not an event — which is why it is its own gap rather than part of GAP-002.',
    schedulingRequirement:
      'Hourly or daily evaluation, server-side, over authoritative aggregates. The frequency must be stated to the member: "checked once a day" sets a very different expectation from "as it happens", and an automation that silently checks daily while implying immediacy is the kind of thing that gets found out during an incident.',
    queueRequirement: 'Batch evaluation across all threshold automations, then dispatch through the shared queue.',
    idempotencyRequirement:
      'Hysteresis is the idempotency here: once an automation has alerted on a threshold, it must not alert again until the metric has returned below it by a margin. Without it a metric hovering at the boundary notifies every evaluation cycle.',
    authorizationRequirement:
      '§66: a member must not be able to configure a threshold over analytics they cannot read. The capability check is Phase 15’s, re-used, not a second one.',
    privacyRequirements:
      '§52: do not track sensitive rule contents unnecessarily. The automation analytics vocabulary carries the metric *key* and never its value, matching Phase 15’s own rule that an analytics event must not carry an analytics value.',
    securityRequirements: `${CONDITION_SERVER_SIDE} An analytics threshold is the canonical sensitive condition: it is a number the client could compute and must not.`,
    retryBehaviour: 'Evaluation is idempotent and retryable. A missed cycle is skipped rather than doubled.',
    observability: 'Alerts per automation per week — a threshold automation alerting daily is a badly chosen threshold and the member should be told.',
    caching: '',
    partiallyCoveredBy: 'Phase 15’s analytics gaps for the underlying figures.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B24 Automation Platform — Engagement Triggers',
  },

  locationTriggers: {
    id: 'FRONTEND-PHASE18-GAP-023',
    // ── Connected, 21 Oct 2026 (backend 3df412e), and not as declared ────────
    //
    // This entry asked for a geofence registry fed by background location, and
    // recorded the decision not to take background location. That decision
    // stands, and the trigger shipped without it: an opt-in, foreground-only
    // presence report (`/location/me/presence`) that keeps only the last area,
    // and a residence contract (`CountryResidenceStarted`) for moving country.
    // `automations.location` is granted over the member's own scope and both
    // triggers are `isAvailable: true`. The geofence contract below was replaced
    // by the presence routes rather than built; it is quoted, not deleted.
    backendStatus: 'connected',
    key: 'locationTriggers',
    domain: 'location',
    capability:
      'Location-based triggers — entering a neighbourhood, arriving in a country, being near a saved place',
    feature: '§15 Location-Based Automation · §50 Privacy',
    triggerKeys: ['location.enteredArea', 'location.countryChanged', ],
    actionKeys: [],
    screens: ['/automation/create', '/automation/settings'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    // Declared until 21 Oct 2026, and replaced rather than built:
    //   POST /automations/geofences: centre, radiusMetres, label, dwellSeconds;
    //   permission automations.location.write; idempotent on (member, centre, radius).
    requiredContracts: [],
    eventDependency: 'Served (21 Oct 2026): MemberEnteredArea and CountryResidenceStarted. Previously: GeofenceEntered / GeofenceExited, which would originate on the device and be reported to the server — the only trigger family in this register that is device-sourced, and the reason it is treated separately.',
    schedulingRequirement: 'None. Geofences are event-driven at the OS level.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement: 'Dwell time and a re-entry cooldown are the idempotency: a member walking in and out of a radius must not produce a stream of notifications.',
    authorizationRequirement: 'Self-scoped only. **No member may create a location automation that acts on another member’s location**, at any permission level, and there is no contract above that could express one.',
    privacyRequirements:
      '**This is the gap with the strongest privacy requirement in the register and it must not ship without a privacy review.** §15: continuous location monitoring requires explicit permission and privacy review; §50: location privacy must be respected. A geofence registry is a list of the places somebody cares about, and a location event stream is a movement history. Requirements: explicit, separate, revocable consent naming background tracking in those words; the coarsest resolution that works; the shortest retention that works; no third-party disclosure; no use in recommendations, analytics or advertising; deletion on disconnect; and — because Diaspora’s members include people whose location can put them at risk — a clear statement of who can compel disclosure.',
    securityRequirements:
      'A location event must not be accepted from an unauthenticated client, and a client-supplied location must not be trusted for anything with a consequence beyond the member’s own notification. §9: a sensitive condition must not be decided by client data, and a spoofed location is the easiest such spoof.',
    retryBehaviour: 'A location trigger is time-critical and stale delivery is worthless: past a short window it is dropped with a skipped record.',
    observability: 'Consent grant and revoke rates, and battery impact — an always-on geofence that drains a battery is a feature members uninstall the app over.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'location-platform',
    priority: 'low',
    recommendedPhase: 'B24 Automation Platform — Engagement Triggers (privacy review first)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS AND CROSS-CUTTING — §10 · §13 · §28 · §39 · §40 · §51 · §52 · §73
  // ═══════════════════════════════════════════════════════════════════════════

  automationNotificationDispatch: {
    id: 'FRONTEND-PHASE18-GAP-024',
    backendStatus: 'partial',
    key: 'automationNotificationDispatch',
    domain: 'notifications',
    capability:
      'Dispatching a notification on an automation’s behalf through B13, with automation-owned categories and templates',
    feature: '§10 Actions · §28 Notification Automation · §53 Preferences · §73 Notification Matrix',
    triggerKeys: [],
    actionKeys: ['notify.self', 'notify.community', 'notify.organization', 'notify.followers'],
    screens: ['/automation/create', '/settings/notifications', '/automation/settings'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None. This is the dispatch side.',
    schedulingRequirement:
      'Quiet hours and digest windows are B13’s and are applied at dispatch, per recipient, in the recipient’s own timezone. The automation platform must not pre-compute a send time in the sender’s timezone.',
    queueRequirement: 'B13’s existing delivery queue. This adds a producer, not a queue.',
    idempotencyRequirement: 'See the contract. Also: a run retried after a partial dispatch must not re-notify the recipients already reached.',
    authorizationRequirement:
      '§49: the recipient set is never trusted from the client. The automation carries a *scope*; the server derives recipients. A dispatch naming explicit recipient ids must be refused, because that is the shape a mass-messaging abuse would take.',
    privacyRequirements: `${PREFERENCES_ARE_AUTHORITATIVE} An automation must not be able to set a notification's priority high enough to invoke B13's critical override — that path is for suspensions and security events, and a member-authored rule that could reach it would make quiet hours meaningless.`,
    securityRequirements:
      'The dispatch route must not be reachable from a client under any credential. A member-callable dispatch endpoint is a spam cannon with an audit trail.',
    retryBehaviour: `Retryable with the idempotency key on 5xx and network failure only. ${DEAD_LETTER}`,
    observability:
      'Accepted-versus-suppressed ratio per automation. A high suppression rate is not a fault — it is preferences working — but it should be visible to the member as "this ran, and your settings meant nothing was sent", which is what `AutomationActionOutcome.suppressionReason` renders.',
    caching: '',
    partiallyCoveredBy: 'B13 — the majority of this capability exists and is used unchanged.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'B13-notifications',
    priority: 'critical',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationCalendarWrite: {
    id: 'FRONTEND-PHASE18-GAP-025',
    key: 'automationCalendarWrite',
    domain: 'events',
    capability:
      'Writing, updating and removing a calendar entry as an automation action, unattended and server-side',
    feature: '§11 Calendar Automations · §54 Integration Dependencies',
    triggerKeys: [],
    actionKeys: ['calendar.addEvent', 'calendar.updateEvent', 'calendar.removeEvent'],
    screens: ['/automation/create', '/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'EventUpdated and EventCancelled, to keep a written entry correct.',
    schedulingRequirement: 'None directly; the automation’s own schedule governs.',
    queueRequirement: 'Shared with GAP-002.',
    idempotencyRequirement: 'See the contract.',
    authorizationRequirement: 'The owner’s connection must still be valid at execution time. An expired grant must produce a NEEDS_ATTENTION automation, not a silent failure.',
    privacyRequirements:
      'Phase 16’s rule carries over unchanged: attendee lists are not exported. An unattended write must not disclose to a third-party calendar provider who else is attending an event, because those attendees never agreed to it.',
    securityRequirements: 'No provider token reaches the device, before or after this. The write is server-side precisely so it does not have to.',
    retryBehaviour: 'Retry only with the idempotency key, only on network failure or 5xx.',
    observability: 'Write success rate per provider, and duplicate-suppression counts.',
    caching: '',
    partiallyCoveredBy: 'FRONTEND-PHASE16-GAP-004 — the proxied calendar write itself.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'integration-platform',
    priority: 'high',
    recommendedPhase: 'B23 Automation Platform — Actions',
  },

  audienceEvaluation: {
    id: 'FRONTEND-PHASE18-GAP-026',
    backendStatus: 'connected',
    key: 'audienceEvaluation',
    domain: 'community',
    capability:
      'Server-side audience evaluation — who an automation would reach, as a count and a description, before it is activated',
    feature: '§13 Community Automation · §34 Preview · §46 Permissions · §50 Privacy',
    triggerKeys: [],
    actionKeys: ['notify.community', 'notify.organization', 'notify.followers'],
    screens: ['/automation/create', '/automation/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None.',
    schedulingRequirement: 'None.',
    queueRequirement: 'None. Synchronous with a short timeout; an estimate that takes ten seconds is not an estimate anybody waits for.',
    idempotencyRequirement: 'None.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} §46 and §47: the caller must already hold the capability to create the automation whose audience they are asking about.`,
    privacyRequirements:
      'A count is a disclosure at small numbers: "3 members match" in a small community identifies people. Counts below a threshold must be suppressed to a band ("fewer than 10") rather than reported exactly, matching the suppression rule Phase 15 applies to small analytics cohorts.',
    securityRequirements: 'Rate-limited. Repeated queries with varying scopes are how an enumeration attack against a segment is built.',
    retryBehaviour: 'Safe to retry.',
    observability: 'Query volume per member — a spike is the enumeration signal.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-005',
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform Foundation',
  },

  automationAudit: {
    id: 'FRONTEND-PHASE18-GAP-027',
    backendStatus: 'connected',
    key: 'automationAudit',
    domain: 'platform',
    capability: 'An audit trail — who created, changed, activated, paused or deleted an automation, and when',
    feature: '§51 Audit Trail · §40 Concurrency',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'Written by the registry (GAP-001) on every mutation.',
    schedulingRequirement: 'None.',
    queueRequirement: 'Audit writes must be on the same transaction as the mutation, or an audit trail has holes exactly where somebody would look.',
    idempotencyRequirement: 'Append-only, one entry per mutation.',
    authorizationRequirement: `${SERVER_AUTHORITATIVE} ${AUDIT_NOT_FABRICATED}`,
    privacyRequirements:
      'An actor label is a display name. Never an email address, never a phone number, never an internal identifier — an audit trail is often the widest-read surface in a shared scope, and a community automation’s audit is readable by every moderator.',
    securityRequirements: 'Append-only and immutable. An editable audit trail is a record of what somebody wanted it to say.',
    retryBehaviour: 'Reads are safe to retry.',
    observability: 'None beyond the log itself.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-001',
    owner: 'automation-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Actions',
  },

  automationTelemetry: {
    // ── Closed. See FRONTEND-PHASE15-GAP-029 (`telemetryIngestion`). ──────────
    //
    // This entry asked for `POST /analytics/events`. The route exists and is
    // called: it is `POST /api/v1/telemetry/events`, the analytics module has
    // named that destination since Phase 7, and it takes the batched
    // `TelemetryBatchRequest { events[] }` shape this entry described.
    // `lib/telemetry-api.ts` posts to it and `app/_layout.tsx` starts the
    // sixty-second flush on sign-in. Verified against the deployment on
    // 10 Sep 2026: **202 Accepted**.
    //
    // **What is still true, and belongs to GAP-029 rather than here.** The
    // server registry accepts seven client-submittable names and this app
    // emits four of them — the automation ones. Every other name across the
    // five client vocabularies is refused *locally*, before the network, as
    // `analytics.ingest.event-unknown`. That refusal is the design: the other
    // names are server-produced facts and §41 forbids a client incrementing
    // one. It is not a missing transport, which is what this entry was about.
    //
    // Marked connected rather than deleted: the register is a historical
    // record, and it should show that four entries named one dependency and
    // only one of them was re-read.
    backendStatus: 'connected',
    id: 'FRONTEND-PHASE18-GAP-028',
    key: 'automationTelemetry',
    domain: 'analytics',
    capability: 'Ingestion for the automation analytics vocabulary',
    feature: '§52 Automation Analytics · §74 Analytics Matrix',
    triggerKeys: [],
    actionKeys: [],
    screens: ['every automation screen'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None.',
    schedulingRequirement: 'None.',
    queueRequirement: 'The existing client-side buffer. No new one.',
    idempotencyRequirement: 'Batch-level, to make retry safe.',
    authorizationRequirement: 'Self only.',
    privacyRequirements:
      '§52: do not track sensitive rule contents unnecessarily. The allow-list is the enforcement and the sanitiser drops anything not on it before it reaches the buffer — so this is structural, not a convention.',
    securityRequirements: 'No identifiers beyond the authenticated subject. No automation names, which members write freely and sometimes personally.',
    retryBehaviour: 'Buffered and retried on the next flush. Never blocking.',
    observability: 'Buffer depth and drop count.',
    caching: '',
    partiallyCoveredBy: 'CREATOR-GAP-016 / FRONTEND-PHASE15-GAP-029 — the same missing endpoint.',
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B24 Platform Telemetry',
  },

  automationConcurrency: {
    id: 'FRONTEND-PHASE18-GAP-029',
    backendStatus: 'connected',
    key: 'automationConcurrency',
    domain: 'platform',
    capability:
      'Concurrency control — what happens when an automation is edited, paused or deleted while a run is in flight, and across multiple devices',
    feature: '§40 Concurrency · §44 Pause / Resume · §60 Multi-Device',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation/[id]', '/automation/[id]/edit'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None.',
    schedulingRequirement: 'A pause must cancel pending scheduled occurrences (GAP-003), not merely stop new ones being created.',
    queueRequirement: 'A per-automation lock so two triggers arriving together do not produce two concurrent runs of a rule that notifies a community.',
    idempotencyRequirement: 'The lock is the idempotency for concurrent triggers of one automation.',
    authorizationRequirement: SERVER_AUTHORITATIVE,
    privacyRequirements: 'None specific.',
    securityRequirements: 'A lock that can be starved is a denial of service against a member’s own automations; it needs a timeout longer than the slowest action and shorter than a member’s patience.',
    retryBehaviour: 'A 409 is never retried automatically — it means somebody else changed something and a blind retry would overwrite them.',
    observability: 'Lock contention and 409 rates.',
    caching: '',
    blockedBy: 'FRONTEND-PHASE18-GAP-001',
    owner: 'automation-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Actions',
  },

  automationTemplates: {
    id: 'FRONTEND-PHASE18-GAP-030',
    backendStatus: 'connected',
    key: 'automationTemplates',
    domain: 'platform',
    capability:
      'Server-published automation templates, so the catalogue can change without an app release',
    feature: '§31 Templates · §32 Template Architecture',
    triggerKeys: [],
    actionKeys: [],
    screens: ['/automation/templates', '/automation/create'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    eventDependency: 'None.',
    schedulingRequirement: 'None.',
    queueRequirement: 'None.',
    idempotencyRequirement: 'None.',
    authorizationRequirement: '§31: templates are permission-aware. The server filters; the client filters again from its capability set, because a client that rendered whatever it was sent would offer a template that 403s on save.',
    privacyRequirements: 'Template usage counts are aggregate. §52: which templates *this* member used is not published to anybody else.',
    securityRequirements: 'A server-published template is server-supplied configuration and must be validated against the client’s own catalogue before it is rendered, not trusted.',
    retryBehaviour: 'Safe to retry.',
    observability: 'Template views, uses and completion rate.',
    caching: '',
    owner: 'automation-platform',
    priority: 'low',
    recommendedPhase: 'B24 Platform Telemetry',
  },
};

/** Every gap id, for the register document and the tests. */
export const AUTOMATION_GAP_IDS: string[] = Object.values(AUTOMATION_GAPS).map((gap) => gap.id);

/** Look up a gap by its key. Returns `undefined` for a key from another phase. */
export function automationGap(key: string): AutomationGap | undefined {
  return AUTOMATION_GAPS[key];
}

/**
 * The gap ids a set of catalogue keys depends on, de-duplicated and sorted.
 *
 * Used by the preview (§34) and by an automation's detail screen, so the member
 * sees "this depends on two platform capabilities that do not exist yet" with
 * the ids, rather than a vague notice.
 */
export function gapIdsForKeys(gapKeys: readonly (string | null)[]): string[] {
  const ids = new Set<string>();
  for (const key of gapKeys) {
    if (!key) continue;
    const gap = AUTOMATION_GAPS[key];
    if (gap) ids.add(gap.id);
  }
  return Array.from(ids).sort();
}
