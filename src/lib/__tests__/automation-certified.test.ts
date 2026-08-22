// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation, certified arm (Remediation Wave C-02)
//
// `lib/automation-api.ts` states that no certified automation contract exists.
// That was true when written; `Diaspora.Modules.Automation` now serves 24 routes
// and twenty match the declared contract exactly.
//
// These tests pin the three details that do **not** match, because each one
// produces a client that compiles, looks right, and fails against the real
// server. None of them would be caught by a test written from the gap register.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import * as automation from '../automation/certified-client';
import { serializeParameters } from '../automation/certified-client';
import type { AutomationDraft, AutomationScope } from '@/types/automation';

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

function envelope<T>(data: T) {
  return { data, meta: { requestId: 'r', correlationId: 'c', timestamp: 'now' } };
}

const scope = { ownerKind: 'user', ownerId: 'u1' } as unknown as AutomationScope;

/**
 * `ownerId` binds as a `Guid?` on every route that takes one, so a scope used
 * to assert what reaches the wire has to carry a real one. `'u1'` above is kept
 * for the tests that never inspect the parameter.
 */
const OWNER_GUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const guidScope = {
  ownerKind: 'user',
  ownerId: OWNER_GUID,
} as unknown as AutomationScope;

// ── 1. `parameters` is asymmetric ────────────────────────────────────────────

describe('the parameters asymmetry', () => {
  it('serialises a parameter bag to a JSON string on the way out', () => {
    // The route binds a *string*. An object reaches the server as
    // "[object Object]" and is refused — or worse, stored.
    const encoded = serializeParameters({ countryCode: 'GB', minSalary: 40000, remote: true });

    expect(typeof encoded).toBe('string');
    expect(JSON.parse(encoded)).toEqual({
      countryCode: 'GB',
      minSalary: '40000',
      remote: 'true',
    });
  });

  it('joins an array rather than nesting one', () => {
    // A nested structure is a 400. The response type is `string | null` per key,
    // so a joined string is what comes back anyway and the round trip is stable.
    const encoded = serializeParameters({ categories: ['tech', 'finance'] });

    expect(JSON.parse(encoded)).toEqual({ categories: 'tech,finance' });
  });

  it('drops a nested object instead of losing the whole request', () => {
    const encoded = serializeParameters({ good: 'yes', bad: { nested: true } });

    // Losing one parameter is recoverable. Sending it costs the request and
    // tells the member their automation is invalid for a reason they cannot act on.
    expect(JSON.parse(encoded)).toEqual({ good: 'yes' });
  });

  it('drops null and undefined rather than stringifying them', () => {
    const encoded = serializeParameters({ a: null, b: undefined, c: 'kept' });

    // `String(null)` is `"null"`, which a condition would then match against.
    expect(JSON.parse(encoded)).toEqual({ c: 'kept' });
  });

  it('refuses a bag past the server’s 2048-character ceiling', () => {
    const huge = { blob: 'x'.repeat(3000) };

    expect(() => serializeParameters(huge)).toThrow();
  });

  it('sends the serialised form on the wire', async () => {
    api.onPost('/automations').reply(201, envelope({ id: 'a1' }));

    await automation.createAutomation(
      {
        name: 'Job alert',
        trigger: { key: 'savedSearch.newMatch', parameters: { countryCode: 'GB' } },
        actions: [{ key: 'notify.push', parameters: {} }],
      } as unknown as AutomationDraft,
      'key-1'
    );

    const body = JSON.parse(api.history.post[0].data);
    expect(typeof body.trigger.parameters).toBe('string');
    expect(JSON.parse(body.trigger.parameters)).toEqual({ countryCode: 'GB' });
  });
});

// ── 2. Idempotency is a body field, not a header ─────────────────────────────

describe('idempotency', () => {
  it('sends the key in the body', async () => {
    api.onPost('/automations').reply(201, envelope({ id: 'a1' }));

    await automation.createAutomation(
      {
        name: 'Job alert',
        trigger: { key: 'manual.run', parameters: {} },
        actions: [{ key: 'notify.self', parameters: {} }],
      } as unknown as AutomationDraft,
      'idem-123'
    );

    const call = api.history.post[0];
    // The module reads no HTTP headers at all. Creator, CommunityProgramme and
    // Integrations each ship an `IdempotencyHeader` class — generalising from
    // those three and moving the key to a header breaks creation for everybody,
    // because the server treats a blank body key as a 400.
    expect(JSON.parse(call.data).idempotencyKey).toBe('idem-123');
    expect(call.headers?.['Idempotency-Key']).toBeUndefined();
  });
});

// ── 3. The page shape is not the one the register declared ───────────────────

