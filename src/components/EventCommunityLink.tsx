// The community an event was posted in ("Post in community", 21 Oct 2026).
//
// `EventResponse.communityId` carries only the id, so the name and slug come
// from the community directory the app already holds. A community this member
// cannot see in it is still named as "a community" rather than hidden — the
// event says where it was posted, it just cannot open a page it cannot read.

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAvailableCommunities } from '@/hooks/communities';
import { useThemeTokens } from '@/design-system';

export function EventCommunityLink({ communityId }: { communityId: string | null | undefined }) {
  const tokens = useThemeTokens();
  const { lookup } = useAvailableCommunities();

  if (!communityId) return null;

  const community = lookup(communityId);
  const name = community?.name?.trim() || 'a community';
  const slug = community?.slug ?? null;

  return (
    <View className="bg-surface-card px-6 py-4 border-b border-faint mb-3">
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">
        Posted in
      </Text>
      <TouchableOpacity
        accessibilityRole={slug ? 'link' : 'text'}
        accessibilityLabel={`Posted in ${name}`}
        disabled={!slug}
        onPress={() => slug && router.push(`/community/${slug}` as never)}
        className="flex-row items-center"
        activeOpacity={0.8}
      >
        <Ionicons name="people-outline" size={18} color={tokens.color.text.secondary} />
        <Text className="text-sm font-black text-content-primary ml-2 flex-1" numberOfLines={1}>
          {community ? name : 'A community'}
        </Text>
        {slug ? (
          <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}
