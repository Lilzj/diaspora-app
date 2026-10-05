// ─────────────────────────────────────────────────────────────────────────────
// Provider profile
//
// ── What this screen used to do ─────────────────────────────────────────────
//
//     const listing = mockListings.find((l) => l.listingId === id) ?? mockListings[0];
//     const reviews = mockReviews.filter((r) => r.listingId === listing.listingId);
//
// The `?? mockListings[0]` was the defect. **Any** id — a real provider's, a
// deleted one's, a typo, a link shared six months ago — rendered a fabricated
// business under whatever name the fixture happened to carry, with a fabricated
// address, fabricated opening hours, fabricated prices, a fabricated "✓ Verified"
// badge and fabricated five-star reviews signed by people who do not exist. The
// "Call" button dialled a number nobody had ever given the platform.
//
// Nothing on the screen distinguished that from a real business, because as far
// as the screen was concerned there was no such thing as a real business. A
// member deciding whether to trust a plumber, a solicitor or a clinic was being
// shown fiction with a verification badge on it.
//
// ── What it does now ────────────────────────────────────────────────────────
//
//   * `GET /providers/{providerId}` (or `/providers/slug/{slug}`) via
//     `useProvider`. See `lib/providers-api.ts` for the contract and where it
//     was read from.
//   * `GET /providers/{providerId}/reviews` via `useProviderReviews`.
//   * **No fallback of any kind.** An id that resolves to nothing renders a
//     not-found panel naming the id. That is the whole point.
//
// ── Three contract facts the layout had to change for ───────────────────────
//
//   1. **Media is a reference, not a URL.** `ProviderMediaResponse` carries a
//      `mediaId`; the bytes come from the Media module. `<ProviderImage>` below
//      resolves one, and renders a neutral placeholder rather than a stock
//      photograph when it cannot.
//   2. **Contact is a list, not a field.** There is no `contact.phone`. There is
//      a `contactMethods` array whose `kind` is a `ContactMethodKind` name, so
//      "Call" is enabled only when a `Phone` method is genuinely present.
//   3. **Ownership comes from the server.** `viewerState.canManage` decides what
//      the owner sees, rather than comparing `owner.providerId` — which was
//      comparing a fixture's field against the signed-in user's id and could
//      only ever be false. `viewerState` is null for an anonymous caller, and
//      absent must never be read as permitted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Linking, Share, ScrollView, Animated, ActivityIndicator } from 'react-native';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { RatingDisplay } from '@/components/RatingDisplay';
import { ReviewCard } from '@/components/ReviewCard';
import { Button } from '@/components/Button';
import { ReportModal } from '@/components/ReportModal';
import { ProviderNotificationModal } from '@/components/ProviderNotificationModal';
import { ConversationHub } from '@/lib/conversation-hub';
import { useNotification } from '@/providers/notification-provider';
import { PromoteEntry } from '@/components/monetization';
import { useMediaAsset } from '@/hooks/media';
import { useProvider, useProviderReviews } from '@/hooks/providers';
import { setProviderBookmark, type Provider, type ProviderMedia } from '@/lib/providers-api';
import { trackContentViewed } from '@/lib/analytics/content-events';
import { backOr } from '@/lib/navigation';

/**
 * One image, resolved from a Media reference.
 *
 * A component rather than a helper because each instance owns a `useMediaAsset`
 * query, and hooks cannot be called in a loop. When the reference dangles it
 * renders a neutral block: a provider with no photograph should look like a
 * provider with no photograph, not like somebody else's shop.
 */
function ProviderImage({
  media,
  width,
  height,
  radius = 0,
  style,
}: {
  media: ProviderMedia | null | undefined;
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: object;
}) {
  const { url } = useMediaAsset(media?.mediaId);

  if (!url) {
    return (
      <View
        className="bg-surface-muted items-center justify-center"
        style={{ width, height, borderRadius: radius, ...style }}
      >
        <Text className="text-3xl opacity-40">🏬</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width, height, borderRadius: radius, ...style }}
      contentFit="cover"
      transition={200}
    />
  );
}

