// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics time ranges (Frontend Phase 15, §6 · §7 · §58)
//
// The arithmetic every dashboard depends on, and the one module where a bug is
// wrong everywhere at once — a mis-resolved range means every figure on every
// screen covers the wrong days while claiming to cover the right ones.
//
// `now` is passed explicitly to every assertion. A test whose expectations depend
// on the day it runs is a test that fails on the first of the month, gets marked
// flaky, and is deleted.
// ─────────────────────────────────────────────────────────────────────────────

import {
  COMPARISON_LABELS,
  RANGE_LABELS,
  baselineRange,
  civilDateInZone,
  defaultGranularity,
  describeRangeProblem,
  describeTimezone,
  enumerateBuckets,
  isCivilDate,
  isPartialBucket,
  rangeDayCount,
  rangeToken,
  resolveRange,
  resolveReportingTimezone,
  validateCustomRange,
} from '@/lib/analytics/time-range';
import type { AnalyticsRangePreset, AnalyticsTimeRange } from '@/types/analytics';

/** A Saturday, mid-afternoon UTC. */
const NOW = new Date('2026-08-08T14:30:00Z');
const ZONE = 'Europe/London';

function resolve(preset: AnalyticsRangePreset, extra: Record<string, unknown> = {}) {
  return resolveRange(preset, { reportingTimezone: ZONE, now: NOW, ...extra });
}

describe('§6 · every preset resolves to a civil window', () => {
  const presets: AnalyticsRangePreset[] = [
    'today',
    'yesterday',
    'last7d',
    'last30d',
    'last90d',
    'thisMonth',
    'previousMonth',
    'thisYear',
    'previousYear',
    'allTime',
    'custom',
  ];

  it.each(presets)('%s produces two well-formed dates and a zone', (preset) => {
    const range = resolve(preset);

    expect(isCivilDate(range.from)).toBe(true);
    expect(isCivilDate(range.to)).toBe(true);
    expect(range.from <= range.to).toBe(true);
    expect(range.timezone).toBe(ZONE);
    expect(range.isDeviceTimezone).toBe(false);
  });

  it('every preset has a label', () => {
    for (const preset of presets) {
      expect(RANGE_LABELS[preset]).toBeTruthy();
    }
  });

  it('today is one day', () => {
    const range = resolve('today');
    expect(range.from).toBe('2026-08-08');
    expect(range.to).toBe('2026-08-08');
    expect(rangeDayCount(range)).toBe(1);
  });

  it('yesterday is the day before, and is also one day', () => {
    const range = resolve('yesterday');
    expect(range.from).toBe('2026-08-07');
    expect(range.to).toBe('2026-08-07');
    expect(rangeDayCount(range)).toBe(1);
  });

  it('last 7 days includes today, so it is seven days and not eight', () => {
    const range = resolve('last7d');
    expect(range.from).toBe('2026-08-02');
    expect(range.to).toBe('2026-08-08');
    expect(rangeDayCount(range)).toBe(7);
  });

  it('last 30 days is thirty days', () => {
    expect(rangeDayCount(resolve('last30d'))).toBe(30);
  });

  it('last 90 days is ninety days', () => {
    expect(rangeDayCount(resolve('last90d'))).toBe(90);
  });

  it('this month runs from the first to today, not to the month end', () => {
    const range = resolve('thisMonth');
    expect(range.from).toBe('2026-08-01');
    expect(range.to).toBe('2026-08-08');
  });

  it('last month is a whole calendar month', () => {
    const range = resolve('previousMonth');
    expect(range.from).toBe('2026-07-01');
    expect(range.to).toBe('2026-07-31');
    expect(rangeDayCount(range)).toBe(31);
  });

  it('this year runs from January to today', () => {
    const range = resolve('thisYear');
    expect(range.from).toBe('2026-01-01');
    expect(range.to).toBe('2026-08-08');
  });

  it('last year is a whole calendar year', () => {
    const range = resolve('previousYear');
    expect(range.from).toBe('2025-01-01');
    expect(range.to).toBe('2025-12-31');
    expect(rangeDayCount(range)).toBe(365);
  });

  it('all time honours a known earliest date', () => {
    const range = resolve('allTime', { earliestDate: '2024-03-15' });
    expect(range.from).toBe('2024-03-15');
  });

  it('all time falls back to a bounded window rather than an unbounded one', () => {
    // An unbounded request is one the backend refuses. Five years is a window.
    const range = resolve('allTime');
    expect(range.from).toBe('2021-08-08');
  });

  it('custom honours the dates given', () => {
    const range = resolve('custom', { from: '2026-02-01', to: '2026-02-28' });
    expect(range.from).toBe('2026-02-01');
    expect(range.to).toBe('2026-02-28');
  });

  it('custom falls back rather than throwing on a malformed date', () => {
    // The *validator* refuses a bad range; the resolver never throws, because a
    // screen holding a half-typed date must still render.
    const range = resolve('custom', { from: 'not-a-date', to: '2026-02-28' });
    expect(isCivilDate(range.from)).toBe(true);
  });
});

