// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community statistics (Frontend Phase 13, §29)
//
// §29's requirements, each visible on this screen:
//
//   Loading, Data unavailable, freshness, period and scope are all explicit. The
//   period is a control rather than a caption, so a member can check whether a
//   figure holds over a longer window — which is the question a surprising number
//   invites.
//
//   Metrics are grouped by provenance. The counts genuinely derived from certified
//   routes come first and are unmarked; the member counts, growth and engagement
//   figures come second under an "Estimates" heading and each carries its own
//   marker. A member reading this screen can tell, without being told, which
//   figures a real backend would already be able to serve.
//
//   The restricted metric is present only when the *server* said this caller may
//   see it. It is omitted from the response otherwise — not nulled — so this screen
//   has no code path that could reveal that a private metric exists.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { StatisticsPeriod } from '@/types/community-directory';
import { useCommunity, useCommunityStatistics } from '@/hooks/communities';
import { useConnectivityStore } from '@/lib/connectivity';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useBottomInset } from '@/components/layout/bottom-inset';
import {
  CommunityAvatar,
  CommunityStatisticsPanel,
  CommunityUnavailablePanel,
  MultiCommunityGapNotice,
  StatisticsPeriodSelector,
  communityOriginLabel,
} from '@/components/community-directory';

export default function CommunityStatisticsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const isOnline = useConnectivityStore((s) => s.isOnline);

  const [period, setPeriod] = useState<StatisticsPeriod>('30d');

  const community = useCommunity(slug);
  const statistics = useCommunityStatistics(community.data?.id, period);

  React.useEffect(() => {
    if (community.data) {
      trackCommunityEvent('community.statistics.viewed', {
        communityId: community.data.id,
        period,
      });
    }
  }, [community.data, period]);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
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
          >
            In numbers
          </Text>
          {community.data ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
              numberOfLines={1}
            >
              {community.data.name} · {communityOriginLabel(community.data)}
            </Text>
          ) : null}
        </View>

        {/* Frontend Phase 15. The same figures over time — trends, comparison
            baselines and drill-down, which this snapshot shape has no room for.
            One request feeds both screens through `lib/analytics/adapters.ts`, so
            the member count here and there is the same number. */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="See how these figures changed over time"
          onPress={() =>
            router.push(
              community.data?.id ? `/analytics/community/${community.data.id}` : '/analytics'
            )
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginRight: 14 }}
        >
          <Ionicons name="trending-up-outline" size={20} color={tokens.color.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Compare with other communities"
          onPress={() => router.push('/community/compare')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="git-compare-outline" size={20} color={tokens.color.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}>
        <View className="mb-4">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-2"
          >
            Period
          </Text>
          <StatisticsPeriodSelector value={period} onChange={setPeriod} />
        </View>

        {statistics.isSimulated ? (
          <View className="mb-4">
            <MultiCommunityGapNotice
              gapKey="communityStatistics"
              detail="Diaspora has no way to count a community’s members yet, because there is no record of community membership on the platform. The content counts below are real — they come from what is published right now. The member, growth and engagement figures are development estimates and are marked."
            />
          </View>
        ) : null}

        {statistics.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject="these figures" />
        ) : statistics.unavailable ? (
          <CommunityUnavailablePanel
            reason={isOnline ? statistics.unavailable : 'offline'}
            subject="this community’s figures"
            gapKey="communityStatistics"
            onAction={() => void statistics.refetch()}
          />
        ) : statistics.data ? (
          <CommunityStatisticsPanel statistics={statistics.data} />
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
