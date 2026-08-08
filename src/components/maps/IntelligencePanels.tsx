// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — geographic intelligence surfaces (Frontend Phase 8)
//
// §21–§26: heat-map controls and legend, neighbourhood scores, the cost-of-
// living breakdown, and the safety score.
//
// ── The safety panel is the one to read carefully ────────────────────────────
//
// §26 is unusually specific: do not present safety scores as objective truth;
// display the source, the date, the methodology and the limitations. That is
// not boilerplate. A safety score materially affects where somebody chooses to
// live, and this community includes people with the least margin for a bad
// move — someone six weeks into a new country, choosing between two rooms they
// have not seen.
//
// So `<SafetyScorePanel>` renders `<FreshnessNote>` **unconditionally**, with
// the limitations in full rather than behind a disclosure. There is no prop to
// hide it and no compact variant that drops it. A component that could render a
// safety number without its caveats would eventually be used that way.
//
// ── The legend is not decoration either ──────────────────────────────────────
//
// `<HeatMapLegend>` states whether the scale is absolute or fitted to the
// viewport, because a fitted scale makes an empty area look busy and a member
// reading it as absolute would draw the opposite conclusion from the truth. It
// also carries the layer's textual description for screen readers — §50 asks
// for accessible heat-map descriptions, and a gradient conveys nothing to
// anyone who cannot see it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  CostOfLivingIndex,
  HeatMapLayerData,
  HeatMapTimeRange,
  MapLayerId,
  NeighborhoodScore,
  SafetyScore,
  ScoreDimension,
} from '@/types/maps';
import { FreshnessNote, SourcedFigure } from './MapsGapNotice';

// ═════════════════════════════════════════════════════════════════════════════
// HEAT MAPS — §21, §22
// ═════════════════════════════════════════════════════════════════════════════

export const LAYER_LABELS: Record<MapLayerId, string> = {
  'community-activity': 'Community activity',
  'housing-availability': 'Homes available',
  'housing-price': 'Rent levels',
  'marketplace-activity': 'Marketplace',
  jobs: 'Jobs',
  events: 'Events',
  safety: 'Safety concern',
  'cost-of-living': 'Cost of living',
};

