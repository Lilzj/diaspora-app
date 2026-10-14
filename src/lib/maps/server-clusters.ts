/**
 * Totals per town, from the platform, for a map zoomed out — 16 Sep 2026.
 *
 * FRONTEND-MAPS-GAP-002. A country-wide viewport over a mature marketplace is
 * tens of thousands of rows, and the map used to count them by fetching the
 * first page of each vertical and clustering what came back — which is not a
 * count at all past the first page. `GET /location/map/clusters` answers the
 * question that view asks: how many homes, jobs, items, services, guides and
 * events are in each town on screen.
 *
 * **Town level, deliberately.** Rows the platform files from a town name — every
 * job and marketplace listing, which carry no coordinates — sit at town level
 * and would be missing from neighbourhood totals. A wide view asks for towns;
 * zoomed in, the map shows each result as it always has.
 *
 * **A totals view, not a result view.** A cell carries a count, not the rows.
 * The list beside the map still shows real results.
 *
 * **Grid cells since 14 Oct 2026.** The place catalogue is retired: each cell is
 * a square on a world grid (`level: "Grid"`, a stable `cellKey`, its `bounds`),
 * counted from every row's own pin, and its `name` is the server's "Area around
 * 4.05°S, 39.67°E", never a place name. A tap opens the area around the cell's
 * centre (`/map/area`), not a neighbourhood page.
 */
import { apiClient } from '@/lib/apiClient';
import type { DiscoveryCategory, GeoBoundingBox, MapCluster, MarkerCategory, MapViewport } from '@/types/maps';

/** How wide a view must be, in degrees of latitude (~33 km), before it shows town totals. */
export const SERVER_CLUSTER_MIN_LATITUDE_DELTA = 0.3;

/** How far a tap on a town total zooms in: the town, roughly. */
const TOWN_SPAN_DEGREES = 0.12;

/** The platform's resource keys, per map category. Categories with no counter are absent. */
const RESOURCE_TYPE_FOR: Partial<Record<DiscoveryCategory, string>> = {
  housing: 'housing',
  marketplace: 'marketplace',
  job: 'jobs',
  provider: 'providers',
  guide: 'guides',
  event: 'events',
};

const CATEGORY_FOR: Record<string, MarkerCategory> = {
  housing: 'housing',
  marketplace: 'marketplace',
  jobs: 'job',
  providers: 'provider',
  guides: 'guide',
  events: 'event',
};

const NOUNS: Record<string, [string, string]> = {
  housing: ['home', 'homes'],
  marketplace: ['item for sale', 'items for sale'],
  jobs: ['job', 'jobs'],
  providers: ['service', 'services'],
  guides: ['guide', 'guides'],
  events: ['event', 'events'],
};

interface ClusterWire {
  /** A stable cell id. Not a catalogue area. */
  areaId: string;
  /** "Area around 4.05°S, 39.67°E": the server's description, not a place name. */
  name: string;
  slug: string;
  /** `Grid`. */
  level: string;
  latitude: number;
  longitude: number;
  counts: Record<string, number>;
  total: number;
  /** The cell's key on the world grid. Absent on an older server. */
  cellKey?: string | null;
  /** The cell's square. Absent on an older server. */
  bounds?: { north: number; south: number; east: number; west: number } | null;
}

interface ClusterPageWire {
  clusters: ClusterWire[];
  level: string;
  resourceTypes: string[];
  minimumCellCount: number;
  /** `grid` since 14 Oct 2026. */
  aggregation?: string | null;
  cellSizeDegrees?: number | null;
}

export interface ServerClusterPage {
  clusters: MapCluster[];
  /** The smallest total a cell must reach to be shown at all. */
  minimumCellCount: number;
}

/** Whether a view is wide enough to show town totals rather than results. */
export function wantsServerClusters(viewport: MapViewport): boolean {
  return viewport.latitudeDelta >= SERVER_CLUSTER_MIN_LATITUDE_DELTA;
}

/** The platform resource keys a set of map categories can be counted as. */
export function resourceTypesFor(categories: readonly DiscoveryCategory[]): string[] {
  return [...new Set(categories.flatMap((category) => RESOURCE_TYPE_FOR[category] ?? []))].sort();
}

/**
 * `GET /location/map/clusters` at town level.
 *
 * Throws on a refusal or a failure, and the caller falls back to counting on the
 * device: a map with no totals must never show zeros it did not receive.
 */
export async function fetchServerClusters(
  bounds: GeoBoundingBox,
  resourceTypes: string[],
  options: { signal?: AbortSignal } = {}
): Promise<ServerClusterPage> {
  const response = await apiClient.get<{ data: ClusterPageWire }>('/location/map/clusters', {
    params: {
      bounds: [bounds.north, bounds.south, bounds.east, bounds.west].map((value) => value.toFixed(4)).join(','),
      level: 'City',
      resourceTypes: resourceTypes.join(','),
    },
    signal: options.signal,
  });

  const page = response.data?.data;

  return {
    clusters: (page?.clusters ?? []).flatMap((cell) => toMapCluster(cell) ?? []),
    minimumCellCount: page?.minimumCellCount ?? 1,
  };
}

/** One town total as the map's cluster, or null when it carries nothing to draw. */
export function toMapCluster(cell: ClusterWire): MapCluster | null {
  if (!Number.isFinite(cell.latitude) || !Number.isFinite(cell.longitude) || cell.total <= 0) {
    return null;
  }

  const breakdown: Partial<Record<MarkerCategory, number>> = {};
  const parts: string[] = [];

  for (const [key, count] of Object.entries(cell.counts ?? {})) {
    const category = CATEGORY_FOR[key];
    if (!category || !count) continue;

    breakdown[category] = (breakdown[category] ?? 0) + count;
    const [one, many] = NOUNS[key] ?? [key, key];
    parts.push(`${count} ${count === 1 ? one : many}`);
  }

  return {
    id: `server:${cell.areaId}`,
    coordinate: { latitude: cell.latitude, longitude: cell.longitude, precision: 'city' },
    count: cell.total,
    bounds:
      cell.bounds && isFiniteBounds(cell.bounds)
        ? cell.bounds
        : {
            north: cell.latitude + TOWN_SPAN_DEGREES / 2,
            south: cell.latitude - TOWN_SPAN_DEGREES / 2,
            east: cell.longitude + TOWN_SPAN_DEGREES / 2,
            west: cell.longitude - TOWN_SPAN_DEGREES / 2,
          },
    breakdown,
    memberIds: [],
    accessibilityLabel: `${cell.name}: ${parts.join(', ') || `${cell.total} results`}. Opens the area around it.`,
  };
}

function isFiniteBounds(bounds: { north: number; south: number; east: number; west: number }): boolean {
  return [bounds.north, bounds.south, bounds.east, bounds.west].every((value) => Number.isFinite(value));
}
