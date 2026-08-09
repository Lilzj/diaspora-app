// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Charts (Frontend Phase 15, §38 · §39 · §40 · §55)
//
// Four chart types and one wrapper, drawn with `react-native-svg`, which the app
// already uses. No charting library is added: §38 asks for reusable primitives
// rather than one-off components per module, and a dependency would bring a
// bundle cost and a styling system for four shapes that are two hundred lines of
// arithmetic.
//
// ── The accessible alternative is not an afterthought ────────────────────────
//
// §55 requires charts to have accessible alternatives, and the honest reading of
// that is not "add an accessibilityLabel to the SVG". A polyline announced as
// "chart" is not an alternative to anything.
//
// So every chart here is **hidden from the screen reader** and `<ChartCard>`
// renders two things in its place: a **text summary** describing where the series
// starts, ends, peaks and troughs, and a **table** the member can open, with one
// row per bucket. The table is available to everybody, not only to screen-reader
// users — reading exact figures off a 340-point-wide sparkline is difficult for
// anyone, and the people who need the numbers most are the ones using the
// dashboard seriously.
//
// ── §39, and the four things a chart here will not do ────────────────────────
//
//   **It will not draw a line through a gap.** A missing bucket breaks the path
//   rather than interpolating across it. An interpolated line says activity
//   continued at a plausible rate through a day nobody measured.
//
//   **It will not hide a partial bucket.** Today is half over, so today's bar is
//   drawn hatched and the summary says so. A chart whose last point dips because
//   the day has not finished has told the viewer something false.
//
//   **It will not share an axis between incomparable series.** Views and
//   followers differ by two orders of magnitude; on one axis the follower line is
//   the baseline. `normalise` draws shapes on a common 0–1 scale and the legend
//   says the magnitudes are in the cards — which is what the existing Phase 7
//   chart already does, and it was right.
//
//   **It will not put a currency symbol on an axis it inferred.** §57: the
//   currency comes from the series, and where the series carries none the axis is
//   unit-less.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/design-system';
import { describeSeries, formatValue } from '@/lib/analytics/format';
import { describeBucket } from '@/lib/analytics/time-range';
import type { AnalyticsPoint, AnalyticsSeries } from '@/types/analytics';
import { AnalyticsEmptyState } from './AnalyticsPrimitives';

/**
 * The series palette.
 *
 * Five colours chosen to stay distinguishable in the most common forms of colour
 * blindness — amber, teal, blue, coral and violet differ in lightness as well as
 * in hue, so they separate in greyscale too. That is the fallback that matters:
 * §55 says colour is never the only indicator, and for a multi-series line chart
 * the legend order plus the lightness ordering is the second channel.
 */
const SERIES_COLOURS = ['#F59300', '#0D7C66', '#2563EB', '#E8533A', '#7C3AED'];

const CHART_HEIGHT = 140;
const AXIS_GUTTER = 22;

// ═════════════════════════════════════════════════════════════════════════════
// GEOMETRY
// ═════════════════════════════════════════════════════════════════════════════

interface Scale {
  min: number;
  max: number;
  x: (index: number, count: number) => number;
  y: (value: number) => number;
}

function buildScale(values: number[], width: number, height: number): Scale {
  const finite = values.filter((value) => Number.isFinite(value));
  const rawMax = finite.length ? Math.max(...finite) : 1;
  const rawMin = finite.length ? Math.min(...finite, 0) : 0;

  // A flat series would give a zero span and divide by nothing. One is the
  // smallest span that renders a line in the middle rather than at the edge.
  const max = rawMax === rawMin ? rawMax + 1 : rawMax;
  const min = rawMin;
  const span = max - min;

  return {
    min,
    max,
    x: (index, count) => (count <= 1 ? width / 2 : (index / (count - 1)) * width),
    y: (value) => height - ((value - min) / span) * (height - 8) - 4,
  };
}

/**
 * Builds a path, breaking it at gaps.
 *
 * A `null` or non-finite value starts a new sub-path with `M` rather than
 * continuing with `L`. See the header: an interpolated line is a claim about a
 * day nobody measured.
 */
