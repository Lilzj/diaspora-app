// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy repositories (Frontend Phase 7)
//
// This file is §34's repository layer. Every hook here is the *stable domain
// interface* a screen depends on, and each one decides for itself which arm
// answers:
//
//   CreatorRepository            → certified client (profile, verification,
//                                  reputation) — the dashboard summary is
//                                  still the development adapter
//   CreatorRewardsRepository     → Phase 5's rewards adapter, reused not forked
//   CreatorAnalyticsRepository   → development adapter        CREATOR-GAP-007
//   CreatorEducationRepository   → development content provider  CREATOR-GAP-006
//   CreatorReferralRepository    → development adapter        CREATOR-GAP-009
//   CreatorGrantRepository       → development adapter        CREATOR-GAP-005
//   CreatorChallengeRepository   → development adapter        CREATOR-GAP-004
//   CreatorRevenueRepository     → **B15 for the balance**, adapter for attribution
//   CreatorSponsorshipRepository → **B15 for the placement**, adapter for approval
//   CreatorEntitlementRepository → **B15 subscriptions and entitlements**
//
// Three properties every hook in here holds to, because a screen relies on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented earnings
//   figure without having had the opportunity to mark it. A screen that ignores
//   the flag is a review comment; a screen that never received one is a bug
//   nobody can see. The two hybrid hooks — revenue and sponsored content —
//   report it *per part*, because marking a real wallet balance as simulated
//   would be its own kind of lie.
//
//   **A disabled build is not an error state.** `areCreatorGapsEnabled()` is
//   false in release, and gap queries are disabled rather than left to fail, so
//   a production binary shows "not available yet" rather than a spinner
//   resolving into a network error.
//
//   **Mutations never retry.** Same rule and same reason as `hooks/financial.ts`:
//   a retried claim is a double claim, and the server's idempotency key is what
//   makes a *deliberate* retry safe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import * as gapApi from '@/lib/creator-gap-api';
import { fetchCreatorContentPerformance, fetchCreatorSummary } from '@/lib/analytics-api';
import { resolveRange } from '@/lib/analytics/time-range';
import type { AnalyticsRangePreset } from '@/types/analytics';
import * as certifiedApi from '@/lib/creator/certified-client';
import { creatorGapKeys } from '@/lib/creator-gap-api';
import { financialKeys } from '@/lib/financial-api';
import { areCreatorGapsEnabled } from '@/config/creator-gaps';
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
import { acquireIdempotencyKey, releaseIdempotencyKey, type OperationScope } from '@/lib/idempotency';
import { fingerprintRange, isRangeQueryable } from '@/lib/creator-economy';
import { resolveCreatorAccess, type CreatorAccess } from '@/lib/creator-access';
import { useAuthStore } from '@/store/auth';
import { useFinancialAccess, useMyPlacements, usePrimaryWallet } from './financial';
import { useEntitlements } from './monetization';
import { useRewardBalance, useRewardHistory, useConversionPolicy } from './financial-gaps';
import type {
  AnalyticsRange,
  CreatorAccessSurface,
  CreatorPoints,
  CreatorStatus,
} from '@/types/creator-economy';
import type { UpdateCreatorProfileRequest, CreatorDirectoryParams } from '@/lib/creator-gap-api';

// ─────────────────────────────────────────────────────────────────────────────
// Shared query options
// ─────────────────────────────────────────────────────────────────────────────

/** Reference data — the Academy catalogue, point rules — is stable for an hour. */
const REFERENCE_STALE_MS = 60 * 60 * 1000;
/** Analytics is recomputed on a schedule, never live. */
const ANALYTICS_STALE_MS = 5 * 60 * 1000;
/** Anything with a state machine attached: never served from a stale cache. */
const LIVE_STALE_MS = 0;

const readOptions = { retry: shouldRetryQuery, staleTime: 30_000 } as const;
const mutationOptions = { retry: 0 } as const;

