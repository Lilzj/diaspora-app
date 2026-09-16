// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The dashboard (Frontend Phase 15, §38 · §41 · §46)
//
// **One dashboard, configured per subject.** Every analytics route in the
// application — platform, country, community, neighbourhood, creator, provider,
// employer, seller, landlord, organization, campaign and every individual
// content item — renders this component with a different `subject` and a
// different section list.
//
// ── Why one component rather than twenty screens ─────────────────────────────
//
// §38 forbids one-off chart components per module, and the same argument applies
// one level up: twenty dashboard screens would be twenty places to forget the
// provenance strip, twenty implementations of "what happens when a metric is
// suppressed", and twenty chances for the community dashboard and the country
// dashboard to disagree about where the freshness note goes.
//
// The audit that opened this phase found exactly that failure one level down —
// four analytics screens, four metric types, three chart implementations — and
// the whole point of the phase is to not do it again at a larger scale.
//
// What varies genuinely between audiences is: which metrics lead, which
// breakdowns are meaningful, whether a funnel applies, and where a drill-down
// goes. All four are **data**, and they are the props below.
//
// ── §41's drill-down, and the one thing it refuses to do ─────────────────────
//
// A metric card drills into the same dashboard with that metric as the subject
// of a breakdown, rather than navigating to an unrelated screen. §41: "avoid
// forcing the user into unrelated screens to understand a metric". The drill-down
// is a state change within the dashboard, so back returns to the overview rather
// than to whatever the member was doing before they opened analytics.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import {
  useAnalyticsDashboard,
  useAnalyticsExport,
  useAnalyticsFunnel,
} from '@/hooks/analytics';
import { evaluateAnalyticsAction, SUBJECT_LABELS } from '@/lib/analytics/access';
import type { OwnerHoldingsEmpty } from '@/lib/analytics/owner-holdings';
import { describeRange, describeTimezone, rangeDayCount } from '@/lib/analytics/time-range';
import {
  trackDashboardViewed,
  trackExportRequested,
  trackFilterApplied,
  trackMetricDefinitionOpened,
  trackRangeChanged,
  trackRefusalShown,
  trackStaleDataShown,
  trackUnavailableShown,
} from '@/lib/analytics/events';
import type {
  AnalyticsDimensionKey,
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsSubject,
} from '@/types/analytics';
import {
  AnalyticsEmptyState,
  AnalyticsFetchingIndicator,
  AnalyticsFilterBar,
  AnalyticsSection,
  BreakdownPanel,
  ChartCard,
  ComparisonPicker,
  ExportHeaderButton,
  ExportSheet,
  FunnelPanel,
  LeaderboardPanel,
  MetricGrid,
  RangePicker,
  WithheldMetricsNote,
  useMetricDefinitionSheet,
} from './index';
import { AnalyticsScreen } from './AnalyticsScreen';

export interface SubjectDashboardProps {
  subject: AnalyticsSubject;
  title: string;
  subtitle?: string;
  /** Which metrics lead. Omit for the subject's catalogue-driven headline set. */
  metrics?: AnalyticsMetricKey[];
  /** Which breakdowns are meaningful for this audience. */
  breakdowns?: AnalyticsDimensionKey[];
  /** Which funnel, where one applies. §32's five, and no invented sixth. */
  funnelKey?: string;
  /** Overrides the gap notice's sentence where a screen has a better one. */
  gapDetail?: string;
  /** Extra sections, rendered after the standard ones. */
  children?: React.ReactNode;
  /** The community scope token, where the subject is community-sensitive. */
  communityScopeToken?: string | null;
  showBack?: boolean;
  /**
   * Whether this member holds anything the dashboard is about, for the four
   * dashboards that are about a member's own things.
   *
   * `hasAny: false` replaces the figures with what to do instead; `null` — not
   * asked, still asking, or the asking failed — leaves them exactly as they
   * were. See `lib/analytics/owner-holdings.ts`.
   */
  holdings?: {
    hasAny: boolean | null;
    isLoading?: boolean;
    empty: OwnerHoldingsEmpty;
  };
}

