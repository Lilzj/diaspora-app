// Discover: the Housing tab's filters.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { ScrollView, Text, View, TextInput, TouchableOpacity } from 'react-native';
import { amountInputText } from '@/lib/platform/discover-filters';
import type { HousingSheet } from '@/components/screens/discover/useHousingSheet';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface HousingFiltersProps {
  housingSheet: HousingSheet;
  search: DiscoverSearch;
}

export function HousingFilters({ housingSheet, search }: HousingFiltersProps) {
  const {
    rentMin, setRentMin, rentMax, setRentMax, bathroomsCount, setBathroomsCount, furnishedStatus,
    setFurnishedStatus, filterBillsIncluded, setFilterBillsIncluded, filterInternetIncluded,
    setFilterInternetIncluded, filterParkingAvailable, setFilterParkingAvailable,
    filterVerifiedHost, setFilterVerifiedHost, selectedLifestyleMatches,
    setSelectedLifestyleMatches,
  } = housingSheet;
  const { priceCurrency, bedroomsCount, setBedroomsCount } = search;

  return (
    <ScrollView className="max-h-[300px]" showsVerticalScrollIndicator={false}>
      {/* Price range input. It names its currency, because the
          search only compares rents written in one. */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">
        {priceCurrency ? `Price Range (${priceCurrency}, Monthly)` : 'Price Range (Monthly)'}
      </Text>
      {priceCurrency ? (
        <View className="flex-row items-center gap-3 mb-5">
          <TextInput
            placeholder="Min Price"
            value={rentMin}
            onChangeText={(text) => setRentMin(amountInputText(text))}
            keyboardType="numeric"
            accessibilityLabel={`Minimum monthly rent in ${priceCurrency}`}
            className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
          />
          <Text className="text-content-faint">-</Text>
          <TextInput
            placeholder="Max Price"
            value={rentMax}
            onChangeText={(text) => setRentMax(amountInputText(text))}
            keyboardType="numeric"
            accessibilityLabel={`Maximum monthly rent in ${priceCurrency}`}
            className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 py-2 text-xs font-semibold text-content-primary"
          />
        </View>
      ) : (
        <Text className="text-xs text-content-secondary mb-5">
          Rent can't be filtered here yet, because we don't know which currency this country's homes are priced in.
        </Text>
      )}

      {/* Rooms filters */}
      <View className="flex-row gap-4 mb-5">
        <View className="flex-1">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Min Bedrooms</Text>
          <View className="flex-row border border-subtle rounded-xl overflow-hidden">
            {[1, 2, 3, 4].map((num) => (
              <TouchableOpacity
                key={num}
                onPress={() => setBedroomsCount(bedroomsCount === num ? null : num)}
                className={`flex-1 py-2 items-center justify-center border-r border-subtle ${
                            bedroomsCount === num ? 'bg-primary-500' : 'bg-surface-background'
                          }`}
              >
                <Text className={`text-xs font-bold ${bedroomsCount === num ? 'text-white' : 'text-content-secondary'}`}>
                  {num}+
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Min Bathrooms</Text>
          <View className="flex-row border border-subtle rounded-xl overflow-hidden">
            {[1, 2, 3].map((num) => (
              <TouchableOpacity
                key={num}
                onPress={() => setBathroomsCount(bathroomsCount === num ? null : num)}
                className={`flex-1 py-2 items-center justify-center border-r border-subtle ${
                            bathroomsCount === num ? 'bg-primary-500' : 'bg-surface-background'
                          }`}
              >
                <Text className={`text-xs font-bold ${bathroomsCount === num ? 'text-white' : 'text-content-secondary'}`}>
                  {num}+
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Furnished Status */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Furnished Status</Text>
      <View className="flex-row mb-5">
        {['All', 'Furnished', 'Unfurnished', 'Partially Furnished'].map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => setFurnishedStatus(opt)}
            className={`px-3 py-2 rounded-full mr-2 ${
                        furnishedStatus === opt ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                      }`}
          >
            <Text className={`text-[10px] font-bold ${furnishedStatus === opt ? 'text-white' : 'text-content-secondary'}`}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Features / Amenities checklist */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Features & Perks</Text>
      <View className="flex-row flex-wrap gap-2.5 mb-5">
        {[
          { label: '🔌 Bills Included', value: filterBillsIncluded, setter: setFilterBillsIncluded },
          { label: '🌐 Internet Included', value: filterInternetIncluded, setter: setFilterInternetIncluded },
          { label: '🚗 Parking Available', value: filterParkingAvailable, setter: setFilterParkingAvailable },
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

      {/* Lifestyle Matches Preferences checkboxes */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Lifestyle Match</Text>
      <View className="flex-row flex-wrap gap-2 mb-5">
        {[
          // Only what `SearchHousingRequest` can filter on. "Women preferred",
          // "remote worker friendly", "quiet" and "non-smoking" have no field
          // anywhere, and parking has its own toggle above.
          { label: '👨🎓 Student Friendly', val: 'Student Friendly' },
          { label: '👨👩👧 Family Friendly', val: 'Family Friendly' },
          { label: '🏠 Shared Living', val: 'Shared Living' },
          { label: '🐶 Pet Friendly', val: 'Pet Friendly' },
        ].map((pref) => {
          const active = !!selectedLifestyleMatches[pref.val];
          return (
            <TouchableOpacity
              key={pref.val}
              onPress={() => setSelectedLifestyleMatches({
                ...selectedLifestyleMatches,
                [pref.val]: !active
              })}
              className={`px-3 py-2 rounded-2xl flex-row items-center border ${
                          active ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
            >
              <Text className={`text-xs font-bold ${active ? 'text-primary-600' : 'text-content-secondary'}`}>
                {pref.label} {active ? '✓' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Verified Host toggle */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Trust Level</Text>
      <TouchableOpacity
        onPress={() => setFilterVerifiedHost(!filterVerifiedHost)}
        className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerifiedHost ? 'bg-surface-muted border border-subtle' : 'bg-surface-background'
                  }`}
      >
        <Text className="text-sm font-semibold text-content-primary">
          Show only Verified Hosts
        </Text>
        <Text className="text-lg">{filterVerifiedHost ? '✅' : '⬜'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
