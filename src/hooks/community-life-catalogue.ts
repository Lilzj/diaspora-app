// ─────────────────────────────────────────────────────────────────────────────
// Event categories and organisation types, as the server lists them
//
// Since 13 Oct 2026 the event, series and organisation forms offer these instead
// of their own lists. Those lists mapped 29 event labels and 18 organisation
// labels onto the server's 18 and 14 keys, so "Birthday", "Comedy Show",
// "Doctors" or "Restaurants" was saved as something else ("other", mostly)
// while the form went on showing the member's choice.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';

import {
  communityLifeCatalogueKeys,
  fetchCommunityLifeCatalogue,
} from '@/lib/community-life-catalogue';

export function useCommunityLifeCatalogue() {
  const query = useQuery({
    queryKey: communityLifeCatalogueKeys.catalogue(false),
    queryFn: () => fetchCommunityLifeCatalogue(false),
    staleTime: 60 * 60 * 1000,
  });

  const eventCategories = query.data?.eventCategories ?? [];
  const organizationTypes = query.data?.organizationTypes ?? [];

  return {
    eventCategories,
    organizationTypes,
    isLoading: query.isLoading,
    isUnavailable: query.isError,
    /** The server's name for a key; the key itself while the list is loading. */
    eventCategoryName: (key: string) => eventCategories.find((c) => c.key === key)?.name ?? key,
    organizationTypeName: (key: string) => organizationTypes.find((t) => t.key === key)?.name ?? key,
  };
}
