// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — two areas side by side (14 Oct 2026)
//
// The catalogue neighbourhood comparison is retired with the catalogue. This
// compares the areas around two points, each a Google place the member picked
// or their own location, through `GET /geo/area/compare`, which composes both
// with one radius so the two cannot be measured differently.
//
// ── What it deliberately does not compute ────────────────────────────────────
//
// A winner. No "best match", no composite, no ranking, and no safety score:
// the figures are put next to each other and the member decides.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AddressSearchField } from '@/components/maps/AddressSearchField';
import { MapErrorState, MapLoadingState, SecondaryButton } from '@/components/maps';
import { useAreaComparison } from '@/hooks/maps';
import { useMemberPoint } from '@/hooks/member-point';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { AREA_RADII_KM, DEFAULT_AREA_RADIUS_KM, type AreaPoint, type AreaReport } from '@/lib/maps/geo-client';
import { useBottomInset } from '@/components/layout/bottom-inset';

const COUNT_ROWS: readonly [string, string][] = [
  ['housing', 'Homes'],
  ['marketplace', 'For sale'],
  ['jobs', 'Jobs'],
  ['events', 'Events'],
  ['updates', 'Updates'],
];

const SAFETY_KIND_LABEL: Record<string, string> = {
  'community-reports': 'Community reports',
  'police-recorded-crime': 'Police-recorded crime',
};

function pointFrom(
  params: Record<string, string | undefined>,
  suffix: 'A' | 'B',
  fallbackCountry: string
): AreaPoint | null {
  const latitude = Number(params[`latitude${suffix}`]);
  const longitude = Number(params[`longitude${suffix}`]);
  if (!params[`latitude${suffix}`] || !params[`longitude${suffix}`]) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    countryCode: (params[`countryCode${suffix}`] || fallbackCountry || '').toUpperCase(),
    name: params[`name${suffix}`] || null,
  };
}

function label(point: AreaPoint | null, fallback: string): string {
  return point?.name?.trim() || fallback;
}

