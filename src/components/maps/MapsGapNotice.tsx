// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps gap and provenance markers (Frontend Phase 8)
//
// The visible half of §21/§23/§25/§26/§55/§56. Everything the map shows that is
// not a certified fact is marked here, and the marker is the *only* sanctioned
// way to render one.
//
// Four components, each answering a different question, because one component
// answering all four would be wrong three times:
//
//   `<MapsGapNotice>`      this whole surface has no backend behind it
//   `<MapProviderNotice>`  the frontend is complete, the *vendor* is missing
//   `<SourcedFigure>`      this single number is or is not real
//   `<FreshnessNote>`      when this was computed, by whom, and what it cannot
//                          tell you
//
// The last one carries the most weight in this phase. §26 forbids presenting a
// safety score as objective truth and requires the source, the date and the
// limitations to be shown — so `<FreshnessNote>` takes a `DataFreshness`, which
// the domain model makes non-optional on every intelligence value. A screen
// physically cannot obtain a safety score without also holding everything this
// component needs, which is why the requirement holds rather than being
// remembered.
//
// Deliberately not a wrapper around Phase 5's `<GapNotice>`, Phase 6's
// `<MonetizationGapNotice>`, Phase 7's `<CreatorGapNotice>` or Phase 12's
// `<CommunityGapNotice>`: each looks its gaps up in its own register, and
// passing a maps gap key into any of them returns null and renders nothing.
// Same visual language, separate registers.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { MAPS_GAPS, areMapsGapsEnabled } from '@/config/maps-gaps';
import { MAP_PROVIDER_GAPS } from '@/config/map-provider-gaps';
import type { DataFreshness, DataSource, Sourced } from '@/types/maps';

