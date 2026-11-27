// Discover: the Providers tab, read from `GET /providers`.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { providerScopeParams } from '@/lib/domain/discover-scope';
import { distanceSortNote } from '@/lib/platform/discover-filters';
import { useProviderSearchPages } from '@/hooks/providers';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';

export function useProviderTab(search: DiscoverSearch, filters: DiscoverFilters) {
  const { scope, searchQuery, selectedCategory, activeTab } = search;
  const { providerSort, filterVerified } = filters;

  // ── Providers and jobs, from the routes that serve them ───────────────────
  //
  // Both used to be `mockListings` / `mockJobs` filtered in memory. The two
  // certified reads below replace roughly 100 lines of client-side matching,
  // and the difference is not only that the rows are real: the server applies
  // the radius, the category and the text match, so what the member sees is
  // what the platform actually holds rather than what a fixture happened to
  // mention.
  //
  // `passesOriginFilter` still runs on top. It is the *manual country picker*,
  // which is a separate control from the community scope and has no route-level
  // binding — see the Phase 13 note above.
  //
  // Both read one page and stopped until late on 15 Sep 2026; they page now,
  // one server page per "Show more", as Housing and Marketplace do.

  /** `GET /providers` — `SearchProvidersQuery` → `ProviderPageResponse`. */
  const providerSearch = useProviderSearchPages(
    {
      query: searchQuery.trim() || undefined,
      // The provider taxonomy binds as `categoryId`. Sending the fixture's `id`
      // under `category` was dropped by the serialiser, which is how a filter
      // comes to look like it works and does not.
      categoryId: activeTab === 'Providers' ? selectedCategory ?? undefined : undefined,
      // Country, town or a real distance — the server measures it since 15 Sep 2026.
      ...providerScopeParams(scope),
      verifiedOnly: filterVerified || undefined,
      // "Distance" is nearest first across every page, for a distance search.
      sortBy: providerSort,
    },
    { enabled: activeTab === 'Providers' }
  );

  const baseListings = providerSearch.providers;
  const providerDistanceNote = distanceSortNote('Providers', providerSort, providerSearch.appliedSort, scope);

  return { providerSearch, baseListings, providerDistanceNote };
}

/** What `useProviderTab` holds, as the screen reads it. */
export type ProviderTab = ReturnType<typeof useProviderTab>;
