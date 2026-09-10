// ─────────────────────────────────────────────────────────────────────────────
// Fundraising — discovery (§14)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  CampaignCard,
  ChipRow,
  CommunityScreen,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { useCampaigns, useCommunityAccess } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { CampaignCategory } from '@/types/community-advanced';

const CATEGORIES: { value: CampaignCategory | ''; label: string }[] = [
  { value: '', label: 'All causes' },
  { value: 'Medical', label: 'Medical' },
  { value: 'Education', label: 'Education' },
  { value: 'Emergency', label: 'Emergency' },
  { value: 'Funeral', label: 'Funeral' },
  { value: 'Repatriation', label: 'Repatriation' },
  { value: 'Community Project', label: 'Community' },
  { value: 'Legal Support', label: 'Legal' },
  { value: 'Religious', label: 'Religious' },
  { value: 'Disaster Relief', label: 'Disaster relief' },
];

export default function CampaignListScreen() {
  const { tokens } = useTheme();
  const access = useCommunityAccess();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CampaignCategory | ''>('');

  /**
   * Whose campaigns.
   *
   * **An organiser had no way to find their own.** `mine=true` is a real filter
   * on the search route, `fetchMyCampaigns` wraps it and `useMyCampaigns` calls
   * that — and no screen in the application called either, so somebody who had
   * just published a campaign had to look for it in the public browse list
   * along with everybody else's, and reported it as missing.
   *
   * It reuses the same paged query rather than the array-returning helper, so
   * "yours" pages exactly like "everyone's" instead of silently stopping at the
   * first page.
   */
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    trackCommunityEvent('community.life.viewed', { surface: 'campaigns' });
  }, []);

  const params = useMemo(
    () => ({
      query: query.trim() || undefined,
      category: category || undefined,
      mine: mineOnly || undefined,
    }),
    [query, category, mineOnly]
  );

  const {
    campaigns,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useCampaigns(params);

  return (
    <CommunityScreen
      title="Fundraising"
      subtitle="Campaigns your community is running"
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      headerRight={
        access.canCreateCampaign ? (
          <Ionicons
            name="add"
            size={24}
            color={tokens.color.primary[500]}
            accessibilityRole="button"
            accessibilityLabel="Start a campaign"
            style={{ marginRight: 12 }}
            onPress={() => router.push('/community-life/campaign/create')}
          />
        ) : undefined
      }
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <View
            style={{
              backgroundColor: tokens.color.surface.elevated,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-full border px-4"
          >
            <Ionicons name="search" size={16} color={tokens.color.text.placeholder} />
            <TextInput
              accessibilityLabel="Search fundraising campaigns"
              value={query}
              onChangeText={setQuery}
              placeholder="Search campaigns"
              placeholderTextColor={tokens.color.text.placeholder}
              returnKeyType="search"
              style={{ color: tokens.color.text.primary, minHeight: 44 }}
              className="flex-1 ml-2 text-sm font-semibold"
            />
          </View>
        </View>
      }
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="Whose campaigns"
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'mine', label: 'Yours' },
          ]}
          value={mineOnly ? 'mine' : 'all'}
          onChange={(value) => setMineOnly(value === 'mine')}
        />
        <View className="h-2" />
        <ChipRow
          accessibilityLabel="Filter by cause"
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
        />
      </View>

      <View className="px-5 mt-4">
        {campaigns.length === 0 && !isLoading ? (
          <EmptyState
            icon="heart-outline"
            title={mineOnly ? 'You have not started a campaign' : 'No campaigns running'}
            body={
              mineOnly
                ? 'Campaigns you organise appear here, drafts included, from the moment you create one.'
                : query || category
                  ? 'Nothing matches those filters right now.'
                  : 'When somebody in your community raises money for something, it will be here.'
            }
            action={access.canCreateCampaign ? 'Start a campaign' : undefined}
            onAction={() => router.push('/community-life/campaign/create')}
          />
        ) : (
          campaigns.map((campaign) => (
            <View key={campaign.campaignId} className="mb-4">
              <CampaignCard
                campaign={campaign}
                onPress={() => router.push(`/community-life/campaign/${campaign.campaignId}` as never)}
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

        {access.canCreateCampaign && campaigns.length > 0 ? (
          <View className="mt-2">
            <PrimaryButton
              label="Start a campaign"
              icon="add"
              onPress={() => router.push('/community-life/campaign/create')}
            />
          </View>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
