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

import { joinRsvpsToEvents } from '@/lib/my-rsvps';
import * as gapApi from '@/lib/community-gap-api';
import { communityGapKeys } from '@/lib/community-gap-api';
// Remediation Wave C-04. `Diaspora.Modules.CommunityProgramme` shipped the
// membership programme, volunteering, polls, organization capabilities and
// announcements at the register's own paths under `/api/v1/communities`, so the
// arms below moved off `gapApi` and onto this one. What stays on `gapApi` stays
// there because B18 does not serve it — the hub summary, recommendations, event
// registration, neighbourhood bindings and the campaign wrapper's donation
// stitching — and each of those is still marked simulated on the screen.
//
// Deliberately **not** `community-social-api.ts`. That module serves
// `Diaspora.Modules.Community` (`/api/v1/community`, singular) — the social
// graph — which is a different domain with a nearly identical name. The two are
// never merged here.
import * as b18 from '@/lib/community-programme-api';
import { communityProgrammeKeys } from '@/lib/community-programme-api';
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
  CampaignFundUsage,
  CampaignUpdate,
  CommunityEntityType,
  CommunityPage,
  CommunitySearchParams,
  CommunitySearchResult,
  CreateCampaignRequest,
  DonationTimeSeries,
  RecurringDonation,
  CreateEventSeriesRequest,
  CreatePollRequest,
  CreateVolunteerOpportunityRequest,
  DonationDraft,
  MembershipDiscoveryParams,
  OrganizationAnalytics,
  OrganizationCapabilities,
  OrganizationDashboard,
  OrganizationRole,
  SubmitMembershipApplicationRequest,
  SubmitPollResponseRequest,
  SubmitVolunteerApplicationRequest,
} from '@/types/community-advanced';
import { backed } from '@/types/community-advanced';
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
 * The same envelope as `gapRead`, for a read that a certified contract answers.
 *
 * Two differences, and both are the point. `isSimulated` is **false**, so the
 * screen stops drawing the gap notice over data that is now real. And
 * `isEnabled` is unconditionally true, because a backend-served read does not
 * depend on `areCommunityGapsEnabled()` — the whole reason for that switch was
 * to keep simulated records out of a release binary, and there is nothing
 * simulated left on these paths to keep out.
 */
