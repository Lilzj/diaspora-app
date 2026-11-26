// Community Life hooks: organizations. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import * as b12 from '@/lib/api/community-life-api';
import { communityLifeKeys } from '@/lib/api/community-life-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  combineOrganizationCapabilities,
  noOrganizationCapabilities,
} from '@/lib/domain/community-access';
import { useAuthStore } from '@/store/auth';
import type {
  AnalyticsPeriod,
  OrganizationAnalytics,
  OrganizationCapabilities,
  OrganizationDashboard,
  OrganizationRole,
} from '@/types/community-advanced';
import { backed } from '@/types/community-advanced';
import {
  ANALYTICS_STALE_MS,
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  backendRead,
  mutationOptions,
  readOptions,
} from './shared';
import { useCommunityAccess } from './hub';

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
      void queryClient.invalidateQueries({
        queryKey: communityLifeKeys.organization(organization.organizationId),
      });
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.organizationsAll() });
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
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.membershipAll() });
      if (organizationId) {
        void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.capabilities(organizationId) });
      }
    },
  });
}

export function useAnnouncements(params: { scope?: string; scopeId?: string } = {}) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.announcements(params.scope ?? 'all', params.scopeId),
    queryFn: ({ pageParam }) =>
      b18.fetchAnnouncements({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
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
    isSimulated: false,
    isEnabled: true,
  };
}

export function usePublishAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: Parameters<typeof b18.publishAnnouncement>[0]) =>
      b18.publishAnnouncement(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.announcementsAll() });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.hubAnnouncements() });
    },
  });
}
