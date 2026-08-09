// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics formatting (Frontend Phase 15, §39 · §55 · §56 · §57)
//
// Every number a dashboard shows passes through this file, and every accessible
// description of one is produced here too. Two rules make that worth centralising
// rather than letting each card format its own:
//
//   **§55: colour is never the only indicator.** A green "+18%" and a red "−7%"
//   are the same string to somebody who cannot distinguish them, and identical
//   to a screen reader. So `deltaView()` returns a **direction word, an arrow
//   glyph, a tone and a spoken sentence** together, and a component that renders
//   only the tone has to have deliberately discarded the other three.
//
//   **§57: the currency comes from the contract.** There is no default currency
//   anywhere in this file. A metric whose `format` is `currency` and whose
//   `money` is null renders as unavailable rather than as a bare number with an
//   assumed symbol — because a `1,240` that is actually NGN displayed to
//   somebody who assumes GBP is worse than no figure at all.
//
// ── On `Intl` and Hermes ─────────────────────────────────────────────────────
//
// Every `Intl` call is wrapped, following `lib/money.ts`, which found trimmed
// ICU builds on Android in practice. The fallbacks are deliberately plain rather
// than clever: a grouped number is nicer, an ungrouped one is readable, and a
// crash is neither.
// ─────────────────────────────────────────────────────────────────────────────

import { formatMoney, describeMoney } from '@/lib/money';
import type {
  AnalyticsComparison,
  AnalyticsMetric,
  AnalyticsMetricFormat,
} from '@/types/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Numbers — §56
// ─────────────────────────────────────────────────────────────────────────────

export interface NumberFormatOptions {
  locale?: string;
  /** `12.4K` rather than `12,417`. On for tiles, off for tables. */
  compact?: boolean;
  maximumFractionDigits?: number;
}

/**
 * A count.
 *
 * Compact notation kicks in at 10,000 rather than 1,000. Below that the exact
 * figure fits and is more useful — "4,218 views" is a fact and "4.2K views" is a
 * rounding of it, and there is no space saved worth that on a phone.
 */
export function formatCount(value: number, options: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return '—';

  const { locale, compact = false, maximumFractionDigits } = options;
  const useCompact = compact && Math.abs(value) >= 10_000;

  try {
    return new Intl.NumberFormat(locale, {
      notation: useCompact ? 'compact' : 'standard',
      maximumFractionDigits: maximumFractionDigits ?? (useCompact ? 1 : 0),
    }).format(value);
  } catch {
    return maximumFractionDigits ? value.toFixed(maximumFractionDigits) : `${Math.round(value)}`;
  }
}

/**
 * A percentage, from a **0–1 ratio**.
 *
 * The unit convention is stated in the signature deliberately: this is the
 * single most common source of a hundredfold error in analytics code, and every
 * `format: 'percentage'` metric in this platform carries a ratio. A value
 * outside 0–1 is still rendered — a 250% increase is real — but the domain
 * model's percentages are ratios.
 */
export function formatPercentage(
  ratio: number,
  options: NumberFormatOptions & { signed?: boolean } = {}
): string {
  if (!Number.isFinite(ratio)) return '—';

  const { locale, signed = false } = options;
  const digits = options.maximumFractionDigits ?? (Math.abs(ratio) < 0.1 ? 1 : 0);

  try {
    const body = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }).format(ratio);
    return body;
  } catch {
    const sign = signed && ratio > 0 ? '+' : '';
    return `${sign}${(ratio * 100).toFixed(digits)}%`;
  }
}

/**
 * A duration in seconds, as words.
 *
 * Not `Intl.RelativeTimeFormat`, which says "in 3 minutes" — a session length is
 * a quantity, not a moment. Two units at most: "1h 12m" is readable and
 * "1h 12m 4s" is a stopwatch.
 */