function backendRead<T>(
  query: {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  },
  fallback: T
): GapRead<T> {
  return {
    data: query.data ?? fallback,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: () => void query.refetch(),
    isSimulated: false,
    isEnabled: true,
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
 * -- Remediation Wave I: the federated route the register asked for exists -----
 *
 * This hook's own docstring used to end "...and is replaced the day a federated
 * route exists". **That day has been and gone.**
 * `GET /api/v1/communities/search`
 * (`CommunityProgramme/Api/PollAndAnnouncementEndpoints.cs:239`) is real,
 * certified, and is the *only* route on the whole platform that returns a
 * server-computed `relevance` score on each row
 * (`Application/Search/CommunitySearchQuery.cs:122-126`, `:312-344`). The
 * certified client for it -- `searchCommunityProgramme` -- had already been
 * written, and had **no caller**: this hook was still asking the development
 * adapter, so five of the seven types on the Community Life search screen were
 * simulated rows on a build that permits simulation, and nothing at all on a
 * build that does not.
 *
 * So the third arm now goes to the real route. What that changes for a member:
 * membership programmes, volunteer opportunities, polls and announcements are
 * really searched, really ranked by the server, and no longer disappear in a
 * production build.
 *
 * -- What is still concatenated here, and why that is not a ranking -----------
 *
 * Three arms, not one: B12's events, B12's organisations, and B18's four types.
 * The federated route is explicit that it will not do the first two --
 * *"this module does not re-implement a search over another module's rows"*
 * (`CommunitySearchQuery.cs:22`) -- and it names them rather than dropping them
 * silently: a client asking for `event`, `series` or `organization` gets nothing
 * back for those types by design.
 *
 * The three result sets are therefore **concatenated, and the screen groups them
 * by type**. They are deliberately not interleaved by score, because only one of
 * the three carries one: B12's event and organisation searches rank server-side
 * and then strip the score from the response DTO. Sorting the merged list by a
 * number this client invented would present an ordering as relevance that no
 * server computed -- which is the one thing a search surface must not do.
 *
 * -- The two types that have no search anywhere -------------------------------
 *
 * `series` and `campaign`. `GET /community-life/events/series` exists and binds
 * `q`, so series *could* be searched by a further arm; campaigns are B15.1's and
 * do not exist at all. Both used to be answered by the adapter. The hook now
 * reports them through `unsearchableTypes` so the screen can say which filters
 * cannot be honoured, rather than showing an empty list that reads as "nothing
 * matched".
 */
export function useCommunitySearch(params: CommunitySearchParams, isActive = true) {
  const enabled = areCommunityGapsEnabled();
  const wantsEvents = !params.types?.length || params.types.includes('event');
  const wantsOrgs = !params.types?.length || params.types.includes('organization');
  const hasQuery = params.query.trim().length > 0;

  // Remediation Wave J. `radiusKm` is gone and `filterType` became `free`.
  //
  // `GET /community-life/events` binds neither a radius nor a discovery bucket.
  // `maxDistanceKm` therefore cannot be honoured at all — it is not dropped in
  // favour of a rename, it is dropped because there is nothing on the route to
  // rename it to, and it is out of the cache key for the same reason: two
  // requests that differ only by a parameter the server never sees are one
  // request, and keying them apart would have split the cache for nothing.
  //
  // The price band survives: `free` is a real binding (`:143`).
  const eventsQuery = useQuery({
    queryKey: communityLifeKeys.events({
      query: params.query,
      cityName: params.cityName,
      free: params.priceBand === 'free' ? true : undefined,
    }),
    queryFn: () =>
      b12.fetchEvents({
        query: params.query,
        cityName: params.cityName,
        free: params.priceBand === 'free' ? true : undefined,
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

  // The federated arm. Certified as of Remediation Wave I --
  // `searchCommunityProgramme` sends `q`, `types` and `take` under the names the
  // route binds (they are not `query`, `type` and `limit`) and returns the
  // server's `relevance` order unchanged.
  const federatedQuery = useQuery({
    queryKey: communityProgrammeKeys.search(fingerprint(params)),
    queryFn: () =>
      b18.searchCommunityProgramme({
        query: params.query,
        types: params.types,
        cityName: params.cityName,
        priceBand: params.priceBand === 'any' ? undefined : params.priceBand,
      }),
    enabled: isActive && hasQuery,
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

    // Appended, not interleaved. These four types arrive in the server's own
    // relevance order and keep it; the events and organisations above keep
    // theirs. Nothing here compares a poll to an event, because nothing on the
    // wire says how.
    rows.push(...(federatedQuery.data?.items ?? []));

    return rows;
  }, [eventsQuery.data, orgsQuery.data, federatedQuery.data]);

  return {
    results,
    /**
     * How many rows came from a certified backend.
     *
     * All of them, now. Kept rather than deleted because the screen renders it
     * beside `simulatedCount`, and a count that is always zero next to a count
     * that is always the total is a *statement*: this search stopped being half
     * a simulation.
     */
    backendCount: results.filter((row) => row.source === 'backend').length,
    simulatedCount: results.filter((row) => row.source === 'simulated').length,
    /**
     * Types the platform cannot search, whatever the member types.
     *
     * `series` has a route that binds `q` but no arm here yet; `campaign` has no
     * backend at all. Named so the screen can say so -- an empty result list
     * under a "Fundraising" filter would read as "there are no fundraisers",
     * which is a claim nobody checked.
     */
    unsearchableTypes: UNSEARCHABLE_COMMUNITY_TYPES,
    isLoading: eventsQuery.isLoading || orgsQuery.isLoading || federatedQuery.isLoading,
    isError: eventsQuery.isError && orgsQuery.isError && federatedQuery.isError,
    error: (eventsQuery.error ?? orgsQuery.error ?? federatedQuery.error) as FinancialError | null,
    refetch: () => {
      void eventsQuery.refetch();
      void orgsQuery.refetch();
      void federatedQuery.refetch();
    },
    /**
     * Whether this build may reach the community development adapter.
     *
     * **No longer what gates this search.** All three arms are certified, so the
     * screen must not refuse to run when simulation is off; it is returned so the
     * screen can keep rendering whatever notice it renders for a build that has
     * the adapter available for *other* surfaces.
     */
    isEnabled: enabled,
  };
}

/**
 * The Community Life entity types no route can search.
 *
 * `series` -- `GET /community-life/events/series` binds `q`, so this is a
 * missing *arm* rather than a missing capability, and it is listed so that stays
 * visible rather than becoming a quiet zero.
 * `campaign` -- B15.1's, and it does not exist in either repository.
 */
const UNSEARCHABLE_COMMUNITY_TYPES: readonly CommunityEntityType[] = ['series', 'campaign'];

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

/**
 * The real RSVP contract.
 *
 * Remediation Wave A′: `null` is no longer a status but a *withdrawal*, and it
 * routes to `DELETE .../rsvp` rather than to a partial update carrying a null.
 * `'Maybe'` is gone — the platform has never had it.
 *
 * The mutation now returns an `RsvpRecord` rather than an `Event`, so the cache
 * update writes the event key by id from the arguments instead of from the
 * response. That is not a loss: the record carries the *stored* status, which is
 * the authoritative answer when the server waitlists a member who asked to go.
 */
/**
 * What the caller said they would go to.
 *
 * **`GET /rsvps/mine` was served and consumed by nothing.** A member could RSVP
 * to an event and then had nowhere to see what they had committed to: the
 * commitment existed on the server and nowhere a person could look.
 *
 * The join happens here rather than in the screen, because the route answers
 * the RSVPs and their events as two arrays and a join written twice eventually
 * disagrees with itself. Pages are flattened before joining so an event summary
 * on page one still finds its RSVP on page two — the server repeats summaries
 * per page, and joining page by page would drop a row whose event happened to
 * arrive in a different one.
 */
export function useMyRsvps(options: { upcomingOnly?: boolean } = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const upcomingOnly = options.upcomingOnly ?? true;

  const query = useInfiniteQuery({
    queryKey: communityLifeKeys.myRsvps(upcomingOnly),
    queryFn: ({ pageParam }) =>
      b12.fetchMyRsvps({ upcomingOnly, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isAuthenticated,
    retry: shouldRetryQuery,
  });

  const rsvps = useMemo(() => {
    const pages = query.data?.pages ?? [];

    return joinRsvpsToEvents({
      items: pages.flatMap((page) => page.items ?? []),
      events: pages.flatMap((page) => page.events ?? []),
      hasMore: false,
    });
  }, [query.data]);

  return {
    rsvps,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

/**
 * Sets how many places an event has. Organisers only.
 *
 * **Invalidates the event, because capacity changes what everyone else sees.**
 * Lowering a maximum below the current count makes an event full, which flips
 * `isFull` and turns every other viewer’s “Going” button into “Join the
 * waitlist”. Patching the cache locally would leave the organiser’s own screen
 * right and every list stale.
 */
/**
 * Announces the organisation.
 *
 * Invalidates the organisation itself and the directory lists: a published
 * organisation is a new arrival everywhere it was previously absent, which is
 * the whole point of publishing it.
 */
export function usePublishOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ organizationId }: { organizationId: string }) =>
      b12.publishOrganization(organizationId),
    onSuccess: (organization) => {
      queryClient.invalidateQueries({
        queryKey: ['community-life', 'organization', organization.organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ['community-life', 'organizations'] });
    },
  });
}

/**
 * Announces the organiser's event.
 *
 * Invalidates the discovery lists as well as the event: a published event is a
 * new arrival everywhere it was previously absent, and the whole point of
 * publishing is that other people can now find it.
 */
export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ eventId }: { eventId: string }) => b12.publishEvent(eventId),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(event.id) });
      queryClient.invalidateQueries({ queryKey: ['community-life', 'events'] });
    },
  });
}

