// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics panels (Frontend Phase 15, §32 · §33 · §38 · §41)
//
// The four composite surfaces: a breakdown, a leaderboard, a funnel and a cohort
// grid. Each is drawn as **accessible rows rather than as a canvas**, following
// what Phase 12's organization analytics already established and which was right:
// a chart a screen reader cannot read is a picture, and every one of these is
// fundamentally a table with a bar in it.
//
// ── §32, and the two things the funnel refuses to do ─────────────────────────
//
//   **It will not draw a step wider than the one before it.** A funnel assembled
//   from independently-counted events can do that, and the result renders as a
//   negative drop-off — a shape that cannot happen and that tells the viewer the
//   data is wrong in a way they cannot act on. The bar width is clamped to the
//   previous step, and when a clamp fires the panel says the figures do not form
//   a consistent funnel rather than drawing a plausible one.
//
//   **It will not compute a conversion the server did not.** Where
//   `conversionFromPrevious` is absent the client may derive it from adjacent
//   counts — that is arithmetic, not analysis — but the panel marks the funnel
//   `client-derived` when it does, because two adjacent counts from different
//   attribution windows do not make a conversion rate.
//
// ── §33, and the cohort grid ─────────────────────────────────────────────────
//
// The single most important thing about a cohort table is the difference between
// **a cell that is zero** and **a cell that has not happened yet**. A grid that
// renders both as an empty square tells somebody their retention collapsed when
// in fact the week has not finished. Incomplete cells are drawn hatched, labelled
// "not yet", and read out as "not measured yet".
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  describeBreakdown,
  describeFunnel,
  formatCount,
  formatPercentage,
  formatValue,
} from '@/lib/analytics/format';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import type {
  AnalyticsBreakdown,
  AnalyticsFunnel,
  AnalyticsLeaderboard,
  AnalyticsRetentionTable,
} from '@/types/analytics';
import { AnalyticsEmptyState } from './AnalyticsPrimitives';
import { SERIES_COLOURS } from './AnalyticsCharts';

// ═════════════════════════════════════════════════════════════════════════════
// BREAKDOWN — §8, §41
// ═════════════════════════════════════════════════════════════════════════════

