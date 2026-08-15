import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal } from 'react-native';
import { Slot, usePathname, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { mockCategories } from '@/mocks/data';
import { mockCountryStats } from '@/mocks/community-data';
import { FeatureGate } from '@/components/FeatureGate';
import { useThemeTokens } from '@/design-system';

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
            onPress={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full border mr-2 ${
              selectedCategory === null ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
            }`}
          >
            <Text className={`text-[11px] font-bold ${selectedCategory === null ? 'text-white' : 'text-content-tertiary'}`}>
              All Categories
            </Text>
          </TouchableOpacity>
          {mockCategories.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(cat.name)}
                className={`flex-row items-center px-3 py-1.5 rounded-full border mr-2 ${
                  isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
                }`}
              >
                <Text className="text-xs mr-1">{cat.icon}</Text>
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
                setSelectedCountry(null);
                setCountryPickerOpen(false);
              }}
              className="py-3.5 border-b border-faint flex-row justify-between items-center"
            >
              <Text className="text-sm font-bold text-content-secondary">🌍 All Countries</Text>
              {selectedCountry === null && <Text className="text-primary-500 font-bold">✓</Text>}
            </TouchableOpacity>
            {mockCountryStats.map((c) => (
              <TouchableOpacity
                key={c.countryCode}
                onPress={() => {
                  setSelectedCountry(c.countryName);
                  setCountryPickerOpen(false);
                }}
                className="py-3.5 border-b border-faint flex-row justify-between items-center"
              >
                <Text className="text-sm font-semibold text-content-strong">
                  {c.flag} {c.countryName}
                </Text>
                {selectedCountry === c.countryName && <Text className="text-primary-500 font-bold">✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </FeatureGate>
  );
}
