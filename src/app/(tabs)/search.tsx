import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchBar } from '@/components/SearchBar';
import { LocationInput } from '@/components/LocationInput';
import { ProviderCard } from '@/components/ProviderCard';
import { CategoryChip } from '@/components/CategoryChip';
import { ProviderCardSkeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { mockCategories, mockListings } from '@/mocks/data';
import { mockJobs } from '@/mocks/jobs-data';
import { mockGuides, mockCommunityUpdates, mockAuthors } from '@/mocks/community-data';
import { JobCard } from '@/components/JobCard';
import { GuideCard } from '@/components/GuideCard';
import { UpdateCard } from '@/components/UpdateCard';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.category ?? null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const filteredListings = mockListings.filter((listing) => {
    const matchesQuery = !query || listing.title.toLowerCase().includes(query.toLowerCase()) || listing.description.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = !locationQuery || (listing.location?.cityName || '').toLowerCase().includes(locationQuery.toLowerCase()) || (listing.location?.areaName || '').toLowerCase().includes(locationQuery.toLowerCase());
    const matchesCategory = !selectedCategory || listing.category.id === selectedCategory;
    return matchesQuery && matchesLocation && matchesCategory;
  });

  const filteredJobs = mockJobs.filter((job) => {
    const matchesQuery = !query || job.title.toLowerCase().includes(query.toLowerCase()) || job.description.toLowerCase().includes(query.toLowerCase()) || job.employer.name.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = !locationQuery || job.location.cityName.toLowerCase().includes(locationQuery.toLowerCase()) || job.location.areaName.toLowerCase().includes(locationQuery.toLowerCase());
    return matchesQuery && matchesLocation;
  });

  const filteredGuides = mockGuides.filter((guide) => {
    const matchesQuery = !query || guide.title.toLowerCase().includes(query.toLowerCase()) || guide.summary.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = !locationQuery || guide.country.name.toLowerCase().includes(locationQuery.toLowerCase());
    return matchesQuery && matchesLocation;
  });

  const filteredUpdates = mockCommunityUpdates.filter((update) => {
    const matchesQuery = !query || update.title.toLowerCase().includes(query.toLowerCase()) || update.description.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = !locationQuery || update.location.cityName.toLowerCase().includes(locationQuery.toLowerCase()) || update.location.areaName.toLowerCase().includes(locationQuery.toLowerCase());
    return matchesQuery && matchesLocation;
  });

  const totalResultsCount = filteredListings.length + filteredJobs.length + filteredGuides.length + filteredUpdates.length;

  const recentSearches = ['Cleaner', 'Driver', 'African food', 'Hair braiding', 'Immigration tips'];

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      {/* Search Header */}
      <View className="bg-white px-4 pt-2 pb-3 border-b border-neutral-100">
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
            <LocationInput
              value={locationQuery}
              onChangeText={setLocationQuery}
              placeholder="Where? (e.g., London)"
            />
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
      </View>

      {/* Content */}
      {!query && !locationQuery && !hasSearched && !selectedCategory ? (
        <ScrollView className="flex-1 px-6 pt-6">
          <Text className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Recent Searches
          </Text>
          {recentSearches.map((term) => (
            <TouchableOpacity
              key={term}
              onPress={() => {
                setQuery(term);
                setHasSearched(true);
              }}
              className="flex-row items-center py-3 border-b border-neutral-100"
            >
              <Text className="text-neutral-400 mr-3">🕐</Text>
              <Text className="text-base text-neutral-700 flex-1">{term}</Text>
              <Text className="text-neutral-300">↗</Text>
            </TouchableOpacity>
          ))}

          <Text className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3 mt-8">
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
        <View className="flex-1 bg-neutral-200 items-center justify-center">
          <Text className="text-6xl mb-4">🗺️</Text>
          <Text className="text-lg font-semibold text-neutral-700">Map View</Text>
          <Text className="text-sm text-neutral-500 mt-1">
            {totalResultsCount} results found near you
          </Text>
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
          {/* 👤 SERVICE PROVIDERS SECTION */}
          {filteredListings.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest">
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
                <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest">
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
                <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest">
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

          {/* 📢 COMMUNITY UPDATES / ALERTS SECTION */}
          {filteredUpdates.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                  📢 Community Alerts ({filteredUpdates.length})
                </Text>
              </View>
              {filteredUpdates.map((item) => {
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
              })}
            </View>
          )}
          <View className="h-10" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
