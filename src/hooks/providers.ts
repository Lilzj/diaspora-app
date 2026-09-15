// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Service provider hooks (certified)
//
// Thin wrappers over `lib/providers-api.ts`. Every route behind them is real;
// see that file's header for the endpoint list and the source it was read from.
//
// The one piece of judgement in here is the retry policy: a provider that is not
// found must NOT be retried. `provider/[id].tsx` used to substitute
// `mockListings[0]` for any unresolvable id, so the failure mode this file has to
// support is "tell the member plainly that this business could not be found" —
// and retrying a 404 three times only delays that message.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  fetchProvider,
  fetchMyProviderReviews,
  fetchProviderReviews,
  fetchServiceCategories,
  providerKeys,
  searchProviders,
  type Provider,
  type ProviderReviewPage,
  type ProviderSearchParams,
  type ProviderPage,
  type ServiceCategory,
} from '@/lib/providers-api';

/** True for the error `fetchProvider` raises when nothing matched the id or slug. */
export function isProviderNotFound(error: unknown): boolean {
  return (
    error instanceof Error && (error as Error & { kind?: string }).kind === 'provider-not-found'
  );
}

export function useProvider(idOrSlug: string | null | undefined): {
  provider: Provider | null;
  isLoading: boolean;
  isError: boolean;
  /** Distinguished from a transport failure: this business is gone, not unreachable. */
  isNotFound: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: providerKeys.detail(idOrSlug ?? 'none'),
    queryFn: () => fetchProvider(idOrSlug as string),
    enabled: Boolean(idOrSlug),
    retry: (failureCount, cause) => {
      if (isProviderNotFound(cause)) return false;
      return failureCount < 1;
    },
  });

  return {
    provider: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isNotFound: isProviderNotFound(query.error),
    refetch: () => void query.refetch(),
  };
}

export function useProviderReviews(providerId: string | null | undefined): {
  page: ProviderReviewPage | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: providerKeys.reviews(providerId ?? 'none'),
    queryFn: () => fetchProviderReviews(providerId as string),
    enabled: Boolean(providerId),
  });

  return {
    page: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Reviews left on the business the caller runs.
 *
 * `page.providerId` being null is the "you do not run a business" answer, and it
 * is a different empty state from "nobody has reviewed you yet" — the screen
 * renders two different sentences from it.
 */
export function useMyProviderReviews(enabled = true): {
  page: ProviderReviewPage | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: providerKeys.myReviews(),
    queryFn: () => fetchMyProviderReviews(),
    enabled,
  });

  return {
    page: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useProviderSearch(
  params: ProviderSearchParams,
  options: { enabled?: boolean } = {}
): {
  page: ProviderPage | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: providerKeys.search(params),
    queryFn: ({ signal }) => searchProviders(params, signal),
    enabled: options.enabled !== false,
  });

  return {
    page: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * `GET /providers`, page after page — for a list with "Show more".
 *
 * Discover used `useProviderSearch`, which reads one page and stops, so a
 * member saw the first twenty providers and no way to the rest. The cursor
 * pages come back in the server's order and are appended as they are; nothing
 * is re-sorted here, because a re-sort would move page one under page two.
 */
export function useProviderSearchPages(
  params: Omit<ProviderSearchParams, 'cursor'>,
  options: { enabled?: boolean } = {}
): {
  providers: ProviderPage['items'];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadMoreFailed: boolean;
  loadMore: () => void;
  /** The first page's word on the order it is in, or null. */
  appliedSort: string | null;
} {
  const query = useInfiniteQuery({
    queryKey: [...providerKeys.search(params), 'pages'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      searchProviders({ ...params, cursor: pageParam ?? undefined }, signal),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    enabled: options.enabled !== false,
  });

  // Each provider once, in the order its page arrived: a provider published
  // between two requests can shift across a page boundary.
  const providers = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((provider) => {
        if (seen.has(provider.providerId)) return false;
        seen.add(provider.providerId);
        return true;
      });
  }, [query.data]);

  return {
    providers,
    isLoading: query.isLoading,
    // Only a failed first page is a failed search; a failed later page keeps
    // what is shown and is reported on the button.
    isError: query.isError && !query.data,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    appliedSort: query.data?.pages[0]?.appliedSort ?? null,
  };
}

/**
 * `GET /providers/categories` — the real service taxonomy.
 *
 * An hour's `staleTime`: a category catalogue is a deployment fact, not a
 * per-member one, and re-reading it on every screen mount is waste.
 */
export function useServiceCategories(): {
  categories: ServiceCategory[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: providerKeys.categories(),
    queryFn: () => fetchServiceCategories(),
    staleTime: 60 * 60 * 1000,
  });

  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
