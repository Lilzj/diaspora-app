import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useNotification } from '@/providers/notification-provider';

export default function WriteReviewScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { showAlert } = useNotification();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');

  const handleSubmit = () => {
    if (rating === 0) {
      showAlert({ type: 'error', title: 'Rating required', message: 'Please select a star rating.' });
      return;
    }
    showAlert({
      type: 'success',
      title: 'Review submitted!',
      message: 'Thank you for your feedback.',
      buttons: [
        { text: 'OK', onPress: () => router.back() }
      ]
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScreenHeader title="Write a Review" />

      <View className="flex-1 px-6 pt-4">
        <Text className="text-base text-neutral-700 mb-4">
          How would you rate your experience?
        </Text>

        {/* Star selector */}
        <View className="flex-row justify-center mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              className="mx-2"
            >
              <Text className={`text-4xl ${star <= rating ? 'text-warning-default' : 'text-neutral-200'}`}>
                ★
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-sm font-medium text-neutral-500 mb-2">
          Your review (optional)
        </Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Tell others about your experience..."
          placeholderTextColor="#9BA3B8"
          multiline
          numberOfLines={5}
          maxLength={500}
          className="bg-neutral-50 rounded-xl p-4 text-base text-neutral-900 h-32"
          textAlignVertical="top"
        />
        <Text className="text-xs text-neutral-400 mt-1 text-right">{body.length}/500</Text>
      </View>

      <View className="px-6 py-6">
        <Button label="Submit Review" onPress={handleSubmit} disabled={rating === 0} />
      </View>
    </SafeAreaView>
  );
}
