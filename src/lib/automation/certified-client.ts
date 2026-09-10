// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation, certified arm (Remediation Wave C-02)
//
// `lib/automation-api.ts` opens by saying, correctly for its time:
//
//   > **There is no certified automation contract.** Not a partial one. The
//   > audit searched for automation, rule, workflow, trigger, scheduler, job,
//   > queue and outbox across the whole surface and found nothing an automation
//   > could be built on.
//
// `Diaspora.Modules.Automation` now serves 24 routes under `/api/v1/automations`,
// and twenty of them match the paths and parameters `config/automation-gaps.ts`
// declared, exactly. That is the gap-adapter pattern paying out: the swap is a
// client, not a redesign.
//
// This file is that client. It is deliberately separate from `automation-api.ts`
// — which owns the *composition* helpers over B13 notification preferences —
// so the routes and the composition do not have to be reviewed together.
//
// ── Three things the register could not have known ───────────────────────────
//
// Each was found by reading `Diaspora.Modules.Automation` rather than by
// trusting the declared contract, and each would have produced a broken client.
//
// **1. Idempotency is a body field, and it is mandatory.** The module reads no
// HTTP headers at all. `POST /automations` requires `idempotencyKey` *inside*
// the JSON body; blank is a 400. This is worth stating because Creator,
// CommunityProgramme and Integrations each ship an `IdempotencyHeader` class —
// a developer generalising from those three would move the key to a header and
// break creation for everybody.
//
// **2. `parameters` is asymmetric.** On the request it is a **JSON string**
// holding a flat scalar bag, capped at 2048 characters, and a nested object or
// an array of objects is a 400. On the response it is an **object** of
// `string → string | null`. A client that round-trips a definition without
// converting sends `[object Object]`. See `serializeParameters` below.
//
// **3. The page shape is not the one the register declared.** The gap adapter
// reads `{ data: T[], meta: { nextCursor, totalCount } }`. The real routes
// return `{ data: { items, nextCursor, totalCount } }`. `readPage` from
// `lib/platform-envelope.ts` already knows both, which is why it exists.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';
import { readPage } from '../platform-envelope';
import { toAutomationError } from './errors';
import type { ReminderRecord } from '../automation-gap-api';
import type {
  AutomationAccess,
  AutomationAudience,
  AutomationAuditEntry,
  AutomationDefinition,
  AutomationDraft,
  AutomationListFilters,
  AutomationPage,
  AutomationRun,
  AutomationScope,
  SavedSearch,
  SavedSearchSubject,
} from '@/types/automation';

const ROOT = '/automations';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * An owner id the routes can actually bind.
 *
 * `ownerKind` is a string on the wire but **`ownerId` is a `Guid?`**, and
 * `usePersonalScope()` supplies the literal `'me'` whenever the member id is not
 * yet known — a signed-out reader, or the tick before `restore()` resolves. Sent
 * as-is that is a model-binding failure: 400 on a route that would otherwise
 * have answered, on every automation screen, for a value the client invented as
 * a cache-key placeholder rather than as an identity.
 *
 * Omitting it is not a workaround. Every one of these routes defaults an absent
 * owner to the token's own subject, which is what `'me'` was trying to say.
 */
function bindableOwnerId(ownerId: string | null | undefined): string | undefined {
  if (!ownerId) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)
    ? ownerId
    : undefined;
}

/** The server's cap. Exceeding it is a 400 rather than a truncation. */
const MAX_PARAMETER_JSON = 2048;

/**
 * Turns a parameter bag into the JSON **string** the write routes bind.
 *
 * The server accepts a flat bag of scalars. Anything nested is refused, so an
 * array is joined rather than serialised as an array — the response type is
 * `string | null` per key, so a joined string is what comes back anyway and
 * round-tripping stays stable.
 *
 * `null` and `undefined` are dropped rather than sent as the strings `"null"`
 * and `"undefined"`, which is what `String(value)` would have produced and what
 * a condition would then have matched against.
 */
