// Discover: the Jobs tab, read from `GET /jobs`.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { jobScopeParams } from '@/lib/domain/discover-scope';
import { jobFilterParams } from '@/lib/platform/discover-filters';
import { useScopedContentPages } from '@/hooks/communities';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';

export function useJobTab(search: DiscoverSearch, filters: DiscoverFilters) {
  const { scope, searchQuery, activeTab, selectedJobType } = search;
  const { filterVerified } = filters;

  /**
   * `GET /jobs` — the browse route (`WithName("BrowseJobs")`).
   *
   * Reached through `useScopedContentPages`, the paged form of the platform's
   * certified reader for `DOMAIN_ROUTES.job`, which already applies the
   * community projection. There is no typed jobs-browse client to reuse:
   * `lib/jobs-hiring-api.ts` covers the fifteen hiring-workflow routes and
   * states in its own header that the browse universe is a different one.
   * Writing a second client for one list is what this codebase keeps telling
   * itself not to do.
   *
   * Note there is **no `GET /jobs/search`** — the POST variant exists, but browse
   * is the bare group route.
   *
   * No sort is sent. The sheet's chips sent `default`, `distance` and `rating`,
   * which are not job orders, and the route answered newest first whatever was
   * picked; the Jobs tab offers no sort chips now.
   */
  const jobSearch = useScopedContentPages<Record<string, unknown>>(
    'job',
    {
      query: searchQuery.trim() || undefined,
      // `GET /jobs` binds `country` and `city`, and no point or radius: a job
      // has no position. Without `country` the tab showed every country's jobs.
      //
      // `type` and `verified` are the sheet's two filters. They were state
      // nobody read: the sheet set them, `filteredJobs` applied only the origin
      // country, and the request never carried either — so choosing
      // "Part-Time" changed the chip and nothing else.
      extra: { ...jobScopeParams(scope), ...jobFilterParams(selectedJobType, filterVerified) },
    },
    { enabled: activeTab === 'Jobs' }
  );

  const baseJobs = jobSearch.items;

  return { jobSearch, baseJobs };
}

/** What `useJobTab` holds, as the screen reads it. */
export type JobTab = ReturnType<typeof useJobTab>;
