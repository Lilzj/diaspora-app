// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps & Navigation instrumentation (Frontend Phase 8, §51)
//
// §51's event list as a closed union, plus the property allow-list.
//
// **No buffer, no sanitiser and no transport here.** All three already exist in
// `creator-analytics.ts`, which registered the absent ingestion endpoint as
// CREATOR-GAP-016 and which Phase 12 already extends the same way. A second
// copy would mean the privacy rule is written twice, and a privacy rule written
// twice is a privacy rule that will drift.
//
// ── The one rule specific to this phase ──────────────────────────────────────
//
// §51 says "do not record unnecessary precise coordinates" and "avoid logging
// sensitive location history". §59 says the same thing more bluntly. So:
//
//   **`latitude` and `longitude` are not on the allow-list.** Not as optional
//   fields, not "only for the map viewport", not rounded at the call site. They
//   are absent, which means a call site that passes them has them silently
//   dropped by the sanitiser rather than reviewed by somebody later.
//
//   **`geoCell` is the only geographic property.** It is produced by
//   `coarseForAnalytics()` in `lib/maps/privacy.ts` — an ~11 km grid cell with
//   a country prefix. It answers "which cities use the map" and cannot answer
//   "where does this person live".
//
//   **Nothing identifies a destination.** No `destinationName`, no
//   `savedLocationLabel`, no address. A route event carries the travel mode, a
//   distance *band* and whether it was routed or estimated — enough to know
//   whether route planning is used and for what kind of journey, and not enough
//   to reconstruct where anybody went. A stream of "Home → 14 Rye Lane" events
//   is a location history, whatever the table it lands in is called.
// ─────────────────────────────────────────────────────────────────────────────

import {
  registerAllowedProperties,
  trackPlatformEvent,
  type EventProperties,
} from '@/lib/creator-analytics';
import type { GeoCoordinate, MapErrorKind, TravelMode } from '@/types/maps';
import { coarseForAnalytics } from './privacy';

/**
 * Every Maps & Navigation event this phase emits.
 *
 * §51's list, extended only where a screen genuinely needed a distinct name.
 * `maps.navigation.cancelled` and `maps.navigation.completed` are different
 * signals and collapsing them would lose the only number worth having — how
 * often a started journey is finished.
 */
export type MapsEvent =
  // Map surface — §51
  | 'maps.opened'
  | 'maps.search.performed'
  | 'maps.filter.applied'
  | 'maps.marker.selected'
  | 'maps.cluster.expanded'
  | 'maps.display_mode.switched'
  | 'maps.viewport.searched'
  | 'maps.nearby_result.viewed'
  // Location — §51
  | 'maps.current_location.used'
  | 'maps.location_permission.requested'
  | 'maps.location_permission.granted'
  | 'maps.location_permission.denied'
  | 'maps.location.unavailable'
  // Routing and navigation — §51
  | 'maps.route.planned'
  | 'maps.route.mode_changed'
  | 'maps.route.alternative_selected'
  | 'maps.navigation.started'
  | 'maps.navigation.cancelled'
  | 'maps.navigation.completed'
  | 'maps.navigation.off_route'
  | 'maps.navigation.handed_off'
  // Geographic intelligence — §51
  | 'maps.heat_map.viewed'
  | 'maps.layer.selected'
  | 'maps.neighborhood_score.viewed'
  | 'maps.safety_score.viewed'
  | 'maps.cost_of_living.viewed'
  | 'maps.neighborhood.compared'
  // Alerts — §51
  | 'maps.community_alert.viewed'
  | 'maps.community_alert.shared'
  // Failures — §51
  | 'maps.provider.error';

/**
 * The properties any map event may carry.
 *
 * An allow-list, applied at emit by `creator-analytics`'s sanitiser. Anything
 * not on it is dropped. A deny-list would only cover the mistakes somebody had
 * already thought of, and the mistake this phase is exposed to — attaching a
 * coordinate — is the easiest one in the world to make.
 *
 * Note what is *not* here: `latitude`, `longitude`, `address`, `placeName`,
 * `destinationName`, `originName`, `savedLocationLabel`, `userId`.
 */
