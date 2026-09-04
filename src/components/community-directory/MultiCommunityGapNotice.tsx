// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-community provenance markers (Frontend Phase 13)
//
// The visible half of §29, §41, §64 and GAP-009. Everything a community surface
// shows that is not a certified fact is marked here, and these are the only
// sanctioned ways to render one.
//
// Four components, each answering a different question, because one component
// answering all four would be wrong three times:
//
//   `<MultiCommunityGapNotice>`  this whole surface has no backend behind it
//   `<CommunityScopeNote>`       the community filter is a country projection
//   `<CommunityMetricFigure>`    this single number is or is not real
//   `<CommunityFreshnessNote>`   when it was computed, by whom, and what it
//                                cannot tell you
//
// The second one carries this phase's weight. GAP-009 is the finding that no
// certified route accepts a community id, so every scoped list in the app is
// filtered by the publisher's country of origin standing in for a community. A
// member is entitled to know that, and `<CommunityScopeNote>` is where they are
// told — beside the results, not in a footnote.
//
// Deliberately **not** a wrapper around Phase 5's `<GapNotice>`, Phase 6's
// `<MonetizationGapNotice>`, Phase 7's `<CreatorGapNotice>`, Phase 12's
// `<CommunityGapNotice>` or Phase 8's `<MapsGapNotice>`: each looks its gaps up in
// its own register, and passing a Phase 13 gap key into any of them returns null
// and renders nothing. Same visual language, separate registers — and the name is
// `MultiCommunityGapNotice` rather than `CommunityGapNotice` precisely because the
// latter is taken by a different community concept.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  MULTI_COMMUNITY_GAPS,
  areMultiCommunityGapsEnabled,
} from '@/config/multi-community-gaps';
import type {
  CommunityAssociationBasis,
  CommunityMetric,
  DataFreshness,
  DataSource,
} from '@/types/community-directory';
import type { ScopeProjection } from '@/lib/community/scope';

