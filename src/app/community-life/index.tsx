import React, { useState, useEffect, useMemo } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, FlatList, ActivityIndicator, Share, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dialog } from '@/components/overlays/AppModal';
import { Button } from '@/components/Button';
import { useThemeTokens } from '@/design-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Rect, Path, G } from 'react-native-svg';
import { apiClient } from '@/lib/apiClient';
import { useSavedStore } from '@/store/saved';
import type { Event, CommunityOrganization, CalendarEvent, EventCategory, OrgCategory } from '@/types/community-life';

interface LocationOption {
  city: string;
  country: string;
  flag: string;
}

const LOCATIONS: LocationOption[] = [
  { city: 'London', country: 'United Kingdom', flag: '🇬🇧' },
  { city: 'Lagos', country: 'Nigeria', flag: '🇳🇬' },
  { city: 'Accra', country: 'Ghana', flag: '🇬🇭' },
];

const EVENT_CATEGORIES: EventCategory[] = [
  'Wedding', 'Naming Ceremony', 'Birthday', 'Graduation', 'Football Match',
  'Basketball', 'Concert', 'Comedy Show', 'Networking', 'Career Fair', 'Job Fair',
  'Business Seminar', 'Conference', 'Training', 'Workshop', 'Church Program',
  'Mosque Event', 'Bible Study', 'Prayer Meeting', 'Youth Program', 'Cultural Festival',
  'Independence Celebration', 'Food Festival', 'Picnic', 'Volunteer Activity',
  'Charity Event', 'Embassy Event', 'Student Orientation', 'Other'
];

const ORG_CATEGORIES: OrgCategory[] = [
  'Churches', 'Mosques', 'Associations', 'Embassies', 'Student Associations',
  'Professional Associations', 'Community Centres', 'NGOs', 'Doctors', 'Lawyers',
  'Accountants', 'Immigration Consultants', 'Cultural Organizations', 'Sports Clubs',
  'Business Associations', 'Volunteer Organizations', 'Restaurants'
];

