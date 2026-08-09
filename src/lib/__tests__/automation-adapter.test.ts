// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation transport (Frontend Phase 18)
//
// The suite that drives the adapter **over HTTP**, through the real mock
// handlers, exactly as a development build does.
//
// ── Why this exists, and the bug that caused it ──────────────────────────────
//
// Every other suite in this phase tests a *shape*: given this draft, what does
// validation say; given this capability set, what is offered; given this
// schedule, when would it fire. None of them crosses the transport, because
// none of them needs to.
//
// That left a gap, and a real crash lived in it. `listAutomations` was typed as
// returning `AutomationPage<AutomationDefinition>` and implemented as
// `read<AutomationPage<…>>(…)` — but the handler answers with the shape the
// register documents, `{ data: [...], meta: { nextCursor, totalCount } }`. So
// `read` returned the **array** as the page, `page.items` was `undefined`, and
// `useAutomations`' `flatMap(page => page.items)` produced `[undefined]`.
// The Automation Center would have rendered a list containing `undefined` and
// crashed in the key extractor on first paint.
//
// No unit test would have found it. The types agreed with themselves on both
// sides of a boundary neither test crossed. **A shape test cannot catch a
// transport bug**, and this file is the transport test.
//
// ── What it deliberately does not do ─────────────────────────────────────────
//
// It does not assert on business rules — those belong in the suites that own
// them. It asserts that every route answers, in the shape the caller expects,
// with data a screen could render. That is a narrow job and it is worth having
// exactly because it is narrow.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { setupAutomationGapMocks } from '@/mocks/handlers/automation-gaps';
import { setupNotificationMocks } from '@/mocks/handlers/notifications';
import * as gapApi from '@/lib/automation-gap-api';
import { fetchCertifiedAutomationSupport } from '@/lib/automation-api';
import { resetAutomationState } from '@/mocks/automation-gap-data';
import type {
  AutomationListFilters,
  AutomationOwnerKind,
  AutomationScope,
} from '@/types/automation';

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient);
  resetAutomationState();

  // Registered in the same order `mocks/index.ts` registers them: B13's real
  // routes first, then the gap arm, then a catch-all. An unmatched request
  // would otherwise fall through to the network and hang the suite.
  setupNotificationMocks(mock);
  setupAutomationGapMocks(mock);
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

function scopeFor(ownerKind: AutomationOwnerKind, ownerId = 'me'): AutomationScope {
  return {
    ownerKind,
    ownerId,
    ownerLabel: ownerId,
    communityIds: ownerKind === 'community' ? ['ng'] : [],
    isCrossCommunity: false,
    countryCodes: [],
    neighbourhoodIds: [],
  };
}

const FILTERS: AutomationListFilters = {
  tab: 'all',
  domain: null,
  ownerKind: null,
  communityId: null,
  search: '',
};

// ═════════════════════════════════════════════════════════════════════════════

