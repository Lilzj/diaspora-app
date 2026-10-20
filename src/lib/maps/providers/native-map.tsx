// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — native tile map surface (Frontend Phase 8)
//
// The `react-native-maps` implementation of `MapSurface`.
//
// ⚠ NOT ACTIVE IN THIS BUILD. `react-native-maps@1.27.2` is in `package.json`
//   but has no config plugin, no API key and no development build containing
//   the native module — see MAP-PROVIDER-GAP-001. `resolveMapSurfaceProvider()`
//   selects the canvas renderer, and this file loads to `null` rather than
//   crashing the bundle. ⚠
//
// It is written now, rather than left for later, for a specific reason: it is
// the proof that the abstraction in `providers/types.ts` is adequate. An
// interface designed against one implementation is an interface shaped like
// that implementation. Writing the second one is what turns "we have an
// abstraction" into a claim with evidence behind it — and it found two things
// the canvas-only design had missed, both noted below.
//
// ── The two mismatches worth knowing about ───────────────────────────────────
//
//   **`Region` is a viewport with different field names**, which is a happy
//   accident rather than a design: `react-native-maps` chose centre-plus-deltas
//   and so did this domain. A provider using centre-plus-zoom — Mapbox does —
//   converts in its adapter via `viewportToZoom`, which is why that helper is
//   in `lib/maps/geo.ts` rather than here.
//
//   **There is no viewport-settled event.** `onRegionChangeComplete` fires on
//   every gesture end including a tap that moved nothing, so the adapter
//   debounces it into the contract's `onViewportSettled`. Had the interface
//   only ever been implemented by the canvas renderer, that method would
//   probably not exist and viewport search would have been wired to the
//   change event — which is the "request per pixel of movement" §13 forbids.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import type { GeoCoordinate, MapCluster, MapMarker, MapViewport, MarkerCategory } from '@/types/maps';
import { getMapProviderConfig } from '@/config/map-config';
import { MAP_PROVIDER_GAPS } from '@/config/map-provider-gaps';
import { CATEGORY_COLOR } from './canvas-map';
import type { MapSurfaceProps, MapSurfaceProvider } from './types';
import { heatLayerPolygons } from '../heat-shapes';

// ─────────────────────────────────────────────────────────────────────────────
// Optional native module
// ─────────────────────────────────────────────────────────────────────────────

type NativeMapsModule = {
  default: React.ComponentType<Record<string, unknown>>;
  Marker: React.ComponentType<Record<string, unknown>>;
  Polyline: React.ComponentType<Record<string, unknown>>;
  Polygon: React.ComponentType<Record<string, unknown>>;
  Circle: React.ComponentType<Record<string, unknown>>;
  Heatmap?: React.ComponentType<Record<string, unknown>>;
  PROVIDER_GOOGLE?: string;
};

function loadNativeMaps(): NativeMapsModule | null {
  try {
    // Same pattern and same reasoning as `device-location.ts`: a `try` around
    // `require` turns an absent optional native dependency into a runtime null
    // instead of a bundler error. Here it also covers the case where the
    // package *is* installed but its native side is not linked — Expo Go —
    // which throws on import rather than resolving to undefined.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('react-native-maps');
    return mod?.default ? (mod as NativeMapsModule) : null;
  } catch {
    return null;
  }
}

const nativeMaps = loadNativeMaps();

