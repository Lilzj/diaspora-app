// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics formatting (Frontend Phase 15,
// §39 · §55 · §56 · §57)
//
// Two properties dominate this file.
//
// **§55: colour is never the only indicator.** `deltaView()` returns four
// channels — a colour tone, an arrow glyph, a direction *word*, and a spoken
// sentence — and the assertions check all four rather than only the tone. A
// component that rendered just the colour would still pass a test that only
// checked the colour, which is how this rule gets quietly lost.
//
// **§57: there is no default currency.** A currency metric with no `Money`
// renders as unavailable, not as a bare number with an assumed symbol. A `1,240`
// that is actually NGN shown to somebody who assumes GBP is worse than no figure.
//
// The percentage assertions are the third thing worth the space: every
// `percentage` metric in this platform carries a **ratio**, and a hundredfold
// error there looks plausible in both directions. The convention is asserted
// rather than commented.
// ─────────────────────────────────────────────────────────────────────────────

import {
  deltaView,
  describeBreakdown,
  describeComparisonUnavailable,
  describeFunnel,
  describeMetric,
  describeSeries,
  formatCount,
  formatDuration,
  formatMetricValue,
  formatPercentage,
  formatScore,
  formatValue,
} from '@/lib/analytics/format';
import type { AnalyticsComparison, AnalyticsMetric, DataFreshness } from '@/types/analytics';
import type { Money } from '@/types/financial';

const FRESHNESS: DataFreshness = {
  computedAt: '2026-08-08T03:00:00.000Z',
  sourceName: 'Diaspora',
};

function metric(overrides: Partial<AnalyticsMetric> = {}): AnalyticsMetric {
  return {
    key: 'content.views',
    label: 'Views',
    value: { value: 4218, source: 'backend' },
    format: 'count',
    computation: 'server-aggregate',
    money: null,
    higherIsBetter: true,
    comparison: null,
    freshness: FRESHNESS,
    privacyClass: 'owner',
    ...overrides,
  };
}

function money(minorUnits: number, currency = 'GBP', exponent = 2, symbol = '£'): Money {
  return { amount: minorUnits / 10 ** exponent, currency, minorUnits, exponent, symbol };
}

