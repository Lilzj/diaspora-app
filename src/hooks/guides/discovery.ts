// Guides hooks: discovery. ./index.ts is the overview of the whole module.

import { useQuery } from '@tanstack/react-query';
import {
  clampGuideLimit,
  fetchFeaturedGuides,
  fetchGuideCapabilities,
  fetchGuideCategories,
  fetchGuideTags,
  fetchGuidesByAuthor,
  fetchGuidesByCategory,
  fetchGuidesByCountry,
  fetchLatestGuides,
  fetchNearbyGuides,
  fetchTrendingGuides,
  guideKeys,
  searchGuides,
} from '@/lib/api/guides-api';
import type {
  GuideCapabilitiesResponse,
  GuideCategoryResponse,
  GuideSortKey,
  GuideTagResponse,
  GuidesByCategoryQuery,
  GuidesByCountryQuery,
  NearbyGuidesQuery,
  SearchGuidesQuery,
} from '@/types/guides';
import { messageFor, shouldRetry, useGuideCardPages } from './shared';
import type { UseGuideListResult } from './shared';

// ── Capabilities ─────────────────────────────────────────────────────────────

export interface UseGuideCapabilitiesResult {
  capabilities: GuideCapabilitiesResponse | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * What this deployment's knowledge base can do.
 *
 * An hour's `staleTime`: block kinds, sort orders and ceilings are deployment
 * configuration and do not change while a member is holding the phone. The
 * editor should build its toolbar from `capabilities.blockKinds` rather than
 * from a constant, so a block kind a deployment adds appears without a release.
 */
export function useGuideCapabilities(): UseGuideCapabilitiesResult {
  const query = useQuery({
    queryKey: guideKeys.capabilities(),
    queryFn: fetchGuideCapabilities,
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    capabilities: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface UseGuideCategoriesResult {
  categories: GuideCategoryResponse[];
  /** Only the ones a **new** guide may be filed under. */
  selectable: GuideCategoryResponse[];
  isLoading: boolean;
  error: string | null;
}

/**
 * The guide catalogue, flat and ordered.
 *
 * `selectable` exists because `isActive: false` means "new guides may not choose
 * it", not "hide it": existing guides keep an inactive category and a filter row
 * that dropped it would hide those guides from browse. A picker uses
 * `selectable`; a filter row uses `categories`.
 */
export function useGuideCategories(
  options: { parentKey?: string; includeInactive?: boolean } = {}
): UseGuideCategoriesResult {
  const query = useQuery({
    queryKey: guideKeys.categories(options.parentKey, options.includeInactive),
    queryFn: () => fetchGuideCategories(options),
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  const categories = query.data?.items ?? [];

  return {
    categories,
    selectable: categories.filter((category) => category.isActive),
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/** `GET /guides/tags` — a bare array, built from what authors actually wrote about. */
export function useGuideTags(
  options: { countryCode?: string; categoryKey?: string; limit?: number } = {}
): { tags: GuideTagResponse[]; isLoading: boolean; error: string | null } {
  const query = useQuery({
    queryKey: guideKeys.tags(options.countryCode, options.categoryKey),
    queryFn: () => fetchGuideTags(options),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    tags: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Discovery ────────────────────────────────────────────────────────────────

/** `GET /guides` — every discovery filter, cursor-paged. */
export function useGuideSearch(
  query: SearchGuidesQuery = {},
  options: { enabled?: boolean } = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.search({ ...query, limit }),
    (cursor) => searchGuides({ ...query, limit, cursor: cursor ?? undefined }),
    options
  );
}

/** `GET /guides/featured` — what staff chose. */
export function useFeaturedGuides(
  options: { countryCode?: string; limit?: number; enabled?: boolean } = {}
): UseGuideListResult {
  const { enabled, ...query } = options;
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.shelf('featured', { ...query, limit }),
    (cursor) => fetchFeaturedGuides({ ...query, limit, cursor: cursor ?? undefined }),
    { enabled }
  );
}

/** `GET /guides/latest` — the only ordering with no judgement in it. */
export function useLatestGuides(
  options: { countryCode?: string; language?: string; limit?: number; enabled?: boolean } = {}
): UseGuideListResult {
  const { enabled, ...query } = options;
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.shelf('latest', { ...query, limit }),
    (cursor) => fetchLatestGuides({ ...query, limit, cursor: cursor ?? undefined }),
    { enabled }
  );
}

/** `GET /guides/trending` — what is earning attention now. */
export function useTrendingGuides(
  options: { countryCode?: string; categoryKey?: string; limit?: number; enabled?: boolean } = {}
): UseGuideListResult {
  const { enabled, ...query } = options;
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.shelf('trending', { ...query, limit }),
    (cursor) => fetchTrendingGuides({ ...query, limit, cursor: cursor ?? undefined }),
    { enabled }
  );
}

/** `GET /guides/nearby` — resolved entirely by Location's scope resolver. */
export function useNearbyGuides(
  query: NearbyGuidesQuery = {},
  options: { enabled?: boolean } = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.nearby({ ...query, limit }),
    (cursor) => fetchNearbyGuides({ ...query, limit, cursor: cursor ?? undefined }),
    options
  );
}

/** `GET /guides/countries/{countryCode}`. */
export function useGuidesByCountry(
  countryCode: string | null | undefined,
  query: GuidesByCountryQuery = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.byCountry(countryCode ?? '', { ...query, limit }),
    (cursor) =>
      fetchGuidesByCountry(countryCode as string, { ...query, limit, cursor: cursor ?? undefined }),
    { enabled: Boolean(countryCode) }
  );
}

/** `GET /guides/categories/{categoryKey}/guides` — by **key**, never by name. */
export function useGuidesByCategory(
  categoryKey: string | null | undefined,
  query: GuidesByCategoryQuery = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.byCategory(categoryKey ?? '', { ...query, limit }),
    (cursor) =>
      fetchGuidesByCategory(categoryKey as string, {
        ...query,
        limit,
        cursor: cursor ?? undefined,
      }),
    { enabled: Boolean(categoryKey) }
  );
}

/** `GET /guides/authors/{authorId}` — the byline a grateful reader clicks. */
export function useGuidesByAuthor(
  authorId: string | null | undefined,
  options: { sort?: GuideSortKey; limit?: number } = {}
): UseGuideListResult {
  const limit = clampGuideLimit(options.limit);
  return useGuideCardPages(
    guideKeys.byAuthor(authorId ?? '', options.sort),
    (cursor) =>
      fetchGuidesByAuthor(authorId as string, {
        sort: options.sort,
        limit,
        cursor: cursor ?? undefined,
      }),
    { enabled: Boolean(authorId) }
  );
}