describe('§58 · timezone semantics', () => {
  it('uses the backend’s reporting zone when it publishes one', () => {
    const resolved = resolveReportingTimezone('Europe/London');
    expect(resolved.timezone).toBe('Europe/London');
    expect(resolved.isDeviceTimezone).toBe(false);
  });

  it('falls back to the device zone and says so', () => {
    const resolved = resolveReportingTimezone(null);
    expect(resolved.isDeviceTimezone).toBe(true);
    expect(resolved.timezone.length).toBeGreaterThan(0);
  });

  it('falls back rather than throwing on an unknown zone name', () => {
    const resolved = resolveReportingTimezone('Mars/Olympus_Mons');
    expect(resolved.isDeviceTimezone).toBe(true);
  });

  // The failure §58 exists to prevent, demonstrated.
  it('resolves a different "today" either side of the date line', () => {
    const lateEvening = new Date('2026-08-08T23:30:00Z');

    const london = civilDateInZone(lateEvening, 'Europe/London');
    const auckland = civilDateInZone(lateEvening, 'Pacific/Auckland');
    const losAngeles = civilDateInZone(lateEvening, 'America/Los_Angeles');

    expect(london).toBe('2026-08-09'); // BST is UTC+1
    expect(auckland).toBe('2026-08-09'); // NZST is UTC+12
    expect(losAngeles).toBe('2026-08-08'); // PDT is UTC−7

    // Three members asking for "today" at the same instant get two different
    // days, which is why the range carries the zone rather than an instant.
    expect(new Set([london, auckland, losAngeles]).size).toBe(2);
  });

  it('the timezone note tells the member which calendar they are looking at', () => {
    const platformZone = resolve('last7d');
    expect(describeTimezone(platformZone)).toContain('Europe/London');
    expect(describeTimezone(platformZone)).toContain('reporting timezone');

    const deviceZone: AnalyticsTimeRange = { ...platformZone, isDeviceTimezone: true };
    expect(describeTimezone(deviceZone)).toContain('your device');
  });

  it('the cache token includes the zone, so two calendars are two entries', () => {
    const london = resolve('today');
    const auckland = resolveRange('today', { reportingTimezone: 'Pacific/Auckland', now: NOW });

    expect(rangeToken(london)).not.toBe(rangeToken(auckland));
  });

  it('the cache token excludes the preset, so the same window is one entry', () => {
    const asPreset = resolve('last30d');
    const asCustom = resolve('custom', { from: asPreset.from, to: asPreset.to });

    expect(rangeToken(asPreset)).toBe(rangeToken(asCustom));
  });
});

