// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life repositories (Frontend Phase 12)
//
// This file is §42's repository layer. Every hook here is the *stable domain
// interface* a screen depends on, and each one decides for itself which arm
// answers:
//
//   CommunityLifeRepository        → B12 events/orgs + adapter for the rest
//   MembershipRepository           → development adapter        GAP-001/002
//   RecurringEventsRepository      → development adapter        GAP-004/005
//   DonationRepository             → **B15 for the money**, adapter for context
//   FundraisingRepository          → **B15 for the totals**, adapter for lifecycle
//   VolunteerRepository            → development adapter        GAP-009/010/011
//   PollRepository                 → development adapter        GAP-012
//   OrganizationCommunityRepository→ development adapter        GAP-013/014
//   NeighborhoodEventsRepository   → **B12 for proximity**, adapter for binding
//   AnalyticsRepository            → development adapter        GAP-014/017
//
// Four properties every hook in here holds to, because a screen relies on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented fundraising
//   total without having had the opportunity to mark it. A screen that ignores
//   the flag is a review comment; a screen that never received one is a bug
//   nobody can see. The hybrid hooks report it *per part*, because marking B15's
//   real `raised` figure as simulated would be its own kind of lie.
//
//   **A disabled build is not an error state.** `areCommunityGapsEnabled()` is
//   false in release, and gap queries are disabled rather than left to fail, so
//   a production binary shows "not available yet" rather than a spinner
//   resolving into a network error.
//
//   **Mutations never retry.** Same rule and same reason as `hooks/financial.ts`:
//   a retried application is a double application, and the persisted idempotency
//   key is what makes a *deliberate* retry safe.
//
//   **Nothing financial is concluded here.** A donation's success comes from
//   B15's `GivingStatus`. A membership payment's success comes from re-reading
//   the payment intent. There is no branch in this file that infers a financial
//   outcome from an HTTP 200, and `useMembershipCheckout` is written the long
//   way round precisely to make that impossible.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import * as gapApi from '@/lib/community-gap-api';
import { communityGapKeys } from '@/lib/community-gap-api';
import * as b12 from '@/lib/community-life-api';
import { communityLifeKeys } from '@/lib/community-life-api';
// Frontend Phase 13, §43. The community scope becomes part of the cache key for
// the community-sensitive B12 reads. Imported from the repository layer rather
// than resolved here, so there is one place a scope is computed.
import { useCommunityScope } from './communities';
import { communityScopeToken } from '@/lib/community/scope';
import * as financialApi from '@/lib/financial-api';
import { financialKeys } from '@/lib/financial-api';
import { areCommunityGapsEnabled } from '@/config/community-gaps';
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/idempotency';
import {
  combineOrganizationCapabilities,
  noOrganizationCapabilities,
  resolveCommunityAccess,
  type CommunityAccess,
} from '@/lib/community-access';
import { isGivingSettled, isPaymentSettled, isPaymentSuccessful } from '@/lib/community-state';
import { useAuthStore } from '@/store/auth';
import { useFinancialAccess } from './financial';
import type {
  AnalyticsPeriod,
  CommunityEntityType,
  CommunityPage,
  CommunitySearchParams,
  CommunitySearchResult,
  CreateCampaignRequest,
  CreateEventSeriesRequest,
  CreatePollRequest,
  CreateVolunteerOpportunityRequest,
  DonationDraft,
  MembershipDiscoveryParams,
  OrganizationCapabilities,
  SubmitMembershipApplicationRequest,
  SubmitPollResponseRequest,
  SubmitVolunteerApplicationRequest,
} from '@/types/community-advanced';
import type { CreateDonationRequest, Donation } from '@/types/financial';

// ─────────────────────────────────────────────────────────────────────────────
// Shared query options
// ─────────────────────────────────────────────────────────────────────────────

/** Catalogue-shaped data — tiers, causes, categories — is stable for an hour. */
const REFERENCE_STALE_MS = 60 * 60 * 1000;
/** Discovery lists change as people publish. A minute is plenty. */
const DISCOVERY_STALE_MS = 60 * 1000;
/** Analytics is recomputed on a schedule, never live. */
const ANALYTICS_STALE_MS = 5 * 60 * 1000;
/** Anything with a state machine attached: never served from a stale cache. */
const LIVE_STALE_MS = 0;

const readOptions = { retry: shouldRetryQuery, staleTime: 30_000 } as const;
const mutationOptions = { retry: 0 } as const;

/**
 * How often a live figure is re-read where no realtime channel exists.
 *
 * COMMUNITY-LIFE-GAP-020: B13.2's transport carries conversations only, so
 * campaign progress and poll results are *periodic* rather than live. Thirty
 * seconds is frequent enough that a member watching a campaign sees movement
 * and infrequent enough that a hundred viewers do not become a load problem.
 * The screens say "updated periodically" rather than implying a live feed.
 */
const PROGRESS_POLL_MS = 30_000;

/** Whether this build can reach the community development adapter at all. */
export function useCommunityGapsEnabled(): boolean {
  return areCommunityGapsEnabled();
}

/** The shape every gap-backed read hook returns. Consistent so screens are too. */
interface GapRead<T> {
  data: T;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
  /** Always true for a purely gap-backed read. Screens mark accordingly. */
  isSimulated: boolean;
  isEnabled: boolean;
}

