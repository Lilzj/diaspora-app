// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — schematic canvas map surface (Frontend Phase 8)
//
// A complete implementation of `MapSurface` that draws in `react-native-svg`
// and needs **no native module, no API key, no tiles and no network**.
//
// This is not a placeholder. It is the reason Phase 8 is a finished phase
// rather than a phase waiting on a vendor decision (MAP-PROVIDER-GAP-001). It
// pans, pinch-zooms, clusters, selects, draws routes, affected areas, heat
// layers and a location puck, works in Expo Go, in a release build, on web and
// with no connection at all — and the screens above it do not know it is not a
// tile map.
//
// ── What it deliberately does not do ─────────────────────────────────────────
//
// It does not draw real geography. There are no coastlines, no roads and no
// building footprints, because it has no data for any of them and inventing a
// road layout would be the exact species of fabrication the rest of this phase
// refuses. What it draws instead is an honest coordinate grid with a scale bar
// and a compass — a schematic, obviously schematic, with `rendersRealGeography:
// false` on its descriptor so the map chrome can say so on its face.
//
// Relative geography is completely faithful: two markers 400 m apart are 400 m
// apart on screen, the scale bar is accurate, and panning moves by the distance
// it says it does. Everything about *where things are in relation to each
// other* — which is what a discovery map is for — is true.
//
// ── Projection ───────────────────────────────────────────────────────────────
//
// Equirectangular with a `cos(latitude)` correction on longitude, taken at the
// viewport centre. Not Web Mercator, which exists to keep tile squares square
// and is irrelevant without tiles. Over a viewport of a few kilometres the two
// are indistinguishable; over a country-wide viewport this one is arguably
// better behaved, since it does not stretch high latitudes.
//
// ── Gestures ─────────────────────────────────────────────────────────────────
//
// `PanResponder` from React Native core rather than `react-native-gesture-
// handler`, which is a dependency and would work. It is plain JavaScript with
// no native counterpart, so it behaves identically everywhere this renderer
// runs — including on web, where the gesture-handler path needs its own setup.
//
// The gesture *arithmetic* — which is where a map silently drifts — lives in
// `panViewport`, `pinchViewport` and `screenToCoordinate`, exported as pure
// functions and unit-tested directly. Driving `PanResponder` itself under Jest
// requires synthesising a touch history that React Native's responder system
// owns, which tests the framework rather than this component; the split keeps
// the assertions on the part that is ours to get wrong.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polyline as SvgPolyline,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type {
  GeoCoordinate,
  MapCluster,
  MapMarker,
  MapViewport,
  MarkerCategory,
} from '@/types/maps';
import { MAP_PROVIDER_GAPS } from '@/config/map-provider-gaps';
import { metresPerDegreeLongitude, normalizeCoordinate } from '../geo';
import type { MapSurfaceProps, MapSurfaceProvider } from './types';
import { useTheme } from '@/design-system';

/** Marker fills. Chosen for contrast against the schematic background. */
export const CATEGORY_COLOR: Record<MarkerCategory, string> = {
  housing: '#2563EB',
  marketplace: '#7C3AED',
  job: '#0891B2',
  provider: '#F59300',
  guide: '#16A34A',
  organization: '#DB2777',
  event: '#EA580C',
  neighborhood: '#64748B',
  alert: '#DC2626',
  service: '#0D9488',
  place: '#475569',
  saved: '#CA8A04',
  origin: '#16A34A',
  destination: '#DC2626',
  waypoint: '#F59300',
};

const SEVERITY_COLOR = {
  critical: '#B91C1C',
  high: '#DC2626',
  moderate: '#D97706',
  low: '#65A30D',
} as const;

const MIN_DELTA = 0.0008;
const MAX_DELTA = 120;

interface Projection {
  toScreen: (coordinate: GeoCoordinate) => { x: number; y: number };
  toCoordinate: (x: number, y: number) => GeoCoordinate;
  metresPerPixel: number;
}

function makeProjection(viewport: MapViewport, width: number, height: number): Projection {
  const lonPerPx = viewport.longitudeDelta / Math.max(width, 1);
  const latPerPx = viewport.latitudeDelta / Math.max(height, 1);

  return {
    toScreen: (coordinate) => ({
      x: width / 2 + (coordinate.longitude - viewport.center.longitude) / lonPerPx,
      // Screen y grows downwards; latitude grows upwards.
      y: height / 2 - (coordinate.latitude - viewport.center.latitude) / latPerPx,
    }),
    toCoordinate: (x, y) =>
      normalizeCoordinate({
        latitude: viewport.center.latitude - (y - height / 2) * latPerPx,
        longitude: viewport.center.longitude + (x - width / 2) * lonPerPx,
      }),
    metresPerPixel: lonPerPx * Math.max(metresPerDegreeLongitude(viewport.center.latitude), 1),
  };
}

