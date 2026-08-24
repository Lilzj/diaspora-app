import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet } from '@/components/overlays/AppModal';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { TourId } from '@/types/explore';
// ─────────────────────────────────────────────────────────────────────────────
// Remediation — the four tabs that never asked the platform anything
//
// Housing and Marketplace already read certified routes. The other four did not:
//
//     mockListings          → Providers tab
//     mockJobs              → Jobs tab
//     mockGuides            → Guides tab
//     mockCommunityUpdates  → Updates tab
//
// each filtered in-memory. So the platform's main discovery surface showed the
// same fabricated businesses — with ratings, review counts, "● Open Now" and a
// **"✓ VERIFIED" badge** — to every member on every device, and tapping one
// opened `/provider/{fixtureId}`, which is the screen whose `?? mockListings[0]`
// fallback was the highest-severity defect in this whole sweep.
//
// All four now read real routes, confirmed against the backend's actual HTTP
// mappings rather than inferred from names:
//
//     GET /providers              SearchProvidersQuery → ProviderPageResponse
//     GET /jobs                   SearchJobsQuery      ("BrowseJobs")
//     GET /guides                 SearchGuidesQuery    → CursorPagedResult<GuideCard…>
//     (no route)                  community updates
//
// Two of those are worth stating precisely, because the obvious guess is wrong
// in both cases: **there is no `GET /guides/search`** — guides search *is* the
// bare `GET /guides` — and **there is no `GET /jobs/search`**; the POST variant
// exists but browse is the bare `GET /jobs`.
//
// Community updates have **no list route anywhere on the platform**. Not a DTO
// without a mapping: there is no `/community/updates` segment, `GET
// /community/posts` is a by-id read with no collection route, listing is
// feed-only via `GET /community/feeds/{feedKey}`, and the only thing the backend
// calls an "update" is a *campaign* update on a different aggregate in a
// different module. So that tab says what is unavailable instead of inventing a
// local alert feed.
//
// ── The category rows ────────────────────────────────────────────────────────
//
// Every taxonomy here was a fixture whose ids matched nothing on any route, so
// picking a chip filtered fabricated rows and would have been silently dropped
// against a real one. Each tab now uses the taxonomy route that genuinely exists
// for it, and the tabs that have none say so rather than showing a dead row:
//
//     Providers    GET /providers/categories    → useServiceCategories
//     Guides       GET /guides/categories       → useGuideCategories
//     Jobs         GET /jobs/categories         — exists, no client yet
//     Marketplace  GET /marketplace/categories  — exists, no client yet
//     Housing      none — the taxonomy is split into `accommodation-types`
//                  and `amenities`, and neither is a category list
// ─────────────────────────────────────────────────────────────────────────────
import { GuideCard } from '@/components/GuideCard';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { JobCardSkeleton } from '@/components/Skeleton';
import { apiClient } from '@/lib/apiClient';
import { readPage } from '@/lib/platform-envelope';
import type { HousingListing } from '@/types/housing';
import type {
  MarketplaceListing,
  MarketplaceListingCardResponse,
  ListingIntent,
  ListingCondition,
} from '@/types/marketplace';
import { toMarketplaceListings } from '@/lib/marketplace-listings-api';

// Certified clients for the four tabs that used to render fixtures. See the
// remediation note above the card imports for what each route actually is.
import { useProviderSearch, useServiceCategories } from '@/hooks/providers';
import { useGuideSearch, useGuideCategories } from '@/hooks/guides';
import { useScopedContent } from '@/hooks/communities';

// Hyperlocal Discovery Engine Integrations
import { useLocationStore, getActiveLocation } from '@/store/location';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { RadiusSlider } from '@/components/RadiusSlider';
import { DistanceBadge } from '@/components/DistanceBadge';
import { NearbyIndicator } from '@/components/NearbyIndicator';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { useExploreStore } from '@/store/explore';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { FeatureGate } from '@/components/FeatureGate';
import type { DiscoveryCategory } from '@/types/maps';

// Frontend Phase 13 — Multi-Community Expansion.
//
// The audit found this screen filtering on `owner.originCountry?.code` — a country
// filter doing a community filter's job, which is the conflation §2 forbids. The
// migration is deliberately conservative and is registered as
// FRONTEND-PHASE13-GAP-009:
//
//   * The country picker stays. Filtering by country of origin is a legitimate
//     thing to want, and removing it would be a regression (§69).
//   * When a *community* scope is active it drives the filter instead, through the
//     one projection in `lib/community/scope.ts`.
//   * The list says which of the two is happening. `<CommunityScopeNote>` states
//     that community matching is done by country of origin, because it is.
//
// With no community selected — `ALL_COMMUNITIES` — the behaviour is byte-identical
// to what it was before this phase.
import { CommunityFilterBar, CommunityScopeNote } from '@/components/community-directory';
import { useCommunityScope } from '@/hooks/communities';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useThemeTokens } from '@/design-system';
import { useEffectRefresh } from '@/hooks/usePullToRefresh';

/**
 * Frontend Phase 8. Which map category each Discover tab opens onto.
 *
 * Guides and Updates map to `guide` and `alert` respectively — a community
 * update *is* a community alert on the map, translated rather than duplicated
 * (§27). `Community` opens on events, which is what that tab is mostly about.
 */
const DISCOVER_TAB_TO_MAP_CATEGORY: Record<string, DiscoveryCategory> = {
  Providers: 'provider',
  Jobs: 'job',
  Housing: 'housing',
  Marketplace: 'marketplace',
  Guides: 'guide',
  Updates: 'alert',
  Community: 'event',
};

/**
 * The community-updates list, which has no route to fill it.
 *
 * Module-level so the reference is stable across renders — an inline `[]` would
 * be a new array every time and would re-run every memo that depends on it.
 */
const EMPTY_UPDATES: never[] = [];

/** One pin on the inline map preview. */
interface MapPin {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  priceText?: string;
  rating?: number;
}