function gapRead<T>(
  query: {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  },
  fallback: T,
  enabled: boolean
): GapRead<T> {
  return {
    data: query.data ?? fallback,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: () => void query.refetch(),
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * A stable string for a params object, so a query key does not churn.
 *
 * Takes `object` rather than an index signature so a plain interface — which is
 * every params type in this phase — can be passed without a cast. Undefined,
 * null and empty values are dropped and the rest sorted, so `{a:1, b:2}` and
 * `{b:2, a:1}` produce one cache entry rather than two.
 */
function fingerprint(params: object): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
}

const emptyPage = <T,>(): CommunityPage<T> => ({ items: [], hasMore: false, nextCursor: null });

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The community capability set.
 *
 * Advisory throughout — it decides what to *draw*. Every action is re-decided
 * by the server, and the organization-level half of the answer comes from
 * `useOrganizationCapabilities`, which fetches rather than computes.
 */
export function useCommunityAccess(): CommunityAccess {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  return useMemo(
    () => resolveCommunityAccess(accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CommunityLifeRepository — the hub, search and recommendations
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The hub's first paint.
 *
 * §47: one call on mount, summaries only. Every rail on this object is short by
 * contract and every deeper list is fetched by the screen that shows it. The
 * `counts` are what let the hub decide *not* to render a rail rather than
 * fetching it to discover it is empty.
 */
export function useCommunityLifeSummary(params: {
  countryCode?: string;
  cityName?: string;
  latitude?: number;
  longitude?: number;
} = {}) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.hub(params.countryCode, params.cityName),
    queryFn: () => gapApi.fetchCommunityLifeSummary(params),
    enabled,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * Community recommendations.
 *
 * §35: B14's surface, not a second engine. The client sends a surface name and
 * renders the ordered list. Nothing here sorts, scores or filters the result.
 */
export function useCommunityRecommendations(surface: string, take = 10) {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.recommendations(surface),
    queryFn: () => gapApi.fetchCommunityRecommendations(surface, take),
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return gapRead(query, [], enabled);
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recommendationId: string) =>
      gapApi.dismissCommunityRecommendation(recommendationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'recommendations'] });
    },
  });
}

/**
 * Unified Community Life search.
 *
 * §40. Events and organizations are searched through **B12's real** query
 * parameters; the other five types go to the adapter. The two result sets are
 * merged here and every row keeps its `source`, so the screen can label which
 * half of a result list is real. The merge order is documented as a client
 * behaviour in the gap register (GAP-021) and is replaced the day a federated
 * route exists.
 */
