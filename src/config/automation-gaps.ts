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
      'The complete Automation Center and Builder are built: list with tabs, filters, search and pagination; create from a template or from scratch; edit; preview; activate; pause; resume; disable; delete. Every lifecycle state in §5 renders. In production the list resolves to an empty state that says the automation service does not exist yet and names this gap — deliberately not an error, because a member who has never had automations and a member whose automations cannot be loaded need different sentences, and this build can only honestly say the first.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `Diaspora.Modules.Automation` serves the registry: `GET /automations`, `GET /automations/{id}`, `POST /automations`, `PATCH /automations/{id}`, `PATCH /automations/{id}/status` and `DELETE /automations/{id}`, with the lifecycle, the transition matrix and a 50-active ceiling all enforced server-side. `hooks/automation.ts` reads them through `lib/automation/certified-client.ts`.',
      'The sentence this entry used to open with — "None. No automation, rule, workflow or trigger contract exists anywhere in the certified surface" — was true when written and had stopped being true without anybody re-reading it. It is kept here rather than deleted because it is the clearest example in this repository of the pattern the remediation exists to remove: a register entry is a claim with a date on it, and 164 of the platform’s 305 declared-missing routes had gone the same way.',
      'B13 stores notification *preferences* server-side, which is the nearest existing shape and is the model this contract followed rather than invented.',
    ],
    missingBackendCapability: [
      'Any endpoint that stores an automation',
      'A lifecycle the server owns, so two devices agree on whether an automation is active',
      'A server-side ceiling on active automations per owner, so a member is told before they hit it',
      'Validation of a rule against the trigger/condition/action catalogue, server-side',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations',
        method: 'GET',
        request:
          'ownerKind?: string; ownerId?: string; status?: string; domain?: string; communityId?: string; search?: string; cursor?: string; limit?: number (default 20, max 100)',
        response:
          '{ data: AutomationDefinition[], meta: { nextCursor: string|null, totalCount: number|null } }',
        authentication: 'Bearer. The subject is the token’s, never a parameter.',
        authorization:
          'Self by default. `ownerKind=community` requires a server-verified moderator or ambassador role on that community; `ownerKind=organization` requires an organization role. A caller naming an owner they have no role on receives 403, not an empty list — an empty list is indistinguishable from "there are none" and teaches the client the wrong thing.',
        idempotency: null,
      },
      {
        endpoint: 'POST /automations',
        method: 'POST',
        request:
          'name; description; scope: AutomationScope; trigger: {key, parameters}; conditions[]; actions[]; schedule?; source; templateId?; status: "DRAFT"|"ACTIVE"',
        response: '{ data: AutomationDefinition } — with the server’s id, support status and gapIds',
        authentication: 'Bearer.',
        authorization:
          'The server re-derives what this member may create from its own capability set. A client that sends `ownerKind: "platform"` must receive 403 regardless of what the UI allowed. §49.',
        permission: 'automations.write',
        idempotency:
          'Mandatory. `Idempotency-Key` per creation attempt, reusing `lib/idempotency.ts` with operation `automation` and the draft’s client-side scope as subject. Without it a retry after a timeout gives the member two identical job alerts, and they will receive every notification twice with no obvious cause.',
      },
      {
        endpoint: 'PATCH /automations/{id}',
        method: 'PATCH',
        request: 'Partial<AutomationDefinition> — send only what changed. Includes `status` transitions.',
        response: '{ data: AutomationDefinition }',
        authentication: 'Bearer.',
        authorization: 'Owner or a server-verified manager of the owning scope.',
        permission: 'automations.write',
        idempotency:
          'Naturally idempotent as a last-writer-wins assignment. §40: an edit while a run is in flight must not mutate that run — the running execution uses the definition version it started with, and the response carries `updatedAt` so the client can detect a concurrent change from another device.',
      },
      {
        endpoint: 'DELETE /automations/{id}',
        method: 'DELETE',
        request: 'None.',
        response: '{ data: { id, deleted: true, cancelledRuns: number } }',
        authentication: 'Bearer.',
        authorization: 'Owner or manager.',
        idempotency:
          'Idempotent: deleting an already-deleted automation returns 200 with the same body, not 404. §40 requires the UI never be left showing an automation that is gone, and a 404 on the retry is exactly how it gets left there.',
      },
    ],
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
      'Query key `["automations", userId, scope, status, filters]` per §68, staleTime 30 seconds. Short because a member changes an automation and immediately looks at the list, and a stale "Paused" after resuming is the most confusing possible state.',
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
      'The complete execution UX is built and is the reason the domain model separates a definition from a run: history, run detail with per-condition and per-action outcomes, every failure kind in §38 with its recovery guidance, partial completion, skipped-by-condition, suppressed-by-preference and deduplicated-by-idempotency. In production no run record can exist, because the client has no code path that constructs one — the history screen says so and names this gap rather than showing an empty list that would read as "your automations have never fired".',
    coverage: 'none',
    existingBackendCapability: [
      'PARTLY RESOLVED (Remediation Wave C-02). The engine exists: `AutomationEventConsumer`, `AutomationActionDispatcher`, `AutomationSchedulerWorker` and an occurrence store with dead-lettering. `POST /automations/{id}/run` runs a manual automation and `POST /automations/simulate` dry-runs one, both consumed by `hooks/automation.ts`.',
      'What remains open is the *trigger* half, not the engine half: the thirteen trigger-context routes are still absent, and `GET /automations/catalog` reports five of its 49 triggers unavailable — the two `location.*` and three `community.*`. An automation whose trigger nothing observes is stored, validated and never fired, which the response’s `support` and `gapIds` fields state honestly.',
    ],
    missingBackendCapability: [
      'An event consumer with at-least-once delivery and an idempotent handler',
      'A condition evaluator with access to the authoritative state each condition names',
      'An action dispatcher that calls B13, the calendar proxy and the rest through their real contracts',
      'A run recorder producing the execution history §36 describes',
      'A per-automation concurrency lock (§40)',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /automations/{id}/run',
        method: 'POST',
        request: 'reason: "manual" — the only reason a client may supply',
        response: '{ data: AutomationRun } — accepted, status RUNNING. The outcome is read back.',
        authentication: 'Bearer.',
        authorization:
          'Owner or manager, and only for an automation whose trigger delivery is `manual`. A client must not be able to force an event-driven automation to fire, because "run my community announcement now" is a broadcast with no event behind it.',
        permission: 'automations.execute',
        idempotency:
          'Mandatory. A manual run inside a short window returns the running run rather than starting a second — §40’s concurrency requirement, and the difference between one announcement and two.',
      },
      {
        endpoint: 'GET /automations/{id}/runs/{runId}',
        method: 'GET',
        request: 'None.',
        response: '{ data: AutomationRun } — with conditionOutcomes[] and actionOutcomes[]',
        authentication: 'Bearer.',
        authorization: 'Owner or manager. §66: a member must not read another member’s run.',
        idempotency: null,
      },
    ],
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
      'Runs are append-only. Query key `["automations", userId, "runs", automationId, cursor]`, staleTime 15 seconds while a run is RUNNING and 5 minutes once terminal.',
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
    triggerKeys: ['schedule.time', 'event.startingSoon', 'subscription.expiring', 'listing.expiring'],
    actionKeys: ['reminder.schedule'],
    screens: ['/automation/create', '/automation/[id]', '/automation/settings'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The complete scheduling UX is built: once, daily, weekly, monthly, custom and event-relative; start and end dates; a maximum-execution limit; and all five §42 timezone modes with the resolved IANA zone shown next to the time so a member never has to guess which clock a schedule is in. §43’s conflicts are all detected and rendered — past date, end before start, invalid day-of-month, unsupported frequency, a device timezone that has changed since the automation was created, and a DST transition that makes a chosen wall-clock time ambiguous or non-existent. **The client computes no authoritative `nextRunAt`.** It renders the server’s, and where there is none it says "the platform cannot schedule this yet" rather than showing a time it invented.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `AutomationSchedulerWorker` and `AutomationOccurrence` are the durable scheduler, with a subject horizon, missed-occurrence counting and dead-lettering. `GET /automations/{id}/schedule` reports `nextRunAt`, the resolved zone, the upcoming occurrences, the missed count and any daylight-saving warning.',
      'The client still computes no authoritative `nextRunAt` and that has not changed: §41 forbids it, `describeNextOccurrence()` is still a preview with `isAuthoritative: false`, and the real one now comes from this route rather than from nowhere.',
      'Phase 16’s `lib/integrations/calendar.ts` remains the only wall-clock-to-instant conversion on the client, and Wave C-02 gave it a second caller — `EventReminderButton` resolves the event’s start through it so that a reminder and a calendar entry for the same event cannot drift an hour apart across a DST boundary.',
    ],
    missingBackendCapability: [
      'A durable timer store surviving process restarts',
      'Timezone-correct next-occurrence computation against a maintained IANA database',
      'DST-transition handling with a stated rule for skipped and repeated wall-clock times',
      'A catch-up policy for occurrences missed while the scheduler was down',
      'Cancellation of a pending occurrence when an automation is paused or deleted (§44)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/{id}/schedule',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { nextRunAt: string|null, nextRunLocal: string, timeZone: string, upcoming: string[], missedCount: number, isSchedulable: boolean, reason: string|null } }',
        authentication: 'Bearer.',
        authorization: 'Owner or manager.',
        idempotency: null,
      },
      {
        endpoint: 'PUT /automations/{id}/schedule',
        method: 'PUT',
        request:
          'frequency; timeZoneId (IANA, required — never an offset); hour; minute; daysOfWeek[]; dayOfMonth; startsAt; endsAt; maxExecutions; eventOffset',
        response: '{ data: { nextRunAt, warnings: string[] } }',
        authentication: 'Bearer.',
        authorization: 'Owner or manager.',
        permission: 'automations.write',
        idempotency: 'Naturally idempotent — a schedule write is an assignment.',
      },
    ],
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
      'Query key `["automations", userId, "schedule", automationId]`, staleTime 60 seconds. `nextRunAt` is rendered as a relative time recomputed on the client from the server’s absolute instant, which is display arithmetic and not scheduling.',
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
      'History and run detail are complete: cursor-paginated and virtualized so a member with thousands of runs scrolls rather than waits (§67), filterable by automation and by status, with §37’s full run detail — trigger, each condition and whether it matched and who evaluated it, each action and its outcome, duration, correlation id, and for a failure the kind and the recovery guidance. Every run renders whether it was simulated. In production the screen states that no execution history exists because no engine has run, which is the honest reading of an empty list.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `GET /automations/runs` and `GET /automations/{id}/runs/{runId}` serve the history, cursor-paged, with per-condition and per-action outcomes, a failure kind, a recovery hint and a correlation id. The route takes no owner parameter — the subject is the token’s, so a member cannot read another member’s runs by supplying one.',
      '`GET /automations/diagnostics` aggregates the same history: totals by status, failure kinds, success rate, durations, deduplicated redeliveries, dead letters and the five actions that fail most. `successRate` is null rather than 0 or 100 when nothing has settled, because a rate over zero runs is a question with no answer and both available lies are ones a member would act on.',
    ],
    missingBackendCapability: [
      'A run store with cursor pagination',
      'Per-condition and per-action outcome records',
      'A retention policy, and a member-visible statement of it',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/runs',
        method: 'GET',
        request:
          'automationId?: string; status?: string; from?: ISO; to?: ISO; cursor?: string; limit?: number (default 20, max 100)',
        response: '{ data: AutomationRun[], meta: { nextCursor, totalCount } }',
        authentication: 'Bearer.',
        authorization: `Owner or manager. ${OWNER_SCOPED}`,
        idempotency: null,
      },
    ],
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
      'Query key `["automations", userId, "runs", filters, cursor]`. §67: pages are 20, virtualized, and never fetched all at once.',
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
      'Every automation affordance is gated on a server-evaluated `AutomationAccess`, and `lib/automation/access.ts` exports **no function that takes a role, an account state or a subscription tier** — the same shape Phase 13 and Phase 15 established, and the reason §49 is a property of the codebase rather than a review item. A missing capability renders nothing rather than a disabled control, because a greyed-out "Create a community-wide announcement" tells an ordinary member that such a thing exists and invites them to find out who has it. In production the access set resolves to `noAutomationAccess()` — everything hidden — which is the correct failure direction.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 13 registered a server-evaluated `CommunityCapabilities` set as its own gap. If that ships, community-scoped automation authority should extend it rather than duplicate it — two capability sets over one community is two answers to one question.',
      'B15’s `/financial/capabilities` is a real, live example of exactly this shape and is the pattern to copy.',
    ],
    missingBackendCapability: [
      'Any automation capability contract',
      'A per-owner ceiling on active automations',
      'A statement of which triggers and actions this member may use, so the builder can offer a truthful catalogue',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/capabilities',
        method: 'GET',
        request: 'ownerKind?: string; ownerId?: string — the scope being asked about',
        response:
          '{ data: AutomationAccess } — every field a boolean the server decided, plus grantedCapabilities[] naming the trigger and action capabilities allowed, and maxActiveAutomations',
        authentication: 'Bearer.',
        authorization: 'Self only. There is no read-another-member’s-capabilities variant.',
        idempotency: null,
      },
    ],
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
      'Query key `["automations", userId, "capabilities", scopeToken]`, staleTime 5 minutes, and **always refetched on scope change**. A stale capability set is the input to what the builder offers, and offering something that 403s is worse than a spinner.',
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
      '§35’s safe test is complete: from the builder and from an automation’s detail screen, "Test this automation" produces a simulated run rendered by the same components as a real one, with every action listed as *would* rather than *did*, and an unmissable simulation marker. The disclaimer states in words that nothing was sent, nothing was charged and nobody was notified. **The client-side simulator never evaluates a sensitive condition** — it reports `serverEvaluationRequired` for those and says so in the result, because a simulation that answered a wallet-balance condition locally would be teaching the member to trust a number the real execution will not use.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `POST /automations/simulate` is a dry run against real state; nothing is sent, nothing is charged and nobody is notified, enforced at the dispatcher rather than by a flag. It returns the run, what it would have done, the audience and the dependency states.',
      'The client’s own simulator in `lib/automation/simulation.ts` is unchanged and still the product: it imports nothing that could dispatch, so §35’s guarantee stays structural, and a member can still test an automation while offline. The server call adds the audience estimate — the one part a client genuinely cannot know — and its failure is deliberately swallowed rather than surfaced as an error over a working test.',
    ],
    missingBackendCapability: [
      'A dry-run mode that evaluates conditions against authoritative state and dispatches nothing',
      'An audience estimate for the scope, so a member sees who a community automation would reach before they activate it',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /automations/simulate',
        method: 'POST',
        request:
          'A complete or draft automation body, plus `sampleTriggerContext?` — an optional real subject id to evaluate against (an event, a listing, a job)',
        response:
          '{ data: { run: AutomationRun (isSimulated: true), wouldHaveDone[], audience: AutomationAudience, dependencies: AutomationDependency[] } }',
        authentication: 'Bearer.',
        authorization:
          'The same capability check as creating the automation. A simulation that ran under weaker authorization would be an audience-enumeration tool: "how many members would this reach" is a question about a community that only its moderators should be able to ask.',
        permission: 'automations.simulate',
        idempotency:
          'Naturally safe — a simulation performs nothing. It must be rate-limited nonetheless, because it reads authoritative state and estimates audiences.',
      },
    ],
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
    caching: 'None. A simulation is a point-in-time answer and caching one would show a stale result as a fresh test.',
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
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'All six triggers are in the catalogue and configurable, and the contextual entry point on an event screen creates a reminder automation for *that* event in two taps without opening the builder. Event data itself is real — `types/community-life.ts` carries start and end times and an authoritative timezone — so the trigger’s conditions and the schedule’s event-relative offsets are computed against genuine values. What does not exist is anything that notices the event changed.',
    coverage: 'partial',
    existingBackendCapability: [
      'Events, series and occurrences are modelled with real start/end times and an authoritative IANA timezone. The *subject* data is complete.',
      'Phase 12 registered the series/occurrence contracts themselves as community gaps; those are referenced, not restated.',
    ],
    missingBackendCapability: [
      'An `EventCreated` / `EventUpdated` / `EventCancelled` domain event an automation could consume',
      'An `EventStartingSoon` emitter — which is a scheduled projection over event start times rather than an event anybody publishes, and is the piece most likely to be missed',
      'A change-detail payload, so "the event changed" can say *what* changed and a calendar entry can be updated rather than rewritten',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/events/{eventId}/context',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { eventId, title, startsAt, endsAt, timeZoneId, isCancelled, lastChangedAt, changedFields[] } } — the trigger context an automation evaluates against, and what the simulation borrows',
        authentication: 'Bearer.',
        authorization: 'The member must be able to see the event. A private event must not become readable through an automation route.',
        idempotency: null,
      },
    ],
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
    caching: 'Trigger context is not cached beyond the render that uses it.',
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
      '§12’s full offset set is built — 1 hour, 3 hours, 1 day, 1 week, at start, and a custom offset — with recurring reminders on a series. The five states §12 requires are distinct in the UI and never collapsed: **configured** is what the member did, **scheduled** is what the platform accepted, and the gap between them is exactly what this register exists to record. In production a reminder can be configured and cannot be scheduled, and the screen says that in those words rather than showing a tick.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `GET/POST /automations/reminders` and `DELETE /automations/reminders/{id}` are real. The module schedules on creation — `MarkScheduled(dueAt)` — so §12’s `configured` and `scheduled` states now genuinely fall on opposite sides of the line, and the screen’s tick means what it says for the first time.',
      'Two contract facts the development arm had wrong, both found by reading `ReminderHandlers.cs`. **`subjectMoment` is required** and is what the offset counts back from; it is a non-nullable `DateTimeOffset`, so omitting it binds to `0001-01-01` rather than failing, and the handler catches exactly that. **There is no `channel`** — delivery follows the member’s notification preferences, which is the right owner for it, and the adapter’s hard-coded `InApp` would have gone unseen by anybody who had asked for push and nothing else.',
      'Phase 16’s calendar export remains separate and still writes `reminderMinutes` into an *external* calendar entry, which is that calendar’s reminder and not Diaspora’s. The two stay deliberately distinct in the UI: a member who exports to Google and then disconnects Google loses the external one and keeps this one.',
    ],
    missingBackendCapability: [
      'A reminder store keyed on (member, subject, offset)',
      'Scheduled dispatch through B13',
      'Cancellation when the event moves or is cancelled, or the member un-RSVPs',
      'A per-reminder delivery state the member can see',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /automations/reminders',
        method: 'POST',
        request:
          'subjectKind: "event"|"occurrence"|"series"; subjectId; offsetMinutes: number; anchor: "start"|"end"; channel: "InApp"|"Push"|"Email"; timeZoneId (IANA, the subject’s own)',
        response: '{ data: { reminderId, state: "scheduled", scheduledFor, timeZoneId } }',
        authentication: 'Bearer.',
        authorization: 'Self only, and only for a subject the member can see.',
        permission: 'automations.reminders.write',
        idempotency:
          'Mandatory on (member, subject, offset, anchor). Tapping "remind me" twice must produce one reminder — a duplicate here is two identical push notifications a minute apart, which is the most common way an automation feature loses a member’s trust.',
      },
      {
        endpoint: 'DELETE /automations/reminders/{reminderId}',
        method: 'DELETE',
        request: 'None.',
        response: '{ data: { reminderId, state: "cancelled" } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Idempotent. Cancelling a cancelled reminder returns 200.',
      },
    ],
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
    caching: 'Query key `["automations", userId, "reminders", subjectKind, subjectId]`, staleTime 60 seconds.',
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
      'The complete saved-search experience is built **once** and shared by all five subjects, per §30’s "do not duplicate saved-search logic across modules": save a search from any list screen with its current filters, name it, enable alerts, choose instant/daily/weekly, and choose which changes are worth hearing about. The audit found **no saved-search capability of any kind** in the application — `store/knowledge-search.ts` holds transient filter state and nothing persists a query — so this is new surface rather than a migration. In production searches are held per-member on the device and the screen says plainly that alerts require the platform and cannot run yet: a saved search is still useful as a shortcut, and refusing to store one would remove a working feature to make a point.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `GET/POST /automations/saved-searches`, `PATCH /automations/saved-searches/{id}` and `DELETE /automations/saved-searches/{id}` store and replay a query. Criteria are fingerprinted server-side for idempotency, which is why they are not editable on the PATCH route — a changed search is a new one.',
      '`criteria` is asymmetric in exactly the way `parameters` is: a JSON string on the request, an object of `string → string | null` on the response. And `querySummary` falls back to the *name* when omitted, so a housing search reads “My search” rather than what was actually searched for — an omission that fails nothing and degrades every row.',
      'The listing routes this entry named are still the ones a saved search runs against: `/jobs`, `/marketplace/search`, `/housing/search`, `/providers` and the community-life event routes. (The `/listings` path named in the original text has never been served by this platform — corrected in Wave A′.)',
    ],
    missingBackendCapability: [
      'Saved-search storage',
      'An evaluator that matches new content against saved searches as it is published',
      'Change detection for price and availability on already-matched items',
      'Deduplication, so an item matching three of a member’s searches produces one notification',
      'A digest, so a broad search does not become a notification per listing',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/saved-searches',
        method: 'GET',
        request: 'subject?: "jobs"|"marketplace"|"housing"|"providers"|"events"',
        response: '{ data: SavedSearch[] }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
      {
        endpoint: 'POST /automations/saved-searches',
        method: 'POST',
        request:
          'subject; name; criteria: Record<string, unknown> — validated server-side against that subject’s real filter schema; alertsEnabled; alertFrequency; watchFor[]',
        response: '{ data: SavedSearch }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        permission: 'automations.savedSearches.write',
        idempotency:
          'On (member, subject, normalised criteria). Saving the same search twice returns the existing one rather than creating a duplicate that would double every alert.',
      },
      {
        endpoint: 'PATCH /automations/saved-searches/{id}',
        method: 'PATCH',
        request: 'Partial — name, alertsEnabled, alertFrequency, watchFor[]',
        response: '{ data: SavedSearch }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Naturally idempotent.',
      },
      {
        endpoint: 'DELETE /automations/saved-searches/{id}',
        method: 'DELETE',
        request: 'None.',
        response: '{ data: { id, deleted: true } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Idempotent.',
      },
    ],
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
    caching: 'Query key `["automations", userId, "saved-searches", subject]`, staleTime 60 seconds.',
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
      'job.published',
      'job.closingSoon',
      'job.applicationSubmitted',
      'job.applicationStatusChanged',
      'job.applicationThreshold',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/job/[id]', '/employer'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'All five triggers are configurable, with the candidate-facing and employer-facing ones separated by owner scope so a candidate is never offered "notify me when my job receives applications" for somebody else’s posting. The employer triggers require the employer capability and are hidden without it.',
    coverage: 'partial',
    existingBackendCapability: [
      '`/jobs` is real and filterable, and job records carry a closing date — so `job.closingSoon` is a projection over data that genuinely exists rather than a field somebody must add.',
      'Applications and their statuses are modelled.',
    ],
    missingBackendCapability: [
      'JobPublished, JobClosingSoon, ApplicationSubmitted, ApplicationStatusChanged events',
      'An application-count threshold evaluator',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/jobs/context',
        method: 'GET',
        request: 'jobId: string',
        response: '{ data: { jobId, title, closesAt, applicationCount: number|null, status } }',
        authentication: 'Bearer.',
        authorization:
          'Application counts are employer-only. A candidate reading this must receive the public fields and null for the count — a count exposed to candidates is competitive information about other applicants.',
        idempotency: null,
      },
    ],
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
    caching: 'Not cached beyond the render.',
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
      'listing.published',
      'listing.priceChanged',
      'listing.expiring',
      'listing.sold',
      'listing.offerReceived',
      'listing.reservationCreated',
      'listing.reservationEnding',
      'listing.inquiryReceived',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/marketplace/[id]', '/automation/searches'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Buyer-side and seller-side triggers are separated by owner scope. A price-drop watch on a specific saved listing is offered directly from the listing screen; a seller’s "tell me when I receive an offer" requires the seller capability. **No automation in this catalogue can accept an offer, complete a reservation or move money** — §19 is explicit and the action catalogue contains nothing that could.',
    coverage: 'partial',
    existingBackendCapability: [
      '`/marketplace` is real, listings carry prices and expiry, and reservations and offers are modelled.',
    ],
    missingBackendCapability: [
      'ListingPublished, ListingPriceChanged, ListingExpiring, ListingSold, OfferReceived, ReservationCreated, ReservationEnding events',
      'Price-change detection with a threshold, so a £1 movement does not notify',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/marketplace/context',
        method: 'GET',
        request: 'listingId: string',
        response: '{ data: { listingId, title, price, currency, status, expiresAt, priceChangedAt } }',
        authentication: 'Bearer.',
        authorization: 'Public listing fields for any member; offer and reservation detail for the seller only.',
        idempotency: null,
      },
    ],
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
    caching: 'Not cached beyond the render.',
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
      'housing.published',
      'housing.priceChanged',
      'housing.availabilityChanged',
      'housing.expiring',
      'housing.inquiryReceived',
      'housing.applicationStatusChanged',
      'housing.viewingReminder',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/housing/[id]', '/housing/host', '/automation/searches'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Tenant-side and landlord-side triggers are separated by owner scope, and the tenant-side ones are the primary use of the shared saved-search surface — housing is the search people most want told about. The landlord triggers require the landlord capability.',
    coverage: 'partial',
    existingBackendCapability: ['`/housing` is real and filterable; listings carry price and availability.'],
    missingBackendCapability: [
      'HousingPublished, HousingPriceChanged, HousingAvailabilityChanged, HousingInquiryReceived, HousingApplicationStatusChanged events',
      'A viewing-appointment record to remind against',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/housing/context',
        method: 'GET',
        request: 'housingId: string',
        response: '{ data: { housingId, title, price, currency, availableFrom, status } }',
        authentication: 'Bearer.',
        authorization: 'Public fields for any member; inquiry and application detail for the landlord only.',
        idempotency: null,
      },
    ],
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
    caching: 'Not cached beyond the render.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'housing-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Housing Triggers',
  },

  communityTriggers: {
    id: 'FRONTEND-PHASE18-GAP-013',
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
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Community automation is built with its scope explicit and mandatory: the builder cannot save a community automation without naming which communities it acts within, because §14 forbids assuming a member belongs to exactly one. The audience preview is shown before activation and comes from the server (GAP-027) — a client-side recipient count over a community would be both wrong and a disclosure. Every community trigger is gated on the community capability set and renders nothing without it.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 13 registered the community directory, membership and server-evaluated capability contracts as its own gaps. This entry depends on those rather than restating them.',
    ],
    missingBackendCapability: [
      'CommunityMemberJoined, CommunityAnnouncementPublished, CommunityUpdatePublished, CommunityMilestoneReached events',
      'An eligibility evaluator: who in this community should receive this, given membership state, notification preferences, blocks and mutes',
      'A rate limit per community, so a community cannot be flooded by one moderator’s automation',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/community/{communityId}/context',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { communityId, memberCount: number|null, milestoneThresholds: number[], canAutomate: boolean } }',
        authentication: 'Bearer.',
        authorization: 'Member count is visible only where the community’s own statistics permission allows it.',
        idempotency: null,
      },
    ],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} Required: CommunityMemberJoined, CommunityAnnouncementPublished, CommunityUpdatePublished, CommunityMilestoneReached, CommunityEventCreated.`,
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
    caching: 'Query key includes the community scope token from `lib/community/scope.ts` — the existing one, not a second derivation.',
    blockedBy: 'FRONTEND-PHASE18-GAP-005',
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B22 Automation Platform — Community Triggers',
  },

  organizationTriggers: {
    id: 'FRONTEND-PHASE18-GAP-014',
    key: 'organizationTriggers',
    domain: 'organizations',
    capability:
      'Organization triggers — new member, event created, registration received, announcement, membership renewal due, milestone',
    feature: '§22 Organization Automation · §47 Organization Permissions',
    triggerKeys: [
      'organization.memberJoined',
      'organization.eventCreated',
      'organization.registrationReceived',
      'organization.announcementPublished',
      'organization.membershipRenewalDue',
      'organization.milestoneReached',
    ],
    actionKeys: ['notify.organization'],
    screens: ['/automation/create', '/community-life/org/[id]', '/automation'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Organization automation mirrors community automation with organization roles, and reuses the same audience preview and the same scope requirement. §22 warns against duplicate organization notification logic and there is none: an organization action names a B13 channel and category exactly as every other action does.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 12 registered organizations, membership programmes, roles and dashboards as community gaps. This depends on those.',
    ],
    missingBackendCapability: [
      'OrganizationMemberJoined, OrganizationEventCreated, OrganizationRegistrationReceived, MembershipRenewalDue events',
      'An organization role check the automation platform can call at execution time',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/organizations/{organizationId}/context',
        method: 'GET',
        request: 'None.',
        response: '{ data: { organizationId, memberCount: number|null, canAutomate: boolean, roles: string[] } }',
        authentication: 'Bearer.',
        authorization: 'Organization members with a management role.',
        idempotency: null,
      },
    ],
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
    caching: 'Query key `["automations", userId, "org", organizationId, ...]`.',
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
    triggerKeys: ['guide.published', 'guide.updated', 'guide.savedChanged', 'guide.milestoneReached'],
    actionKeys: [],
    screens: ['/automation/create', '/guide/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Reader-side triggers (a guide I saved was updated; a new guide for a country I follow) and author-side triggers (my guide reached a milestone) are separated by owner scope. The contextual entry point on a guide screen creates the reader-side automation without opening the builder.',
    coverage: 'partial',
    existingBackendCapability: [
      'Guides are real, with authors, countries, categories, a quality label and a `lastUpdatedAt`. The subject data is complete and the change is detectable in principle.',
    ],
    missingBackendCapability: [
      'GuidePublished, GuideUpdated, GuideMilestoneReached events',
      'A "substantive change" rule — a typo fix must not notify everybody who saved a guide, and that judgement cannot be made on the client',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/guides/context',
        method: 'GET',
        request: 'guideId: string',
        response: '{ data: { guideId, title, countryCode, category, lastUpdatedAt, lastSubstantiveChangeAt } }',
        authentication: 'Bearer or anonymous.',
        authorization: 'Public.',
        idempotency: null,
      },
    ],
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
    caching: 'Not cached beyond the render.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'directory-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Content Triggers',
  },

  governmentTriggers: {
    id: 'FRONTEND-PHASE18-GAP-016',
    key: 'governmentTriggers',
    domain: 'government',
    capability:
      'Government and country triggers — notice published, visa advisory updated, embassy information changed',
    feature: '§16 Government / Country Automation',
    triggerKeys: ['government.noticePublished', 'government.advisoryUpdated', 'government.embassyChanged'],
    actionKeys: [],
    screens: ['/automation/create', '/country/[code]', '/settings/integrations/government'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Country-scoped by construction: the trigger cannot be configured without a country, so §16’s "do not show one country’s information under another" holds at the configuration layer rather than being checked at render. Every notification this trigger would produce carries the provenance Phase 16 built — authority, source kind, published date, official URL — and the frontend has **no component that can render official-looking content without a source**, which is the enforcement that matters here.',
    coverage: 'none',
    existingBackendCapability: [
      'None. Phase 16 GAP-011 registered the entire government surface as absent; this entry depends on it and does not restate it.',
    ],
    missingBackendCapability: [
      'GovernmentNoticePublished and AdvisoryUpdated events, with provenance',
      'A subscription model: which members are affected by a notice for a given country',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/government/{countryCode}/context',
        method: 'GET',
        request: 'category?: string',
        response: '{ data: { countryCode, hasLiveSource: boolean, lastPublishedAt, categories[] } }',
        authentication: 'Bearer or anonymous.',
        authorization: 'Public.',
        idempotency: null,
      },
    ],
    eventDependency: `${NO_DOMAIN_EVENT_STREAM} And upstream of that: Phase 16 GAP-011 means there is no government data to publish events about.`,
    schedulingRequirement: 'Advisory checks are a scheduled poll of official sources, server-side. Never a client poll.',
    queueRequirement: 'Fan-out by country. Shared mechanism.',
    idempotencyRequirement: 'One notification per (automationId, noticeId, revision). A source that republishes unchanged content must not re-notify.',
    authorizationRequirement: 'Self-scoped. Country-wide automation that notifies *other* members requires platform authority and is not available to members.',
    privacyRequirements:
      '**The most sensitive trigger in the register.** A member subscribing to visa advisories for a country discloses an immigration situation, and in some jurisdictions that is dangerous information. The subscription must be private to the member, must not be inferable from any public surface, must not feed recommendations, and must not appear in analytics beyond a count of "government automations exist".',
    securityRequirements:
      '§16: do not fabricate official government information. A development adapter must mark simulated notices unmistakably, and no notification may present adapter content as an official advisory. The frontend enforces this by requiring a `GovernmentSource` on every rendered item.',
    retryBehaviour: 'Retryable. An advisory is important enough that a failed delivery escalates rather than being dropped.',
    observability: 'Source freshness per country — a feed that has not updated in a month is either quiet or broken, and the difference matters.',
    caching: 'Country-scoped, not member-scoped, matching Phase 16’s government key convention.',
    partiallyCoveredBy: 'FRONTEND-PHASE16-GAP-011 — the underlying government data contract.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'government-data-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Content Triggers',
  },

  creatorTriggers: {
    id: 'FRONTEND-PHASE18-GAP-017',
    key: 'creatorTriggers',
    domain: 'creator',
    capability:
      'Creator triggers — milestone reached, reward available, referral completed, content published, performance threshold, challenge completed',
    feature: '§23 Creator Automation · §26 Creator Rewards',
    triggerKeys: [
      'creator.milestoneReached',
      'creator.rewardAvailable',
      'creator.referralCompleted',
      'creator.contentPublished',
      'creator.performanceThreshold',
      'creator.challengeCompleted',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/creator', '/creator/analytics'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Creator triggers are gated on the creator capability and are self-scoped — a creator automates over their own milestones and their own content. The reward triggers **notify only**: they say a reward is available and deep-link to the existing claim screen, where the member claims it themselves through Phase 7’s real flow. §26’s rule that the frontend must never independently credit financial value is satisfied structurally — there is no action in the catalogue that claims, credits or converts.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 7 registered creator status, milestones, challenges, rewards, referrals and points as creator gaps. This depends on those and does not restate them.',
    ],
    missingBackendCapability: [
      'CreatorMilestoneReached, CreatorRewardAvailable, ReferralCompleted, ChallengeCompleted events',
      'A server-side performance-threshold evaluator (see GAP-022)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/creator/context',
        method: 'GET',
        request: 'None.',
        response: '{ data: { creatorStatus, milestoneThresholds[], hasClaimableRewards: boolean } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
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
    caching: 'Query key `["automations", userId, "creator", "context"]`.',
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
      'wallet.transactionRecorded',
      'giving.donationCompleted',
      'giving.contributionRecorded',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/wallet', '/automation'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Financial triggers are **notification-only by construction**. The builder offers them, the conditions can narrow them by amount band and type, and the actions available are limited to notify, remind and open — the action picker filters out everything else for a financial trigger, and the domain model has no money field for an action to carry. B15 genuinely completes these payments today and B13 genuinely delivers its billing notification templates; what is missing is the ability for a *member-authored rule* to observe them.',
    coverage: 'partial',
    existingBackendCapability: [
      'B15 is real and complete: payment intents, authorize, capture, cancel, refunds, wallets, ledger, donations, contributions, subscriptions.',
      'B13 already emits billing templates — `billing.payment.failed`, `billing.refund.issued`, `billing.subscription.activated`, `billing.donation.receipt` and others — and `lib/notification-routes.ts` already routes them to real screens. **A member is already notified about these events.** What does not exist is a rule engine that could observe them.',
    ],
    missingBackendCapability: [
      'Financial domain events exposed to the automation platform, with the same guarantees as the ledger',
      'An amount-band condition evaluated server-side, so a threshold cannot be read from a client-held balance',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/financial/context',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { currencies: string[], hasWallet: boolean, canAutomate: boolean } } — capability and shape only. **No balance and no transaction list**: this route exists to configure a rule, not to read money, and the wallet routes already serve that.',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
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
    caching: 'None for financial context. Wallet figures come from B15’s real routes through the existing wallet screens.',
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
      'subscription.renewed',
      'placement.ending',
      'boost.ending',
      'plan.ending',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/monetization', '/wallet/placements/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Expiry reminders are configurable with a lead time, and are the clearest good use of automation in the product: a placement that lapses unnoticed is money already spent and wasted. **No automation can renew, extend or purchase** — the action is a reminder that deep-links to the existing purchase flow, where the member decides. §25 forbids automatic charging or renewal unless the backend explicitly supports it, and it does not.',
    coverage: 'partial',
    existingBackendCapability: [
      'B15 carries subscriptions with real periods and real renewal dates, and B13 already emits `billing.subscription.activated` and `.ended`. Expiry *dates* are genuinely known.',
      'Phase 6 registered placements, boosts and plans as monetization gaps; those are referenced.',
    ],
    missingBackendCapability: [
      'A scheduled projection over expiry dates with a configurable lead time',
      'SubscriptionExpiring, PlacementEnding, BoostEnding events',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/monetization/context',
        method: 'GET',
        request: 'None.',
        response: '{ data: { activeSubscriptions: {id, kind, endsAt}[], activePlacements: {id, endsAt}[] } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
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
    caching: 'Query key `["automations", userId, "monetization", "context"]`, staleTime 5 minutes.',
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
      'provider.inquiryReceived',
      'provider.reviewReceived',
      'provider.featuredStarting',
      'provider.featuredEnding',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/provider/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Provider triggers require a server-verified provider role on the listing and are hidden entirely without it. The lead and inquiry triggers notify that something arrived and deep-link to it; they never carry the customer’s identity or message in the notification body.',
    coverage: 'partial',
    existingBackendCapability: ['Provider listings and reviews are real. Leads and inquiries are modelled.'],
    missingBackendCapability: ['ProviderLeadReceived, ProviderInquiryReceived, ProviderReviewReceived events', 'Featured-placement lifecycle events'],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/providers/context',
        method: 'GET',
        request: 'providerId: string',
        response: '{ data: { providerId, isFeatured, featuredEndsAt, canAutomate: boolean } }',
        authentication: 'Bearer.',
        authorization: 'Provider role on the listing.',
        idempotency: null,
      },
    ],
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
    caching: 'Not cached beyond the render.',
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
      'message.received',
      'conversation.started',
      'conversation.inactive',
      'conversation.unreadReminder',
    ],
    actionKeys: [],
    screens: ['/automation/create', '/conversation'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The four triggers are configurable and every one of them is **read-only about messages**: they can notify the member about their own conversations and they cannot send. §29 forbids automatically sending messages without explicit user authorization, and rather than build a confirmation flow around an auto-reply nobody asked for, the action catalogue simply contains **no send-message action**. That is a deliberate scope decision recorded here rather than a missing feature: if auto-reply is wanted later, it needs its own per-run confirmation design, and the domain model already has the field for it (`requiresPerRunConfirmation`).',
    coverage: 'partial',
    existingBackendCapability: [
      'B13.2 conversations are real and B13 already delivers message notifications through the existing preference model.',
    ],
    missingBackendCapability: [
      'ConversationInactive — a scheduled projection over last-activity, which does not exist',
      'An unread-reminder evaluator that respects the member having simply chosen not to reply',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/messaging/context',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { unreadConversations: number, oldestUnreadAt: string|null } } — counts and timestamps. **No message content, no participant identity**: §29 forbids exposing message content unnecessarily and a configuration route has no need of any.',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
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
    caching: 'Query key `["automations", userId, "messaging", "context"]`, staleTime 60 seconds.',
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
    triggerKeys: ['analytics.thresholdReached', 'analytics.trendChanged'],
    actionKeys: [],
    screens: ['/automation/create', '/analytics', '/creator/analytics'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Threshold automations are configurable over the metric vocabulary Phase 15 already defined — the builder offers `AnalyticsMetricKey` values rather than a second metric list. The screen states, in words, that **frontend analytics are not an authoritative trigger**: a figure the device computed from a page of data it happens to hold is not the platform’s number, and an automation that fired on it would fire differently on two devices. §27 says this explicitly and the UI repeats it rather than hiding it.',
    coverage: 'partial',
    existingBackendCapability: [
      'Phase 15 registered the analytics datasets themselves as gaps. Some figures are genuinely backend-sourced today; Phase 15’s `Sourced<T>` provenance model records which, and this phase reuses it rather than re-deciding.',
    ],
    missingBackendCapability: [
      'A threshold evaluator running server-side on a schedule against authoritative aggregates',
      'A trend-change detector with a stated definition of "dropping" — a client cannot be allowed to define it, because two definitions produce two different alert streams',
      'Hysteresis, so a metric oscillating around a threshold does not alert repeatedly',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/triggers/analytics/context',
        method: 'GET',
        request: 'subjectType: string; subjectId: string',
        response:
          '{ data: { availableMetrics: string[], evaluationFrequency: "hourly"|"daily", isAuthoritative: boolean } }',
        authentication: 'Bearer.',
        authorization: 'The same capability as reading that subject’s analytics. §66.',
        idempotency: null,
      },
    ],
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
    caching: 'Reuses Phase 15’s analytics query keys for the metric vocabulary. No second cache.',
    partiallyCoveredBy: 'Phase 15’s analytics gaps for the underlying figures.',
    blockedBy: 'FRONTEND-PHASE18-GAP-002',
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B24 Automation Platform — Engagement Triggers',
  },

  locationTriggers: {
    id: 'FRONTEND-PHASE18-GAP-023',
    key: 'locationTriggers',
    domain: 'location',
    capability:
      'Location-based triggers — entering a neighbourhood, arriving in a country, being near a saved place',
    feature: '§15 Location-Based Automation · §50 Privacy',
    triggerKeys: ['location.enteredArea', 'location.countryChanged', 'location.nearSavedPlace'],
    actionKeys: [],
    screens: ['/automation/create', '/settings/location', '/automation/settings'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '§15 requires the five location modes to be clearly distinguished and they are, in the builder and in the preview: **one-time current location**, **user-selected location**, **saved location**, **geofence** and **continuous monitoring**. The first three are available and work — they use Phase 8’s existing location capability and the member’s own selection. The last two are **deliberately not implemented**, and this is a decision rather than an omission: §15 forbids silently implementing continuous background location tracking, the app requests only foreground location today, and shipping a geofence would mean requesting always-on location permission for a feature whose backend does not exist. The builder shows both, explains what each would need, and refuses to activate them. A member cannot accidentally turn on background tracking here because there is no code path that could.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 8 built a real location capability: permission handling, current location, reverse geocoding over the certified `/location/reverse-geocode`, and a privacy model in `lib/maps/privacy.ts`. Foreground location genuinely works.',
      'No background location, no geofencing, no location history — and the audit confirms none is requested anywhere in the app.',
    ],
    missingBackendCapability: [
      'A geofence registry',
      'A server-side location-event contract',
      'A retention and minimisation policy for location events, which must exist before any of the above is built',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /automations/geofences',
        method: 'POST',
        request: 'centre: {lat, lng}; radiusMetres: number; label: string; dwellSeconds?: number',
        response: '{ data: { geofenceId, state: "registered" } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        permission: 'automations.location.write',
        idempotency: 'On (member, centre, radius). Registering the same fence twice returns the first.',
      },
    ],
    eventDependency: 'GeofenceEntered / GeofenceExited, which would originate on the device and be reported to the server — the only trigger family in this register that is device-sourced, and the reason it is treated separately.',
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
    caching: 'No caching of location. Phase 8’s privacy module governs what may be held and for how long.',
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
      'Every notifying action names a **B13 channel and a B13 category**, and the builder’s channel picker is driven by the member’s real, live `GET /notifications/preferences` — a member who has switched off push does not see push offered as though it would work, and the builder says why. There is **no second notification system, no second inbox and no `AutomationNotification` type**; §28 and §73 forbid it and the domain model has no way to express one. What is missing is only the server-side dispatch path.',
    coverage: 'partial',
    existingBackendCapability: [
      'B13 is real and substantial: `GET/PUT /notifications/preferences`, `/notifications/categories` with mandatory flags, `/notifications/devices`, the inbox, priorities, digests, quiet hours, `criticalOverrideEnabled`, and delivery records per channel. `lib/notifications-api.ts` wraps all of it and this phase reads it live.',
      'Deep-link routing already exists in `lib/notification-routes.ts`, with a refusal for unknown routes — so an automation-originated notification lands correctly and degrades to the inbox rather than crashing.',
    ],
    missingBackendCapability: [
      'An endpoint or internal contract by which the automation platform asks B13 to deliver',
      'Automation-owned notification categories, so a member can mute automation notifications separately from the platform’s own',
      'A per-automation attribution on the delivered notification, so the inbox can say which automation produced it and offer to pause it from there',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /notifications/dispatch',
        method: 'POST',
        request:
          'categoryKey; templateKey; recipients: {kind: "self"|"scope", scopeRef?}; parameters: Record<string,string>; sourceKind: "automation"; sourceId: automationId; runId; priority',
        response:
          '{ data: { dispatchId, accepted: number, suppressed: number, suppressionReasons: string[] } } — the counts are what make an honest run record possible',
        authentication: 'Service-to-service. **Never callable by a client.**',
        authorization:
          'Internal only, and the automation platform must present the owner’s authority — a dispatch is only permitted to a scope the owner may reach, re-derived at dispatch time.',
        permission: 'notifications.dispatch',
        idempotency:
          'Mandatory on (runId, recipientId, categoryKey). §39 names notification dispatch explicitly and this is where a duplicate would be most visible.',
      },
      {
        endpoint: 'GET /notifications/categories',
        method: 'GET',
        request: 'None.',
        response: 'Existing contract, extended with automation-owned categories.',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
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
    caching: 'Shares B13’s existing `notificationKeys.preferences()` key. No second cache.',
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
      'Calendar actions are offered and configured, and **the device-calendar path genuinely works** — but only while the app is running, which the UI states rather than glosses. §11 forbids duplicating calendar integration logic and none is duplicated: the action calls Phase 16’s `exportEventToCalendar`, the single implementation, which already handles the event’s own timezone, DST, the duplicate-export conflict rule and partial success. An automation that writes to a *connected* calendar unattended needs the server, and that is this gap.',
    coverage: 'partial',
    existingBackendCapability: [
      '`lib/integrations/calendar.ts` is the one calendar implementation and is complete for a foreground, member-initiated export. The device provider writes for real where the native module is present.',
      'Phase 16 GAP-004 already specifies the server-side proxied write for Google. This entry does not restate that contract — it depends on it and adds only what automation needs on top.',
    ],
    missingBackendCapability: [
      'Unattended write: the device is not running when an automation fires, so the write must happen server-side',
      'A source-to-external-id mapping, so an update is an update rather than a duplicate',
      'A cancellation path, so a cancelled Diaspora event removes or annotates the calendar entry it created',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /automations/actions/calendar',
        method: 'POST',
        request:
          'runId; provider; calendarId; sourceKind; sourceId; operation: "create"|"update"|"delete"; draft: CalendarEventDraft (with a mandatory IANA timeZone)',
        response: '{ data: { externalEventId, operation, writtenAt } }',
        authentication: 'Service-to-service, acting for the automation owner.',
        authorization: 'The owner’s own connection and a calendar they may write to. §46 of Phase 16: a calendar id is a name, not a capability.',
        permission: 'integrations.calendar.write',
        idempotency:
          'Mandatory on (sourceId, calendarId, runId). Phase 16 already established that a retried calendar write without a key is a duplicate entry in somebody’s calendar — the most visible failure this integration has, and unattended execution makes it likelier rather than less.',
      },
    ],
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
    caching: 'None for a write.',
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
      '§34 requires the target audience to be shown before activation and the preview screen shows it — as a **count with its provenance**, never as a list, and never computed on the client. Where the server has not answered, the preview says the audience is unknown rather than showing a number the client guessed. A moderator activating a community-wide automation sees "about 1,200 members of Nigeria in Lagos" and the eligibility filters that will narrow it further at dispatch.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). `POST /automations/audience` answers with a count and a sentence, never a member list, and small counts are banded — `estimatedRecipients` is null both when the platform cannot say **and** when the true figure is between 1 and 9, so an audience preview cannot be used to count a community.',
      'The request carries `scope` **and** `actionKeys`, and the count is per-action: `notify.community` reaches a community and `notify.self` reaches one person. The certified client sent only the scope until this wave, which asks “how many people are in this scope” — a different question, and on a community automation a larger and more alarming number than the true one.',
      'Community statistics remain Phase 13’s own gap; this is a different question and now has its own answer.',
    ],
    missingBackendCapability: [
      'An audience estimator over a scope',
      'A statement of the eligibility filters that will apply at dispatch, so the preview does not over-promise',
      'Small-count suppression',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /automations/audience',
        method: 'POST',
        request: 'scope: AutomationScope; actionKeys: string[]',
        response:
          '{ data: { kind, estimatedRecipients: number|null, description, serverSideFilters: string[] } } — a count and prose. **Never a member list.**',
        authentication: 'Bearer.',
        authorization: 'The same capability as creating the automation. §35: a weaker check makes this an enumeration tool.',
        idempotency: null,
      },
    ],
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
    caching: 'Query key `["automations", userId, "audience", scopeToken, actionsToken]`, staleTime 5 minutes.',
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
      'The audit trail renders on an automation’s detail screen, and every entry carries its provenance. §51 forbids the frontend fabricating audit records, so a change this device just made renders as "changed on this device, just now" until the server confirms it — visually distinct from a server-confirmed entry. That distinction is the whole point: an audit trail that mixed local optimism with server truth would be worse than none.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). Every `AutomationDefinitionResponse` carries its own `audit` array, and `GET /automations/{id}/audit` serves it separately. Each entry has an action, a moment, an actor *label* and a provenance — never an email and never an internal identifier.',
      '`provenance` is always `server` from this route. The client’s `local` value remains its own optimistic state and the two are deliberately distinguishable, so an entry the member has not yet had confirmed cannot be read as one the platform recorded.',
    ],
    missingBackendCapability: [
      'An append-only audit log per automation',
      'Actor attribution that survives a role change — "changed by a former moderator" must still be answerable',
      'A retention policy',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/{id}/audit',
        method: 'GET',
        request: 'cursor?: string; limit?: number',
        response:
          '{ data: AutomationAuditEntry[] } — action, at, actorLabel (a display name, never an email or an internal id), provenance: "server"',
        authentication: 'Bearer.',
        authorization: 'Owner or manager of the owning scope.',
        idempotency: null,
      },
    ],
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
    caching: 'Query key `["automations", userId, "audit", automationId]`, staleTime 60 seconds.',
    blockedBy: 'FRONTEND-PHASE18-GAP-001',
    owner: 'automation-platform',
    priority: 'medium',
    recommendedPhase: 'B23 Automation Platform — Actions',
  },

  automationTelemetry: {
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
      '§52’s events are all emitted — created, activated, paused, executed, failed, template used, tested, disabled — through the **existing** platform buffer in `lib/creator-analytics.ts`, with an allow-list extension. This is the fifth phase to extend that one buffer and it adds no transport, no second sanitiser and no second queue. The allow-list carries trigger keys, action keys, template ids and counts; it carries **no parameter values, no automation name, no recipient count and no schedule times**, so a member’s rule contents cannot leak into a telemetry stream with a different retention policy.',
    coverage: 'none',
    existingBackendCapability: [
      'None. The absent ingestion endpoint was first registered as CREATOR-GAP-016 and restated by Phases 8, 12, 13 and 15. This is the sixth restatement of one missing endpoint and is recorded as such rather than as a new discovery.',
    ],
    missingBackendCapability: ['A telemetry ingestion endpoint'],
    requiredContracts: [
      {
        endpoint: 'POST /analytics/events',
        method: 'POST',
        request: 'events: {name, properties, occurredAt}[] — batched',
        response: '{ data: { accepted: number } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Batch id, so a retried flush does not double-count.',
      },
    ],
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
    caching: 'None.',
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
      'The client handles all four §40 cases honestly. An edit while a run is active warns that the run in progress uses the previous version. A pause reports how many pending executions were cancelled, from the server’s count, never from a guess. A delete confirms with the same count. A change made on another device is detected through `updatedAt` and the member is told the automation changed elsewhere rather than having their edit silently overwrite it. **All four depend on server answers**, and where none is available the UI says the state may not be current instead of asserting one.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-02). Optimistic concurrency is real: `PATCH /automations/{id}` takes an `expectedUpdatedAt` precondition and answers 409 when the automation changed elsewhere, compared at millisecond resolution — so the value must be echoed back exactly as received rather than reformatted.',
      '`PATCH /automations/{id}/status` and `DELETE /automations/{id}` both return `cancelledRuns` from the server’s own count, which is what lets the UI say how many pending executions a pause or a delete actually cancelled instead of implying none.',
      'What is still absent is the per-automation *execution* lock. An edit made while a run is in progress is accepted, and the run in progress finishes against the version it started with — which the client already warns about, and which is the behaviour a lock would formalise rather than change.',
    ],
    missingBackendCapability: [
      'A per-automation execution lock',
      'Optimistic concurrency on the definition, via a version or an `updatedAt` precondition',
      'Cancellation of pending executions on pause and delete, with a count',
    ],
    requiredContracts: [
      {
        endpoint: 'PATCH /automations/{id}',
        method: 'PATCH',
        request: 'As GAP-001, plus an `If-Unmodified-Since` or `expectedUpdatedAt` precondition',
        response: '409 with the current definition when the precondition fails, so the client can show the difference rather than a generic error',
        authentication: 'Bearer.',
        authorization: 'Owner or manager.',
        idempotency: 'The precondition is the concurrency control.',
      },
    ],
    eventDependency: 'None.',
    schedulingRequirement: 'A pause must cancel pending scheduled occurrences (GAP-003), not merely stop new ones being created.',
    queueRequirement: 'A per-automation lock so two triggers arriving together do not produce two concurrent runs of a rule that notifies a community.',
    idempotencyRequirement: 'The lock is the idempotency for concurrent triggers of one automation.',
    authorizationRequirement: SERVER_AUTHORITATIVE,
    privacyRequirements: 'None specific.',
    securityRequirements: 'A lock that can be starved is a denial of service against a member’s own automations; it needs a timeout longer than the slowest action and shorter than a member’s patience.',
    retryBehaviour: 'A 409 is never retried automatically — it means somebody else changed something and a blind retry would overwrite them.',
    observability: 'Lock contention and 409 rates.',
    caching: '`updatedAt` is carried on every definition so the client can detect a concurrent change without a second request.',
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
      'The template gallery is complete and works entirely from a **client-side catalogue** in `lib/automation/templates.ts`, which is deliberate rather than a limitation: a template is a composition of catalogue entries this build already understands, and a template referencing a trigger the build does not have would be a broken row. Templates are permission-aware and context-aware per §31 — one whose capabilities the member lacks is not shown, and one whose parts are unsupported shows its support status honestly rather than being hidden. A server-published catalogue is the enhancement, not the foundation.',
    coverage: 'none',
    existingBackendCapability: [
      '**PARTLY RESOLVED (Remediation Wave C-02, finished by C-06).** C-02 wrote that `GET /automations/templates` and `GET /automations/catalog` "both exist and are consumed". Half of that was untrue and stayed untrue for two waves: the arms existed — `fetchTemplates` and `fetchCatalog` — and **no hook or screen called either**, so the gallery rendered entirely from the client catalogue. An arm that is never called is not a connected route. `useAutomationTemplates` now calls the templates route and `app/automation/templates.tsx` reads it. `fetchCatalog` is still unconsumed.',
      '**The route cannot be used to narrow the gallery, and the reason is in its own contract.** It is filtered to what the member may create — a template whose capabilities they lack is absent rather than annotated, deliberately, because a greyed-out "Create a community-wide announcement" maps a community’s governance for anybody who opens the screen. The unfiltered catalogue is never served, so an id missing from the response is either one the member may not create or one this deployment does not publish, and no client can tell those apart. Hiding a gallery entry on that ambiguity would remove a working template every time the deployment ships fewer than the app, which is the case today: six served against eleven shipped.',
      'So it is read for the one thing it can say without guessing: which templates the deployment publishes that **this build cannot render**. The screen names them and says an update will bring them. Honouring §31’s "ignore any template referencing a trigger or action key this build does not know" silently would leave nobody able to see why an automation they were told about is missing.',
      '`AutomationTemplateResponse` is **not** this client’s `AutomationTemplate`. It carries no `schedule`, no `fields` and no `requiredIntegrations`; the form a member fills in to configure a template is this build’s business. Typing the response as the richer client type would leave three required fields `undefined`, which renders as an empty form rather than as an error.',
      'The catalogue is the static vocabulary — 49 triggers, 22 conditions with a per-condition legal operator list, and 12 actions — and each entry states whether *this deployment* can actually perform it, so the builder can present a truthful list rather than one derived from the client’s own constants.',
      'The client-side catalogue in `lib/automation/templates.ts` is deliberately kept as the foundation: a template is a composition of catalogue entries this build understands, and one referencing a trigger the build does not have would be a broken row. The server catalogue narrows what is offered; it does not replace it.',
      'Per-member template recommendations remain absent.',
    ],
    missingBackendCapability: [
      'A template catalogue endpoint',
      'Per-member template recommendations',
      'Template usage counts, so the gallery can order by what actually helps people',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /automations/templates',
        method: 'GET',
        request: 'category?: string; ownerKind?: string',
        response:
          '{ data: AutomationTemplate[] } — and the client must ignore any template referencing a trigger or action key this build does not know, rather than rendering a row it cannot open',
        authentication: 'Bearer.',
        authorization: 'Filtered to what this member may create.',
        idempotency: null,
      },
    ],
    eventDependency: 'None.',
    schedulingRequirement: 'None.',
    queueRequirement: 'None.',
    idempotencyRequirement: 'None.',
    authorizationRequirement: '§31: templates are permission-aware. The server filters; the client filters again from its capability set, because a client that rendered whatever it was sent would offer a template that 403s on save.',
    privacyRequirements: 'Template usage counts are aggregate. §52: which templates *this* member used is not published to anybody else.',
    securityRequirements: 'A server-published template is server-supplied configuration and must be validated against the client’s own catalogue before it is rendered, not trusted.',
    retryBehaviour: 'Safe to retry.',
    observability: 'Template views, uses and completion rate.',
    caching: 'Query key `["automations", "templates", ownerKind]`, staleTime 30 minutes. Not member-scoped: the catalogue is the same for everybody with the same capabilities, and the client applies the member-specific filter.',
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
