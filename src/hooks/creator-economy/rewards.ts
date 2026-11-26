// Creator economy hooks: rewards. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as certifiedApi from '@/lib/creator/certified-client';
import { creatorGapKeys } from '@/lib/api/creator-gap-api';
import { financialKeys } from '@/lib/api/financial-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { useAuthStore } from '@/store/auth';
import { useRewardBalance, useRewardHistory, useConversionPolicy } from '../financial-gaps';
import type { CreatorPoints } from '@/types/creator-economy';
import { financialGapKeys } from '@/lib/api/financial-gap-api';
import { LIVE_STALE_MS, REFERENCE_STALE_MS, mutationOptions, readOptions } from './shared';

/** The shape every gap-backed read hook returns. Consistent so screens are too. */
interface GapRead<T> {
  data: T;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
  /** Always true for a purely gap-backed read. Screens mark accordingly. */
  isSimulated: boolean;
  isEnabled: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorRewardsRepository — points, rules, catalogue, redemption
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The points balance.
 *
 * **Reused, not forked.** `useRewardBalance` reads the real balance at
 * `GET /financial/rewards/me`, and §10 forbids a second wallet or a second
 * points ledger. This adapts its `RewardBalance` into the creator domain's
 * `CreatorPoints`. The two figures the server has no notion of — points
 * expired and the next expiry — are reported as zero and null rather than
 * invented.
 *
 * **Not simulated, in any build.** This hook was written against Phase 5's
 * gap route and said `isSimulated: true`, gated on the simulation flag; it
 * kept saying so for a week after its source became the certified read
 * (FE-09). Nothing renders either flag today, which is the only reason the
 * claim did no harm.
 */
export function useCreatorPoints(): GapRead<CreatorPoints | null> {
  const balance = useRewardBalance();

  const data = useMemo<CreatorPoints | null>(() => {
    const source = balance.data;
    if (!source) return null;

    return {
      available: source.available,
      pending: source.pending,
      lifetimeEarned: source.lifetimeEarned,
      lifetimeConverted: source.lifetimeConverted,
      // The server's own figure since 22 Oct 2026 (`lifetimeSpent` on the
      // balance). It was hard-coded to zero before, because the contract had no
      // notion of points spent — so earned − converted stopped matching the
      // balance after the first redemption. Expiry is still not a server
      // concept, so it stays zero rather than derived: a derived figure would
      // be a guess about somebody's balance.
      lifetimeSpent: source.lifetimeSpent ?? 0,
      lifetimeExpired: 0,
      nextThreshold: source.nextThreshold ?? null,
      nextThresholdLabel: source.nextThresholdLabel ?? null,
      nextExpiryAt: null,
      nextExpiryPoints: null,
      updatedAt: source.updatedAt,
    };
  }, [balance.data]);

  return {
    data,
    isLoading: balance.isLoading,
    isError: balance.isError,
    error: (balance.error as FinancialError) ?? null,
    refetch: balance.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/** Phase 5's points ledger, re-exported so a creator screen has one import. */
export function useCreatorPointsHistory() {
  return useRewardHistory();
}

/** Phase 5's conversion policy. The creator surface links into its flow. */
export function useCreatorConversionPolicy() {
  return useConversionPolicy();
}

export function usePointRules() {
  const query = useQuery({
    queryKey: creatorGapKeys.pointRules(),
    queryFn: certifiedApi.fetchPointRules,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    rules: query.data?.rules ?? [],
    // The three fields the register asked for and the gap adapter never had:
    // which catalogue decided these figures, whether points lapse, and the
    // platform's own sentence about it. A screen that had to answer "do my
    // points expire" was previously guessing.
    catalogueVersion: query.data?.catalogueVersion ?? null,
    expiryPolicy: query.data?.expiryPolicy ?? null,
    expiryDescription: query.data?.expiryDescription ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useRewardCatalogue() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.rewardCatalogue(),
    queryFn: certifiedApi.fetchRewardCatalogue,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    rewards: query.data?.rewards ?? [],
    catalogueVersion: query.data?.catalogueVersion ?? null,
    // Read by the *server* from B15 and served with the catalogue, so the price
    // and the balance a screen compares come from one read rather than two that
    // can disagree. `useCreatorPoints` still owns the balance the wallet shows.
    availablePoints: query.data?.availablePoints ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useRewardRedemptions() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.redemptions(),
    queryFn: () => certifiedApi.fetchRedemptions(),
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    redemptions: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * Redeems a reward.
 *
 * Idempotent, and the balance is *invalidated* rather than decremented.
 * Decrementing locally would be the frontend deciding what somebody's points
 * balance is, which §12 of the success criteria forbids — and it would be wrong
 * the moment a redemption is refused after the optimistic update.
 */
export function useRedeemReward() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (rewardId: string) => {
      const scope: OperationScope = { operation: 'creator-reward-redeem', subject: rewardId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const redemption = await certifiedApi.redeemReward(rewardId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return redemption;
    },
    onSuccess: () => {
      invalidateCreatorRewards(queryClient);
    },
  });
}

/** Everything a points movement makes stale. One place, so nothing is missed. */
export function invalidateCreatorRewards(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: creatorGapKeys.rewardCatalogue() });
  void queryClient.invalidateQueries({ queryKey: creatorGapKeys.redemptions() });
  void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
  // Phase 5's keys. Namespaced separately, so named separately.
  void queryClient.invalidateQueries({ queryKey: financialGapKeys.rewards() });
  // And the wallet's Rewards badge, which reads the certified key: a redemption
  // spends points, and the wallet went on showing them.
  void queryClient.invalidateQueries({ queryKey: financialKeys.rewardPoints() });
}

// ═════════════════════════════════════════════════════════════════════════════
// Milestones — CREATOR-GAP-003
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorMilestones() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.milestones(),
    queryFn: certifiedApi.fetchMilestones,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    milestones: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useClaimMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (milestoneId: string) => {
      const scope: OperationScope = { operation: 'creator-milestone-claim', subject: milestoneId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const milestone = await certifiedApi.claimMilestone(milestoneId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return milestone;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.milestones() });
      // A claimed milestone can be a badge, which the reputation read serves.
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.reputation() });
      // A claim can pay points, so the balance and the dashboard both move.
      invalidateCreatorRewards(queryClient);
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorReferralRepository — CREATOR-GAP-009 · CREATOR-GAP-010
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorReferrals() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.referralProgramme(),
    queryFn: certifiedApi.fetchReferralProgramme,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    programme: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useReferralHistory() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.referralHistory(),
    queryFn: ({ pageParam }) => certifiedApi.fetchReferralHistory({ cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
    ...readOptions,
  });

  const referrals = useMemo(
    () => query.data?.pages.flatMap((page) => page.referrals) ?? [],
    [query.data]
  );

  return {
    referrals,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useSignupBonus() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.signupBonus(),
    queryFn: certifiedApi.fetchSignupBonus,
    enabled: isAuthenticated,
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    bonus: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * Acknowledges the sign-up bonus.
 *
 * §19: the frontend never awards a point. This posts an acknowledgement and
 * then *invalidates* the points balance rather than adding anything to it — so
 * whatever the balance shows afterwards is a figure the server produced.
 */
export function useAcknowledgeSignupBonus() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async () => {
      const scope: OperationScope = { operation: 'signup-bonus-acknowledge', subject: 'me' };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const bonus = await certifiedApi.acknowledgeSignupBonus(idempotencyKey);
      await releaseIdempotencyKey(scope);
      return bonus;
    },
    onSuccess: (bonus) => {
      queryClient.setQueryData(creatorGapKeys.signupBonus(), bonus);
      invalidateCreatorRewards(queryClient);
    },
  });
}
