import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { SavedCollection } from '@/types/saved';
import { router } from 'expo-router';

interface SavedCollectionCardProps {
  collection: SavedCollection;
}

export function SavedCollectionCard({ collection }: SavedCollectionCardProps) {
  const handlePress = () => {
    if (collection.isAvailable) {
      router.push(`/saved/${collection.contentType}`);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={!collection.isAvailable}
      activeOpacity={0.8}
      className={`bg-white rounded-xl p-4 mb-3 ${!collection.isAvailable ? 'opacity-50' : ''}`}
      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="text-2xl mr-3">{collection.icon}</Text>
          <View>
            <Text className="text-base font-semibold text-neutral-900">{collection.label}</Text>
            {collection.isAvailable ? (
              <Text className="text-sm text-neutral-500">{collection.count} saved</Text>
            ) : (
              <Text className="text-sm text-neutral-400">Coming Soon</Text>
            )}
          </View>
        </View>
        {collection.isAvailable ? (
          <Text className="text-neutral-300 text-lg">›</Text>
        ) : (
          <Text className="text-xs text-neutral-400">🔒</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
