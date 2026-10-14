import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { useTheme } from '@/design-system';
import { useNotification } from '@/providers/notification-provider';
import { apiClient } from '@/lib/apiClient';
import {
  buildReviewRequest,
  describeReviewFailure,
  type ReviewSubject,
} from '@/lib/reviews/write-target';
import { backOr } from '@/lib/navigation';

const MAX_LENGTH = 500;

export default function WriteReviewScreen() {
  const queryClient = useQueryClient();
  const { tokens } = useTheme();
  // `listingId` is the original provider-only parameter and is kept so existing
  // links still work. `subject` widens the screen to the two review routes that
  // shipped with the ratings work; without it, both were unreachable — the
  // routes existed, were tested, and no screen could produce a rating.
  const params = useLocalSearchParams<{
    listingId?: string;
    subject?: ReviewSubject;
    subjectId?: string;
    reservationId?: string;
  }>();
  const subject: ReviewSubject = params.subject ?? 'provider';
  const subjectId = params.subjectId ?? params.listingId;
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
  /**
   * The request, or the reason there cannot be one — computed while the member
   * is still looking at the form.
   *
   * <p>
   * This lived inside `handleSubmit`, under a comment observing that a missing
   * reservation "is knowable here, and discovering it at submit time means
   * having already taken the member's words for a review that cannot be
   * delivered". It is knowable earlier than that: `buildReviewRequest` is pure
   * and reads nothing that a tap changes, so somebody with no completed
   * transaction is now told before they write the review rather than after.
   * </p>
   */
  const built = useMemo(
    () =>
      buildReviewRequest({
        subject,
        subjectId,
        reservationId: params.reservationId,
        rating,
        body,
      }),
    [subject, subjectId, params.reservationId, rating, body]
  );

  const handleSubmit = async () => {
    if (built.refusal) return;

    setIsSubmitting(true);
    try {
      await apiClient.post(built.request.path, built.request.body);
      // The page the member came from shows the rating and the reviews; it
      // kept its cached copy until they left and came back (14 Oct 2026).
      void queryClient.invalidateQueries();

      showAlert({
        type: 'success',
        title: 'Review submitted',
        message: 'Thank you for your feedback.',
        buttons: [{ text: 'OK', onPress: () => backOr() }],
      });
    } catch (cause: any) {
      // The server's own refusal, in the member's terms. The gate is a rule
      // rather than a fault, and flattening it into "something went wrong"
      // hides the one thing they could act on.
      const payload = cause?.response?.data;
      const described = describeReviewFailure(payload?.code, payload?.detail);
      showAlert({ type: 'error', title: described.title, message: described.message });
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
          {/* The reason, rather than a grey button. A rating of none is the
              common one; the others are a review nobody could file. */}
          {built.refusal ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">
              {built.refusal.message}
            </Text>
          ) : null}

          <Button
            label={isSubmitting ? 'Submitting…' : 'Submit Review'}
            onPress={handleSubmit}
            disabled={built.refusal !== undefined || isSubmitting}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
