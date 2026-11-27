// Discover: the Providers tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { providerPlaceLine } from '@/lib/platform/listing-place';
import { photoUriOf } from '@/lib/platform/media-url';
import { Image as ExpoImage } from 'expo-image';
import { ListState } from '@/components/ListState';
import {
  ShowMoreButton,
  couldNotLoad,
  noMatch,
  pagingState,
} from '@/components/screens/discover/ResultStates';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { ProviderTab } from '@/components/screens/discover/useProviderTab';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface ProviderResultsProps {
  origin: OriginFilter;
  providers: ProviderTab;
  search: DiscoverSearch;
}

export function ProviderResults({ origin, providers, search }: ProviderResultsProps) {
  const { filteredListings } = origin;
  const { providerSearch, providerDistanceNote, retryProviders } = providers;
  const { emptyStatePlace } = search;

  return (
    <View>
      {providerDistanceNote ? (
        <Text className="text-xs text-content-secondary mb-3">{providerDistanceNote}</Text>
      ) : null}
      {/* Distinct from the empty state on purpose. "There are no
          providers near you" and "we could not ask" are opposite
          facts, and collapsing the second into the first tells the
          member the reassuring one. */}
      <ListState
        error={
          providerSearch.isError
            ? couldNotLoad('providers', 'We could not reach service providers just now.', false)
            : null
        }
        onRetry={retryProviders}
        isEmpty={filteredListings.length === 0}
        empty={noMatch('providers', emptyStatePlace)}
      >
        {filteredListings.map((item) => (
          <TouchableOpacity
            key={item.providerId}
            onPress={() => router.push(`/provider/${item.providerId}`)}
            className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-4 shadow-sm"
          >
            {/* The cover through the anonymous image route (14 Oct 2026);
                a neutral block when the business has no photograph. */}
            {photoUriOf(item.coverMedia) ? (
              <ExpoImage
                source={{ uri: photoUriOf(item.coverMedia) as string }}
                style={{ width: '100%', height: 160 }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View className="w-full h-40 bg-surface-muted items-center justify-center">
                <Text className="text-3xl opacity-40">🏪</Text>
              </View>
            )}
            <View className="p-4">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                  {item.category.name}
                </Text>
                {/* The badge is now the server's own
                    `isVerified`, not a fixture's status string. */}
                {item.isVerified && (
                  <Text className="text-[10px] bg-surface-muted text-success-default px-2 py-0.5 rounded font-extrabold">
                    ✓ VERIFIED
                  </Text>
                )}
              </View>
              <Text className="text-lg font-bold text-content-primary mb-1">{item.name}</Text>
              <Text className="text-xs text-content-muted font-semibold mb-3">
                {providerPlaceLine(item.location)}
              </Text>
              <View className="flex-row items-center justify-between border-t border-faint pt-3">
                {/* A provider with no reviews says so, rather than
                    showing "★ 0 (0 reviews)" — which reads as a
                    bad rating rather than as no rating. */}
                <Text className="text-xs font-bold text-content-secondary">
                  {item.reviewSummary.totalReviews > 0
                    ? `★ ${item.reviewSummary.average} (${item.reviewSummary.totalReviews} reviews)`
                    : 'No reviews yet'}
                </Text>
                {/* `isOpenNow` is nullable: the server returns null
                    when it does not know. Null must not render as
                    "● Closed", which is a claim about the business. */}
                {item.isOpenNow !== null && item.isOpenNow !== undefined ? (
                  <Text className={`text-xs font-bold ${item.isOpenNow ? 'text-success-default' : 'text-content-faint'}`}>
                    {item.isOpenNow ? '● Open Now' : '● Closed'}
                  </Text>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ListState>
       {providerSearch.hasMore ? (
         <ShowMoreButton
           label="Show more providers"
           state={pagingState(providerSearch)}
           onPress={providerSearch.loadMore}
         />
       ) : null}
     </View>
  );
}
