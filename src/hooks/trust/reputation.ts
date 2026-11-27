// Trust hooks: reputation. ./index.ts is the overview of the whole module.

import { useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchMyReputation,
  fetchMyReputationEvents,
  fetchReputationRules,
  recordConfirmation,
  trustKeys,
} from '@/lib/api/trust-api';
import type {
  RecordConfirmationBody,
  WireConfirmation,
  WireReputationDimension,
  WireReputationEvent,
  WireReputationProfile,
  WireReputationRule,
} from '@/types/trust';
import { useReputationStore } from '@/store/reputation';
import { SELF_STALE_MS, messageFor, shouldRetry } from './shared';

// ── Reputation ───────────────────────────────────────────────────────────────

export interface UseReputationResult {
  reputation: WireReputationProfile | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/reputation/me`. Never 404s — a new member is a `Member` on zero.
 *
 * The one fetch of this route in the app. Every result is mirrored into
 * `store/reputation.ts`, which `lib/trustEngine.ts` reads synchronously; the
 * store used to fetch for itself, and the Profile tab and the reputation screen
 * paid for the same profile twice.
 */
export function useMyReputation(options: { enabled?: boolean } = {}): UseReputationResult {
  const hydrate = useReputationStore((state) => state.hydrateFromReputationProfile);

  const query = useQuery({
    queryKey: trustKeys.reputation(),
    queryFn: fetchMyReputation,
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  useEffect(() => {
    if (query.data) hydrate(query.data);
  }, [query.data, hydrate]);

  return {
    reputation: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseReputationRulesResult {
  /** Empty until loaded, and on a server that does not serve the rules. */
  rules: WireReputationRule[];
  isLoading: boolean;
  error: string | null;
}

/**
 * `GET /trust/reputation/rules`. What the platform pays reputation for.
 *
 * Fetched once a session: the rules change only with a deployment, and the
 * Trust client is held to ten requests a minute, so the reputation screen's
 * third request is paid the first time it opens and never again.
 */
export function useReputationRules(options: { enabled?: boolean } = {}): UseReputationRulesResult {
  const query = useQuery({
    queryKey: trustKeys.reputationRules(),
    queryFn: fetchReputationRules,
    enabled: options.enabled ?? true,
    staleTime: Infinity,
    retry: shouldRetry,
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

export interface UseReputationEventsResult {
  events: WireReputationEvent[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
}

/** `GET /trust/reputation/me/events`. The real points ledger. */
export function useMyReputationEvents(
  filters: { dimension?: WireReputationDimension | null; pageSize?: number | null } = {},
  options: { enabled?: boolean } = {}
): UseReputationEventsResult {
  const query = useQuery({
    queryKey: trustKeys.reputationEvents(filters.dimension, filters.pageSize),
    queryFn: () => fetchMyReputationEvents(filters),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const events = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    events,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && events.length === 0,
    error: messageFor(query),
  };
}

export interface UseRecordConfirmationResult {
  confirm: (body: RecordConfirmationBody) => Promise<WireConfirmation>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/contributions/confirmations`.
 *
 * Replaces the invented `POST /trust/community-voting`. **It pays nobody**:
 * since 21 Oct 2026 (CS-3) the route records the confirmation and answers
 * `pointsAwarded: 0`, because it paid an author the client named for a target
 * nothing checked. A confirmation is scored from the corroborating reaction
 * instead, which pays the author Community itself names. Nothing of the
 * caller's changes, so nothing is invalidated. No screen calls this.
 */
export function useRecordConfirmation(): UseRecordConfirmationResult {
  const mutation = useMutation({
    mutationFn: recordConfirmation,
    retry: false,
  });

  return {
    confirm: (body) => mutation.mutateAsync(body),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}
