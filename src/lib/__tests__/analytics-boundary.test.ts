// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics boundary (Frontend Phase 15, §38 · §47 · §48 · §64)
//
// The structural assertions. Each one proves a property of the *shape* of the
// code rather than of a single behaviour, which is what makes them worth having:
// a behavioural test proves a function does the right thing today, and these
// prove that the wrong thing is not reachable at all.
//
// Four properties:
//
//   **A release build reaches no simulated analytics.** Every function in the
//   development arm refuses when the gap switch is off, and it *rejects* rather
//   than returning empty — §73's distinction between "there is no data" (a claim
//   about the platform) and "this build cannot show you this" (a claim about the
//   build, and the true one).
//
//   **The development arm moves no money and grants no permission.** Asserted by
//   inspecting the module's exports rather than by trusting a comment. A gap API
//   that could mint an administrator is one somebody eventually calls.
//
//   **No analytics event can carry a value or a subject id.** The allow-list is
//   the whole privacy design of the telemetry layer, and this asserts the two
//   keys whose absence matters most for *this* phase — see the header of
//   `lib/analytics/events.ts`.
//
//   **The certified arm never marks a real figure as simulated.** The inverse of
//   §38, and the one nobody writes down: a marker on a real number teaches a
//   reviewer that the marker is noise.
// ─────────────────────────────────────────────────────────────────────────────

import * as gapApi from '@/lib/analytics-gap-api';
import * as certifiedApi from '@/lib/analytics-api';
import { ANALYTICS_GAPS, ANALYTICS_GAP_PREFIX } from '@/config/analytics-gaps';
import { sanitise, drainCreatorEvents, resetCreatorEvents } from '@/lib/creator-analytics';
import { setupAnalyticsGapMocks } from '@/mocks/handlers/analytics';
import { trackAnalyticsEvent, trackDashboardViewed } from '@/lib/analytics/events';
import { aggregateLedgerActivity } from '@/lib/analytics-api';
import type { LedgerEntry, Money } from '@/types/financial';
import type { AnalyticsTimeRange } from '@/types/analytics';

// `areSimulatedFeaturesEnabled()` reads `__DEV__` first, so a release build is
// simulated here by turning it off for the duration of the assertion.
function withReleaseBuild<T>(body: () => T): T {
  const globals = globalThis as { __DEV__?: boolean };
  const previous = globals.__DEV__;
  globals.__DEV__ = false;
  const previousEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
  delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  try {
    return body();
  } finally {
    globals.__DEV__ = previous;
    if (previousEnv !== undefined) process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = previousEnv;
  }
}

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

describe('§64 · a release build reaches no simulated analytics', () => {
  // Every read in the development arm, with the arguments a screen would pass.
  const reads: { name: string; call: () => Promise<unknown> }[] = [
    {
      name: 'fetchAnalyticsAccess',
      call: () => gapApi.fetchAnalyticsAccess({ type: 'platform', id: null }),
    },
    {
      name: 'fetchAnalyticsDataset',
      call: () => gapApi.fetchAnalyticsDataset({ subject: { type: 'platform', id: null }, range: RANGE }),
    },
    {
      name: 'fetchAnalyticsFunnel',
      call: () => gapApi.fetchAnalyticsFunnel('job', { type: 'employer', id: 'e1' }, RANGE),
    },
    {
      name: 'fetchAnalyticsRetention',
      call: () =>
        gapApi.fetchAnalyticsRetention({ type: 'platform', id: null }, RANGE, 'week', 8),
    },
    {
      name: 'fetchAnalyticsLeaderboard',
      call: () =>
        gapApi.fetchAnalyticsLeaderboard('top', { type: 'platform', id: null }, RANGE, 'content.views'),
    },
    {
      name: 'fetchAnalyticsInsights',
      call: () => gapApi.fetchAnalyticsInsights({ type: 'platform', id: null }, RANGE),
    },
    {
      name: 'requestAnalyticsExport',
      call: () =>
        gapApi.requestAnalyticsExport({ subject: { type: 'platform', id: null }, range: RANGE }, 'csv'),
    },
    { name: 'fetchAnalyticsExport', call: () => gapApi.fetchAnalyticsExport('exp-1') },
    { name: 'fetchAnalyticsReports', call: () => gapApi.fetchAnalyticsReports('mine') },
    { name: 'fetchAnalyticsReport', call: () => gapApi.fetchAnalyticsReport('rpt-1') },
    {
      name: 'createAnalyticsReport',
      call: () =>
        gapApi.createAnalyticsReport({
          name: 'x',
          query: { subject: { type: 'platform', id: null }, range: RANGE },
          visualization: 'metricCards',
          sharing: 'private',
        }),
    },
    {
      name: 'updateAnalyticsReport',
      call: () => gapApi.updateAnalyticsReport('rpt-1', { name: 'y' }),
    },
    { name: 'deleteAnalyticsReport', call: () => gapApi.deleteAnalyticsReport('rpt-1') },
  ];

  it.each(reads)('$name rejects rather than resolving', async ({ call }) => {
    // The rejection has to survive `await`, which is why every function in the
    // arm is `async` — a synchronous throw from a non-async function escapes the
    // caller's `.catch()` entirely.
    await withReleaseBuild(async () => {
      await expect(call()).rejects.toThrow();
    });
  });

  it('the rejection names the gap rather than being generic', async () => {
    await withReleaseBuild(async () => {
      await expect(
        gapApi.fetchAnalyticsDataset({ subject: { type: 'community', id: 'dev-ng' }, range: RANGE })
      ).rejects.toThrow(/FRONTEND-PHASE15-GAP-006/);
    });
  });

  it('the rejection is recognisable so a screen can render the right state', async () => {
    await withReleaseBuild(async () => {
      const error = await gapApi
        .fetchAnalyticsAccess({ type: 'platform', id: null })
        .catch((cause) => cause);

      expect(gapApi.isAnalyticsUnavailable(error)).toBe(true);
    });
  });
});

