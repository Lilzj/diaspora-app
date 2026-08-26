import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { SearchBar } from '@/components/SearchBar';
import { allCountries } from '@/mocks/countries';
import { detectCountry, type CountryDetection } from '@/lib/location/detect-country';
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

  // Held from the effect below rather than asked for again on Continue. A fix
  // takes several seconds, and re-running it under the button would stall the
  // one tap the member is waiting on — for an answer we already have.
  const [detection, setDetection] = useState<CountryDetection | null>(null);

  useEffect(() => {
    // ── This used to post the member's IP to ipapi.co ────────────────────────
    //
    // Every prospective member's address went to an unvetted third party during
    // registration — no agreement, no rate limit, nothing cached. The backend's
    // own `CatalogGeocodingProvider` calls the practice out by name.
    //
    // The device already knows, and `detectCountry` asks it without anything
    // leaving the handset. The answer pre-selects the picker; it does not
    // decide for the member, who can pick any of the 190 rows below.
    let cancelled = false;

    detectCountry()
      .then((result) => {
        if (cancelled) return;

        setDetection(result);
        if (result.status !== 'detected') return;

        const match = allCountries.find((c) => c.code.toUpperCase() === result.countryCode);

        if (match) setSelected(match.code);
      })
      .finally(() => {
        if (!cancelled) setIsDetecting(false);
      });

    return () => {
      cancelled = true;
    };
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

    // ── 2. Does the device agree about the country? ─────────────────────────
    //
    // Two changes from what was here.
    //
    // **It compares ISO codes.** It used to compare display names, so a device
    // set to French would have measured "Royaume-Uni" against "United Kingdom"
    // and refused a member standing in London.
    //
    // **It only refuses on a genuine disagreement.** `detectCountry` answers
    // `permission-denied` or `unavailable` when the device could not say, and
    // neither is evidence about where the member is. Sending those to
    // `eligibility-error` — which is what comparing against a default location
    // did — accuses somebody of misstating their residence on the strength of a
    // declined permission.
    //
    // A member who declines therefore registers. That is deliberate: this check
    // is a signal, not the platform's residence proof. `/verification/country`
    // takes documents, and the Trust Centre presents that separately.
    const disagrees =
      detection?.status === 'detected' &&
      detection.countryCode !== residenceCountry.code.toUpperCase();

    if (disagrees) {
      router.push({
        pathname: '/(auth)/eligibility-error',
        params: {
          errorType: 'location_mismatch',
          originCountryName: params.originCountryName || 'Origin Country',
          residenceCountryName: residenceCountry.name,
          detectedCountryName:
            detection?.status === 'detected'
              ? (allCountries.find((c) => c.code.toUpperCase() === detection.countryCode)?.name ??
                 detection.countryName ??
                 detection.countryCode)
              : '',
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
