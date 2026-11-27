// ─────────────────────────────────────────────────────────────────────────────
// Poll discovery (§22)
//
// The list pages, so the screen is one FlashList (FARCH-004, 27 Nov 2026): the
// filter is drawn above the rows, and the rows are recycled as they scroll
// rather than every page staying mounted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  ChipRow,
  CommunityScreen,
  PollCard,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { ListState } from '@/components/ListState';
import { useMyOrganizations, usePolls } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/platform/community-analytics';
import type { CommunityPoll } from '@/types/community-advanced';

/** One poll. Module-level, so the list keeps a row until its poll changes. */
function renderPoll({ item }: ListRenderItemInfo<CommunityPoll>) {
  return (
    <View className="px-5 mb-3">
      <PollCard
        poll={item}
        onPress={() => router.push(`/community-life/poll/${item.pollId}` as never)}
      />
    </View>
  );
}

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
      availability={{ gapKey: 'polls', isEnabled }}
      load={{ isLoading, error: isError ? error : null, onRetry: refetch, onRefresh: refetch }}
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
      list={{
        data: polls,
        keyExtractor: (poll) => poll.pollId,
        renderItem: renderPoll,
        // The shell draws the list's loading and error; the list says when it is empty.
        ListEmptyComponent: (
          <View className="px-5">
            <ListState
              isEmpty
              empty={{
                icon: 'bar-chart-outline',
                title: state === 'Open' ? 'No polls open' : 'No polls',
                message:
                  state === 'Open'
                    ? 'When a community you belong to asks a question, it will be here.'
                    : 'Nothing has been asked yet.',
                action: canCreate
                  ? { label: 'Ask a question', onPress: () => router.push('/community-life/poll/create') }
                  : undefined,
              }}
            />
          </View>
        ),
        ListFooterComponent: (
          <View className="px-5">
            {hasNextPage && polls.length > 0 ? (
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
        ),
      }}
    >
      <View className="px-5 pt-4 pb-4">
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
    </CommunityScreen>
  );
}