export function useSetEventCapacity() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      eventId,
      capacity,
      baseRevision,
    }: {
      eventId: string;
      /** Null is uncapped, and it is not zero. */
      capacity: number | null;
      baseRevision?: number;
    }) => b12.setEventCapacity(eventId, capacity, baseRevision),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(event.id) });
      queryClient.invalidateQueries({ queryKey: ['community-life', 'events'] });
    },
  });
}

export function useSetRsvp() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      eventId,
      rsvpStatus,
    }: {
      eventId: string;
      rsvpStatus: 'Going' | 'Interested' | null;
    }) =>
      rsvpStatus === null
        ? b12.withdrawEventRsvp(eventId)
        : b12.setEventRsvp(eventId, rsvpStatus),
    onSuccess: (rsvp) => {
      // The event's own `viewerRsvpStatus` is now stale, and so is any list that
      // renders it. Invalidating rather than patching keeps the server's answer
      // authoritative — including a `Waitlisted` the client did not ask for.
      queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(rsvp.eventId) });
      queryClient.invalidateQueries({ queryKey: ['community-life', 'events'] });

      // And the member's own list of what they are going to, which is the
      // whole point of answering an RSVP. Without this the "Going to" screen
      // shows yesterday's commitments after somebody makes a new one.
      queryClient.invalidateQueries({ queryKey: ['community-life', 'rsvps', 'mine'] });
    },
  });
}

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
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.programme(membership.organizationId) });
      queryClient.invalidateQueries({ queryKey: ['community-gap', 'hub'] });
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
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
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
      queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });

      if (membership) {
        queryClient.setQueryData(communityProgrammeKeys.membership(membership.membershipId), membership);
        queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
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
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myMemberships() });
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'membership'] });
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.dashboard(organizationId) });
      }
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// RecurringEventsRepository — GAP-004 BACKEND CONNECTED, GAP-005 still a gap
//
// The series half moved to B12's real `/community-life/events/series*` routes
// in Wave C-04. Series expansion is genuinely the server's: nothing in these
// hooks, and nothing downstream, evaluates a recurrence rule — the rule is
// carried so the *editor* can render it, and B12 writes the dates.
//
// **The registration half below is still simulated**, and stays on `gapApi`.
// B12 has RSVP on a single event; an occurrence registration with a waitlist
// position, a guest count and a check-in is COMMUNITY-LIFE-GAP-005 and no route
// serves it. Those hooks keep `isSimulated: true` and their screens keep the
// notice.
// ═════════════════════════════════════════════════════════════════════════════

