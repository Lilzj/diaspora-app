import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ProviderCard } from '@/components/ProviderCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { mockListings } from '@/mocks/data';
import { router } from 'expo-router';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function MyListingsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  // Simulate that the current user owns listings 1 and 3
  const myListings = [mockListings[0], mockListings[2]];

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="My Listings" />

      {myListings.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No listings yet"
          description="Create your first listing to start reaching customers."
          action={
            <Button
              label="Create Listing"
              size="sm"
              onPress={() => router.push('/(tabs)/post')}
            />
          }
        />
      ) : (
        <FlatList
          data={myListings}
          keyExtractor={(item) => item.listingId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          renderItem={({ item }) => (
            <ProviderCard
              listingId={item.listingId}
              title={item.title}
              category={item.category.name}
              areaName={item.location?.areaName}
              rating={item.rating.average}
              reviewCount={item.rating.totalReviews}
              coverImageUrl={item.coverImageUrl}
              isVerified={item.verificationStatus === 'Verified'}
              variant="list"
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
