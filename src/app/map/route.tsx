// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — route planning (Frontend Phase 8, §17)
//
// §53's Journeys 5, 6 and 7 begin here: choose a destination, pick a mode,
// review the route (and the alternatives, and — for transit — the transfers),
// then start.
//
// ── Honesty about what the numbers are ───────────────────────────────────────
//
// No routing provider is configured (MAP-PROVIDER-GAP-003/004). Every figure on
// this screen therefore comes from the development routing adapter, and every
// one is rendered through a component that carries `<EstimateQualifier>`
// internally — the screen cannot present an estimate as a routed time even by
// omission.
//
// The transit tab is the sharpest case. §16 asks for the complete experience,
// and it is here: total duration, the walk-in and walk-out legs shown
// separately, the ride, the transfers, and departure and arrival times. It is
// also entirely derived, because a transit itinerary needs a timetable and
// there is no timetable anywhere on this platform. The provider notice sits
// above it saying exactly that.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  DiasporaMap,
  MapErrorState,
  MapLoadingState,
  MapProviderNotice,
  PrimaryButton,
  RouteInstructionList,
  RouteSummaryCard,
  SecondaryButton,
  TransitItinerary,
  TravelModeSwitcher,
} from '@/components/maps';
import { useCurrentLocation, useRoutePlanner } from '@/hooks/maps';
import { useMapSessionStore } from '@/store/map-session';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { getMapFeatureFlags } from '@/config/map-config';
import { boundsToViewport } from '@/lib/maps/geo';
import { endpointMarker } from '@/lib/maps/markers';
import { trackMapsEvent, trackRoutePlanned } from '@/lib/maps/analytics';
import { openExternalDirections } from '@/lib/maps/external-navigation';
import type { GeoPoint, MapViewport, Route, TravelMode } from '@/types/maps';

