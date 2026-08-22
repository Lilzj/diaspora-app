import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Slot, usePathname, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { FeatureGate } from '@/components/FeatureGate';
import { useThemeTokens } from '@/design-system';
import { useGuideCategories } from '@/hooks/guides';
import {
  countryFlagEmoji,
  fetchKnowledgeCountries,
  knowledgeCountryKeys,
} from '@/lib/knowledge-countries-api';

// Remediation Wave D-3.
//
// The category row used to be `mocks/data`'s `mockCategories` — the
// **marketplace** taxonomy: "Food & Restaurants", "Hair & Beauty". The Knowledge
// Hub is not a marketplace, and `Diaspora.Modules.Guides` has its own catalogue
// at `GET /guides/categories` whose *keys* are what a guide is filed under and
// what `GET /guides?category=` takes. Filtering guides by "Hair & Beauty" was
// never going to match anything on the server.
//
// The chips now come from that catalogue and set **both** spellings of the
// filter — the key for the server-backed Guides tab, and the display label the
// chip row itself compares against to decide which chip is lit. See
// `store/knowledge-search.ts` for why both exist.
//
// ── The country picker is now real too ───────────────────────────────────────
//
// It used to be `mockCountryStats` from `mocks/community-data.ts` — a
// hand-written list of countries with hand-written provider and expert counts —
// on the stated grounds that there was "no country-catalogue route on this
// surface". **There is one, and it is exactly this list:**
//
//     GET /knowledge/countries   (ListCountryDirectoriesQuery)
//
// Every country the platform actually holds knowledge for, deliberately unpaged
// because there are fewer than two hundred of them, with names already localized
// by the server. Wired through `lib/knowledge-countries-api.ts`.
//
// This matters beyond tidiness: the picker's whole job is to set
// `selectedCountryCode`, which is what `GET /guides?country=` filters on. A
// fixture list could offer a country the knowledge base holds nothing for — a
// filter chip lit up over an empty result, with no way for the member to tell
// whether the country was empty or the filter was wrong. The picker now offers
// only countries that exist on the server.
//
// The flag beside each name is derived from the ISO code by the Unicode
// regional-indicator rule rather than fetched; the contract carries no flag, and
// that derivation is a transformation of a real field rather than a new claim.

