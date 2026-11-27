// Trust hooks: eligibility. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { evaluateEligibility, fetchFeatureRequirements, trustKeys } from '@/lib/api/trust-api';
import type {
  EvaluateEligibilityBody,
  TrustCapabilityKey,
  WireEligibilityDecision,
  WireFeatureRequirement,
} from '@/types/trust';
import { SELF_STALE_MS, messageFor, shouldRetry } from './shared';

// ── Eligibility ──────────────────────────────────────────────────────────────

export interface UseFeatureRequirementsResult {
  requirements: WireFeatureRequirement[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  requirementFor: (featureId: TrustCapabilityKey) => WireFeatureRequirement | null;
}

/**
 * `GET /trust/feature-requirements`.
 *
 * The server-side replacement for `TrustEngine.getFeatureUnlockRequirements`,
 * which computed the same checklist on the device from `GOVERNANCE_CONFIG` —
 * thresholds shipped to every phone and editable by anyone with a debugger.
 * That code is still there for instant feedback; this is the answer that
 * decides.
 */
export function useFeatureRequirements(
  targetCountry?: string | null,
  options: { enabled?: boolean } = {}
): UseFeatureRequirementsResult {
  const query = useQuery({
    queryKey: trustKeys.featureRequirements(targetCountry),
    queryFn: () => fetchFeatureRequirements(targetCountry),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const requirements = useMemo(() => query.data ?? [], [query.data]);

  return {
    requirements,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
    requirementFor: (featureId) =>
      requirements.find((item) => item.featureId === featureId) ?? null,
  };
}

export interface UseEligibilityCheckResult {
  /**
   * Ask the server whether the caller may act.
   *
   * Pass `dryRun: false` **only at the moment the member commits** — that call
   * consumes one of their daily permits for the capability, and a screen that
   * greys out a button with a live check has spent a permit for a button
   * nobody pressed.
   */
  check: (body: EvaluateEligibilityBody) => Promise<WireEligibilityDecision>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/eligibility`.
 *
 * A mutation, and uncached, for the two reasons in this file's header. The
 * client's own `TrustEngine.evaluateAction` still runs for instant feedback;
 * this is what the submit button should wait for.
 */
export function useEligibilityCheck(): UseEligibilityCheckResult {
  const mutation = useMutation({
    mutationFn: evaluateEligibility,
    // A retried non-dry-run check spends a second permit to ask the same
    // question. The member would be rate-limited by their own client.
    retry: false,
  });

  return {
    check: (body) => mutation.mutateAsync(body),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}
