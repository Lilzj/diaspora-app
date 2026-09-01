// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend-gap boundary tests (Frontend Phase 5)
//
// §31: "Do not allow development mocks to be mistaken for production support."
//
// Three guarantees are asserted here, because all three are the kind of thing
// that silently stops being true:
//
//   1. No simulated route shares the certified `/financial` prefix.
//   2. A release build registers no simulated routes at all.
//   3. A release build's gap API refuses rather than reaching the network.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupFinancialGapMocks } from '@/mocks/handlers/financial-gaps';
import { BACKEND_GAPS, GAP_ROUTE_PREFIX, areGapFeaturesEnabled } from '@/config/financial-gaps';
import * as gapApi from '../financial-gap-api';
// (No FinancialError import: the release-build tests re-require their own copy
// after jest.resetModules(), so identity comparisons are meaningless here.)

/**
 * `MockAdapter.handlers` is not on the published typings, but it is the only
 * way to assert *which* routes were registered — the property under test here.
 * Declared narrowly rather than cast to `any`, so the shape stays checked.
 */
interface RegisteredHandler {
  url: string | RegExp;
}

type InspectableMock = MockAdapter & {
  handlers: Record<'get' | 'post' | 'put' | 'delete', RegisteredHandler[]>;
};

describe('the URL space cannot collide', () => {
  it('puts every simulated route behind a prefix the backend does not serve', () => {
    // A gap call that escaped to a real deployment must 404 at the gateway
    // rather than reach a certified financial route.
    expect(GAP_ROUTE_PREFIX).toBe('/financial-gap/v0');
    expect(GAP_ROUTE_PREFIX.startsWith('/financial/')).toBe(false);
  });

  it('registers no handler under the certified prefix', () => {
    const mock = new MockAdapter(apiClient) as InspectableMock;
    setupFinancialGapMocks(mock);

    const registered = [
      ...mock.handlers.get,
      ...mock.handlers.post,
      ...mock.handlers.put,
      ...mock.handlers.delete,
    ].map((handler) => String(handler.url));

    expect(registered.length).toBeGreaterThan(0);
    for (const route of registered) {
      expect(route).toContain('financial-gap');
      expect(route.startsWith('/financial/')).toBe(false);
    }

    mock.restore();
  });
});

describe('the gap register', () => {
  it('names the missing contract for every gap, not just the capability', () => {
    for (const gap of Object.values(BACKEND_GAPS)) {
      expect(gap.missingContract.length).toBeGreaterThan(0);
      expect(gap.whyNotImplementable.length).toBeGreaterThan(40);
      expect(['B15-incomplete', 'future-evolution']).toContain(gap.owner);
    }
  });

  it('covers exactly the capabilities that are still missing', () => {
    expect(Object.keys(BACKEND_GAPS).sort()).toEqual([
      'deposit',
      'protection',
      'rewards',
    ]);
  });

  it('no longer claims withdrawal is simulated', () => {
    // The gap closed when a settlement provider landed. This asserts the
    // register was updated rather than left claiming a capability is faked that
    // is now real — which would put a "simulated" notice on a screen moving
    // actual money, and is the more dangerous of the two directions to be wrong.
    expect(BACKEND_GAPS).not.toHaveProperty('withdrawal');
  });

  it('records escrow as the one gap with no simulated flow', () => {
    // §20 forbids simulating it. The register has to say why, because the
    // absence of a flow is otherwise indistinguishable from an oversight.
    expect(BACKEND_GAPS.protection.frontendBehaviour).toMatch(/no escrow state|read-only/i);
  });
});

