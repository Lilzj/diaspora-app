import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
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
import { useLocationStore, getActiveLocation } from '@/store/location';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { CurrentLocationBanner } from '@/components/CurrentLocationBanner';
import { getDistanceKm } from '@/utils/geo';
import { useExploreStore } from '@/store/explore';
import { WelcomeModal } from '@/components/explore/WelcomeModal';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { FeatureGate } from '@/components/FeatureGate';

// Frontend Phase 13 — Multi-Community Expansion (§16).
//
// §16: the Home experience adapts to community context, and there is **no separate
// Home implementation per community**. So this screen gains one band — the community
// context, its scope chip and a route into the community itself — and every existing
// section stays exactly as it was.
//
// The band is honest about the three states a member can be in: no community chosen,
// one community active, or several. It is the only place on Home that mentions
// communities, because §16's list of possible sections is a menu rather than a
// mandate, and adding eight community-shaped rails to a screen that already has six
// would make Home worse.
import {
  CommunityAvatar,
  CommunityScopeChip,
  CommunitySelectorSheet,
  communityOriginLabel,
} from '@/components/community-directory';
import { useCommunityContext } from '@/hooks/communities';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function HomeScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { user } = useAuthStore();
  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false);

  // Frontend Phase 13, §16.
  const communityFlags = getCommunityFeatureFlags();
  const communityContext = useCommunityContext();
  const [isCommunitySelectorOpen, setIsCommunitySelectorOpen] = useState(false);

  // Rotating placeholder suggestions
  const placeholders = [
    'Search services...',
    'Search guides...',
    'Find jobs...',
    'Find housing...',
    'Search businesses...',
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  const exploreStore = useExploreStore();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Synchronize persistent explore state
    const initOnboarding = async () => {
      await exploreStore.loadPersistedState();
      
      // Auto-trigger welcome if onboarding is not finished, and no tour is currently paused/active
      if (
        exploreStore.hasLoadedPersistedState &&
        !exploreStore.onboardingCompleted &&
        !exploreStore.pausedTourId &&
        !exploreStore.activeTour
      ) {
        // Small delay to let the app load location permissions first
        setTimeout(() => {
          setShowWelcome(true);
        }, 1200);
      }
    };
    initOnboarding();
  }, [exploreStore.onboardingCompleted, exploreStore.hasLoadedPersistedState]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Compute dynamic distances for community updates
  const updatesWithDistance = mockCommunityUpdates.map((u) => {
    const dist = u.location.latitude && u.location.longitude
      ? getDistanceKm(activeLocation.latitude, activeLocation.longitude, u.location.latitude, u.location.longitude)
      : undefined;
    return {
      ...u,
      location: {
        ...u.location,
        distanceKm: dist,
      },
    };
  });

  const urgentUpdates = updatesWithDistance.filter(
    (u) =>
      (u.urgency === 'Emergency' || u.urgency === 'Urgent') &&
      (u.location.distanceKm === undefined || u.location.distanceKm < 50 || u.location.cityName.toLowerCase() === activeLocation.cityName.toLowerCase())
  );

  // Filter trending guides by country relevance
  const trendingGuides = mockGuides
    .filter((g) => !g.location?.countryCode || g.location.countryCode === activeLocation.countryCode)
    .slice(0, 3);

  // Filter and sort normal updates by proximity
  const recentUpdates = updatesWithDistance
    .filter((u) => u.urgency !== 'Emergency' && u.urgency !== 'Urgent')
    .sort((a, b) => {
      if (a.location.distanceKm !== undefined && b.location.distanceKm !== undefined) {
        return a.location.distanceKm - b.location.distanceKm;
      }
      return a.location.distanceKm !== undefined ? -1 : 1;
    })
    .slice(0, 3);

  const activeSeasonal = mockSeasonalContent[0];

  return (
    <FeatureGate featureName="Home Feed">
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Header Panel */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-faint bg-surface-card shadow-sm shadow-neutral-100">
        <View className="flex-row items-center">
          <Avatar name={user?.fullName || 'Joshua'} size={38} />
          <View className="ml-3">
            {/* Greeting */}
            <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">
              {user?.fullName ? `Welcome back, ${user.fullName}` : 'Welcome back, Joshua'}
            </Text>
            {/* Location Switcher Trigger */}
            <TouchableOpacity
              onPress={() => setIsLocationSelectorOpen(true)}
              className="flex-row items-center mt-0.5"
              activeOpacity={0.7}
            >
              <Text className="text-sm font-extrabold text-content-primary mr-1">
                📍 {activeLocation.neighborhood}, {activeLocation.cityName}
              </Text>
              <Text className="text-xs text-content-muted font-bold">· {activeLocation.flag} ▾</Text>
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
          <TourSpotlight spotlightKey="notification_icon">
            <TouchableOpacity 
              onPress={() => router.push('/notifications')}
              className="p-2 active:opacity-60"
            >
              <Text className="text-xl">🔔</Text>
            </TouchableOpacity>
          </TourSpotlight>
        </View>
      </View>

      {/* Startup permission / travel mode banners */}
      <CurrentLocationBanner
        location={activeLocation}
        travelMode={store.travelMode}
        permissionStatus={store.permissionStatus}
        onActionPress={() => setIsLocationSelectorOpen(true)}
      />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* Styled High-Elevation Search Bar */}
        <View className="px-6 my-4">
          <TourSpotlight spotlightKey="search_button" style={{ width: '100%' }}>
            <TouchableOpacity
              onPress={() => router.push('/discover')}
              activeOpacity={0.9}
              className="w-full h-14 bg-surface-card rounded-2xl border border-faint flex-row items-center px-4"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.05,
                shadowRadius: 10,
                elevation: 4,
              }}
            >
              <Text className="text-lg mr-3 text-content-faint">🔍</Text>
              <Text className="text-sm font-semibold text-content-muted">
                {placeholders[placeholderIdx]}
              </Text>
            </TouchableOpacity>
          </TourSpotlight>
        </View>

        {/* Frontend Phase 13, §16. The community band. */}
        {communityFlags.multiCommunityEnabled ? (
          <View className="px-6 mb-4">
            {communityContext.hasNoCommunities && !communityContext.isLoading ? (
              // §9/§71: a member with no community is a supported state, not an
              // error. The invitation is an offer, and the app works without it.
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Choose your communities. Diaspora can show you what matters to the communities you belong to."
                onPress={() => router.push('/community/onboarding')}
                activeOpacity={0.9}
                className="bg-surface-card rounded-2xl border border-faint p-4"
              >
                <View className="flex-row items-center">
                  <Text className="text-xl mr-3">🌍</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-black text-content-strong">
                      Choose your communities
                    </Text>
                    <Text className="text-xs font-semibold text-content-muted mt-0.5 leading-relaxed">
                      See guides, jobs, housing and events from the communities you belong to. You can
                      skip this and browse everything.
                    </Text>
                  </View>
                  <Text className="text-content-faint ml-2">›</Text>
                </View>
              </TouchableOpacity>
            ) : communityContext.activeCommunity || communityContext.primaryCommunity ? (
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Your community: ${
                  (communityContext.activeCommunity ?? communityContext.primaryCommunity)!.name
                }. Open it.`}
                onPress={() => {
                  const community =
                    communityContext.activeCommunity ?? communityContext.primaryCommunity;
                  if (community) router.push(`/community/${community.slug}`);
                }}
                activeOpacity={0.9}
                className="bg-surface-card rounded-2xl border border-faint p-4"
              >
                <View className="flex-row items-center">
                  <CommunityAvatar
                    community={(communityContext.activeCommunity ?? communityContext.primaryCommunity)!}
                    size={40}
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest">
                      Your community
                    </Text>
                    <Text className="text-sm font-black text-content-strong mt-0.5">
                      {(communityContext.activeCommunity ?? communityContext.primaryCommunity)!.name}
                    </Text>
                    <Text className="text-[10px] font-bold text-content-muted mt-0.5">
                      {communityOriginLabel(
                        (communityContext.activeCommunity ?? communityContext.primaryCommunity)!
                      )}
                      {communityContext.interestedCommunityIds.length > 0
                        ? ` · following ${communityContext.interestedCommunityIds.length} more`
                        : ''}
                    </Text>
                  </View>
                  <Text className="text-content-faint ml-2">›</Text>
                </View>

                <View className="flex-row items-center mt-3">
                  <CommunityScopeChip onPress={() => setIsCommunitySelectorOpen(true)} compact />
                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Browse all communities"
                    onPress={() => router.push('/community')}
                    className="ml-2"
                  >
                    <Text className="text-[10px] font-bold text-primary-600">All communities</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Quick Actions Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }}
          className="mb-2"
        >
          <QuickActionChip label="Find Services" icon="🔍" onPress={() => router.push('/discover')} />
          <QuickActionChip label="Community Life" icon="🎉" onPress={() => router.push('/community-life')} />
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
                  update={update}
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

      {/* Global Location Selector Drawer Modal */}
      <CommunitySelectorSheet
        visible={isCommunitySelectorOpen}
        onClose={() => setIsCommunitySelectorOpen(false)}
      />

      <GlobalLocationSelector
        visible={isLocationSelectorOpen}
        onClose={() => setIsLocationSelectorOpen(false)}
      />
      
      {/* Welcome Onboarding Modal */}
      <WelcomeModal
        visible={showWelcome}
        onClose={() => setShowWelcome(false)}
      />
      </SafeAreaView>
    </FeatureGate>
  );
}

// Quick Action Chip UI
function QuickActionChip({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-row items-center bg-surface-card border border-faint rounded-2xl px-4 py-3 mr-3 shadow-sm shadow-neutral-100/50"
    >
      <Text className="text-base mr-2">{icon}</Text>
      <Text className="text-sm font-bold text-content-primary">{label}</Text>
    </TouchableOpacity>
  );
}