export function BreakdownPanel({
  breakdown,
  locale,
  onSelectBucket,
  maxRows = 8,
}: {
  breakdown: AnalyticsBreakdown;
  locale?: string;
  /** §41's drill-down. Omit where the dimension has nothing behind it. */
  onSelectBucket?: (bucketKey: string) => void;
  maxRows?: number;
}) {
  const { tokens } = useTheme();
  const definition = ANALYTICS_DEFINITIONS[breakdown.metricKey];

  if (breakdown.buckets.length === 0) {
    return <AnalyticsEmptyState reason="no-activity" />;
  }

  const shown = breakdown.buckets.slice(0, maxRows);
  const hidden = breakdown.buckets.length - shown.length;
  const largest = Math.max(...breakdown.buckets.map((bucket) => bucket.value), 1);

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      {/* The whole panel as one sentence, first, so a screen reader gets the
          shape before it walks the rows. */}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={describeBreakdown(
          breakdown.label,
          breakdown.buckets,
          definition?.format ?? 'count',
          { locale }
        )}
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black uppercase tracking-widest mb-3"
        >
          {breakdown.label}
        </Text>
      </View>

      {shown.map((bucket) => {
        const share = bucket.ratio ?? bucket.value / (breakdown.total || largest);
        const spoken = `${bucket.label}: ${formatValue(bucket.value, definition?.format ?? 'count', {
          locale,
        })}${bucket.ratio !== null && bucket.ratio !== undefined ? `, ${formatPercentage(bucket.ratio, { locale })} of the total` : ''}.`;

        const row = (
          <>
            <View className="flex-row items-center justify-between mb-1">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold flex-1 mr-2"
                numberOfLines={1}
              >
                {bucket.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary, fontVariant: ['tabular-nums'] }}
                className="text-[12px] font-black"
              >
                {formatValue(bucket.value, definition?.format ?? 'count', { locale, compact: true })}
              </Text>
              {bucket.ratio !== null && bucket.ratio !== undefined ? (
                <Text
                  style={{ color: tokens.color.text.placeholder, fontVariant: ['tabular-nums'] }}
                  className="text-[11px] font-bold ml-2 w-10 text-right"
                >
                  {formatPercentage(bucket.ratio, { locale })}
                </Text>
              ) : null}
            </View>

            {/* The bar. Hidden from the screen reader — the row above says the
                same thing in numbers, and "progress bar 42 percent" adds nothing
                to "United Kingdom, 4,218, 42 percent of the total". */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ backgroundColor: tokens.color.neutral[200] }}
              className="h-1.5 rounded-full overflow-hidden"
            >
              <View
                style={{
                  backgroundColor: tokens.color.primary[500],
                  width: `${Math.max(1, Math.round(share * 100))}%`,
                }}
                className="h-full rounded-full"
              />
            </View>
          </>
        );

        const target = bucket.entity?.route ?? null;
        const isPressable = Boolean(onSelectBucket || target);

        return isPressable ? (
          <Pressable
            key={bucket.key}
            accessibilityRole="button"
            accessibilityLabel={`${spoken} Double tap to see more.`}
            onPress={() => {
              if (onSelectBucket) onSelectBucket(bucket.key);
              else if (target) router.push(target as never);
            }}
            className="py-1.5"
          >
            {row}
          </Pressable>
        ) : (
          <View
            key={bucket.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={spoken}
            className="py-1.5"
          >
            {row}
          </View>
        );
      })}

      {hidden > 0 ? (
        <Text
          accessible
          accessibilityRole="text"
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-bold mt-2"
        >
          {hidden} more not shown
          {breakdown.remainingBucketCount
            ? `, and ${breakdown.remainingBucketCount} beyond what Diaspora returned`
            : ''}
          .
        </Text>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ranked rows, in the server's order.
 *
 * The client does not sort. `position` is echoed from the response — a
 * leaderboard the client re-ordered would be a different leaderboard from the one
 * the platform published, and where a tie-break differs the two would disagree
 * about who is first.
 */
export function LeaderboardPanel({
  leaderboard,
  locale,
  onSelectRow,
}: {
  leaderboard: AnalyticsLeaderboard;
  locale?: string;
  onSelectRow?: (entityId: string) => void;
}) {
  const { tokens } = useTheme();

  if (leaderboard.rows.length === 0) {
    return <AnalyticsEmptyState reason="no-data" />;
  }

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border overflow-hidden"
    >
      {leaderboard.rows.map((row, index) => {
        const spoken = [
          `Number ${row.position}.`,
          `${row.entity.title}.`,
          `${formatValue(row.value, row.format, { locale })}.`,
          row.secondaryValue !== null && row.secondaryValue !== undefined && row.secondaryLabel
            ? `${row.secondaryLabel}: ${formatValue(row.secondaryValue, row.secondaryFormat ?? 'count', { locale })}.`
            : null,
        ]
          .filter(Boolean)
          .join(' ');

        const target = row.entity.route;

        const content = (
          <View
            style={{
              borderTopColor: tokens.color.border.default,
              borderTopWidth: index === 0 ? 0 : 1,
            }}
            className="flex-row items-center px-4 py-3"
          >
            <Text
              style={{ color: tokens.color.text.placeholder, fontVariant: ['tabular-nums'] }}
              className="text-[13px] font-black w-6"
            >
              {row.position}
            </Text>

            <View className="flex-1 mx-2">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold"
                numberOfLines={2}
              >
                {row.entity.title}
              </Text>
              {row.secondaryValue !== null &&
              row.secondaryValue !== undefined &&
              row.secondaryLabel ? (
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold mt-0.5"
                >
                  {formatValue(row.secondaryValue, row.secondaryFormat ?? 'count', { locale })}{' '}
                  {row.secondaryLabel}
                </Text>
              ) : null}
            </View>

            <Text
              style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
              className="text-[13px] font-black"
            >
              {formatValue(row.value, row.format, { locale, compact: true })}
            </Text>

            {target || onSelectRow ? (
              <Ionicons
                name="chevron-forward"
                size={14}
                color={tokens.color.text.placeholder}
                style={{ marginLeft: 6 }}
              />
            ) : null}
          </View>
        );

        return target || onSelectRow ? (
          <Pressable
            key={`${row.entity.entityId}-${row.position}`}
            accessibilityRole="button"
            accessibilityLabel={`${spoken} Double tap to open.`}
            onPress={() => {
              if (onSelectRow) onSelectRow(row.entity.entityId);
              else if (target) router.push(target as never);
            }}
          >
            {content}
          </Pressable>
        ) : (
          <View
            key={`${row.entity.entityId}-${row.position}`}
            accessible
            accessibilityRole="text"
            accessibilityLabel={spoken}
          >
            {content}
          </View>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FUNNEL — §32
// ═════════════════════════════════════════════════════════════════════════════

export function FunnelPanel({
  funnel,
  locale,
}: {
  funnel: AnalyticsFunnel;
  locale?: string;
}) {
  const { tokens } = useTheme();

  if (funnel.steps.length === 0) {
    return <AnalyticsEmptyState reason="no-data" />;
  }

  const first = funnel.steps[0]?.count ?? 0;

  // See the header: a step wider than the one before it cannot happen, and
  // drawing it would render a negative drop-off.
  let previousWidth = 1;
  let isInconsistent = false;

  const bars = funnel.steps.map((step) => {
    const raw = first === 0 ? 0 : step.count / first;
    if (raw > previousWidth + 0.0001) isInconsistent = true;
    const width = Math.min(raw, previousWidth);
    previousWidth = width;
    return width;
  });

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={describeFunnel(funnel.label, funnel.steps, { locale })}
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black uppercase tracking-widest mb-3"
        >
          {funnel.label}
        </Text>
      </View>

      {funnel.steps.map((step, index) => {
        const dropOff = step.dropOffFromPrevious;
        const spoken = [
          `${step.label}: ${formatCount(step.count, { locale })}.`,
          step.conversionFromPrevious !== null && step.conversionFromPrevious !== undefined
            ? `${formatPercentage(step.conversionFromPrevious, { locale })} of the previous step.`
            : null,
          dropOff !== null && dropOff !== undefined && dropOff > 0
            ? `${formatPercentage(dropOff, { locale })} stop here.`
            : null,
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <View
            key={step.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={spoken}
            className="mb-2.5"
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold flex-1 mr-2"
                numberOfLines={1}
              >
                {step.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                className="text-[13px] font-black"
              >
                {formatCount(step.count, { locale, compact: true })}
              </Text>
              {step.conversionFromPrevious !== null &&
              step.conversionFromPrevious !== undefined ? (
                <Text
                  style={{ color: tokens.color.text.placeholder, fontVariant: ['tabular-nums'] }}
                  className="text-[11px] font-bold ml-2 w-12 text-right"
                >
                  {formatPercentage(step.conversionFromPrevious, { locale })}
                </Text>
              ) : (
                <View className="w-12 ml-2" />
              )}
            </View>

            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ backgroundColor: tokens.color.neutral[200] }}
              className="h-6 rounded-lg overflow-hidden"
            >
              <View
                style={{
                  backgroundColor: SERIES_COLOURS[Math.min(index, SERIES_COLOURS.length - 1)],
                  width: `${Math.max(1, Math.round(bars[index] * 100))}%`,
                  opacity: 0.85,
                }}
                className="h-full rounded-lg"
              />
            </View>

            {dropOff !== null && dropOff !== undefined && dropOff > 0.001 ? (
              <Text
                style={{ color: tokens.color.text.disabled }}
                className="text-[10px] font-bold mt-0.5"
              >
                {formatPercentage(dropOff, { locale })} stop here
              </Text>
            ) : null}
          </View>
        );
      })}

      {isInconsistent ? (
        <Text
          accessible
          accessibilityRole="text"
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-semibold mt-2 leading-relaxed"
        >
          These steps do not narrow consistently, which usually means they were counted over
          different periods. Treat the shape as approximate.
        </Text>
      ) : null}

      {funnel.computation === 'client-derived' ? (
        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold mt-2 leading-relaxed"
        >
          The percentages are worked out on this device from the counts above, rather than being
          measured as one journey.
        </Text>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RETENTION — §33
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A cohort grid.
 *
 * Horizontally scrollable, because a cohort table is wider than a phone and the
 * alternative — shrinking cells until they fit — makes the numbers unreadable.
 * The cohort column is *inside* the scroll rather than pinned: a pinned column
 * over a 7-offset grid leaves about 200 points for the data, and a member who
 * scrolls two columns can still see which row they are on from the row order.
 */
export function RetentionGrid({
  retention,
  locale,
}: {
  retention: AnalyticsRetentionTable;
  locale?: string;
}) {
  const { tokens } = useTheme();

  if (retention.cohorts.length === 0) {
    return <AnalyticsEmptyState reason="not-enough-data" />;
  }

  const cellWidth = 52;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      {/* §33: the measurement window must be stated. It is a required field on
          the type, and this is where it is honoured. */}
      <Text
        accessible
        accessibilityRole="text"
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold leading-relaxed mb-3"
      >
        {retention.measurementWindow}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className="flex-row mb-1">
            <View style={{ width: 96 }}>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[9px] font-black uppercase tracking-widest"
              >
                Cohort
              </Text>
            </View>
            {retention.offsetLabels.map((label) => (
              <View key={label} style={{ width: cellWidth }} className="items-center">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9px] font-black uppercase tracking-widest"
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {retention.cohorts.map((cohort) => {
            const spoken = [
              `Cohort starting ${cohort.cohortDate}, ${formatCount(cohort.cohortSize, { locale })} members.`,
              ...cohort.values.map((value, index) =>
                value === null
                  ? `${retention.offsetLabels[index]}: not measured yet.`
                  : `${retention.offsetLabels[index]}: ${formatPercentage(value, { locale })}.`
              ),
            ].join(' ');

            return (
              <View
                key={cohort.cohortDate}
                accessible
                accessibilityRole="text"
                accessibilityLabel={spoken}
                className="flex-row items-center mb-1"
              >
                <View style={{ width: 96 }}>
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[11px] font-bold"
                    numberOfLines={1}
                  >
                    {cohort.cohortDate}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-bold"
                  >
                    {formatCount(cohort.cohortSize, { locale, compact: true })} members
                  </Text>
                </View>

                {cohort.values.map((value, index) => (
                  <RetentionCell
                    key={`${cohort.cohortDate}-${index}`}
                    value={value}
                    width={cellWidth}
                    locale={locale}
                  />
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {retention.cohorts.some((cohort) => cohort.isIncomplete) ? (
        <Text
          accessible
          accessibilityRole="text"
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold mt-3 leading-relaxed"
        >
          Cells marked “—” are periods that have not finished yet, not periods where nobody came
          back.
        </Text>
      ) : null}
    </View>
  );
}

function RetentionCell({
  value,
  width,
  locale,
}: {
  value: number | null;
  width: number;
  locale?: string;
}) {
  const { tokens } = useTheme();

  if (value === null) {
    // Not yet measured. Visually distinct from zero — see the header.
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: width - 3,
          backgroundColor: 'transparent',
          borderColor: tokens.color.border.default,
          borderStyle: 'dashed',
        }}
        className="h-8 mr-[3px] rounded-md border items-center justify-center"
      >
        <Text style={{ color: tokens.color.text.disabled }} className="text-[10px] font-bold">
          —
        </Text>
      </View>
    );
  }

  // Intensity carries the value, and the number is printed on top — colour is
  // never the only channel (§55).
  const intensity = Math.max(0.08, Math.min(1, value));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: width - 3,
        backgroundColor: `${tokens.color.secondary[500]}${toHexAlpha(intensity)}`,
      }}
      className="h-8 mr-[3px] rounded-md items-center justify-center"
    >
      <Text
        style={{
          color: intensity > 0.55 ? '#FFFFFF' : tokens.color.text.primary,
          fontVariant: ['tabular-nums'],
        }}
        className="text-[10px] font-black"
      >
        {formatPercentage(value, { locale, maximumFractionDigits: 0 })}
      </Text>
    </View>
  );
}

/** A two-digit hex alpha suffix for an `#RRGGBB` colour. */
function toHexAlpha(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}
