import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { SearchBar } from '@/components/SearchBar';
import { allCountries } from '@/mocks/countries';
import { useLocationStore } from '@/store/location';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function ChooseCountryScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const params = useLocalSearchParams<{
    fullName: string;
    email: string;
    originCountryCode: string;
    originCountryName: string;
  }>();

  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isDetecting, setIsDetecting] = useState(true);
  const locationStore = useLocationStore();

  useEffect(() => {
    // Attempt to auto-detect country based on IP
    fetch('https://ipapi.co/json/')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.country_code) {
          // Check if detected country is in our supported list
          const match = allCountries.find(
            (c) => c.code.toUpperCase() === data.country_code.toUpperCase()
          );
          if (match) {
            setSelected(match.code);
          }
        }
      })
      .catch((err) => console.log('Location detection failed', err))
      .finally(() => setIsDetecting(false));
  }, []);

  const filtered = allCountries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleContinue = () => {
    if (!selected) return;
    const residenceCountry = allCountries.find((c) => c.code === selected);
    if (!residenceCountry) return;

    // 1. Eligibility rule: Country of Origin !== Current Country of Residence
    if (params.originCountryCode && params.originCountryCode.toUpperCase() === residenceCountry.code.toUpperCase()) {
      router.push({
        pathname: '/(auth)/eligibility-error',
        params: {
          errorType: 'origin_match',
          originCountryName: params.originCountryName || 'Origin Country',
          residenceCountryName: residenceCountry.name,
        },
      });
      return;
    }

    // 2. Geolocation match checking: Current country of residence must match physical GPS location
    const detectedCountryName = locationStore.currentLocation.countryName;
    const match = residenceCountry.name.trim().toLowerCase() === detectedCountryName.trim().toLowerCase();

    if (!match) {
      router.push({
        pathname: '/(auth)/eligibility-error',
        params: {
          errorType: 'location_mismatch',
          originCountryName: params.originCountryName || 'Origin Country',
          residenceCountryName: residenceCountry.name,
          detectedCountryName: detectedCountryName,
          fullName: params.fullName,
          email: params.email,
          originCountryCode: params.originCountryCode,
          // Carried so the retry path can continue the flow. It used to send
          // only `residenceCountryName`, so a member who fixed their location
          // and retried successfully still arrived at registration without the
          // country code it requires.
          residenceCountryCode: residenceCountry.code,
        },
      });
      return;
    }

    // Pass verification check, go and collect the phone number.
    //
    // This used to jump straight to `enable-location`, which is where
    // `POST /auth/register` is called — and that call needs a phone number no
    // screen in the flow had ever asked for. Every new member reached the last
    // step and was told their phone number was missing, with nothing behind
    // them to fill in. See `phone.tsx`.
    //
    // The residence country goes with them because it fixes the calling code:
    // the number a member registers has to belong to the country they say they
    // live in, or phone verification proves nothing the platform gates on.
    router.push({
      pathname: '/(auth)/phone',
      params: {
        ...params,
        residenceCountryCode: residenceCountry.code,
        residenceCountryName: residenceCountry.name,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Where do you live?" />

      <View className="px-6 mb-4">
        <Text className="text-content-muted text-base mb-4">
          Select the country you currently live in so we can show you relevant services.
        </Text>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search countries..."
          editable
        />
        
        {isDetecting && (
          <View className="flex-row items-center mt-4 bg-surface-background p-3 rounded-xl">
            <ActivityIndicator size="small" color="#F59300" className="mr-3" />
            <Text className="text-content-tertiary text-sm">Detecting your location...</Text>
          </View>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: bottomInset }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item.code)}
            className={`flex-row items-center py-4 px-4 rounded-xl mb-2 ${
              selected === item.code ? 'bg-primary-50 border-2 border-primary-500' : 'bg-surface-background'
            }`}
          >
            <Text className="text-2xl mr-3">{item.flag}</Text>
            <View className="flex-1">
              <Text className="text-base text-content-primary font-medium">{item.name}</Text>
            </View>
            {selected === item.code && (
              <View className="flex-row items-center">
                <Text className="text-primary-500 text-xl">✓</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      <View className="px-6 py-6">
        <Button
          label="Continue"
          disabled={!selected}
          onPress={handleContinue}
        />
      </View>
    </SafeAreaView>
  );
}