export function useSeriesList(params: b18.SeriesQueryParams = {}, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.seriesList(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchSeriesList({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
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
    isSimulated: false,
    isEnabled: true,
  };
}

export function useSeries(seriesId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.series(seriesId ?? ''),
    queryFn: () => b18.fetchSeries(seriesId as string),
    enabled: Boolean(seriesId),
    ...readOptions,
  });

  return {
    series: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
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
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.occurrences(seriesId ?? '', params.from, params.to),
    queryFn: ({ pageParam }) =>
      b18.fetchOccurrences(seriesId as string, {
        ...params,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: Boolean(seriesId),
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
    isSimulated: false,
    isEnabled: true,
  };
}

export function useOccurrence(occurrenceId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.occurrence(occurrenceId ?? ''),
    queryFn: () => b18.fetchOccurrence(occurrenceId as string),
    enabled: Boolean(occurrenceId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    occurrence: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
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
      const series = await b18.createEventSeries({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return series;
    },
    onSuccess: (series) => {
      queryClient.setQueryData(communityProgrammeKeys.series(series.seriesId), series);
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'series'] });
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
      request: Parameters<typeof b18.updateEventSeries>[1];
    }) => b18.updateEventSeries(seriesId, request),
    onSuccess: (series) => {
      queryClient.setQueryData(communityProgrammeKeys.series(series.seriesId), series);
      // An edit at any scope can move or remove occurrences, so the expansion
      // is invalidated wholesale rather than patched.
      queryClient.invalidateQueries({
        queryKey: ['community-programme', 'series', series.seriesId, 'occurrences'],
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
      request: Parameters<typeof b18.updateOccurrence>[1];
    }) => b18.updateOccurrence(occurrenceId, request),
    onSuccess: (occurrence) => {
      queryClient.setQueryData(communityProgrammeKeys.occurrence(occurrence.occurrenceId), occurrence);
      queryClient.invalidateQueries({
        queryKey: ['community-programme', 'series', occurrence.seriesId, 'occurrences'],
      });
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.series(occurrence.seriesId) });
    },
  });
}

export function useCancelSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ seriesId, reason }: { seriesId: string; reason?: string }) =>
      b18.cancelEventSeries(seriesId, reason),
    onSuccess: (series) => {
      queryClient.setQueryData(communityProgrammeKeys.series(series.seriesId), series);
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'series'] });
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

