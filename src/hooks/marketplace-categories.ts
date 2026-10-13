import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchMarketplaceCategories, type MarketplaceCategory } from '@/lib/marketplace-categories';

/**
 * The served commerce taxonomy, split the way the create screens pick from it:
 * top-level categories, then the subcategories of one of them.
 */
export function useMarketplaceCategories(): {
  topCategories: MarketplaceCategory[];
  childrenOf: (key: string | null) => MarketplaceCategory[];
  find: (key: string | null) => MarketplaceCategory | undefined;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ['marketplace', 'categories'],
    queryFn: fetchMarketplaceCategories,
    staleTime: 60 * 60 * 1000,
  });

  return useMemo(() => {
    const all = query.data ?? [];
    const byOrder = (a: MarketplaceCategory, b: MarketplaceCategory) => a.order - b.order;

    return {
      topCategories: all.filter((category) => !category.parentKey).sort(byOrder),
      childrenOf: (key) => (key ? all.filter((category) => category.parentKey === key).sort(byOrder) : []),
      find: (key) => (key ? all.find((category) => category.key === key) : undefined),
      isLoading: query.isLoading,
    };
  }, [query.data, query.isLoading]);
}
