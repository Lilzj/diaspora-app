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
// Three real routes, read in parallel:
//
//     GET /marketplace/listings/mine   ListMyListingsQuery
//                                      → CursorPagedResult<ListingCardResponse>
//     GET /housing/listings/mine       ListMyHousingListingsQuery
//                                      → HousingSearchResultResponse
//     GET /providers/me                ListMyProvidersQuery
//                                      → ProviderSummaryResponse[]
//
// All three include what is not yet published, and all three are scoped to the
// caller by policy rather than by a parameter this screen could get wrong.
//
// ── The gap this screen used to declare, which was not one ──────────────────
//
// It carried a paragraph stating that **"there is no `GET /providers/mine`"**,
// and a line under the list repeating it to the member: "Diaspora cannot yet
// list the service-provider profiles you own." The route is `/providers/me`,
// and it has been served since the Providers module shipped — the register was
// looking for the wrong spelling. A member who had registered a business was
// told Diaspora could not show it, which is the failure this file exists to
// prevent, wearing the opposite costume: not a fabricated listing, but a real
// one declared unlistable.
//
// The three halves are fetched with `allSettled`: marketplace being unavailable
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
import { fetchMyProviders } from '@/lib/providers-api';
import { holdingsFromFailure } from '@/lib/analytics/owner-holdings';

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
  kind: 'marketplace' | 'housing' | 'provider';
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
  const [marketplace, housing, providers] = await Promise.allSettled([
    apiClient.get('/marketplace/listings/mine'),
    apiClient.get('/housing/listings/mine'),
    fetchMyProviders(),
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

  if (providers.status === 'fulfilled') {
    for (const provider of providers.value) {
      items.push({
        key: `provider:${provider.providerId}`,
        id: provider.providerId,
        title: provider.name,
        status: provider.status,
        kind: 'provider',
        subtitle: subtitleOf(
          provider.category?.name ?? 'Service',
          provider.location,
          // A business has no price of its own; its services are priced
          // individually, and inventing a "from" figure here would be a claim
          // about what it charges.
          null
        ),
        href: `/provider/${provider.providerId}`,
      });
    }
  }

  return {
    items,
    // True when a read genuinely failed. The member is told the list is
    // incomplete rather than being allowed to think the missing part does not
    // exist — but a refusal that *means* "you have none of these" is an answer,
    // not a failure. Housing refuses `/housing/listings/mine` outright for a
    // member with no landlord profile, so every member who has never let a home
    // was reading "part of this list could not be loaded" under their own
    // items. See `lib/analytics/owner-holdings.ts` for the same distinction.
    partial: [marketplace, housing, providers].some(couldNotAsk),
  };
}

/**
 * Whether a settled read left the question unanswered.
 *
 * A 403 or a 404 from a "mine" route is the platform saying the member holds
 * none of that kind; anything else — a 500, a timeout, no response at all —
 * means the list may be missing something and says so.
 */
function couldNotAsk(outcome: PromiseSettledResult<unknown>): boolean {
  return outcome.status === 'rejected' && holdingsFromFailure(outcome.reason) === null;
}

/** What each kind of thing looks like in the list. */
const ROW_ICON: Readonly<Record<OwnedListing['kind'], string>> = {
  housing: '🏠',
  marketplace: '🛍️',
  provider: '🏪',
};

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
          description="Anything you list — an item, a home, or your business — appears here, published or not."
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
                Everything you have listed on Diaspora: items, homes and businesses, published or
                not.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: OwnedListing }) => (
            <View className="bg-surface-card border border-subtle rounded-2xl px-4 py-4 mb-3">
              <View className="flex-row items-start">
                <Text className="text-2xl mr-3">{ROW_ICON[item.kind]}</Text>
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
                {/* `fullWidth` defaults to true on `Button`, so this took the
                    whole row: the title, the subtitle and the status were laid
                    out in a column of zero width — present in the tree, one
                    character per line, and invisible. Every row on this screen
                    was a bare icon and an Open button. */}
                <Button
                  label="Open"
                  variant="outline"
                  size="sm"
                  fullWidth={false}
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
