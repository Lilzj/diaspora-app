// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator analytics (Frontend Phase 7, §14 · §15 · §27)
//
// Three rules from the brief shaped this screen and all three are visible in
// the code rather than only in a comment:
//
//   §14  "Do not invent metric definitions." Every metric carries the
//        platform's own sentence describing what it counts, and tapping a tile
//        shows it. The app ships no glossary of its own to drift out of date.
//
//   §15  Six periods including a custom range, and the *server* validates it.
//        An inverted custom range comes back as a refusal and renders like any
//        other; the client does not silently swap the dates.
//
//   §39  "Avoid loading entire datasets into the client." Per-content
//        performance is cursor-paged from the first request, and the trend
//        series are bucketed by the server rather than being a raw event list
//        the device reduces.
//
// The chart is drawn with `react-native-svg`, which the app already uses. It is
// deliberately simple — one polyline per series, no interaction — because a
// chart nobody can read with a screen reader is decoration, and the numbers
// above it are the actual content.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  PeriodSelector,
  StatTile,
} from '@/components/creator-economy';
import {
  useContentPerformance,
  useCreatorAccess,
  useCreatorAnalytics,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { PERIOD_LABELS, formatCount } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { itemAnalyticsRoute } from '@/lib/analytics/item-pages';
import { formatRelativeTime } from '@/utils/format';
import type {
  AnalyticsRange,
  CreatorContentPerformance,
  CreatorMetric,
  CreatorMetricSeries,
} from '@/types/creator-economy';

/**
 * The content-type chips above "Your content", with the words a member reads.
 *
 * `value` is what the route filters on (`AnalyticsContentTypes` accepts each);
 * `label` is spelled out rather than built as `${value}s`, which gave "Housings"
 * and "Marketplaces". Listings, homes and jobs were missing until 13 Sep 2026
 * although their rows appeared under "All" — a member with jobs could list
 * everything but their jobs.
 */
const CONTENT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'Guide', label: 'Guides' },
  { value: 'Update', label: 'Updates' },
  { value: 'Event', label: 'Events' },
  { value: 'Marketplace', label: 'Listings' },
  { value: 'Housing', label: 'Homes' },
  { value: 'Job', label: 'Jobs' },
] as const;

