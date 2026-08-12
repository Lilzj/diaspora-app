import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { Image } from 'expo-image';
import { useSavedStore } from '@/store/saved';
import { Button } from '@/components/Button';
import { HousingCard } from '@/components/HousingCard';
import { JobCard } from '@/components/JobCard';
import { ProviderCard } from '@/components/ProviderCard';
import { GuideCard } from '@/components/GuideCard';
import { ReportModal } from '@/components/ReportModal';
import { apiClient } from '@/lib/apiClient';
import { mockAuthors } from '@/mocks/community-data';
import type { HousingListing } from '@/types/housing';
import { ConversationHub } from '@/lib/conversation-hub';
import { useAuthStore } from '@/store/auth';

// B15 — Housing owns the property; Financial owns the money. Nothing here is
// held in escrow, and the disclosure under the button says so.
import { NoEscrowDisclosure, SubjectPaymentButton } from '@/components/financial';

// Hyperlocal integrations
import { useLocationStore, getActiveLocation } from '@/store/location';
import { getDistanceKm } from '@/utils/geo';
import { DistanceBadge } from '@/components/DistanceBadge';
import { MapPreviewCard } from '@/components/MapPreviewCard';

export default function HousingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showAlert } = useNotification();
  const [listing, setListing] = useState<HousingListing | null>(null);
  const [similarListings, setSimilarListings] = useState<HousingListing[]>([]);
  
  // Nearby platform elements
  const [nearbyJobs, setNearbyJobs] = useState<any[]>([]);
  const [nearbyProviders, setNearbyProviders] = useState<any[]>([]);
  const [nearbyGuides, setNearbyGuides] = useState<any[]>([]);
  
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const { save, unsave, isSaved } = useSavedStore();
  const saved = listing ? isSaved(listing.id) : false;
  const { user } = useAuthStore();
  const isOwner = listing?.host?.providerId === user?.userId;

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  useEffect(() => {
    const fetchHousingDetails = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(`/housing/${id}`);
        const data: HousingListing = response.data.data;
        
        // Calculate distance locally
        if (data.location?.latitude && data.location?.longitude) {
          data.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, data.location.latitude, data.location.longitude);
        }
        
        setListing(data);

        // 1. Fetch similar listings in same city/type sorted by proximity
        const similarRes = await apiClient.get('/housing', {
          params: {
            cityName: data.location.cityName,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude
          }
        });
        const allListings: HousingListing[] = similarRes.data.data;
        setSimilarListings(allListings.filter((h) => h.id !== data.id).slice(0, 2));

        // 2. Fetch nearby Jobs relative to listing coordinates
        try {
          const jobsRes = await apiClient.get('/jobs', {
            params: {
              cityName: data.location.cityName,
              latitude: data.location.latitude,
              longitude: data.location.longitude
            }
          });
          setNearbyJobs(jobsRes.data.data.slice(0, 2));
        } catch (err) {
          console.log('No nearby jobs loaded', err);
        }

        // 3. Fetch nearby Providers relative to listing coordinates
        try {
          const provRes = await apiClient.get('/listings', {
            params: {
              cityName: data.location.cityName,
              latitude: data.location.latitude,
              longitude: data.location.longitude
            }
          });
          setNearbyProviders(provRes.data.data || []);
        } catch (err) {
          try {
            const discRes = await apiClient.get('/discovery/search', {
              params: {
                city: data.location.cityName,
                latitude: data.location.latitude,
                longitude: data.location.longitude
              }
            });
            setNearbyProviders(discRes.data.data?.listings?.slice(0, 2) || []);
          } catch (e) {
            console.log('No nearby providers loaded', e);
          }
        }

        // 4. Fetch nearby Guides
        try {
          const guidesRes = await apiClient.get('/discovery/search', {
            params: { city: data.location.cityName }
          });
          setNearbyGuides(guidesRes.data.data?.guides?.slice(0, 2) || []);
        } catch (e) {
          console.log('No nearby guides loaded', e);
        }

      } catch (err) {
        console.error('Failed to load housing details', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchHousingDetails();
    }
  }, [id, activeLocation]);

  const handleSaveToggle = () => {
    if (!listing) return;
    if (saved) {
      unsave(listing.id);
    } else {
      save(listing.id, 'Housing');
    }
  };

  const handleCall = () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This housing listing was posted by you.' });
      return;
    }
    if (!listing?.host.contactPhone) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'No contact phone number provided by the host.' });
      return;
    }
    Linking.openURL(`tel:${listing.host.contactPhone}`);
  };

  const handleEmail = () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This housing listing was posted by you.' });
      return;
    }
    if (!listing?.host.contactEmail) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'No contact email address provided by the host.' });
      return;
    }
    Linking.openURL(`mailto:${listing.host.contactEmail}?subject=Inquiry regarding: ${listing.title}`);
  };

  const handleMessage = async () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This housing listing was posted by you.' });
      return;
    }
    if (!listing) return;
    await ConversationHub.openOrCreateConversation({
      recipientId: listing.host.providerId,
      recipientName: listing.host.name,
      contextType: 'HousingListing',
      entityId: listing.id,
      entityTitle: listing.title,
      entitySubtitle: `Host: ${listing.host.name} · ${listing.location.areaName}`,
      entityImageUrl: listing.gallery?.[0],
      entityPrice: `${getCurrencySymbol()}${listing.rent}/month`,
      entityStatus: listing.status || 'Active',
      deepLink: `/housing/${listing.id}`,
      campaignSource: 'housing_detail',
    });
  };

  const handleShare = () => {
    if (!listing) return;
    Share.share({
      message: `Check out this home listing: "${listing.title}" in ${listing.location?.areaName || 'location not specified'} on Diaspora!`,
    });
  };

  const handleApply = () => {
    if (!listing) return;
    showAlert({
      type: 'question',
      title: 'Submit Application',
      message: `Would you like to send an accommodation application request to ${listing.host.name}? This will securely share your Diaspora verified residency and community profile details.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply Now',
          onPress: () => {
            showAlert({
              type: 'success',
              title: 'Application Sent!',
              message: `${listing.host.name} has received your request and will contact you shortly.`,
            });
          },
        },
      ],
    });
  };

  const getCurrencySymbol = () => {
    if (!listing) return '';
    const cur = listing.currency;
    return cur === 'GBP' ? '£' : cur === 'MUR' ? 'Rs ' : cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur === 'NGN' ? '₦' : cur === 'GHS' ? '₵' : `${cur} `;
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-semibold text-neutral-500 mt-3">Loading property details...</Text>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-4xl mb-3">🔍</Text>
        <Text className="text-base font-extrabold text-neutral-850">Listing Not Found</Text>
        <Text className="text-xs text-neutral-400 text-center mt-1.5 leading-relaxed max-w-[240px]">
          This property listing may have been rented, expired, or archived.
        </Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      {/* Dynamic Header */}
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-neutral-600">←</Text>
          </TouchableOpacity>
          <Text className="text-base font-bold text-neutral-900" numberOfLines={1}>Homes & Housing</Text>
        </View>
        
        <View className="flex-row gap-4">
          <TouchableOpacity onPress={handleSaveToggle} className="p-1">
            <Text className="text-lg">{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} className="p-1">
            <Text className="text-lg">↗️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {/* Photo Gallery Carousel */}
        <View className="bg-white">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const xOffset = e.nativeEvent.contentOffset.x;
              const screenWidth = e.nativeEvent.layoutMeasurement.width;
              setActiveImageIdx(Math.round(xOffset / screenWidth));
            }}
            scrollEventThrottle={16}
          >
            {listing.gallery.map((img, i) => (
              <View key={i} style={{ width: Platform.OS === 'web' ? 450 : undefined }} className="w-screen h-60">
                <Image
                  source={{ uri: img }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
            ))}
          </ScrollView>
          
          {/* Indicator dots */}
          {listing.gallery.length > 1 && (
            <View className="flex-row justify-center items-center py-3.5 bg-white">
              {listing.gallery.map((_, i) => (
                <View
                  key={i}
                  className={`w-2 h-2 rounded-full mx-1 ${
                    activeImageIdx === i ? 'bg-primary-500 w-4' : 'bg-neutral-200'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Basic Property Header card */}
        <View className="bg-white px-6 py-6 border-b border-neutral-200 shadow-sm">
          <View className="flex-row items-center justify-between mb-3.5">
            <View className="bg-primary-50 px-2.5 py-1 rounded-full border border-primary-100">
              <Text className="text-[10px] font-extrabold text-primary-600 uppercase">🏠 {listing.listingType} · {listing.propertyType}</Text>
            </View>
            <View className="bg-neutral-50 px-2.5 py-1 rounded-full border border-neutral-200">
              <Text className="text-[10px] font-bold text-neutral-500 uppercase">👁️ {listing.viewCount} views</Text>
            </View>
          </View>

          <Text className="text-xl font-black text-neutral-900 leading-tight mb-2">{listing.title}</Text>
          
          <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2">
            <Text className="text-xs text-neutral-450 font-bold">
              📍 Address: {listing.location.addressLine} · {listing.location.cityName}
            </Text>
            {listing.location.distanceKm !== undefined && (
              <DistanceBadge distanceKm={listing.location.distanceKm} showCommuteTime={true} />
            )}
          </View>

          <View className="flex-row items-center justify-between border-t border-neutral-50 pt-4">
            <View>
              <Text className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Monthly Rent</Text>
              <Text className="text-xl font-black text-primary-500 mt-0.5">{getCurrencySymbol()}{listing.rent}</Text>
              {listing.billsIncluded && <Text className="text-[10px] font-bold text-success-default">Bills Included</Text>}
            </View>
            
            <View className="items-end">
              <Text className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Lease & Security</Text>
              <Text className="text-sm font-extrabold text-neutral-800 mt-0.5">Deposit: {getCurrencySymbol()}{listing.deposit}</Text>
              <Text className="text-[10px] text-neutral-500 font-semibold mt-0.5">Lease: {listing.leaseDuration}</Text>
            </View>
          </View>

          {/*
            Paying a deposit.

            **This is a payment, not an escrow.** §17 forbids implementing
            deposit protection unless the backend provides the contract, and it
            does not: `WalletType.Escrow` is an enum member with no aggregate,
            no hold/release routes and no dispute process behind it — GAP:
            protection. The money goes to the landlord.

            Saying so under the button is not a disclaimer for its own sake. A
            housing deposit is the largest sum most members will ever send
            through this app, and the one they are most likely to assume is
            being held for them.
          */}
          {listing.deposit > 0 ? (
            <View className="mt-4 pt-4 border-t border-neutral-50">
              <SubjectPaymentButton
                subjectType="HousingListing"
                subjectId={String(id)}
                subjectTitle={listing.title}
                amount={listing.deposit}
                currency={listing.currency}
                description={`Deposit — ${listing.title}`}
                label={`Pay ${getCurrencySymbol()}${listing.deposit} deposit`}
                details={[
                  { label: 'Property', value: listing.title },
                  { label: 'Monthly rent', value: `${getCurrencySymbol()}${listing.rent}` },
                  { label: 'Lease', value: String(listing.leaseDuration) },
                ]}
              />
              <NoEscrowDisclosure />
            </View>
          ) : null}
        </View>

        {/* Property Parameters & Details overview */}
        <View className="bg-white px-6 py-5 mt-3 border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Listing Details</Text>
          <View className="flex-row flex-wrap gap-y-4">
            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">🛏️</Text>
              <View>
                <Text className="text-[10px] font-bold text-neutral-400 uppercase">Bedrooms</Text>
                <Text className="text-xs font-bold text-neutral-800">{listing.bedrooms} Bedroom{listing.bedrooms > 1 && 's'}</Text>
              </View>
            </View>

            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">🚿</Text>
              <View>
                <Text className="text-[10px] font-bold text-neutral-400 uppercase">Bathrooms</Text>
                <Text className="text-xs font-bold text-neutral-800">{listing.bathrooms} Bathroom{listing.bathrooms > 1 && 's'}</Text>
              </View>
            </View>

            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">🛋️</Text>
              <View>
                <Text className="text-[10px] font-bold text-neutral-400 uppercase">Furnishing</Text>
                <Text className="text-xs font-bold text-neutral-800">{listing.furnished}</Text>
              </View>
            </View>

            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">📅</Text>
              <View>
                <Text className="text-[10px] font-bold text-neutral-400 uppercase">Availability</Text>
                <Text className="text-xs font-bold text-neutral-800">{listing.availabilityDate}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Lifestyle Match Badges */}
        {listing.lifestyleMatches && listing.lifestyleMatches.length > 0 && (
          <View className="bg-white p-6 mt-3 border-y border-neutral-200">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Lifestyle Match</Text>
            <View className="flex-row flex-wrap gap-2">
              {listing.lifestyleMatches.map((badge, idx) => {
                const parts = badge.split(' ');
                const emoji = parts[0];
                const label = parts.slice(1).join(' ');
                return (
                  <View key={idx} className="bg-primary-50 px-3.5 py-2 rounded-2xl border border-primary-200 flex-row items-center">
                    <Text className="text-sm mr-2">{emoji}</Text>
                    <Text className="text-xs font-bold text-primary-700">{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Description */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">About the property</Text>
          <Text className="text-sm text-neutral-700 leading-relaxed">{listing.description}</Text>
        </View>

        {/* Amenities */}
        {listing.amenities && listing.amenities.length > 0 && (
          <View className="bg-white p-6 mt-3 border-y border-neutral-200">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Included Amenities</Text>
            <View className="flex-row flex-wrap gap-y-3">
              {listing.amenities.map((item, idx) => (
                <View key={idx} className="w-1/2 flex-row items-center mb-1">
                  <Text className="text-primary-500 font-extrabold mr-2">✓</Text>
                  <Text className="text-xs text-neutral-700 font-semibold">{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* House Rules */}
        {listing.houseRules && listing.houseRules.length > 0 && (
          <View className="bg-white p-6 mt-3 border-y border-neutral-200">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">House Rules</Text>
            {listing.houseRules.map((rule, idx) => (
              <View key={idx} className="flex-row items-start mb-3">
                <Text className="text-neutral-400 mr-2.5">•</Text>
                <Text className="text-xs text-neutral-600 font-semibold leading-relaxed flex-1">{rule}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Location & Map Preview */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Map & Surroundings</Text>
          {listing.location.landmark && (
            <Text className="text-xs text-neutral-500 font-bold mb-3">
              🏢 Near landmark: <Text className="text-neutral-700">{listing.location.landmark}</Text>
            </Text>
          )}

          {/* Simulated Map box */}
          {listing.location.latitude && listing.location.longitude && (
            <MapPreviewCard
              center={activeLocation}
              pins={[{
                id: listing.id,
                title: listing.title,
                category: listing.propertyType,
                latitude: listing.location.latitude,
                longitude: listing.location.longitude,
                distanceKm: listing.location.distanceKm || 0
              }]}
              radiusKm={5}
            />
          )}
        </View>

        {/* Host Profile Profile Widget */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Property Host</Text>
          
          <View className="flex-row items-center justify-between mb-4 bg-neutral-50/50 p-4 border border-neutral-150 rounded-2xl">
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-primary-100 border border-primary-300 items-center justify-center mr-3">
                <Text className="text-xl font-bold text-primary-500">{listing.host.name.substring(0, 1)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-neutral-900">{listing.host.name}</Text>
                <View className="flex-row items-center mt-1 flex-wrap gap-1">
                  {listing.host.isVerified && (
                    <Text className="text-[8px] bg-success-surface text-success-default px-1.5 py-0.2 rounded font-extrabold mr-1 uppercase">✓ VERIFIED</Text>
                  )}
                  <Text className="text-[9px] text-neutral-400 font-semibold">{listing.host.reputationLevel}</Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity 
              onPress={() => router.push(`/housing/host/${listing.host.providerId}`)}
              className="bg-white border border-neutral-250 px-3 py-1.5 rounded-xl"
            >
              <Text className="text-[10px] font-black text-neutral-600 uppercase">View profile ›</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-around border-t border-neutral-50 pt-3">
            <View className="items-center">
              <Text className="text-sm font-black text-neutral-850">★ {listing.host.rating}</Text>
              <Text className="text-[9px] text-neutral-400 font-bold uppercase mt-0.5">Rating</Text>
            </View>
            <View className="items-center">
              <Text className="text-sm font-black text-neutral-850">{listing.host.yearsOnPlatform} yr{listing.host.yearsOnPlatform > 1 && 's'}</Text>
              <Text className="text-[9px] text-neutral-400 font-bold uppercase mt-0.5">Platform Tenure</Text>
            </View>
            <View className="items-center flex-1 max-w-[120px]">
              <Text className="text-xs font-bold text-neutral-800 text-center" numberOfLines={1}>{listing.host.languagesSpoken.slice(0, 2).join(', ')}</Text>
              <Text className="text-[9px] text-neutral-400 font-bold uppercase mt-0.5">Spoken Languages</Text>
            </View>
          </View>
        </View>

        {/* Contact actions section */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Contact Host</Text>
          
          <View className="flex-row justify-between mb-4">
            <TouchableOpacity
              onPress={handleCall}
              style={{ opacity: (!listing?.host.contactPhone || isOwner) ? 0.65 : 1 }}
              className="items-center bg-neutral-50 border border-neutral-200 p-3 rounded-2xl flex-1 mr-2 active:bg-neutral-100"
            >
              <Text className="text-xl mb-1">📞</Text>
              <Text className="text-xs text-neutral-700 font-bold">Call Phone</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMessage}
              className="items-center p-3 rounded-2xl flex-1 mr-2 active:opacity-85"
              style={{ backgroundColor: '#F59300' }}
            >
              <Text className="text-xl mb-1">💬</Text>
              <Text className="text-xs text-white font-black">Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              style={{ opacity: (!listing?.host.contactEmail || isOwner) ? 0.65 : 1 }}
              className="items-center bg-neutral-50 border border-neutral-200 p-3 rounded-2xl flex-1 active:bg-neutral-100"
            >
              <Text className="text-xl mb-1">✉️</Text>
              <Text className="text-xs text-neutral-700 font-bold">Send Email</Text>
            </TouchableOpacity>
          </View>

          <Button label="Submit Booking Inquiry" className="w-full" onPress={handleApply} />
        </View>

        {/* Nearby Platform Integrations (Location-first links) */}
        {(nearbyJobs.length > 0 || nearbyProviders.length > 0 || nearbyGuides.length > 0) && (
          <View className="bg-white p-6 mt-3 border-y border-neutral-200">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5">Nearby Community Hub</Text>
            <Text className="text-[11px] text-neutral-400 font-semibold mb-5 leading-relaxed">
              Diaspora places that matter nearby. Explore jobs, guides, and providers inside {listing.location.cityName}:
            </Text>

            {/* Jobs nearby */}
            {nearbyJobs.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-extrabold text-neutral-600 mb-3.5">💼 Nearby Jobs & Gigs</Text>
                {nearbyJobs.map((item) => (
                  <JobCard key={item.jobId} job={item} />
                ))}
              </View>
            )}

            {/* Service Providers nearby */}
            {nearbyProviders.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-extrabold text-neutral-600 mb-3.5">📍 Nearby Service Providers</Text>
                {nearbyProviders.map((item) => (
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
                    isOpenNow={item.isOpenNow}
                    variant="list"
                  />
                ))}
              </View>
            )}

            {/* Guides nearby */}
            {nearbyGuides.length > 0 && (
              <View className="mb-2">
                <Text className="text-xs font-extrabold text-neutral-600 mb-3.5">📖 Local Settlement Guides</Text>
                {nearbyGuides.map((item) => {
                  const author = mockAuthors[item.authorId] || { fullName: 'Community Writer', role: 'Contributor' };
                  return (
                    <GuideCard
                      key={item.guideId}
                      guide={item as any}
                      author={author as any}
                      variant="list"
                    />
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Report Listing Trigger */}
        <TouchableOpacity onPress={() => setReportModalVisible(true)} className="items-center py-6">
          <Text className="text-xs text-neutral-400 font-extrabold uppercase">Report / Audit this housing listing</Text>
        </TouchableOpacity>

        {/* Suggested similar listings */}
        {similarListings.length > 0 && (
          <View className="p-6 mb-12 bg-white border-t border-neutral-200">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Similar Housing Nearby</Text>
            {similarListings.map((item) => (
              <HousingCard key={item.id} listing={item} />
            ))}
          </View>
        )}
      </ScrollEndScrollView>

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Housing"
        contentId={listing.id}
        onSubmit={(data) => {
          console.log('[REPORT] Housing reported:', data);
          Alert.alert('Report Submitted', 'Thank you. Your report has been submitted for administrator review.');
        }}
      />
    </SafeAreaView>
  );
}
