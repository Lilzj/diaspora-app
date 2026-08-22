// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Execution history (Frontend Phase 18, §36 · §67)
//
// Every run, across every automation, or filtered to one.
//
// ── §67, and why this is a FlashList rather than a ScrollView ────────────────
//
// *"Do not load every execution history record at once."* An automation that
// fires hourly produces eight thousand runs a year, and a member checking why
// something did not arrive last Tuesday should not wait for all of them. Twenty
// per page, virtualized, fetched as they scroll.
//
// ── The filter, and the outcome it exists for ────────────────────────────────
//
// Filtering by status matters most for one case: "show me what failed". That is
// the question somebody opens this screen with, and it is why `Failed` is a
// first-class chip rather than something reachable through a menu.
//
// **Skipped is a chip too**, and deliberately so. A member wondering why they
// heard nothing needs to find the runs where a condition said no — those are
// not failures, they are the system working, and they are invisible if the only
// filter is "failed".
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useAutomationRuns } from '@/hooks/automation';
import { AutomationErrorNotice, RunRow } from '@/components/automation';
import { trackAutomationEvent } from '@/lib/automation/events';
import type { AutomationRun, AutomationRunStatus } from '@/types/automation';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useRefreshControl } from '@/hooks/usePullToRefresh';

const FILTERS: { value: AutomationRunStatus | null; label: string }[] = [
  { value: null, label: 'Everything' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PARTIALLY_COMPLETED', label: 'Partly done' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'COMPLETED', label: 'Completed' },
];

export default function AutomationHistoryScreen() {
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ automationId?: string }>();
  const automationId = params.automationId ?? null;

  const [status, setStatus] = useState<AutomationRunStatus | null>(null);

  const { runs, isLoading, isFetchingMore, hasMore, loadMore, refetch, error } = useAutomationRuns(
    automationId,
    status
  );

  useEffect(() => {
    trackAutomationEvent('automation.history.viewed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRun = useCallback(
    (run: AutomationRun) => {
      router.push(
        `/automation/run/${run.id}?automationId=${run.automationId}` as never
      );
    },
    []
  );

  const renderRow = useCallback(
    ({ item }: { item: AutomationRun }) => (
      <RunRow run={item} onPress={() => openRun(item)} showAutomationName={!automationId} />
    ),
    [openRun, automationId]
  );

  const emptyMessage = useMemo(() => {
    if (status !== null) return 'Nothing in this group.';
    return 'Nothing has run yet.';
  }, [status]);

  const bottomInset = useBottomInset();
  // A run history is a feed: the whole reason to open it is to see what has
  // happened since. Pulling is the gesture people already try.
  const refreshControl = useRefreshControl(refetch);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="History" showBack />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 pt-2 pb-1"
        accessibilityRole="tablist"
      >
        {FILTERS.map((filter) => {
          const selected = status === filter.value;
          return (
            <Pressable
              key={filter.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={filter.label}
              onPress={() => setStatus(filter.value)}
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
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color={tokens.color.primary[500]} />
        </View>
      ) : error ? (
        <View className="px-4 pt-4">
          <AutomationErrorNotice
            message={
              error.blame === 'platform'
                ? 'There is no run history yet'
                : error.message
            }
            hint={
              error.blame === 'platform'
                ? // Was: "Diaspora cannot run automations automatically yet, so
                  // there is nothing to show here." `GET /automations/runs`
                  // answers and `AutomationSchedulerWorker` is what fills it, so
                  // that sentence described a platform that no longer exists. A
                  // platform blame on this read is a fault, and an *empty*
                  // history is a different state handled below.
                  (error.recoveryHint
                    ?? 'This is on the platform rather than on your automations. Anything you have set up is saved and still scheduled.')
                : error.recoveryHint
            }
            blame={error.blame}
          />
        </View>
      ) : runs.length === 0 ? (
        <View className="px-8 py-16 items-center">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black text-center mb-1"
          >
            {emptyMessage}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium text-center leading-relaxed"
          >
            When your automations run, each one will appear here with what it did.
          </Text>
        </View>
      ) : (
        <FlashList
          data={runs}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          refreshControl={refreshControl}
          ListFooterComponent={
            isFetchingMore ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={tokens.color.primary[500]} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
