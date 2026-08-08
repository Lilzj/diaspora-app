/**
 * ConversationHeader — Top bar for the conversation screen
 */

import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnlineIndicator } from './OnlineIndicator';
import { usePresenceStore } from '@/store/presence';
import type { Conversation } from '@/types/conversation';

interface Props {
  conversation: Conversation;
  onInfoPress?: () => void;
  onMorePress?: () => void;
}

export function ConversationHeader({ conversation, onInfoPress, onMorePress }: Props) {
  const insets = useSafeAreaInsets();
  const other = conversation.participants.find((p) => !p.isCurrentUser);
  const { getStatusLabel } = usePresenceStore();

  const initials = other?.displayName
    ? other.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : '?';

  return (
    <View
      className="bg-white border-b border-neutral-100 flex-row items-center px-4"
      style={{
        paddingTop: Platform.OS === 'ios' ? insets.top + 8 : 12,
        paddingBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 3,
      }}
    >
      {/* Back */}
      <TouchableOpacity
        onPress={() => router.back()}
        className="w-10 h-10 items-center justify-center rounded-full bg-neutral-50 border border-neutral-200 mr-3"
        activeOpacity={0.7}
      >
        <Text className="text-neutral-700 text-lg">←</Text>
      </TouchableOpacity>

      {/* Avatar + presence */}
      <TouchableOpacity onPress={onInfoPress} activeOpacity={0.8} className="relative mr-3">
        <View className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 items-center justify-center overflow-hidden">
          {other?.avatarUrl ? (
            <Image source={{ uri: other.avatarUrl }} style={{ width: 40, height: 40 }} contentFit="cover" />
          ) : (
            <Text className="text-sm font-black text-amber-700">{initials}</Text>
          )}
        </View>
        {other && (
          <View className="absolute bottom-0 right-0">
            <OnlineIndicator userId={other.userId} size="sm" />
          </View>
        )}
      </TouchableOpacity>

      {/* Name + status */}
      <TouchableOpacity onPress={onInfoPress} activeOpacity={0.8} className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-bold text-neutral-900 mr-1.5" numberOfLines={1}>
            {other?.displayName || 'Unknown'}
          </Text>
          {other?.trust.isVerified && (
            <View className="bg-teal-50 border border-teal-200 rounded px-1 py-0.5">
              <Text className="text-[8px] font-black text-teal-700">✓ VERIFIED</Text>
            </View>
          )}
        </View>
        {other && (
          <View className="flex-row items-center mt-0.5">
            <OnlineIndicator userId={other.userId} size="sm" showLabel />
          </View>
        )}
      </TouchableOpacity>

      {/* Actions */}
      <TouchableOpacity
        onPress={onMorePress}
        className="w-10 h-10 items-center justify-center"
        activeOpacity={0.7}
      >
        <Text className="text-neutral-600 text-xl">⋮</Text>
      </TouchableOpacity>
    </View>
  );
}
