/**
 * Analytics surfaces — Frontend Phase 15 (§37, §38, §39, §55, §73)
 *
 * These components are where a member meets a number, so the tests assert what a
 * *screen reader* is told — not what a colour looks like. §55 is the section
 * under test throughout:
 *
 *   "Charts must have accessible alternatives. Screen readers. Accessible metric
 *    cards. Text summaries. Table alternatives. Accessible filter controls.
 *    Accessible date ranges. Accessible trend indicators. Colour must never be
 *    the only indicator of positive/negative state."
 *
 * The cases that matter most:
 *
 *   * A **suppressed** metric never renders its number — anywhere, including in
 *     the accessibility label, which is the copy of it people forget.
 *   * A delta announces a **direction word**, not only a colour and an arrow.
 *   * A chart is hidden from the accessibility tree and the *summary and table*
 *     beside it carry the same information — because a polyline announced as
 *     "chart" is not an alternative to anything.
 *   * A simulated figure and a real one, in the same grid, are marked
 *     differently — §37 holding at field level rather than screen level.
 *   * Each of §73's states announces different words, so the distinction survives
 *     a member who cannot see the icon.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import {
  AnalyticsEmptyState,
  AnalyticsGapNotice,
  BreakdownPanel,
  ChartCard,
  ComparisonCard,
  DataStatusBadge,
  FreshnessIndicator,
  FunnelPanel,
  LeaderboardPanel,
  MetricCard,
  MetricGrid,
  RetentionGrid,
  SuppressedValue,
  WithheldMetricsNote,
  describeDataStatus,
  hasSuppressedMetrics,
} from '../index';
import type {
  AnalyticsBreakdown,
  AnalyticsDataStatus,
  AnalyticsFunnel,
  AnalyticsLeaderboard,
  AnalyticsMetric,
  AnalyticsRetentionTable,
  AnalyticsSeries,
  DataFreshness,
} from '@/types/analytics';
import type { Money } from '@/types/financial';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithProviders(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * The accessibility label a **metric card** carries.
 *
 * Queried by `testID` rather than by label text, because a card legitimately
 * contains nested accessible nodes — the suppressed-value pill has its own label,
 * and on a real device the card's `accessible` container collapses them into one
 * announcement. The test renderer sees both, so a label query would be ambiguous
 * in a way the device never is.
 */
function metricCardLabel(key = 'content.views'): string {
  return screen.getByTestId(`metric-card-${key}`).props.accessibilityLabel as string;
}

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

// ═════════════════════════════════════════════════════════════════════════════
// METRIC CARDS
// ═════════════════════════════════════════════════════════════════════════════