/**
 * A campaign's giving over time.
 *
 * Keyed on the **cause code**, because that is what the route is keyed on — and
 * a campaign has one only once it is published, so a caller passing `undefined`
 * for an unpublished campaign gets a disabled query rather than a 404.
 *
 * The response states the window it actually covers, which may be narrower than
 * the one asked for: a request wider than the deployment's maximum is clamped
 * rather than refused. A chart must label its axis from the response.
 */
export function useDonationTimeSeries(
  causeCode: string | undefined | null,
  params: { from?: string; to?: string } = {}
) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.donationTimeSeries(causeCode ?? '', params.from, params.to),
    queryFn: () => b18.fetchDonationTimeSeries(causeCode as string, params),
    enabled: Boolean(causeCode),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead<DonationTimeSeries | null>(query, null);
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'campaigns'] });
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'campaigns'] });
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
      queryClient.invalidateQueries({
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

// ── Recurring donations — COMMUNITY-LIFE-GAP-008 ────────────────────────────

/**
 * The caller's standing donations.
 *
 * Every state, cancelled ones included: a donor who stopped a monthly gift is
 * entitled to see that it stopped, and hiding it would look as though the
 * cancellation had lost the record.
 *
 * This is what GAP-008 was waiting for. The donation sheet used to say the
 * interval was "recorded as an intention and not yet scheduled" and no screen
 * showed a next-charge date, because nothing would have honoured one. There is
 * now a sweep that charges through the ordinary payment path, and
 * `nextChargeAt` is a date the platform intends to keep.
 */
export function useMyRecurringDonations() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myRecurringDonations(),
    queryFn: b18.fetchMyRecurringDonations,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

/**
 * Stops a standing donation.
 *
 * **The cache is written from the server's answer, never from the tap.** The
 * response is the schedule as it now stands; a screen that assumed the
 * cancellation had worked would be reporting a financial outcome the server had
 * not confirmed.
 *
 * A schedule that does not exist and one belonging to somebody else are answered
 * identically, so a 404 here means "we could not find that standing donation"
 * and must never be rendered as "that belongs to another account".
 */
export function useCancelRecurringDonation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recurringDonationId: string) =>
      b18.cancelRecurringDonation(recurringDonationId),
    onSuccess: (schedule) => {
      queryClient.setQueryData<RecurringDonation[]>(
        communityProgrammeKeys.myRecurringDonations(),
        (existing) =>
          existing?.map((row) =>
            row.recurringDonationId === schedule.recurringDonationId ? schedule : row
          )
      );
      queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.myRecurringDonations(),
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
      const created: Donation = await financialApi.createDonation(request);

      // **The gateway call, and the fourth place it was missing.** Creating a
      // donation opens a payment intent in `Draft` and hands it to nobody: no
      // gateway reference, no `nextAction` for the sheet to open, and no
      // provider asked for the money — while the screen says it is confirming
      // with the payment provider about a request never made.
      //
      // This is the hook the campaign's own Donate button uses.
      // `useCreateDonation` in `hooks/financial.ts` is the wallet route's, and
      // it had the same hole; both were found on a device, one at a time,
      // because the guard that pinned the purchase path read only that one file.
      const payment =
        created.payment && !isPaymentSettled(created.payment.status)
          ? await financialApi.authorizePayment(created.payment.paymentIntentId)
          : created.payment;

      const donation: Donation = { ...created, payment: payment ?? null };

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
  const enabled = areCommunityGapsEnabled();
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
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myApplications() });
      queryClient.invalidateQueries({
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
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.myApplications() });
      queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.opportunity(application.opportunityId),
      });
    },
  });
}

export function useMyAssignments() {
  const enabled = areCommunityGapsEnabled();
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
  const enabled = areCommunityGapsEnabled();
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'volunteer'] });
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'volunteer'] });
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'volunteer'] });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.opportunity(opportunityId) });
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'volunteer'] });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.opportunity(opportunityId) });
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
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'volunteer'] });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PollRepository — GAP-012
// ═════════════════════════════════════════════════════════════════════════════

