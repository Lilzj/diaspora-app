// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Automation, development handlers for the REAL contract
// (Remediation Wave C-02)
//
// `Diaspora.Modules.Automation` serves 24 routes under `/api/v1/automations`.
// This file answers those routes in development, and **every shape here was
// read from `AutomationEndpointContributor.cs`, `AutomationRequests.cs` and
// `AutomationResponses.cs`** — not from what `hooks/automation.ts` expects.
//
// That distinction is the whole point of the file. The remediation's recurring
// finding, now hit in seven handlers, is:
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// `handlers/automation-gaps.ts` is the example: it served the page as
// `{ data: [...], meta: { nextCursor } }` because that is what the gap register
// declared, so the shape mismatch with the real `{ data: { items, … } }` could
// not be found by running the app. It is still registered, still under
// `/automation-gap/v0`, and now answers only the thirteen trigger-context routes
// that remain genuinely absent.
//
// ── The four properties this file enforces rather than describes ─────────────
//
// Each one is a real refusal on the real server, and each one would otherwise be
// invisible until a deployment.
//
//   1. **`idempotencyKey` is mandatory on create, in the BODY.** The module
//      reads no HTTP headers at all. A blank key is a 400 — so it is a 400 here.
//   2. **`subjectMoment` is mandatory on a reminder.** It is a non-nullable
//      `DateTimeOffset`, so an omitted field binds to `0001-01-01` rather than
//      failing; the handler catches it explicitly, and so does this one.
//   3. **`ownerId` binds as a `Guid?`.** A non-GUID value is a model-binding
//      400, which is what `'me'` would have produced on every automation screen.
//   4. **The page is `{ data: { items, nextCursor, totalCount } }`.** The
//      register declared `data[] + meta`, and a client built on that reads
//      `items === undefined` and crashes on the first row.
//
// ── What is deliberately still NOT here ─────────────────────────────────────
//
// **Nothing dispatches.** This file imports no notification client, no calendar
// capability and no financial client, exactly as the gap handler does not. A run
// created here cannot make a phone buzz or touch money.
//
// **`canCreatePlatformWide` and `canUseLocationTriggers` stay false.** Both are
// hard-coded false on the server and no code path sets either true. §66's
// security test must run against the same answer in development as in
// production, or it is a test of the flag rather than of the rule.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import {
  accessFor,
  audienceFor,
  createAutomationSimulated,
  createSavedSearchSimulated,
  deleteAutomationSimulated,
  deleteSavedSearchSimulated,
  findAutomation,
  findRun,
  listAutomationsFor,
  listRunsFor,
  listSavedSearchesFor,
  setStatusSimulated,
  updateAutomationSimulated,
  updateSavedSearchSimulated,
} from '../automation-gap-data';
import { triggerDefinition } from '@/lib/automation/triggers';
import type { AutomationRun, AutomationScope } from '@/types/automation';

const ROOT = '/automations';

type Reply = [number, unknown];

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

/**
 * `CursorPagedResult<T>` — the platform's real page, inside `data`.
 *
 * Not `{ data: [...], meta: { nextCursor } }`. See property 4 in the header.
 */
function okPage(items: unknown[], nextCursor: string | null, totalCount: number): Reply {
  return ok({ items, nextCursor, hasMore: nextCursor !== null, totalCount });
}

function problem(status: number, code: string, detail: string): Reply {
  // `code` as the platform writes it: the client reads `code`, never `title`.
  return [status, { type: `https://diaspora.app/errors/${code.toLowerCase()}`, title: code, status, detail, code }];
}

