// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map provider interfaces (Frontend Phase 8, §4)
//
// The abstraction boundary. Everything above this line — screens, hooks,
// repositories, the domain model — is written against these interfaces and
// against `types/maps.ts`. Everything below translates a vendor's model into
// them.
//
// The test §4 sets is that swapping Google for Mapbox should not require a
// change outside `providers/`. Two properties are what make that true, and both
// are easy to lose by accident:
//
//   **Nothing here returns a vendor type.** Not a `LatLng`, not a `Region`, not
//   an encoded polyline string. A provider that returns an encoded polyline
//   decodes it in its adapter; if the domain ever learned to decode one, the
//   next provider's different encoding would be a change in the domain.
//
//   **Every method can fail in the vocabulary of `MapErrorKind`.** A provider
//   that threw its own error type would push vendor-shaped error handling into
//   every screen, which is the same leak wearing a different hat. Adapters
//   translate; `ProviderResult` is how.
//
// ── Why results and not exceptions ───────────────────────────────────────────
//
// Provider failure is not exceptional. Rate limits, quota exhaustion, no route
// between two points, a city with no transit data — §44 lists eleven of these
// and requires each to degrade gracefully. A thrown error makes the compiler
// indifferent to whether a caller handled them; `ProviderResult<T>` makes
// forgetting a type error. The one place this codebase already reasoned this
// way is the financial layer, and the reasoning carries over.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  DeviceLocation,
  GeoBoundingBox,
  GeoCoordinate,
  GeocodedAddress,
  HeatMapLayerData,
  LocationPermissionState,
  MapErrorKind,
  MapLayerId,
  MapMarker,
  MapCluster,
  MapViewport,
  Place,
  PlaceSearchParams,
  Route,
  RouteRequest,
  TravelEstimate,
  TravelMode,
} from '@/types/maps';

// ═════════════════════════════════════════════════════════════════════════════
// RESULT
// ═════════════════════════════════════════════════════════════════════════════

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MapErrorKind; detail?: string; retryable: boolean };

export function ok<T>(value: T): ProviderResult<T> {
  return { ok: true, value };
}

export function fail<T>(
  error: MapErrorKind,
  detail?: string,
  retryable = false
): ProviderResult<T> {
  return { ok: false, error, detail, retryable };
}

/**
 * What a provider says about itself.
 *
 * `isSimulated` is not decoration. §57 requires development data to be isolated
 * and §21/§26 require it to be marked wherever it is shown, and the only way to
 * guarantee a screen *can* mark it is for the answer to travel with the data.
 * A screen that ignores the flag is a review comment; a screen that was never
 * given one is a bug nobody can see.
 */
export interface ProviderDescriptor {
  /** Stable id — `canvas`, `native`, `adapter-routing`, `expo-location`. */
  id: string;
  /** Shown in the diagnostics screen. Never a key, never a URL with a key. */
  label: string;
  isSimulated: boolean;
  /** The `MAP_PROVIDER_GAPS` key when this is a fallback. */
  gapKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAP SURFACE — §7
// ═════════════════════════════════════════════════════════════════════════════

/** A polyline the surface should draw. Routes, boundaries, affected areas. */
export interface MapPolyline {
  id: string;
  path: GeoCoordinate[];
  color: string;
  widthPx: number;
  dashed?: boolean;
}

/** A filled circle. Alert affected areas, search radii. */
export interface MapCircleOverlay {
  id: string;
  center: GeoCoordinate;
  radiusMetres: number;
  fillColor: string;
  strokeColor: string;
}

export interface MapPolygonOverlay {
  id: string;
  path: GeoCoordinate[];
  fillColor: string;
  strokeColor: string;
}

/**
 * The props every map surface implementation accepts.
 *
 * Deliberately declarative: the surface is told what to draw and reports what
 * the member did. It owns no query, no selection state and no camera policy —
 * those live in `store/map-session.ts`, so that swapping the renderer cannot
 * change behaviour, only appearance.
 */
export interface MapSurfaceProps {
  viewport: MapViewport;
  markers: MapMarker[];
  clusters: MapCluster[];
  polylines?: MapPolyline[];
  circles?: MapCircleOverlay[];
  polygons?: MapPolygonOverlay[];
  /** Heat layers, drawn beneath markers. */
  heatLayers?: HeatMapLayerData[];
  selectedMarkerId?: string | null;
  /** Drawn as the "you are here" puck with its accuracy ring. */
  userLocation?: DeviceLocation | null;
  /** Keeps the camera on `userLocation` until the member pans away. */
  followUser?: boolean;

  onViewportChange?: (viewport: MapViewport) => void;
  /** Fires when the camera settles, which is what viewport search listens to. */
  onViewportSettled?: (viewport: MapViewport) => void;
  onMarkerPress?: (marker: MapMarker) => void;
  onClusterPress?: (cluster: MapCluster) => void;
  onMapPress?: (coordinate: GeoCoordinate) => void;
  onLongPress?: (coordinate: GeoCoordinate) => void;
  /** Reported when the member pans, so follow mode can be released. */
  onUserPan?: () => void;