export default function CreatorAnalyticsScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [range, setRange] = useState<AnalyticsRange>({ period: '30d', from: null, to: null });
  const [contentType, setContentType] = useState<string>('all');
  const [openMetric, setOpenMetric] = useState<CreatorMetric | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  const analytics = useCreatorAnalytics(range);
  const content = useContentPerformance(range, contentType === 'all' ? undefined : contentType);
  const access = useCreatorAccess();

  useEffect(() => {
    trackCreatorEvent('creator.analytics.viewed', { period: range.period });
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const changePeriod = useCallback((next: AnalyticsRange) => {
    setRange(next);
    trackCreatorEvent('creator.analytics.period_changed', { period: next.period });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([analytics.refetch(), content.refetch()]);
    setRefreshing(false);
  }, [analytics, content]);

  // Opens the item's own analytics page. Until 14 Sep 2026 this recorded the
  // telemetry event and stopped there, so every row was a button that went
  // nowhere and no item's page could be reached from inside the app.
  const openContent = useCallback((item: CreatorContentPerformance, route: string) => {
    trackCreatorEvent('creator.analytics.content_viewed', {
      contentId: item.contentId,
      contentType: String(item.contentType),
    });
    router.push(route as never);
  }, []);

  const summary = analytics.summary;

  // ── Figures this deployment does not measure ────────────────────────────────
  //
  // The summary carries every headline metric, including the ones the platform
  // cannot compute — reach, the follower total, profile views and revenue — and
  // names those in `unavailableMetrics`. Until 14 Sep 2026 this screen drew a
  // tile for each regardless, so all four read "0", while their own definitions
  // say reach "is not zero". They are named below the tiles instead, and each
  // still opens its definition, which says why.
  const unmeasuredKeys = new Set(analytics.unavailableMetrics);
  const measuredMetrics = summary?.metrics.filter((metric) => !unmeasuredKeys.has(metric.key)) ?? [];
  const unmeasuredMetrics = summary?.metrics.filter((metric) => unmeasuredKeys.has(metric.key)) ?? [];

  return (
    <CreatorScreen
      // "Your creator dashboard", as the links to it say. It read "Analytics" —
      // the name of the hub it is reached from.
      title="Your creator dashboard"
      subtitle="How your work is doing"
      gapKey="analytics"
      gapDetail="Views, saves, comments, shares, helpful votes, actions taken and new followers are counted by Diaspora. Reach, follower totals, profile views and revenue are not measured yet — they are named below the figures rather than shown as zero."
      isEnabled={analytics.isEnabled}
      refusal={refusal}
      isLoading={analytics.isLoading}
      error={analytics.error}
      onRetry={analytics.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <PeriodSelector range={range} onChange={changePeriod} />
        </View>
      }
    >
      <View className="px-5 pt-5">
        {analytics.isFetching && !analytics.isLoading ? (
          <View className="flex-row items-center justify-center pb-3">
            <ActivityIndicator size="small" color={tokens.color.primary[500]} />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-bold ml-2"
            >
              Updating {PERIOD_LABELS[range.period].toLowerCase()}…
            </Text>
          </View>
        ) : null}

        {/* ── Headline metrics ─────────────────────────────────────────── */}
        {summary ? (
          <CreatorSection
            title={PERIOD_LABELS[range.period]}
            subtitle="Tap a figure to see exactly what it counts"
          >
            <View className="flex-row flex-wrap -mx-1">
              {measuredMetrics.map((metric) => (
                <View key={metric.key} className="w-1/2 px-1 mb-2">
                  <StatTile metric={metric} onPress={() => setOpenMetric(metric)} />
                </View>
              ))}
            </View>

            {unmeasuredMetrics.length > 0 ? (
              <View className="mt-1">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-semibold leading-relaxed"
                >
                  Not measured yet, so not shown as a number. Tap one to see why.
                </Text>
                <View className="flex-row flex-wrap mt-2">
                  {unmeasuredMetrics.map((metric) => (
                    <Pressable
                      key={metric.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${metric.label}: not measured yet. Double tap to see why.`}
                      onPress={() => setOpenMetric(metric)}
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: tokens.color.border.default,
                      }}
                      className="rounded-full border px-3 py-1.5 mr-2 mb-2"
                    >
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-[11px] font-bold"
                      >
                        {metric.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </CreatorSection>
        ) : null}

        {/* ── Metric definition ────────────────────────────────────────── */}
        {openMetric ? (
          <View
            accessible
            accessibilityLabel={`${openMetric.label}: ${openMetric.definition ?? 'No definition published.'}`}
            style={{ backgroundColor: tokens.color.info.surface }}
            className="rounded-2xl p-4 mb-5"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text
                  style={{ color: tokens.color.info.default }}
                  className="text-[10px] font-black uppercase tracking-widest mb-1.5"
                >
                  What “{openMetric.label}” counts
                </Text>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[12px] font-semibold leading-relaxed"
                >
                  {openMetric.definition ??
                    'Diaspora has not published a definition for this metric yet.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close definition"
                onPress={() => setOpenMetric(null)}
                hitSlop={10}
              >
                <Ionicons name="close" size={17} color={tokens.color.text.secondary} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ── Trend ──────────────────────────────────────────────────────
            The series are the server's — views, saves and comments today. The
            subtitle named "reach and followers", neither of which is drawn. */}
        {summary && summary.series.length > 0 ? (
          <CreatorSection title="Trend" subtitle="How these figures moved over the period">
            <CreatorCard>
              <TrendChart series={summary.series} />

              <View className="flex-row flex-wrap mt-3.5">
                {summary.series.map((series, index) => (
                  <View key={series.key} className="flex-row items-center mr-4 mb-1">
                    <View
                      style={{ backgroundColor: SERIES_COLOURS[index % SERIES_COLOURS.length] }}
                      className="w-2.5 h-2.5 rounded-full mr-1.5"
                    />
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-[10px] font-bold"
                    >
                      {summary.metrics.find((metric) => metric.key === series.key)?.label ??
                        series.label}
                    </Text>
                  </View>
                ))}
              </View>
            </CreatorCard>
          </CreatorSection>
        ) : null}

        {/* ── Per-content performance ──────────────────────────────────── */}
        <CreatorSection
          title="Your content"
          subtitle="Most viewed first. Tap one to see how it is doing."
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16, paddingBottom: 12 }}
          >
            {CONTENT_FILTERS.map((filter) => {
              const isActive = contentType === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={filter.value === 'all' ? 'All content types' : `${filter.label} only`}
                  onPress={() => setContentType(filter.value)}
                  style={{
                    backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
                    borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
                  }}
                  className="rounded-full border px-3 py-1.5 mr-2"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {content.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="small" color={tokens.color.primary[500]} />
            </View>
          ) : content.items.length === 0 ? (
            <CreatorEmptyState
              icon="bar-chart-outline"
              title="Nothing to report"
              body="Publish something and its performance will show up here."
              actionLabel="Write a guide"
              onAction={() => router.push('/guide/create')}
            />
          ) : (
            <>
              {content.items.map((item) => (
                <ContentPerformanceCard
                  key={item.contentId}
                  item={item}
                  route={itemAnalyticsRoute(String(item.contentType), item.contentId)}
                  onOpen={openContent}
                />
              ))}

              {content.hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load more content"
                  accessibilityState={{ busy: content.isFetchingNextPage }}
                  disabled={content.isFetchingNextPage}
                  onPress={() => content.fetchNextPage()}
                  className="py-3 items-center"
                >
                  <Text
                    style={{ color: tokens.color.primary[500] }}
                    className="text-[11px] font-black uppercase tracking-wider"
                  >
                    {content.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </CreatorSection>

        {/* ── Where else to look ───────────────────────────────────────── */}
        <CreatorSection title="Related">
          <CreatorCard padded={false}>
            {/* Frontend Phase 15. The same figures, from the platform's creator
                dataset, with comparison against the previous period and a
                top-content board. It was labelled "Reach and audience", and
                neither is measured on this deployment. */}
            <RelatedRow
              icon="analytics-outline"
              label="Your content, compared"
              hint="Against the previous period, with your top content"
              onPress={() => router.push('/analytics/creator')}
            />
            <RelatedRow
              icon="megaphone-outline"
              label="Sponsored content"
              hint="How your paid placements performed"
              onPress={() => router.push('/creator/sponsored')}
            />
            <RelatedRow
              icon="cash-outline"
              label="Revenue"
              hint="What your work earned"
              onPress={() => router.push('/creator/revenue')}
            />
            <RelatedRow
              icon="analytics-outline"
              label="Business analytics"
              hint="Promotions, campaigns and premium data"
              onPress={() => router.push('/monetization/analytics')}
              isLast
            />
          </CreatorCard>
        </CreatorSection>

        {summary?.freshnessNote ? (
          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mb-4 leading-relaxed"
          >
            {summary.freshnessNote} Last recalculated {formatRelativeTime(summary.generatedAt)}.
          </Text>
        ) : null}
      </View>
    </CreatorScreen>
  );
}

const SERIES_COLOURS = ['#F59300', '#0D7C66', '#2563EB'];

/**
 * The trend chart.
 *
 * Normalised per series rather than on a shared axis: views, reach and
 * followers differ by two orders of magnitude, and one shared axis would flatten
 * the follower line into the baseline. The shapes are comparable; the
 * magnitudes are in the tiles above, where they can be read.
 *
 * Hidden from the screen reader — `accessibilityElementsHidden` — because the
 * same information is in the stat tiles as text, and a screen reader announcing
 * "polyline" adds nothing. §38 asks for accessible charts, and the accessible
 * form of this chart is the numbers beside it.
 */
function TrendChart({ series }: { series: CreatorMetricSeries[] }) {
  const { tokens } = useTheme();
  const width = 300;
  const height = 96;

  const lines = useMemo(
    () =>
      series.map((entry) => {
        const values = entry.points.map((point) => point.value);
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const span = Math.max(1, max - min);

        return entry.points
          .map((point, index) => {
            const x = (index / Math.max(1, entry.points.length - 1)) * width;
            const y = height - ((point.value - min) / span) * (height - 8) - 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
      }),
    [series]
  );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: tokens.color.surface.background }}
      className="rounded-2xl overflow-hidden"
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {lines.map((points, index) => (
          <Polyline
            key={series[index].key}
            points={points}
            fill="none"
            stroke={SERIES_COLOURS[index % SERIES_COLOURS.length]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * One of the member's items, with its figures.
 *
 * A button only when the item has an analytics page to open — a guide, an
 * update, an event, a job, a listing or a home. A provider profile or an
 * organisation has a row but no page, so its card is not pressable and carries
 * no chevron: a button that goes nowhere is what every row used to be.
 */
function ContentPerformanceCard({
  item,
  route,
  onOpen,
}: {
  item: CreatorContentPerformance;
  route: string | null;
  onOpen: (item: CreatorContentPerformance, route: string) => void;
}) {
  const { tokens } = useTheme();

  const label = [
    item.title,
    `${item.contentType}, ${item.status}.`,
    ...item.metrics.map((metric) => `${metric.label}: ${formatCount(metric.value)}.`),
    item.isSponsored ? 'Currently sponsored.' : null,
    item.revenue ? `Earned ${item.revenue.currency} ${item.revenue.amount.toFixed(2)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const cardStyle = {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.border.default,
  };

  const body = (
    <>
      <View className="flex-row items-start justify-between mb-2.5">
        <View className="flex-1 mr-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-bold leading-snug"
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
            >
              {String(item.contentType)} · {item.status}
              {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ''}
            </Text>
          </View>
        </View>

        {item.isSponsored ? (
          <View
            style={{ backgroundColor: tokens.color.primary[50] }}
            className="flex-row items-center rounded-full px-2 py-0.5"
          >
            <Ionicons name="megaphone" size={9} color={tokens.color.primary[600]} />
            <Text
              style={{ color: tokens.color.primary[600] }}
              className="text-[9px] font-black uppercase tracking-widest ml-1"
            >
              Sponsored
            </Text>
          </View>
        ) : null}

        {route ? (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={tokens.color.text.placeholder}
            style={{ marginLeft: 6, marginTop: 1 }}
          />
        ) : null}
      </View>

      <View className="flex-row flex-wrap">
        {item.metrics.map((metric) => (
          <View key={metric.key} className="mr-5 mb-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              {metric.label}
            </Text>
            <Text
              style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
              className="text-[15px] font-black"
            >
              {metric.format === 'percentage'
                ? `${metric.value.toFixed(1)}%`
                : formatCount(metric.value)}
            </Text>
          </View>
        ))}

        {item.revenue ? (
          <View className="mb-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              Earned
            </Text>
            <Text
              style={{ color: tokens.color.success.default, fontVariant: ['tabular-nums'] }}
              className="text-[15px] font-black"
            >
              {item.revenue.symbol ?? ''}
              {item.revenue.amount.toFixed(2)}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  if (!route) {
    return (
      <View accessible accessibilityLabel={label} style={cardStyle} className="rounded-2xl border p-4 mb-2.5">
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens how this item is doing"
      onPress={() => onOpen(item, route)}
      style={cardStyle}
      className="rounded-2xl border p-4 mb-2.5"
    >
      {body}
    </Pressable>
  );
}

function RelatedRow({
  icon,
  label,
  hint,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
      onPress={onPress}
      style={{
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      <View className="flex-1 mx-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
