// Discover: the category chips for the tab in view, from the taxonomies that exist.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useMemo } from 'react';
import { useServiceCategories } from '@/hooks/providers';
import { useGuideCategories } from '@/hooks/guides';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

export function useDiscoverCategories(search: DiscoverSearch) {
  const { activeTab } = search;

  /** `GET /providers/categories` and `GET /guides/categories` — real taxonomies. */
  const { categories: serviceCategories } = useServiceCategories();
  const { selectable: guideCategories } = useGuideCategories();

  /**
   * The chips for the active tab, in one shape.
   *
   * `id` is deliberately whatever that tab's route *binds*, not a common
   * identifier: providers filter on `categoryId`, guides on the category **key**.
   * Sending one where the other is expected is dropped by the serialiser without
   * an error, so the two spellings are kept apart here rather than unified into
   * something neither route accepts. `selectable` for guides because a retired
   * category may still be worn by existing guides but must not be offered for a
   * new filter.
   */
  const categoryOptions = useMemo<{ id: string; name: string; icon?: string }[]>(() => {
    if (activeTab === 'Providers') {
      return serviceCategories.map((c) => ({
        id: c.categoryId,
        name: c.name,
        icon: c.icon ?? undefined,
      }));
    }

    if (activeTab === 'Guides') {
      return guideCategories.map((c) => ({
        id: c.key,
        name: c.name,
        icon: c.icon ?? undefined,
      }));
    }

    // Jobs (`GET /jobs/categories`) and Marketplace (`GET /marketplace/categories`)
    // have real catalogue routes with no client in `lib/` yet, and Housing has no
    // category route at all. No chips beats fixture chips that filter nothing.
    return [];
  }, [activeTab, serviceCategories, guideCategories]);

  return { guideCategories, categoryOptions };
}

/** What `useDiscoverCategories` holds, as the screen reads it. */
export type DiscoverCategories = ReturnType<typeof useDiscoverCategories>;
