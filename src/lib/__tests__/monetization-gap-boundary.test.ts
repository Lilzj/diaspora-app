// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization gap boundary tests (Frontend Phase 6)
//
// §5, §26 and §37-6: a development mock must never be mistakeable for
// production support, and no fake payment may be represented as a real one.
//
// Four guarantees are asserted here, because all four are the kind of thing that
// silently stops being true:
//
//   1. No simulated route shares the certified `/financial` prefix.
//   2. A release build registers no simulated monetization routes at all.
//   3. A release build's gap API refuses rather than reaching the network.
//   4. The two gap registers do not collide, and every registered gap is
//      complete enough to be acted on by a backend team.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupMonetizationGapMocks } from '@/mocks/handlers/monetization-gaps';
import {
  MONETIZATION_GAPS,
  MONETIZATION_GAP_PREFIX,
  areMonetizationGapsEnabled,
  isGapServedByBackend,
  listMonetizationGaps,
} from '@/config/monetization-gaps';
import * as featureFlags from '@/config/gap-preview';
import { GAP_ROUTE_PREFIX } from '@/config/financial-gaps';
import * as gapApi from '../monetization-gap-api';

/**
 * `MockAdapter.handlers` is not on the published typings, but it is the only way
 * to assert *which* routes were registered — the property under test here.
 * Declared narrowly rather than cast to `any`, so the shape stays checked.
 */
interface RegisteredHandler {
  url: string | RegExp;
}

type InspectableMock = MockAdapter & {
  handlers: Record<'get' | 'post' | 'put' | 'delete', RegisteredHandler[]>;
};

function registeredRoutes(mock: InspectableMock): string[] {
  return [
    ...mock.handlers.get,
    ...mock.handlers.post,
    ...mock.handlers.put,
    ...mock.handlers.delete,
  ].map((handler) => String(handler.url));
}

describe('the URL space cannot collide', () => {
  it('puts every simulated monetization route behind a prefix the backend does not serve', () => {
    expect(MONETIZATION_GAP_PREFIX).toBe('/monetization-gap/v0');
    expect(MONETIZATION_GAP_PREFIX.startsWith('/financial')).toBe(false);
  });

  it('does not collide with Phase 5’s gap prefix either', () => {
    // Two separate registers, two separate URL spaces. A cache dump or a request
    // log has to be unambiguous about which simulation answered.
    expect(MONETIZATION_GAP_PREFIX).not.toBe(GAP_ROUTE_PREFIX);
    expect(MONETIZATION_GAP_PREFIX.startsWith(GAP_ROUTE_PREFIX)).toBe(false);
    expect(GAP_ROUTE_PREFIX.startsWith(MONETIZATION_GAP_PREFIX)).toBe(false);
  });

  it('registers no handler under the certified prefix', () => {
    const mock = new MockAdapter(apiClient) as InspectableMock;
    setupMonetizationGapMocks(mock);

    const routes = registeredRoutes(mock);

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route).toContain('monetization-gap');
      expect(route.startsWith('/financial/')).toBe(false);
    }

    mock.restore();
  });

  it('registers a route for every capability the gap API can call', () => {
    const mock = new MockAdapter(apiClient) as InspectableMock;
    setupMonetizationGapMocks(mock);

    const routes = registeredRoutes(mock).join(' ');

    // One assertion per gap, so a capability added to the API without a handler
    // fails here rather than at runtime in somebody's development build.
    expect(routes).toContain('campaigns');
    expect(routes).toContain('targeting');
    expect(routes).toContain('performance');
    expect(routes).toContain('entitlements');
    // Not 'invoices': MON-GAP-009 is served, so nothing simulates it.
    expect(routes).not.toContain('invoices');
    expect(routes).toContain('change');
    // Not 'analytics' or 'recommendations': MON-GAP-010 and -011 are served
    // since 20 Oct 2026, so nothing simulates them.
    expect(routes).not.toContain('analytics');
    expect(routes).not.toContain('recommendations');

    mock.restore();
  });
});