describe('the certified arm reads B13 for real', () => {
  it('resolves the member’s channels and categories', async () => {
    const support = await fetchCertifiedAutomationSupport();

    // The in-app inbox is always present — B13's own model says it cannot be
    // switched off, and the builder relies on that to offer `notify.self`
    // unconditionally.
    expect(support.enabledChannels).toContain('InApp');
    expect(support.categories.length).toBeGreaterThan(0);
    expect(support.hasNotificationInbox).toBe(true);
  });

  it('reports every automation capability as absent, honestly', async () => {
    const support = await fetchCertifiedAutomationSupport();

    // There is no route to ask, so these are hardcoded false. Asserted so that
    // when GAP-001 ships and one of them becomes a real probe, the change is
    // deliberate rather than incidental.
    expect(support.hasRegistry).toBe(false);
    expect(support.hasExecutionEngine).toBe(false);
    expect(support.hasScheduler).toBe(false);
    expect(support.hasExecutionHistory).toBe(false);
    expect(support.hasSavedSearchEvaluation).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('paginated reads assemble a page from data and meta', () => {
  it('the automation list returns items, not a bare array', async () => {
    const page = await gapApi.listAutomations(scopeFor('user'), FILTERS, null);

    // The exact assertion the crash needed. `items` must be an array a screen
    // can iterate — not `undefined`, and not the envelope.
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page).toHaveProperty('nextCursor');
    expect(page).toHaveProperty('totalCount');
  });

  it('every item is a renderable automation', async () => {
    const page = await gapApi.listAutomations(scopeFor('user'), FILTERS, null);

    for (const automation of page.items) {
      // Every field the list row reads. An undefined `id` is the key-extractor
      // crash; an undefined `status` is a badge lookup returning undefined.
      expect(typeof automation.id).toBe('string');
      expect(typeof automation.name).toBe('string');
      expect(automation.status).toBeTruthy();
      expect(automation.support).toBeTruthy();
      expect(automation.trigger?.key).toBeTruthy();
      expect(automation.isSimulated).toBe(true);
    }
  });

  it('the run list returns items too', async () => {
    const page = await gapApi.listRuns(null, null, null);

    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);

    for (const run of page.items) {
      expect(typeof run.id).toBe('string');
      expect(run.status).toBeTruthy();
      expect(Array.isArray(run.actionOutcomes)).toBe(true);
      expect(run.isSimulated).toBe(true);
    }
  });

  it('totalCount reflects the whole set rather than the page', async () => {
    const page = await gapApi.listAutomations(scopeFor('user'), FILTERS, null);

    expect(page.totalCount).toBe(page.items.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('every owner scope answers with data a screen can render', () => {
  const scopes: AutomationOwnerKind[] = ['user', 'community', 'creator', 'seller'];

  for (const ownerKind of scopes) {
    it(`${ownerKind} lists at least one automation`, async () => {
      const page = await gapApi.listAutomations(
        scopeFor(ownerKind, ownerKind === 'community' ? 'ng' : 'me'),
        FILTERS,
        null
      );

      // The Center shows one scope at a time. A scope with no seed would show
      // an empty list the moment somebody switched to it, which reads as a
      // fault rather than as the honest empty state it would be.
      expect(page.items.length).toBeGreaterThan(0);
      for (const automation of page.items) {
        expect(automation.scope.ownerKind).toBe(ownerKind);
      }
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════

describe('every read route answers', () => {
  it('capabilities', async () => {
    const access = await gapApi.fetchAccess(scopeFor('user'));

    expect(access.provenance).toBe('server');
    expect(access.canViewAutomations).toBe(true);
    expect(access.canCreatePlatformWide).toBe(false);
  });

  it('an automation detail', async () => {
    const page = await gapApi.listAutomations(scopeFor('user'), FILTERS, null);
    const detail = await gapApi.fetchAutomation(page.items[0].id);

    expect(detail.id).toBe(page.items[0].id);
    expect(Array.isArray(detail.audit)).toBe(true);
  });

  it('a run detail', async () => {
    const runs = await gapApi.listRuns(null, null, null);
    const run = await gapApi.fetchRun(runs.items[0].automationId, runs.items[0].id);

    expect(run.id).toBe(runs.items[0].id);
    expect(run.isSimulated).toBe(true);
  });

  it('an audit trail', async () => {
    const page = await gapApi.listAutomations(scopeFor('user'), FILTERS, null);
    const audit = await gapApi.fetchAudit(page.items[0].id);

    expect(Array.isArray(audit)).toBe(true);
    for (const entry of audit) {
      expect(entry.provenance).toBe('server');
    }
  });

  it('saved searches', async () => {
    const searches = await gapApi.listSavedSearches(null);

    expect(searches.length).toBeGreaterThan(0);
    for (const search of searches) {
      // Null rather than zero: nothing has ever evaluated these, and "0 new
      // matches" would claim they were checked.
      expect(search.newMatchCount).toBeNull();
      expect(search.lastMatchedAt).toBeNull();
      expect(search.isSimulated).toBe(true);
    }
  });

  it('an audience estimate', async () => {
    const audience = await gapApi.fetchAudience(scopeFor('community', 'ng'), [
      'notify.community',
    ]);

    expect(audience.provenance).toBe('server');
    expect(audience.estimatedRecipients).toBeGreaterThan(0);
    expect(audience.serverSideFilters.length).toBeGreaterThan(0);
  });

  it('reminders, as an empty list rather than an error', async () => {
    const reminders = await gapApi.listReminders('event', 'evt-1');

    expect(Array.isArray(reminders)).toBe(true);
  });

  it('trigger context', async () => {
    const context = await gapApi.fetchTriggerContext('event.created', 'evt-1');

    expect(typeof context.summary).toBe('string');
    // Honest: the platform cannot observe a gap-backed trigger.
    expect(context.isObservable).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('the write routes round-trip', () => {
  it('create, activate, run, pause and delete', async () => {
    const created = await gapApi.createAutomation(
      {
        id: null,
        name: 'Adapter round-trip',
        description: '',
        scope: scopeFor('user'),
        source: 'builder',
        templateId: null,
        trigger: { key: 'manual.run', parameters: {} },
        conditions: [],
        actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
        schedule: null,
      },
      'idem-adapter-1'
    );

    expect(created.id).toBeTruthy();
    expect(created.isSimulated).toBe(true);
    // A new automation is a DRAFT unless it asked to be ACTIVE — the builder
    // decides, because the builder is where the dependency check ran.
    expect(created.status).toBe('DRAFT');

    const activated = await gapApi.setAutomationStatus(created.id, 'ACTIVE');
    expect(activated.automation.status).toBe('ACTIVE');
    // Nothing is scheduled, so nothing could be cancelled. Honest zero.
    expect(activated.cancelledRuns).toBe(0);

    const run = await gapApi.runAutomationManually(created.id, 'idem-adapter-2');
    // Never COMPLETED: nothing was dispatched, because the handler cannot
    // dispatch. Reporting completion would be the adapter claiming an effect.
    expect(run.status).toBe('SKIPPED');
    expect(run.isSimulated).toBe(true);
    expect(run.failureKind).toBe('backendGap');

    const paused = await gapApi.setAutomationStatus(created.id, 'PAUSED');
    expect(paused.automation.status).toBe('PAUSED');

    const deleted = await gapApi.deleteAutomation(created.id);
    expect(deleted.deleted).toBe(true);
  });

  it('refuses to manually run an event-driven automation', async () => {
    const created = await gapApi.createAutomation(
      {
        id: null,
        name: 'Event driven',
        description: '',
        scope: scopeFor('user'),
        source: 'builder',
        templateId: null,
        trigger: { key: 'event.startingSoon', parameters: {} },
        conditions: [],
        actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
        schedule: null,
      },
      'idem-adapter-3'
    );

    // GAP-002's authorization rule, enforced in the adapter as well as
    // documented: "run my community announcement now" is a broadcast with no
    // event behind it, and a client must not be able to manufacture a trigger.
    await expect(
      gapApi.runAutomationManually(created.id, 'idem-adapter-4')
    ).rejects.toBeDefined();

    await gapApi.deleteAutomation(created.id);
  });

  it('saved searches round-trip', async () => {
    const created = await gapApi.createSavedSearch({
      subject: 'jobs',
      name: 'Adapter search',
      criteria: { country: 'MU' },
      querySummary: 'Mauritius',
      alertsEnabled: true,
      alertFrequency: 'instant',
      watchFor: ['newMatch'],
    });

    expect(created.alertsEnabled).toBe(true);

    const updated = await gapApi.updateSavedSearch(created.id, { alertsEnabled: false });
    expect(updated.alertsEnabled).toBe(false);

    const deleted = await gapApi.deleteSavedSearch(created.id);
    expect(deleted.deleted).toBe(true);
  });

  it('a reminder is configured, never scheduled', async () => {
    const reminder = await gapApi.createReminder(
      {
        subjectKind: 'event',
        subjectId: 'evt-1',
        offsetMinutes: 1440,
        anchor: 'start',
        channel: 'InApp',
        timeZoneId: 'Africa/Lagos',
      },
      'idem-adapter-5'
    );

    // §12: `configured` is what the member did; `scheduled` is what the
    // platform accepted. Nothing schedules, so `scheduledFor` is null and the
    // UI renders "saved" rather than a tick.
    expect(reminder.state).toBe('configured');
    expect(reminder.scheduledFor).toBeNull();
    expect(reminder.timeZoneId).toBe('Africa/Lagos');
    expect(reminder.isSimulated).toBe(true);
  });

  it('a concurrent edit is refused rather than silently overwriting', async () => {
    const created = await gapApi.createAutomation(
      {
        id: null,
        name: 'Concurrency',
        description: '',
        scope: scopeFor('user'),
        source: 'builder',
        templateId: null,
        trigger: { key: 'manual.run', parameters: {} },
        conditions: [],
        actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
        schedule: null,
      },
      'idem-adapter-6'
    );

    // §40 · GAP-029: a stale precondition 409s so the client can show what
    // changed on the other device rather than a generic error.
    await expect(
      gapApi.updateAutomation(created.id, { name: 'Changed' }, '1999-01-01T00:00:00.000Z')
    ).rejects.toBeDefined();

    // The matching precondition succeeds.
    const current = await gapApi.fetchAutomation(created.id);
    const updated = await gapApi.updateAutomation(
      created.id,
      { name: 'Changed' },
      current.updatedAt
    );
    expect(updated.name).toBe('Changed');

    await gapApi.deleteAutomation(created.id);
  });

  it('a missing automation is a 404 rather than a silent empty answer', async () => {
    await expect(gapApi.fetchAutomation('does-not-exist')).rejects.toBeDefined();
  });
});
