// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the reusable map (Frontend Phase 8, §7)
//
// One component every map surface uses. It owns clustering, the controls, the
// attribution and the selection plumbing; the *renderer* comes from the
// provider registry and is swappable without touching this file or anything
// above it.
//
// ── What it does not own ─────────────────────────────────────────────────────
//
// It issues no queries and holds no results. Callers pass markers in and get
// interactions out, which is what lets the same component serve map-first
// discovery, a single-listing preview, the route planner and the alert map
// without any of them being a special case in here.
//
// ── The memoization is not premature ─────────────────────────────────────────
//
// Clustering runs on the JS thread between a gesture and a frame. Memoized on
// the marker array, a rounded viewport key and the selection, so a re-render
// caused by anything else — a parent's state, a query settling elsewhere — does
// not re-cluster 5,000 points. The viewport key is *rounded* deliberately: a
// pixel of drift changes `viewport` on every frame of a drag, and keying on the
// object identity would defeat the memo entirely during the one interaction
// where it matters most.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import {
  type GeoCoordinate,
  type HeatMapLayerData,
  type MapCluster,
  type MapMarker,
  type MapViewport,
  type DeviceLocation,
} from '@/types/maps';
import { clusterMarkers, clusterExpansionViewport } from '@/lib/maps/clustering';
import { boundsCacheKey, viewportToBounds } from '@/lib/maps/geo';
import { resolveMapSurfaceProvider } from '@/lib/maps/providers/registry';
import type { MapCircleOverlay, MapPolyline, MapPolygonOverlay } from '@/lib/maps/providers/types';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { MapAttributionBar, MapControls } from './MapPrimitives';

export interface DiasporaMapProps {
  viewport: MapViewport;
  onViewportChange: (viewport: MapViewport) => void;
  /** Fires when the camera settles. Viewport search listens to this, not the above. */
  onViewportSettled?: (viewport: MapViewport) => void;

  markers: MapMarker[];
  polylines?: MapPolyline[];
  circles?: MapCircleOverlay[];
  polygons?: MapPolygonOverlay[];
  heatLayers?: HeatMapLayerData[];

  selectedMarkerId?: string | null;
  onSelectMarker?: (marker: MapMarker | null) => void;

  userLocation?: DeviceLocation | null;
  followUser?: boolean;
  onFollowUserChange?: (follow: boolean) => void;

  onMapPress?: (coordinate: GeoCoordinate) => void;
  onLongPress?: (coordinate: GeoCoordinate) => void;

  /** Turn clustering off for a map showing a handful of deliberate pins. */
  clustering?: boolean;
  /**
   * Totals the platform counted, drawn instead of the markers. Set by a screen
   * zoomed out far enough to ask `GET /location/map/clusters`; left unset, the
   * map clusters its markers on the device as it always has.
   */
  serverClusters?: MapCluster[] | null;
  /**
   * Credits for data drawn on the map — the licence of an outline in `polygons`,
   * say. Shown in the attribution strip while the data is on screen.
   */
  dataAttributions?: readonly string[];
  /**
   * The phone's chrome over the bottom of the map — the gesture bar — when the
   * map runs to the bottom of the screen. The attribution strip sits above it.
   */
  chromeBottomInset?: number;
  showControls?: boolean;
  onOpenLayers?: () => void;
  hasLayers?: boolean;

  /** Extra chrome — the "search this area" button, a legend, a sheet. */
  children?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  style?: object;
}

