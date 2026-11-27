// Community Life hooks: campaigns. ./index.ts is the overview of the whole module.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { useAuthStore } from '@/store/auth';
import type {
  CampaignFundUsage,
  CampaignUpdate,
  CreateCampaignRequest,
} from '@/types/community-advanced';
import {
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  PROGRESS_POLL_MS,
  backendRead,
  fingerprint,
  mutationOptions,
  readOptions,
} from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// FundraisingRepository & DonationRepository — B15.1 for the campaign, B15 for
// the money.
//
// ── Remediation Wave C-04. COMMUNITY-LIFE-GAP-006, -007 and -008 ────────────
//
// Every hook below used to call `gapApi` and report `isSimulated: true`. B15.1
// shipped the campaign aggregate, its twelve-state machine, the transparency
// surface and a real recurring-donation scheduler, and B18 mapped the campaign
// URLs at the register's own paths — so these now call `b18` and report
// `isSimulated: false`. Nothing about the screens' shape changed, which was the
// entire point of building them against the declared contract.
//
// **What did not move, and must not be claimed as moved.** The campaign-side
// *donation stitch* — `attachCampaignDonation` and the campaign's own donation
// list — has no backend route and is still `gapApi`. It is also no longer
// load-bearing on the real arm: a published campaign has a real `causeCode`, a
// donation against that code is an ordinary B15 donation, and `GET
// /financial/giving/me` is the member's authoritative history. The stitch
// survives for the development arm and is marked where it is used.
//
// **Money still never concludes here.** A donation's success comes from B15's
// `GivingStatus` and nowhere else; the campaign response's `canDonate` is the
// server's answer to "may money be given right now", and this file does not
// reassemble it from `status` and `causeCode`.
// ═════════════════════════════════════════════════════════════════════════════

export function useCampaigns(params: b18.ProgrammeCampaignQueryParams = {}, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.campaigns(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchCampaigns({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    campaigns: query.data?.pages.flatMap((page) => page.items) ?? [],
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

/**
 * One campaign.
 *
 * `refetchInterval` rather than a subscription: GAP-020 means there is still no
 * realtime channel for campaign progress, so the figure is periodic and the
 * screen says so. That gap did **not** close with this wave — the numbers are
 * real now and the delivery is still a poll. Polling stops when the campaign is
 * in a terminal state, because a closed campaign's total does not move.
 */
export function useCampaign(campaignId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.campaign(campaignId ?? ''),
    queryFn: () => b18.fetchCampaign(campaignId as string),
    enabled: Boolean(campaignId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const isLive = status === 'Active' || status === 'Published' || status === 'GoalReached';
      return isLive ? PROGRESS_POLL_MS : false;
    },
  });

  return {
    campaign: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    /** The campaign and every figure on it are B15's. */
    isSimulated: false,
    /** GAP-020, still open: the progress figure is periodic, not live. */
    isProgressLive: false,
    isEnabled: true,
  };
}

/**
 * A campaign's timeline.
 *
 * Cursor-paged on the wire and read one page at a time here, which is what the
 * story tab has always rendered. `hasMore` is surfaced so a screen can offer the
 * next page rather than silently showing the first twenty as though they were
 * all of them.
 */
export function useCampaignUpdates(campaignId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.campaignUpdates(campaignId ?? ''),
    queryFn: () => b18.fetchCampaignUpdates(campaignId as string),
    enabled: Boolean(campaignId),
    ...readOptions,
  });

  return {
    ...backendRead(
      { ...query, data: query.data?.items },
      [] as CampaignUpdate[]
    ),
    hasMore: query.data?.hasMore ?? false,
  };
}

export function useCampaignMilestones(campaignId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.campaignMilestones(campaignId ?? ''),
    queryFn: () => b18.fetchCampaignMilestones(campaignId as string),
    enabled: Boolean(campaignId),
    ...readOptions,
  });

  return backendRead(query, []);
}

export function useCampaignSupporters(campaignId: string | undefined) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.campaignSupporters(campaignId ?? ''),
    queryFn: ({ pageParam }) =>
      b18.fetchCampaignSupporters(campaignId as string, {
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: Boolean(campaignId),
    retry: shouldRetryQuery,
  });

  return {
    supporters: query.data?.pages.flatMap((page) => page.items) ?? [],
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

/**
 * Where a campaign's money is.
 *
 * **Returns the whole envelope, not just the lines.** The register declared this
 * route as a list of allocation lines and the contract answers five totals
 * around them, each with a different authority — `raised` is B15's, `allocated`
 * is the organizer's intent, and only `disbursedVerified` is spending a settled
 * payout backs. Returning the lines alone would have thrown away the one figure
 * that separates a claim from a fact.
 *
 * `null` rather than an empty envelope while it loads or after a failure: there
 * is no honest zero for "raised", and a screen must render the absence rather
 * than a set of noughts.
 */
export function useCampaignFundUsage(campaignId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.campaignFundUsage(campaignId ?? ''),
    queryFn: () => b18.fetchCampaignFundUsage(campaignId as string),
    enabled: Boolean(campaignId),
    ...readOptions,
  });

  return backendRead<CampaignFundUsage | null>(query, null);
}

