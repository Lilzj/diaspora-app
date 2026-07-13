import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { mockCommunityUpdates, mockGuides, mockAuthors, mockSeasonalContent } from '@/mocks/community-data';
import { AlertBanner } from '@/components/AlertBanner';
import { GuideCard } from '@/components/GuideCard';
import { UpdateCard } from '@/components/UpdateCard';
import { SeasonalSection } from '@/components/SeasonalSection';
import { SectionHeader } from '@/components/SectionHeader';
import { Avatar } from '@/components/Avatar';
import { useAuthStore } from '@/store/auth';

interface LocationOption {
  city: string;
  country: string;
  flag: string;
}

const LOCATIONS: LocationOption[] = [
  { city: 'London', country: 'United Kingdom', flag: '🇬🇧' },
  { city: 'Port Louis', country: 'Mauritius', flag: '🇲🇺' },
  { city: 'Lagos', country: 'Nigeria', flag: '🇳🇬' },
  { city: 'Accra', country: 'Ghana', flag: '🇬🇭' },
];

export default function HomeScreen() {
  const { user } = useAuthStore();
  const [selectedLocation, setSelectedLocation] = useState<LocationOption>(LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Rotating placeholder suggestions
  const placeholders = [
    'Search services...',
    'Search guides...',
    'Find jobs...',
    'Find housing...',
    'Search businesses...',
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const urgentUpdates = mockCommunityUpdates.filter(
    (u) => u.urgency === 'Emergency' || u.urgency === 'Urgent'
  );
  const trendingGuides = mockGuides.slice(0, 2);
  const recentUpdates = mockCommunityUpdates.filter(
    (u) => u.urgency === 'Normal' || u.urgency === 'Low'
  ).slice(0, 2);
  const activeSeasonal = mockSeasonalContent[0];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      {/* Header Panel */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-neutral-100 bg-white shadow-sm shadow-neutral-100">
        <View className="flex-row items-center">
          <Avatar name={user?.name || 'Joshua'} size={38} />
          <View className="ml-3">
            {/* Greeting */}
            <Text className="text-xs text-neutral-400 font-bold uppercase tracking-wider">
              {user?.name ? `Welcome back, ${user.name}` : 'Welcome back, Joshua'}
            </Text>
            {/* Location Switcher Trigger */}
            <TouchableOpacity
              onPress={() => setIsLocationModalOpen(true)}
              className="flex-row items-center mt-0.5"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-extrabold text-neutral-900 mr-1">
                📍 {selectedLocation.city}, {selectedLocation.country}
              </Text>
              <Text className="text-xs text-neutral-400">· 18°C ☀️ ▾</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          <TouchableOpacity 
            onPress={() => router.push('/saved')} 
            className="p-2 active:opacity-60"
          >
            <Text className="text-xl">🔖</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => router.push('/notifications')}
            className="p-2 active:opacity-60"
          >
            <Text className="text-xl">🔔</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Styled High-Elevation Search Bar */}
        <View className="px-6 my-5">
          <TouchableOpacity
            onPress={() => router.push('/discover')}
            activeOpacity={0.9}
            className="w-full h-14 bg-white rounded-2xl border border-neutral-100 flex-row items-center px-4"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            <Text className="text-lg mr-3 text-neutral-400">🔍</Text>
            <Text className="text-sm font-semibold text-neutral-500">
              {placeholders[placeholderIdx]}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }}
          className="mb-2"
        >
          <QuickActionChip label="Find Services" icon="🔍" onPress={() => router.push('/discover')} />
          <QuickActionChip label="Browse Guides" icon="📖" onPress={() => router.push('/knowledge/guides')} />
          <QuickActionChip label="Find Jobs" icon="💼" onPress={() => router.push('/discover')} />
          <QuickActionChip label="Find Housing" icon="🏠" onPress={() => router.push('/discover')} />
          <QuickActionChip label="Create Post" icon="➕" onPress={() => router.push('/create')} />
        </ScrollView>

        {/* Emergency / Urgent Alerts Banner */}
        {urgentUpdates.map((update) => (
          <AlertBanner
            key={update.updateId}
            title={update.title}
            location={update.location.areaName}
            reason={update.urgency === 'Emergency' ? 'Emergency' : 'Urgent'}
            confirmationCount={update.confirmationCount}
            verifiedCount={update.verifiedResidentConfirmationCount}
            onPress={() => router.push(`/update/${update.updateId}`)}
          />
        ))}

        {/* Seasonal Surfaced Section */}
        {activeSeasonal && (
          <SeasonalSection
            seasonal={activeSeasonal}
            guides={mockGuides.filter((g) => activeSeasonal.guideIds.includes(g.guideId))}
          />
        )}

        {/* Trending Guides Carousel */}
        <View className="mb-4">
          <SectionHeader
            title="Trending Guides"
            icon="🔥"
            onSeeAll={() => router.push('/knowledge/guides')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
          >
            {trendingGuides.map((guide) => {
              const author = mockAuthors[guide.authorId];
              return (
                <GuideCard
                  key={guide.guideId}
                  guide={{ ...guide, authorId: guide.authorId, country: guide.country }}
                  author={{
                    userId: author.userId,
                    name: author.name,
                    avatarUrl: author.avatarUrl,
                    reputationLevel: author.reputationLevel,
                    isCountryVerified: author.countryVerifications.some((v) => v.isVerified),
                    primaryCountry: author.countryVerifications.find((v) => v.isVerified) || null,
                    expertiseCategories: author.expertiseCategories,
                    followerCount: author.followerCount,
                    isFollowedByUser: author.isFollowedByUser,
                  }}
                  variant="featured"
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Community Updates Feed */}
        <View className="mb-6">
          <SectionHeader
            title="Community Updates"
            icon="📢"
            onSeeAll={() => router.push('/knowledge/updates')}
          />
          <View className="px-6">
            {recentUpdates.map((update) => {
              const author = mockAuthors[update.authorId];
              return (
                <UpdateCard
                  key={update.updateId}
                  update={{ ...update, location: { ...update.location, distanceKm: 1.2 } }}
                  author={{
                    userId: author.userId,
                    name: author.name,
                    avatarUrl: author.avatarUrl,
                    reputationLevel: author.reputationLevel,
                    isCountryVerified: author.countryVerifications.some((v) => v.isVerified),
                    primaryCountry: author.countryVerifications.find((v) => v.isVerified) || null,
                    expertiseCategories: author.expertiseCategories,
                    followerCount: author.followerCount,
                    isFollowedByUser: author.isFollowedByUser,
                  }}
                />
              );
            })}
          </View>
        </View>
        <View className="h-8" />
      </ScrollView>

      {/* Location Picker Modal Overlay */}
      <Modal
        visible={isLocationModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsLocationModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6 min-h-[300px] shadow-2xl">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-bold text-neutral-900">Select Location</Text>
              <TouchableOpacity onPress={() => setIsLocationModalOpen(false)} className="p-2">
                <Text className="text-neutral-500 font-semibold">Done</Text>
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
                  className="flex-row items-center justify-between py-4 border-b border-neutral-100 active:bg-neutral-50"
                >
                  <View className="flex-row items-center">
                    <Text className="text-2xl mr-3">{item.flag}</Text>
                    <Text className="text-base font-semibold text-neutral-800">
                      {item.city}, {item.country}
                    </Text>
                  </View>
                  {selectedLocation.city === item.city && (
                    <Text className="text-primary-500 font-bold text-base">✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Quick Action Chip UI
function QuickActionChip({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-row items-center bg-white border border-neutral-100 rounded-2xl px-4 py-3 mr-3 shadow-sm shadow-neutral-100/50"
    >
      <Text className="text-base mr-2">{icon}</Text>
      <Text className="text-sm font-bold text-neutral-800">{label}</Text>
    </TouchableOpacity>
  );
}
