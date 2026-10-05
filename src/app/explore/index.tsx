import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useExploreStore } from '@/store/explore';
import { FEATURE_TOURS } from '@/config/featureRegistry';
import { WelcomeModal } from '@/components/explore/WelcomeModal';
import { useLaunchTour } from '@/components/explore/useLaunchTour';
import { useThemeTokens } from '@/design-system';
import { backOr } from '@/lib/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Explore hub
//
// ── What this screen used to be, and why almost all of it is gone ────────────
//
// It rendered a "Product Education Hub": thirteen tutorial categories, a
// tutorial search, two "Academy" shelves, a recommendations carousel, bookmarks,
// recently-viewed, a percentage-complete progress bar, and a "What's New in
// Diaspora" changelog card. Every one of those was drawn from
// `mocks/explore-data.ts` — `mockTutorialCategories`, `mockTutorials` and
// `mockReleaseAnnouncements`.
//
// **None of it corresponds to anything the platform holds.** The audit of
// `diaspora-backend` establishes this and it is not a matter of a route being
// renamed:
//
//   * There is **no `/explore` prefix on the backend at all**. `GET
//     /explore/recommendations`, which this screen called on mount and whose
//     failure it silently swallowed into `mockTutorials.slice(0, 3)`, has never
//     been served by any module. In production that request failed on every
//     mount, logged an error, and the member was shown fixtures labelled
//     "Recommended For You".
//   * **Tutorials do not exist as a platform concept.** The word "tutorial"
//     occurs exactly once in the whole backend source, inside an unrelated
//     endpoint summary string. There is no tutorial route, no tutorial entity
//     and no tutorial progress contract.
//   * **Release notes do not exist either.** Zero occurrences repo-wide. See
//     `explore/release-notes.tsx` for the full note on why the community
//     announcement feed is *not* a substitute.
//
// So the progress bar reported a percentage of a number that meant nothing, the
// category rail offered thirteen shelves that led to fabricated articles, and
// the changelog card announced a release that was never written. Fixtures
// presented as product.
//
// ── What is left, and why it is genuinely real ───────────────────────────────
//
// **Product tours are real and they are supposed to be local.** `FEATURE_TOURS`
// in `config/featureRegistry.ts` is in-app configuration, not fetched content: a
// tour drives the member through *this build's* screens by targeting element
// keys that exist in *this bundle*. A server-authored tour could spotlight a
// control the installed app does not have. Which tours a member has finished is
// likewise local — `store/explore.ts` persists it, and there is no
// tour-progress route anywhere on the platform to synchronise it with.
//
// That distinction is the whole of this rewrite: the tours stayed because they
// are honestly local, and the tutorials went because they were pretending to be
// remote.
//
// ── Why the screen says so out loud ──────────────────────────────────────────
//
// Deleting the shelves and leaving a short page would read as a broken or
// empty-by-accident screen, and a member who came here for help would go looking
// for the missing content. The panel below names the two things that are not
// available so that the absence is understood rather than investigated.
// ─────────────────────────────────────────────────────────────────────────────

