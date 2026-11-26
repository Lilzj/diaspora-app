// Communities hooks: governance. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  CommunityId,
  CommunityNotice,
  CommunityRole,
  CommunityRoleHolder,
  CommunityRule,
} from '@/types/community-directory';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
import {
  createCommunityRule,
  deleteCommunityNotice,
  deleteCommunityRule,
  fetchCommunityNotices,
  fetchCommunityRoleHolders,
  fetchCommunityRules,
  publishCommunityNotice,
  updateCommunityNotice,
  updateCommunityRule,
  type SaveCommunityNoticeInput,
  type SaveCommunityRuleInput,
} from '@/lib/api/community-entity-api';
import { realMeta } from './shared';
import type { CommunityQueryMeta } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE — GAP-016, GAP-017, GAP-018, GAP-019
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityRules(
  communityId: CommunityId | undefined
): UseQueryResult<CommunityRule[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId) && flags.communityGovernanceEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.rules(communityId ?? 'none'),
    queryFn: ({ signal }) => fetchCommunityRules(communityId!, signal),
    enabled,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    ...realMeta(result),
    unavailable: !flags.communityGovernanceEnabled ? 'feature-disabled' : realMeta(result).unavailable,
  };
}

export function useCommunityNotices(
  communityId: CommunityId | undefined,
  options: { includeExpired?: boolean } = {}
): UseQueryResult<CommunityNotice[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId) && flags.communityGovernanceEnabled;

  const result = useQuery({
    queryKey: [
      ...communityDirectoryGapKeys.notices(communityId ?? 'none'),
      options.includeExpired ?? false,
    ],
    queryFn: ({ signal }) => fetchCommunityNotices(communityId!, options, signal),
    enabled,
    // A pinned notice is often the reason a member opened the community.
    staleTime: 2 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    ...realMeta(result),
    unavailable: !flags.communityGovernanceEnabled ? 'feature-disabled' : realMeta(result).unavailable,
  };
}

/**
 * Writing a community's rules and notices. The server decides who may
 * (`canManageRules`, `canPublishNotice`, or a notice's own author); the screen
 * only decides whether to draw the control, from the same capability set.
 */
export function useCommunityGovernanceMutations(communityId: CommunityId | undefined) {
  const queryClient = useQueryClient();

  const refreshRules = () => {
    if (communityId) {
      void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.rules(communityId) });
    }
  };
  const refreshNotices = () => {
    if (communityId) {
      void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.notices(communityId) });
    }
  };

  const createRule = useMutation({
    mutationFn: (input: SaveCommunityRuleInput) => createCommunityRule(communityId!, input),
    // Refetched, never patched: a new rule renumbers the others on the server.
    onSettled: refreshRules,
  });

  const updateRule = useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: SaveCommunityRuleInput }) =>
      updateCommunityRule(communityId!, ruleId, input),
    onSettled: refreshRules,
  });

  const removeRule = useMutation({
    mutationFn: (ruleId: string) => deleteCommunityRule(communityId!, ruleId),
    // The route answers the rules that remain, renumbered — the list to show.
    onSuccess: (remaining) => {
      if (communityId) {
        queryClient.setQueryData(communityDirectoryGapKeys.rules(communityId), remaining);
      }
    },
    onSettled: refreshRules,
  });

  const publishNotice = useMutation({
    mutationFn: (input: SaveCommunityNoticeInput) => publishCommunityNotice(communityId!, input),
    onSettled: refreshNotices,
  });

  const updateNotice = useMutation({
    mutationFn: ({ noticeId, input }: { noticeId: string; input: SaveCommunityNoticeInput }) =>
      updateCommunityNotice(communityId!, noticeId, input),
    onSettled: refreshNotices,
  });

  const removeNotice = useMutation({
    mutationFn: (noticeId: string) => deleteCommunityNotice(communityId!, noticeId),
    onSettled: refreshNotices,
  });

  return { createRule, updateRule, removeRule, publishNotice, updateNotice, removeNotice };
}

/**
 * Who holds an office — real since 20 Oct 2026 (`GET /communities/{id}/roles`).
 *
 * The server answers each holder as they chose to be seen (Public to anybody,
 * CommunityOnly to members), so this needs no member-list permission and asks
 * nobody's roles on their behalf.
 */
export function useCommunityRoleHolders(
  communityId: CommunityId | undefined,
  role?: CommunityRole
): UseQueryResult<CommunityRoleHolder[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const roleEnabled =
    role === 'Ambassador'
      ? flags.communityAmbassadorsEnabled
      : role === 'Moderator'
        ? flags.communityModeratorsEnabled
        : true;
  const enabled = Boolean(communityId) && roleEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.roles(communityId ?? 'none', role),
    queryFn: ({ signal }) => fetchCommunityRoleHolders(communityId!, role, signal),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    ...realMeta(result),
    unavailable: !roleEnabled ? 'feature-disabled' : realMeta(result).unavailable,
  };
}
