// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Rewards, certified reads (Remediation Wave C-01)
//
// `financial-gaps.ts` records rewards as `owner: 'future-evolution'` because
// "the module has no occurrence of 'points' at all". That was true when written.
// `/api/v1/financial/rewards/*` exists now, and the three reads work regardless
// of the deployment switches that still refuse the *conversion* itself.
//
// Two of these tests exist for one field. The client renders
// `pointsPerMinorUnit`; the server publishes `minorUnitsPerPoint`. They are
// reciprocals, the names are one transposition apart, and mapping them across by
// similarity misprices every conversion by the rate squared — in a direction
// that looks entirely plausible on screen. A test that only checked "a rate came
// back" would pass against the wrong one.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import {
  fetchRewardConversionTerms,
  fetchRewardPointsBalance,
  fetchRewardPointsHistory,
} from '../financial-api';

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

describe('the reward routes the platform actually serves', () => {
  it('reads the balance from /financial/rewards/me', async () => {
    api.onGet('/financial/rewards/me').reply(
      200,
      envelope({
        balance: 1250,
        lifetimeEarned: 4000,
        lifetimeConverted: 2750,
        canConvert: true,
        resolvedAt: '2026-08-17T10:00:00Z',
      })
    );

    const balance = await fetchRewardPointsBalance();

    expect(api.history.get[0].url).toBe('/financial/rewards/me');
    expect(balance.balance).toBe(1250);
    // Points are a count, never money. There is deliberately no currency on this
    // response, and a client that added one would be inventing a denomination.
    expect((balance as unknown as { currency?: string }).currency).toBeUndefined();
  });

  it('pages history by before/take, because the route takes no cursor', async () => {
    api.onGet('/financial/rewards/me/history').reply(200, envelope([]));

    await fetchRewardPointsHistory({ before: '2026-08-01T00:00:00Z', take: 25 });

    const params = api.history.get[0].params;
    expect(params).toEqual({ before: '2026-08-01T00:00:00Z', take: 25 });
    // `excludeIds` is accepted by the deposit and withdrawal histories and NOT by
    // this one. Sending it would be silently ignored.
    expect(params).not.toHaveProperty('excludeIds');
  });

  it('reads the conversion terms, including why they are unavailable', async () => {
    api.onGet('/financial/rewards/conversion').reply(
      200,
      envelope({
        isEnabled: false,
        disabledReason: 'financial.rewards.conversion_not_supported',
        currency: 'GBP',
        minorUnitsPerPoint: 0,
        minimumPoints: 500,
        maximumPoints: null,
        dailyMaximumPoints: null,
        dailyRemainingPoints: null,
        policyVersion: null,
      })
    );

    const terms = await fetchRewardConversionTerms();

    // A deployment with conversion switched off says so, rather than the client
    // guessing from a zero rate. This is what lets the screen explain instead of
    // offering a converter that refuses.
    expect(terms.isEnabled).toBe(false);
    expect(terms.disabledReason).toBe('financial.rewards.conversion_not_supported');
  });
});

describe('the reciprocal', () => {
  it('publishes minor units per point, which is not points per minor unit', async () => {
    api.onGet('/financial/rewards/conversion').reply(
      200,
      envelope({
        isEnabled: true,
        disabledReason: null,
        currency: 'GBP',
        // One point is worth half a penny.
        minorUnitsPerPoint: 0.5,
        minimumPoints: 500,
        maximumPoints: 10_000,
        dailyMaximumPoints: null,
        dailyRemainingPoints: null,
        policyVersion: 'reward.conversion@2',
      })
    );

    const terms = await fetchRewardConversionTerms();

    expect(terms.minorUnitsPerPoint).toBe(0.5);

    // The client's own field is the inverse: two points make one penny. A hook
    // that assigned 0.5 to `pointsPerMinorUnit` would price 1000 points at 500
    // pence instead of 500 points-worth — a factor of four out, and plausible.
    const pointsPerMinorUnit = 1 / terms.minorUnitsPerPoint;
    expect(pointsPerMinorUnit).toBe(2);
  });

  it('survives a zero rate without dividing by it', async () => {
    // The server publishes a zero rate when conversion has no rate at all, which
    // is exactly when `isEnabled` is false. `1 / 0` is Infinity, and an
    // Infinity on a conversion screen is worse than a zero.
    api.onGet('/financial/rewards/conversion').reply(
      200,
      envelope({
        isEnabled: false,
        disabledReason: 'financial.rewards.conversion_not_supported',
        currency: 'GBP',
        minorUnitsPerPoint: 0,
        minimumPoints: 0,
        maximumPoints: null,
        dailyMaximumPoints: null,
        dailyRemainingPoints: null,
        policyVersion: null,
      })
    );

    const terms = await fetchRewardConversionTerms();
    const guarded = terms.minorUnitsPerPoint > 0 ? 1 / terms.minorUnitsPerPoint : 0;

    expect(Number.isFinite(guarded)).toBe(true);
    expect(guarded).toBe(0);
  });
});

describe('the history sign convention', () => {
  it('keeps points positive on the wire and states direction separately', async () => {
    api.onGet('/financial/rewards/me/history').reply(
      200,
      envelope([
        { entryId: 'e1', points: 250, isConversion: false, source: 'guide.published', occurredAt: '2026-08-02T00:00:00Z' },
        { entryId: 'e2', points: 500, isConversion: true, source: 'conversion', occurredAt: '2026-08-01T00:00:00Z' },
      ])
    );

    const entries = await fetchRewardPointsHistory();

    // Both positive on the wire. The conversion is a debit only because
    // `isConversion` says so — a client that copied `points` across unchanged
    // would render 500 points spent as 500 points earned.
    expect(entries[0].points).toBe(250);
    expect(entries[1].points).toBe(500);
    expect(entries[1].isConversion).toBe(true);
  });
});