/**
 * Where the camera goes when the member drags by `dx`, `dy` pixels.
 *
 * Exported and pure, which is the point. This is the arithmetic that drifts
 * silently — a sign error moves the map the wrong way and a missing span
 * conversion moves it by the wrong amount, and neither throws. `PanResponder`
 * itself is plumbing that needs a real touch history to drive, so the gesture
 * *plumbing* is exercised on a device and the *arithmetic* is exercised here.
 *
 * The signs are inverted deliberately: dragging the map right moves the camera
 * west, and dragging it down moves the camera north, the way a paper map
 * behaves under a finger.
 */
export function panViewport(
  start: MapViewport,
  dx: number,
  dy: number,
  size: { width: number; height: number }
): MapViewport {
  const lonPerPx = start.longitudeDelta / Math.max(size.width, 1);
  const latPerPx = start.latitudeDelta / Math.max(size.height, 1);

  return clampViewport({
    ...start,
    center: {
      latitude: start.center.latitude + dy * latPerPx,
      longitude: start.center.longitude - dx * lonPerPx,
    },
  });
}

/** Where the camera goes for a pinch of `scale` against the gesture's start. */
export function pinchViewport(start: MapViewport, scale: number): MapViewport {
  const safeScale = Math.max(scale, 0.05);
  return clampViewport({
    ...start,
    latitudeDelta: start.latitudeDelta / safeScale,
    longitudeDelta: start.longitudeDelta / safeScale,
  });
}

/** The coordinate under a point on screen. Exported for the same reason. */
export function screenToCoordinate(
  viewport: MapViewport,
  x: number,
  y: number,
  size: { width: number; height: number }
): GeoCoordinate {
  return makeProjection(viewport, size.width, size.height).toCoordinate(x, y);
}

function clampViewport(viewport: MapViewport): MapViewport {
  const latitudeDelta = Math.min(MAX_DELTA, Math.max(MIN_DELTA, viewport.latitudeDelta));
  const longitudeDelta = Math.min(MAX_DELTA * 2, Math.max(MIN_DELTA, viewport.longitudeDelta));

  return {
    ...viewport,
    latitudeDelta,
    longitudeDelta,
    center: {
      // Latitude clamped rather than wrapped: panning off the top of the world
      // should stop, not teleport to the southern hemisphere.
      latitude: Math.max(-85, Math.min(85, viewport.center.latitude)),
      longitude: normalizeCoordinate(viewport.center).longitude,
    },
  };
}

/** Grid spacing that keeps 4–8 lines on screen at any zoom. */
function gridStepDegrees(span: number): number {
  const raw = span / 6;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * magnitude;
}