/** Whether this build can reach the creator development adapter at all. */
export function useCreatorGapsEnabled(): boolean {
  return areCreatorGapsEnabled();
}

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
// ACCESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator capability set.
 *
 * Reads the creator status from the profile query when it has one, so a
 * suspended creator is refused for the right reason. Falls back to the platform
 * tier alone before the profile resolves — which is the conservative direction:
 * the platform ladder is the stricter of the two for everything that spends.
 */
export function useCreatorAccess(): CreatorAccess {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const profile = useCreatorProfile();

  return useMemo(
    () =>
      resolveCreatorAccess({
        accountState,
        isAuthenticated,
        creatorStatus: profile.data?.status ?? null,
      }),
    [accountState, isAuthenticated, profile.data?.status]
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD — the first paint, and only the first paint
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The dashboard summary.
 *
 * §39: one call on mount. Every deeper dataset is fetched by the screen that
 * shows it, and the section counts on this object are what let the dashboard
 * decide not to render a section at all rather than fetching it to discover it
 * is empty.
 */
export function useCreatorDashboard() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.dashboard(),
    queryFn: gapApi.fetchDashboardSummary,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorRepository — profile, status, reputation, verification
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorProfile() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.profile(),
    queryFn: certifiedApi.fetchCreatorProfile,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    data: query.data ?? null,
    status: (query.data?.status ?? null) as CreatorStatus | null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useUpdateCreatorProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: UpdateCreatorProfileRequest) => certifiedApi.updateCreatorProfile(request),
    onSuccess: (profile) => {
      queryClient.setQueryData(creatorGapKeys.profile(), profile);
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
  });
}

/** The creator profile behind an author's user id, or null when they have none. */
export function usePublicCreatorByUser(userId: string | undefined) {
  const query = useQuery({
    queryKey: [...creatorGapKeys.publicProfile('by-user'), userId ?? 'none'],
    queryFn: async () => {
      try {
        return await certifiedApi.fetchPublicCreatorByUser(userId!);
      } catch (cause) {
        // No creator profile is an answer, not a failure.
        if ((cause as { httpStatus?: number })?.httpStatus === 404) return null;
        throw cause;
      }
    },
    enabled: Boolean(userId),
    ...readOptions,
  });

  return { creator: query.data ?? null, isLoading: query.isLoading, error: (query.error as FinancialError) ?? null };
}