export default function KnowledgeLayout() {
  const tokens = useThemeTokens();
  const pathname = usePathname();
  const {
    searchQuery,
    setSearchQuery,
    selectedCountry,
    setSelectedCountry,
    selectedCategory,
    setSelectedCategory,
    sortBy,
    setSortBy,
    resetFilters,
  } = useKnowledgeSearchStore();

  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  // An hour: which countries the platform holds knowledge for is editorial
  // configuration, not something that moves while the picker is open. Fetched
  // with the layout rather than with the modal so the first tap opens onto a
  // list instead of onto a spinner.
  const countries = useQuery({
    queryKey: knowledgeCountryKeys.list(),
    queryFn: ({ signal }) => fetchKnowledgeCountries({ signal }),
    staleTime: 60 * 60 * 1000,
  });

  // `selectable` rather than every category: an inactive one is a category new
  // guides may not be filed under, and offering it as a filter chip would offer
  // a shelf nothing new can reach.
  const { selectable: guideCategories } = useGuideCategories();

  const tabs = [
    { name: 'Guides', path: '/knowledge/guides', icon: '📖' },
    { name: 'Updates', path: '/knowledge/updates', icon: '📢' },
    { name: 'Contributors', path: '/knowledge/contributors', icon: '⭐' },
  ];

  return (
    <FeatureGate featureName="Knowledge Hub">
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
      {/* Search Header */}
      <View className="px-6 pt-4 pb-2">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-black text-content-primary tracking-tight">Knowledge Hub</Text>
          {(searchQuery || selectedCountry || selectedCategory) && (
            <TouchableOpacity onPress={resetFilters} className="bg-surface-muted px-2.5 py-1 rounded-lg">
              <Text className="text-[10px] font-bold text-content-muted uppercase">Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dedicated Search Input Bar */}
        <View className="flex-row items-center h-12 bg-surface-background border border-subtle rounded-2xl px-4 mb-3">
          <Text className="text-base mr-2 text-content-faint">🔍</Text>
          <TextInput
            placeholder="Search guides, alerts, or contributors..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-xs font-semibold text-content-strong h-full"
            placeholderTextColor={tokens.color.text.placeholder}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
              <Text className="text-xs text-content-faint">✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Chips Horizontal Rows */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
          {/* Country Selector Filter Chip */}
          <TouchableOpacity
            onPress={() => setCountryPickerOpen(true)}
            className={`flex-row items-center px-3 py-1.5 rounded-full border mr-2 ${
              selectedCountry ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
            }`}
          >
            <Text className="text-[11px] font-bold text-content-secondary">
              📍 {selectedCountry ? selectedCountry : 'All Countries'}
            </Text>
            <Text className="text-[9px] text-content-faint ml-1">▾</Text>
          </TouchableOpacity>

          {/* Sort selection Chips */}
          {[
            { label: '🔥 Trending', value: 'trending' },
            { label: '🕒 Newest', value: 'newest' },
            { label: '👍 Most Helpful', value: 'helpful' },
            { label: '🔄 Updated', value: 'updated' },
          ].map((opt) => {
            const isSelected = sortBy === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSortBy(opt.value as any)}
                className={`px-3 py-1.5 rounded-full border mr-2 ${
                  isSelected ? 'bg-surface-inverse border-line' : 'bg-surface-background border-subtle'
                }`}
              >
                <Text className={`text-[11px] font-bold ${isSelected ? 'text-content-inverse' : 'text-content-tertiary'}`}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category Scroll Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mt-2 py-1">
          <TouchableOpacity
            onPress={() => setSelectedCategory(null, null)}
            className={`px-3 py-1.5 rounded-full border mr-2 ${
              selectedCategory === null ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
            }`}
          >
            <Text className={`text-[11px] font-bold ${selectedCategory === null ? 'text-white' : 'text-content-tertiary'}`}>
              All Categories
            </Text>
          </TouchableOpacity>
          {guideCategories.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <TouchableOpacity
                key={cat.categoryId}
                // Both spellings. The key is what the server filters on; the
                // label is what the fixture-backed Contributors tab compares.
                onPress={() => setSelectedCategory(cat.name, cat.key)}
                className={`flex-row items-center px-3 py-1.5 rounded-full border mr-2 ${
                  isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
                }`}
              >
                <Text className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-content-tertiary'}`}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Top Tab Switch Bar */}
      <View className="flex-row border-b border-faint bg-surface-card">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.path) || (pathname === '/knowledge' && tab.name === 'Guides');
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => router.push(tab.path as any)}
              className={`flex-1 items-center justify-center py-3 border-b-2 ${
                isActive ? 'border-primary-500' : 'border-transparent'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  isActive ? 'text-primary-500' : 'text-content-muted'
                }`}
              >
                {tab.icon} {tab.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content slot */}
      <View className="flex-1 bg-surface-background">
        <Slot />
      </View>

      {/* Country Filter picker Modal */}
      <Modal
        visible={countryPickerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCountryPickerOpen(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-surface-card rounded-t-3xl p-6 min-h-[300px] shadow-2xl">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-content-primary">Filter by Country</Text>
              <TouchableOpacity onPress={() => setCountryPickerOpen(false)}>
                <Text className="text-content-muted font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setSelectedCountry(null, null);
                setCountryPickerOpen(false);
              }}
              className="py-3.5 border-b border-faint flex-row justify-between items-center"
            >
              <Text className="text-sm font-bold text-content-secondary">🌍 All Countries</Text>
              {selectedCountry === null && <Text className="text-primary-500 font-bold">✓</Text>}
            </TouchableOpacity>
            {/*
              Scrollable, because this list is now however many countries the
              server holds knowledge for rather than the fixture's handful, and
              a modal that runs off the bottom of the screen hides the rest of
              them with no indication that they are there.
            */}
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {countries.isLoading && (
                <View className="py-8 items-center">
                  <ActivityIndicator color={tokens.color.text.placeholder} />
                </View>
              )}

              {countries.isError && (
                <View className="py-8 items-center px-2">
                  <Text className="text-sm font-bold text-content-strong text-center">
                    We could not load the country list
                  </Text>
                  <Text className="text-xs text-content-muted text-center mt-1.5 leading-relaxed">
                    Without it this filter cannot be set — the guides search needs a country code,
                    and guessing one from a name is how a filter comes to look like it works and
                    does not.
                  </Text>
                  <TouchableOpacity
                    onPress={() => void countries.refetch()}
                    className="bg-primary-500 px-5 py-2.5 rounded-xl mt-4"
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                  >
                    <Text className="text-white font-black text-xs">Try again</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/*
                Settled, successful and genuinely empty. A picker that just
                showed "All Countries" and a blank space would read as a
                half-loaded list rather than as an answer.
              */}
              {countries.isSuccess && countries.data.length === 0 && (
                <View className="py-8 px-2">
                  <Text className="text-xs text-content-muted text-center leading-relaxed">
                    The platform does not hold knowledge for any country yet, so there is nothing to
                    filter by.
                  </Text>
                </View>
              )}

              {(countries.data ?? []).map((c) => (
                <TouchableOpacity
                  key={c.countryCode}
                  onPress={() => {
                    // Both spellings — the code is what `GET /guides?country=`
                    // takes, and it is not derivable from the display name.
                    setSelectedCountry(c.displayName, c.countryCode);
                    setCountryPickerOpen(false);
                  }}
                  className="py-3.5 border-b border-faint flex-row justify-between items-center"
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${c.displayName}`}
                >
                  <Text className="text-sm font-semibold text-content-strong">
                    {countryFlagEmoji(c.countryCode)} {c.displayName}
                  </Text>
                  {selectedCountry === c.displayName && (
                    <Text className="text-primary-500 font-bold">✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </FeatureGate>
  );
}
