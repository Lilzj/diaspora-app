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
  listMonetizationGaps,
} from '@/config/monetization-gaps';
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
    expect(routes).toContain('invoices');
    expect(routes).toContain('change');
    expect(routes).toContain('analytics');
    expect(routes).toContain('recommendations');

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
    await expect(api.fetchPremiumAnalytics()).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(api.fetchInvoices()).rejects.toMatchObject({ kind: 'unavailable' });
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
        placements: ['HomeFeed'],
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
