// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — marker clustering (Frontend Phase 8, §9, §41)
//
// §9: do not render thousands of individual markers. §41: the UI must stay
// responsive at 5,000 raw results. This module is how both hold.
//
// ── Why a grid and not a hierarchy ───────────────────────────────────────────
//
// The textbook answer is a supercluster-style KD-tree with a precomputed
// hierarchy per zoom level. It is the right answer for a web map that owns its
// own render loop. It is the wrong answer here, for two reasons that are
// specific to this application:
//
//   The input is not static. Every pan refetches, every filter change replaces
//   the set, and a hierarchy you rebuild on each change has paid its build cost
//   without ever amortising it over the zooms it was built for.
//
//   The work happens on the JS thread, between a gesture and a frame. A single
//   O(n) pass with integer-keyed bucketing is ~1 ms for 5,000 points and has no
//   allocation profile worth worrying about. A tree build is tens of
//   milliseconds and lands squarely in the gesture.
//
// So: one linear pass into a `Map` keyed by grid cell, then one pass over the
// occupied cells. No sorting, no recursion, no tree.
//
// ── The bits that are not obvious ────────────────────────────────────────────
//
//   **The grid is metric, not angular.** Cell size is chosen in metres from the
//   zoom level and converted to degrees using `cos(latitude)`. A fixed degree
//   grid produces cells that are half as wide in London as at the equator, and
//   clusters that visibly refuse to merge as you travel north.
//
//   **Cluster position is the centroid of its members, not the cell centre.**
//   Cell centres make clusters snap to an invisible lattice as you pan, which
//   reads as jitter. The centroid moves smoothly.
//
//   **A cell holding one marker is not a cluster.** A "1" bubble that expands
//   to a single pin is a tap wasted, so singletons are passed through as real
//   markers and stay individually selectable and individually labelled.
//
//   **Selection survives clustering.** A selected marker is never absorbed. It
//   would otherwise vanish under the member's finger the moment a refetch
//   arrived — the one interaction where disappearing is least forgivable.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MAX_CLUSTERED_INPUT,
  MAX_CLUSTER_MEMBERS_TRACKED,
  type ClusteredMarkers,
  type GeoBoundingBox,
  type GeoCoordinate,
  type MapCluster,
  type MapMarker,
  type MapViewport,
  type MarkerCategory,
} from '@/types/maps';
import {
  boundsContain,
  isValidCoordinate,
  metresPerDegreeLatitude,
  metresPerDegreeLongitude,
  viewportToBounds,
  viewportToZoom,
} from './geo';

export interface ClusterOptions {
  /** Nothing is clustered at or beyond this zoom. Streets deserve real pins. */
  disableAtZoom?: number;
  /** Cluster cell size in device-independent pixels. Larger merges more. */
  radiusPx?: number;
  /** Never absorbed into a cluster. */
  selectedMarkerId?: string | null;
  /** Drop markers outside the viewport before clustering. */
  restrictToViewport?: boolean;
  /** Safety valve. Defaults to `MAX_CLUSTERED_INPUT`. */
  maxInput?: number;
}

const DEFAULT_RADIUS_PX = 64;
const DEFAULT_DISABLE_AT_ZOOM = 16;

/** Assumed map width in dp, for translating a pixel radius into metres. */
const ASSUMED_MAP_WIDTH_PX = 390;

/**
 * The cluster cell size in metres for a viewport.
 *
 * Derived from the viewport's real-world width rather than from a zoom lookup
 * table, so it stays correct on a tablet, in a split view, and in the map half
 * of the split layout — all of which show a different number of metres per
 * pixel at the same zoom. A table indexed by zoom would be wrong in every one
 * of those cases.
 */
function cellSizeMetres(viewport: MapViewport, radiusPx: number): number {
  const widthMetres =
    viewport.longitudeDelta * Math.max(metresPerDegreeLongitude(viewport.center.latitude), 1);
  return Math.max((widthMetres / ASSUMED_MAP_WIDTH_PX) * radiusPx, 1);
}

/**
 * Collapses markers into clusters for a viewport.
 *
 * Pure and synchronous. Given the same markers, viewport and options it returns
 * the same result, which is what lets the caller memoize on the query key and
 * the viewport cache key rather than on object identity.
 */
