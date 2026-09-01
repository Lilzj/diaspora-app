// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics provenance markers (Frontend Phase 15,
// §5 · §36 · §37 · §38 · §73)
//
// Everything a dashboard shows that is not a certified measurement is marked
// here, and these are the only sanctioned ways to render one.
//
// Five components, each answering a different question, because one component
// answering all five would be wrong four times:
//
//   `<AnalyticsGapNotice>`     this whole surface has no backend behind it
//   `<DataStatusBadge>`        what state the dataset as a whole is in (§37)
//   `<MetricProvenance>`       how *this* number was produced (§5)
//   `<FreshnessIndicator>`     when it was computed, by whom, what it cannot say
//   `<SuppressedNote>`         why a figure is withheld rather than shown (§47)
//
// ── The distinction that matters most ────────────────────────────────────────
//
// §5 requires two things to be separable that most analytics UIs conflate:
// **who produced a figure** and **how it was arrived at**. A wallet total summed
// on this device from B15's real ledger is backend-sourced and client-derived. A
// simulated engagement rate is neither.
//
// A single "simulated" badge cannot express that, and the failure mode is
// specific: mark the wallet total as simulated and a reviewer learns the badge
// is noise; mark it as a server aggregate and it claims an authority the platform
// never granted it. `<MetricProvenance>` renders the two axes separately for
// exactly this reason.
//
// ── Why colour is never enough ───────────────────────────────────────────────
//
// §55: colour must never be the only indicator. Every component here pairs its
// tone with an icon and a word, and every one carries an `accessibilityLabel`
// that states the marker in a sentence. A member using a screen reader is
// entitled to know a figure is simulated, and a coloured border does not tell
// them.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { ANALYTICS_GAPS, areAnalyticsGapsEnabled } from '@/config/analytics-gaps';
import { formatRelativeTime } from '@/utils/format';
import type {
  AnalyticsComputation,
  AnalyticsDataStatus,
  AnalyticsMetric,
  DataFreshness,
  DataSource,
} from '@/types/analytics';

