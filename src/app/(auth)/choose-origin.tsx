import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { SearchBar } from '@/components/SearchBar';
import { mockCountries } from '@/mocks/data';

export default function ChooseOriginScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = mockCountries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScreenHeader title="Country of Origin" />

      <View className="px-6 mb-4">
        <Text className="text-neutral-500 text-base mb-4">
          Where are you originally from? This helps us personalise your experience.
        </Text>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search countries..."
          editable
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingHorizontal: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item.code)}
            className={`flex-row items-center py-4 px-4 rounded-xl mb-2 ${
              selected === item.code ? 'bg-primary-50 border-2 border-primary-500' : 'bg-neutral-50'
            }`}
          >
            <Text className="text-2xl mr-3">{item.flag}</Text>
            <Text className="text-base flex-1 text-neutral-900 font-medium">{item.name}</Text>
            {selected === item.code && <Text className="text-primary-500 text-xl">✓</Text>}
          </TouchableOpacity>
        )}
      />

      <View className="px-6 py-6">
        <Button
          label="Continue"
          disabled={!selected}
          onPress={() => router.push('/(auth)/choose-country')}
        />
      </View>
    </SafeAreaView>
  );
}
