// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Challenge discovery (Frontend Phase 7, §23)
//
// Three tabs — active, open, finished — because that is how somebody thinks
// about challenges, and because the grouping is done server-side rather than by
// filtering a full list on the device. The `state` parameter carries the group
// name and the adapter expands it; a client that fetched everything and
// filtered would be loading a dataset it does not need, which §39 forbids.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  ChallengeCard,
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
} from '@/components/creator-economy';
import { useCreatorAccess, useCreatorChallenges } from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorChallenge } from '@/types/creator-economy';

type Group = 'active' | 'open' | 'finished';

const GROUPS: { key: Group; label: string; empty: string }[] = [
  {
    key: 'active',
    label: 'Yours',
    empty: 'You have not joined a challenge yet. Have a look at what is open.',
  },
  {
    key: 'open',
    label: 'Open',
    empty: 'Nothing open right now. Diaspora runs new challenges regularly.',
  },
  {
    key: 'finished',
    label: 'Finished',
    empty: 'Challenges you finish or miss will be listed here.',
  },
];

export default function CreatorChallengesScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [group, setGroup] = useState<Group>('active');
  const [isRefreshing, setRefreshing] = useState(false);

  const query = useCreatorChallenges(group);
  const access = useCreatorAccess();

  useEffect(() => {
    trackCreatorEvent('creator.challenges.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  const open = useCallback((challenge: CreatorChallenge) => {
    trackCreatorEvent('creator.challenge.viewed', { challengeId: challenge.challengeId });
    router.push(`/creator/challenges/${challenge.challengeId}` as never);
  }, []);

  const active = GROUPS.find((item) => item.key === group)!;

  return (
    <CreatorScreen
      title="Challenges"
      subtitle="Time-limited goals with rewards attached"
      gapKey="challenges"
      isEnabled={query.isEnabled}
      refusal={refusal}
      error={query.error}
      onRetry={query.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <View
            style={{ backgroundColor: tokens.color.surface.background }}
            className="flex-row rounded-2xl p-1"
            accessibilityRole="tablist"
          >
            {GROUPS.map((item) => {
              const isActive = group === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${item.label} challenges`}
                  onPress={() => setGroup(item.key)}
                  style={{ backgroundColor: isActive ? tokens.color.primary[500] : 'transparent' }}
                  className="flex-1 rounded-xl py-2.5 items-center"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
    >
      <View className="px-5 pt-5">
        {query.isLoading ? (
          <CreatorCardSkeleton rows={3} />
        ) : query.challenges.length === 0 ? (
          <CreatorEmptyState
            icon="flag-outline"
            title="Nothing here"
            body={active.empty}
            actionLabel={group !== 'open' ? 'See what is open' : undefined}
            onAction={group !== 'open' ? () => setGroup('open') : undefined}
          />
        ) : (
          query.challenges.map((challenge) => (
            <ChallengeCard key={challenge.challengeId} challenge={challenge} onPress={open} />
          ))
        )}

        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold text-center mt-3 mb-4 leading-relaxed"
        >
          Progress is counted by Diaspora. Joining a challenge does not change anything you already
          published.
        </Text>
      </View>
    </CreatorScreen>
  );
}
