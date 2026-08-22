import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { useTheme } from '@/design-system';
import { useNotification } from '@/providers/notification-provider';
import { apiClient } from '@/lib/apiClient';

const MAX_LENGTH = 500;

export default function WriteReviewScreen() {
  const { tokens } = useTheme();
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { showAlert } = useNotification();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Remediation Wave B′.
   *
   * This screen collected a rating and a review, said "Review submitted!", and
   * sent nothing. `POST /api/v1/providers/{providerId}/reviews` takes
   * `{ rating, title?, body?, serviceId? }` with the rating bounded 1–5 —
   * which is exactly what this form gathers.
   *
   * The route is idempotent in a useful way: writing twice revises the existing
   * review rather than creating a second one, within the server's edit window.
   * So a retry after a failed submit is safe.
   */
  const handleSubmit = async () => {
    if (rating === 0) {
      showAlert({ type: 'error', title: 'Rating required', message: 'Please select a star rating.' });
      return;
    }

    if (!listingId) {
      showAlert({
        type: 'error',
        title: 'Nothing to review',
        message: 'We do not know which provider this review is for.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post(`/providers/${encodeURIComponent(listingId)}/reviews`, {
        rating,
        body: body.trim() || undefined,
      });

      showAlert({
        type: 'success',
        title: 'Review submitted',
        message: 'Thank you for your feedback.',
        buttons: [{ text: 'OK', onPress: () => router.back() }],
      });
    } catch {
      showAlert({
        type: 'error',
        title: 'Review not submitted',
        message: 'We could not save your review. Please check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Write a Review" />

      {/* Was a fixed View: with the keyboard up on a short device the review
          field and the submit button were both off-screen with no way to
          scroll to them. */}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16 }}
      >
        <Text className="text-base text-content-secondary mb-4">
          How would you rate your experience?
        </Text>

        <View
          className="flex-row justify-center mb-8"
          accessibilityRole="radiogroup"
          accessibilityLabel="Star rating"
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              className="mx-2 items-center justify-center"
              // The stars were bare "★" glyphs: a screen reader read five
              // identical characters and gave no way to tell or set the score.
              accessibilityRole="radio"
              accessibilityLabel={`${star} ${star === 1 ? 'star' : 'stars'}`}
              accessibilityState={{ checked: rating === star, selected: rating === star }}
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <Text
                className={`text-4xl ${star <= rating ? 'text-warning-default' : 'text-subtle'}`}
              >
                ★
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-sm font-medium text-content-muted mb-2">Your review (optional)</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Tell others about your experience..."
          placeholderTextColor={tokens.color.text.placeholder}
          accessibilityLabel="Your review"
          multiline
          numberOfLines={5}
          maxLength={MAX_LENGTH}
          className="bg-surface-background rounded-xl p-4 text-base text-content-primary h-32"
          textAlignVertical="top"
        />
        <Text
          className="text-xs text-content-muted mt-1 text-right"
          accessibilityLabel={`${body.length} of ${MAX_LENGTH} characters used`}
        >
          {body.length}/{MAX_LENGTH}
        </Text>

        <View className="py-6">
          <Button
            label={isSubmitting ? 'Submitting…' : 'Submit Review'}
            onPress={handleSubmit}
            disabled={rating === 0 || isSubmitting}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