export function useCommunitySearch(params: CommunitySearchParams, isActive = true) {
  const enabled = areCommunityGapsEnabled();
  const wantsEvents = !params.types?.length || params.types.includes('event');
  const wantsOrgs = !params.types?.length || params.types.includes('organization');
  const hasQuery = params.query.trim().length > 0;

  const eventsQuery = useQuery({
    queryKey: communityLifeKeys.events({
      query: params.query,
      cityName: params.cityName,
      radiusKm: params.maxDistanceKm,
    }),
    queryFn: () =>
      b12.fetchEvents({
        query: params.query,
        cityName: params.cityName,
        radiusKm: params.maxDistanceKm,
        filterType: params.priceBand === 'free' ? 'free' : undefined,
      }),
    enabled: isActive && hasQuery && wantsEvents,
    ...readOptions,
  });

  const orgsQuery = useQuery({
    queryKey: communityLifeKeys.organizations({
      query: params.query,
      cityName: params.cityName,
    }),
    queryFn: () => b12.fetchOrganizations({ query: params.query, cityName: params.cityName }),
    enabled: isActive && hasQuery && wantsOrgs,
    ...readOptions,
  });

  const gapQuery = useQuery({
    queryKey: communityGapKeys.search(fingerprint(params)),
    queryFn: () => gapApi.searchCommunity(params),
    enabled: isActive && hasQuery && enabled,
    ...readOptions,
  });

  const results = useMemo<CommunitySearchResult[]>(() => {
    const rows: CommunitySearchResult[] = [];

    for (const event of eventsQuery.data?.items ?? []) {
      rows.push({
        entityType: 'event',
        entityId: event.id,
        title: event.title,
        subtitle: `${event.date} · ${event.location.areaName}`,
        imageUrl: event.coverImage,
        locationLabel: event.location.cityName,
        distanceKm: event.location.distanceKm ?? null,
        badge: event.category,
        actionRoute: `/community-life/event/${event.id}`,
        source: 'backend',
      });
    }

    for (const org of orgsQuery.data?.items ?? []) {
      rows.push({
        entityType: 'organization',
        entityId: org.id,
        title: org.name,
        subtitle: org.category,
        imageUrl: org.logo,
        locationLabel: org.location.cityName,
        distanceKm: org.location.distanceKm ?? null,
        badge: org.isVerified ? 'Verified' : null,
        actionRoute: `/community-life/org/${org.id}`,
        source: 'backend',
      });
    }

    rows.push(...(gapQuery.data?.items ?? []));

    return rows;
  }, [eventsQuery.data, orgsQuery.data, gapQuery.data]);

  return {
    results,
    /** How many rows came from a certified backend. Shown by the search screen. */
    backendCount: results.filter((row) => row.source === 'backend').length,
    simulatedCount: results.filter((row) => row.source === 'simulated').length,
    isLoading: eventsQuery.isLoading || orgsQuery.isLoading || gapQuery.isLoading,
    isError: eventsQuery.isError && orgsQuery.isError && gapQuery.isError,
    error: (eventsQuery.error ?? orgsQuery.error ?? gapQuery.error) as FinancialError | null,
    refetch: () => {
      void eventsQuery.refetch();
      void orgsQuery.refetch();
      void gapQuery.refetch();
    },
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// B12 passthroughs — real events, organizations and the calendar
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Real B12 events.
 *
 * Not a gap hook: `isSimulated` is false and there is no notice above a list
 * that came from here. §58.2 — extend the existing Events infrastructure — and
 * this is the extension: a typed, cached, error-handled read of the route the
 * screens used to call by hand.
 */
export function useEvents(params: b12.EventQueryParams = {}, isActive = true) {
  // Frontend Phase 13, §21/§43. The community scope joins the key — not the
  // request, which B12 would ignore. Two scopes are two cache entries, so a
  // community switch cannot serve the previous community's events.
  const { scope } = useCommunityScope();
  const scopeToken = communityScopeToken(scope);

  const query = useQuery({
    queryKey: communityLifeKeys.events(params, scopeToken),
    queryFn: () => b12.fetchEvents(params),
    enabled: isActive,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

export function useEvent(eventId: string | undefined) {
  const query = useQuery({
    queryKey: communityLifeKeys.event(eventId ?? ''),
    queryFn: () => b12.fetchEvent(eventId as string),
    enabled: Boolean(eventId),
    ...readOptions,
  });

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

export function useOrganizations(params: b12.OrganizationQueryParams = {}, isActive = true) {
  // Frontend Phase 13, §23/§43. Same reasoning as `useEvents` above.
  const { scope } = useCommunityScope();
  const scopeToken = communityScopeToken(scope);

  const query = useQuery({
    queryKey: communityLifeKeys.organizations(params, scopeToken),
    queryFn: () => b12.fetchOrganizations(params),
    enabled: isActive,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    organizations: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

export function useOrganization(organizationId: string | undefined) {
  const query = useQuery({
    queryKey: communityLifeKeys.organization(organizationId ?? ''),
    queryFn: () => b12.fetchOrganization(organizationId as string),
    enabled: Boolean(organizationId),
    ...readOptions,
  });

  return {
    organization: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

/** Real B12 RSVP. Distinct from registration, which is GAP-005. */
export function useSetRsvp() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ eventId, rsvpStatus }: { eventId: string; rsvpStatus: 'Going' | 'Interested' | 'Maybe' | null }) =>
      b12.setEventRsvp(eventId, rsvpStatus),
    onSuccess: (event) => {
      queryClient.setQueryData(communityLifeKeys.event(event.id), event);
      queryClient.invalidateQueries({ queryKey: ['community-life', 'events'] });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MembershipRepository — GAP-001/002/003
// ═════════════════════════════════════════════════════════════════════════════

export function useMembershipProgramme(organizationId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.programme(organizationId ?? ''),
    queryFn: () => gapApi.fetchMembershipProgramme(organizationId as string),
    enabled: enabled && Boolean(organizationId),
    ...readOptions,
    staleTime: REFERENCE_STALE_MS,
  });

  return {
    programme: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.membershipDiscovery(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      gapApi.discoverMemberships({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && isActive,
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useMyMemberships() {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.myMemberships(),
    queryFn: gapApi.fetchMyMemberships,
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return gapRead(query, [], enabled);
}

export function useMembership(membershipId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.membership(membershipId ?? ''),
    queryFn: () => gapApi.fetchMembership(membershipId as string),
    enabled: enabled && Boolean(membershipId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    membership: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
      const membership = await gapApi.submitMembershipApplication({ ...request, idempotencyKey });

      // Released only on a state the organization has actually decided. A
      // `Pending` application is still in flight from the member's point of
      // view, and a resumed attempt must reuse the key.
      if (membership.status !== 'Pending' && membership.status !== 'PaymentPending') {
        await releaseIdempotencyKey(scope);
      }

      return membership;
    },
    onSuccess: (membership) => {
      queryClient.setQueryData(communityGapKeys.membership(membership.membershipId), membership);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myMemberships() });
      queryClient.invalidateQueries({ queryKey: communityGapKeys.programme(membership.organizationId) });
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'hub'] });
    },
  });
}

export function useCancelMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason?: string }) =>
      gapApi.cancelMembership(membershipId, reason),
    onSuccess: (membership) => {
      queryClient.setQueryData(communityGapKeys.membership(membership.membershipId), membership);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myMemberships() });
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
      //    reconciliation has something to join on — and the day the backend
      //    starts acting on the subject, this call already sends it.
      //    That asymmetry is COMMUNITY-LIFE-GAP-003.
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

      // 4. The community-side binding. GAP-003.
      const membership = await gapApi.attachMembershipPayment(
        input.membershipId,
        settled.paymentIntentId
      );

      return { payment: settled, membership };
    },
    onSuccess: ({ payment, membership }) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });

      if (membership) {
        queryClient.setQueryData(communityGapKeys.membership(membership.membershipId), membership);
        queryClient.invalidateQueries({ queryKey: communityGapKeys.myMemberships() });
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
      const membership = await gapApi.renewMembership(membershipId, idempotencyKey);
      if (membership.status !== 'PaymentPending') await releaseIdempotencyKey(scope);
      return membership;
    },
    onSuccess: (membership) => {
      queryClient.setQueryData(communityGapKeys.membership(membership.membershipId), membership);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myMemberships() });
    },
  });
}

