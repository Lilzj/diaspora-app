// Community Life hooks: volunteering. ./index.ts is the overview of the whole module.

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
  CreateVolunteerOpportunityRequest,
  SubmitVolunteerApplicationRequest,
} from '@/types/community-advanced';
import {
  ANALYTICS_STALE_MS,
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  backendRead,
  fingerprint,
  mutationOptions,
  readOptions,
} from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// VolunteerRepository — GAP-009/010/011
// ═════════════════════════════════════════════════════════════════════════════

export function useOpportunities(params: b18.OpportunityQueryParams = {}, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.opportunities(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchOpportunities({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    opportunities: query.data?.pages.flatMap((page) => page.items) ?? [],
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

export function useOpportunity(opportunityId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.opportunity(opportunityId ?? ''),
    queryFn: () => b18.fetchOpportunity(opportunityId as string),
    enabled: Boolean(opportunityId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    opportunity: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useMyVolunteerApplications() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myApplications(),
    queryFn: b18.fetchMyVolunteerApplications,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

export function useSubmitVolunteerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<SubmitVolunteerApplicationRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'volunteer-application',
        subject: `${request.opportunityId}:${request.shiftId ?? 'any'}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const application = await b18.submitVolunteerApplication({ ...request, idempotencyKey });
      if (application.status !== 'Pending') await releaseIdempotencyKey(scope);
      return application;
    },
    onSuccess: (application) => {
      queryClient.setQueryData(communityProgrammeKeys.application(application.applicationId), application);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myApplications() });
      void queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.opportunity(application.opportunityId),
      });
    },
  });
}

export function useWithdrawVolunteerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (applicationId: string) => b18.withdrawVolunteerApplication(applicationId),
    onSuccess: (application) => {
      queryClient.setQueryData(communityProgrammeKeys.application(application.applicationId), application);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myApplications() });
      void queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.opportunity(application.opportunityId),
      });
    },
  });
}

export function useMyAssignments() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myAssignments(),
    queryFn: b18.fetchMyAssignments,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

export function useVolunteerHours() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.volunteerHours(),
    queryFn: b18.fetchVolunteerHours,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: ANALYTICS_STALE_MS,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

// ── Organizer side ───────────────────────────────────────────────────────────

export function useCreateOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateVolunteerOpportunityRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'volunteer-opportunity',
        subject: `${request.organizationId}:${request.title}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const opportunity = await b18.createOpportunity({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return opportunity;
    },
    onSuccess: (opportunity) => {
      queryClient.setQueryData(communityProgrammeKeys.opportunity(opportunity.opportunityId), opportunity);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.volunteerAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubOpportunitiesAll() });
    },
  });
}

export function useOpportunityAction() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      opportunityId,
      action,
    }: {
      opportunityId: string;
      action: 'publish' | 'close' | 'cancel';
    }) => b18.actOnOpportunity(opportunityId, action),
    onSuccess: (opportunity) => {
      queryClient.setQueryData(communityProgrammeKeys.opportunity(opportunity.opportunityId), opportunity);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.volunteerAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubOpportunitiesAll() });
    },
  });
}

export function useApplicants(opportunityId: string | undefined, state?: string) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.applicants(opportunityId ?? '', state),
    queryFn: ({ pageParam }) =>
      b18.fetchApplicants(opportunityId as string, {
        state,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: Boolean(opportunityId),
    retry: shouldRetryQuery,
    staleTime: LIVE_STALE_MS,
  });

  return {
    applicants: query.data?.pages.flatMap((page) => page.items) ?? [],
    totalCount: query.data?.pages[0]?.totalCount ?? null,
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

export function useDecideVolunteerApplication(opportunityId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      applicationId,
      decision,
      reason,
    }: {
      applicationId: string;
      decision: b18.VolunteerDecision;
      reason?: string;
    }) => b18.decideVolunteerApplication(applicationId, decision, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.volunteerAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubOpportunitiesAll() });
      if (opportunityId) {
        void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.opportunity(opportunityId) });
      }
    },
  });
}

export function useAssignVolunteer(opportunityId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: { applicationId: string; shiftId?: string }) =>
      b18.assignVolunteer(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.volunteerAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubOpportunitiesAll() });
      if (opportunityId) {
        void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.opportunity(opportunityId) });
      }
    },
  });
}

export function useConfirmVolunteerHours() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ assignmentId, hours }: { assignmentId: string; hours: number }) =>
      b18.confirmVolunteerHours(assignmentId, hours),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.volunteerAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubOpportunitiesAll() });
    },
  });
}