describe('development build', () => {
  it('has gap features on under __DEV__', () => {
    expect(areGapFeaturesEnabled()).toBe(true);
  });

  it('serves the simulated routes', async () => {
    const mock = new MockAdapter(apiClient);
    setupFinancialGapMocks(mock);
    mock.onAny().reply(404, { title: 'No handler', status: 404 });

    const balance = await gapApi.fetchRewardBalance();
    expect(balance.available).toBeGreaterThan(0);

    const policy = await gapApi.fetchConversionPolicy();
    expect(policy.pointsPerMinorUnit).toBeGreaterThan(0);

    mock.restore();
  });

  it('asks the server for a conversion value rather than computing one', async () => {
    const mock = new MockAdapter(apiClient);
    setupFinancialGapMocks(mock);
    mock.onAny().reply(404, { title: 'No handler', status: 404 });

    const preview = await gapApi.previewConversion(2000);

    expect(preview.isValid).toBe(true);
    expect(preview.netValue.minorUnits).toBeGreaterThan(0);
    // The server refuses below the minimum, with a reason — the client does not
    // decide this, and the refusal arrives as data rather than as an exception.
    const tooSmall = await gapApi.previewConversion(10);
    expect(tooSmall.isValid).toBe(false);
    expect(tooSmall.refusalMessage).toBeTruthy();

    mock.restore();
  });

  it('never returns a payout credential, only a masked label', async () => {
    const mock = new MockAdapter(apiClient);
    setupFinancialGapMocks(mock);
    mock.onAny().reply(404, { title: 'No handler', status: 404 });

    const destinations = await gapApi.fetchPayoutDestinations();

    for (const destination of destinations) {
      expect(destination.maskedLabel).toMatch(/••••/);
      // §10 is satisfied structurally: there is no account number to store,
      // because the contract never sends one.
      expect(Object.keys(destination)).not.toContain('accountNumber');
      expect(Object.keys(destination)).not.toContain('iban');
      expect(Object.keys(destination)).not.toContain('sortCode');
      expect(JSON.stringify(destination)).not.toMatch(/\d{8,}/);
    }

    mock.restore();
  });

  it('refuses a withdrawal above the available balance with the specific code', async () => {
    const mock = new MockAdapter(apiClient);
    setupFinancialGapMocks(mock);
    mock.onAny().reply(404, { title: 'No handler', status: 404 });

    await expect(
      gapApi.createWithdrawal({ amount: 5000, currency: 'GBP', destinationId: 'dest-0001' })
    ).rejects.toMatchObject({ code: 'financial.wallet.insufficient_funds' });

    mock.restore();
  });

  it('refuses a withdrawal to an unverified destination', async () => {
    const mock = new MockAdapter(apiClient);
    setupFinancialGapMocks(mock);
    mock.onAny().reply(404, { title: 'No handler', status: 404 });

    await expect(
      gapApi.createWithdrawal({ amount: 20, currency: 'GBP', destinationId: 'dest-0002' })
    ).rejects.toMatchObject({ code: 'financial.account.not_eligible' });

    mock.restore();
  });
});

describe('release build', () => {
  const wasDev = global.__DEV__;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).__DEV__ = false;
    jest.resetModules();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).__DEV__ = wasDev;
    jest.resetModules();
  });

  it('registers no simulated routes', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const handlers = require('@/mocks/handlers/financial-gaps') as typeof import('@/mocks/handlers/financial-gaps');

    const mock = new MockAdapter(apiClient) as InspectableMock;
    handlers.setupFinancialGapMocks(mock);

    const registered = [
      ...mock.handlers.get,
      ...mock.handlers.post,
      ...mock.handlers.put,
      ...mock.handlers.delete,
    ];

    expect(registered).toHaveLength(0);
    mock.restore();
  });

  it('refuses a gap call before it reaches the network', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../financial-gap-api') as typeof import('../financial-gap-api');

    // Nothing is registered and nothing should be attempted: the refusal comes
    // from the client, so a production binary cannot even try.
    //
    // Asserted by shape rather than by `instanceof`. `jest.resetModules()`
    // above gives this test its own copy of the error module, so the class
    // identity legitimately differs from the one imported at the top of the
    // file — a constructor comparison would fail on a module-registry detail
    // rather than on anything about the code.
    await expect(api.fetchRewardBalance()).rejects.toMatchObject({ name: 'FinancialError' });
    await expect(api.fetchRewardBalance()).rejects.toMatchObject({
      kind: 'unavailable',
      isTerminal: true,
      code: 'frontend.gap.rewards',
    });
  });

  it('refuses every gap capability, not just one', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../financial-gap-api') as typeof import('../financial-gap-api');

    await expect(api.fetchDeposits()).rejects.toMatchObject({ code: 'frontend.gap.deposit' });
    await expect(api.fetchWithdrawals()).rejects.toMatchObject({ code: 'frontend.gap.withdrawal' });
    await expect(api.fetchPayoutDestinations()).rejects.toMatchObject({
      code: 'frontend.gap.withdrawal',
    });
  });

  it('gives the refusal a sentence a member can read', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../financial-gap-api') as typeof import('../financial-gap-api');

    try {
      await api.fetchWithdrawals();
      throw new Error('should have refused');
    } catch (cause) {
      // Structural, for the same module-registry reason as above: this test's
      // copy of the error class is not the one imported at the top of the file.
      const error = cause as { message: string; hint?: string };
      expect(error.message).toMatch(/not available on Diaspora yet/i);
      expect(error.hint).toBeTruthy();
    }
  });
});