/** The primary phone number, or null. Never a fabricated one. */
function phoneFor(provider: Provider): string | null {
  const methods = provider.contactMethods ?? [];
  const phone =
    methods.find((m) => m.kind === 'Phone' && m.isPrimary) ??
    methods.find((m) => m.kind === 'Phone');

  return phone?.value ?? null;
}

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * One view, counted by the platform.
   *
   * `content.viewed` is registered, client-submittable and had no emitter
   * anywhere — which is why `content.views` reads AWAITING_SOURCE. No
   * throttling here on purpose: the server deduplicates one person per item
   * per day, and a second rule in the client would be a second definition of
   * the same word.
   */
  useEffect(() => {
    trackContentViewed({ contentType: 'provider', contentId: id });
  }, [id]);
  const insets = useSafeAreaInsets();
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(false);
  const bottomOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bottomOffset, {
      toValue: isBottomNavVisible ? 60 + insets.bottom : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [isBottomNavVisible, insets.bottom]);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const { showAlert } = useNotification();

  const { provider, isLoading, isError, isNotFound, refetch } = useProvider(id);
  const { page: reviewPage } = useProviderReviews(provider?.providerId);

  // The saved state the *server* holds, with an optimistic overlay only while a
  // write is in flight. It used to be a bare `useState(false)` that forgot
  // itself on unmount, so the heart filled in and the platform kept no record.
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const [savePending, setSavePending] = useState(false);

  const isSaved = savedOverride ?? provider?.viewerState?.isBookmarked ?? false;

  const handleToggleSave = useCallback(async () => {
    if (!provider || savePending) return;

    const next = !isSaved;
    setSavePending(true);
    setSavedOverride(next);

    try {
      await setProviderBookmark(provider.providerId, next);
    } catch {
      // Roll the control back. Leaving the heart filled would tell the member
      // the platform had saved something it has no record of.
      setSavedOverride(!next);
      showAlert({
        type: 'error',
        title: next ? 'Could not save' : 'Could not remove',
        message: 'That change did not reach the server. Please try again.',
      });
    } finally {
      setSavePending(false);
    }
  }, [isSaved, provider, savePending, showAlert]);

  // ── The states that are not a provider ────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background items-center justify-center">
        <ActivityIndicator />
        <Text className="text-sm text-content-muted mt-4">Loading…</Text>
      </SafeAreaView>
    );
  }

  if (isNotFound || (!provider && !isError)) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">🔍</Text>
          <Text className="text-lg font-bold text-content-strong text-center">
            We could not find this business
          </Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            Nothing on Diaspora matches “{id}”. It may have been removed, or the link may be out of
            date.
          </Text>
          <Button label="Go back" variant="outline" className="mt-6" onPress={() => backOr()} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !provider) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">⚠️</Text>
          <Text className="text-lg font-bold text-content-strong text-center">
            Could not load this business
          </Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            We could not reach Diaspora to load this profile. Nothing here is out of date — there is
            simply nothing to show yet.
          </Text>
          <Button label="Try again" variant="outline" className="mt-6" onPress={refetch} />
        </View>
      </SafeAreaView>
    );
  }

  // ── A real provider ───────────────────────────────────────────────────────

  const isOwner = provider.viewerState?.canManage === true;
  const phone = phoneFor(provider);
  const reviews = reviewPage?.items ?? [];
  const summary = reviewPage?.summary ?? provider.reviewSummary;
  const openHours = (provider.availability?.operatingHours ?? []).filter((h) => h.isSpecified);

  const handleCall = () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This provider listing was posted by you.' });
      return;
    }
    if (!phone) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'No phone number provided by this provider.' });
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleMessage = async () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This provider listing was posted by you.' });
      return;
    }

    await ConversationHub.openOrCreateConversation({
      recipientId: provider.owner.userId,
      recipientName: provider.owner.displayName ?? provider.name,
      contextType: 'ProviderInquiry',
      entityId: provider.providerId,
      entityTitle: provider.name,
      entitySubtitle: [provider.category.name, provider.location.areaName ?? provider.location.cityName]
        .filter(Boolean)
        .join(' · '),
      entityStatus: provider.status,
      deepLink: `/provider/${provider.providerId}`,
      campaignSource: 'provider_detail',
    });
  };

  const handleShare = () => Share.share({ message: `Check out ${provider.name} on Diaspora!` });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScrollEndScrollView
        showsVerticalScrollIndicator={false}
        activeTab="discover"
        onBottomNavVisibilityChange={setIsBottomNavVisible}
        contentContainerStyle={{ paddingBottom: isBottomNavVisible ? 160 : 100 }}
      >
        {/* Cover */}
        <View className="relative">
          <ProviderImage media={provider.coverMedia} width="100%" height={300} />
          <View className="absolute top-0 left-0 right-0">
            <SafeAreaView edges={['top']}>
              <View className="flex-row items-center justify-between px-4 pt-2">
                <TouchableOpacity
                  onPress={() => backOr()}
                  className="w-10 h-10 rounded-full bg-black/30 items-center justify-center"
                >
                  <Text className="text-white text-xl">←</Text>
                </TouchableOpacity>
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={handleToggleSave}
                    disabled={savePending}
                    className="w-10 h-10 rounded-full bg-black/30 items-center justify-center mr-2"
                  >
                    <Text className="text-white text-lg">{isSaved ? '❤️' : '🤍'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleShare}
                    className="w-10 h-10 rounded-full bg-black/30 items-center justify-center"
                  >
                    <Text className="text-white text-lg">↗</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
          </View>
        </View>

        <View className="bg-surface-card rounded-t-3xl -mt-6 pt-6 px-6">
          {/* Title & verification. `verification.isVerified` is the server's own
              answer — the badge is never derived from a string comparison here. */}
          <View className="flex-row items-start mb-1">
            <Text className="text-2xl font-bold text-content-primary flex-1">{provider.name}</Text>
            {provider.verification?.isVerified && (
              <View className="bg-info-surface px-2 py-1 rounded-full flex-row items-center ml-2 mt-1">
                <Text className="text-info-default text-xs font-medium">✓ Verified</Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-content-muted mb-4">
            {[
              provider.category.name,
              provider.location.areaName ?? provider.location.cityName ?? provider.location.displayName,
            ]
              .filter(Boolean)
              .join(' · ')}
            {provider.location.distanceKm != null && ` · ${provider.location.distanceKm.toFixed(1)} km`}
          </Text>

          {/* Quick actions */}
          <View className="flex-row justify-around py-4 mb-4 border-t border-b border-faint">
            <TouchableOpacity onPress={handleCall} style={{ opacity: (!phone || isOwner) ? 0.65 : 1 }} className="items-center">
              <View className="w-14 h-14 rounded-full bg-surface-muted items-center justify-center mb-1">
                <Text className="text-2xl">📞</Text>
              </View>
              <Text className="text-xs text-content-tertiary font-medium">Call</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMessage} style={{ opacity: isOwner ? 0.65 : 1 }} className="items-center">
              <View className="w-14 h-14 rounded-full bg-surface-muted items-center justify-center mb-1">
                <Text className="text-2xl">💬</Text>
              </View>
              <Text className="text-xs text-content-tertiary font-medium">Message</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToggleSave} disabled={savePending} className="items-center">
              <View className="w-14 h-14 rounded-full bg-surface-muted items-center justify-center mb-1">
                <Text className="text-2xl">{isSaved ? '❤️' : '🤍'}</Text>
              </View>
              <Text className="text-xs text-content-tertiary font-medium">Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNotifModalVisible(true)} className="items-center">
              <View className="w-14 h-14 rounded-full bg-surface-muted items-center justify-center mb-1">
                <Text className="text-2xl">🔔</Text>
              </View>
              <Text className="text-xs text-content-tertiary font-medium">Alerts</Text>
            </TouchableOpacity>
          </View>

          {/* Promotion and analytics. Only for the provider who owns this
              profile — and `canManage` is the server's answer, not a
              client-side guess. */}
          {isOwner ? (
            <View className="mb-6">
              <PromoteEntry
                target="provider"
                subjectId={provider.providerId}
                title={provider.name}
                isOwner={isOwner}
              />
              {/* The provider dashboard — `GET /analytics/providers/me`. Until
                  13 Sep 2026 nothing in the app led to it; a provider's own
                  profile is where they would look for it. */}
              <TouchableOpacity
                onPress={() => router.push('/analytics/provider')}
                accessibilityRole="button"
                accessibilityLabel="How your profile is doing. Views, enquiries and your provider profiles."
                className="mt-3 p-4 rounded-2xl bg-surface-card border border-subtle flex-row items-center"
              >
                <View className="flex-1">
                  <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
                    How your profile is doing
                  </Text>
                  <Text className="text-[13px] text-content-secondary mt-1">
                    Views, enquiries and your provider profiles
                  </Text>
                </View>
                <Text className="text-xl font-bold text-content-tertiary">›</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* About */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-content-primary mb-2">About</Text>
            <Text className="text-base text-content-secondary leading-relaxed">
              {provider.profile.description || provider.profile.summary}
            </Text>
            {provider.tags.length > 0 && (
              <View className="flex-row flex-wrap mt-3">
                {provider.tags.map((tag) => (
                  <View key={tag} className="bg-surface-muted rounded-full px-3 py-1 mr-2 mb-2">
                    <Text className="text-xs text-content-tertiary font-medium">{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Gallery */}
          {provider.gallery.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-content-primary mb-3">Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {provider.gallery.map((media) => (
                  <ProviderImage
                    key={media.mediaId}
                    media={media}
                    width={140}
                    height={140}
                    radius={12}
                    style={{ marginRight: 8 }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Services. `effectivePricing.displayText` is the server's own
              rendering of the price, including its currency and its unit —
              re-deriving one on device is how "£20" comes to mean twenty of the
              wrong currency. */}
          {provider.services.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-content-primary mb-3">Services & Menu</Text>
              {provider.services.map((service) => (
                <View key={service.serviceId} className="flex-row items-center justify-between py-3 border-b border-faint">
                  <Text className="text-base text-content-primary flex-1 pr-3">{service.name}</Text>
                  {service.effectivePricing?.displayText ? (
                    <Text className="text-sm text-content-muted font-medium">
                      {service.effectivePricing.displayText}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* Business hours. Only days the provider actually told us about:
              `isSpecified` false means unknown, which is not the same as closed
              and must not be rendered as "Closed". */}
          {openHours.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-content-primary mb-3">Business Hours</Text>
              {openHours.map((hours) => (
                <View key={hours.dayOfWeek} className="flex-row items-center justify-between py-2">
                  <Text className="text-sm text-content-secondary w-24">{hours.dayOfWeek}</Text>
                  <Text className="text-sm text-content-muted">
                    {hours.isClosed ? 'Closed' : hours.displayText}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Reviews */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-content-primary mb-4">Reviews</Text>
            <RatingDisplay
              average={summary.average}
              totalReviews={summary.totalReviews}
              distribution={summary.distribution}
              size="lg"
            />

            <View className="mt-6">
              {reviews.length > 0 ? (
                reviews.map((review) => (
                  <ReviewCard
                    key={review.reviewId}
                    // Null when the caller may not see the name. "A member" is
                    // the honest rendering; inventing one would be the defect
                    // this whole screen was rewritten to remove.
                    reviewerName={review.reviewerName ?? 'A member'}
                    rating={review.rating}
                    body={review.body ?? undefined}
                    date={new Date(review.createdAt).toLocaleDateString()}
                  />
                ))
              ) : (
                <Text className="text-sm text-content-muted text-center py-4">
                  No reviews yet. Be the first!
                </Text>
              )}
            </View>

            {/* `canReview` is the server's answer. Offering the control to
                somebody the server will refuse is a promise the platform cannot
                keep; `viewerState` is null when signed out, and absent is not
                permitted. */}
            {provider.viewerState?.canReview ? (
              <Button
                label={provider.viewerState.ownReviewId ? 'Edit your review' : 'Write a Review'}
                variant="outline"
                className="mt-2"
                onPress={() =>
                  router.push({ pathname: '/write-review', params: { listingId: provider.providerId } })
                }
              />
            ) : null}
          </View>

          {/* Report */}
          <TouchableOpacity onPress={() => setReportModalVisible(true)} className="items-center py-4 mb-4">
            <Text className="text-sm text-content-faint">Report this listing</Text>
          </TouchableOpacity>
        </View>
      </ScrollEndScrollView>

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Listing"
        contentId={provider.providerId}
        // A provider is reported as community content type `Listing` —
        // `Diaspora.Modules.Providers` has no report route of its own, and
        // `ProviderBookmarkService` confirms `CommunityContentType.Listing` is
        // the reference B6 stores for a provider. `ReportModal` sends it.
      />
      <ProviderNotificationModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        providerId={provider.providerId}
        providerName={provider.name}
      />
    </SafeAreaView>
  );
}
