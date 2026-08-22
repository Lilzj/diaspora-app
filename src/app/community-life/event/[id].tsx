import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { apiClient } from '@/lib/apiClient';
import { useSavedStore } from '@/store/saved';
import { mockJobs } from '@/mocks/jobs-data';
import { mockHousingListings } from '@/mocks/housing-data';
import { mockListings } from '@/mocks/data';
import { mockCommunityUpdates, mockGuides, mockAuthors } from '@/mocks/community-data';
import { mockOrganizations } from '@/mocks/community-life-data';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { ProviderCard } from '@/components/ProviderCard';
import { UpdateCard } from '@/components/UpdateCard';
import { GuideCard } from '@/components/GuideCard';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ReportModal } from '@/components/ReportModal';
import { ConversationHub } from '@/lib/conversation-hub';

// B15 — CommunityLife owns the event and the RSVP; Financial owns the money.
import { SubjectPaymentButton } from '@/components/financial';

// Frontend Phase 16 — §7's single calendar implementation and §10's
// provider-neutral navigation. Neither is built here; both are called.
import { AddToCalendarSheet } from '@/components/integrations';
import { eventToDraft } from '@/lib/integrations/calendar';
import { openExternalDirections } from '@/lib/maps/external-navigation';
import type { Event } from '@/types/community-life';

// Frontend Phase 18 — §12's reminder, as a contextual entry point rather than
// a second automation surface. See the comment at the call site.
import { EventReminderButton } from '@/components/automation';
import { useTheme } from '@/design-system';
import { useEffectRefresh } from '@/hooks/usePullToRefresh';

