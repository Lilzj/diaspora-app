// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation, development arm (Frontend Phase 18)
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/automation-gaps.ts`. ⚠
//
// The development arm of the repository split. The certified arm is
// `automation-api.ts`; `hooks/automation.ts` is the stable interface above
// both, and a screen cannot tell which answered except through the
// `isSimulated` flag the data itself carries — which it is required to render
// (§57).
//
// ── Why the prefix is `/automation-gap/v0` ───────────────────────────────────
//
// The same reasoning Phases 5 through 16 applied, and the same three
// consequences, all wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether an
//     automation has a backend behind it.
//   * A call that escaped a development build 404s at the gateway rather than
//     colliding with, shadowing, or being mistaken for the `/automations`
//     namespace a real backend would claim.
//   * Migration is mechanical: when a backend phase ships automation, the hook
//     swaps which arm it calls and the request shapes already match.
//
// Every function refuses when the gap features are disabled, so the guarantee
// does not depend on a screen remembering to check.
//
// ── What is NOT in this file, and why each absence matters ───────────────────
//
// **Nothing that moves money.** No payment, no payout, no wallet write, no
// reward claim, no subscription renewal. §48 and §24 both forbid it and the
// enforcement is threefold: no function here, no amount field in the domain
// model, and no action in the catalogue. `automation-boundary.test.ts` asserts
// it by inspecting this module's exports rather than by trusting this comment.
//
// **Nothing that sends a real notification.** `simulateRun` produces a *run
// record*. It does not call B13, and it could not: this module imports no
// notification client. A development adapter that could dispatch would be a way
// to make somebody's phone buzz from a rule nobody authorized.
//
// **Nothing that grants a permission.** There is no `grantCapability`, no
// `setRole`, no way to widen `AutomationAccess`. `fetchAccess` below returns a
// **fixed** development capability set — it does not accept one, and it does
// not read one from the request. A capability set the caller could influence
// would be §49's authorization bypass with a friendly name.
//
// **Nothing platform-wide.** The development capability set has
// `canCreatePlatformWide: false` and there is no path to true. §66 requires
// that a normal member cannot create platform-wide automation, and a
// development adapter that allowed it would make the security test pass against
// production and fail against the thing developers actually use.
//
// **No real execution, ever.** `simulateRun` returns `isSimulated: true` on
// every path. There is no branch that produces `false`, which is what makes
// §57's "mock execution must never look indistinguishable from real execution"
// a property of the type rather than of a reviewer's attention.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import {
  AUTOMATION_GAPS,
  AUTOMATION_GAP_PREFIX,
  areAutomationGapsEnabled,
} from '@/config/automation-gaps';
import { backendGapError, toAutomationError } from './automation/errors';
import type {
  AutomationAccess,
  AutomationAudience,
  AutomationAuditEntry,
  AutomationDefinition,
  AutomationDraft,
  AutomationListFilters,
  AutomationOwnerKind,
  AutomationPage,
  AutomationRun,
  AutomationScope,
  SavedSearch,
  SavedSearchSubject,
} from '@/types/automation';

const PREFIX = AUTOMATION_GAP_PREFIX;

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * The guard every function in this file passes through.
 *
 * Throws rather than returning empty, and the distinction is the whole of the
 * honesty requirement. An empty result renders as "you have no automations",
 * which is a claim about the member. A rejection renders as "this build cannot
 * show you this", which is a claim about the build and is the true one.
 *
 * Every caller is `async`, so this becomes a rejected promise a `.catch()` sees
 * — a synchronous throw from a non-async function escapes the caller's catch
 * entirely, which Phase 5 learned and every phase since has copied.
 */
function assertEnabled(gapKey: string): void {
  if (areAutomationGapsEnabled()) return;
  throw backendGapError(gapKey);
}

async function read<T>(gapKey: string, path: string, params?: object): Promise<T> {
  assertEnabled(gapKey);
  try {
    const response = await apiClient.get<Envelope<T>>(`${PREFIX}${path}`, { params });
    return response.data.data;
  } catch (cause) {
    throw toAutomationError(cause, { mutating: false });
  }
}

/**
 * A paginated read, assembled from the envelope's two halves.
 *
 * The contract every list route in the register declares is
 * `{ data: T[], meta: { nextCursor, totalCount } }` — the items in `data` and
 * the pagination in `meta`, which is the shape Phases 5 through 16 use and the
 * one a real backend would serve.
 *
 * `AutomationPage<T>` puts all three in one object because that is what a
 * caller wants, so **something has to join them**. Doing it here rather than
 * changing the wire shape keeps the documented contract honest and keeps the
 * join in one place.
 *
 * This existed as a bug first: `listAutomations` returned `read<AutomationPage>`
 * directly, so `page.items` was `undefined` and the Automation Center rendered
 * a list of `undefined` — a crash on the first row. A smoke test against the
 * adapter found it; no unit test would have, because every test that touched
 * pagination used the *shape* rather than the transport.
 */
async function readPage<T>(
  gapKey: string,
  path: string,
  params?: object
): Promise<AutomationPage<T>> {
  assertEnabled(gapKey);
  try {
    const response = await apiClient.get<Envelope<T[]>>(`${PREFIX}${path}`, { params });
    const meta = (response.data.meta ?? {}) as { nextCursor?: string | null; totalCount?: number | null };

    return {
      // Defensive: a route that answered with no array at all must produce an
      // empty page rather than an undefined one. A page is the shape a list
      // screen iterates, and `undefined.map` is a white screen.
      items: Array.isArray(response.data.data) ? response.data.data : [],
      nextCursor: meta.nextCursor ?? null,
      totalCount: meta.totalCount ?? null,
    };
  } catch (cause) {
    throw toAutomationError(cause, { mutating: false });
  }
}

async function write<T>(
  gapKey: string,
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: unknown
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(`${PREFIX}${path}`)
        : await apiClient[method]<Envelope<T>>(`${PREFIX}${path}`, body);
    return response.data.data;
  } catch (cause) {
    throw toAutomationError(cause, { mutating: true });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// THE REGISTRY — GAP-001
// ═════════════════════════════════════════════════════════════════════════════

export async function listAutomations(
  scope: AutomationScope,
  filters: AutomationListFilters,
  cursor: string | null
): Promise<AutomationPage<AutomationDefinition>> {
  return readPage<AutomationDefinition>('automationRegistry', '/automations', {
    ownerKind: scope.ownerKind,
    ownerId: scope.ownerId,
    status: filters.tab === 'all' ? undefined : filters.tab,
    domain: filters.domain ?? undefined,
    communityId: filters.communityId ?? undefined,
    search: filters.search || undefined,
    cursor: cursor ?? undefined,
    // §67: never load every automation at once. Twenty is the page size the
    // contract specifies and the list is virtualized above it.
    limit: 20,
  });
}

export async function fetchAutomation(automationId: string): Promise<AutomationDefinition> {
  return read<AutomationDefinition>('automationRegistry', `/automations/${automationId}`);
}

/**
 * Create an automation.
 *
 * `idempotencyKey` is a required parameter rather than an optional one, and
 * that is the point: GAP-001's contract makes the key mandatory because a
 * retried creation without one gives the member two identical job alerts and
 * every notification twice, with no obvious cause. A signature that allowed it
 * to be omitted would let a caller omit it.
 *
 * The key comes from Phase 5's `lib/idempotency.ts` — the same module the
 * wallet uses, with an `automation` operation. §39 asks the UI to understand
 * server-enforced idempotency and the cheapest way to understand it is to
 * participate in it.
 */
export async function createAutomation(
  draft: AutomationDraft,
  idempotencyKey: string
): Promise<AutomationDefinition> {
  return write<AutomationDefinition>('automationRegistry', 'post', '/automations', {
    ...draft,
    idempotencyKey,
  });
}

export async function updateAutomation(
  automationId: string,
  changes: Partial<AutomationDraft>,
  /**
   * §40 · GAP-029: the concurrency precondition. The server 409s when the
   * automation changed on another device since this was read, so an edit made
   * on a phone cannot silently overwrite one made on a tablet.
   */
  expectedUpdatedAt: string | null
): Promise<AutomationDefinition> {
  return write<AutomationDefinition>(
    'automationRegistry',
    'patch',
    `/automations/${automationId}`,
    { ...changes, expectedUpdatedAt }
  );
}

/**
 * Change an automation's lifecycle state. §44.
 *
 * One function rather than `pause`/`resume`/`disable`, because they are one
 * server operation and three client functions would be three places to forget
 * the cancelled-run count that §40 requires the UI to report.
 */
export async function setAutomationStatus(
  automationId: string,
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'DRAFT'
): Promise<{ automation: AutomationDefinition; cancelledRuns: number }> {
  return write<{ automation: AutomationDefinition; cancelledRuns: number }>(
    'automationRegistry',
    'patch',
    `/automations/${automationId}/status`,
    { status }
  );
}

export async function deleteAutomation(
  automationId: string
): Promise<{ id: string; deleted: boolean; cancelledRuns: number }> {
  return write<{ id: string; deleted: boolean; cancelledRuns: number }>(
    'automationRegistry',
    'delete',
    `/automations/${automationId}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION — GAP-002 · GAP-004
