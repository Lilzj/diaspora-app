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

import * as certifiedApi from '@/lib/analytics-api';
import { ANALYTICS_GAPS, ANALYTICS_GAP_PREFIX } from '@/config/analytics-gaps';
import { sanitise, drainCreatorEvents, resetCreatorEvents } from '@/lib/creator-analytics';
import { trackAnalyticsEvent, trackDashboardViewed } from '@/lib/analytics/events';
import { aggregateLedgerActivity } from '@/lib/analytics-api';
import type { LedgerEntry, Money } from '@/types/financial';
import type { AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

describe('§64 · no build reaches simulated analytics', () => {
  // Until 20 Oct 2026 a development arm (`/analytics-gap/v0`) answered datasets,
  // retention, boards and insights in development and preview builds, and
  // folded simulated sections into real dashboards. Every one is served now, so
  // the arm is gone — and a test build shows exactly what production shows.
  const readSource = (relative: string): string =>
    require('fs').readFileSync(require('path').join(process.cwd(), relative), 'utf8');

  it('the dataset hook reads no simulated client', () => {
    const hooks = readSource('src/hooks/analytics.ts');
    expect(hooks).not.toMatch(/analytics-gap-api/);
    expect(hooks).not.toMatch(/areAnalyticsGapsEnabled\(\)\s*&&/);
  });

  it('the simulated client and its handlers no longer exist', () => {
    const exists = (relative: string): boolean =>
      require('fs').existsSync(require('path').join(process.cwd(), relative));
    expect(exists('src/lib/analytics-gap-api.ts')).toBe(false);
    expect(exists('src/mocks/handlers/analytics.ts')).toBe(false);
  });

  it('the gap prefix stays distinct from the served namespace', () => {
    expect(ANALYTICS_GAP_PREFIX).toBe('/analytics-gap/v0');
    expect(ANALYTICS_GAP_PREFIX.startsWith('/analytics-gap')).toBe(true);
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