export function DiasporaMap({
  viewport,
  onViewportChange,
  onViewportSettled,
  markers,
  polylines,
  circles,
  polygons,
  heatLayers,
  selectedMarkerId = null,
  onSelectMarker,
  userLocation,
  followUser = false,
  onFollowUserChange,
  onMapPress,
  onLongPress,
  clustering = true,
  serverClusters = null,
  dataAttributions,
  chromeBottomInset = 0,
  showControls = true,
  onOpenLayers,
  hasLayers,
  children,
  accessibilityLabel,
  testID,
  style,
}: DiasporaMapProps) {
  const provider = useMemo(() => resolveMapSurfaceProvider(), []);
  const Surface = provider.Surface;

  // See the header: rounded, so a drag does not invalidate the memo per frame.
  const viewportKey = useMemo(() => boundsCacheKey(viewportToBounds(viewport)), [viewport]);

  const clustered = useMemo(() => {
    if (serverClusters) {
      // The platform's own totals. No markers: a cell stands for the rows it
      // counted, and drawing a page of them on top would count some twice.
      const total = serverClusters.reduce((sum, cluster) => sum + cluster.count, 0);
      return { markers: [] as MapMarker[], clusters: serverClusters, totalCount: total, truncated: false };
    }
    if (!clustering) {
      return { markers, clusters: [] as MapCluster[], totalCount: markers.length, truncated: false };
    }
    return clusterMarkers(markers, viewport, { selectedMarkerId });
    // `viewport` is intentionally excluded in favour of `viewportKey` — see
    // above. `markers` and `selectedMarkerId` are the other real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, viewportKey, selectedMarkerId, clustering, serverClusters]);

  const handleMarkerPress = useCallback(
    (marker: MapMarker) => {
      trackMapsEvent('maps.marker.selected', {
        markerCategory: marker.category,
        source: marker.source,
      });
      onSelectMarker?.(marker);
    },
    [onSelectMarker]
  );

  const handleClusterPress = useCallback(
    (cluster: MapCluster) => {
      trackMapsEvent('maps.cluster.expanded', { clusterSize: cluster.count });
      const next = clusterExpansionViewport(cluster, viewport);
      onViewportChange(next);
      // Expansion is a camera move the member asked for, so the settle handler
      // is invoked directly rather than waiting for a gesture that will not come.
      onViewportSettled?.(next);
    },
    [onViewportChange, onViewportSettled, viewport]
  );

  const handleMapPress = useCallback(
    (coordinate: GeoCoordinate) => {
      // A tap on empty map clears the selection. Without this the callout sticks
      // and there is no obvious way to dismiss it.
      if (selectedMarkerId) onSelectMarker?.(null);
      onMapPress?.(coordinate);
    },
    [onMapPress, onSelectMarker, selectedMarkerId]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const next: MapViewport = {
        ...viewport,
        latitudeDelta: viewport.latitudeDelta * factor,
        longitudeDelta: viewport.longitudeDelta * factor,
      };
      onViewportChange(next);
      onViewportSettled?.(next);
    },
    [onViewportChange, onViewportSettled, viewport]
  );

  const handleRecentre = useCallback(() => {
    if (!userLocation) return;

    if (followUser) {
      onFollowUserChange?.(false);
      return;
    }

    onViewportChange({ ...viewport, center: userLocation.coordinate });
    onFollowUserChange?.(true);
    trackMapsEvent('maps.current_location.used', { surface: 'recentre' });
  }, [followUser, onFollowUserChange, onViewportChange, userLocation, viewport]);

  return (
    <View style={[{ flex: 1 }, style]} testID={testID ?? 'diaspora-map'}>
      <Surface
        viewport={viewport}
        markers={clustered.markers}
        clusters={clustered.clusters}
        polylines={polylines}
        circles={circles}
        polygons={polygons}
        heatLayers={heatLayers}
        selectedMarkerId={selectedMarkerId}
        userLocation={userLocation}
        followUser={followUser}
        onViewportChange={onViewportChange}
        onViewportSettled={onViewportSettled}
        onMarkerPress={handleMarkerPress}
        onClusterPress={handleClusterPress}
        onMapPress={handleMapPress}
        onLongPress={onLongPress}
        // A pan is the member taking the camera back. Snapping to their
        // position a moment later is the single most irritating thing a map can
        // do, so follow mode releases here rather than fighting them.
        onUserPan={() => followUser && onFollowUserChange?.(false)}
        accessibilityLabel={
          accessibilityLabel ??
          mapSummaryLabel(clustered.totalCount, clustered.clusters.length, clustered.truncated)
        }
      />

      {showControls ? (
        <MapControls
          onRecentre={handleRecentre}
          onZoomIn={() => zoomBy(0.5)}
          onZoomOut={() => zoomBy(2)}
          onOpenLayers={onOpenLayers}
          followUser={followUser}
          canRecentre={Boolean(userLocation)}
          hasLayers={hasLayers}
        />
      ) : null}

      <MapAttributionBar
        attribution={provider.attribution}
        rendersRealGeography={provider.rendersRealGeography}
        dataAttributions={dataAttributions}
        bottomInset={chromeBottomInset}
      />

      {children}
    </View>
  );
}

/**
 * What a screen reader hears for the map as a whole.
 *
 * It says how many results there are and points at the list, because that is
 * the actionable information — hunting individual pins on a canvas is not a
 * reasonable thing to ask of anyone, which is why §50 requires the list to
 * exist and why this label sends people to it.
 */
function mapSummaryLabel(total: number, clusterCount: number, truncated: boolean): string {
  if (total === 0) return 'Map with no results in this area. Move the map or change your filters.';

  return (
    `Map showing ${total} result${total === 1 ? '' : 's'}` +
    `${clusterCount > 0 ? `, grouped into ${clusterCount} clusters` : ''}` +
    `${truncated ? '. Only the results nearest the centre are shown' : ''}. ` +
    'Switch to list view for a readable list of these results.'
  );
}

export default DiasporaMap;
