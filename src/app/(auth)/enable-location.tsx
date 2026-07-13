import React from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';

export default function EnableLocationScreen() {
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
          Allow location access to discover services near you. You can always change your location manually.
        </Text>
      </View>

      <View className="px-6 pb-6">
        <Button
          label="Enable Location"
          variant="primary"
          onPress={() => router.replace('/(tabs)')}
        />
        <Button
          label="Not now"
          variant="ghost"
          className="mt-2"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </SafeAreaView>
  );
}
