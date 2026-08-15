import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ReviewCard } from '@/components/ReviewCard';
import { EmptyState } from '@/components/EmptyState';
import { mockReviews } from '@/mocks/data';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function MyReviewsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="My Reviews" />

      {mockReviews.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="No reviews written"
          description="When you review a provider, your reviews will appear here."
        />
      ) : (
        <FlatList
          data={mockReviews}
          keyExtractor={(item) => item.reviewId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          renderItem={({ item }) => (
            <ReviewCard
              reviewerName={item.reviewerName}
              rating={item.rating}
              body={item.body}
              date={new Date(item.createdAt).toLocaleDateString()}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