// ═════════════════════════════════════════════════════════════════════════════
// GAP NOTICE
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsGapNoticeProps {
  /** A key from `ANALYTICS_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

/**
 * The whole-surface marker.
 *
 * Deliberately **not** a wrapper around Phase 5's `<GapNotice>`, Phase 6's
 * `<MonetizationGapNotice>`, Phase 7's `<CreatorGapNotice>`, Phase 8's
 * `<MapsGapNotice>`, Phase 12's `<CommunityGapNotice>` or Phase 13's
 * `<MultiCommunityGapNotice>`: each looks its gaps up in its own register, and
 * passing a Phase 15 gap key into any of them returns null and renders nothing.
 * Same visual language, separate registers.
 */
export function AnalyticsGapNotice({ gapKey, compact = false, detail }: AnalyticsGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = ANALYTICS_GAPS[gapKey];
  const isDev = areAnalyticsGapsEnabled();

  if (!gap) return null;

  // The capability shipped. The register keeps the entry as the historical
  // record; the member does not need to be told about a hole that is filled.
  if (gap.backendStatus === 'connected') return null;


  const body = isDev
    ? (detail ??
      `${gap.capability} has no backend behind it yet. The figures below come from a development adapter so the experience can be reviewed and tested — they are not measurements of anything.`)
    : `${gap.capability} is not something Diaspora can report on yet. We will let you know when it arrives.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        isDev
          ? `Development preview. These figures are not real measurements. ${body}`
          : body
      }
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      testID={`analytics-gap-notice-${gapKey}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="flask-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {isDev ? 'Development data · not measured' : 'Not available yet'}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        {body}
      </Text>

      {isDev && !compact ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2 leading-relaxed"
        >
          {gap.id} · needs {gap.missingBackendCapability[0]}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The release-build state.
 *
 * A statement rather than an error. A production binary genuinely cannot reach
 * the development adapter, and rendering a spinner that resolves into a network
 * failure would describe that as a fault.
 */
export function AnalyticsGapUnavailable({ gapKey }: { gapKey: string }) {
  const { tokens } = useTheme();
  const gap = ANALYTICS_GAPS[gapKey];

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
      >
        <Ionicons name="bar-chart-outline" size={26} color={tokens.color.text.placeholder} />
      </View>

      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight text-center"
      >
        Not available yet
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-semibold text-center mt-2 leading-relaxed"
      >
        {gap
          ? `${gap.capability} is something Diaspora is still building. There is nothing to show here yet.`
          : 'There is nothing to show here yet.'}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DATA STATUS — §37
// ═════════════════════════════════════════════════════════════════════════════

interface StatusPresentation {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'neutral' | 'info' | 'warning' | 'error' | 'success';
  /** A whole sentence for a screen reader. Never a fragment. */
  spoken: string;
}

/**
 * §37's eight states, each with its own words.
 *
 * Collapsing any two would lose a distinction the brief asks for. `CACHED` and
 * `STALE` are the pair most often merged and are the pair it matters most to
 * keep apart: one means "this is real and being refreshed", the other means
 * "this is old and you are offline". A member acting on the second needs to know.
 */
const STATUS_PRESENTATION: Record<AnalyticsDataStatus, StatusPresentation> = {
  LIVE: {
    label: 'Up to date',
    icon: 'checkmark-circle-outline',
    tone: 'success',
    spoken: 'These figures are up to date.',
  },
  PARTIAL: {
    label: 'Partly available',
    icon: 'alert-circle-outline',
    tone: 'warning',
    spoken: 'Some figures on this screen could not be produced. The ones shown are real.',
  },
  ESTIMATED: {
    label: 'Estimated',
    icon: 'analytics-outline',
    tone: 'info',
    spoken: 'These figures are estimates rather than exact counts.',
  },
  CACHED: {
    label: 'Refreshing',
    icon: 'sync-outline',
    tone: 'info',
    spoken: 'Showing the last figures received while newer ones are fetched.',
  },
  STALE: {
    label: 'Out of date',
    icon: 'cloud-offline-outline',
    tone: 'warning',
    spoken:
      'You are offline. These figures were saved earlier and are not current. Reconnect to refresh them.',
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    icon: 'remove-circle-outline',
    tone: 'neutral',
    spoken: 'Diaspora could not produce these figures.',
  },
  DEVELOPMENT_DATA: {
    label: 'Development data',
    icon: 'flask-outline',
    tone: 'warning',
    spoken: 'These figures come from a development adapter. They are not measurements.',
  },
  BACKEND_GAP: {
    label: 'Not measured yet',
    icon: 'construct-outline',
    tone: 'warning',
    spoken: 'Diaspora does not measure this yet, so there is nothing real to report.',
  },
};

export function DataStatusBadge({
  status,
  compact = false,
}: {
  status: AnalyticsDataStatus;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const presentation = STATUS_PRESENTATION[status];

  const colour =
    presentation.tone === 'success'
      ? tokens.color.success.default
      : presentation.tone === 'warning'
        ? tokens.color.warning.default
        : presentation.tone === 'error'
          ? tokens.color.error.default
          : presentation.tone === 'info'
            ? tokens.color.info.default
            : tokens.color.text.placeholder;

  const surface =
    presentation.tone === 'success'
      ? tokens.color.success.surface
      : presentation.tone === 'warning'
        ? tokens.color.warning.surface
        : presentation.tone === 'error'
          ? tokens.color.error.surface
          : presentation.tone === 'info'
            ? tokens.color.info.surface
            : tokens.color.neutral[100];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={presentation.spoken}
      style={{ backgroundColor: surface }}
      className={`flex-row items-center self-start rounded-full ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
      testID={`analytics-status-${status}`}
    >
      {/* The icon is the second channel and the label is the third. §55. */}
      <Ionicons name={presentation.icon} size={compact ? 10 : 12} color={colour} />
      <Text
        style={{ color: colour }}
        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest ml-1`}
      >
        {presentation.label}
      </Text>
    </View>
  );
}

/** The status as a sentence, for a screen that renders it as prose. */
export function describeDataStatus(status: AnalyticsDataStatus): string {
  return STATUS_PRESENTATION[status].spoken;
}

// ═════════════════════════════════════════════════════════════════════════════
// METRIC PROVENANCE — §5's two axes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How one number was produced.
 *
 * Renders nothing at all for the ordinary case — a backend-sourced server
 * aggregate — because a marker on every figure is a marker nobody reads. It
 * appears exactly when there is something worth saying.
 */
export function MetricProvenance({
  source,
  computation,
  compact = false,
}: {
  source: DataSource;
  computation: AnalyticsComputation;
  compact?: boolean;
}) {
  const { tokens } = useTheme();

  const isOrdinary = source === 'backend' && computation === 'server-aggregate';
  if (isOrdinary) return null;

  const { label, icon, colour } =
    source === 'simulated'
      ? {
          label: 'Simulated',
          icon: 'flask-outline' as const,
          colour: tokens.color.warning.default,
        }
      : computation === 'client-derived'
        ? {
            label: 'Worked out on your phone',
            icon: 'phone-portrait-outline' as const,
            colour: tokens.color.info.default,
          }
        : {
            label: 'Estimated',
            icon: 'analytics-outline' as const,
            colour: tokens.color.info.default,
          };

  return (
    <View
      className="flex-row items-center mt-1"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Hidden from the screen reader deliberately: `describeMetric()` already
          puts this sentence into the card's own accessibility label, and
          announcing it twice makes every tile read like a disclaimer. */}
      <Ionicons name={icon} size={compact ? 9 : 10} color={colour} />
      <Text
        style={{ color: colour }}
        className={`${compact ? 'text-[8px]' : 'text-[9px]'} font-black uppercase tracking-widest ml-1`}
      >
        {label}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FRESHNESS — §36
// ═════════════════════════════════════════════════════════════════════════════

/**
 * When a figure was computed, by whom, and what it cannot tell you.
 *
 * `limitations` are rendered verbatim rather than summarised. They come from the
 * source and are the part a member most needs — "figures can trail live activity
 * by up to 18 hours" changes what somebody does with a number, and paraphrasing
 * it would be this component deciding how much that matters.
 */
export function FreshnessIndicator({
  freshness,
  showSource = true,
  timezoneNote,
}: {
  freshness: DataFreshness;
  showSource?: boolean;
  /** §58's sentence. Passed in rather than derived so the range owns it. */
  timezoneNote?: string | null;
}) {
  const { tokens } = useTheme();

  const computed = freshness.computedAt ? formatRelativeTime(freshness.computedAt) : null;

  const spoken = [
    computed ? `Last recalculated ${computed}.` : 'No calculation date is published for these figures.',
    showSource && freshness.sourceName ? `Source: ${freshness.sourceName}.` : null,
    freshness.methodology,
    timezoneNote,
    ...(freshness.limitations ?? []),
    freshness.sampleSize !== undefined ? `Based on ${freshness.sampleSize} data points.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={spoken} className="mt-3">
      <View className="flex-row items-center flex-wrap">
        <Ionicons name="time-outline" size={11} color={tokens.color.text.disabled} />
        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-bold ml-1.5"
        >
          {computed ? `Updated ${computed}` : 'No update date published'}
          {showSource && freshness.sourceName ? ` · ${freshness.sourceName}` : ''}
        </Text>
      </View>

      {freshness.methodology ? (
        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold mt-1 leading-relaxed"
        >
          {freshness.methodology}
        </Text>
      ) : null}

      {timezoneNote ? (
        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold mt-1 leading-relaxed"
        >
          {timezoneNote}
        </Text>
      ) : null}

      {freshness.limitations?.map((limitation) => (
        <View key={limitation} className="flex-row items-start mt-1">
          <Text style={{ color: tokens.color.warning.default }} className="text-[10px] font-black mr-1">
            ·
          </Text>
          <Text
            style={{ color: tokens.color.warning.default }}
            className="text-[10px] font-semibold flex-1 leading-relaxed"
          >
            {limitation}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUPPRESSION — §47
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Why a figure is withheld.
 *
 * Renders in place of the number, never beside it. §47: a count over a small
 * population identifies people, and a UI that showed the value while labelling it
 * suppressed would have published it anyway.
 */
export function SuppressedValue({ compact = false }: { compact?: boolean }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Too few to report. This figure is withheld because the group it covers is small enough that publishing it could identify individuals."
      className="flex-row items-center"
    >
      <Ionicons name="eye-off-outline" size={compact ? 12 : 14} color={tokens.color.text.placeholder} />
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold ml-1.5`}
      >
        Too few to report
      </Text>
    </View>
  );
}

/**
 * A short explanation of the suppression rule, for the foot of a dashboard that
 * has any suppressed cells.
 *
 * Worth a sentence rather than only a badge: a member seeing "too few to report"
 * on their own community's dashboard will otherwise read it as a fault.
 */
export function SuppressionNote() {
  const { tokens } = useTheme();

  return (
    <Text
      accessible
      accessibilityRole="text"
      style={{ color: tokens.color.text.disabled }}
      className="text-[10px] font-semibold leading-relaxed mt-2"
    >
      Some figures are withheld where the group they cover is small enough that publishing a number
      could identify the people in it. That is deliberate, and it applies to everyone.
    </Text>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The header strip every dashboard carries: status, freshness, and the gap
 * notice when there is one.
 *
 * One component so the three cannot drift apart in ordering or wording across
 * twenty screens, and so a screen cannot render a dataset without its status.
 */
export function AnalyticsProvenanceHeader({
  status,
  freshness,
  gapKey,
  gapDetail,
  timezoneNote,
  hasSuppressedMetrics = false,
}: {
  status: AnalyticsDataStatus;
  freshness: DataFreshness;
  gapKey?: string | null;
  gapDetail?: string;
  timezoneNote?: string | null;
  hasSuppressedMetrics?: boolean;
}) {
  const showGapNotice =
    Boolean(gapKey) && (status === 'DEVELOPMENT_DATA' || status === 'BACKEND_GAP' || status === 'PARTIAL');

  return (
    <View>
      <DataStatusBadge status={status} />

      {showGapNotice ? (
        <View className="mt-3">
          <AnalyticsGapNotice gapKey={gapKey!} detail={gapDetail} compact />
        </View>
      ) : null}

      <FreshnessIndicator freshness={freshness} timezoneNote={timezoneNote} />

      {hasSuppressedMetrics ? <SuppressionNote /> : null}
    </View>
  );
}

/** Whether any metric in a set is suppressed, so a screen can show the note. */
export function hasSuppressedMetrics(metrics: AnalyticsMetric[]): boolean {
  return metrics.some((metric) => metric.isSuppressed === true);
}
