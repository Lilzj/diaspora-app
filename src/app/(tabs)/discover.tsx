import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { mockCategories, mockListings } from '@/mocks/data';
import { mockGuides, mockCommunityUpdates, mockAuthors } from '@/mocks/community-data';
import { mockJobs, mockJobCategories } from '@/mocks/jobs-data';
import { GuideCard } from '@/components/GuideCard';
import { UpdateCard } from '@/components/UpdateCard';
import { JobCard } from '@/components/JobCard';
import { JobCardSkeleton } from '@/components/Skeleton';
import { Image } from 'expo-image';

interface LocationOption {
  city: string;
  country: string;
  flag: string;
  countryCode: string;
}

// Master list of cities in the platform
const LOCATIONS: LocationOption[] = [
  { city: 'London', country: 'United Kingdom', flag: '🇬🇧', countryCode: 'GB' },
  { city: 'Manchester', country: 'United Kingdom', flag: '🇬🇧', countryCode: 'GB' },
  { city: 'Birmingham', country: 'United Kingdom', flag: '🇬🇧', countryCode: 'GB' },
  { city: 'Glasgow', country: 'United Kingdom', flag: '🇬🇧', countryCode: 'GB' },
  { city: 'Port Louis', country: 'Mauritius', flag: '🇲🇺', countryCode: 'MU' },
  { city: 'Curepipe', country: 'Mauritius', flag: '🇲🇺', countryCode: 'MU' },
  { city: 'Lagos', country: 'Nigeria', flag: '🇳🇬', countryCode: 'NG' },
  { city: 'Abuja', country: 'Nigeria', flag: '🇳🇬', countryCode: 'NG' },
  { city: 'Accra', country: 'Ghana', flag: '🇬🇭', countryCode: 'GH' },
  { city: 'Kumasi', country: 'Ghana', flag: '🇬🇭', countryCode: 'GH' },
  { city: 'Dakar', country: 'Senegal', flag: '🇸🇳', countryCode: 'SN' },
  { city: 'Abidjan', country: "Côte d'Ivoire", flag: '🇨🇮', countryCode: 'CI' },
];

