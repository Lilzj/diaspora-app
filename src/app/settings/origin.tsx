import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { allCountries } from '@/mocks/countries';

export default function OriginSettingsScreen() {
  const [selected, setSelected] = useState('CI');

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScreenHeader title="Origin Country" />
      <FlatList
        data={allCountries}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item.code)}
            className="flex-row items-center py-4 border-b border-neutral-100"
          >
            <Text className="text-2xl mr-3">{item.flag}</Text>
            <Text className="text-base flex-1 text-neutral-900">{item.name}</Text>
            {selected === item.code && <Text className="text-primary-500 text-xl">✓</Text>}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