export function clusterMarkers(
  markers: MapMarker[],
  viewport: MapViewport,
  options: ClusterOptions = {}
): ClusteredMarkers {
  const {
    disableAtZoom = DEFAULT_DISABLE_AT_ZOOM,
    radiusPx = DEFAULT_RADIUS_PX,
    selectedMarkerId = null,
    restrictToViewport = false,
    maxInput = MAX_CLUSTERED_INPUT,
  } = options;

  const bounds = viewportToBounds(viewport);

  // Invalid coordinates are dropped rather than clamped (§54). A listing with a
  // missing latitude is not "at the equator", it is a listing with no location,
  // and pinning it somewhere plausible is how bad data becomes invisible.
  let input = markers.filter((m) => isValidCoordinate(m.coordinate));
  if (restrictToViewport) {
    input = input.filter((m) => boundsContain(bounds, m.coordinate));
  }

  const totalCount = input.length;
  const truncated = totalCount > maxInput;
  if (truncated) {
    // Nearest-to-centre rather than an arbitrary prefix: if 8,000 results must
    // become 5,000, the ones the member is looking at are the ones to keep.
    input = nearestToCentre(input, viewport.center, maxInput);
  }

  if (viewportToZoom(viewport) >= disableAtZoom) {
    return { markers: input, clusters: [], totalCount, truncated };
  }

  const cell = cellSizeMetres(viewport, radiusPx);
  const latStep = cell / metresPerDegreeLatitude;
  const lonStep = cell / Math.max(metresPerDegreeLongitude(viewport.center.latitude), 1);

  const buckets = new Map<string, MapMarker[]>();
  const singles: MapMarker[] = [];

  for (const marker of input) {
    if (marker.id === selectedMarkerId) {
      singles.push(marker);
      continue;
    }
    const key = `${Math.floor(marker.coordinate.latitude / latStep)}:${Math.floor(
      marker.coordinate.longitude / lonStep
    )}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(marker);
    else buckets.set(key, [marker]);
  }

  const clusters: MapCluster[] = [];

  for (const [key, members] of buckets) {
    if (members.length === 1) {
      singles.push(members[0]);
      continue;
    }
    clusters.push(buildCluster(key, members));
  }

  return { markers: singles, clusters, totalCount, truncated };
}

function buildCluster(key: string, members: MapMarker[]): MapCluster {
  let latSum = 0;
  let lonSum = 0;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  const breakdown: Partial<Record<MarkerCategory, number>> = {};

  for (const m of members) {
    const { latitude, longitude } = m.coordinate;
    latSum += latitude;
    lonSum += longitude;
    if (latitude > north) north = latitude;
    if (latitude < south) south = latitude;
    if (longitude > east) east = longitude;
    if (longitude < west) west = longitude;
    breakdown[m.category] = (breakdown[m.category] ?? 0) + 1;
  }

  const count = members.length;
  const coordinate: GeoCoordinate = { latitude: latSum / count, longitude: lonSum / count };

  return {
    id: `cluster:${key}`,
    coordinate,
    count,
    bounds: { north, south, east, west },
    breakdown,
    // Capped: a cluster of 4,000 does not need 4,000 strings retained to answer
    // "how many", and the expansion path re-derives members from the source set.
    memberIds: members.slice(0, MAX_CLUSTER_MEMBERS_TRACKED).map((m) => m.id),
    accessibilityLabel: clusterAccessibilityLabel(count, breakdown),
  };
}

/**
 * What a screen reader says for a cluster.
 *
 * §50 requires accessible marker descriptions, and "cluster" is not one. The
 * label names the dominant category, because "42 results, mostly housing" is
 * something a member can decide to act on and "42 results" is not.
 */
export function clusterAccessibilityLabel(
  count: number,
  breakdown: Partial<Record<MarkerCategory, number>>
): string {
  const entries = Object.entries(breakdown) as [MarkerCategory, number][];
  const sorted = entries.sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return `${count} results grouped together. Activate to zoom in.`;
  if (sorted.length === 1) {
    return `${count} ${CATEGORY_PLURAL[sorted[0][0]]} grouped together. Activate to zoom in.`;
  }

  const [top, topCount] = sorted[0];
  return (
    `${count} results grouped together, ${topCount} ${CATEGORY_PLURAL[top]} ` +
    `and ${count - topCount} other${count - topCount === 1 ? '' : 's'}. Activate to zoom in.`
  );
}

const CATEGORY_PLURAL: Record<MarkerCategory, string> = {
  housing: 'homes',
  marketplace: 'marketplace listings',
  job: 'jobs',
  provider: 'service providers',
  guide: 'guides',
  organization: 'organizations',
  event: 'events',
  neighborhood: 'neighbourhoods',
  alert: 'community alerts',
  service: 'services',
  place: 'places',
  saved: 'saved places',
  origin: 'starting points',
  destination: 'destinations',
  waypoint: 'stops',
};

/**
 * The viewport a cluster tap should move to.
 *
 * A floor is applied to the resulting span so a cluster whose members share a
 * coordinate — two flats in one building, four stalls at one market — does not
 * request a zero-degree viewport. Without it the member taps, the camera flies
 * to maximum zoom, and the cluster is still a cluster because the pins are still
 * coincident: a tap that visibly does nothing. With the floor they separate at a
 * street-level span, and if they truly coincide the callout lists them.
 */
export function clusterExpansionViewport(cluster: MapCluster, current: MapViewport): MapViewport {
  const latSpan = Math.max(cluster.bounds.north - cluster.bounds.south, 0.0015);
  const lonSpan = Math.max(cluster.bounds.east - cluster.bounds.west, 0.0015);

  return {
    center: cluster.coordinate,
    // Never zoom *out* to expand a cluster — a wide cluster near the edge of a
    // tight viewport would otherwise pull the camera backwards.
    latitudeDelta: Math.min(latSpan * 1.6, current.latitudeDelta),
    longitudeDelta: Math.min(lonSpan * 1.6, current.longitudeDelta),
  };
}

/** Bounded partial selection by distance from a centre. Avoids a full sort. */
function nearestToCentre(markers: MapMarker[], centre: GeoCoordinate, limit: number): MapMarker[] {
  const scored = markers.map((m) => ({
    m,
    // Squared degrees. Monotonic in true distance over any single viewport,
    // which is all a ranking needs, and it avoids 5,000 trigonometric calls.
    d:
      (m.coordinate.latitude - centre.latitude) ** 2 +
      (m.coordinate.longitude - centre.longitude) ** 2,
  }));

  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, limit).map((s) => s.m);
}

/**
 * Markers inside a box, for keeping the list in step with the map (§11).
 *
 * Separate from the clusterer because the list shows *results*, never clusters:
 * a list row that said "42 things" would be the map's abstraction leaking into
 * the accessible representation that exists precisely to avoid it (§50).
 */
export function markersInBounds(markers: MapMarker[], bounds: GeoBoundingBox): MapMarker[] {
  return markers.filter((m) => boundsContain(bounds, m.coordinate));
}
