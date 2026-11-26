// Creator economy hooks: grants. ./index.ts is the overview of the whole module.

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
import { LIVE_STALE_MS, REFERENCE_STALE_MS, mutationOptions, readOptions } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// CreatorGrantRepository — CREATOR-GAP-005
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityGrants(params: { category?: string; country?: string; state?: string } = {}) {
  const query = useQuery({
    queryKey: creatorGapKeys.grants(params.category, params.state),
    queryFn: () => certifiedApi.fetchGrants(params),
    ...readOptions,
  });

  return {
    grants: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useCommunityGrant(grantId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.grant(grantId ?? 'none'),
    queryFn: () => certifiedApi.fetchGrant(grantId!),
    enabled: Boolean(grantId),
    ...readOptions,
  });

  return {
    grant: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/** The application form, as data. §24: the app does not hard-code the questions. */
export function useGrantForm(grantId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.grantForm(grantId ?? 'none'),
    queryFn: () => certifiedApi.fetchGrantForm(grantId!),
    enabled: Boolean(grantId),
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    form: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useGrantApplications() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.grantApplications(),
    queryFn: certifiedApi.fetchGrantApplications,
    enabled: isAuthenticated,
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    applications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * One grant application by id — `GET /grants/applications/{applicationId}`,
 * since 20 Oct 2026. The applicant's own (or a reviewer's once submitted); a
 * 404 otherwise, which the screen shows as the server's answer.
 */
export function useGrantApplication(applicationId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.grantApplication(applicationId ?? 'none'),
    queryFn: () => certifiedApi.fetchGrantApplication(applicationId!),
    enabled: isAuthenticated && Boolean(applicationId),
    staleTime: LIVE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    application: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useGrantApplicationActions() {
  const queryClient = useQueryClient();

  const settle = useCallback(
    (application: { applicationId: string }) => {
      queryClient.setQueryData(creatorGapKeys.grantApplication(application.applicationId), application);
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.grantApplications() });
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.grantsAll() });
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
    [queryClient]
  );

  const saveDraft = useMutation({
    ...mutationOptions,
    mutationFn: ({ grantId, answers }: { grantId: string; answers: Record<string, string> }) =>
      certifiedApi.saveGrantDraft(grantId, answers),
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
      const application = await certifiedApi.submitGrantApplication({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return application;
    },
    onSuccess: settle,
  });

  const withdraw = useMutation({
    ...mutationOptions,
    mutationFn: (applicationId: string) => certifiedApi.withdrawGrantApplication(applicationId),
    onSuccess: settle,
  });

  return { saveDraft, submit, withdraw };
}
