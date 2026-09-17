// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps & Navigation domain model (Frontend Phase 8)
//
// §4 and §47: one normalized geographic vocabulary, owned by this application,
// that no map vendor's model may leak into.
//
// The rule this file exists to enforce: **nothing below names a provider.**
// There is no `google.maps.LatLng`, no Mapbox `Feature`, no `MKCoordinate`, no
// `react-native-maps` `Region`. Adapters translate at the boundary and the
// domain never learns which one answered. Swapping Google for Mapbox should
// touch `lib/maps/providers/*` and nothing else — if a future change to a
// vendor forces an edit to this file, the abstraction has already failed.
//
// Four conventions run through the whole model, each earning its keep:
//
//   **Distance is typed by how it was obtained (§48).** A straight line is not
//   a walk. `StraightLineDistance` and `RouteDistance` are distinct types so a
//   Haversine number can never be printed where a routed number was promised.
//   This is the single most abused quantity in map UIs and the one place a
//   nominal type pays for itself.
//
//   **Provenance travels with the value (§21/§23/§26).** `Sourced<T>` and
//   `DataSource` are imported from `types/community-advanced` — the platform
//   already has exactly one provenance envelope and a second would be the kind
//   of duplication that drifts. A safety score without a source is not
//   printable, and the type is what makes that hold.
//
//   **Freshness is part of the value, not decoration.** Every intelligence
//   figure — safety, cost of living, neighborhood score, heat map — carries
//   `DataFreshness`. §26 forbids presenting a score as objective truth; a type
//   that cannot be constructed without saying when it was computed and where it
//   came from is how that stops being a matter of remembering.
//
//   **Precision is explicit (§39).** `GeoPrecision` records how coarse a
//   coordinate deliberately is. A seller's approximate location and a device's
//   precise fix are different things and must never be structurally
//   interchangeable.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlaceOutline } from '@/lib/maps/place-outlines';
import type { DataSource, Sourced } from './community-advanced';
import type { UpdateCategory, UrgencyLevel } from './update';

export type { DataSource, Sourced };

// ═════════════════════════════════════════════════════════════════════════════
// COORDINATES & GEOMETRY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How precise a coordinate is *allowed* to be, not how precise the sensor was.
 *
 * §39 requires privacy-safe representation for private addresses, seller
 * locations and volunteer locations. Carrying that decision on the coordinate
 * means a component cannot accidentally render an `approximate` point as a
 * house pin, and `reducePrecision()` in `lib/maps/privacy.ts` is the only thing
 * that produces the coarse variants.
 */
export type GeoPrecision =
  /** A device fix or a published venue address. Safe to pin exactly. */
  | 'exact'
  /** Deliberately jittered/rounded to roughly a street block (~100 m). */
  | 'approximate'
  /** Collapsed to a neighbourhood centroid. No street-level meaning. */
  | 'neighborhood'
  /** Collapsed to a city centroid. */
  | 'city';

/** The one coordinate shape on this platform. Degrees, WGS-84. */
export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  /** Defaults to `exact` when absent, because published venues are the norm. */
  precision?: GeoPrecision;
}

/**
 * An axis-aligned box in degrees.
 *
 * `west > east` is legal and means the box crosses the antimeridian. Every
 * helper in `lib/maps/geo.ts` handles that case rather than assuming a sorted
 * pair — the Pacific is not an edge case to a diaspora application.
 */
export interface GeoBoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** A named point. The generic currency of search results and saved places. */
export interface GeoPoint {
  id: string;
  coordinate: GeoCoordinate;
  label: string;
}

/**
 * What the map is currently showing.
 *
 * Deltas rather than a zoom integer, because zoom levels are a tile-provider
 * concept and §4 forbids the domain depending on one. `zoom` is derived for
 * layer thresholds and is explicitly an approximation.
 */
export interface MapViewport {
  center: GeoCoordinate;
  latitudeDelta: number;
  longitudeDelta: number;
  /** Derived, approximate, provider-independent. See `viewportToZoom()`. */
  zoom?: number;
  bearing?: number;
  pitch?: number;
}

