// Community Life hooks: memberships. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { communityGapKeys } from '@/lib/api/community-gap-api';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import * as financialApi from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { isPaymentSettled, isPaymentSuccessful } from '@/lib/domain/community-state';
import { useAuthStore } from '@/store/auth';
import type {
  MembershipDiscoveryParams,
  SubmitMembershipApplicationRequest,
} from '@/types/community-advanced';
import {
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  REFERENCE_STALE_MS,
  backendRead,
  fingerprint,
  mutationOptions,
  readOptions,
} from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// MembershipRepository — GAP-001/002/003, BACKEND CONNECTED (Wave C-04)
//
// Every read and every write below now lands on `Diaspora.Modules.CommunityProgramme`
// under `/api/v1/communities` — the register's own declared paths, which B18
// implemented verbatim. The hooks did not change shape, which is what the
// repository split was for: the screens above them are untouched.
//
// Three things the server now decides that the simulation used to:
//
//   **Eligibility.** `requirements[].isMet` on every tier is evaluated
//   server-side per caller on each read. Nothing here computes one.
//
//   **Visibility.** A `Private` or `InviteOnly` programme is *absent* from
//   discovery for a caller who may not see it, rather than present with a flag.
//   So there is no client-side filter, and adding one would be a regression.
//
//   **The decision.** `POST …/decision` is role-gated and answers 403 rather
//   than filtering. The hidden button remains a convenience; the refusal is the
//   control.
// ═════════════════════════════════════════════════════════════════════════════

