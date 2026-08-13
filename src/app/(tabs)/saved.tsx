import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProviderCard } from '@/components/ProviderCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { mockFavourites } from '@/mocks/data';
import { router } from 'expo-router';

export default function SavedScreen() {
  const savedItems = mockFavourites;

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <View className="px-6 pt-4 pb-3">
        <Text className="text-3xl font-bold text-content-primary">Saved</Text>
      </View>

      {savedItems.length === 0 ? (
        <EmptyState
          icon="🔖"
          title="No saved providers yet"
          description="Tap the heart icon on any provider to save it for later."
          action={
            <Button
              label="Explore Providers"
              variant="primary"
              size="sm"
              onPress={() => router.push('/(tabs)/search')}
            />
          }
        />
      ) : (
        <FlatList
          data={savedItems}
          keyExtractor={(item) => item.listingId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
          renderItem={({ item }) => (
            <ProviderCard
              listingId={item.listingId}
              title={item.title}
              category={item.category.name}
              areaName={item.location?.areaName}
              distanceKm={item.location?.distanceKm}
              rating={item.rating.average}
              reviewCount={item.rating.totalReviews}
              coverImageUrl={item.coverImageUrl}
              isVerified={item.verificationStatus === 'Verified'}
              isOpenNow={item.isOpenNow}
              variant="list"
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
