import React from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/store/auth';
import { useTrustStore } from '@/store/trust';

export default function EnableLocationScreen() {
  const params = useLocalSearchParams<{
    fullName: string;
    email: string;
    phone: string;
    originCountryCode: string;
    originCountryName: string;
    residenceCountryCode: string;
    residenceCountryName: string;
  }>();

  const handleComplete = () => {
    // 1. Log in the user with initial info
    useAuthStore.getState().login({
      userId: 'user-123',
      fullName: params.fullName || 'Amara Kone',
      role: 'Member', // Diaspora Member default role
      accountState: 'LimitedAccess',
    }, 'mock_access_token');

    // 2. Setup initial country timeline and membership details
    useTrustStore.setState((state) => {
      const now = new Date();
      const currentYear = now.getFullYear();

      const initialTimeline = [
        {
          countryCode: params.residenceCountryCode || 'GB',
          countryName: params.residenceCountryName || 'United Kingdom',
          flag: '📍',
          startYear: currentYear,
          endYear: null,
          isVerified: false, // Initial state is unverified until they submit documents
          role: 'Diaspora Member',
        }
      ];

      const initialRep = [
        {
          countryCode: params.residenceCountryCode || 'GB',
          countryName: params.residenceCountryName || 'United Kingdom',
          flag: '📍',
          points: 10, // Initial welcome points
          level: 'Member' as const,
          stars: 3,
        }
      ];

      const initialJourney = [
        {
          eventId: `je-${Date.now()}`,
          type: 'Join',
          label: 'Joined Diaspora',
          timestamp: now.toISOString().split('T')[0],
          icon: '👋',
          description: `Created account. Declared origin country: ${params.originCountryName || 'Nigeria'}, current residence: ${params.residenceCountryName || 'United Kingdom'}.`,
        },
        {
          eventId: `je-phone-${Date.now()}`,
          type: 'Phone',
          label: 'Phone Verified',
          timestamp: now.toISOString().split('T')[0],
          icon: '📱',
          description: 'Linked and validated mobile phone.',
        }
      ];

      return {
        verifications: {
          ...state.verifications,
          Phone: 'Approved',
          Country: 'Pending', // document submission pending
          Identity: 'Pending',
        },
        experienceTimeline: initialTimeline,
        countryReputations: initialRep,
        trustJourney: initialJourney,
      };
    });

    router.replace('/access-gateway');
  };

  return (
    <SafeAreaView className="flex-1 bg-white justify-between">
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-28 h-28 rounded-full bg-primary-50 items-center justify-center mb-8">
          <Text className="text-5xl">📍</Text>
        </View>

        <Text className="text-2xl font-bold text-neutral-900 text-center mb-4">
          Enable Location
        </Text>
        <Text className="text-base text-neutral-500 text-center leading-relaxed">
          Allow location access to discover services near you. We use this to verify your residency boundaries.
        </Text>
      </View>

      <View className="px-6 pb-6">
        <Button
          label="Enable Location & Enter"
          variant="primary"
          onPress={handleComplete}
        />
        <Button
          label="Not now"
          variant="ghost"
          className="mt-2"
          onPress={handleComplete}
        />
      </View>
    </SafeAreaView>
  );
}
