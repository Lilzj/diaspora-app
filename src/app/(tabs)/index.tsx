// ─────────────────────────────────────────────────────────────────────────────
// Home — Remediation Wave D-1
//
// **This screen used to be fixtures.** Every rail on it — the urgent alerts, the
// seasonal band, "Trending Guides" and "Community Updates" — read
// `mocks/community-data.ts` directly and rendered the same three guides and the
// same three updates on every device, for every member, in every country, with
// the word "Trending" above them. No request was made. `Diaspora.Modules.Recommendations`
// has served a real personalised feed at `/recommendations/feed` the whole time.
//
// It now renders that feed and nothing else. The four fixture rails are gone;
// `mocks/community-data.ts` is untouched and still read by the eleven other
// screens that use it.
//
// ── The three rules this screen holds to ─────────────────────────────────────
//
// **1. Sections are rendered in the order they arrive, matched by `key`, never
// by position.** The server drops a section that falls under its minimum item
// count, so the feed's shape genuinely differs between two members and between
// two days for the same member. Nothing here reserves a slot, pads a rail or
// assumes a section is present.
//
// **2. An empty feed renders as empty.** Loading, empty and failed are three
// different states with three different things to say, and none of them is a
// fixture. That is the whole point of the wave: the previous screen could not
// have an empty state, because it could not fail.
//
// **3. A card renders what the wire carries.** `RecommendationResponse` is flat
// — no salary, no author, no rent — so `RecommendationCard` shows the title, the
// summary, the place and the server's own reason. See the note in that file for
// why `JobCard` and `GuideCard` cannot be reused here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SectionHeader } from '@/components/SectionHeader';
import { seeAllDestination } from '@/lib/see-all-routes';
import { NotificationBell } from '@/components/NotificationBell';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { RecommendationCard } from '@/components/RecommendationCard';
import { useAuthStore } from '@/store/auth';
import { useLocationStore, getActiveLocation, locationLabel } from '@/store/location';
import { OfficialNoticesBanner } from '@/components/intelligence/OfficialNoticesBanner';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { CurrentLocationBanner } from '@/components/CurrentLocationBanner';
import { useExploreStore } from '@/store/explore';
import { WelcomeModal } from '@/components/explore/WelcomeModal';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { FeatureGate } from '@/components/FeatureGate';
import { feedbackFor, useHomeFeed, useRecommendationFeedback } from '@/hooks/recommendations';
import { routeForRecommendation } from '@/lib/recommendations-api';
import type { FeedSection, Recommendation } from '@/types/recommendations';
import { useThemeTokens } from '@/design-system';
import { readSearch } from '@/lib/search-intent';
import { resolveSearch } from '@/lib/search-place';
import { sentenceParams } from '@/lib/search-sentence';

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

  // ── Searching in a sentence (owner, 5 Nov 2026) ───────────────────────────
  //
  // This bar was a button that opened Discover empty. It now takes a sentence,
  // "where to braid my hair near me", "3 bedroom flat in Grand Baie", reads it
  // with plain rules (no AI), finds its place, and opens Discover on the right
  // tab, already filtered. See `lib/search-intent.ts` and `lib/search-place.ts`.
  // The examples rotate, and name the member's own town where the app knows it.
  const tokens = useThemeTokens();
  const homeTown = activeLocation.cityName?.trim();
  const placeholders = [
    'Try “hair braiding near me”',
    homeTown ? `Try “3 bedroom flat in ${homeTown}”` : 'Try “3 bedroom flat near me”',
    'Try “jobs near me”',
    'Try “plumber near me”',
    'Search services, homes, jobs...',
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [isReadingSearch, setIsReadingSearch] = useState(false);

  const submitSearch = useCallback(async () => {
    const said = searchText.trim();

    if (!said) {
      router.push('/discover');
      return;
    }
    if (isReadingSearch) return;

    setIsReadingSearch(true);
    try {
      // A town is looked up (the world list, then Google) and "near me" may ask
      // the phone where it is, so this can take a moment; the bar says so.
      const search = await resolveSearch(readSearch(said), {
        location: activeLocation,
        searchRadius: store.searchRadius,
        detectLocation: store.detectLocation,
      });
      router.push({ pathname: '/(tabs)/discover', params: sentenceParams(search, String(Date.now())) } as never);
    } finally {
      setIsReadingSearch(false);
    }
  }, [searchText, isReadingSearch, activeLocation, store.searchRadius, store.detectLocation]);

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

  // ── The feed ───────────────────────────────────────────────────────────────
  //
  // The country comes from the location switcher rather than from the profile:
  // `country` is the only signal `/feed` accepts from the client, and a member
  // who has switched to Mauritius is asking to see Mauritius.
  const { sections, feed, isLoading, isRefreshing, isEmpty, error, isSignedOut, refresh } =
    useHomeFeed();

  const feedback = useRecommendationFeedback();

  const openRecommendation = useCallback(
    (item: Recommendation) => {
      const destination = routeForRecommendation(item);
      // Null is filtered out by the card, which renders an unopenable item as a
      // plain view. Checked again because a null here would be a navigation to
      // nowhere rather than a type error.
      if (!destination) return;

      feedback.click(feedbackFor(item));
      // The codebase's convention for a route computed at runtime. Expo Router's
      // `Href` is a union of literal route strings, and a value assembled from a
      // server response is not one of them at compile time — it is one of them at
      // run time, which is what `routeForRecommendation` guarantees.
      router.push(destination as never);
    },
    [feedback]
  );

  const dismissRecommendation = useCallback(
    (item: Recommendation) => {
      void feedback.dismiss(feedbackFor(item));
    },
    [feedback]
  );

  const recordImpression = useCallback(
    (item: Recommendation) => {
      feedback.view(feedbackFor(item));
    },
    [feedback]
  );

  return (
    <FeatureGate featureName="Home Feed">
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Header Panel */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-faint bg-surface-card shadow-sm shadow-neutral-100">
        <View className="flex-row items-center">
          <Avatar uri={user?.avatarUrl} name={user?.fullName || 'Member'} size={38} />
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
                📍 {locationLabel(activeLocation)}
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
            <NotificationBell />
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

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          // `/feed` has no pagination — one request returns the whole screen —
          // so pull-to-refresh is the only way a member asks for a newer one.
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
        }
      >
        {/* Styled High-Elevation Search Bar */}
        <View className="px-6 my-4">
          <TourSpotlight spotlightKey="search_button" style={{ width: '100%' }}>
            <View
              className="w-full h-14 bg-surface-card rounded-2xl border border-faint flex-row items-center pl-4 pr-2"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.05,
                shadowRadius: 10,
                elevation: 4,
              }}
            >
              <Text className="text-lg mr-3 text-content-faint">🔍</Text>
              <TextInput
                testID="home-search-input"
                value={searchText}
                onChangeText={setSearchText}
                placeholder={placeholders[placeholderIdx]}
                placeholderTextColor={tokens.color.text.placeholder}
                returnKeyType="search"
                onSubmitEditing={submitSearch}
                editable={!isReadingSearch}
                autoCorrect={false}
                accessibilityLabel="Search services, homes and jobs"
                accessibilityHint="Type what you need and where, for example jobs near me"
                className="flex-1 h-full text-sm font-semibold text-content-strong"
              />
              {isReadingSearch ? (
                <ActivityIndicator className="px-3" />
              ) : searchText.trim() ? (
                <TouchableOpacity
                  onPress={submitSearch}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                  className="h-10 px-4 rounded-xl bg-primary-500 items-center justify-center"
                >
                  <Text className="text-sm font-bold text-white">Search</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TourSpotlight>
        </View>

        {/* Official notices for the country the member is in (8 Oct 2026).
            Above the community band: a notice is the platform speaking to
            everyone here, and it is the one thing on Home with a deadline. */}
        <OfficialNoticesBanner
          countryCode={activeLocation.countryCode}
          countryName={activeLocation.countryName}
        />

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
          <QuickActionChip label="Find Services" icon="🔍" onPress={() => router.push({ pathname: '/(tabs)/discover', params: { tab: 'Providers' } } as never)} />
          <QuickActionChip label="Community Life" icon="🎉" onPress={() => router.push('/community-life')} />
          <QuickActionChip label="Browse Guides" icon="📖" onPress={() => router.push('/knowledge/guides')} />
          <QuickActionChip label="Find Jobs" icon="💼" onPress={() => router.push({ pathname: '/(tabs)/discover', params: { tab: 'Jobs' } } as never)} />
          <QuickActionChip label="Find Housing" icon="🏠" onPress={() => router.push({ pathname: '/(tabs)/discover', params: { tab: 'Housing' } } as never)} />
          <QuickActionChip label="Create Post" icon="➕" onPress={() => router.push('/create')} />
        </ScrollView>

        {/* ── The recommendations feed ─────────────────────────────────────── */}

        {isLoading ? (
          <FeedSkeleton />
        ) : error ? (
          <FeedError message={error} isSignedOut={isSignedOut} onRetry={refresh} />
        ) : isEmpty ? (
          // Rule 2. An empty feed is empty. The screen it replaced could not
          // reach this state, because it had nothing to be empty of.
          <EmptyState
            icon="🧭"
            title="Nothing recommended yet"
            description="As you read, search and save, this page fills up with things chosen for where you are and what you are looking for."
            action={
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Explore the app"
                onPress={() => router.push('/discover')}
                className="bg-primary-500 px-5 py-3 rounded-xl active:bg-primary-600"
              >
                <Text className="text-white font-extrabold text-sm">Start exploring</Text>
              </TouchableOpacity>
            }
          />
        ) : (
          <>
            {/* The platform saying, in its own words, that it does not know this
                member yet. Rendered from `isColdStart` and `profileCompleteness`
                rather than inferred from an empty section — a generic feed and
                an absent feed are different things. */}
            {feed?.isColdStart ? (
              <View className="px-6 mb-4">
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Your profile is ${feed.profileCompleteness} percent complete. Complete it for better recommendations.`}
                  onPress={() => router.push('/profile')}
                  activeOpacity={0.9}
                  className="bg-surface-card rounded-2xl border border-faint p-4 flex-row items-center"
                >
                  <Text className="text-xl mr-3">✨</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-black text-content-strong">
                      These are popular picks, not yours yet
                    </Text>
                    <Text className="text-xs font-semibold text-content-muted mt-0.5 leading-relaxed">
                      Your profile is {feed.profileCompleteness}% complete. Finish it and this page
                      starts choosing for you.
                    </Text>
                  </View>
                  <Text className="text-content-faint ml-2">›</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Rule 1. In the order the server sent, keyed by `key`. Nothing
                below reads `sections[n]`. */}
            {sections.map((section) => (
              <FeedSectionRail
                key={section.key}
                section={section}
                onOpen={openRecommendation}
                onDismiss={dismissRecommendation}
                onImpression={recordImpression}
              />
            ))}
          </>
        )}

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

/**
 * One rail.
 *
 * The section's `title` is the server's, not this screen's — a client that
 * hard-coded "Trending Guides" above `trending-guides` would be back where this
 * wave started, telling the member something the platform did not say.
 *
 * `seeAllRoute` is rendered as a link **only when the server sent one**.
 * `continue-learning` has nowhere to go in this application, and offering a
 * "see all" that opened the wrong list would be worse than not offering one.
 */
function FeedSectionRail({
  section,
  onOpen,
  onDismiss,
  onImpression,
}: {
  section: FeedSection;
  onOpen: (item: Recommendation) => void;
  onDismiss: (item: Recommendation) => void;
  onImpression: (item: Recommendation) => void;
}) {
  // A section can only arrive with items — the server drops an under-filled one
  // — but a local dismissal can empty one between two renders, and an empty rail
  // with a heading reads as a broken screen.
  if (section.items.length === 0) return null;

  return (
    <View className="mb-4">
      <SectionHeader
        title={section.title}
        onSeeAll={(() => {
          // The server's route named screens this app lacks (17 Oct 2026).
          const destination = seeAllDestination(section);
          return destination ? () => router.push(destination as never) : undefined;
        })()}
      />

      {/* The cold-start marker is per section, not global: a member with a full
          profile can still cold-start one rail by never having used that part of
          the app. Saying so is what makes the rail's contents explicable. */}
      {section.isColdStart ? (
        <Text className="px-6 mb-2 text-[10px] font-bold text-content-faint uppercase tracking-wider">
          Popular picks
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
      >
        {section.items.map((item) => (
          <RecommendationCard
            // `targetId` is unique across the feed; `position` is not — it
            // restarts at zero in every section.
            key={`${section.key}:${item.targetId}`}
            item={item}
            onOpen={onOpen}
            onDismiss={onDismiss}
            onImpression={onImpression}
            variant="carousel"
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Two rails' worth of placeholder, so the screen has the shape it will have. */
function FeedSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading your feed">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[0, 1].map((rail) => (
          <View key={rail} className="mb-6">
            <View className="px-6 mb-3">
              <Skeleton width="45%" height={20} />
            </View>
            <View className="flex-row px-6">
              {[0, 1].map((card) => (
                <View
                  key={card}
                  className="w-[280px] bg-surface-card rounded-2xl p-4 mr-4 border border-subtle"
                >
                  <Skeleton width="30%" height={16} className="mb-3" />
                  <Skeleton width="85%" height={18} className="mb-2" />
                  <Skeleton width="60%" height={14} className="mb-3" />
                  <Skeleton width="40%" height={14} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The failed state.
 *
 * Signed out is separated from everything else because it is the only failure
 * here with an action attached — and because it does not look like one. No route
 * in the Recommendations module is decorated with `.RequireAuthorization()`; the
 * check lives in a pipeline behaviour that throws, so the platform writes a bare
 * 401 with no `WWW-Authenticate` challenge and a generic handler reads it as a
 * server fault.
 */
function FeedError({
  message,
  isSignedOut,
  onRetry,
}: {
  message: string;
  isSignedOut: boolean;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={isSignedOut ? '🔑' : '📡'}
      title={isSignedOut ? 'Sign in to see your feed' : 'We could not load your feed'}
      description={message}
      action={
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={isSignedOut ? 'Sign in' : 'Try again'}
          onPress={() => (isSignedOut ? router.push('/login') : onRetry())}
          className="bg-primary-500 px-5 py-3 rounded-xl active:bg-primary-600"
        >
          <Text className="text-white font-extrabold text-sm">
            {isSignedOut ? 'Sign in' : 'Try again'}
          </Text>
        </TouchableOpacity>
      }
    />
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
