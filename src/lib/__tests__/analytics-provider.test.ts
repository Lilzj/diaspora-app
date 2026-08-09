// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Development analytics provider (Frontend Phase 15,
// §59 · §60 · §73)
//
// §60 requires the development data to be deterministic, and this file is what
// makes that a fact rather than an intention.
//
// The reason it matters is worth restating, because "deterministic mock data"
// sounds like tidiness and is not: a provider built on `Math.random()` produces a
// dashboard whose numbers change on every render, and the consequence is not a
// flickering chart. It is that **an inconsistency between two analytics screens
// stops being falsifiable.** A reviewer who sees two different numbers for the
// same metric cannot tell whether they have found a bug or a coin toss.
//
// So the assertions here are mostly of the form "the same question twice gives
// the same answer", and the interesting ones are the internal-consistency checks:
// a breakdown that sums to its headline, a funnel that narrows, retention that
// only falls, and impressions that outnumber sales.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEV_FUNNELS,
  DEV_SUBJECT_FIXTURES,
  HEADLINE_METRICS,
  SUBJECT_GAP_KEY,
  buildDevAccess,
  buildDevDataset,
  buildFunnel,
  buildRetention,
  devCurrencyFor,
} from '@/mocks/analytics-data';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import { ANALYTICS_GAPS } from '@/config/analytics-gaps';
import type { AnalyticsQuery, AnalyticsSubject, AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

function query(subject: AnalyticsSubject, overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return { subject, range: RANGE, ...overrides };
}

const PLATFORM: AnalyticsSubject = { type: 'platform', id: null };
const NIGERIAN: AnalyticsSubject = { type: 'community', id: 'dev-ng' };
const GHANAIAN: AnalyticsSubject = { type: 'community', id: 'dev-gh' };

describe('§60 · the same question always gives the same answer', () => {
  it('two identical dataset requests are deeply equal', () => {
    const first = buildDevDataset(query(NIGERIAN, { includeSeries: true, breakdowns: ['country'] }));
    const second = buildDevDataset(query(NIGERIAN, { includeSeries: true, breakdowns: ['country'] }));

    expect(first).toEqual(second);
  });

  it('a hundred calls produce one distinct result', () => {
    const results = new Set(
      Array.from({ length: 100 }, () => JSON.stringify(buildDevDataset(query(PLATFORM))))
    );
    expect(results.size).toBe(1);
  });

  it('the freshness stamp does not move between calls', () => {
    // `new Date().toISOString()` here would make every render a different dataset
    // and every snapshot test unwritable.
    const first = buildDevDataset(query(PLATFORM));
    const second = buildDevDataset(query(PLATFORM));

    expect(first.freshness.computedAt).toBe(second.freshness.computedAt);
    // Derived from the range, so it is a plausible nightly-rollup time.
    expect(first.freshness.computedAt).toBe('2026-08-08T03:00:00.000Z');
  });

  it('funnels are deterministic', () => {
    const first = buildFunnel('marketplace', { type: 'seller', id: 's1' }, query({ type: 'seller', id: 's1' }), 'marketplaceAnalytics');
    const second = buildFunnel('marketplace', { type: 'seller', id: 's1' }, query({ type: 'seller', id: 's1' }), 'marketplaceAnalytics');

    expect(first).toEqual(second);
  });

  it('retention tables are deterministic', () => {
    const first = buildRetention(PLATFORM, query(PLATFORM), 'retentionAnalytics', 'week', 8);
    const second = buildRetention(PLATFORM, query(PLATFORM), 'retentionAnalytics', 'week', 8);

    expect(first).toEqual(second);
  });

  it('a currency is stable for a subject', () => {
    // A dashboard whose currency changed between renders would be worse than
    // useless.
    const first = devCurrencyFor({ type: 'creator', id: 'c1' });
    const second = devCurrencyFor({ type: 'creator', id: 'c1' });

    expect(first).toEqual(second);
  });
});

describe('§60 · different questions give different answers', () => {
  it('two communities do not report identical figures', () => {
    const nigerian = buildDevDataset(query(NIGERIAN));
    const ghanaian = buildDevDataset(query(GHANAIAN));

    const nigerianValues = nigerian.metrics.map((metric) => metric.value.value);
    const ghanaianValues = ghanaian.metrics.map((metric) => metric.value.value);

    expect(nigerianValues).not.toEqual(ghanaianValues);
  });

  it('two periods do not report identical figures', () => {
    const july = buildDevDataset(query(PLATFORM));
    const june = buildDevDataset(
      query(PLATFORM, { range: { ...RANGE, from: '2026-06-10', to: '2026-07-09' } })
    );

    expect(july.metrics.map((m) => m.value.value)).not.toEqual(
      june.metrics.map((m) => m.value.value)
    );
  });

  it('a comparison sometimes rises and sometimes falls across subjects', () => {
    // A generator whose trend was always upward would hide every negative-delta
    // rendering path — the red arrow, the "lower is better" inversion, the
    // accessible "down" wording.
    const directions = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => {
      const dataset = buildDevDataset(
        query({ type: 'provider', id }, { comparison: 'previousPeriod' })
      );
      const change = dataset.metrics[0]?.comparison?.changePercent ?? 0;
      return change >= 0 ? 'up' : 'down';
    });

    expect(new Set(directions).size).toBe(2);
  });
});