/** Whether the native surface could be used, ignoring configuration. */
export function hasNativeMapModule(): boolean {
  return nativeMaps !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter
// ─────────────────────────────────────────────────────────────────────────────

interface NativeRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

function toRegion(viewport: MapViewport): NativeRegion {
  return {
    latitude: viewport.center.latitude,
    longitude: viewport.center.longitude,
    latitudeDelta: viewport.latitudeDelta,
    longitudeDelta: viewport.longitudeDelta,
  };
}

function toViewport(region: NativeRegion): MapViewport {
  return {
    center: { latitude: region.latitude, longitude: region.longitude },
    latitudeDelta: region.latitudeDelta,
    longitudeDelta: region.longitudeDelta,
  };
}

function toLatLng(coordinate: GeoCoordinate): { latitude: number; longitude: number } {
  return { latitude: coordinate.latitude, longitude: coordinate.longitude };
}

export function NativeMapSurface(props: MapSurfaceProps) {
  const {
    viewport,
    markers,
    clusters,
    polylines = [],
    circles = [],
    polygons = [],
    heatLayers = [],
    selectedMarkerId,
    userLocation,
    followUser,
    onViewportChange,
    onViewportSettled,
    onMarkerPress,
    onClusterPress,
    onMapPress,
    onLongPress,
    onUserPan,
    accessibilityLabel,
    testID,
    style,
  } = props;

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = getMapProviderConfig();

  const handleRegionChange = useCallback(
    (region: NativeRegion, details?: { isGesture?: boolean }) => {
      onViewportChange?.(toViewport(region));
      if (details?.isGesture) onUserPan?.();
    },
    [onUserPan, onViewportChange]
  );

  // See the header: `onRegionChangeComplete` is not a settle event. Debounced
  // here so the contract's `onViewportSettled` means the same thing on both
  // implementations, and viewport search fires once per gesture rather than
  // once per momentum tick.
  const handleRegionChangeComplete = useCallback(
    (region: NativeRegion) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => onViewportSettled?.(toViewport(region)), 180);
    },
    [onViewportSettled]
  );

  const initialRegion = useMemo(() => toRegion(viewport), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nativeMaps) {
    // Should be unreachable — the registry never selects this provider without
    // the module. Rendering an honest panel rather than throwing keeps §44's
    // "do not crash" true even if a future change gets the selection wrong.
    return (
      <View
        style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, style]}
        testID={testID ?? 'native-map-unavailable'}
        accessible
        accessibilityLabel="The map could not be loaded on this device. A list of results is available instead."
      >
        <Text style={{ fontWeight: '700', color: '#4B5563' }}>Map unavailable on this device</Text>
      </View>
    );
  }

  const { default: MapView, Marker, Polyline, Polygon, Circle, PROVIDER_GOOGLE } = nativeMaps;

  return (
    <MapView
      style={[{ flex: 1 }, style]}
      testID={testID ?? 'native-map-surface'}
      provider={PROVIDER_GOOGLE}
      // Never add `googleMapId` (cloud styling) here. The mobile Maps SDK is free
      // and unlimited only without a map ID; with one, every load bills against a
      // 10,000-a-month SKU, and the platform's budget is the free tier (27 Sep 2026).
      customMapStyle={undefined}
      initialRegion={initialRegion}
      region={toRegion(viewport)}
      onRegionChange={handleRegionChange}
      onRegionChangeComplete={handleRegionChangeComplete}
      onPress={(event: { nativeEvent: { coordinate: GeoCoordinate } }) =>
        onMapPress?.(event.nativeEvent.coordinate)
      }
      onLongPress={(event: { nativeEvent: { coordinate: GeoCoordinate } }) =>
        onLongPress?.(event.nativeEvent.coordinate)
      }
      // The native user-location layer is used when it is available, but the
      // app still tracks its own fix: navigation needs the coordinate, not just
      // a dot, and `followsUserLocation` is a camera behaviour rather than a
      // data source.
      showsUserLocation={Boolean(userLocation)}
      followsUserLocation={Boolean(followUser)}
      showsMyLocationButton={false}
      showsCompass
      toolbarEnabled={false}
      accessible
      accessibilityLabel={
        accessibilityLabel ??
        `Map showing ${markers.length} results. Switch to list view for a readable list.`
      }
    >
      {/* Heat layers: the server's grid squares, withheld ones in grey. This
          surface drew no heat layer at all before 20 Oct 2026. */}
      {heatLayers.flatMap((layer) =>
        heatLayerPolygons(layer).map((polygon) => (
          <Polygon
            key={polygon.id}
            coordinates={polygon.path.map(toLatLng)}
            fillColor={polygon.fillColor}
            strokeColor={polygon.strokeColor}
            strokeWidth={1}
          />
        ))
      )}

      {polygons.map((polygon) => (
        <Polygon
          key={polygon.id}
          coordinates={polygon.path.map(toLatLng)}
          fillColor={polygon.fillColor}
          strokeColor={polygon.strokeColor}
          strokeWidth={1.5}
        />
      ))}

      {circles.map((circle) => (
        <Circle
          key={circle.id}
          center={toLatLng(circle.center)}
          radius={circle.radiusMetres}
          fillColor={circle.fillColor}
          strokeColor={circle.strokeColor}
          strokeWidth={1.5}
        />
      ))}

      {polylines.map((polyline) => (
        <Polyline
          key={polyline.id}
          coordinates={polyline.path.map(toLatLng)}
          strokeColor={polyline.color}
          strokeWidth={polyline.widthPx}
          lineDashPattern={polyline.dashed ? [8, 6] : undefined}
        />
      ))}

      {clusters.map((cluster) => (
        <Marker
          key={cluster.id}
          identifier={cluster.id}
          coordinate={toLatLng(cluster.coordinate)}
          onPress={() => onClusterPress?.(cluster)}
          accessibilityLabel={cluster.accessibilityLabel}
          tracksViewChanges={false}
        >
          <View
            style={{
              minWidth: 40,
              height: 40,
              paddingHorizontal: 8,
              borderRadius: 20,
              backgroundColor: CATEGORY_COLOR[dominantCategory(cluster)],
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
              {cluster.count > 999 ? '999+' : cluster.count}
            </Text>
          </View>
        </Marker>
      ))}

      {markers.map((marker) => (
        <Marker
          key={marker.id}
          identifier={marker.id}
          coordinate={toLatLng(marker.coordinate)}
          onPress={() => onMarkerPress?.(marker)}
          accessibilityLabel={marker.accessibilityLabel}
          // Off by default: leaving it on re-rasterises every pin on every
          // frame and is the single biggest cause of a janky map on Android.
          // The pins here are static once rendered, except the selected one.
          tracksViewChanges={marker.id === selectedMarkerId}
        >
          <MarkerPin marker={marker} isSelected={marker.id === selectedMarkerId} />
        </Marker>
      ))}
    </MapView>
  );
}

function MarkerPin({ marker, isSelected }: { marker: MapMarker; isSelected: boolean }) {
  const color = CATEGORY_COLOR[marker.category];

  return (
    <View style={{ alignItems: 'center' }}>
      {marker.badge ? (
        <View
          style={{
            backgroundColor: isSelected ? color : '#FFFFFF',
            borderColor: color,
            borderWidth: 1.5,
            borderRadius: 10,
            paddingHorizontal: 6,
            paddingVertical: 1,
            marginBottom: -2,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 9, fontWeight: '900', color: isSelected ? '#FFFFFF' : '#111827' }}
          >
            {marker.badge}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          width: isSelected ? 22 : 16,
          height: isSelected ? 22 : 16,
          borderRadius: 11,
          backgroundColor: color,
          borderWidth: 3,
          borderColor: '#FFFFFF',
        }}
      />
    </View>
  );
}

function dominantCategory(cluster: MapCluster): MarkerCategory {
  const entries = Object.entries(cluster.breakdown) as [MarkerCategory, number][];
  if (entries.length === 0) return 'place';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export const nativeMapProvider: MapSurfaceProvider | null = nativeMaps
  ? {
      descriptor: { id: 'native', label: 'Map', isSimulated: false },
      Surface: NativeMapSurface,
      rendersRealGeography: true,
      // Google Maps since 27 Sep 2026. The map draws Google's logo itself, which
      // satisfies the licence; this line is for the chrome that lists sources.
      attribution: 'Map data © Google',
    }
  : null;

/** For the diagnostics screen: why the native surface is or is not in use. */
export function describeNativeAvailability(): string {
  const config = getMapProviderConfig();
  if (!nativeMaps) return `Native map module not available (${MAP_PROVIDER_GAPS.tileMap.id}).`;
  if (!config.isNativeConfigured) return 'Native map module present but no tile key is configured.';
  return 'Native tile map active.';
}