// ═════════════════════════════════════════════════════════════════════════════

export async function listRuns(
  automationId: string | null,
  status: string | null,
  cursor: string | null
): Promise<AutomationPage<AutomationRun>> {
  return readPage<AutomationRun>('automationHistory', '/automations/runs', {
    automationId: automationId ?? undefined,
    status: status ?? undefined,
    cursor: cursor ?? undefined,
    limit: 20,
  });
}

export async function fetchRun(automationId: string, runId: string): Promise<AutomationRun> {
  return read<AutomationRun>(
    'automationHistory',
    `/automations/${automationId}/runs/${runId}`
  );
}

/**
 * Run an automation the member asked to run.
 *
 * Only ever for a `manual` trigger — GAP-002's contract refuses anything else,
 * and the reason is worth restating at the call site: "run my community
 * announcement now" is a broadcast with no event behind it, and an engine that
 * accepted it would let a client manufacture a trigger.
 *
 * There is deliberately **no** `executeAction` in this module. A caller who
 * could dispatch one action would be a caller who could send a notification
 * without a rule, without an audience check and without a run record.
 */
export async function runAutomationManually(
  automationId: string,
  idempotencyKey: string
): Promise<AutomationRun> {
  return write<AutomationRun>('automationEngine', 'post', `/automations/${automationId}/run`, {
    reason: 'manual',
    idempotencyKey,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION — GAP-006
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A server-side dry run.
 *
 * The response is forced to `isSimulated: true` **after** it arrives, on the
 * client, regardless of what the adapter said. That is not distrust of our own
 * mock — it is that this is the one function whose entire safety property is
 * "the result cannot be mistaken for a real run", and a property enforced at
 * the boundary holds even if the thing on the other side changes.
 */
export async function simulateAutomation(draft: AutomationDraft): Promise<{
  run: AutomationRun;
  wouldHaveDone: { actionKey: string; label: string; reason: string }[];
  audience: AutomationAudience | null;
}> {
  const result = await write<{
    run: AutomationRun;
    wouldHaveDone: { actionKey: string; label: string; reason: string }[];
    audience: AutomationAudience | null;
  }>('automationSimulation', 'post', '/automations/simulate', draft);

  return {
    ...result,
    run: { ...result.run, isSimulated: true },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — GAP-005
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The development capability set.
 *
 * **Takes no capability argument and reads none from the response body's
 * request.** The adapter returns a fixed set; a caller cannot ask for more.
 *
 * `canCreatePlatformWide` is `false` and there is no path to `true` anywhere in
 * this module. §66's security test — "a normal member cannot create
 * platform-wide automation" — must pass in the environment developers actually
 * run, not only in production, or it is a test of the flag rather than of the
 * rule.
 */
export async function fetchAccess(scope: AutomationScope): Promise<AutomationAccess> {
  return read<AutomationAccess>('automationAccess', '/automations/capabilities', {
    ownerKind: scope.ownerKind,
    ownerId: scope.ownerId,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIENCE — GAP-026
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How many people an automation would reach.
 *
 * Returns a **count and a description**. There is no variant of this that
 * returns members, and §50 is the reason: an audience preview that listed
 * people would be an enumeration tool for a community, reachable by anybody who
 * could create an automation.
 */
export async function fetchAudience(
  scope: AutomationScope,
  actionKeys: string[]
): Promise<AutomationAudience> {
  return write<AutomationAudience>('audienceEvaluation', 'post', '/automations/audience', {
    scope,
    actionKeys,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT — GAP-027
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchAudit(automationId: string): Promise<AutomationAuditEntry[]> {
  return read<AutomationAuditEntry[]>(
    'automationAudit',
    `/automations/${automationId}/audit`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVED SEARCHES — GAP-009
// ═════════════════════════════════════════════════════════════════════════════

export async function listSavedSearches(
  subject: SavedSearchSubject | null
): Promise<SavedSearch[]> {
  return read<SavedSearch[]>('savedSearches', '/automations/saved-searches', {
    subject: subject ?? undefined,
  });
}

export async function createSavedSearch(input: {
  subject: SavedSearchSubject;
  name: string;
  criteria: Record<string, string | number | boolean | string[]>;
  querySummary: string;
  alertsEnabled: boolean;
  alertFrequency: string;
  watchFor: string[];
}): Promise<SavedSearch> {
  return write<SavedSearch>('savedSearches', 'post', '/automations/saved-searches', input);
}

export async function updateSavedSearch(
  id: string,
  changes: Partial<Pick<SavedSearch, 'name' | 'alertsEnabled' | 'alertFrequency' | 'watchFor'>>
): Promise<SavedSearch> {
  return write<SavedSearch>('savedSearches', 'patch', `/automations/saved-searches/${id}`, changes);
}

export async function deleteSavedSearch(id: string): Promise<{ id: string; deleted: boolean }> {
  return write<{ id: string; deleted: boolean }>(
    'savedSearches',
    'delete',
    `/automations/saved-searches/${id}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REMINDERS — GAP-008
// ═════════════════════════════════════════════════════════════════════════════

export interface ReminderRecord {
  reminderId: string;
  subjectKind: string;
  subjectId: string;
  offsetMinutes: number;
  anchor: 'start' | 'end';
  /**
   * §12 requires these five to be distinguishable and never collapsed.
   * `configured` is what the member did; `scheduled` is what the platform
   * accepted; and the gap between them is what this whole register is about.
   */
  state: 'configured' | 'scheduled' | 'sent' | 'failed' | 'cancelled';
  scheduledFor: string | null;
  timeZoneId: string;
  isSimulated: boolean;
}

export async function listReminders(
  subjectKind: string,
  subjectId: string
): Promise<ReminderRecord[]> {
  return read<ReminderRecord[]>('eventReminders', '/automations/reminders', {
    subjectKind,
    subjectId,
  });
}

export async function createReminder(
  input: {
    subjectKind: string;
    subjectId: string;
    offsetMinutes: number;
    anchor: 'start' | 'end';
    channel: string;
    /** IANA, the subject's own zone. §42 — never an offset, never the device's. */
    timeZoneId: string;
  },
  idempotencyKey: string
): Promise<ReminderRecord> {
  return write<ReminderRecord>('eventReminders', 'post', '/automations/reminders', {
    ...input,
    idempotencyKey,
  });
}

export async function cancelReminder(reminderId: string): Promise<ReminderRecord> {
  return write<ReminderRecord>(
    'eventReminders',
    'delete',
    `/automations/reminders/${reminderId}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGER CONTEXT — the per-domain context routes
// ═════════════════════════════════════════════════════════════════════════════

export interface TriggerContext {
  /** What the trigger would fire on, in the member's words. */
  summary: string;
  /** The subject's own IANA zone, where it has one. §42. */
  timeZoneId: string | null;
  /** Whether the platform could observe this at all. */
  isObservable: boolean;
  /** Extra display fields, per domain. Never a credential, never an amount. */
  details: Record<string, string | number | boolean | null>;
}

export async function fetchTriggerContext(
  triggerKey: string,
  subjectId: string | null
): Promise<TriggerContext> {
  const gapKey = AUTOMATION_GAPS[triggerKey] ? triggerKey : 'automationEngine';
  return read<TriggerContext>(gapKey, '/automations/trigger-context', {
    triggerKey,
    subjectId: subjectId ?? undefined,
  });
}

/**
 * The owner scopes the development adapter knows about.
 *
 * Exported so the mock handler and the hook agree on the fixture set without
 * either importing the other's internals.
 */
export const DEVELOPMENT_OWNER_KINDS: AutomationOwnerKind[] = [
  'user',
  'creator',
  'community',
  'organization',
  'seller',
  'landlord',
  'employer',
  'provider',
];
