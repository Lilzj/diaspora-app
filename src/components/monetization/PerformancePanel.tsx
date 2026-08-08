// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Performance reporting (Frontend Phase 6)
//
// ⚠ EVERY FIGURE THIS COMPONENT RENDERS IS SIMULATED. MON-GAP-002. ⚠
//
// No impression, view or click is recorded anywhere in the certified contract,
// so the whole panel carries a marker and the metrics carry their own
// definitions. §20 forbids inventing metric semantics, and the way to keep that
// promise once a real backend serves these is for the definition to travel with
// the number — `PerformanceMetric.definition` is part of the contract this
// client is asking for, not a constant in a client file that will drift from
// whatever the server eventually counts.
//
// The trend chart is drawn with plain views rather than a charting library: the
// series is short, the shape is all that is being communicated, and adding a
// dependency for eight bars would be a dependency in the release bundle for a
// panel that does not survive a release build.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { MonetizationGapNotice } from './MonetizationGapNotice';
import type { PerformanceMetric, PerformanceReport } from '@/types/monetization-gaps';

export interface PerformancePanelProps {
  report: PerformanceReport | null;
  isLoading?: boolean;
  /** Hides the gap notice where the surrounding screen already shows one. */
  hideNotice?: boolean;
  title?: string;
}

export function PerformancePanel({
  report,
  isLoading = false,
  hideNotice = false,
  title = 'Performance',
}: PerformancePanelProps) {
  const { tokens } = useTheme();

  if (isLoading) {
    return (
      <View accessible accessibilityLabel="Loading performance figures." style={{ gap: 10 }}>
        <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-2xl h-28" />
        <View style={{ backgroundColor: tokens.color.neutral[100], opacity: 0.6 }} className="rounded-2xl h-36" />
      </View>
    );
  }

  if (!report) {
    return hideNotice ? null : <MonetizationGapNotice gapKey="performance" />;
  }

  return (
    <View style={{ gap: 12 }}>
      {!hideNotice ? <MonetizationGapNotice gapKey="performance" compact /> : null}

      <View>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-black uppercase tracking-widest mb-2.5"
          accessibilityRole="header"
        >
          {title}
        </Text>

        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {report.metrics.map((metric) => (
            <MetricTile key={metric.key} metric={metric} />
          ))}
        </View>
      </View>

      {report.series.length > 1 ? <TrendChart series={report.series} /> : null}

      <View className="flex-row items-center">
        <Ionicons name="time-outline" size={12} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold ml-1 flex-1 leading-relaxed"
        >
          {`${new Date(report.periodStart).toLocaleDateString()} to ${new Date(report.periodEnd).toLocaleDateString()}. Figures update about every ${report.reportingLagHours} hours.`}
        </Text>
      </View>
    </View>
  );
}

/**
 * One metric.
 *
 * Half-width so two sit per row on a 375-point screen without either truncating.
 * The definition goes into the accessibility label rather than onto the tile: a
 * grid of four tiles each carrying a sentence is a grid nobody reads, and a
 * screen reader user needs the definition more than a sighted one who can see
 * the label next to the number.
 */
