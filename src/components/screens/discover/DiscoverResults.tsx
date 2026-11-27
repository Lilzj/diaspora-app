// Discover: what the screen's list draws around the rows of the tab in view —
// the space the results start with and the tab's notes above the rows, what the
// tab says in their place, and its next page below them. The rows themselves
// are `DiscoverRows`.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it, and
// split around one virtualised list on 27 Nov 2026 (FARCH-004).

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { JobCardSkeleton } from '@/components/Skeleton';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { LockedFeatureCard, useCommunityAccess } from '@/components/FeatureGate';
import { ProviderMore, ProviderNotes, ProviderState } from '@/components/screens/discover/ProviderResults';
import { JobMore, JobState } from '@/components/screens/discover/JobResults';
import { GuideMore, GuideState } from '@/components/screens/discover/GuideResults';
import { UpdatesResults } from '@/components/screens/discover/UpdatesResults';
import { HousingMore, HousingNotes, HousingState } from '@/components/screens/discover/HousingResults';
import {
  MarketplaceMore,
  MarketplaceNotes,
  MarketplaceState,
} from '@/components/screens/discover/MarketplaceResults';
import { discoverLoading, type DiscoverResultsProps } from '@/components/screens/discover/DiscoverRows';

/**
 * Above the rows: the space the results start with, and the tab's notes. Not on
 * the map, which draws its own, and not while the tab is locked: the locked
 * card stands in for the whole results area.
 */
export function DiscoverResultsHeader(props: DiscoverResultsProps) {
  const unlocked = useCommunityAccess();
  const { activeTab } = props.search;
  if (props.view.isMapView || !unlocked) return null;

  const notes = !discoverLoading(props);

  return (
    <View className="px-6 pt-6">
      {notes && activeTab === 'Providers' ? <ProviderNotes providers={props.providers} /> : null}
      {notes && activeTab === 'Housing' ? <HousingNotes listings={props.listings} origin={props.origin} /> : null}
      {notes && activeTab === 'Marketplace' ? (
        <MarketplaceNotes listings={props.listings} origin={props.origin} view={props.view} />
      ) : null}
    </View>
  );
}

/** The first read of the tab in view: its rows' skeleton, said to a screen reader as loading. */
function DiscoverSkeleton({ activeTab }: { activeTab: string }) {
  return (
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
  );
}

/** The Community tab: not a list, a way into the Community Life hub. */
function CommunityLifeIntro() {
  return (
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
  );
}

/** What the tab in view says in place of rows: its error or its empty, in the shared list state. */
function TabState(props: DiscoverResultsProps) {
  const { activeTab } = props.search;
  if (activeTab === 'Providers') return <ProviderState origin={props.origin} providers={props.providers} search={props.search} />;
  if (activeTab === 'Jobs') return <JobState jobs={props.jobs} origin={props.origin} search={props.search} />;
  if (activeTab === 'Guides') return <GuideState guides={props.guides} search={props.search} />;
  if (activeTab === 'Updates') return <UpdatesResults />;
  if (activeTab === 'Housing') return <HousingState listings={props.listings} origin={props.origin} search={props.search} />;
  if (activeTab === 'Marketplace') return <MarketplaceState listings={props.listings} origin={props.origin} search={props.search} />;
  if (activeTab === 'Community') return <CommunityLifeIntro />;
  return null;
}

/**
 * In place of the rows, in this order: locked, the first read, then what the
 * tab says (could not ask, or nothing found, or a tab with no rows to give).
 * The skeleton stands in for the whole results area, notes and "Show more"
 * included, as it always has.
 */
export function DiscoverResultsEmpty(props: DiscoverResultsProps) {
  const unlocked = useCommunityAccess();
  const { activeTab } = props.search;
  if (props.view.isMapView) return null;
  if (!unlocked) return <LockedFeatureCard featureName={activeTab} fullScreen={false} />;
  if (discoverLoading(props)) {
    return (
      <View className="px-6">
        <DiscoverSkeleton activeTab={activeTab} />
      </View>
    );
  }

  // With no rows, what the tab says is the results' spotlight anchor.
  return (
    <View className="px-6">
      <TourSpotlight spotlightKey="discover_results">
        <View>
          <TabState {...props} />
        </View>
      </TourSpotlight>
    </View>
  );
}

/** Below the rows: the tab's next page, on request, and the space the results end with. */
export function DiscoverResultsFooter(props: DiscoverResultsProps) {
  const unlocked = useCommunityAccess();
  const { activeTab } = props.search;
  if (props.view.isMapView || !unlocked) return null;

  const more = !discoverLoading(props);

  return (
    <View className="px-6 pb-6">
      {more && activeTab === 'Providers' ? <ProviderMore providers={props.providers} /> : null}
      {more && activeTab === 'Jobs' ? <JobMore jobs={props.jobs} /> : null}
      {more && activeTab === 'Guides' ? <GuideMore guides={props.guides} /> : null}
      {more && activeTab === 'Housing' ? <HousingMore listings={props.listings} /> : null}
      {more && activeTab === 'Marketplace' ? <MarketplaceMore listings={props.listings} /> : null}
    </View>
  );
}