function buildPath(points: AnalyticsPoint[], scale: Scale): string {
  let path = '';
  let penDown = false;

  points.forEach((point, index) => {
    const value = point.value;
    if (!Number.isFinite(value)) {
      penDown = false;
      return;
    }

    const x = scale.x(index, points.length).toFixed(1);
    const y = scale.y(value).toFixed(1);

    path += penDown ? ` L${x},${y}` : `${path ? ' ' : ''}M${x},${y}`;
    penDown = true;
  });

  return path;
}

// ═════════════════════════════════════════════════════════════════════════════
// LINE AND AREA
// ═════════════════════════════════════════════════════════════════════════════

export interface ChartProps {
  series: AnalyticsSeries[];
  locale?: string;
  /** Normalises each series independently. See the header's third rule. */
  normalise?: boolean;
  height?: number;
  /** The selected bucket index, for the read-out above the chart. */
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
}

export function LineChart({
  series,
  normalise = false,
  height = CHART_HEIGHT,
  selectedIndex,
  onSelectIndex,
}: ChartProps) {
  const { tokens } = useTheme();
  const [width, setWidth] = useState(320);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.max(120, event.nativeEvent.layout.width));
  }, []);

  const pointCount = series[0]?.points.length ?? 0;

  const paths = useMemo(
    () =>
      series.map((entry) => {
        const values = normalise
          ? normaliseValues(entry.points.map((point) => point.value))
          : entry.points.map((point) => point.value);

        const scale = buildScale(
          normalise ? [0, 1] : series.flatMap((s) => s.points.map((p) => p.value)),
          width,
          height
        );

        const points = entry.points.map((point, index) => ({ ...point, value: values[index] }));
        return { path: buildPath(points, scale), scale, points };
      }),
    [series, normalise, width, height]
  );

  const handlePress = useCallback(
    (event: { nativeEvent: { locationX: number } }) => {
      if (!onSelectIndex || pointCount === 0) return;
      const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
      onSelectIndex(Math.round(ratio * (pointCount - 1)));
    },
    [onSelectIndex, pointCount, width]
  );

  return (
    <Pressable
      onLayout={onLayout}
      onPress={handlePress}
      // The chart itself carries no accessible content — `<ChartCard>` renders
      // the summary and the table. See the file header.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: tokens.color.surface.background }}
      className="rounded-xl overflow-hidden"
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Gridlines. Three, because a phone-width chart with more is a grid
            with a line in it. */}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <Line
            key={fraction}
            x1={0}
            y1={height * fraction}
            x2={width}
            y2={height * fraction}
            stroke={tokens.color.border.default}
            strokeWidth={0.5}
            strokeDasharray="3 4"
          />
        ))}

        {paths.map((entry, index) => (
          <Path
            key={series[index].key}
            d={entry.path}
            fill="none"
            stroke={SERIES_COLOURS[index % SERIES_COLOURS.length]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* The selected bucket. A vertical rule plus a dot per series — a
            crosshair reads at a glance and does not need a hover state, which a
            touch device does not have. */}
        {selectedIndex !== null && selectedIndex !== undefined && pointCount > 0 ? (
          <>
            <Line
              x1={paths[0]?.scale.x(selectedIndex, pointCount) ?? 0}
              y1={0}
              x2={paths[0]?.scale.x(selectedIndex, pointCount) ?? 0}
              y2={height}
              stroke={tokens.color.text.placeholder}
              strokeWidth={1}
            />
            {paths.map((entry, index) => {
              const point = entry.points[selectedIndex];
              if (!point || !Number.isFinite(point.value)) return null;
              return (
                <Circle
                  key={series[index].key}
                  cx={entry.scale.x(selectedIndex, pointCount)}
                  cy={entry.scale.y(point.value)}
                  r={3.5}
                  fill={SERIES_COLOURS[index % SERIES_COLOURS.length]}
                  stroke={tokens.color.surface.card}
                  strokeWidth={1.5}
                />
              );
            })}
          </>
        ) : null}
      </Svg>
    </Pressable>
  );
}

export function AreaChart({ series, height = CHART_HEIGHT, locale }: ChartProps) {
  const { tokens } = useTheme();
  const [width, setWidth] = useState(320);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.max(120, event.nativeEvent.layout.width));
  }, []);

  const entry = series[0];
  const scale = useMemo(
    () => buildScale(entry?.points.map((point) => point.value) ?? [], width, height),
    [entry, width, height]
  );

  if (!entry) return null;

  const linePath = buildPath(entry.points, scale);
  // Closing the path to the baseline is what makes it an area. Only meaningful
  // for a single continuous series, which is why `AreaChart` takes the first.
  const areaPath = linePath
    ? `${linePath} L${scale.x(entry.points.length - 1, entry.points.length).toFixed(1)},${height} L${scale
        .x(0, entry.points.length)
        .toFixed(1)},${height} Z`
    : '';

  return (
    <View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: tokens.color.surface.background }}
      className="rounded-xl overflow-hidden"
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="analytics-area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SERIES_COLOURS[0]} stopOpacity={0.28} />
            <Stop offset="1" stopColor={SERIES_COLOURS[0]} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {areaPath ? <Path d={areaPath} fill="url(#analytics-area)" /> : null}
        <Path
          d={linePath}
          fill="none"
          stroke={SERIES_COLOURS[0]}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BAR
