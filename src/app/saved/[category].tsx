import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { SAVED_COLLECTION_CONFIG } from '@/types/saved';
import { useSavedStore } from '@/store/saved';
import { mockListings } from '@/mocks/data';
import { mockGuides, mockAuthors } from '@/mocks/community-data';
import { mockJobs } from '@/mocks/jobs-data';
import { mockHousingListings } from '@/mocks/housing-data';
import { mockMarketplaceListings } from '@/mocks/marketplace-data';
import { mockEvents, mockOrganizations } from '@/mocks/community-life-data';
import { GuideCard } from '@/components/GuideCard';
import { ProviderCard } from '@/components/ProviderCard';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';

// Frontend Phase 13 — Multi-Community Expansion (§39, GAP-027).
//
// §39: saved items keep their community context, can be filtered by community, and
// carry a community badge. The association is resolved through the **same**
// projection the live lists use, so a saved guide and the same guide on the Guides
// tab never disagree about which community they belong to.
//
// Filtering is opt-in here rather than automatic. A saved list is a list the member
// built by hand, and silently hiding half of it because a community filter is active
// elsewhere in the app would be the wrong default — so the community scope narrows
// this screen only when the member turns the filter on.
import { useState } from 'react';
import {
  CommunityBadge,
  CommunityFilterBar,
  CommunityScopeNote,
} from '@/components/community-directory';
import { useAvailableCommunities, useCommunityScope } from '@/hooks/communities';
import { matchesProjection, resolveAssociation } from '@/lib/community/scope';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';

