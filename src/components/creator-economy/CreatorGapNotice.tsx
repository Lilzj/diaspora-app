// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator gap markers (Frontend Phase 7)
//
// The second of the three mechanisms in `config/creator-gaps.ts`: a visible
// marker on every surface with no backend behind it.
//
// It says two different things depending on the build, and both are true:
//
//   In development, it names the missing contract, so a reviewer opening the
//   grants screen knows within a second that nothing there is real.
//
//   In a release build, gap features are unreachable — the API layer refuses
//   before a request is made — so the notice becomes an honest "not available
//   yet" rather than a lie about a preview.
//
// A third component exists here that Phases 5 and 6 did not need:
// `<PartiallyRealNotice>`. The creator economy has two genuinely hybrid
// surfaces — the revenue dashboard reads a real B15 balance and simulates the
// attribution, and sponsored content shows real B15 placements with a simulated
// approval state. Marking either of those wholesale would be wrong in both
// directions, so the hybrid notice names which half is which.
//
// Deliberately not a wrapper around Phase 5's `<GapNotice>` or Phase 6's
// `<MonetizationGapNotice>`: each looks its gaps up in its own register, and
// passing a creator gap key into either returns null and renders nothing.
// Same visual language, separate registers.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { CREATOR_GAPS, areCreatorGapsEnabled } from '@/config/creator-gaps';

export interface CreatorGapNoticeProps {
  /** A key from `CREATOR_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

export function CreatorGapNotice({ gapKey, compact = false, detail }: CreatorGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = CREATOR_GAPS[gapKey];
  const isDev = areCreatorGapsEnabled();

  if (!gap) return null;

  const body = isDev
    ? (detail ??
      `${gap.title} has no backend behind it yet. This runs on simulated data so the flow can be reviewed and tested — nothing here moves real money, awards real points or reaches real people.`)
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

      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
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
 * that one sentence is not enough. The revenue dashboard says "your balance is
 * real; where it came from is not", and a member reading that knows exactly how
 * much to trust each figure on the screen.
 */
export function PartiallyRealNotice({
  gapKey,
  realPart,
  simulatedPart,
}: {
  gapKey: string;
  realPart: string;
  simulatedPart: string;
}) {
  const { tokens } = useTheme();
  const gap = CREATOR_GAPS[gapKey];
  const isDev = areCreatorGapsEnabled();

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
 * The inline version, for a single figure inside an otherwise real screen.
 *
 * A revenue screen is mostly real — the balance, the transactions, what was
 * paid — with one simulated column. A full notice above the whole screen would
 * mark the real parts as fake; this marks only the figure.
 */
export function SimulatedFigure({ label = 'Simulated' }: { label?: string }) {
  const { tokens } = useTheme();
  if (!areCreatorGapsEnabled()) return null;

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

/**
 * What a release build shows where a gap-backed screen would have been.
 *
 * Not an error, and not a spinner that never resolves. A member on a production
 * binary gets a clear statement that the capability does not exist yet, which
 * is the honest thing and also the thing that does not generate a support
 * ticket.
 */
export function CreatorGapUnavailable({ gapKey }: { gapKey: string }) {
  const { tokens } = useTheme();
  const gap = CREATOR_GAPS[gapKey];

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
