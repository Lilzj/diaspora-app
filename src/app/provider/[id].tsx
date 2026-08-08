import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Linking, Share, Alert, ScrollView, Animated } from 'react-native';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RatingDisplay } from '@/components/RatingDisplay';
import { ReviewCard } from '@/components/ReviewCard';
import { ProviderCard } from '@/components/ProviderCard';
import { Button } from '@/components/Button';
import { mockListings, mockReviews } from '@/mocks/data';
import { ReportModal } from '@/components/ReportModal';
import { ProviderNotificationModal } from '@/components/ProviderNotificationModal';
import { ConversationHub } from '@/lib/conversation-hub';
import { useNotification } from '@/providers/notification-provider';
import { useAuthStore } from '@/store/auth';
import { PromoteEntry } from '@/components/monetization';

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const [isSaved, setIsSaved] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const { showAlert } = useNotification();
  const { user } = useAuthStore();

  const listing = mockListings.find((l) => l.listingId === id) ?? mockListings[0];
  const reviews = mockReviews.filter((r) => r.listingId === listing.listingId);
  const similarListings = mockListings.filter((l) => l.listingId !== listing.listingId).slice(0, 2);

  const isOwner = listing?.owner?.providerId === user?.userId;

  const handleCall = () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This provider listing was posted by you.' });
      return;
    }
    if (!listing?.contact?.phone) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'No phone number provided by this provider.' });
      return;
    }
    Linking.openURL(`tel:${listing.contact.phone}`);
  };
  
  const handleMessage = async () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This provider listing was posted by you.' });
      return;
    }
    if (!listing?.owner?.providerId) return;
    await ConversationHub.openOrCreateConversation({
      recipientId: listing.owner.providerId,
      recipientName: listing.owner.name,
      contextType: 'ProviderInquiry',
      entityId: listing.listingId,
      entityTitle: listing.title,
      entitySubtitle: `${listing.category.name} · ${listing.location.areaName}`,
      entityImageUrl: listing.coverImageUrl,
      entityStatus: listing.verificationStatus || 'Active',
      deepLink: `/provider/${listing.listingId}`,
      campaignSource: 'provider_detail',
    });
  };

  const handleShare = () => Share.share({ message: `Check out ${listing.title} on Diaspora!` });
  const handleReport = () => setReportModalVisible(true);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <ScrollEndScrollView
        showsVerticalScrollIndicator={false}
        activeTab="discover"
        onBottomNavVisibilityChange={setIsBottomNavVisible}
        contentContainerStyle={{ paddingBottom: isBottomNavVisible ? 160 : 100 }}
      >
        {/* Cover Image */}
        <View className="relative">
          <Image
            source={{ uri: listing.coverImageUrl }}
            style={{ width: '100%', height: 300 }}
            contentFit="cover"
            transition={200}
          />
          {/* Overlay Header */}
          <View className="absolute top-0 left-0 right-0">
            <SafeAreaView edges={['top']}>
              <View className="flex-row items-center justify-between px-4 pt-2">
                <TouchableOpacity
                  onPress={() => router.back()}
                  className="w-10 h-10 rounded-full bg-black/30 items-center justify-center"
                >
                  <Text className="text-white text-xl">←</Text>
                </TouchableOpacity>
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => setIsSaved(!isSaved)}
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

        {/* Content Sheet */}
        <View className="bg-white rounded-t-3xl -mt-6 pt-6 px-6">
          {/* Title & Verification */}
          <View className="flex-row items-start mb-1">
            <Text className="text-2xl font-bold text-neutral-900 flex-1">{listing.title}</Text>
            {listing.verificationStatus === 'Verified' && (
              <View className="bg-info-surface px-2 py-1 rounded-full flex-row items-center ml-2 mt-1">
                <Text className="text-info-default text-xs font-medium">✓ Verified</Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-neutral-500 mb-4">
            {listing.category.name} · {listing.location.areaName}
            {listing.location.distanceKm != null && ` · ${listing.location.distanceKm.toFixed(1)} km`}
          </Text>

          {/* Quick Actions */}
          <View className="flex-row justify-around py-4 mb-4 border-t border-b border-neutral-100">
            <TouchableOpacity onPress={handleCall} style={{ opacity: (!listing?.contact?.phone || isOwner) ? 0.65 : 1 }} className="items-center">
              <View className="w-14 h-14 rounded-full bg-neutral-100 items-center justify-center mb-1">
                <Text className="text-2xl">📞</Text>
              </View>
              <Text className="text-xs text-neutral-600 font-medium">Call</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMessage} style={{ opacity: isOwner ? 0.65 : 1 }} className="items-center">
              <View className="w-14 h-14 rounded-full bg-neutral-100 items-center justify-center mb-1">
                <Text className="text-2xl">💬</Text>
              </View>
              <Text className="text-xs text-neutral-600 font-medium">Message</Text>
            </TouchableOpacity>
            <TouchableOpacity className="items-center">
              <View className="w-14 h-14 rounded-full bg-neutral-100 items-center justify-center mb-1">
                <Text className="text-2xl">📍</Text>
              </View>
              <Text className="text-xs text-neutral-600 font-medium">Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsSaved(!isSaved)} className="items-center">
              <View className="w-14 h-14 rounded-full bg-neutral-100 items-center justify-center mb-1">
                <Text className="text-2xl">{isSaved ? '❤️' : '🤍'}</Text>
              </View>
              <Text className="text-xs text-neutral-600 font-medium">Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNotifModalVisible(true)} className="items-center">
              <View className="w-14 h-14 rounded-full bg-neutral-100 items-center justify-center mb-1">
                <Text className="text-2xl">🔔</Text>
              </View>
              <Text className="text-xs text-neutral-600 font-medium">Alerts</Text>
            </TouchableOpacity>
          </View>

          {/* Promotion. Only for the provider who owns this profile — a visitor
              never sees it, and it renders nothing until the certified placement
              read has answered. */}
          {isOwner ? (
            <View className="mb-6">
              <PromoteEntry
                target="provider"
                subjectId={id}
                title={listing.title}
                isOwner={isOwner}
              />
            </View>
          ) : null}

          {/* About */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-neutral-900 mb-2">About</Text>
            <Text className="text-base text-neutral-700 leading-relaxed">{listing.description}</Text>
            {listing.tags && (
              <View className="flex-row flex-wrap mt-3">
                {listing.tags.map((tag) => (
                  <View key={tag} className="bg-neutral-100 rounded-full px-3 py-1 mr-2 mb-2">
                    <Text className="text-xs text-neutral-600 font-medium">{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Gallery */}
          {listing.gallery && listing.gallery.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-neutral-900 mb-3">Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {listing.gallery.map((uri, index) => (
                  <TouchableOpacity key={index} onPress={() => router.push({ pathname: '/gallery', params: { images: listing.gallery.join(','), index: String(index) } })}>
                    <Image
                      source={{ uri }}
                      style={{ width: 140, height: 140, borderRadius: 12, marginRight: 8 }}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Services */}
          {listing.services && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-neutral-900 mb-3">Services & Menu</Text>
              {listing.services.map((service, index) => (
                <View key={index} className="flex-row items-center justify-between py-3 border-b border-neutral-100">
                  <Text className="text-base text-neutral-900">{service.name}</Text>
                  {service.priceRange && (
                    <Text className="text-sm text-neutral-500 font-medium">
                      £{service.priceRange.min} — £{service.priceRange.max}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Business Hours */}
          {listing.businessHours && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-neutral-900 mb-3">Business Hours</Text>
              {listing.businessHours.map((hours, index) => (
                <View key={index} className="flex-row items-center justify-between py-2">
                  <Text className="text-sm text-neutral-700 w-24">{hours.dayOfWeek}</Text>
                  <Text className="text-sm text-neutral-500">
                    {hours.isClosed ? 'Closed' : `${hours.openTime} — ${hours.closeTime}`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Ratings & Reviews */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-neutral-900 mb-4">Reviews</Text>
            <RatingDisplay
              average={listing.rating.average}
              totalReviews={listing.rating.totalReviews}
              distribution={listing.rating.distribution}
              size="lg"
            />

            <View className="mt-6">
              {reviews.length > 0 ? (
                reviews.map((review) => (
                  <ReviewCard
                    key={review.reviewId}
                    reviewerName={review.reviewerName}
                    rating={review.rating}
                    body={review.body}
                    date={new Date(review.createdAt).toLocaleDateString()}
                  />
                ))
              ) : (
                <Text className="text-sm text-neutral-500 text-center py-4">
                  No reviews yet. Be the first!
                </Text>
              )}
            </View>

            <Button label="Write a Review" variant="outline" className="mt-2" onPress={() => router.push({ pathname: '/write-review', params: { listingId: listing.listingId } })} />
          </View>

          {/* Report */}
          <TouchableOpacity onPress={handleReport} className="items-center py-4 mb-4">
            <Text className="text-sm text-neutral-400">Report this listing</Text>
          </TouchableOpacity>

          {/* Similar */}
          {similarListings.length > 0 && (
            <View className="mb-8">
              <Text className="text-lg font-semibold text-neutral-900 mb-3">Similar Providers</Text>
              {similarListings.map((item) => (
                <ProviderCard
                  key={item.listingId}
                  listingId={item.listingId}
                  title={item.title}
                  category={item.category.name}
                  areaName={item.location?.areaName}
                  distanceKm={item.location?.distanceKm}
                  rating={item.rating.average}
                  reviewCount={item.rating.totalReviews}
                  coverImageUrl={item.coverImageUrl}
                  isVerified={item.verificationStatus === 'Verified'}
                  variant="list"
                />
              ))}
            </View>
          )}
        </View>
      </ScrollEndScrollView>
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Listing"
        contentId={listing.listingId}
        onSubmit={(data) => {
          console.log('Reported Listing:', data);
        }}
      />
      <ProviderNotificationModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        providerId={listing.owner.providerId}
        providerName={listing.owner.name}
      />
    </SafeAreaView>
  );
}
