// ─────────────────────────────────────────────────────────────────────────────
// My Reviews
//
// ── What this screen used to do ─────────────────────────────────────────────
//
//     import { mockReviews } from '@/mocks/data';
//     …
//     <ScrollEndFlatList data={mockReviews} … />
//
// Every member on the platform opened "My Reviews" and saw the *same* handful of
// fabricated reviews, presented as things they had written. Not a shared feed —
// their own authorship, attributed to them, about businesses they had never
// visited. A member could open this screen, fail to recognise a single word of
// it, and reasonably conclude their account had been compromised.
//
// ── Two different capabilities, and only one of them exists ─────────────────
//
// This header used to say, correctly, that **there is no route that lists the
// reviews a member has written**: the only review routes were
// `GET|POST /providers/{providerId:guid}/reviews`, both keyed by the provider.
// No `ListMyReviewsQuery`, no `/reviews/mine`, no author-scoped review query of
// any kind. Reconstructing the list client-side would mean reading every
// provider's reviews and filtering by reviewer id, which is not a feature, it is
// a scrape.
//
// **That is still true, and it is still the headline of this screen.**
//
// What changed is the other half. `GET /providers/me` and
// `GET /providers/me/reviews` now exist, so a member who *runs* a business can
// see the reviews left **on** it. The per-provider route worked the whole time;
// nothing mapped a member to the provider they own, so the client had no id to
// put in it, and the creator surface said "Diaspora cannot list your reviews
// yet" for a capability that was one endpoint away.
//
// The two are easy to conflate and this screen must not:
//
//   reviews you WROTE      author-scoped     no route      still absent
//   reviews OF your business  provider-scoped  live         shown below
//
// `providerId` on the page is what distinguishes "nobody has reviewed you yet"
// from "you do not run a business" — an empty `items` array cannot.
//
// A member's own review *is* reachable one at a time: `ProviderViewerState` on
// each provider carries `ownReviewId` and `canEditOwnReview`, and
// `provider/[id].tsx` uses them. That is the honest route into the same content,
// so it is what this screen offers for the half that is missing.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { ListState } from '@/components/ListState';
import { router } from 'expo-router';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useMyProviderReviews } from '@/hooks/providers';
import { providerKeys } from '@/lib/api/providers-api';

export default function MyReviewsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  // Reviews left *on* the caller's business. Null `providerId` means they run
  // none, which is not an error and not an empty review list either.
  const { page, isLoading, isError } = useMyProviderReviews();
  const runsABusiness = page?.providerId != null;
  const received = page?.items ?? [];

  // "Try again": the reviews hook has no refetch of its own (FARCH-007).
  const queryClient = useQueryClient();
  const retry = () => void queryClient.refetchQueries({ queryKey: providerKeys.myReviews() });

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="My Reviews" />

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: bottomInset, paddingTop: 16 }}
      >
        {/* ── Reviews you wrote — still genuinely unavailable ──────────── */}
        <View className="items-center px-2 py-6">
          <Text className="text-5xl mb-5">⭐</Text>
          <Text className="text-lg font-bold text-content-strong text-center">
            Diaspora cannot list the reviews you have written
          </Text>
          <Text className="text-sm text-content-muted text-center mt-2 leading-relaxed">
            Reviews are stored against the business they are about, and there is no way yet to ask
            for every review you have written. We would rather tell you that than show you a list
            we made up.
          </Text>
          <Text className="text-sm text-content-muted text-center mt-3 leading-relaxed">
            Your review of a business is still there — open that business and you will see it, and
            be able to change it.
          </Text>

          <Button
            label="Find a business"
            variant="outline"
            className="mt-6"
            onPress={() => router.push('/(tabs)/search')}
          />
        </View>

        {/* ── Reviews of your business — this half is live ─────────────── */}
        <View className="border-t border-faint mt-6 pt-6">
          <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">
            Reviews of your business
          </Text>

          {/* Through the shared list state (FARCH-007, 27 Nov 2026). */}
          <ListState
            loading={isLoading}
            loadingLabel="Loading reviews of your business"
            error={
              isError && received.length === 0
                ? { title: 'These could not be loaded just now.', message: 'Nothing is wrong with your business page.' }
                : null
            }
            onRetry={retry}
            // The distinction `providerId` exists to make. Saying "no reviews
            // yet" to somebody who runs no business would be answering a
            // question they never asked.
            isEmpty={!runsABusiness || received.length === 0}
            empty={
              runsABusiness
                ? { icon: 'star-outline', title: 'Nobody has reviewed your business yet.' }
                : {
                    icon: 'storefront-outline',
                    title: 'You do not run a business on Diaspora.',
                    message: 'If you list one, reviews members leave on it will appear here.',
                  }
            }
          >
            {received.map((review) => (
              <View
                key={review.reviewId}
                className="bg-surface-card border border-subtle rounded-2xl p-4 mb-3"
              >
                <Text className="text-sm font-bold text-content-strong">
                  {'★'.repeat(Math.max(0, Math.min(5, Math.round(review.rating))))}
                  <Text className="text-content-faint">{` ${review.rating}/5`}</Text>
                </Text>
                {review.title ? (
                  <Text className="text-sm font-bold text-content-primary mt-1">{review.title}</Text>
                ) : null}
                {review.body ? (
                  <Text className="text-sm text-content-secondary leading-relaxed mt-1">
                    {review.body}
                  </Text>
                ) : null}
              </View>
            ))}
          </ListState>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