// ── Organization-side membership administration ──────────────────────────────

export function useOrganizationMembers(
  organizationId: string | undefined,
  params: { state?: string; query?: string } = {}
) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.organizationMembers(organizationId ?? '', fingerprint(params)),
    queryFn: ({ pageParam }) =>
      gapApi.fetchOrganizationMembers(organizationId as string, {
        ...params,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && Boolean(organizationId),
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
    isSimulated: true,
    isEnabled: enabled,
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
      decision: gapApi.MembershipDecision;
      reason?: string;
    }) => gapApi.decideMembership(membershipId, decision, reason),
    onSuccess: () => {
      // Deliberately an invalidation rather than a cache write. A decision
      // changes counts on the dashboard and positions in the queue, and
      // patching one row would leave both stale.
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'membership'] });
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: communityGapKeys.dashboard(organizationId) });
      }
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// RecurringEventsRepository — GAP-004/005
// ═════════════════════════════════════════════════════════════════════════════

export function useSeriesList(params: gapApi.SeriesQueryParams = {}, isActive = true) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.seriesList(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      gapApi.fetchSeriesList({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  const series = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    series,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useSeries(seriesId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.series(seriesId ?? ''),
    queryFn: () => gapApi.fetchSeries(seriesId as string),
    enabled: enabled && Boolean(seriesId),
    ...readOptions,
  });

  return {
    series: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * A series' occurrences in a window.
 *
 * §10: expansion is the server's. Nothing in this hook, and nothing downstream
 * of it, computes a date from a recurrence rule — the rule is carried for the
 * *editor* to render, not for the client to evaluate.
 */
export function useOccurrences(
  seriesId: string | undefined,
  params: { from?: string; to?: string } = {}
) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.occurrences(seriesId ?? '', params.from, params.to),
    queryFn: ({ pageParam }) =>
      gapApi.fetchOccurrences(seriesId as string, {
        ...params,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && Boolean(seriesId),
    retry: shouldRetryQuery,
    staleTime: LIVE_STALE_MS,
  });

  const occurrences = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    occurrences,
    upcoming: occurrences.filter((o) => o.status === 'Scheduled' || o.status === 'Rescheduled'),
    past: occurrences.filter((o) => o.status === 'Completed'),
    cancelled: occurrences.filter((o) => o.status === 'Cancelled'),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useOccurrence(occurrenceId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.occurrence(occurrenceId ?? ''),
    queryFn: () => gapApi.fetchOccurrence(occurrenceId as string),
    enabled: enabled && Boolean(occurrenceId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    occurrence: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCreateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateEventSeriesRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'event-series',
        subject: `${request.title}:${request.startDate}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const series = await gapApi.createEventSeries({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return series;
    },
    onSuccess: (series) => {
      queryClient.setQueryData(communityGapKeys.series(series.seriesId), series);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'series'] });
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'hub'] });
    },
  });
}

export function useUpdateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      seriesId,
      request,
    }: {
      seriesId: string;
      request: Parameters<typeof gapApi.updateEventSeries>[1];
    }) => gapApi.updateEventSeries(seriesId, request),
    onSuccess: (series) => {
      queryClient.setQueryData(communityGapKeys.series(series.seriesId), series);
      // An edit at any scope can move or remove occurrences, so the expansion
      // is invalidated wholesale rather than patched.
      queryClient.invalidateQueries({
        queryKey: ['community-gap', 'series', series.seriesId, 'occurrences'],
      });
    },
  });
}

export function useUpdateOccurrence() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      occurrenceId,
      request,
    }: {
      occurrenceId: string;
      request: Parameters<typeof gapApi.updateOccurrence>[1];
    }) => gapApi.updateOccurrence(occurrenceId, request),
    onSuccess: (occurrence) => {
      queryClient.setQueryData(communityGapKeys.occurrence(occurrence.occurrenceId), occurrence);
      queryClient.invalidateQueries({
        queryKey: ['community-gap', 'series', occurrence.seriesId, 'occurrences'],
      });
      queryClient.invalidateQueries({ queryKey: communityGapKeys.series(occurrence.seriesId) });
    },
  });
}

export function useCancelSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ seriesId, reason }: { seriesId: string; reason?: string }) =>
      gapApi.cancelEventSeries(seriesId, reason),
    onSuccess: (series) => {
      queryClient.setQueryData(communityGapKeys.series(series.seriesId), series);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'series'] });
    },
  });
}

// ── Registration ─────────────────────────────────────────────────────────────

export function useMyRegistrations() {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.myRegistrations(),
    queryFn: gapApi.fetchMyRegistrations,
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return gapRead(query, [], enabled);
}

/**
 * Registers for an event or an occurrence.
 *
 * No optimistic update. §47 permits optimistic UI "only for safe operations",
 * and registration is not one: the server may answer `Waitlisted` rather than
 * `Registered`, or refuse because the event filled between the list rendering
 * and the tap. Showing "Registered" and then withdrawing it is worse than a
 * spinner for 400ms.
 */
export function useRegisterForEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<gapApi.RegisterRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'event-registration',
        subject: request.occurrenceId ?? request.eventId ?? 'unknown',
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const registration = await gapApi.registerForEvent({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return registration;
    },
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myRegistrations() });
      if (registration.occurrenceId) {
        queryClient.invalidateQueries({
          queryKey: communityGapKeys.occurrence(registration.occurrenceId),
        });
      }
      if (registration.seriesId) {
        queryClient.invalidateQueries({
          queryKey: ['community-gap', 'series', registration.seriesId, 'occurrences'],
        });
      }
    },
  });
}

export function useCancelRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (registrationId: string) => gapApi.cancelRegistration(registrationId),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myRegistrations() });
      if (registration.occurrenceId) {
        queryClient.invalidateQueries({
          queryKey: communityGapKeys.occurrence(registration.occurrenceId),
        });
      }
    },
  });
}

export function useAttendees(params: { occurrenceId?: string; eventId?: string }) {
  const enabled = areCommunityGapsEnabled();
  const key = params.occurrenceId ?? params.eventId ?? '';

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.attendees(key),
    queryFn: ({ pageParam }) =>
      gapApi.fetchAttendees({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && Boolean(key),
    retry: shouldRetryQuery,
    staleTime: LIVE_STALE_MS,
  });

  return {
    attendees: query.data?.pages.flatMap((page) => page.items) ?? [],
    totalCount: query.data?.pages[0]?.totalCount ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCheckInAttendee(occurrenceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (registrationId: string) => gapApi.checkInAttendee(registrationId),
    onSuccess: () => {
      if (occurrenceId) {
        queryClient.invalidateQueries({ queryKey: communityGapKeys.attendees(occurrenceId) });
      }
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// FundraisingRepository & DonationRepository — GAP-006/007, B15 for the money
// ═════════════════════════════════════════════════════════════════════════════

export function useCampaigns(params: gapApi.CampaignQueryParams = {}, isActive = true) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.campaigns(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      gapApi.fetchCampaigns({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && isActive,
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * One campaign.
 *
 * `refetchInterval` rather than a subscription: GAP-020 means there is no
 * realtime channel for campaign progress, so the figure is periodic and the
 * screen says so. Polling stops when the campaign is in a terminal state,
 * because a closed campaign's total does not move.
 */
export function useCampaign(campaignId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.campaign(campaignId ?? ''),
    queryFn: () => gapApi.fetchCampaign(campaignId as string),
    enabled: enabled && Boolean(campaignId),
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
    /** The campaign record is simulated; `progress` carries its own provenance. */
    isSimulated: true,
    /** GAP-020: the progress figure is periodic, not live. Screens say so. */
    isProgressLive: false,
    isEnabled: enabled,
  };
}

export function useCampaignUpdates(campaignId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.campaignUpdates(campaignId ?? ''),
    queryFn: () => gapApi.fetchCampaignUpdates(campaignId as string),
    enabled: enabled && Boolean(campaignId),
    ...readOptions,
  });

  return gapRead(query, [], enabled);
}

export function useCampaignMilestones(campaignId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.campaignMilestones(campaignId ?? ''),
    queryFn: () => gapApi.fetchCampaignMilestones(campaignId as string),
    enabled: enabled && Boolean(campaignId),
    ...readOptions,
  });

  return gapRead(query, [], enabled);
}

export function useCampaignSupporters(campaignId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.campaignSupporters(campaignId ?? ''),
    queryFn: ({ pageParam }) =>
      gapApi.fetchCampaignSupporters(campaignId as string, {
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && Boolean(campaignId),
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useCampaignFundUsage(campaignId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.campaignFundUsage(campaignId ?? ''),
    queryFn: () => gapApi.fetchCampaignFundUsage(campaignId as string),
    enabled: enabled && Boolean(campaignId),
    ...readOptions,
  });

  return gapRead(query, [], enabled);
}

export function useMyCampaigns(organizationId?: string) {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.myCampaigns(organizationId),
    queryFn: () => gapApi.fetchMyCampaigns(organizationId),
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return gapRead(query, [], enabled);
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
      const campaign = await gapApi.createCampaign({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return campaign;
    },
    onSuccess: (campaign) => {
      queryClient.setQueryData(communityGapKeys.campaign(campaign.campaignId), campaign);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'campaigns'] });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      request,
    }: {
      campaignId: string;
      request: Partial<CreateCampaignRequest>;
    }) => gapApi.updateCampaign(campaignId, request),
    onSuccess: (campaign) => {
      queryClient.setQueryData(communityGapKeys.campaign(campaign.campaignId), campaign);
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
      action: gapApi.CampaignAction;
      reason?: string;
    }) => gapApi.actOnCampaign(campaignId, action, reason),
    onSuccess: (campaign) => {
      queryClient.setQueryData(communityGapKeys.campaign(campaign.campaignId), campaign);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'campaigns'] });
    },
  });
}

export function usePublishCampaignUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      request,
    }: {
      campaignId: string;
      request: { title: string; body: string; mediaUrls?: string[] };
    }) => gapApi.publishCampaignUpdate(campaignId, request),
    onSuccess: (_update, variables) => {
      queryClient.invalidateQueries({
        queryKey: communityGapKeys.campaignUpdates(variables.campaignId),
      });
    },
  });
}

// ── Donations. Real B15 money, simulated campaign context. ───────────────────

/**
 * The real B15 causes.
 *
 * Not a gap hook. `GET /financial/donations/causes` is certified, and it is
 * what a campaign's `causeCode` resolves against. §38: there is no second
 * giving system.
 */
export function useDonationCauses(country?: string, supportKind?: string) {
  const query = useQuery({
    queryKey: financialKeys.causes(country, supportKind),
    queryFn: () => financialApi.fetchDonationCauses({ country, supportKind }),
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    causes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

/**
 * The caller's real giving history.
 *
 * `GET /financial/giving/me`. The one impact figure in this phase that is a
 * fact rather than a simulation. Anonymous donations are absent by
 * construction — B15 stores no donor identifier on one — and the screen says
 * so rather than showing a gap in a list.
 */
export function useGivingHistory(take = 50) {
  const financialAccess = useFinancialAccess();

  const query = useQuery({
    queryKey: financialKeys.giving(),
    queryFn: () => financialApi.fetchGivingHistory({ take }),
    enabled: financialAccess.canReadGiving,
    ...readOptions,
  });

  return {
    history: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    canRead: financialAccess.canReadGiving,
  };
}

/**
 * Donates to a campaign.
 *
 * **The money is real.** `POST /financial/donations` against the campaign's
 * real `causeCode`, with B15's idempotency contract, exactly as Phase 5's
 * giving flow does — this hook does not create a parallel donation path, it
 * calls the same certified route and then records the campaign context.
 *
 * The refusal at the top is the important line: a campaign with no `causeCode`
 * has nowhere certified to collect, and rather than simulating a donation this
 * throws. §45 and §13: a donation is never marked successful from frontend
 * state, and a *simulated* donation would be worse than that — it would be a
 * receipt for money that never moved.
 */
export function useDonateToCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (draft: DonationDraft & { campaignId?: string | null }) => {
      if (!draft.causeCode) {
        throw new Error(
          'This campaign is not connected to a giving cause yet, so it cannot accept donations. ' +
            'See COMMUNITY-LIFE-GAP-006.'
        );
      }

      const scope: OperationScope = {
        operation: 'donation',
        subject: draft.causeCode,
        // Giving the same amount twice on purpose is a thing people do, so the
        // amount discriminates. Two identical amounts inside the key's window
        // still collapse — that is the double-tap case.
        discriminator: `${draft.amountMajor}${draft.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      const request: CreateDonationRequest = {
        amount: draft.amountMajor,
        currency: draft.currency,
        causeCode: draft.causeCode,
        isAnonymous: draft.isAnonymous,
        message: draft.message,
        recurringIntervalMonths: draft.recurringIntervalMonths ?? undefined,
        idempotencyKey,
      };

      // Real B15 route. The status on the response is B15's, not ours.
      const donation: Donation = await financialApi.createDonation(request);

      if (isGivingSettled(donation.status)) {
        await releaseIdempotencyKey(scope);
      }

      // The campaign-side binding. Best effort: the donation is already real
      // and recorded by B15, and failing to label it must not make the member
      // think their money did not arrive.
      if (draft.campaignId && donation.status === 'Completed') {
        try {
          await gapApi.attachCampaignDonation(draft.campaignId, donation.donationId);
        } catch {
          // Swallowed deliberately. See above — the receipt is B15's and is
          // unaffected. The missing link is a reporting gap, not a money gap.
        }
      }

      return donation;
    },
    onSuccess: (donation, variables) => {
      queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
      if (donation.payment) {
        queryClient.setQueryData(
          financialKeys.payment(donation.payment.paymentIntentId),
          donation.payment
        );
      }
      if (donation.status === 'Completed') {
        queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });
        if (variables.campaignId) {
          queryClient.invalidateQueries({ queryKey: communityGapKeys.campaign(variables.campaignId) });
        }
      }
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// VolunteerRepository — GAP-009/010/011
// ═════════════════════════════════════════════════════════════════════════════

export function useOpportunities(params: gapApi.OpportunityQueryParams = {}, isActive = true) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.opportunities(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      gapApi.fetchOpportunities({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && isActive,
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
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useOpportunity(opportunityId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.opportunity(opportunityId ?? ''),
    queryFn: () => gapApi.fetchOpportunity(opportunityId as string),
    enabled: enabled && Boolean(opportunityId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    opportunity: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useMyVolunteerApplications() {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.myApplications(),
    queryFn: gapApi.fetchMyVolunteerApplications,
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return gapRead(query, [], enabled);
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
      const application = await gapApi.submitVolunteerApplication({ ...request, idempotencyKey });
      if (application.status !== 'Pending') await releaseIdempotencyKey(scope);
      return application;
    },
    onSuccess: (application) => {
      queryClient.setQueryData(communityGapKeys.application(application.applicationId), application);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myApplications() });
      queryClient.invalidateQueries({
        queryKey: communityGapKeys.opportunity(application.opportunityId),
      });
    },
  });
}

export function useWithdrawVolunteerApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (applicationId: string) => gapApi.withdrawVolunteerApplication(applicationId),
    onSuccess: (application) => {
      queryClient.setQueryData(communityGapKeys.application(application.applicationId), application);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.myApplications() });
      queryClient.invalidateQueries({
        queryKey: communityGapKeys.opportunity(application.opportunityId),
      });
    },
  });
}

