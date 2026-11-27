// Communities hooks: administration. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ProposeCommunityInput,
  AssignableCommunityRole,
  OfferCommunityOwnershipInput,
  RequestCommunityDeletionInput,
} from '@/types/community-directory';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
// ═════════════════════════════════════════════════════════════════════════════
// ADMINISTRATION — founding a community, its members and their roles
// ═════════════════════════════════════════════════════════════════════════════
//
// Real routes, so no preview-flag gate on any of them — the defect
// `real-routes-ship-enabled.test.ts` exists to catch, and the one the four hooks
// above carried until 11 Sep 2026.
import {
  changeCommunityRole,
  fetchCommunityMembers,
  proposeCommunity,
  decideCommunityDeletion,
  decideCommunityOwnership,
  fetchCommunityDeletionRequest,
  fetchCommunityDeletionRequests,
  fetchMyCommunityOwnershipOffers,
  offerCommunityOwnership,
  requestCommunityDeletion,
  withdrawCommunityDeletion,
  withdrawCommunityOwnershipOffer,
} from '@/lib/api/community-entity-api';
import { useAuthStore } from '@/store/auth';
import { invalidateForMembershipChange } from './membership';

const communityAdminKeys = {
  members: (idOrSlug: string) => ['communities', 'members', idOrSlug] as const,
  deletionRequest: (idOrSlug: string) => ['communities', 'deletion-request', idOrSlug] as const,
  deletionQueue: (status: string) => ['communities', 'deletion-requests', status] as const,
  ownershipOffers: () => ['communities', 'ownership-offers', 'mine'] as const,
};

/**
 * Found a community. The caller becomes its Owner and an Administrator, and it
 * waits, Pending, until Diaspora opens it.
 */
export function useProposeCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProposeCommunityInput) => proposeCommunity(input),

    onSuccess: (membership) => {
      // The founder's membership set now includes it; nothing else can see it yet.
      invalidateForMembershipChange(queryClient, membership.communityId);
    },
  });
}

/**
 * The members of a community the caller may see, a page at a time.
 *
 * Members only, which the server enforces; a caller who is not one gets an
 * error back rather than an empty list that looks like an empty community.
 */
export function useCommunityMembers(idOrSlug: string | undefined, enabled = true) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useInfiniteQuery({
    queryKey: communityAdminKeys.members(idOrSlug ?? 'none'),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchCommunityMembers(idOrSlug!, pageParam, signal),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : null),
    enabled: Boolean(idOrSlug) && isAuthenticated && enabled,
    staleTime: 30_000,
    retry: 1,
  });

  const members = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    members,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: query.refetch,
  };
}

/**
 * Give a member a role, or take one away.
 *
 * On success the member list and the caller's own capabilities are refetched —
 * the second because a role change can move what the caller may do next, and a
 * stale capability set is a button that 403s.
 */
export function useChangeCommunityRole(idOrSlug: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { userId: string; role: AssignableCommunityRole; granted: boolean }) =>
      changeCommunityRole(idOrSlug!, input.userId, input.role, input.granted),

    onSuccess: () => {
      if (!idOrSlug) return;
      void queryClient.invalidateQueries({ queryKey: communityAdminKeys.members(idOrSlug) });
      void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.capabilitiesAll() });
      void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.memberships() });
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CLOSING A COMMUNITY, AND HANDING ONE OVER — 12 Sep 2026
// ══════════════════════════════════════════════════════════════════════════════

/**
 * What is happening to this community, if anything.
 *
 * Asked only where somebody is entitled to the answer — whoever runs the
 * community, and Diaspora. A member is told nothing while the wait runs, which
 * is the point of the wait: a community told it might close closes early by
 * itself, because people leave.
 */
export function useCommunityDeletionRequest(idOrSlug: string | undefined, enabled = true) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityAdminKeys.deletionRequest(idOrSlug ?? 'none'),
    queryFn: ({ signal }) => fetchCommunityDeletionRequest(idOrSlug!, signal),
    enabled: Boolean(idOrSlug) && isAuthenticated && enabled,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    request: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Ask Diaspora to close a community. Performs nothing: it starts the wait. */
export function useRequestCommunityDeletion(idOrSlug: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RequestCommunityDeletionInput) =>
      requestCommunityDeletion(idOrSlug!, input),
    onSuccess: () => {
      if (idOrSlug) {
        void queryClient.invalidateQueries({
          queryKey: communityAdminKeys.deletionRequest(idOrSlug),
        });
      }
    },
  });
}

/** Change your mind while it waits. */
export function useWithdrawCommunityDeletion(idOrSlug: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => withdrawCommunityDeletion(idOrSlug!),
    onSuccess: () => {
      if (idOrSlug) {
        void queryClient.invalidateQueries({
          queryKey: communityAdminKeys.deletionRequest(idOrSlug),
        });
      }
    },
  });
}

/**
 * The review queue. Platform administrators only.
 *
 * A refusal is the platform saying this caller is not one — the screen says so
 * rather than rendering an empty queue, which would read as "nothing to do".
 */
export function useCommunityDeletionQueue(status: string = 'AwaitingReview') {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityAdminKeys.deletionQueue(status),
    queryFn: ({ signal }) => fetchCommunityDeletionRequests(status, null, signal),
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
  });

  return {
    requests: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Approve or refuse. A refusal needs a reason; the owner reads it as written. */
export function useDecideCommunityDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; approve: boolean; reason?: string }) =>
      decideCommunityDeletion(input.requestId, input.approve, input.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['communities', 'deletion-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['communities', 'deletion-request'] });
    },
  });
}

/** Communities somebody has asked this member to take over. */
export function useMyCommunityOwnershipOffers() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityAdminKeys.ownershipOffers(),
    queryFn: ({ signal }) => fetchMyCommunityOwnershipOffers(signal),
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    offers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Offer the community to one of its moderators or administrators. */
export function useOfferCommunityOwnership(idOrSlug: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OfferCommunityOwnershipInput) =>
      offerCommunityOwnership(idOrSlug!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityAdminKeys.ownershipOffers() });
      if (idOrSlug) {
        void queryClient.invalidateQueries({ queryKey: communityAdminKeys.members(idOrSlug) });
      }
    },
  });
}

/** Take back an offer nobody has answered. */
export function useWithdrawCommunityOwnershipOffer(idOrSlug: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => withdrawCommunityOwnershipOffer(idOrSlug!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityAdminKeys.ownershipOffers() });
    },
  });
}

/**
 * Accept or refuse a community somebody offered.
 *
 * Accepting moves the roles, so everything about who may do what here is stale:
 * the caller's capabilities, the member list, and the membership set the whole
 * app reads its community context from.
 */
export function useDecideCommunityOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { transferId: string; accept: boolean; reason?: string }) =>
      decideCommunityOwnership(input.transferId, input.accept, input.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityAdminKeys.ownershipOffers() });
      invalidateForMembershipChange(queryClient);
    },
  });
}
