import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform, Alert, ActivityIndicator, Animated } from 'react-native';
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
import { ConversationHub } from '@/lib/conversation-hub';

// B15 — CommunityLife owns the event and the RSVP; Financial owns the money.
import { SubjectPaymentButton } from '@/components/financial';

// Frontend Phase 16 — §7's single calendar implementation and §10's
// provider-neutral navigation. Neither is built here; both are called.
import { AddToCalendarSheet } from '@/components/integrations';
import { openExternalDirections } from '@/lib/maps/external-navigation';

// Frontend Phase 18 — §12's reminder, as a contextual entry point rather than
// a second automation surface. See the comment at the call site.
import { EventReminderButton } from '@/components/automation';

export default function EventDetailScreen() {
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

  const [event, setEvent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  }, [id]);

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
      Alert.alert('Unavailable', 'Organizer did not provide a direct call number.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleMessage = async () => {
    if (!event) return;
    const organizerId = event.host?.id || event.host?.organizerId;
    if (!organizerId) {
      Alert.alert('Unavailable', 'Organizer contact is not available in-app.');
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
      Alert.alert('Unavailable', 'No website listed for this event.');
      return;
    }
    Linking.openURL(site);
  };

  const handleRsvpChange = (status: 'Going' | 'Interested' | 'Maybe') => {
    const newStatus = rsvpStatus === status ? null : status;
    setRsvpStatus(newStatus);
    
    // Simulate updating API
    apiClient.put(`/community-life/events/${id}`, { rsvpStatus: newStatus })
      .then(() => {
        if (newStatus) {
          Alert.alert('RSVP Confirmed', `You are marked as "${newStatus}" for this event. It has been synced to your calendar.`);
        }
      })
      .catch(err => console.error('Failed to update RSVP', err));
  };

  // Filter nearby ecosystem items based on location
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
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#FF6B00" />
        <Text className="text-xs font-bold text-neutral-400 mt-4 uppercase tracking-widest">Loading Event Details...</Text>
      </SafeAreaView>
    );
  }

  if (errorMsg || !event) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-6">
        <Ionicons name="warning" size={48} color="#EF4444" />
        <Text className="text-lg font-bold text-neutral-800 text-center mt-3">{errorMsg || 'Event Not Found'}</Text>
        <Text className="text-xs text-neutral-400 mt-1.5 text-center leading-relaxed">
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
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      
      {/* Top Navbar */}
      <View className="bg-white px-6 py-4 flex-row justify-between items-center border-b border-neutral-100 shadow-sm z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-neutral-50 rounded-full items-center justify-center border border-neutral-200">
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text className="text-sm font-black text-neutral-850 uppercase tracking-widest">Event Details</Text>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={handleShare} className="w-10 h-10 bg-neutral-50 rounded-full items-center justify-center border border-neutral-200">
            <Ionicons name="share-social-outline" size={18} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSaveToggle} className="w-10 h-10 bg-neutral-50 rounded-full items-center justify-center border border-neutral-200">
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={18}
              color={saved ? '#EF4444' : '#374151'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollEndScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        activeTab="discover"
        onBottomNavVisibilityChange={setIsBottomNavVisible}
        contentContainerStyle={{ paddingBottom: isBottomNavVisible ? 160 : 100 }}
      >
        
        {/* Photo Gallery with pagination dots */}
        <View className="bg-white relative">
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
                    activeImageIdx === idx ? 'w-4 bg-primary-500' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Title & Core Meta */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">
              {event.category}
            </Text>
            <View className="bg-neutral-105 px-2 py-0.5 rounded">
              <Text className="text-[10px] font-black text-neutral-500 uppercase">{event.timezone}</Text>
            </View>
          </View>

          <Text className="text-xl font-black text-neutral-900 leading-snug">{event.title}</Text>

          {/* Date, Time, Location */}
          <View className="mt-4 gap-3">
            <View className="flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                <Ionicons name="calendar-outline" size={16} color="#FF6B00" />
              </View>
              <View>
                <Text className="text-xs font-black text-neutral-800">{event.date}</Text>
                <Text className="text-[10px] text-neutral-450 font-bold mt-0.5">{event.time} - {event.endTime}</Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                <Ionicons name="location-outline" size={16} color="#FF6B00" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-black text-neutral-800">{event.location.addressLine}</Text>
                <Text className="text-[10px] text-neutral-450 font-bold mt-0.5">
                  {event.location.areaName}, {event.location.cityName} · {event.location.distanceKm} km away
                </Text>
              </View>
            </View>
          </View>

          {/* Available Seats & Attendees Future Indicator */}
          <View className="flex-row gap-2.5 mt-4 pt-3.5 border-t border-neutral-100 flex-wrap">
            <View className="bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-xl flex-row items-center">
              <Ionicons name="people-outline" size={13} color="#6B7280" className="mr-1" />
              <Text className="text-[9px] font-extrabold text-neutral-500 uppercase">Attendees: 28 (Future)</Text>
            </View>
            <View className="bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-xl flex-row items-center">
              <Ionicons name="bookmark-outline" size={13} color="#6B7280" className="mr-1" />
              <Text className="text-[9px] font-extrabold text-neutral-500 uppercase">Seats: 150 Left (Future)</Text>
            </View>
          </View>
        </View>

        {/* RSVP Management */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">RSVP Status</Text>
            {/* Future Check-in */}
            <View className="bg-neutral-100 px-2 py-0.5 rounded">
              <Text className="text-[8px] font-black text-neutral-450 uppercase">📲 Check-in (Future)</Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            {[
              { status: 'Going' as const, label: 'Going', icon: 'checkmark-circle' },
              { status: 'Interested' as const, label: 'Interested', icon: 'star' },
              { status: 'Maybe' as const, label: 'Maybe', icon: 'help-circle' }
            ].map((option) => {
              const isSelected = rsvpStatus === option.status;
              return (
                <TouchableOpacity
                  key={option.status}
                  onPress={() => handleRsvpChange(option.status)}
                  className={`flex-1 flex-row items-center justify-center py-3 rounded-2xl border ${
                    isSelected ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-250'
                  }`}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={14}
                    color={isSelected ? '#FFFFFF' : '#4B5563'}
                    className="mr-1.5"
                  />
                  <Text className={`text-xs font-black ${isSelected ? 'text-white' : 'text-neutral-700'}`}>
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
            <View className="mt-5 pt-5 border-t border-neutral-100">
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
            <View className="mt-5 pt-5 border-t border-neutral-100">
              <Text className="text-[10px] font-semibold text-neutral-400 text-center leading-relaxed">
                Mark yourself as Going to pay the {event.currency === 'GBP' ? '£' : '$'}
                {event.price} entry with Diaspora.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Description section */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">About Event</Text>
          <Text className="text-sm text-neutral-700 leading-relaxed font-semibold">{event.description}</Text>
        </View>

        {/* Agenda Section */}
        {event.agenda && event.agenda.length > 0 && (
          <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Event Agenda</Text>
            
            <View className="border-l-2 border-neutral-200 pl-4 ml-2 gap-4">
              {event.agenda.map((item: any, idx: number) => (
                <View key={item.id || idx} className="relative">
                  <View className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-primary-500 border-2 border-white" />
                  <Text className="text-[10px] font-black text-primary-500">{item.time}</Text>
                  <Text className="text-xs font-black text-neutral-800 mt-0.5">{item.title}</Text>
                  {item.description && (
                    <Text className="text-[11px] text-neutral-500 mt-0.5 font-medium leading-relaxed">
                      {item.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Host / Organizer Info */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Hosted By</Text>
          <TouchableOpacity
            onPress={() => {
              if (event.host.type === 'Organization') {
                router.push(`/community-life/org/${event.host.id}`);
              }
            }}
            className="flex-row items-center mb-3"
            activeOpacity={0.8}
          >
            <View className="w-12 h-12 rounded-2xl bg-neutral-100 items-center justify-center border border-neutral-250 mr-4 overflow-hidden">
              <Ionicons name={event.host.type === 'Organization' ? 'home' : 'person'} size={20} color="#6B7280" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-black text-neutral-900 leading-snug">{event.host.name}</Text>
              <Text className="text-[10px] text-neutral-500 font-bold mt-0.5 capitalize">
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
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Event Location Map</Text>
            <View className="bg-neutral-100 px-2 py-0.5 rounded">
              <Text className="text-[8px] font-black text-neutral-450 uppercase">🚗 Directions (Future)</Text>
            </View>
          </View>
          
          <View className="h-32 bg-neutral-150 rounded-2xl overflow-hidden justify-center items-center border border-neutral-200">
            <Ionicons name="map" size={32} color="#9CA3AF" />
            <Text className="text-xs text-neutral-500 font-bold mt-2">Mini-Map Preview</Text>
            <Text className="text-[10px] text-neutral-400 mt-0.5">Lat: {event.location.latitude || 51.5} · Long: {event.location.longitude || -0.1}</Text>
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
                  Alert.alert(
                    'No maps app',
                    'This device has no app that can show directions. The address is shown above.'
                  );
                }
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Get directions to ${event.title}`}
            className="flex-row items-center justify-center bg-neutral-50 border border-neutral-250 py-3 rounded-2xl mt-3 active:bg-neutral-100"
          >
            <Ionicons name="navigate-outline" size={15} color="#4B5563" className="mr-1.5" />
            <Text className="text-xs font-black text-neutral-700">Get directions</Text>
          </TouchableOpacity>

          {/* §51's contextual discovery: the calendar integration is reached
              from the event, not only from Settings. One shared sheet — §7
              forbids a per-screen calendar implementation and this is the only
              one in the application. */}
          <TouchableOpacity
            onPress={() => setCalendarSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${event.title} to a calendar`}
            className="flex-row items-center justify-center bg-neutral-50 border border-neutral-250 py-3 rounded-2xl mt-2 active:bg-neutral-100"
          >
            <Ionicons name="calendar-outline" size={15} color="#4B5563" className="mr-1.5" />
            <Text className="text-xs font-black text-neutral-700">Add to calendar</Text>
          </TouchableOpacity>

          {/* Frontend Phase 18, §12. Contextual, not a second automation
              surface: this component takes an event id and nothing else, calls
              the same `useReminders` capability the Automation Center uses, and
              holds no trigger key or rule of its own — §0 forbids automation
              logic in a feature screen. The timezone is the *event's*, which is
              what makes "one day before" stay right if the member travels. */}
          <EventReminderButton
            eventId={String(id)}
            eventTitle={event.title}
            timeZoneId={event.timeZoneId ?? event.location?.timeZoneId ?? 'UTC'}
          />
        </View>

        {/* Proximity Ecosystem Integrations */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mb-3">
          <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2">
            <View>
              <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">📍 Local Proximity Hub</Text>
              <Text className="text-[10px] text-neutral-450 mt-0.5 font-bold uppercase">Discover surrounding items near this event</Text>
            </View>
            <View className="bg-neutral-50 px-2 py-0.5 rounded border border-neutral-150">
              <Text className="text-[8px] font-black text-neutral-600 uppercase">Within {event.location.cityName}</Text>
            </View>
          </View>

          {/* Tab Selector */}
          <View className="flex-row bg-neutral-100 p-1 rounded-2xl mb-4 border border-neutral-200 overflow-x-scroll">
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
                    isActive ? 'bg-white shadow-sm' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-[9px] font-black ${isActive ? 'text-primary-500' : 'text-neutral-600'}`}>
                    {tab.label}
                  </Text>
                  <Text className="text-[8px] text-neutral-400 font-bold mt-0.5">
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
                  <Text className="text-xs text-neutral-450 italic py-6 text-center">No community updates nearby.</Text>
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
                      className="bg-white rounded-2xl border border-neutral-200 p-4 mb-3 flex-row items-center shadow-sm"
                    >
                      <View className="w-10 h-10 rounded-xl bg-neutral-100 items-center justify-center mr-3 border border-neutral-200">
                        <Ionicons name="home" size={18} color="#6B7280" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[9px] font-black text-primary-500 uppercase">{org.category}</Text>
                        <Text className="text-xs font-black text-neutral-900 mt-0.5">{org.name}</Text>
                        <Text className="text-[10px] text-neutral-450 font-bold mt-0.5">📍 {org.location.areaName} · {org.followersCount} followers</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text className="text-xs text-neutral-450 italic py-6 text-center">No nearby organizations listed.</Text>
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
                  <Text className="text-xs text-neutral-455 italic py-6 text-center">No employment opportunities nearby.</Text>
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
                  <Text className="text-xs text-neutral-455 italic py-6 text-center">No housing listings nearby.</Text>
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
                  <Text className="text-xs text-neutral-455 italic py-6 text-center">No service providers nearby.</Text>
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
                  <Text className="text-xs text-neutral-455 italic py-6 text-center">No guides available for this region.</Text>
                )}
              </View>
            )}

            {activeEcosystemTab === 'Restaurants' && (
              <View className="bg-neutral-50 border border-neutral-200 border-dashed rounded-3xl p-5 items-center justify-center py-8">
                <Ionicons name="restaurant-outline" size={24} color="#6B7280" />
                <Text className="text-xs font-black text-neutral-700 mt-2">Nearby Restaurants Integration</Text>
                <Text className="text-[10px] text-neutral-450 mt-0.5 text-center max-w-[200px]">
                  Future integration supporting reservations, menus, and discounts for event attendees.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Report link */}
        <TouchableOpacity
          onPress={() => Alert.alert('Report Submitted', 'Thank you. Our moderators will review this event within 24 hours.')}
          className="py-6 items-center"
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
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
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
            className="flex-1 border border-neutral-200 py-3.5 rounded-2xl items-center justify-center bg-neutral-50 active:bg-neutral-100"
          >
            <Text className="text-xs font-extrabold text-neutral-750">📞 Direct Call</Text>
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
            className="w-12 h-12 border border-neutral-200 rounded-2xl items-center justify-center bg-neutral-50 active:bg-neutral-100"
          >
            <Ionicons name="globe-outline" size={18} color="#4B5563" />
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
    </SafeAreaView>
  );
}
