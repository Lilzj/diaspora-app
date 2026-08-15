import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchBar } from '@/components/SearchBar';
import { CategoryChip } from '@/components/CategoryChip';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { mockCategories, mockListings } from '@/mocks/data';
import { mockJobs } from '@/mocks/jobs-data';
import { mockGuides, mockCommunityUpdates, mockAuthors } from '@/mocks/community-data';
import { JobCard } from '@/components/JobCard';
import { GuideCard } from '@/components/GuideCard';
import { UpdateCard } from '@/components/UpdateCard';
import { ProviderCard } from '@/components/ProviderCard';
import { mockEvents, mockOrganizations } from '@/mocks/community-life-data';
import { mockTutorials } from '@/mocks/explore-data';
import { TutorialCard } from '@/components/explore/TutorialCard';

// Hyperlocal integrations
import { useLocationStore, getActiveLocation } from '@/store/location';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { getDistanceKm } from '@/utils/geo';

// Frontend Phase 18 — §30's single saved-search control. See the call site.
import { SaveSearchButton } from '@/components/automation';

// Frontend Phase 13 — Multi-Community Expansion (§38, GAP-010).
//
// §38 forbids a second search engine, and this phase builds none. What it adds to
// search is a community filter and the honesty that goes with it: the existing
// country-of-origin filter here was already acting as a community filter, and it
// now says so. With no community selected the behaviour is unchanged (§69).
import { CommunityFilterBar, CommunityScopeNote } from '@/components/community-directory';
import { useCommunityScope } from '@/hooks/communities';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function SearchScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const params = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.category ?? null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);

  // Frontend Phase 13. The active community scope, projected onto the
  // country-of-origin codes the certified search results actually carry.
  const communityFlags = getCommunityFeatureFlags();
  const { projection: communityProjection } = useCommunityScope();

  /**
   * The origin-country codes search filters on, and where they came from.
   *
   * The community scope wins when one is active; the manual country picker is the
   * fallback and is unchanged. With no community selected this resolves to exactly
   * what `selectedCountryCode` produced before Phase 13, which is what keeps §69
   * true for search.
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

  /** An entity with no origin does not pass a scoped filter. See `matchesProjection`. */
  const passesOriginFilter = useCallback(
    (code: string | null | undefined): boolean => {
      if (originFilter.source === 'none') return true;
      if (originFilter.codes.length === 0) return false;
      if (!code) return false;
      return originFilter.codes.includes(code.toUpperCase());
    },
    [originFilter]
  );

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  // Compute filtered listings (Service Providers) with dynamic distance injection
  const baseListings = useMemo(() => {
    return mockListings
      .map((listing) => {
        const dist = listing.location?.latitude && listing.location?.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, listing.location.latitude, listing.location.longitude)
          : undefined;
        return {
          ...listing,
          location: {
            ...listing.location,
            distanceKm: dist,
          },
        };
      })
      .filter((listing) => {
        const matchesQuery = !query || listing.title.toLowerCase().includes(query.toLowerCase()) || listing.description.toLowerCase().includes(query.toLowerCase());
        const matchesLocation = !locationQuery
          ? true
          : (listing.location?.cityName || '').toLowerCase().includes(locationQuery.toLowerCase()) || (listing.location?.areaName || '').toLowerCase().includes(locationQuery.toLowerCase());
        const matchesCategory = !selectedCategory || listing.category.id === selectedCategory;
        return matchesQuery && matchesLocation && matchesCategory;
      })
      .sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
  }, [query, locationQuery, selectedCategory, activeLocation]);

  const filteredListings = useMemo(
    () => baseListings.filter((item) => passesOriginFilter(item.owner.originCountry?.code)),
    [baseListings, passesOriginFilter]
  );

  // Compute filtered jobs with dynamic distance injection
  const baseJobs = useMemo(() => {
    return mockJobs
      .map((job) => {
        const dist = job.location.latitude && job.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, job.location.latitude, job.location.longitude)
          : undefined;
        return {
          ...job,
          location: {
            ...job.location,
            distanceKm: dist,
          },
        };
      })
      .filter((job) => {
        const matchesQuery = !query || job.title.toLowerCase().includes(query.toLowerCase()) || job.description.toLowerCase().includes(query.toLowerCase()) || job.employer.name.toLowerCase().includes(query.toLowerCase());
        const matchesLocation = !locationQuery
          ? true
          : job.location.cityName.toLowerCase().includes(locationQuery.toLowerCase()) || job.location.areaName.toLowerCase().includes(locationQuery.toLowerCase());
        return matchesQuery && matchesLocation;
      })
      .sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
  }, [query, locationQuery, activeLocation]);

  const filteredJobs = useMemo(
    () => baseJobs.filter((item) => passesOriginFilter(item.employer.originCountry?.code)),
    [baseJobs, passesOriginFilter]
  );

  // Compute guides
  const baseGuides = useMemo(() => {
    return mockGuides.filter((guide) => {
      const matchesQuery = !query || guide.title.toLowerCase().includes(query.toLowerCase()) || guide.summary.toLowerCase().includes(query.toLowerCase());
      const matchesLocation = !locationQuery ? true : guide.country.name.toLowerCase().includes(locationQuery.toLowerCase()) || (guide.location?.cityName || '').toLowerCase().includes(locationQuery.toLowerCase());
      return matchesQuery && matchesLocation;
    });
  }, [query, locationQuery]);

  const filteredGuides = useMemo(
    () => baseGuides.filter((item) => passesOriginFilter(item.country?.code)),
    [baseGuides, passesOriginFilter]
  );

  const availableCountries = useMemo(() => {
    const countriesMap = new Map<string, { code: string; name: string; flag: string }>();

    baseListings.forEach((item) => {
      if (item.owner.originCountry) {
        countriesMap.set(item.owner.originCountry.code, item.owner.originCountry);
      }
    });

    baseJobs.forEach((item) => {
      if (item.employer.originCountry) {
        countriesMap.set(item.employer.originCountry.code, item.employer.originCountry);
      }
    });

    baseGuides.forEach((item) => {
      if (item.country) {
        countriesMap.set(item.country.code, item.country);
      }
    });

    return Array.from(countriesMap.values());
  }, [baseListings, baseJobs, baseGuides]);

  React.useEffect(() => {
    if (selectedCountryCode && !availableCountries.some(c => c.code === selectedCountryCode)) {
      setSelectedCountryCode(null);
    }
  }, [availableCountries, selectedCountryCode]);

  // Compute updates
  const filteredUpdates = useMemo(() => {
    return mockCommunityUpdates
      .map((update) => {
        const dist = update.location.latitude && update.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, update.location.latitude, update.location.longitude)
          : undefined;
        return {
          ...update,
          location: {
            ...update.location,
            distanceKm: dist,
          },
        };
      })
      .filter((update) => {
        const matchesQuery = !query || update.title.toLowerCase().includes(query.toLowerCase()) || update.description.toLowerCase().includes(query.toLowerCase());
        const matchesLocation = !locationQuery
          ? true
          : update.location.cityName.toLowerCase().includes(locationQuery.toLowerCase()) || update.location.areaName.toLowerCase().includes(locationQuery.toLowerCase());
        return matchesQuery && matchesLocation;
      })
      .sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
  }, [query, locationQuery, activeLocation]);

  // Compute events
  const filteredEvents = useMemo(() => {
    return mockEvents
      .map((evt) => {
        const dist = evt.location.latitude && evt.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, evt.location.latitude, evt.location.longitude)
          : undefined;
        return {
          ...evt,
          location: {
            ...evt.location,
            distanceKm: dist,
          },
        };
      })
      .filter((evt) => {
        const matchesQuery = !query || evt.title.toLowerCase().includes(query.toLowerCase()) || evt.description.toLowerCase().includes(query.toLowerCase());
        const matchesLocation = !locationQuery
          ? true
          : evt.location.cityName.toLowerCase().includes(locationQuery.toLowerCase()) || evt.location.areaName.toLowerCase().includes(locationQuery.toLowerCase());
        return matchesQuery && matchesLocation;
      })
      .sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
  }, [query, locationQuery, activeLocation]);

  // Compute orgs
  const filteredOrgs = useMemo(() => {
    return mockOrganizations
      .map((org) => {
        const dist = org.location.latitude && org.location.longitude
          ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, org.location.latitude, org.location.longitude)
          : undefined;
        return {
          ...org,
          location: {
            ...org.location,
            distanceKm: dist,
          },
        };
      })
      .filter((org) => {
        const matchesQuery = !query || org.name.toLowerCase().includes(query.toLowerCase()) || org.description.toLowerCase().includes(query.toLowerCase());
        const matchesLocation = !locationQuery
          ? true
          : org.location.cityName.toLowerCase().includes(locationQuery.toLowerCase()) || org.location.areaName.toLowerCase().includes(locationQuery.toLowerCase());
        return matchesQuery && matchesLocation;
      })
      .sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
  }, [query, locationQuery, activeLocation]);

  // Compute matching help tutorials
  const filteredHelpTutorials = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return mockTutorials.filter((tut) => {
      return (
        tut.title.toLowerCase().includes(q) ||
        tut.summary.toLowerCase().includes(q) ||
        tut.steps.some(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      );
    });
  }, [query]);

  const totalResultsCount =
    filteredListings.length +
    filteredJobs.length +
    filteredGuides.length +
    filteredUpdates.length +
    filteredEvents.length +
    filteredOrgs.length +
    filteredHelpTutorials.length;

  const recentSearches = ['Cleaner', 'Driver', 'African food', 'Hair braiding', 'Immigration tips'];

  // Map representation pins
  const mapPins = useMemo(() => {
    const pins: any[] = [];
    filteredListings.forEach((item) => {
      if (item.location.latitude && item.location.longitude) {
        pins.push({
          id: item.listingId,
          title: item.title,
          category: item.category.name,
          latitude: item.location.latitude,
          longitude: item.location.longitude,
          distanceKm: item.location.distanceKm || 0,
          rating: item.rating.average,
        });
      }
    });

    filteredJobs.forEach((item) => {
      if (item.location.latitude && item.location.longitude) {
        pins.push({
          id: item.jobId,
          title: item.title,
          category: item.category,
          latitude: item.location.latitude,
          longitude: item.location.longitude,
          distanceKm: item.location.distanceKm || 0,
          rating: item.employer.rating,
        });
      }
    });

    filteredEvents.forEach((item) => {
      if (item.location.latitude && item.location.longitude) {
        pins.push({
          id: item.id,
          title: item.title,
          category: item.category,
          latitude: item.location.latitude,
          longitude: item.location.longitude,
          distanceKm: item.location.distanceKm || 0,
        });
      }
    });

    return pins;
  }, [filteredListings, filteredJobs, filteredEvents]);

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      {/* Search Header */}
      <View className="bg-surface-card px-4 pt-2 pb-3 border-b border-faint">
        <View className="flex-row items-center">
          <View className="flex-1">
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="What are you looking for?"
              editable
              autoFocus={!params.category}
              onSubmit={() => setHasSearched(true)}
            />
            {/* Custom Proximity Switcher Trigger / Input */}
            <TouchableOpacity
              onPress={() => setIsLocationSelectorOpen(true)}
              className="mt-2 h-11 bg-surface-background border border-subtle rounded-xl px-3.5 flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <Text className="text-sm mr-2">📍</Text>
                <Text className="text-xs font-black text-content-strong">
                  Search Near: {activeLocation.neighborhood}, {activeLocation.cityName}
                </Text>
              </View>
              <Text className="text-xs text-content-muted font-bold">Change ▾</Text>
            </TouchableOpacity>
          </View>
          <View className="ml-2 h-full justify-start pt-2">
            <TouchableOpacity
              onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
              className="w-10 h-10 items-center justify-center mb-2"
            >
              <Text className="text-lg">{viewMode === 'list' ? '🗺️' : '📋'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowFilters(!showFilters)}
              className="w-10 h-10 items-center justify-center"
            >
              <Text className="text-lg">⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Frontend Phase 13, §38/§54. The same community filter component every
            other scoped surface mounts. The selection lives in the shared context
            store, so navigating from a result to its detail screen and back does
            not lose it — which is what §54 asks for. */}
        <View className="-mx-4 mt-3">
          <CommunityFilterBar compact />
        </View>

        {originFilter.source === 'community' ? (
          <View className="mt-1">
            <CommunityScopeNote projection={communityProjection} compact />
          </View>
        ) : null}

        {/* Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ paddingRight: 16 }}
        >
          <CategoryChip
            label="All"
            isSelected={!selectedCategory}
            onPress={() => setSelectedCategory(null)}
          />
          {mockCategories.slice(0, 6).map((cat) => (
            <CategoryChip
              key={cat.id}
              label={cat.name}
              icon={cat.icon}
              isSelected={selectedCategory === cat.id}
              onPress={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
            />
          ))}
        </ScrollView>

        {/* Dynamic Country Filter Chips */}
        {availableCountries.length > 0 && (
          <View className="mt-3 pt-3 border-t border-faint">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              <TouchableOpacity
                onPress={() => setSelectedCountryCode(null)}
                className={`px-3 py-1.5 rounded-full mr-2 flex-row items-center border ${
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
                    className={`px-3 py-1.5 rounded-full mr-2 flex-row items-center border ${
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
      </View>

      {/* Content */}
      {!query && !locationQuery && !hasSearched && !selectedCategory ? (
        <ScrollView className="flex-1 px-6 pt-6"
        contentContainerStyle={{ paddingBottom: bottomInset }}>
          <Text className="text-sm font-semibold text-content-faint uppercase tracking-wider mb-3">
            Recent Searches
          </Text>
          {recentSearches.map((term) => (
            <TouchableOpacity
              key={term}
              onPress={() => {
                setQuery(term);
                setHasSearched(true);
              }}
              className="flex-row items-center py-3 border-b border-faint"
            >
              <Text className="text-content-faint mr-3">🕐</Text>
              <Text className="text-base text-content-secondary flex-1">{term}</Text>
              <Text className="text-content-faint">↗</Text>
            </TouchableOpacity>
          ))}

          <Text className="text-sm font-semibold text-content-faint uppercase tracking-wider mb-3 mt-8">
            Popular Categories
          </Text>
          <View className="flex-row flex-wrap">
            {mockCategories.map((cat) => (
              <CategoryChip
                key={cat.id}
                label={cat.name}
                icon={cat.icon}
                onPress={() => {
                  setSelectedCategory(cat.id);
                  setHasSearched(true);
                }}
              />
            ))}
          </View>
        </ScrollView>
      ) : viewMode === 'map' ? (
        <View className="flex-1 p-4 bg-surface-background">
          <MapPreviewCard
            center={activeLocation}
            pins={mapPins}
            radiusKm={store.searchRadius > 0 ? store.searchRadius : 5}
          />
        </View>
      ) : totalResultsCount === 0 ? (
        <EmptyState
          icon="🔍"
          title="No results found"
          description={`We couldn't find any service providers, jobs, guides, or alerts matching "${query}".`}
          action={
            <Button
              label="Clear Search"
              variant="outline"
              size="sm"
              onPress={() => {
                setQuery('');
                setLocationQuery('');
                setSelectedCategory(null);
                setHasSearched(false);
              }}
            />
          }
        />
      ) : (
        <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
          {/* Frontend Phase 18, §30. The one saved-search control, shared by
              every list surface: this screen passes its own filters and knows
              nothing about alerts, frequencies or automations. §30 forbids
              duplicating saved-search logic across modules, and the way that is
              kept is that there is nothing here to duplicate. */}
          <View className="mb-5">
            <SaveSearchButton
              subject="providers"
              criteria={{
                ...(query ? { q: query } : {}),
                ...(locationQuery ? { location: locationQuery } : {}),
                ...(selectedCategory ? { category: selectedCategory } : {}),
              }}
              querySummary={[query, locationQuery, selectedCategory]
                .filter(Boolean)
                .join(' · ')}
              suggestedName={query || locationQuery || 'Saved search'}
            />
          </View>

          {/* ❓ HELP & TUTORIALS SECTION */}
          {filteredHelpTutorials.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  ❓ Help & Tutorials ({filteredHelpTutorials.length})
                </Text>
              </View>
              {filteredHelpTutorials.map((item) => (
                <TutorialCard key={item.id} tutorial={item} />
              ))}
            </View>
          )}

          {/* 👤 SERVICE PROVIDERS SECTION */}
          {filteredListings.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  👤 Service Providers ({filteredListings.length})
                </Text>
              </View>
              {filteredListings.map((item) => (
                <ProviderCard
                  key={item.listingId}
                  listingId={item.listingId}
                  title={item.title}
                  category={item.category.name}
                  areaName={item.location?.areaName}
                  distanceKm={item.location?.distanceKm}
                  rating={item.rating.average}
                  reviewCount={item.rating.totalReviews}
                  coverImageUrl={item.coverImageUrl}
                  isVerified={item.verificationStatus === 'Verified'}
                  isOpenNow={item.isOpenNow}
                  variant="list"
                />
              ))}
            </View>
          )}

          {/* 💼 JOB OPPORTUNITIES SECTION */}
          {filteredJobs.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  💼 Job Opportunities ({filteredJobs.length})
                </Text>
              </View>
              {filteredJobs.map((item) => (
                <JobCard key={item.jobId} job={item} />
              ))}
            </View>
          )}

          {/* 📖 EVERGREEN GUIDES SECTION */}
          {filteredGuides.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  📖 Evergreen Guides ({filteredGuides.length})
                </Text>
              </View>
              {filteredGuides.map((item) => {
                const author = mockAuthors[item.authorId];
                return (
                  <GuideCard
                    key={item.guideId}
                    guide={item as any}
                    author={author as any}
                    variant="list"
                  />
                );
              })}
            </View>
          )}

          {/* 🎉 COMMUNITY EVENTS SECTION */}
          {filteredEvents.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  🎉 Community Events ({filteredEvents.length})
                </Text>
              </View>
              {filteredEvents.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => router.push(`/community-life/event/${item.id}`)}
                  className="bg-surface-card rounded-3xl border border-subtle p-4 mb-3 flex-row items-center shadow-sm"
                >
                  <View className="flex-1">
                    <Text className="text-[9px] font-black text-primary-500 uppercase">{item.category}</Text>
                    <Text className="text-sm font-extrabold text-content-primary mt-0.5">{item.title}</Text>
                    <Text className="text-xs text-content-muted font-bold mt-1">🗓 {item.date} · {item.location.areaName}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 🏛 COMMUNITY HUB / DIRECTORY SECTION */}
          {filteredOrgs.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  🏛 Community Hubs ({filteredOrgs.length})
                </Text>
              </View>
              {filteredOrgs.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => router.push(`/community-life/org/${item.id}`)}
                  className="bg-surface-card rounded-3xl border border-subtle p-4 mb-3 flex-row items-center shadow-sm"
                >
                  <View className="flex-1">
                    <Text className="text-[9px] font-black text-primary-500 uppercase">{item.category}</Text>
                    <Text className="text-sm font-extrabold text-content-primary mt-0.5">{item.name}</Text>
                    <Text className="text-xs text-content-muted font-bold mt-1">📍 {item.location.areaName} · {item.followersCount} followers</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 📢 COMMUNITY UPDATES / ALERTS SECTION */}
          {filteredUpdates.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  📢 Community Alerts ({filteredUpdates.length})
                </Text>
              </View>
              {filteredUpdates.map((item) => {
                const author = mockAuthors[item.authorId];
                return (
                  <UpdateCard
                    key={item.updateId}
                    update={item}
                    author={author as any}
                  />
                );
              })}
            </View>
          )}
          <View className="h-10" />
        </ScrollView>
      )}
      {/* Global Location Selector modal drawer */}
      <GlobalLocationSelector
        visible={isLocationSelectorOpen}
        onClose={() => setIsLocationSelectorOpen(false)}
      />
    </SafeAreaView>
  );
}