describe('§56 · numbers', () => {
  it('groups a count', () => {
    expect(formatCount(4218, { locale: 'en-GB' })).toBe('4,218');
  });

  it('does not abbreviate below ten thousand, where the exact figure fits', () => {
    expect(formatCount(4218, { locale: 'en-GB', compact: true })).toBe('4,218');
  });

  it('abbreviates at ten thousand and above', () => {
    expect(formatCount(12_417, { locale: 'en-GB', compact: true })).toMatch(/12/);
    expect(formatCount(12_417, { locale: 'en-GB', compact: true }).length).toBeLessThan(7);
  });

  it('renders a non-finite value as a dash rather than NaN', () => {
    expect(formatCount(Number.NaN)).toBe('—');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('respects the locale’s separators', () => {
    const british = formatCount(1234.5, { locale: 'en-GB', maximumFractionDigits: 1 });
    const german = formatCount(1234.5, { locale: 'de-DE', maximumFractionDigits: 1 });

    // Both render the same value; only the separators differ. §56.
    expect(british).not.toBe(german);
  });
});

describe('§56 · percentages are ratios', () => {
  it('renders 0.18 as eighteen percent, not as zero', () => {
    expect(formatPercentage(0.18, { locale: 'en-GB' })).toMatch(/18/);
  });

  it('renders a small ratio with one decimal, so it is not rounded to zero', () => {
    const rendered = formatPercentage(0.042, { locale: 'en-GB' });
    expect(rendered).toMatch(/4\.2/);
  });

  it('signs a positive change when asked', () => {
    expect(formatPercentage(0.18, { locale: 'en-GB', signed: true })).toMatch(/\+/);
  });

  it('handles a change greater than one hundred percent', () => {
    // A 250% increase is real and must not be clamped.
    expect(formatPercentage(2.5, { locale: 'en-GB' })).toMatch(/250/);
  });

  it('renders a non-finite ratio as a dash', () => {
    expect(formatPercentage(Number.NaN)).toBe('—');
  });
});

describe('§39 · durations and scores', () => {
  it('renders seconds under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('renders minutes and seconds', () => {
    expect(formatDuration(384)).toBe('6m 24s');
  });

  it('drops a zero remainder', () => {
    expect(formatDuration(360)).toBe('6m');
    expect(formatDuration(3600)).toBe('1h');
  });

  it('renders hours and minutes, and never three units', () => {
    expect(formatDuration(4320)).toBe('1h 12m');
    // A stopwatch, not a metric.
    expect(formatDuration(4324)).toBe('1h 12m');
  });

  it('renders days for very long durations', () => {
    expect(formatDuration(90_000)).toBe('1d 1h');
  });

  it('refuses a negative duration', () => {
    expect(formatDuration(-10)).toBe('—');
  });

  it('renders a score to one decimal, because 4.3 and 4.0 are different claims', () => {
    expect(formatScore(4.3, { locale: 'en-GB' })).toBe('4.3');
    expect(formatScore(4, { locale: 'en-GB' })).toBe('4.0');
  });
});

describe('§57 · currency comes from the contract', () => {
  it('renders the currency the Money carries', () => {
    const rendered = formatMetricValue(
      metric({ format: 'currency', money: money(482_000, 'NGN', 2, '₦') }),
      { locale: 'en-GB' }
    );

    expect(rendered).toContain('₦');
    expect(rendered).not.toContain('£');
  });

  it('renders a zero-exponent currency without decimals', () => {
    const rendered = formatMetricValue(
      metric({ format: 'currency', money: money(48_200, 'JPY', 0, '¥') }),
      { locale: 'en-GB' }
    );

    expect(rendered).toContain('¥');
    expect(rendered).not.toMatch(/\.\d/);
  });

  it('renders a three-exponent currency with three decimals', () => {
    const rendered = formatMetricValue(
      metric({ format: 'currency', money: money(48_200, 'KWD', 3, 'د.ك') }),
      { locale: 'en-GB' }
    );

    expect(rendered).toMatch(/48\.200/);
  });

  // The rule §57 exists for.
  it('renders "Not available" rather than a bare number when the Money is missing', () => {
    const rendered = formatMetricValue(metric({ format: 'currency', money: null }));
    expect(rendered).toBe('Not available');
    expect(rendered).not.toMatch(/4218|4,218/);
  });

  it('a chart axis carries no guessed symbol', () => {
    // One currency for a whole series is stated in the legend; guessing one per
    // gridline would be §57's failure.
    const rendered = formatValue(4218, 'currency', { locale: 'en-GB' });
    expect(rendered).not.toMatch(/[£$€¥]/);
  });
});

describe('§47 · a suppressed metric never renders its number', () => {
  it('renders the withheld wording instead of the value', () => {
    const rendered = formatMetricValue(metric({ isSuppressed: true }));

    expect(rendered).toBe('Too few to report');
    expect(rendered).not.toMatch(/4218|4,218/);
  });

  it('the accessible description explains why rather than only that', () => {
    const described = describeMetric(metric({ isSuppressed: true }));

    expect(described).toContain('too few to report');
    expect(described).toContain('identify individuals');
    expect(described).not.toMatch(/4218|4,218/);
  });

  it('a suppressed currency metric does not leak its Money either', () => {
    const described = describeMetric(
      metric({ isSuppressed: true, format: 'currency', money: money(482_000) })
    );

    expect(described).not.toMatch(/4,?820/);
  });
});

describe('§55 · a delta carries four channels, not one', () => {
  function comparison(changePercent: number | null, extra: Partial<AnalyticsComparison> = {}): AnalyticsComparison {
    return { basis: 'previousPeriod', changePercent, ...extra };
  }

  it('a rise in a higher-is-better metric is positive in every channel', () => {
    const delta = deltaView(comparison(0.18), true)!;

    expect(delta.tone).toBe('positive'); // colour
    expect(delta.glyph).toBe('↑'); // glyph
    expect(delta.direction).toBe('up'); // word
    expect(delta.spoken).toContain('Up'); // sentence
    expect(delta.label).toMatch(/\+.*18/);
  });

  it('a rise in a lower-is-better metric is negative — the flag is not ignored', () => {
    // Churn going up is not good news, and `higherIsBetter` is a required argument
    // precisely so the wrong answer is not the easy one.
    const delta = deltaView(comparison(0.18), false)!;

    expect(delta.tone).toBe('negative');
    expect(delta.glyph).toBe('↑');
    expect(delta.direction).toBe('up');
  });

  it('a fall in a lower-is-better metric is positive', () => {
    const delta = deltaView(comparison(-0.07), false)!;

    expect(delta.tone).toBe('positive');
    expect(delta.glyph).toBe('↓');
    expect(delta.direction).toBe('down');
  });

  it('a negligible change is flat rather than a claimed trend', () => {
    // "+0%" with an up arrow claims a trend that is not there.
    const delta = deltaView(comparison(0.002), true)!;

    expect(delta.direction).toBe('flat');
    expect(delta.glyph).toBe('→');
    expect(delta.tone).toBe('neutral');
    expect(delta.label).toBe('No change');
  });

  it('an exact zero is flat', () => {
    expect(deltaView(comparison(0), true)!.direction).toBe('flat');
  });

  // §7's rule: never a misleading percentage where there is no baseline.
  it('an absent baseline renders words rather than a number', () => {
    const delta = deltaView(
      comparison(null, { unavailableReason: 'insufficientHistory' }),
      true
    )!;

    expect(delta.direction).toBe('unknown');
    expect(delta.tone).toBe('unknown');
    expect(delta.glyph).toBe('·');
    expect(delta.label).toBe('Not enough history yet');
    expect(delta.label).not.toMatch(/0%/);
  });

  it('each reason for an absent baseline has its own wording', () => {
    const reasons = ['insufficientHistory', 'zeroBaseline', 'unsupported', 'suppressed'] as const;
    const sentences = reasons.map((reason) =>
      describeComparisonUnavailable(comparison(null, { unavailableReason: reason }))
    );

    // Four distinct sentences, because they prompt different reactions.
    expect(new Set(sentences).size).toBe(4);
  });

  it('no comparison at all renders nothing', () => {
    expect(deltaView(null, true)).toBeNull();
    expect(deltaView({ basis: 'none', changePercent: 0.5 }, true)).toBeNull();
  });
});

describe('§55 · accessible descriptions carry what the visuals carry', () => {
  it('a metric description includes the value and the delta', () => {
    const described = describeMetric(
      metric({ comparison: { basis: 'previousPeriod', changePercent: 0.18 } }),
      { locale: 'en-GB' }
    );

    expect(described).toContain('Views');
    expect(described).toContain('4,218');
    expect(described).toContain('Up');
  });

  it('a simulated metric says so in words', () => {
    const described = describeMetric(
      metric({ value: { value: 4218, source: 'simulated', gapKey: 'contentAnalytics' } })
    );

    expect(described).toContain('development data');
    expect(described).toContain('not a real measurement');
  });

  it('a client-derived metric says where the arithmetic happened', () => {
    const described = describeMetric(metric({ computation: 'client-derived' }));
    expect(described).toContain('Calculated on this device');
  });

  it('an estimated metric says it is an estimate', () => {
    expect(describeMetric(metric({ computation: 'estimated' }))).toContain('estimate');
  });

  it('an ordinary backend metric adds no provenance noise', () => {
    const described = describeMetric(metric());
    expect(described).not.toContain('development');
    expect(described).not.toContain('this device');
    expect(described).not.toContain('estimate');
  });

  it('a currency metric is spoken with the currency named, not only symbolised', () => {
    const described = describeMetric(
      metric({ format: 'currency', money: money(482_000, 'NGN', 2, '₦') }),
      { locale: 'en-GB' }
    );

    // §55: the minus sign and the symbol are unreliable for a screen reader, so
    // the currency is spoken as a name.
    expect(described.toLowerCase()).toMatch(/naira|ngn/);
  });
});

describe('§55 · a series description describes the shape without inventing an analysis', () => {
  const points = [
    { at: '2026-08-01', value: 100 },
    { at: '2026-08-02', value: 180 },
    { at: '2026-08-03', value: 40 },
    { at: '2026-08-04', value: 120 },
  ];

  it('states the start, the end and the extremes', () => {
    const described = describeSeries('Views', points, 'count', { locale: 'en-GB' });

    expect(described).toContain('Starts at 100');
    expect(described).toContain('ends at 120');
    expect(described).toContain('Highest 180');
    expect(described).toContain('lowest 40');
  });

  // The important restraint. A series that rose, collapsed and half-recovered is
  // not "trending upwards", and saying so would be the client inventing a finding.
  it('does not claim a trend from two endpoints', () => {
    const described = describeSeries('Views', points, 'count');

    expect(described).not.toMatch(/trend|rising|increasing|growing|improving/i);
  });

  it('handles an empty series', () => {
    expect(describeSeries('Views', [], 'count')).toContain('no data');
  });

  it('handles a single point without claiming a shape', () => {
    const described = describeSeries('Views', [points[0]], 'count', { locale: 'en-GB' });
    expect(described).toContain('one data point');
  });

  it('says so when a series is flat rather than naming a spurious peak', () => {
    const flat = [
      { at: '2026-08-01', value: 50 },
      { at: '2026-08-02', value: 50 },
    ];
    expect(describeSeries('Views', flat, 'count')).toContain('Flat throughout');
  });
});

describe('§55 · a breakdown description is bounded', () => {
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    label: `Country ${index}`,
    value: 100 - index,
    ratio: (100 - index) / 1000,
  }));

  it('reads out at most five and says how many were left', () => {
    const described = describeBreakdown('Views by country', buckets, 'count', { locale: 'en-GB' });

    expect(described).toContain('Country 0');
    expect(described).toContain('Country 4');
    expect(described).not.toContain('Country 9');
    expect(described).toContain('7 more not read out');
  });

  it('mentions the table where the full set is', () => {
    const described = describeBreakdown('Views by country', buckets, 'count');
    expect(described).toContain('table');
  });

  it('handles an empty breakdown', () => {
    expect(describeBreakdown('Views by country', [], 'count')).toContain('no data');
  });
});