export default function EventDetailScreen() {
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const bottomOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bottomOffset, {
      toValue: isBottomNavVisible ? 60 + insets.bottom : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [isBottomNavVisible, insets.bottom]);

  const [event, setEvent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // This screen loads through `useEffect` + `apiClient`, so there is no
  // TanStack `refetch` to hand over. `refreshNonce` sits in the fetch
  // effect's dependency list and re-runs it.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(isLoading);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [activeEcosystemTab, setActiveEcosystemTab] = useState<'Updates' | 'Jobs' | 'Housing' | 'Services' | 'Guides' | 'Community' | 'Restaurants'>('Updates');
  const [rsvpStatus, setRsvpStatus] = useState<'Going' | 'Interested' | 'Maybe' | null>(null);
  // Frontend Phase 16, §51. The sheet owns everything about the export; this
  // screen owns only whether it is open.
  const [isCalendarSheetOpen, setCalendarSheetOpen] = useState(false);

  const { save, unsave, isSaved } = useSavedStore();
  const saved = isSaved(id);

  useEffect(() => {
    const fetchEventDetails = async () => {
      setIsLoading(true);
      setErrorMsg('');
      try {
        const res = await apiClient.get(`/community-life/events/${id}`);
        const data = res.data.data;
        setEvent(data);
        setRsvpStatus(data.rsvpStatus);
      } catch (err: any) {
        console.error('Error fetching event details', err);
        setErrorMsg(err?.response?.data?.message || 'Failed to load event details.');
      } finally {
        setIsLoading(false);
      }
    };
    if (id) {
      fetchEventDetails();
    }
  }, [id, refreshNonce]);

  const handleSaveToggle = () => {
    if (saved) {
      unsave(id);
    } else {
      save(id, 'Event');
    }
  };

  const handleShare = () => {
    const priceText = !event.price || event.price === 0 ? 'FREE' : `${event.currency === 'GBP' ? '£' : '$'}${event.price}`;
    const msg = `Check out this event on Diaspora: "${event.title}" - ${priceText} in ${event.location.areaName} on ${event.date}!`;
    
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(window.location.href);
      alert('Event link copied to clipboard!');
    } else {
      Linking.openURL(`sms:&body=${encodeURIComponent(msg)}`);
    }
  };

  const handleCall = () => {
    const phone = event?.contact?.phone;
    if (!phone) {
      showAlert({ type: 'info', title: 'Unavailable', message: 'Organizer did not provide a direct call number.' });
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleMessage = async () => {
    if (!event) return;
    const organizerId = event.host?.id || event.host?.organizerId;
    if (!organizerId) {
      showAlert({ type: 'info', title: 'Unavailable', message: 'Organizer contact is not available in-app.' });
      return;
    }
    await ConversationHub.openOrCreateConversation({
      recipientId: organizerId,
      recipientName: event.host.name,
      contextType: 'CommunityEvent',
      entityId: id,
      entityTitle: event.title,
      entitySubtitle: `Event · ${event.date} · ${event.location?.areaName || ''}`,
      entityImageUrl: event.coverImage,
      entityStatus: 'Active',
      deepLink: `/community-life/event/${id}`,
      campaignSource: 'event_detail',
    });
  };

  const handleWebsite = () => {
    const site = event?.contact?.website;
    if (!site) {
      showAlert({ type: 'info', title: 'Unavailable', message: 'No website listed for this event.' });
      return;
    }
    Linking.openURL(site);
  };

  /**
   * Remediation Wave A′ — this was wrong in four ways at once.
   *
   * It sent `PUT /community-life/events/{id}` with `{ rsvpStatus }`. That is the
   * **organizer's event-edit route**, so an attendee RSVPing to somebody else's
   * event was attempting to edit it. The verb was wrong (the edit route is
   * `PATCH`), the field name was wrong (`UpdateEventRequest` has no
   * `rsvpStatus`, so System.Text.Json dropped it silently), and the actor was
   * wrong.
   *
   * The silent drop is what made this survive: a member with edit rights on
   * their own event got a 200 back and no RSVP, and everybody else got a 403 on
   * an action that should never have touched that route.
   *
   * The RSVP contract is `PUT .../events/{eventId}/rsvp` with `{ status }`, and
   * withdrawal is `DELETE` on the same path rather than a null status.
   *
   * `'Maybe'` is gone from the signature because the server does not have it.
   * `RsvpStatus` has seven members and this route accepts exactly two —
   * `Interested` and `Going`. The rest (`Waitlisted`, `CheckedIn`, `Attended`,
   * `Cancelled`, `NoShow`) are lifecycle states the server assigns; sending one
   * is refused as an invalid transition.
   */
  const handleRsvpChange = async (status: 'Going' | 'Interested') => {
    const previous = rsvpStatus;
    const newStatus = rsvpStatus === status ? null : status;

    // Optimistic, then reconciled against what the server actually stored — a
    // full event may answer `Waitlisted` rather than `Going`, and the member
    // needs to be told that rather than shown the status they asked for.
    setRsvpStatus(newStatus);

    try {
      if (newStatus === null) {
        await apiClient.delete(`/community-life/events/${id}/rsvp`);
        return;
      }

      const response = await apiClient.put(`/community-life/events/${id}/rsvp`, {
        status: newStatus,
      });

      const stored = response.data?.data?.status ?? newStatus;
      const waitlistPosition = response.data?.data?.waitlistPosition ?? null;
      setRsvpStatus(stored);

      showAlert({
        type: 'question',
        title: stored === 'Waitlisted' ? 'You are on the waitlist' : 'RSVP confirmed',
        message:
          stored === 'Waitlisted'
            ? `This event is full. You are number ${waitlistPosition ?? '—'} on the waitlist and will be told if a place opens.`
            : `You are marked as "${stored}" for this event.`,
      });
    } catch (err) {
      // The optimistic update is rolled back. Leaving it would show an RSVP the
      // organizer never received.
      setRsvpStatus(previous);
      console.error('Failed to update RSVP', err);
    }
  };

  // Filter nearby ecosystem items based on location
  /**
   * When this event starts, as an instant.
   *
   * `Event` stores `date` and `time` as separate wall-clock strings in
   * `event.timezone`, and the reminder contract needs an ISO instant because the
   * platform stores the moment rather than recomputing it. `eventToDraft` is the
   * platform's only wall-clock-to-instant conversion — the same one the "Add to
   * calendar" sheet above uses — so a reminder and a calendar entry for the same
   * event cannot drift an hour apart across a DST boundary.
   *
   * Null when the event has no parseable time. `eventToDraft` throws for that
   * case rather than guessing, and a reminder button that cannot say *when* is
   * one that must not offer to set anything.
   */
  const reminderMoment = useMemo<string | null>(() => {
    if (!event?.date || !event?.time) return null;
    try {
      return eventToDraft(event as Event).draft.startsAt;
    } catch {
      return null;
    }
  }, [event]);

  const ecosystemItems = useMemo(() => {
    if (!event) return { updates: [], jobs: [], housing: [], services: [], guides: [], orgs: [] };

    const city = event.location.cityName.toLowerCase();
    const area = event.location.areaName.toLowerCase();

    const updates = mockCommunityUpdates.filter(item => 
      item.location.cityName.toLowerCase() === city && 
      (item.location.areaName.toLowerCase() === area || item.title.toLowerCase().includes(city))
    ).slice(0, 2);

    const jobs = mockJobs.filter(item => 
      item.location.cityName.toLowerCase() === city
    ).slice(0, 2);

    const housing = mockHousingListings.filter(item => 
      item.location.cityName.toLowerCase() === city
    ).slice(0, 2);

    const services = mockListings.filter(item => 
      item.location.cityName.toLowerCase() === city
    ).slice(0, 2);

    const guides = mockGuides.filter(item => 
      item.country.name.toLowerCase().includes(city) || item.title.toLowerCase().includes(city)
    ).slice(0, 2);

    const orgs = mockOrganizations.filter(item => 
      item.location.cityName.toLowerCase() === city
    ).slice(0, 2);

    return { updates, jobs, housing, services, guides, orgs };
  }, [event]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-xs font-bold text-content-faint mt-4 uppercase tracking-widest">Loading Event Details...</Text>
      </SafeAreaView>
    );
  }

  if (errorMsg || !event) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Ionicons name="warning" size={48} color="#EF4444" />
        <Text className="text-lg font-bold text-content-strong text-center mt-3">{errorMsg || 'Event Not Found'}</Text>
        <Text className="text-xs text-content-faint mt-1.5 text-center leading-relaxed">
          This event might have been cancelled, past, or removed.
        </Text>
        <TouchableOpacity onPress={() => router.back()} className="bg-primary-500 px-6 py-3 rounded-full mt-6">
          <Text className="text-white font-bold text-xs">Back to Events</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const gallery = event.gallery && event.gallery.length > 0 ? event.gallery : [event.coverImage];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* Top Navbar */}
      <View className="bg-surface-card px-6 py-4 flex-row justify-between items-center border-b border-faint shadow-sm z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
          <Ionicons name="arrow-back" size={20} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <Text className="text-sm font-black text-content-primary uppercase tracking-widest">Event Details</Text>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={handleShare} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
            <Ionicons name="share-social-outline" size={18} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSaveToggle} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={18}
              color={saved ? '#EF4444' : '#374151'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollEndScrollView
        refreshControl={refreshControl}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        activeTab="discover"
        onBottomNavVisibilityChange={setIsBottomNavVisible}
        contentContainerStyle={{ paddingBottom: isBottomNavVisible ? 160 : 100 }}
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
            style={{ height: 240 }}
          >
            {gallery.map((img: string, idx: number) => (
              <Image
                key={idx}
                source={{ uri: img }}
                style={{ width: Platform.OS === 'web' ? 400 : 380, height: 240 }}
                contentFit="cover"
              />
            ))}
          </ScrollView>

          {/* Price Badge Overlay */}
          <View className="absolute top-4 left-4 bg-black/60 px-3.5 py-1.5 rounded-full">
            <Text className="text-white text-xs font-black uppercase tracking-widest">
              {!event.price || event.price === 0 ? 'FREE' : `${event.currency === 'GBP' ? '£' : '$'}${event.price}`}
            </Text>
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

        {/* Title & Core Meta */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">
              {event.category}
            </Text>
            <View className="bg-surface-muted px-2 py-0.5 rounded">
              <Text className="text-[10px] font-black text-content-muted uppercase">{event.timezone}</Text>
            </View>
          </View>

          <Text className="text-xl font-black text-content-primary leading-snug">{event.title}</Text>

          {/* Date, Time, Location */}
          <View className="mt-4 gap-3">
            <View className="flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                <Ionicons name="calendar-outline" size={16} color="#F59300" />
              </View>
              <View>
                <Text className="text-xs font-black text-content-strong">{event.date}</Text>
                <Text className="text-[10px] text-content-muted font-bold mt-0.5">{event.time} - {event.endTime}</Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                <Ionicons name="location-outline" size={16} color="#F59300" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-black text-content-strong">{event.location.addressLine}</Text>
                <Text className="text-[10px] text-content-muted font-bold mt-0.5">
                  {event.location.areaName}, {event.location.cityName} · {event.location.distanceKm} km away
                </Text>
              </View>
            </View>
          </View>

          {/* Available Seats & Attendees Future Indicator */}
          <View className="flex-row gap-2.5 mt-4 pt-3.5 border-t border-faint flex-wrap">
            <View className="bg-surface-muted border border-subtle px-3 py-1 rounded-xl flex-row items-center">
              <Ionicons name="people-outline" size={13} color="#6B7280" className="mr-1" />
              <Text className="text-[9px] font-extrabold text-content-muted uppercase">Attendees: 28 (Future)</Text>
            </View>
            <View className="bg-surface-muted border border-subtle px-3 py-1 rounded-xl flex-row items-center">
              <Ionicons name="bookmark-outline" size={13} color="#6B7280" className="mr-1" />
              <Text className="text-[9px] font-extrabold text-content-muted uppercase">Seats: 150 Left (Future)</Text>
            </View>
          </View>
        </View>

        {/* RSVP Management */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">RSVP Status</Text>
            {/* Future Check-in */}
            <View className="bg-surface-muted px-2 py-0.5 rounded">
              <Text className="text-[8px] font-black text-content-muted uppercase">📲 Check-in (Future)</Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            {[
              // Remediation Wave A′: two options, because the platform has two.
              // "Maybe" was a third button that could never be stored — the
              // server's `RsvpStatus` has no such member, so tapping it recorded
              // nothing while looking exactly like the other two.
              { status: 'Going' as const, label: 'Going', icon: 'checkmark-circle' },
              { status: 'Interested' as const, label: 'Interested', icon: 'star' }
            ].map((option) => {
              const isSelected = rsvpStatus === option.status;
              return (
                <TouchableOpacity
                  key={option.status}
                  onPress={() => handleRsvpChange(option.status)}
                  className={`flex-1 flex-row items-center justify-center py-3 rounded-2xl border ${
                    isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
                  }`}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={14}
                    color={isSelected ? '#FFFFFF' : '#4B5563'}
                    className="mr-1.5"
                  />
                  <Text className={`text-xs font-black ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/*
            Paying for a ticket.

            B15 has no ticketing contract — no ticket aggregate, no seat, no
            capacity — so this is an ordinary payment intent carrying
            subjectType `Event`. GAP-10.

            Which means the RSVP above and the payment below are genuinely
            separate facts, and the copy says so rather than implying that
            paying reserves a place. CommunityLife owns the RSVP; B15 owns the
            money; neither knows about the other.
          */}
          {event.price > 0 && rsvpStatus === 'Going' ? (
            <View className="mt-5 pt-5 border-t border-faint">
              <SubjectPaymentButton
                subjectType="Event"
                subjectId={String(id)}
                subjectTitle={event.title}
                amount={event.price}
                currency={event.currency ?? 'GBP'}
                description={`${event.title} — entry`}
                label={`Pay ${event.currency === 'GBP' ? '£' : '$'}${event.price} for entry`}
                details={[
                  { label: 'Event', value: event.title },
                  { label: 'Date', value: String(event.date) },
                  ...(event.location?.areaName
                    ? [{ label: 'Where', value: event.location.areaName }]
                    : []),
                ]}
                disclosure="Paying records your payment with the organiser. It does not reserve a place on its own — your RSVP does that."
              />
            </View>
          ) : event.price > 0 ? (
            <View className="mt-5 pt-5 border-t border-faint">
              <Text className="text-[10px] font-semibold text-content-faint text-center leading-relaxed">
                Mark yourself as Going to pay the {event.currency === 'GBP' ? '£' : '$'}
                {event.price} entry with Diaspora.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Description section */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">About Event</Text>
          <Text className="text-sm text-content-secondary leading-relaxed font-semibold">{event.description}</Text>
        </View>

        {/* Agenda Section */}
        {event.agenda && event.agenda.length > 0 && (
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Event Agenda</Text>
            
            <View className="border-l-2 border-subtle pl-4 ml-2 gap-4">
              {event.agenda.map((item: any, idx: number) => (
                <View key={item.id || idx} className="relative">
                  <View className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-primary-500 border-2 border-white" />
                  <Text className="text-[10px] font-black text-primary-500">{item.time}</Text>
                  <Text className="text-xs font-black text-content-strong mt-0.5">{item.title}</Text>
                  {item.description && (
                    <Text className="text-[11px] text-content-muted mt-0.5 font-medium leading-relaxed">
                      {item.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Host / Organizer Info */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Hosted By</Text>
          <TouchableOpacity
            onPress={() => {
              if (event.host.type === 'Organization') {
                router.push(`/community-life/org/${event.host.id}`);
              }
            }}
            className="flex-row items-center mb-3"
            activeOpacity={0.8}
          >
            <View className="w-12 h-12 rounded-2xl bg-surface-muted items-center justify-center border border-subtle mr-4 overflow-hidden">
              <Ionicons name={event.host.type === 'Organization' ? 'home' : 'person'} size={20} color="#6B7280" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-black text-content-primary leading-snug">{event.host.name}</Text>
              <Text className="text-[10px] text-content-muted font-bold mt-0.5 capitalize">
                {event.host.type} · Creator Profile
              </Text>
            </View>
            {event.host.isVerified && (
              <View className="bg-success-surface border border-[#A3EBDB] px-2 py-0.5 rounded flex-row items-center">
                <Ionicons name="checkmark-circle" size={10} color="#10B981" className="mr-0.5" />
                <Text className="text-[8px] font-black text-success-default uppercase">Verified</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Maps Direction Simulation */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Event Location Map</Text>
            <View className="bg-surface-muted px-2 py-0.5 rounded">
              <Text className="text-[8px] font-black text-content-muted uppercase">🚗 Directions (Future)</Text>
            </View>
          </View>
          
          <View className="h-32 bg-surface-muted rounded-2xl overflow-hidden justify-center items-center border border-subtle">
            <Ionicons name="map" size={32} color="#9CA3AF" />
            <Text className="text-xs text-content-muted font-bold mt-2">Mini-Map Preview</Text>
            {/* `|| 51.5` / `|| -0.1` is central London. An event whose venue has
              * no coordinates was therefore shown a specific latitude and
              * longitude it does not have, on a panel captioned as its map —
              * and 0 is falsy, so a genuine point on the equator or the prime
              * meridian was overwritten too. Same class as the organisation
              * profile's invented 4.7 rating: a fallback that presents as data.
              * Coordinates are shown when the venue has them and the line is
              * omitted when it does not. */}
            {typeof event.location?.latitude === 'number' && typeof event.location?.longitude === 'number' && (
              <Text className="text-[10px] text-content-faint mt-0.5">
                Lat: {event.location.latitude} · Long: {event.location.longitude}
              </Text>
            )}
          </View>
          
          {/* Frontend Phase 16, §10/§12. This used to build a Google Maps URL
              inline, which hardcoded a provider into a product screen and gave
              an iPhone member a web page where they expected Apple Maps.
              `openExternalDirections` is Phase 8's existing helper and picks the
              right scheme per platform — the screen names the *capability*, not
              the vendor, which is what §4 asks for. */}
          <TouchableOpacity
            onPress={() => {
              void openExternalDirections(
                {
                  latitude: event.location.latitude ?? 0,
                  longitude: event.location.longitude ?? 0,
                },
                event.title,
                'driving'
              ).then((opened) => {
                if (!opened) {
                  showAlert({ type: 'info', title: 'No maps app', message: 'This device has no app that can show directions. The address is shown above.' });
                }
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Get directions to ${event.title}`}
            className="flex-row items-center justify-center bg-surface-background border border-subtle py-3 rounded-2xl mt-3 active:bg-surface-muted"
          >
            <Ionicons name="navigate-outline" size={15} color={tokens.color.text.secondary} className="mr-1.5" />
            <Text className="text-xs font-black text-content-secondary">Get directions</Text>
          </TouchableOpacity>

          {/* §51's contextual discovery: the calendar integration is reached
              from the event, not only from Settings. One shared sheet — §7
              forbids a per-screen calendar implementation and this is the only
              one in the application. */}
          <TouchableOpacity
            onPress={() => setCalendarSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${event.title} to a calendar`}
            className="flex-row items-center justify-center bg-surface-background border border-subtle py-3 rounded-2xl mt-2 active:bg-surface-muted"
          >
            <Ionicons name="calendar-outline" size={15} color={tokens.color.text.secondary} className="mr-1.5" />
            <Text className="text-xs font-black text-content-secondary">Add to calendar</Text>
          </TouchableOpacity>

          {/* Frontend Phase 18, §12. Contextual, not a second automation
              surface: this component takes an event id and nothing else, calls
              the same `useReminders` capability the Automation Center uses, and
              holds no trigger key or rule of its own — §0 forbids automation
              logic in a feature screen. The timezone is the *event's*, which is
              what makes "one day before" stay right if the member travels. */}
          {/* Not offered when the event's start cannot be resolved to an
              instant: the platform refuses a reminder with no subject moment,
              so a button here would be an affordance that always fails. */}
          {reminderMoment ? (
            <EventReminderButton
              eventId={String(id)}
              eventTitle={event.title}
              timeZoneId={event.timeZoneId ?? event.location?.timeZoneId ?? 'UTC'}
              eventStartsAt={reminderMoment}
            />
          ) : null}
        </View>

        {/* Proximity Ecosystem Integrations */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2">
            <View>
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">📍 Local Proximity Hub</Text>
              <Text className="text-[10px] text-content-muted mt-0.5 font-bold uppercase">Discover surrounding items near this event</Text>
            </View>
            <View className="bg-surface-background px-2 py-0.5 rounded border border-faint">
              <Text className="text-[8px] font-black text-content-tertiary uppercase">Within {event.location.cityName}</Text>
            </View>
          </View>

          {/* Tab Selector */}
          <View className="flex-row bg-surface-muted p-1 rounded-2xl mb-4 border border-subtle overflow-x-scroll">
            {[
              { key: 'Updates', label: '📢 Updates', count: ecosystemItems.updates.length },
              { key: 'Community', label: '🏛 Hubs', count: ecosystemItems.orgs.length },
              { key: 'Guides', label: '📖 Guides', count: ecosystemItems.guides.length },
              { key: 'Services', label: '📍 Services', count: ecosystemItems.services.length },
              { key: 'Jobs', label: '💼 Jobs', count: ecosystemItems.jobs.length },
              { key: 'Housing', label: '🏠 Housing', count: ecosystemItems.housing.length },
              { key: 'Restaurants', label: '🍴 Restaurants', count: 'Future-ready' }
            ].map((tab) => {
              const isActive = activeEcosystemTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveEcosystemTab(tab.key as any)}
                  className={`flex-1 py-2 rounded-xl items-center justify-center min-w-[70px] ${
                    isActive ? 'bg-surface-card shadow-sm' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-[9px] font-black ${isActive ? 'text-primary-500' : 'text-content-tertiary'}`}>
                    {tab.label}
                  </Text>
                  <Text className="text-[8px] text-content-faint font-bold mt-0.5">
                    {tab.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab Contents */}
          <View className="min-h-[100px]">
            {activeEcosystemTab === 'Updates' && (
              <View>
                {ecosystemItems.updates.length > 0 ? (
                  ecosystemItems.updates.map((item: any) => (
                    <UpdateCard
                      key={item.updateId}
                      update={{
                        ...item,
                        location: {
                          areaName: item.location.areaName,
                          cityName: item.location.cityName,
                          distanceKm: 0.9,
                        }
                      }}
                      author={mockAuthors[item.authorId] as any}
                    />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No community updates nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Community' && (
              <View>
                {ecosystemItems.orgs.length > 0 ? (
                  ecosystemItems.orgs.map((org: any) => (
                    <TouchableOpacity
                      key={org.id}
                      onPress={() => router.push(`/community-life/org/${org.id}`)}
                      className="bg-surface-card rounded-2xl border border-subtle p-4 mb-3 flex-row items-center shadow-sm"
                    >
                      <View className="w-10 h-10 rounded-xl bg-surface-muted items-center justify-center mr-3 border border-subtle">
                        <Ionicons name="home" size={18} color="#6B7280" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[9px] font-black text-primary-500 uppercase">{org.category}</Text>
                        <Text className="text-xs font-black text-content-primary mt-0.5">{org.name}</Text>
                        <Text className="text-[10px] text-content-muted font-bold mt-0.5">📍 {org.location.areaName} · {org.followersCount} followers</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No nearby organizations listed.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Jobs' && (
              <View>
                {ecosystemItems.jobs.length > 0 ? (
                  ecosystemItems.jobs.map((item: any) => (
                    <JobCard key={item.jobId} job={item} />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No employment opportunities nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Housing' && (
              <View>
                {ecosystemItems.housing.length > 0 ? (
                  ecosystemItems.housing.map((item: any) => (
                    <HousingCard key={item.id} listing={item} />
                  ))
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No housing listings nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Services' && (
              <View>
                {ecosystemItems.services.length > 0 ? (
                  ecosystemItems.services.map((item: any) => (
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
                  <Text className="text-xs text-content-muted italic py-6 text-center">No service providers nearby.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Guides' && (
              <View>
                {ecosystemItems.guides.length > 0 ? (
                  ecosystemItems.guides.map((item: any) => {
                    const author = mockAuthors[item.authorId];
                    return (
                      <GuideCard
                        key={item.guideId}
                        guide={item}
                        author={author as any}
                        variant="list"
                      />
                    );
                  })
                ) : (
                  <Text className="text-xs text-content-muted italic py-6 text-center">No guides available for this region.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Restaurants' && (
              <View className="bg-surface-background border border-subtle border-dashed rounded-3xl p-5 items-center justify-center py-8">
                <Ionicons name="restaurant-outline" size={24} color="#6B7280" />
                <Text className="text-xs font-black text-content-secondary mt-2">Nearby Restaurants Integration</Text>
                <Text className="text-[10px] text-content-muted mt-0.5 text-center max-w-[200px]">
                  Future integration supporting reservations, menus, and discounts for event attendees.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Reporting this event — Remediation Wave B′ ──────────────────────
            This was a bare `showAlert` reading **"Report Submitted — Thank you.
            Our moderators will review this event within 24 hours."** No request,
            no report, and a 24-hour service level invented on the spot.

            An event is reportable: `CommunityEventContentSource` claims
            `CommunityContentType.Event`, so `POST /community/reports` accepts
            one. It goes through `ReportModal` rather than a fresh sheet so the
            member gets the same validated form — a category, supporting detail,
            and an evidence link where the category needs one — and so there is
            one place left in this codebase that decides how a report is
            confirmed. */}
        <TouchableOpacity
          onPress={() => setReportModalVisible(true)}
          className="py-6 items-center"
          accessibilityRole="button"
          accessibilityLabel="Report this event to community moderators"
        >
          <Text className="text-xs font-bold text-error-default">⚠️ Report Event to Community Moderators</Text>
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
        }}
      >
        {event?.contact?.phone && (
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
          <Text className="text-white font-black text-xs">💬 Message Organizer</Text>
        </TouchableOpacity>
        {event?.contact?.website && (
          <TouchableOpacity
            onPress={handleWebsite}
            className="w-12 h-12 border border-subtle rounded-2xl items-center justify-center bg-surface-background active:bg-surface-muted"
          >
            <Ionicons name="globe-outline" size={18} color={tokens.color.text.secondary} />
          </TouchableOpacity>
        )}
      </Animated.View>

      {event ? (
        <AddToCalendarSheet
          visible={isCalendarSheetOpen}
          event={event}
          onClose={() => setCalendarSheetOpen(false)}
        />
      ) : null}

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Event"
        contentId={String(id)}
      />
    </SafeAreaView>
  );
}
