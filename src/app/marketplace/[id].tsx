import React, { useState, useEffect, useRef } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { apiClient } from '@/lib/apiClient';
import { useSavedStore } from '@/store/saved';
import { CommunityTrustBadge } from '@/components/CommunityTrustBadge';
import { ReportModal } from '@/components/ReportModal';
import { UpdateCard } from '@/components/UpdateCard';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { ProviderCard } from '@/components/ProviderCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { ConversationHub } from '@/lib/conversation-hub';

// Hyperlocal integrations
import { useLocationStore, getActiveLocation } from '@/store/location';
import { getDistanceKm } from '@/utils/geo';
import { DistanceBadge } from '@/components/DistanceBadge';
import { MapPreviewCard } from '@/components/MapPreviewCard';

// B15 — the financial platform. Marketplace keeps the listing; Financial takes
// the money; neither module knows about the other.
import { useTheme } from '@/design-system';
import {
  NoEscrowDisclosure,
  PromotedBadge,
  SubjectPaymentButton,
} from '@/components/financial';

export default function ListingDetailScreen() {
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<any>(null);
  
  // Cross-module states
  const [nearbyUpdates, setNearbyUpdates] = useState<any[]>([]);
  const [nearbyJobs, setNearbyJobs] = useState<any[]>([]);
  const [nearbyHousing, setNearbyHousing] = useState<any[]>([]);
  const [nearbyProviders, setNearbyProviders] = useState<any[]>([]);
  const [similarListings, setSimilarListings] = useState<any[]>([]);
  const [nearbyAlternatives, setNearbyAlternatives] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [activeEcosystemTab, setActiveEcosystemTab] = useState<'Updates' | 'Jobs' | 'Housing' | 'Services'>('Updates');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const { save, unsave, isSaved } = useSavedStore();
  const saved = isSaved(id);
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

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  useEffect(() => {
    const fetchDetails = async () => {
      setIsLoading(true);
      setErrorMsg('');
      try {
        const res = await apiClient.get(`/marketplace/${id}`);
        const data = res.data;
        const mainItem = data.data;

        // Calculate distance locally
        if (mainItem.location?.latitude && mainItem.location?.longitude) {
          mainItem.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, mainItem.location.latitude, mainItem.location.longitude);
        }

        setListing(mainItem);

        // Map updates to calculate distance relative to the listing
        const updates = (data.nearbyUpdates || []).map((item: any) => {
          const dist = item.location?.latitude && item.location?.longitude && mainItem.location?.latitude && mainItem.location?.longitude
            ? getDistanceKm(mainItem.location.latitude, mainItem.location.longitude, item.location.latitude, item.location.longitude)
            : null;
          return {
            ...item,
            location: {
              ...item.location,
              distanceKm: dist
            }
          };
        });
        setNearbyUpdates(updates);

        // Map jobs distance relative to listing
        const jobs = (data.nearbyJobs || []).map((item: any) => {
          if (item.location?.latitude && item.location?.longitude && mainItem.location?.latitude && mainItem.location?.longitude) {
            item.location.distanceKm = getDistanceKm(mainItem.location.latitude, mainItem.location.longitude, item.location.latitude, item.location.longitude);
          }
          return item;
        });
        setNearbyJobs(jobs);

        // Map housing distance relative to listing
        const housing = (data.nearbyHousing || []).map((item: any) => {
          if (item.location?.latitude && item.location?.longitude && mainItem.location?.latitude && mainItem.location?.longitude) {
            item.location.distanceKm = getDistanceKm(mainItem.location.latitude, mainItem.location.longitude, item.location.latitude, item.location.longitude);
          }
          return item;
        });
        setNearbyHousing(housing);

        // Map providers distance relative to listing
        const providers = (data.nearbyProviders || []).map((item: any) => {
          if (item.location?.latitude && item.location?.longitude && mainItem.location?.latitude && mainItem.location?.longitude) {
            item.location.distanceKm = getDistanceKm(mainItem.location.latitude, mainItem.location.longitude, item.location.latitude, item.location.longitude);
          }
          return item;
        });
        setNearbyProviders(providers);

        // Map similar listings
        const similar = (data.similarListings || []).map((item: any) => {
          if (item.location?.latitude && item.location?.longitude) {
            item.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, item.location.latitude, item.location.longitude);
          }
          return item;
        });
        setSimilarListings(similar);

        // Map alternatives
        const alts = (data.nearbyAlternatives || []).map((item: any) => {
          if (item.location?.latitude && item.location?.longitude) {
            item.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, item.location.latitude, item.location.longitude);
          }
          return item;
        });
        setNearbyAlternatives(alts);

      } catch (err: any) {
        console.error('Error fetching marketplace details', err);
        setErrorMsg(err?.response?.data?.message || 'Failed to load marketplace item.');
      } finally {
        setIsLoading(false);
      }
    };
    if (id) {
      fetchDetails();
    }
  }, [id, activeLocation]);

  const handleSaveToggle = () => {
    if (saved) {
      unsave(id);
    } else {
      save(id, 'Marketplace');
    }
  };

  const handleShare = () => {
    const priceText = listing.price === 0 ? 'FREE' : `${getCurrencySymbol()}${listing.price}`;
    const msg = `Check out this listing on Diaspora: "${listing.title}" - ${priceText} in ${listing.location.areaName}!`;
    
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    } else {
      Linking.openURL(`sms:&body=${encodeURIComponent(msg)}`);
    }
  };

  const handleCall = () => {
    const phone = listing?.seller?.contactPhone;
    if (!phone) {
      showAlert({ type: 'info', title: 'Unavailable', message: 'Seller did not provide a direct call phone number.' });
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleMessage = async () => {
    if (!listing?.seller?.sellerId) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'Unable to contact this seller.' });
      return;
    }
    const priceText = listing.price === 0 ? 'FREE' : `${getCurrencySymbol()}${listing.price}`;
    await ConversationHub.openOrCreateConversation({
      recipientId: listing.seller.sellerId,
      recipientName: listing.seller.name,
      recipientAvatarUrl: listing.seller.avatarUrl,
      contextType: 'MarketplaceListing',
      entityId: id,
      entityTitle: listing.title,
      entitySubtitle: `Seller: ${listing.seller.name} · ${listing.location?.areaName || ''}`,
      entityImageUrl: listing.images?.[0],
      entityPrice: priceText,
      entityStatus: listing.status || 'Active',
      deepLink: `/marketplace/${id}`,
      campaignSource: 'listing_detail',
    });
  };

  const handleReportSubmit = (data: any) => {
    console.log('[MODERATION] Listing reported:', id, data);
    // Send request to api mock in production
  };

  const getCurrencySymbol = () => {
    if (!listing) return '';
    switch (listing.currency) {
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'NGN': return '₦';
      case 'GHS': return '₵';
      case 'MUR': return 'Rs ';
      default: return `${listing.currency} `;
    }
  };

  const formattedDistance = () => {
    if (!listing || listing.location.distanceKm == null) return '';
    return listing.location.distanceKm < 1
      ? `${(listing.location.distanceKm * 1000).toFixed(0)}m away`
      : `${listing.location.distanceKm.toFixed(1)}km away`;
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-bold text-content-faint mt-4 uppercase tracking-widest">Loading details...</Text>
      </SafeAreaView>
    );
  }

  if (errorMsg || !listing) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-5xl mb-4">⚠️</Text>
        <Text className="text-lg font-bold text-content-strong text-center">{errorMsg || 'Listing Not Found'}</Text>
        <Text className="text-xs text-content-faint mt-2 text-center leading-relaxed">
          This listing might have been sold, archived, or removed by its publisher.
        </Text>
        <TouchableOpacity onPress={() => router.back()} className="bg-primary-500 px-6 py-3 rounded-xl mt-6">
          <Text className="text-white font-bold text-xs">Back to Discover</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const gallery = listing.gallery && listing.gallery.length > 0 ? listing.gallery : [listing.coverImage];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* Top Navbar */}
      <View className="bg-surface-card px-6 py-4 flex-row justify-between items-center border-b border-faint">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
          <Text className="text-lg text-content-secondary">←</Text>
        </TouchableOpacity>
        <Text className="text-base font-extrabold text-content-strong uppercase tracking-widest">Marketplace Item</Text>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={handleShare} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
            <Text className="text-sm">↗️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSaveToggle} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
            <Text className="text-sm">{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollEndScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        activeTab="discover"
        onBottomNavVisibilityChange={setIsBottomNavVisible}
        contentContainerStyle={{ paddingBottom: isBottomNavVisible ? 240 : 160 }}
      >
        
        {/* Photo Gallery with pagination dots */}
        <View className="bg-surface-card relative">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const slide = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
              if (slide !== activeImageIdx) setActiveImageIdx(slide);
            }}
            scrollEventThrottle={16}
            style={{ height: 260 }}
          >
            {gallery.map((img: string, idx: number) => (
              <Image
                key={idx}
                source={{ uri: img }}
                style={{ width: Platform.OS === 'web' ? 400 : 380, height: 260 }}
                contentFit="cover"
              />
            ))}
          </ScrollView>

          {/* Status Overlay */}
          <View className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full border border-white/20">
            <Text className="text-white text-[10px] font-black uppercase tracking-widest">{listing.status}</Text>
          </View>

          {/* Dots Indicator */}
          {gallery.length > 1 && (
            <View className="absolute bottom-4 left-0 right-0 flex-row justify-center gap-1.5">
              {gallery.map((_: any, idx: number) => (
                <View
                  key={idx}
                  className={`h-1.5 rounded-full ${
                    activeImageIdx === idx ? 'w-4 bg-primary-500' : 'w-1.5 bg-surface-card/60'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Pricing & Intent summary block */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <View className="flex-row justify-between items-center mb-2 flex-wrap gap-2">
            <View className="bg-primary-50 border border-primary-200 px-3 py-1 rounded-lg">
              <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">{listing.intent}</Text>
            </View>
            <View className="bg-surface-background border border-subtle px-3 py-1 rounded-lg">
              <Text className="text-xs font-bold text-content-tertiary uppercase tracking-widest">{listing.condition}</Text>
            </View>
          </View>

          <Text className="text-2xl font-black text-content-primary leading-snug">{listing.title}</Text>
          
          <View className="flex-row items-baseline mt-3 flex-wrap gap-2">
            <Text className="text-3xl font-black text-primary-500">
              {listing.price === 0 ? 'FREE' : `${getCurrencySymbol()}${listing.price}`}
            </Text>
            {listing.negotiable && listing.price > 0 && (
              <Text className="text-xs font-bold text-success-default bg-success-surface px-2 py-0.5 rounded border border-green-150">
                NEGOTIABLE
              </Text>
            )}
            {listing.quantity > 1 && (
              <Text className="text-xs text-content-muted font-bold ml-2">({listing.quantity} available)</Text>
            )}
          </View>

          {/* Paid-placement disclosure — DEBT-071. Renders nothing unless this
              listing genuinely has an active placement behind it. */}
          <View className="mt-2">
            <PromotedBadge subjectType="MarketplaceListing" subjectId={String(id)} />
          </View>

          {/* Pay the seller. Only for a priced listing that is still available:
              a free item, a swap and a sold listing all have nothing to pay. */}
          {listing.price > 0 && listing.status === 'Active' && listing.intent !== 'Swap' ? (
            <View className="mt-4">
              <SubjectPaymentButton
                subjectType="MarketplaceListing"
                subjectId={String(id)}
                subjectTitle={listing.title}
                amount={listing.price}
                currency={listing.currency}
                description={listing.title}
                label={`Pay ${getCurrencySymbol()}${listing.price} with Diaspora`}
                details={[
                  { label: 'Seller', value: listing.seller.name },
                  { label: 'Item', value: listing.title },
                  ...(listing.location?.areaName
                    ? [{ label: 'Location', value: listing.location.areaName }]
                    : []),
                ]}
              />
              <NoEscrowDisclosure />
            </View>
          ) : null}

          {/* Proximity / Landmark info */}
          <View className="flex-col mt-4 border-t border-faint pt-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-2">
                <Text className="text-xl mr-2">📍</Text>
                <View>
                  <Text className="text-sm font-extrabold text-content-strong">
                    {listing.location.areaName} · {listing.location.cityName}
                  </Text>
                  {listing.location.landmark && (
                    <Text className="text-xs text-content-muted font-semibold mt-0.5">
                      Landmark: {listing.location.landmark}
                    </Text>
                  )}
                </View>
              </View>
              {listing.location.distanceKm !== undefined && (
                <DistanceBadge distanceKm={listing.location.distanceKm} showCommuteTime={true} />
              )}
            </View>

            {listing.location.latitude && listing.location.longitude && (
              <View className="mt-4 h-40 rounded-2xl overflow-hidden border border-subtle">
                <MapPreviewCard
                  center={activeLocation}
                  pins={[{
                    id: listing.id,
                    title: listing.title,
                    category: listing.intent,
                    latitude: listing.location.latitude,
                    longitude: listing.location.longitude,
                    distanceKm: listing.location.distanceKm || 0
                  }]}
                  radiusKm={5}
                />
              </View>
            )}
          </View>
        </View>

        {/* Description section */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Description</Text>
          <Text className="text-sm text-content-secondary leading-relaxed font-semibold">{listing.description}</Text>
        </View>

        {/* Seller Info section */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-6">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Seller Profile</Text>
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 rounded-full bg-surface-muted items-center justify-center border border-subtle mr-4">
              <Text className="text-lg font-black text-content-strong">
                {listing.seller.name.split(' ').map((n: string) => n[0]).join('')}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-content-primary">{listing.seller.name}</Text>
              <View className="flex-row items-center mt-1">
                <Text className="text-xs text-content-muted font-bold mr-1">★ {listing.seller.rating != null ? listing.seller.rating.toFixed(1) : '4.8'}</Text>
                <Text className="text-content-faint">·</Text>
                <Text className="text-xs text-content-muted font-bold ml-1">{listing.seller.yearsOnPlatform ?? 2} years on platform</Text>
              </View>
            </View>
            {listing.seller.isVerified && (
              <View className="bg-[#E8F7F4] border border-[#A3EBDB] px-2 py-0.5 rounded">
                <Text className="text-[8px] font-black text-[#0D7C66] uppercase">Verified</Text>
              </View>
            )}
          </View>

          {/* Render Seller Community Trust Labels in detail page */}
          <View className="mb-4 bg-surface-background border border-subtle p-4 rounded-2xl">
            <Text className="text-[10px] font-black text-content-muted uppercase tracking-wider mb-2">Community Trust Profile</Text>
            <CommunityTrustBadge profile={listing.seller} size="md" />
          </View>

          {/* Seller Metadata details */}
          <View className="flex-row justify-between border-t border-faint pt-4 flex-wrap gap-2">
            {listing.seller.responseTime && (
              <View>
                <Text className="text-[10px] text-content-faint font-bold uppercase">Response Time</Text>
                <Text className="text-xs font-extrabold text-content-secondary mt-0.5">⚡ {listing.seller.responseTime}</Text>
              </View>
            )}
            {listing.seller.languagesSpoken && (
              <View>
                <Text className="text-[10px] text-content-faint font-bold uppercase">Languages</Text>
                <Text className="text-xs font-extrabold text-content-secondary mt-0.5">🗣️ {listing.seller.languagesSpoken.join(', ')}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => router.replace({
                pathname: '/(tabs)/discover',
                params: { tab: 'Marketplace', query: listing.seller.name }
              })}
              className="justify-center"
            >
              <Text className="text-xs font-extrabold text-primary-500">View Listings →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cross-Module Integration Hub: Nearby Ecosystem (Updates, Jobs, Housing, Services) */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2">
            <View>
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">📍 Local Proximity Hub</Text>
            </View>
            <View className="bg-surface-background px-2 py-0.5 rounded border border-faint">
              <Text className="text-[8px] font-black text-content-tertiary uppercase">Within {listing.location.cityName}</Text>
            </View>
          </View>

          {/* Ecosystem Segment Tabs */}
          <View className="flex-row bg-surface-muted p-1 rounded-2xl mb-4 border border-subtle">
            {[
              { key: 'Updates', label: '📢 Updates', count: nearbyUpdates.length },
              { key: 'Jobs', label: '💼 Jobs', count: nearbyJobs.length },
              { key: 'Housing', label: '🏠 Housing', count: nearbyHousing.length },
              { key: 'Services', label: '📍 Services', count: nearbyProviders.length }
            ].map((tab) => {
              const isActive = activeEcosystemTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveEcosystemTab(tab.key as any)}
                  className={`flex-1 py-2.5 rounded-xl items-center justify-center ${
                    isActive ? 'bg-surface-card shadow-sm' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-[10px] font-bold ${isActive ? 'text-primary-500' : 'text-content-tertiary'}`}>
                    {tab.label} ({tab.count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Ecosystem Content */}
          <View className="min-h-[100px]">
            {activeEcosystemTab === 'Updates' && (
              <View>
                {nearbyUpdates.length > 0 ? (
                  nearbyUpdates.map((item) => (
                    <UpdateCard
                      key={item.updateId}
                      update={item}
                      author={{
                        userId: item.authorId,
                        name: 'Resident Contributor',
                        avatarUrl: null,
                        reputationLevel: 'VerifiedResident',
                        isVerified: true
                      } as any}
                    />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No community safety alerts nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Jobs' && (
              <View>
                {nearbyJobs.length > 0 ? (
                  nearbyJobs.map((item) => (
                    <JobCard key={item.jobId} job={item} />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No employment opportunities nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Housing' && (
              <View>
                {nearbyHousing.length > 0 ? (
                  nearbyHousing.map((item) => (
                    <HousingCard key={item.id} listing={item} />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No housing accommodation nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Services' && (
              <View>
                {nearbyProviders.length > 0 ? (
                  nearbyProviders.map((item) => (
                    <ProviderCard
                      key={item.listingId}
                      listingId={item.listingId}
                      title={item.title}
                      category={item.category.name}
                      areaName={item.location.areaName}
                      distanceKm={item.location.distanceKm}
                      rating={item.rating.average}
                      reviewCount={item.rating.totalReviews}
                      coverImageUrl={item.coverImageUrl}
                      isVerified={item.verificationStatus === 'Verified'}
                      isOpenNow={item.isOpenNow}
                    />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No diaspora service providers listed nearby.</Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Similar Listings */}
        {similarListings.length > 0 && (
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Suggested Similar Listings</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {similarListings.map((item) => (
                <MarketplaceCard key={item.id} listing={item} variant="featured" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Nearby Alternatives */}
        {nearbyAlternatives.length > 0 && (
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Nearby Alternatives</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {nearbyAlternatives.map((item) => (
                <MarketplaceCard key={item.id} listing={item} variant="featured" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Report Listing trigger */}
        <TouchableOpacity
          onPress={() => setReportModalVisible(true)}
          className="py-6 items-center"
        >
          <Text className="text-xs font-bold text-error-default">⚠️ Report Listing to Community Moderators</Text>
        </TouchableOpacity>
      </ScrollEndScrollView>

      {/* Sticky Bottom Actions */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          backgroundColor: tokens.color.surface.card,
          borderTopWidth: 1,
          borderTopColor: tokens.color.neutral[200],
          paddingTop: 16,
          paddingBottom: isBottomNavVisible ? 16 : 16 + insets.bottom,
          paddingHorizontal: 24,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          zIndex: 999,
          elevation: 5,
        }}
      >
        {listing.seller.contactPhone && (
          <TouchableOpacity
            onPress={handleCall}
            className="flex-1 border border-subtle py-3.5 rounded-2xl items-center justify-center bg-surface-background active:bg-surface-muted"
          >
            <Text className="text-xs font-extrabold text-content-secondary">📞 Direct Call</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleMessage}
          className="flex-row items-center justify-center py-3.5 rounded-2xl active:opacity-90"
          style={{ flex: 2, backgroundColor: '#F59300' }}
        >
          <Text className="text-white font-black text-xs">💬 Message Seller</Text>
        </TouchableOpacity>
      </Animated.View>

      {/*
        Paying the seller.

        Deliberately *not* in the sticky bar above. Messaging is how a
        marketplace transaction starts on this platform — you agree what you are
        buying before you send anybody money — and putting Pay next to Message
        would invite paying a stranger for an item nobody has discussed yet.
        The button lives in the listing body, under the price, where somebody
        who has already decided will look for it.

        Nothing here changes the listing. B15 records the payment against
        subjectType `MarketplaceListing`; Marketplace still owns whether the
        item is sold, and exposes no route a payment could drive. GAP-04.
      */}

      {/* Moderator Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Marketplace"
        contentId={id}
        onSubmit={handleReportSubmit}
      />
    </SafeAreaView>
  );
}
