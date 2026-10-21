// Diaspora Platform — /community/[slug]/events (§21, §53)
//
// Since 21 Oct 2026 an event can be posted *in* a community, so this list is
// exact: `GET /community-life/events?communityId=`. It no longer goes through
// `CommunityContentScreen`'s country-of-origin projection, which could not
// assemble events for a community covering more than one country at all.

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { useCommunity } from '@/hooks/communities';
import {
  CommunityAvatar,
  CommunityEventsSection,
  CommunityUnavailablePanel,
} from '@/components/community-directory';
import { backOr } from '@/lib/navigation';

export default function CommunityEventsRoute() {
  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const community = useCommunity(slug);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>

        {community.data ? <CommunityAvatar community={community.data} size={28} /> : null}

        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black"
            numberOfLines={1}
          >
            Events
          </Text>
          {community.data ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
              numberOfLines={1}
            >
              Posted in {community.data.name}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingTop: 8 }}>
        {community.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject="events" />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject="events"
            detail={community.data?.statusReason}
            gapKey="communityProfile"
            onAction={
              community.unavailable === 'not-found'
                ? () => router.replace('/community')
                : () => void community.refetch()
            }
          />
        ) : (
          <CommunityEventsSection
            communityId={community.data?.id}
            communityName={community.data?.name}
            limit={50}
            hideHeading
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
