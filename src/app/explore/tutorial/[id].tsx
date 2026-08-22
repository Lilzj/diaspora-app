import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeTokens } from '@/design-system';

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Tutorial reader
//
// ── The platform has no tutorials. Not "not yet fetched" — none ──────────────
//
// This screen was a full stepper: cover image, category, difficulty, reading
// time, numbered steps with progress dots, a "Mark as Done" button and a
// bookmark toggle. All of it read one entry out of `mockTutorials` in
// `mocks/explore-data.ts`.
//
// Before that it called `GET /explore/tutorials/{id}` and fell back to the
// fixture whenever the call failed — which was every time, because **the backend
// has no `/explore` prefix at all**. The audit of `diaspora-backend` found the
// word "tutorial" exactly once in the entire source, inside an unrelated
// endpoint summary string: there is no tutorial entity, no tutorial route, and
// no tutorial-progress contract. `mockTutorials` corresponds to nothing.
//
// So every step a member read here, every difficulty rating and every "5 mins
// read", was written by nobody and describes nothing. That is the reason this
// screen no longer renders an article: there is no article, and inventing one is
// worse than admitting it.
//
// ── What was removed with it ─────────────────────────────────────────────────
//
//   * `POST /explore/progress/complete` — another unmapped route. It threw on
//     every completion and logged "Failed to sync progress to mock server", a
//     message naming the mock in a production build.
//   * The bookmark and completion controls. Both wrote to `store/explore.ts`,
//     which is genuinely local state — but marking a fabricated article as read
//     is bookkeeping about nothing, so the controls went with the article.
//
// ── Why the route survives ───────────────────────────────────────────────────
//
// `/explore/tutorial/[id]` is a reachable path: an old deep link, a
// notification, or a member's history can still land on it. A removed file makes
// that a router error; this file makes it a sentence the member can act on.
//
// **The `id` is deliberately not echoed back.** Repeating an arbitrary path
// segment into the UI is how an unfamiliar identifier ends up looking like a
// real thing that failed to load, and there is no catalogue for it to have come
// from.
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorialReaderScreen() {
  const tokens = useThemeTokens();
  // Read but not rendered — see the note above. Kept so the route's parameter
  // contract stays visible to anybody reading this file.
  useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
      {/* Top Navbar */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <Text className="text-sm font-black text-content-primary tracking-tight">Tutorial</Text>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <Text
          className="text-5xl mb-5"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          📕
        </Text>

        <Text
          className="text-base font-black text-content-primary text-center"
          accessibilityRole="header"
        >
          Diaspora does not have tutorials yet
        </Text>

        <Text className="text-xs text-content-muted text-center mt-2.5 leading-relaxed">
          There is no tutorial library on the platform, so there is nothing for this page to open.
          It has not failed to load and nothing is missing from your account.
        </Text>

        <Text className="text-[11px] text-content-faint text-center mt-4 leading-relaxed">
          What does exist: guided walkthroughs of the real screens, in Explore — and the guides
          members have written, in the Knowledge Hub.
        </Text>

        <View className="flex-row gap-2.5 mt-6">
          <TouchableOpacity
            onPress={() => router.push('/explore')}
            className="bg-primary-500 px-5 py-3 rounded-2xl"
            accessibilityRole="button"
            accessibilityLabel="Open Explore"
          >
            <Text className="text-white font-black text-xs">Explore</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/knowledge')}
            className="bg-surface-card border border-subtle px-5 py-3 rounded-2xl"
            accessibilityRole="button"
            accessibilityLabel="Open the Knowledge Hub"
          >
            <Text className="text-content-secondary font-black text-xs">Knowledge Hub</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