export interface MultiCommunityGapNoticeProps {
  /** A key from `MULTI_COMMUNITY_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

export function MultiCommunityGapNotice({
  gapKey,
  compact = false,
  detail,
}: MultiCommunityGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = MULTI_COMMUNITY_GAPS[gapKey];
  const isDev = areMultiCommunityGapsEnabled();

  if (!gap) return null;

  // The capability shipped. The register keeps the entry as the historical
  // record; the member does not need to be told about a hole that is filled.
  if (gap.backendStatus === 'connected') return null;

  // Part of it is real, and saying otherwise is the overstatement this whole
  // sweep was about. A partial entry carries its own sentence naming what the
  // member can rely on; the generic one below would tell them the working half
  // does not work.
  const partial = gap.backendStatus === 'partial' ? gap.backendPartialNote : undefined;

  const body =
    detail ??
    partial ??
    (isDev
      ? `${gap.capability} has no backend behind it yet. This runs on development data so the experience can be reviewed and tested — nothing here is a real community, a real membership or a real measurement.`
      : `${gap.capability} is not something Diaspora can show yet. We will let you know when it arrives.`);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        partial
          ? `Partly available. ${body}`
          : isDev
            ? `Development preview. ${gap.capability} is not connected to a backend. ${body}`
            : body
      }
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      testID={`multi-community-gap-notice-${gapKey}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="flask-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {partial ? 'Partly available' : isDev ? 'Preview · not connected' : 'Not available yet'}
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
 * The note beside a community-scoped result list.
 *
 * This is the component that keeps §2 honest in the product rather than only in
 * the architecture. It says three things, and each is load-bearing:
 *
 *   * The filter is **matched by country of origin**, not by a community the
 *     publisher declared. GAP-009.
 *   * How many results the projection set aside, when it set any aside — because
 *     "12 results" and "12 of 48 results" tell a member different things about
 *     whether to widen their search.
 *   * Which communities in their scope **could not be matched at all**, by name.
 *     A member scoped to "West African" — a regional community with no country of
 *     origin — would otherwise see an empty list and conclude the community is
 *     empty, when in fact the filter cannot express it.
 *
 * Renders nothing when the scope is unscoped, because then nothing was applied
 * and a note would be noise.
 */
export function CommunityScopeNote({
  projection,
  totalBeforeScope,
  totalAfterScope,
  resultTruncated,
  scopeUnavailable,
  pageLimited,
  compact = false,
}: {
  projection: ScopeProjection;
  totalBeforeScope?: number;
  totalAfterScope?: number;
  resultTruncated?: boolean;
  /**
   * Wave J. The domain carries no origin signal, so the member's community
   * filter was not applied to this list at all. Distinct from "applied
   * approximately", and the member is told which of the two happened.
   */
  scopeUnavailable?: boolean;
  /**
   * Wave J. The narrowing ran over one server page of a cursor-paginated route.
   * Named because it cannot be fixed from the client — see
   * `CommunityScopedResult.pageLimited`.
   */
  pageLimited?: boolean;
  compact?: boolean;
}) {
  const { tokens } = useTheme();

  if (projection.isUnscoped) return null;

  const unexpressed = projection.unexpressed.map((ref) => ref.name);

  const narrowing =
    typeof totalBeforeScope === 'number' &&
    typeof totalAfterScope === 'number' &&
    totalBeforeScope > totalAfterScope
      ? `Showing ${totalAfterScope} of ${totalBeforeScope} nearby results.`
      : null;

  // The lead sentence has three cases, and getting the third one wrong is how a
  // member would come to believe a filter had been applied that never was.
  const lead = projection.isEmpty
    ? 'No communities are selected, so there is nothing to show here yet.'
    : scopeUnavailable
      ? 'Your community filter is not applied to this list. Diaspora has no record of which community these belong to — the only country on them is where they are, and where something is held is not the community it is for.'
      : 'These results are matched by the country each person or business came from — Diaspora cannot yet filter by community itself.';

  const sentences = [
    lead,
    scopeUnavailable ? null : narrowing,
    resultTruncated && !scopeUnavailable
      ? 'There may be more further out. Try a wider area or fewer communities.'
      : null,
    // Only worth saying when a narrowing actually happened over a page. Saying it
    // alongside `scopeUnavailable` would be describing the mechanics of a filter
    // that was not applied.
    pageLimited && !scopeUnavailable && !projection.isEmpty
      ? 'Diaspora matched your communities against one page of results at a time, so there may be more matches on later pages that this list cannot reach yet.'
      : null,
    unexpressed.length > 0
      ? `${unexpressed.join(' and ')} ${unexpressed.length === 1 ? 'covers' : 'cover'} more than one country, so ${unexpressed.length === 1 ? 'its' : 'their'} content cannot be matched this way yet.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={sentences.join(' ')}
      style={{
        backgroundColor: tokens.color.info.surface,
        borderColor: `${tokens.color.info.default}33`,
      }}
      className={`rounded-2xl border ${compact ? 'p-2.5' : 'p-3'}`}
      testID="community-scope-note"
    >
      <View className="flex-row items-start">
        <Ionicons
          name="funnel-outline"
          size={13}
          color={tokens.color.info.default}
          style={{ marginTop: 1 }}
        />
        <View className="ml-2 flex-1">
          {sentences.map((sentence, index) => (
            <Text
              key={index}
              style={{ color: tokens.color.text.secondary }}
              className={`text-[11px] font-semibold leading-relaxed ${index > 0 ? 'mt-1' : ''}`}
            >
              {sentence}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * A single community metric with its provenance attached.
 *
 * The component that makes §29 hold in practice: a screen receiving a
 * `CommunityMetric` cannot render the number without also rendering where it came
 * from, because the value is inside a `Sourced<number>` envelope.
 *
 * A member count that came from the development adapter is marked `Estimate`; an
 * event count genuinely derived from `GET /community-life/events` is not. On the
 * same screen, side by side — which is the whole point.
 */
export function CommunityMetricFigure({
  metric,
  size = 'md',
}: {
  metric: CommunityMetric;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { tokens } = useTheme();
  const isSimulated = metric.value.source === 'simulated';

  const textSize = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-xl' : 'text-base';
  const shown = metric.displayValue ?? String(metric.value.value);

  const change = metric.changePercent;
  const changeLabel = change
    ? `${change.value >= 0 ? 'up' : 'down'} ${Math.abs(change.value)} percent`
    : null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        `${metric.label}: ${shown}${metric.unit ? ` ${metric.unit}` : ''}`,
        changeLabel,
        isSimulated ? 'This is a development estimate, not a real measurement.' : null,
        metric.isRestricted ? 'Only visible to this community’s moderators.' : null,
      ]
        .filter(Boolean)
        .join('. ')}
      testID={`community-metric-${metric.key}`}
    >
      <View className="flex-row items-baseline flex-wrap">
        <Text style={{ color: tokens.color.text.primary }} className={`${textSize} font-black`}>
          {shown}
        </Text>

        {metric.unit ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-bold ml-0.5"
          >
            {metric.unit}
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

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
      >
        {metric.label}
      </Text>

      {change ? (
        <Text
          style={{
            color: change.value >= 0 ? tokens.color.success.default : tokens.color.text.secondary,
          }}
          className="text-[10px] font-bold mt-0.5"
        >
          {change.value >= 0 ? '▲' : '▼'} {Math.abs(change.value)}%
          {change.source === 'simulated' ? ' (estimate)' : ''}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * When a figure was computed, by whom, and what it cannot tell you.
 *
 * §29 requires the source, the date and the period next to a community
 * statistic. The limitations are rendered **verbatim and in full** — not
 * truncated, not behind a "read more", not summarised — because the limitation
 * that matters most here is the one saying a count is matched by country of
 * origin rather than by a declared community, and abbreviating it away would
 * leave a member believing the number means something it does not.
 */
export function CommunityFreshnessNote({
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
    freshness.sourceName,
    computed ? `updated ${computed}` : '',
    typeof freshness.sampleSize === 'number' ? `from ${freshness.sampleSize} data points` : '',
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
      testID="community-freshness-note"
    >
      <View className="flex-row items-center flex-wrap">
        <Ionicons name="time-outline" size={11} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold ml-1 flex-1"
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
 * The qualifier beside a community badge on a content card.
 *
 * GAP-009. A badge whose basis is `declared` is a fact and needs no qualifier. A
 * badge whose basis is `origin` or `location` is an inference, and this is what
 * says so — inline, in a form small enough that a card can carry it.
 *
 * Renders nothing for `declared`, and nothing for `unknown` (where no badge is
 * drawn at all).
 */
export function CommunityAssociationNote({
  basis,
  compact = false,
}: {
  basis: CommunityAssociationBasis;
  compact?: boolean;
}) {
  const { tokens } = useTheme();

  if (basis === 'declared' || basis === 'unknown') return null;

  const sentence =
    basis === 'origin'
      ? 'Matched by where the person or business came from, not a community they chose.'
      : 'Matched by location, not a community anyone chose.';

  if (compact) {
    return (
      <Text
        accessible
        accessibilityRole="text"
        accessibilityLabel={sentence}
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-bold"
        testID={`community-association-note-${basis}`}
      >
        {basis === 'origin' ? 'matched by origin' : 'matched by location'}
      </Text>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={sentence}
      className="flex-row items-start mt-1"
      testID={`community-association-note-${basis}`}
    >
      <Ionicons name="information-circle-outline" size={11} color={tokens.color.text.placeholder} />
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold leading-relaxed ml-1 flex-1"
      >
        {sentence}
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
export function CommunitySourceBadge({ source }: { source: DataSource }) {
  const { tokens } = useTheme();
  if (source === 'backend') return null;

  return (
    <View
      style={{ backgroundColor: tokens.color.warning.surface }}
      className="px-1.5 py-0.5 rounded self-start"
      accessible
      accessibilityRole="text"
      accessibilityLabel="Development data, not a real community"
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

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;

  const days = Math.floor(minutes / (60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
