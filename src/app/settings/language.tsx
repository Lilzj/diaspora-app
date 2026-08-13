import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { mockLanguages } from '@/mocks/data';

export default function LanguageSettingsScreen() {
  const [selected, setSelected] = useState('en');

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Language" />
      <FlatList
        data={mockLanguages}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item.code)}
            className="flex-row items-center py-4 border-b border-faint"
          >
            <Text className="text-base flex-1 text-content-primary">{item.name}</Text>
            {selected === item.code && <Text className="text-primary-500 text-xl">✓</Text>}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
