import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
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
import { createSignedUrl } from '@/lib/media-api';
import {
  isViewingAlreadyOpenError,
  requestViewing,
  viewingRefusal,
} from '@/lib/housing-viewings-api';
import { mockAuthors } from '@/mocks/community-data';
import type { HousingListing } from '@/types/housing';
import { housingMediaIds } from '@/types/housing';
import { placeLabelOf } from '@/lib/listing-place';
import { toHousingCardListings, type HousingCardWire } from '@/lib/housing-cards';
import { ConversationHub } from '@/lib/conversation-hub';
import { homeConversationSubtitle, hostFromLandlord, isHostedBy } from '@/lib/housing-host';
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
import { trackContentViewed } from '@/lib/analytics/content-events';
import { itemAnalyticsRoute } from '@/lib/analytics/item-pages';
import { readOutcome, type ReadOutcome } from '@/lib/read-outcome';

export default function HousingDetailScreen() {
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
    trackContentViewed({ contentType: 'housing', contentId: id });
  }, [id]);
  const { showAlert } = useNotification();
  const [listing, setListing] = useState<HousingListing | null>(null);

  // The landlord's rating, straight off the wire. Absent — not zero — when
  // nobody has completed a tenancy with them.
  const hostRating = listing?.host?.rating ?? null;
  const [similarListings, setSimilarListings] = useState<HousingListing[]>([]);
  
  // Nearby platform elements
  const [nearbyJobs, setNearbyJobs] = useState<any[]>([]);
  const [nearbyProviders, setNearbyProviders] = useState<any[]>([]);
  const [nearbyGuides, setNearbyGuides] = useState<any[]>([]);
  
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  // ── A failure is not an absence — 16 Sep 2026 ───────────────────────────
  //
  // Every failed read fell through to "Listing Not Found … may have been
  // rented, expired, or archived", so a dropped connection told the member a
  // home had been taken. Null while loading or loaded; otherwise what the
  // failure actually established. See `lib/read-outcome.ts`.
  const [failure, setFailure] = useState<ReadOutcome | null>(null);
  const [attempt, setAttempt] = useState(0);

  /**
   * The listing's photographs, as URLs this device can actually load.
   *
   * ── Why this is not just a field read ───────────────────────────────────
   *
   * `HousingListingResponse.media` carries `{ mediaId, role, order, caption }`
   * — identifiers, not links — and housing media is private, so the bytes are
   * behind `POST /media/{id}/signed-url`. The screen used to read a `gallery`
   * field that does not exist and treat `coverImage` as a string when it is one
   * of those objects; see the comment above `photos`.
   *
   * Empty until the links come back. A failed mint drops that one photograph
   * rather than the listing: a member should still see the rent and the address
   * when one image will not load.
   */
  const [photoUris, setPhotoUris] = useState<string[]>([]);

  // This screen loads through `useEffect` + `apiClient`, so there is no
  // TanStack `refetch` to hand over. `refreshNonce` sits in the fetch
  // effect's dependency list and re-runs it.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(loading);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const { save, unsave, isSaved } = useSavedStore();
  const saved = listing ? isSaved(listing.id) : false;
  const { user } = useAuthStore();
  // The owner's user id against the member's. This compared `providerId`, which
  // is not a person's id and is null for most landlords — see `lib/housing-host`.
  const isOwner = isHostedBy(listing?.host, user?.userId);

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  // ── The carousel needs a real number, not a utility class ─────────────────
  //
  // See the gallery below. `w-screen` resolves to `100vw`, which is a web unit;
  // on Android the page measured **zero** wide, and a zero-sized `expo-image`
  // never issues its request at all. The signed URL was minted and then simply
  // never fetched — confirmed against the server's own log, which showed the
  // `POST …/signed-url` with no `GET …/content` after it.
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    const fetchHousingDetails = async () => {
      setLoading(true);
      setFailure(null);
      try {
        // Remediation Wave A′. `/housing/{id}` has never existed; the listing
        // read is `/housing/listings/{idOrSlug}` and accepts either form.
        const response = await apiClient.get(`/housing/listings/${encodeURIComponent(String(id))}`);
        const raw = response.data.data;

        // **The wire calls the landlord `landlord`; this screen calls it `host`.**
        // Nothing bridged the two, so `listing.host` was undefined and the first
        // `listing.host.name.substring(0, 1)` threw — this screen could not render
        // a real listing at all. Normalised here, and only from fields the summary
        // actually carries: no tenure, no languages, no telephone number.
        // ── The wire nests what this screen reads flat ────────────────────
        //
        // `HousingListingResponse` groups the listing's facts:
        //
        //     price:        { isDisclosed, amount, currencyCode, period,
        //                     depositAmount, depositRequired, moveInTotal, … }
        //     capacity:     { bedrooms, bathrooms, maximumOccupants, … }
        //     availability: { availableFrom, availableUntil, totalUnits, … }
        //     address:      { line1, postalCode, latitude, longitude, … }
        //     furnishedStatus / leaseType / parking      — top-level strings
        //
        // The screen reads `listing.rent`, `listing.deposit`, `listing.currency`,
        // `listing.bedrooms`, `listing.bathrooms`, `listing.furnished`,
        // `listing.leaseDuration` and `listing.availabilityDate` — none of which
        // the server sends. On the release build that rendered, in the member's
        // own words:
        //
        //     MONTHLY RENT   undefined
        //     Deposit: undefined      Lease:
        //     BEDROOMS  Bedroom       BATHROOMS  Bathroom
        //
        // The rent is the single most important fact on a rental listing, and it
        // said "undefined". Flattened here, beside the `landlord → host` mapping
        // that already existed for the same reason, so the render stays as it is.
        //
        // Nothing is invented. An undisclosed price stays undefined and the
        // render below says so; `"Unspecified"` — the server's own null lease —
        // is dropped rather than shown as a lease term.
        const price = raw.price ?? {};
        const capacity = raw.capacity ?? {};
        const availability = raw.availability ?? {};

        const data: HousingListing = {
          ...raw,
          rent: price.isDisclosed === false ? undefined : price.amount,
          currency: price.currencyCode ?? undefined,
          deposit: price.depositAmount ?? 0,
          billsIncluded: price.utilitiesIncluded ?? false,
          internetIncluded: price.internetIncluded ?? false,
          bedrooms: capacity.bedrooms ?? 0,
          bathrooms: capacity.bathrooms ?? 0,
          furnished: raw.furnishedStatus ?? undefined,
          leaseDuration:
            raw.leaseType && raw.leaseType !== 'Unspecified' ? raw.leaseType : undefined,
          availabilityDate: availability.availableFrom ?? undefined,
          // Including `ownerUserId`, which this inline mapping once left out, so
          // every message about a home went to nobody.
          host: hostFromLandlord(raw.landlord),
        };
        
        // Calculate distance locally
        if (data.location?.latitude && data.location?.longitude) {
          data.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, data.location.latitude, data.location.longitude);
        }
        
        setListing(data);

        // 1. Similar homes in the same town.
        // `/housing/search`, and the city parameter is `city` — `cityName` is
        // what the *provider* directory calls it. The platform is not
        // consistent about this, so neither name can be assumed.
        //
        // 15 Sep 2026: no member position any more. Coordinates make the search
        // a 5 km circle around the member (lib/discover-scope.ts), which for a
        // member known only by country is the middle of the country — not "the
        // same town as this home".
        //
        // In its own `try`, like the three reads below it: this home has loaded,
        // and a failed search for its neighbours must not take the page down
        // with it — which it did, into the "not found" panel.
        try {
          const similarRes = await apiClient.get('/housing/search', {
            params: {
              city: data.location.cityName || undefined,
              countryCode: data.location.countryCode || undefined,
              limit: 5,
            }
          });
          // The route returns a cursor page of `HousingListingCardResponse` rows —
          // `landlord`, not `host` — mapped once so the card can read them.
          const allListings = toHousingCardListings(toList<HousingCardWire>(similarRes.data));
          setSimilarListings(allListings.filter((h) => h.id !== data.id).slice(0, 2));
        } catch (err) {
          console.log('No similar homes loaded', err);
          setSimilarListings([]);
        }

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
        // 404 is the platform saying the home is gone; anything else answered
        // nothing, and the screen says so rather than claiming it was let.
        setFailure(readOutcome(err));
        setListing(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchHousingDetails();
    }
  }, [id, activeLocation, refreshNonce, attempt]);

  // ── Resolve the listing's media identifiers to loadable URLs ─────────────
  //
  // Runs off `listing`, not off the fetch, so a refresh that returns the same
  // media does not re-mint. Signed links are short-lived and deliberately not
  // cached anywhere but this component's state — a stored one is a credential
  // with an expiry nobody watches (`media-api.ts`).
  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      // `housingMediaIds` owns the shape rule — cover first, de-duplicated,
      // tolerant of both the string form older fixtures use and the reference
      // the wire actually sends.
      const ids = housingMediaIds(listing ?? {});

      if (ids.length === 0) {
        if (!cancelled) setPhotoUris([]);
        return;
      }

      const minted = await Promise.all(
        ids.map(async (mediaId) => {
          try {
            const signed = await createSignedUrl(mediaId);
            return typeof signed?.url === 'string' ? signed.url : null;
          } catch {
            // One photograph that will not load is not a broken listing.
            return null;
          }
        })
      );

      if (!cancelled) {
        setPhotoUris(minted.filter((url): url is string => typeof url === 'string' && url.length > 0));
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [listing]);

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
      // The member who owns the landlord profile — a person, which neither the
      // landlord profile id nor the provider id is.
      recipientId: listing.host.ownerUserId ?? '',
      recipientName: listing.host.name,
      contextType: 'HousingListing',
      entityId: listing.id,
      entityTitle: listing.title,
      entitySubtitle: homeConversationSubtitle(listing.host.name, placeLabelOf(listing as never)),
      // Was `listing.gallery?.[0]` — a field the wire does not send, so the
      // conversation card's thumbnail was always absent. `photoUris` holds the
      // signed links this screen already resolved.
      entityImageUrl: photoUris[0],
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
        buttons: [
          { text: 'Close', style: 'cancel' },
          { text: 'See your requests', onPress: () => router.push({ pathname: '/housing/viewings', params: { side: 'member' } }) },
        ],
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
          buttons: [
            { text: 'Close', style: 'cancel' },
            { text: 'See your requests', onPress: () => router.push({ pathname: '/housing/viewings', params: { side: 'member' } }) },
          ],
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

  if (failure === 'unreachable') {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">⚠️</Text>
        <Text className="text-base font-extrabold text-content-primary text-center">
          We could not load this home
        </Text>
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed max-w-[260px]">
          Diaspora could not be reached just now, so we cannot say whether this home is still
          listed. Check your connection and try again.
        </Text>
        <Button
          label="Try again"
          className="mt-6 w-full"
          onPress={() => setAttempt((count) => count + 1)}
        />
        <Button label="Go back" variant="outline" className="mt-3 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">🔍</Text>
        <Text className="text-base font-extrabold text-content-primary">This home is no longer listed</Text>
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed max-w-[240px]">
          It may have been let or taken down by the landlord.
        </Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  /**
   * The owner's own figures, reachable from the home itself — 16 Sep 2026.
   *
   * `/analytics/content/housing/{id}` has served a home's views, enquiries and
   * viewings since Phase 15, and the only way in was the creator dashboard's
   * content list. A landlord standing on their own listing had no way to ask
   * how it was doing.
   */
  const analyticsRoute = itemAnalyticsRoute('Housing', listing.id);

  // ── This line crashed the application (Android UAT, 31 Aug 2026) ──────────
  //
  // It was:
  //
  //     const photos = [
  //       ...(listing.gallery ?? []),
  //       ...(listing.coverImage ? [listing.coverImage] : []),
  //     ].filter((uri, …) => uri.trim().length > 0 && …);
  //
  // Two assumptions, both wrong against the deployed contract:
  //
  //   * **`gallery` is not a field.** `HousingListingResponse` carries `media`,
  //     an array of `{ mediaId, role, order, caption }`.
  //   * **`coverImage` is not a string.** It is one of those same objects.
  //
  // So `uri` was an object, `uri.trim` was `undefined`, and calling it threw
  // `TypeError: undefined is not a function` **during render** — which React
  // could not recover from. The process died to the launcher, deterministically,
  // on every housing listing that had a photograph.
  //
  // And every publishable listing has one: `POST /housing/listings/{id}/publish`
  // refuses with `marketplace.listing.not-publishable` — "Before this listing can
  // be published it still needs at least one photograph". So the whole housing
  // detail surface was unreachable.
  //
  // Nothing caught it because the database held **no housing listings at all**;
  // the screen had never been rendered against a real one. It was found by
  // seeding two Mauritian listings through the real API and opening them.
  //
  // `mediaSources` below resolves the identifiers to signed URLs. Until it
  // returns, and for any that fail, `photos` is empty and the carousel renders
  // its "no photograph" panel — which is honest, and does not throw.
  const photos = photoUris;

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
              // An explicit width in pixels, which is what the marketplace
              // carousel has always used. `className="w-screen"` with
              // `width: undefined` gave the view no width on Android, so the
              // image inside it — sized `100%` of nothing — was never fetched
              // and the band rendered blank. A photograph that is requested but
              // never displayed and a photograph that is never requested look
              // identical on screen; only the server log tells them apart.
              <View key={i} style={{ width: Platform.OS === 'web' ? 450 : windowWidth, height: 240 }}>
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

        {isOwner && analyticsRoute ? (
          <View className="mx-5 mt-4 p-4 rounded-2xl bg-surface-card border border-subtle flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
                Your home
              </Text>
              <Text className="text-xs text-content-muted mt-1">
                You listed this home on Diaspora.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(analyticsRoute as never)}
              accessibilityRole="link"
              className="py-1"
            >
              <Text className="text-sm font-bold text-primary-500">How it is doing ›</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
              {/* `addressLine` is null whenever the landlord chose
                  `NeighborhoodOnly` disclosure — which is the default — so this
                  rendered "Address:  · Quatre Bornes", a label, two spaces and a
                  separator with nothing on its left. `placeLabelOf` builds the
                  line from whatever the listing actually discloses. */}
              📍 {listing.location.addressLine
                    ? `${listing.location.addressLine}, ${placeLabelOf(listing as never)}`
                    : placeLabelOf(listing as never)}
            </Text>
            {listing.location.distanceKm !== undefined && (
              <DistanceBadge distanceKm={listing.location.distanceKm} showCommuteTime={true} />
            )}
          </View>

          <View className="flex-row items-center justify-between border-t border-faint pt-4">
            <View>
              <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Monthly Rent</Text>
              {/* A landlord may publish without a price — `price.isDisclosed`
                  is false and `amount` is null. This used to render the word
                  "undefined" next to a currency symbol. */}
              <Text className="text-xl font-black text-primary-500 mt-0.5">
                {listing.rent != null ? `${getCurrencySymbol()}${listing.rent}` : 'On application'}
              </Text>
              {listing.billsIncluded && <Text className="text-[10px] font-bold text-success-default">Bills Included</Text>}
            </View>
            
            <View className="items-end">
              <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Lease & Security</Text>
              <Text className="text-sm font-extrabold text-content-strong mt-0.5">
                {listing.deposit ? `Deposit: ${getCurrencySymbol()}${listing.deposit}` : 'No deposit stated'}
              </Text>
              {/* Omitted rather than rendered as "Lease: " with nothing after it. */}
              {listing.leaseDuration ? (
                <Text className="text-[10px] text-content-muted font-semibold mt-0.5">Lease: {listing.leaseDuration}</Text>
              ) : null}
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
                {/* `availability.availableFrom` is null for a listing with no
                    stated start date, which rendered a blank value under a
                    heading. Available now is what null means here. */}
                <Text className="text-xs font-bold text-content-strong">
                  {listing.availabilityDate
                    ? new Date(listing.availabilityDate).toLocaleDateString()
                    : 'Available now'}
                </Text>
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
            
            {/* By the landlord's own identifier. This read `host.providerId` —
                a *Providers* id, null for every landlord who does not also run
                a service business — so the usual journey was
                `/housing/host/undefined`. Not offered at all where the wire
                carried no landlord. */}
            {listing.host.landlordId ? (
              <TouchableOpacity
                onPress={() => router.push(`/housing/host/${listing.host.landlordId}`)}
                accessibilityRole="link"
                className="bg-surface-card border border-subtle px-3 py-1.5 rounded-xl"
              >
                <Text className="text-[10px] font-black text-content-tertiary uppercase">View profile ›</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/*
            All three of these stats were invented, directly above
            "Pay £1850 deposit".

            The star read `listing.host.rating` against a field no response has
            ever carried; the tenure read `yearsOnPlatform`, also never sent, so
            it rendered "undefined yr"; and the languages called `.slice()` on an
            array that did not exist. Since `listing.host` itself was undefined —
            the wire calls it `landlord` — the panel threw before reaching any of
            them.

            The rating is now real: `LandlordReview`, which only a reservation
            that reached `Occupied` can produce. Tenure and languages are gone
            rather than guessed, because `LandlordSummaryResponse` carries
            neither. What replaced them is what the summary does carry.
          */}
          <View className="flex-row justify-around border-t border-faint pt-3">
            <View className="items-center">
              {hostRating && hostRating.totalReviews > 0 ? (
                <>
                  <Text className="text-sm font-black text-content-primary">
                    ★ {hostRating.average.toFixed(1)}
                  </Text>
                  <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">
                    {hostRating.totalReviews} {hostRating.totalReviews === 1 ? 'review' : 'reviews'}
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-sm font-black text-content-muted">—</Text>
                  <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">No reviews yet</Text>
                </>
              )}
            </View>
            <View className="items-center">
              <Text className="text-sm font-black text-content-primary">
                {listing.host.isVerified ? '✓' : '—'}
              </Text>
              <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">
                {listing.host.badge ?? 'Verification'}
              </Text>
            </View>
            <View className="items-center flex-1 max-w-[120px]">
              <Text className="text-xs font-bold text-content-strong text-center" numberOfLines={1}>
                {listing.host.kind ?? 'Landlord'}
              </Text>
              <Text className="text-[9px] text-content-faint font-bold uppercase mt-0.5">Host Type</Text>
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
