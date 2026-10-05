import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useThemeTokens } from '@/design-system';
import { backOr } from '@/lib/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Release notes
//
// ── There is nothing to show, and saying so is the whole screen ──────────────
//
// This screen listed `mockReleaseAnnouncements` from `mocks/explore-data.ts`:
// version numbers, dates, feature bullets and "walkthrough" links for releases
// that were never made. Before that it called `GET /explore/announcements`.
//
// **Neither the route nor the content exists.** The backend has no `/explore`
// prefix at all, and "release notes" / "what's new" has *zero* occurrences
// anywhere in `diaspora-backend` — there is no changelog entity, no changelog
// route, and nothing that publishes one. A member reading the old screen was
// reading invented version history: dates that never happened, describing
// features against release numbers this app has never shipped.
//
// An earlier note on this file argued the fixture was fine because a changelog
// "ships with the build". That argument survives only if somebody actually
// writes the changelog. Nobody did — the entries were placeholder copy — so what
// shipped was a fabricated release history presented as this app's own record of
// itself, which is worse than an empty page rather than better.
//
// ── The route that looks like a substitute, and is not ───────────────────────
//
// `GET /api/v1/communities/announcements` exists and is **deliberately not used
// here**. That is CommunityProgramme's announcement feed — scoped by community,
// audience-filtered, about events in a member's own community. Pointing a
// changelog at it because both are called "announcements" would collapse two
// unrelated domains on a shared name, and the member would see a community
// notice under the heading "What's New in Diaspora".
//
// ── Why the file stays ───────────────────────────────────────────────────────
//
// `components/explore/AnnouncementCard.tsx` and the app's deep-link surface both
// navigate to `/explore/release-notes`. Deleting the route would turn those into
// dead navigations; keeping it means the member arrives somewhere that tells
// them plainly that there is nothing to read, instead of at a blank screen or a
// router error.
// ─────────────────────────────────────────────────────────────────────────────

export default function ReleaseNotesScreen() {
  const tokens = useThemeTokens();

  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => backOr()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-black text-content-primary tracking-tight">Release Notes</Text>
          <Text className="text-[10px] text-content-faint font-bold uppercase tracking-wider">What&apos;s New</Text>
        </View>
      </View>

      <ScrollEndScrollView className="flex-1 px-6 pt-5" showsVerticalScrollIndicator={false}>
        <View className="items-center bg-surface-card rounded-3xl border border-subtle p-6 py-10">
          <Text
            className="text-4xl mb-3"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            🗞️
          </Text>

          <Text
            className="text-base font-black text-content-primary text-center"
            accessibilityRole="header"
          >
            There are no release notes to show
          </Text>

          <Text className="text-xs text-content-muted text-center mt-2.5 leading-relaxed">
            Diaspora does not publish a changelog in the app. Nothing here has been withheld and
            nothing failed to load — there is simply no release history for this screen to list.
          </Text>

          <Text className="text-[11px] text-content-faint text-center mt-4 leading-relaxed">
            Announcements about your own communities are a different thing entirely, and they appear
            in Community Life rather than here.
          </Text>

          <TouchableOpacity
            onPress={() => backOr()}
            className="bg-primary-500 px-6 py-3 rounded-2xl mt-6"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text className="text-white font-black text-xs">Go back</Text>
          </TouchableOpacity>
        </View>

        <View className="h-2" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
