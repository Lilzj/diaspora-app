// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Run detail (Frontend Phase 18, §37 · §38)
//
// One run: what set it off, what was checked, what was done, and — where it
// went wrong — what to do about it.
//
// The rendering is entirely `<RunDetail>`; this screen is the route and the
// fetch. Keeping the presentation in a component means a simulation and a real
// run go through the same code, which is what makes a discrepancy between them
// a component test rather than a manual comparison of two screens.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useAutomationRun } from '@/hooks/automation';
import { AutomationErrorNotice, RunDetail } from '@/components/automation';
import { trackAutomationEvent } from '@/lib/automation/events';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function AutomationRunScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ runId?: string; automationId?: string }>();

  const { run, isLoading, error } = useAutomationRun(
    params.automationId ?? null,
    params.runId ?? null
  );

  useEffect(() => {
    trackAutomationEvent('automation.run.viewed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title={run?.automationName ?? 'Run'} showBack />

      <ScrollEndScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={tokens.color.primary[500]} />
          </View>
        ) : error || !run ? (
          <View className="pt-4">
            <AutomationErrorNotice
              /* Was: "Diaspora cannot run automations automatically yet".
                 It can — this route reads one run out of a history the
                 scheduler writes. */
              message={
                error?.blame === 'platform'
                  ? 'This run could not be loaded'
                  : (error?.message ?? 'That run could not be found.')
              }
              hint={
                error?.blame === 'platform'
                  ? (error?.recoveryHint
                    ?? 'This is on the platform rather than on your automation.')
                  : error?.recoveryHint
              }
              blame={error?.blame ?? 'member'}
            />
          </View>
        ) : (
          <View className="pt-2">
            <RunDetail run={run} onNavigate={(route) => router.push(route as never)} />
          </View>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