export default function RoutePlanningScreen() {
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{
    destLat?: string;
    destLon?: string;
    destLabel?: string;
    mode?: string;
  }>();

  const activeLocation = useLocationStore(getActiveLocation);
  const { deviceLocation, addRecentDestination } = useMapSessionStore();
  const location = useCurrentLocation();
  const planner = useRoutePlanner();
  const flags = getMapFeatureFlags();

  const [travelMode, setTravelMode] = useState<TravelMode>(
    (params.mode as TravelMode) ?? 'walking'
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | null>(null);

  const destination: GeoPoint | null = useMemo(() => {
    const latitude = Number(params.destLat);
    const longitude = Number(params.destLon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      id: 'destination',
      coordinate: { latitude, longitude },
      label: params.destLabel ?? 'Your destination',
    };
  }, [params.destLat, params.destLon, params.destLabel]);

  // The device fix when there is one, the member's chosen location otherwise.
  // Never a silent failure: without either there is nothing to route from, and
  // the screen says so rather than routing from a default somewhere else.
  const origin: GeoPoint = useMemo(
    () => ({
      id: 'origin',
      coordinate: deviceLocation?.coordinate ?? {
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
      },
      label: deviceLocation ? 'Where you are' : (activeLocation.displayName ?? 'Your location'),
    }),
    [activeLocation, deviceLocation]
  );

  const plan = useCallback(
    async (mode: TravelMode) => {
      if (!destination) return;

      const routes = await planner.plan({
        origin,
        destination,
        travelMode: mode,
        alternatives: true,
        departureAt: mode === 'transit' ? new Date().toISOString() : undefined,
      });

      if (routes.length > 0) {
        setSelectedRouteId(routes[0].id);
        setViewport(boundsToViewport(routes[0].bounds));
        trackRoutePlanned({
          travelMode: mode,
          distanceMetres: routes[0].distance.metres,
          durationSeconds: routes[0].duration.seconds,
          isRouted: routes[0].source !== 'simulated',
          alternativeCount: routes.length,
          waypointCount: 0,
        });
      }
    },
    [destination, origin, planner]
  );

  useEffect(() => {
    void plan(travelMode);
    // Re-plans on a mode change or a new destination, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelMode, destination?.coordinate.latitude, destination?.coordinate.longitude]);

  const selectedRoute: Route | null = useMemo(
    () => planner.routes.find((route) => route.id === selectedRouteId) ?? planner.routes[0] ?? null,
    [planner.routes, selectedRouteId]
  );

  const markers = useMemo(() => {
    if (!destination) return [];
    return [
      endpointMarker('origin', 'origin', origin.coordinate, origin.label),
      endpointMarker('destination', 'destination', destination.coordinate, destination.label),
    ];
  }, [destination, origin]);

  const polylines = useMemo(() => {
    if (!selectedRoute) return [];

    // Alternatives are drawn dashed and behind, so the chosen route is
    // unambiguous. A member comparing three identical solid lines cannot tell
    // which one the summary card is describing.
    return [
      ...planner.routes
        .filter((route) => route.id !== selectedRoute.id)
        .map((route) => ({
          id: route.id,
          path: route.path,
          color: tokens.color.neutral[400],
          widthPx: 3,
          dashed: true,
        })),
      {
        id: selectedRoute.id,
        path: selectedRoute.path,
        color: tokens.color.primary[500],
        widthPx: 5,
      },
    ];
  }, [planner.routes, selectedRoute, tokens]);

  const handleStart = useCallback(() => {
    if (!selectedRoute || !destination) return;

    addRecentDestination({
      id: `${destination.coordinate.latitude.toFixed(4)},${destination.coordinate.longitude.toFixed(4)}`,
      label: destination.label,
      coordinate: destination.coordinate,
      travelMode,
    });

    router.push({
      pathname: '/map/navigate',
      params: {
        destLat: String(destination.coordinate.latitude),
        destLon: String(destination.coordinate.longitude),
        destLabel: destination.label,
        mode: travelMode,
      },
    });
  }, [addRecentDestination, destination, selectedRoute, travelMode]);

  const handleExternal = useCallback(() => {
    if (!destination) return;
    trackMapsEvent('maps.navigation.handed_off', { travelMode });
    void openExternalDirections(destination.coordinate, destination.label, travelMode);
  }, [destination, travelMode]);

  if (!destination) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
        <ScreenHeader title="Directions" />
        <View className="px-4 pt-4">
          <MapErrorState kind="invalid-coordinates" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Directions" />

      <View style={{ height: 260 }}>
        {viewport ? (
          <DiasporaMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={markers}
            polylines={polylines}
            userLocation={deviceLocation}
            clustering={false}
            showControls={false}
            accessibilityLabel={`Map showing the route from ${origin.label} to ${destination.label}. The full list of directions is below.`}
          />
        ) : (
          <MapLoadingState label="Working out the route…" />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* ── Endpoints ──────────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          <View className="flex-row items-center mb-2.5">
            <View
              style={{ backgroundColor: tokens.color.success.default, width: 9, height: 9 }}
              className="rounded-full mr-3"
            />
            <Text
              numberOfLines={1}
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold flex-1"
            >
              {origin.label}
            </Text>
            {!deviceLocation && location.canRequest ? (
              <Pressable
                onPress={() => void location.request()}
                accessibilityRole="button"
                accessibilityLabel="Use my current position as the starting point"
              >
                <Text
                  style={{ color: tokens.color.primary[500] }}
                  className="text-[10px] font-black uppercase tracking-wider"
                >
                  Use my position
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View className="flex-row items-center">
            <View
              style={{ backgroundColor: tokens.color.error.default, width: 9, height: 9 }}
              className="rounded-full mr-3"
            />
            <Text
              numberOfLines={1}
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold flex-1"
            >
              {destination.label}
            </Text>
          </View>
        </View>

        {/* ── Mode ───────────────────────────────────────────────────────── */}
        <TravelModeSwitcher
          mode={travelMode}
          onChange={(mode) => {
            trackMapsEvent('maps.route.mode_changed', { travelMode: mode });
            setTravelMode(mode);
          }}
          supportedModes={planner.supportedModes}
          simulatedModes={planner.isSimulated ? planner.supportedModes : []}
        />

        {/* §16: transit is complete and entirely derived. Said plainly, above
            the itinerary rather than beneath it. */}
        {travelMode === 'transit' ? (
          <View className="mt-3">
            <MapProviderNotice providerGapKey="transit" compact />
          </View>
        ) : null}

        {!flags.transitEnabled && travelMode === 'transit' ? (
          <View className="mt-3">
            <MapErrorState kind="transit-unavailable" />
          </View>
        ) : null}

        {/* ── Routes ─────────────────────────────────────────────────────── */}
        <View className="mt-4">
          {planner.isLoading ? (
            <MapLoadingState label="Comparing routes…" />
          ) : planner.error ? (
            <MapErrorState
              kind={planner.error}
              onRetry={() => void plan(travelMode)}
            />
          ) : planner.routes.length === 0 ? (
            <MapErrorState kind="no-route" />
          ) : (
            <>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest mb-2"
              >
                {planner.routes.length === 1
                  ? 'Your route'
                  : `${planner.routes.length} ways to get there`}
              </Text>

              {planner.routes.map((route) => (
                <RouteSummaryCard
                  key={route.id}
                  route={route}
                  isSelected={route.id === selectedRoute?.id}
                  supportsTraffic={planner.supportsTraffic}
                  onSelect={() => {
                    setSelectedRouteId(route.id);
                    setViewport(boundsToViewport(route.bounds));
                    trackMapsEvent('maps.route.alternative_selected', {
                      travelMode: route.travelMode,
                    });
                  }}
                />
              ))}
            </>
          )}
        </View>

        {/* ── Transit itinerary — §16 ────────────────────────────────────── */}
        {selectedRoute && selectedRoute.travelMode === 'transit' ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-4 mt-3"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest mb-3"
            >
              Your journey
            </Text>
            <TransitItinerary route={selectedRoute} />
          </View>
        ) : null}

        {/* ── Steps ──────────────────────────────────────────────────────── */}
        {selectedRoute && selectedRoute.travelMode !== 'transit' ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-4 mt-3"
          >
            <Pressable
              onPress={() => setShowSteps((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showSteps }}
              accessibilityLabel={`${showSteps ? 'Hide' : 'Show'} the step-by-step directions`}
              className="flex-row items-center justify-between"
            >
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest"
              >
                Step by step
              </Text>
              <Ionicons
                name={showSteps ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={tokens.color.text.placeholder}
              />
            </Pressable>

            {showSteps ? (
              <View className="mt-3">
                <RouteInstructionList route={selectedRoute} />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <View className="gap-2 mt-5">
          {flags.navigationEnabled && selectedRoute ? (
            <PrimaryButton label="Start" onPress={handleStart} icon="navigate" />
          ) : null}

          {/* Always offered. With no navigation provider this is the honest
              capability — a real hand-off to an app that can actually guide,
              rather than a stub. §18. */}
          <SecondaryButton
            label="Open in your maps app"
            onPress={handleExternal}
            icon="open-outline"
          />
        </View>

        {!flags.navigationEnabled ? (
          <View className="mt-3">
            <MapProviderNotice providerGapKey="navigationGuidance" compact />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