describe('list paging', () => {
  it('reads items from inside data, not from data plus meta', async () => {
    // The gap adapter reads `{ data: T[], meta: { nextCursor, totalCount } }`.
    // The real route returns the page *inside* `data`. A client built on the
    // declared shape gets `items === undefined` and crashes on the first row —
    // which is a bug this repository has already had once, on the adapter.
    api.onGet('/automations').reply(
      200,
      envelope({
        items: [{ id: 'a1' }, { id: 'a2' }],
        nextCursor: 'cur-2',
        totalCount: 7,
      })
    );

    const page = await automation.listAutomations(
      scope,
      { tab: 'all' } as never,
      null
    );

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('cur-2');
    expect(page.totalCount).toBe(7);
  });

  it('sends the scope and a bounded page size', async () => {
    api.onGet('/automations').reply(200, envelope({ items: [], nextCursor: null, totalCount: 0 }));

    await automation.listAutomations(guidScope, { tab: 'all' } as never, null);

    const params = api.history.get[0].params;
    expect(params.ownerKind).toBe('user');
    expect(params.ownerId).toBe(OWNER_GUID);
    // Never load every automation at once; the server clamps to 100 anyway.
    expect(params.limit).toBe(20);
  });

  it('sends the filter tab as the server’s own vocabulary', async () => {
    api.onGet('/automations').reply(200, envelope({ items: [], nextCursor: null, totalCount: 0 }));

    await automation.listAutomations(guidScope, { tab: 'attention' } as never, null);

    // `ParseStatus` strips underscores, compares case-insensitively and maps
    // `attention` onto NEEDS_ATTENTION by hand — the server was written to
    // accept the client's filter words. Translating to a guessed enum name
    // here would silently empty the tab: a filter that matches nothing looks
    // exactly like a member with nothing needing attention.
    expect(api.history.get[0].params.status).toBe('attention');
  });

  it('omits `all` rather than sending it as a status', async () => {
    api.onGet('/automations').reply(200, envelope({ items: [], nextCursor: null, totalCount: 0 }));

    await automation.listAutomations(guidScope, { tab: 'all' } as never, null);

    expect(api.history.get[0].params.status).toBeUndefined();
  });
});

// ── 4. `ownerId` binds as a Guid ─────────────────────────────────────────────

describe('the owner id', () => {
  it('omits an owner id the route cannot bind', async () => {
    api.onGet('/automations').reply(200, envelope({ items: [], nextCursor: null, totalCount: 0 }));

    // `usePersonalScope()` supplies the literal `'me'` whenever the member id is
    // not yet known — a signed-out reader, or the tick before `restore()`
    // resolves. `ownerId` is a `Guid?` on every one of these routes, so sending
    // it is a model-binding 400 *before any handler runs*: not an empty list, a
    // failed request, on every automation screen, for a value the client
    // invented as a cache-key placeholder rather than as an identity.
    await automation.listAutomations(
      { ownerKind: 'user', ownerId: 'me' } as unknown as AutomationScope,
      { tab: 'all' } as never,
      null
    );

    expect(api.history.get[0].params.ownerId).toBeUndefined();
    // The kind still travels: it is a plain string server-side, and dropping it
    // would change which scope was read.
    expect(api.history.get[0].params.ownerKind).toBe('user');
  });

  it('omits it on the capability route too, which has the same binder', async () => {
    api.onGet('/automations/capabilities').reply(200, envelope({ provenance: 'server' }));

    await automation.fetchAccess({
      ownerKind: 'user',
      ownerId: 'me',
    } as unknown as AutomationScope);

    expect(api.history.get[0].params.ownerId).toBeUndefined();
  });

  it('sends a real one through untouched', async () => {
    api.onGet('/automations').reply(200, envelope({ items: [], nextCursor: null, totalCount: 0 }));

    await automation.listAutomations(guidScope, { tab: 'all' } as never, null);

    // Omitting a *valid* owner would read the caller's own automations instead
    // of the community's, which is a quieter and worse failure than a 400.
    expect(api.history.get[0].params.ownerId).toBe(OWNER_GUID);
  });
});

// ── 5. The audience is estimated per action ──────────────────────────────────

describe('the audience', () => {
  it('sends the action keys alongside the scope', async () => {
    api.onPost('/automations/audience').reply(200, envelope({ kind: 'community' }));

    await automation.fetchAudience(guidScope, ['notify.community']);

    const body = JSON.parse(api.history.post[0].data);
    // `AudienceRequest` carries both, and the count is per-action:
    // `notify.community` reaches a community and `notify.self` reaches one
    // person. A scope-only request asks "how many people are in this scope",
    // which is a different question — and on a community automation a much
    // larger and more alarming number than the true one.
    expect(body.actionKeys).toEqual(['notify.community']);
    expect(body.scope).toBeDefined();
  });
});

// ── 6. A simulated run cannot be mistaken for a real one ─────────────────────