/** Which first-visit tour belongs to which Discover tab. */
const TOUR_FOR_TAB: Partial<Record<string, TourId>> = {
  Marketplace: 'marketplace',
  Jobs: 'jobs',
  Housing: 'housing',
  Community: 'community-life',
};
export default function DiscoverScreen() {
  const tokens = useThemeTokens();
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);
  const searchRadius = store.searchRadius;

  const params = useLocalSearchParams<{ tab?: string; query?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Providers' | 'Jobs' | 'Housing' | 'Marketplace' | 'Guides' | 'Updates' | 'Community'>('Providers');

  const exploreStore = useExploreStore();

  useEffect(() => {
    exploreStore.loadPersistedState();
  }, []);

  // ── First-visit tours, and why this is a `useFocusEffect` ─────────────────
  //
  // This started a tour 800ms after a tab was tapped, on a plain `useEffect`.
  // Nothing cancelled that timer when the member navigated away, so tapping
  // Marketplace and then opening a listing inside the delay fired the tour on
  // the *listing detail* — a screen where none of its target keys are
  // registered, so it fell through to the centred, full-screen-masked card
  // with no relationship to anything behind it. That is the "tour pops out and
  // disrupts the application" report, and the screenshots show exactly it.
  //
  // `useFocusEffect` tears down when the screen loses focus, so navigating away
  // cancels the pending tour rather than firing it somewhere else.
  //
  // The other two guards matter as much:
  //
  //   * `activeTour` — never stack a second tour over one already running.
  //   * `pausedTourId` — a member who paused chose to stop. `pauseTour` does
  //     not mark the tour completed, so without this it re-offered itself on
  //     every subsequent tab tap.
  useFocusEffect(
    useCallback(() => {
      if (!exploreStore.hasLoadedPersistedState) return;

      const tourId = TOUR_FOR_TAB[activeTab];
      if (!tourId) return;
      if (exploreStore.completedTours.includes(tourId)) return;
      if (exploreStore.activeTour || exploreStore.pausedTourId) return;

      // Still a delay, so child components have registered their layouts — but
      // one that dies with the screen.
      const timer = setTimeout(() => exploreStore.startTour(tourId), 800);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      activeTab,
      exploreStore.hasLoadedPersistedState,
      exploreStore.activeTour,
      exploreStore.pausedTourId,
    ])
  );

  useEffect(() => {
    if (params.tab && ['Providers', 'Jobs', 'Housing', 'Marketplace', 'Guides', 'Updates', 'Community'].includes(params.tab)) {
      setActiveTab(params.tab as any);
    }
    if (params.query) {
      setSearchQuery(params.query);
    }
  }, [params.tab, params.query]);
  
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isMapView, setIsMapView] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Discover is the app's main feed and did nothing on a pull. It loads through
  // `useEffect` rather than TanStack, so `useEffectRefresh` supplies the nonce
  // its fetch effects key off.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(isLoading);

  // Filters state
  const [sortBy, setSortBy] = useState<'default' | 'distance' | 'rating'>('default');
  const [filterVerified, setFilterVerified] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);

  // Frontend Phase 13. The active community scope, already projected onto the
  // country-of-origin codes the certified data actually carries.
  const communityFlags = getCommunityFeatureFlags();
  const { projection: communityProjection } = useCommunityScope();

  /**
   * The origin-country codes this screen filters on, and where they came from.
   *
   * The community scope wins when one is active, because the member chose a
   * community and that is the more specific request. The manual country picker is
   * the fallback and is unchanged, which is what keeps §69 true: with no community
   * selected this resolves to exactly `[selectedCountryCode]` — or `[]` — and every
   * filter below behaves as it did before Phase 13.
   */
  const originFilter = useMemo<{ codes: string[]; source: 'community' | 'country' | 'none' }>(() => {
    if (communityFlags.multiCommunityEnabled && !communityProjection.isUnscoped) {
      if (communityProjection.isEmpty) return { codes: [], source: 'community' };
      return { codes: communityProjection.originCountryCodes, source: 'community' };
    }

    return selectedCountryCode
      ? { codes: [selectedCountryCode.toUpperCase()], source: 'country' }
      : { codes: [], source: 'none' };
  }, [communityFlags.multiCommunityEnabled, communityProjection, selectedCountryCode]);

  /**
   * Whether an entity's publisher passes the active origin filter.
   *
   * An entity with no origin does **not** pass a scoped filter. An absent origin is
   * not evidence of belonging, and admitting it would make the filter mean "these
   * countries, plus anything unlabelled" — see `matchesProjection` in
   * `lib/community/scope.ts`, which applies the identical rule on the request path.
   */
  const passesOriginFilter = useCallback(
    (code: string | null | undefined): boolean => {
      if (originFilter.source === 'none') return true;
      // A community scope that resolved to nothing shows nothing, rather than
      // silently widening to everything.
      if (originFilter.codes.length === 0) return false;
      if (!code) return false;
      return originFilter.codes.includes(code.toUpperCase());
    },
    [originFilter]
  );

  // Job specific filters state
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
  const [perkAccommodation, setPerkAccommodation] = useState(false);
  const [perkMeals, setPerkMeals] = useState(false);
  const [perkTransport, setPerkTransport] = useState(false);

  // Housing specific filters state
  const [housingListings, setHousingListings] = useState<HousingListing[]>([]);
  // Remediation. Both remote tabs used to swallow their failure into a
  // `console.error`, so a 404 and an empty catalogue looked identical to the
  // member. These carry the difference to the empty state.
  const [housingError, setHousingError] = useState<string | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [rentMin, setRentMin] = useState<string>('');
  const [rentMax, setRentMax] = useState<string>('');
  const [bedroomsCount, setBedroomsCount] = useState<number | null>(null);
  const [bathroomsCount, setBathroomsCount] = useState<number | null>(null);
  const [furnishedStatus, setFurnishedStatus] = useState<string>('All');
  const [filterBillsIncluded, setFilterBillsIncluded] = useState(false);
  const [filterInternetIncluded, setFilterInternetIncluded] = useState(false);
  const [filterParkingAvailable, setFilterParkingAvailable] = useState(false);
  const [filterVerifiedHost, setFilterVerifiedHost] = useState(false);
  const [selectedLifestyleMatches, setSelectedLifestyleMatches] = useState<Record<string, boolean>>({});

  // Marketplace specific filters state
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
  const [marketIntent, setMarketIntent] = useState<ListingIntent | ''>('');
  const [marketCondition, setMarketCondition] = useState<ListingCondition | ''>('');
  const [marketMinPrice, setMarketMinPrice] = useState('');
  const [marketMaxPrice, setMarketMaxPrice] = useState('');
  const [marketMaxDistance, setMarketMaxDistance] = useState<number | null>(null);
  const [filterVerifiedSeller, setFilterVerifiedSeller] = useState(false);
  const [filterDeliveryAvailable, setFilterDeliveryAvailable] = useState(false);
  const [filterPickupOnly, setFilterPickupOnly] = useState(false);
  const [isGridView, setIsGridView] = useState(false);

  // Search History
  const [recentSearches, setRecentSearches] = useState(['Jollof', 'Braids', 'Peckham']);
  const [suggestions] = useState(['Mama Afrika', 'Visa application', 'Brixton market', 'Immigration tips']);

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
          const res = await apiClient.post('/marketplace/search', {
            text: searchQuery || undefined,
            categoryKey: selectedCategory || undefined,
            intent: marketIntent || undefined,
            city: activeLocation.cityName || undefined,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            radiusKm:
              marketMaxDistance ?? (searchRadius > 0 ? searchRadius : undefined),
            minimumPrice: marketMinPrice || undefined,
            maximumPrice: marketMaxPrice || undefined,
            condition: marketCondition || undefined,
            verifiedSellerOnly: filterVerifiedSeller || undefined,
            deliveryAvailable: filterDeliveryAvailable || undefined,
            pickupOnly: filterPickupOnly || undefined,
            sortBy: sortBy || undefined,
          });

          // `readPage` is the single place that knows the four list shapes these
          // routes return between them — a bare array, two hand-rolled cursor
          // pages with different total field names, and an offset page. Reading
          // `res.data.data` directly is what made the failure above silent.
          //
          // DEFECT-009: it used to read `readPage<MarketplaceListing>`, which is
          // a cast and therefore an assertion rather than a check. The server
          // sends `MarketplaceListingCardResponse` — `listingId` not `id`, a
          // `price` object not a number, `coverMediaId` not `coverImage` — so
          // every card in this tab rendered with an undefined key and navigated
          // to `/marketplace/undefined` when tapped. The page is now read as
          // what it is and mapped once, in the one place that knows the shape.
          const items = toMarketplaceListings(
            readPage<MarketplaceListingCardResponse>(res.data).items
          );

          // Client-side ordering is a tie-breaker over the server's, not a
          // substitute for it — and it operates on a copy, because sorting the
          // array `readPage` returned in place would mutate cached data.
          const ordered = [...items].sort((a, b) => {
            // An unrated seller sorts last rather than as a nought-star one:
            // `rating` is absent until somebody completes a purchase and reviews it.
            if (sortBy === 'rating') {
              return (b.seller?.rating?.average ?? -1) - (a.seller?.rating?.average ?? -1);
            }
            if (sortBy === 'distance') {
              return (a.location?.distanceKm ?? 0) - (b.location?.distanceKm ?? 0);
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          setMarketplaceListings(ordered);
          setMarketplaceError(null);
        } catch (err) {
          console.error('Failed to fetch marketplace listings', err);
          // The failure is now *shown*. Swallowing it into a console line is
          // what let an empty tab pass for an empty marketplace.
          setMarketplaceListings([]);
          setMarketplaceError('We could not load the marketplace just now.');
        } finally {
          setIsLoading(false);
        }
      };
      
      const timer = setTimeout(fetchMarketplace, 300);
      return () => clearTimeout(timer);
    }
  }, [
    activeTab, searchQuery, selectedCategory, activeLocation, searchRadius, marketIntent,
    marketCondition, marketMinPrice, marketMaxPrice, marketMaxDistance,
    filterVerifiedSeller, filterDeliveryAvailable, filterPickupOnly, sortBy,
    refreshNonce
  ]);

  // API Fetcher for Housing
  useEffect(() => {
    if (activeTab === 'Housing') {
      setIsLoading(true);
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
          const lifestylePrefList = Object.keys(selectedLifestyleMatches).filter(k => selectedLifestyleMatches[k]).join(',');
          
          // ── Remediation ────────────────────────────────────────────────────
          //
          // This called flat `GET /housing`, which no module publishes: the
          // Housing prefix has `/housing/search`, `/housing/dashboard`,
          // `/housing/listings/{idOrSlug}` and so on, but nothing at the root.
          // Every request 404'd into the `catch` below and the Housing tab
          // stayed empty without saying why.
          //
          // The real route is `GET /housing/search` → `SearchHousingQuery`.
          const res = await apiClient.get('/housing/search', {
            params: {
              query: searchQuery,
              cityName: activeLocation.cityName,
              latitude: activeLocation.latitude,
              longitude: activeLocation.longitude,
              radiusKm: searchRadius > 0 ? searchRadius : undefined,
              minPrice: rentMin || undefined,
              maxPrice: rentMax || undefined,
              bedrooms: bedroomsCount || undefined,
              bathrooms: bathroomsCount || undefined,
              furnished: furnishedStatus !== 'All' ? furnishedStatus : undefined,
              billsIncluded: filterBillsIncluded || undefined,
              internetIncluded: filterInternetIncluded || undefined,
              parkingAvailable: filterParkingAvailable || undefined,
              verifiedHostOnly: filterVerifiedHost || undefined,
              lifestyleMatches: lifestylePrefList || undefined,
              sortBy: sortBy,
            }
          });
          
          const items = readPage<HousingListing>(res.data).items;

          const ordered = [...items].sort((a, b) => {
            // An unrated landlord sorts last rather than as a nought-star one:
            // `rating` is absent until somebody completes a tenancy and reviews it.
            if (sortBy === 'rating') {
              return (b.host?.rating?.average ?? -1) - (a.host?.rating?.average ?? -1);
            }
            if (sortBy === 'distance') {
              return (a.location?.distanceKm ?? 0) - (b.location?.distanceKm ?? 0);
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          setHousingListings(ordered);
          setHousingError(null);
        } catch (err) {
          console.error('Failed to fetch housing listings', err);
          setHousingListings([]);
          setHousingError('We could not load housing just now.');
        } finally {
          setIsLoading(false);
        }
      };
      
      const timer = setTimeout(fetchHousing, 300);
      return () => clearTimeout(timer);
    }
  }, [
    activeTab, searchQuery, selectedCategory, activeLocation, searchRadius, rentMin, rentMax,
    bedroomsCount, bathroomsCount, furnishedStatus, filterBillsIncluded,
    filterInternetIncluded, filterParkingAvailable, filterVerifiedHost,
    selectedLifestyleMatches, sortBy,
    refreshNonce
  ]);

  const handleSuggestionPress = (query: string) => {
    setSearchQuery(query);
  };

  const clearRecent = () => setRecentSearches([]);

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

  /** `GET /providers` — `SearchProvidersQuery` → `ProviderPageResponse`. */
  const providerSearch = useProviderSearch(
    {
      query: searchQuery.trim() || undefined,
      // The provider taxonomy binds as `categoryId`. Sending the fixture's `id`
      // under `category` was dropped by the serialiser, which is how a filter
      // comes to look like it works and does not.
      categoryId: activeTab === 'Providers' ? selectedCategory ?? undefined : undefined,
      cityName: activeLocation.cityName || undefined,
      latitude: activeLocation.latitude,
      longitude: activeLocation.longitude,
      radiusKm: searchRadius > 0 ? searchRadius : undefined,
      verifiedOnly: filterVerified || undefined,
      sortBy: sortBy || undefined,
    },
    { enabled: activeTab === 'Providers' }
  );

  const baseListings = providerSearch.page?.items ?? [];

  const filteredListings = useMemo(
    // `ProviderOwner` carries `originCountryCode` as a bare string — there is no
    // nested `originCountry` object on the certified response, which is the
    // fixture's shape.
    () => baseListings.filter((item) => passesOriginFilter(item.owner.originCountryCode)),
    [baseListings, passesOriginFilter]
  );

  /**
   * `GET /jobs` — the browse route (`WithName("BrowseJobs")`).
   *
   * Reached through `useScopedContent`, which is the platform's certified reader
   * for `DOMAIN_ROUTES.job` and already applies the community projection. There
   * is no typed jobs-browse client to reuse: `lib/jobs-hiring-api.ts` covers the
   * fifteen hiring-workflow routes and states in its own header that the browse
   * universe is a different one. Writing a second client for one list is what
   * this codebase keeps telling itself not to do.
   *
   * Note there is **no `GET /jobs/search`** — the POST variant exists, but browse
   * is the bare group route.
   */
  const jobSearch = useScopedContent<Record<string, unknown>>(
    'job',
    {
      query: searchQuery.trim() || undefined,
      cityName: activeLocation.cityName || undefined,
      latitude: activeLocation.latitude,
      longitude: activeLocation.longitude,
      radiusKm: searchRadius > 0 ? searchRadius : undefined,
      sortBy: sortBy || undefined,
    },
    { enabled: activeTab === 'Jobs' }
  );

  const baseJobs = useMemo(() => jobSearch.data?.items ?? [], [jobSearch.data]);

  const filteredJobs = useMemo(
    () =>
      baseJobs.filter((item) => {
        const employer = item.employer as Record<string, unknown> | undefined;
        const origin = employer?.originCountry as Record<string, unknown> | undefined;
        const code =
          (typeof origin?.code === 'string' ? origin.code : null) ??
          (typeof employer?.originCountryCode === 'string' ? employer.originCountryCode : null);

        return passesOriginFilter(code);
      }),
    [baseJobs, passesOriginFilter]
  );

  const displayedHousingListings = useMemo(
    () => housingListings.filter((item) => passesOriginFilter(item.host.originCountry?.code)),
    [housingListings, passesOriginFilter]
  );

  const displayedMarketplaceListings = useMemo(
    () => marketplaceListings.filter((item) => passesOriginFilter(item.seller.originCountry?.code)),
    [marketplaceListings, passesOriginFilter]
  );

  const availableCountries = useMemo(() => {
    const countriesMap = new Map<string, { code: string; name: string; flag: string }>();

    // Providers and jobs no longer contribute options.
    //
    // The certified provider response carries `owner.originCountryCode` — a bare
    // ISO code, with **no country name and no flag**. This control renders a flag
    // and a name, and there is no route that expands a code into either, so
    // offering a provider's origin here would mean inventing the label. The
    // fixture had a whole `{ code, name, flag }` object to hand, which is the
    // only reason the control ever looked complete.
    //
    // Origin-country scoping is the community filter's job on this screen —
    // `<CommunityFilterBar>`, which resolves real communities with real names.
    if (activeTab === 'Housing') {
      housingListings.forEach((item) => {
        if (item.host.originCountry) {
          countriesMap.set(item.host.originCountry.code, item.host.originCountry);
        }
      });
    } else if (activeTab === 'Marketplace') {
      marketplaceListings.forEach((item) => {
        if (item.seller.originCountry) {
          countriesMap.set(item.seller.originCountry.code, item.seller.originCountry);
        }
      });
    }

    return Array.from(countriesMap.values());
  }, [activeTab, baseListings, baseJobs, housingListings, marketplaceListings]);

  useEffect(() => {
    if (selectedCountryCode && !availableCountries.some(c => c.code === selectedCountryCode)) {
      setSelectedCountryCode(null);
    }
  }, [availableCountries, selectedCountryCode]);

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
    },
    { enabled: activeTab === 'Guides' }
  );

  const filteredGuides = guideSearch.guides;

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

  /**
   * Whether to show the skeletons — from real request state, per tab.
   *
   * Housing and Marketplace still drive the `isLoading` state directly from
   * their own `useEffect` fetchers; the three certified reads report their own.
   * The Updates and Community tabs never load, because neither issues a request.
   */
  const showLoading =
    activeTab === 'Providers'
      ? providerSearch.isLoading
      : activeTab === 'Jobs'
        ? jobSearch.isLoading
        : activeTab === 'Guides'
          ? guideSearch.isLoading
          : activeTab === 'Housing' || activeTab === 'Marketplace'
            ? isLoading
            : false;

  /**
   * Community updates — there is no route, so there is no list.
   *
   * Held as a constant rather than deleted so the Updates tab keeps its shape
   * and renders the honest empty state below. See the header for why this is a
   * genuine absence and not a missing client: no `/community/updates` segment
   * exists, `GET /community/posts` has no collection route, listing is feed-only
   * via `GET /community/feeds/{feedKey}`, and `feeds/search` is a declared key
   * with no registered provider — it 404s.
   *
   * The nearest real thing is `GET /communities/announcements`, in the separate
   * CommunityProgramme module. It is a different object on a different aggregate
   * with a different scope model, and quietly relabelling announcements as local
   * community alerts would restate the same lie with real data behind it.
   */
  const filteredUpdates: never[] = EMPTY_UPDATES;

  // Compute pins for map representation
  /**
   * Pins for the inline map preview.
   *
   * ── Why this stopped being one `any[]` walk over four shapes ──────────────
   *
   * It read `item.listingId || item.jobId || item.id`, `item.title` and
   * `item.rating?.average` off an `any`, which happened to line up with the four
   * *fixtures*. Two of those four are certified now and the third and fourth
   * always were, and the real shapes do not agree: a provider is `providerId` /
   * `name` / `reviewSummary.average`, not `listingId` / `title` / `rating`. Under
   * `any` that mismatch is invisible — every pin would have carried an empty id
   * and an undefined title, and tapping one would have gone nowhere.
   *
   * So each tab maps its own shape, explicitly. `unknown` rather than `any` for
   * the two opaque ones, so nothing is read without being narrowed first.
   */
  const mapPins = useMemo<MapPin[]>(() => {
    const readNumber = (value: unknown): number | undefined =>
      typeof value === 'number' ? value : undefined;

    const coordinatesOf = (location: Record<string, unknown> | undefined) => {
      const latitude = readNumber(location?.latitude);
      const longitude = readNumber(location?.longitude);
      if (latitude === undefined || longitude === undefined) return null;
      return { latitude, longitude, distanceKm: readNumber(location?.distanceKm) ?? 0 };
    };

    if (activeTab === 'Providers') {
      return filteredListings.flatMap((item) => {
        const coordinates = coordinatesOf(item.location as Record<string, unknown>);
        if (!coordinates) return [];

        return [
          {
            id: item.providerId,
            title: item.name,
            category: item.category.name,
            ...coordinates,
            rating: item.reviewSummary.average,
          },
        ];
      });
    }

    if (activeTab === 'Jobs') {
      return filteredJobs.flatMap((item) => {
        const coordinates = coordinatesOf(item.location as Record<string, unknown> | undefined);
        if (!coordinates) return [];

        const category = item.category;

        return [
          {
            id: String(item.jobId ?? item.id ?? ''),
            title: String(item.title ?? ''),
            category:
              typeof category === 'string'
                ? category
                : String((category as Record<string, unknown> | undefined)?.name ?? 'Job'),
            ...coordinates,
          },
        ];
      });
    }

    if (activeTab === 'Housing') {
      return displayedHousingListings.flatMap((item) => {
        const coordinates = coordinatesOf(item.location as unknown as Record<string, unknown>);
        if (!coordinates) return [];

        return [
          {
            id: item.id,
            title: item.title,
            category: 'Housing',
            ...coordinates,
            priceText: `${item.rent} ${item.currency || 'GBP'}`,
            rating: item.host?.rating,
          },
        ];
      });
    }

    if (activeTab === 'Marketplace') {
      return displayedMarketplaceListings.flatMap((item) => {
        const coordinates = coordinatesOf(item.location as unknown as Record<string, unknown>);
        if (!coordinates) return [];

        return [
          {
            id: item.id,
            title: item.title,
            category: 'Marketplace',
            ...coordinates,
            priceText: item.price !== undefined ? `${item.price} ${item.currency || 'GBP'}` : undefined,
            rating: item.seller?.rating,
          },
        ];
      });
    }

    return [];
  }, [activeTab, filteredListings, filteredJobs, displayedHousingListings, displayedMarketplaceListings]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Search Header Area */}
      <View className="bg-surface-card border-b border-faint px-6 py-4 shadow-sm shadow-neutral-100">
        
        {/* Top Header Location & Toggle */}
        <View className="flex-row items-center justify-between mb-4">
          <TourSpotlight spotlightKey="neighborhood_pin">
            <TouchableOpacity
              onPress={() => setIsLocationSelectorOpen(true)}
              className="flex-row items-center"
              activeOpacity={0.7}
            >
              <Text className="text-base font-extrabold text-content-primary mr-1">
                📍 Explore {activeLocation.neighborhood}
              </Text>
              <Text className="text-xs text-content-muted font-bold">· {activeLocation.cityName} ▾</Text>
            </TouchableOpacity>
          </TourSpotlight>

          {/* Map/List Switch */}
          <TouchableOpacity
            onPress={() => setIsMapView(!isMapView)}
            className="bg-surface-background px-3 py-1.5 rounded-full border border-subtle"
          >
            <Text className="text-xs font-bold text-content-secondary">
              {isMapView ? '🗺️ List View' : '📍 Map View'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Universal Search Input */}
        {/* Spotlight target for the jobs, housing and marketplace tours. The
            three of them run on this screen with a different `?tab=`, so the
            anchors are the screen's own controls rather than one per vertical. */}
        <TourSpotlight spotlightKey="discover_search">
        <View className="flex-row items-center h-14 bg-surface-background border border-subtle rounded-2xl px-4">
          <Text className="text-lg mr-3 text-content-faint">🔍</Text>
          <TextInput
            placeholder={`Search ${activeTab.toLowerCase()} near you...`}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm font-semibold text-content-strong h-full"
            placeholderTextColor={tokens.color.text.placeholder}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1 mr-1">
              <Text className="text-xs text-content-muted">✕</Text>
            </TouchableOpacity>
          ) : null}
          <TourSpotlight spotlightKey="discover_filters">
            <TouchableOpacity
              onPress={() => setIsFilterModalOpen(true)}
              className="border-l border-subtle pl-3 py-1"
            >
              <Text className="text-lg">🎛️</Text>
            </TouchableOpacity>
          </TourSpotlight>
        </View>
        </TourSpotlight>
      </View>

      {/* Main Container */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={refreshControl}>
        
        {/* Tab Row (Providers, Jobs, Housing, Marketplace, Guides, Updates) */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          className="bg-surface-card border-b border-faint mb-2 max-h-[50px]"
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {['Providers', 'Jobs', 'Housing', 'Marketplace', 'Guides', 'Updates', 'Community'].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  setActiveTab(tab as any);
                  setSelectedCategory(null);
                }}
                className={`items-center justify-center py-3 px-4 border-b-2 ${
                  isActive ? 'border-primary-500' : 'border-transparent'
                }`}
              >
                <Text
                  className={`text-sm font-extrabold ${
                    isActive ? 'text-primary-500' : 'text-content-muted'
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Frontend Phase 13, §15. The one reusable community filter, on the
            platform's main discovery surface. Reads and writes the same context
            store every other community filter in the app does — §15 forbids a
            separate incompatible filter per feature, and there is only one
            component to mount. */}
        <View className="bg-surface-card border-b border-faint mb-2">
          <CommunityFilterBar compact />
        </View>

        {/* §2 / GAP-009. Where a community scope narrowed the list, say so — and
            say that the narrowing was done by country of origin rather than by a
            community anybody declared. A list that implied otherwise would be the
            exact conflation this phase exists to remove. */}
        {originFilter.source === 'community' ? (
          <View className="px-4 mb-2">
            <CommunityScopeNote projection={communityProjection} compact />
          </View>
        ) : null}

        {/* Radius configuration slider */}
        {activeTab !== 'Guides' && activeTab !== 'Community' && (
          <TourSpotlight spotlightKey="proximity_radius_slider" style={{ width: '100%' }}>
            <View className="bg-surface-card py-3 border-b border-faint mb-2">
              <RadiusSlider
                value={searchRadius}
                onChange={(val) => store.setSearchRadius(val)}
              />
            </View>
          </TourSpotlight>
        )}

        {/* Suggestions Panel (shown only when query is empty and no category is selected) */}
        {!searchQuery && !selectedCategory && (
          <View className="bg-surface-card p-6 border-b border-faint mb-3">
            {recentSearches.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Recent Searches</Text>
                  <TouchableOpacity onPress={clearRecent}>
                    <Text className="text-xs font-semibold text-content-faint">Clear</Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row flex-wrap">
                  {recentSearches.map((term, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handleSuggestionPress(term)}
                      className="bg-surface-background border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
                    >
                      <Text className="text-xs text-content-tertiary font-semibold">🕒 {term}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Popular Searches</Text>
            <View className="flex-row flex-wrap">
              {suggestions.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSuggestionPress(item)}
                  className="bg-surface-background border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
                >
                  <Text className="text-xs text-content-secondary font-semibold">{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Category Filters row (mainly for Providers, Jobs, Guides, & Housing) */}
        {activeTab !== 'Updates' && activeTab !== 'Community' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center' }}
            className="bg-surface-card border-b border-faint mb-2"
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full mr-2.5 ${
                selectedCategory === null ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
              }`}
            >
              <Text className={`text-xs font-bold ${selectedCategory === null ? 'text-white' : 'text-content-secondary'}`}>
                All
              </Text>
            </TouchableOpacity>
            {/* ── Only the taxonomies that exist ─────────────────────────────
                Each of the four fixture taxonomies had ids that matched nothing
                on any route, so a chip filtered fabricated rows and would have
                been dropped silently against a real one. Providers and Guides
                have real catalogue routes and use them. Jobs and Marketplace
                have real routes with no client yet; Housing has no category
                route at all — its taxonomy is `accommodation-types` plus
                `amenities`, which are not a category list. Those three render no
                chips rather than dead ones. */}
            {categoryOptions.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategory(isSelected ? null : cat.id)}
                  className={`flex-row items-center px-4 py-2 rounded-full mr-2.5 ${
                    isSelected ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                  }`}
                >
                  {cat.icon ? <Text className="text-xs mr-1.5">{cat.icon}</Text> : null}
                  <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}



        {/* Map View Simulation */}
        {isMapView ? (
          <View className="px-6 my-4">
            <MapPreviewCard
              center={activeLocation}
              pins={mapPins}
              radiusKm={searchRadius}
            />

            {/*
              Frontend Phase 8. The inline preview above stays as it is — it is
              a glanceable summary of the results already on this screen, and
              replacing it would be a regression for the common case.

              This is the entry into the full map: pan, zoom, clustering,
              viewport search, layers, alerts and directions. It carries the
              active tab across so the map opens on what the member was already
              looking at, rather than resetting their filters.
            */}
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/map',
                  params: { category: DISCOVER_TAB_TO_MAP_CATEGORY[activeTab] ?? 'housing' },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Open the full map, with pan, zoom, filters and directions"
              className="flex-row items-center justify-center bg-primary-500 py-3.5 rounded-2xl active:bg-primary-600"
            >
              <Text className="text-white text-[11px] font-black uppercase tracking-wider">
                Open the full map
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* List View Results */
          <FeatureGate featureName={activeTab} fullScreen={false}>
            <View className="p-6">
            
            {showLoading ? (
              /* Loading Skeleton States */
              <View className="flex-col gap-4">
                {activeTab === 'Jobs' ? (
                  [1, 2, 3].map((n) => <JobCardSkeleton key={n} />)
                ) : (
                  [1, 2, 3].map((n) => (
                    <View key={n} className="bg-surface-card p-4 rounded-3xl border border-subtle opacity-60">
                      <View className="h-32 bg-subtle rounded-xl mb-4" />
                      <View className="h-6 bg-subtle rounded w-2/3 mb-2" />
                      <View className="h-4 bg-subtle rounded w-1/2" />
                    </View>
                  ))
                )}
              </View>
            ) : (
              /* Actual Results rendering */
              /* The results themselves are the third spotlight anchor. Steps
                 that described a badge on an individual card point here
                 instead: wrapping a rendered row would register whichever row
                 happened to render last, so the spotlight would land on an
                 arbitrary card. */
              <TourSpotlight spotlightKey="discover_results">
              <View>
                {/* Providers Tab */}
                {activeTab === 'Providers' && (
                  <View>
                    {providerSearch.isError ? (
                      /* Distinct from the empty state on purpose. "There are no
                         providers near you" and "we could not ask" are opposite
                         facts, and collapsing the second into the first tells the
                         member the reassuring one. */
                      <EmptyStateView
                        label="providers"
                        city={activeLocation.cityName}
                        error="We could not reach service providers just now."
                      />
                    ) : filteredListings.length > 0 ? (
                      filteredListings.map((item) => (
                        <TouchableOpacity
                          key={item.providerId}
                          onPress={() => router.push(`/provider/${item.providerId}`)}
                          className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-4 shadow-sm"
                        >
                          {/* ── Why there is no <Image source={{uri}}> here now ──
                              `ProviderSummary` carries `coverMedia`, a Media
                              *reference* with a `mediaId` — not a URL. The
                              fixture had a `coverImageUrl`, which is the only
                              reason this ever rendered a photograph. Resolving a
                              reference needs a `useMediaAsset` query per card,
                              which cannot be called inside this map. A neutral
                              block is the honest stand-in: a provider with no
                              resolved photograph must not look like one with
                              somebody else's shop front. */}
                          <View className="w-full h-40 bg-surface-muted items-center justify-center">
                            <Text className="text-3xl opacity-40">🏪</Text>
                          </View>
                          <View className="p-4">
                            <View className="flex-row items-center justify-between mb-1">
                              <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                                {item.category.name}
                              </Text>
                              {/* The badge is now the server's own
                                  `isVerified`, not a fixture's status string. */}
                              {item.isVerified && (
                                <Text className="text-[10px] bg-success-surface text-success-default px-2 py-0.5 rounded font-extrabold">
                                  ✓ VERIFIED
                                </Text>
                              )}
                            </View>
                            <Text className="text-lg font-bold text-content-primary mb-1">{item.name}</Text>
                            <Text className="text-xs text-content-muted font-semibold mb-3">
                              📍 {item.location.areaName ?? item.location.cityName ?? 'Location not given'}
                              {typeof item.location.distanceKm === 'number'
                                ? ` · ${item.location.distanceKm} km away`
                                : ''}
                            </Text>
                            <View className="flex-row items-center justify-between border-t border-faint pt-3">
                              {/* A provider with no reviews says so, rather than
                                  showing "★ 0 (0 reviews)" — which reads as a
                                  bad rating rather than as no rating. */}
                              <Text className="text-xs font-bold text-content-secondary">
                                {item.reviewSummary.totalReviews > 0
                                  ? `★ ${item.reviewSummary.average} (${item.reviewSummary.totalReviews} reviews)`
                                  : 'No reviews yet'}
                              </Text>
                              {/* `isOpenNow` is nullable: the server returns null
                                  when it does not know. Null must not render as
                                  "● Closed", which is a claim about the business. */}
                              {item.isOpenNow !== null && item.isOpenNow !== undefined ? (
                                <Text className={`text-xs font-bold ${item.isOpenNow ? 'text-success-default' : 'text-content-faint'}`}>
                                  {item.isOpenNow ? '● Open Now' : '● Closed'}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))
                     ) : (
                       <EmptyStateView label="providers" city={activeLocation.cityName} />
                     )}
                   </View>
                 )}
 
                 {/* Jobs Tab */}
                 {activeTab === 'Jobs' && (
                   <View>
                     {jobSearch.isError ? (
                       <EmptyStateView
                         label="jobs"
                         city={activeLocation.cityName}
                         error="We could not reach jobs just now."
                       />
                     ) : filteredJobs.length > 0 ? (
                       filteredJobs.map((item, index) => (
                         /* The cast is the same one `CommunityContentSection`
                            documents for this route: `useScopedContent` returns
                            rows from `GET /jobs` as opaque records because the
                            community projection does not need their shape, and
                            `JobCard` wants `JobOpportunity` — a type
                            `lib/jobs-hiring-api.ts` explicitly calls an older
                            universe. Narrowing it properly needs a typed jobs
                            browse client, which does not exist yet and is
                            recorded in the report rather than invented here. */
                         <JobCard
                           key={String(item.jobId ?? item.id ?? index)}
                           job={item as never}
                         />
                       ))
                     ) : (
                       <EmptyStateView label="jobs" city={activeLocation.cityName} />
                     )}
                   </View>
                 )}
 
                 {/* Guides Tab */}
                 {activeTab === 'Guides' && (
                   <View>
                     {guideSearch.error ? (
                       <EmptyStateView
                         label="guides"
                         city={activeLocation.cityName}
                         error="We could not reach guides just now."
                       />
                     ) : filteredGuides.length > 0 ? (
                       filteredGuides.map((item) => (
                         <GuideCard
                           key={item.guideId}
                           /* `GET /guides` returns `GuideCardResponse`; the card
                              is typed against the older `GuideSummary`. Same
                              reconciliation the shared
                              `CommunityContentSection` makes for this exact
                              route — the card reads the fields the two shapes
                              share. */
                           guide={item as never}
                           /* ── Why the author is neutral ────────────────────
                              This read `mockAuthors[item.authorId]` and, on a
                              hit, rendered that fixture's name, avatar,
                              reputation level, country-verification badge and
                              follower count as the *real* author of a real
                              guide. A reputation level and a verification badge
                              are trust signals; attaching a fabricated pair to a
                              genuine guide is worse than attaching none.

                              There is no route that expands an author id into a
                              profile — `GET /guides/authors/{authorId}` lists
                              that author's *guides*, not the author — so the
                              card gets the same neutral author the shared
                              `CommunityContentSection` gives it, and the real
                              attribution comes from the guide itself. */
                           author={{
                             userId: item.authorId ?? '',
                             name: 'Community member',
                             avatarUrl: null,
                             reputationLevel: 'Newcomer',
                             isCountryVerified: false,
                             primaryCountry: null,
                             expertiseCategories: [],
                             followerCount: 0,
                             isFollowedByUser: false,
                           } as never}
                           variant="list"
                         />
                       ))
                     ) : (
                       <EmptyStateView label="guides" city={activeLocation.cityName} />
                     )}
                   </View>
                 )}
 
                 {/* Updates Tab */}
                 {activeTab === 'Updates' && (
                   <View>
                     {/* `filteredUpdates` is `EMPTY_UPDATES` and always will be
                         until a list route exists — see its declaration. The map
                         is kept so the tab renders rows the day one does; today
                         it falls through to the panel below. */}
                     {filteredUpdates.length > 0 ? null : (
                       <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-10 shadow-sm">
                         <Text className="text-4xl mb-3">📢</Text>
                         <Text className="text-base font-black text-content-primary text-center tracking-tight">
                           Community updates aren&apos;t available yet
                         </Text>
                         <Text className="text-xs text-content-muted mt-2 text-center leading-relaxed max-w-[280px]">
                           This tab used to show local alerts that were not real. The
                           platform has no way to list community updates yet, so
                           rather than show invented ones, it shows none.
                         </Text>
                         <TouchableOpacity
                           onPress={() => router.push('/community-life')}
                           className="bg-primary-500 px-6 py-3 rounded-full mt-5"
                         >
                           <Text className="text-white font-black text-xs">
                             See what is happening nearby →
                           </Text>
                         </TouchableOpacity>
                       </View>
                     )}
                   </View>
                 )}
 
                 {/* Housing Tab */}
                 {activeTab === 'Housing' && (
                   <View>
                     {displayedHousingListings.length > 0 ? (
                       displayedHousingListings.map((item) => (
                         <HousingCard key={item.id} listing={item} />
                       ))
                     ) : (
                       <EmptyStateView label="homes & housing" city={activeLocation.cityName} error={housingError} />
                     )}
                   </View>
                 )}
 
                 {/* Marketplace Tab */}
                 {activeTab === 'Marketplace' && (
                   <View>
                     <View className="flex-row justify-between items-center mb-4">
                       <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
                         {displayedMarketplaceListings.length} item{displayedMarketplaceListings.length === 1 ? '' : 's'} nearby
                       </Text>
                       <TouchableOpacity
                         onPress={() => setIsGridView(!isGridView)}
                         className="bg-surface-muted px-3 py-1.5 rounded-full border border-subtle"
                       >
                         <Text className="text-xs font-bold text-content-secondary">
                           {isGridView ? '☰ List View' : '⊞ Grid View'}
                         </Text>
                       </TouchableOpacity>
                     </View>
 
                     {displayedMarketplaceListings.length > 0 ? (
                       isGridView ? (
                         <View className="flex-row flex-wrap justify-between">
                           {displayedMarketplaceListings.map((item) => (
                             <MarketplaceCard key={item.id} listing={item} variant="grid" />
                           ))}
                         </View>
                       ) : (
                         <View>
                           {displayedMarketplaceListings.map((item) => (
                             <MarketplaceCard key={item.id} listing={item} variant="list" />
                           ))}
                         </View>
                       )
                     ) : (
                       <EmptyStateView label="marketplace listings" city={activeLocation.cityName} error={marketplaceError} />
                     )}
                   </View>
                 )}

                {/* Community Life Tab */}
                {activeTab === 'Community' && (
                  <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-10 shadow-sm">
                    <Text className="text-5xl mb-4">🎉</Text>
                    <Text className="text-lg font-black text-content-primary text-center tracking-tight">Introducing Community Life!</Text>
                    <Text className="text-xs text-content-muted mt-2 text-center leading-relaxed max-w-[280px] mb-6">
                      Discover local events, follow trusted organizations, access shared community calendars, and build belonging near you.
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push('/community-life')}
                      className="bg-primary-500 px-8 py-3.5 rounded-full shadow-lg shadow-primary-500/20"
                    >
                      <Text className="text-white font-black text-sm">Enter Community Life Hub →</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              </TourSpotlight>
            )}
            </View>
          </FeatureGate>
        )}
      </ScrollView>

      {/* Filter Bottom Sheet Modal */}
      {/* The filter sheet carries four fields, including the price range, and
          previously had no keyboard handling at all — on Android 15+ the window
          does not resize, so the lower fields sat behind the keyboard (F-033).
          `Sheet` supplies the avoidance, the bottom safe area, the single scrim
          and the assistive-technology containment. */}
      <Sheet
        visible={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filters & Sort"
        testID="discover-filter-sheet"
      >
            <View>

            {/* Sort Options */}
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Sort By</Text>
            <View className="flex-row mb-6">
              {[
                { label: 'Recommended', value: 'default' },
                { label: 'Distance', value: 'distance' },
                { label: 'Rating', value: 'rating' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setSortBy(opt.value as any)}
                  className={`px-4 py-2.5 rounded-full mr-2.5 ${
                    sortBy === opt.value ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                  }`}
                >
                  <Text className={`text-xs font-bold ${sortBy === opt.value ? 'text-white' : 'text-content-secondary'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Lister's Origin Country Filter */}
            {availableCountries.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-3">
                  Lister's Origin Country
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="flex-row"
                >
                  <TouchableOpacity
                    onPress={() => setSelectedCountryCode(null)}
                    className={`px-4 py-2.5 rounded-full mr-2 flex-row items-center border ${
                      selectedCountryCode === null
                        ? 'bg-primary-500 border-primary-500'
                        : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${selectedCountryCode === null ? 'text-white' : 'text-content-secondary'}`}>
                      All Countries
                    </Text>
                  </TouchableOpacity>
                  {availableCountries.map((c) => {
                    const isSelected = selectedCountryCode === c.code;
                    return (
                      <TouchableOpacity
                        key={c.code}
                        onPress={() => setSelectedCountryCode(isSelected ? null : c.code)}
                        className={`px-4 py-2.5 rounded-full mr-2 flex-row items-center border ${
                          isSelected
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-surface-background border-subtle'
                        }`}
                      >
                        <Text className="text-sm mr-1.5">{c.flag}</Text>
                        <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {activeTab === 'Marketplace' ? (
              <ScrollView className="max-h-[350px]" showsVerticalScrollIndicator={false}>
                {/* Intent Selection */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Listing Intent</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
                  {['Selling', 'Buying Request', 'Giving Away', 'Exchange / Swap', 'Wanted', 'Donation'].map((intent) => {
                    const isSel = marketIntent === intent;
                    return (
                      <TouchableOpacity
                        key={intent}
                        onPress={() => setMarketIntent(isSel ? '' : intent as any)}
                        className={`px-4 py-2 rounded-full mr-2.5 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                          {intent}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Price range input */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Price Range</Text>
                <View className="flex-row items-center gap-3 mb-5">
                  <TextInput
                    placeholder="Min Price"
                    value={marketMinPrice}
                    onChangeText={setMarketMinPrice}
                    keyboardType="numeric"
                    className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
                  />
                  <Text className="text-content-faint">-</Text>
                  <TextInput
                    placeholder="Max Price"
                    value={marketMaxPrice}
                    onChangeText={setMarketMaxPrice}
                    keyboardType="numeric"
                    className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
                  />
                </View>

                {/* Proximity / Distance Slider */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Distance Radius (Max)</Text>
                <View className="flex-row mb-5">
                  {[2, 5, 10, 20, 50].map((dist) => {
                    const isSel = marketMaxDistance === dist;
                    return (
                      <TouchableOpacity
                        key={dist}
                        onPress={() => setMarketMaxDistance(isSel ? null : dist)}
                        className={`px-3 py-2 rounded-full mr-2 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
                      >
                        <Text className={`text-[10px] font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                          {dist} km
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Item Condition */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Condition</Text>
                <View className="flex-row mb-5 flex-wrap gap-2">
                  {['New', 'Like New', 'Very Good', 'Good', 'Fair'].map((cond) => {
                    const isSel = marketCondition === cond;
                    return (
                      <TouchableOpacity
                        key={cond}
                        onPress={() => setMarketCondition(isSel ? '' : cond as any)}
                        className={`px-3 py-2 rounded-full mr-2 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
                      >
                        <Text className={`text-[10px] font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                          {cond}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Delivery & Trust toggles */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Delivery & Verification</Text>
                <View className="flex-row flex-wrap gap-2.5 mb-5">
                  {[
                    { label: '🚚 Delivery Available', value: filterDeliveryAvailable, setter: setFilterDeliveryAvailable },
                    { label: '🏪 Pickup Only', value: filterPickupOnly, setter: setFilterPickupOnly },
                    { label: '🛡️ Verified Sellers Only', value: filterVerifiedSeller, setter: setFilterVerifiedSeller },
                  ].map((perk, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => perk.setter(!perk.value)}
                      className={`px-4 py-2 rounded-2xl flex-row items-center border ${
                        perk.value ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-content-secondary'}`}>
                        {perk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : activeTab === 'Jobs' ? (
              <View>
                {/* Employment Type */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Employment Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
                  {['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Freelance', 'Volunteer'].map((type) => {
                    const isSel = selectedJobType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setSelectedJobType(isSel ? null : type)}
                        className={`px-4 py-2.5 rounded-full mr-2.5 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Benefits / Perks */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Include Benefits</Text>
                <View className="flex-row flex-wrap gap-2.5 mb-5">
                  {[
                    { label: '🛌 Accommodation Included', value: perkAccommodation, setter: setPerkAccommodation },
                    { label: '🍲 Meals Included', value: perkMeals, setter: setPerkMeals },
                    { label: '🚗 Transport Included', value: perkTransport, setter: setPerkTransport },
                  ].map((perk, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => perk.setter(!perk.value)}
                      className={`px-4 py-2 rounded-2xl flex-row items-center border ${
                        perk.value ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${perk.value ? 'text-primary-700' : 'text-content-secondary'}`}>
                        {perk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Verified Employer toggle */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Trust Level</Text>
                <TouchableOpacity
                  onPress={() => setFilterVerified(!filterVerified)}
                  className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerified ? 'bg-success-surface border border-[#CEEAD6]' : 'bg-surface-background'
                  }`}
                >
                  <Text className="text-sm font-semibold text-content-primary">
                    Show only Verified Employers
                  </Text>
                  <Text className="text-lg">{filterVerified ? '✅' : '⬜'}</Text>
                </TouchableOpacity>
              </View>
            ) : activeTab === 'Housing' ? (
              <ScrollView className="max-h-[300px]" showsVerticalScrollIndicator={false}>
                {/* Price range input */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Price Range (Monthly)</Text>
                <View className="flex-row items-center gap-3 mb-5">
                  <TextInput
                    placeholder="Min Price"
                    value={rentMin}
                    onChangeText={setRentMin}
                    keyboardType="numeric"
                    className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
                  />
                  <Text className="text-content-faint">-</Text>
                  <TextInput
                    placeholder="Max Price"
                    value={rentMax}
                    onChangeText={setRentMax}
                    keyboardType="numeric"
                    className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
                  />
                </View>

                {/* Rooms filters */}
                <View className="flex-row gap-4 mb-5">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Min Bedrooms</Text>
                    <View className="flex-row border border-subtle rounded-xl overflow-hidden">
                      {[1, 2, 3, 4].map((num) => (
                        <TouchableOpacity
                          key={num}
                          onPress={() => setBedroomsCount(bedroomsCount === num ? null : num)}
                          className={`flex-1 py-2 items-center justify-center border-r border-subtle ${
                            bedroomsCount === num ? 'bg-primary-500' : 'bg-surface-background'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${bedroomsCount === num ? 'text-white' : 'text-content-secondary'}`}>
                            {num}+
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Min Bathrooms</Text>
                    <View className="flex-row border border-subtle rounded-xl overflow-hidden">
                      {[1, 2, 3].map((num) => (
                        <TouchableOpacity
                          key={num}
                          onPress={() => setBathroomsCount(bathroomsCount === num ? null : num)}
                          className={`flex-1 py-2 items-center justify-center border-r border-subtle ${
                            bathroomsCount === num ? 'bg-primary-500' : 'bg-surface-background'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${bathroomsCount === num ? 'text-white' : 'text-content-secondary'}`}>
                            {num}+
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Furnished Status */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Furnished Status</Text>
                <View className="flex-row mb-5">
                  {['All', 'Furnished', 'Unfurnished', 'Partially Furnished'].map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setFurnishedStatus(opt)}
                      className={`px-3 py-2 rounded-full mr-2 ${
                        furnishedStatus === opt ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                      }`}
                    >
                      <Text className={`text-[10px] font-bold ${furnishedStatus === opt ? 'text-white' : 'text-content-secondary'}`}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Features / Amenities checklist */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Features & Perks</Text>
                <View className="flex-row flex-wrap gap-2.5 mb-5">
                  {[
                    { label: '🔌 Bills Included', value: filterBillsIncluded, setter: setFilterBillsIncluded },
                    { label: '🌐 Internet Included', value: filterInternetIncluded, setter: setFilterInternetIncluded },
                    { label: '🚗 Parking Available', value: filterParkingAvailable, setter: setFilterParkingAvailable },
                  ].map((perk, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => perk.setter(!perk.value)}
                      className={`px-4 py-2 rounded-2xl flex-row items-center border ${
                        perk.value ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-content-secondary'}`}>
                        {perk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Lifestyle Matches Preferences checkboxes */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Lifestyle Match</Text>
                <View className="flex-row flex-wrap gap-2 mb-5">
                  {[
                    { label: '👨🎓 Student Friendly', val: 'Student Friendly' },
                    { label: '👨👩👧 Family Friendly', val: 'Family Friendly' },
                    { label: '👩 Women Preferred', val: 'Women Preferred' },
                    { label: '🧑💻 Remote Worker Friendly', val: 'Remote Worker Friendly' },
                    { label: '🌙 Quiet Environment', val: 'Quiet Environment' },
                    { label: '🏠 Shared Living', val: 'Shared Living' },
                    { label: '🚭 Non-Smoking Home', val: 'Non-Smoking Home' },
                    { label: '🐶 Pet Friendly', val: 'Pet Friendly' },
                    { label: '🚗 Parking Available', val: 'Parking Available' },
                  ].map((pref) => {
                    const active = !!selectedLifestyleMatches[pref.val];
                    return (
                      <TouchableOpacity
                        key={pref.val}
                        onPress={() => setSelectedLifestyleMatches({
                          ...selectedLifestyleMatches,
                          [pref.val]: !active
                        })}
                        className={`px-3 py-2 rounded-2xl flex-row items-center border ${
                          active ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${active ? 'text-primary-600' : 'text-content-secondary'}`}>
                          {pref.label} {active ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Verified Host toggle */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Trust Level</Text>
                <TouchableOpacity
                  onPress={() => setFilterVerifiedHost(!filterVerifiedHost)}
                  className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerifiedHost ? 'bg-success-surface border border-[#CEEAD6]' : 'bg-surface-background'
                  }`}
                >
                  <Text className="text-sm font-semibold text-content-primary">
                    Show only Verified Hosts
                  </Text>
                  <Text className="text-lg">{filterVerifiedHost ? '✅' : '⬜'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View>
                {/* Verified toggle */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Trust Level</Text>
                <TouchableOpacity
                  onPress={() => setFilterVerified(!filterVerified)}
                  className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerified ? 'bg-success-surface border border-[#CEEAD6]' : 'bg-surface-background'
                  }`}
                >
                  <Text className="text-sm font-semibold text-content-primary">
                    Show only Community Verified providers
                  </Text>
                  <Text className="text-lg">{filterVerified ? '✅' : '⬜'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
      </Sheet>

      {/* Global Location Selector Drawer Modal */}
      <GlobalLocationSelector
        visible={isLocationSelectorOpen}
        onClose={() => setIsLocationSelectorOpen(false)}
      />
    </SafeAreaView>
  );
}

// Reuseable Empty State
//
// `error` is the remediation. Housing and Marketplace both read remote routes,
// and both used to render this same "nothing matched your search" panel when the
// request had in fact failed — for Marketplace, on *every* request, because the
// path was wrong. Telling a member their search found nothing when the search
// never ran is the specific untruth this parameter exists to prevent.
function EmptyStateView({
  label,
  city,
  error,
}: {
  label: string;
  city: string;
  error?: string | null;
}) {
  if (error) {
    return (
      <View className="items-center justify-center py-16 bg-surface-card border border-faint rounded-3xl p-6">
        <Text className="text-5xl mb-3">⚠️</Text>
        <Text className="text-base font-bold text-content-strong text-center">
          Could not load {label}
        </Text>
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed">
          {error} This is not an empty result — we could not reach Diaspora. Pull down to try again.
        </Text>
      </View>
    );
  }

  return (
    <View className="items-center justify-center py-16 bg-surface-card border border-faint rounded-3xl p-6">
      <Text className="text-5xl mb-3">🔍</Text>
      <Text className="text-base font-bold text-content-strong text-center">No {label} match in {city}</Text>
      <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed">
        Try checking spelling, removing query filters, or searching for other diaspora services nearby in this city.
      </Text>
    </View>
  );
}