export function usePolls(params: b18.PollQueryParams = {}, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.polls(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchPolls({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
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
    isSimulated: false,
    isEnabled: true,
  };
}

export function usePoll(pollId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.poll(pollId ?? ''),
    queryFn: () => b18.fetchPoll(pollId as string),
    enabled: Boolean(pollId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    poll: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
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
  const query = useQuery({
    queryKey: communityProgrammeKeys.pollResult(pollId ?? ''),
    queryFn: () => b18.fetchPollResult(pollId as string),
    enabled: Boolean(pollId),
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
    isSimulated: false,
    isLive: false,
    isEnabled: true,
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
      const result = await b18.submitPollResponse({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return result;
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(communityProgrammeKeys.pollResult(variables.pollId), result);
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.poll(variables.pollId) });
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
      const poll = await b18.createPoll({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return poll;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData(communityProgrammeKeys.poll(poll.pollId), poll);
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'polls'] });
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
    }) => b18.actOnPoll(pollId, action),
    onSuccess: (poll) => {
      queryClient.setQueryData(communityProgrammeKeys.poll(poll.pollId), poll);
      queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.pollResult(poll.pollId) });
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'polls'] });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// OrganizationCommunityRepository — GAP-013/014
// ═════════════════════════════════════════════════════════════════════════════

export function useMyOrganizations() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myOrganizations(),
    queryFn: b18.fetchMyOrganizations,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return backendRead(query, []);
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
  const access = useCommunityAccess();

  const query = useQuery({
    queryKey: communityProgrammeKeys.capabilities(organizationId ?? ''),
    queryFn: () => b18.fetchOrganizationCapabilities(organizationId as string),
    enabled: Boolean(organizationId),
    ...readOptions,
  });

  const capabilities = useMemo(() => {
    const granted = query.data ?? noOrganizationCapabilities(organizationId ?? '');
    return combineOrganizationCapabilities(granted, access);
  }, [query.data, organizationId, access]);

  return {
    capabilities,
    isLoading: query.isLoading,
    isSimulated: false,
    isEnabled: true,
    refetch: () => void query.refetch(),
  };
}

/**
 * The organization dashboard's first paint.
 *
 * B18 answers capabilities and six section counts in one call, computed live —
 * `computedAt` is the moment the request was served, so there is no projection
 * to be stale against.
 *
 * **The other four counts are `null`, not zero.** `DashboardCountsResponse`
 * counts nothing about events, series or campaigns, because those aggregates
 * are B12's and B15's and the dashboard route deliberately does not reach
 * across for them. Filling them with zeroes here would turn "not counted" into
 * "none", which is the class of quiet lie this remediation exists to remove.
 *
 * The overview tiles are built from the six real counts and marked `backed`,
 * because they are the server's own figures.
 */