export default function CommunityLifeScreen() {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const { savedItems, save, unsave, isSaved } = useSavedStore();

  const [activeTab, setActiveTab] = useState<'events' | 'directory' | 'calendar' | 'saved'>('events');
  const [selectedLocation, setSelectedLocation] = useState<LocationOption>(LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- Offline Mode States ---
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // --- Events Tab State ---
  const [eventQuery, setEventQuery] = useState('');
  const [selectedEventCat, setSelectedEventCat] = useState<EventCategory | 'All'>('All');
  const [eventFilterType, setEventFilterType] = useState<'all' | 'nearby' | 'recommended' | 'free' | 'popular' | 'recently_added' | 'ai'>('all');
  const [eventTimeFilter, setEventTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'weekend' | 'this_week' | 'upcoming'>('all');
  const [eventSortBy, setEventSortBy] = useState<'date' | 'distance' | 'popular'>('date');
  const [distanceRadius, setDistanceRadius] = useState<'any' | '1k' | '3k' | '5k' | '10k'>('any');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedMapEvent, setSelectedMapEvent] = useState<Event | null>(null);

  // --- Directory Tab State ---
  const [dirQuery, setDirQuery] = useState('');
  const [selectedDirCat, setSelectedDirCat] = useState<OrgCategory | 'All'>('All');
  const [orgsList, setOrgsList] = useState<CommunityOrganization[]>([]);

  // --- Calendar Tab State ---
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'agenda'>('month');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState('2026-07-13'); // default to July 13, 2026 (Monday)
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [customReminders, setCustomReminders] = useState<{ id: string; title: string; date: string; time: string; type: 'Reminder' }[]>([]);

  // --- Saved Tab State ---
  const [savedSearchQuery, setSavedSearchQuery] = useState('');

  // Fetch Events
  useEffect(() => {
    if (isOffline) {
      // Simulate loading from offline cache
      setIsLoading(true);
      const timer = setTimeout(() => {
        // Filter directly from mockEvents for offline
        import('@/mocks/community-life-data').then(({ mockEvents: raw }) => {
          setEventsList(raw.filter(e => e.location.cityName.toLowerCase() === selectedLocation.city.toLowerCase()));
          setIsLoading(false);
        });
      }, 300);
      return () => clearTimeout(timer);
    }

    setIsLoading(true);
    apiClient.get('/community-life/events', {
      params: {
        cityName: selectedLocation.city,
        category: selectedEventCat === 'All' ? undefined : selectedEventCat,
        query: eventQuery || undefined,
        filterType: eventFilterType,
        timeFilter: eventTimeFilter === 'all' ? undefined : eventTimeFilter,
        sortBy: eventSortBy
      }
    }).then(res => {
      let data = res.data.data;
      // Filter distance radius client-side
      if (distanceRadius !== 'any') {
        const radiusMap = { '1k': 1.0, '3k': 3.0, '5k': 5.0, '10k': 10.0 };
        const maxDist = radiusMap[distanceRadius];
        data = data.filter((e: any) => (e.location.distanceKm || 999) <= maxDist);
      }
      setEventsList(data);
    }).catch(err => {
      console.error('Failed to load events', err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [selectedLocation, selectedEventCat, eventQuery, eventFilterType, eventTimeFilter, eventSortBy, distanceRadius, isOffline]);

  // Fetch Directory Orgs
  useEffect(() => {
    if (isOffline) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        import('@/mocks/community-life-data').then(({ mockOrganizations: raw }) => {
          setOrgsList(raw.filter(o => o.location.cityName.toLowerCase() === selectedLocation.city.toLowerCase()));
          setIsLoading(false);
        });
      }, 300);
      return () => clearTimeout(timer);
    }

    setIsLoading(true);
    apiClient.get('/community-life/organizations', {
      params: {
        cityName: selectedLocation.city,
        category: selectedDirCat === 'All' ? undefined : selectedDirCat,
        query: dirQuery || undefined
      }
    }).then(res => {
      setOrgsList(res.data.data);
    }).catch(err => {
      console.error('Failed to load directory organizations', err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [selectedLocation, selectedDirCat, dirQuery, isOffline]);

  // Fetch Calendar events
  useEffect(() => {
    if (isOffline) {
      // Offline calendar loaded from cache
      return;
    }
    if (activeTab === 'calendar') {
      setIsLoading(true);
      apiClient.get('/community-life/calendar', {
        params: {
          cityName: selectedLocation.city
        }
      }).then(res => {
        const apiData = res.data.data;
        const mappedReminders = customReminders.map(r => ({
          id: r.id,
          title: r.title,
          date: r.date,
          time: r.time,
          type: 'Reminder' as const,
          color: '#F59E0B'
        }));
        setCalendarEvents([...apiData, ...mappedReminders]);
      }).catch(err => {
        console.error('Failed to load calendar events', err);
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [activeTab, selectedLocation, customReminders, isOffline]);

  // Trigger retry action for offline mode
  const handleRetryConnection = () => {
    setIsRetrying(true);
    setTimeout(() => {
      setIsOffline(false);
      setIsRetrying(false);
      showAlert({ type: 'info', title: 'Online Mode Restored', message: 'Connected back to Diaspora network servers.' });
    }, 1500);
  };

  // Toggle Saved Item
  const handleSaveToggle = (id: string, type: 'Event' | 'Organization') => {
    if (isSaved(id)) {
      unsave(id);
    } else {
      save(id, type);
    }
  };

  // Share action from card
  const handleShareEvent = async (eventItem: Event) => {
    try {
      const priceText = !eventItem.price || eventItem.price === 0 ? 'FREE' : `£${eventItem.price}`;
      await Share.share({
        message: `Join me at "${eventItem.title}" on ${eventItem.date} (${priceText}) in ${eventItem.location.areaName}! Shared via Diaspora.`,
      });
    } catch (error) {
      console.log('Share failed', error);
    }
  };

  // Add Custom Reminder
  const handleAddReminder = () => {
    if (!reminderText.trim()) return;
    const newRem = {
      id: `rem-${Date.now()}`,
      title: reminderText,
      date: selectedDateStr,
      time: '09:00',
      type: 'Reminder' as const
    };
    setCustomReminders(prev => [...prev, newRem]);
    setReminderText('');
    setReminderModalOpen(false);
    showAlert({ type: 'success', title: 'Reminder Saved', message: 'Personal reminder has been added to your calendar.' });
  };

  // --- Calendar Grid Helpers (July 2026) ---
  const julyDays = useMemo(() => {
    const totalDays = 31;
    const startOffset = 2; // Wednesday
    const daysArr = [];
    for (let i = 0; i < startOffset; i++) daysArr.push(null);
    for (let d = 1; d <= totalDays; d++) daysArr.push(d);
    return daysArr;
  }, []);

  const selectedDateEvents = useMemo(() => {
    return calendarEvents.filter(item => item.date === selectedDateStr);
  }, [calendarEvents, selectedDateStr]);

  // Filtered Saved Content with search query support
  const savedEvents = useMemo(() => {
    const bookmarkedIds: string[] = [];
    savedItems.forEach((type, id) => {
      if (type === 'Event') bookmarkedIds.push(id);
    });
    const matches = eventsList.filter(e => bookmarkedIds.includes(e.id));
    if (!savedSearchQuery) return matches;
    return matches.filter(e => 
      e.title.toLowerCase().includes(savedSearchQuery.toLowerCase()) || 
      e.category.toLowerCase().includes(savedSearchQuery.toLowerCase())
    );
  }, [eventsList, savedItems, savedSearchQuery]);

  const followedOrgs = useMemo(() => {
    const bookmarkedIds: string[] = [];
    savedItems.forEach((type, id) => {
      if (type === 'Organization') bookmarkedIds.push(id);
    });
    const matches = orgsList.filter(o => bookmarkedIds.includes(o.id));
    if (!savedSearchQuery) return matches;
    return matches.filter(o => 
      o.name.toLowerCase().includes(savedSearchQuery.toLowerCase()) || 
      o.category.toLowerCase().includes(savedSearchQuery.toLowerCase())
    );
  }, [orgsList, savedItems, savedSearchQuery]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background/40">
      
      {/* 1. Offline Mode Banner */}
      {isOffline && (
        <View className="bg-amber-500 px-6 py-2 flex-row justify-between items-center z-20">
          <View className="flex-row items-center">
            <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" className="mr-2" />
            <Text className="text-white text-xs font-bold">Offline Mode (Using Cached Data)</Text>
          </View>
          <TouchableOpacity
            onPress={handleRetryConnection}
            className="bg-surface-card/20 px-3 py-1 rounded-lg"
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white text-[10px] font-black uppercase">Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Top Header Panel */}
      <View className="bg-surface-card border-b border-faint px-6 py-4 flex-row items-center justify-between shadow-sm z-10">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-black text-content-primary tracking-tight">Community Life</Text>
            {/* Location Switcher */}
            <TouchableOpacity
              onPress={() => setIsLocationModalOpen(true)}
              className="flex-row items-center mt-0.5"
              activeOpacity={0.7}
            >
              <Text className="text-xs font-bold text-primary-500 mr-1">
                📍 {selectedLocation.city} {selectedLocation.flag}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#F59300" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Action controls: Offline Simulator and Create CTA */}
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setIsOffline(!isOffline)}
            className={`px-3 py-1.5 rounded-xl border ${
              isOffline ? 'bg-amber-100 border-amber-300' : 'bg-surface-background border-neutral-250'
            }`}
          >
            <Text className="text-[10px] font-black text-content-tertiary">
              {isOffline ? '⚡ ONLINE' : '🔌 OFFLINE'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => router.push('/create')}
            className="bg-primary-500 p-2.5 rounded-full items-center justify-center shadow-md"
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. Horizontal Tab Navigation */}
      <View className="bg-surface-card border-b border-faint flex-row px-4 justify-between">
        {[
          { key: 'events', label: 'Events', icon: '🎉' },
          { key: 'directory', label: 'Directory', icon: '🏛' },
          { key: 'calendar', label: 'Calendar', icon: '📅' },
          { key: 'saved', label: 'Saved', icon: '⭐' }
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              className={`flex-row items-center py-3.5 px-3 border-b-2 ${
                isActive ? 'border-primary-500' : 'border-transparent'
              }`}
            >
              <Text className="text-sm mr-1.5">{tab.icon}</Text>
              <Text
                className={`text-xs font-black ${
                  isActive ? 'text-primary-500' : 'text-content-muted'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/*
        3b. Advanced Community Life (Frontend Phase 12).

        The entry point into membership, recurring events, fundraising,
        volunteering, polls, organisation dashboards and community impact.

        Deliberately an *entry* rather than a fifth tab: the four tabs above are
        B12's events, directory, calendar and saved lists, and they stay exactly
        as they are. Phase 12 extends the platform rather than rearranging what
        was already working — §58.2 and §58.4.
      */}
      <TouchableOpacity
        onPress={() => router.push('/community-life/hub')}
        accessibilityRole="button"
        accessibilityLabel="Community Life — membership, fundraising, volunteering and polls"
        accessibilityHint="Opens the full Community Life hub"
        activeOpacity={0.85}
        className="mx-4 mt-4 mb-1 rounded-2xl bg-primary-500 px-4 py-3.5 flex-row items-center"
      >
        <View className="w-9 h-9 rounded-xl bg-surface-card/20 items-center justify-center">
          <Ionicons name="people" size={18} color="#FFFFFF" />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-white text-sm font-black tracking-tight">Community Life</Text>
          <Text className="text-white/85 text-[11px] font-semibold mt-0.5">
            Membership · Fundraising · Volunteering · Polls
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </TouchableOpacity>

      {/* 4. Tab Contents */}
      {isLoading ? (
        /* Accessibility Skeleton Loading State */
        <View className="flex-1 p-6 gap-4">
          <View className="h-44 bg-neutral-200 rounded-3xl animate-pulse" />
          <View className="h-6 bg-neutral-200 rounded w-2/3" />
          <View className="h-4 bg-neutral-200 rounded w-1/2" />
        </View>
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          
          {/* ==================== EVENTS TAB ==================== */}
          {activeTab === 'events' && (
            <View className="p-5">
              
              {/* Search Bar & View Mode Toggle */}
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1 flex-row bg-surface-card border border-subtle h-12 rounded-2xl px-4 items-center shadow-sm">
                  <Ionicons name="search-outline" size={18} color="#9CA3AF" className="mr-2" />
                  <TextInput
                    placeholder={`Search events in ${selectedLocation.city}...`}
                    value={eventQuery}
                    onChangeText={setEventQuery}
                    className="flex-1 text-xs font-semibold text-content-strong"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                
                {/* View Toggles */}
                <TouchableOpacity
                  onPress={() => {
                    setViewMode(viewMode === 'list' ? 'map' : 'list');
                    setSelectedMapEvent(null);
                  }}
                  className="bg-surface-card border border-subtle w-12 h-12 rounded-2xl items-center justify-center shadow-sm"
                >
                  <Ionicons name={viewMode === 'list' ? 'map-outline' : 'list-outline'} size={20} color="#4B5563" />
                </TouchableOpacity>
              </View>

              {/* Discovery Filters row */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                {[
                  { key: 'all', label: 'All Events' },
                  { key: 'nearby', label: '📍 Nearby' },
                  { key: 'recommended', label: '👍 Recommended' },
                  { key: 'free', label: '💰 Free Events' },
                  { key: 'popular', label: '🔥 Popular' },
                  { key: 'recently_added', label: '⏰ Recently Added' },
                  { key: 'ai', label: '✨ AI Recommendations' }
                ].map((chip) => {
                  const isSelected = eventFilterType === chip.key;
                  return (
                    <TouchableOpacity
                      key={chip.key}
                      onPress={() => setEventFilterType(chip.key as any)}
                      className={`px-4 py-2 rounded-full mr-2 border ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-neutral-250'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Distance Slider (represented as chips) & Time filter */}
              <View className="bg-surface-card border border-neutral-250 rounded-3xl p-4 mb-4 gap-3">
                {/* Distance */}
                <View className="flex-row justify-between items-center">
                  <Text className="text-[10px] font-black text-neutral-450 uppercase">Distance Radius</Text>
                  <View className="flex-row gap-1.5">
                    {[
                      { key: 'any', label: 'Any' },
                      { key: '1k', label: '1km' },
                      { key: '3k', label: '3km' },
                      { key: '5k', label: '5km' },
                      { key: '10k', label: '10km' }
                    ].map(d => (
                      <TouchableOpacity
                        key={d.key}
                        onPress={() => setDistanceRadius(d.key as any)}
                        className={`px-2 py-1 rounded-lg border ${
                          distanceRadius === d.key ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
                      >
                        <Text className={`text-[9px] font-black ${
                          distanceRadius === d.key ? 'text-primary-500' : 'text-content-tertiary'
                        }`}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Time filter */}
                <View className="flex-row justify-between items-center border-t border-faint pt-2.5">
                  <Text className="text-[10px] font-black text-neutral-450 uppercase">Timing</Text>
                  <View className="flex-row gap-1.5">
                    {[
                      { key: 'all', label: 'Anytime' },
                      { key: 'today', label: 'Today' },
                      { key: 'tomorrow', label: 'Tomorrow' },
                      { key: 'weekend', label: 'Weekend' }
                    ].map(t => (
                      <TouchableOpacity
                        key={t.key}
                        onPress={() => setEventTimeFilter(t.key as any)}
                        className={`px-2 py-1 rounded-lg border ${
                          eventTimeFilter === t.key ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
                      >
                        <Text className={`text-[9px] font-black ${
                          eventTimeFilter === t.key ? 'text-primary-500' : 'text-content-tertiary'
                        }`}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Category selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 pb-1">
                <TouchableOpacity
                  onPress={() => setSelectedEventCat('All')}
                  className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                    selectedEventCat === 'All' ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                  }`}
                >
                  <Text className={`text-[11px] font-bold ${selectedEventCat === 'All' ? 'text-primary-500' : 'text-neutral-650'}`}>
                    All Categories
                  </Text>
                </TouchableOpacity>
                {EVENT_CATEGORIES.map((cat) => {
                  const isSelected = selectedEventCat === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedEventCat(cat)}
                      className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                        isSelected ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                      }`}
                    >
                      <Text className={`text-[11px] font-bold ${isSelected ? 'text-primary-500' : 'text-neutral-655'}`}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* View Rendering */}
              {viewMode === 'map' ? (
                /* Premium Map Marker Simulation */
                <View className="mb-4">
                  <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm relative overflow-hidden h-[340px]">
                    {/* Simulated vector map blocks */}
                    <View className="absolute inset-0 bg-[#EBF3F9]">
                      <Svg height="100%" width="100%">
                        {/* River */}
                        <Path d="M0,150 Q100,120 200,180 T400,160 L400,240 Q300,220 200,240 T0,200 Z" fill="#A5C9EB" />
                        {/* Grid Roads */}
                        <Rect x="50" y="0" width="10" height="340" fill="#FFFFFF" />
                        <Rect x="200" y="0" width="12" height="340" fill="#FFFFFF" />
                        <Rect x="320" y="0" width="8" height="340" fill="#FFFFFF" />
                        <Rect x="0" y="100" width="400" height="10" fill="#FFFFFF" />
                        <Rect x="0" y="260" width="400" height="12" fill="#FFFFFF" />
                        
                        {/* Park Block */}
                        <Rect x="75" y="20" width="100" height="60" rx="10" fill="#C5E8C5" />
                        <Text style={{ position: 'absolute', top: 40, left: 95 }} className="text-[10px] font-black text-content-muted uppercase tracking-widest">Green Park</Text>
                      </Svg>
                    </View>

                    {/* Interactive Marker Pins */}
                    {eventsList.map((item, idx) => {
                      const positions = [
                        { top: 50, left: 60 },
                        { top: 140, left: 180 },
                        { top: 70, left: 280 },
                        { top: 220, left: 90 },
                        { top: 280, left: 240 }
                      ];
                      const pos = positions[idx % positions.length];
                      const isSelected = selectedMapEvent?.id === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => setSelectedMapEvent(item)}
                          className="absolute w-8 h-8 items-center justify-center"
                          style={{ top: pos.top, left: pos.left }}
                        >
                          <Ionicons
                            name="pin"
                            size={isSelected ? 32 : 24}
                            color={isSelected ? '#EF4444' : '#F59300'}
                          />
                        </TouchableOpacity>
                      );
                    })}

                    {/* Callout Overlay */}
                    {selectedMapEvent && (
                      <View className="absolute bottom-4 left-4 right-4 bg-surface-card/95 rounded-2xl p-3 border border-subtle shadow-xl flex-row items-center">
                        <View className="flex-1 mr-2">
                          <Text className="text-[8px] font-black text-primary-500 uppercase tracking-widest">{selectedMapEvent.category}</Text>
                          <Text className="text-xs font-black text-content-primary leading-tight mt-0.5" numberOfLines={1}>{selectedMapEvent.title}</Text>
                          <Text className="text-[9px] text-neutral-450 font-bold mt-0.5">📍 {selectedMapEvent.location.areaName} · {selectedMapEvent.date}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => router.push(`/community-life/event/${selectedMapEvent.id}`)}
                          className="bg-primary-500 px-3.5 py-2 rounded-xl"
                        >
                          <Text className="text-white font-black text-[10px]">DETAILS</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text className="text-[10px] text-content-faint font-bold text-center">Tap red markers to view event callouts</Text>
                </View>
              ) : eventsList.length > 0 ? (
                eventsList.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => router.push(`/community-life/event/${item.id}`)}
                    className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-5 shadow-sm"
                    activeOpacity={0.9}
                  >
                    {/* Cover image area */}
                    <View className="relative h-44 bg-surface-muted">
                      <View className="w-full h-full justify-center items-center bg-neutral-200">
                        <Ionicons name="image" size={32} color="#9CA3AF" />
                      </View>
                      
                      {/* Pricing Tag Overlay */}
                      <View className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full border border-white/10">
                        <Text className="text-white text-[10px] font-black uppercase">
                          {!item.price || item.price === 0 ? 'FREE' : `£${item.price}`}
                        </Text>
                      </View>

                      {/* RSVP Badge (if RSVP'd) */}
                      {item.rsvpStatus && (
                        <View className="absolute top-4 left-20 bg-success-default px-2.5 py-1 rounded-full">
                          <Text className="text-white text-[8px] font-black uppercase">✓ {item.rsvpStatus}</Text>
                        </View>
                      )}

                      {/* Save Heart & Share icon group */}
                      <View className="absolute top-4 right-4 flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => handleShareEvent(item)}
                          className="w-9 h-9 bg-surface-card/90 rounded-full items-center justify-center shadow"
                        >
                          <Ionicons name="share-social-outline" size={17} color="#4B5563" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSaveToggle(item.id, 'Event')}
                          className="w-9 h-9 bg-surface-card/90 rounded-full items-center justify-center shadow"
                        >
                          <Ionicons
                            name={isSaved(item.id) ? 'heart' : 'heart-outline'}
                            size={18}
                            color={isSaved(item.id) ? '#EF4444' : '#4B5563'}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Card Body */}
                    <View className="p-5">
                      <View className="flex-row items-center justify-between mb-1.5">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest">
                            {item.category}
                          </Text>
                          {item.price === 0 && (
                            <Text className="text-[9px] font-black text-success-default bg-success-surface px-1.5 rounded uppercase">FREE</Text>
                          )}
                        </View>
                        <Text className="text-[10px] font-bold text-content-faint">
                          ⏱ {item.date} · {item.time}
                        </Text>
                      </View>

                      <Text className="text-base font-extrabold text-content-primary leading-snug mb-1.5">
                        {item.title}
                      </Text>

                      <Text className="text-xs text-content-tertiary mb-3" numberOfLines={2}>
                        {item.description}
                      </Text>

                      <View className="flex-row items-center justify-between border-t border-faint pt-3">
                        <View className="flex-row items-center">
                          <Ionicons name="location-outline" size={13} color="#6B7280" />
                          <Text className="text-xs font-semibold text-content-muted ml-1">
                            {item.location.areaName} ({item.location.distanceKm} km away)
                          </Text>
                        </View>

                        <View className="flex-row items-center">
                          <Text className="text-[11px] font-bold text-content-secondary mr-1" numberOfLines={1}>
                            {item.host.name}
                          </Text>
                          {item.host.isVerified && (
                            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                          )}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <EmptyState
                  title="No events nearby"
                  desc="Be the first to create an event, or expand your filter range!"
                  actionText="Create Event"
                  onPressAction={() => router.push('/community-life/event/create')}
                />
              )}
            </View>
          )}

          {/* ==================== DIRECTORY TAB ==================== */}
          {activeTab === 'directory' && (
            <View className="p-5">
              
              {/* Search Bar */}
              <View className="flex-row bg-surface-card border border-subtle h-12 rounded-2xl px-4 items-center shadow-sm mb-4">
                <Ionicons name="search-outline" size={18} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder={`Search hubs, lawyers, accountants in ${selectedLocation.city}...`}
                  value={dirQuery}
                  onChangeText={setDirQuery}
                  className="flex-1 text-xs font-semibold text-content-strong"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Directory Categories */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 pb-1">
                <TouchableOpacity
                  onPress={() => setSelectedDirCat('All')}
                  className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                    selectedDirCat === 'All' ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                  }`}
                >
                  <Text className={`text-[11px] font-bold ${selectedDirCat === 'All' ? 'text-primary-500' : 'text-neutral-660'}`}>
                    All Organizations
                  </Text>
                </TouchableOpacity>
                {ORG_CATEGORIES.map((cat) => {
                  const isSelected = selectedDirCat === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedDirCat(cat)}
                      className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                        isSelected ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                      }`}
                    >
                      <Text className={`text-[11px] font-bold ${isSelected ? 'text-primary-500' : 'text-neutral-660'}`}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Directory Org Cards */}
              {orgsList.length > 0 ? (
                orgsList.map((org) => {
                  const isFollowing = isSaved(org.id);
                  return (
                    <TouchableOpacity
                      key={org.id}
                      onPress={() => router.push(`/community-life/org/${org.id}`)}
                      className="bg-surface-card rounded-3xl border border-subtle p-4 mb-4 flex-row items-center shadow-sm"
                      activeOpacity={0.9}
                    >
                      <View className="w-16 h-16 rounded-2xl bg-neutral-150 justify-center items-center mr-4 overflow-hidden border border-subtle">
                        <Ionicons name="home" size={24} color="#6B7280" />
                      </View>

                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center flex-wrap gap-1 mb-1">
                          <Text className="text-[9px] font-black text-primary-500 bg-primary-50 px-2 py-0.5 rounded uppercase">
                            {org.category}
                          </Text>
                          {org.isVerified && (
                            <View className="bg-success-surface px-1.5 py-0.5 rounded flex-row items-center">
                              <Text className="text-[8px] font-extrabold text-success-default mr-0.5">✓ VERIFIED</Text>
                            </View>
                          )}
                        </View>
                        
                        <Text className="text-sm font-black text-content-primary leading-snug" numberOfLines={1}>
                          {org.name}
                        </Text>
                        
                        <Text className="text-[11px] text-content-muted font-semibold mt-0.5">
                          📍 {org.location.areaName} · {org.followersCount} followers
                        </Text>
                      </View>

                      {/* Follow Action */}
                      <TouchableOpacity
                        onPress={() => handleSaveToggle(org.id, 'Organization')}
                        className={`px-3 py-1.5 rounded-full border ${
                          isFollowing ? 'bg-surface-background border-subtle' : 'bg-primary-500 border-primary-500'
                        }`}
                      >
                        <Text className={`text-[10px] font-black ${isFollowing ? 'text-content-muted' : 'text-white'}`}>
                          {isFollowing ? 'Following' : '+ Follow'}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <EmptyState
                  title="No organizations found"
                  desc="We couldn't find any listings matching your search. Create one now!"
                  actionText="Register Hub"
                  onPressAction={() => router.push('/community-life/org/create')}
                />
              )}
            </View>
          )}

          {/* ==================== CALENDAR TAB ==================== */}
          {activeTab === 'calendar' && (
            <View className="p-5">
              
              {/* Header Toggles: Today / Reminder / View Mode */}
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setSelectedDateStr('2026-07-13')}
                    className="bg-surface-card border border-subtle px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-xs font-bold text-content-secondary">Today</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => setReminderModalOpen(true)}
                    className="bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-xs font-bold text-primary-500">+ Reminder</Text>
                  </TouchableOpacity>
                </View>

                {/* View toggles */}
                <View className="flex-row bg-surface-card border border-subtle rounded-xl p-1">
                  {['month', 'week', 'agenda'].map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setCalendarView(mode as any)}
                      className={`px-2.5 py-1 rounded-lg ${
                        calendarView === mode ? 'bg-primary-500' : 'transparent'
                      }`}
                    >
                      <Text className={`text-[10px] font-black uppercase ${
                        calendarView === mode ? 'text-white' : 'text-content-muted'
                      }`}>
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Calendar Grid rendering */}
              {calendarView === 'month' && (
                <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm mb-5">
                  <View className="flex-row justify-between items-center mb-3 px-1">
                    <Text className="text-base font-black text-content-strong">July 2026</Text>
                    <View className="bg-surface-background px-2 py-0.5 rounded border border-subtle">
                      <Text className="text-[8px] font-black text-neutral-450 uppercase">Cached Calendar Mode</Text>
                    </View>
                  </View>

                  {/* Weekdays */}
                  <View className="flex-row mb-2">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                      <Text key={idx} className="flex-1 text-center text-xs font-extrabold text-content-faint">
                        {day}
                      </Text>
                    ))}
                  </View>

                  {/* Days */}
                  <View className="flex-row flex-wrap">
                    {julyDays.map((dayNum, idx) => {
                      if (dayNum === null) return <View key={idx} className="w-[14.28%] aspect-square" />;
                      const dateString = `2026-07-${dayNum < 10 ? '0' + dayNum : dayNum}`;
                      const isSelected = selectedDateStr === dateString;
                      const isToday = dateString === '2026-07-13';
                      const dayEvents = calendarEvents.filter(e => e.date === dateString);
                      const hasEvents = dayEvents.length > 0;

                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => setSelectedDateStr(dateString)}
                          className={`w-[14.28%] aspect-square items-center justify-center rounded-xl p-1 relative ${
                            isSelected ? 'bg-primary-500' : isToday ? 'bg-surface-muted' : 'transparent'
                          }`}
                        >
                          <Text className={`text-xs font-black ${
                            isSelected ? 'text-white' : isToday ? 'text-primary-500' : 'text-content-strong'
                          }`}>
                            {dayNum}
                          </Text>
                          {hasEvents && (
                            <View className={`w-1 h-1 rounded-full absolute bottom-1 ${
                              isSelected ? 'bg-surface-card' : 'bg-primary-500'
                            }`} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Day Agenda Details */}
              <View>
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">
                  Schedule for {selectedDateStr}
                </Text>
                
                {selectedDateEvents.length > 0 ? (
                  selectedDateEvents.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => {
                        if (item.type === 'Event') router.push(`/community-life/event/${item.associatedId}`);
                      }}
                      className="bg-surface-card border border-subtle p-4 rounded-2xl flex-row items-center mb-3 shadow-sm"
                      disabled={item.type !== 'Event'}
                    >
                      <View
                        className="w-3 h-10 rounded-full mr-3"
                        style={{ backgroundColor: item.color || '#F59300' }}
                      />
                      <View className="flex-1">
                        <Text className="text-[9px] font-black uppercase text-neutral-450">
                          {item.type} {item.time ? `· ${item.time}` : ''}
                        </Text>
                        <Text className="text-sm font-black text-content-strong">{item.title}</Text>
                      </View>
                      {item.type === 'Event' && <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-8">
                    <Ionicons name="cafe-outline" size={32} color="#D1D5DB" />
                    <Text className="text-xs text-content-faint font-bold mt-2">No schedules or reminders for this date</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ==================== SAVED TAB ==================== */}
          {activeTab === 'saved' && (
            <View className="p-5">
              
              {/* Search bar inside Saved Tab to search saved items */}
              <View className="flex-row bg-surface-card border border-subtle h-11 rounded-2xl px-4 items-center shadow-sm mb-5">
                <Ionicons name="search-outline" size={16} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder="Search saved events & followed hubs..."
                  value={savedSearchQuery}
                  onChangeText={setSavedSearchQuery}
                  className="flex-1 text-xs font-semibold text-content-strong"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Saved Events */}
              <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3.5">
                Saved Events ({savedEvents.length})
              </Text>
              
              {savedEvents.length > 0 ? (
                savedEvents.map((evt) => (
                  <TouchableOpacity
                    key={evt.id}
                    onPress={() => router.push(`/community-life/event/${evt.id}`)}
                    className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
                    activeOpacity={0.9}
                  >
                    <View className="w-16 h-16 rounded-2xl bg-neutral-200 mr-4 overflow-hidden justify-center items-center">
                      <Ionicons name="sparkles" size={24} color="#6B7280" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[9px] font-black text-primary-500 uppercase">{evt.category}</Text>
                      <Text className="text-sm font-black text-content-primary mt-0.5" numberOfLines={1}>
                        {evt.title}
                      </Text>
                      <Text className="text-xs text-neutral-450 font-bold mt-0.5">
                        🗓 {evt.date} · {evt.location.areaName}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-8 mb-6">
                  <Ionicons name="bookmark-outline" size={28} color="#D1D5DB" />
                  <Text className="text-xs text-content-faint font-bold mt-2">No saved events match search</Text>
                </View>
              )}

              {/* Followed Organizations */}
              <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3.5 mt-4">
                Followed Hubs ({followedOrgs.length})
              </Text>
              
              {followedOrgs.length > 0 ? (
                followedOrgs.map((org) => (
                  <TouchableOpacity
                    key={org.id}
                    onPress={() => router.push(`/community-life/org/${org.id}`)}
                    className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
                    activeOpacity={0.9}
                  >
                    <View className="w-16 h-16 rounded-2xl bg-neutral-200 mr-4 overflow-hidden justify-center items-center">
                      <Ionicons name="home" size={24} color="#6B7280" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[9px] font-black text-primary-500 uppercase">{org.category}</Text>
                      <Text className="text-sm font-black text-content-primary mt-0.5" numberOfLines={1}>
                        {org.name}
                      </Text>
                      <Text className="text-xs text-neutral-450 font-bold mt-0.5">
                        📍 {org.location.areaName} · {org.followersCount} followers
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-8">
                  <Ionicons name="people-outline" size={28} color="#D1D5DB" />
                  <Text className="text-xs text-content-faint font-bold mt-2">Not following any hubs yet</Text>
                </View>
              )}

            </View>
          )}

          <View className="h-10" />
        </ScrollView>
      )}

      {/* --- Overlay Modal: Location Picker --- */}
      <Modal
        visible={isLocationModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsLocationModalOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsLocationModalOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-3xl p-6 min-h-[280px] shadow-2xl w-full">
              <View className="flex-row items-center justify-between mb-5">
                <Text className="text-lg font-black text-content-primary">Select Location</Text>
                <TouchableOpacity onPress={() => setIsLocationModalOpen(false)}>
                  <Text className="text-primary-500 font-bold text-sm">Close</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={LOCATIONS}
                keyExtractor={(item) => item.city}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedLocation(item);
                      setIsLocationModalOpen(false);
                    }}
                    className="flex-row items-center justify-between py-4 border-b border-faint active:bg-surface-background"
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{item.flag}</Text>
                      <Text className="text-base font-bold text-content-strong">
                        {item.city}, {item.country}
                      </Text>
                    </View>
                    {selectedLocation.city === item.city && (
                      <Ionicons name="checkmark" size={20} color="#F59300" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* --- Overlay Modal: Create Reminder --- */}
      {/* Was a hand-rolled centred Modal with no keyboard handling, so the
          multiline field and both buttons could sit behind the IME. The shared
          Dialog brings the keyboard avoidance, the scrim, the safe-area inset
          and the back-button contract with it. */}
      <Dialog
        visible={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        title="Add Personal Reminder"
        subtitle={`For date: ${selectedDateStr}`}
        testID="reminder-dialog"
        footer={
          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="neutral"
              fullWidth={false}
              className="flex-1"
              onPress={() => setReminderModalOpen(false)}
            />
            <Button
              label="Save Reminder"
              fullWidth={false}
              className="flex-1"
              disabled={!reminderText.trim()}
              onPress={handleAddReminder}
            />
          </View>
        }
      >
        <TextInput
          placeholder="e.g. Call embassy to check visa status..."
          placeholderTextColor={tokens.color.text.placeholder}
          value={reminderText}
          onChangeText={setReminderText}
          accessibilityLabel="Reminder"
          className="bg-surface-background border border-subtle rounded-xl p-4 text-sm font-semibold"
          style={{ color: tokens.color.text.primary, minHeight: 88, textAlignVertical: 'top' }}
          multiline
        />
      </Dialog>

    </SafeAreaView>
  );
}

// Reusable Empty State helper
function EmptyState({ title, desc, actionText, onPressAction }: { title: string; desc: string; actionText: string; onPressAction: () => void }) {
  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-10 shadow-sm mt-2">
      <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
      <Text className="text-base font-extrabold text-content-strong mt-3">{title}</Text>
      <Text className="text-xs text-content-muted mt-1 text-center leading-relaxed max-w-[220px]">
        {desc}
      </Text>
      <TouchableOpacity
        onPress={onPressAction}
        className="bg-primary-500 px-5 py-2.5 rounded-full mt-5"
      >
        <Text className="text-white font-bold text-xs">{actionText}</Text>
      </TouchableOpacity>
    </View>
  );
}