describe('simulation', () => {
  it('forces isSimulated on the way out', async () => {
    // The server does set it. This is the one function whose entire safety
    // property is "the result cannot be mistaken for a real run", and a
    // property enforced at the boundary survives a change on the other side.
    api.onPost('/automations/simulate').reply(
      200,
      envelope({
        run: { id: 'r1', isSimulated: false },
        wouldHaveDone: [],
        audience: null,
        dependencies: [],
      })
    );

    const result = await automation.simulateAutomation({
      name: 'x',
      trigger: { key: 'manual.run', parameters: {} },
      actions: [],
      conditions: [],
    } as unknown as AutomationDraft);

    expect(result.run.isSimulated).toBe(true);
  });
});

// ── 7. A reminder needs the moment it counts back from ───────────────────────

describe('reminders', () => {
  it('sends the subject moment', async () => {
    api.onPost('/automations/reminders').reply(200, envelope({ reminderId: 'rm1' }));

    await automation.createReminder({
      subjectKind: 'event',
      subjectId: 'e1',
      subjectMoment: '2026-09-01T18:00:00.000Z',
      offsetMinutes: 60,
      anchor: 'start',
      timeZoneId: 'Africa/Lagos',
    });

    const body = JSON.parse(api.history.post[0].data);
    // `SubjectMoment` is a non-nullable `DateTimeOffset`, so an omitted field is
    // not a binder error — it is `0001-01-01`, and the due time would land two
    // thousand years in the past. The handler catches exactly that case, which
    // turns a silent absurdity into a clean 400; a 400 on every reminder is
    // still no reminders, so the field has to be sent.
    expect(body.subjectMoment).toBe('2026-09-01T18:00:00.000Z');
  });

  it('sends no channel, because a reminder has none', async () => {
    api.onPost('/automations/reminders').reply(200, envelope({ reminderId: 'rm1' }));

    await automation.createReminder({
      subjectKind: 'event',
      subjectId: 'e1',
      subjectMoment: '2026-09-01T18:00:00.000Z',
      offsetMinutes: 60,
    });

    // The development arm accepted a `channel` and the server has no such
    // property: delivery follows the member's notification preferences, which
    // is the right owner for it. A hard-coded `InApp` would go unseen by
    // somebody who had asked for push and nothing else.
    expect(JSON.parse(api.history.post[0].data).channel).toBeUndefined();
  });
});

// ── 8. A saved search keeps the words the member typed ───────────────────────

describe('saved searches', () => {
  it('sends querySummary rather than letting it default to the name', async () => {
    api.onPost('/automations/saved-searches').reply(200, envelope({ id: 's1' }));

    await automation.createSavedSearch({
      subject: 'housing',
      name: 'My search',
      criteria: { maxRent: 1200, bedrooms: 2 },
      querySummary: '£1,200 · 2 bed · Peckham',
      alertsEnabled: true,
      alertFrequency: 'daily',
      watchFor: ['newMatch'],
    });

    const body = JSON.parse(api.history.post[0].data);
    // The server falls back to `request.QuerySummary ?? request.Name`, so
    // omitting it does not fail — it quietly labels every saved search with its
    // own name, and a housing search reads "My search" where it should read
    // what was actually searched for.
    expect(body.querySummary).toBe('£1,200 · 2 bed · Peckham');
    // Criteria is a JSON string on the way in and an object on the way out,
    // exactly like `parameters`.
    expect(typeof body.criteria).toBe('string');
    expect(JSON.parse(body.criteria)).toEqual({ maxRent: '1200', bedrooms: '2' });
  });
});

// ── The routes themselves ────────────────────────────────────────────────────

describe('the routes the platform serves', () => {
  it('changes status at PATCH /{id}/status and reads the wrapped response', async () => {
    api
      .onPatch('/automations/a1/status')
      .reply(200, envelope({ automation: { id: 'a1', status: 'PAUSED' }, cancelledRuns: 3 }));

    const result = await automation.setAutomationStatus('a1', 'PAUSED');

    expect(api.history.patch[0].url).toBe('/automations/a1/status');
    // The response is `{ automation, cancelledRuns }` — not a bare definition.
    // Pausing cancels pending occurrences and reports how many.
    expect(result.automation.status).toBe('PAUSED');
    expect(result.cancelledRuns).toBe(3);
  });

  it('deletes idempotently and reports the cancelled runs', async () => {
    api
      .onDelete('/automations/a1')
      .reply(200, envelope({ id: 'a1', deleted: true, cancelledRuns: 0 }));

    const result = await automation.deleteAutomation('a1');

    // A second delete answers 200 with the same body, never 404 — so the UI is
    // never left showing an automation that is gone.
    expect(result.deleted).toBe(true);
  });

  it('echoes expectedUpdatedAt so a concurrent edit 409s instead of overwriting', async () => {
    api.onPatch('/automations/a1').reply(200, envelope({ id: 'a1' }));

    await automation.updateAutomation('a1', { name: 'Renamed' }, '2026-08-17T10:00:00.123Z');

    const body = JSON.parse(api.history.patch[0].data);
    // Compared at millisecond resolution server-side, so it must be echoed
    // exactly as received rather than reformatted.
    expect(body.expectedUpdatedAt).toBe('2026-08-17T10:00:00.123Z');
  });
});