const MAP_EVENT_PROPERTIES = [
  // Surface
  'surface',
  'displayMode',
  'previousDisplayMode',
  'markerCategory',
  'resultCount',
  'clusterSize',
  'categories',
  'filterKey',
  'filterCount',
  'hasQuery',
  'zoomBand',
  'isSimulated',
  'source',
  // Location
  'permissionStatus',
  'accuracyLevel',
  'geoCell',
  'countryCode',
  // Routing
  'travelMode',
  'distanceBand',
  'durationBand',
  'isRouted',
  'alternativeCount',
  'waypointCount',
  'navigationPhase',
  'recalculationCount',
  // Intelligence
  'layerId',
  'timeRange',
  'scoreBand',
  'comparisonCount',
  // Alerts
  'alertKind',
  'alertSeverity',
  'shareChannel',
  // Failures
  'errorKind',
  'providerId',
  'gapKey',
] as const;

registerAllowedProperties(MAP_EVENT_PROPERTIES);

/**
 * Emits a map event.
 *
 * Thin on purpose. The value of this function is not what it does but what it
 * makes impossible: `MapsEvent` is closed, so a typo is a compile error, and
 * the sanitiser behind `trackPlatformEvent` drops anything off the list above.
 */
export function trackMapsEvent(event: MapsEvent, properties?: EventProperties): void {
  trackPlatformEvent(event, properties);
}

// ═════════════════════════════════════════════════════════════════════════════
// BANDING
//
// Every continuous quantity is banded before it is emitted. A distance in
// metres and a duration in seconds are, in combination and over enough events,
// a route — and a route is a location history. Bands answer the product
// questions ("do people plan long journeys or short ones") and do not
// reconstruct anything.
// ═════════════════════════════════════════════════════════════════════════════

export function distanceBand(metres: number | null | undefined): string {
  if (typeof metres !== 'number' || !Number.isFinite(metres)) return 'unknown';
  if (metres < 500) return 'under-500m';
  if (metres < 2000) return '500m-2km';
  if (metres < 5000) return '2-5km';
  if (metres < 15_000) return '5-15km';
  if (metres < 50_000) return '15-50km';
  return 'over-50km';
}

export function durationBand(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'unknown';
  if (seconds < 300) return 'under-5min';
  if (seconds < 900) return '5-15min';
  if (seconds < 1800) return '15-30min';
  if (seconds < 3600) return '30-60min';
  return 'over-60min';
}

/**
 * A coarse zoom band.
 *
 * The raw zoom plus a `geoCell` would narrow a member's position far more than
 * either alone — a cell is 11 km, but a cell at street zoom says they are
 * looking at a specific street inside it. Four bands keep the useful signal
 * ("do people browse city-wide or street-level") without that interaction.
 */
export function zoomBand(zoom: number | null | undefined): string {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return 'unknown';
  if (zoom < 8) return 'country';
  if (zoom < 12) return 'region';
  if (zoom < 15) return 'city';
  return 'street';
}

/** The only sanctioned way to attach geography to an event. */
export function geoProperties(
  coordinate: GeoCoordinate | null | undefined,
  countryCode?: string
): EventProperties {
  const cell = coarseForAnalytics(coordinate, countryCode);
  return cell ? { ...cell, countryCode } : { countryCode };
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPED EMITTERS
//
// Wrappers for the events with non-obvious property requirements, so a call
// site cannot forget to band a distance or accidentally reach for a raw
// coordinate. The others are emitted directly through `trackMapsEvent`.
// ═════════════════════════════════════════════════════════════════════════════

export function trackRoutePlanned(input: {
  travelMode: TravelMode;
  distanceMetres: number;
  durationSeconds: number;
  isRouted: boolean;
  alternativeCount: number;
  waypointCount: number;
}): void {
  trackMapsEvent('maps.route.planned', {
    travelMode: input.travelMode,
    distanceBand: distanceBand(input.distanceMetres),
    durationBand: durationBand(input.durationSeconds),
    isRouted: input.isRouted,
    alternativeCount: input.alternativeCount,
    waypointCount: input.waypointCount,
  });
}

export function trackProviderError(input: {
  errorKind: MapErrorKind;
  providerId: string;
  gapKey?: string;
}): void {
  trackMapsEvent('maps.provider.error', {
    errorKind: input.errorKind,
    providerId: input.providerId,
    gapKey: input.gapKey,
  });
}

export function trackPermissionOutcome(status: string, accuracy: string): void {
  const granted = status === 'granted' || status === 'grantedApproximate';
  trackMapsEvent(granted ? 'maps.location_permission.granted' : 'maps.location_permission.denied', {
    permissionStatus: status,
    accuracyLevel: accuracy,
  });
}
