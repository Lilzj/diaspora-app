// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified backend has no
//   automation contract: no registry, no execution engine, no scheduler, no run
//   history, no capability set, no saved searches and no reminders. These
//   handlers exist so the Phase 18 surfaces can be built, reviewed and tested
//   now, and so that closing each gap is a change of import rather than a
//   redesign.
//
//   Four safeguards, none of which is a comment:
//
//     * The prefix is `/automation-gap/v0`, never `/automations`. A call that
//       escaped to a real deployment 404s at the gateway.
//     * `setupAutomationGapMocks` refuses to register in a release build.
//     * Every automation and every run this returns carries `isSimulated: true`,
//       and every surface that renders one renders the simulation marker — so no
//       simulated automation can reach a member claiming to be real.
//     * There is no handler that dispatches. This file imports no notification
//       client, no calendar capability and no financial client, so a simulated
//       run cannot make a phone buzz, write to a calendar or touch money.
//
//   ── What is deliberately NOT registered here ──────────────────────────────
//
//   **No money route.** Not one. §48. The financial triggers produce
//   notification-shaped runs and nothing else; there is no handler that
//   charges, refunds, credits, claims or renews.
//
//   **No dispatch route.** GAP-024's `POST /notifications/dispatch` is
//   service-to-service and must never be callable by a client. Registering a
//   simulated one would build a client-callable send path, which is the shape
//   an abuse would take, and it would then exist in the codebase for somebody
//   to point at a real backend later.
//
//   **No platform-wide capability.** `GET /capabilities` returns
//   `canCreatePlatformWide: false` for every caller, including one who asks for
//   `ownerKind=platform`. §66's security test runs against the same answer in
//   development as in production.
//
//   **No member lists.** `POST /audience` returns a count and a sentence. §50.
//
//   See `src/config/automation-gaps.ts` and
//   `frontend-phase-18-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import { AUTOMATION_GAP_PREFIX, areAutomationGapsEnabled } from '@/config/automation-gaps';
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

const ROOT = AUTOMATION_GAP_PREFIX;

type Reply = [number, unknown];

function ok(data: unknown, meta?: Record<string, unknown>): Reply {
  return [200, meta ? { data, meta } : { data }];
}

/**
 * A problem response in the shape the error normaliser expects.
 *
 * Matches the envelope Phases 5 through 16 use, so `toAutomationError` reads it
 * through the same path a real failure would take — a mock that failed
 * differently from production would test the wrong error handling.
 */
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

