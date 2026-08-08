import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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

export default function DiscoverScreen() {
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

  useEffect(() => {
    if (!exploreStore.hasLoadedPersistedState) return;

    // Small delay to let child components register layout coordinates
    const timer = setTimeout(() => {
      if (activeTab === 'Marketplace') {
        if (!exploreStore.completedTours.includes('marketplace')) {
          exploreStore.startTour('marketplace');
        }
      } else if (activeTab === 'Jobs') {
        if (!exploreStore.completedTours.includes('jobs')) {
          exploreStore.startTour('jobs');
        }
      } else if (activeTab === 'Housing') {
        if (!exploreStore.completedTours.includes('housing')) {
          exploreStore.startTour('housing');
        }
      } else if (activeTab === 'Community') {
        if (!exploreStore.completedTours.includes('community-life')) {
          exploreStore.startTour('community-life');
        }
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [activeTab, exploreStore.hasLoadedPersistedState]);

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

  // Filters state
  const [sortBy, setSortBy] = useState<'default' | 'distance' | 'rating'>('default');
  const [filterVerified, setFilterVerified] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);

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
  }, [activeTab, searchQuery, selectedCategory, sortBy, filterVerified, activeLocation, searchRadius, selectedJobType, perkAccommodation, perkMeals, perkTransport]);

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
    filterVerifiedSeller, filterDeliveryAvailable, filterPickupOnly, sortBy
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
    selectedLifestyleMatches, sortBy
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

  const filteredListings = useMemo(() => {
    if (!selectedCountryCode) return baseListings;
    return baseListings.filter((item) => item.owner.originCountry?.code === selectedCountryCode);
  }, [baseListings, selectedCountryCode]);

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

  const filteredJobs = useMemo(() => {
    if (!selectedCountryCode) return baseJobs;
    return baseJobs.filter((item) => item.employer.originCountry?.code === selectedCountryCode);
  }, [baseJobs, selectedCountryCode]);

  const displayedHousingListings = useMemo(() => {
    if (!selectedCountryCode) return housingListings;
    return housingListings.filter((item) => item.host.originCountry?.code === selectedCountryCode);
  }, [housingListings, selectedCountryCode]);

  const displayedMarketplaceListings = useMemo(() => {
    if (!selectedCountryCode) return marketplaceListings;
    return marketplaceListings.filter((item) => item.seller.originCountry?.code === selectedCountryCode);
  }, [marketplaceListings, selectedCountryCode]);

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
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      {/* Search Header Area */}
      <View className="bg-white border-b border-neutral-100 px-6 py-4 shadow-sm shadow-neutral-100">
        
        {/* Top Header Location & Toggle */}
        <View className="flex-row items-center justify-between mb-4">
          <TourSpotlight spotlightKey="neighborhood_pin">
            <TouchableOpacity
              onPress={() => setIsLocationSelectorOpen(true)}
              className="flex-row items-center"
              activeOpacity={0.7}
            >
              <Text className="text-base font-extrabold text-neutral-900 mr-1">
                📍 Explore {activeLocation.neighborhood}
              </Text>
              <Text className="text-xs text-neutral-450 font-bold">· {activeLocation.cityName} ▾</Text>
            </TouchableOpacity>
          </TourSpotlight>

          {/* Map/List Switch */}
          <TouchableOpacity
            onPress={() => setIsMapView(!isMapView)}
            className="bg-neutral-50 px-3 py-1.5 rounded-full border border-neutral-200"
          >
            <Text className="text-xs font-bold text-neutral-700">
              {isMapView ? '🗺️ List View' : '📍 Map View'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Universal Search Input */}
        <View className="flex-row items-center h-14 bg-neutral-50 border border-neutral-200 rounded-2xl px-4">
          <Text className="text-lg mr-3 text-neutral-400">🔍</Text>
          <TextInput
            placeholder={`Search ${activeTab.toLowerCase()} near you...`}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm font-semibold text-neutral-800 h-full"
            placeholderTextColor="#9CA3AF"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1 mr-1">
              <Text className="text-xs text-neutral-450">✕</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setIsFilterModalOpen(true)}
            className="border-l border-neutral-200 pl-3 py-1"
          >
            <Text className="text-lg">🎛️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Container */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        
        {/* Tab Row (Providers, Jobs, Housing, Marketplace, Guides, Updates) */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          className="bg-white border-b border-neutral-100 mb-2 max-h-[50px]"
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
                    isActive ? 'text-primary-500' : 'text-neutral-500'
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Radius configuration slider */}
        {activeTab !== 'Guides' && activeTab !== 'Community' && (
          <TourSpotlight spotlightKey="proximity_radius_slider" style={{ width: '100%' }}>
            <View className="bg-white py-3 border-b border-neutral-100 mb-2">
              <RadiusSlider
                value={searchRadius}
                onChange={(val) => store.setSearchRadius(val)}
              />
            </View>
          </TourSpotlight>
        )}

        {/* Suggestions Panel (shown only when query is empty and no category is selected) */}
        {!searchQuery && !selectedCategory && (
          <View className="bg-white p-6 border-b border-neutral-100 mb-3">
            {recentSearches.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Recent Searches</Text>
                  <TouchableOpacity onPress={clearRecent}>
                    <Text className="text-xs font-semibold text-neutral-400">Clear</Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row flex-wrap">
                  {recentSearches.map((term, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handleSuggestionPress(term)}
                      className="bg-neutral-50 border border-neutral-200 rounded-full px-3 py-1.5 mr-2 mb-2"
                    >
                      <Text className="text-xs text-neutral-600 font-semibold">🕒 {term}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Popular Searches</Text>
            <View className="flex-row flex-wrap">
              {suggestions.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSuggestionPress(item)}
                  className="bg-neutral-50 border border-neutral-200 rounded-full px-3 py-1.5 mr-2 mb-2"
                >
                  <Text className="text-xs text-neutral-700 font-semibold">{item}</Text>
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
            className="bg-white border-b border-neutral-100 mb-2"
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full mr-2.5 ${
                selectedCategory === null ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
              }`}
            >
              <Text className={`text-xs font-bold ${selectedCategory === null ? 'text-white' : 'text-neutral-700'}`}>
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
                    isSelected ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                  }`}
                >
                  <Text className="text-xs mr-1.5">{cat.icon}</Text>
                  <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>
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
                    <View key={n} className="bg-white p-4 rounded-3xl border border-neutral-200 opacity-60">
                      <View className="h-32 bg-neutral-200 rounded-xl mb-4" />
                      <View className="h-6 bg-neutral-200 rounded w-2/3 mb-2" />
                      <View className="h-4 bg-neutral-200 rounded w-1/2" />
                    </View>
                  ))
                )}
              </View>
            ) : (
              /* Actual Results rendering */
              <View>
                {/* Providers Tab */}
                {activeTab === 'Providers' && (
                  <View>
                    {filteredListings.length > 0 ? (
                      filteredListings.map((item) => (
                        <TouchableOpacity
                          key={item.listingId}
                          onPress={() => router.push(`/provider/${item.listingId}`)}
                          className="bg-white rounded-3xl border border-neutral-200 overflow-hidden mb-4 shadow-sm"
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
                            <Text className="text-lg font-bold text-neutral-900 mb-1">{item.title}</Text>
                            <Text className="text-xs text-neutral-450 font-semibold mb-3">
                              📍 {item.location.areaName} · {item.location.distanceKm} km away
                            </Text>
                            <View className="flex-row items-center justify-between border-t border-neutral-50 pt-3">
                              <Text className="text-xs font-bold text-neutral-700">★ {item.rating.average} ({item.rating.totalReviews} reviews)</Text>
                              <Text className={`text-xs font-bold ${item.isOpenNow ? 'text-success-default' : 'text-neutral-400'}`}>
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
                       <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                         {displayedMarketplaceListings.length} item{displayedMarketplaceListings.length === 1 ? '' : 's'} nearby
                       </Text>
                       <TouchableOpacity
                         onPress={() => setIsGridView(!isGridView)}
                         className="bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200"
                       >
                         <Text className="text-xs font-bold text-neutral-700">
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
                  <View className="bg-white border border-neutral-200 rounded-3xl p-6 items-center py-10 shadow-sm">
                    <Text className="text-5xl mb-4">🎉</Text>
                    <Text className="text-lg font-black text-neutral-900 text-center tracking-tight">Introducing Community Life!</Text>
                    <Text className="text-xs text-neutral-500 mt-2 text-center leading-relaxed max-w-[280px] mb-6">
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
            )}
            </View>
          </FeatureGate>
        )}
      </ScrollView>

      {/* Filter Bottom Sheet Modal */}
      <Modal
        visible={isFilterModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsFilterModalOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-t-3xl p-6 min-h-[350px] shadow-2xl w-full">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-bold text-neutral-900">Filters & Sort</Text>
              <TouchableOpacity onPress={() => setIsFilterModalOpen(false)}>
                <Text className="text-primary-500 font-semibold">Done</Text>
              </TouchableOpacity>
            </View>

            {/* Sort Options */}
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Sort By</Text>
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
                    sortBy === opt.value ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                  }`}
                >
                  <Text className={`text-xs font-bold ${sortBy === opt.value ? 'text-white' : 'text-neutral-700'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Lister's Origin Country Filter */}
            {availableCountries.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-bold text-neutral-450 uppercase tracking-widest mb-3">
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
                        : 'bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${selectedCountryCode === null ? 'text-white' : 'text-neutral-700'}`}>
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
                            : 'bg-neutral-50 border-neutral-200'
                        }`}
                      >
                        <Text className="text-sm mr-1.5">{c.flag}</Text>
                        <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>
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
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Listing Intent</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
                  {['Selling', 'Buying Request', 'Giving Away', 'Exchange / Swap', 'Wanted', 'Donation'].map((intent) => {
                    const isSel = marketIntent === intent;
                    return (
                      <TouchableOpacity
                        key={intent}
                        onPress={() => setMarketIntent(isSel ? '' : intent as any)}
                        className={`px-4 py-2 rounded-full mr-2.5 ${
                          isSel ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSel ? 'text-white' : 'text-neutral-700'}`}>
                          {intent}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Price range input */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Price Range</Text>
                <View className="flex-row items-center gap-3 mb-5">
                  <TextInput
                    placeholder="Min Price"
                    value={marketMinPrice}
                    onChangeText={setMarketMinPrice}
                    keyboardType="numeric"
                    className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-semibold text-neutral-850"
                  />
                  <Text className="text-neutral-400">-</Text>
                  <TextInput
                    placeholder="Max Price"
                    value={marketMaxPrice}
                    onChangeText={setMarketMaxPrice}
                    keyboardType="numeric"
                    className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-semibold text-neutral-850"
                  />
                </View>

                {/* Proximity / Distance Slider */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Distance Radius (Max)</Text>
                <View className="flex-row mb-5">
                  {[2, 5, 10, 20, 50].map((dist) => {
                    const isSel = marketMaxDistance === dist;
                    return (
                      <TouchableOpacity
                        key={dist}
                        onPress={() => setMarketMaxDistance(isSel ? null : dist)}
                        className={`px-3 py-2 rounded-full mr-2 ${
                          isSel ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                        }`}
                      >
                        <Text className={`text-[10px] font-bold ${isSel ? 'text-white' : 'text-neutral-700'}`}>
                          {dist} km
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Item Condition */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Condition</Text>
                <View className="flex-row mb-5 flex-wrap gap-2">
                  {['New', 'Like New', 'Very Good', 'Good', 'Fair'].map((cond) => {
                    const isSel = marketCondition === cond;
                    return (
                      <TouchableOpacity
                        key={cond}
                        onPress={() => setMarketCondition(isSel ? '' : cond as any)}
                        className={`px-3 py-2 rounded-full mr-2 ${
                          isSel ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                        }`}
                      >
                        <Text className={`text-[10px] font-bold ${isSel ? 'text-white' : 'text-neutral-700'}`}>
                          {cond}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Delivery & Trust toggles */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Delivery & Verification</Text>
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
                        perk.value ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50 border-neutral-200'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-neutral-700'}`}>
                        {perk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : activeTab === 'Jobs' ? (
              <View>
                {/* Employment Type */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Employment Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
                  {['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Freelance', 'Volunteer'].map((type) => {
                    const isSel = selectedJobType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setSelectedJobType(isSel ? null : type)}
                        className={`px-4 py-2.5 rounded-full mr-2.5 ${
                          isSel ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSel ? 'text-white' : 'text-neutral-700'}`}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Benefits / Perks */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Include Benefits</Text>
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
                        perk.value ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50 border-neutral-200'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${perk.value ? 'text-primary-655' : 'text-neutral-700'}`}>
                        {perk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Verified Employer toggle */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Trust Level</Text>
                <TouchableOpacity
                  onPress={() => setFilterVerified(!filterVerified)}
                  className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerified ? 'bg-success-surface border border-[#CEEAD6]' : 'bg-neutral-50'
                  }`}
                >
                  <Text className="text-sm font-semibold text-neutral-850">
                    Show only Verified Employers
                  </Text>
                  <Text className="text-lg">{filterVerified ? '✅' : '⬜'}</Text>
                </TouchableOpacity>
              </View>
            ) : activeTab === 'Housing' ? (
              <ScrollView className="max-h-[300px]" showsVerticalScrollIndicator={false}>
                {/* Price range input */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Price Range (Monthly)</Text>
                <View className="flex-row items-center gap-3 mb-5">
                  <TextInput
                    placeholder="Min Price"
                    value={rentMin}
                    onChangeText={setRentMin}
                    keyboardType="numeric"
                    className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-semibold text-neutral-850"
                  />
                  <Text className="text-neutral-400">-</Text>
                  <TextInput
                    placeholder="Max Price"
                    value={rentMax}
                    onChangeText={setRentMax}
                    keyboardType="numeric"
                    className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-semibold text-neutral-850"
                  />
                </View>

                {/* Rooms filters */}
                <View className="flex-row gap-4 mb-5">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Min Bedrooms</Text>
                    <View className="flex-row border border-neutral-200 rounded-xl overflow-hidden">
                      {[1, 2, 3, 4].map((num) => (
                        <TouchableOpacity
                          key={num}
                          onPress={() => setBedroomsCount(bedroomsCount === num ? null : num)}
                          className={`flex-1 py-2 items-center justify-center border-r border-neutral-200 ${
                            bedroomsCount === num ? 'bg-primary-500' : 'bg-neutral-50'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${bedroomsCount === num ? 'text-white' : 'text-neutral-700'}`}>
                            {num}+
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Min Bathrooms</Text>
                    <View className="flex-row border border-neutral-200 rounded-xl overflow-hidden">
                      {[1, 2, 3].map((num) => (
                        <TouchableOpacity
                          key={num}
                          onPress={() => setBathroomsCount(bathroomsCount === num ? null : num)}
                          className={`flex-1 py-2 items-center justify-center border-r border-neutral-200 ${
                            bathroomsCount === num ? 'bg-primary-500' : 'bg-neutral-50'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${bathroomsCount === num ? 'text-white' : 'text-neutral-700'}`}>
                            {num}+
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Furnished Status */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Furnished Status</Text>
                <View className="flex-row mb-5">
                  {['All', 'Furnished', 'Unfurnished', 'Partially Furnished'].map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setFurnishedStatus(opt)}
                      className={`px-3 py-2 rounded-full mr-2 ${
                        furnishedStatus === opt ? 'bg-primary-500' : 'bg-neutral-50 border border-neutral-200'
                      }`}
                    >
                      <Text className={`text-[10px] font-bold ${furnishedStatus === opt ? 'text-white' : 'text-neutral-700'}`}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Features / Amenities checklist */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Features & Perks</Text>
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
                        perk.value ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50 border-neutral-200'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-neutral-700'}`}>
                        {perk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Lifestyle Matches Preferences checkboxes */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Lifestyle Match</Text>
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
                          active ? 'bg-primary-50 border-primary-300' : 'bg-neutral-50 border-neutral-200'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${active ? 'text-primary-600' : 'text-neutral-700'}`}>
                          {pref.label} {active ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Verified Host toggle */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Trust Level</Text>
                <TouchableOpacity
                  onPress={() => setFilterVerifiedHost(!filterVerifiedHost)}
                  className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerifiedHost ? 'bg-success-surface border border-[#CEEAD6]' : 'bg-neutral-50'
                  }`}
                >
                  <Text className="text-sm font-semibold text-neutral-850">
                    Show only Verified Hosts
                  </Text>
                  <Text className="text-lg">{filterVerifiedHost ? '✅' : '⬜'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View>
                {/* Verified toggle */}
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Trust Level</Text>
                <TouchableOpacity
                  onPress={() => setFilterVerified(!filterVerified)}
                  className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerified ? 'bg-success-surface border border-[#CEEAD6]' : 'bg-neutral-50'
                  }`}
                >
                  <Text className="text-sm font-semibold text-neutral-850">
                    Show only Community Verified providers
                  </Text>
                  <Text className="text-lg">{filterVerified ? '✅' : '⬜'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>

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
    <View className="items-center justify-center py-16 bg-white border border-neutral-100 rounded-3xl p-6">
      <Text className="text-5xl mb-3">🔍</Text>
      <Text className="text-base font-bold text-neutral-800 text-center">No {label} match in {city}</Text>
      <Text className="text-xs text-neutral-400 text-center mt-1.5 leading-relaxed">
        Try checking spelling, removing query filters, or searching for other diaspora services nearby in this city.
      </Text>
    </View>
  );
}