export function usePublicCreator(creatorId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.publicProfile(creatorId ?? 'none'),
    queryFn: () => certifiedApi.fetchPublicCreator(creatorId!),
    enabled: Boolean(creatorId),
    ...readOptions,
  });

  return {
    creator: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * The caller's creator reputation — `GET /creators/me/reputation`, in every
 * build since 20 Oct 2026.
 *
 * §9: the backend is authoritative. Note there is no local reputation store
 * consulted here and no arithmetic anywhere in the chain — `useReputationStore`
 * exists for the older profile screens and is deliberately not read, because
 * two sources for one score is how they come to disagree on screen.
 */
export function useCreatorReputation() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.reputation(),
    queryFn: certifiedApi.fetchMyCreatorReputation,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    reputation: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * Another creator's public reputation — `GET /creators/{creatorId}/reputation`.
 *
 * A 404 is the server saying this creator is not public (or not there); it is
 * reported as `isHidden` rather than as a failure, and nothing is shown in the
 * reputation's place.
 */
export function usePublicCreatorReputation(creatorId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.publicReputation(creatorId ?? 'none'),
    queryFn: async () => {
      try {
        return await certifiedApi.fetchCreatorReputation(creatorId!);
      } catch (cause) {
        if ((cause as { httpStatus?: number })?.httpStatus === 404) return null;
        throw cause;
      }
    },
    enabled: Boolean(creatorId),
    ...readOptions,
  });

  return {
    reputation: query.data ?? null,
    isHidden: query.isSuccess && query.data === null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

export function useCreatorVerification() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.verification(),
    queryFn: certifiedApi.fetchCreatorVerification,
    enabled: isAuthenticated,
    retry: shouldRetryQuery,
    // An application's state changes under review. Never stale.
    staleTime: LIVE_STALE_MS,
  });

  return {
    verification: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/** Start, submit and appeal. One hook because they share every cache concern. */
export function useCreatorVerificationActions() {
  const queryClient = useQueryClient();

  const settle = useCallback(
    (verification: unknown) => {
      queryClient.setQueryData(creatorGapKeys.verification(), verification);
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.profile() });
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
    [queryClient]
  );

  const start = useMutation({
    ...mutationOptions,
    mutationFn: () => certifiedApi.startCreatorVerification(),
    onSuccess: settle,
  });

  const submit = useMutation({
    ...mutationOptions,
    mutationFn: async (request: {
      acknowledgedRequirements: string[];
      evidenceIds: string[];
      note?: string;
    }) => {
      // A submitted application that the network lost must not become two
      // applications when the member taps again. The key survives the retry.
      const scope: OperationScope = { operation: 'creator-verification-submit', subject: 'me' };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const result = await certifiedApi.submitCreatorVerification({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return result;
    },
    onSuccess: settle,
  });

  const appeal = useMutation({
    ...mutationOptions,
    mutationFn: (reason: string) => certifiedApi.appealCreatorVerification(reason),
    onSuccess: settle,
  });

  return { start, submit, appeal };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorRewardsRepository — points, rules, catalogue, redemption
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The points balance.
 *
 * **Reused, not forked.** Phase 5 already built the points balance against
 * `/financial-gap/v0/rewards/me`, and §10 forbids a second wallet or a second
 * points ledger. This adapts Phase 5's `RewardBalance` into the creator
 * domain's `CreatorPoints` and adds the fields the creator surface needs but
 * Phase 5's contract does not carry — which are reported as zero rather than
 * invented, and named in CREATOR-GAP-011.
 */
export function useCreatorPoints(): GapRead<CreatorPoints | null> {
  const balance = useRewardBalance();
  const enabled = areCreatorGapsEnabled();

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
    isSimulated: true,
    isEnabled: enabled,
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
  queryClient.invalidateQueries({ queryKey: creatorGapKeys.rewardCatalogue() });
  queryClient.invalidateQueries({ queryKey: creatorGapKeys.redemptions() });
  queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
  // Phase 5's keys. Namespaced separately, so named separately.
  queryClient.invalidateQueries({ queryKey: ['financial-gap', 'rewards'] });
  // And the wallet's Rewards badge, which reads the certified key: a redemption
  // spends points, and the wallet went on showing them.
  queryClient.invalidateQueries({ queryKey: financialKeys.rewardPoints() });
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
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.milestones() });
      // A claimed milestone can be a badge, which the reputation read serves.
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.reputation() });
      // A claim can pay points, so the balance and the dashboard both move.
      invalidateCreatorRewards(queryClient);
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorChallengeRepository — CREATOR-GAP-004
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorChallenges(state?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.challenges(state),
    queryFn: () => certifiedApi.fetchChallenges({ state }),
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    challenges: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useCreatorChallenge(challengeId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.challenge(challengeId ?? 'none'),
    queryFn: () => certifiedApi.fetchChallenge(challengeId!),
    enabled: Boolean(challengeId),
    retry: shouldRetryQuery,
    // Progress moves while the member is looking at it.
    staleTime: LIVE_STALE_MS,
  });

  return {
    challenge: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useChallengeActions() {
  const queryClient = useQueryClient();

  const settle = useCallback(
    (challenge: { challengeId: string }) => {
      queryClient.setQueryData(creatorGapKeys.challenge(challenge.challengeId), challenge);
      queryClient.invalidateQueries({ queryKey: ['creator-gap', 'challenges'] });
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
    [queryClient]
  );

  const join = useMutation({
    ...mutationOptions,
    mutationFn: async (challengeId: string) => {
      const scope: OperationScope = { operation: 'creator-challenge-join', subject: challengeId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const challenge = await certifiedApi.joinChallenge(challengeId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return challenge;
    },
    onSuccess: settle,
  });

  const claim = useMutation({
    ...mutationOptions,
    mutationFn: async (challengeId: string) => {
      const scope: OperationScope = { operation: 'creator-challenge-claim', subject: challengeId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const challenge = await certifiedApi.claimChallenge(challengeId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return challenge;
    },
    onSuccess: (challenge) => {
      settle(challenge);
      invalidateCreatorRewards(queryClient);
    },
  });

  return { join, claim };
}

export function useChallengeLeaderboard(challengeId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.challengeLeaderboard(challengeId ?? 'none'),
    queryFn: () => certifiedApi.fetchChallengeLeaderboard(challengeId!),
    enabled: Boolean(challengeId),
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    leaderboard: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorGrantRepository — CREATOR-GAP-005
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityGrants(params: { category?: string; country?: string; state?: string } = {}) {
  const query = useQuery({
    queryKey: creatorGapKeys.grants(params.category),
    queryFn: () => certifiedApi.fetchGrants(params),
    ...readOptions,
  });

  return {
    grants: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useCommunityGrant(grantId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.grant(grantId ?? 'none'),
    queryFn: () => certifiedApi.fetchGrant(grantId!),
    enabled: Boolean(grantId),
    ...readOptions,
  });

  return {
    grant: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/** The application form, as data. §24: the app does not hard-code the questions. */
export function useGrantForm(grantId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.grantForm(grantId ?? 'none'),
    queryFn: () => certifiedApi.fetchGrantForm(grantId!),
    enabled: Boolean(grantId),
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    form: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useGrantApplications() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.grantApplications(),
    queryFn: certifiedApi.fetchGrantApplications,
    enabled: isAuthenticated,
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    applications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * One grant application by id — `GET /grants/applications/{applicationId}`,
 * since 20 Oct 2026. The applicant's own (or a reviewer's once submitted); a
 * 404 otherwise, which the screen shows as the server's answer.
 */
export function useGrantApplication(applicationId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.grantApplication(applicationId ?? 'none'),
    queryFn: () => certifiedApi.fetchGrantApplication(applicationId!),
    enabled: isAuthenticated && Boolean(applicationId),
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    application: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useGrantApplicationActions() {
  const queryClient = useQueryClient();

  const settle = useCallback(
    (application: { applicationId: string }) => {
      queryClient.setQueryData(creatorGapKeys.grantApplication(application.applicationId), application);
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.grantApplications() });
      queryClient.invalidateQueries({ queryKey: ['creator-gap', 'grants'] });
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
    [queryClient]
  );

  const saveDraft = useMutation({
    ...mutationOptions,
    mutationFn: ({ grantId, answers }: { grantId: string; answers: Record<string, string> }) =>
      certifiedApi.saveGrantDraft(grantId, answers),
    onSuccess: settle,
  });

  const submit = useMutation({
    ...mutationOptions,
    mutationFn: async (request: {
      grantId: string;
      answers: Record<string, string>;
      attachmentIds: string[];
      acceptedDeclarations: string[];
      requestedAmountMinorUnits?: number | null;
      currency?: string | null;
    }) => {
      const scope: OperationScope = { operation: 'grant-application-submit', subject: request.grantId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const application = await certifiedApi.submitGrantApplication({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return application;
    },
    onSuccess: settle,
  });

  const withdraw = useMutation({
    ...mutationOptions,
    mutationFn: (applicationId: string) => certifiedApi.withdrawGrantApplication(applicationId),
    onSuccess: settle,
  });

  return { saveDraft, submit, withdraw };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorEducationRepository — CREATOR-GAP-006
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The Academy.
 *
 * Sections and courses in one hook because the home screen needs both to draw a
 * single list, and two hooks would produce two spinners for one screenful.
 */
export function useCreatorAcademy(section?: string) {
  const sectionsQuery = useQuery({
    queryKey: creatorGapKeys.academySections(),
    queryFn: certifiedApi.fetchAcademySections,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  const coursesQuery = useQuery({
    queryKey: creatorGapKeys.courses(section),
    queryFn: () => certifiedApi.fetchCourses({ section }),
    // Not `REFERENCE_STALE_MS`: the catalogue is stable but the *progress*
    // folded into each course is not, and stale progress on a "Continue" button
    // sends somebody to a lesson they already finished.
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    sections: sectionsQuery.data ?? [],
    courses: coursesQuery.data ?? [],
    isLoading: sectionsQuery.isLoading || coursesQuery.isLoading,
    isError: sectionsQuery.isError || coursesQuery.isError,
    error: ((sectionsQuery.error ?? coursesQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void sectionsQuery.refetch();
      void coursesQuery.refetch();
    },
    isSimulated: false,
    isEnabled: true,
  };
}

export function useCreatorCourse(courseId: string | undefined) {
  const courseQuery = useQuery({
    queryKey: creatorGapKeys.course(courseId ?? 'none'),
    queryFn: () => certifiedApi.fetchCourse(courseId!),
    enabled: Boolean(courseId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  const lessonsQuery = useQuery({
    queryKey: creatorGapKeys.lessons(courseId ?? 'none'),
    queryFn: () => certifiedApi.fetchCourseLessons(courseId!),
    enabled: Boolean(courseId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    course: courseQuery.data ?? null,
    lessons: lessonsQuery.data ?? [],
    isLoading: courseQuery.isLoading || lessonsQuery.isLoading,
    isError: courseQuery.isError || lessonsQuery.isError,
    error: ((courseQuery.error ?? lessonsQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void courseQuery.refetch();
      void lessonsQuery.refetch();
    },
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * One lesson — `GET /academy/lessons/{lessonId}`, in every build since
 * 20 Oct 2026.
 *
 * Until then a lesson was only addressable through its course's list, so the
 * screen needed `courseId` in its URL and a legacy deep link without one fell
 * back to the simulated arm (and to "not available" in a release build). The
 * served lesson carries its own `courseId`, so any link with a lesson id now
 * resolves.
 */
export function useCreatorLesson(lessonId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.lesson(lessonId ?? 'none'),
    queryFn: () => certifiedApi.fetchLesson(lessonId!),
    enabled: Boolean(lessonId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    lesson: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useAcademyActions() {
  const queryClient = useQueryClient();

  const invalidateAcademy = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['creator-gap', 'academy'] });
    queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
  }, [queryClient]);

  const completeLesson = useMutation({
    ...mutationOptions,
    mutationFn: async (lessonId: string) => {
      const scope: OperationScope = { operation: 'lesson-complete', subject: lessonId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const progress = await certifiedApi.completeLesson(lessonId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return progress;
    },
    onSuccess: (progress) => {
      invalidateAcademy();
      // Finishing a course can complete a milestone and issue a certificate.
      if (progress.state === 'Completed') {
        queryClient.invalidateQueries({ queryKey: creatorGapKeys.milestones() });
        queryClient.invalidateQueries({ queryKey: creatorGapKeys.certificates() });
      }
    },
  });

  const submitQuiz = useMutation({
    ...mutationOptions,
    mutationFn: ({
      quizId,
      answers,
    }: {
      quizId: string;
      answers: { questionId: string; optionId: string }[];
    }) => certifiedApi.submitQuiz(quizId, answers),
    onSuccess: (result) => {
      if (result.passed) invalidateAcademy();
    },
  });

  const setSaved = useMutation({
    ...mutationOptions,
    mutationFn: ({ courseId, isSaved }: { courseId: string; isSaved: boolean }) =>
      certifiedApi.setCourseSaved(courseId, isSaved),
    onSuccess: (course) => {
      queryClient.setQueryData(creatorGapKeys.course(course.courseId), course);
      queryClient.invalidateQueries({ queryKey: ['creator-gap', 'academy', 'courses'] });
    },
  });

  return { completeLesson, submitQuiz, setSaved };
}

export function useCreatorCertificates() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.certificates(),
    queryFn: certifiedApi.fetchCertificates,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    certificates: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorAnalyticsRepository — CREATOR-GAP-007
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator's own figures.
 *
 * ── The certified route comes first now ──────────────────────────────────────
 *
 * This read the **development arm** and returned a hardcoded `isSimulated: true`,
 * gated on `areCreatorGapsEnabled()` — false in a release build. So on a real
 * device the creator analytics screen had nothing behind it at all, and Creator
 * Studio told the member their last thirty days were "not measured yet".
 *
 * `GET /analytics/creators/me/summary` has been answering 200 with fourteen
 * metrics, a comparison range and a three-entry series the whole time. Measured
 * on 22 Aug 2026 the denial was wrong about two of the three things it named:
 * `content_views` and `saves` are served; `reach` is not.
 *
 * The gap arm is kept as a fallback for a deployment that does not serve the
 * certified route, and `isSimulated` is now derived rather than asserted — it is
 * only true when the figures actually came from the development arm.
 *
 * `unavailableMetrics` is the deployment's own list of what it cannot compute,
 * so a screen can name what is missing instead of guessing.
 */
/**
 * Creator periods in the analytics module's vocabulary.
 *
 * The two halves spell the same ranges differently — `'30d'` here, `'last30d'`
 * there — and the first version of this call cast one to the other with `as
 * never`. `resolveRange` then fell through to its default, so the certified
 * request went out describing a period nobody asked for and the figures on
 * screen would have been for the wrong window. Casting between two vocabularies
 * is how a screen ends up confidently wrong.
 */
const CREATOR_PRESET: Record<AnalyticsRange['period'], AnalyticsRangePreset> = {
  today: 'today',
  '7d': 'last7d',
  '30d': 'last30d',
  '90d': 'last90d',
  year: 'thisYear',
  custom: 'custom',
};

export function useCreatorAnalytics(range: AnalyticsRange) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fingerprint = fingerprintRange(range);

  const query = useQuery({
    queryKey: creatorGapKeys.analytics(fingerprint),
    queryFn: async () => {
      try {
        // `range.period` is already the route's vocabulary; `resolveRange` is
        // used only for the shared from/to/timezone. Translating the period was
        // the bug: `last30d` makes the route answer 500.
        const certified = await fetchCreatorSummary(
          resolveRange(CREATOR_PRESET[range.period], {}),
          range.period
        );
        return { ...certified.summary, __unavailable: certified.unavailableMetrics, __simulated: false };
      } catch (cause) {
        // Only fall back where the development arm is actually on. In a release
        // build this rethrows, because a screen that silently degrades to
        // simulated figures is the defect this hook used to have.
        if (!enabled) throw cause;
        const simulated = await gapApi.fetchCreatorAnalytics(range);
        return { ...simulated, __unavailable: [] as string[], __simulated: true };
      }
    },
    // An incomplete custom range is not an error — it is a form the member has
    // not finished filling in, so the query simply does not run.
    // No longer gated on the development flag: the certified route is the
    // primary source and is present in every build.
    enabled: isAuthenticated && isRangeQueryable(range),
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
    // Keeps the previous period's figures on screen while the new ones load,
    // so changing period does not blank the dashboard.
    placeholderData: (previous) => previous,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    /** The metrics this deployment says it cannot compute. Never invented. */
    unavailableMetrics: query.data?.__unavailable ?? [],
    // Derived, not asserted. §57: simulated execution must never be
    // indistinguishable from real, and the old hardcoded `true` made real
    // figures look simulated as surely as the reverse would have hidden them.
    isSimulated: query.data?.__simulated ?? false,
    isEnabled: true,
  };
}

/**
 * Per-item performance.
 *
 * §39 forbids loading an entire dataset into the client, so this is cursor-paged
 * from the first call rather than "paged later if it turns out to be slow".
 */
export function useContentPerformance(range: AnalyticsRange, contentType?: string) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fingerprint = `${fingerprintRange(range)}:${contentType ?? 'all'}`;

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.contentPerformance(fingerprint),
    queryFn: async ({ pageParam }) => {
      const params = {
        period: range.period,
        from: range.from,
        to: range.to,
        contentType,
        cursor: pageParam ?? undefined,
        take: 15,
      };

      try {
        // `GET /analytics/creators/me/content` is served. The gap called
        // `/creators/me/analytics/content` under the simulated prefix — a
        // different path, never the same route.
        return await fetchCreatorContentPerformance(params);
      } catch (cause) {
        // The same rule `useCreatorAnalytics` follows: fall back only where the
        // development arm is actually on, and rethrow in a release build. A
        // screen that silently degrades to simulated figures is the defect this
        // hook had.
        if (!enabled) throw cause;
        return gapApi.fetchContentPerformance(params);
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // No longer gated on the development flag: the certified route is the
    // primary source and is present in every build.
    enabled: isAuthenticated && isRangeQueryable(range),
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorRevenueRepository — CREATOR-GAP-008, both halves now real
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The revenue dashboard's data.
 *
 * **This hook was two-armed and is no longer.** The wallet — the balance a
 * member can actually withdraw — was always real, read from B15 through
 * `usePrimaryWallet()`. The attribution — which earning came from a sponsorship
 * rather than a referral, and what is pending versus available — was simulated,
 * because B15 records money movements and not their business meaning.
 *
 * `Diaspora.Modules.Creator` now records that meaning as an earning of its own,
 * so the summary comes from `/creators/me/revenue/summary` and the two halves
 * are both real. `isWalletReal` and `isSummarySimulated` stay on the return
 * shape rather than being deleted: the screen reads them, and a hook that
 * quietly stopped answering a question the screen asks would leave the screen
 * rendering `undefined` as falsy and arriving at the right answer by accident.
 *
 * **Gated on access, not on the gap flag.** `areCreatorGapsEnabled()` is false
 * in a release build, and gating a certified read on it would leave the
 * dashboard permanently empty in exactly the builds members use. The gate has
 * to match the arm.
 */
export function useCreatorRevenue(days?: number) {
  const access = useFinancialAccess();

  const walletQuery = usePrimaryWallet();

  const summaryQuery = useQuery({
    queryKey: creatorGapKeys.revenueSummary(days === undefined ? undefined : String(days)),
    queryFn: () => certifiedApi.fetchRevenueSummary(days),
    enabled: access.canReadWallet,
    ...readOptions,
  });

  return {
    /** REAL. B15's wallet, with its authoritative available and pending balances. */
    wallet: walletQuery.wallet,
    isWalletReal: true,
    /** REAL. Source attribution and the per-source breakdown, from the Creator module. */
    summary: summaryQuery.data ?? null,
    isSummarySimulated: false,

    isLoading: walletQuery.isLoading || summaryQuery.isLoading,
    isError: walletQuery.isError || summaryQuery.isError,
    error: ((walletQuery.error ?? summaryQuery.error) as FinancialError) ?? null,
    refetch: () => {
      walletQuery.refetch();
      void summaryQuery.refetch();
    },
    isEnabled: true,
    canRead: access.canReadWallet,
  };
}

/**
 * The caller's own earnings, paged.
 *
 * The cursor is the server's own and is passed back untouched — see
 * `lib/creator-earning-api.ts` on why this client never builds one.
 */
export function useCreatorEarnings(filters: { state?: string; source?: string } = {}) {
  const access = useFinancialAccess();

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.earnings(filters.state, filters.source),
    queryFn: ({ pageParam }) =>
      certifiedApi.fetchEarnings({ ...filters, cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: access.canReadWallet,
    ...readOptions,
  });

  const earnings = useMemo(
    () => query.data?.pages.flatMap((page) => page.earnings) ?? [],
    [query.data]
  );

  return {
    earnings,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
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

// ═════════════════════════════════════════════════════════════════════════════
// Leaderboards — CREATOR-GAP-012
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorLeaderboard(params: {
  scope: string;
  period?: string;
  country?: string;
  enabled?: boolean;
}) {
  const enabled = params.enabled ?? true;

  const query = useQuery({
    queryKey: creatorGapKeys.leaderboard(params.scope, params.period),
    queryFn: () =>
      certifiedApi.fetchLeaderboard({
        scope: params.scope,
        period: params.period,
        country: params.country,
        take: 25,
      }),
    enabled,
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    leaderboard: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Recommendations — CREATOR-GAP-013
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorRecommendations(surface?: string, take?: number) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Real since 20 Oct 2026 (`GET /recommendations/creator`), so not flag-gated.
  const query = useQuery({
    queryKey: creatorGapKeys.recommendations(surface),
    queryFn: () => certifiedApi.fetchCreatorRecommendations(take),
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    recommendations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recommendationId: string) => certifiedApi.dismissCreatorRecommendation(recommendationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-gap', 'recommendations'] });
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Directory — CREATOR-GAP-014
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorDirectory(params: CreatorDirectoryParams) {
  const fingerprint = [
    params.query ?? '',
    params.country ?? '',
    params.category ?? '',
    params.expertise ?? '',
    params.verified ? 'verified' : '',
  ].join('|');

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.directory(fingerprint),
    queryFn: ({ pageParam }) =>
      certifiedApi.fetchCreatorDirectory({ ...params, cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...readOptions,
  });

  const creators = useMemo(
    () => query.data?.pages.flatMap((page) => page.creators) ?? [],
    [query.data]
  );

  return {
    creators,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorSponsorshipRepository — hybrid: B15 placements are real
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator's sponsored content.
 *
 * The placements are **real** — `useMyPlacements()` reads B15, and cancelling
 * one goes through B15. What the gap route adds is the approval state
 * (MON-GAP-006) and the delivery figures (MON-GAP-002), neither of which the
 * certified contract has.
 *
 * The real placements are exposed alongside the enriched list rather than being
 * folded silently into it, so the management screen can show the authoritative
 * B15 status next to the simulated one and a reviewer can see the difference.
 */
export function useCreatorSponsoredContent(state?: string) {
  const access = useFinancialAccess();

  const placementsQuery = useMyPlacements();

  // Real since 20 Oct 2026 (`GET /creators/me/sponsored`).
  const enrichedQuery = useQuery({
    queryKey: creatorGapKeys.sponsored(state),
    queryFn: () => certifiedApi.fetchSponsoredContent(state),
    enabled: access.tier >= 2,
    ...readOptions,
  });

  return {
    /** REAL. B15 placements: what was bought, when it runs, what it cost. */
    placements: placementsQuery.data ?? [],
    isPlacementsReal: true,
    /** REAL. State, amount paid and delivery figures, from the server. */
    items: enrichedQuery.data ?? [],
    isItemsSimulated: false,

    isLoading: placementsQuery.isLoading || enrichedQuery.isLoading,
    isError: placementsQuery.isError || enrichedQuery.isError,
    error: ((placementsQuery.error ?? enrichedQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void placementsQuery.refetch();
      void enrichedQuery.refetch();
    },
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorEntitlementRepository — B15, real
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the creator programme has unlocked.
 *
 * **The only fully real repository in this file.** It delegates to
 * `useEntitlements()`, which reads the member's actual B15 subscription and the
 * entitlement keys on their actual plan. §37: the client renders an
 * entitlement, it does not decide one — and the server re-decides on the
 * request that follows.
 */
export function useCreatorEntitlements() {
  const entitlements = useEntitlements();

  const decide = useCallback((key: string) => entitlements.decide(key), [entitlements]);

  return {
    ...entitlements,
    decide,
    /** False, and deliberately: this arm is the certified backend. */
    isSimulated: false,
  };
}

/** A named surface, for analytics and for the gap notice on a screen. */
export type { CreatorAccessSurface };
