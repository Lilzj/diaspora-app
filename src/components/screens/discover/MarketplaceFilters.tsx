// Discover: the Marketplace tab's filters.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View, TextInput } from 'react-native';
import type { ListingIntent, ListingCondition } from '@/types/marketplace';
import { amountInputText } from '@/lib/platform/discover-filters';
import type { MarketSheet } from '@/components/screens/discover/useMarketSheet';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

/**
 * The marketplace filter chips. Typed as their unions rather than cast at the
 * setter, so a listing kind the backend does not have fails to compile. Both
 * lists are deliberately partial: the four intents are the ones a member
 * filters by, out of the six the type carries.
 */
const MARKET_INTENTS: readonly ListingIntent[] = [
  'Selling',
  'Wanted',
  'Giving Away',
  'Exchange / Swap',
];

const MARKET_CONDITIONS: readonly ListingCondition[] = [
  'New',
  'Like New',
  'Very Good',
  'Good',
  'Fair',
];

interface MarketplaceFiltersProps {
  marketSheet: MarketSheet;
  search: DiscoverSearch;
}

export function MarketplaceFilters({ marketSheet, search }: MarketplaceFiltersProps) {
  const {
    marketIntent, setMarketIntent, marketCondition, setMarketCondition, marketMinPrice,
    setMarketMinPrice, marketMaxPrice, setMarketMaxPrice, filterVerifiedSeller,
    setFilterVerifiedSeller, filterDeliveryAvailable, setFilterDeliveryAvailable, filterPickupOnly,
    setFilterPickupOnly,
  } = marketSheet;
  const { priceCurrency } = search;

  return (
    <ScrollView className="max-h-[350px]" showsVerticalScrollIndicator={false}>
      {/* Intent Selection */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Listing Intent</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
        {/* The four kinds of listing the platform has. "Buying Request" and
            "Donation" were the same two types under other names. */}
        {MARKET_INTENTS.map((intent) => {
          const isSel = marketIntent === intent;
          return (
            <TouchableOpacity
              key={intent}
              onPress={() => setMarketIntent(isSel ? '' : intent)}
              className={`px-4 py-2 rounded-full mr-2.5 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
            >
              <Text className={`text-xs font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                {/* The create form's word for it (16 Oct 2026). */}
                {intent === 'Wanted' ? 'Buying request' : intent}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Price range input. It names its currency, because the
          search only compares prices written in one. */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">
        {priceCurrency ? `Price Range (${priceCurrency})` : 'Price Range'}
      </Text>
      {priceCurrency ? (
        <View className="flex-row items-center gap-3 mb-5">
          <TextInput
            placeholder="Min Price"
            value={marketMinPrice}
            onChangeText={(text) => setMarketMinPrice(amountInputText(text))}
            keyboardType="numeric"
            accessibilityLabel={`Minimum price in ${priceCurrency}`}
            className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
          />
          <Text className="text-content-faint">-</Text>
          <TextInput
            placeholder="Max Price"
            value={marketMaxPrice}
            onChangeText={(text) => setMarketMaxPrice(amountInputText(text))}
            keyboardType="numeric"
            accessibilityLabel={`Maximum price in ${priceCurrency}`}
            className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
          />
        </View>
      ) : (
        <Text className="text-xs text-content-secondary mb-5">
          Prices can't be filtered here yet, because we don't know which currency this country's items are priced in.
        </Text>
      )}

      {/* Item Condition */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Condition</Text>
      <View className="flex-row mb-5 flex-wrap gap-2">
        {MARKET_CONDITIONS.map((cond) => {
          const isSel = marketCondition === cond;
          return (
            <TouchableOpacity
              key={cond}
              onPress={() => setMarketCondition(isSel ? '' : cond)}
              className={`px-3 py-2 rounded-full mr-2 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
            >
              <Text className={`text-[10px] font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                {cond}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Delivery & Trust toggles */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Delivery & Verification</Text>
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
                        perk.value ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
                      }`}
          >
            <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-content-secondary'}`}>
              {perk.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
