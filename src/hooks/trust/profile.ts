// Trust hooks: profile. ./index.ts is the overview of the whole module.

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchMyBadges,
  fetchPublicTrustProfile,
  fetchTrustProfile,
  fetchTrustTimeline,
  hasStaffRiskView,
  trustKeys,
} from '@/lib/api/trust-api';
import type {
  RiskLevel,
  WireBadge,
  WirePublicTrustProfile,
  WireTrustProfile,
  WireTrustTimelineEvent,
} from '@/types/trust';
import { useTrustStore } from '@/store/trust';
import { SELF_STALE_MS, messageFor, shouldRetry } from './shared';

/** Ten minutes for somebody else's public standing. */
const PUBLIC_STALE_MS = 10 * 60 * 1000;

// ── Profile ──────────────────────────────────────────────────────────────────

export interface UseTrustProfileResult {
  profile: WireTrustProfile | null;
  /**
   * Whether the server returned the staff-only risk fields.
   *
   * The Trust Centre rendered an "Internal Risk Index (Admin view)" panel for
   * every member, from a number the device computed. The server sends risk only
   * to a caller holding `trust:verification:review`, so for almost everyone
   * this is false and the panel should not be drawn at all.
   */
  canSeeRisk: boolean;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/profile`. The whole Trust Centre in one read.
 *
 * **It also hydrates `store/trust.ts`**, and that side effect is deliberate
 * rather than incidental. `lib/trustEngine.ts` reads verification statuses,
 * account health and country standings synchronously through `getState()` from
 * five create screens; it cannot become a hook without rewriting all five, and
 * the backend explicitly expects the client to keep a local copy for instant
 * feedback. Putting the hydration here means the mirror is filled by *any*
 * consumer of the profile, so there is no screen where the engine can be asked
 * a question the server has already answered differently.
 *
 * The alternative — each screen remembering to hydrate — is the arrangement
 * that produced the fictional Mauritius member in the first place.
 *
 * React Query deduplicates by key, so five screens mounting this inside the
 * five-minute `staleTime` cost one request out of the module's ten a minute.
 */
export function useTrustProfile(options: { enabled?: boolean } = {}): UseTrustProfileResult {
  const hydrate = useTrustStore((state) => state.hydrateFromTrustProfile);

  const query = useQuery({
    queryKey: trustKeys.profile(),
    queryFn: fetchTrustProfile,
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const profile = query.data ?? null;
  const canSeeRisk = hasStaffRiskView(profile);

  useEffect(() => {
    if (!profile) return;
    hydrate({
      verifications: profile.verifications,
      healthStatus: profile.healthStatus,
      countryReputations: profile.countryReputations,
      experienceTimeline: profile.experienceTimeline,
    });
  }, [profile, hydrate]);

  return {
    profile,
    canSeeRisk,
    riskScore: canSeeRisk ? (profile?.riskScore ?? null) : null,
    riskLevel: canSeeRisk ? (profile?.riskLevel ?? null) : null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UsePublicTrustProfileResult {
  profile: WirePublicTrustProfile | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * `GET /trust/profiles/{userId}`.
 *
 * 404s for a member who has never touched a trust feature, which is not an
 * error worth surfacing as one — it means "no standing established yet".
 */
export function usePublicTrustProfile(userId: string | null): UsePublicTrustProfileResult {
  const query = useQuery({
    queryKey: trustKeys.publicProfile(userId ?? ''),
    queryFn: () => fetchPublicTrustProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: PUBLIC_STALE_MS,
    retry: shouldRetry,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

export interface UseTrustTimelineResult {
  events: WireTrustTimelineEvent[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/timeline`.
 *
 * One page, not an infinite query. The journey tab renders a vertical timeline
 * a member scrolls once; paging it would cost another request from a budget of
 * ten a minute to show entries nobody scrolled to.
 */
export function useTrustTimeline(
  options: { pageSize?: number; enabled?: boolean } = {}
): UseTrustTimelineResult {
  const query = useQuery({
    queryKey: trustKeys.timeline(options.pageSize),
    queryFn: () => fetchTrustTimeline({ pageSize: options.pageSize }),
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
    refresh: () => void query.refetch(),
  };
}

export interface UseMyBadgesResult {
  badges: WireBadge[];
  isLoading: boolean;
  error: string | null;
}

/** `GET /trust/badges/me` — a bare array of active badges. */
export function useMyBadges(options: { enabled?: boolean } = {}): UseMyBadgesResult {
  const query = useQuery({
    queryKey: trustKeys.badges(),
    queryFn: fetchMyBadges,
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  return {
    badges: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}
