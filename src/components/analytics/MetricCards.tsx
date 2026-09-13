// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Metric cards (Frontend Phase 15, §38 · §35 · §55)
//
// The most-repeated surface in the phase, and therefore the one worth getting
// exactly right once.
//
// ── Three rules the card enforces so a screen cannot break them ──────────────
//
//   **A suppressed metric never renders its number.** The card checks
//   `isSuppressed` before it formats anything. §47: a UI that showed the value
//   while labelling it withheld would have published it.
//
//   **Provenance is rendered, not optional.** The card draws
//   `<MetricProvenance>` from the metric's own two axes. A screen cannot show a
//   simulated figure unmarked, because the marker is inside the component that
//   draws the figure.
//
//   **The definition is one tap away.** §35: every important metric has a
//   definition, and the catalogue is the source. The card is pressable when a
//   definition exists and announces that it is — a screen reader user is told
//   "double tap to see what this counts" rather than being left with a number.
//
// ── The comparison, and §55 ──────────────────────────────────────────────────
//
// A delta is rendered with **four** channels: a colour, an arrow glyph, a signed
// percentage, and a spoken sentence in the accessibility label. §55 forbids
// colour being the only indicator; three redundant channels is what it takes for
// the card to survive being read by somebody who cannot see it, somebody who
// cannot distinguish red from green, and somebody looking at it in sunlight.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { useAnalyticsDefinitions } from '@/hooks/analytics';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import { deltaView, describeMetric, formatMetricValue } from '@/lib/analytics/format';
import { COMPARISON_LABELS } from '@/lib/analytics/time-range';
import type { AnalyticsDefinition, AnalyticsMetric } from '@/types/analytics';
import { MetricProvenance, SuppressedValue } from './AnalyticsNotices';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ═════════════════════════════════════════════════════════════════════════════
// COMPARISON
// ═════════════════════════════════════════════════════════════════════════════