export function serializeParameters(
  parameters: Record<string, unknown> | null | undefined
): string {
  if (!parameters) return '{}';

  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      // Joined, not JSON-encoded: the server refuses nested structures and
      // returns every value as a string.
      flat[key] = value.filter((item) => item !== null && item !== undefined).join(',');
      continue;
    }

    if (typeof value === 'object') {
      // A nested object is a 400. Dropping it loses a parameter; sending it
      // loses the whole request, and the member is told their automation is
      // invalid for a reason they cannot act on.
      continue;
    }

    flat[key] = String(value);
  }

  const encoded = JSON.stringify(flat);

  if (encoded.length > MAX_PARAMETER_JSON) {
    throw toAutomationError(
      new Error('Parameters too large'),
      { mutating: true }
    );
  }

  return encoded;
}

/** Shapes a draft's trigger/conditions/actions into what the write routes bind. */
function toWriteBody(draft: Partial<AutomationDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (draft.name !== undefined) body.name = draft.name;
  if (draft.description !== undefined) body.description = draft.description;
  if (draft.scope !== undefined) body.scope = draft.scope;
  if (draft.source !== undefined) body.source = draft.source;
  if (draft.templateId !== undefined) body.templateId = draft.templateId;
  if (draft.schedule !== undefined) body.schedule = draft.schedule;

  // `AutomationDraft` carries no status — a draft is not yet a lifecycle state.
  // The create route accepts `DRAFT` or `ACTIVE` and defaults sensibly, and
  // every later transition goes through `setAutomationStatus`, which is the
  // route that enforces the transition matrix.

  if (draft.trigger) {
    body.trigger = {
      key: draft.trigger.key,
      parameters: serializeParameters(
        draft.trigger.parameters as Record<string, unknown> | undefined
      ),
    };
  }

  if (draft.conditions !== undefined) {
    body.conditions = draft.conditions.map((condition) => ({
      id: condition.id ?? null,
      key: condition.key,
      operator: condition.operator,
      value: condition.value == null ? null : String(condition.value),
      secondaryValue:
        condition.secondaryValue == null ? null : String(condition.secondaryValue),
    }));
  }

  if (draft.actions !== undefined) {
    body.actions = draft.actions.map((action) => ({
      id: action.id ?? null,
      key: action.key,
      parameters: serializeParameters(
        action.parameters as Record<string, unknown> | undefined
      ),
    }));
  }

  return body;
}

async function get<T>(path: string, params?: object): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(`${ROOT}${path}`, { params });
    return response.data.data;
  } catch (cause) {
    throw toAutomationError(cause, { mutating: false });
  }
}

