// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life gap markers (Frontend Phase 12)
//
// The second of the three mechanisms in `config/community-gaps.ts`: a visible
// marker on every surface with no backend behind it.
//
// It says two different things depending on the build, and both are true:
//
//   In development, it names the missing contract, so a reviewer opening the
//   membership screen knows within a second that nothing there is real.
//
//   In a release build, gap features are unreachable — the API layer refuses
//   before a request is made — so the notice becomes an honest "not available
//   yet" rather than a lie about a preview.
//
// Phase 12 has more genuinely hybrid surfaces than any phase before it, so two
// of the components here do most of the work:
//
//   `<PartlyRealNotice>` marks a screen that is half real — a campaign page
//   showing B15's actual raised total beside a simulated donor trend. Marking
//   the whole page either way would be wrong in both directions.
//
//   `<SourcedValue>` marks a *single field*, driven by the `Sourced<T>`
//   envelope the domain model carries. This is the one that makes §17 hold in
//   practice: a component that receives `campaign.progress.raised` cannot
//   render it without also being handed its provenance.
//
// Deliberately not a wrapper around Phase 5's `<GapNotice>`, Phase 6's
// `<MonetizationGapNotice>` or Phase 7's `<CreatorGapNotice>`: each looks its
// gaps up in its own register, and passing a community gap key into any of them
// returns null and renders nothing. Same visual language, separate registers.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { COMMUNITY_GAPS, areCommunityGapsEnabled } from '@/config/community-gaps';
import type { DataSource, Sourced } from '@/types/community-advanced';

export interface CommunityGapNoticeProps {
  /** A key from `COMMUNITY_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

export function CommunityGapNotice({ gapKey, compact = false, detail }: CommunityGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = COMMUNITY_GAPS[gapKey];
  const isDev = areCommunityGapsEnabled();

  if (!gap) return null;

  // The capability shipped. The register keeps the entry as the historical
  // record; the member does not need to be told about a hole that is filled.
  if (gap.backendStatus === 'connected') return null;


  const body = isDev
    ? (detail ??
      `${gap.title} has no backend behind it yet. This runs on simulated data so the flow can be reviewed and tested — nothing here moves real money, joins a real community or reaches real people.`)
    : `${gap.title} is not something Diaspora can do yet. We will let you know when it arrives.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        isDev
          ? `Development preview. ${gap.title} is not supported by the Diaspora backend yet. ${body}`
          : body
      }
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
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
 * The marker for a surface that is genuinely half real.
 *
 * Takes both halves in words rather than a gap key, because the whole point is
 * that one sentence is not enough. A campaign page says "the amount raised is
 * real; the donor timeline is not", and a member reading that knows exactly how
 * much to trust each figure on the screen.
 */
export function PartlyRealNotice({
  gapKey,
  realPart,
  simulatedPart,
}: {
  gapKey: string;
  realPart: string;
  simulatedPart: string;
}) {
  const { tokens } = useTheme();
  const gap = COMMUNITY_GAPS[gapKey];
  const isDev = areCommunityGapsEnabled();

  if (!isDev || !gap) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Partly connected. Real: ${realPart}. Simulated: ${simulatedPart}.`}
      style={{
        backgroundColor: tokens.color.info.surface,
        borderColor: `${tokens.color.info.default}44`,
      }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-center mb-2">
        <Ionicons name="git-merge-outline" size={16} color={tokens.color.info.default} />
        <Text
          style={{ color: tokens.color.info.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Partly connected
        </Text>
      </View>

      <View className="flex-row items-start mb-1.5">
        <Ionicons
          name="checkmark-circle"
          size={13}
          color={tokens.color.success.default}
          style={{ marginTop: 1.5 }}
        />
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-semibold leading-relaxed ml-1.5 flex-1"
        >
          <Text className="font-black">Real: </Text>
          {realPart}
        </Text>
      </View>

      <View className="flex-row items-start">
        <Ionicons name="flask" size={13} color={tokens.color.warning.default} style={{ marginTop: 1.5 }} />
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-semibold leading-relaxed ml-1.5 flex-1"
        >
          <Text className="font-black">Simulated: </Text>
          {simulatedPart}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-bold mt-2.5 leading-relaxed"
      >
        {gap.id} · needs {gap.missingContract[0]}
      </Text>
    </View>
  );
}

/**
 * The inline marker for a single simulated figure.
 *
 * A campaign page is mostly real — the raised total, the target, the supporter
 * count — with a simulated trend beside it. A full notice above the whole
 * screen would mark the real parts as fake; this marks only the figure.
 */
export function SimulatedFigure({ label = 'Simulated' }: { label?: string }) {
  const { tokens } = useTheme();
  if (!areCommunityGapsEnabled()) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}. This figure is not from the Diaspora backend.`}
      style={{ backgroundColor: tokens.color.warning.surface }}
      className="flex-row items-center self-start rounded-full px-2 py-0.5"
    >
      <Ionicons name="flask-outline" size={10} color={tokens.color.warning.default} />
      <Text
        style={{ color: tokens.color.warning.default }}
        className="text-[9px] font-black uppercase tracking-widest ml-1"
      >
        {label}
      </Text>
    </View>
  );
}