  /** Passed through to the root view for the accessibility tree. */
  accessibilityLabel?: string;
  testID?: string;
  style?: object;
}

/** What the registry returns: a component plus what it is. */
export interface MapSurfaceProvider {
  descriptor: ProviderDescriptor;
  Surface: React.ComponentType<MapSurfaceProps>;
  /** False where the renderer cannot draw real geography. Drives attribution. */
  rendersRealGeography: boolean;
  /** Attribution the tile licence requires. Empty for the canvas renderer. */
  attribution?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOCATION PERMISSION & DEVICE LOCATION — §5, §6
// ═════════════════════════════════════════════════════════════════════════════

export interface LocationPermissionProvider {
  descriptor: ProviderDescriptor;
  /** Reads current state without prompting. Safe to call on mount. */
  check(): Promise<LocationPermissionState>;
  /** Prompts. Only ever called from an explicit member action. */
  request(): Promise<LocationPermissionState>;
  /** Whether the OS location service itself is on, separate from permission. */
  areServicesEnabled(): Promise<boolean>;
  /** Opens the app's settings page. False when the platform cannot. */
  openSettings(): Promise<boolean>;
}

export interface WatchOptions {
  /** Metres of movement before a new fix is emitted. Battery lever (§6). */
  distanceFilterMetres?: number;
  /** Ask for the best available accuracy. Navigation only. */
  highAccuracy?: boolean;
}

export interface DeviceLocationProvider {
  descriptor: ProviderDescriptor;
  getCurrentPosition(options?: { highAccuracy?: boolean }): Promise<ProviderResult<DeviceLocation>>;
  /** Returns an unsubscribe. Callers must call it — §6 forbids idle watching. */
  watchPosition(
    onLocation: (location: DeviceLocation) => void,
    onError: (error: MapErrorKind) => void,
    options?: WatchOptions
  ): () => void;
}

// ═════════════════════════════════════════════════════════════════════════════
// GEOCODING & PLACES — §46
// ═════════════════════════════════════════════════════════════════════════════

export interface GeocodingProvider {
  descriptor: ProviderDescriptor;
  /** Address → coordinate. */
  geocode(
    query: string,
    options?: { countryCodes?: string[]; near?: GeoCoordinate }
  ): Promise<ProviderResult<GeocodedAddress[]>>;
  /** Coordinate → address. */
  reverseGeocode(coordinate: GeoCoordinate): Promise<ProviderResult<GeocodedAddress>>;
}

export interface PlacesProvider {
  descriptor: ProviderDescriptor;
  search(params: PlaceSearchParams): Promise<ProviderResult<Place[]>>;
  /**
   * Incremental suggestions.
   *
   * `sessionToken` exists because some providers bill a keystroke sequence as
   * one lookup only when it is presented as one session. Modelling it here
   * rather than inside an adapter means the hook that owns the debounce also
   * owns the session boundary — which is the only place that knows when a
   * member finished typing.
   */
  autocomplete(
    query: string,
    options?: { near?: GeoCoordinate; countryCodes?: string[]; sessionToken?: string }
  ): Promise<ProviderResult<Place[]>>;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTING — §14, §15, §16, §17
// ═════════════════════════════════════════════════════════════════════════════

export interface RoutingProvider {
  descriptor: ProviderDescriptor;
  /** Which modes this provider actually serves. Drives the mode switcher. */
  supportedModes: TravelMode[];
  /** True when durations model traffic. Drives whether the UI may say so. */
  supportsTraffic: boolean;

  /**
   * The cheap answer: distance and duration, no geometry.
   *
   * Separate from `route()` because it is called for every card in a list. A
   * list of thirty listings must not issue thirty full directions requests, and
   * a provider that has no cheap path can implement this by truncating a full
   * one — but the call site should not have to know which.
   */
  estimate(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    travelMode: TravelMode
  ): Promise<ProviderResult<TravelEstimate>>;

  /** The full answer, with geometry and instructions. */
  route(request: RouteRequest): Promise<ProviderResult<Route[]>>;
}

// ═════════════════════════════════════════════════════════════════════════════
// TILES — §45
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tile configuration, kept separate from the surface.
 *
 * A surface implementation and a tile source are independent choices: the same
 * native surface can render Google, Mapbox or a self-hosted style. Separating
 * them means changing tile vendor does not touch the renderer.
 */
export interface MapTileProvider {
  descriptor: ProviderDescriptor;
  styleUrl?: string;
  attribution: string;
  maxZoom: number;
  /** True when the licence permits offline storage. See MAP-PROVIDER-GAP-007. */
  supportsOffline: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// GEOGRAPHIC INTELLIGENCE — §21, §23, §25, §26
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Heat-map layer data.
 *
 * Modelled as a provider rather than as a repository call because a future
 * implementation could plausibly be either a backend aggregate or a vendor
 * analytics product, and the call sites should not have to be rewritten when
 * that is decided.
 */
export interface HeatMapProvider {
  descriptor: ProviderDescriptor;
  availableLayers: MapLayerId[];
  getLayer(
    layer: MapLayerId,
    bounds: GeoBoundingBox,
    options?: { zoom?: number; timeRange?: string; countryCode?: string }
  ): Promise<ProviderResult<HeatMapLayerData>>;
}