export function SubjectDashboard({
  subject,
  title,
  subtitle,
  metrics,
  breakdowns,
  funnelKey,
  gapDetail,
  children,
  communityScopeToken,
  showBack = true,
  holdings,
}: SubjectDashboardProps) {
  const { tokens } = useTheme();
  const pricing = usePricing();
  const locale = pricing.locale;

  const [drillDown, setDrillDown] = useState<AnalyticsMetric | null>(null);
  const [isExportOpen, setExportOpen] = useState(false);
  const definitionSheet = useMetricDefinitionSheet();

  const dashboard = useAnalyticsDashboard({
    subject,
    metrics,
    breakdowns,
    includeSeries: true,
    communityScopeToken,
  });

  const { access, controls, dataset, isLoading, isFetching, isError, error, isEnabled, refetch, query } =
    dashboard;

  const funnel = useAnalyticsFunnel(funnelKey, subject, controls.range, {
    enabled: Boolean(funnelKey) && access.access.canView,
  });

  const exportJob = useAnalyticsExport();

  const verdict = evaluateAnalyticsAction({
    action: 'view-dashboard',
    access: access.isResolved ? access.access : null,
    // While the capability is still loading, the screen shows a skeleton rather
    // than a refusal — a refusal that resolves into a dashboard half a second
    // later reads as a bug, and a dashboard that resolves into a refusal is worse.
    isAuthenticated: true,
  });

  // ── Instrumentation ───────────────────────────────────────────────────────
  //
  // Emitted from effects keyed on what actually changed, so a re-render does not
  // re-emit. Every one of these carries the subject *type* and never the id —
  // see the header of `lib/analytics/events.ts`.

  useEffect(() => {
    if (!dataset) return;
    trackDashboardViewed({
      subjectType: subject.type,
      rangePreset: controls.preset,
      rangeDays: rangeDayCount(controls.range),
      isDeviceTimezone: controls.range.isDeviceTimezone,
      comparison: controls.comparison,
      dataStatus: dataset.status,
      metricCount: dataset.metrics.length,
      unavailableMetricCount: dataset.unavailableMetrics.length,
    });

    if (dataset.status === 'UNAVAILABLE' || dataset.status === 'BACKEND_GAP') {
      trackUnavailableShown({
        subjectType: subject.type,
        dataStatus: dataset.status,
        gapKey: dataset.gapKey ?? undefined,
      });
    }

    if (dataset.status === 'STALE') {
      trackStaleDataShown({ subjectType: subject.type, dataStatus: dataset.status });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.status, dataset?.metrics.length, controls.preset, controls.comparison]);

  useEffect(() => {
    if (access.isResolved && verdict.kind !== 'allowed') {
      trackRefusalShown({ subjectType: subject.type, refusalReason: verdict.reason });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.isResolved, verdict.kind]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePreset = useCallback(
    (preset: typeof controls.preset) => {
      controls.setPreset(preset);
      trackRangeChanged({
        subjectType: subject.type,
        rangePreset: preset,
        rangeDays: rangeDayCount(controls.range),
        isDeviceTimezone: controls.range.isDeviceTimezone,
      });
    },
    [controls, subject.type]
  );

  const handleFilter = useCallback(
    (dimension: AnalyticsDimensionKey, values: string[]) => {
      controls.setFilter(dimension, values);
      trackFilterApplied({ subjectType: subject.type, dimension, valueCount: values.length });
    },
    [controls, subject.type]
  );

  const openDefinition = useCallback(
    (metric: AnalyticsMetric) => {
      definitionSheet.open(metric);
      trackMetricDefinitionOpened(metric.key, subject.type);
    },
    [definitionSheet, subject.type]
  );

  const handleExport = useCallback(
    (format: Parameters<typeof exportJob.request>[0]['format']) => {
      exportJob.request({ query, format });
      trackExportRequested({
        subjectType: subject.type,
        format,
        rangeDays: rangeDayCount(controls.range),
        metricCount: dataset?.metrics.length ?? 0,
      });
    },
    [exportJob, query, subject.type, controls.range, dataset?.metrics.length]
  );

  const exportSummary = useMemo(
    () =>
      `${dataset?.metrics.length ?? 0} figures for ${title}, covering ${describeRange(
        controls.range,
        locale
      )}. The file will contain exactly what is on this screen — nothing you cannot already see here.`,
    [dataset?.metrics.length, title, controls.range, locale]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const isEmpty = dataset !== null && dataset.metrics.length === 0;

  // ── Nothing to be about — 16 Sep 2026 ─────────────────────────────────────
  //
  // Letting and Your business rendered "Views 0 · Viewings 0 · Enquiries 0 ·
  // UP TO DATE" to a member who had never listed a home or registered a
  // business — which reads as "nobody looked", not "you have nothing listed".
  // The owning module's answer replaces the figures with what to do instead.
  // Only a definite "none" does: a failed ask leaves the dashboard as it was.
  if (holdings?.hasAny === false) {
    return (
      <AnalyticsScreen
        title={title}
        subtitle={subtitle ?? SUBJECT_LABELS[subject.type]}
        dataset={null}
        isLoading={false}
        showBack={showBack}
      >
        <AnalyticsEmptyState
          reason="no-data"
          title={holdings.empty.title}
          body={holdings.empty.body}
          actionLabel={holdings.empty.actionLabel}
          onAction={() => router.push(holdings.empty.actionHref as never)}
        />
      </AnalyticsScreen>
    );
  }

  return (
    <AnalyticsScreen
      title={title}
      subtitle={subtitle ?? SUBJECT_LABELS[subject.type]}
      dataset={dataset}
      verdict={access.isResolved ? verdict : undefined}
      isEnabled={isEnabled}
      gapKey={dataset?.gapKey ?? undefined}
      gapDetail={gapDetail}
      timezoneNote={describeTimezone(controls.range)}
      isLoading={isLoading || Boolean(holdings?.isLoading) || (!access.isResolved && !dataset)}
      isRefreshing={isFetching && !isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      showBack={showBack}
      headerRight={
        access.access.canExport ? <ExportHeaderButton onPress={() => setExportOpen(true)} /> : undefined
      }
      sticky={
        <View>
          <RangePicker
            range={controls.range}
            preset={controls.preset}
            access={access.access}
            onChangePreset={handlePreset}
            onChangeCustom={controls.setCustomRange}
            locale={locale}
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
      {isFetching && !isLoading ? (
        <AnalyticsFetchingIndicator label={describeRange(controls.range, locale).toLowerCase()} />
      ) : null}

      {dataset?.availableFilters && dataset.availableFilters.length > 0 ? (
        <View className="mb-5">
          <AnalyticsFilterBar
            definitions={dataset.availableFilters}
            filters={controls.filters}
            onChange={handleFilter}
            onClear={controls.clearFilters}
          />
        </View>
      ) : null}

      {isEmpty ? (
        <AnalyticsEmptyState
          reason={
            dataset.status === 'UNAVAILABLE'
              ? 'data-unavailable'
              : dataset.status === 'BACKEND_GAP'
                ? 'backend-gap'
                : controls.filters.length > 0
                  ? 'filtered-out'
                  : 'no-data'
          }
        />
      ) : null}

      {dataset && dataset.metrics.length > 0 ? (
        <>
          <AnalyticsSection
            title={describeRange(controls.range, locale)}
            subtitle="Tap a figure to see exactly what it counts"
          >
            <MetricGrid
              metrics={dataset.metrics}
              locale={locale}
              onPressMetric={openDefinition}
              onDrillDown={dataset.breakdowns.length > 0 ? setDrillDown : undefined}
            />
            <WithheldMetricsNote count={dataset.unavailableMetrics.length} />
          </AnalyticsSection>

          {dataset.series.length > 0 ? (
            <AnalyticsSection title="Over time">
              <ChartCard
                title={dataset.series.map((entry) => entry.label).join(' · ')}
                subtitle={describeRange(controls.range, locale)}
                series={dataset.series}
                kind={dataset.series.length === 1 ? 'bar' : 'line'}
                locale={locale}
              />
            </AnalyticsSection>
          ) : null}

          {funnel.funnel ? (
            <AnalyticsSection
              title="Journey"
              subtitle="Where people go, and where they stop"
            >
              <FunnelPanel funnel={funnel.funnel} locale={locale} />
            </AnalyticsSection>
          ) : null}

          {dataset.breakdowns.map((breakdown) => (
            <AnalyticsSection key={`${breakdown.metricKey}-${breakdown.dimension}`} title={breakdown.label}>
              <BreakdownPanel breakdown={breakdown} locale={locale} />
            </AnalyticsSection>
          ))}

          {dataset.leaderboards.map((leaderboard) => (
            <AnalyticsSection key={leaderboard.key} title={leaderboard.label}>
              <LeaderboardPanel leaderboard={leaderboard} locale={locale} />
            </AnalyticsSection>
          ))}

          {dataset.insights.length > 0 ? (
            <AnalyticsSection title="What stands out" subtitle="Published by Diaspora, not worked out on your phone">
              {dataset.insights.map((insight) => (
                <View
                  key={insight.key}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${insight.headline}. ${insight.detail ?? ''}`}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                  }}
                  className="rounded-2xl border p-4 mb-2"
                >
                  <View className="flex-row items-start">
                    <Ionicons
                      name={
                        insight.tone === 'positive'
                          ? 'trending-up'
                          : insight.tone === 'negative'
                            ? 'trending-down'
                            : 'information-circle-outline'
                      }
                      size={16}
                      color={
                        insight.tone === 'positive'
                          ? tokens.color.success.default
                          : insight.tone === 'negative'
                            ? tokens.color.warning.default
                            : tokens.color.info.default
                      }
                    />
                    <View className="flex-1 ml-2.5">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-[13px] font-bold leading-snug"
                      >
                        {insight.headline}
                      </Text>
                      {insight.detail ? (
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-semibold mt-1 leading-relaxed"
                        >
                          {insight.detail}
                        </Text>
                      ) : null}
                      {insight.action ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={insight.action.label}
                          onPress={() => router.push(insight.action!.route as never)}
                          className="mt-2"
                        >
                          <Text
                            style={{ color: tokens.color.primary[500] }}
                            className="text-[11px] font-black uppercase tracking-wider"
                          >
                            {insight.action.label}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </AnalyticsSection>
          ) : null}
        </>
      ) : null}

      {children}

      {/* §41's drill-down: the breakdowns for one metric, in place. */}
      {drillDown ? (
        <AnalyticsSection
          title={`${drillDown.label} in detail`}
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the detail view"
              onPress={() => setDrillDown(null)}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={tokens.color.text.secondary} />
            </Pressable>
          }
        >
          {dataset?.breakdowns
            .filter((breakdown) => breakdown.metricKey === drillDown.key)
            .map((breakdown) => (
              <View key={breakdown.dimension} className="mb-3">
                <BreakdownPanel breakdown={breakdown} locale={locale} />
              </View>
            ))}
        </AnalyticsSection>
      ) : null}

      {definitionSheet.sheet}

      <ExportSheet
        visible={isExportOpen}
        onClose={() => setExportOpen(false)}
        onRequest={handleExport}
        job={exportJob.job}
        isRequesting={exportJob.isRequesting}
        hasTimedOut={exportJob.hasTimedOut}
        summary={exportSummary}
        onReset={exportJob.reset}
        onDownload={(url) => {
          // Opened in the system browser rather than downloaded in-app. §43: the
          // client does not assemble or hold the file, and the URL is signed and
          // short-lived.
          Linking.openURL(url).catch(() => undefined);
        }}
      />
    </AnalyticsScreen>
  );
}