export default function DiscoverScreen() {
  // Current user's stay country (retrieved at registration/login - e.g. United Kingdom)
  const currentUserCountry = 'GB';

  // Filter master locations to ONLY cities within the user's current residency country
  const userCountryCities = LOCATIONS.filter((loc) => loc.countryCode === currentUserCountry);

  const params = useLocalSearchParams<{ tab?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Providers' | 'Jobs' | 'Guides' | 'Updates'>('Providers');

  useEffect(() => {
    if (params.tab && ['Providers', 'Jobs', 'Guides', 'Updates'].includes(params.tab)) {
      setActiveTab(params.tab as any);
    }
  }, [params.tab]);
  
  // Initialize to the primary city of the user's current stay country (e.g. London)
  const [selectedLocation, setSelectedLocation] = useState<LocationOption>(userCountryCities[0] || LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isMapView, setIsMapView] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filters state
  const [sortBy, setSortBy] = useState<'default' | 'distance' | 'rating'>('default');
  const [filterVerified, setFilterVerified] = useState(false);

  // Job specific filters state
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
  const [perkAccommodation, setPerkAccommodation] = useState(false);
  const [perkMeals, setPerkMeals] = useState(false);
  const [perkTransport, setPerkTransport] = useState(false);

  // Search History
  const [recentSearches, setRecentSearches] = useState(['Jollof', 'Braids', 'Peckham']);
  const [suggestions] = useState(['Mama Afrika', 'Visa application', 'Brixton market', 'Immigration tips']);

  // Simulate loader on tab change or query edit
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 400);
    return () => clearTimeout(timer);
  }, [activeTab, searchQuery, selectedCategory, sortBy, filterVerified, selectedLocation, selectedJobType, perkAccommodation, perkMeals, perkTransport]);

  const handleSuggestionPress = (query: string) => {
    setSearchQuery(query);
    if (!recentSearches.includes(query)) {
      setRecentSearches([query, ...recentSearches.slice(0, 4)]);
    }
  };

  const clearRecent = () => setRecentSearches([]);

  // Data Filtering Logic - Tied STRICTLY to selected user country/city
  const filteredListings = mockListings.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory ? item.category.id === selectedCategory : true;
    const matchesVerified = filterVerified ? item.verificationStatus === 'Verified' : true;
    
    // Filter listings strictly matching selected city in current country
    const matchesCity = item.location.cityName.toLowerCase() === selectedLocation.city.toLowerCase();
    
    return matchesSearch && matchesCategory && matchesVerified && matchesCity;
  }).sort((a, b) => {
    if (sortBy === 'rating') return b.rating.average - a.rating.average;
    if (sortBy === 'distance') return (a.location.distanceKm || 0) - (b.location.distanceKm || 0);
    return 0;
  });

  const filteredJobs = mockJobs.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.employer.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // category mapping
    const categoryName = selectedCategory ? mockJobCategories.find(c => c.id === selectedCategory)?.name : null;
    const matchesCategory = categoryName ? item.category === categoryName : true;
    const matchesVerified = filterVerified ? item.employer.isVerified : true;
    
    // Filter jobs strictly matching selected city in current country
    const matchesCity = item.location.cityName.toLowerCase() === selectedLocation.city.toLowerCase();

    // Specific filters
    const matchesJobType = selectedJobType ? item.employmentType === selectedJobType : true;
    const matchesAccommodation = perkAccommodation ? item.benefitsFlags.accommodationIncluded : true;
    const matchesMeals = perkMeals ? item.benefitsFlags.mealsIncluded : true;
    const matchesTransport = perkTransport ? item.benefitsFlags.transportIncluded : true;
    
    return matchesSearch && matchesCategory && matchesVerified && matchesCity && matchesJobType && matchesAccommodation && matchesMeals && matchesTransport;
  }).sort((a, b) => {
    if (sortBy === 'rating') return (b.employer.rating || 0) - (a.employer.rating || 0);
    if (sortBy === 'distance') return (a.location.distanceKm || 0) - (b.location.distanceKm || 0);
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const filteredGuides = mockGuides.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory
      ? mockCategories.find((c) => c.id === selectedCategory)?.name.toLowerCase() === item.category.toLowerCase()
      : true;
      
    // Guides are country-wide, filter strictly by selected location's country code
    const matchesCountry = item.country.code.toLowerCase() === selectedLocation.countryCode.toLowerCase();
    
    return matchesSearch && matchesCategory && matchesCountry;
  });

  const filteredUpdates = mockCommunityUpdates.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
      
    // Filter updates strictly matching selected city in current country
    const matchesCity = item.location.cityName.toLowerCase() === selectedLocation.city.toLowerCase();
    
    return matchesSearch && matchesCity;
  });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      {/* Search Header Area */}
      <View className="bg-white border-b border-neutral-100 px-6 py-4 shadow-sm shadow-neutral-100">
        
        {/* Top Header Location & Toggle */}
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity
            onPress={() => setIsLocationModalOpen(true)}
            className="flex-row items-center"
            activeOpacity={0.7}
          >
            <Text className="text-base font-extrabold text-neutral-900 mr-1">
              📍 Explore {selectedLocation.city}
            </Text>
            <Text className="text-xs text-neutral-400">▾</Text>
          </TouchableOpacity>

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
            placeholder={`Search ${activeTab.toLowerCase()} in ${selectedLocation.city}...`}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm font-semibold text-neutral-800 h-full"
            placeholderTextColor="#9CA3AF"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1 mr-1">
              <Text className="text-xs text-neutral-400">✕</Text>
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
        
        {/* Tab Row (Providers, Jobs, Guides, Updates) */}
        <View className="flex-row border-b border-neutral-100 bg-white mb-2">
          {['Providers', 'Jobs', 'Guides', 'Updates'].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab as any)}
                className={`flex-1 items-center justify-center py-3.5 border-b-2 ${
                  isActive ? 'border-primary-500' : 'border-transparent'
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    isActive ? 'text-primary-500' : 'text-neutral-500'
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

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

        {/* Category Filters row (mainly for Providers, Jobs, & Guides) */}
        {activeTab !== 'Updates' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
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
            {(activeTab === 'Jobs' ? mockJobCategories : mockCategories).map((cat) => {
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
          <View className="px-6 py-12 items-center justify-center bg-white border border-neutral-200 rounded-3xl mx-6 my-4 h-[300px]">
            <Text className="text-4xl mb-3">🗺️</Text>
            <Text className="text-base font-bold text-neutral-900">Map Interface Simulation</Text>
            <Text className="text-xs text-neutral-500 text-center mt-1 leading-relaxed max-w-[200px]">
              Displaying {activeTab === 'Providers' ? filteredListings.length : activeTab === 'Jobs' ? filteredJobs.length : 0} {activeTab.toLowerCase()} near {selectedLocation.city} on interactive map pins.
            </Text>
          </View>
        ) : (
          /* List View Results */
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
                      <EmptyStateView label="providers" city={selectedLocation.city} />
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
                      <EmptyStateView label="jobs" city={selectedLocation.city} />
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
                      <EmptyStateView label="guides" city={selectedLocation.city} />
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
                            update={{
                              ...item,
                              location: {
                                areaName: item.location.areaName,
                                cityName: item.location.cityName,
                                distanceKm: 2.1,
                              }
                            }}
                            author={author as any}
                          />
                        );
                      })
                    ) : (
                      <EmptyStateView label="community updates" city={selectedLocation.city} />
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Filter Bottom Sheet Modal */}
      <Modal
        visible={isFilterModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6 min-h-[350px] shadow-2xl">
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

            {activeTab === 'Jobs' ? (
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
        </View>
      </Modal>

      {/* Location Selector Modal - Strictly showing only cities in user residency stay country */}
      <Modal
        visible={isLocationModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsLocationModalOpen(false);
          setCityQuery('');
        }}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6 h-[480px] shadow-2xl">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-xl font-bold text-neutral-900">Select City</Text>
                <Text className="text-[10px] text-neutral-400 font-extrabold uppercase mt-0.5">
                  📍 Stay Country: {userCountryCities[0]?.country || 'United Kingdom'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => {
                setIsLocationModalOpen(false);
                setCityQuery('');
              }}>
                <Text className="text-neutral-500 font-semibold">Done</Text>
              </TouchableOpacity>
            </View>

            {/* City search input inside modal */}
            <View className="bg-neutral-50 rounded-xl px-3 py-2 border border-neutral-200 flex-row items-center mb-4">
              <Text className="text-sm mr-2 text-neutral-450">🔍</Text>
              <TextInput
                placeholder="Search cities..."
                value={cityQuery}
                onChangeText={setCityQuery}
                className="flex-1 text-xs text-neutral-800 font-semibold p-1"
                placeholderTextColor="#9CA3AF"
              />
              {cityQuery ? (
                <TouchableOpacity onPress={() => setCityQuery('')}>
                  <Text className="text-xs text-neutral-455">✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={userCountryCities.filter(loc => 
                loc.city.toLowerCase().includes(cityQuery.toLowerCase())
              )}
              keyExtractor={(item) => item.city}
              ListEmptyComponent={
                <View className="items-center py-10">
                  <Text className="text-xs text-neutral-400 font-bold">No cities found matching query</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedLocation(item);
                    setIsLocationModalOpen(false);
                    setCityQuery('');
                  }}
                  className="flex-row items-center justify-between py-4 border-b border-neutral-100 active:bg-neutral-50"
                >
                  <View className="flex-row items-center">
                    <Text className="text-2xl mr-3">{item.flag}</Text>
                    <Text className="text-base font-semibold text-neutral-800">
                      {item.city}
                    </Text>
                  </View>
                  {selectedLocation.city === item.city && (
                    <Text className="text-primary-500 font-bold text-base">✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
