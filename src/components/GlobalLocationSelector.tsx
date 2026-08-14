import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Switch,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Sheet } from '@/components/overlays/AppModal';
import { Ionicons } from '@expo/vector-icons';
import { useLocationStore, PlatformLocation, getActiveLocation } from '@/store/location';
import { apiClient } from '@/lib/apiClient';
import { useThemeTokens } from '@/design-system';

interface GlobalLocationSelectorProps {
  visible: boolean;
  onClose: () => void;
}

export function GlobalLocationSelector({ visible, onClose }: GlobalLocationSelectorProps) {
  const tokens = useThemeTokens();
  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlatformLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [gpsDetecting, setGpsDetecting] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Search Autocomplete effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await apiClient.get('/location/search', {
          params: { query: searchQuery },
        });
        setSearchResults(res.data.data || []);
      } catch (err) {
        console.error('Failed to search locations', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSelect = (loc: PlatformLocation) => {
    store.setCurrentLocation(loc);
    setSearchQuery('');
    onClose();
  };

  const handleGPSDetect = async () => {
    setGpsDetecting(true);
    setGpsError(null);
    try {
      await store.detectLocation();
      onClose();
    } catch (err) {
      setGpsError('Could not detect location. Please check your GPS settings.');
    } finally {
      setGpsDetecting(false);
    }
  };

  const handleTravelToggle = (val: boolean) => {
    store.toggleTravelMode(val);
  };

  return (
    // Was a hand-rolled Modal: its own bg-black/60 scrim, no bottom safe area,
    // no keyboard avoidance despite carrying a search field, and nothing holding
    // a screen reader inside it. Sheet decides all four. `scrollable={false}`
    // because the body brings its own ScrollView and FlatList — nesting those in
    // the sheet's scroll view starves them of the gesture.
    <Sheet
      visible={visible}
      onClose={onClose}
      height="85%"
      scrollable={false}
      testID="global-location-selector"
    >
        <View className="flex-col flex-1">

          {/* Title Row */}
          <View className="flex-row justify-between items-center mb-6">
            <View>
              <Text className="text-2xl font-black text-content-primary tracking-tight">Location Context</Text>
              <Text className="text-xs font-bold text-content-faint mt-0.5">Where are you looking for services?</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="p-2.5 bg-surface-muted rounded-full active:scale-95"
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Active Context Banner */}
          <View className="bg-surface-background rounded-2xl p-4 border border-faint flex-row items-center mb-5 justify-between">
            <View className="flex-row items-center flex-1 pr-3">
              <Text className="text-2xl mr-3">{activeLocation.flag}</Text>
              <View className="flex-1">
                <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest">Active Discovery Location</Text>
                <Text className="text-base font-extrabold text-content-primary mt-0.5 leading-snug">
                  {activeLocation.neighborhood}, {activeLocation.cityName}
                </Text>
              </View>
            </View>
            <View className="bg-success-surface px-2.5 py-1 rounded-full flex-row items-center">
              <View className="w-1.5 h-1.5 bg-success-default rounded-full mr-1.5" />
              <Text className="text-[10px] font-extrabold text-success-default uppercase">ACTIVE</Text>
            </View>
          </View>

          {/* Auto-detect & Travel Mode actions */}
          <View className="flex-row items-center justify-between mb-5 gap-3">
            <TouchableOpacity
              onPress={handleGPSDetect}
              disabled={gpsDetecting}
              className="flex-1 flex-row items-center justify-center bg-primary-500 h-12 rounded-xl px-4 active:bg-primary-600"
            >
              {gpsDetecting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="location" size={16} color="#FFF" className="mr-2" />
                  <Text className="text-white font-extrabold text-sm ml-1">Use GPS Location</Text>
                </>
              )}
            </TouchableOpacity>

            <View className="bg-surface-background border border-subtle h-12 rounded-xl px-4 flex-row items-center gap-3">
              <View className="flex-row items-center mr-1">
                <Ionicons name="airplane" size={16} color={store.travelMode ? '#F59300' : '#6B7280'} />
                <Text className="text-xs font-bold text-content-primary ml-1.5">Travel Mode</Text>
              </View>
              <Switch
                value={store.travelMode}
                onValueChange={handleTravelToggle}
                trackColor={{ false: '#E5E7EB', true: '#FED7AA' }}
                thumbColor={store.travelMode ? '#F59300' : '#F3F4F6'}
              />
            </View>
          </View>

          {gpsError && (
            <View className="bg-error-surface border border-red-200 p-3 rounded-xl mb-4 flex-row items-center">
              <Ionicons name="alert-circle" size={16} color="#DC2626" />
              <Text className="text-xs font-bold text-error-default ml-2 flex-1">{gpsError}</Text>
            </View>
          )}

          {/* Search Input */}
          <View className="flex-row items-center bg-surface-muted rounded-2xl h-14 px-4 mb-4 border border-subtle/50">
            <Ionicons name="search" size={20} color="#9CA3AF" className="mr-3" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search country, city, or neighborhood..."
              placeholderTextColor={tokens.color.text.placeholder}
              className="flex-1 text-sm font-semibold text-content-strong h-full"
              autoCorrect={false}
              accessibilityLabel="Location search input"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Lists Container */}
          <View className="flex-1">
            {loading ? (
              <View className="flex-1 justify-center items-center">
                <ActivityIndicator color="#F59300" size="large" />
                <Text className="text-xs font-bold text-content-faint mt-2">Searching location database...</Text>
              </View>
            ) : searchQuery.length > 0 ? (
              // Search Results
              <FlatList
                data={searchResults}
                keyExtractor={(item, idx) => `${item.neighborhood}-${idx}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleSelect(item)}
                    className="flex-row items-center py-4 border-b border-faint active:bg-surface-background px-2"
                  >
                    <Text className="text-2xl mr-4">{item.flag}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-extrabold text-content-primary leading-snug">
                        {item.neighborhood}
                      </Text>
                      <Text className="text-xs text-content-muted font-semibold mt-0.5">
                        {item.cityName}, {item.countryName}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View className="p-8 items-center justify-center">
                    <Text className="text-5xl mb-3">📍</Text>
                    <Text className="text-sm font-bold text-content-primary">No locations found</Text>
                    <Text className="text-xs text-content-muted text-center mt-1 leading-relaxed max-w-[220px]">
                      We couldn't find matches for "{searchQuery}". Try searching for major cities or countries.
                    </Text>
                  </View>
                }
              />
            ) : (
              // Default lists (Saved & Recents)
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Saved Locations */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5 mt-2">Saved Locations</Text>
                
                {Object.entries(store.savedLocations).map(([key, loc]) => (
                  <View key={key} className="flex-row items-center justify-between py-3 border-b border-faint">
                    <TouchableOpacity
                      onPress={() => loc && handleSelect(loc)}
                      disabled={!loc}
                      className="flex-row items-center flex-1"
                    >
                      <View className="w-10 h-10 rounded-full bg-surface-muted items-center justify-center mr-3">
                        <Ionicons
                          name={key === 'Home' ? 'home' : key === 'Work' ? 'briefcase' : 'school'}
                          size={18}
                          color={loc ? '#F59300' : '#9CA3AF'}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-extrabold text-content-primary">{key}</Text>
                        <Text className="text-xs text-content-muted font-semibold mt-0.5">
                          {loc ? `${loc.neighborhood}, ${loc.cityName}` : 'Not configured'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    
                    {loc ? (
                      <TouchableOpacity
                        onPress={() => store.removeSavedLocation(key)}
                        className="p-1 active:opacity-60"
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => store.saveLocation(key, activeLocation)}
                        className="bg-surface-muted border border-subtle px-3 py-1.5 rounded-lg active:bg-subtle"
                      >
                        <Text className="text-[10px] font-black text-content-secondary uppercase">SAVE ACTIVE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {/* Recents list */}
                {store.recentLocations.length > 0 && (
                  <View className="mt-6">
                    <View className="flex-row items-center justify-between mb-3.5">
                      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Recent Searches</Text>
                      <TouchableOpacity onPress={store.clearRecentLocations} className="p-1">
                        <Text className="text-xs font-bold text-primary-500">Clear all</Text>
                      </TouchableOpacity>
                    </View>

                    {store.recentLocations.map((item, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleSelect(item)}
                        className="flex-row items-center py-3 border-b border-faint active:opacity-75"
                      >
                        <Ionicons name="time-outline" size={16} color="#9CA3AF" className="mr-3" />
                        <View className="flex-1">
                          <Text className="text-sm font-extrabold text-content-primary">{item.neighborhood}</Text>
                          <Text className="text-xs text-content-muted font-semibold mt-0.5">{item.cityName}</Text>
                        </View>
                        <Text className="text-lg mr-1">{item.flag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
    </Sheet>
  );
}
