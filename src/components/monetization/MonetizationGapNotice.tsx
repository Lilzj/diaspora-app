// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization gap markers (Frontend Phase 6)
//
// The second of the three mechanisms in `config/monetization-gaps.ts`: a visible
// marker on every surface with no backend behind it.
//
// It says two different things depending on the build, and both are true:
//
//   In development, it names the missing contract, so a reviewer opening the
//   campaign dashboard knows within a second that nothing there is real.
//
//   In a release build, gap features are unreachable — the API layer refuses
//   before a request is made — so the notice becomes an honest "not available
//   yet" rather than a lie about a preview.
//
// Deliberately not a wrapper around Phase 5's `<GapNotice>`: that component
// looks its gaps up in `BACKEND_GAPS`, and passing a monetization gap key into
// it would return null and render nothing at all. Same visual language, separate
// register.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { MONETIZATION_GAPS, areMonetizationGapsEnabled } from '@/config/monetization-gaps';

export interface MonetizationGapNoticeProps {
  /** A key from `MONETIZATION_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

export function MonetizationGapNotice({ gapKey, compact = false, detail }: MonetizationGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = MONETIZATION_GAPS[gapKey];
  const isDev = areMonetizationGapsEnabled();

  if (!gap) return null;

  // The capability shipped. The register keeps the entry as the historical
  // record; the member does not need to be told about a hole that is filled.
  if (gap.backendStatus === 'connected') return null;


  const body = isDev
    ? (detail ??
      `${gap.title} has no backend behind it yet. This runs on simulated data so the flow can be reviewed and tested — nothing here moves real money or reaches real people.`)
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
 * The inline version, for a single figure inside an otherwise real screen.
 *
 * A promotion detail screen is mostly real — the placement, its dates, what was
 * paid — with one simulated panel. A full notice above the whole screen would
 * mark the real parts as fake; this marks only the panel.
 */
export function SimulatedFigureBadge({ label = 'Simulated' }: { label?: string }) {
  const { tokens } = useTheme();
  if (!areMonetizationGapsEnabled()) return null;

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
