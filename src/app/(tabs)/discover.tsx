import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet } from '@/components/overlays/AppModal';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { TourId } from '@/types/explore';
import { mockCategories, mockListings } from '@/mocks/data';
import { mockGuides, mockCommunityUpdates, mockAuthors } from '@/mocks/community-data';
import { mockJobs, mockJobCategories } from '@/mocks/jobs-data';
import { mockHousingCategories } from '@/mocks/housing-data';
import { mockMarketplaceListings, mockMarketplaceCategories } from '@/mocks/marketplace-data';
import { GuideCard } from '@/components/GuideCard';
import { UpdateCard } from '@/components/UpdateCard';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { JobCardSkeleton } from '@/components/Skeleton';
import { Image } from 'expo-image';
import { apiClient } from '@/lib/apiClient';
import type { HousingListing } from '@/types/housing';
import type { MarketplaceListing, ListingIntent, ListingCondition } from '@/types/marketplace';

// Hyperlocal Discovery Engine Integrations
import { useLocationStore, getActiveLocation } from '@/store/location';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { RadiusSlider } from '@/components/RadiusSlider';
import { DistanceBadge } from '@/components/DistanceBadge';
import { NearbyIndicator } from '@/components/NearbyIndicator';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { getDistanceKm } from '@/utils/geo';
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

  // Simulate loader on tab change or query edit
  useEffect(() => {
    if (activeTab !== 'Housing' && activeTab !== 'Marketplace') {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timer);
    }
  }, [activeTab, searchQuery, selectedCategory, sortBy, filterVerified, activeLocation, searchRadius, selectedJobType, perkAccommodation, perkMeals, perkTransport, refreshNonce]);

  // API Fetcher for Marketplace
  useEffect(() => {
    if (activeTab === 'Marketplace') {
      setIsLoading(true);
      const fetchMarketplace = async () => {
        try {
          const res = await apiClient.get('/marketplace', {
            params: {
              query: searchQuery,
              category: selectedCategory || undefined,
              intent: marketIntent || undefined,
              cityName: activeLocation.cityName,
              latitude: activeLocation.latitude,
              longitude: activeLocation.longitude,
              radiusKm: searchRadius > 0 ? searchRadius : undefined,
              minPrice: marketMinPrice || undefined,
              maxPrice: marketMaxPrice || undefined,
              condition: marketCondition || undefined,
              distanceRadius: marketMaxDistance || undefined,
              verifiedSellerOnly: filterVerifiedSeller || undefined,
              deliveryAvailable: filterDeliveryAvailable || undefined,
              pickupOnly: filterPickupOnly || undefined,
              sortBy: sortBy,
            }
          });
          
          let data = res.data.data;
          // Apply sorting
          if (sortBy === 'rating') {
            data.sort((a: any, b: any) => b.seller.rating - a.seller.rating);
          } else if (sortBy === 'distance') {
            data.sort((a: any, b: any) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
          } else {
            data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
          setMarketplaceListings(data);
        } catch (err) {
          console.error('Failed to fetch marketplace listings', err);
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
          const activeCategory = selectedCategory ? mockHousingCategories.find(c => c.id === selectedCategory)?.name : '';
          const lifestylePrefList = Object.keys(selectedLifestyleMatches).filter(k => selectedLifestyleMatches[k]).join(',');
          
          const res = await apiClient.get('/housing', {
            params: {
              query: searchQuery,
              category: activeCategory,
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
          
          let data = res.data.data;
          // Apply sorting
          if (sortBy === 'rating') {
            data.sort((a: any, b: any) => b.host.rating - a.host.rating);
          } else if (sortBy === 'distance') {
            data.sort((a: any, b: any) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
          } else {
            data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
          setHousingListings(data);
        } catch (err) {
          console.error('Failed to fetch housing listings', err);
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

  // --- Dynamic Geolocation Calculations and Filtering for Local Mocks ---

  const baseListings = useMemo(() => {
    return mockListings
      .map((item) => {
        const dist = item.location.latitude && item.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, item.location.latitude, item.location.longitude)
          : undefined;
        return {
          ...item,
          location: {
            ...item.location,
            distanceKm: dist,
          },
        };
      })
      .filter((item) => {
        const matchesSearch =
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory ? item.category.id === selectedCategory : true;
        const matchesVerified = filterVerified ? item.verificationStatus === 'Verified' : true;

        // Proximity/radius match
        if (searchRadius > 0 && item.location.distanceKm !== undefined) {
          if (item.location.distanceKm > searchRadius) return false;
        } else if (searchRadius === -1) {
          if (item.location.cityName.toLowerCase() !== activeLocation.cityName.toLowerCase()) return false;
        } else if (searchRadius === -2) {
          if ((item.location as any).countryCode?.toLowerCase() !== activeLocation.countryCode.toLowerCase()) return false;
        }

        return matchesSearch && matchesCategory && matchesVerified;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return b.rating.average - a.rating.average;
        return (a.location.distanceKm || 0) - (b.location.distanceKm || 0);
      });
  }, [searchQuery, selectedCategory, filterVerified, activeLocation, searchRadius, sortBy]);

  const filteredListings = useMemo(
    () => baseListings.filter((item) => passesOriginFilter(item.owner.originCountry?.code)),
    [baseListings, passesOriginFilter]
  );

  const baseJobs = useMemo(() => {
    return mockJobs
      .map((item) => {
        const dist = item.location.latitude && item.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, item.location.latitude, item.location.longitude)
          : undefined;
        return {
          ...item,
          location: {
            ...item.location,
            distanceKm: dist,
          },
        };
      })
      .filter((item) => {
        const matchesSearch =
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.employer.name.toLowerCase().includes(searchQuery.toLowerCase());

        const categoryName = selectedCategory ? mockJobCategories.find((c) => c.id === selectedCategory)?.name : null;
        const matchesCategory = categoryName ? item.category === categoryName : true;
        const matchesVerified = filterVerified ? item.employer.isVerified : true;

        // Proximity/radius match
        if (searchRadius > 0 && item.location.distanceKm !== undefined) {
          if (item.location.distanceKm > searchRadius) return false;
        } else if (searchRadius === -1) {
          if (item.location.cityName.toLowerCase() !== activeLocation.cityName.toLowerCase()) return false;
        } else if (searchRadius === -2) {
          // Check matching country code
        }

        // Specific filters
        const matchesJobType = selectedJobType ? item.employmentType === selectedJobType : true;
        const matchesAccommodation = perkAccommodation ? item.benefitsFlags.accommodationIncluded : true;
        const matchesMeals = perkMeals ? item.benefitsFlags.mealsIncluded : true;
        const matchesTransport = perkTransport ? item.benefitsFlags.transportIncluded : true;

        return (
          matchesSearch &&
          matchesCategory &&
          matchesVerified &&
          matchesJobType &&
          matchesAccommodation &&
          matchesMeals &&
          matchesTransport
        );
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return (b.employer.rating || 0) - (a.employer.rating || 0);
        return (a.location.distanceKm || 0) - (b.location.distanceKm || 0);
      });
  }, [searchQuery, selectedCategory, filterVerified, activeLocation, searchRadius, selectedJobType, perkAccommodation, perkMeals, perkTransport, sortBy]);

  const filteredJobs = useMemo(
    () => baseJobs.filter((item) => passesOriginFilter(item.employer.originCountry?.code)),
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

    if (activeTab === 'Providers') {
      baseListings.forEach((item) => {
        if (item.owner.originCountry) {
          countriesMap.set(item.owner.originCountry.code, item.owner.originCountry);
        }
      });
    } else if (activeTab === 'Jobs') {
      baseJobs.forEach((item) => {
        if (item.employer.originCountry) {
          countriesMap.set(item.employer.originCountry.code, item.employer.originCountry);
        }
      });
    } else if (activeTab === 'Housing') {
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

  const filteredGuides = useMemo(() => {
    return mockGuides.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory
        ? mockCategories.find((c) => c.id === selectedCategory)?.name.toLowerCase() === item.category.toLowerCase()
        : true;

      // Filter by country code matching active context
      const matchesCountry = item.country.code.toLowerCase() === activeLocation.countryCode.toLowerCase();

      return matchesSearch && matchesCategory && matchesCountry;
    });
  }, [searchQuery, selectedCategory, activeLocation]);

  const filteredUpdates = useMemo(() => {
    return mockCommunityUpdates
      .map((item) => {
        const dist = item.location.latitude && item.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, item.location.latitude, item.location.longitude)
          : undefined;
        return {
          ...item,
          location: {
            ...item.location,
            distanceKm: dist,
          },
        };
      })
      .filter((item) => {
        const matchesSearch =
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase());

        // Proximity/radius check
        if (searchRadius > 0 && item.location.distanceKm !== undefined) {
          if (item.location.distanceKm > searchRadius) return false;
        } else if (searchRadius === -1) {
          if (item.location.cityName.toLowerCase() !== activeLocation.cityName.toLowerCase()) return false;
        }

        return matchesSearch;
      })
      .sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
  }, [searchQuery, activeLocation, searchRadius]);

  // Compute pins for map representation
  const mapPins = useMemo(() => {
    let list: any[] = [];
    if (activeTab === 'Providers') list = filteredListings;
    else if (activeTab === 'Jobs') list = filteredJobs;
    else if (activeTab === 'Housing') list = displayedHousingListings;
    else if (activeTab === 'Marketplace') list = displayedMarketplaceListings;

    return list
      .filter((item) => item.location?.latitude && item.location?.longitude)
      .map((item) => ({
        id: item.listingId || item.jobId || item.id || '',
        title: item.title,
        category: item.category?.name || item.category || 'Listing',
        latitude: item.location.latitude,
        longitude: item.location.longitude,
        distanceKm: item.location.distanceKm || 0,
        priceText: item.rent ? `${item.rent} ${item.currency || 'GBP'}` : item.price !== undefined ? `${item.price} ${item.currency || 'GBP'}` : undefined,
        rating: item.rating?.average || item.rating || item.host?.rating || item.seller?.rating || undefined,
      }));
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
            {(activeTab === 'Jobs' 
              ? mockJobCategories 
              : activeTab === 'Housing' 
                ? mockHousingCategories 
                : activeTab === 'Marketplace'
                  ? mockMarketplaceCategories
                  : mockCategories
            ).map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                  className={`flex-row items-center px-4 py-2 rounded-full mr-2.5 ${
                    isSelected ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                  }`}
                >
                  <Text className="text-xs mr-1.5">{cat.icon}</Text>
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
            
            {isLoading ? (
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
                    {filteredListings.length > 0 ? (
                      filteredListings.map((item) => (
                        <TouchableOpacity
                          key={item.listingId}
                          onPress={() => router.push(`/provider/${item.listingId}`)}
                          className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-4 shadow-sm"
                        >
                          <Image
                            source={{ uri: item.coverImageUrl }}
                            style={{ width: '100%', height: 160 }}
                            contentFit="cover"
                          />
                          <View className="p-4">
                            <View className="flex-row items-center justify-between mb-1">
                              <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                                {item.category.name}
                              </Text>
                              {item.verificationStatus === 'Verified' && (
                                <Text className="text-[10px] bg-success-surface text-success-default px-2 py-0.5 rounded font-extrabold">
                                  ✓ VERIFIED
                                </Text>
                              )}
                            </View>
                            <Text className="text-lg font-bold text-content-primary mb-1">{item.title}</Text>
                            <Text className="text-xs text-content-muted font-semibold mb-3">
                              📍 {item.location.areaName} · {item.location.distanceKm} km away
                            </Text>
                            <View className="flex-row items-center justify-between border-t border-faint pt-3">
                              <Text className="text-xs font-bold text-content-secondary">★ {item.rating.average} ({item.rating.totalReviews} reviews)</Text>
                              <Text className={`text-xs font-bold ${item.isOpenNow ? 'text-success-default' : 'text-content-faint'}`}>
                                {item.isOpenNow ? '● Open Now' : '● Closed'}
                              </Text>
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
                     {filteredJobs.length > 0 ? (
                       filteredJobs.map((item) => (
                         <JobCard key={item.jobId} job={item} />
                       ))
                     ) : (
                       <EmptyStateView label="jobs" city={activeLocation.cityName} />
                     )}
                   </View>
                 )}
 
                 {/* Guides Tab */}
                 {activeTab === 'Guides' && (
                   <View>
                     {filteredGuides.length > 0 ? (
                       filteredGuides.map((item) => {
                         const author = mockAuthors[item.authorId];
                         return (
                           <GuideCard
                             key={item.guideId}
                             guide={item as any}
                             author={author as any}
                             variant="list"
                           />
                         );
                       })
                     ) : (
                       <EmptyStateView label="guides" city={activeLocation.cityName} />
                     )}
                   </View>
                 )}
 
                 {/* Updates Tab */}
                 {activeTab === 'Updates' && (
                   <View>
                     {filteredUpdates.length > 0 ? (
                       filteredUpdates.map((item) => {
                         const author = mockAuthors[item.authorId];
                         return (
                           <UpdateCard
                             key={item.updateId}
                             update={item}
                             author={author as any}
                           />
                         );
                       })
                     ) : (
                       <EmptyStateView label="community updates" city={activeLocation.cityName} />
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
                       <EmptyStateView label="homes & housing" city={activeLocation.cityName} />
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
                       <EmptyStateView label="marketplace listings" city={activeLocation.cityName} />
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
function EmptyStateView({ label, city }: { label: string; city: string }) {
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