/** The counterpart, for a figure that genuinely came from a certified backend. */
export function VerifiedFigure({ label = 'Verified' }: { label?: string }) {
  const { tokens } = useTheme();
  if (!areCommunityGapsEnabled()) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}. This figure comes from the Diaspora platform.`}
      style={{ backgroundColor: tokens.color.success.surface }}
      className="flex-row items-center self-start rounded-full px-2 py-0.5"
    >
      <Ionicons name="shield-checkmark-outline" size={10} color={tokens.color.success.default} />
      <Text
        style={{ color: tokens.color.success.default }}
        className="text-[9px] font-black uppercase tracking-widest ml-1"
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Renders a `Sourced<T>` with the right marker beside it.
 *
 * This is the component that makes §17 structurally true rather than a
 * convention. A screen cannot get at `campaign.progress.raised.value` through
 * this component without the `source` travelling with it, so a real B15 figure
 * and a simulated one cannot be printed identically by accident.
 *
 * Both markers disappear in a release build, where nothing is simulated and the
 * distinction has nothing to describe.
 */
export function SourcedValue<T>({
  sourced,
  children,
  simulatedLabel = 'Simulated',
  verifiedLabel = 'Verified',
  showVerified = false,
}: {
  sourced: Sourced<T>;
  children: (value: T, source: DataSource) => React.ReactNode;
  simulatedLabel?: string;
  verifiedLabel?: string;
  /** Off by default — most screens only need to mark what is *not* real. */
  showVerified?: boolean;
}) {
  return (
    <View>
      {children(sourced.value, sourced.source)}
      {sourced.source === 'simulated' ? (
        <View className="mt-1">
          <SimulatedFigure label={simulatedLabel} />
        </View>
      ) : showVerified ? (
        <View className="mt-1">
          <VerifiedFigure label={verifiedLabel} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * What a release build shows where a gap-backed screen would have been.
 *
 * Not an error, and not a spinner that never resolves. A member on a production
 * binary gets a clear statement that the capability does not exist yet, which
 * is the honest thing and also the thing that does not generate a support
 * ticket.
 */
export function CommunityGapUnavailable({ gapKey }: { gapKey: string }) {
  const { tokens } = useTheme();
  const gap = COMMUNITY_GAPS[gapKey];

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
      >
        <Ionicons name="construct-outline" size={26} color={tokens.color.text.placeholder} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight text-center"
        accessibilityRole="header"
      >
        {gap?.title ?? 'Not available yet'}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-semibold text-center mt-2 leading-relaxed"
      >
        Diaspora cannot do this yet. We will let you know as soon as it arrives.
      </Text>
    </View>
  );
}

/**
 * The note a screen shows where a figure updates on a timer rather than live.
 *
 * COMMUNITY-LIFE-GAP-020: B13.2's realtime transport carries conversations
 * only, so campaign progress and poll results are refetched periodically. A
 * screen that implied a live feed would be overstating what the platform does,
 * and a member watching a fundraiser deserves to know the number is a minute
 * old rather than a second old.
 */
export function PeriodicUpdateNote({ what = 'This figure' }: { what?: string }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center mt-1.5" accessible accessibilityRole="text">
      <Ionicons name="time-outline" size={11} color={tokens.color.text.placeholder} />
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold ml-1"
      >
        {what} updates every 30 seconds, not instantly.
      </Text>
    </View>
  );
}
