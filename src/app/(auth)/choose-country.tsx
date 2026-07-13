import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { SearchBar } from '@/components/SearchBar';
import { mockCountries } from '@/mocks/data';

export default function ChooseCountryScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isDetecting, setIsDetecting] = useState(true);

  useEffect(() => {
    // Attempt to auto-detect country based on IP
    fetch('https://ipapi.co/json/')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.country_code) {
          // Check if detected country is in our supported list
          const match = mockCountries.find(
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

  const filtered = mockCountries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScreenHeader title="Where do you live?" />

      <View className="px-6 mb-4">
        <Text className="text-neutral-500 text-base mb-4">
          Select the country you currently live in so we can show you relevant services.
        </Text>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search countries..."
          editable
        />
        
        {isDetecting && (
          <View className="flex-row items-center mt-4 bg-neutral-50 p-3 rounded-xl">
            <ActivityIndicator size="small" color="#F59300" className="mr-3" />
            <Text className="text-neutral-600 text-sm">Detecting your location...</Text>
          </View>
        )}
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
            <View className="flex-1">
              <Text className="text-base text-neutral-900 font-medium">{item.name}</Text>
            </View>
            {selected === item.code && (
              <View className="flex-row items-center">
                <Text className="text-xs text-primary-600 bg-primary-100 px-2 py-1 rounded-full mr-2 font-medium">
                  📍 Auto-detected
                </Text>
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
          onPress={() => router.push('/(auth)/enable-location')}
        />
      </View>
    </SafeAreaView>
  );
}