/** The last path segment, for the `{id}` routes. */
function idFrom(url: string | undefined, after: string): string | null {
  if (!url) return null;
  const match = new RegExp(`${after}/([^/?]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setupAutomationGapMocks(mock: MockAdapter): void {
  // The same refusal every gap handler makes. A release build registers
  // nothing, so a call that somehow reached the client 404s rather than being
  // answered with a fixture.
  if (!areAutomationGapsEnabled()) return;

  // ── Capabilities — GAP-005 ─────────────────────────────────────────────────
  //
  // Registered first because the client fetches it first and because a
  // mis-ordered registration against a broader pattern below would shadow it.

  mock.onGet(new RegExp(`${ROOT}/automations/capabilities$`)).reply((config) => {
    const query = params(config);
    return ok(accessFor(query.ownerKind ?? 'user'));
  });

  // ── Runs — GAP-002 · GAP-004 ──────────────────────────────────────────────
  //
  // Before `/automations` so `/automations/runs` is not captured by the list
  // route's pattern.

  mock.onGet(new RegExp(`${ROOT}/automations/runs$`)).reply((config) => {
    const query = params(config);
    const runs = listRunsFor(query.automationId ?? null, query.status ?? null);

    // §67: paginated even in the adapter. A fixture set that returned
    // everything would let an unpaginated screen ship, and the first member
    // with two thousand runs would find out.
    const limit = Number(query.limit ?? 20);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const page = runs.slice(offset, offset + limit);
    const nextCursor = offset + limit < runs.length ? String(offset + limit) : null;

    return ok(page, { nextCursor, totalCount: runs.length });
  });

  mock
    .onGet(new RegExp(`${ROOT}/automations/[^/]+/runs/[^/?]+$`))
    .reply((config) => {
      const runId = idFrom(config.url, 'runs');
      const run = runId ? findRun(runId) : undefined;
      if (!run) return problem(404, 'automation.run.notFound', 'That run could not be found.');
      return ok(run);
    });

  // ── Manual run — GAP-002 ──────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/automations/[^/]+/run$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const automation = automationId ? findAutomation(automationId) : undefined;

    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }

    const trigger = triggerDefinition(automation.trigger.key);

    // GAP-002's authorization rule, enforced in the adapter as well as
    // documented in the register: a client must not be able to force an
    // event-driven automation to fire. "Run my community announcement now" is a
    // broadcast with no event behind it, and an adapter that allowed it would
    // let the surface be built against something the real contract refuses.
    if (trigger && trigger.delivery !== 'manual') {
      return problem(
        409,
        'automation.run.notManual',
        'This automation runs when something happens rather than when you ask it to.'
      );
    }

    const run: AutomationRun = {
      id: `sim-run-manual-${automation.id}`,
      automationId: automation.id,
      automationName: automation.name,
      // Never COMPLETED. Nothing was dispatched, because this file cannot
      // dispatch — reporting completion would be the adapter claiming an effect
      // it did not have. §57.
      status: 'SKIPPED',
      startedAt: new Date(Date.parse('2026-08-01T09:00:00.000Z')).toISOString(),
      completedAt: new Date(Date.parse('2026-08-01T09:00:00.000Z')).toISOString(),
      durationMs: 0,
      triggerSummary: 'You ran this yourself',
      triggeredAt: new Date(Date.parse('2026-08-01T09:00:00.000Z')).toISOString(),
      conditionOutcomes: [],
      actionOutcomes: automation.actions.map((action) => ({
        actionId: action.id,
        actionKey: action.key,
        label: action.key,
        status: 'skipped' as const,
        suppressionReason: null,
        failureKind: 'backendGap' as const,
        message: 'Diaspora cannot carry this out yet.',
        resultRef: null,
        completedAt: null,
      })),
      failureKind: 'backendGap',
      failureMessage: 'Diaspora cannot run automations yet.',
      recoveryHint: 'Your setup is saved and there is nothing for you to fix.',
      correlationId: null,
      isSimulated: true,
      wasDeduplicated: false,
    };

    return ok(run);
  });

  // ── Simulation — GAP-006 ──────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/automations/simulate$`)).reply((config) => {
    const draft = body(config);
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

    // The run is built by `lib/automation/simulation.ts` on the client, which
    // is where the "nothing was performed" guarantee is structural. The adapter
    // supplies only the audience — the one part a client genuinely cannot know.
    return ok({
      run: null,
      wouldHaveDone: [],
      audience: audienceFor(
        scope,
        actions.map((action) => action.key)
      ),
    });
  });

  // ── Audience — GAP-026 ────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/automations/audience$`)).reply((config) => {
    const payload = body(config);
    const scope = payload.scope as AutomationScope | undefined;
    const actionKeys = (payload.actionKeys as string[] | undefined) ?? [];

    if (!scope) {
      return problem(400, 'automation.scope.missing', 'A scope is required.');
    }

    return ok(audienceFor(scope, actionKeys));
  });

  // ── Audit — GAP-027 ───────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/automations/[^/]+/audit$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const automation = automationId ? findAutomation(automationId) : undefined;
    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }
    return ok(automation.audit);
  });

  // ── Saved searches — GAP-009 ──────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/automations/saved-searches$`)).reply((config) => {
    const query = params(config);
    return ok(listSavedSearchesFor(query.subject ?? null));
  });

  mock
    .onPost(new RegExp(`${ROOT}/automations/saved-searches$`))
    .reply((config) => ok(createSavedSearchSimulated(body(config))));

  mock.onPatch(new RegExp(`${ROOT}/automations/saved-searches/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'saved-searches');
    const updated = id ? updateSavedSearchSimulated(id, body(config)) : undefined;
    if (!updated) {
      return problem(404, 'automation.savedSearch.notFound', 'That saved search could not be found.');
    }
    return ok(updated);
  });

  mock.onDelete(new RegExp(`${ROOT}/automations/saved-searches/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'saved-searches');
    if (!id) return problem(400, 'automation.savedSearch.missingId', 'An identifier is required.');
    return ok(deleteSavedSearchSimulated(id));
  });

  // ── Reminders — GAP-008 ───────────────────────────────────────────────────
  //
  // The state is always `configured`, never `scheduled`. §12 requires the two
  // to be distinguishable and this is the distinction made real: the member
  // configured a reminder, and nothing scheduled it, because nothing can.

  mock.onGet(new RegExp(`${ROOT}/automations/reminders$`)).reply(() => ok([]));

  mock.onPost(new RegExp(`${ROOT}/automations/reminders$`)).reply((config) => {
    const payload = body(config);
    return ok({
      reminderId: `sim-reminder-${payload.subjectId ?? 'unknown'}-${payload.offsetMinutes ?? 0}`,
      subjectKind: payload.subjectKind ?? 'event',
      subjectId: payload.subjectId ?? '',
      offsetMinutes: Number(payload.offsetMinutes ?? 0),
      anchor: payload.anchor ?? 'start',
      state: 'configured',
      // Null, and the client renders "not scheduled yet" from it. A simulated
      // time here would be a promise about a delivery nothing will make.
      scheduledFor: null,
      timeZoneId: payload.timeZoneId ?? 'UTC',
      isSimulated: true,
    });
  });

  mock.onDelete(new RegExp(`${ROOT}/automations/reminders/[^/?]+$`)).reply((config) => {
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
      isSimulated: true,
    });
  });

  // ── Trigger context ───────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/automations/trigger-context$`)).reply((config) => {
    const query = params(config);
    const trigger = triggerDefinition(query.triggerKey ?? '');

    return ok({
      summary: trigger?.label ?? 'Unknown trigger',
      timeZoneId: null,
      // The honest answer for every trigger whose support is a gap: the
      // platform cannot observe it. A `true` here would tell the dependency
      // check something the register says is false.
      isObservable: trigger ? trigger.support !== 'BACKEND_GAP' : false,
      details: {},
    });
  });

  // ── Status — GAP-001 · §44 ────────────────────────────────────────────────

  mock.onPatch(new RegExp(`${ROOT}/automations/[^/]+/status$`)).reply((config) => {
    const automationId = idFrom(config.url, 'automations');
    const payload = body(config);
    const result = automationId
      ? setStatusSimulated(automationId, payload.status as never)
      : undefined;

    if (!result) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }
    return ok(result);
  });

  // ── Registry — GAP-001 ────────────────────────────────────────────────────
  //
  // Registered last. `axios-mock-adapter` matches in registration order, and
  // `/automations/{id}` would otherwise capture `/automations/capabilities`,
  // `/automations/runs` and `/automations/saved-searches`.

  mock.onGet(new RegExp(`${ROOT}/automations$`)).reply((config) => {
    const query = params(config);
    const items = listAutomationsFor(
      query.ownerKind ?? 'user',
      query.status ?? null,
      query.domain ?? null,
      query.search ?? null
    );

    const limit = Number(query.limit ?? 20);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const page = items.slice(offset, offset + limit);
    const nextCursor = offset + limit < items.length ? String(offset + limit) : null;

    return ok(page, { nextCursor, totalCount: items.length });
  });

  mock
    .onPost(new RegExp(`${ROOT}/automations$`))
    .reply((config) => ok(createAutomationSimulated(body(config))));

  mock.onGet(new RegExp(`${ROOT}/automations/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'automations');
    const automation = id ? findAutomation(id) : undefined;
    if (!automation) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }
    return ok(automation);
  });

  mock.onPatch(new RegExp(`${ROOT}/automations/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'automations');
    const payload = body(config);
    const existing = id ? findAutomation(id) : undefined;

    if (!existing) {
      return problem(404, 'automation.notFound', 'That automation could not be found.');
    }

    // §40 · GAP-029's optimistic concurrency, enforced rather than described.
    // A 409 carrying the current record is what lets the client show the member
    // what changed on their other device instead of a generic error.
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

  mock.onDelete(new RegExp(`${ROOT}/automations/[^/?]+$`)).reply((config) => {
    const id = idFrom(config.url, 'automations');
    if (!id) return problem(400, 'automation.missingId', 'An identifier is required.');
    return ok(deleteAutomationSimulated(id));
  });
}