export interface MapsGapNoticeProps {
  /** A key from `MAPS_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

export function MapsGapNotice({ gapKey, compact = false, detail }: MapsGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = MAPS_GAPS[gapKey];
  const isDev = areMapsGapsEnabled();

  if (!gap) return null;

  // The capability shipped. The register keeps the entry as the historical
  // record; the member does not need to be told about a hole that is filled.
  if (gap.backendStatus === 'connected') return null;


  const body = isDev
    ? (detail ??
      `${gap.title} has no backend behind it yet. This runs on development data so the experience can be reviewed and tested — nothing here is a real measurement.`)
    : `${gap.title} is not something Diaspora can show yet. We will let you know when it arrives.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        isDev ? `Development preview. ${gap.title} is not connected to a backend. ${body}` : body
      }
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      testID={`maps-gap-notice-${gapKey}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="flask-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {isDev ? 'Preview · not connected' : 'Not available yet'}
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
          {gap.id} · needs {gap.missingContract[0]}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The marker for a missing *provider* rather than a missing backend.
 *
 * §56 keeps the two registers apart, and the distinction is not bureaucratic:
 * a member reading "we have not connected a maps provider yet" understands
 * something different from "this feature does not exist", and so does whoever
 * picks up the backlog. This one always renders — including in production —
 * because a provider gap is a real, permanent-until-fixed limitation the member
 * is entitled to know about, not a development artefact.
 */
export function MapProviderNotice({
  providerGapKey,
  compact = false,
  detail,
}: {
  providerGapKey: string;
  compact?: boolean;
  detail?: string;
}) {
  const { tokens } = useTheme();
  const gap = MAP_PROVIDER_GAPS[providerGapKey];

  if (!gap) return null;

  // The capability shipped. The register keeps the entry as the historical
  // record; the member does not need to be told about a hole that is filled.
  if (gap.backendStatus === 'connected') return null;


  const body = detail ?? gap.currentBehaviour;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${gap.capability} is limited. ${body}`}
      style={{
        backgroundColor: tokens.color.info.surface,
        borderColor: `${tokens.color.info.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      testID={`map-provider-notice-${providerGapKey}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="map-outline" size={16} color={tokens.color.info.default} />
        <Text
          style={{ color: tokens.color.info.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {gap.capability}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        {body}
      </Text>

      {!compact && areMapsGapsEnabled() ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2 leading-relaxed"
        >
          {gap.id} · {gap.requiredCapabilities[0]}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A single figure with its provenance attached.
 *
 * The component that makes §23 hold in practice: a screen receiving a
 * `Sourced<number>` cannot render the number without also rendering where it
 * came from, because the value is inside the envelope. An overall neighbourhood
 * score that blends real and estimated dimensions is `simulated`, and this is
 * what says so — beside the figure, not in a footnote.
 */
export function SourcedFigure({
  value,
  suffix,
  label,
  size = 'md',
}: {
  value: Sourced<number | string>;
  suffix?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { tokens } = useTheme();
  const isSimulated = value.source === 'simulated';

  const textSize = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-xl' : 'text-base';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label ? `${label}: ` : ''}${value.value}${suffix ?? ''}${
        isSimulated ? '. This is a development estimate, not a real measurement.' : ''
      }`}
    >
      <View className="flex-row items-baseline">
        <Text
          style={{ color: tokens.color.text.primary }}
          className={`${textSize} font-black`}
        >
          {value.value}
        </Text>
        {suffix ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-bold ml-0.5"
          >
            {suffix}
          </Text>
        ) : null}
        {isSimulated ? (
          <View
            style={{ backgroundColor: tokens.color.warning.surface }}
            className="ml-2 px-1.5 py-0.5 rounded"
          >
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[8px] font-black uppercase tracking-wider"
            >
              Estimate
            </Text>
          </View>
        ) : null}
      </View>

      {label ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * When a figure was computed, by whom, and what it cannot tell you.
 *
 * §23, §25 and §26 all require this and §26 requires it most strongly. The
 * limitations are rendered **verbatim and in full** — not truncated, not behind
 * a "read more", not summarised. A member deciding where to live on the
 * strength of a safety score is entitled to read, in the same glance, that it
 * is community-reported and says nothing about a particular street.
 */
export function FreshnessNote({
  freshness,
  compact = false,
}: {
  freshness: DataFreshness;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const computed = formatWhen(freshness.computedAt);
  const expired =
    Boolean(freshness.validUntil) && new Date(freshness.validUntil!).getTime() < Date.now();

  const summary = [
    `Source: ${freshness.sourceName}`,
    computed ? `updated ${computed}` : '',
    typeof freshness.sampleSize === 'number' ? `based on ${freshness.sampleSize} data points` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        summary,
        expired ? 'This figure is out of date.' : '',
        freshness.methodology ? `How this is worked out: ${freshness.methodology}` : '',
        freshness.limitations?.length
          ? `What it cannot tell you: ${freshness.limitations.join(' ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ borderColor: tokens.color.border.default }}
      className={`border-t ${compact ? 'pt-2 mt-2' : 'pt-3 mt-3'}`}
      testID="freshness-note"
    >
      <View className="flex-row items-center flex-wrap">
        <Ionicons name="time-outline" size={11} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold ml-1"
        >
          {summary}
        </Text>
      </View>

      {expired ? (
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-wider mt-1.5"
        >
          Out of date — treat as historical
        </Text>
      ) : null}

      {freshness.methodology && !compact ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold leading-relaxed mt-1.5"
        >
          {freshness.methodology}
        </Text>
      ) : null}

      {freshness.limitations?.length ? (
        <View className="mt-2">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-black uppercase tracking-wider mb-1"
          >
            What this does not tell you
          </Text>
          {freshness.limitations.map((limitation, index) => (
            <Text
              key={index}
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-semibold leading-relaxed"
            >
              • {limitation}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The qualifier beside a travel figure.
 *
 * §14/§15/§48. `isRouted: false` means the number came from a straight-line
 * distance and a mode speed, not from a road network, and the difference is
 * routinely 30–60% in a city cut by a river. This renders "estimated" rather
 * than letting a screen present it as a walking time.
 */
export function EstimateQualifier({
  isRouted,
  isSimulated,
  supportsTraffic,
  travelMode,
}: {
  isRouted: boolean;
  isSimulated?: boolean;
  supportsTraffic?: boolean;
  travelMode?: string;
}) {
  const { tokens } = useTheme();

  if (isRouted && supportsTraffic) return null;

  const sentence = !isRouted
    ? 'Estimated from straight-line distance and typical speeds — the real journey will usually be longer.'
    : travelMode === 'driving'
      ? 'Typical traffic is not included in this time.'
      : 'This is an estimate.';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={sentence}
      className="flex-row items-start mt-1.5"
      testID="estimate-qualifier"
    >
      <Ionicons name="information-circle-outline" size={12} color={tokens.color.text.placeholder} />
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold leading-relaxed ml-1 flex-1"
      >
        {sentence}
        {isSimulated && areMapsGapsEnabled() ? ' Development estimate.' : ''}
      </Text>
    </View>
  );
}

/**
 * A one-line badge saying which data source answered.
 *
 * For list rows and callouts, where a full notice would swamp the content but
 * silence would leave a simulated figure unmarked.
 */
export function SourceBadge({ source }: { source: DataSource }) {
  const { tokens } = useTheme();
  if (source === 'backend') return null;

  return (
    <View
      style={{ backgroundColor: tokens.color.warning.surface }}
      className="px-1.5 py-0.5 rounded self-start"
      accessible
      accessibilityRole="text"
      accessibilityLabel="Development data, not a real measurement"
    >
      <Text
        style={{ color: tokens.color.warning.default }}
        className="text-[8px] font-black uppercase tracking-wider"
      >
        Preview data
      </Text>
    </View>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
