// Creator economy hooks: profile. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as gapApi from '@/lib/api/creator-gap-api';
import * as certifiedApi from '@/lib/creator/certified-client';
import { creatorGapKeys } from '@/lib/api/creator-gap-api';
import { areCreatorGapsEnabled } from '@/config/creator-gaps';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { resolveCreatorAccess, type CreatorAccess } from '@/lib/domain/creator-access';
import { useAuthStore } from '@/store/auth';
import { useEntitlements } from '../monetization';
import type { CreatorStatus } from '@/types/creator-economy';
import type {
  UpdateCreatorProfileRequest,
  CreatorDirectoryParams,
} from '@/lib/api/creator-gap-api';
import { LIVE_STALE_MS, mutationOptions, readOptions } from './shared';

/** Whether this build can reach the creator development adapter at all. */
export function useCreatorGapsEnabled(): boolean {
  return areCreatorGapsEnabled();
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
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
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
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.profile() });
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
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
