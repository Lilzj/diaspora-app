// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — live navigation (Frontend Phase 8, §18, §19)
//
// The state machine on screen. Everything interesting lives in
// `lib/maps/navigation-machine.ts`, a pure reducer with its own unit tests;
// this screen is the wiring — a position watch in, a reducer, a banner and a
// map out.
//
// ── Why so little logic is here ──────────────────────────────────────────────
//
// The unhappy paths in §18 are the ones worth getting right, and they are the
// ones a screen written with flags gets wrong: drifting off-route while a
// recalculation is already in flight, losing permission mid-journey, exhausting
// the retries in an area with no route data. Every one of those is a transition
// in the reducer with a test beside it, and this file contains no branch that
// could disagree with it.
//
// ── The position watch ───────────────────────────────────────────────────────
//
// Opened only while `requiresPositionWatch(state)` is true. §6 forbids
// continuously requesting location a screen does not need, and a watch left
// open after arrival is the largest battery cost in this phase. It closes on
// `Arrived`, on `Cancelled`, and on unmount.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  DiasporaMap,
  MapErrorState,
  MapLoadingState,
  NavigationBanner,
} from '@/components/maps';
import { useCurrentLocation, usePositionWatch, useRoutePlanner } from '@/hooks/maps';
import { useMapSessionStore } from '@/store/map-session';
import { getActiveLocation, useLocationStore } from '@/store/location';
import {
  initialNavigationState,
  navigationReducer,
  requiresPositionWatch,
} from '@/lib/maps/navigation-machine';
import { boundsToViewport } from '@/lib/maps/geo';
import { endpointMarker } from '@/lib/maps/markers';
import { openExternalDirections } from '@/lib/maps/external-navigation';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { canUseLocation } from '@/store/map-session';
import type { GeoPoint, MapViewport, TravelMode } from '@/types/maps';
import { backOr } from '@/lib/navigation';

export default function NavigationScreen() {
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{
    destLat?: string;
    destLon?: string;
    destLabel?: string;
    mode?: string;
  }>();

  const [state, dispatch] = useReducer(navigationReducer, undefined, initialNavigationState);
  const [viewport, setViewport] = useState<MapViewport | null>(null);

  const activeLocation = useLocationStore(getActiveLocation);
  const deviceLocation = useMapSessionStore((s) => s.deviceLocation);
  const location = useCurrentLocation();
  const planner = useRoutePlanner();

  const travelMode = (params.mode as TravelMode) ?? 'walking';

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

  const origin: GeoPoint = useMemo(
    () => ({
      id: 'origin',
      coordinate: deviceLocation?.coordinate ?? {
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
      },
      label: 'Where you are',
    }),
    [activeLocation, deviceLocation]
  );

  // ── Plan, then start ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!destination) return;

    let cancelled = false;

    const run = async () => {
      dispatch({ type: 'PLAN' });
      dispatch({ type: 'ROUTE_REQUESTED' });

      const routes = await planner.plan({ origin, destination, travelMode, alternatives: false });
      if (cancelled) return;

      if (routes.length === 0) {
        dispatch({
          type: 'ROUTE_FAILED',
          error: planner.error ?? 'no-route',
        });
        return;
      }

      dispatch({ type: 'ROUTE_LOADED', routes });
      setViewport(boundsToViewport(routes[0].bounds));
      dispatch({ type: 'START' });
      trackMapsEvent('maps.navigation.started', { travelMode, isRouted: false });
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Planned once per destination and mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.coordinate.latitude, destination?.coordinate.longitude, travelMode]);

  // ── Permission lost mid-journey ───────────────────────────────────────────
  useEffect(() => {
    if (!canUseLocation(location.permission) && requiresPositionWatch(state)) {
      dispatch({ type: 'PERMISSION_LOST' });
    }
  }, [location.permission, state]);

  // ── The watch. Open only while genuinely navigating. §6. ──────────────────
  usePositionWatch(
    requiresPositionWatch(state),
    useCallback((next) => dispatch({ type: 'POSITION', location: next }), []),
    useCallback(() => dispatch({ type: 'LOCATION_LOST' }), [])
  );

  // ── Recalculation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'Recalculating' || !destination || !state.position) return;

    let cancelled = false;

    const run = async () => {
      const routes = await planner.plan({
        // From where the member actually is, not from where they set off.
        origin: { id: 'origin', coordinate: state.position!.coordinate, label: 'Where you are' },
        destination,
        travelMode,
        alternatives: false,
      });
      if (cancelled) return;

      if (routes.length === 0) {
        dispatch({ type: 'RECALCULATION_FAILED', error: planner.error ?? 'routing-failed' });
        return;
      }
      dispatch({ type: 'RECALCULATED', route: routes[0] });
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ── Terminal analytics ────────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase === 'Arrived') {
      trackMapsEvent('maps.navigation.completed', {
        travelMode,
        recalculationCount: state.recalculationCount,
      });
    }
    if (state.phase === 'OffRoute') {
      trackMapsEvent('maps.navigation.off_route', { travelMode });
    }
  }, [state.phase, state.recalculationCount, travelMode]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL' });
    trackMapsEvent('maps.navigation.cancelled', {
      travelMode,
      navigationPhase: state.phase,
    });
    backOr();
  }, [state.phase, travelMode]);

  const handleExternal = useCallback(() => {
    if (!destination) return;
    trackMapsEvent('maps.navigation.handed_off', { travelMode });
    void openExternalDirections(destination.coordinate, destination.label, travelMode);
  }, [destination, travelMode]);

  const markers = useMemo(() => {
    if (!destination) return [];
    return [endpointMarker('destination', 'destination', destination.coordinate, destination.label)];
  }, [destination]);

  const polylines = useMemo(() => {
    if (!state.route) return [];
    return [
      {
        id: state.route.id,
        path: state.route.path,
        color: tokens.color.primary[500],
        widthPx: 6,
      },
    ];
  }, [state.route, tokens]);

  if (!destination) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
        <ScreenHeader title="Navigate" />
        <View className="px-4 pt-4">
          <MapErrorState kind="invalid-coordinates" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
    >
      <ScreenHeader title={destination.label} onBack={handleCancel} />

      <View style={{ flex: 1 }}>
        {viewport ? (
          <DiasporaMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={markers}
            polylines={polylines}
            userLocation={state.position ?? deviceLocation}
            // The camera follows during navigation, which is the one situation
            // where a member wants it to. Released the moment they pan away.
            followUser
            clustering={false}
            accessibilityLabel={`Navigation map. The current instruction and remaining distance are announced below the map.`}
          />
        ) : (
          <MapLoadingState label="Working out your route…" />
        )}
      </View>

      <View className="px-4 pb-4 pt-3">
        <NavigationBanner
          state={state}
          onCancel={handleCancel}
          onRecalculate={() => dispatch({ type: 'POSITION', location: state.position! })}
          onOpenExternal={handleExternal}
        />
      </View>
    </SafeAreaView>
  );
}