export function useMembershipProgramme(organizationId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.programme(organizationId ?? ''),
    queryFn: () => b18.fetchMembershipProgramme(organizationId as string),
    enabled: Boolean(organizationId),
    ...readOptions,
    staleTime: REFERENCE_STALE_MS,
  });

  return {
    programme: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * Membership discovery, paged.
 *
 * §47: an infinite query rather than a list, because the discovery surface
 * spans every organization on the platform and loading it in one go is the
 * waterfall the brief prohibits.
 */
export function useMembershipDiscovery(params: MembershipDiscoveryParams, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.membershipDiscovery(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.discoverMemberships({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  const programmes = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    programmes,
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

export function useMyMemberships() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myMemberships(),
    queryFn: b18.fetchMyMemberships,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

export function useMembership(membershipId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.membership(membershipId ?? ''),
    queryFn: () => b18.fetchMembership(membershipId as string),
    enabled: Boolean(membershipId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    membership: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * Submits a membership application.
 *
 * §52: the idempotency key is scoped to the *tier*, not to the moment. Applying
 * to the same tier twice within the key's window is a double tap; applying to a
 * different tier is a different operation and gets its own key. The key is
 * released once the application reaches a state the organization has decided,
 * because until then a retry should resume rather than duplicate.
 */
export function useSubmitMembershipApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<SubmitMembershipApplicationRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'membership-application',
        subject: `${request.organizationId}:${request.tierId}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const membership = await b18.submitMembershipApplication({ ...request, idempotencyKey });

      // Released only on a state the organization has actually decided. A
      // `Pending` application is still in flight from the member's point of
      // view, and a resumed attempt must reuse the key.
      if (membership.status !== 'Pending' && membership.status !== 'PaymentPending') {
        await releaseIdempotencyKey(scope);
      }

      return membership;
    },
    onSuccess: (membership) => {
      queryClient.setQueryData(communityProgrammeKeys.membership(membership.membershipId), membership);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.programme(membership.organizationId) });
      void queryClient.invalidateQueries({ queryKey: communityGapKeys.hubAll() });
    },
  });
}

export function useCancelMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason?: string }) =>
      b18.cancelMembership(membershipId, reason),
    onSuccess: (membership) => {
      queryClient.setQueryData(communityProgrammeKeys.membership(membership.membershipId), membership);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
    },
  });
}

/**
 * The paid membership checkout.
 *
 * The most safety-critical flow in this phase, and written the long way round
 * on purpose. The order is:
 *
 *   1. Create a **real** B15 payment intent.
 *   2. Authorize it. Capture it.
 *   3. **Re-read it** from B15. This is the only thing that may say the member
 *      paid — §8 forbids trusting the capture call's own response, because a
 *      capture that times out has an unknown outcome and a client that treated
 *      the timeout as failure would charge the member twice on retry.
 *   4. Only if the authoritative status is `Captured` or `Settled`, record the
 *      community-side binding (GAP-003) and let the *server* decide activation.
 *
 * The membership returned is the server's, never a locally constructed one. If
 * step 4 fails after step 3 succeeded, the member has paid and is not yet
 * active — which is a real reconciliation state, is surfaced as
 * `PaymentPending`, and is exactly what the gap register asks the backend to
 * close with a settlement event.
 */
export function useMembershipCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (input: {
      membershipId: string;
      tierId: string;
      amount: number;
      currency: string;
      methodKind?: string;
      countryCode?: string;
    }) => {
      const scope: OperationScope = {
        operation: 'membership-payment',
        subject: `${input.membershipId}:${input.tierId}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      // 1. Real B15 payment intent.
      //
      //    `subjectType`/`subjectId` are sent even though B15 does not yet act
      //    on a `CommunityMembership` subject. B15 stores them, so the payment
      //    carries its purpose in the ledger from day one and the eventual
      //    reconciliation has something to join on.
      //
      //    Wave C-04: that day arrived. Step 4 below now posts to a real route,
      //    and the *server* reads B15's own record of the intent before it will
      //    activate anything.
      const intent = await financialApi.createPaymentIntent({
        amount: input.amount,
        currency: input.currency,
        methodKind: input.methodKind ?? 'Card',
        description: 'Community membership',
        subjectType: 'CommunityMembership',
        subjectId: input.membershipId,
        countryCode: input.countryCode,
        idempotencyKey,
      });

      // 2. Authorize and capture — both real B15 routes.
      const authorized = await financialApi.authorizePayment(intent.paymentIntentId);
      if (String(authorized.status) === 'Authorized') {
        await financialApi.capturePayment(intent.paymentIntentId);
      }

      // 3. The authoritative read. Nothing before this line may conclude that
      //    the member paid.
      const settled = await financialApi.fetchPaymentIntent(intent.paymentIntentId);

      if (isPaymentSettled(settled.status)) {
        await releaseIdempotencyKey(scope);
      }

      if (!isPaymentSuccessful(settled.status)) {
        // Not an exception: a declined card is an outcome, and the screen
        // renders it as `PaymentFailed` with a retry rather than as a crash.
        return { payment: settled, membership: null };
      }

      // 4. The community-side binding — `POST /communities/memberships/{id}/payments`,
      //    which was COMMUNITY-LIFE-GAP-003 and is now a real route.
      //
      //    **This client still does not decide that the member paid.** It hands
      //    over an identifier; `MembershipSettlement` re-reads the intent from
      //    B15 and refuses anything that has not actually settled. Both halves
      //    now check, which is the correct amount of paranoia for the one flow
      //    on this surface that takes money.
      const membership = await b18.attachMembershipPayment(
        input.membershipId,
        settled.paymentIntentId
      );

      return { payment: settled, membership };
    },
    onSuccess: ({ payment, membership }) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      void queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });

      if (membership) {
        queryClient.setQueryData(communityProgrammeKeys.membership(membership.membershipId), membership);
        void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
      }
    },
  });
}

export function useRenewMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (membershipId: string) => {
      const scope: OperationScope = { operation: 'membership-renewal', subject: membershipId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const membership = await b18.renewMembership(membershipId, idempotencyKey);
      if (membership.status !== 'PaymentPending') await releaseIdempotencyKey(scope);
      return membership;
    },
    onSuccess: (membership) => {
      queryClient.setQueryData(communityProgrammeKeys.membership(membership.membershipId), membership);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
    },
  });
}

// ── Organization-side membership administration ──────────────────────────────

export function useOrganizationMembers(
  organizationId: string | undefined,
  params: { state?: string; query?: string } = {}
) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.organizationMembers(organizationId ?? '', fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchOrganizationMembers(organizationId as string, {
        ...params,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: Boolean(organizationId),
    retry: shouldRetryQuery,
    staleTime: LIVE_STALE_MS,
  });

  const members = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    members,
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

export function useDecideMembership(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      membershipId,
      decision,
      reason,
    }: {
      membershipId: string;
      decision: b18.MembershipDecision;
      reason?: string;
    }) => b18.decideMembership(membershipId, decision, reason),
    onSuccess: () => {
      // Deliberately an invalidation rather than a cache write. A decision
      // changes counts on the dashboard and positions in the queue, and
      // patching one row would leave both stale.
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.membershipAll() });
      if (organizationId) {
        void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.dashboard(organizationId) });
      }
    },
  });
}