describe('§64 · the simulated routes cannot be mistaken for certified ones', () => {
  it('lives under its own prefix', () => {
    expect(ANALYTICS_GAP_PREFIX).toBe('/analytics-gap/v0');
  });

  it('does not claim the `/analytics` namespace a real backend would use', () => {
    // A call that escaped a development build must 404 at the gateway rather than
    // colliding with, shadowing, or being mistaken for a future real route.
    expect(ANALYTICS_GAP_PREFIX).not.toBe('/analytics');
    expect(ANALYTICS_GAP_PREFIX.startsWith('/analytics-gap')).toBe(true);
  });

  // The handler is the second half of the runtime guarantee: the client refuses to
  // call, and the mock refuses to answer. Neither alone is load-bearing, which is
  // the point of having both.
  it('the handler registers nothing in a release build', () => {
    withReleaseBuild(() => {
      const registered: string[] = [];
      const spy = {
        onGet: () => spy,
        onPost: () => spy,
        onPut: () => spy,
        onDelete: () => spy,
        reply: () => {
          registered.push('route');
          return spy;
        },
      };

      setupAnalyticsGapMocks(spy as never);
      expect(registered).toEqual([]);
    });
  });

  it('registers routes when the build is allowed to simulate', () => {
    // The converse, so the assertion above cannot pass because the spy is wrong.
    const registered: string[] = [];
    const spy = {
      onGet: () => spy,
      onPost: () => spy,
      onPut: () => spy,
      onDelete: () => spy,
      reply: () => {
        registered.push('route');
        return spy;
      },
    };

    setupAnalyticsGapMocks(spy as never);
    expect(registered.length).toBeGreaterThan(10);
  });
});

describe('§48 · the development arm grants no permission and moves no money', () => {
  const exported = Object.keys(gapApi);

  it('exports no function that writes a capability', () => {
    const forbidden = exported.filter((name) =>
      /grant|revoke|setCapability|assign|elevate|promote/i.test(name)
    );
    expect(forbidden).toEqual([]);
  });

  it('exports no function that moves money', () => {
    const forbidden = exported.filter((name) =>
      /pay|payout|refund|charge|deposit|withdraw|transfer|wallet|donate|contribut/i.test(name)
    );
    expect(forbidden).toEqual([]);
  });

  it('exports exactly one access function, and it reads', () => {
    const accessFunctions = exported.filter((name) => /access/i.test(name));
    expect(accessFunctions).toEqual(['fetchAnalyticsAccess']);
  });
});

describe('§30 · the certified arm reads money and never writes it', () => {
  const exported = Object.keys(certifiedApi);

  it('exports no write function at all', () => {
    const forbidden = exported.filter((name) =>
      /^(create|update|delete|post|put|patch|request|submit|issue)/i.test(name)
    );
    expect(forbidden).toEqual([]);
  });
});

describe('§38 · a real figure is never marked simulated', () => {
  it('wallet metrics are backend-sourced and client-derived', () => {
    const money = (minorUnits: number): Money => ({
      amount: minorUnits / 100,
      currency: 'GBP',
      minorUnits,
      exponent: 2,
      symbol: '£',
    });

    const entries: LedgerEntry[] = [
      {
        entryId: 'e1',
        transactionId: 't1',
        sequence: 1,
        entryType: 'Deposit',
        direction: 'Credit',
        bucket: 'Available',
        amount: money(5000),
        balanceAfter: money(5000),
        reason: 'Top up',
        actorType: 'Member',
        source: 'Api',
        occurredAt: '2026-07-20T10:00:00Z',
      },
    ];

    const aggregate = aggregateLedgerActivity(entries, RANGE);
    const metrics = certifiedApi.walletMetricsFor(aggregate, 'GBP');

    expect(metrics.length).toBeGreaterThan(0);
    for (const metric of metrics) {
      // Backend-sourced: the records are the platform's.
      expect(metric.value.source).toBe('backend');
      // Client-derived: the arithmetic is this device's. §5's second axis.
      expect(metric.computation).toBe('client-derived');
      // And no gap key, because this is not a gap.
      expect(metric.value.gapKey).toBeUndefined();
    }
  });
});

