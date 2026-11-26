// Community Life hooks: polls. ./index.ts is the overview of the whole module.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type { CreatePollRequest, SubmitPollResponseRequest } from '@/types/community-advanced';
import {
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  PROGRESS_POLL_MS,
  fingerprint,
  mutationOptions,
  readOptions,
} from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// PollRepository — GAP-012
// ═════════════════════════════════════════════════════════════════════════════

export function usePolls(params: b18.PollQueryParams = {}, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.polls(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchPolls({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    polls: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function usePoll(pollId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.poll(pollId ?? ''),
    queryFn: () => b18.fetchPoll(pollId as string),
    enabled: Boolean(pollId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    poll: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * A poll's results.
 *
 * §24: computed by the server, never by the client. There is no arithmetic in
 * this hook, in the component that renders it, or anywhere downstream — the
 * percentages on screen are the ones the server sent.
 *
 * Polls while open, because a live result is the interesting case, and stops
 * once closed. GAP-020 again: periodic, not live, and the screen says so.
 */
export function usePollResult(pollId: string | undefined, isOpen = true) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.pollResult(pollId ?? ''),
    queryFn: () => b18.fetchPollResult(pollId as string),
    enabled: Boolean(pollId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
    refetchInterval: isOpen ? PROGRESS_POLL_MS : false,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isLive: false,
    isEnabled: true,
  };
}

/**
 * Casts a vote.
 *
 * No optimistic update, deliberately. A vote can be refused — the poll closed,
 * the caller is outside the audience, the caller already voted — and showing a
 * filled bar that then snaps back would be worse than a 300ms spinner. The
 * response *is* the result, so the confirmation screen renders what the server
 * counted.
 */
export function useSubmitPollResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<SubmitPollResponseRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = { operation: 'poll-vote', subject: request.pollId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const result = await b18.submitPollResponse({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return result;
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(communityProgrammeKeys.pollResult(variables.pollId), result);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.poll(variables.pollId) });
    },
  });
}

export function useCreatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreatePollRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'poll-create',
        subject: `${request.organizationId ?? 'personal'}:${request.question}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const poll = await b18.createPoll({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return poll;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData(communityProgrammeKeys.poll(poll.pollId), poll);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.pollsAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubPolls() });
    },
  });
}

export function usePollAction() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      pollId,
      action,
    }: {
      pollId: string;
      action: 'publish' | 'close' | 'cancel' | 'publish-results';
    }) => b18.actOnPoll(pollId, action),
    onSuccess: (poll) => {
      queryClient.setQueryData(communityProgrammeKeys.poll(poll.pollId), poll);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.pollResult(poll.pollId) });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.pollsAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubPolls() });
    },
  });
}