// ═════════════════════════════════════════════════════════════════════════════

export function BarChart({
  series,
  height = CHART_HEIGHT,
  selectedIndex,
  onSelectIndex,
}: ChartProps) {
  const { tokens } = useTheme();
  const [width, setWidth] = useState(320);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.max(120, event.nativeEvent.layout.width));
  }, []);

  const entry = series[0];
  const points = entry?.points ?? [];

  const scale = useMemo(
    () => buildScale(points.map((point) => point.value), width, height),
    [points, width, height]
  );

  const handlePress = useCallback(
    (event: { nativeEvent: { locationX: number } }) => {
      if (!onSelectIndex || points.length === 0) return;
      const index = Math.floor((event.nativeEvent.locationX / width) * points.length);
      onSelectIndex(Math.max(0, Math.min(points.length - 1, index)));
    },
    [onSelectIndex, points.length, width]
  );

  if (!entry) return null;

  // Gaps of at least one pixel, and bars that never fall below one pixel wide,
  // so a 90-day range renders as bars rather than as a solid block.
  const slot = width / Math.max(1, points.length);
  const barWidth = Math.max(1, slot - Math.min(3, slot * 0.25));

  return (
    <Pressable
      onLayout={onLayout}
      onPress={handlePress}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: tokens.color.surface.background }}
      className="rounded-xl overflow-hidden"
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {points.map((point, index) => {
          const top = Number.isFinite(point.value) ? scale.y(point.value) : height;
          const isSelected = selectedIndex === index;

          return (
            <Rect
              key={point.at}
              x={index * slot + (slot - barWidth) / 2}
              y={top}
              width={barWidth}
              height={Math.max(0, height - top)}
              rx={Math.min(2, barWidth / 2)}
              fill={isSelected ? SERIES_COLOURS[0] : SERIES_COLOURS[0]}
              // A partial bucket is drawn faded. Its own visual channel, and the
              // summary says so in words as well — §55.
              fillOpacity={point.isPartialBucket ? 0.35 : isSelected ? 1 : 0.85}
            />
          );
        })}
      </Svg>
    </Pressable>
  );
}

/** Values scaled onto 0–1 independently. See the header's third rule. */
function normaliseValues(values: number[]): number[] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return values;

  const max = Math.max(...finite);
  const min = Math.min(...finite, 0);
  const span = max - min || 1;

  return values.map((value) => (Number.isFinite(value) ? (value - min) / span : value));
}

// ═════════════════════════════════════════════════════════════════════════════
// SPARKLINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A tiny trend, for a card.
 *
 * No axes, no labels, no interaction — a sparkline is a *shape*, and adding
 * anything else to it makes it a small bad chart. The figure it belongs to is
 * beside it.
 */
export function Sparkline({
  points,
  colour,
  width = 64,
  height = 20,
}: {
  points: AnalyticsPoint[];
  colour?: string;
  width?: number;
  height?: number;
}) {
  const scale = useMemo(
    () => buildScale(points.map((point) => point.value), width, height),
    [points, width, height]
  );

  if (points.length < 2) return null;

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Path
          d={buildPath(points, scale)}
          fill="none"
          stroke={colour ?? SERIES_COLOURS[0]}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART CARD — the accessible wrapper
// ═════════════════════════════════════════════════════════════════════════════

export type ChartKind = 'line' | 'area' | 'bar';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  series: AnalyticsSeries[];
  kind?: ChartKind;
  locale?: string;
  /** Normalise multi-series charts. Default true where there is more than one. */
  normalise?: boolean;
  height?: number;
}