export default function ExploreDashboardScreen() {
  const tokens = useThemeTokens();
  const launchTour = useLaunchTour();
  const store = useExploreStore();

  const [showWelcome, setShowWelcome] = useState(false);

  // Tour completion is persisted locally; this is what restores it after a
  // restart. Nothing on this screen fetches.
  useEffect(() => {
    void store.loadPersistedState();
    // Mount only. `loadPersistedState` is a store action and re-running it on
    // every render of a changed store would re-read storage on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toursCompleted = store.completedTours.length;
  const totalTours = FEATURE_TOURS.length;

  // Gating, tour start and the route all live in `useLaunchTour` — this screen
  // and the tutorial reader had copied the same twenty lines, including the
  // `router.replace('/')` that landed the member on the auth Welcome screen.
  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
      {/* Page Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => backOr()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-black text-content-primary tracking-tight">Explore Diaspora</Text>
            <Text className="text-[10px] text-content-faint font-bold uppercase tracking-wider">Guided Product Tours</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setShowWelcome(true)}
          className="bg-surface-background px-3 py-2 rounded-xl border border-subtle"
          accessibilityRole="button"
          accessibilityLabel="Open the onboarding tour"
        >
          <Text className="text-[10px] font-bold text-content-tertiary">Onboarding Tour</Text>
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Tour progress — a count of local tours, not a percentage of nothing */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3">
            Your Walkthroughs
          </Text>

          <View className="flex-row justify-between items-center bg-surface-background border border-subtle rounded-2xl p-3">
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-lg mr-2.5">🔍</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-secondary">Features Discovered</Text>
                <Text className="text-[10px] text-content-faint">
                  {toursCompleted} of {totalTours} walkthroughs finished on this device
                </Text>
              </View>
            </View>
            <View className="bg-primary-50 px-2.5 py-1 rounded-lg">
              <Text className="text-[10px] font-black text-primary-500">
                {toursCompleted}/{totalTours}
              </Text>
            </View>
          </View>
        </View>

        {/* Replay Tours Directory — the real, local capability */}
        <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
          <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-1">
            Product Tours
          </Text>
          <Text className="text-[11px] text-content-faint font-semibold mb-3.5">
            Each one walks you through the real screens, highlighting the controls as you go.
          </Text>

          <View className="flex-col gap-2.5">
            {FEATURE_TOURS.map((tour) => {
              const isCompletedTour = store.completedTours.includes(tour.id);
              return (
                <TouchableOpacity
                  key={tour.id}
                  onPress={() => launchTour(tour.id)}
                  className="bg-surface-background border border-subtle rounded-2xl p-4 flex-row items-center justify-between"
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Replay ${tour.title}. ${isCompletedTour ? 'Completed before' : 'Not completed yet'}`}
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-xs font-black text-content-primary">
                      {tour.title}
                    </Text>
                    <Text className="text-[10px] text-content-faint mt-0.5" numberOfLines={1}>
                      {tour.description}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    {isCompletedTour && (
                      <Text className="text-[9px] bg-success-surface text-success-default px-1.5 py-0.5 rounded font-bold">
                        ✓ COMPLETED
                      </Text>
                    )}
                    <Text className="text-xs text-primary-500 font-extrabold">REPLAY →</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/*
          The honest part. Two features this screen used to advertise, named so
          the member understands they are absent rather than broken — and told
          where the real written knowledge lives, which is the Knowledge Hub.
        */}
        <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
          <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3">
            Not available yet
          </Text>

          <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-2.5">
            <Text className="text-xs font-black text-content-primary mb-1">
              Diaspora does not have tutorials yet
            </Text>
            <Text className="text-[11px] text-content-muted leading-relaxed">
              There is no tutorial library on the platform, so this hub has none to show you. The
              walkthroughs above are the guided help that does exist, and the Knowledge Hub holds the
              guides members have written.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/knowledge')}
              className="self-start mt-3 bg-primary-500 px-4 py-2 rounded-xl"
              accessibilityRole="button"
              accessibilityLabel="Open the Knowledge Hub"
            >
              <Text className="text-[11px] font-black text-white">Open Knowledge Hub</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-surface-background border border-subtle rounded-2xl p-4">
            <Text className="text-xs font-black text-content-primary mb-1">
              There are no release notes to show
            </Text>
            <Text className="text-[11px] text-content-muted leading-relaxed">
              Diaspora does not publish a changelog in the app, so there is nothing here describing
              what changed in this build.
            </Text>
          </View>
        </View>

        <View className="h-2" />
      </ScrollEndScrollView>

      {/* Welcome Onboarding Modal */}
      <WelcomeModal visible={showWelcome} onClose={() => setShowWelcome(false)} />
    </SafeAreaView>
  );
}
