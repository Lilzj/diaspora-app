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
import { useLocationStore, PlatformLocation, getActiveLocation, locationLabel } from '@/store/location';
import { resolveAddress, suggestAddresses, type AddressSuggestion } from '@/lib/maps/address-search';
import { newIdempotencyKey } from '@/lib/idempotency';
import { countryByCode } from '@/lib/calling-code';
import { useNotification } from '@/providers/notification-provider';
import { useThemeTokens } from '@/design-system';
import { useSavedPlaces, useSavePlace } from '@/hooks/saved-places';
import { DEFAULT_SAVED_LABELS } from '@/lib/location/saved-places';

interface GlobalLocationSelectorProps {
  visible: boolean;
  onClose: () => void;
}

export function GlobalLocationSelector({ visible, onClose }: GlobalLocationSelectorProps) {
  const tokens = useThemeTokens();
  const store = useLocationStore();

  // The places the profile holds. Read only while the sheet is open: it is a
  // member's own record and there is no reason to ask for it behind a closed
  // sheet, and none to hold it stale either.
  const savedPlaces = useSavedPlaces(visible);
  const writing = useSavePlace();
  const activeLocation = getActiveLocation(store);

  const [searchQuery, setSearchQuery] = useState('');
  // Google places (14 Oct 2026): any country, town or district in the world.
  // The sheet searched the platform's own place list, which only ever covered
  // the countries it was loaded with.
  const [searchResults, setSearchResults] = useState<AddressSuggestion[]>([]);
  const [attribution, setAttribution] = useState<string | null>(null);
  const session = React.useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A search that failed is not a search that found nothing. Both said "No
  // locations found", so a dropped connection looked like a missing city.
  const [searchFailed, setSearchFailed] = useState(false);
  const [gpsDetecting, setGpsDetecting] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const { showToast } = useNotification();

  // Search Autocomplete effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      setSearchFailed(false);
      try {
        session.current ??= newIdempotencyKey();
        const page = await suggestAddresses({
          text: searchQuery,
          sessionToken: session.current,
          regionsOnly: true,
        });
        setSearchResults(page.status === 'Success' ? page.suggestions : []);
        setAttribution(page.attribution);
        setSearchFailed(page.status !== 'Success');
      } catch (err) {
        console.error('Failed to search locations', err);
        setSearchResults([]);
        setSearchFailed(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  /** A saved or recent place, already a location. */
  const chooseSaved = (loc: PlatformLocation) => {
    store.setCurrentLocation(loc);
    setSearchQuery('');
    onClose();
  };

  /** The picked place, looked up for its country, town and coordinates. */
  const handleSelect = async (suggestion: AddressSuggestion) => {
    const token = session.current ?? newIdempotencyKey();
    session.current = null;
    setLoading(true);
    try {
      const answer = await resolveAddress({ placeId: suggestion.placeId, sessionToken: token });
      const place = answer.place;
      if (!place || !place.countryCode) {
        setSearchFailed(true);
        return;
      }
      const country = countryByCode(place.countryCode);
      const town = place.locality ?? '';
      const location: PlatformLocation = {
        countryCode: place.countryCode.toUpperCase(),
        countryName: country?.name ?? place.countryCode,
        flag: country?.flag ?? '🌍',
        cityName: town,
        neighborhood: '',
        latitude: place.latitude,
        longitude: place.longitude,
        displayName: [suggestion.mainText, suggestion.secondaryText].filter(Boolean).join(', '),
        // A country picked as a country is the whole country; anything smaller is an area.
        precision: town || suggestion.secondaryText ? 'area' : 'country',
      };
      store.setCurrentLocation(location);
      setSearchQuery('');
      onClose();
    } catch {
      setSearchFailed(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ── Why this reads the return value ─────────────────────────────────────
   *
   * `detectLocation` **returns `null`** when the member declined the permission
   * or the fix failed — it does not throw. So the `catch` below used to be
   * unreachable: `gpsError` could never be set, `onClose()` ran unconditionally,
   * and the sheet shut with the location unchanged.
   *
   * That was observed on a release build: a member in Port Louis pressed "Use
   * GPS Location", watched the spinner run, and got the sheet closing on
   * "Peckham, London" with no message of any kind. The failure was invisible.
   *
   * A refusal and a failed fix need different words — one is a permission the
   * member can grant, the other is not their doing — and `permissionStatus`
   * carries which it was.
   */
  const handleGPSDetect = async () => {
    setGpsDetecting(true);
    setGpsError(null);
    try {
      // `prompt`: the member pressed the button, so Android may be asked.
      const located = await store.detectLocation({ prompt: true });

      if (!located) {
        setGpsError(
          useLocationStore.getState().permissionStatus === 'denied'
            ? 'Diaspora does not have permission to use your location. You can grant it in Settings, or search for your area below.'
            : 'Your location could not be determined. Check that location is switched on, or search for your area below.'
        );
        return;
      }

      // Say what changed (13 Oct 2026). The sheet used to close on success with
      // no word of any kind, so a member could not tell whether pressing the
      // button had done anything — or whether it was worth pressing at all.
      showToast({
        type: 'success',
        title: 'Location updated',
        message: store.travelMode
          ? `Your home location is now ${locationLabel(located)}. Travel mode is on, so the app still shows ${locationLabel(store.travelLocation)}.`
          : `Showing services around ${locationLabel(located)}.`,
      });
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
                  {locationLabel(activeLocation)}
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
              {/* Android shows its permission dialog only so many times; after
                  that, Settings is the only way to grant it. */}
              {useLocationStore.getState().permissionStatus === 'denied' ? (
                <TouchableOpacity
                  onPress={() => {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
                    const { resolveLocationPermissionProvider } = require('@/lib/maps/providers/device-location');
                    void resolveLocationPermissionProvider().openSettings();
                  }}
                  accessibilityRole="button"
                  className="ml-2 bg-surface-card px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-xs font-black text-error-default">Open Settings</Text>
                </TouchableOpacity>
              ) : null}
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
                <Text className="text-xs font-bold text-content-faint mt-2">Searching places...</Text>
              </View>
            ) : searchQuery.length > 0 ? (
              // Search Results
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.placeId}
                ListFooterComponent={
                  attribution && searchResults.length > 0 ? (
                    <Text className="text-[10px] text-content-faint px-2 pt-2">Powered by {attribution}</Text>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => void handleSelect(item)}
                    className="flex-row items-center py-4 border-b border-faint active:bg-surface-background px-2"
                  >
                    <Text className="text-2xl mr-4">📍</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-extrabold text-content-primary leading-snug">
                        {item.mainText || item.text}
                      </Text>
                      {item.secondaryText ? (
                        <Text className="text-xs text-content-muted font-semibold mt-0.5">{item.secondaryText}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  searchFailed ? (
                    <View className="p-8 items-center justify-center">
                      <Text className="text-5xl mb-3">📡</Text>
                      <Text className="text-sm font-bold text-content-primary">Search did not go through</Text>
                      <Text className="text-xs text-content-muted text-center mt-1 leading-relaxed max-w-[240px]">
                        Place search is not available just now. Check your connection and try again, or use your GPS location above.
                      </Text>
                    </View>
                  ) : (
                  <View className="p-8 items-center justify-center">
                    <Text className="text-5xl mb-3">📍</Text>
                    <Text className="text-sm font-bold text-content-primary">No locations found</Text>
                    <Text className="text-xs text-content-muted text-center mt-1 leading-relaxed max-w-[220px]">
                      We couldn't find matches for "{searchQuery}". Try searching for major cities or countries.
                    </Text>
                  </View>
                  )
                }
              />
            ) : (
              // Default lists (Saved & Recents)
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Saved Locations */}
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5 mt-2">Saved Locations</Text>
                
                {/* ── Kept by the platform since 16 Sep 2026 ──────────────────
                    These rows were an in-memory record with no persistence of
                    any kind: a saved Home was gone when the app restarted, and
                    had never existed on another device. They are now the saved
                    places the profile holds, through the routes that were there
                    all along. */}
                {savedPlaces.isError ? (
                  <View className="py-3 border-b border-faint">
                    <Text className="text-xs text-content-muted font-semibold">
                      We could not read your saved places just now, so they are not shown. Nothing
                      has been forgotten.
                    </Text>
                    <TouchableOpacity onPress={savedPlaces.refetch} className="mt-2">
                      <Text className="text-xs font-black text-primary-600 uppercase">Try again</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {!savedPlaces.isError &&
                  DEFAULT_SAVED_LABELS.map((key) => {
                    const place = savedPlaces.byLabel[key.toLowerCase()] ?? null;
                    const loc = place?.location ?? null;
                    const busy = writing.pendingLabel?.toLowerCase() === key.toLowerCase();

                    return (
                      <View key={key} className="flex-row items-center justify-between py-3 border-b border-faint">
                        <TouchableOpacity
                          onPress={() => loc && chooseSaved(loc)}
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
                              {savedPlaces.isLoading
                                ? 'Loading…'
                                : loc
                                  ? locationLabel(loc)
                                  : 'Not configured'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {busy ? (
                          <ActivityIndicator size="small" />
                        ) : loc ? (
                          <TouchableOpacity
                            onPress={() => void writing.forget(key)}
                            accessibilityRole="button"
                            accessibilityLabel={`Forget your saved ${key}`}
                            className="p-1 active:opacity-60"
                          >
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => void writing.save(key, activeLocation)}
                            accessibilityRole="button"
                            accessibilityLabel={`Save where you are now as ${key}`}
                            className="bg-surface-muted border border-subtle px-3 py-1.5 rounded-lg active:bg-subtle"
                          >
                            <Text className="text-[10px] font-black text-content-secondary uppercase">SAVE ACTIVE</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                {writing.isError ? (
                  <Text className="text-xs text-content-muted font-semibold py-2">
                    That change could not be saved, so nothing has changed. Try again.
                  </Text>
                ) : null}

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
                        onPress={() => chooseSaved(item)}
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

