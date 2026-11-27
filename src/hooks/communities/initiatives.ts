// Communities hooks: initiatives. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  CommunityId,
  CommunityInitiative,
  CommunityInitiativeParticipant,
  CommunityInitiativeStatus,
  CommunityInitiativeUpdate,
} from '@/types/community-directory';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
import {
  createCommunityInitiative,
  fetchCommunityInitiative,
  fetchCommunityInitiativeParticipants,
  fetchCommunityInitiatives,
  fetchCommunityInitiativeUpdates,
  joinCommunityInitiative,
  leaveCommunityInitiative,
  postCommunityInitiativeUpdate,
  updateCommunityInitiative,
  type CreateCommunityInitiativeInput,
  type PostCommunityInitiativeUpdateInput,
  type UpdateCommunityInitiativeInput,
} from '@/lib/api/community-entity-api';
import { realMeta } from './shared';
import type { CommunityQueryMeta } from './shared';

/**
 * A community's initiatives — real since 20 Oct 2026
 * (`GET /communities/{idOrSlug}/initiatives`, backend e57082e).
 *
 * Not gated on the preview flag: the route is served, so a production build
 * reads it exactly as a test build does. The ambassadors switch is a product
 * switch, and where it is off the screen says so rather than showing nothing.
 */
export function useCommunityInitiatives(
  communityId: CommunityId | undefined,
  status?: CommunityInitiativeStatus
): UseQueryResult<CommunityInitiative[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId) && flags.communityAmbassadorsEnabled;

  const result = useQuery({
    queryKey: [...communityDirectoryGapKeys.initiatives(communityId ?? 'none'), 'list', status ?? 'all'],
    queryFn: ({ signal }) => fetchCommunityInitiatives(communityId!, status, signal),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    ...realMeta(result),
    unavailable: !flags.communityAmbassadorsEnabled ? 'feature-disabled' : realMeta(result).unavailable,
  };
}

/** One initiative, with what this caller may do with it (`canJoin`, `canEdit`, `canPostUpdate`). */
export function useCommunityInitiative(
  communityId: CommunityId | undefined,
  initiativeId: string | undefined
): UseQueryResult<CommunityInitiative> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId && initiativeId) && flags.communityAmbassadorsEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.initiative(communityId ?? 'none', initiativeId ?? 'none'),
    queryFn: ({ signal }) => fetchCommunityInitiative(communityId!, initiativeId!, signal),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...result,
    ...realMeta(result),
    unavailable: !flags.communityAmbassadorsEnabled ? 'feature-disabled' : realMeta(result).unavailable,
  };
}

/** Who is taking part, as each chose to be seen. The initiative's count is everybody. */
export function useCommunityInitiativeParticipants(
  communityId: CommunityId | undefined,
  initiativeId: string | undefined
): UseQueryResult<CommunityInitiativeParticipant[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId && initiativeId) && flags.communityAmbassadorsEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.initiativeParticipants(
      communityId ?? 'none',
      initiativeId ?? 'none'
    ),
    queryFn: ({ signal }) =>
      fetchCommunityInitiativeParticipants(communityId!, initiativeId!, signal),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

  return { ...result, ...realMeta(result) };
}

/** Progress updates, newest first. */
export function useCommunityInitiativeUpdates(
  communityId: CommunityId | undefined,
  initiativeId: string | undefined
): UseQueryResult<CommunityInitiativeUpdate[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId && initiativeId) && flags.communityAmbassadorsEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.initiativeUpdates(
      communityId ?? 'none',
      initiativeId ?? 'none'
    ),
    queryFn: ({ signal }) => fetchCommunityInitiativeUpdates(communityId!, initiativeId!, signal),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

  return { ...result, ...realMeta(result) };
}

/**
 * Starting, changing, joining, leaving and posting to an initiative.
 *
 * The server decides who may; the screens draw a control only where the server
 * said so (`canManageInitiatives`, or an initiative's own `canJoin`, `canEdit`
 * and `canPostUpdate`). Every write refetches the initiative's whole family on
 * settle — success, refusal **or no answer at all** — because a write whose
 * answer never arrived may have been applied, and the list is the only way to
 * find out.
 */
export function useCommunityInitiativeMutations(communityId: CommunityId | undefined) {
  const queryClient = useQueryClient();

  const refresh = () => {
    if (communityId) {
      void queryClient.invalidateQueries({
        queryKey: communityDirectoryGapKeys.initiatives(communityId),
      });
    }
  };

  /** The route answers the initiative as it now stands — the one to show. */
  const store = (initiative: CommunityInitiative) => {
    if (communityId) {
      queryClient.setQueryData(
        communityDirectoryGapKeys.initiative(communityId, initiative.id),
        initiative
      );
    }
  };

  const create = useMutation({
    mutationFn: (input: CreateCommunityInitiativeInput) =>
      createCommunityInitiative(communityId!, input),
    onSuccess: store,
    onSettled: refresh,
  });

  const update = useMutation({
    mutationFn: ({
      initiativeId,
      input,
    }: {
      initiativeId: string;
      input: UpdateCommunityInitiativeInput;
    }) => updateCommunityInitiative(communityId!, initiativeId, input),
    onSuccess: store,
    onSettled: refresh,
  });

  const join = useMutation({
    mutationFn: (initiativeId: string) => joinCommunityInitiative(communityId!, initiativeId),
    onSuccess: store,
    onSettled: refresh,
  });

  const leave = useMutation({
    mutationFn: (initiativeId: string) => leaveCommunityInitiative(communityId!, initiativeId),
    onSuccess: store,
    onSettled: refresh,
  });

  const postUpdate = useMutation({
    mutationFn: ({
      initiativeId,
      input,
    }: {
      initiativeId: string;
      input: PostCommunityInitiativeUpdateInput;
    }) => postCommunityInitiativeUpdate(communityId!, initiativeId, input),
    onSettled: refresh,
  });

  return { create, update, join, leave, postUpdate };
}
