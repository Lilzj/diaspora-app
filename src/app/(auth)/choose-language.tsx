import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { mockLanguages } from '@/mocks/data';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function ChooseLanguageScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const [selected, setSelected] = useState('en');

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Choose Language" />

      <View className="px-6 mb-4">
        <Text className="text-content-muted text-base">
          Select your preferred language. You can change this later in settings.
        </Text>
      </View>

      <FlatList
        data={mockLanguages}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: bottomInset }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item.code)}
            className={`flex-row items-center py-4 px-4 rounded-xl mb-2 ${
              selected === item.code ? 'bg-primary-50 border-2 border-primary-500' : 'bg-surface-background'
            }`}
          >
            <Text className="text-base flex-1 text-content-primary font-medium">{item.name}</Text>
            {selected === item.code && <Text className="text-primary-500 text-xl">✓</Text>}
          </TouchableOpacity>
        )}
      />

      <View className="px-6 py-6">
        <Button label="Continue" onPress={() => router.push('/(auth)/choose-origin')} />
      </View>
    </SafeAreaView>
  );
}
