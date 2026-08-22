import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { toList } from '@/lib/platform-envelope';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { Image } from 'expo-image';
import { useSavedStore } from '@/store/saved';
import { Button } from '@/components/Button';
import { ContactActionRow } from '@/components/ContactActionRow';
import { HousingCard } from '@/components/HousingCard';
import { JobCard } from '@/components/JobCard';
import { ProviderCard } from '@/components/ProviderCard';
import { GuideCard } from '@/components/GuideCard';
import { ListingPhoto } from '@/components/ListingPhoto';
import { ReportModal } from '@/components/ReportModal';
import { apiClient } from '@/lib/apiClient';
import {
  isViewingAlreadyOpenError,
  requestViewing,
  viewingRefusal,
} from '@/lib/housing-viewings-api';
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
import { useEffectRefresh } from '@/hooks/usePullToRefresh';

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

  // This screen loads through `useEffect` + `apiClient`, so there is no
  // TanStack `refetch` to hand over. `refreshNonce` sits in the fetch
  // effect's dependency list and re-runs it.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(loading);
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
        // Remediation Wave A′. `/housing/{id}` has never existed; the listing
        // read is `/housing/listings/{idOrSlug}` and accepts either form.
        const response = await apiClient.get(`/housing/listings/${encodeURIComponent(String(id))}`);
        const data: HousingListing = response.data.data;
        
        // Calculate distance locally
        if (data.location?.latitude && data.location?.longitude) {
          data.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, data.location.latitude, data.location.longitude);
        }
        
        setListing(data);

        // 1. Similar listings in the same city, sorted by proximity.
        // `/housing/search`, and the city parameter is `city` — `cityName` is
        // what the *provider* directory calls it. The platform is not
        // consistent about this, so neither name can be assumed.
        const similarRes = await apiClient.get('/housing/search', {
          params: {
            city: data.location.cityName,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            limit: 5,
          }
        });
        // The route returns a cursor page, not a bare array. `.filter` on the
        // page object was a crash rather than an empty list.
        const allListings = toList<HousingListing>(similarRes.data);
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
          setNearbyJobs(toList(jobsRes.data).slice(0, 2));
        } catch (err) {
          console.log('No nearby jobs loaded', err);
        }

        // 3. Nearby providers. `/listings` was never a route on this platform;
        // the directory is `/providers`, and it takes the coordinates directly
        // rather than needing the client to narrow a page afterwards.
        //
        // The `/discovery/search` fallback is gone with it. That route does not
        // exist either, so the fallback could only ever turn one failure into
        // two — and it was reached on *every* provider load, because the call it
        // was catching for always failed.
        try {
          const provRes = await apiClient.get('/providers', {
            params: {
              cityName: data.location.cityName,
              latitude: data.location.latitude,
              longitude: data.location.longitude,
              radiusKm: 10,
              sort: 'distance',
              limit: 5,
            }
          });
          setNearbyProviders(toList(provRes.data).slice(0, 2));
        } catch (err) {
          // A signed-out viewer gets a 401 here: unlike housing and marketplace
          // discovery, the provider directory requires `providers.read`. An
          // empty section is the right outcome — the rest of the page is public.
          console.log('No nearby providers loaded', err);
        }

        // 4. Nearby guides. `/guides` is the real discovery route; the platform
        // has no cross-domain `/discovery/search` aggregator at all, which is
        // recorded as MC-03 and is genuinely missing from both repositories.
        try {
          const guidesRes = await apiClient.get('/guides', {
            params: { countryCode: data.location.countryCode, limit: 5 }
          });
          setNearbyGuides(toList(guidesRes.data).slice(0, 2));
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
  }, [id, activeLocation, refreshNonce]);

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

  // ── Asking to view the property — Remediation Wave B′ ──────────────────────
  //
  // This was the wave's most expensive fabrication. The button said "Submit
  // Booking Inquiry", the dialog promised to "securely share your Diaspora
  // verified residency and community profile details", and confirming it showed
  // **"Application Sent! {host} has received your request and will contact you
  // shortly."** — with no request, no record, and nothing shared. A member who
  // believed it stopped looking for somewhere to live and waited for a call that
  // was never coming.
  //
  // Two things had to change, not one.
  //
  // **The claim about the profile is gone**, because it was never true and could
  // not become true: nothing in `Diaspora.Modules.Housing` carries a member's
  // verification record to a landlord. `RequestViewingRequest` has four optional
  // fields — a preferred time, a virtual-viewing flag, a duration and a message
  // — and that is the whole of what the host receives.
  //
  // **The action is a viewing, not an application.** The module has no
  // application concept at all, so "apply" had nothing to bind to. It has a
  // relocation workflow whose front door is
  // `POST /housing/listings/{id}/viewings`, and asking to be shown a property is
  // what a member on this screen is actually trying to do. Requesting a viewing
  // deliberately does not hold the unit — the property stays on the market and
  // several people may hold a viewing on the same flat — so the wording below
  // promises interest, never a decision.
  //
  // The listing's `id` is sent rather than the `id` route parameter: the read
  // route accepts a slug, the viewing route is constrained to a GUID, and a
  // member who arrived here from a slug link would otherwise get a bind failure.
  const [isRequestingViewing, setIsRequestingViewing] = useState(false);

  const submitViewingRequest = async () => {
    if (!listing) return;

    setIsRequestingViewing(true);

    try {
      // Every field is optional and none is collected on this screen, so an
      // empty body it is. Inventing a preferred time to fill the field is how a
      // member misses an appointment they never chose — a null `preferredAt`
      // means "the host proposes a time", which is the honest default.
      const viewing = await requestViewing(listing.id);

      // Reported only after the server answered, and worded to match what it
      // actually recorded: the request is *waiting on the host*, not accepted.
      showAlert({
        type: 'success',
        title: 'Viewing requested',
        message:
          `We have sent your request to ${listing.host.name}. It is waiting for them to ` +
          `propose a time — you will be notified when they respond. Your request does not ` +
          `hold the property, so it stays available to others in the meantime.` +
          (viewing.status && viewing.status !== 'Requested' ? ` Status: ${viewing.status}.` : ''),
      });
    } catch (cause) {
      // "You already have one open" is the member's goal already met, so it is
      // not dressed as a failure. Everything else says plainly that the host did
      // not receive anything, because the alternative is waiting for a call that
      // is not coming.
      if (isViewingAlreadyOpenError(cause)) {
        showAlert({
          type: 'info',
          title: 'You have already asked',
          message: `${listing.host.name} already has a viewing request from you on this property. There is nothing more to send.`,
        });
        return;
      }

      const refusal = viewingRefusal(cause);
      showAlert({ type: 'error', title: refusal.title, message: refusal.message });
    } finally {
      setIsRequestingViewing(false);
    }
  };

  const handleApply = () => {
    if (!listing) return;

    if (isOwner) {
      showAlert({
        type: 'info',
        title: 'Your Listing',
        message: 'This housing listing was posted by you, so you cannot book a viewing on it.',
      });
      return;
    }

    showAlert({
      type: 'question',
      title: 'Ask to view this property?',
      message:
        `We will ask ${listing.host.name} to show you around. They choose the time and reply to ` +
        `you here — this does not reserve the property and does not commit you to anything.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send request', onPress: () => void submitViewingRequest() },
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
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-semibold text-content-muted mt-3">Loading property details...</Text>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">🔍</Text>
        <Text className="text-base font-extrabold text-content-primary">Listing Not Found</Text>
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed max-w-[240px]">
          This property listing may have been rented, expired, or archived.
        </Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  // Remediation Wave E. The carousel read `listing.gallery` directly, which was
  // safe only because the development handler guaranteed at least one entry — it
  // substituted a stock photograph for a listing that had none. It no longer
  // does, so the gallery may legitimately be empty, and the cover is folded in
  // for a listing that has one and no gallery. Blanks are dropped rather than
  // rendered as empty frames with a dot underneath.
  const photos = [
    ...(listing.gallery ?? []),
    ...(listing.coverImage ? [listing.coverImage] : []),
  ].filter((uri, index, all) => uri.trim().length > 0 && all.indexOf(uri) === index);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Dynamic Header */}
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-content-tertiary">←</Text>
          </TouchableOpacity>
          <Text className="text-base font-bold text-content-primary" numberOfLines={1}>Homes & Housing</Text>
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

      <ScrollEndScrollView
        refreshControl={refreshControl} className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {/* Photo Gallery Carousel */}
        <View className="bg-surface-card">
          {/* Remediation Wave E. A listing with no photographs now arrives with
              an empty gallery rather than a stock photograph of somebody else's
              flat, and an empty carousel is a blank band a renter reads as a
              loading failure. */}
          {photos.length === 0 ? (
            <ListingPhoto
              uri={null}
              style={{ width: '100%', height: 240 }}
              label="No photos of this property"
            />
          ) : (
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
            {photos.map((img, i) => (
              <View key={i} style={{ width: Platform.OS === 'web' ? 450 : undefined }} className="w-screen h-60">
                <Image
                  source={{ uri: img }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
            ))}
          </ScrollView>
          )}

          {/* Indicator dots */}
          {photos.length > 1 && (
            <View className="flex-row justify-center items-center py-3.5 bg-surface-card">
              {photos.map((_, i) => (
                <View
                  key={i}
                  className={`w-2 h-2 rounded-full mx-1 ${
                    activeImageIdx === i ? 'bg-primary-500 w-4' : 'bg-subtle'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Basic Property Header card */}
        <View className="bg-surface-card px-6 py-6 border-b border-subtle shadow-sm">
          <View className="flex-row items-center justify-between mb-3.5">
            <View className="bg-primary-50 px-2.5 py-1 rounded-full border border-primary-100">
              <Text className="text-[10px] font-extrabold text-primary-600 uppercase">🏠 {listing.listingType} · {listing.propertyType}</Text>
            </View>
            <View className="bg-surface-background px-2.5 py-1 rounded-full border border-subtle">
              <Text className="text-[10px] font-bold text-content-muted uppercase">👁️ {listing.viewCount} views</Text>
            </View>
          </View>

          <Text className="text-xl font-black text-content-primary leading-tight mb-2">{listing.title}</Text>
          
          <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2">
            <Text className="text-xs text-content-muted font-bold">
              📍 Address: {listing.location.addressLine} · {listing.location.cityName}
            </Text>
            {listing.location.distanceKm !== undefined && (
              <DistanceBadge distanceKm={listing.location.distanceKm} showCommuteTime={true} />
            )}
          </View>

          <View className="flex-row items-center justify-between border-t border-faint pt-4">
            <View>
              <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Monthly Rent</Text>
              <Text className="text-xl font-black text-primary-500 mt-0.5">{getCurrencySymbol()}{listing.rent}</Text>
              {listing.billsIncluded && <Text className="text-[10px] font-bold text-success-default">Bills Included</Text>}
            </View>
            
            <View className="items-end">
              <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Lease & Security</Text>
              <Text className="text-sm font-extrabold text-content-strong mt-0.5">Deposit: {getCurrencySymbol()}{listing.deposit}</Text>
              <Text className="text-[10px] text-content-muted font-semibold mt-0.5">Lease: {listing.leaseDuration}</Text>
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
            <View className="mt-4 pt-4 border-t border-faint">
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
        <View className="bg-surface-card px-6 py-5 mt-3 border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Listing Details</Text>
          <View className="flex-row flex-wrap gap-y-4">
            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">🛏️</Text>
              <View>
                <Text className="text-[10px] font-bold text-content-faint uppercase">Bedrooms</Text>
                <Text className="text-xs font-bold text-content-strong">{listing.bedrooms} Bedroom{listing.bedrooms > 1 && 's'}</Text>
              </View>
            </View>

            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">🚿</Text>
              <View>
                <Text className="text-[10px] font-bold text-content-faint uppercase">Bathrooms</Text>
                <Text className="text-xs font-bold text-content-strong">{listing.bathrooms} Bathroom{listing.bathrooms > 1 && 's'}</Text>
              </View>
            </View>

            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">🛋️</Text>
              <View>
                <Text className="text-[10px] font-bold text-content-faint uppercase">Furnishing</Text>
                <Text className="text-xs font-bold text-content-strong">{listing.furnished}</Text>
              </View>
            </View>

            <View className="w-1/2 flex-row items-center">
              <Text className="text-lg mr-2.5">📅</Text>
              <View>
                <Text className="text-[10px] font-bold text-content-faint uppercase">Availability</Text>
                <Text className="text-xs font-bold text-content-strong">{listing.availabilityDate}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Lifestyle Match Badges */}
        {listing.lifestyleMatches && listing.lifestyleMatches.length > 0 && (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">Lifestyle Match</Text>
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
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">About the property</Text>
          <Text className="text-sm text-content-secondary leading-relaxed">{listing.description}</Text>
        </View>

        {/* Amenities */}
        {listing.amenities && listing.amenities.length > 0 && (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Included Amenities</Text>
            <View className="flex-row flex-wrap gap-y-3">
              {listing.amenities.map((item, idx) => (
                <View key={idx} className="w-1/2 flex-row items-center mb-1">
                  <Text className="text-primary-500 font-extrabold mr-2">✓</Text>
                  <Text className="text-xs text-content-secondary font-semibold">{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* House Rules */}
        {listing.houseRules && listing.houseRules.length > 0 && (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">House Rules</Text>
            {listing.houseRules.map((rule, idx) => (
              <View key={idx} className="flex-row items-start mb-3">
                <Text className="text-content-faint mr-2.5">•</Text>
                <Text className="text-xs text-content-tertiary font-semibold leading-relaxed flex-1">{rule}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Location & Map Preview */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Map & Surroundings</Text>
          {listing.location.landmark && (
            <Text className="text-xs text-content-muted font-bold mb-3">
              🏢 Near landmark: <Text className="text-content-secondary">{listing.location.landmark}</Text>
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
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Property Host</Text>
          
          <View className="flex-row items-center justify-between mb-4 bg-surface-background/50 p-4 border border-faint rounded-2xl">
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-primary-100 border border-primary-300 items-center justify-center mr-3">
                <Text className="text-xl font-bold text-primary-500">{listing.host.name.substring(0, 1)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-content-primary">{listing.host.name}</Text>
                <View className="flex-row items-center mt-1 flex-wrap gap-1">
                  {listing.host.isVerified && (
                    <Text className="text-[8px] bg-success-surface text-success-default px-1.5 py-0.2 rounded font-extrabold mr-1 uppercase">✓ VERIFIED</Text>
                  )}
                  <Text className="text-[9px] text-content-faint font-semibold">{listing.host.reputationLevel}</Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity 
              onPress={() => router.push(`/housing/host/${listing.host.providerId}`)}
              className="bg-surface-card border border-subtle px-3 py-1.5 rounded-xl"
            >
              <Text className="text-[10px] font-black text-content-tertiary uppercase">View profile ›</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-around border-t border-faint pt-3">
            <View className="items-center">
              <Text className="text-sm font-black text-content-primary">★ {listing.host.rating}</Text>
              <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">Rating</Text>
            </View>
            <View className="items-center">
              <Text className="text-sm font-black text-content-primary">{listing.host.yearsOnPlatform} yr{listing.host.yearsOnPlatform > 1 && 's'}</Text>
              <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">Platform Tenure</Text>
            </View>
            <View className="items-center flex-1 max-w-[120px]">
              <Text className="text-xs font-bold text-content-strong text-center" numberOfLines={1}>{listing.host.languagesSpoken.slice(0, 2).join(', ')}</Text>
              <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">Spoken Languages</Text>
            </View>
          </View>
        </View>

        {/* Contact actions section */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Contact Host</Text>
          
          <View className="mb-4">
            <ContactActionRow
              actions={[
                {
                  label: 'Call',
                  icon: 'call-outline',
                  onPress: handleCall,
                  disabled: !listing?.host.contactPhone || isOwner,
                  accessibilityHint: listing?.host.contactPhone
                    ? 'Calls the host'
                    : 'No phone number on this listing',
                },
                {
                  label: 'Message',
                  icon: 'chatbubble-outline',
                  onPress: handleMessage,
                  isPrimary: true,
                  accessibilityHint: 'Opens a conversation with the host',
                },
                {
                  label: 'Email',
                  icon: 'mail-outline',
                  onPress: handleEmail,
                  disabled: !listing?.host.contactEmail || isOwner,
                  accessibilityHint: listing?.host.contactEmail
                    ? 'Emails the host'
                    : 'No email address on this listing',
                },
              ]}
            />
          </View>

          {/* "Submit Booking Inquiry" implied a booking. This asks to be shown
              the property, which is the thing the server will do. */}
          <Button
            label="Ask to view this property"
            className="w-full"
            onPress={handleApply}
            isLoading={isRequestingViewing}
            loadingLabel="Sending your request…"
            accessibilityHint="Asks the host to show you the property. Does not reserve it."
          />
        </View>

        {/* Nearby Platform Integrations (Location-first links) */}
        {(nearbyJobs.length > 0 || nearbyProviders.length > 0 || nearbyGuides.length > 0) && (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-1.5">Nearby Community Hub</Text>
            <Text className="text-[11px] text-content-faint font-semibold mb-5 leading-relaxed">
              Diaspora places that matter nearby. Explore jobs, guides, and providers inside {listing.location.cityName}:
            </Text>

            {/* Jobs nearby */}
            {nearbyJobs.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-extrabold text-content-tertiary mb-3.5">💼 Nearby Jobs & Gigs</Text>
                {nearbyJobs.map((item) => (
                  <JobCard key={item.jobId} job={item} />
                ))}
              </View>
            )}

            {/* Service Providers nearby */}
            {nearbyProviders.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-extrabold text-content-tertiary mb-3.5">📍 Nearby Service Providers</Text>
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
                <Text className="text-xs font-extrabold text-content-tertiary mb-3.5">📖 Local Settlement Guides</Text>
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
          <Text className="text-xs text-content-faint font-extrabold uppercase">Report / Audit this housing listing</Text>
        </TouchableOpacity>

        {/* Suggested similar listings */}
        {similarListings.length > 0 && (
          <View className="p-6 mb-12 bg-surface-card border-t border-subtle">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Similar Housing Nearby</Text>
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
        // The `onSubmit` that used to live here logged the report and then
        // showed a *second* fabricated confirmation on top of the modal's own.
        // `ReportModal` now posts to `POST /community/reports` and confirms only
        // what the server accepted, so this screen has nothing left to add.
      />
    </SafeAreaView>
  );
}