export default function AreaComparisonScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const params = useLocalSearchParams<Record<string, string>>();
  const member = useMemberPoint();

  const initialA = useMemo(
    () => pointFrom(params, 'A', member.countryCode) ?? member.point,
    // Seeded once from the params; the member then picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialB = useMemo(
    () => pointFrom(params, 'B', member.countryCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [a, setA] = useState<AreaPoint | null>(initialA);
  const [b, setB] = useState<AreaPoint | null>(initialB);
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const parsed = Number(params.radiusKm);
    return (AREA_RADII_KM as readonly number[]).includes(parsed) ? parsed : DEFAULT_AREA_RADIUS_KM;
  });

  const comparison = useAreaComparison(a, b, radiusKm);

  useEffect(() => {
    if (comparison.data && comparison.data.areas.length >= 2) {
      trackMapsEvent('maps.neighborhood.compared', { comparisonCount: comparison.data.areas.length });
    }
  }, [comparison.data]);

  const pick =
    (set: (point: AreaPoint) => void) =>
    (address: { latitude: number; longitude: number; countryCode: string | null }, text: string) =>
      set({
        latitude: address.latitude,
        longitude: address.longitude,
        countryCode: (address.countryCode || member.countryCode || '').toUpperCase(),
        name: text,
      });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Compare areas" />

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }} keyboardShouldPersistTaps="handled">
        <View className="px-4 pt-4">
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black mb-2">
            {`First: ${label(a, a ? `Within ${radiusKm} km of you` : 'not chosen yet')}`}
          </Text>
          <AddressSearchField
            label="Choose the first place"
            placeholder="A town, district or neighbourhood"
            regionsOnly
            onResolved={pick(setA)}
            testID="compare-place-a"
          />
          {member.point && a?.name ? (
            <View className="mb-3">
              <SecondaryButton label="Use where I am" icon="locate-outline" onPress={() => setA(member.point)} />
            </View>
          ) : null}

          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black mb-2 mt-2">
            {`Second: ${label(b, b ? `Within ${radiusKm} km of you` : 'not chosen yet')}`}
          </Text>
          <AddressSearchField
            label="Choose the second place"
            placeholder="A town, district or neighbourhood"
            regionsOnly
            onResolved={pick(setB)}
            testID="compare-place-b"
          />

          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="How far around each place"
            style={{ backgroundColor: tokens.color.neutral[100] }}
            className="flex-row rounded-2xl p-1 mt-2"
          >
            {AREA_RADII_KM.map((value) => {
              const isActive = value === radiusKm;
              return (
                <Pressable
                  key={value}
                  onPress={() => setRadiusKm(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${value} kilometres`}
                  style={{ backgroundColor: isActive ? tokens.color.surface.card : 'transparent' }}
                  className="flex-1 py-2.5 rounded-xl items-center"
                >
                  <Text
                    style={{ color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder }}
                    className="text-[11px] font-black"
                  >
                    {value} km
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {!a || !b ? (
          <View className="px-4 pt-4">
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
              Choose two places to put side by side.
            </Text>
          </View>
        ) : comparison.isLoading ? (
          <MapLoadingState label="Loading the comparison…" />
        ) : comparison.isError ? (
          <View className="px-4 pt-4">
            <MapErrorState kind={classifyError(comparison.error)} onRetry={() => void comparison.refetch()} />
          </View>
        ) : comparison.data && comparison.data.areas.length >= 2 ? (
          <>
            <View className="px-4 pt-4 pb-2">
              <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
                {`What is within ${comparison.data.radiusKm} km of each. We do not pick a winner — which area suits you depends on things this app does not know about.`}
              </Text>
            </View>
            <ComparisonTable areas={comparison.data.areas.slice(0, 2)} />
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

function ComparisonTable({ areas }: { areas: AreaReport[] }) {
  const { tokens } = useTheme();

  const rows: { label: string; values: string[] }[] = [
    ...COUNT_ROWS.map(([key, rowLabel]) => ({
      label: rowLabel,
      values: areas.map((area) => {
        const count = area.resourceCounts[key];
        if (typeof count !== 'number' || area.unavailableResourceTypes.includes(key)) return '—';
        return `${area.lowerBoundResourceTypes.includes(key) ? '≥' : ''}${count}`;
      }),
    })),
    {
      label: 'Rent index',
      values: areas.map((area) => {
        const rent = area.costOfLiving.index?.categories.find((category) => category.id === 'housing');
        return rent ? String(rent.index) : 'Not enough listings yet';
      }),
    },
    // Sources side by side, each on its own row. Never added up, never scored.
    ...['community-reports', 'police-recorded-crime'].map((kind) => ({
      label: SAFETY_KIND_LABEL[kind],
      values: areas.map((area) => {
        const count = area.safety.counts.find((entry) => entry.kind === kind);
        if (!count || !count.isAvailable || count.total === null) return 'Not available here';
        return String(count.total);
      }),
    })),
  ];

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="mx-4 rounded-3xl border p-4"
      testID="area-comparison"
    >
      <View className="flex-row pb-2">
        <View className="flex-1" />
        {areas.map((area, index) => (
          <Text
            key={`${area.latitude},${area.longitude},${index}`}
            style={{ color: tokens.color.text.primary }}
            className="flex-1 text-[11px] font-black text-center"
            numberOfLines={2}
          >
            {area.displayName}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View
          key={row.label}
          style={{ borderTopColor: tokens.color.border.default }}
          className="flex-row border-t py-2"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${row.label}: ${row.values
            .map((value, index) => `${areas[index].displayName} ${value}`)
            .join(', ')}`}
        >
          <Text style={{ color: tokens.color.text.secondary }} className="flex-1 text-xs font-bold">
            {row.label}
          </Text>
          {row.values.map((value, index) => (
            <Text
              key={index}
              style={{ color: tokens.color.text.primary }}
              className="flex-1 text-xs font-black text-center"
            >
              {value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
