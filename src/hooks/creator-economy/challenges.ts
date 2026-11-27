// Creator economy hooks: challenges. ./index.ts is the overview of the whole module.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as certifiedApi from '@/lib/creator/certified-client';
import { creatorGapKeys } from '@/lib/api/creator-gap-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { useAuthStore } from '@/store/auth';
import { ANALYTICS_STALE_MS, LIVE_STALE_MS, mutationOptions, readOptions } from './shared';
import { invalidateCreatorRewards } from './rewards';

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
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.challengesAll() });
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
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
