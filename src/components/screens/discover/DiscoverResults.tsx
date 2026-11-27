// Discover: the results of the tab in view, or their loading skeletons.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { JobCardSkeleton } from '@/components/Skeleton';
import { ListState } from '@/components/ListState';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { FeatureGate } from '@/components/FeatureGate';
import { ProviderResults } from '@/components/screens/discover/ProviderResults';
import { JobResults } from '@/components/screens/discover/JobResults';
import { GuideResults } from '@/components/screens/discover/GuideResults';
import { UpdatesResults } from '@/components/screens/discover/UpdatesResults';
import { HousingResults } from '@/components/screens/discover/HousingResults';
import { MarketplaceResults } from '@/components/screens/discover/MarketplaceResults';
import type { DiscoverCategories } from '@/components/screens/discover/useDiscoverCategories';
import type { GuideTab } from '@/components/screens/discover/useGuideTab';
import type { JobTab } from '@/components/screens/discover/useJobTab';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { ProviderTab } from '@/components/screens/discover/useProviderTab';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

interface DiscoverResultsProps {
  categories: DiscoverCategories;
  guides: GuideTab;
  jobs: JobTab;
  listings: ListingSearches;
  origin: OriginFilter;
  providers: ProviderTab;
  search: DiscoverSearch;
  view: DiscoverView;
}

export function DiscoverResults({
  categories,
  guides,
  jobs,
  listings,
  origin,
  providers,
  search,
  view,
}: DiscoverResultsProps) {
  const { guideSearch } = guides;
  const { jobSearch } = jobs;
  const { isLoading } = listings;
  const { providerSearch } = providers;
  const { activeTab } = search;

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

  return (
    <FeatureGate featureName={activeTab} fullScreen={false}>
      <View className="p-6">
      
      {/* The first read of the tab in view, through the shared list state
          (FARCH-007, 27 Nov 2026). The skeleton stands in for the whole results
          area, notes and "Show more" included, as it always has; each tab part
          says its own error and empty. */}
      <ListState
        loading={showLoading}
        skeleton={
          <View
            className="flex-col gap-4"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Loading ${activeTab.toLowerCase()}`}
          >
            <View className="flex-col gap-4" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
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
          </View>
        }
      >
        {/* Actual Results rendering */}
        {/* The results themselves are the third spotlight anchor. Steps
            that described a badge on an individual card point here
            instead: wrapping a rendered row would register whichever row
            happened to render last, so the spotlight would land on an
            arbitrary card. */}
        <TourSpotlight spotlightKey="discover_results">
        <View>
          {/* Providers Tab */}
          {activeTab === 'Providers' && (
            <ProviderResults origin={origin} providers={providers} search={search} />
           )}

           {/* Jobs Tab */}
           {activeTab === 'Jobs' && (
             <JobResults jobs={jobs} origin={origin} search={search} />
           )}

           {/* Guides Tab */}
           {activeTab === 'Guides' && (
             <GuideResults categories={categories} guides={guides} search={search} />
           )}

           {/* Updates Tab */}
           {activeTab === 'Updates' && (
             <UpdatesResults />
           )}

           {/* Housing Tab */}
           {activeTab === 'Housing' && (
             <HousingResults listings={listings} origin={origin} search={search} />
           )}

           {/* Marketplace Tab */}
           {activeTab === 'Marketplace' && (
             <MarketplaceResults listings={listings} origin={origin} search={search} view={view} />
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
      </ListState>
      </View>
    </FeatureGate>
  );
}
