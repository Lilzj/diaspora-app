// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy repositories (Frontend Phase 7)
//
// This file is §34's repository layer. Every hook here is the *stable domain
// interface* a screen depends on, and each one decides for itself which arm
// answers:
//
//   CreatorRepository            → development adapter        CREATOR-GAP-001/002
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
import { creatorGapKeys } from '@/lib/creator-gap-api';
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
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.profile(),
    queryFn: gapApi.fetchCreatorProfile,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    data: query.data ?? null,
    status: (query.data?.status ?? null) as CreatorStatus | null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useUpdateCreatorProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: UpdateCreatorProfileRequest) => gapApi.updateCreatorProfile(request),
    onSuccess: (profile) => {
      queryClient.setQueryData(creatorGapKeys.profile(), profile);
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
  });
}

export function usePublicCreator(creatorId: string | undefined) {
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.publicProfile(creatorId ?? 'none'),
    queryFn: () => gapApi.fetchPublicCreator(creatorId!),
    enabled: enabled && Boolean(creatorId),
    ...readOptions,
  });

  return {
    creator: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * The creator presentation of reputation.
 *
 * §9: the backend is authoritative. Note there is no local reputation store
 * consulted here and no arithmetic anywhere in the chain — `useReputationStore`
 * exists for the older profile screens and is deliberately not read, because
 * two sources for one score is how they come to disagree on screen.
 */
export function useCreatorReputation() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.reputation(),
    queryFn: gapApi.fetchCreatorReputation,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    reputation: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCreatorVerification() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.verification(),
    queryFn: gapApi.fetchCreatorVerification,
    enabled: enabled && isAuthenticated,
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
    isSimulated: true,
    isEnabled: enabled,
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
    mutationFn: () => gapApi.startCreatorVerification(),
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
      const result = await gapApi.submitCreatorVerification({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return result;
    },
    onSuccess: settle,
  });

  const appeal = useMutation({
    ...mutationOptions,
    mutationFn: (reason: string) => gapApi.appealCreatorVerification(reason),
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
      // Phase 5's contract has no notion of points *spent* on a reward and no
      // expiry. Reported as zero and as absent rather than derived, because a
      // derived figure here would be a guess about somebody's balance.
      lifetimeSpent: 0,
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
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.pointRules(),
    queryFn: gapApi.fetchPointRules,
    enabled,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useRewardCatalogue() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.rewardCatalogue(),
    queryFn: gapApi.fetchRewardCatalogue,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    rewards: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useRewardRedemptions() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.redemptions(),
    queryFn: gapApi.fetchRedemptions,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    redemptions: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
      const redemption = await gapApi.redeemReward(rewardId, idempotencyKey);
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
}

// ═════════════════════════════════════════════════════════════════════════════
// Milestones — CREATOR-GAP-003
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorMilestones() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.milestones(),
    queryFn: gapApi.fetchMilestones,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    milestones: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useClaimMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (milestoneId: string) => {
      const scope: OperationScope = { operation: 'creator-milestone-claim', subject: milestoneId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const milestone = await gapApi.claimMilestone(milestoneId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return milestone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creatorGapKeys.milestones() });
      // A claim can pay points, so the balance and the dashboard both move.
      invalidateCreatorRewards(queryClient);
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorChallengeRepository — CREATOR-GAP-004
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorChallenges(state?: string) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.challenges(state),
    queryFn: () => gapApi.fetchChallenges({ state }),
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    challenges: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCreatorChallenge(challengeId: string | undefined) {
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.challenge(challengeId ?? 'none'),
    queryFn: () => gapApi.fetchChallenge(challengeId!),
    enabled: enabled && Boolean(challengeId),
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
    isSimulated: true,
    isEnabled: enabled,
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
      const challenge = await gapApi.joinChallenge(challengeId, idempotencyKey);
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
      const challenge = await gapApi.claimChallenge(challengeId, idempotencyKey);
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
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.challengeLeaderboard(challengeId ?? 'none'),
    queryFn: () => gapApi.fetchChallengeLeaderboard(challengeId!),
    enabled: enabled && Boolean(challengeId),
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    leaderboard: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorGrantRepository — CREATOR-GAP-005
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityGrants(params: { category?: string; country?: string; state?: string } = {}) {
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.grants(params.category),
    queryFn: () => gapApi.fetchGrants(params),
    enabled,
    ...readOptions,
  });

  return {
    grants: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCommunityGrant(grantId: string | undefined) {
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.grant(grantId ?? 'none'),
    queryFn: () => gapApi.fetchGrant(grantId!),
    enabled: enabled && Boolean(grantId),
    ...readOptions,
  });

  return {
    grant: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

/** The application form, as data. §24: the app does not hard-code the questions. */
export function useGrantForm(grantId: string | undefined) {
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.grantForm(grantId ?? 'none'),
    queryFn: () => gapApi.fetchGrantForm(grantId!),
    enabled: enabled && Boolean(grantId),
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    form: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useGrantApplications() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.grantApplications(),
    queryFn: gapApi.fetchGrantApplications,
    enabled: enabled && isAuthenticated,
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    applications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
      gapApi.saveGrantDraft(grantId, answers),
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
      const application = await gapApi.submitGrantApplication({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return application;
    },
    onSuccess: settle,
  });

  const withdraw = useMutation({
    ...mutationOptions,
    mutationFn: (applicationId: string) => gapApi.withdrawGrantApplication(applicationId),
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
  const enabled = areCreatorGapsEnabled();

  const sectionsQuery = useQuery({
    queryKey: creatorGapKeys.academySections(),
    queryFn: gapApi.fetchAcademySections,
    enabled,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  const coursesQuery = useQuery({
    queryKey: creatorGapKeys.courses(section),
    queryFn: () => gapApi.fetchCourses({ section }),
    enabled,
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCreatorCourse(courseId: string | undefined) {
  const enabled = areCreatorGapsEnabled();

  const courseQuery = useQuery({
    queryKey: creatorGapKeys.course(courseId ?? 'none'),
    queryFn: () => gapApi.fetchCourse(courseId!),
    enabled: enabled && Boolean(courseId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  const lessonsQuery = useQuery({
    queryKey: creatorGapKeys.lessons(courseId ?? 'none'),
    queryFn: () => gapApi.fetchCourseLessons(courseId!),
    enabled: enabled && Boolean(courseId),
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCreatorLesson(lessonId: string | undefined) {
  const enabled = areCreatorGapsEnabled();

  const query = useQuery({
    queryKey: creatorGapKeys.lesson(lessonId ?? 'none'),
    queryFn: () => gapApi.fetchLesson(lessonId!),
    enabled: enabled && Boolean(lessonId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    lesson: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
      const progress = await gapApi.completeLesson(lessonId, idempotencyKey);
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
    }) => gapApi.submitQuiz(quizId, answers),
    onSuccess: (result) => {
      if (result.passed) invalidateAcademy();
    },
  });

  const setSaved = useMutation({
    ...mutationOptions,
    mutationFn: ({ courseId, isSaved }: { courseId: string; isSaved: boolean }) =>
      gapApi.setCourseSaved(courseId, isSaved),
    onSuccess: (course) => {
      queryClient.setQueryData(creatorGapKeys.course(course.courseId), course);
      queryClient.invalidateQueries({ queryKey: ['creator-gap', 'academy', 'courses'] });
    },
  });

  return { completeLesson, submitQuiz, setSaved };
}

export function useCreatorCertificates() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.certificates(),
    queryFn: gapApi.fetchCertificates,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    certificates: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorAnalyticsRepository — CREATOR-GAP-007
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorAnalytics(range: AnalyticsRange) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fingerprint = fingerprintRange(range);

  const query = useQuery({
    queryKey: creatorGapKeys.analytics(fingerprint),
    queryFn: () => gapApi.fetchCreatorAnalytics(range),
    // An incomplete custom range is not an error — it is a form the member has
    // not finished filling in, so the query simply does not run.
    enabled: enabled && isAuthenticated && isRangeQueryable(range),
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
    isSimulated: true,
    isEnabled: enabled,
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
    queryFn: ({ pageParam }) =>
      gapApi.fetchContentPerformance({
        period: range.period,
        from: range.from,
        to: range.to,
        contentType,
        cursor: pageParam ?? undefined,
        take: 15,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && isAuthenticated && isRangeQueryable(range),
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
// CreatorRevenueRepository — hybrid: B15 is real, attribution is CREATOR-GAP-008
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The revenue dashboard's data.
 *
 * **This hook is deliberately two-armed and says so.** The wallet — the balance
 * a member can actually withdraw — is real, read from B15 through
 * `usePrimaryWallet()`. The attribution — which earning came from a sponsorship
 * rather than a referral, and what is pending versus available — is simulated,
 * because B15 records money movements and not their business meaning.
 *
 * The two flags are separate so the screen can mark the breakdown as simulated
 * while presenting the balance as the real figure it is. Collapsing them into
 * one `isSimulated` would force a choice between marking a real balance as fake
 * and presenting an invented breakdown as real, and both are wrong.
 */
export function useCreatorRevenue(period?: string) {
  const enabled = areCreatorGapsEnabled();
  const access = useFinancialAccess();

  const walletQuery = usePrimaryWallet();

  const summaryQuery = useQuery({
    queryKey: creatorGapKeys.revenueSummary(period),
    queryFn: () => gapApi.fetchRevenueSummary(period),
    enabled: enabled && access.canReadWallet,
    ...readOptions,
  });

  return {
    /** REAL. B15's wallet, with its authoritative available and pending balances. */
    wallet: walletQuery.wallet,
    isWalletReal: true,
    /** SIMULATED. Source attribution and the per-source breakdown. */
    summary: summaryQuery.data ?? null,
    isSummarySimulated: true,

    isLoading: walletQuery.isLoading || summaryQuery.isLoading,
    isError: walletQuery.isError || summaryQuery.isError,
    error: ((walletQuery.error ?? summaryQuery.error) as FinancialError) ?? null,
    refetch: () => {
      walletQuery.refetch();
      void summaryQuery.refetch();
    },
    isEnabled: enabled,
    canRead: access.canReadWallet,
  };
}

export function useCreatorEarnings(filters: { state?: string; source?: string } = {}) {
  const enabled = areCreatorGapsEnabled();
  const access = useFinancialAccess();

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.earnings(filters.state, filters.source),
    queryFn: ({ pageParam }) =>
      gapApi.fetchEarnings({ ...filters, cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && access.canReadWallet,
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorReferralRepository — CREATOR-GAP-009 · CREATOR-GAP-010
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorReferrals() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.referralProgramme(),
    queryFn: gapApi.fetchReferralProgramme,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return {
    programme: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useReferralHistory() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.referralHistory(),
    queryFn: ({ pageParam }) => gapApi.fetchReferralHistory({ cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && isAuthenticated,
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useSignupBonus() {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.signupBonus(),
    queryFn: gapApi.fetchSignupBonus,
    enabled: enabled && isAuthenticated,
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    bonus: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
      const bonus = await gapApi.acknowledgeSignupBonus(idempotencyKey);
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
  const gapsOn = areCreatorGapsEnabled();
  const enabled = gapsOn && (params.enabled ?? true);

  const query = useQuery({
    queryKey: creatorGapKeys.leaderboard(params.scope, params.period),
    queryFn: () =>
      gapApi.fetchLeaderboard({
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
    isSimulated: true,
    isEnabled: gapsOn,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Recommendations — CREATOR-GAP-013
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorRecommendations(surface?: string, take?: number) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.recommendations(surface),
    queryFn: () => gapApi.fetchCreatorRecommendations(surface, take),
    enabled: enabled && isAuthenticated,
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    recommendations: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recommendationId: string) => gapApi.dismissRecommendation(recommendationId),
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
  const enabled = areCreatorGapsEnabled();
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
      gapApi.fetchCreatorDirectory({ ...params, cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
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
    isSimulated: true,
    isEnabled: enabled,
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
  const enabled = areCreatorGapsEnabled();
  const access = useFinancialAccess();

  const placementsQuery = useMyPlacements();

  const enrichedQuery = useQuery({
    queryKey: creatorGapKeys.sponsored(state),
    queryFn: () => gapApi.fetchSponsoredContent(state),
    enabled: enabled && access.tier >= 2,
    ...readOptions,
  });

  return {
    /** REAL. B15 placements: what was bought, when it runs, what it cost. */
    placements: placementsQuery.data ?? [],
    isPlacementsReal: true,
    /** SIMULATED. Approval state and delivery figures. */
    items: enrichedQuery.data ?? [],
    isItemsSimulated: true,

    isLoading: placementsQuery.isLoading || enrichedQuery.isLoading,
    isError: placementsQuery.isError || enrichedQuery.isError,
    error: ((placementsQuery.error ?? enrichedQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void placementsQuery.refetch();
      void enrichedQuery.refetch();
    },
    isEnabled: enabled,
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