describe('§32 · a funnel description names where people actually leave', () => {
  const steps = [
    { label: 'Viewed', count: 1000, conversionFromPrevious: null },
    { label: 'Applied', count: 400, conversionFromPrevious: 0.4 },
    { label: 'Shortlisted', count: 360, conversionFromPrevious: 0.9 },
    { label: 'Hired', count: 40, conversionFromPrevious: 0.111 },
  ];

  it('states the overall conversion', () => {
    const described = describeFunnel('Job funnel', steps, { locale: 'en-GB' });
    expect(described).toMatch(/Overall 4%/);
  });

  it('names the largest fall rather than only listing the steps', () => {
    const described = describeFunnel('Job funnel', steps, { locale: 'en-GB' });

    // The biggest drop is Shortlisted → Hired at ~89%, not Viewed → Applied at 60%.
    expect(described).toContain('Shortlisted to Hired');
  });

  it('handles an empty funnel', () => {
    expect(describeFunnel('Job funnel', [])).toContain('no data');
  });
});

describe('§39 · ratio and percentage are not interchangeable', () => {
  it('a ratio renders with a multiplier rather than a percent sign', () => {
    const rendered = formatMetricValue(
      metric({ format: 'ratio', value: { value: 0.42, source: 'backend' } }),
      { locale: 'en-GB' }
    );

    expect(rendered).toContain('×');
    expect(rendered).not.toContain('%');
  });

  it('a percentage renders with a percent sign', () => {
    const rendered = formatMetricValue(
      metric({ format: 'percentage', value: { value: 0.42, source: 'backend' } }),
      { locale: 'en-GB' }
    );

    expect(rendered).toContain('%');
  });

  it('a rate renders its unit where it has one', () => {
    const rendered = formatMetricValue(
      metric({ format: 'rate', unit: 'per week', value: { value: 3.4, source: 'backend' } }),
      { locale: 'en-GB' }
    );

    expect(rendered).toContain('per week');
  });
});
