import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, BackHandler, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { useLocationStore } from '@/store/location';
import { mockCountries } from '@/mocks/data';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function EligibilityErrorScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const params = useLocalSearchParams<{
    errorType: 'origin_match' | 'location_mismatch';
    originCountryName?: string;
    residenceCountryName?: string;
    detectedCountryName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    originCountryCode?: string;
  }>();

  const locationStore = useLocationStore();
  const [detectedLoc, setDetectedLoc] = useState(locationStore.currentLocation.countryName);
  const [showDevOverrides, setShowDevOverrides] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    // Simulate re-detection delay
    setTimeout(() => {
      setIsRetrying(false);
      const updatedDetected = useLocationStore.getState().currentLocation.countryName;
      setDetectedLoc(updatedDetected);

      // Re-run checks
      if (params.residenceCountryName?.trim().toLowerCase() === updatedDetected.trim().toLowerCase()) {
        // Successful retry! Go to enable location screen
        router.replace({
          pathname: '/(auth)/enable-location',
          params: {
            fullName: params.fullName,
            email: params.email,
            phone: params.phone,
            originCountryCode: params.originCountryCode,
            originCountryName: params.originCountryName,
            residenceCountryName: params.residenceCountryName,
          },
        });
      }
    }, 1000);
  };

  const handleDevOverride = (countryName: string, countryCode: string, flag: string) => {
    locationStore.setCurrentLocation({
      countryCode,
      countryName,
      flag,
      cityName: 'Simulated City',
      neighborhood: 'Simulated Neighborhood',
      latitude: 0,
      longitude: 0,
    });
    setDetectedLoc(countryName);
  };

  const handleCloseApp = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    } else {
      // iOS / Web fallback: Go to welcome screen
      router.replace('/(auth)');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-card justify-between">
      <ScrollView className="flex-1 p-6" contentContainerStyle={{ justifyContent: 'center', minHeight: '90%', paddingBottom: bottomInset }}>
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-error-surface items-center justify-center mb-6">
            <Text className="text-4xl">⚠️</Text>
          </View>

          {params.errorType === 'origin_match' ? (
            <>
              <Text className="text-2xl font-black text-content-primary text-center mb-4 tracking-tight">
                Not Eligible for Diaspora
              </Text>
              <Text className="text-sm text-content-muted text-center leading-relaxed mb-6">
                Diaspora is built specifically to support individuals living abroad outside their country of origin.
              </Text>
              
              <View className="bg-surface-background border border-faint rounded-3xl p-5 w-full mb-6">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Verification Details</Text>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-content-tertiary font-semibold">Origin Country:</Text>
                  <Text className="text-xs font-bold text-content-strong">{params.originCountryName}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-content-tertiary font-semibold">Residence Country:</Text>
                  <Text className="text-xs font-bold text-content-strong">{params.residenceCountryName}</Text>
                </View>
              </View>

              <Text className="text-xs text-content-faint text-center leading-relaxed">
                If you made a mistake during onboarding, please review your registration details.
              </Text>
            </>
          ) : (
            <>
              <Text className="text-2xl font-black text-content-primary text-center mb-4 tracking-tight">
                Residency Verification Failed
              </Text>
              <Text className="text-sm text-content-muted text-center leading-relaxed mb-6">
                To prevent false profiles and spam listing behaviors, Diaspora requires matching physical GPS telemetry with your declared residence.
              </Text>

              <View className="bg-surface-background border border-faint rounded-3xl p-5 w-full mb-6">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Location Mismatch Details</Text>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-content-tertiary font-semibold">Selected Residence:</Text>
                  <Text className="text-xs font-bold text-content-strong">{params.residenceCountryName}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-content-tertiary font-semibold">Detected Location:</Text>
                  <Text className="text-xs font-bold text-error-default">{detectedLoc}</Text>
                </View>
              </View>

              <Text className="text-xs text-content-faint text-center leading-relaxed">
                Please turn on precise location permissions or retry if you are currently inside your residency country.
              </Text>
            </>
          )}
        </View>

        {/* Action Group */}
        <View className="gap-3 mb-6">
          {params.errorType === 'location_mismatch' && (
            <Button
              label={isRetrying ? 'Re-detecting location...' : 'Retry Verification (GPS)'}
              variant="primary"
              disabled={isRetrying}
              onPress={handleRetry}
            />
          )}

          <Button
            label="Review Eligibility Details"
            variant="outline"
            onPress={() => router.back()}
          />

          <Button
            label="Exit Application"
            variant="ghost"
            onPress={handleCloseApp}
          />
        </View>

        {/* Developer Sandbox Coordinates override Panel (strict __DEV__ guard) */}
        {__DEV__ && (
          <View className="border-t border-subtle pt-6 mt-4">
            <TouchableOpacity
              onPress={() => setShowDevOverrides(!showDevOverrides)}
              className="bg-surface-muted rounded-xl py-3 px-4 flex-row justify-between items-center"
            >
              <Text className="text-xs font-extrabold text-content-tertiary">🛠️ Developer Sandbox Spoof Controls</Text>
              <Text className="text-xs text-content-muted">{showDevOverrides ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showDevOverrides && (
              <View className="bg-surface-background rounded-2xl p-4 mt-3 border border-subtle">
                <Text className="text-[10px] font-black text-content-faint uppercase tracking-wider mb-3">
                  Force GPS Coordinates (Testing Only)
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[
                    { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' },
                    { name: 'Mauritius', code: 'MU', flag: '🇲🇺' },
                    { name: 'Canada', code: 'CA', flag: '🇨🇦' },
                    { name: 'Nigeria', code: 'NG', flag: '🇳🇬' },
                  ].map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      onPress={() => handleDevOverride(c.name, c.code, c.flag)}
                      className={`px-3 py-2 rounded-lg border ${
                        detectedLoc === c.name
                          ? 'bg-primary-50 border-primary-500'
                          : 'bg-surface-card border-subtle'
                      }`}
                    >
                      <Text className="text-xs font-bold text-content-secondary">
                        {c.flag} {c.code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-[9px] text-content-faint mt-3 leading-relaxed">
                  *Selecting a simulated country updates locationStore instantly. Press "Retry Verification" above to check compliance after overrides.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
