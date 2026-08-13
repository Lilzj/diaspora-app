/**
 * OnlineIndicator — Shows presence status dot with optional label
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
  const status = presence?.status ?? 'offline';

  const dotSize = size === 'sm' ? 10 : size === 'md' ? 12 : 14;
  const borderWidth = size === 'sm' ? 1.5 : 2;

  const dotColor =
    status === 'online' ? '#16A34A'
    : status === 'away' ? '#D97706'
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
      {showLabel && (
        <Text className="text-xs text-content-muted font-semibold ml-1.5">
          {getStatusLabel(userId)}
        </Text>
      )}
    </View>
  );
}