function MetricTile({ metric }: { metric: PerformanceMetric }) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  const rendered = renderMetric(metric, (money) => pricing.format(money));
  const change = metric.changeRatio;

  const changeTone =
    change == null
      ? tokens.color.text.placeholder
      : change > 0
        ? tokens.color.success.default
        : change < 0
          ? tokens.color.error.default
          : tokens.color.text.placeholder;

  const spoken = [
    `${metric.label}: ${rendered}`,
    change != null
      ? `${change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged'} ${Math.abs(Math.round(change * 100))} percent on the period before`
      : null,
    metric.definition,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
        // Two per row with an 8-point gap. `flexBasis` rather than a fixed width
        // so it still lays out on a tablet.
        flexBasis: '48%',
        flexGrow: 1,
      }}
      className="rounded-2xl border p-3.5"
    >
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-widest">
        {metric.label}
      </Text>
      <Text style={{ color: tokens.color.text.primary }} className="text-xl font-black tracking-tight mt-1">
        {rendered}
      </Text>

      {change != null ? (
        <View className="flex-row items-center mt-1">
          <Ionicons
            name={change > 0 ? 'trending-up' : change < 0 ? 'trending-down' : 'remove'}
            size={12}
            color={changeTone}
          />
          <Text style={{ color: changeTone }} className="text-[11px] font-bold ml-1">
            {Math.abs(Math.round(change * 100))}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A metric's value, in its own unit. */
export function renderMetric(metric: PerformanceMetric, formatMoney: (money: never) => string): string {
  switch (metric.unit) {
    case 'currency':
      return metric.money ? formatMoney(metric.money as never) : '—';
    case 'percentage':
      return `${(metric.value * 100).toFixed(1)}%`;
    case 'ratio':
      return metric.value.toFixed(2);
    default:
      return metric.value.toLocaleString();
  }
}

/**
 * The trend, as bars.
 *
 * Scaled to the largest value in the series so the shape is legible whatever the
 * magnitude. Entirely hidden from the accessibility tree and replaced by one
 * summary sentence — reading out fourteen bar heights is worse than useless.
 */
function TrendChart({ series }: { series: { date: string; impressions: number; clicks: number }[] }) {
  const { tokens } = useTheme();

  const peak = Math.max(...series.map((point) => point.impressions), 1);
  const total = series.reduce((running, point) => running + point.impressions, 0);
  const best = series.reduce((top, point) => (point.impressions > top.impressions ? point : top), series[0]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Trend over ${series.length} days. ${total.toLocaleString()} impressions in total, with the busiest day on ${new Date(best.date).toLocaleDateString()}.`}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest mb-3"
      >
        Impressions over time
      </Text>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-row items-end"
        style={{ height: 72, gap: 3 }}
      >
        {series.map((point) => (
          <View key={point.date} className="flex-1 justify-end" style={{ minWidth: 4 }}>
            <View
              style={{
                backgroundColor: tokens.color.primary[500],
                // A floor of 2 points so a zero day is visibly a zero day rather
                // than an absent one.
                height: Math.max(2, (point.impressions / peak) * 72),
              }}
              className="rounded-t-sm"
            />
          </View>
        ))}
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-row justify-between mt-2"
      >
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold">
          {new Date(series[0].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold">
          {new Date(series[series.length - 1].date).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </Text>
      </View>
    </View>
  );
}

/**
 * The schematic a locked analytics screen shows.
 *
 * Deliberately contains no numbers at all. §12 forbids revealing premium data
 * the member has not bought, and the safest way to honour that is for the
 * preview to have nothing to reveal — grey bars and the *names* of the reports,
 * so somebody can see what they would get without being shown any of it.
 */
export function LockedPerformancePreview() {
  const { tokens } = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row" style={{ gap: 8 }}>
        {['Views', 'Enquiries'].map((label, index) => (
          <View
            key={label}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
              flexBasis: '48%',
              flexGrow: 1,
              opacity: 1 - index * 0.15,
            }}
            className="rounded-2xl border p-3.5"
          >
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-widest">
              {label}
            </Text>
            <View
              style={{ backgroundColor: tokens.color.neutral[200] }}
              className="h-6 w-16 rounded-md mt-1.5"
            />
          </View>
        ))}
      </View>

      <View
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="rounded-2xl border p-4"
      >
        <View style={{ backgroundColor: tokens.color.neutral[200] }} className="h-2.5 w-28 rounded-full mb-3" />
        <View className="flex-row items-end" style={{ height: 56, gap: 3 }}>
          {[0.4, 0.6, 0.35, 0.8, 0.55, 0.95, 0.7, 0.5].map((height, index) => (
            <View key={index} className="flex-1 justify-end">
              <View
                style={{ backgroundColor: tokens.color.neutral[200], height: 56 * height }}
                className="rounded-t-sm"
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
