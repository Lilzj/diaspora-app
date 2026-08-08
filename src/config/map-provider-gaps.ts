// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Map provider gaps (Frontend Phase 8, §56)
//
// Kept in a separate register from `maps-gaps.ts` because the two have
// different owners and completely different unblocking work.
//
//   A **backend gap** is a contract somebody has to design and build. It lands
//   on a backend team's roadmap.
//
//   A **provider gap** is usually a commercial decision, a native rebuild and a
//   key in a secret store. It lands on whoever owns vendor relationships and
//   release engineering. Nothing in this file needs a line of backend code.
//
// Collapsing them, as a single "gaps" list would, produces a backlog where the
// most expensive item ("integrate a transit provider") sits next to the
// cheapest ("add a bounds parameter") with no signal about which team can even
// start.
//
// ── What the audit found ─────────────────────────────────────────────────────
//
// `react-native-maps@1.27.2` is in `package.json` and is **not imported
// anywhere in `src/`**. There is no config plugin entry in `app.json`, no
// Google Maps API key for Android, and no development build configured to
// contain the native module. So the dependency is present and the capability is
// not — a distinction worth being precise about, because "we already have
// react-native-maps" is exactly the kind of statement that closes a gap on
// paper.
//
// `expo-location` is not installed at all. There is no path to a real device
// fix today.
//
// This is not a blocker for the phase and was never treated as one. The map
// surface is built behind `MapProvider`, and the schematic canvas renderer —
// which needs no native module, no API key, no tiles and no network — is a
// complete, interactive, accessible implementation of that interface. When a
// tile provider is configured, the same screens render on it unchanged.
//
// Gap identifiers are `MAP-PROVIDER-GAP-0xx` and are quoted verbatim in
// `frontend-phase-8-maps-navigation-provider-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderGapStatus =
  /** The frontend is complete behind the abstraction. Only wiring is missing. */
  | 'frontend-complete'
  /** The frontend is complete and a fallback implementation is in use. */
  | 'frontend-complete-with-fallback';

export type ProviderGapPriority = 'critical' | 'high' | 'medium' | 'low';

export interface MapProviderGap {
  /** `MAP-PROVIDER-GAP-001`. */
  id: string;
  key: string;
  /** The capability, in provider terms. */
  capability: string;
  /** The Phase 8 scope sections that depend on it. */
  feature: string;
  status: ProviderGapStatus;
  /** What the app does today in the provider's absence. */
  currentBehaviour: string;
  /** What a provider would have to supply. */
  requiredCapabilities: string[];
  /** Candidate providers. Named as options, not as a decision. */
  candidateProviders: string[];
  /** The non-code work: keys, native builds, store metadata, contracts. */
  integrationWork: string[];
  /** Licensing, cost and privacy considerations a decision needs. */
  considerations: string[];
  priority: ProviderGapPriority;
}

