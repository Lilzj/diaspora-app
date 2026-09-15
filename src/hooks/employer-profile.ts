// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — an employer's profile and open jobs
//
// Over `lib/employer-profile-api.ts`. Both queries sit under the hiring module's
// root, so closing a job or registering an employer — which invalidate that root
// — refresh a profile that is open behind them.
// ─────────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { fetchEmployerJobs, fetchEmployerProfile } from '@/lib/employer-profile-api';
import { jobsHiringErrorMessage, jobsHiringKeys } from '@/lib/jobs-hiring-api';
import type { EmployerResponse, JobCardResponse } from '@/types/jobs-hiring';

/** Refusals are answers; only a failure that might pass is worth a second try. */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404 || status === 409) return false;
  return failureCount < 1;
}

export interface UseEmployerProfileResult {
  employer: EmployerResponse | null;
  isLoading: boolean;
  /** The platform answered that there is no such employer. */
  isNotFound: boolean;
  /** Why the read failed, or null. **Not** set for an employer that is not there. */
  loadError: string | null;
  refresh: () => Promise<unknown>;
}

/** `GET /jobs/employers/{idOrSlug}`, keeping "not there" and "could not ask" apart. */
export function useEmployerProfile(idOrSlug: string | null | undefined): UseEmployerProfileResult {
  const query = useQuery({
    queryKey: jobsHiringKeys.employerProfile(idOrSlug ?? ''),
    queryFn: () => fetchEmployerProfile(idOrSlug as string),
    enabled: Boolean(idOrSlug),
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  return {
    employer: query.data ?? null,
    isLoading: Boolean(idOrSlug) && query.isLoading,
    isNotFound: !idOrSlug || (query.isSuccess && query.data === null),
    loadError: query.isError ? jobsHiringErrorMessage(query.error) : null,
    refresh: () => query.refetch(),
  };
}

export interface UseEmployerJobsResult {
  jobs: JobCardResponse[];
  isLoading: boolean;
  /** Why the list failed, or null. The profile above it still stands. */
  error: string | null;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadMore: () => void;
  refresh: () => Promise<unknown>;
}

/**
 * The employer's open jobs, paged by the server's cursor.
 *
 * Stops on `hasMore`, never on a short page — the rule every paged list here
 * follows, because a page that came back short is not proof of the end.
 */
export function useEmployerJobs(employerId: string | null | undefined): UseEmployerJobsResult {
  const query = useInfiniteQuery({
    queryKey: jobsHiringKeys.employerJobs(employerId ?? ''),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchEmployerJobs(employerId as string, pageParam),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    enabled: Boolean(employerId),
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  return {
    jobs: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: Boolean(employerId) && query.isLoading,
    error: query.isError ? jobsHiringErrorMessage(query.error) : null,
    hasMore: Boolean(query.hasNextPage),
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refresh: () => query.refetch(),
  };
}
