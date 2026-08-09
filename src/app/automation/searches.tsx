// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Saved searches (Frontend Phase 18, §30)
//
// One saved-search surface, shared by jobs, marketplace, housing, providers and
// events.
//
// ── §30's instruction, and what it rules out ─────────────────────────────────
//
// *"Do not duplicate saved-search logic across modules."*
//
// So this is the only saved-search screen. A member who saved a job search and
// a housing search sees both here, with one set of alert controls, rather than
// two module-specific screens each holding half their searches and each with
// their own idea of what "alerts on" means.
//
// The list screens *save* searches — that is where the criteria are — and they
// bring the member here to manage them. That is an entry point, not a second
// management surface.
//
// ── What the audit found, and why this screen is new rather than migrated ────
//
// The application had **no saved-search capability of any kind**.
// `store/knowledge-search.ts` holds transient filter state that is discarded on
// navigation, and nothing persisted a query anywhere. So there was nothing to
// consolidate — this is new surface, and the consolidation §30 asks for is a
// constraint on what comes next rather than a cleanup of what was there.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useSavedSearches, useSavedSearchMutations } from '@/hooks/automation';
import { AutomationErrorNotice, SavedSearchRow } from '@/components/automation';
import type { SavedSearch, SavedSearchSubject } from '@/types/automation';

const SUBJECTS: { value: SavedSearchSubject | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'housing', label: 'Housing' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'providers', label: 'Providers' },
  { value: 'events', label: 'Events' },
];

export default function SavedSearchesScreen() {
  const { tokens } = useTheme();
  const [subject, setSubject] = useState<SavedSearchSubject | null>(null);

  const { searches, isLoading, error } = useSavedSearches(subject);
  const mutations = useSavedSearchMutations();

  const toggleAlerts = useCallback(
    (search: SavedSearch) => {
      void mutations.update.mutateAsync({
        id: search.id,
        changes: {
          alertsEnabled: !search.alertsEnabled,
          // Turning alerts on without a frequency would save a search that
          // says "alerts on" and has no cadence — a state that reads as
          // working and is not. Instant is the default because it is what
          // somebody switching alerts on is asking for.
          alertFrequency: !search.alertsEnabled ? 'instant' : 'off',
        },
      });
    },
    [mutations]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, SavedSearch[]>();
    for (const search of searches) {
      const existing = map.get(search.subject);
      if (existing) existing.push(search);
      else map.set(search.subject, [search]);
    }
    return map;
  }, [searches]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Saved searches" showBack />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 pt-2 pb-1"
        accessibilityRole="tablist"
      >
        {SUBJECTS.map((entry) => {
          const selected = subject === entry.value;
          return (
            <Pressable
              key={entry.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={entry.label}
              onPress={() => setSubject(entry.value)}
              style={{
                backgroundColor: selected ? tokens.color.primary[500] : tokens.color.surface.card,
                borderColor: selected ? tokens.color.primary[500] : tokens.color.surface.border,
              }}
              className="rounded-full border px-3.5 py-2 mr-2 h-9 justify-center"
            >
              <Text
                style={{
                  color: selected ? tokens.color.text.inverse : tokens.color.text.secondary,
                }}
                className="text-[11px] font-black"
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView className="flex-1 px-4 pt-2" contentContainerStyle={{ paddingBottom: 48 }}>
        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={tokens.color.primary[500]} />
          </View>
        ) : error ? (
          <AutomationErrorNotice
            message={
              error.blame === 'platform' ? 'Saved searches are not ready yet' : error.message
            }
            hint={
              error.blame === 'platform'
                ? 'You will be able to save a search from any list and be told when something new matches it.'
                : error.recoveryHint
            }
            blame={error.blame}
          />
        ) : searches.length === 0 ? (
          <View className="items-center py-12 px-6">
            <Ionicons name="bookmark-outline" size={36} color={tokens.color.primary[500]} />
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black mt-4 mb-1 text-center"
            >
              No saved searches yet
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-medium text-center leading-relaxed"
            >
              Search for a job, a home or something in the marketplace, then save it. Diaspora can
              watch it for you.
            </Text>
          </View>
        ) : (
          Array.from(grouped.entries()).map(([key, entries]) => (
            <View key={key} className="mb-5">
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest mb-2"
              >
                {SUBJECTS.find((entry) => entry.value === key)?.label ?? key}
              </Text>

              {entries.map((search) => (
                <SavedSearchRow
                  key={search.id}
                  name={search.name}
                  querySummary={search.querySummary}
                  subject={search.subject}
                  alertsEnabled={search.alertsEnabled}
                  alertFrequency={search.alertFrequency}
                  isSimulated={search.isSimulated}
                  onPress={() =>
                    search.automationId
                      ? router.push(`/automation/${search.automationId}` as never)
                      : router.push('/automation' as never)
                  }
                  onToggleAlerts={() => toggleAlerts(search)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
