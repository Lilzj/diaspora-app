// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial status badge (Frontend Phase 5)
//
// One badge for every financial state on the platform. It takes a
// `StatusPresentation` rather than a raw string, so a screen cannot invent a
// label, and it always renders three things together: an icon, a word, and a
// colour. Any two of the three would be enough for most people; all three is
// what §28 requires, because the colour alone is invisible to a large minority
// and the icon alone is ambiguous.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { StatusPresentation, StatusTone } from '@/lib/financial-status';

interface StatusBadgeProps {
  status: StatusPresentation;
  size?: 'sm' | 'md';
  /** Hides the icon where the row already carries one. Rare. */
  iconless?: boolean;
}

export function useStatusColours(tone: StatusTone) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  switch (tone) {
    case 'positive':
      return { foreground: tokens.color.success.default, background: tokens.color.success.surface };
    case 'negative':
      return { foreground: tokens.color.error.default, background: tokens.color.error.surface };
    case 'warning':
      return { foreground: tokens.color.warning.default, background: tokens.color.warning.surface };
    case 'pending':
      return { foreground: tokens.color.info.default, background: tokens.color.info.surface };
    default:
      return {
        foreground: tokens.color.text.secondary,
        background: isDark ? tokens.color.surface.elevated : tokens.color.neutral[100],
      };
  }
}

export function StatusBadge({ status, size = 'md', iconless = false }: StatusBadgeProps) {
  const { foreground, background } = useStatusColours(status.tone);

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <View
      accessible
      // The presentation's `description` is a full sentence — "Paid. The payment
      // completed successfully." — which is what somebody who cannot see the
      // colour needs, rather than the single word the badge shows.
      accessibilityLabel={status.description}
      accessibilityRole="text"
      style={{ backgroundColor: background }}
      className={`flex-row items-center self-start rounded-full ${
        size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
      }`}
    >
      {!iconless ? (
        <Ionicons
          name={status.icon as never}
          size={iconSize}
          color={foreground}
          style={{ marginRight: 4 }}
        />
      ) : null}
      <Text
        style={{ color: foreground }}
        className={`font-bold uppercase tracking-wider ${size === 'sm' ? 'text-[10px]' : 'text-[11px]'}`}
      >
        {status.label}
      </Text>
    </View>
  );
}

/**
 * A larger, quieter variant for the top of a detail screen, where the status is
 * the headline rather than a chip in a list.
 */
export function StatusBanner({
  status,
  detail,
}: {
  status: StatusPresentation;
  detail?: string | null;
}) {
  const { foreground, background } = useStatusColours(status.tone);
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={detail ? `${status.description} ${detail}` : status.description}
      style={{ backgroundColor: background }}
      className="flex-row items-start rounded-2xl p-4"
    >
      <Ionicons name={status.icon as never} size={22} color={foreground} style={{ marginRight: 12 }} />
      <View className="flex-1">
        <Text style={{ color: foreground }} className="text-sm font-black tracking-tight">
          {status.label}
        </Text>
        {detail ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium mt-1 leading-relaxed"
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
