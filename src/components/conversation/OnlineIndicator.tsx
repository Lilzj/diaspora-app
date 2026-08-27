/**
 * OnlineIndicator — Shows presence status dot with optional label
 *
 * ── It used to claim "offline" when it knew nothing ─────────────────────────
 *
 * `const status = presence?.status ?? 'offline'` turned an absent entry into a
 * grey dot, and a grey dot is a statement: *this person is not here*. The
 * platform had said no such thing.
 *
 * Absence has two causes and neither is offline. The member may simply not have
 * been seen yet — presence arrives over the hub as it changes, so a conversation
 * opened before the first `PresenceChanged` has no entry. Or this deployment may
 * not serve presence at all: `RealtimeHandshake.PresenceEnabled` gates it, and
 * with the flag off `realtime.ts` never dispatches, so the store stays empty for
 * ever and every contact would have read as offline permanently.
 *
 * Rendering nothing is the honest answer to a question nobody answered. §48.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { usePresenceStore } from '@/store/presence';
import { useThemeTokens } from '@/design-system';

interface Props {
  userId: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function OnlineIndicator({ userId, size = 'md', showLabel = false }: Props) {
  const tokens = useThemeTokens();
  const { getPresence, getStatusLabel } = usePresenceStore();
  const presence = getPresence(userId);

  // No entry, no dot. The caller lays this out as an optional adornment, so
  // returning null collapses it rather than leaving a hole — and a hole is
  // better than a false claim in any case.
  if (!presence) return null;

  const label = getStatusLabel(userId);

  const dotSize = size === 'sm' ? 10 : size === 'md' ? 12 : 14;
  const borderWidth = size === 'sm' ? 1.5 : 2;

  const dotColor =
    presence.status === 'online' ? '#16A34A'
    : presence.status === 'away' ? '#D97706'
    : '#9BA3B8';

  return (
    <View className="flex-row items-center">
      <View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: dotColor,
          borderWidth,
          borderColor: tokens.color.surface.card,
        }}
      />
      {showLabel && label ? (
        <Text className="text-xs text-content-muted font-semibold ml-1.5">{label}</Text>
      ) : null}
    </View>
  );
}