describe('MetricCard', () => {
  it('announces the label and the value together', () => {
    renderWithProviders(<MetricCard metric={metric()} locale="en-GB" />);

    expect(screen.getByLabelText(/Views: 4,218/)).toBeTruthy();
  });

  // §47's most important property, and the copy people forget.
  it('never renders a suppressed value — not on screen, not in the label', () => {
    renderWithProviders(<MetricCard metric={metric({ isSuppressed: true })} locale="en-GB" />);

    expect(screen.queryByText('4,218')).toBeNull();
    expect(screen.getByText('Too few to report')).toBeTruthy();

    // Neither the card's own announcement nor the nested pill's carries the
    // figure. Both are checked, because "the label people forget" is exactly the
    // one that would leak it.
    for (const node of screen.getAllByLabelText(/too few to report/i)) {
      expect(node.props.accessibilityLabel).not.toMatch(/4,?218/);
    }
    expect(metricCardLabel()).toMatch(/identify individuals/);
  });

  // §55: three channels, not one.
  it('announces a delta as a word, not only as a colour and an arrow', () => {
    renderWithProviders(
      <MetricCard
        metric={metric({ comparison: { basis: 'previousPeriod', changePercent: 0.18 } })}
        locale="en-GB"
      />
    );

    expect(metricCardLabel()).toMatch(/Up/);
    // The arrow is present visually as a second channel.
    expect(screen.getByText('↑', { includeHiddenElements: true })).toBeTruthy();
  });

  it('inverts the tone for a lower-is-better metric without changing the direction', () => {
    renderWithProviders(
      <MetricCard
        metric={metric({
          key: 'retention.churn',
          label: 'Churn',
          higherIsBetter: false,
          comparison: { basis: 'previousPeriod', changePercent: 0.18 },
        })}
        locale="en-GB"
      />
    );

    // Still "up" — churn did rise. The tone is what changes, and the word does not
    // lie about the direction.
    expect(metricCardLabel('retention.churn')).toMatch(/Up/);
    expect(screen.getByText('↑', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders words rather than a percentage when there is no baseline', () => {
    renderWithProviders(
      <MetricCard
        metric={{
          ...metric(),
          comparison: {
            basis: 'previousPeriod',
            changePercent: null,
            unavailableReason: 'insufficientHistory',
          },
        }}
        locale="en-GB"
      />
    );

    expect(screen.getByText('Not enough history yet', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(/^\+?0%$/, { includeHiddenElements: true })).toBeNull();
  });

  // §37 at field level.
  it('marks a simulated figure', () => {
    renderWithProviders(
      <MetricCard
        metric={metric({ value: { value: 4218, source: 'simulated', gapKey: 'contentAnalytics' } })}
        locale="en-GB"
      />
    );

    expect(screen.getByText('Simulated', { includeHiddenElements: true })).toBeTruthy();
    expect(metricCardLabel()).toMatch(/development data/);
  });

  it('leaves an ordinary backend figure unmarked', () => {
    renderWithProviders(<MetricCard metric={metric()} locale="en-GB" />);

    expect(screen.queryByText('Simulated', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Worked out on your phone', { includeHiddenElements: true })).toBeNull();
    expect(metricCardLabel()).not.toMatch(/development data|this device|estimate/);
  });

  // §5's second axis, visible.
  it('distinguishes client-derived from simulated', () => {
    renderWithProviders(
      <MetricCard metric={metric({ computation: 'client-derived' })} locale="en-GB" />
    );

    expect(screen.getByText('Worked out on your phone', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Simulated', { includeHiddenElements: true })).toBeNull();
    expect(metricCardLabel()).toMatch(/Calculated on this device/);
  });

  it('renders a currency metric in the currency the Money carries', () => {
    renderWithProviders(
      <MetricCard
        metric={metric({
          key: 'revenue.gross',
          label: 'Gross revenue',
          format: 'currency',
          money: money(482_000, 'NGN', 2, '₦'),
        })}
        locale="en-GB"
      />
    );

    expect(screen.getByText(/₦/)).toBeTruthy();
  });

  // §57: no default currency.
  it('renders "Not available" for a currency metric with no Money', () => {
    renderWithProviders(
      <MetricCard
        metric={metric({ key: 'revenue.gross', label: 'Gross revenue', format: 'currency', money: null })}
        locale="en-GB"
      />
    );

    expect(screen.getByText('Not available')).toBeTruthy();
  });

  it('tells a screen reader the card opens a definition when it does', () => {
    renderWithProviders(<MetricCard metric={metric()} onPress={() => {}} locale="en-GB" />);

    expect(screen.getByLabelText(/Double tap to see what this counts/)).toBeTruthy();
  });
});

describe('MetricGrid', () => {
  it('renders every metric', () => {
    renderWithProviders(
      <MetricGrid
        metrics={[
          metric(),
          metric({ key: 'content.saves', label: 'Saves', value: { value: 120, source: 'backend' } }),
        ]}
        locale="en-GB"
      />
    );

    expect(screen.getByText('Views')).toBeTruthy();
    expect(screen.getByText('Saves')).toBeTruthy();
  });

  it('shows a real and a simulated figure side by side, marked differently', () => {
    renderWithProviders(
      <MetricGrid
        metrics={[
          metric({ key: 'inventory.events', label: 'Upcoming events' }),
          metric({
            key: 'reach.members',
            label: 'Members',
            value: { value: 12_400, source: 'simulated', gapKey: 'communityAnalytics' },
          }),
        ]}
        locale="en-GB"
      />
    );

    // One marker, not two — the real figure carries none. This is §37 holding at
    // field level rather than screen level, and it is the property that makes a
    // hybrid dashboard honest instead of choosing between two wrong labels.
    expect(screen.queryAllByText('Simulated', { includeHiddenElements: true })).toHaveLength(1);

    expect(
      screen.getByTestId('metric-card-inventory.events').props.accessibilityLabel
    ).not.toMatch(/development data/);
    expect(
      screen.getByTestId('metric-card-reach.members').props.accessibilityLabel
    ).toMatch(/development data/);
  });
});

describe('WithheldMetricsNote', () => {
  it('says how many were withheld and never which', () => {
    renderWithProviders(<WithheldMetricsNote count={3} />);

    const note = screen.getByLabelText(/3 figures are not shown/);
    expect(note).toBeTruthy();
    // §46: listing the names would disclose what exists.
    expect(note.props.accessibilityLabel).not.toMatch(/audience|revenue|users/i);
  });

  it('renders nothing when nothing was withheld', () => {
    renderWithProviders(<WithheldMetricsNote count={0} />);
    // Queried by absence rather than by a null render tree: the test wrapper
    // supplies the theme and safe-area providers, so the tree is never null.
    expect(screen.queryByLabelText(/figures are not shown|figure is not shown/)).toBeNull();
  });

  it('uses the singular for one', () => {
    renderWithProviders(<WithheldMetricsNote count={1} />);
    expect(screen.getByLabelText(/One figure is not shown/)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PROVENANCE
// ═════════════════════════════════════════════════════════════════════════════

describe('DataStatusBadge', () => {
  const statuses: AnalyticsDataStatus[] = [
    'LIVE',
    'PARTIAL',
    'ESTIMATED',
    'CACHED',
    'STALE',
    'UNAVAILABLE',
    'DEVELOPMENT_DATA',
    'BACKEND_GAP',
  ];

  it.each(statuses)('%s announces a full sentence', (status) => {
    renderWithProviders(<DataStatusBadge status={status} />);

    const badge = screen.getByTestId(`analytics-status-${status}`);
    expect(badge.props.accessibilityLabel).toBe(describeDataStatus(status));
    expect(badge.props.accessibilityLabel.length).toBeGreaterThan(20);
  });

  // §37's whole point: eight states, not one.
  it('gives all eight states distinct wording', () => {
    const sentences = statuses.map((status) => describeDataStatus(status));
    expect(new Set(sentences).size).toBe(statuses.length);
  });

  // The pair most often merged, and the pair it matters most to keep apart.
  it('distinguishes CACHED from STALE in words a member can act on', () => {
    expect(describeDataStatus('CACHED')).toMatch(/newer ones are fetched/);
    expect(describeDataStatus('STALE')).toMatch(/offline/);
    expect(describeDataStatus('STALE')).toMatch(/not current/);
  });
});

describe('FreshnessIndicator', () => {
  it('announces when it was computed and by whom', () => {
    renderWithProviders(<FreshnessIndicator freshness={FRESHNESS} />);

    expect(screen.getByLabelText(/Source: Diaspora/)).toBeTruthy();
  });

  it('renders a limitation verbatim rather than summarising it', () => {
    renderWithProviders(
      <FreshnessIndicator
        freshness={{
          ...FRESHNESS,
          limitations: ['Figures can trail live activity by up to 18 hours.'],
        }}
      />
    );

    expect(screen.getByText('Figures can trail live activity by up to 18 hours.')).toBeTruthy();
  });

  it('renders the timezone note where one is given — §58', () => {
    renderWithProviders(
      <FreshnessIndicator
        freshness={FRESHNESS}
        timezoneNote="Days are counted in Europe/London, the platform’s reporting timezone."
      />
    );

    expect(screen.getByText(/Europe\/London/)).toBeTruthy();
  });

  it('says so when no computation date is published rather than implying now', () => {
    renderWithProviders(<FreshnessIndicator freshness={{ computedAt: '', sourceName: 'Unknown' }} />);

    expect(screen.getByText(/No update date published/)).toBeTruthy();
  });
});

describe('AnalyticsGapNotice', () => {
  it('names the gap and what is missing', () => {
    renderWithProviders(<AnalyticsGapNotice gapKey="communityAnalytics" />);

    expect(screen.getByTestId('analytics-gap-notice-communityAnalytics')).toBeTruthy();
    expect(screen.getByText(/FRONTEND-PHASE15-GAP-006/)).toBeTruthy();
  });

  it('renders nothing for an unknown gap key rather than an empty box', () => {
    renderWithProviders(<AnalyticsGapNotice gapKey="not-a-real-gap" />);
    expect(screen.queryByTestId('analytics-gap-notice-not-a-real-gap')).toBeNull();
  });

  it('lets a screen override the sentence with a more specific one', () => {
    renderWithProviders(
      <AnalyticsGapNotice gapKey="communityAnalytics" detail="A more specific explanation." />
    );

    expect(screen.getByText('A more specific explanation.')).toBeTruthy();
  });
});

describe('SuppressedValue', () => {
  it('explains why rather than only that', () => {
    renderWithProviders(<SuppressedValue />);

    const node = screen.getByLabelText(/Too few to report/);
    expect(node.props.accessibilityLabel).toMatch(/identify individuals/);
  });
});

describe('hasSuppressedMetrics', () => {
  it('detects a suppressed metric in a set', () => {
    expect(hasSuppressedMetrics([metric(), metric({ isSuppressed: true })])).toBe(true);
    expect(hasSuppressedMetrics([metric()])).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CHARTS — §55's central requirement
// ═════════════════════════════════════════════════════════════════════════════

const SERIES: AnalyticsSeries[] = [
  {
    key: 'content.views',
    label: 'Views',
    granularity: 'day',
    format: 'count',
    source: 'backend',
    points: [
      { at: '2026-08-01', value: 100 },
      { at: '2026-08-02', value: 180 },
      { at: '2026-08-03', value: 40 },
      { at: '2026-08-04', value: 120, isPartialBucket: true },
    ],
  },
];

describe('ChartCard', () => {
  it('carries a text summary describing the shape', () => {
    renderWithProviders(<ChartCard title="Views over time" series={SERIES} locale="en-GB" />);

    expect(screen.getByLabelText(/Starts at 100.*ends at 120/s)).toBeTruthy();
    expect(screen.getByLabelText(/Highest 180/s)).toBeTruthy();
  });

  // The restraint that keeps the summary honest.
  it('does not claim a trend from two endpoints', () => {
    renderWithProviders(<ChartCard title="Views over time" series={SERIES} locale="en-GB" />);

    const summary = screen.getByLabelText(/Starts at 100/s);
    expect(summary.props.accessibilityLabel).not.toMatch(/trending|rising|increasing/i);
  });

  it('offers a table alternative to everybody, not only to screen readers', () => {
    renderWithProviders(<ChartCard title="Views over time" series={SERIES} locale="en-GB" />);

    expect(screen.getByLabelText('Show these figures as a table')).toBeTruthy();
  });

  it('warns that the last bucket has not finished', () => {
    renderWithProviders(<ChartCard title="Views over time" series={SERIES} locale="en-GB" />);

    expect(screen.getByText(/has not finished yet/)).toBeTruthy();
  });

  it('renders an empty state rather than an empty chart', () => {
    renderWithProviders(
      <ChartCard
        title="Views over time"
        series={[{ ...SERIES[0], points: [] }]}
        locale="en-GB"
      />
    );

    expect(screen.getByTestId('analytics-empty-no-activity')).toBeTruthy();
  });

  it('explains the normalisation when it draws more than one series', () => {
    renderWithProviders(
      <ChartCard
        title="Views and followers"
        series={[SERIES[0], { ...SERIES[0], key: 'reach.followers', label: 'Followers' }]}
        locale="en-GB"
      />
    );

    // §39: a shared axis would flatten the smaller series into the baseline, and
    // the member is told that the shapes are comparable and the magnitudes are not.
    expect(screen.getByText(/scaled to its own range/)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PANELS
// ═════════════════════════════════════════════════════════════════════════════

const BREAKDOWN: AnalyticsBreakdown = {
  metricKey: 'content.views',
  dimension: 'country',
  label: 'Views by country',
  source: 'backend',
  total: 1000,
  remainingBucketCount: 0,
  buckets: [
    { key: 'GB', label: 'United Kingdom', value: 600, ratio: 0.6 },
    { key: 'NG', label: 'Nigeria', value: 400, ratio: 0.4 },
  ],
};

describe('BreakdownPanel', () => {
  it('announces the whole breakdown as a sentence before the rows', () => {
    renderWithProviders(<BreakdownPanel breakdown={BREAKDOWN} locale="en-GB" />);

    expect(screen.getByLabelText(/Views by country, 2 categories/s)).toBeTruthy();
  });

  it('announces each row with its value and share', () => {
    renderWithProviders(<BreakdownPanel breakdown={BREAKDOWN} locale="en-GB" />);

    expect(screen.getByLabelText(/United Kingdom: 600, 60% of the total/)).toBeTruthy();
  });

  it('renders an empty state for an empty breakdown', () => {
    renderWithProviders(
      <BreakdownPanel breakdown={{ ...BREAKDOWN, buckets: [] }} locale="en-GB" />
    );

    expect(screen.getByTestId('analytics-empty-no-activity')).toBeTruthy();
  });

  it('says how many rows were not shown', () => {
    const many = {
      ...BREAKDOWN,
      buckets: Array.from({ length: 12 }, (_, index) => ({
        key: `c${index}`,
        label: `Country ${index}`,
        value: 100 - index,
        ratio: 0.08,
      })),
    };

    renderWithProviders(<BreakdownPanel breakdown={many} locale="en-GB" maxRows={5} />);
    expect(screen.getByText(/7 more not shown/)).toBeTruthy();
  });
});

const FUNNEL: AnalyticsFunnel = {
  key: 'job',
  label: 'Job application funnel',
  source: 'simulated',
  computation: 'server-aggregate',
  freshness: FRESHNESS,
  range: {
    preset: 'last30d',
    from: '2026-07-10',
    to: '2026-08-08',
    timezone: 'Europe/London',
    isDeviceTimezone: false,
  },
  steps: [
    { key: 'view', label: 'Viewed', count: 1000, conversionFromPrevious: null, conversionFromStart: 1, dropOffFromPrevious: null },
    { key: 'apply', label: 'Applied', count: 400, conversionFromPrevious: 0.4, conversionFromStart: 0.4, dropOffFromPrevious: 0.6 },
    { key: 'hire', label: 'Hired', count: 40, conversionFromPrevious: 0.1, conversionFromStart: 0.04, dropOffFromPrevious: 0.9 },
  ],
};

describe('FunnelPanel', () => {
  it('announces the funnel with its overall conversion and biggest fall', () => {
    renderWithProviders(<FunnelPanel funnel={FUNNEL} locale="en-GB" />);

    const summary = screen.getByLabelText(/Job application funnel\. 3 steps/s);
    expect(summary.props.accessibilityLabel).toMatch(/Overall 4%/);
    expect(summary.props.accessibilityLabel).toMatch(/Applied to Hired/);
  });

  it('announces each step with its count and its drop-off', () => {
    renderWithProviders(<FunnelPanel funnel={FUNNEL} locale="en-GB" />);

    expect(screen.getByLabelText(/Applied: 400.*40% of the previous step.*60% stop here/s)).toBeTruthy();
  });

  // The shape that cannot happen, refused rather than drawn.
  it('warns when the steps do not narrow consistently', () => {
    const inconsistent: AnalyticsFunnel = {
      ...FUNNEL,
      steps: [
        { ...FUNNEL.steps[0], count: 100 },
        { ...FUNNEL.steps[1], count: 200 },
        { ...FUNNEL.steps[2], count: 50 },
      ],
    };

    renderWithProviders(<FunnelPanel funnel={inconsistent} locale="en-GB" />);
    expect(screen.getByText(/do not narrow consistently/)).toBeTruthy();
  });

  it('says when the percentages were worked out on the device', () => {
    renderWithProviders(
      <FunnelPanel funnel={{ ...FUNNEL, computation: 'client-derived' }} locale="en-GB" />
    );

    expect(screen.getByText(/worked out on this device/)).toBeTruthy();
  });
});

const RETENTION: AnalyticsRetentionTable = {
  granularity: 'week',
  offsetLabels: ['Week 0', 'Week 1', 'Week 2'],
  measurementWindow:
    'A member counts as retained in week N if they were active at least once during that week. Weeks begin on Monday in the reporting timezone.',
  source: 'simulated',
  freshness: FRESHNESS,
  cohorts: [
    { cohortDate: '2026-07-20', cohortSize: 300, values: [1, 0.42, 0.31], isIncomplete: false },
    { cohortDate: '2026-07-27', cohortSize: 280, values: [1, 0.38, null], isIncomplete: true },
  ],
};

describe('RetentionGrid', () => {
  // §33's central requirement.
  it('states the measurement window', () => {
    renderWithProviders(<RetentionGrid retention={RETENTION} locale="en-GB" />);

    expect(screen.getByText(/Weeks begin on Monday/)).toBeTruthy();
  });

  it('announces a cohort with its date, size and every offset', () => {
    renderWithProviders(<RetentionGrid retention={RETENTION} locale="en-GB" />);

    expect(
      screen.getByLabelText(/Cohort starting 2026-07-20, 300 members.*Week 1: 42%/s)
    ).toBeTruthy();
  });

  // The distinction that makes the grid trustworthy.
  it('announces an unelapsed offset as "not measured yet", never as zero', () => {
    renderWithProviders(<RetentionGrid retention={RETENTION} locale="en-GB" />);

    const incomplete = screen.getByLabelText(/Cohort starting 2026-07-27/s);
    expect(incomplete.props.accessibilityLabel).toMatch(/Week 2: not measured yet/);
    expect(incomplete.props.accessibilityLabel).not.toMatch(/Week 2: 0%/);
  });

  it('explains the dashes rather than leaving them to be guessed', () => {
    renderWithProviders(<RetentionGrid retention={RETENTION} locale="en-GB" />);

    expect(screen.getByText(/not periods where nobody came back/)).toBeTruthy();
  });

  it('renders an empty state when there are no cohorts', () => {
    renderWithProviders(
      <RetentionGrid retention={{ ...RETENTION, cohorts: [] }} locale="en-GB" />
    );

    expect(screen.getByTestId('analytics-empty-not-enough-data')).toBeTruthy();
  });
});

const LEADERBOARD: AnalyticsLeaderboard = {
  key: 'top-content',
  label: 'Top content',
  metricKey: 'content.views',
  source: 'simulated',
  hasMore: false,
  nextCursor: null,
  rows: [
    {
      position: 1,
      entity: { entityType: 'guide', entityId: 'g1', title: 'Registering with a GP', route: '/guide/g1' },
      value: 900,
      format: 'count',
      secondaryValue: 0.06,
      secondaryFormat: 'percentage',
      secondaryLabel: 'engagement',
      comparison: null,
    },
  ],
};

describe('LeaderboardPanel', () => {
  it('announces the position, the title and the value', () => {
    renderWithProviders(<LeaderboardPanel leaderboard={LEADERBOARD} locale="en-GB" />);

    expect(screen.getByLabelText(/Number 1.*Registering with a GP.*900/s)).toBeTruthy();
  });

  it('renders an empty state for an empty leaderboard', () => {
    renderWithProviders(
      <LeaderboardPanel leaderboard={{ ...LEADERBOARD, rows: [] }} locale="en-GB" />
    );

    expect(screen.getByTestId('analytics-empty-no-data')).toBeTruthy();
  });
});

describe('ComparisonCard', () => {
  it('announces every column, including the ones with no data', () => {
    renderWithProviders(
      <ComparisonCard
        label="Members"
        locale="en-GB"
        columns={[
          { key: 'ng', label: 'Nigerian', metric: metric({ value: { value: 12_400, source: 'simulated' } }) },
          { key: 'gh', label: 'Ghanaian', metric: null },
        ]}
      />
    );

    const card = screen.getByLabelText(/Members\./);
    expect(card.props.accessibilityLabel).toMatch(/Nigerian: 12,400/);
    expect(card.props.accessibilityLabel).toMatch(/Ghanaian: not available/);
  });

  // §13: no winner is declared, computed or implied.
  it('declares no winner', () => {
    renderWithProviders(
      <ComparisonCard
        label="Members"
        locale="en-GB"
        columns={[
          { key: 'ng', label: 'Nigerian', metric: metric({ value: { value: 12_400, source: 'simulated' } }) },
          { key: 'gh', label: 'Ghanaian', metric: metric({ value: { value: 8_100, source: 'simulated' } }) },
        ]}
      />
    );

    const card = screen.getByLabelText(/Members\./);
    expect(card.props.accessibilityLabel).not.toMatch(/best|winner|highest|leading|top/i);
  });

  it('withholds a suppressed column rather than showing its number', () => {
    renderWithProviders(
      <ComparisonCard
        label="Members"
        locale="en-GB"
        columns={[
          { key: 'ng', label: 'Nigerian', metric: metric({ isSuppressed: true }) },
        ]}
      />
    );

    expect(screen.queryByText('4,218')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STATES — §73
// ═════════════════════════════════════════════════════════════════════════════

describe('AnalyticsEmptyState', () => {
  const reasons = [
    'no-activity',
    'no-data',
    'data-unavailable',
    'not-authorized',
    'backend-unavailable',
    'backend-gap',
    'not-enough-data',
    'filtered-out',
  ] as const;

  it.each(reasons)('%s renders its own wording', (reason) => {
    renderWithProviders(<AnalyticsEmptyState reason={reason} />);
    expect(screen.getByTestId(`analytics-empty-${reason}`)).toBeTruthy();
  });

  // §73's whole point. "No data" for all eight would tell a community moderator
  // their community is dead when the platform has never counted anything.
  it('gives all eight states distinct wording', () => {
    const labels = reasons.map((reason) => {
      const { unmount } = renderWithProviders(<AnalyticsEmptyState reason={reason} />);
      const label = screen.getByTestId(`analytics-empty-${reason}`).props.accessibilityLabel;
      unmount();
      return label;
    });

    expect(new Set(labels).size).toBe(reasons.length);
  });

  it('distinguishes "measured, and it was zero" from "never counted"', () => {
    const { unmount } = renderWithProviders(<AnalyticsEmptyState reason="no-activity" />);
    const noActivity = screen.getByTestId('analytics-empty-no-activity').props.accessibilityLabel;
    unmount();

    renderWithProviders(<AnalyticsEmptyState reason="no-data" />);
    const noData = screen.getByTestId('analytics-empty-no-data').props.accessibilityLabel;

    expect(noActivity).toMatch(/counted, and the answer was zero/);
    expect(noData).toMatch(/No figures have been worked out/);
  });

  it('lets a screen override with something more specific', () => {
    renderWithProviders(
      <AnalyticsEmptyState
        reason="no-data"
        title="You do not have a wallet yet"
        body="Once you have one, this will fill in."
      />
    );

    expect(screen.getByText('You do not have a wallet yet')).toBeTruthy();
  });
});