export function formatDuration(seconds: number, options: { locale?: string } = {}): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';

  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const remainder = total % 60;
    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  if (hours < 24) {
    return remainderMinutes === 0 ? `${hours}h` : `${hours}h ${remainderMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours === 0
    ? `${days}d`
    : `${days}d ${remainderHours}h`;
}

/** A 0–5 style score. One decimal, because 4.3 and 4.0 are different claims. */
export function formatScore(value: number, options: { locale?: string } = {}): string {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(options.locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return value.toFixed(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricFormatOptions {
  locale?: string;
  compact?: boolean;
}

/**
 * The displayed value of a metric.
 *
 * Three things it refuses to do, each because the alternative is a specific
 * documented failure:
 *
 *   A **suppressed** metric never renders its number. §47: a count over a small
 *   population identifies people, and a UI that showed the value while labelling
 *   it suppressed would have published it anyway.
 *
 *   A **currency** metric with no `Money` renders as unavailable. §57: there is
 *   no default currency, so there is nothing correct to print.
 *
 *   A **ratio** is rendered as a ratio ("0.42×"), not silently multiplied by a
 *   hundred. `ratio` and `percentage` are different formats precisely so that
 *   stickiness (a percentage) and a per-member average (a ratio) do not collide.
 */
export function formatMetricValue(
  metric: AnalyticsMetric,
  options: MetricFormatOptions = {}
): string {
  if (metric.isSuppressed) return 'Too few to report';

  const value = metric.value.value;

  switch (metric.format) {
    case 'currency':
      return metric.money
        ? formatMoney(metric.money, { locale: options.locale, compact: options.compact })
        : 'Not available';

    case 'percentage':
      return formatPercentage(value, { locale: options.locale });

    case 'ratio':
      return `${formatCount(value, { locale: options.locale, maximumFractionDigits: 2 })}×`;

    case 'duration':
      return formatDuration(value, { locale: options.locale });

    case 'score':
      return formatScore(value, { locale: options.locale });

    case 'rate':
      return metric.unit
        ? `${formatCount(value, { ...options, maximumFractionDigits: 1 })} ${metric.unit}`
        : formatCount(value, { ...options, maximumFractionDigits: 1 });

    case 'count':
    default:
      return formatCount(value, options);
  }
}

/** The same, for a bare value where no metric object exists — a chart axis. */
export function formatValue(
  value: number,
  format: AnalyticsMetricFormat,
  options: MetricFormatOptions & { currency?: string | null } = {}
): string {
  switch (format) {
    case 'percentage':
      return formatPercentage(value, options);
    case 'ratio':
      return `${formatCount(value, { ...options, maximumFractionDigits: 2 })}×`;
    case 'duration':
      return formatDuration(value, options);
    case 'score':
      return formatScore(value, options);
    case 'currency':
      // Deliberately unit-less. A chart axis has one currency for the whole
      // series and it is stated in the legend; repeating a symbol on every
      // gridline is noise, and *guessing* one here would be §57's failure.
      return formatCount(value, { ...options, compact: true });
    default:
      return formatCount(value, options);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison — §7, §55
// ─────────────────────────────────────────────────────────────────────────────

export type DeltaTone = 'positive' | 'negative' | 'neutral' | 'unknown';

export interface DeltaView {
  /** "+18%", "−7%", "No change", "Not enough data". Never empty. */
  label: string;
  /** An arrow, or a dash. A second, non-colour channel — §55. */
  glyph: '↑' | '↓' | '→' | '·';
  /** The word, so the third channel is text — §55. */
  direction: 'up' | 'down' | 'flat' | 'unknown';
  tone: DeltaTone;
  /** What a screen reader says. A whole sentence, not a fragment. */
  spoken: string;
}

/**
 * Turns a comparison into everything a component needs to render it honestly.
 *
 * `higherIsBetter` is a required argument rather than defaulted to true, and
 * that is the point of the signature: churn going up is not good news, and a
 * default would make the wrong answer the easy one. `AnalyticsMetric` carries
 * the flag, so a call site nearly always has it.
 *
 * The `unavailableReason` arm is §7's "do not show misleading percentage changes
 * when there is no valid comparison baseline" — each reason gets its own
 * sentence, because "not enough history" and "nothing to compare against"
 * prompt different actions from the person reading it.
 */
export function deltaView(
  comparison: AnalyticsComparison | null | undefined,
  higherIsBetter: boolean
): DeltaView | null {
  if (!comparison || comparison.basis === 'none') return null;

  if (comparison.changePercent === null || comparison.changePercent === undefined) {
    const label = describeComparisonUnavailable(comparison);
    return {
      label,
      glyph: '·',
      direction: 'unknown',
      tone: 'unknown',
      spoken: `No comparison available. ${label}.`,
    };
  }

  const change = comparison.changePercent;

  // A threshold rather than exact zero. A 0.02% move is noise, and rendering it
  // as "+0%" with an up arrow claims a trend that is not there.
  if (Math.abs(change) < 0.005) {
    return {
      label: 'No change',
      glyph: '→',
      direction: 'flat',
      tone: 'neutral',
      spoken: 'No change against the comparison period.',
    };
  }

  const isUp = change > 0;
  const isGood = isUp === higherIsBetter;
  const label = formatPercentage(change, { signed: true });

  return {
    label,
    glyph: isUp ? '↑' : '↓',
    direction: isUp ? 'up' : 'down',
    tone: isGood ? 'positive' : 'negative',
    spoken: `${isUp ? 'Up' : 'Down'} ${formatPercentage(Math.abs(change))} against the comparison period.`,
  };
}

/** The sentence for a comparison that could not be computed. */
export function describeComparisonUnavailable(comparison: AnalyticsComparison): string {
  switch (comparison.unavailableReason) {
    case 'insufficientHistory':
      return 'Not enough history yet';
    case 'zeroBaseline':
      return 'Nothing to compare against';
    case 'unsupported':
      return 'Comparison not available';
    case 'suppressed':
      return 'Comparison withheld';
    default:
      return 'No comparison';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessible descriptions — §55
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The whole of a metric card, as one sentence.
 *
 * §55 asks for accessible metric cards and text summaries. The rule this
 * function follows is that a screen reader user should get the *same
 * information* as a sighted one, in the same order, including the parts carried
 * visually — the provenance marker, the suppression, the freshness. A label that
 * said only "Views, 4,218" would drop the three things that make the number
 * interpretable.
 */
export function describeMetric(
  metric: AnalyticsMetric,
  options: MetricFormatOptions = {}
): string {
  const parts: string[] = [];

  if (metric.isSuppressed) {
    parts.push(
      `${metric.label}: too few to report. This figure is withheld because the group it covers is small enough that publishing it could identify individuals.`
    );
    return parts.join(' ');
  }

  const spokenValue =
    metric.format === 'currency' && metric.money
      ? describeMoney(metric.money, { locale: options.locale })
      : formatMetricValue(metric, { ...options, compact: false });

  parts.push(`${metric.label}: ${spokenValue}.`);

  const delta = deltaView(metric.comparison, metric.higherIsBetter);
  if (delta) parts.push(delta.spoken);

  if (metric.value.source === 'simulated') {
    parts.push('This figure is development data, not a real measurement.');
  } else if (metric.computation === 'client-derived') {
    parts.push('Calculated on this device from your own records.');
  } else if (metric.computation === 'estimated') {
    parts.push('This figure is an estimate.');
  }

  return parts.join(' ');
}

/**
 * A series as a sentence, for the chart's accessible alternative.
 *
 * §55 requires charts to have accessible alternatives, and the honest form of
 * that is not "a chart" announced to a screen reader — it is the shape described
 * in words plus the table beside it. This produces the first half: what the
 * series starts at, ends at, its extremes and its direction.
 *
 * It deliberately does **not** say "trending upwards" from two endpoints. A
 * series that rose, collapsed and half-recovered is not "up", and a summary that
 * said so would be the client inventing an analysis — the same rule §25 applies
 * to recommendations.
 */
export function describeSeries(
  label: string,
  points: { at: string; value: number }[],
  format: AnalyticsMetricFormat,
  options: MetricFormatOptions & { bucketLabel?: (at: string) => string } = {}
): string {
  if (points.length === 0) return `${label}: no data in this period.`;

  const values = points.map((point) => point.value);
  const first = values[0];
  const last = values[values.length - 1];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const peak = points[values.indexOf(max)];
  const trough = points[values.indexOf(min)];
  const bucket = options.bucketLabel ?? ((at: string) => at);

  const render = (value: number) => formatValue(value, format, options);

  if (points.length === 1) {
    return `${label}: one data point, ${render(first)} on ${bucket(points[0].at)}.`;
  }

  return [
    `${label} over ${points.length} periods.`,
    `Starts at ${render(first)}, ends at ${render(last)}.`,
    max === min
      ? `Flat throughout at ${render(max)}.`
      : `Highest ${render(max)} on ${bucket(peak.at)}; lowest ${render(min)} on ${bucket(trough.at)}.`,
  ].join(' ');
}

/**
 * A breakdown as a sentence.
 *
 * Caps at five buckets and says how many were left out. A screen reader reading
 * forty country names is not an accessible alternative, it is a punishment — and
 * the full set is in the table the breakdown renders anyway.
 */
export function describeBreakdown(
  label: string,
  buckets: { label: string; value: number; ratio?: number | null }[],
  format: AnalyticsMetricFormat,
  options: MetricFormatOptions = {}
): string {
  if (buckets.length === 0) return `${label}: no data in this period.`;

  const shown = buckets.slice(0, 5);
  const remainder = buckets.length - shown.length;

  const items = shown.map((bucket) => {
    const value = formatValue(bucket.value, format, options);
    return bucket.ratio !== null && bucket.ratio !== undefined
      ? `${bucket.label}, ${value}, ${formatPercentage(bucket.ratio, options)} of the total`
      : `${bucket.label}, ${value}`;
  });

  return [
    `${label}, ${buckets.length} ${buckets.length === 1 ? 'category' : 'categories'}.`,
    items.join('. ') + '.',
    remainder > 0 ? `${remainder} more not read out; the full list is in the table.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** A funnel as a sentence, including where people actually leave. */
export function describeFunnel(
  label: string,
  steps: { label: string; count: number; conversionFromPrevious?: number | null }[],
  options: MetricFormatOptions = {}
): string {
  if (steps.length === 0) return `${label}: no data in this period.`;

  const first = steps[0];
  const last = steps[steps.length - 1];
  const overall = first.count > 0 ? last.count / first.count : null;

  const biggestDrop = steps
    .slice(1)
    .reduce<{ label: string; rate: number } | null>((worst, step, index) => {
      const rate = step.conversionFromPrevious;
      if (rate === null || rate === undefined) return worst;
      const dropOff = 1 - rate;
      if (!worst || dropOff > worst.rate) {
        return { label: `${steps[index].label} to ${step.label}`, rate: dropOff };
      }
      return worst;
    }, null);

  return [
    `${label}. ${steps.length} steps.`,
    steps
      .map((step) => `${step.label}, ${formatCount(step.count, options)}`)
      .join('. ') + '.',
    overall !== null
      ? `Overall ${formatPercentage(overall, options)} of people who started reached the end.`
      : null,
    biggestDrop
      ? `The largest fall is between ${biggestDrop.label}, where ${formatPercentage(biggestDrop.rate, options)} stop.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}
