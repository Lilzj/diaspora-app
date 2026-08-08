// ─────────────────────────────────────────────────────────────────────────────
// Poll discovery (§22)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  ChipRow,
  CommunityScreen,
  EmptyState,
  PollCard,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { useMyOrganizations, usePolls } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';

export default function PollListScreen() {
  const { tokens } = useTheme();
  const [state, setState] = useState<'Open' | 'Closed' | ''>('Open');

  const { data: organizations } = useMyOrganizations();
  const canCreate = organizations.length > 0;

  useEffect(() => {
    trackCommunityEvent('community.life.viewed', { surface: 'polls' });
  }, []);

  const params = useMemo(() => ({ state: state || undefined }), [state]);

  const {
    polls,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isEnabled,
  } = usePolls(params);

  return (
    <CommunityScreen
      title="Community polls"
      subtitle="What your community is deciding"
      gapKey="polls"
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      headerRight={
        canCreate ? (
          <Ionicons
            name="add"
            size={24}
            color={tokens.color.primary[500]}
            accessibilityRole="button"
            accessibilityLabel="Create a poll"
            style={{ marginRight: 12 }}
            onPress={() => router.push('/community-life/poll/create')}
          />
        ) : undefined
      }
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="Filter polls"
          options={[
            { value: 'Open' as const, label: 'Open now' },
            { value: 'Closed' as const, label: 'Closed' },
            { value: '' as const, label: 'All' },
          ]}
          value={state}
          onChange={setState}
        />
      </View>

      <View className="px-5 mt-4">
        {polls.length === 0 && !isLoading ? (
          <EmptyState
            icon="bar-chart-outline"
            title={state === 'Open' ? 'No polls open' : 'No polls'}
            body={
              state === 'Open'
                ? 'When a community you belong to asks a question, it will be here.'
                : 'Nothing has been asked yet.'
            }
            action={canCreate ? 'Ask a question' : undefined}
            onAction={() => router.push('/community-life/poll/create')}
          />
        ) : (
          polls.map((poll) => (
            <View key={poll.pollId} className="mb-3">
              <PollCard
                poll={poll}
                onPress={() => router.push(`/community-life/poll/${poll.pollId}` as never)}
              />
            </View>
          ))
        )}

        {hasNextPage ? (
          <View className="mb-4">
            {isFetchingNextPage ? (
              <View className="py-4 items-center" accessibilityLabel="Loading more">
                <ActivityIndicator size="small" color={tokens.color.primary[500]} />
              </View>
            ) : (
              <SecondaryButton label="Show more" onPress={() => void fetchNextPage()} />
            )}
          </View>
        ) : null}

        {canCreate && polls.length > 0 ? (
          <View className="mt-2">
            <PrimaryButton
              label="Ask your community something"
              icon="add"
              onPress={() => router.push('/community-life/poll/create')}
            />
          </View>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