export function useOrganizationDashboard(organizationId: string | undefined) {
  const { capabilities } = useOrganizationCapabilities(organizationId);

  const query = useQuery({
    queryKey: communityProgrammeKeys.dashboard(organizationId ?? ''),
    queryFn: () => b18.fetchOrganizationDashboard(organizationId as string),
    enabled: Boolean(organizationId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  const dashboard = useMemo<OrganizationDashboard | null>(() => {
    const served = query.data;
    if (!served) return null;

    return {
      organizationId: served.organizationId,
      organizationName: served.organizationName,
      // B18 answers a B5 media identifier rather than a URL; the adapter does
      // not invent one, and the screen renders its placeholder.
      organizationLogo: null,
      // The capability set already went through the platform-ladder
      // intersection in `useOrganizationCapabilities`, which can only remove.
      capabilities,
      metrics: [
        {
          key: 'activeMembers',
          label: 'Active members',
          value: backed(served.counts.activeMembers),
          icon: 'people-outline',
        },
        {
          key: 'pendingMemberApplications',
          label: 'Applications waiting',
          value: backed(served.counts.pendingMemberApplications),
          icon: 'hourglass-outline',
        },
        {
          key: 'openOpportunities',
          label: 'Open opportunities',
          value: backed(served.counts.openOpportunities),
          icon: 'hand-left-outline',
        },
        {
          key: 'openPolls',
          label: 'Open polls',
          value: backed(served.counts.openPolls),
          icon: 'bar-chart-outline',
        },
      ],
      counts: {
        pendingMemberApplications: served.counts.pendingMemberApplications,
        activeMembers: served.counts.activeMembers,
        upcomingEvents: null,
        activeSeries: null,
        activeCampaigns: null,
        draftCampaigns: null,
        openOpportunities: served.counts.openOpportunities,
        pendingVolunteerApplications: served.counts.pendingVolunteerApplications,
        openPolls: served.counts.openPolls,
        unreadAnnouncements: served.counts.recentAnnouncements,
      },
      analyticsSource: 'backend',
    };
  }, [query.data, capabilities]);

  return {
    dashboard,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * An organization's programme analytics.
 *
 * Computed on read, from the rows themselves — `computedAt` is the moment the
 * request was served, so there is no nightly rollup to be a day stale against.
 *
 * **Three series, and two nulls.** B18 computes member growth, volunteer hours
 * and poll participation. Attendance belongs to B12 and giving to B15, and this
 * route computes neither — so those two are `null` and the charts are omitted,
 * rather than drawn as a flat line at zero that would read as "nobody came" and
 * "nobody gave".
 */
export function useOrganizationAnalytics(
  organizationId: string | undefined,
  period: AnalyticsPeriod
) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.analytics(organizationId ?? '', period),
    queryFn: () => b18.fetchOrganizationAnalytics(organizationId as string, period),
    enabled: Boolean(organizationId),
    ...readOptions,
    staleTime: ANALYTICS_STALE_MS,
  });

  const analytics = useMemo<OrganizationAnalytics | null>(() => {
    const served = query.data;
    if (!served) return null;
    return {
      organizationId: served.organizationId,
      period,
      source: 'backend',
      memberGrowth: served.memberGrowth,
      eventAttendance: null,
      donationTotals: null,
      volunteerHours: served.volunteerHours,
      pollParticipation: served.pollParticipation,
      computedAt: served.computedAt,
    };
  }, [query.data, period]);

  return {
    analytics,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useAssignOrganizationRole(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    // `OrganizationRole` rather than `string`: B12 refuses an unknown role name
    // and there is no reason for the screen to be able to compose one.
    mutationFn: ({ userId, role }: { userId: string; role: OrganizationRole }) =>
      b18.assignOrganizationRole(organizationId as string, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-programme', 'membership'] });
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.capabilities(organizationId) });
      }
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// NeighborhoodEventsRepository — GAP-015
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Events in the member's city.
 *
 * **Remediation Wave J — this was called `useNearbyEvents` and the docblock said
 * "Entirely real. B12's event list accepts `latitude`, `longitude` and
 * `radiusKm` and computes `distanceKm` server-side". None of that is true.**
 *
 * `EventSearchParameters` (`CommunityLifeDiscoveryEndpoints.cs:113`) has no
 * latitude, no longitude and no radius property. All three were discarded by the
 * model binder, and `sortBy: 'distance'` did not parse as an `EventSortOrder`
 * either, so the "nearest first" list was the server's default schedule
 * ordering. The screen then drew a radius selector over a result set that no
 * radius had ever touched, and every event in it carried no `distanceKm`.
 *
 * What the route genuinely narrows by, and this hook now sends, is the city.
 * `proximityAvailable` is false and the screen says so rather than presenting a
 * city list as a proximity search — the difference matters to a member deciding
 * whether a 25 km radius will reach the next town.
 *
 * The two ways this *could* become a real proximity read, neither invented here:
 * `bounds` needs a viewport the member has drawn (the map has one; this screen
 * does not), and `neighborhoodAreaId` needs a B4 area id, which is what
 * `useNeighborhoodEvents` below is for.
 */
export function useNearbyEvents(
  params: { latitude?: number; longitude?: number; radiusKm?: number; cityName?: string },
  isActive = true
) {
  const hasCity = Boolean(params.cityName);

  const query = useQuery({
    // `latitude`, `longitude` and `radiusKm` are out of the key as well as out
    // of the request. Keeping them would key apart requests that are byte-for-
    // byte identical on the wire.
    queryKey: communityLifeKeys.events({ cityName: params.cityName }),
    queryFn: () => b12.fetchEvents({ cityName: params.cityName }),
    enabled: isActive && hasCity,
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
    /** Whether a city was resolved. Without one there is nothing to narrow by. */
    hasLocation: hasCity,
    /**
     * False, always, on this route. Rendered — a screen that offers a radius
     * must either honour it or say it cannot, and this is how it says so.
     */
    proximityAvailable: false as const,
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