/**
 * A chart with everything that makes it honest and readable.
 *
 * Title, the chart, a legend, a selected-bucket read-out, a text summary, and a
 * table the member can open. The table is the accessible alternative §55 asks
 * for and it is offered to everybody — see the file header.
 */
export function ChartCard({
  title,
  subtitle,
  series,
  kind = 'line',
  locale,
  normalise,
  height = CHART_HEIGHT,
}: ChartCardProps) {
  const { tokens } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isTableOpen, setTableOpen] = useState(false);

  const hasPoints = series.some((entry) => entry.points.length > 0);
  const shouldNormalise = normalise ?? series.length > 1;

  const summaries = useMemo(
    () =>
      series.map((entry) =>
        describeSeries(entry.label, entry.points, entry.format, {
          locale,
          bucketLabel: (at) => describeBucket(at, entry.granularity, locale),
        })
      ),
    [series, locale]
  );

  const hasPartialBucket = series.some((entry) =>
    entry.points.some((point) => point.isPartialBucket)
  );

  if (!hasPoints) {
    return (
      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        }}
        className="rounded-2xl border"
      >
        <AnalyticsEmptyState reason="no-activity" />
      </View>
    );
  }

  const selected =
    selectedIndex !== null
      ? series.map((entry) => ({
          entry,
          point: entry.points[selectedIndex] ?? null,
        }))
      : null;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1 mr-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-black tracking-tight"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-semibold mt-0.5"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isTableOpen }}
          accessibilityLabel={
            isTableOpen ? 'Hide the figures table' : 'Show these figures as a table'
          }
          onPress={() => setTableOpen((open) => !open)}
          hitSlop={8}
          className="flex-row items-center"
        >
          <Ionicons
            name={isTableOpen ? 'bar-chart-outline' : 'list-outline'}
            size={14}
            color={tokens.color.primary[500]}
          />
          <Text
            style={{ color: tokens.color.primary[500] }}
            className="text-[10px] font-black uppercase tracking-widest ml-1"
          >
            {isTableOpen ? 'Chart' : 'Table'}
          </Text>
        </Pressable>
      </View>

      {/* The selected bucket read-out. Above the chart rather than floating over
          it, because a tooltip under a thumb is a tooltip nobody can read. */}
      {selected ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={selected
            .filter((item) => item.point)
            .map(
              (item) =>
                `${item.entry.label} on ${describeBucket(
                  item.point!.at,
                  item.entry.granularity,
                  locale
                )}: ${formatValue(item.point!.value, item.entry.format, { locale })}`
            )
            .join('. ')}
          style={{ backgroundColor: tokens.color.surface.background }}
          className="rounded-xl px-3 py-2 mb-2"
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest"
          >
            {selected[0]?.point
              ? describeBucket(selected[0].point.at, selected[0].entry.granularity, locale)
              : ''}
          </Text>
          <View className="flex-row flex-wrap mt-0.5">
            {selected.map((item, index) =>
              item.point ? (
                <View key={item.entry.key} className="flex-row items-center mr-3">
                  <View
                    style={{ backgroundColor: SERIES_COLOURS[index % SERIES_COLOURS.length] }}
                    className="w-2 h-2 rounded-full mr-1"
                  />
                  <Text
                    style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                    className="text-[12px] font-black"
                  >
                    {formatValue(item.point.value, item.entry.format, { locale })}
                  </Text>
                </View>
              ) : null
            )}
          </View>
        </View>
      ) : null}

      {isTableOpen ? (
        <SeriesTable series={series} locale={locale} />
      ) : (
        <>
          {kind === 'bar' ? (
            <BarChart
              series={series}
              height={height}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
              locale={locale}
            />
          ) : kind === 'area' ? (
            <AreaChart series={series} height={height} locale={locale} />
          ) : (
            <LineChart
              series={series}
              height={height}
              normalise={shouldNormalise}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
              locale={locale}
            />
          )}

          {series.length > 1 ? (
            <View className="flex-row flex-wrap mt-3">
              {series.map((entry, index) => (
                <View key={entry.key} className="flex-row items-center mr-4 mb-1">
                  <View
                    style={{ backgroundColor: SERIES_COLOURS[index % SERIES_COLOURS.length] }}
                    className="w-2.5 h-2.5 rounded-full mr-1.5"
                  />
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[10px] font-bold"
                  >
                    {entry.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {shouldNormalise && series.length > 1 ? (
            <Text
              style={{ color: tokens.color.text.disabled }}
              className="text-[10px] font-semibold mt-2 leading-relaxed"
            >
              Each line is scaled to its own range so the shapes can be compared. The actual
              figures are in the cards above.
            </Text>
          ) : null}
        </>
      )}

      {/* The text summary. Always present, always readable by a screen reader,
          and visually hidden only in the sense that it is small — a sighted
          member reading it gets the same account. */}
      <View accessible accessibilityRole="text" accessibilityLabel={summaries.join(' ')} className="mt-3">
        {summaries.map((summary, index) => (
          <Text
            key={series[index].key}
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-semibold leading-relaxed"
          >
            {summary}
          </Text>
        ))}
        {hasPartialBucket ? (
          <Text
            style={{ color: tokens.color.warning.default }}
            className="text-[10px] font-semibold leading-relaxed mt-1"
          >
            The last bar covers a period that has not finished yet, so it is lower than it will
            end up. It is drawn faded.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TABLE — §55's alternative
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The chart's figures, as rows.
 *
 * Scrolls vertically inside a bounded height so a 90-day series does not push the
 * rest of the dashboard off the screen, and every row is its own accessible
 * element so a screen reader can move through them one at a time — which is the
 * thing a chart genuinely cannot offer.
 */
export function SeriesTable({
  series,
  locale,
  maxHeight = 260,
}: {
  series: AnalyticsSeries[];
  locale?: string;
  maxHeight?: number;
}) {
  const { tokens } = useTheme();
  const primary = series[0];
  if (!primary) return null;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.background,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-xl border overflow-hidden"
    >
      <View
        style={{ borderBottomColor: tokens.color.border.default }}
        className="flex-row border-b px-3 py-2"
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-black uppercase tracking-widest flex-1"
        >
          Period
        </Text>
        {series.map((entry) => (
          <Text
            key={entry.key}
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest flex-1 text-right"
            numberOfLines={1}
          >
            {entry.label}
          </Text>
        ))}
      </View>

      <ScrollView style={{ maxHeight }} nestedScrollEnabled>
        {primary.points.map((point, index) => {
          const cells = series.map((entry) => entry.points[index]);
          const spoken = [
            describeBucket(point.at, primary.granularity, locale),
            ...series.map((entry, seriesIndex) => {
              const cell = cells[seriesIndex];
              return cell
                ? `${entry.label}: ${formatValue(cell.value, entry.format, { locale })}`
                : `${entry.label}: no data`;
            }),
            point.isPartialBucket ? 'This period has not finished yet.' : null,
          ]
            .filter(Boolean)
            .join('. ');

          return (
            <View
              key={point.at}
              accessible
              accessibilityRole="text"
              accessibilityLabel={spoken}
              style={{
                borderTopColor: tokens.color.border.default,
                borderTopWidth: index === 0 ? 0 : 0.5,
              }}
              className="flex-row px-3 py-2"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold flex-1"
                numberOfLines={1}
              >
                {describeBucket(point.at, primary.granularity, locale)}
                {point.isPartialBucket ? ' *' : ''}
              </Text>
              {series.map((entry, seriesIndex) => {
                const cell = cells[seriesIndex];
                return (
                  <Text
                    key={entry.key}
                    style={{
                      color: tokens.color.text.primary,
                      fontVariant: ['tabular-nums'],
                    }}
                    className="text-[11px] font-bold flex-1 text-right"
                    numberOfLines={1}
                  >
                    {cell ? formatValue(cell.value, entry.format, { locale }) : '—'}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export { SERIES_COLOURS };
