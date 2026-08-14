// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — neighbourhood intelligence (Frontend Phase 8, §23–§26)
//
// §53's Journey 8: neighbourhood → map → safety layer → score → cost of living
// → compare.
//
// ── The hybrid, made visible ─────────────────────────────────────────────────
//
// This is the most genuinely half-real screen in the phase and it is deliberate
// about which half is which:
//
//   **Real, from `/neighborhood/{id}`** — the overview text, the safety score,
//   the walkability figure, the cost band, and the resource counts for housing,
//   jobs, marketplace, events, providers and organizations. These render
//   without a simulation marker because they are not simulated.
//
//   **Simulated** — the nine-dimension breakdown, the cost-of-living
//   categories, the trends, and the methodology around the safety number. Each
//   is marked at field level by the `Sourced<T>` envelope and the per-dimension
//   `freshness.sourceName`, not by a banner over the whole page.
//
// A banner over the whole page would be wrong in both directions: it would tell
// a member the safety score is invented when it is the one number that is not,
// and it would let the invented cost categories hide behind a single dismissible
// warning.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  CostOfLivingPanel,
  DiasporaMap,
  MapErrorState,
  MapLoadingState,
  MapsGapNotice,
  NeighborhoodScorePanel,
  SafetyScorePanel,
  SecondaryButton,
} from '@/components/maps';
import {
  useCostOfLiving,
  useNeighborhoodOverview,
  useNeighborhoodScore,
  useSafetyScore,
} from '@/hooks/maps';
import { getMapFeatureFlags, canShowSimulatedDetail } from '@/config/map-config';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { viewportFromCenter } from '@/lib/maps/geo';
import type { MapViewport } from '@/types/maps';
import { useBottomInset } from '@/components/layout/bottom-inset';

type Tab = 'overview' | 'safety' | 'cost';

export default function NeighborhoodIntelligenceScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const flags = getMapFeatureFlags();

  const [tab, setTab] = useState<Tab>('overview');

  const overview = useNeighborhoodOverview(id);
  const score = useNeighborhoodScore(id);
  const safety = useSafetyScore(id);
  const cost = useCostOfLiving(id);

  const [viewport, setViewport] = useState<MapViewport | null>(null);

  const mapViewport = useMemo(() => {
    if (viewport) return viewport;
    if (!overview.data) return null;
    return viewportFromCenter(
      { latitude: overview.data.latitude, longitude: overview.data.longitude },
      2.5
    );
  }, [overview.data, viewport]);

  const handleTab = useCallback((next: Tab) => {
    setTab(next);
    if (next === 'safety') trackMapsEvent('maps.safety_score.viewed');
    if (next === 'cost') trackMapsEvent('maps.cost_of_living.viewed');
    if (next === 'overview') trackMapsEvent('maps.neighborhood_score.viewed');
  }, []);

  if (overview.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
        <ScreenHeader title="Neighbourhood" />
        <MapLoadingState label="Loading this neighbourhood…" />
      </SafeAreaView>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
        <ScreenHeader title="Neighbourhood" />
        <View className="px-4 pt-4">
          <MapErrorState
            kind={overview.isError ? classifyError(overview.error) : 'not-found'}
            onRetry={() => void overview.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const data = overview.data;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title={data.name} />

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* ── Map ────────────────────────────────────────────────────────── */}
        <View style={{ height: 180 }}>
          {mapViewport ? (
            <DiasporaMap
              viewport={mapViewport}
              onViewportChange={setViewport}
              markers={[]}
              circles={[
                {
                  id: 'neighborhood-area',
                  center: { latitude: data.latitude, longitude: data.longitude },
                  // An indicative radius, drawn dashed-soft and labelled
                  // "approximate area" — never a confident boundary polygon.
                  // FRONTEND-MAPS-GAP-016: a drawn line is a claim about where a
                  // neighbourhood ends, and members rent on the strength of it.
                  radiusMetres: 1200,
                  fillColor: `${tokens.color.primary[500]}18`,
                  strokeColor: `${tokens.color.primary[500]}66`,
                },
              ]}
              clustering={false}
              showControls={false}
              accessibilityLabel={`Map showing the approximate area of ${data.name} in ${data.cityName}. The exact boundary is not published.`}
            />
          ) : null}
        </View>

        <View className="px-4 pt-4">
          {/* ── Certified overview ──────────────────────────────────────── */}
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-3xl border p-5"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest"
            >
              {data.cityName}, {data.countryName}
            </Text>
            <Text style={{ color: tokens.color.text.primary }} className="text-xl font-black mt-0.5">
              {data.name}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mt-2"
            >
              {data.overview}
            </Text>

            {/* Real counts from the certified route. No marker, because there
                is nothing simulated about them. */}
            <View className="flex-row flex-wrap gap-2 mt-4">
              {(
                [
                  ['Homes', data.resourceCounts.housing, '/housing'],
                  ['Jobs', data.resourceCounts.jobs, '/job'],
                  ['For sale', data.resourceCounts.marketplace, '/marketplace'],
                  ['Events', data.resourceCounts.events, '/community-life'],
                  ['Services', data.resourceCounts.providers, '/provider'],
                  ['Groups', data.resourceCounts.organizations, '/community-life/events?tab=directory'],
                ] as const
              ).map(([label, count]) => (
                <View
                  key={label}
                  style={{ backgroundColor: tokens.color.neutral[100] }}
                  className="px-3 py-2 rounded-xl"
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${count} ${label.toLowerCase()} within 5 kilometres`}
                >
                  <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                    {count}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-black uppercase tracking-wider"
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View className="mt-4">
              <SecondaryButton
                label="See these on the map"
                icon="map-outline"
                onPress={() =>
                  router.push({
                    pathname: '/map',
                    params: {
                      lat: String(data.latitude),
                      lon: String(data.longitude),
                    },
                  })
                }
              />
            </View>
          </View>

          {/* ── Tabs ────────────────────────────────────────────────────── */}
          <View
            accessibilityRole="tablist"
            style={{ backgroundColor: tokens.color.neutral[100] }}
            className="flex-row rounded-2xl p-1 mt-4"
          >
            {(
              [
                ['overview', 'Scores'],
                ['safety', 'Safety'],
                ['cost', 'Cost'],
              ] as const
            ).map(([value, label]) => {
              const isActive = tab === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => handleTab(value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={label}
                  style={{
                    backgroundColor: isActive ? tokens.color.surface.card : 'transparent',
                  }}
                  className="flex-1 py-2.5 rounded-xl items-center"
                  testID={`neighborhood-tab-${value}`}
                >
                  <Text
                    style={{
                      color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder,
                    }}
                    className="text-[11px] font-black"
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── Panels ──────────────────────────────────────────────────── */}
          <View className="mt-4">
            {tab === 'overview' ? (
              score.data ? (
                <NeighborhoodScorePanel
                  score={score.data}
                  onCompare={() =>
                    router.push({
                      pathname: '/map/compare',
                      params: {
                        ids: [id, ...score.data!.nearbyNeighborhoodIds.slice(0, 2)].join(','),
                      },
                    })
                  }
                />
              ) : score.isLoading ? (
                <MapLoadingState label="Loading the score breakdown…" />
              ) : (
                <CertifiedStatsFallback
                  safetyScore={data.stats.safetyScore}
                  walkability={data.stats.walkability}
                  costOfLiving={data.stats.costOfLiving}
                  gapKey="neighborhoodScores"
                />
              )
            ) : null}

            {tab === 'safety' ? (
              safety.data ? (
                <SafetyScorePanel score={safety.data} />
              ) : safety.isLoading ? (
                <MapLoadingState label="Loading safety information…" />
              ) : (
                <CertifiedStatsFallback
                  safetyScore={data.stats.safetyScore}
                  walkability={data.stats.walkability}
                  costOfLiving={data.stats.costOfLiving}
                  gapKey="safetyScoreProvenance"
                  emphasis="safety"
                />
              )
            ) : null}

            {tab === 'cost' ? (
              cost.data ? (
                <CostOfLivingPanel index={cost.data} />
              ) : cost.isLoading ? (
                <MapLoadingState label="Loading cost information…" />
              ) : (
                <CertifiedStatsFallback
                  safetyScore={data.stats.safetyScore}
                  walkability={data.stats.walkability}
                  costOfLiving={data.stats.costOfLiving}
                  gapKey="costOfLiving"
                  emphasis="cost"
                />
              )
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * What the screen shows when the simulated detail is unreachable.
 *
 * This is the production path, and it is the reason §58's distinction matters.
 * The screen does **not** go blank and does not say "coming soon": it renders
 * the three figures the certified route genuinely returns, attributed, and then
 * explains which richer view is missing and why. A member in production gets
 * less than a member in a development build, and what they get is true.
 */
function CertifiedStatsFallback({
  safetyScore,
  walkability,
  costOfLiving,
  gapKey,
  emphasis,
}: {
  safetyScore: number;
  walkability: number;
  costOfLiving: string;
  gapKey: string;
  emphasis?: 'safety' | 'cost';
}) {
  const { tokens } = useTheme();

  const rows = [
    { label: 'Community safety', value: `${safetyScore}/100`, highlight: emphasis === 'safety' },
    { label: 'Walkability', value: `${walkability}/100`, highlight: false },
    { label: 'Cost of living', value: costOfLiving, highlight: emphasis === 'cost' },
  ];

  return (
    <View>
      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        }}
        className="rounded-3xl border p-5"
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black uppercase tracking-widest mb-3"
        >
          Published for this neighbourhood
        </Text>

        {rows.map((row) => (
          <View
            key={row.label}
            className="flex-row items-center justify-between py-2.5"
            style={{ borderTopWidth: row.label === rows[0].label ? 0 : 1, borderTopColor: tokens.color.border.default }}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${row.label}: ${row.value}`}
          >
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold">
              {row.label}
            </Text>
            <Text
              style={{
                color: row.highlight ? tokens.color.primary[500] : tokens.color.text.primary,
              }}
              className="text-sm font-black"
            >
              {row.value}
            </Text>
          </View>
        ))}

        {/* §26 applies whether or not the provenance is simulated. These
            limitations are true of the certified figure too. */}
        <View
          style={{ borderTopColor: tokens.color.border.default }}
          className="border-t pt-3 mt-3"
        >
          <View className="flex-row items-center">
            <Ionicons name="information-circle-outline" size={12} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold ml-1"
            >
              Source: Diaspora community data
            </Text>
          </View>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-semibold leading-relaxed mt-1.5"
          >
            • The safety figure is community-reported, not an official crime statistic.{'\n'}
            • It describes a whole neighbourhood and says nothing about a particular street or time
            of day.{'\n'}• It must not be the only basis for a decision about where to live.
          </Text>
        </View>
      </View>

      <View className="mt-3">
        <MapsGapNotice gapKey={gapKey} />
      </View>
    </View>
  );
}
