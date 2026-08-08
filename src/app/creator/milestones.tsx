// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator milestones (Frontend Phase 7, §22)
//
// One screen, one card component, and no milestone-specific code anywhere.
// §22: "Milestones should be represented as data-driven entities. Do not
// hardcode every milestone directly into UI components."
//
// The ordering is the one interesting decision. `orderMilestones` puts
// claimable ones first, because a completed unclaimed milestone is the only one
// with an action attached and burying it under thirty locked ones is how a
// reward goes unclaimed. Within a group the platform's own `sortOrder` wins —
// the client never sorts by title or by progress.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  MilestoneCard,
} from '@/components/creator-economy';
import { FinancialErrorInline } from '@/components/financial';
import { useClaimMilestone, useCreatorAccess, useCreatorMilestones } from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { orderMilestones } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { FinancialError } from '@/lib/financial-errors';
import type { CreatorMilestone } from '@/types/creator-economy';

export default function CreatorMilestonesScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const query = useCreatorMilestones();
  const claim = useClaimMilestone();
  const access = useCreatorAccess();

  const [category, setCategory] = useState<string>('all');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  useEffect(() => {
    trackCreatorEvent('creator.milestones.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const claimRefusal = checkCreatorAccess(CreatorCapabilities.ClaimReward, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const milestone of query.milestones) {
      if (milestone.category) set.add(milestone.category);
    }
    return ['all', ...Array.from(set)];
  }, [query.milestones]);

  const visible = useMemo(() => {
    const filtered =
      category === 'all'
        ? query.milestones
        : query.milestones.filter((milestone) => milestone.category === category);
    return orderMilestones(filtered);
  }, [category, query.milestones]);

  const claimable = useMemo(
    () => query.milestones.filter((milestone) => milestone.state === 'Completed'),
    [query.milestones]
  );

  const handleClaim = useCallback(
    (milestone: CreatorMilestone) => {
      setClaimingId(milestone.milestoneId);
      trackCreatorEvent('creator.milestone.claimed', { milestoneId: milestone.milestoneId });
      claim.mutate(milestone.milestoneId, { onSettled: () => setClaimingId(null) });
    },
    [claim]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  return (
    <CreatorScreen
      title="Milestones"
      subtitle="What you have achieved, and what is close"
      gapKey="milestones"
      isEnabled={query.isEnabled}
      refusal={refusal}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        categories.length > 2 ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderBottomColor: tokens.color.border.default,
            }}
            className="border-b px-5 py-3"
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              {categories.map((item) => {
                const isActive = category === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={item === 'all' ? 'All milestones' : `${item} milestones`}
                    onPress={() => setCategory(item)}
                    style={{
                      backgroundColor: isActive
                        ? tokens.color.primary[500]
                        : tokens.color.surface.background,
                      borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
                    }}
                    className="rounded-full border px-3.5 py-2 mr-2"
                  >
                    <Text
                      style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                      className="text-[11px] font-black"
                    >
                      {item === 'all' ? 'All' : item}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : undefined
      }
    >
      <View className="px-5 pt-5">
        {claim.isError ? (
          <View className="mb-4">
            <FinancialErrorInline error={claim.error as FinancialError} />
          </View>
        ) : null}

        {claimable.length > 0 ? (
          <View
            accessible
            accessibilityLabel={`${claimable.length} ${claimable.length === 1 ? 'milestone is' : 'milestones are'} ready to claim.`}
            style={{ backgroundColor: tokens.color.success.surface }}
            className="rounded-2xl p-4 mb-5"
          >
            <Text
              style={{ color: tokens.color.success.default }}
              className="text-[13px] font-black"
            >
              🎁 {claimable.length} ready to claim
            </Text>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-semibold mt-1 leading-relaxed"
            >
              Claiming a milestone is what pays the reward. They are shown first below.
            </Text>
          </View>
        ) : null}

        {query.isLoading ? (
          <CreatorCardSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <CreatorEmptyState
            icon="trophy-outline"
            title="No milestones here"
            body={
              category === 'all'
                ? 'Diaspora has not set any milestones for your account yet.'
                : 'Nothing in this category.'
            }
            actionLabel={category === 'all' ? undefined : 'Show all'}
            onAction={category === 'all' ? undefined : () => setCategory('all')}
          />
        ) : (
          <CreatorSection title={category === 'all' ? 'All milestones' : category}>
            {visible.map((milestone) => (
              <MilestoneCard
                key={milestone.milestoneId}
                milestone={milestone}
                onClaim={handleClaim}
                isClaiming={claimingId === milestone.milestoneId}
                canClaim={claimRefusal.allowed}
                claimBlockedReason={claimRefusal.allowed ? undefined : claimRefusal.message}
              />
            ))}
          </CreatorSection>
        )}

        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold text-center mt-2 mb-4 leading-relaxed"
        >
          Diaspora decides when a milestone is complete. The progress figures here are its, not
          worked out on your phone.
        </Text>
      </View>
    </CreatorScreen>
  );
}
