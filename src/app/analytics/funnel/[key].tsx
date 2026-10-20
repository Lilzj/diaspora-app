// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Funnel detail (Frontend Phase 15, §32)
//
// One funnel, full width, with the period and the filters that produced it.
//
// §32 asks for counts, rates, drop-off, period and filters, and forbids inventing
// funnel events. The five funnels offered are exactly the five the brief names —
// job, marketplace, housing, provider and monetization — and an unknown key is a
// refusal rather than a generated funnel. Served by `GET /analytics/funnels/{key}`
// since 20 Oct 2026: steps are counted from recorded events, and the steps
// nothing records are listed as "not recorded" with the server's reason. A typo in a link surfaces as "no such
// journey" instead of as plausible numbers for a journey that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePricing } from '@/providers/pricing-provider';
import {
  AnalyticsEmptyState,
  AnalyticsScreen,
  AnalyticsSection,
  ComparisonPicker,
  FunnelPanel,
  RangePicker,
} from '@/components/analytics';
import { useAnalyticsAccess, useAnalyticsControls, useAnalyticsFunnel } from '@/hooks/analytics';
import { evaluateAnalyticsAction } from '@/lib/analytics/access';
import { describeTimezone } from '@/lib/analytics/time-range';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import type { AnalyticsSubject, AnalyticsSubjectType } from '@/types/analytics';

const FUNNEL_TITLES: Record<string, string> = {
  job: 'Job applications',
  marketplace: 'Marketplace sales',
  housing: 'Housing enquiries',
  provider: 'Provider discovery',
  monetization: 'Promotions',
};

export default function FunnelDetailScreen() {
  const pricing = usePricing();
  const { key, subjectType, subjectId } = useLocalSearchParams<{
    key: string;
    subjectType?: string;
    subjectId?: string;
  }>();

  const subject = useMemo<AnalyticsSubject>(
    () => ({
      type: (subjectType as AnalyticsSubjectType) ?? 'platform',
      id: subjectId ?? null,
    }),
    [subjectType, subjectId]
  );

  const access = useAnalyticsAccess(subject);
  const controls = useAnalyticsControls({
    initialPreset: 'last30d',
    reportingTimezone: access.access.reportingTimezone,
  });

  const funnel = useAnalyticsFunnel(key, subject, controls.range, {
    enabled: access.access.canView,
  });

  React.useEffect(() => {
    if (funnel.funnel) trackAnalyticsEvent('analytics.funnel.viewed');
  }, [funnel.funnel]);

  const verdict = evaluateAnalyticsAction({
    action: 'view-dashboard',
    access: access.isResolved ? access.access : null,
  });

  const dataset = funnel.funnel
    ? {
        subject,
        range: controls.range,
        comparison: controls.comparison,
        status: funnel.isSimulated ? ('DEVELOPMENT_DATA' as const) : ('LIVE' as const),
        metrics: [],
        series: [],
        breakdowns: [],
        funnels: [funnel.funnel],
        retention: null,
        leaderboards: [],
        insights: [],
        freshness: funnel.funnel.freshness,
        unavailableMetrics: [],
        gapKey: 'funnelAnalytics',
      }
    : null;

  return (
    <AnalyticsScreen
      title={FUNNEL_TITLES[key ?? ''] ?? 'Journey'}
      subtitle="Where people go, and where they stop"
      dataset={dataset}
      verdict={access.isResolved ? verdict : undefined}
      isEnabled={funnel.isEnabled}
      gapKey="funnelAnalytics"
      timezoneNote={describeTimezone(controls.range)}
      isLoading={funnel.isLoading || !access.isResolved}
      error={funnel.isError ? funnel.error : null}
      onRetry={funnel.refetch}
      onRefresh={funnel.refetch}
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
          <ComparisonPicker
            comparison={controls.comparison}
            access={access.access}
            onChange={controls.setComparison}
          />
        </View>
      }
    >
      {funnel.funnel ? (
        <AnalyticsSection title="The journey">
          <FunnelPanel funnel={funnel.funnel} locale={pricing.locale} />
        </AnalyticsSection>
      ) : !funnel.isLoading ? (
        <AnalyticsEmptyState
          reason="no-data"
          title="No such journey"
          body="Diaspora does not track a journey by that name."
        />
      ) : null}
    </AnalyticsScreen>
  );
}