describe('a release build ships no simulation', () => {
  const wasDev = global.__DEV__;

  afterEach(() => {
    global.__DEV__ = wasDev;
    jest.resetModules();
  });

  it('registers nothing at all', () => {
    global.__DEV__ = false;
    jest.resetModules();

    // Re-required after the flag change: the guard reads `__DEV__` at call time,
    // but the module graph has to be rebuilt for the config module to agree.
    const { setupMonetizationGapMocks: setup } =
      require('@/mocks/handlers/monetization-gaps') as typeof import('@/mocks/handlers/monetization-gaps');

    const mock = new MockAdapter(apiClient) as InspectableMock;
    setup(mock);

    expect(registeredRoutes(mock)).toHaveLength(0);
    mock.restore();
  });

  it('refuses every gap call before a request is made', async () => {
    global.__DEV__ = false;
    jest.resetModules();

    const api = require('../monetization-gap-api') as typeof import('../monetization-gap-api');

    // No adapter is registered at all, so anything that reached the network
    // would fail with a transport error rather than the refusal asserted here.
    await expect(api.fetchCampaigns()).rejects.toMatchObject({
      kind: 'unavailable',
      isTerminal: true,
      isRetryable: false,
    });
    await expect(api.fetchPerformanceSummary()).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(api.fetchEntitlementSnapshot()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('refuses a gap *mutation* too, so nothing can be created in production', async () => {
    global.__DEV__ = false;
    jest.resetModules();

    const api = require('../monetization-gap-api') as typeof import('../monetization-gap-api');

    await expect(
      api.createCampaign({
        name: 'x',
        objective: 'Awareness',
        creative: { headline: 'h', body: 'b', callToActionLabel: 'c' },
        audience: {
          countries: [],
          communities: [],
          neighbourhoods: [],
          audienceTypes: [],
          interests: [],
          categories: [],
        },
        budgetKind: 'Total',
        budgetAmount: 10,
        currency: 'GBP',
        startsAt: new Date().toISOString(),
        endsAt: new Date().toISOString(),
      })
    ).rejects.toMatchObject({ kind: 'unavailable' });

    await expect(api.submitCampaign('cam-1')).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(api.changePlan('sub-1', { planCode: 'pro' })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('gives the refusal a code a support engineer can search for', async () => {
    global.__DEV__ = false;
    jest.resetModules();

    const api = require('../monetization-gap-api') as typeof import('../monetization-gap-api');

    await expect(api.fetchCampaigns()).rejects.toMatchObject({
      code: 'frontend.monetization-gap.campaigns',
    });
  });
});

describe('a development build reaches the simulation', () => {
  it('reports gap features enabled under Jest, where __DEV__ is true', () => {
    expect(areMonetizationGapsEnabled()).toBe(true);
  });
});

describe('the gap register is complete enough to act on', () => {
  const gaps = listMonetizationGaps();

  it('registers every gap the API depends on', () => {
    for (const key of [
      'campaigns',
      'performance',
      'planChange',
      'renewal',
      'pause',
      'approval',
      'targeting',
      'usage',
      'invoices',
      'premiumAnalytics',
      'recommendations',
    ]) {
      expect(MONETIZATION_GAPS[key]).toBeDefined();
    }
  });

  it('gives every gap a unique MON-GAP identifier', () => {
    const ids = gaps.map((gap) => gap.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^MON-GAP-\d{3}$/);
    }
  });

  it('gives every gap the fields a backend team needs to scope it', () => {
    for (const gap of gaps) {
      expect(gap.title.length).toBeGreaterThan(0);
      expect(gap.feature.length).toBeGreaterThan(0);
      expect(gap.frontendBehaviour.length).toBeGreaterThan(0);
      // A route-level list, not hand-waving: §27 asks for the expected endpoint.
      expect(gap.missingContract.length).toBeGreaterThan(0);
      expect(gap.whyNotImplementable.length).toBeGreaterThan(0);
      expect(gap.recommendedPhase.length).toBeGreaterThan(0);
      expect(['critical', 'high', 'medium', 'low']).toContain(gap.priority);
      expect(['B15-incomplete', 'B14-recommendation', 'future-evolution']).toContain(gap.owner);
    }
  });

  it('names the existing seams, so a future phase does not rebuild what is there', () => {
    for (const gap of gaps) {
      expect(gap.existingSeams.length).toBeGreaterThan(0);
    }
  });

  it('orders the register by priority', () => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const ranks = gaps.map((gap) => rank[gap.priority]);

    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  it('keeps the gap key on each entry equal to its register key', () => {
    // The key is what screens pass to `<MonetizationGapNotice>`; a mismatch
    // renders nothing at all, which is exactly the failure mode this guards.
    for (const [key, gap] of Object.entries(MONETIZATION_GAPS)) {
      expect(gap.key).toBe(key);
    }
  });
});

describe('the gap API surface', () => {
  it('namespaces its query keys away from the financial cache', () => {
    expect(gapApi.monetizationGapKeys.all).toEqual(['monetization-gap']);
    expect(gapApi.monetizationGapKeys.campaigns()[0]).toBe('monetization-gap');
    expect(gapApi.monetizationGapKeys.performanceSummary()[0]).toBe('monetization-gap');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A connected gap opens its screen
// ─────────────────────────────────────────────────────────────────────────────

describe('a gap the backend serves is available in a release build', () => {
  // -- The defect this exists for ──────────────────────────────────────────────────────────────────────
  //
  // Every advertising screen gated itself on `areMonetizationGapsEnabled()` --
  // "are simulated features on?" -- as a proxy for "does this feature work?".
  // The two were the same question while the surface was simulated, and the
  // gate was right: a release build cannot reach the adapter.
  //
  // They stopped being the same question when B16 shipped. The hooks were
  // repointed at the certified arm and the register flipped to `connected`, but
  // the screens still asked about simulation -- so a release build served by 18
  // live routes and four seeded products told members
  // "Advertising is not open yet".
  //
  // 4,627 tests, a clean typecheck and a verified deployment all passed. The
  // only thing that could see it was the screen.
  it('reports every connected gap as available with simulation off', () => {
    const off = jest
      .spyOn(featureFlags, 'areSimulatedFeaturesEnabled')
      .mockReturnValue(false);

    try {
      const served = Object.values(MONETIZATION_GAPS).filter(
        (gap) => gap.backendStatus === 'connected' || gap.backendStatus === 'partial'
      );

      // Guards the guard: if the register ever holds no served gaps, an
      // all-passing loop below would prove nothing.
      expect(served.length).toBeGreaterThan(0);

      const unavailable = served
        .filter((gap) => !isGapServedByBackend(gap.key))
        .map((gap) => `${gap.id} ${gap.key} (${gap.backendStatus})`);

      expect(unavailable).toEqual([]);
    } finally {
      off.mockRestore();
    }
  });

  it('still withholds a simulated gap from a release build', () => {
    // The other direction. Without this, `isGapServedByBackend` returning a
    // constant `true` would pass the test above and ship every unbuilt surface.
    const off = jest
      .spyOn(featureFlags, 'areSimulatedFeaturesEnabled')
      .mockReturnValue(false);

    // Since 20 Oct 2026 every entry in the register is served, so a probe entry
    // with no backend status stands in for "a gap nothing serves yet" — without
    // it, an empty list would make the loop below prove nothing.
    const registry = MONETIZATION_GAPS as unknown as Record<string, unknown>;
    registry.__unservedProbe = { ...MONETIZATION_GAPS.recommendations, key: '__unservedProbe', backendStatus: undefined };

    try {
      const simulated = Object.values(MONETIZATION_GAPS).filter(
        (gap) => gap.backendStatus !== 'connected' && gap.backendStatus !== 'partial'
      );

      expect(simulated.length).toBeGreaterThan(0);

      const leaked = simulated
        .filter((gap) => isGapServedByBackend(gap.key))
        .map((gap) => `${gap.id} ${gap.key}`);

      expect(leaked).toEqual([]);
    } finally {
      delete registry.__unservedProbe;
      off.mockRestore();
    }
  });

  it('refuses a key that is not in the register', () => {
    expect(isGapServedByBackend('not-a-gap')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The gate matches the arm
// ─────────────────────────────────────────────────────────────────────────────

describe('a hook gates on the thing it actually calls', () => {
  // -- The defect this exists for ──────────────────────────────────────────────────────────────────────
  //
  // Availability has two different answers depending on which arm a hook reads,
  // and using the wrong one fails silently in opposite directions:
  //
  //   * A hook on the **certified arm** gated on `areMonetizationGapsEnabled`
  //     is switched off in every release build even though the backend serves
  //     it. That is what told members "Advertising is not open yet" while 18
  //     routes answered.
  //
  //   * A hook on the **development adapter** gated on `isGapServedByBackend`
  //     is switched *on* in a release build, where the adapter does not exist.
  //     Every request would fail. MON-GAP-009 is `partial` on the backend while
  //     its client half still reads `gapApi`, so this is one edit away.
  //
  // Neither shows up in a unit test: both compile, and both look right in the
  // build the developer is running.
  const source: string = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src/hooks/monetization-gaps.ts'),
    'utf8'
  );

  // Split the file into one chunk per exported hook.
  const hooks = source
    .split(/\nexport function /)
    .slice(1)
    .map((chunk) => ({ name: chunk.split('(')[0].trim(), body: chunk }));

  it('reads at least the hooks this rule is about', () => {
    // Guards the guard: a parser that matched nothing would pass every
    // assertion below without checking anything.
    expect(hooks.length).toBeGreaterThan(10);
    expect(hooks.some((hook) => hook.body.includes('adApi.'))).toBe(true);
    expect(hooks.some((hook) => hook.body.includes('gapApi.'))).toBe(true);
  });

  it('never gates a certified-arm read on whether mocks are enabled', () => {
    const wrong = hooks
      .filter((hook) => hook.body.includes('adApi.'))
      .filter((hook) => hook.body.includes('areMonetizationGapsEnabled()'))
      .map((hook) => hook.name);

    expect(wrong).toEqual([]);
  });

  it('never gates an adapter read on whether the backend serves it', () => {
    const wrong = hooks
      .filter((hook) => hook.body.includes('gapApi.'))
      .filter((hook) => hook.body.includes('isGapServedByBackend('))
      .map((hook) => hook.name);

    expect(wrong).toEqual([]);
  });
});