export function useMyAssignments() {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.myAssignments(),
    queryFn: gapApi.fetchMyAssignments,
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return gapRead(query, [], enabled);
}

export function useVolunteerHours() {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.volunteerHours(),
    queryFn: gapApi.fetchVolunteerHours,
    enabled: enabled && isAuthenticated,
    ...readOptions,
    staleTime: ANALYTICS_STALE_MS,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
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
      const opportunity = await gapApi.createOpportunity({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return opportunity;
    },
    onSuccess: (opportunity) => {
      queryClient.setQueryData(communityGapKeys.opportunity(opportunity.opportunityId), opportunity);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'volunteer'] });
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
    }) => gapApi.actOnOpportunity(opportunityId, action),
    onSuccess: (opportunity) => {
      queryClient.setQueryData(communityGapKeys.opportunity(opportunity.opportunityId), opportunity);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'volunteer'] });
    },
  });
}

export function useApplicants(opportunityId: string | undefined, state?: string) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.applicants(opportunityId ?? '', state),
    queryFn: ({ pageParam }) =>
      gapApi.fetchApplicants(opportunityId as string, {
        state,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && Boolean(opportunityId),
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
    isSimulated: true,
    isEnabled: enabled,
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
      decision: gapApi.VolunteerDecision;
      reason?: string;
    }) => gapApi.decideVolunteerApplication(applicationId, decision, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'volunteer'] });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: communityGapKeys.opportunity(opportunityId) });
      }
    },
  });
}