function formatScale(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(metres >= 10000 ? 0 : 1)} km`;
  return `${Math.round(metres)} m`;
}

export function CanvasMapSurface({
  viewport,
  markers,
  clusters,
  polylines = [],
  circles = [],
  polygons = [],
  heatLayers = [],
  selectedMarkerId,
  userLocation,
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
}: MapSurfaceProps) {
  // ── The canvas has to follow the colour scheme ─────────────────────────────
  //
  // §7 lists map overlays, and the device pass in dark mode is what showed why:
  // every panel, chip and card around the map went dark while the map itself
  // stayed `#EEF2F7`. A pale rectangle in the middle of a dark screen, with the
  // scale bar and grid drawn for a light background.
  //
  // This is a canvas the app draws itself rather than provider tiles, so there
  // is nothing stopping it. `surface.muted` does not exist in the token set, so
  // the ground is `neutral[100]` — #F3F4F8 in light, #151820 in dark — and the
  // grid and scale bar are the neutral steps either side of it.
  const { tokens } = useTheme();
  const ground = tokens.color.neutral[100];
  const gridLine = tokens.color.neutral[200];
  const scaleInk = tokens.color.text.secondary;

  const [size, setSize] = useState({ width: 0, height: 0 });

  // The viewport is owned by the caller. During a gesture the surface holds a
  // local override so dragging is not a round trip through the parent's state
  // on every frame — the parent is told on change and on settle, and the local
  // value is dropped as soon as the parent's catches up.
  const [dragViewport, setDragViewport] = useState<MapViewport | null>(null);
  const active = dragViewport ?? viewport;

  const gestureStart = useRef<{ viewport: MapViewport; distance: number | null } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedDuringGesture = useRef(false);
  const grantedAt = useRef(0);

  const projection = useMemo(
    () => makeProjection(active, size.width, size.height),
    [active, size.width, size.height]
  );

  const scheduleSettle = useCallback(
    (next: MapViewport) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      // A short quiet period, distinct from the query debounce in the hook. This
      // one answers "has the finger stopped"; that one answers "is this worth a
      // request". Collapsing them would either fire queries mid-drag or make the
      // camera feel laggy.
      settleTimer.current = setTimeout(() => onViewportSettled?.(next), 180);
    },
    [onViewportSettled]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,

        onPanResponderGrant: () => {
          gestureStart.current = { viewport: active, distance: null };
          movedDuringGesture.current = false;
          grantedAt.current = Date.now();
        },

        onPanResponderMove: (event, gesture) => {
          const start = gestureStart.current;
          if (!start || size.width === 0) return;

          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            // Pinch. The scale is measured against the distance at the moment
            // the second finger landed, not at grant — a pinch that begins as a
            // one-finger drag would otherwise jump on the second touch.
            const [a, b] = touches;
            const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

            if (start.distance === null) {
              gestureStart.current = { viewport: active, distance };
              return;
            }

            const next = pinchViewport(start.viewport, distance / start.distance);

            movedDuringGesture.current = true;
            setDragViewport(next);
            onViewportChange?.(next);
            return;
          }

          if (Math.abs(gesture.dx) < 1 && Math.abs(gesture.dy) < 1) return;

          const next = panViewport(start.viewport, gesture.dx, gesture.dy, size);

          movedDuringGesture.current = true;
          setDragViewport(next);
          onViewportChange?.(next);
          // Releases follow-mode. A member who pans has taken the camera back,
          // and snapping to their position a second later is the single most
          // irritating thing a map can do.
          onUserPan?.();
        },

        onPanResponderRelease: (event) => {
          const start = gestureStart.current;
          gestureStart.current = null;

          if (!movedDuringGesture.current) {
            // A tap. Markers are separate touchables above the SVG, so anything
            // reaching here is the map itself.
            //
            // Long-press is measured from the grant timestamp rather than from
            // the gesture state: `PanResponderGestureState` carries no duration
            // field, and `event.timeStamp` minus the recorded start is the only
            // portable way to tell a tap from a press-and-hold.
            const { locationX, locationY } = event.nativeEvent;
            const heldMs = Date.now() - grantedAt.current;
            if (typeof locationX === 'number' && typeof locationY === 'number') {
              const coordinate = projection.toCoordinate(locationX, locationY);
              if (heldMs > 450) onLongPress?.(coordinate);
              else onMapPress?.(coordinate);
            }
            return;
          }

          if (start) scheduleSettle(dragViewport ?? active);
        },

        onPanResponderTerminate: () => {
          gestureStart.current = null;
        },
      }),
    [
      active,
      dragViewport,
      onLongPress,
      onMapPress,
      onUserPan,
      onViewportChange,
      projection,
      scheduleSettle,
      size.height,
      size.width,
    ]
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const { width, height } = size;
  const ready = width > 0 && height > 0;

  // Scale bar: a round number of metres, and the pixels it occupies.
  const scale = useMemo(() => {
    if (!ready) return { metres: 0, px: 0 };
    const target = width * 0.28 * projection.metresPerPixel;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
    const normalized = target / magnitude;
    const metres = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
    return { metres, px: metres / projection.metresPerPixel };
  }, [projection.metresPerPixel, ready, width]);

  const gridLines = useMemo(() => {
    if (!ready) return { vertical: [] as number[], horizontal: [] as number[] };

    const lonStep = gridStepDegrees(active.longitudeDelta);
    const latStep = gridStepDegrees(active.latitudeDelta);
    const west = active.center.longitude - active.longitudeDelta / 2;
    const south = active.center.latitude - active.latitudeDelta / 2;

    const vertical: number[] = [];
    for (
      let lon = Math.ceil(west / lonStep) * lonStep;
      lon < west + active.longitudeDelta;
      lon += lonStep
    ) {
      vertical.push(projection.toScreen({ latitude: active.center.latitude, longitude: lon }).x);
    }

    const horizontal: number[] = [];
    for (
      let lat = Math.ceil(south / latStep) * latStep;
      lat < south + active.latitudeDelta;
      lat += latStep
    ) {
      horizontal.push(projection.toScreen({ latitude: lat, longitude: active.center.longitude }).y);
    }

    return { vertical, horizontal };
  }, [active, projection, ready]);

  return (
    <View
      style={[{ flex: 1, backgroundColor: ground, overflow: 'hidden' }, style]}
      onLayout={onLayout}
      testID={testID ?? 'canvas-map-surface'}
      // The map itself is one accessibility element with a summary. Individual
      // results are reachable through the list view, which §50 requires to
      // exist for exactly this reason — a screen reader user should not have to
      // hunt pins on a canvas.
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ??
        `Schematic map showing ${markers.length} result${markers.length === 1 ? '' : 's'}` +
          `${clusters.length > 0 ? ` and ${clusters.length} groups` : ''}. ` +
          'Switch to list view for a readable list of results.'
      }
      {...panResponder.panHandlers}
    >
      {ready ? (
        <Svg width={width} height={height} pointerEvents="none">
          <Defs>
            <RadialGradient id="heat" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#DC2626" stopOpacity="0.55" />
              <Stop offset="60%" stopColor="#F59300" stopOpacity="0.25" />
              <Stop offset="100%" stopColor="#F59300" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <Rect x={0} y={0} width={width} height={height} fill={ground} />

          {/* Coordinate graticule. Honest about being a grid rather than roads. */}
          <G opacity={0.55}>
            {gridLines.vertical.map((x, i) => (
              <Line key={`v${i}`} x1={x} y1={0} x2={x} y2={height} stroke={gridLine} strokeWidth={1} />
            ))}
            {gridLines.horizontal.map((y, i) => (
              <Line key={`h${i}`} x1={0} y1={y} x2={width} y2={y} stroke={gridLine} strokeWidth={1} />
            ))}
          </G>

          {/* Heat layers, beneath everything a member can tap. */}
          {heatLayers.map((layer) =>
            layer.points.map((point, i) => {
              const { x, y } = projection.toScreen(point.coordinate);
              if (x < -80 || x > width + 80 || y < -80 || y > height + 80) return null;
              return (
                <Circle
                  key={`${layer.layer.id}-${i}`}
                  cx={x}
                  cy={y}
                  r={26 + point.intensity * 30}
                  fill="url(#heat)"
                  opacity={0.35 + point.intensity * 0.5}
                />
              );
            })
          )}

          {/* Affected areas and search radii. */}
          {circles.map((circle) => {
            const { x, y } = projection.toScreen(circle.center);
            const r = circle.radiusMetres / projection.metresPerPixel;
            if (r < 1) return null;
            return (
              <Circle
                key={circle.id}
                cx={x}
                cy={y}
                r={r}
                fill={circle.fillColor}
                stroke={circle.strokeColor}
                strokeWidth={1.5}
              />
            );
          })}

          {polygons.map((polygon) => (
            <Path
              key={polygon.id}
              d={pathData(polygon.path.map(projection.toScreen), true)}
              fill={polygon.fillColor}
              stroke={polygon.strokeColor}
              strokeWidth={1.5}
            />
          ))}

          {/* Routes. Drawn above overlays, below markers. */}
          {polylines.map((polyline) => (
            <SvgPolyline
              key={polyline.id}
              points={polyline.path
                .map(projection.toScreen)
                .map((p) => `${p.x},${p.y}`)
                .join(' ')}
              fill="none"
              stroke={polyline.color}
              strokeWidth={polyline.widthPx}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={polyline.dashed ? '8,6' : undefined}
            />
          ))}

          {/* Current position: accuracy ring, then the puck. */}
          {userLocation ? (
            <G>
              {userLocation.accuracyMetres ? (
                <Circle
                  cx={projection.toScreen(userLocation.coordinate).x}
                  cy={projection.toScreen(userLocation.coordinate).y}
                  r={Math.max(userLocation.accuracyMetres / projection.metresPerPixel, 6)}
                  fill="#2563EB"
                  opacity={0.12}
                />
              ) : null}
              <Circle
                cx={projection.toScreen(userLocation.coordinate).x}
                cy={projection.toScreen(userLocation.coordinate).y}
                r={7}
                fill="#2563EB"
                stroke="#FFFFFF"
                strokeWidth={2.5}
              />
            </G>
          ) : null}

          {/* Scale bar. Real, and the reason the schematic is still trustworthy. */}
          {scale.px > 0 ? (
            <G>
              <Line
                x1={16}
                y1={height - 22}
                x2={16 + scale.px}
                y2={height - 22}
                stroke={scaleInk}
                strokeWidth={2}
              />
              <Line x1={16} y1={height - 27} x2={16} y2={height - 17} stroke={scaleInk} strokeWidth={2} />
              <Line
                x1={16 + scale.px}
                y1={height - 27}
                x2={16 + scale.px}
                y2={height - 17}
                stroke={scaleInk}
                strokeWidth={2}
              />
              <SvgText x={16} y={height - 32} fontSize={10} fontWeight="700" fill={scaleInk}>
                {formatScale(scale.metres)}
              </SvgText>
            </G>
          ) : null}

          {/* Compass. */}
          <G>
            <Circle cx={width - 26} cy={26} r={13} fill="#FFFFFF" opacity={0.9} />
            <Path d={`M ${width - 26} 17 L ${width - 22} 30 L ${width - 26} 27 L ${width - 30} 30 Z`} fill="#DC2626" />
            <SvgText x={width - 29} y={44} fontSize={8} fontWeight="900" fill={scaleInk}>
              N
            </SvgText>
          </G>
        </Svg>
      ) : null}

      {/* Clusters and markers are real touchables above the SVG rather than
          SVG press handlers: touch targets need to be ~44 dp for accessibility,
          and an SVG circle sized for the design would be a 20 dp target. */}
      {ready
        ? clusters.map((cluster) => {
            const { x, y } = projection.toScreen(cluster.coordinate);
            if (x < -60 || x > width + 60 || y < -60 || y > height + 60) return null;
            const diameter = cluster.count >= 100 ? 52 : cluster.count >= 20 ? 46 : 40;

            return (
              <View
                key={cluster.id}
                style={{ position: 'absolute', left: x - 22, top: y - 22 }}
                accessible
                accessibilityRole="button"
                accessibilityLabel={cluster.accessibilityLabel}
                testID={`cluster-${cluster.id}`}
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => onClusterPress?.(cluster)}
              >
                <View
                  style={{
                    width: diameter,
                    height: diameter,
                    borderRadius: diameter / 2,
                    marginLeft: (44 - diameter) / 2,
                    marginTop: (44 - diameter) / 2,
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
              </View>
            );
          })
        : null}

      {ready
        ? markers.map((marker) => {
            const { x, y } = projection.toScreen(marker.coordinate);
            if (x < -60 || x > width + 60 || y < -80 || y > height + 60) return null;

            const isSelected = marker.id === selectedMarkerId;
            const color =
              marker.category === 'alert' && marker.severity
                ? SEVERITY_COLOR[marker.severity]
                : CATEGORY_COLOR[marker.category];

            return (
              <View
                key={marker.id}
                style={{ position: 'absolute', left: x - 22, top: y - 40, alignItems: 'center' }}
                accessible
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={marker.accessibilityLabel}
                testID={`marker-${marker.id}`}
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => onMarkerPress?.(marker)}
              >
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
                      style={{
                        fontSize: 9,
                        fontWeight: '900',
                        color: isSelected ? '#FFFFFF' : '#111827',
                      }}
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
          })
        : null}
    </View>
  );
}

function dominantCategory(cluster: MapCluster): MarkerCategory {
  const entries = Object.entries(cluster.breakdown) as [MarkerCategory, number][];
  if (entries.length === 0) return 'place';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function pathData(points: { x: number; y: number }[], close: boolean): string {
  if (points.length === 0) return '';
  const body = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  return close ? `${body} Z` : body;
}

export const canvasMapProvider: MapSurfaceProvider = {
  descriptor: {
    id: 'canvas',
    label: 'Schematic map',
    // Not simulated *data* — it draws whatever real markers it is given. What
    // it lacks is real cartography, which `rendersRealGeography` states
    // separately. Flagging it as simulated would wrongly imply the results on
    // it are invented.
    isSimulated: false,
    gapKey: MAP_PROVIDER_GAPS.tileMap.key,
  },
  Surface: CanvasMapSurface,
  rendersRealGeography: false,
  attribution: '',
};

export default CanvasMapSurface;