async function send<T>(
  method: 'post' | 'patch' | 'delete',
  path: string,
  body?: unknown
): Promise<T> {
  try {
    const url = `${ROOT}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(url)
        : method === 'patch'
          ? await apiClient.patch<Envelope<T>>(url, body)
          : await apiClient.post<Envelope<T>>(url, body);
    return response.data.data;
  } catch (cause) {
    throw toAutomationError(cause, { mutating: true });
  }
}

// ── The registry ─────────────────────────────────────────────────────────────

export async function listAutomations(
  scope: AutomationScope,
  filters: AutomationListFilters,
  cursor: string | null
): Promise<AutomationPage<AutomationDefinition>> {
  try {
    const response = await apiClient.get<unknown>(ROOT, {
      params: {
        ownerKind: scope.ownerKind,
        ownerId: bindableOwnerId(scope.ownerId),
        // The tab vocabulary is sent unchanged and that is deliberate.
        // `ListAutomationsQueryHandler.ParseStatus` strips underscores and
        // compares case-insensitively, and maps the client's `attention` tab
        // onto `NEEDS_ATTENTION` by name — the server was written to accept the
        // client's filter words. Upper-casing here would still work; mapping
        // `attention` to a guessed enum name would silently empty the tab.
        status: filters.tab === 'all' ? undefined : filters.tab,
        domain: filters.domain ?? undefined,
        communityId: filters.communityId ?? undefined,
        search: filters.search || undefined,
        cursor: cursor ?? undefined,
        limit: 20,
      },
    });

    // `{ data: { items, nextCursor, totalCount } }` — not the `data[] + meta`
    // shape the gap register declared.
    const page = readPage<AutomationDefinition>(response.data);
    return { items: page.items, nextCursor: page.nextCursor, totalCount: page.totalCount };
  } catch (cause) {
    throw toAutomationError(cause, { mutating: false });
  }
}

export function fetchAutomation(automationId: string): Promise<AutomationDefinition> {
  return get<AutomationDefinition>(`/${encodeURIComponent(automationId)}`);
}

/**
 * Creates an automation.
 *
 * `idempotencyKey` is a required parameter for the same reason the server makes
 * it a required field: a retried creation without one gives the member two
 * identical job alerts and every notification twice, with no obvious cause.
 *
 * It goes in the **body**. See the file header.
 */
export function createAutomation(
  draft: AutomationDraft,
  idempotencyKey: string
): Promise<AutomationDefinition> {
  return send<AutomationDefinition>('post', '', {
    ...toWriteBody(draft),
    idempotencyKey,
  });
}

/**
 * Applies an edit.
 *
 * `expectedUpdatedAt` is the concurrency precondition: the server 409s when the
 * automation changed on another device since this was read, so an edit made on
 * a phone cannot silently overwrite one made on a tablet. Compared at
 * millisecond resolution, so the value must be echoed back exactly as received.
 */
export function updateAutomation(
  automationId: string,
  changes: Partial<AutomationDraft>,
  expectedUpdatedAt?: string | null
): Promise<AutomationDefinition> {
  return send<AutomationDefinition>('patch', `/${encodeURIComponent(automationId)}`, {
    ...toWriteBody(changes),
    expectedUpdatedAt: expectedUpdatedAt ?? undefined,
  });
}

/**
 * Moves an automation through its lifecycle.
 *
 * Only `ACTIVE`, `PAUSED`, `DISABLED` and `DRAFT` may be requested. `EXPIRED`
 * and `NEEDS_ATTENTION` are platform-set and refused with 409 — a UI that offers
 * either is offering something the server will not do.
 *
 * Activation re-validates the whole rule and enforces a 50-active ceiling, so a
 * 400 here is a real answer rather than a transport failure.
 */
export async function setAutomationStatus(
  automationId: string,
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'DRAFT'
): Promise<{ automation: AutomationDefinition; cancelledRuns: number }> {
  return send<{ automation: AutomationDefinition; cancelledRuns: number }>(
    'patch',
    `/${encodeURIComponent(automationId)}/status`,
    { status }
  );
}

/** Deletes an automation. Idempotent: a second call answers 200, never 404. */
export function deleteAutomation(
  automationId: string
): Promise<{ id: string; deleted: boolean; cancelledRuns: number }> {
  return send<{ id: string; deleted: boolean; cancelledRuns: number }>(
    'delete',
    `/${encodeURIComponent(automationId)}`
  );
}

export function fetchAudit(automationId: string): Promise<AutomationAuditEntry[]> {
  return get<AutomationAuditEntry[]>(`/${encodeURIComponent(automationId)}/audit`);
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export async function listRuns(
  filters: { automationId?: string | null; status?: string | null; triggerKey?: string | null },
  cursor: string | null
): Promise<AutomationPage<AutomationRun>> {
  try {
    const response = await apiClient.get<unknown>(`${ROOT}/runs`, {
      params: {
        automationId: filters.automationId ?? undefined,
        status: filters.status ?? undefined,
        triggerKey: filters.triggerKey ?? undefined,
        cursor: cursor ?? undefined,
        limit: 20,
      },
    });

    const page = readPage<AutomationRun>(response.data);
    return { items: page.items, nextCursor: page.nextCursor, totalCount: page.totalCount };
  } catch (cause) {
    throw toAutomationError(cause, { mutating: false });
  }
}

export function fetchRun(automationId: string, runId: string): Promise<AutomationRun> {
  return get<AutomationRun>(
    `/${encodeURIComponent(automationId)}/runs/${encodeURIComponent(runId)}`
  );
}

/**
 * Runs an automation now.
 *
 * Only legal when the trigger is `manual.run`; anything else is a 400
 * `NotManuallyRunnable`. The key is namespaced `manual:{key}` server-side.
 */
export function runAutomationManually(
  automationId: string,
  idempotencyKey?: string
): Promise<AutomationRun> {
  return send<AutomationRun>('post', `/${encodeURIComponent(automationId)}/run`, {
    reason: 'manual',
    idempotencyKey: idempotencyKey ?? undefined,
  });
}

// ── Capability, catalogue and templates ──────────────────────────────────────

/**
 * What this member may actually do, computed live for the scope.
 *
 * Not a catalogue — that is `fetchCatalog`. It carries `maxActiveAutomations`
 * and `activeAutomations`, so a UI can say "43 of 50" from the server rather
 * than counting locally and disagreeing.
 *
 * `canCreatePlatformWide` and `canUseLocationTriggers` are hard-coded false on
 * the server; no code path grants either. An affordance for them is an
 * affordance the platform cannot honour.
 */
export function fetchAccess(scope: AutomationScope): Promise<AutomationAccess> {
  return get<AutomationAccess>('/capabilities', {
    ownerKind: scope.ownerKind,
    ownerId: bindableOwnerId(scope.ownerId),
  });
}

/**
 * One entry in the published vocabulary.
 *
 * `isAvailable` is the field that matters and the reason this is typed rather
 * than `unknown`: the deployment does not publish a list of what it *can* do, it
 * publishes the whole vocabulary annotated with what it cannot. `location.enteredArea`
 * is in the catalogue with `isAvailable: false` and a sentence saying background
 * location is not implemented. Reading the list without reading the flag is how a
 * client offers a trigger nothing will ever fire.
 */
export interface AutomationCatalogEntry {
  key: string;
  domain: string | null;
  isAvailable: boolean;
  unavailableReason: string | null;
  requiredCapability: string | null;
  allowedOwners: string[] | null;
}

export interface AutomationCatalog {
  triggers: AutomationCatalogEntry[];
  conditions: AutomationCatalogEntry[];
  actions: AutomationCatalogEntry[];
}

/** The static vocabulary: 49 triggers, 22 conditions, 12 actions. */
export async function fetchCatalog(): Promise<AutomationCatalog> {
  const raw = await get<Partial<AutomationCatalog>>('/catalog');
  return {
    triggers: raw?.triggers ?? [],
    conditions: raw?.conditions ?? [],
    actions: raw?.actions ?? [],
  };
}

/** Is `key` published *and* available in this deployment? */
export function isCatalogEntryAvailable(
  entries: AutomationCatalogEntry[],
  key: string
): boolean {
  return entries.some((entry) => entry.key === key && entry.isAvailable);
}

/**
 * One template as the deployment publishes it.
 *
 * **Deliberately not `AutomationTemplate`.** The client's own template type
 * carries `schedule`, `fields` and `requiredIntegrations`, and
 * `AutomationTemplateResponse` carries none of the three: a served template is a
 * composition of catalogue entries, and the form a member fills in to configure
 * one is this build's business. Typing the response as the richer client type
 * would make three required fields silently `undefined`, which is how a form
 * renders empty rather than erroring.
 *
 * `support` and `gapKeys` are the server's own assessment, computed from the
 * catalogue keys the template is built from — so a template whose trigger became
 * unobservable reports a gap without anybody editing it.
 */
export interface PublishedAutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  domain: string;
  trigger: { key: string } & Record<string, unknown>;
  conditions: unknown[];
  actions: unknown[];
  allowedOwners: string[];
  requiredCapabilities: string[];
  support: string;
  gapKeys: string[];
}

/**
 * The templates this deployment publishes, filtered to what the member may create.
 *
 * A bare list — `ListTemplatesQuery` is
 * `IQuery<IReadOnlyList<AutomationTemplateResponse>>` — and it is **filtered, not
 * annotated**: a template whose capabilities the member lacks is not in the
 * response at all. The server's reason is worth repeating because it constrains
 * what a client may infer from an absence: a greyed-out "Create a community-wide
 * announcement" tells an ordinary member that such a thing exists, that somebody
 * can send them, and that they are not that person.
 *
 * The consequence for a caller is that **an absence here is ambiguous**. A
 * template id missing from this list is either one the member may not create or
 * one this deployment does not publish, and the route cannot distinguish them
 * because the unfiltered catalogue is never served. Nothing may hide a
 * client-side template on the strength of it.
 */
export function fetchTemplates(
  params: { category?: string; ownerKind?: string } = {}
): Promise<PublishedAutomationTemplate[]> {
  return get<PublishedAutomationTemplate[]>('/templates', params);
}

export function fetchSchedule(automationId: string): Promise<unknown> {
  return get<unknown>(`/${encodeURIComponent(automationId)}/schedule`);
}

export function fetchDiagnostics(
  params: { automationId?: string; triggerKey?: string; days?: number } = {}
): Promise<unknown> {
  return get<unknown>('/diagnostics', params);
}

// ── Simulation ───────────────────────────────────────────────────────────────

export interface AutomationSimulationResult {
  run: AutomationRun;
  wouldHaveDone: { actionKey: string; label: string; reason: string }[];
  audience: AutomationAudience | null;
  dependencies: {
    kind: string;
    label: string;
    state: string;
    detail: string;
    gapId: string | null;
    blocksActivation: boolean;
  }[];
}

/**
 * A dry run. Rate-limited to 60 an hour per member; a 429 here is real.
 *
 * `isSimulated` is forced to `true` on the way out, exactly as the development
 * arm does, and for the same reason: this is the one function whose entire
 * safety property is *"the result cannot be mistaken for a real run"*, and a
 * property enforced at the boundary survives a change on the other side of it.
 * The server does set it — `SimulateAutomationCommandHandler` builds the run
 * with `IsSimulated = true` — so this is belt and braces, which is the correct
 * amount for §57.
 */
export async function simulateAutomation(
  draft: AutomationDraft,
  sampleSubjectId?: string | null
): Promise<AutomationSimulationResult> {
  const result = await send<AutomationSimulationResult>('post', '/simulate', {
    ...toWriteBody(draft),

    // **The field that made the difference between a test and a formality.**
    // `SampleSubjectId` has been on the request since it shipped and this client
    // never sent one, so the platform built its trigger context with an empty
    // values dictionary and answered every condition with "this trigger does
    // not carry the information the check needs" — for triggers that carry it.
    // Two ends of one contract, each correct on its own terms, adding up to a
    // dry run that could not fail and could not pass.
    ...(sampleSubjectId ? { sampleSubjectId } : {}),
  });

  return { ...result, run: { ...result.run, isSimulated: true } };
}

// ── Trigger context ──────────────────────────────────────────────────────────

/**
 * What a trigger would be checked against, for one subject.
 *
 * **One route, where `config/automation-gaps.ts` declared thirteen** — one per
 * domain, each with its own response shape, and six of them naming a path
 * parameter their own declared endpoint had no room for
 * (`request: 'jobId: string'` against `GET /automations/triggers/jobs/context`).
 * That is how long that list had gone unread. What they all describe is a
 * single type the platform already builds on every run.
 */
export interface AutomationTriggerContext {
  triggerKey: string;
  /** `event`, `job`, `listing`… or null where the trigger is about no one thing. */
  subjectKind: string | null;
  subjectId: string | null;
  title: string | null;
  /** An instant. Render it in `timeZoneId`, never in the device's zone. §42. */
  moment: string | null;
  timeZoneId: string | null;
  /**
   * Whether the platform could describe this subject at all.
   *
   * **False is an answer, not an error.** A subject whose module has no source,
   * one the member cannot see, and one that does not exist all land here, and
   * `summary` says which in words a member can act on.
   */
  isObservable: boolean;
  summary: string;
  /**
   * The condition values this subject answers.
   *
   * Sensitive conditions are named in `answers` and never quoted here, because
   * a run record does not quote them either.
   */
  values: Record<string, string | null>;
  answers: string[];
}

export function fetchTriggerContext(
  triggerKey: string,
  subjectId: string | null
): Promise<AutomationTriggerContext> {
  return get<AutomationTriggerContext>('/trigger-context', {
    triggerKey,
    ...(subjectId ? { subjectId } : {}),
  });
}

/**
 * How many people an action would reach.
 *
 * **`actionKeys` is required, not decorative.** `AudienceRequest` carries both
 * `Scope` and `ActionKeys`, and the count is per-action: `notify.community`
 * reaches a community, `notify.followers` reaches followers, and an action that
 * reaches nobody but the owner answers `self`. Sending the scope alone asks
 * "how many people are in this scope", which is a different question and — on a
 * community automation — a larger and more alarming number than the true one.
 *
 * `estimatedRecipients` is null both when the count is unavailable **and** when
 * it is between 1 and 9 — the server suppresses small audiences rather than
 * letting a member count a community. Null is not an error.
 */
export function fetchAudience(
  scope: AutomationScope,
  actionKeys: string[]
): Promise<AutomationAudience> {
  return send<AutomationAudience>('post', '/audience', { scope, actionKeys });
}

// ── Saved searches and reminders ─────────────────────────────────────────────

export function listSavedSearches(
  subject: SavedSearchSubject | null
): Promise<SavedSearch[]> {
  return get<SavedSearch[]>('/saved-searches', subject ? { subject } : undefined);
}

export function createSavedSearch(input: {
  subject: SavedSearchSubject;
  name: string;
  criteria: Record<string, string | number | boolean | string[]>;
  querySummary: string;
  alertsEnabled: boolean;
  alertFrequency: string;
  watchFor: string[];
}): Promise<SavedSearch> {
  return send<SavedSearch>('post', '/saved-searches', {
    subject: input.subject,
    name: input.name,
    // Criteria is a JSON string on the way in and an object on the way out,
    // exactly like `parameters`.
    criteria: serializeParameters(input.criteria),
    // `request.QuerySummary ?? request.Name` — omitting it does not fail, it
    // quietly labels every saved search with its own name, so a housing search
    // reads "My search" where it should read "£1,200 · 2 bed · Peckham".
    querySummary: input.querySummary,
    alertsEnabled: input.alertsEnabled,
    alertFrequency: input.alertFrequency,
    watchFor: input.watchFor,
  });
}

export function updateSavedSearch(
  savedSearchId: string,
  changes: { name?: string; alertsEnabled?: boolean; alertFrequency?: string; watchFor?: string[] }
): Promise<SavedSearch> {
  // Criteria are deliberately not editable on this route; a changed search is a
  // new one, because the server fingerprints criteria for idempotency.
  return send<SavedSearch>('patch', `/saved-searches/${encodeURIComponent(savedSearchId)}`, changes);
}

export function deleteSavedSearch(
  savedSearchId: string
): Promise<{ id: string; deleted: boolean }> {
  return send<{ id: string; deleted: boolean }>(
    'delete',
    `/saved-searches/${encodeURIComponent(savedSearchId)}`
  );
}

export function listReminders(
  subjectKind: string,
  subjectId: string
): Promise<ReminderRecord[]> {
  // Both are required on this route, unlike most list endpoints here.
  return get<ReminderRecord[]>('/reminders', { subjectKind, subjectId });
}

/**
 * Sets a reminder.
 *
 * **`subjectMoment` is what the offset counts back from, and the development
 * arm never had it.** `CreateReminderRequest.SubjectMoment` is a non-nullable
 * `DateTimeOffset`, so an omitted field is not an error at the binder — it is
 * `0001-01-01`, and `dueAt` would land two thousand years in the past. The
 * handler catches exactly that (`request.SubjectMoment == default` →
 * `ReminderSubjectUnknown`), which turns a silent absurdity into a clean 400 —
 * but a 400 on every reminder is still no reminders, so the caller must supply
 * the moment. It is a required field here for that reason.
 *
 * **There is no `channel`.** The development arm accepted one and the server has
 * no such property: delivery is decided by the member's notification
 * preferences, which is the right owner for it — a reminder that hard-coded
 * `InApp` would ignore somebody who had asked for push and nothing else. The
 * caller's channel choice is dropped here rather than sent and ignored, so the
 * omission is visible in one place.
 */
export function createReminder(input: {
  subjectKind: string;
  subjectId: string;
  subjectTitle?: string;
  /** ISO-8601 instant. The subject's own start (or end), not the device's clock. */
  subjectMoment: string;
  offsetMinutes: number;
  anchor?: 'start' | 'end';
  /** IANA, the subject's own. An unknown zone is refused rather than defaulted. */
  timeZoneId?: string;
  idempotencyKey?: string;
}): Promise<ReminderRecord> {
  return send<ReminderRecord>('post', '/reminders', input);
}

/** Idempotent: cancelling a cancelled reminder answers 200 with the same body. */
export function cancelReminder(reminderId: string): Promise<ReminderRecord> {
  return send<ReminderRecord>('delete', `/reminders/${encodeURIComponent(reminderId)}`);
}