describe('§49 · no analytics event can carry a figure or a subject id', () => {
  beforeEach(() => resetCreatorEvents());

  it('drops a `value` property', () => {
    const { safe, dropped } = sanitise({ metricKey: 'content.views', value: 4218 });

    expect(safe).toEqual({ metricKey: 'content.views' });
    expect(dropped).toContain('value');
  });

  it('drops `amount`, `changePercent` and `total`', () => {
    const { safe, dropped } = sanitise({
      subjectType: 'creator',
      amount: 1200,
      changePercent: 0.18,
      total: 99,
    });

    expect(safe).toEqual({ subjectType: 'creator' });
    expect(dropped).toEqual(expect.arrayContaining(['amount', 'changePercent', 'total']));
  });

  it('drops `subjectId`, so a stream of events is not a record of what somebody inspected', () => {
    const { safe, dropped } = sanitise({ subjectType: 'community', subjectId: 'dev-ng' });

    expect(safe).toEqual({ subjectType: 'community' });
    expect(dropped).toContain('subjectId');
  });

  it('drops a `userId` even on an analytics event', () => {
    const { safe } = sanitise({ subjectType: 'creator', userId: 'u-123' });
    expect(safe.userId).toBeUndefined();
  });

  it('the typed dashboard emitter sends only shape, never measurement', () => {
    trackDashboardViewed({
      subjectType: 'community',
      rangePreset: 'last30d',
      rangeDays: 30,
      isDeviceTimezone: false,
      comparison: 'previousPeriod',
      dataStatus: 'PARTIAL',
      metricCount: 6,
      unavailableMetricCount: 2,
    });

    const [record] = drainCreatorEvents();

    expect(record.event).toBe('analytics.dashboard.viewed');
    expect(record.properties).toEqual({
      subjectType: 'community',
      rangePreset: 'last30d',
      rangeDays: 30,
      isCustomRange: false,
      isDeviceTimezone: false,
      comparisonBasis: 'previousPeriod',
      dataStatus: 'PARTIAL',
      metricCount: 6,
      unavailableMetricCount: 2,
      isPartialDataset: true,
    });
    // The properties above are counts and low-cardinality labels. Nothing here
    // is a measurement and nothing identifies a community.
    expect(Object.keys(record.properties)).not.toContain('subjectId');
  });

  it('uses one naming convention — §50', () => {
    resetCreatorEvents();
    trackAnalyticsEvent('analytics.hub.viewed');
    trackAnalyticsEvent('analytics.export.requested');

    const records = drainCreatorEvents();

    for (const record of records) {
      // `domain.subject.verb`, lower-case dotted, past-tense verb. The convention
      // Phase 7 established and Phases 8, 12 and 13 kept.
      expect(record.event).toMatch(/^analytics\.[a-z_]+\.[a-z_]+$/);
      expect(record.event).toBe(record.event.toLowerCase());
    }
  });
});

describe('§61 · the gap register is internally consistent', () => {
  const gaps = Object.values(ANALYTICS_GAPS);

  it('every gap key matches its record key', () => {
    for (const [key, gap] of Object.entries(ANALYTICS_GAPS)) {
      expect(gap.key).toBe(key);
    }
  });

  it('every gap id is unique and correctly formatted', () => {
    const ids = gaps.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(id).toMatch(/^FRONTEND-PHASE15-GAP-\d{3}$/);
    }
  });

  it('every gap names at least one missing capability and one contract', () => {
    for (const gap of gaps) {
      expect(gap.missingBackendCapability.length).toBeGreaterThan(0);
      // GAP-025 and GAP-029 are authorization and ingestion rather than queries,
      // but both still name a contract — an entry with none is not actionable.
      expect(gap.requiredContracts.length).toBeGreaterThan(0);
    }
  });

  it('every gap states its privacy and security considerations', () => {
    for (const gap of gaps) {
      expect(gap.privacyConsiderations.length).toBeGreaterThan(20);
      expect(gap.securityConsiderations.length).toBeGreaterThan(10);
    }
  });

  it('no gap claims to be implemented-but-incomplete', () => {
    // The final principle: never leave a screen unfinished because the backend is
    // behind. Every entry is connected, partial, or complete through an adapter.
    for (const gap of gaps) {
      expect([
        'IMPLEMENTED + BACKEND CONNECTED',
        'IMPLEMENTED + BACKEND PARTIAL',
        'IMPLEMENTED + DEVELOPMENT ADAPTER',
      ]).toContain(gap.frontendStatus);
    }
  });

  it('every contract states how the server must aggregate', () => {
    // §61 asks for aggregation explicitly, and it is the field a backend team
    // most needs — "return views per day" and "return a distinct-viewer sketch
    // unioned server-side" are different endpoints.
    for (const gap of gaps) {
      for (const contract of gap.requiredContracts) {
        expect(contract.aggregation.length).toBeGreaterThan(3);
      }
    }
  });
});