export function useMyCampaigns(organizationId?: string) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myCampaigns(organizationId),
    queryFn: () => b18.fetchMyCampaigns(organizationId),
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateCampaignRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'campaign-create',
        subject: `${request.title}:${request.targetAmount}${request.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const campaign = await b18.createCampaign({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return campaign;
    },
    onSuccess: (campaign) => {
      queryClient.setQueryData(communityProgrammeKeys.campaign(campaign.campaignId), campaign);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.campaignsAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubCampaignsAll() });
    },
  });
}

/**
 * Edits a campaign's own text.
 *
 * The parameter type is `b18.UpdateCampaignFields` and **not**
 * `Partial<CreateCampaignRequest>`, which is what it used to be. The update
 * contract binds eleven fields and the create contract has seven more;
 * `beneficiaryName`, `currency`, `organizationId` and the rest are accepted by
 * the router and dropped by the binder, so the old type let a screen offer an
 * edit the server would answer 200 to and ignore.
 */
export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      request,
    }: {
      campaignId: string;
      request: b18.UpdateCampaignFields;
    }) => b18.updateCampaign(campaignId, request),
    onSuccess: (campaign) => {
      queryClient.setQueryData(communityProgrammeKeys.campaign(campaign.campaignId), campaign);
    },
  });
}

export function useCampaignAction() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      action,
      reason,
    }: {
      campaignId: string;
      action: b18.ProgrammeCampaignAction;
      reason?: string;
    }) => b18.actOnCampaign(campaignId, action, reason),
    onSuccess: (campaign) => {
      queryClient.setQueryData(communityProgrammeKeys.campaign(campaign.campaignId), campaign);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.campaignsAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubCampaignsAll() });
    },
  });
}

/**
 * Publishes an update to a campaign's supporters.
 *
 * Takes `mediaReferences` — B5 asset identifiers — because that is what the
 * contract stores. It used to take `mediaUrls`, which would have written a URL
 * into a field the rest of the platform resolves as an asset id.
 */
export function usePublishCampaignUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async ({
      campaignId,
      request,
    }: {
      campaignId: string;
      request: { title: string; body: string; mediaReferences?: string[] };
    }) => {
      const scope: OperationScope = {
        operation: 'campaign-update-publish',
        subject: `${campaignId}:${request.title}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const update = await b18.publishCampaignUpdate(campaignId, { ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return update;
    },
    onSuccess: (_update, variables) => {
      void queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.campaignUpdates(variables.campaignId),
      });
    },
  });
}

/**
 * Declares a campaign's milestones.
 *
 * **Replaces the whole set.** A caller sending one row removes the rest; supply
 * the existing `milestoneId` to keep a row and its reached-ness. There is no
 * `isReached` to send — whether a milestone is reached is the server's stamp
 * against the cause's authoritative total.
 */
export function useSetCampaignMilestones() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      milestones,
    }: {
      campaignId: string;
      milestones: { milestoneId?: string; label: string; targetAmount: number }[];
    }) => b18.setCampaignMilestones(campaignId, milestones),
    onSuccess: (milestones, variables) => {
      queryClient.setQueryData(
        communityProgrammeKeys.campaignMilestones(variables.campaignId),
        milestones
      );
    },
  });
}

/**
 * Declares how a campaign's money is allocated.
 *
 * A `withdrawalId` is checked against the caller's own settled withdrawals
 * before it is stored — one the caller does not own is refused rather than
 * recorded — which is why `isPlatformVerified` on the response is a fact rather
 * than an echo of what was sent.
 */
export function useSetCampaignFundUsage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      lines,
    }: {
      campaignId: string;
      lines: {
        id?: string;
        label: string;
        allocated: number;
        spent?: number | null;
        note?: string | null;
        withdrawalId?: string;
      }[];
    }) => b18.setCampaignFundUsage(campaignId, lines),
    onSuccess: (usage, variables) => {
      queryClient.setQueryData(
        communityProgrammeKeys.campaignFundUsage(variables.campaignId),
        usage
      );
    },
  });
}
