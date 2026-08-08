// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps API, development arm (Frontend Phase 8)
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/maps-gaps.ts`. ⚠
//
// The development arm of §57's repository split. The certified arm is
// `maps-api.ts`; `hooks/maps.ts` is the stable interface above both, and a
// screen cannot tell which answered except through the `isSimulated` flag it
// is required to render.
//
// Deliberately behind `/maps-gap/v0` rather than `/location`, `/neighborhood`
// or any domain prefix. Three consequences, all wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether it
//     talks to a certified route.
//   * A call that escaped a development build 404s at the gateway. It cannot
//     collide with, shadow, or be mistaken for a certified route.
//   * Migration is mechanical: when a backend phase ships heat-map aggregates,
//     the repository swaps this import for a real one and the request shapes
//     already match.
//
// Every function refuses to run when maps gap features are disabled, so the
// guarantee does not depend on a screen remembering to check.
//
// ── What is NOT in this file, and why ────────────────────────────────────────
//
// No community alert is *created* here. No listing, event, organization or
// guide is fetched here. No search runs here. All of those have certified
// routes and go to `maps-api.ts`, because §2 says maps are a presentation layer
// over capabilities that already exist and §31–§37 say do not duplicate them.
//
// What is here is exactly the four things the platform genuinely cannot answer:
// heat-map aggregates, neighbourhood score breakdowns, cost-of-living
// categories, and the provenance around a safety score. Plus the affected-area
// geometry for an alert, which is a field on a real record rather than a record
// of its own.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { MAPS_GAPS, MAPS_GAP_PREFIX, areMapsGapsEnabled } from '@/config/maps-gaps';
import type {
  AlertArea,
  CostOfLivingIndex,
  GeoBoundingBox,
  GeoCoordinate,
  HeatMapLayerData,
  HeatMapTimeRange,
  MapLayerId,
  NeighborhoodScore,
  SafetyScore,
} from '@/types/maps';
import { boundsCacheKey } from './maps/geo';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced under `maps-gap`, never colliding with `mapKeys`. A cache dump
// that shows a `maps-gap` entry is showing a simulated value, and that should
// be visible without cross-referencing anything.
// ─────────────────────────────────────────────────────────────────────────────

export const mapsGapKeys = {
  all: ['maps-gap'] as const,

  heatLayer: (layer: MapLayerId, bounds: GeoBoundingBox, timeRange: string) =>
    ['maps-gap', 'heat', layer, boundsCacheKey(bounds), timeRange] as const,

  neighborhoodScore: (id: string) => ['maps-gap', 'neighborhood-score', id] as const,
  neighborhoodComparison: (ids: string[]) =>
    ['maps-gap', 'neighborhood-compare', [...ids].sort().join(',')] as const,
  costOfLiving: (id: string) => ['maps-gap', 'cost-of-living', id] as const,
  safetyScore: (id: string) => ['maps-gap', 'safety', id] as const,
  alertArea: (alertId: string) => ['maps-gap', 'alert-area', alertId] as const,
  savedPlaces: () => ['maps-gap', 'saved-places'] as const,
};

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * The guard every function in this file passes through.
 *
 * Throws rather than returning empty, and the distinction matters. An empty
 * result renders as "there is nothing here", which is a claim about the world.
 * A rejection renders as "this is not available in this build", which is a
 * claim about the build — and it is the true one. §57's requirement that
 * development data cannot ship is enforced here rather than by each caller.
 */
function assertEnabled(gapKey: string): void {
  if (!areMapsGapsEnabled()) {
    const gap = MAPS_GAPS[gapKey];
    throw new MapsGapUnavailableError(
      gap ? `${gap.id} — ${gap.title} is not available in this build.` : 'Not available.',
      gapKey
    );
  }
}

export class MapsGapUnavailableError extends Error {
  readonly gapKey: string;

  constructor(message: string, gapKey: string) {
    super(message);
    this.name = 'MapsGapUnavailableError';
    this.gapKey = gapKey;
  }
}

export function isMapsGapUnavailable(error: unknown): error is MapsGapUnavailableError {
  return error instanceof MapsGapUnavailableError;
}

// ═════════════════════════════════════════════════════════════════════════════
// HEAT MAPS — FRONTEND-MAPS-GAP-012
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A heat-map layer for an area.
 *
 * The simulation derives its density from the *real* `/location/nearby` counts
 * — see the handler — so an area with genuinely more housing is genuinely
 * hotter. That keeps the layer useful for reviewing the UX while remaining
 * simulated, which is why every point carries `DataFreshness` naming the
 * adapter as its source.
 */
export async function fetchHeatLayer(
  layer: MapLayerId,
  bounds: GeoBoundingBox,
  options: { zoom?: number; timeRange?: HeatMapTimeRange; countryCode?: string } = {}
): Promise<HeatMapLayerData> {
  assertEnabled(MAPS_GAPS.heatMapAggregates.key);

  const response = await apiClient.get<Envelope<HeatMapLayerData>>(
    `${MAPS_GAP_PREFIX}/heatmap`,
    {
      params: {
        layer,
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
        zoom: options.zoom,
        timeRange: options.timeRange ?? '30d',
        countryCode: options.countryCode,
      },
    }
  );

  return response.data.data;
}

// ═════════════════════════════════════════════════════════════════════════════
// NEIGHBOURHOOD SCORES — FRONTEND-MAPS-GAP-013
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The full score breakdown for a neighbourhood.
 *
 * Hybrid, and marked at the field level. The handler is passed the *real*
 * `/neighborhood/{id}` stats — `safetyScore`, `walkability`, `costOfLiving` and
 * the resource counts — and marks the dimensions it can derive from them as
 * `backend`. Only the dimensions with nothing behind them are `simulated`.
 *
 * `NeighborhoodScore.overall` is a `Sourced<number>` for precisely this reason:
 * an overall figure blended from three real dimensions and six invented ones is
 * not a backend value, and saying so is the difference between §23 being
 * honoured and being claimed.
 */
export async function fetchNeighborhoodScore(neighborhoodId: string): Promise<NeighborhoodScore> {
  assertEnabled(MAPS_GAPS.neighborhoodScores.key);

  const response = await apiClient.get<Envelope<NeighborhoodScore>>(
    `${MAPS_GAP_PREFIX}/neighborhoods/${neighborhoodId}/scores`
  );

  return response.data.data;
}

/**
 * Side-by-side comparison.
 *
 * §24 asks for comparison; there is no server-side comparison contract, so this
 * fetches each and returns them together. The client does not compute a
 * "winner" or a composite ranking — that would be the frontend inventing an
 * authoritative judgement about where somebody should live, which §23 forbids
 * more or less by name.
 */
export async function compareNeighborhoods(ids: string[]): Promise<NeighborhoodScore[]> {
  assertEnabled(MAPS_GAPS.neighborhoodScores.key);

  const response = await apiClient.get<Envelope<NeighborhoodScore[]>>(
    `${MAPS_GAP_PREFIX}/neighborhoods/compare`,
    { params: { ids: ids.join(',') } }
  );

  return response.data.data;
}

// ═════════════════════════════════════════════════════════════════════════════
// COST OF LIVING — FRONTEND-MAPS-GAP-014
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchCostOfLiving(neighborhoodId: string): Promise<CostOfLivingIndex> {
  assertEnabled(MAPS_GAPS.costOfLiving.key);

  const response = await apiClient.get<Envelope<CostOfLivingIndex>>(
    `${MAPS_GAP_PREFIX}/neighborhoods/${neighborhoodId}/cost-of-living`
  );

  return response.data.data;
}

// ═════════════════════════════════════════════════════════════════════════════
// SAFETY — FRONTEND-MAPS-GAP-015
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Safety score with its provenance.
 *
 * The `score` itself is the **real** `stats.safetyScore` from the certified
 * neighbourhood route, passed through unchanged. What this adds is the
 * methodology, the sample size, the trend, the sub-dimensions and the
 * limitations — none of which the certified contract carries, and all of which
 * §26 requires to be on screen next to the number.
 */
export async function fetchSafetyScore(neighborhoodId: string): Promise<SafetyScore> {
  assertEnabled(MAPS_GAPS.safetyScoreProvenance.key);

  const response = await apiClient.get<Envelope<SafetyScore>>(
    `${MAPS_GAP_PREFIX}/neighborhoods/${neighborhoodId}/safety`
  );

  return response.data.data;
}

// ═════════════════════════════════════════════════════════════════════════════
// ALERT AFFECTED AREA — FRONTEND-MAPS-GAP-017
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The affected area for an alert.
 *
 * The alert itself is real — a B9 Community Update. Only the geometry is
 * simulated, because the certified contract carries none and drawing a radius
 * the publisher never stated would be the client deciding the scope of an
 * emergency. Returns null rather than throwing when disabled: an alert with no
 * affected area is a perfectly good alert, drawn as a point, and forcing every
 * caller into a try/catch for the *normal* case would be the wrong shape.
 */
export async function fetchAlertArea(alertId: string): Promise<AlertArea | null> {
  if (!areMapsGapsEnabled()) return null;

  try {
    const response = await apiClient.get<Envelope<AlertArea | null>>(
      `${MAPS_GAP_PREFIX}/alerts/${alertId}/area`
    );
    return response.data.data ?? null;
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVED PLACES — FRONTEND-MAPS-GAP-011
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Server-side saved places.
 *
 * ⚠ Deliberately read-only, and deliberately not wired into the saved-places
 * screen, which uses the existing on-device `store/location.ts`.
 *
 * The reason is in the gap entry: a home address is the most sensitive field
 * this application would ever persist server-side, and it must not be written
 * before a retention policy, an access rule and a deletion path exist. This
 * function is here so the *shape* of the eventual contract is recorded and the
 * migration is mechanical — not so a development build can start uploading
 * where people live. There is no `saveSavedPlace` in this file, and its absence
 * is the point.
 */
export async function fetchSavedPlacesPreview(): Promise<
  { id: string; label: string; coordinate: GeoCoordinate }[]
> {
  assertEnabled(MAPS_GAPS.savedLocations.key);

  const response = await apiClient.get<
    Envelope<{ id: string; label: string; coordinate: GeoCoordinate }[]>
  >(`${MAPS_GAP_PREFIX}/saved-places`);

  return response.data.data;
}