describe('§6 · custom range validation refuses rather than corrects', () => {
  const today = '2026-08-08';

  it('accepts a sane range', () => {
    expect(validateCustomRange('2026-07-01', '2026-07-31', { today })).toBeNull();
  });

  it('accepts a single day', () => {
    expect(validateCustomRange('2026-07-01', '2026-07-01', { today })).toBeNull();
  });

  it('refuses a malformed date', () => {
    expect(validateCustomRange('2026-13-45', '2026-07-31', { today })).toBe('malformed');
    expect(validateCustomRange('', '2026-07-31', { today })).toBe('malformed');
  });

  it('refuses an inverted range — and does not silently swap it', () => {
    expect(validateCustomRange('2026-07-31', '2026-07-01', { today })).toBe('inverted');
  });

  it('refuses a future end date', () => {
    expect(validateCustomRange('2026-08-01', '2026-12-31', { today })).toBe('future');
  });

  it('refuses a range longer than the cap', () => {
    expect(validateCustomRange('2020-01-01', '2026-08-08', { today })).toBe('tooLong');
  });

  it('every refusal has a sentence a member can act on', () => {
    const problems = ['malformed', 'inverted', 'future', 'tooLong'] as const;
    for (const problem of problems) {
      const sentence = describeRangeProblem(problem);
      expect(sentence.length).toBeGreaterThan(15);
      expect(sentence).toMatch(/[.!]$/);
    }
  });
});