/** A named administrative or community area, optionally with a boundary. */
export interface MapRegion {
  id: string;
  name: string;
  kind: 'country' | 'region' | 'city' | 'neighborhood' | 'area' | 'custom';
  center: GeoCoordinate;
  bounds?: GeoBoundingBox;
  /** Simplified outline. Absent where no boundary contract exists. */
  polygon?: GeoCoordinate[];
  countryCode?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// DISTANCE — §48
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A crow-flies distance the client computed itself.
 *
 * The brand is the point. §48 forbids treating a naive frontend calculation as
 * authoritative when routing data exists, and a bare `number` makes that a
 * matter of discipline. `StraightLineDistance` cannot be passed where
 * `RouteDistance` is required, so the mistake is a compile error rather than a
 * wrong walking time on somebody's screen.
 */
export interface StraightLineDistance {
  readonly kind: 'straight-line';
  metres: number;
}

/** A distance along an actual route, from a routing provider. */
export interface RouteDistance {
  readonly kind: 'route';
  metres: number;
  travelMode: TravelMode;
}

export type Distance = StraightLineDistance | RouteDistance;

export function straightLine(metres: number): StraightLineDistance {
  return { kind: 'straight-line', metres };
}

export function routeDistance(metres: number, travelMode: TravelMode): RouteDistance {
  return { kind: 'route', metres, travelMode };
}

// ═════════════════════════════════════════════════════════════════════════════
// MARKERS & CLUSTERS — §8, §9
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Every kind of thing this platform can put on a map.
 *
 * A closed union, so §8's "do not create a separate marker rendering
 * implementation for every feature" is enforced by the compiler: a new feature
 * adds a member here and gets the renderer, the legend, the filter chip and the
 * accessibility label for free, or it does not appear on a map at all.
 */
export type MarkerCategory =
  | 'housing'
  | 'marketplace'
  | 'job'
  | 'provider'
  | 'guide'
  | 'organization'
  | 'event'
  | 'neighborhood'
  | 'alert'
  | 'service'
  | 'place'
  | 'saved'
  | 'origin'
  | 'destination'
  | 'waypoint';

/** The route a marker tap navigates to, expressed without importing a router. */
export interface MarkerDestination {
  pathname: string;
  params?: Record<string, string>;
}

/**
 * The normalized marker. One shape for housing, jobs, alerts and everything
 * else, so clustering, rendering, selection and accessibility are written once.
 */
export interface MapMarker {
  id: string;
  category: MarkerCategory;
  coordinate: GeoCoordinate;
  title: string;
  /** One short line under the title in a callout. */
  subtitle?: string;
  /** Rendered *inside* the pin — a price, a count. Keep it to ~6 characters. */
  badge?: string;
  /**
   * Required, not optional. §50 makes the map one of two representations and
   * this is what the other one reads out. A marker nobody can hear is a marker
   * that excludes somebody.
   */
  accessibilityLabel: string;
  /** Straight-line distance from the active centre, when one is known. */
  distance?: StraightLineDistance;
  /** Where a tap goes. Absent for decorative markers such as route endpoints. */
  destination?: MarkerDestination;
  /** Domain identifier on the underlying entity, for list↔map correlation. */
  entityId?: string;
  /** Severity drives colour for `alert` markers only. */
  severity?: AlertSeverity;
  /** Where the marker's data came from, so a screen can mark simulated pins. */
  source: DataSource;
  /**
   * True when §32/§39 required the coordinate to be coarsened before display.
   * The callout says so, because a member navigating to an approximate point
   * needs to know they are being sent to a block and not a door.
   */
  isPrivacyReduced?: boolean;
}

/** A collapsed group of markers. Produced only by `lib/maps/clustering.ts`. */
export interface MapCluster {
  id: string;
  coordinate: GeoCoordinate;
  count: number;
  /** The bounds of the members, so a tap can zoom to fit rather than guess. */
  bounds: GeoBoundingBox;
  /** Category counts, so a cluster pin can be coloured by what dominates it. */
  breakdown: Partial<Record<MarkerCategory, number>>;
  /** Member ids. Bounded by `MAX_CLUSTER_MEMBERS_TRACKED` to cap memory. */
  memberIds: string[];
  accessibilityLabel: string;
}

/** What the map renders after clustering: singles kept, groups collapsed. */
export interface ClusteredMarkers {
  markers: MapMarker[];
  clusters: MapCluster[];
  /** Total input count, so the UI can say "1,240 results" while drawing 60. */
  totalCount: number;
  /** True when the input exceeded `maxInput` and was truncated. §41/§54. */
  truncated: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// PLACES, ADDRESSES & GEOCODING — §46, §47
// ═════════════════════════════════════════════════════════════════════════════

/** The normalized postal-ish address. Every field optional but `countryCode`. */
export interface Address {
  countryCode: string;
  countryName?: string;
  regionCode?: string;
  region?: string;
  city?: string;
  neighborhood?: string;
  area?: string;
  street?: string;
  postalCode?: string;
  /** One line, provider-formatted where available, else composed locally. */
  formatted?: string;
}

/** A place from search or autocomplete. */
export interface Place {
  id: string;
  name: string;
  coordinate: GeoCoordinate;
  address?: Address;
  /** Provider category string, kept opaque — the domain never branches on it. */
  kind?: string;
  /** Straight-line distance from the query origin, when one was supplied. */
  distance?: StraightLineDistance;
}

/** The result of resolving a coordinate to an address, or an address to one. */
export interface GeocodedAddress {
  coordinate: GeoCoordinate;
  address: Address;
  /** 0–1 where the provider reports one. Never invented. */
  confidence?: number;
  source: DataSource;
}

export interface PlaceSearchParams {
  query: string;
  /** Bias results near this point. Not a filter. */
  near?: GeoCoordinate;
  /** ISO-3166-1 alpha-2 restrictions. */
  countryCodes?: string[];
  limit?: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// TRAVEL, ROUTES & NAVIGATION — §14–§19
// ═════════════════════════════════════════════════════════════════════════════

export type TravelMode = 'walking' | 'driving' | 'transit' | 'cycling';

/** A duration with the traffic assumption stated, because §15 requires it. */
export interface TravelTime {
  seconds: number;
  /**
   * Present only when the provider actually modelled traffic. Absent means
   * "not traffic-aware", and the UI says so rather than implying live data.
   */
  inTrafficSeconds?: number;
}

/** The cheap answer: how far and how long, without a full route geometry. */
export interface TravelEstimate {
  travelMode: TravelMode;
  distance: RouteDistance;
  duration: TravelTime;
  source: DataSource;
  /** True when the estimate came from a provider that models real networks. */
  isRouted: boolean;
}

export type ManoeuvreKind =
  | 'depart'
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'roundabout'
  | 'merge'
  | 'fork'
  | 'board'
  | 'alight'
  | 'transfer'
  | 'arrive';

export interface NavigationInstruction {
  id: string;
  manoeuvre: ManoeuvreKind;
  /** "Turn left onto Rye Lane". Provider text, normalized to plain sentence. */
  text: string;
  /** Distance covered by this instruction. */
  distance: RouteDistance;
  duration: TravelTime;
  /** Where the manoeuvre happens. */
  coordinate: GeoCoordinate;
  /** Set for `board`/`alight`/`transfer` on transit legs. */
  transit?: TransitDetail;
}

/** §16. Everything a transit leg needs to be reviewable before departure. */
export interface TransitDetail {
  /** "Bus", "Underground", "Tram", "Rail" — provider vocabulary, normalized. */
  mode: string;
  line: string;
  headsign?: string;
  departureStop: string;
  arrivalStop: string;
  /** ISO-8601. Absent where the provider gave a relative estimate only. */
  departureAt?: string;
  arrivalAt?: string;
  /** Intermediate stop count, where reported. */
  stopCount?: number;
  /** Operator name, so a member can recognise the service. */
  agency?: string;
}

/** One contiguous stretch travelled by a single mode. */
export interface RouteSegment {
  id: string;
  travelMode: TravelMode;
  distance: RouteDistance;
  duration: TravelTime;
  /** Decoded polyline. Never a provider-encoded string in the domain. */
  path: GeoCoordinate[];
  instructions: NavigationInstruction[];
  transit?: TransitDetail;
  /** Human summary — "Walk to Peckham Rye", "Bus 63 to Elephant & Castle". */
  summary: string;
}

export interface Route {
  id: string;
  travelMode: TravelMode;
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints: GeoPoint[];
  segments: RouteSegment[];
  distance: RouteDistance;
  duration: TravelTime;
  /** The whole geometry, flattened, for drawing one polyline. */
  path: GeoCoordinate[];
  bounds: GeoBoundingBox;
  /** "via A202", "Fastest route". Shown when choosing between alternatives. */
  summary: string;
  /** True for the provider's preferred route among the alternatives. */
  isPrimary: boolean;
  source: DataSource;
  /** ISO-8601 when this route was computed, for staleness. */
  computedAt: string;
  /**
   * Transit only: how many changes. Distinct from `segments.length` because a
   * walk-to-stop segment is not a transfer.
   */
  transferCount?: number;
  /** Set when the provider modelled departure/arrival for a transit plan. */
  departureAt?: string;
  arrivalAt?: string;
}

export interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
  travelMode: TravelMode;
  /** Ask for alternatives. Providers may return one route regardless. */
  alternatives?: boolean;
  /** ISO-8601. Transit planning without a departure time is meaningless. */
  departureAt?: string;
  /** Ask for a traffic-aware duration. Providers may ignore it. */
  trafficAware?: boolean;
}

// ── Navigation state machine — §19 ───────────────────────────────────────────

/**
 * Every state navigation can be in. §19's list, verbatim, as a closed union.
 *
 * Written as data rather than as booleans scattered through a screen because
 * the interesting transitions are the unhappy ones — `OffRoute` while
 * `Recalculating` while the fix went stale is three booleans and eight
 * meaningless combinations. `lib/maps/navigation-machine.ts` is a pure
 * reducer over this union and is unit-tested without a map on screen.
 */
export type NavigationPhase =
  | 'Idle'
  | 'Planning'
  | 'RouteLoading'
  | 'RouteReady'
  | 'Navigating'
  | 'OffRoute'
  | 'Recalculating'
  | 'Arrived'
  | 'Cancelled'
  | 'Failed'
  | 'LocationUnavailable'
  | 'PermissionDenied'
  | 'ProviderUnavailable';

/** Live progress along a route. Recomputed on each position update. */
export interface NavigationProgress {
  /** The instruction the member is being told to perform now. */
  currentInstruction: NavigationInstruction | null;
  /** The one after it, for the "then" line. */
  nextInstruction: NavigationInstruction | null;
  /** Straight-line distance to the current manoeuvre point. */
  distanceToInstruction: StraightLineDistance;
  remainingDistance: RouteDistance;
  remainingDuration: TravelTime;
  /** ISO-8601 estimated arrival. */
  estimatedArrivalAt: string;
  /** 0–1 along the route, for the progress bar. */
  fractionTravelled: number;
  /** Index into `route.segments`, for highlighting the active leg. */
  segmentIndex: number;
}

export interface NavigationState {
  phase: NavigationPhase;
  route: Route | null;
  /** Every route the provider returned, for the alternatives picker. */
  alternatives: Route[];
  progress: NavigationProgress | null;
  /** The last position applied. Never persisted — see §40. */
  position: DeviceLocation | null;
  /** How far off the route the member currently is, when off it. */
  offRouteBy?: StraightLineDistance;
  /** Guards the recalculation loop. Reset on a successful match. */
  recalculationCount: number;
  /** Set in `Failed`, `ProviderUnavailable` and the two location states. */
  error?: MapErrorKind;
  /** Human sentence for the error banner. Never a raw provider message. */
  errorDetail?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// DEVICE LOCATION & PERMISSION — §5, §6
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §5's list as a closed union.
 *
 * `denied` and `deniedPermanently` are separate because only one of them has a
 * "try again" that can succeed; offering the retry on the other is how an app
 * teaches people that its buttons do nothing.
 */
export type LocationPermissionStatus =
  | 'notRequested'
  | 'requesting'
  | 'granted'
  | 'grantedApproximate'
  | 'denied'
  | 'deniedPermanently'
  | 'servicesDisabled'
  | 'unavailable';

export type LocationAccuracyLevel = 'precise' | 'approximate' | 'unknown';

export interface LocationPermissionState {
  status: LocationPermissionStatus;
  accuracy: LocationAccuracyLevel;
  /** Whether the platform can open its settings screen from here. */
  canOpenSettings: boolean;
  /** ISO-8601 of the last resolution, so a stale answer can be re-checked. */
  checkedAt: string | null;
}

/** A position fix. Deliberately *not* `PlatformLocation` — see §40. */
export interface DeviceLocation {
  coordinate: GeoCoordinate;
  /** Radius of 68% confidence in metres, where the platform reports one. */
  accuracyMetres?: number;
  /** Epoch millis of the fix. Used for staleness, never for history. */
  timestamp: number;
  /** Metres per second, when moving and reported. Used by navigation only. */
  speed?: number;
  /** Degrees from true north, when reported. */
  heading?: number;
  source: DataSource;
}

/** What a current-location consumer sees, including the reasons it has none. */
export interface CurrentLocationState {
  location: DeviceLocation | null;
  permission: LocationPermissionState;
  isResolving: boolean;
  /** True once `LOCATION_STALE_AFTER_MS` has passed since the fix. */
  isStale: boolean;
  error?: MapErrorKind;
}

// ═════════════════════════════════════════════════════════════════════════════
// LAYERS, HEAT MAPS & GEOGRAPHIC INTELLIGENCE — §21–§26
// ═════════════════════════════════════════════════════════════════════════════

/** Which intelligence surface a layer draws. */
export type MapLayerId =
  | 'community-activity'
  | 'housing-availability'
  | 'housing-price'
  | 'marketplace-activity'
  | 'jobs'
  | 'events'
  | 'safety'
  | 'cost-of-living';

export interface MapLayer {
  id: MapLayerId;
  label: string;
  /** One sentence a screen reader can read instead of seeing the gradient. */
  description: string;
  /** Below this zoom the layer is meaningless and is not drawn. §22. */
  minZoom: number;
  /** The unit the intensity represents. "listings", "index", "score". */
  unit: string;
  source: DataSource;
  /** Set when this layer's data has no certified contract behind it. */
  gapKey?: string;
}

/** One weighted point. `intensity` is always normalized 0–1 by the adapter. */
export interface HeatMapPoint {
  coordinate: GeoCoordinate;
  /** 0–1. Comparable within a layer, never across layers. */
  intensity: number;
  /** The pre-normalization figure, for the legend and the accessible table. */
  rawValue: number;
}

/**
 * Whether an intensity scale is fixed or fitted to what is on screen.
 *
 * A fitted scale makes an empty region look busy, so the legend must say which
 * it is. §22 wants a legend; this is what makes the legend honest.
 */
export type HeatMapScale = 'absolute' | 'relative-to-viewport';

export interface HeatMapLayerData {
  layer: MapLayer;
  points: HeatMapPoint[];
  scale: HeatMapScale;
  /** The raw values the 0 and 1 ends of the gradient correspond to. */
  minValue: number;
  maxValue: number;
  freshness: DataFreshness;
  /** The area the aggregate covers, so the UI never implies global coverage. */
  bounds: GeoBoundingBox;
}

/** §22's time filter. Applied server-side where a contract exists. */
export type HeatMapTimeRange = '24h' | '7d' | '30d' | '90d';

// ── Freshness & methodology — §23, §25, §26 ──────────────────────────────────

/**
 * When a figure was computed and how far you should trust it.
 *
 * Mandatory on every intelligence value in this file. §26 forbids presenting a
 * safety score as objective truth, and the only reliable way to keep that
 * promise is to make it impossible to construct the value without the caveat.
 */
export interface DataFreshness {
  /** ISO-8601 when the underlying data was computed. */
  computedAt: string;
  /** Who produced it. "Community reports", "Diaspora estimate". Never blank. */
  sourceName: string;
  /** One sentence on how, where the provider documents it. */
  methodology?: string;
  /** What the figure cannot tell you. Rendered verbatim next to the score. */
  limitations?: string[];
  /** ISO-8601 after which the figure should be refetched or marked stale. */
  validUntil?: string;
  /** Sample size behind the figure, where known. A score of n=3 is not a score. */
  sampleSize?: number;
}

/** One dimension of a neighbourhood score. */
export interface ScoreDimension {
  id:
    | 'safety'
    | 'cost-of-living'
    | 'community-activity'
    | 'housing'
    | 'transport'
    | 'services'
    | 'events'
    | 'jobs'
    | 'amenities';
  label: string;
  /** 0–100. */
  score: number;
  /** Change against the previous period, where a trend contract exists. */
  trend?: ScoreTrend;
  /** Why this number. Shown in the breakdown, never invented by the client. */
  explanation?: string;
  freshness: DataFreshness;
}

export interface ScoreTrend {
  direction: 'up' | 'down' | 'flat';
  /** Absolute points of change over `periodDays`. */
  delta: number;
  periodDays: number;
}

export interface NeighborhoodScore {
  neighborhoodId: string;
  name: string;
  cityName: string;
  countryCode: string;
  center: GeoCoordinate;
  /**
   * 0–100 overall. `Sourced` because it is frequently a client-side blend.
   *
   * Null when nothing about the place has a source. The server sends null
   * rather than zero on purpose — an unassessed neighbourhood must not read as a
   * terrible one — and until 17 Sep 2026 the client turned that null back into
   * "0/100, a development estimate" on every unassessed neighbourhood.
   */
  overall: Sourced<number> | null;
  dimensions: ScoreDimension[];
  freshness: DataFreshness;
  /** Ids of adjacent neighbourhoods, for §24's comparison surface. */
  nearbyNeighborhoodIds: string[];
}

/** §25. A cost index broken down by the categories the brief names. */
export interface CostOfLivingCategory {
  id: 'housing' | 'food' | 'transport' | 'utilities' | 'healthcare' | 'leisure' | 'other';
  label: string;
  /** Index where 100 is the country baseline. */
  index: number;
  /** A representative monthly figure, where the source publishes one. */
  typicalMonthly?: { amount: number; currency: string };
}

export interface CostOfLivingIndex {
  neighborhoodId: string;
  name: string;
  /**
   * Overall index, 100 = the country baseline named in `baselineName`. Null
   * while only some categories are measured — rent alone, today — because an
   * overall figure from one category is that category under a broader name.
   */
  overallIndex: number | null;
  baselineName: string;
  currency: string;
  categories: CostOfLivingCategory[];
  freshness: DataFreshness;
}

/**
 * A neighbourhood's own page, as `GET /location/neighborhoods/{idOrSlug}` serves it.
 *
 * Every figure the catalogue may not hold is nullable or empty, because on
 * production today it does not hold them: nobody has assessed a neighbourhood's
 * safety, walkability or cost band, and some places have no centre. The screen
 * says "not assessed" rather than rendering `null/100`.
 */
export interface NeighborhoodOverview {
  /** The slug, which is what links to this page carry. */
  id: string;
  areaId: string;
  name: string;
  /** Empty when the neighbourhood sits under no city. */
  cityName: string;
  countryName: string;
  countryCode: string;
  /** `NaN` when the catalogue holds no centre for the place. */
  latitude: number;
  longitude: number;
  /** Empty when nobody has written one. */
  overview: string;
  stats: {
    safetyScore: number | null;
    walkability: number | null;
    costOfLiving: string | null;
  };
  /** Counts by resource type, for the types the platform counts. An absent key was not counted. */
  resourceCounts: Record<string, number>;
  /**
   * The outline of the town or district this neighbourhood sits in, when the
   * platform holds one — 17 Sep 2026.
   *
   * Never this neighbourhood's own line: no open dataset draws our
   * neighbourhoods, so the page keeps its approximate circle and draws the
   * town's real line beside it, under the town's name and credit.
   */
  containingOutline: PlaceOutline | null;
}

/**
 * One named source's count of incidents near a place — FRONTEND-MAPS-GAP-015,
 * 17 Sep 2026. Never a score, never blended with another source.
 */
export interface SafetyCount {
  /** `community-reports` or `police-recorded-crime`. */
  kind: string;
  /** "Diaspora community reports", "data.police.uk". */
  source: string;
  isAvailable: boolean;
  /**
   * `SourceUnavailable`, `NoCoverage`, `Disabled`, `NoCentre`, or `NotPublished`
   * — nobody publishes this figure for the country at all.
   */
  unavailableReason: string | null;
  /** ISO-8601 start and end of the period counted. */
  from: string | null;
  to: string | null;
  /** The ground covered, in words. */
  area: string;
  /** How the figure was produced. Rendered verbatim. */
  method: string;
  licence: string | null;
  /** The credit the licence requires, shown with the figure. */
  attribution: string | null;
  total: number | null;
  /** Largest first. */
  categories: { id: string; label: string; count: number }[];
}

/** What the safety route says: a score (never, today), sourced counts, and the limitations. */
export interface SafetyReport {
  score: SafetyScore | null;
  counts: SafetyCount[];
  limitations: string[];
}

/** §26. Kept separate from `NeighborhoodScore` because it is the one people act on. */
export interface SafetyScore {
  neighborhoodId: string;
  name: string;
  /** 0–100, higher is safer. */
  score: number;
  /** Coarse band, so a UI never has to invent thresholds. */
  band: 'low' | 'moderate' | 'good' | 'high';
  breakdown: ScoreDimension[];
  trend?: ScoreTrend;
  freshness: DataFreshness;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMUNITY ALERTS — §27, §28, §29
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §29's lifecycle, as a closed union.
 *
 * `Expired` is computed from `expiresAt` by the client and is the one state the
 * backend need not send — §29 requires expired alerts stop being visible, and
 * waiting for a server sweep to say so would leave a cleared road closure on
 * the map for however long the sweep interval is.
 */
export type AlertLifecycleStatus =
  | 'Draft'
  | 'Published'
  | 'Active'
  | 'Updated'
  | 'Expired'
  | 'Withdrawn'
  | 'Cancelled';

/**
 * How bad it is.
 *
 * Derived from B13/Community Updates' `UrgencyLevel` by `toAlertSeverity()`
 * rather than being a second scale a publisher has to fill in — §27 forbids a
 * parallel notification system, and a parallel severity vocabulary is the first
 * step towards one.
 */
export type AlertSeverity = 'critical' | 'high' | 'moderate' | 'low';

export type AlertKind =
  | 'road-closure'
  | 'community-event'
  | 'emergency'
  | 'neighborhood-notice'
  | 'announcement'
  | 'service-interruption'
  | 'weather'
  | 'other';

/** The affected area. §28 — present only where a contract supplies it. */
export interface AlertArea {
  center: GeoCoordinate;
  /** Circular affected area. */
  radiusMetres?: number;
  /** Explicit outline, where one is published. Preferred over the radius. */
  polygon?: GeoCoordinate[];
  /** Human name — "Rye Lane between Peckham High St and Blenheim Grove". */
  description?: string;
}

export interface CommunityAlert {
  id: string;
  kind: AlertKind;
  /** The originating B13/Community Update category. Kept for round-tripping. */
  category: UpdateCategory;
  title: string;
  body: string;
  severity: AlertSeverity;
  /** The urgency the platform actually published, before mapping. */
  urgency: UrgencyLevel;
  status: AlertLifecycleStatus;
  coordinate: GeoCoordinate;
  area?: AlertArea;
  /** Where it happened, in words, for the accessible list. */
  areaName: string;
  cityName: string;
  countryCode: string;
  publishedAt: string;
  updatedAt?: string;
  expiresAt?: string;
  /** When its author withdrew or cancelled it. */
  closedAt?: string;
  /**
   * `exact` when its author pinned it; `area` when the platform placed it at the
   * centre of the town it names, because the composer sent a name and no pin.
   * An `area` alert is drawn as approximate — every alert in a city without a
   * pin sits on the same centroid, and a confident marker there would be a claim
   * about a spot nobody chose. Absent on data from before 16 Sep 2026.
   */
  locationPrecision?: 'exact' | 'area';
  /** Who said so. §26's principle applied to alerts. */
  sourceName: string;
  /** Community corroboration count, where the platform tracks it. */
  confirmationCount?: number;
  verificationStatus?: string;
  source: DataSource;
  /** Set when this alert may be shared outside the app. */
  isShareable: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVED LOCATIONS — §20
// ═════════════════════════════════════════════════════════════════════════════

export type SavedLocationKind = 'home' | 'work' | 'school' | 'favourite' | 'custom';

export interface SavedLocation {
  id: string;
  kind: SavedLocationKind;
  label: string;
  coordinate: GeoCoordinate;
  address?: Address;
  createdAt: string;
}

/**
 * A destination the member routed to recently.
 *
 * §40 requires the shortest practical retention. These are capped and pruned by
 * `store/map-session.ts`; nothing here is uploaded, and a `home` saved location
 * is never emitted in analytics — see `lib/maps/analytics.ts`.
 */
export interface RecentDestination {
  id: string;
  label: string;
  coordinate: GeoCoordinate;
  /** Epoch millis. Pruned past `RECENT_DESTINATION_TTL_MS`. */
  visitedAt: number;
  travelMode?: TravelMode;
}

// ═════════════════════════════════════════════════════════════════════════════
// DISCOVERY — §10, §11, §12, §13
// ═════════════════════════════════════════════════════════════════════════════

/** §10's three presentations. */
export type MapDisplayMode = 'map' | 'list' | 'split';

/** Which domains the map is currently drawing. Reuses `MarkerCategory`. */
export type DiscoveryCategory = Extract<
  MarkerCategory,
  'housing' | 'marketplace' | 'job' | 'provider' | 'guide' | 'organization' | 'event' | 'alert'
>;

export const DISCOVERY_CATEGORIES: readonly DiscoveryCategory[] = [
  'housing',
  'marketplace',
  'job',
  'provider',
  'guide',
  'organization',
  'event',
  'alert',
] as const;

/**
 * What a map search asks for.
 *
 * Carries *both* a bounding box and a centre+radius on purpose. §13 wants
 * viewport search; the certified backend only accepts centre+radius. The query
 * layer sends whichever the target route understands and the enclosing circle
 * is computed from the box — see `boundsToCircle()`. Callers state their intent
 * once and do not have to know which routes have caught up.
 */
export interface MapSearchParams {
  categories: DiscoveryCategory[];
  query?: string;
  bounds?: GeoBoundingBox;
  center?: GeoCoordinate;
  radiusKm?: number;
  countryCode?: string;
  cityName?: string;
  neighborhood?: string;
  /**
   * Frontend Phase 13 (§28, §46). The resolved community scope for this search.
   *
   * Two fields rather than one, and the split is load-bearing:
   *
   *   `communityIds`    the community ids the member selected. **No certified
   *                     route accepts these** — FRONTEND-PHASE13-GAP-009 — so they
   *                     are not sent. They are here so they reach
   *                     `mapKeys.search`'s fingerprint, which hashes this whole
   *                     object. That is what makes a community switch produce a
   *                     different cache entry instead of leaving the previous
   *                     community's markers on the map (§46).
   *
   *   `communityOriginCountryCodes`  what the scope *projects* onto — the
   *                     publisher's country of origin, which is a real certified
   *                     field. This is what the search actually filters on, and
   *                     the map's result list says so.
   *
   * When the routes gain a `communityIds` parameter, `communityIds` starts being
   * sent and `communityOriginCountryCodes` stops being computed. Neither the key
   * nor any screen changes.
   */
  communityIds?: string[];
  communityOriginCountryCodes?: string[];
  minPrice?: number;
  maxPrice?: number;
  /** ISO-8601 date window, for events and jobs. */
  from?: string;
  to?: string;
  availableOnly?: boolean;
  verifiedOnly?: boolean;
  organizationId?: string;
  providerId?: string;
  sortBy?: 'relevance' | 'distance' | 'recent' | 'price';
  limit?: number;
  cursor?: string;
}

/** One result, already normalized to a marker plus enough for a list row. */
export interface MapSearchResult {
  marker: MapMarker;
  category: DiscoveryCategory;
  /** Secondary line for the list — price, date, employer. */
  detail?: string;
  imageUrl?: string | null;
  /** The raw entity, for a preview sheet that needs more than the marker. */
  entity?: unknown;
}

export interface MapSearchResponse {
  results: MapSearchResult[];
  /** Per-category counts, so a filter chip can show a number. */
  counts: Partial<Record<DiscoveryCategory, number>>;
  totalCount: number;
  nextCursor?: string | null;
  hasMore: boolean;
  /** True when at least one contributing category was simulated. */
  hasSimulatedResults: boolean;
  /** Which categories were simulated, so the notice can name them. */
  simulatedCategories: DiscoveryCategory[];
  /** The area actually searched. May be wider than the viewport. */
  searchedBounds?: GeoBoundingBox;
}

// ═════════════════════════════════════════════════════════════════════════════
// ERRORS — §44, §54
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §44's failure list as a closed union.
 *
 * A closed union rather than free strings because §44 requires *graceful*
 * handling of each, and "graceful" means a specific sentence and a specific
 * recovery action per case. `mapErrorCopy()` in `lib/maps/errors.ts` is
 * exhaustive over this union, so a new failure mode cannot be added without
 * someone writing what the member should see.
 */
export type MapErrorKind =
  | 'provider-unavailable'
  | 'tiles-unavailable'
  | 'geocoding-failed'
  | 'routing-failed'
  | 'transit-unavailable'
  | 'no-route'
  | 'location-unavailable'
  | 'location-permission-denied'
  | 'location-services-disabled'
  | 'network-unavailable'
  | 'offline'
  | 'rate-limited'
  | 'quota-exceeded'
  | 'invalid-coordinates'
  | 'no-results'
  | 'too-many-results'
  | 'not-found'
  | 'unauthorized'
  | 'forbidden'
  | 'stale-data'
  | 'unknown';

export interface MapError {
  kind: MapErrorKind;
  /** A sentence for the member. Never a provider's raw message. */
  message: string;
  /** True when a retry could plausibly succeed. Drives the retry button. */
  retryable: boolean;
  /** The gap or provider-gap id, when the failure is a known absence. */
  gapKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

/** A fix older than this is shown as stale rather than as the current position. */
export const LOCATION_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * §40: the shortest practical retention for a device fix held in memory.
 *
 * Fifteen minutes covers a member switching apps mid-search. Nothing writes a
 * device fix to disk anywhere in this phase, so this is the whole retention
 * story for precise location.
 */
export const DEVICE_LOCATION_RETENTION_MS = 15 * 60 * 1000;

/** §40: recent destinations are a convenience, not a location history. */
export const RECENT_DESTINATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_RECENT_DESTINATIONS = 10;

/** §41: the ceiling on raw results fed to the clusterer in one pass. */
export const MAX_CLUSTERED_INPUT = 5000;

/** How many member ids a cluster tracks. Beyond this, only the count matters. */
export const MAX_CLUSTER_MEMBERS_TRACKED = 100;

/** §13: how far the map must move before a new query is worth making. */
export const VIEWPORT_MOVE_THRESHOLD = 0.25;

/** §13: quiet period after the last camera change before querying. */
export const VIEWPORT_SEARCH_DEBOUNCE_MS = 450;

/** §18: how far off the line counts as off-route. */
export const OFF_ROUTE_THRESHOLD_METRES = 50;

/** §18: consecutive off-route fixes before recalculating, to absorb GPS noise. */
export const OFF_ROUTE_CONFIRMATIONS = 2;

/** §18: recalculation attempts before giving up and asking the member. */
export const MAX_RECALCULATIONS = 5;

/** §18: within this of the destination, navigation is complete. */
export const ARRIVAL_THRESHOLD_METRES = 30;

// ═════════════════════════════════════════════════════════════════════════════
// SMALL CONVERSIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Maps the platform's published `UrgencyLevel` onto alert severity.
 *
 * One direction only, and deliberately lossy. §27 forbids a parallel
 * notification system; a second severity scale that publishers had to set
 * independently would be the beginning of one.
 */
export function toAlertSeverity(urgency: UrgencyLevel): AlertSeverity {
  switch (urgency) {
    case 'emergency':
      return 'critical';
    case 'urgent':
      return 'high';
    case 'normal':
      return 'moderate';
    case 'low':
      return 'low';
  }
}

/** Maps a Community Update category onto the alert vocabulary §27 names. */
export function toAlertKind(category: UpdateCategory): AlertKind {
  switch (category) {
    case 'Traffic':
    case 'Transportation':
      return 'road-closure';
    case 'Emergency':
      return 'emergency';
    case 'Utilities':
      return 'service-interruption';
    case 'Community':
      return 'community-event';
    case 'Weather':
      return 'weather';
    case 'Police':
    case 'Immigration':
    case 'Healthcare':
      return 'neighborhood-notice';
    case 'Education':
    case 'Shopping':
    case 'MarketPrices':
    case 'Employment':
      return 'announcement';
    case 'Other':
      return 'other';
  }
}

/** Score bands for §26. Thresholds live here so no screen invents its own. */
export function toSafetyBand(score: number): SafetyScore['band'] {
  if (score >= 85) return 'high';
  if (score >= 70) return 'good';
  if (score >= 50) return 'moderate';
  return 'low';
}