function params(config: { params?: Record<string, unknown> }): Record<string, string> {
  const source = config.params ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) result[key] = String(value);
  }
  return result;
}

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') return (config.data as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(config.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function idFrom(url: string | undefined, after: string): string | null {
  if (!url) return null;
  const match = new RegExp(`${after}/([^/?]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Property 3. ASP.NET refuses a non-GUID `ownerId` at the binder, before any
 * handler runs, and answers 400 — so a client that sent `'me'` never reached the
 * code that would have defaulted it. Reproduced here so that the failure is
 * found by running the app rather than by deploying it.
 */
function ownerIdRejection(query: Record<string, string>): Reply | null {
  const ownerId = query.ownerId;
  if (ownerId === undefined || GUID.test(ownerId)) return null;

  return problem(
    400,
    'automation.ownerId.invalid',
    `The value '${ownerId}' is not valid for ownerId.`
  );
}

/**
 * `parameters` is an **object** on every response and a **JSON string** on every
 * request. The store keeps the client's object form, so responses pass through
 * unchanged — but a request arriving with an object rather than a string is the
 * asymmetry bug, and it is refused here for the same reason the server refuses
 * it.
 */
function parameterShapeRejection(payload: Record<string, unknown>): Reply | null {
  const offenders: string[] = [];

  const check = (label: string, value: unknown) => {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      offenders.push(label);
    }
  };

  const trigger = payload.trigger as { parameters?: unknown } | undefined;
  if (trigger) check('trigger.parameters', trigger.parameters);

  const actions = (payload.actions as { parameters?: unknown }[] | undefined) ?? [];
  actions.forEach((action, index) => check(`actions[${index}].parameters`, action?.parameters));

  if (offenders.length === 0) return null;

  return problem(
    400,
    'automation.parameters.invalid',
    `Parameters must be a JSON string: ${offenders.join(', ')}.`
  );
}

export function setupAutomationMocks(mock: MockAdapter): void {
  // ── Capabilities ──────────────────────────────────────────────────────────
  //
  // First, because a broader pattern below would otherwise shadow it.

  mock.onGet(new RegExp(`${ROOT}/capabilities$`)).reply((config) => {
    const query = params(config);
    return ownerIdRejection(query) ?? ok(accessFor(query.ownerKind ?? 'user'));
  });

  // ── Runs ──────────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/runs$`)).reply((config) => {
    const query = params(config);
    const runs = listRunsFor(query.automationId ?? null, query.status ?? null);

    const limit = Number(query.limit ?? 20);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const page = runs.slice(offset, offset + limit);
    const nextCursor = offset + limit < runs.length ? String(offset + limit) : null;

    return okPage(page, nextCursor, runs.length);
  });

  mock.onGet(new RegExp(`${ROOT}/[^/]+/runs/[^/?]+$`)).reply((config) => {
    const runId = idFrom(config.url, 'runs');
    const run = runId ? findRun(runId) : undefined;
    if (!run) return problem(404, 'automation.run.notFound', 'That run could not be found.');
    return ok(run);
  });

  mock.onPost(new RegExp(`${ROOT}/[^/]+/run$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const automation = automationId ? findAutomation(automationId) : undefined;

    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }

    const trigger = triggerDefinition(automation.trigger.key);

    // The server's `NotManuallyRunnable`. A client must not be able to
    // manufacture a trigger: "run my community announcement now" is a broadcast
    // with no event behind it.
    if (trigger && trigger.delivery !== 'manual') {
      return problem(
        409,
        'automation.run.notManual',
        'This automation runs when something happens rather than when you ask it to.'
      );
    }

    const at = new Date(Date.parse('2026-08-01T09:00:00.000Z')).toISOString();

    const run: AutomationRun = {
      id: `dev-run-manual-${automation.id}`,
      automationId: automation.id,
      automationName: automation.name,
      status: 'SKIPPED',
      startedAt: at,
      completedAt: at,
      durationMs: 0,
      triggerSummary: 'You ran this yourself',
      triggeredAt: at,
      conditionOutcomes: [],
      actionOutcomes: automation.actions.map((action) => ({
        actionId: action.id,
        actionKey: action.key,
        label: action.key,
        status: 'skipped' as const,
        suppressionReason: null,
        failureKind: 'backendGap' as const,
        message: 'This development build does not dispatch.',
        resultRef: null,
        completedAt: null,
      })),
      failureKind: 'backendGap',
      failureMessage: 'This development build does not dispatch.',
      recoveryHint: 'Your setup is saved and there is nothing for you to fix.',
      correlationId: null,
      isSimulated: true,
      wasDeduplicated: false,
    };

    return ok(run);
  });

  // ── Simulation and audience ───────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/simulate$`)).reply((config) => {
    const draft = body(config);

    const rejection = parameterShapeRejection(draft);
    if (rejection) return rejection;

    const scope = (draft.scope as AutomationScope) ?? {
      ownerKind: 'user',
      ownerId: 'me',
      ownerLabel: 'You',
      communityIds: [],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    };
    const actions = (draft.actions as { key: string }[] | undefined) ?? [];

    // `AutomationSimulationResponse` — four properties, and `dependencies` is
    // one of them. The gap adapter returned three and the fourth read as
    // undefined.
    return ok({
      run: null,
      wouldHaveDone: [],
      audience: audienceFor(
        scope,
        actions.map((action) => action.key)
      ),
      dependencies: [],
    });
  });

  mock.onPost(new RegExp(`${ROOT}/audience$`)).reply((config) => {
    const payload = body(config);
    const scope = payload.scope as AutomationScope | undefined;
    const actionKeys = (payload.actionKeys as string[] | undefined) ?? [];

    if (!scope) {
      return problem(400, 'automation.scope.missing', 'A scope is required.');
    }

    // `AudienceRequest` carries both, and the count is per-action. Answering a
    // scope-only request would answer "how many people are in this scope",
    // which on a community automation is a larger and more alarming number than
    // the true one — so the omission is refused rather than papered over.
    if (actionKeys.length === 0) {
      return problem(
        400,
        'automation.audience.noActions',
        'An audience is estimated per action; name at least one.'
      );
    }

    return ok(audienceFor(scope, actionKeys));
  });

  // ── Audit, schedule, catalogue, templates, diagnostics ────────────────────

  mock.onGet(new RegExp(`${ROOT}/[^/]+/audit$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const automation = automationId ? findAutomation(automationId) : undefined;
    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }
    return ok(automation.audit);
  });

  mock.onGet(new RegExp(`${ROOT}/[^/]+/schedule$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const automation = automationId ? findAutomation(automationId) : undefined;
    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }

    return ok({
      nextRunAt: null,
      nextRunLocal: 'Not scheduled',
      timeZone: 'UTC',
      upcoming: [],
      missedCount: 0,
      isSchedulable: automation.schedule !== null && automation.schedule !== undefined,
      reason: automation.schedule ? null : 'This automation runs when something happens.',
      warnings: [],
    });
  });

  mock.onGet(new RegExp(`${ROOT}/catalog$`)).reply(() =>
    ok({ triggers: [], conditions: [], actions: [] })
  );

  mock.onGet(new RegExp(`${ROOT}/templates$`)).reply(() => ok([]));

  mock.onGet(new RegExp(`${ROOT}/diagnostics$`)).reply(() =>
    ok({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-17T00:00:00.000Z',
      days: 17,
      total: 0,
      byStatus: {},
      // Empty rather than a map of zeroes. "0 timeouts, 0 rate-limited" is
      // noise dressed as data.
      byFailureKind: {},
      // Null, not 0 or 100: a success rate over zero settled runs is a question
      // with no answer, and both available lies are ones a member would act on.
      successRate: null,
      averageDurationMs: null,
      slowestDurationMs: null,
      deduplicated: 0,
      deadLettered: 0,
      topFailingActions: [],
    })
  );

  // ── Saved searches ────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/saved-searches$`)).reply((config) => {
    const query = params(config);
    return ok(listSavedSearchesFor(query.subject ?? null));
  });

  mock.onPost(new RegExp(`${ROOT}/saved-searches$`)).reply((config) => {
    const payload = body(config);

    // `criteria` is a JSON string on the way in, exactly like `parameters`.
    if (payload.criteria !== undefined && typeof payload.criteria !== 'string') {
      return problem(
        400,
        'automation.criteria.invalid',
        'Criteria must be a JSON string on the request.'
      );
    }

    const criteria =
      typeof payload.criteria === 'string' ? safeParse(payload.criteria) : {};

    return ok(
      createSavedSearchSimulated({
        ...payload,
        // Handed to the store in its object form, because that is what a
        // response carries.
        criteria,
        querySummary: payload.querySummary ?? payload.name,
      })
    );
  });

  mock.onPatch(new RegExp(`${ROOT}/saved-searches/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'saved-searches');
    const updated = id ? updateSavedSearchSimulated(id, body(config)) : undefined;
    if (!updated) {
      return problem(404, 'automation.savedSearch.notFound', 'That saved search could not be found.');
    }
    return ok(updated);
  });

  mock.onDelete(new RegExp(`${ROOT}/saved-searches/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'saved-searches');
    if (!id) return problem(400, 'automation.savedSearch.missingId', 'An identifier is required.');
    return ok(deleteSavedSearchSimulated(id));
  });

  // ── Reminders ─────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/reminders$`)).reply((config) => {
    const query = params(config);

    // Both are required on this route, unlike most list endpoints here.
    if (!query.subjectKind || !query.subjectId) {
      return problem(
        400,
        'automation.reminder.subjectUnknown',
        'A subject kind and a subject id are both required.'
      );
    }

    return ok([]);
  });

  mock.onPost(new RegExp(`${ROOT}/reminders$`)).reply((config) => {
    const payload = body(config);

    // Property 2. `SubjectMoment` is a non-nullable `DateTimeOffset`: an
    // omitted field is not a binder error, it is `0001-01-01`, and `dueAt`
    // would land two thousand years in the past. The server checks
    // `== default` explicitly and so does this.
    const moment = payload.subjectMoment;
    if (typeof moment !== 'string' || Number.isNaN(Date.parse(moment))) {
      return problem(
        400,
        'automation.reminder.subjectUnknown',
        'A reminder needs the moment it counts back from.'
      );
    }

    if (!payload.subjectId || !payload.subjectKind) {
      return problem(
        400,
        'automation.reminder.subjectUnknown',
        'A reminder needs a subject.'
      );
    }

    const offsetMinutes = Number(payload.offsetMinutes ?? 0);

    // The server's window: from the moment itself up to thirty days before.
    if (offsetMinutes < 0 || offsetMinutes > 43_200) {
      return problem(
        400,
        'automation.schedule.invalid',
        'A reminder can be set from the moment itself up to thirty days beforehand.'
      );
    }

    const scheduledFor = new Date(Date.parse(moment) - offsetMinutes * 60_000).toISOString();

    return ok({
      reminderId: `dev-reminder-${payload.subjectId}-${offsetMinutes}`,
      subjectKind: payload.subjectKind,
      subjectId: payload.subjectId,
      offsetMinutes,
      anchor: payload.anchor === 'end' ? 'end' : 'start',
      // `scheduled`, not `configured`. The real module calls
      // `MarkScheduled(dueAt)` on creation, so §12's distinction now falls on
      // the other side of the line and the screen's tick means what it says.
      state: 'scheduled',
      scheduledFor,
      timeZoneId: payload.timeZoneId ?? 'UTC',
      isSimulated: false,
    });
  });

  mock.onDelete(new RegExp(`${ROOT}/reminders/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'reminders');
    return ok({
      reminderId: id ?? '',
      subjectKind: 'event',
      subjectId: '',
      offsetMinutes: 0,
      anchor: 'start',
      state: 'cancelled',
      scheduledFor: null,
      timeZoneId: 'UTC',
      isSimulated: false,
    });
  });

  // ── Status ────────────────────────────────────────────────────────────────

  mock.onPatch(new RegExp(`${ROOT}/[^/]+/status$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const payload = body(config);
    const status = payload.status as string | undefined;

    // Only four may be requested. `EXPIRED` and `NEEDS_ATTENTION` are
    // platform-set and refused with 409 — a UI that offers either is offering
    // something the server will not do.
    if (status === 'EXPIRED' || status === 'NEEDS_ATTENTION') {
      return problem(
        409,
        'automation.status.notRequestable',
        'That state is set by the platform, not by you.'
      );
    }

    const result = automationId
      ? setStatusSimulated(automationId, status as never)
      : undefined;

    if (!result) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }

    // `{ automation, cancelledRuns }` — pausing cancels pending occurrences and
    // says how many, so the UI can tell the member what happened rather than
    // implying nothing did.
    return ok(result);
  });

  // ── Registry ──────────────────────────────────────────────────────────────
  //
  // Last. `axios-mock-adapter` matches in registration order and
  // `/automations/{id}` would otherwise capture `/capabilities`, `/runs`,
  // `/catalog`, `/templates`, `/diagnostics` and `/saved-searches`.

  mock.onGet(new RegExp(`${ROOT}$`)).reply((config) => {
    const query = params(config);

    const rejection = ownerIdRejection(query);
    if (rejection) return rejection;

    const items = listAutomationsFor(
      query.ownerKind ?? 'user',
      // The tab vocabulary, normalised the way `ParseStatus` normalises it:
      // underscores stripped, case-insensitive, `attention` → NEEDS_ATTENTION.
      normaliseStatus(query.status ?? null),
      query.domain ?? null,
      query.search ?? null
    );

    const limit = Number(query.limit ?? 20);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const page = items.slice(offset, offset + limit);
    const nextCursor = offset + limit < items.length ? String(offset + limit) : null;

    return okPage(page, nextCursor, items.length);
  });

  mock.onPost(new RegExp(`${ROOT}$`)).reply((config) => {
    const payload = body(config);

    // Property 1. Mandatory, and in the body — this module reads no HTTP
    // headers at all. Creator, CommunityProgramme and Integrations each ship an
    // `IdempotencyHeader` class, so a developer generalising from those three
    // would move the key to a header and break creation for everybody. This
    // refusal is what makes that mistake visible in development.
    const key = payload.idempotencyKey;
    if (typeof key !== 'string' || key.trim().length === 0) {
      return problem(
        400,
        'automation.idempotencyKey.required',
        'An idempotency key is required, in the request body.'
      );
    }

    const rejection = parameterShapeRejection(payload);
    if (rejection) return rejection;

    return [201, { data: createAutomationSimulated(payload) }];
  });

  mock.onGet(new RegExp(`${ROOT}/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'automations');
    const automation = id ? findAutomation(id) : undefined;
    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }
    return ok(automation);
  });

  mock.onPatch(new RegExp(`${ROOT}/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'automations');
    const payload = body(config);
    const existing = id ? findAutomation(id) : undefined;

    if (!existing) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }

    const rejection = parameterShapeRejection(payload);
    if (rejection) return rejection;

    // The concurrency precondition, enforced rather than described. A 409
    // carrying the current record is what lets the client show the member what
    // changed on their other device instead of a generic error. Compared
    // exactly, because the server compares at millisecond resolution.
    const expected = payload.expectedUpdatedAt as string | null | undefined;
    if (expected && expected !== existing.updatedAt) {
      return [
        409,
        {
          type: 'https://diaspora.app/errors/automation.conflict',
          title: 'automation.conflict',
          status: 409,
          code: 'automation.conflict',
          detail: 'This automation was changed somewhere else.',
          data: existing,
        },
      ];
    }

    const updated = updateAutomationSimulated(id!, payload);
    if (!updated) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }
    return ok(updated);
  });

  // Idempotent: a second delete answers 200 with `deleted: true`, never 404, so
  // the UI is never left showing something that is already gone.
  mock.onDelete(new RegExp(`${ROOT}/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'automations');
    if (!id) return problem(400, 'automation.missingId', 'An identifier is required.');
    return ok(deleteAutomationSimulated(id));
  });
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** `ParseStatus`, reproduced: underscores stripped, `attention` mapped by hand. */
function normaliseStatus(value: string | null): string | null {
  if (!value || value.toLowerCase() === 'all') return null;

  const normalised = value.replace(/_/g, '').toLowerCase();
  return normalised === 'attention' ? 'NEEDS_ATTENTION' : value.toUpperCase();
}
