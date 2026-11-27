// Trust hooks: verifications. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  assignVerification,
  fetchMyVerifications,
  fetchVerification,
  fetchVerificationQueue,
  reviewVerification,
  submitCountryVerification,
  submitDiasporaVerification,
  submitIdentityVerification,
  trustKeys,
  type VerificationListFilters,
  type VerificationQueueFilters,
} from '@/lib/api/trust-api';
import type {
  ReviewVerificationBody,
  SubmitCountryVerificationBody,
  SubmitDiasporaVerificationBody,
  SubmitIdentityVerificationBody,
  VerificationType,
  WireVerification,
  WireVerificationDetail,
  WireVerificationQueueItem,
} from '@/types/trust';
import {
  QUEUE_STALE_MS,
  SELF_STALE_MS,
  invalidateVerifications,
  messageFor,
  shouldRetry,
} from './shared';

// ── Invalidation ─────────────────────────────────────────────────────────────
//
// One helper per fact that changes, rather than a list at each mutation.
// Getting this wrong here is not cosmetic: a member who has just submitted a
// verification and still sees "Unverified" on the Trust Centre has no way to
// tell whether the submission failed.

/** Everything about the caller's own standing. A grant changes all of it. */
function invalidateSelf(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: trustKeys.profile() });
  void client.invalidateQueries({ queryKey: trustKeys.timeline() });
  void client.invalidateQueries({ queryKey: trustKeys.badges() });
  void client.invalidateQueries({ queryKey: trustKeys.reputation() });
  // Every feature-requirements key, whatever country it was scoped to.
  void client.invalidateQueries({ queryKey: trustKeys.featureRequirementsAll() });
}

// ── Verifications ────────────────────────────────────────────────────────────

export interface UseMyVerificationsResult {
  verifications: WireVerification[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
  /** The newest verification of one type, or null. */
  latestOfType: (type: VerificationType) => WireVerification | null;
}

/** `GET /trust/verifications`. */
export function useMyVerifications(
  filters: VerificationListFilters = {},
  options: { enabled?: boolean } = {}
): UseMyVerificationsResult {
  const query = useQuery({
    queryKey: trustKeys.verificationList(filters),
    queryFn: () => fetchMyVerifications(filters),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const verifications = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    verifications,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && verifications.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
    latestOfType: (type) => {
      const matching = verifications.filter((item) => item.type === type);
      if (matching.length === 0) return null;
      return matching.reduce((newest, item) =>
        Date.parse(item.submittedAt) > Date.parse(newest.submittedAt) ? item : newest
      );
    },
  };
}

export interface UseVerificationResult {
  detail: WireVerificationDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/verifications/{id}`.
 *
 * `documents[].documentUrl` is minted per request and lives ten minutes.
 * Refetching is how a screen gets a working link again; caching the URL beyond
 * that is how a member sees a broken image.
 */
export function useVerification(verificationId: string | null): UseVerificationResult {
  const query = useQuery({
    queryKey: trustKeys.verification(verificationId ?? ''),
    queryFn: () => fetchVerification(verificationId as string),
    enabled: Boolean(verificationId),
    // Shorter than the rest of this module on purpose: the presigned document
    // links in this payload expire after ten minutes.
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseSubmitVerificationResult {
  submitDiaspora: (body: SubmitDiasporaVerificationBody) => Promise<WireVerification>;
  submitIdentity: (body: SubmitIdentityVerificationBody) => Promise<WireVerification>;
  submitCountry: (body: SubmitCountryVerificationBody) => Promise<WireVerification>;
  isPending: boolean;
  error: string | null;
}

/**
 * The three submission routes.
 *
 * One hook rather than three because a wizard uses exactly one of them and the
 * caller should not have to know which shape of hook it needs.
 */
export function useSubmitVerification(): UseSubmitVerificationResult {
  const client = useQueryClient();

  const onSubmitted = (created: WireVerification) => {
    client.setQueryData(trustKeys.verification(created.verificationId), undefined);
    invalidateVerifications(client);
    invalidateSelf(client);
  };

  // Not retried, and not because of idempotency alone. There is no idempotency
  // key on these routes, and the server refuses a second open request of the
  // same type with a 409 — so a retry after a successful-but-unacknowledged
  // call reports a duplicate error for a submission that actually worked.
  const diaspora = useMutation({
    mutationFn: submitDiasporaVerification,
    retry: false,
    onSuccess: onSubmitted,
  });

  const identity = useMutation({
    mutationFn: submitIdentityVerification,
    retry: false,
    onSuccess: onSubmitted,
  });

  const country = useMutation({
    mutationFn: submitCountryVerification,
    retry: false,
    onSuccess: onSubmitted,
  });

  return {
    submitDiaspora: (body) => diaspora.mutateAsync(body),
    submitIdentity: (body) => identity.mutateAsync(body),
    submitCountry: (body) => country.mutateAsync(body),
    isPending: diaspora.isPending || identity.isPending || country.isPending,
    error: messageFor(diaspora) ?? messageFor(identity) ?? messageFor(country),
  };
}

export interface UseVerificationQueueResult {
  items: WireVerificationQueueItem[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /trust/verifications/queue`. Staff only — a 403 for everyone else. */
export function useVerificationQueue(
  filters: VerificationQueueFilters = {},
  options: { enabled?: boolean } = {}
): UseVerificationQueueResult {
  const query = useQuery({
    queryKey: trustKeys.verificationQueue(filters),
    queryFn: () => fetchVerificationQueue(filters),
    enabled: options.enabled ?? true,
    staleTime: QUEUE_STALE_MS,
    retry: shouldRetry,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    items,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && items.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseVerificationReviewResult {
  assign: (verificationId: string, release?: boolean) => Promise<WireVerification>;
  review: (verificationId: string, body: ReviewVerificationBody) => Promise<WireVerification>;
  isPending: boolean;
  error: string | null;
}

/** The two staff actions on a verification. */
export function useVerificationReview(): UseVerificationReviewResult {
  const client = useQueryClient();

  const assignment = useMutation({
    mutationFn: (input: { verificationId: string; release: boolean }) =>
      assignVerification(input.verificationId, { release: input.release }),
    retry: false,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: trustKeys.verification(input.verificationId) });
      invalidateVerifications(client);
    },
  });

  const decision = useMutation({
    mutationFn: (input: { verificationId: string; body: ReviewVerificationBody }) =>
      reviewVerification(input.verificationId, input.body),
    retry: false,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: trustKeys.verification(input.verificationId) });
      invalidateVerifications(client);
    },
  });

  return {
    assign: (verificationId, release = false) =>
      assignment.mutateAsync({ verificationId, release }),
    review: (verificationId, body) => decision.mutateAsync({ verificationId, body }),
    isPending: assignment.isPending || decision.isPending,
    error: messageFor(assignment) ?? messageFor(decision),
  };
}
