// Discover: the two tabs loaded by effects rather than queries, Housing and Marketplace. Each reads
// its route page by page, with a generation counter that drops a page arriving after the filters
// changed, and the two share the loading flag that pull-to-refresh waits on. Lifted out of
// `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useState, useRef, useEffect, useCallback } from 'react';
import type { HousingListing } from '@/types/housing';
import type { MarketplaceListing } from '@/types/marketplace';
import { searchMarketplace } from '@/lib/api/marketplace-listings-api';
import { searchHousing } from '@/lib/api/housing-listings-api';
import {
  marketplaceSearchBody,
  housingSearchParams,
  appendPage,
  distanceSortNote,
} from '@/lib/platform/discover-filters';
import { useEffectRefresh } from '@/hooks/usePullToRefresh';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';
import type { HousingSheet } from '@/components/screens/discover/useHousingSheet';
import type { MarketSheet } from '@/components/screens/discover/useMarketSheet';

export function useListingSearches(
  search: DiscoverSearch,
  filters: DiscoverFilters,
  housingSheet: HousingSheet,
  marketSheet: MarketSheet,
) {
  const { scope, searchQuery, activeTab } = search;
  const { housingSort, marketSort } = filters;
  const { housingFilters } = housingSheet;
  const { marketFilters } = marketSheet;

  const [isLoading, setIsLoading] = useState(false);

  // Discover is the app's main feed and did nothing on a pull. It loads through
  // `useEffect` rather than TanStack, so `useEffectRefresh` supplies the nonce
  // its fetch effects key off.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(isLoading);

  // Housing specific filters state
  const [housingListings, setHousingListings] = useState<HousingListing[]>([]);
  // Remediation. Both remote tabs used to swallow their failure into a
  // `console.error`, so a 404 and an empty catalogue looked identical to the
  // member. These carry the difference to the empty state.
  const [housingError, setHousingError] = useState<string | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);

  // Marketplace specific filters state
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);

  // ── More than one page — 15 Sep 2026 ──────────────────────────────────────
  //
  // Both tabs read the first twenty rows and stopped, and "Unfurnished",
  // "Partially Furnished", "Pickup Only" and "Rating" were applied to those
  // twenty on the phone. The server does all four now, and each tab keeps the
  // cursor its last page returned for "Show more". The generation counters
  // discard a page that arrives after the filters changed, so a slow "Show
  // more" cannot append yesterday's search to today's.
  //
  // "Distance" and the items tab's "Rating" followed later that night, so no
  // page is re-sorted on the phone: page two continues page one, and is appended.
  const [housingCursor, setHousingCursor] = useState<string | null>(null);
  const [housingMore, setHousingMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  // The order the first page of homes says it is in; see `distanceSortNote`.
  const [housingAppliedSort, setHousingAppliedSort] = useState<string | null>(null);
  const [marketCursor, setMarketCursor] = useState<string | null>(null);
  const [marketMore, setMarketMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  const housingGeneration = useRef(0);
  const marketGeneration = useRef(0);

  // ── The 400ms fake loader is gone ──────────────────────────────────────────
  //
  // Every tab except Housing and Marketplace used to `setIsLoading(true)` and
  // clear it on a `setTimeout`, because there was no request to wait for — the
  // results were already in memory. It was a spinner performing the *appearance*
  // of fetching, and it made a screen that never contacted the platform look
  // exactly like one that did. Providers, Jobs and Guides now have genuine
  // request states, and `showLoading` below reads them.

  // API Fetcher for Marketplace
  useEffect(() => {
    if (activeTab === 'Marketplace') {
      setIsLoading(true);
      const generation = ++marketGeneration.current;
      const fetchMarketplace = async () => {
        try {
          // ── Remediation ────────────────────────────────────────────────────
          //
          // This called `GET /marketplace`. That path exists, but it is
          // `GetMarketplaceDashboardQuery` — a dashboard object, not a list of
          // listings. `res.data.data` was therefore not an array, `data.sort()`
          // threw `data.sort is not a function`, the throw was swallowed by the
          // `catch` below into a `console.error` nobody sees, and
          // `setMarketplaceListings` was never called.
          //
          // The visible result: the Marketplace tab was **permanently empty,
          // with no error shown**, on every device, for every query. It looked
          // like a marketplace with nothing in it.
          //
          // The real search is `POST /marketplace/search` → `SearchListingsQuery`,
          // with a request body rather than a query string. The parameter names
          // differ too — `text`, `minimumPrice`, `maximumPrice` — and anything
          // sent under the old names is silently dropped by the serialiser,
          // which is how a filter comes to look like it works and does not.
          //
          // ── 15 Sep 2026: the names `SearchListingsRequest` binds ──────────
          //
          // `intent`, `condition`, `verifiedSellerOnly`, `deliveryAvailable`,
          // `pickupOnly` and `sortBy` were never bound, so those filters looked
          // like they worked and did nothing. An item has no position, so the
          // place is the member's town or country, never a radius.
          //
          // The price range went unapplied until the same day: the server
          // drops a range with no currency, and none was sent. See
          // `lib/discover-filters.ts`.
          const page = await searchMarketplace(
            marketplaceSearchBody(searchQuery, scope, marketFilters, marketSort)
          );

          // A newer search started while this one was out.
          if (generation !== marketGeneration.current) return;

          // Reading the page and mapping the cards is `searchMarketplace`'s
          // job now (FSOLID-002). DEFECT-009 — every card navigating to
          // `/marketplace/undefined` because the page was *cast* to
          // `MarketplaceListing` rather than read as `…CardResponse` — is
          // written up there, beside the code that can reintroduce it.

          // In the server's order, "Rating" included.
          setMarketplaceListings(page.items);
          setMarketCursor(page.nextCursor);
          setMarketMore('idle');
          setMarketplaceError(null);
        } catch (err) {
          if (generation !== marketGeneration.current) return;
          console.error('Failed to fetch marketplace listings', err);
          // The failure is now *shown*. Swallowing it into a console line is
          // what let an empty tab pass for an empty marketplace.
          setMarketplaceListings([]);
          setMarketCursor(null);
          setMarketplaceError('We could not load the marketplace just now.');
        } finally {
          if (generation === marketGeneration.current) setIsLoading(false);
        }
      };
      
      const timer = setTimeout(fetchMarketplace, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, searchQuery, scope, marketFilters, marketSort, refreshNonce]);

  // API Fetcher for Housing
  useEffect(() => {
    if (activeTab === 'Housing') {
      setIsLoading(true);
      const generation = ++housingGeneration.current;
      const fetchHousing = async () => {
        try {
          // ── Why no category is sent for housing ─────────────────────────
          //
          // This looked the selected chip up in `mockHousingCategories` and sent
          // its **display name** as `category`. Housing has no category route
          // and `SearchHousingQuery` has no category field — its taxonomy is
          // `GET /housing/accommodation-types` plus `GET /housing/amenities`,
          // which are different axes. So the parameter was a fixture's label
          // being sent to a binding that does not exist, and was dropped.
          // The Housing tab now renders no category chips at all; see
          // `categoryOptions`.

          // ── Remediation ────────────────────────────────────────────────────
          //
          // This called flat `GET /housing`, which no module publishes: the
          // Housing prefix has `/housing/search`, `/housing/dashboard`,
          // `/housing/listings/{idOrSlug}` and so on, but nothing at the root.
          // Every request 404'd into the `catch` below and the Housing tab
          // stayed empty without saying why.
          //
          // The real route is `GET /housing/search` → `SearchHousingQuery`.
          //
          // ── 15 Sep 2026: the names `SearchHousingRequest` binds ───────────
          //
          // This sent `cityName`, `minPrice`, `maxPrice`, `bedrooms`,
          // `bathrooms`, `furnished`, `billsIncluded`, `parkingAvailable`,
          // `verifiedHostOnly` and `lifestyleMatches`, none of which the route
          // binds, so every filter on this tab was ignored. And the rows are
          // `HousingListingCardResponse`, not the client's `HousingListing` —
          // `item.host.originCountry` on a real row threw in render. They are
          // mapped once, in `lib/housing-cards.ts`.
          //
          // The rent range, "Partially Furnished" and ",5000" were still wrong
          // after that, and the tab read one page; `lib/discover-filters.ts`
          // says how.
          const page = await searchHousing(
            housingSearchParams(searchQuery, scope, housingFilters, housingSort)
          );

          // A newer search started while this one was out.
          if (generation !== housingGeneration.current) return;


          // In the server's order, "Distance" included: nearest first across
          // every page, measured from where each home is published.
          setHousingListings(page.items);
          setHousingAppliedSort(page.appliedSort);
          setHousingCursor(page.nextCursor);
          setHousingMore('idle');
          setHousingError(null);
        } catch (err) {
          if (generation !== housingGeneration.current) return;
          console.error('Failed to fetch housing listings', err);
          setHousingListings([]);
          setHousingAppliedSort(null);
          setHousingCursor(null);
          setHousingError('We could not load housing just now.');
        } finally {
          if (generation === housingGeneration.current) setIsLoading(false);
        }
      };
      
      const timer = setTimeout(fetchHousing, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, searchQuery, scope, housingFilters, housingSort, refreshNonce]);

  /** The next page of homes, appended under the ones already shown. */
  const loadMoreHousing = useCallback(async () => {
    if (!housingCursor || housingMore === 'loading') return;

    const generation = housingGeneration.current;
    setHousingMore('loading');

    try {
      const page = await searchHousing(
        housingSearchParams(searchQuery, scope, housingFilters, housingSort, housingCursor)
      );

      if (generation !== housingGeneration.current) return;

      setHousingListings((shown) => appendPage(shown, page.items));
      setHousingCursor(page.nextCursor);
      setHousingMore('idle');
    } catch (err) {
      if (generation !== housingGeneration.current) return;
      console.error('Failed to load more housing listings', err);
      // The homes already shown stay; only the button says it failed.
      setHousingMore('failed');
    }
  }, [housingCursor, housingMore, searchQuery, scope, housingFilters, housingSort]);

  /** The next page of items, appended under the ones already shown. */
  const loadMoreMarketplace = useCallback(async () => {
    if (!marketCursor || marketMore === 'loading') return;

    const generation = marketGeneration.current;
    setMarketMore('loading');

    try {
      const page = await searchMarketplace(
        marketplaceSearchBody(searchQuery, scope, marketFilters, marketSort, marketCursor)
      );

      if (generation !== marketGeneration.current) return;

      setMarketplaceListings((shown) => appendPage(shown, page.items));
      setMarketCursor(page.nextCursor);
      setMarketMore('idle');
    } catch (err) {
      if (generation !== marketGeneration.current) return;
      console.error('Failed to load more marketplace listings', err);
      setMarketMore('failed');
    }
  }, [marketCursor, marketMore, searchQuery, scope, marketFilters, marketSort]);

  // Why "Distance" left the list as it was: no distance to search within, or
  // too much inside it to measure. The server says which order it used.
  const housingDistanceNote = distanceSortNote('Housing', housingSort, housingAppliedSort, scope);

  return {
    isLoading, refreshControl, housingListings, housingError, marketplaceError, marketplaceListings,
    housingCursor, housingMore, marketCursor, marketMore, loadMoreHousing, loadMoreMarketplace,
    housingDistanceNote,
  };
}

/** What `useListingSearches` holds, as the screen reads it. */
export type ListingSearches = ReturnType<typeof useListingSearches>;
