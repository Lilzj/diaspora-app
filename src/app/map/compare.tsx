// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — neighbourhood comparison (Frontend Phase 8, §24)
//
// The last step of §53's Journey 8. Two or three neighbourhoods side by side,
// dimension by dimension.
//
// ── What it deliberately does not compute ────────────────────────────────────
//
// A winner. There is no "best match", no weighted composite, no ranking. §23
// forbids the frontend inventing authoritative scores, and a screen that told
// somebody "Peckham is the better choice for you" would be doing exactly that —
// from nine numbers, two of which are development estimates, about a decision
// that involves a job, a school, a family and a budget none of which this
// application knows about.
//
// What it does is put the numbers next to each other and let the member decide.
// That is a smaller feature and the only honest one available.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  MapErrorState,
  MapLoadingState,
  MapsGapNotice,
  NeighborhoodComparison,
} from '@/components/maps';
import { useNeighborhoodComparison } from '@/hooks/maps';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function NeighborhoodComparisonScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { ids } = useLocalSearchParams<{ ids?: string }>();

  const neighborhoodIds = useMemo(
    () =>
      (ids ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        // Three columns is the limit on a phone. A fourth makes every number
        // too small to read, which defeats the purpose of the screen.
        .slice(0, 3),
    [ids]
  );

  const comparison = useNeighborhoodComparison(neighborhoodIds);

  React.useEffect(() => {
    if (comparison.data && comparison.data.length >= 2) {
      trackMapsEvent('maps.neighborhood.compared', { comparisonCount: comparison.data.length });
    }
  }, [comparison.data]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Compare areas" />

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }}>
        {neighborhoodIds.length < 2 ? (
          <View className="px-4 pt-4">
            <MapErrorState kind="not-found" />
          </View>
        ) : comparison.isLoading ? (
          <MapLoadingState label="Loading the comparison…" />
        ) : comparison.isError ? (
          <View className="px-4 pt-4">
            <MapErrorState
              kind={classifyError(comparison.error)}
              onRetry={() => void comparison.refetch()}
            />
          </View>
        ) : comparison.data && comparison.data.length >= 2 ? (
          <>
            <View className="px-4 pt-4 pb-2">
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                Higher is better on every row. We do not pick a winner — which area suits you
                depends on things this app does not know about.
              </Text>
            </View>

            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="mx-4 rounded-3xl border py-4"
            >
              <NeighborhoodComparison scores={comparison.data} />
            </View>

            <View className="px-4 pt-4">
              <MapsGapNotice
                gapKey="neighborhoodScores"
                detail="Comparison is done on the device by fetching each area separately. There is no backend comparison contract, so the rows marked as estimates are development figures — the safety, transport, housing, jobs, services, events and community rows are derived from published Diaspora data."
              />
            </View>
          </>
        ) : (
          <View className="px-4 pt-4">
            <MapErrorState kind="no-results" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