export default function SavedCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const config = SAVED_COLLECTION_CONFIG[category as keyof typeof SAVED_COLLECTION_CONFIG];
  
  const { savedItems } = useSavedStore();

  // Find bookmarked IDs for this category
  const bookmarkedIds: string[] = [];
  savedItems.forEach((type, id) => {
    if (type === category) {
      bookmarkedIds.push(id);
    }
  });

  // Filter relevant mock data
  const guides = category === 'Guide' ? mockGuides.filter((g) => bookmarkedIds.includes(g.guideId)) : [];
  const listings = category === 'Listing' ? mockListings.filter((l) => bookmarkedIds.includes(l.listingId)) : [];
  const jobs = category === 'Job' ? mockJobs.filter((j) => bookmarkedIds.includes(j.jobId)) : [];
  const housing = category === 'Housing' ? mockHousingListings.filter((h) => bookmarkedIds.includes(h.id)) : [];
  const marketplace = category === 'Marketplace' ? mockMarketplaceListings.filter((m) => bookmarkedIds.includes(m.id)) : [];
  const events = category === 'Event' ? mockEvents.filter((e) => bookmarkedIds.includes(e.id)) : [];
  const orgs = category === 'Organization' ? mockOrganizations.filter((o) => bookmarkedIds.includes(o.id)) : [];

  // ── Frontend Phase 13, §39 ────────────────────────────────────────────────
  const communityFlags = getCommunityFeatureFlags();
  const { projection } = useCommunityScope();
  const { refs: communities } = useAvailableCommunities();
  const [communityFilterOn, setCommunityFilterOn] = useState(false);

  const scopeActive = communityFlags.multiCommunityEnabled && communityFilterOn && !projection.isUnscoped;

  /** The publisher's origin country, per saved content type. */
  const originOf = (item: unknown): string | null => {
    const record = item as Record<string, unknown>;
    for (const key of ['owner', 'employer', 'host', 'seller'] as const) {
      const publisher = record[key] as Record<string, unknown> | undefined;
      const origin = publisher?.originCountry as Record<string, unknown> | undefined;
      if (typeof origin?.code === 'string') return origin.code;
    }
    const direct = record.country as Record<string, unknown> | undefined;
    if (typeof direct?.code === 'string') return direct.code;
    const location = record.location as Record<string, unknown> | undefined;
    if (typeof location?.countryCode === 'string') return location.countryCode;
    return null;
  };

  const inScope = <T,>(items: T[]): T[] =>
    scopeActive ? items.filter((item) => matchesProjection(originOf(item), projection)) : items;

  const associationOf = (item: unknown) =>
    resolveAssociation({
      declaredCommunityIds: (item as Record<string, unknown>).communityIds as string[] | undefined,
      originCountryCode: originOf(item),
      communities,
    });

  const scopedGuides = inScope(guides);
  const scopedListings = inScope(listings);
  const scopedJobs = inScope(jobs);
  const scopedHousing = inScope(housing);
  const scopedMarketplace = inScope(marketplace);
  const scopedEvents = inScope(events);
  const scopedOrgs = inScope(orgs);

  const savedBeforeScope =
    guides.length + listings.length + jobs.length + housing.length + marketplace.length + events.length + orgs.length;

  const totalCount =
    scopedGuides.length +
    scopedListings.length +
    scopedJobs.length +
    scopedHousing.length +
    scopedMarketplace.length +
    scopedEvents.length +
    scopedOrgs.length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-xl mr-2">{config?.icon}</Text>
        <Text className="text-xl font-bold text-content-primary">{config?.label}</Text>
      </View>

      {communityFlags.multiCommunityEnabled ? (
        <View className="bg-surface-card border-b border-faint">
          <TouchableOpacity
            accessible
            accessibilityRole="switch"
            accessibilityState={{ checked: communityFilterOn }}
            accessibilityLabel="Filter these saved items by community"
            onPress={() => setCommunityFilterOn((prev) => !prev)}
            className="flex-row items-center px-6 py-2.5"
          >
            <Text className="text-sm mr-2">{communityFilterOn ? '☑' : '☐'}</Text>
            <Text className="text-xs font-bold text-content-secondary">Filter by community</Text>
          </TouchableOpacity>

          {communityFilterOn ? <CommunityFilterBar compact /> : null}
        </View>
      ) : null}

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        {scopeActive ? (
          <View className="mb-4">
            <CommunityScopeNote
              projection={projection}
              totalBeforeScope={savedBeforeScope}
              totalAfterScope={totalCount}
              compact
            />
          </View>
        ) : null}

        {totalCount > 0 ? (
          <View>
            {category === 'Guide' &&
              scopedGuides.map((guide) => {
                const author = mockAuthors[guide.authorId];
                return (
                  <View key={guide.guideId} className="mb-1">
                    <GuideCard guide={guide as any} author={author as any} variant="list" />
                    <CommunityBadge association={associationOf(guide)} size="xs" showQualifier />
                  </View>
                );
              })}

            {category === 'Listing' &&
              scopedListings.map((item) => (
                <View key={item.listingId} className="mb-1">
                <ProviderCard
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
                <CommunityBadge association={associationOf(item)} size="xs" showQualifier />
                </View>
              ))}

            {category === 'Job' &&
              scopedJobs.map((item) => (
                <View key={item.jobId} className="mb-1">
                  <JobCard job={item} variant="list" />
                  <CommunityBadge association={associationOf(item)} size="xs" showQualifier />
                </View>
              ))}

            {category === 'Housing' &&
              scopedHousing.map((item) => (
                <HousingCard
                  key={item.id}
                  listing={item}
                  variant="list"
                />
              ))}

            {category === 'Marketplace' &&
              scopedMarketplace.map((item) => (
                <MarketplaceCard
                  key={item.id}
                  listing={item}
                  variant="list"
                />
              ))}

            {category === 'Event' &&
              scopedEvents.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => router.push(`/community-life/event/${item.id}`)}
                  className="bg-surface-card rounded-3xl border border-subtle p-4 mb-4 flex-row items-center shadow-sm"
                >
                  <View className="flex-1">
                    <Text className="text-[9px] font-black text-primary-500 uppercase">{item.category}</Text>
                    <Text className="text-sm font-extrabold text-content-primary mt-0.5">{item.title}</Text>
                    <Text className="text-xs text-neutral-550 font-bold mt-1">🗓 {item.date} · {item.location.areaName}</Text>
                  </View>
                  <Text className="text-neutral-300 text-lg">›</Text>
                </TouchableOpacity>
              ))}

            {category === 'Organization' &&
              scopedOrgs.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => router.push(`/community-life/org/${item.id}`)}
                  className="bg-surface-card rounded-3xl border border-subtle p-4 mb-4 flex-row items-center shadow-sm"
                >
                  <View className="flex-1">
                    <Text className="text-[9px] font-black text-primary-500 uppercase">{item.category}</Text>
                    <Text className="text-sm font-extrabold text-content-primary mt-0.5">{item.name}</Text>
                    <Text className="text-xs text-neutral-550 font-bold mt-1">📍 {item.location.areaName} · {item.followersCount} followers</Text>
                  </View>
                  <Text className="text-neutral-300 text-lg">›</Text>
                </TouchableOpacity>
              ))}
          </View>
        ) : (
          <View className="items-center justify-center py-20 bg-surface-card border border-subtle rounded-3xl p-6">
            <Text className="text-4xl mb-3">🔍</Text>
            <Text className="text-content-muted font-bold mb-2">No saved {config?.label?.toLowerCase()} yet.</Text>
            <TouchableOpacity onPress={() => router.push('/discover')}>
              <Text className="text-primary-500 font-extrabold text-sm mt-1">Discover {config?.label?.toLowerCase()} →</Text>
            </TouchableOpacity>
          </View>
        )}
        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