describe('§59 · the figures are internally consistent', () => {
  it('a breakdown sums to its headline metric', () => {
    // The single most obvious way a simulated dashboard reveals itself — and
    // the exact bug a real one can have.
    const dataset = buildDevDataset(query(PLATFORM, { breakdowns: ['country'] }));
    const breakdown = dataset.breakdowns[0];
    const headline = dataset.metrics.find((metric) => metric.key === breakdown.metricKey);

    const sum = breakdown.buckets.reduce((total, bucket) => total + bucket.value, 0);

    expect(headline).toBeDefined();
    // Rounding per bucket means the sum is close rather than exact.
    expect(Math.abs(sum - headline!.value.value)).toBeLessThanOrEqual(breakdown.buckets.length);
  });

  it('breakdown ratios sum to one', () => {
    const dataset = buildDevDataset(query(PLATFORM, { breakdowns: ['category'] }));
    const ratios = dataset.breakdowns[0].buckets.map((bucket) => bucket.ratio ?? 0);
    const sum = ratios.reduce((total, ratio) => total + ratio, 0);

    expect(sum).toBeCloseTo(1, 5);
  });

  it('breakdown buckets are ordered by value descending', () => {
    // The client never sorts a breakdown, so the provider must.
    const dataset = buildDevDataset(query(PLATFORM, { breakdowns: ['country'] }));
    const values = dataset.breakdowns[0].buckets.map((bucket) => bucket.value);

    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('a funnel narrows at every step', () => {
    for (const funnelKey of Object.keys(DEV_FUNNELS)) {
      const funnel = buildFunnel(
        funnelKey,
        { type: 'seller', id: 's1' },
        query({ type: 'seller', id: 's1' }),
        'marketplaceAnalytics'
      );

      const counts = funnel!.steps.map((step) => step.count);
      for (let index = 1; index < counts.length; index += 1) {
        expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
      }
    }
  });

  it('a funnel’s drop-off is never negative', () => {
    const funnel = buildFunnel('job', { type: 'employer', id: 'e1' }, query({ type: 'employer', id: 'e1' }), 'employerAnalytics');

    for (const step of funnel!.steps) {
      if (step.dropOffFromPrevious !== null && step.dropOffFromPrevious !== undefined) {
        expect(step.dropOffFromPrevious).toBeGreaterThanOrEqual(0);
        expect(step.dropOffFromPrevious).toBeLessThanOrEqual(1);
      }
    }
  });

  it('retention only ever falls, and never rises', () => {
    const table = buildRetention(PLATFORM, query(PLATFORM), 'retentionAnalytics', 'week', 8);

    for (const cohort of table.cohorts) {
      const known = cohort.values.filter((value): value is number => value !== null);
      for (let index = 1; index < known.length; index += 1) {
        expect(known[index]).toBeLessThanOrEqual(known[index - 1]);
      }
    }
  });

  it('retention starts at 100% for every cohort', () => {
    const table = buildRetention(PLATFORM, query(PLATFORM), 'retentionAnalytics', 'week', 8);
    for (const cohort of table.cohorts) {
      expect(cohort.values[0]).toBe(1);
    }
  });

  // §33's central requirement, at the data level.
  it('an unelapsed retention offset is null rather than zero', () => {
    const table = buildRetention(PLATFORM, query(PLATFORM), 'retentionAnalytics', 'week', 8);
    const newest = table.cohorts[table.cohorts.length - 1];

    expect(newest.isIncomplete).toBe(true);
    expect(newest.values.some((value) => value === null)).toBe(true);
    // And never zero, which would mean "everybody left".
    expect(newest.values.slice(1).every((value) => value !== 0)).toBe(true);
  });

  it('a retention table states its measurement window', () => {
    const table = buildRetention(PLATFORM, query(PLATFORM), 'retentionAnalytics', 'week', 8);
    expect(table.measurementWindow.length).toBeGreaterThan(40);
    expect(table.offsetLabels.length).toBeGreaterThan(0);
  });

  it('a platform is busier than a community, which is busier than a listing', () => {
    const value = (subject: AnalyticsSubject) => {
      const dataset = buildDevDataset(query(subject, { metrics: ['content.views'] }));
      return dataset.metrics[0]?.value.value ?? 0;
    };

    expect(value(PLATFORM)).toBeGreaterThan(value(NIGERIAN));
    expect(value(NIGERIAN)).toBeGreaterThan(value({ type: 'listing', id: 'l1' }));
  });

  it('a stock metric is not multiplied by the period length', () => {
    // Summing a membership level over thirty days would report thirty times the
    // membership — the classic stock-versus-flow error.
    const short = buildDevDataset(
      query(NIGERIAN, { metrics: ['reach.members'], range: { ...RANGE, from: '2026-08-08' } })
    );
    const long = buildDevDataset(query(NIGERIAN, { metrics: ['reach.members'] }));

    const shortValue = short.metrics[0].value.value;
    const longValue = long.metrics[0].value.value;

    // Within a factor of two, not a factor of thirty.
    expect(longValue).toBeLessThan(shortValue * 2);
  });

  it('a flow metric does grow with the period length', () => {
    const short = buildDevDataset(
      query(PLATFORM, { metrics: ['content.views'], range: { ...RANGE, from: '2026-08-06' } })
    );
    const long = buildDevDataset(query(PLATFORM, { metrics: ['content.views'] }));

    expect(long.metrics[0].value.value).toBeGreaterThan(short.metrics[0].value.value * 3);
  });

  it('a rate stays inside a plausible band regardless of period', () => {
    const dataset = buildDevDataset(query(PLATFORM, { metrics: ['audience.stickiness.dau_mau'] }));
    const value = dataset.metrics[0].value.value;

    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});

describe('§38 · every simulated figure is marked', () => {
  it('every metric carries `simulated` and a gap key', () => {
    const dataset = buildDevDataset(query(NIGERIAN, { includeSeries: true, breakdowns: ['country'] }));

    for (const metric of dataset.metrics) {
      expect(metric.value.source).toBe('simulated');
      expect(metric.value.gapKey).toBeTruthy();
    }

    for (const series of dataset.series) {
      expect(series.source).toBe('simulated');
    }

    for (const breakdown of dataset.breakdowns) {
      expect(breakdown.source).toBe('simulated');
    }
  });

  it('the dataset status says development data', () => {
    expect(buildDevDataset(query(NIGERIAN)).status).toBe('DEVELOPMENT_DATA');
  });

  it('the freshness names the adapter and states the limitation', () => {
    const dataset = buildDevDataset(query(NIGERIAN));

    expect(dataset.freshness.sourceName).toContain('development adapter');
    expect(dataset.freshness.limitations?.join(' ')).toContain('simulated');
  });

  it('every subject’s gap key exists in the register', () => {
    for (const [subjectType, gapKey] of Object.entries(SUBJECT_GAP_KEY)) {
      expect(ANALYTICS_GAPS[gapKey]).toBeDefined();
      expect(gapKey).toBeTruthy();
      expect(subjectType).toBeTruthy();
    }
  });
});

describe('§73 · every empty and unavailable state is reachable', () => {
  it('`noActivity` returns metrics that are genuinely zero', () => {
    const dataset = buildDevDataset(query({ type: 'community', id: DEV_SUBJECT_FIXTURES.noActivity }));

    expect(dataset.metrics.length).toBeGreaterThan(0);
    expect(dataset.metrics.every((metric) => metric.value.value === 0)).toBe(true);
  });

  it('`noData` returns no metrics at all — a different state', () => {
    const dataset = buildDevDataset(query({ type: 'community', id: DEV_SUBJECT_FIXTURES.noData }));

    expect(dataset.metrics).toEqual([]);
    expect(dataset.unavailableMetrics.length).toBeGreaterThan(0);
  });

  it('`partial` answers some metrics and lists the rest as unavailable', () => {
    const dataset = buildDevDataset(query({ type: 'community', id: DEV_SUBJECT_FIXTURES.partial }));

    expect(dataset.status).toBe('PARTIAL');
    expect(dataset.metrics.length).toBeGreaterThan(0);
    expect(dataset.unavailableMetrics.length).toBeGreaterThan(0);
  });

  it('`unavailable` says the backend could not produce it', () => {
    const dataset = buildDevDataset(
      query({ type: 'community', id: DEV_SUBJECT_FIXTURES.unavailable })
    );
    expect(dataset.status).toBe('UNAVAILABLE');
  });

  it('`suppressed` withholds the value rather than showing it', () => {
    const dataset = buildDevDataset(
      query({ type: 'community', id: DEV_SUBJECT_FIXTURES.suppressed })
    );

    const suppressed = dataset.metrics.filter((metric) => metric.isSuppressed);
    expect(suppressed.length).toBeGreaterThan(0);
  });

  it('`newSubject` has no comparison baseline, and says why', () => {
    const dataset = buildDevDataset(
      query(
        { type: 'community', id: DEV_SUBJECT_FIXTURES.newSubject },
        { comparison: 'previousPeriod' }
      )
    );

    for (const metric of dataset.metrics) {
      expect(metric.comparison?.changePercent).toBeNull();
      expect(metric.comparison?.unavailableReason).toBe('insufficientHistory');
    }
  });

  it('a public metric is never suppressed, because a public count identifies nobody', () => {
    const dataset = buildDevDataset(
      query(
        { type: 'community', id: DEV_SUBJECT_FIXTURES.suppressed },
        { metrics: ['inventory.guides'] }
      )
    );

    expect(dataset.metrics[0].isSuppressed).toBe(false);
  });
});

describe('§7 · a comparison the adapter cannot compute says so', () => {
  it('a platform average is unsupported rather than invented', () => {
    // The adapter has no cross-subject aggregate to average, and inventing a peer
    // group would be inventing a judgement.
    const dataset = buildDevDataset(query(NIGERIAN, { comparison: 'platformAverage' }));

    for (const metric of dataset.metrics) {
      expect(metric.comparison?.changePercent).toBeNull();
      expect(metric.comparison?.unavailableReason).toBe('unsupported');
    }
  });

  it('no comparison means no comparison object at all', () => {
    const dataset = buildDevDataset(query(NIGERIAN, { comparison: 'none' }));
    for (const metric of dataset.metrics) {
      expect(metric.comparison).toBeNull();
    }
  });
});

describe('§57 · currency is explicit and varied', () => {
  it('emits more than one exponent across subjects, so an exponent bug cannot hide', () => {
    const exponents = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
        (id) => devCurrencyFor({ type: 'creator', id }).exponent
      )
    );

    expect(exponents.size).toBeGreaterThan(1);
  });

  it('a currency metric carries a Money with a matching exponent', () => {
    const dataset = buildDevDataset(
      query({ type: 'seller', id: 's1' }, { metrics: ['revenue.gross'] })
    );
    const metric = dataset.metrics[0];
    const currency = devCurrencyFor({ type: 'seller', id: 's1' });

    expect(metric.format).toBe('currency');
    expect(metric.money).not.toBeNull();
    expect(metric.money!.currency).toBe(currency.currency);
    expect(metric.money!.exponent).toBe(currency.exponent);
    // `minorUnits` is the authority, and `amount` is derived from it.
    expect(metric.money!.amount).toBeCloseTo(
      metric.money!.minorUnits / 10 ** metric.money!.exponent,
      6
    );
  });

  it('a non-currency metric carries no Money', () => {
    const dataset = buildDevDataset(query(PLATFORM, { metrics: ['content.views'] }));
    expect(dataset.metrics[0].money).toBeNull();
  });
});

describe('§35 · the provider only emits metrics the catalogue defines', () => {
  it('every headline set names known metrics', () => {
    for (const [subjectType, keys] of Object.entries(HEADLINE_METRICS)) {
      for (const key of keys) {
        expect(ANALYTICS_DEFINITIONS[key]).toBeDefined();
      }
      expect(subjectType).toBeTruthy();
    }
  });

  it('every metric’s label comes from the catalogue rather than the provider', () => {
    const dataset = buildDevDataset(query(PLATFORM));
    for (const metric of dataset.metrics) {
      expect(metric.label).toBe(ANALYTICS_DEFINITIONS[metric.key].label);
    }
  });

  it('every metric’s format and privacy class come from the catalogue', () => {
    const dataset = buildDevDataset(query({ type: 'seller', id: 's1' }));
    for (const metric of dataset.metrics) {
      const definition = ANALYTICS_DEFINITIONS[metric.key];
      expect(metric.format).toBe(definition.format);
      expect(metric.privacyClass).toBe(definition.privacyClass);
      expect(metric.higherIsBetter).toBe(definition.higherIsBetter);
    }
  });
});

describe('§32 · the provider invents no funnel', () => {
  it('offers exactly the funnels §32 names', () => {
    expect(Object.keys(DEV_FUNNELS).sort()).toEqual([
      'housing',
      'job',
      'marketplace',
      'monetization',
      'provider',
    ]);
  });

  it('returns null for an unknown funnel rather than generating one', () => {
    expect(
      buildFunnel('invented', PLATFORM, query(PLATFORM), 'funnelAnalytics')
    ).toBeNull();
  });
});

describe('§48 · the development capability set defaults to a member’s, not an administrator’s', () => {
  it('platform analytics is refused unless the administrative preview is asked for', () => {
    const asMember = buildDevAccess(PLATFORM);
    expect(asMember.canView).toBe(false);
    expect(asMember.canViewAdministrative).toBe(false);
  });

  it('the administrative preview is opt-in', () => {
    const asAdministrator = buildDevAccess(PLATFORM, { asAdministrator: true });
    expect(asAdministrator.canView).toBe(true);
    expect(asAdministrator.canViewAdministrative).toBe(true);
  });

  it('a member can see their own subjects without any opt-in', () => {
    // §72: not all analytics is administrative, and owner-level analytics must not
    // be harder to reach than platform analytics.
    const creator = buildDevAccess({ type: 'creator', id: null });
    expect(creator.canView).toBe(true);
    expect(creator.canViewFinancial).toBe(true);
  });

  it('restricts administrative metrics for a non-administrative caller', () => {
    // So the omission path is exercised in development rather than only in
    // production.
    const asMember = buildDevAccess({ type: 'community', id: 'dev-ng' });
    expect(asMember.restrictedMetrics.length).toBeGreaterThan(0);
  });

  it('publishes a reporting timezone, so the platform-timezone copy is reachable', () => {
    expect(buildDevAccess(PLATFORM).reportingTimezone).toBe('Europe/London');
  });

  it('never reports a capability set for a subject other than the one asked about', () => {
    const access = buildDevAccess(NIGERIAN);
    expect(access.subject).toEqual(NIGERIAN);
  });
});