export function ComparisonPill({
  metric,
  compact = false,
}: {
  metric: AnalyticsMetric;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const delta = deltaView(metric.comparison, metric.higherIsBetter);

  if (!delta) return null;

  const colour =
    delta.tone === 'positive'
      ? tokens.color.success.default
      : delta.tone === 'negative'
        ? tokens.color.error.default
        : tokens.color.text.placeholder;

  return (
    <View
      // Hidden from the screen reader: the card's own label already contains
      // `delta.spoken`, and announcing "up arrow 18 percent" separately makes
      // every tile read twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center"
    >
      <Text
        style={{ color: colour }}
        className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-black mr-0.5`}
      >
        {delta.glyph}
      </Text>
      <Text
        style={{ color: colour, fontVariant: ['tabular-nums'] }}
        className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-black`}
      >
        {delta.label}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD
// ═════════════════════════════════════════════════════════════════════════════

export interface MetricCardProps {
  metric: AnalyticsMetric;
  locale?: string;
  /** Opens the definition sheet. Omit to make the card non-interactive. */
  onPress?: (metric: AnalyticsMetric) => void;
  /** Drills into the metric. Rendered as a chevron when supplied. */
  onDrillDown?: (metric: AnalyticsMetric) => void;
  compact?: boolean;
}

export function MetricCard({
  metric,
  locale,
  onPress,
  onDrillDown,
  compact = false,
}: MetricCardProps) {
  const { tokens } = useTheme();
  const definition = ANALYTICS_DEFINITIONS[metric.key];
  const hasDefinition = Boolean(definition?.definition);

  const label = describeMetric(metric, { locale });
  const accessibilityLabel = hasDefinition && onPress ? `${label} Double tap to see what this counts.` : label;

  const body = (
    <>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest`}
        numberOfLines={1}
      >
        {metric.label}
      </Text>

      {metric.isSuppressed ? (
        <View className="mt-1.5">
          <SuppressedValue compact={compact} />
        </View>
      ) : (
        <>
          <Text
            style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
            className={`${compact ? 'text-lg' : 'text-2xl'} font-black tracking-tight mt-0.5`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatMetricValue(metric, { locale, compact: true })}
          </Text>

          <View className="flex-row items-center justify-between mt-0.5">
            <ComparisonPill metric={metric} compact={compact} />
            {onDrillDown ? (
              <Ionicons name="chevron-forward" size={12} color={tokens.color.text.placeholder} />
            ) : null}
          </View>
        </>
      )}

      <MetricProvenance
        source={metric.value.source}
        computation={metric.computation}
        compact={compact}
      />
    </>
  );

  const style = {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.border.default,
  };

  const handlePress = onDrillDown
    ? () => onDrillDown(metric)
    : onPress && hasDefinition
      ? () => onPress(metric)
      : undefined;

  if (!handlePress) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        style={style}
        className={`rounded-2xl border ${compact ? 'p-3' : 'p-3.5'}`}
        testID={`metric-card-${metric.key}`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      style={style}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-3.5'}`}
      testID={`metric-card-${metric.key}`}
    >
      {body}
    </Pressable>
  );
}

/**
 * A responsive grid of metric cards.
 *
 * `flexBasis: '48%'` with `flexGrow` rather than a fixed two-column layout, so a
 * tablet and a landscape phone fill the width instead of showing two cards and a
 * lot of nothing. §40: Diaspora is a mobile application and analytics must work
 * on small phones, large phones and tablets — a hardcoded column count fails at
 * both ends.
 */
export function MetricGrid({
  metrics,
  locale,
  onPressMetric,
  onDrillDown,
  compact = false,
}: {
  metrics: AnalyticsMetric[];
  locale?: string;
  onPressMetric?: (metric: AnalyticsMetric) => void;
  onDrillDown?: (metric: AnalyticsMetric) => void;
  compact?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {metrics.map((metric) => (
        <View key={metric.key} style={{ flexBasis: '47%', flexGrow: 1, minWidth: 140 }}>
          <MetricCard
            metric={metric}
            locale={locale}
            onPress={onPressMetric}
            onDrillDown={onDrillDown}
            compact={compact}
          />
        </View>
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFINITION SHEET — §35, §63
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What a metric counts, in the catalogue's own words.
 *
 * Shows the definition, the formula where there is one, who owns the number, how
 * often it is recomputed and whether it is a real measurement. That last line is
 * unusual to put in front of a member and is deliberate: somebody looking at a
 * development build is entitled to know that a figure has no backend behind it,
 * and burying that in a document nobody reads is how a simulated figure gets
 * quoted in a meeting.
 *
 * **The platform's definition, and this figure's own provenance.** Until 13 Sep
 * 2026 the sheet read only the shipped catalogue. Beside a seller's real
 * "Conversions" it said the figure counted a funnel's final step, was recomputed
 * once a day and belonged to B17 — and that "Diaspora does not record this yet".
 * All four were false, and the definitions screen had the platform's sentences
 * the whole time. So `definition` is the reconciled one (see
 * `useMetricDefinitionSheet`), and "where it comes from" is read from the figure:
 * a metric's catalogue status is about the metric in general and cannot know
 * whether *this* number came from the platform or a development adapter.
 */
export function MetricDefinitionSheet({
  metric,
  definition: supplied,
  onClose,
}: {
  metric: AnalyticsMetric | null;
  /** The reconciled definition. Falls back to the shipped one when absent. */
  definition?: AnalyticsDefinition | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const definition = metric ? supplied ?? ANALYTICS_DEFINITIONS[metric.key] : null;

  return (
    <Modal
      visible={Boolean(metric && definition)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    
      statusBarTranslucent
      navigationBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ backgroundColor: tokens.color.surface.overlay }}
        className="flex-1 justify-end"
      >
        <Pressable
          // Swallows the press so tapping the sheet does not dismiss it.
          onPress={(event) => event.stopPropagation()}
          style={{ backgroundColor: tokens.color.surface.card, paddingBottom: insets.bottom + 16 }}
          className="rounded-t-3xl p-5"
        >
          {definition && metric ? (
            <>
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 mr-3">
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-black uppercase tracking-widest"
                  >
                    What this counts
                  </Text>
                  <Text
                    accessibilityRole="header"
                    style={{ color: tokens.color.text.primary }}
                    className="text-lg font-black tracking-tight mt-0.5"
                  >
                    {definition.label}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close definition"
                  onPress={onClose}
                  hitSlop={12}
                  className="w-9 h-9 items-center justify-center"
                >
                  <Ionicons name="close" size={20} color={tokens.color.text.secondary} />
                </Pressable>
              </View>

              <Text
                accessible
                accessibilityRole="text"
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-semibold leading-relaxed"
              >
                {definition.definition}
              </Text>

              {definition.formula ? (
                <View
                  style={{ backgroundColor: tokens.color.surface.background }}
                  className="rounded-xl p-3 mt-3"
                >
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-black uppercase tracking-widest mb-1"
                  >
                    How it is worked out
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[12px] font-semibold leading-relaxed"
                  >
                    {definition.formula}
                  </Text>
                </View>
              ) : null}

              <View className="mt-4" style={{ gap: 8 }}>
                <DefinitionRow label="How often it updates" value={definition.freshnessPolicy} />
                <DefinitionRow
                  label="Higher is"
                  value={definition.higherIsBetter ? 'better' : 'worse'}
                />
                <DefinitionRow label="Who owns this number" value={definition.owner} />
                <DefinitionRow label="Where it comes from" value={figureProvenance(metric)} />
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Where the figure on screen came from, from the figure itself.
 *
 * Exhaustive over `DataSource`: a certified contract answered, or the development
 * adapter did. Nothing in between is a figure.
 */
export function figureProvenance(metric: AnalyticsMetric): string {
  return metric.value.source === 'backend'
    ? 'A real Diaspora measurement.'
    : 'A development adapter. Not a real measurement.';
}

function DefinitionRow({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-black uppercase tracking-widest"
      >
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[12px] font-semibold mt-0.5 leading-relaxed"
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * State plus sheet, so a screen wires the definition experience in one line.
 *
 * Twenty screens each holding an `openMetric` state is twenty chances to forget
 * to close it on navigation.
 */
export function useMetricDefinitionSheet() {
  const [metric, setMetric] = useState<AnalyticsMetric | null>(null);

  // The same reconciled catalogue the definitions screen reads, so the sheet and
  // the screen cannot disagree. It never returns nothing — offline, it is the
  // shipped catalogue — and the query is shared, so twenty screens are one request.
  const catalogue = useAnalyticsDefinitions();

  const definition = useMemo(
    () => (metric ? catalogue.definitions.find((entry) => entry.key === metric.key) ?? null : null),
    [metric, catalogue.definitions]
  );

  return {
    open: setMetric,
    close: () => setMetric(null),
    sheet: (
      <MetricDefinitionSheet metric={metric} definition={definition} onClose={() => setMetric(null)} />
    ),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPARISON CARD — §7, §13
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One metric across several subjects, side by side.
 *
 * Computes **no winner, no ranking and no composite score**. §13 forbids it for
 * communities and the same reasoning holds everywhere: an aligned table is a
 * presentation of figures the platform produced, and a highlighted "best" column
 * is a judgement the client invented. The values are drawn in the order given.
 */
export function ComparisonCard({
  label,
  columns,
  locale,
}: {
  label: string;
  columns: { key: string; label: string; metric: AnalyticsMetric | null }[];
  locale?: string;
}) {
  const { tokens } = useTheme();

  const spoken = [
    `${label}.`,
    ...columns.map((column) =>
      column.metric
        ? `${column.label}: ${
            column.metric.isSuppressed
              ? 'too few to report'
              : formatMetricValue(column.metric, { locale })
          }.`
        : `${column.label}: not available.`
    ),
  ].join(' ');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest mb-2.5"
      >
        {label}
      </Text>

      <View className="flex-row">
        {columns.map((column) => (
          <View key={column.key} className="flex-1 pr-2">
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-bold mb-1"
              numberOfLines={1}
            >
              {column.label}
            </Text>

            {column.metric ? (
              column.metric.isSuppressed ? (
                <SuppressedValue compact />
              ) : (
                <>
                  <Text
                    style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                    className="text-base font-black tracking-tight"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {formatMetricValue(column.metric, { locale, compact: true })}
                  </Text>
                  <ComparisonPill metric={column.metric} compact />
                </>
              )
            ) : (
              <Text
                style={{ color: tokens.color.text.disabled }}
                className="text-[11px] font-bold"
              >
                —
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The label for a comparison basis, so no screen writes its own. */
export function comparisonLabel(basis: AnalyticsMetric['comparison'] extends null ? never : string): string {
  return COMPARISON_LABELS[basis as keyof typeof COMPARISON_LABELS] ?? '';
}