describe('§7 · comparison baselines', () => {
  it('the previous period is the same length, immediately before', () => {
    const range = resolve('last30d'); // 2026-07-10 … 2026-08-08
    const baseline = baselineRange(range, 'previousPeriod');

    expect(baseline).toEqual({ from: '2026-06-10', to: '2026-07-09' });
    expect(rangeDayCount(baseline!)).toBe(rangeDayCount(range));
  });

  it('the previous period does not overlap the range', () => {
    const range = resolve('last7d');
    const baseline = baselineRange(range, 'previousPeriod')!;
    expect(baseline.to < range.from).toBe(true);
  });

  it('previous month shifts a calendar month, clamping the day', () => {
    // 31 March minus one month is 28 February, not 3 March.
    const range: AnalyticsTimeRange = {
      preset: 'custom',
      from: '2026-03-31',
      to: '2026-03-31',
      timezone: ZONE,
      isDeviceTimezone: false,
    };

    expect(baselineRange(range, 'previousMonth')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('previous year shifts twelve months', () => {
    const range = resolve('last30d');
    expect(baselineRange(range, 'previousYear')).toEqual({
      from: '2025-07-10',
      to: '2025-08-08',
    });
  });

  // The important null. A platform average is a figure, not a period, and a
  // caller that treated it as a date range would send a meaningless request.
  it.each(['none', 'platformAverage', 'communityAverage', 'countryAverage', 'custom'] as const)(
    '%s has no baseline window',
    (basis) => {
      expect(baselineRange(resolve('last30d'), basis)).toBeNull();
    }
  );

  it('every basis has a label', () => {
    for (const basis of Object.keys(COMPARISON_LABELS)) {
      expect(COMPARISON_LABELS[basis as keyof typeof COMPARISON_LABELS]).toBeTruthy();
    }
  });
});

describe('§39 · granularity and buckets', () => {
  it('chooses a granularity from the span rather than the preset', () => {
    expect(defaultGranularity({ from: '2026-08-08', to: '2026-08-08' })).toBe('hour');
    expect(defaultGranularity({ from: '2026-07-10', to: '2026-08-08' })).toBe('day');
    expect(defaultGranularity({ from: '2026-05-10', to: '2026-08-08' })).toBe('week');
    expect(defaultGranularity({ from: '2025-01-01', to: '2026-08-08' })).toBe('month');
    expect(defaultGranularity({ from: '2019-01-01', to: '2026-08-08' })).toBe('quarter');
  });

  it('a 400-day custom range and previousYear get the same treatment', () => {
    const custom = defaultGranularity({ from: '2025-07-05', to: '2026-08-08' });
    const previousYear = defaultGranularity(resolve('previousYear'));
    expect(custom).toBe(previousYear);
  });

  it('enumerates one bucket per day for a daily range', () => {
    const buckets = enumerateBuckets({ from: '2026-08-01', to: '2026-08-07' }, 'day');
    expect(buckets).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });

  it('enumerates weekly buckets seven days apart', () => {
    const buckets = enumerateBuckets({ from: '2026-08-01', to: '2026-08-29' }, 'week');
    expect(buckets).toEqual(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29']);
  });

  it('enumerates monthly buckets on the same day of each month', () => {
    const buckets = enumerateBuckets({ from: '2026-01-01', to: '2026-06-01' }, 'month');
    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toBe('2026-01-01');
    expect(buckets[5]).toBe('2026-06-01');
  });

  it('never runs away on a very long range', () => {
    const buckets = enumerateBuckets({ from: '1990-01-01', to: '2026-08-08' }, 'day');
    // Guarded, so a mis-specified range cannot hang the UI thread.
    expect(buckets.length).toBeLessThanOrEqual(4001);
  });

  it('a single-day range still yields one bucket', () => {
    expect(enumerateBuckets({ from: '2026-08-08', to: '2026-08-08' }, 'day')).toEqual(['2026-08-08']);
  });
});

describe('§39 · partial buckets are identified', () => {
  const range = resolve('last7d');

  it('today is partial at day granularity', () => {
    expect(isPartialBucket('2026-08-08', 'day', range, NOW)).toBe(true);
    expect(isPartialBucket('2026-08-07', 'day', range, NOW)).toBe(false);
  });

  it('the week containing today is partial', () => {
    // 2026-08-02 is a Sunday; the week it starts contains 2026-08-08.
    expect(isPartialBucket('2026-08-02', 'week', range, NOW)).toBe(true);
    expect(isPartialBucket('2026-07-26', 'week', range, NOW)).toBe(false);
  });

  it('the current month is partial', () => {
    expect(isPartialBucket('2026-08-01', 'month', range, NOW)).toBe(true);
    expect(isPartialBucket('2026-07-01', 'month', range, NOW)).toBe(false);
  });

  it('the current year is partial', () => {
    expect(isPartialBucket('2026-01-01', 'year', range, NOW)).toBe(true);
    expect(isPartialBucket('2025-01-01', 'year', range, NOW)).toBe(false);
  });
});

describe('civil date arithmetic survives the awkward cases', () => {
  it('crosses a month boundary', () => {
    const range = resolveRange('last7d', {
      reportingTimezone: ZONE,
      now: new Date('2026-03-03T12:00:00Z'),
    });
    expect(range.from).toBe('2026-02-25');
    expect(range.to).toBe('2026-03-03');
  });

  it('crosses a leap day', () => {
    const range = resolveRange('last7d', {
      reportingTimezone: ZONE,
      now: new Date('2028-03-02T12:00:00Z'),
    });
    // 2028 is a leap year, so 29 February exists and is counted.
    expect(range.from).toBe('2028-02-25');
    expect(rangeDayCount(range)).toBe(7);
  });

  it('crosses a year boundary', () => {
    const range = resolveRange('last30d', {
      reportingTimezone: ZONE,
      now: new Date('2027-01-05T12:00:00Z'),
    });
    expect(range.from).toBe('2026-12-07');
    expect(range.to).toBe('2027-01-05');
  });

  // The reason the arithmetic uses UTC as a calendar rather than as a clock.
  it('a DST transition does not add or lose a day', () => {
    // Europe/London springs forward on 29 March 2026.
    const range = resolveRange('last7d', {
      reportingTimezone: 'Europe/London',
      now: new Date('2026-03-31T12:00:00Z'),
    });
    expect(rangeDayCount(range)).toBe(7);
    expect(range.from).toBe('2026-03-25');
    expect(range.to).toBe('2026-03-31');
  });

  it('rejects a date that looks well-formed but names no day', () => {
    expect(isCivilDate('2026-02-30')).toBe(false);
    expect(isCivilDate('2026-13-01')).toBe(false);
    expect(isCivilDate('2026-1-1')).toBe(false);
    expect(isCivilDate('2026-02-28')).toBe(true);
  });
});
