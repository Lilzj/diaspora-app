// Discover: the Guides tab, read from `GET /guides`.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { guideScopeParams } from '@/lib/domain/discover-scope';
import { useGuideSearch } from '@/hooks/guides';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

export function useGuideTab(search: DiscoverSearch) {
  const { scope, searchQuery, selectedCategory, activeTab } = search;

  /**
   * `GET /guides` — `SearchGuidesQuery` → `CursorPagedResult<GuideCardResponse>`.
   *
   * **Not `GET /guides/search`, which does not exist.** Guides search *is* the
   * bare group route; the two `/search` mappings in the Guides assembly live
   * under the `/knowledge` and `/intelligence` prefixes and answer different
   * questions.
   *
   * The old in-memory filter also required `item.country.code` to equal the
   * member's active country, so a member in Ireland could not see a guide about
   * Irish visas written under a different country tag. The route decides that
   * now; `q` and `category` are the two parameters it genuinely binds.
   */
  const guideSearch = useGuideSearch(
    {
      q: searchQuery.trim() || undefined,
      // `SearchGuidesQuery` reads the taxonomy as a **key**, never a display
      // name. The fixture compared `category.name.toLowerCase()` against the
      // guide's category string, which is the comparison this route does not do.
      category: activeTab === 'Guides' ? selectedCategory ?? undefined : undefined,
      // A guide is about a country; the member's, unless they pick another.
      ...guideScopeParams(scope),
    },
    { enabled: activeTab === 'Guides' }
  );

  const filteredGuides = guideSearch.guides;

  return { guideSearch, filteredGuides };
}

/** What `useGuideTab` holds, as the screen reads it. */
export type GuideTab = ReturnType<typeof useGuideTab>;
