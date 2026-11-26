// Communities hooks: membership. ./index.ts is the overview of the whole module.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CommunityId,
  CommunityMembershipAction,
  CommunityMembershipSet,
  CommunityPreferences,
} from '@/types/community-directory';
import { defaultCommunityPreferences } from '@/types/community-directory';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
import {
  fetchCommunityPreferences,
  fetchMembershipSet,
  performMembershipAction,
  saveCommunityPreferences,
  setPrimaryCommunity,
} from '@/lib/api/community-entity-api';
import { communityScopedKeys } from '@/lib/api/community-directory-api';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useAuthStore } from '@/store/auth';
import { realMeta } from './shared';
import type { CommunityQueryMeta } from './shared';

export function useMembershipSet(): UseQueryResult<CommunityMembershipSet> & CommunityQueryMeta {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enabled = isAuthenticated;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.memberships(),
    queryFn: ({ signal }) => fetchMembershipSet(signal),
    enabled,
    // Short: the membership set is the input to scope resolution, and a stale set
    // is a wrong scope. Also the bound on how long a revoked role stays effective
    // until GAP-025's realtime channel exists.
    staleTime: 60_000,
    retry: 1,
  });

  const meta = realMeta(result);

  return {
    ...result,
    isSimulated: meta.isSimulated,
    unavailable: !isAuthenticated ? 'unauthorized' : meta.unavailable,
  };
}

/**
 * A membership transition — §33.
 *
 * §61's invalidation, as one named function rather than a list each screen
 * remembers. Never `queryClient.clear()`: clearing the whole cache on a join
 * would throw away the map, the wallet and the inbox to refresh a badge.
 */
export function useMembershipAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { communityId: CommunityId; action: CommunityMembershipAction }) =>
      performMembershipAction(input.communityId, input.action),

    onSuccess: (_membership, input) => {
      invalidateForMembershipChange(queryClient, input.communityId);

      const event =
        input.action === 'join'
          ? 'community.joined'
          : input.action === 'leave'
            ? 'community.left'
            : input.action === 'follow'
              ? 'community.followed'
              : input.action === 'unfollow'
                ? 'community.unfollowed'
                : input.action === 'express-interest'
                  ? 'community.interest.added'
                  : input.action === 'remove-interest'
                    ? 'community.interest.removed'
                    : input.action === 'cancel-application'
                      ? 'community.application.cancelled'
                      : 'community.viewed';

      trackCommunityEvent(event, { communityId: input.communityId });
    },
  });
}

export function useSetPrimaryCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (communityId: CommunityId | null) => setPrimaryCommunity(communityId),
    onSuccess: (_set, communityId) => {
      invalidateForMembershipChange(queryClient, communityId ?? undefined);
      trackCommunityEvent('community.primary.changed', {
        communityId: communityId ?? undefined,
      });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PREFERENCES — GAP-012, GAP-021
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The member's community preferences — real since 20 Oct 2026
 * (`GET /communities/preferences/me`). A member who never saved any gets the
 * server's privacy-safe defaults with `isSaved: false`.
 */
export function useCommunityPreferences(): UseQueryResult<CommunityPreferences> &
  CommunityQueryMeta {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.preferences(),
    queryFn: ({ signal }) => fetchCommunityPreferences(signal),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: 1,
    // Off-by-default for every visibility flag, so a member who never opened the
    // screen has published nothing (§41).
    placeholderData: defaultCommunityPreferences(),
  });

  return { ...result, ...realMeta(result) };
}

export function useSaveCommunityPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: CommunityPreferences) => saveCommunityPreferences(preferences),
    onSuccess: (saved) => {
      queryClient.setQueryData(communityDirectoryGapKeys.preferences(), saved);
      // A visibility change alters what recommendations and notifications may
      // consider, so the scoped surfaces are refetched rather than left.
      void queryClient.invalidateQueries({ queryKey: communityScopedKeys.contentAll() });
      trackCommunityEvent('community.preferences.updated');
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// INVALIDATION — §61
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §61's invalidation set for a membership change, as one function.
 *
 * Everything listed, and **nothing else**. `queryClient.clear()` would be one
 * line and would throw away the map tiles, the wallet, the inbox and every
 * certified list in the app to refresh a badge — which §61 forbids in as many
 * words.
 *
 * The statistics are deliberately *not* invalidated: one member joining does not
 * move a published aggregate, and refetching every community's statistics on
 * every join would be the "unnecessary refetching" §60 names.
 */
export function invalidateForMembershipChange(
  queryClient: QueryClient,
  communityId?: CommunityId
): void {
  // The membership set drives scope resolution, so it goes first.
  void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.memberships() });

  // The directory shows membership state per row.
  void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.directoryAll() });
  void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.suggestionsAll() });

  if (communityId) {
    void queryClient.invalidateQueries({
      queryKey: communityDirectoryGapKeys.community(communityId),
    });
    void queryClient.invalidateQueries({
      queryKey: communityDirectoryGapKeys.capabilities(communityId),
    });
  }

  // Community-scoped content and search: the scope may now resolve differently.
  void queryClient.invalidateQueries({ queryKey: communityScopedKeys.contentAll() });
  void queryClient.invalidateQueries({ queryKey: communityScopedKeys.searchAll() });

  // §47: community-sensitive recommendations must not survive a membership
  // change. The existing engine surface, invalidated — not a second one.
  void queryClient.invalidateQueries({ queryKey: ['explore', 'recommendations'] });
}
