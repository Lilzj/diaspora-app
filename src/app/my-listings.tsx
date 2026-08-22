// ─────────────────────────────────────────────────────────────────────────────
// My Listings
//
// ── What this screen used to do ─────────────────────────────────────────────
//
//     // Simulate that the current user owns listings 1 and 3
//     const myListings = [mockListings[0], mockListings[2]];
//
// Every member on the platform was shown the same two fabricated businesses as
// **their own listings**, with fabricated ratings and fabricated review counts,
// and a "Create Listing" button they would never see because the list was never
// empty. Somebody who had posted nothing believed they had posted two things;
// somebody who had posted something real never saw it.
//
// ── What it does now ────────────────────────────────────────────────────────
//
// Two real routes, read in parallel:
//
//     GET /marketplace/listings/mine   ListMyListingsQuery
//                                      → CursorPagedResult<ListingCardResponse>
//     GET /housing/listings/mine       ListMyHousingListingsQuery
//                                      → HousingSearchResultResponse
//
// Both include drafts, both are scoped to the caller by policy
// (`ListingEditOwn`), and both bind `status`, `cursor` and `limit`.
//
// ── The one thing this screen must admit ────────────────────────────────────
//
// **There is no `GET /providers/mine`.** The Providers module publishes
// `/providers`, `/providers/featured`, `/providers/{id}`, `/providers/slug/{slug}`,
// `POST /providers` and the two lifecycle writes — and nothing that lists the
// providers a member owns. So a member who has registered a service-provider
// profile cannot be shown it here, and the screen says that plainly rather than
// leaving them to conclude their business was deleted.
//
// The two halves are fetched with `allSettled`: marketplace being unavailable
// must not cost the member the sight of their own property listing.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ScrollEndFlatList } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { router } from 'expo-router';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { apiClient } from '@/lib/apiClient';
import { readPage } from '@/lib/platform-envelope';

/** `ListingCardResponse`, as much of it as this screen renders. */
interface MyMarketplaceListing {
  listingId: string;
  title: string;
  status: string;
  categoryKey: string;
  price?: { displayText?: string | null } | null;
  location?: { cityName?: string | null; areaName?: string | null } | null;
}

/** `HousingListingCardResponse`, as much of it as this screen renders. */
interface MyHousingListing {
  id: string;
  title: string;
  status: string;
  accommodationTypeName?: string | null;
  accommodationTypeKey: string;
  price?: { displayText?: string | null } | null;
  location?: { cityName?: string | null; areaName?: string | null } | null;
}

/** One row, whichever vertical it came from. */
interface OwnedListing {
  key: string;
  id: string;
  title: string;
  status: string;
  kind: 'marketplace' | 'housing';
  subtitle: string;
  href: string;
}

function subtitleOf(
  category: string,
  location: { cityName?: string | null; areaName?: string | null } | null | undefined,
  price: { displayText?: string | null } | null | undefined
): string {
  return [category, location?.areaName ?? location?.cityName, price?.displayText]
    .filter(Boolean)
    .join(' · ');
}

async function fetchMyListings(): Promise<{ items: OwnedListing[]; partial: boolean }> {
  const [marketplace, housing] = await Promise.allSettled([
    apiClient.get('/marketplace/listings/mine'),
    apiClient.get('/housing/listings/mine'),
  ]);

  const items: OwnedListing[] = [];

  if (marketplace.status === 'fulfilled') {
    for (const listing of readPage<MyMarketplaceListing>(marketplace.value.data).items) {
      items.push({
        key: `marketplace:${listing.listingId}`,
        id: listing.listingId,
        title: listing.title,
        status: listing.status,
        kind: 'marketplace',
        subtitle: subtitleOf(listing.categoryKey, listing.location, listing.price),
        href: `/marketplace/${listing.listingId}`,
      });
    }
  }

  if (housing.status === 'fulfilled') {
    for (const listing of readPage<MyHousingListing>(housing.value.data).items) {
      items.push({
        key: `housing:${listing.id}`,
        id: listing.id,
        title: listing.title,
        status: listing.status,
        kind: 'housing',
        subtitle: subtitleOf(
          listing.accommodationTypeName ?? listing.accommodationTypeKey,
          listing.location,
          listing.price
        ),
        href: `/housing/${listing.id}`,
      });
    }
  }

  return {
    items,
    // True when one half failed. The member is told the list is incomplete
    // rather than being allowed to think the missing half does not exist.
    partial: marketplace.status === 'rejected' || housing.status === 'rejected',
  };
}

export default function MyListingsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-listings'],
    queryFn: fetchMyListings,
  });

  const listings = data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="My Listings" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-sm text-content-muted mt-4">Loading your listings…</Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">⚠️</Text>
          <Text className="text-lg font-bold text-content-strong text-center">
            Could not load your listings
          </Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            We could not reach Diaspora. Nothing has been removed — we simply cannot show it right
            now.
          </Text>
          <Button label="Try again" variant="outline" className="mt-6" onPress={() => refetch()} />
        </View>
      ) : listings.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No listings yet"
          description="Create your first listing to start reaching customers. Service-provider profiles are not shown here — Diaspora has no way yet to list the businesses you own."
          action={<Button label="Create Listing" size="sm" onPress={() => router.push('/(tabs)/post')} />}
        />
      ) : (
        <ScrollEndFlatList
          data={listings}
          keyExtractor={(item: OwnedListing) => item.key}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          ListHeaderComponent={
            <View className="mb-3">
              {data?.partial ? (
                <View className="bg-warning-surface border border-subtle rounded-2xl px-4 py-3 mb-2">
                  <Text className="text-xs text-content-secondary leading-relaxed">
                    Part of this list could not be loaded, so something of yours may be missing.
                    Pull down to try again.
                  </Text>
                </View>
              ) : null}
              <Text className="text-[11px] text-content-faint leading-relaxed">
                Marketplace and housing listings only. Diaspora cannot yet list the service-provider
                profiles you own.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: OwnedListing }) => (
            <View className="bg-surface-card border border-subtle rounded-2xl px-4 py-4 mb-3">
              <View className="flex-row items-start">
                <Text className="text-2xl mr-3">{item.kind === 'housing' ? '🏠' : '🛍️'}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-content-primary">{item.title}</Text>
                  {item.subtitle ? (
                    <Text className="text-xs text-content-muted mt-0.5">{item.subtitle}</Text>
                  ) : null}
                  {/* The server's own status word — `Draft`, `Published`,
                      `Sold`. Not re-derived, because a listing the member
                      believes is live and is not is the failure that matters. */}
                  <Text className="text-[10px] text-content-faint mt-1 uppercase tracking-wider font-bold">
                    {item.status}
                  </Text>
                </View>
                <Button
                  label="Open"
                  variant="outline"
                  size="sm"
                  onPress={() => router.push(item.href)}
                />
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
