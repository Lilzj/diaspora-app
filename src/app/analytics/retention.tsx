// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Retention analytics (Frontend Phase 15, §33)
//
// Cohort retention, and the one thing a cohort table must get right: the
// difference between a cell that is **zero** and a cell that **has not happened
// yet**. A grid rendering both as an empty square tells somebody their retention
// collapsed when in fact the week has not finished. Incomplete cells are dashed,
// labelled, and read out as "not measured yet".
//
// §33 also requires the cohort date and the measurement window to be identified.
// Both are required fields on `AnalyticsRetentionTable`, so a cohort table cannot
// be constructed without them, and the window is printed above the grid in the
// platform's own words rather than paraphrased here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { usePricing } from '@/providers/pricing-provider';
import {
  AnalyticsChipRow,
  AnalyticsEmptyState,
  AnalyticsScreen,
  AnalyticsSection,
  RangePicker,
  RetentionGrid,
} from '@/components/analytics';
import { useAnalyticsAccess, useAnalyticsControls, useAnalyticsRetention } from '@/hooks/analytics';
import { evaluateAnalyticsAction } from '@/lib/analytics/access';
import { describeTimezone } from '@/lib/analytics/time-range';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import type { AnalyticsSubject } from '@/types/analytics';

type CohortGranularity = 'day' | 'week' | 'month';

const GRANULARITIES: { value: CohortGranularity; label: string }[] = [
  { value: 'day', label: 'Daily cohorts' },
  { value: 'week', label: 'Weekly cohorts' },
  { value: 'month', label: 'Monthly cohorts' },
];

export default function RetentionAnalyticsScreen() {
  const pricing = usePricing();
  const [granularity, setGranularity] = useState<CohortGranularity>('week');

  const subject = useMemo<AnalyticsSubject>(() => ({ type: 'platform', id: null }), []);
  const access = useAnalyticsAccess(subject);
  const controls = useAnalyticsControls({
    initialPreset: 'last90d',
    reportingTimezone: access.access.reportingTimezone,
  });

  const retention = useAnalyticsRetention(subject, controls.range, {
    granularity,
    cohortCount: 8,
    enabled: access.access.canView,
  });

  React.useEffect(() => {
    if (retention.retention) trackAnalyticsEvent('analytics.retention.viewed');
  }, [retention.retention]);

  const verdict = evaluateAnalyticsAction({
    action: 'view-administrative',
    access: access.isResolved ? access.access : null,
  });

  // A cohort table is not an `AnalyticsDataset`, so the shell is given a minimal
  // one carrying the status and freshness it needs to draw the provenance strip.
  // Fabricating a metrics array to satisfy a prop would be worse than this.
  const dataset = retention.retention
    ? {
        subject,
        range: controls.range,
        comparison: 'none' as const,
        status: retention.isSimulated ? ('DEVELOPMENT_DATA' as const) : ('LIVE' as const),
        metrics: [],
        series: [],
        breakdowns: [],
        funnels: [],
        retention: retention.retention,
        leaderboards: [],
        insights: [],
        freshness: retention.retention.freshness,
        unavailableMetrics: [],
        gapKey: 'retentionAnalytics',
      }
    : null;

  return (
    <AnalyticsScreen
      title="Retention"
      subtitle="Who comes back"
      dataset={dataset}
      verdict={access.isResolved ? verdict : undefined}
      isEnabled={retention.isEnabled}
      gapKey="retentionAnalytics"
      gapDetail="Diaspora does not assign members to cohorts or record activity days, so there is nothing to measure retention from yet. The grid, the measurement window and the incomplete-cohort handling are what a real implementation would need to honour."
      timezoneNote={describeTimezone(controls.range)}
      isLoading={retention.isLoading || !access.isResolved}
      error={retention.isError ? retention.error : null}
      onRetry={retention.refetch}
      onRefresh={retention.refetch}
      sticky={
        <View>
          <RangePicker
            range={controls.range}
            preset={controls.preset}
            access={access.access}
            onChangePreset={controls.setPreset}
            onChangeCustom={controls.setCustomRange}
            locale={pricing.locale}
          />
          <View className="h-2" />
          <AnalyticsChipRow
            accessibilityLabel="Cohort size"
            options={GRANULARITIES}
            value={granularity}
            onChange={setGranularity}
          />
        </View>
      }
    >
      {retention.retention ? (
        <AnalyticsSection
          title="Cohorts"
          subtitle="Each row is the group who joined in that period"
        >
          <RetentionGrid retention={retention.retention} locale={pricing.locale} />
        </AnalyticsSection>
      ) : !retention.isLoading ? (
        <AnalyticsEmptyState reason="not-enough-data" />
      ) : null}
    </AnalyticsScreen>
  );
}