export const MAP_PROVIDER_GAPS: Record<string, MapProviderGap> = {
  tileMap: {
    id: 'MAP-PROVIDER-GAP-001',
    key: 'tileMap',
    capability: 'Interactive tile map surface',
    feature: '§7 Interactive Maps · §41 Map Performance',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The schematic canvas renderer (`CanvasMapSurface`) implements the full `MapSurface` contract in `react-native-svg`, which is already a dependency and needs no native module. It supports pan, pinch zoom, markers, clusters, selection, callouts, polylines, heat-map layers, the affected-area overlay and the current-location puck, and it works in Expo Go, in a release build, on web and offline. It draws a schematic grid, not real geography, and says so on its face — nobody can mistake it for a satellite view.',
    requiredCapabilities: [
      'Raster or vector tiles with pan, pinch-zoom and inertia',
      'Custom marker views, or a marker layer this application can style',
      'A camera API that accepts a centre plus latitude/longitude deltas and reports the same on change',
      'Polyline and polygon overlays',
      'A user-location layer, or a coordinate this app can draw one at',
      'Attribution rendering that satisfies the tile licence',
    ],
    candidateProviders: [
      'react-native-maps with Google Maps (Android) and Apple Maps (iOS) — already a dependency at 1.27.2, needs a config plugin, an Android API key and a development build',
      'MapLibre Native + a self-hosted or third-party vector tile source — no per-view billing, more operational work',
      'Mapbox — strongest offline and styling story, per-MAU commercial terms',
    ],
    integrationWork: [
      'Add the `react-native-maps` config plugin to `app.json` and supply `config.googleMaps.apiKey` for Android from EAS secrets, never from a source literal (§45)',
      'Produce a development build — the native module is unavailable in Expo Go, so this cannot be verified under Metro alone',
      'Restrict the Android key by package name and SHA-1, and the iOS key by bundle id, so a key extracted from the bundle is not reusable',
      'Implement `NativeMapSurface` against the existing `MapSurface` interface. No screen changes: the registry selects it and the fallback stays as the offline and unsupported-platform path',
      'Add tile attribution to the map chrome per the chosen provider’s licence',
    ],
    considerations: [
      'Client map keys are inherently extractable from a mobile bundle. Platform restriction and quota alerting are the mitigation, not secrecy — which is why §45 asks for environment-specific configuration rather than for the key to be hidden',
      'Google Maps SDK billing is per map load; a map-first discovery tab makes that the dominant cost line and warrants a caching and session-token review before launch',
      'Tile requests reveal a member’s viewport to the tile host. For a diaspora community that is a real privacy consideration and should inform the choice, not just the price',
    ],
    priority: 'high',
  },

  deviceLocation: {
    id: 'MAP-PROVIDER-GAP-002',
    key: 'deviceLocation',
    capability: 'Device location and permission APIs',
    feature: '§5 Location Permission · §6 Current Location · §18 Navigation',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      '`LocationPermissionProvider` and `DeviceLocationProvider` are complete interfaces with a full state machine behind them — every §5 state is reachable and tested. The `expo-location` adapter is written and loads through an optional require, so it activates automatically the moment the package is installed. Until then the development adapter answers, and it simulates grant, denial, permanent denial, services-disabled, approximate-only and an unavailable sensor so all six paths can be reviewed.',
    requiredCapabilities: [
      'Foreground permission request with the approximate/precise distinction iOS 14+ and Android 12+ both expose',
      'A single position fix with an accuracy radius',
      'A position watch with a configurable distance filter, for navigation',
      'Location-services-enabled detection, separately from permission state',
      'A deep link to the app’s settings page',
    ],
    candidateProviders: [
      'expo-location — the natural fit for this stack, matches the interface almost exactly',
      'react-native-geolocation-service — an option only if a bare workflow is adopted',
    ],
    integrationWork: [
      'Add `expo-location` to `package.json` and declare `NSLocationWhenInUseUsageDescription` and `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` in `app.json`',
      'Write the usage-description strings. Store reviewers reject vague ones, and a member deciding whether to grant deserves the real reason',
      'Produce a development build; permission dialogs cannot be exercised under Metro on a simulator without one',
      'No application code changes — `resolveDeviceLocationProvider()` already prefers the real adapter when the module resolves',
    ],
    considerations: [
      'Background location is deliberately **not** requested. Nothing in Phase 8 needs it, both stores require an escalated justification for it, and §39 treats persistent precise location as a thing to avoid rather than to ask for',
      'A precise fix is held in memory only, for at most `DEVICE_LOCATION_RETENTION_MS`, and is never written to disk (§40)',
    ],
    priority: 'high',
  },

  routing: {
    id: 'MAP-PROVIDER-GAP-003',
    key: 'routing',
    capability: 'Walking, driving and cycling route calculation',
    feature: '§14 Walking · §15 Driving · §17 Route Planning',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The complete routing UX — mode switching, waypoints, alternatives, route preview, summary, selection and the entry point into navigation — runs against the development routing adapter. The adapter derives its geometry from the real straight-line distance and the platform’s existing `getCommuteTimeEstimate` speeds, applies a mode-dependent detour factor, and reports `isRouted: false` so every surface renders "estimated" rather than a routed figure.',
    requiredCapabilities: [
      'Route calculation for walking, driving and cycling between two points with intermediate waypoints',
      'Alternative routes with distinguishing summaries',
      'Decoded or documented-encoding geometry dense enough to draw and to map-match against',
      'Turn instructions with a manoeuvre type, per-instruction distance and a manoeuvre coordinate',
      'Traffic-aware driving durations, clearly separated from free-flow',
    ],
    candidateProviders: [
      'Google Directions API — best traffic coverage, strictest terms on caching and on display outside a Google map',
      'Mapbox Directions — permissive caching terms, good geometry',
      'OpenRouteService or a self-hosted OSRM/Valhalla — no per-request cost, no traffic',
    ],
    integrationWork: [
      'Decide whether routing is called from the device or proxied through the backend. Proxying protects the key, enables shared caching and is the only way to satisfy some providers’ terms — and it turns this into FRONTEND-MAPS-GAP-007 instead',
      'Implement `RoutingProvider` against the chosen API. The interface is already the shape of a directions response',
      'Configure per-mode cache TTLs: a walking route is stable for hours, a traffic-aware driving duration for minutes',
    ],
    considerations: [
      'Several providers forbid displaying their routes on a competitor’s tiles, and some forbid caching route geometry at all. The tile decision (GAP-001) and this one are therefore coupled and should be taken together',
      'A routing request contains an origin, which for a member routing from where they are standing is a precise location. Proxying through the backend keeps it inside the platform’s own privacy boundary (§59)',
    ],
    priority: 'high',
  },

  transit: {
    id: 'MAP-PROVIDER-GAP-004',
    key: 'transit',
    capability: 'Public transit routing and schedules',
    feature: '§16 Transit Time · §53 Journey 7',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The full transit itinerary experience is built — total duration, walking and riding portions shown separately, transfers, line names, headsigns, stop names, departure and arrival times — and served by the development adapter. Every transit surface renders the provider-gap notice, and no departure time is ever presented as a real timetable.',
    requiredCapabilities: [
      'Multi-modal itineraries with a departure or arrival time',
      'Per-leg mode, line, agency, headsign, boarding and alighting stops',
      'Real departure times, ideally with realtime deviation',
      'A per-city coverage declaration, so the UI can say "no transit data here" instead of "no route"',
    ],
    candidateProviders: [
      'Google Directions transit mode — the broadest coverage, including secondary cities',
      'Transitland or a self-hosted OpenTripPlanner over regional GTFS feeds',
      'A national operator API where the community is concentrated in one country',
    ],
    integrationWork: [
      'Confirm coverage in the cities this community actually lives in before choosing. Coverage in London is universal; coverage in Rose Hill is the question that decides this',
      'Implement `RoutingProvider` for `travelMode: "transit"` — the interface already models legs, transfers and times',
      'Define a freshness rule: a departure time older than a small number of minutes must be re-fetched or suppressed, because a stale departure is misinformation rather than stale data',
    ],
    considerations: [
      'Transit is the lowest-coverage capability in this phase and the one most likely to be unavailable exactly where members need it. Per-city coverage reporting is not a nicety — without it the UI cannot distinguish "no service" from "we do not know"',
    ],
    priority: 'medium',
  },

  geocodingPlaces: {
    id: 'MAP-PROVIDER-GAP-005',
    key: 'geocodingPlaces',
    capability: 'Geocoding, reverse geocoding and place autocomplete',
    feature: '§46 Geocoding · §12 Map Search · §17 Route Planning',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'Place search and reverse geocoding run against the **real** `/location/search` and `/location/reverse-geocode` routes, which resolve neighbourhoods and cities. Street addresses and points of interest resolve through the development adapter and are marked. Debouncing, caching, country restriction and cancellation are real on both paths.',
    requiredCapabilities: [
      'Free-text geocoding with a structured address in the response',
      'Reverse geocoding to a street address',
      'Session-tokened autocomplete, so a keystroke sequence bills as one lookup',
      'Country and viewport biasing',
    ],
    candidateProviders: [
      'Google Places — best POI coverage, session-token billing, restrictive caching terms',
      'Mapbox Geocoding — permissive terms, weaker POI coverage outside major cities',
      'Nominatim/Photon over OpenStreetMap — free, self-hostable, needs a usage policy and rate limiting',
    ],
    integrationWork: [
      'Implement `GeocodingProvider` and `PlacesProvider`. Both interfaces already exist and the platform provider already satisfies the neighbourhood half',
      'Wire session tokens through the autocomplete hook if a session-billed provider is chosen',
      'Set per-provider cache TTLs — a geocode is effectively permanent, an autocomplete suggestion is not cacheable at all under some terms',
    ],
    considerations: [
      'Autocomplete sends partial queries as the member types. Where those are addresses, that is a stream of location intent going to a third party, and §59 makes it worth proxying rather than calling directly',
      'Several providers forbid storing geocoding results beyond a short window, which conflicts with §42’s caching goals and must be checked before a TTL is chosen',
    ],
    priority: 'medium',
  },

  navigationGuidance: {
    id: 'MAP-PROVIDER-GAP-006',
    key: 'navigationGuidance',
    capability: 'Turn-by-turn navigation guidance',
    feature: '§18 Navigation · §19 Navigation State Machine',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The navigation state machine is complete and unit-tested across all thirteen states. Map matching, off-route detection, progress, remaining distance and arrival are **real geometry** over whatever route is loaded. Instruction text comes from the adapter. The navigation screen states that guidance is a preview and offers a hand-off to the device’s own navigation app, which is the honest option available today.',
    requiredCapabilities: [
      'Instruction-level guidance with manoeuvre types and coordinates',
      'A route-refresh endpoint for recalculation that does not re-plan from scratch',
      'Optionally, voice guidance and lane guidance',
    ],
    candidateProviders: [
      'Mapbox Navigation SDK — a full native navigation experience, a substantial integration',
      'Google Navigation SDK — restricted availability and separate commercial terms',
      'Hand-off to the device’s installed navigation app via a geo: or maps: deep link — no provider, no cost, and what this build does today',
    ],
    integrationWork: [
      'Decide between in-app guidance and hand-off. Hand-off is already implemented, costs nothing and is what most members expect; in-app guidance is a large native integration whose value should be established first',
      'If in-app: a background location capability, a foreground service on Android and store justification for both',
    ],
    considerations: [
      'In-app turn-by-turn implies background location, a persistent notification and a battery cost, and it invites comparison with dedicated navigation apps. §18 explicitly forbids claiming a capability the provider does not support — the hand-off is the honest default and is not a placeholder',
    ],
    priority: 'low',
  },

  offlineTiles: {
    id: 'MAP-PROVIDER-GAP-007',
    key: 'offlineTiles',
    capability: 'Offline map tiles',
    feature: '§43 Offline Experience',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'Offline, the map switches to the canvas renderer, which needs no tiles at all, and continues to draw markers, clusters, routes and layers from cached data. Every cached surface is stamped with when it was fetched, and §43’s prohibition is honoured explicitly: alerts and any traffic-derived figure are shown as "last known" rather than as current.',
    requiredCapabilities: [
      'Downloadable tile packs for a bounded region',
      'A pack size estimate before download, and eviction when storage is short',
      'A licence permitting offline storage — several tile licences do not',
    ],
    candidateProviders: [
      'Mapbox — the strongest offline pack support',
      'MapLibre with self-hosted MBTiles — full control, full operational responsibility',
      'Google Maps — no general offline tile API for third-party apps',
    ],
    integrationWork: [
      'Choose the tile provider first (GAP-001); this capability is entirely determined by that choice',
      'Add pack management UI — download, size, expiry, delete — which does not exist and is not part of Phase 8',
    ],
    considerations: [
      'Offline tiles matter most to members with expensive or intermittent data, which is a meaningful part of this community. It is nonetheless the last provider gap to close, because the canvas fallback already keeps the map usable offline rather than blank',
    ],
    priority: 'low',
  },
};

export const MAP_PROVIDER_GAP_LIST: MapProviderGap[] = Object.values(MAP_PROVIDER_GAPS).sort(
  (a, b) => a.id.localeCompare(b.id)
);

export function getMapProviderGap(key: string): MapProviderGap | undefined {
  return MAP_PROVIDER_GAPS[key];
}