const TIME_RANGES: { id: HeatMapTimeRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

/**
 * The layer picker.
 *
 * Single-select, and that is a design decision §22 asks for explicitly: "do not
 * overload the map with every layer simultaneously". Two density gradients
 * stacked are not two readable layers, they are one unreadable one.
 */
export function LayerPicker({
  layers,
  active,
  onChange,
  timeRange,
  onTimeRangeChange,
  disabledReason,
}: {
  layers: MapLayerId[];
  active: MapLayerId | null;
  onChange: (layer: MapLayerId | null) => void;
  timeRange?: HeatMapTimeRange;
  onTimeRangeChange?: (range: HeatMapTimeRange) => void;
  disabledReason?: string;
}) {
  const { tokens } = useTheme();

  if (disabledReason) {
    return (
      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        }}
        className="rounded-2xl border p-4"
        accessible
        accessibilityRole="text"
        accessibilityLabel={disabledReason}
        testID="layer-picker-disabled"
      >
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed"
        >
          {disabledReason}
        </Text>
      </View>
    );
  }

  return (
    <View testID="layer-picker">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="radio"
          accessibilityState={{ selected: active === null }}
          accessibilityLabel="No layer"
          style={{
            backgroundColor: active === null ? tokens.color.primary[500] : tokens.color.surface.card,
            borderColor: active === null ? tokens.color.primary[500] : tokens.color.border.default,
          }}
          className="px-3.5 py-2 rounded-full border"
        >
          <Text
            style={{ color: active === null ? '#FFFFFF' : tokens.color.text.secondary }}
            className="text-[11px] font-black"
          >
            None
          </Text>
        </Pressable>

        {layers.map((layer) => {
          const isActive = active === layer;
          return (
            <Pressable
              key={layer}
              onPress={() => onChange(layer)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={LAYER_LABELS[layer]}
              style={{
                backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
                borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="px-3.5 py-2 rounded-full border"
              testID={`layer-${layer}`}
            >
              <Text
                style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                className="text-[11px] font-black"
              >
                {LAYER_LABELS[layer]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {active && onTimeRangeChange ? (
        <View className="flex-row gap-2 px-4 mt-2.5">
          {TIME_RANGES.map((range) => {
            const isActive = timeRange === range.id;
            return (
              <Pressable
                key={range.id}
                onPress={() => onTimeRangeChange(range.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Last ${range.label}`}
                style={{
                  backgroundColor: isActive ? tokens.color.neutral[200] : 'transparent',
                }}
                className="px-3 py-1.5 rounded-lg"
                testID={`time-range-${range.id}`}
              >
                <Text
                  style={{
                    color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder,
                  }}
                  className="text-[10px] font-black uppercase tracking-wider"
                >
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function HeatMapLegend({ data }: { data: HeatMapLayerData }) {
  const { tokens } = useTheme();
  const isRelative = data.scale === 'relative-to-viewport';

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3.5"
      accessible
      accessibilityRole="text"
      // The whole legend as one sentence. A gradient is invisible to a screen
      // reader and this is the only representation of it there is.
      accessibilityLabel={[
        `${data.layer.label} layer.`,
        data.layer.description,
        isRelative
          ? 'The colour scale is fitted to what is currently on screen, so a quiet area can still show bright spots.'
          : 'The colour scale is absolute.',
        `Values range from ${Math.round(data.minValue)} to ${Math.round(data.maxValue)} ${
          data.layer.unit
        }.`,
        `${data.points.length} areas shown.`,
      ].join(' ')}
      testID="heat-map-legend"
    >
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black"
      >
        {data.layer.label}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold leading-relaxed mt-1"
      >
        {data.layer.description}
      </Text>

      <View className="flex-row items-center mt-2.5">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black mr-2"
        >
          {Math.round(data.minValue)}
        </Text>
        <View className="flex-1 flex-row h-2 rounded-full overflow-hidden">
          {['#FDE68A', '#FBBF24', '#F59300', '#EA580C', '#DC2626'].map((color) => (
            <View key={color} style={{ backgroundColor: color, flex: 1 }} />
          ))}
        </View>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black ml-2"
        >
          {Math.round(data.maxValue)}
        </Text>
      </View>

      {isRelative ? (
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-bold mt-2 leading-relaxed"
        >
          Colours are relative to what is on screen — a quiet area can still show bright spots.
        </Text>
      ) : null}

      <FreshnessNote freshness={data.freshness} compact />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NEIGHBOURHOOD SCORES — §23, §24
// ═════════════════════════════════════════════════════════════════════════════

export function NeighborhoodScorePanel({
  score,
  onCompare,
}: {
  score: NeighborhoodScore;
  onCompare?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5"
      testID="neighborhood-score-panel"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            {score.cityName}
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xl font-black mt-0.5"
          >
            {score.name}
          </Text>
        </View>

        {/* `Sourced`, so the "estimate" badge appears automatically when the
            overall figure blends real and simulated dimensions. */}
        <SourcedFigure value={score.overall} suffix="/100" label="Overall" size="lg" />
      </View>

      <View className="mt-4 gap-2.5">
        {score.dimensions.map((dimension) => (
          <ScoreDimensionRow key={dimension.id} dimension={dimension} />
        ))}
      </View>

      <FreshnessNote freshness={score.freshness} />

      {onCompare && score.nearbyNeighborhoodIds.length > 0 ? (
        <Pressable
          onPress={onCompare}
          accessibilityRole="button"
          accessibilityLabel={`Compare ${score.name} with nearby neighbourhoods`}
          style={{ borderColor: tokens.color.border.default }}
          className="mt-4 py-3 rounded-2xl border items-center"
          testID="compare-neighborhoods"
        >
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black uppercase tracking-wider"
          >
            Compare with nearby areas
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ScoreDimensionRow({ dimension }: { dimension: ScoreDimension }) {
  const { tokens } = useTheme();
  const isSimulated = dimension.freshness.sourceName.includes('development');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        `${dimension.label}: ${dimension.score} out of 100.`,
        dimension.explanation ?? '',
        dimension.trend
          ? `${dimension.trend.direction === 'up' ? 'Up' : dimension.trend.direction === 'down' ? 'Down' : 'Unchanged'} ${dimension.trend.delta} points over ${dimension.trend.periodDays} days.`
          : '',
        isSimulated ? 'This is a development estimate.' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      testID={`score-dimension-${dimension.id}`}
    >
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center flex-1">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-bold"
          >
            {dimension.label}
          </Text>
          {isSimulated ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="ml-1.5 px-1 py-0.5 rounded"
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[7px] font-black uppercase tracking-wider"
              >
                Est
              </Text>
            </View>
          ) : null}
        </View>

        <View className="flex-row items-center">
          {dimension.trend && dimension.trend.direction !== 'flat' ? (
            <Ionicons
              name={dimension.trend.direction === 'up' ? 'trending-up' : 'trending-down'}
              size={11}
              color={
                dimension.trend.direction === 'up'
                  ? tokens.color.success.default
                  : tokens.color.error.default
              }
            />
          ) : null}
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black ml-1"
          >
            {dimension.score}
          </Text>
        </View>
      </View>

      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="h-1.5 rounded-full overflow-hidden"
      >
        <View
          style={{
            backgroundColor: scoreColor(dimension.score, tokens),
            width: `${Math.max(2, Math.min(100, dimension.score))}%`,
          }}
          className="h-full rounded-full"
        />
      </View>

      {dimension.explanation ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold mt-1 leading-relaxed"
        >
          {dimension.explanation}
        </Text>
      ) : null}
    </View>
  );
}

function scoreColor(score: number, tokens: ReturnType<typeof useTheme>['tokens']): string {
  if (score >= 75) return tokens.color.success.default;
  if (score >= 50) return tokens.color.primary[500];
  if (score >= 30) return tokens.color.warning.default;
  return tokens.color.error.default;
}

/** §24's comparison. Side by side, with no computed "winner". */
export function NeighborhoodComparison({ scores }: { scores: NeighborhoodScore[] }) {
  const { tokens } = useTheme();
  if (scores.length < 2) return null;

  // Every dimension present on any of them, so a missing dimension shows as a
  // gap rather than silently shifting the rows out of alignment.
  const dimensionIds = Array.from(
    new Set(scores.flatMap((score) => score.dimensions.map((d) => d.id)))
  );

  return (
    <View testID="neighborhood-comparison">
      <View className="flex-row px-4 pb-2">
        <View style={{ width: 110 }} />
        {scores.map((score) => (
          <View key={score.neighborhoodId} className="flex-1 items-center">
            <Text
              numberOfLines={1}
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-black"
            >
              {score.name}
            </Text>
            <SourcedFigure value={score.overall} size="sm" />
          </View>
        ))}
      </View>

      {dimensionIds.map((id) => (
        <View
          key={id}
          className="flex-row items-center px-4 py-2.5"
          style={{ borderTopWidth: 1, borderTopColor: tokens.color.border.default }}
          accessible
          accessibilityRole="text"
          accessibilityLabel={comparisonRowLabel(id, scores)}
        >
          <Text
            numberOfLines={1}
            style={{ color: tokens.color.text.secondary, width: 110 }}
            className="text-[11px] font-bold"
          >
            {scores[0].dimensions.find((d) => d.id === id)?.label ?? id}
          </Text>

          {scores.map((score) => {
            const dimension = score.dimensions.find((d) => d.id === id);
            return (
              <View key={score.neighborhoodId} className="flex-1 items-center">
                <Text
                  style={{
                    color: dimension
                      ? scoreColor(dimension.score, tokens)
                      : tokens.color.text.placeholder,
                  }}
                  className="text-sm font-black"
                >
                  {dimension ? dimension.score : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function comparisonRowLabel(id: string, scores: NeighborhoodScore[]): string {
  const label = scores[0].dimensions.find((d) => d.id === id)?.label ?? id;
  const parts = scores.map((score) => {
    const dimension = score.dimensions.find((d) => d.id === id);
    return `${score.name} ${dimension ? dimension.score : 'no data'}`;
  });
  return `${label}: ${parts.join(', ')}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// COST OF LIVING — §25
// ═════════════════════════════════════════════════════════════════════════════

export function CostOfLivingPanel({ index }: { index: CostOfLivingIndex }) {
  const { tokens } = useTheme();
  const above = index.overallIndex >= 100;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5"
      testID="cost-of-living-panel"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        Cost of living
      </Text>

      <View
        className="flex-row items-baseline mt-1"
        accessible
        accessibilityRole="text"
        // The baseline is inside the label, not beside it. An index of 118 with
        // no baseline is not a number, it is a suggestion of one.
        accessibilityLabel={`Overall cost of living index ${index.overallIndex}, which is ${Math.abs(
          index.overallIndex - 100
        )} percent ${above ? 'above' : 'below'} ${index.baselineName}.`}
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-3xl font-black">
          {index.overallIndex}
        </Text>
        <Text
          style={{ color: above ? tokens.color.warning.default : tokens.color.success.default }}
          className="text-xs font-black ml-2"
        >
          {above ? '+' : ''}
          {index.overallIndex - 100}% vs {index.baselineName}
        </Text>
      </View>

      <View className="mt-4 gap-2">
        {index.categories.map((category) => (
          <View
            key={category.id}
            className="flex-row items-center"
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${category.label}: index ${category.index}${
              category.typicalMonthly
                ? `, typically ${category.typicalMonthly.amount} ${category.typicalMonthly.currency} a month`
                : ''
            }`}
            testID={`cost-category-${category.id}`}
          >
            <Text
              style={{ color: tokens.color.text.secondary, width: 92 }}
              className="text-xs font-bold"
            >
              {category.label}
            </Text>

            <View
              style={{ backgroundColor: tokens.color.neutral[100] }}
              className="flex-1 h-2 rounded-full overflow-hidden mx-2"
            >
              <View
                style={{
                  backgroundColor:
                    category.index >= 100 ? tokens.color.warning.default : tokens.color.success.default,
                  // Centred on 100, so the bar reads as "relative to baseline"
                  // rather than as "percentage of some maximum".
                  width: `${Math.max(4, Math.min(100, (category.index / 200) * 100))}%`,
                }}
                className="h-full rounded-full"
              />
            </View>

            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black"
              // Fixed width so the column does not jitter between rows.
            >
              {category.index}
            </Text>
          </View>
        ))}
      </View>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-bold mt-3"
      >
        100 = {index.baselineName}. Figures in {index.currency}.
      </Text>

      <FreshnessNote freshness={index.freshness} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SAFETY — §26
// ═════════════════════════════════════════════════════════════════════════════

const BAND_COPY: Record<SafetyScore['band'], { label: string; tone: 'success' | 'primary' | 'warning' | 'error' }> = {
  high: { label: 'Generally reported as safe', tone: 'success' },
  good: { label: 'Mostly reported as safe', tone: 'primary' },
  moderate: { label: 'Mixed reports', tone: 'warning' },
  low: { label: 'More caution reported', tone: 'error' },
};

/**
 * The safety panel.
 *
 * `<FreshnessNote>` is rendered unconditionally and there is no prop to hide
 * it. See the file header — §26 forbids presenting this as objective truth, and
 * the only way to hold that is to make the caveat structurally inseparable from
 * the number.
 */
export function SafetyScorePanel({ score }: { score: SafetyScore }) {
  const { tokens } = useTheme();
  const band = BAND_COPY[score.band];
  const tone = tokens.color[band.tone === 'primary' ? 'info' : band.tone];

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5"
      testID="safety-score-panel"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        Community safety
      </Text>

      <View
        className="flex-row items-center mt-1.5"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Community safety score for ${score.name}: ${score.score} out of 100. ${band.label}. This is a community-reported figure, not an official crime statistic.`}
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-3xl font-black">
          {score.score}
        </Text>
        <View
          style={{ backgroundColor: 'surface' in tone ? tone.surface : tokens.color.info.surface }}
          className="ml-3 px-2.5 py-1 rounded-full"
        >
          <Text
            style={{ color: 'default' in tone ? tone.default : tokens.color.info.default }}
            className="text-[10px] font-black uppercase tracking-wider"
          >
            {band.label}
          </Text>
        </View>
      </View>

      {score.trend && score.trend.direction !== 'flat' ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-bold mt-1.5"
        >
          {score.trend.direction === 'up' ? 'Improving' : 'Declining'} — {score.trend.delta} points
          over {score.trend.periodDays} days
        </Text>
      ) : null}

      <View className="mt-4 gap-2.5">
        {score.breakdown.map((dimension) => (
          <ScoreDimensionRow key={dimension.id} dimension={dimension} />
        ))}
      </View>

      {/* Unconditional. There is no branch that skips this. */}
      <FreshnessNote freshness={score.freshness} />
    </View>
  );
}