export function useAssignVolunteer(opportunityId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: { applicationId: string; shiftId?: string }) =>
      gapApi.assignVolunteer(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'volunteer'] });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: communityGapKeys.opportunity(opportunityId) });
      }
    },
  });
}

export function useConfirmVolunteerHours() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ assignmentId, hours }: { assignmentId: string; hours: number }) =>
      gapApi.confirmVolunteerHours(assignmentId, hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'volunteer'] });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PollRepository — GAP-012
// ═════════════════════════════════════════════════════════════════════════════

export function usePolls(params: gapApi.PollQueryParams = {}, isActive = true) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.polls(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      gapApi.fetchPolls({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    polls: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function usePoll(pollId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.poll(pollId ?? ''),
    queryFn: () => gapApi.fetchPoll(pollId as string),
    enabled: enabled && Boolean(pollId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    poll: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * A poll's results.
 *
 * §24: computed by the server, never by the client. There is no arithmetic in
 * this hook, in the component that renders it, or anywhere downstream — the
 * percentages on screen are the ones the server sent.
 *
 * Polls while open, because a live result is the interesting case, and stops
 * once closed. GAP-020 again: periodic, not live, and the screen says so.
 */
export function usePollResult(pollId: string | undefined, isOpen = true) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.pollResult(pollId ?? ''),
    queryFn: () => gapApi.fetchPollResult(pollId as string),
    enabled: enabled && Boolean(pollId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
    refetchInterval: isOpen ? PROGRESS_POLL_MS : false,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isLive: false,
    isEnabled: enabled,
  };
}

/**
 * Casts a vote.
 *
 * No optimistic update, deliberately. A vote can be refused — the poll closed,
 * the caller is outside the audience, the caller already voted — and showing a
 * filled bar that then snaps back would be worse than a 300ms spinner. The
 * response *is* the result, so the confirmation screen renders what the server
 * counted.
 */
export function useSubmitPollResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<SubmitPollResponseRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = { operation: 'poll-vote', subject: request.pollId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const result = await gapApi.submitPollResponse({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return result;
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(communityGapKeys.pollResult(variables.pollId), result);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.poll(variables.pollId) });
    },
  });
}

export function useCreatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreatePollRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'poll-create',
        subject: `${request.organizationId ?? 'personal'}:${request.question}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const poll = await gapApi.createPoll({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return poll;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData(communityGapKeys.poll(poll.pollId), poll);
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'polls'] });
    },
  });
}

export function usePollAction() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      pollId,
      action,
    }: {
      pollId: string;
      action: 'publish' | 'close' | 'cancel' | 'publish-results';
    }) => gapApi.actOnPoll(pollId, action),
    onSuccess: (poll) => {
      queryClient.setQueryData(communityGapKeys.poll(poll.pollId), poll);
      queryClient.invalidateQueries({ queryKey: communityGapKeys.pollResult(poll.pollId) });
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'polls'] });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// OrganizationCommunityRepository — GAP-013/014
// ═════════════════════════════════════════════════════════════════════════════

export function useMyOrganizations() {
  const enabled = areCommunityGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityGapKeys.myOrganizations(),
    queryFn: gapApi.fetchMyOrganizations,
    enabled: enabled && isAuthenticated,
    ...readOptions,
  });

  return gapRead(query, [], enabled);
}

/**
 * What the caller may do in this organization.
 *
 * Fetched, then intersected with the platform ladder — a Restricted account
 * loses write capabilities even where the organization granted them. The
 * intersection can only ever *remove*, which is what keeps §19 true: there is
 * no path through this hook that grants a capability the server did not.
 *
 * Before the server answers, the value is `noOrganizationCapabilities` — every
 * flag false — so a dashboard renders nothing management-related during the
 * first paint rather than flashing controls and withdrawing them.
 */
export function useOrganizationCapabilities(organizationId: string | undefined): {
  capabilities: OrganizationCapabilities;
  isLoading: boolean;
  isSimulated: boolean;
  isEnabled: boolean;
  refetch: () => void;
} {
  const enabled = areCommunityGapsEnabled();
  const access = useCommunityAccess();

  const query = useQuery({
    queryKey: communityGapKeys.capabilities(organizationId ?? ''),
    queryFn: () => gapApi.fetchOrganizationCapabilities(organizationId as string),
    enabled: enabled && Boolean(organizationId),
    ...readOptions,
  });

  const capabilities = useMemo(() => {
    const granted = query.data ?? noOrganizationCapabilities(organizationId ?? '');
    return combineOrganizationCapabilities(granted, access);
  }, [query.data, organizationId, access]);

  return {
    capabilities,
    isLoading: query.isLoading,
    isSimulated: true,
    isEnabled: enabled,
    refetch: () => void query.refetch(),
  };
}

export function useOrganizationDashboard(organizationId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.dashboard(organizationId ?? ''),
    queryFn: () => gapApi.fetchOrganizationDashboard(organizationId as string),
    enabled: enabled && Boolean(organizationId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    dashboard: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useOrganizationAnalytics(
  organizationId: string | undefined,
  period: AnalyticsPeriod
) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.orgAnalytics(organizationId ?? '', period),
    queryFn: () => gapApi.fetchOrganizationAnalytics(organizationId as string, period),
    enabled: enabled && Boolean(organizationId),
    ...readOptions,
    staleTime: ANALYTICS_STALE_MS,
  });

  return {
    analytics: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useAssignOrganizationRole(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      gapApi.assignOrganizationRole(organizationId as string, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'membership'] });
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: communityGapKeys.capabilities(organizationId) });
      }
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// NeighborhoodEventsRepository — GAP-015
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Events near a point.
 *
 * **Entirely real.** B12's event list accepts `latitude`, `longitude` and
 * `radiusKm` and computes `distanceKm` server-side, so proximity discovery
 * needs no adapter at all. This is the hook a neighbourhood screen should
 * prefer; `useNeighborhoodEvents` below is for the *named* neighbourhood case,
 * which is the simulated part.
 */
export function useNearbyEvents(
  params: { latitude?: number; longitude?: number; radiusKm?: number; cityName?: string },
  isActive = true
) {
  const hasPoint = typeof params.latitude === 'number' && typeof params.longitude === 'number';

  const query = useQuery({
    queryKey: communityLifeKeys.events({ ...params, sortBy: 'distance' }),
    queryFn: () =>
      b12.fetchEvents({
        latitude: params.latitude,
        longitude: params.longitude,
        radiusKm: params.radiusKm,
        cityName: hasPoint ? undefined : params.cityName,
        sortBy: 'distance',
        timeFilter: 'upcoming',
      }),
    enabled: isActive && (hasPoint || Boolean(params.cityName)),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    /** Real B12 proximity. The distances on these events are server-computed. */
    isSimulated: false,
    hasLocation: hasPoint,
  };
}

export function useNeighborhoodEvents(neighborhoodId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.neighborhoodEvents(neighborhoodId ?? ''),
    queryFn: ({ pageParam }) =>
      gapApi.fetchNeighborhoodEvents(neighborhoodId as string, {
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: enabled && Boolean(neighborhoodId),
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    /** The binding is simulated; each event inside is a real B12 record. */
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useNeighborhoodActivity(neighborhoodId: string | undefined) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.neighborhoodActivity(neighborhoodId ?? ''),
    queryFn: () => gapApi.fetchNeighborhoodActivity(neighborhoodId as string),
    enabled: enabled && Boolean(neighborhoodId),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    activity: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Announcements & AnalyticsRepository — GAP-016/017
// ═════════════════════════════════════════════════════════════════════════════

export function useAnnouncements(params: { scope?: string; scopeId?: string } = {}) {
  const enabled = areCommunityGapsEnabled();

  const query = useInfiniteQuery({
    queryKey: communityGapKeys.announcements(params.scope ?? 'all', params.scopeId),
    queryFn: ({ pageParam }) =>
      gapApi.fetchAnnouncements({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    announcements: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function usePublishAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: Parameters<typeof gapApi.publishAnnouncement>[0]) =>
      gapApi.publishAnnouncement(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'announcements'] });
    },
  });
}

/**
 * The impact view.
 *
 * Every figure on the returned object is `Sourced`. Exactly one is real today —
 * the member's own giving, which the screen reads separately from
 * `useGivingHistory` — and the rest are simulated and marked. §34: do not
 * invent metrics; where they are unavailable, say so.
 */
export function useCommunityImpact(params: {
  scope: 'member' | 'organization' | 'neighborhood' | 'country';
  scopeId?: string;
  period: AnalyticsPeriod;
}) {
  const enabled = areCommunityGapsEnabled();

  const query = useQuery({
    queryKey: communityGapKeys.impact(params.scope, params.scopeId ?? 'me', params.period),
    queryFn: () => gapApi.fetchCommunityImpact(params),
    enabled,
    ...readOptions,
    staleTime: ANALYTICS_STALE_MS,
  });

  return {
    impact: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Cache maintenance
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Drops every Community Life cache entry.
 *
 * Called on sign-out. The next member on this device must not inherit the last
 * one's memberships, applications or draft campaigns — and the gap namespace
 * has to go with the B12 namespace, because "my memberships" and "the events I
 * saved" are equally personal.
 */
export function clearCommunityCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: communityGapKeys.all });
  queryClient.removeQueries({ queryKey: communityLifeKeys.all });
}

/** The entity types Community Life search and the hub can surface. */
export const COMMUNITY_ENTITY_TYPES: CommunityEntityType[] = [
  'event',
  'series',
  'organization',
  'membership',
  'campaign',
  'opportunity',
  'poll',
  'announcement',
];

/** A stable callback for screens that need to invalidate after a deep action. */
export function useInvalidateCommunity() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: communityGapKeys.all });
    queryClient.invalidateQueries({ queryKey: communityLifeKeys.all });
  }, [queryClient]);
}
