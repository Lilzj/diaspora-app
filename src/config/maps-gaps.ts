// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 8, Maps &
// Navigation)
//
// ⚠ EVERYTHING REGISTERED HERE IS UNSUPPORTED BY THE CERTIFIED BACKEND. ⚠
//
// Phase 8 is a *presentation* phase. §2 is explicit that maps become a spatial
// layer over capabilities this platform already has, and the audit that
// preceded this file found a great deal more already built than the brief
// assumed:
//
//   `/housing`, `/marketplace`, `/jobs`          all accept `latitude`,
//                                                `longitude` and `radiusKm`
//                                                today. Proximity search is
//                                                real and is used directly.
//   `/community-life/events` and `/organizations` same, plus `cityName`,
//                                                `category` and time filters.
//   `/location/search`                           real neighbourhood/city lookup.
//   `/location/reverse-geocode`                  real coordinate → place node.
//   `/location/nearby`                           real cross-domain aggregate.
//   `/neighborhood/{id}`                         real overview with resource
//                                                counts and three raw stats.
//   `CommunityUpdate` (B9)                       real geolocated community
//                                                reports with category,
//                                                urgency, expiry and community
//                                                verification. **This is the
//                                                live alert feed** — §27 says
//                                                do not build a second one, and
//                                                this phase does not.
//
// So the register below is deliberately *not* a list of everything maps need.
// It is the list of what is genuinely absent, and several entries are `partial`
// because the honest answer is "the query exists, the shape it returns does
// not".
//
// ── The one that shapes the whole phase ──────────────────────────────────────
//
// GAP-001. Every certified search route takes a centre and a radius. Not one
// takes a bounding box. A map is a rectangle, and §13 asks for viewport search.
// This phase does not pretend otherwise: it keeps the viewport as the truth,
// sends the enclosing circle to routes that only understand circles, and
// filters the overfetch client-side. That works, and it is measurably wasteful
// — see the performance report. It is the first thing a backend phase should
// fix and the cheapest.
//
// ── What is simulated, and where it lives ────────────────────────────────────
//
// Everything simulated is served by `lib/maps-gap-api.ts` under `/maps-gap/v0`
// and is unreachable in a production build. Nothing in this phase moves money,
// creates a notification, or writes to a certified route.
//
// Gap identifiers are `FRONTEND-MAPS-GAP-0xx` and are quoted verbatim in
// `frontend-phase-8-maps-navigation-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Which backend module should own the work, so a later phase can scope it. */
export type MapsGapOwner =
  /** B11's domain — housing listings and their geography. */
  | 'B11-housing'
  /** B10's domain — marketplace listings. */
  | 'B10-marketplace'
  /** The Jobs module. */
  | 'jobs-platform'
  /** B8/B8.1/B8.2 — guides and the country knowledge directory. */
  | 'B8-guides'
  /** B12 — community events, organizations, neighbourhoods. */
  | 'B12-community'
  /** B9 — community updates, which are the real alert feed. */
  | 'B9-updates'
  /** B13 / B13.1 — notification contracts. */
  | 'B13-notifications'
  /** B13.2 / B17 — realtime transport and operational platform. */
  | 'B13.2-realtime'
  /** B14 — recommendation and personalization. */
  | 'B14-recommendation'
  /** A geospatial/location service that does not exist yet. */
  | 'location-platform'
  /** A geographic-intelligence service that does not exist yet. */
  | 'geo-intelligence'
  /** Nobody's brief yet. */
  | 'future-evolution';

export type MapsGapPriority = 'critical' | 'high' | 'medium' | 'low';

/** How much of the capability the certified backend already carries. */
export type MapsGapCoverage =
  /** Nothing on the certified surface addresses this. */
  | 'none'
  /** A certified contract carries part of it; the rest is simulated. */
  | 'partial';

export interface MapsGap {
  /** `FRONTEND-MAPS-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  /** What a member would call it. */
  title: string;
  /** The Phase 8 scope section this belongs to. */
  feature: string;
  /** One sentence on what the frontend does today. */
  frontendBehaviour: string;
  coverage: MapsGapCoverage;
  /** What the backend would have to expose. Route-level, not hand-waving. */
  missingContract: string[];
  /** What exists already, so a future phase does not rebuild it. */
  existingSeams: string[];
  /** Why the frontend cannot safely implement it against what exists. */
  whyNotImplementable: string;
  /** True where the capability handles or reveals location. Drives §39 review. */
  isLocationSensitive: boolean;
  owner: MapsGapOwner;
  priority: MapsGapPriority;
  /** Which backend phase should pick it up. */
  recommendedPhase: string;
}

export const MAPS_GAPS: Record<string, MapsGap> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DISCOVERY & QUERY SHAPE — §10, §11, §12, §13
  // ═══════════════════════════════════════════════════════════════════════════

  viewportSearch: {
    id: 'FRONTEND-MAPS-GAP-001',
    key: 'viewportSearch',
    title: 'Bounding-box (viewport) search',
    feature: '§13 Viewport-Based Search · §10 Map-First Discovery',
    frontendBehaviour:
      'The viewport is the truth. For every certified route the query layer computes the smallest enclosing circle and sends `latitude`, `longitude` and `radiusKm`, then discards results outside the actual rectangle. Debounce, movement threshold, request cancellation and cache-key deduplication are all real and applied client-side.',
    coverage: 'partial',
    missingContract: [
      'A `bounds` parameter — `north`, `south`, `east`, `west` — accepted on `GET /housing`, `GET /marketplace`, `GET /jobs`, `GET /listings`, `GET /community-life/events` and `GET /community-life/organizations`, alongside the existing radius parameters',
      'Antimeridian-safe handling server-side, so a box with `west > east` is not read as spanning the planet',
      'A documented result cap per request with a `hasMore` cursor, so a dense city viewport is bounded rather than truncated silently',
    ],
    existingSeams: [
      '`GET /housing`, `GET /marketplace` and `GET /jobs` already accept `latitude`, `longitude`, `radiusKm` and `distanceRadius`, and already sort by distance — proximity search is real and this phase uses it unchanged',
      '`GET /community-life/events` and `/organizations` already accept `latitude`, `longitude`, `radiusKm`, `cityName` and `category`',
      '`GET /location/nearby` already aggregates housing, jobs, marketplace, events, providers and updates for a centre and radius — the closest thing to a map query the platform has',
    ],
    whyNotImplementable:
      'The client can and does convert a rectangle to its enclosing circle, but the circle is up to 27% larger in area than the box for a square viewport and worse for a wide one. Every one of those extra results is transferred, parsed and thrown away. It is correct and it is waste, and no amount of client work removes it — only a `bounds` parameter does.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  serverSideClustering: {
    id: 'FRONTEND-MAPS-GAP-002',
    key: 'serverSideClustering',
    title: 'Server-side marker aggregation for dense viewports',
    feature: '§9 Marker Clustering · §41 Map Performance',
    frontendBehaviour:
      'Clustering is client-side, metric-gridded and latitude-corrected, and is fast enough for the 5,000-marker case §60 names. Above `MAX_CLUSTERED_INPUT` the input is reduced to the results nearest the viewport centre and the UI states that the view is truncated.',
    coverage: 'none',
    missingContract: [
      'GET /{domain}/map-aggregate?bounds&zoom&filters — returning cluster centroids with counts and a category breakdown rather than individual entities',
      'A documented zoom-to-precision mapping, so client and server agree on cell size and a cluster does not visibly re-form on refetch',
      'A cluster expansion route returning the members of one cell, so a tap does not require refetching the whole viewport',
    ],
    existingSeams: [
      '`lib/maps/clustering.ts` is a pure function over markers and a viewport; a server aggregate would replace its input, not its callers',
      'The `MapCluster` domain type already carries `count`, `bounds` and `breakdown`, which is exactly the shape a server aggregate would return',
    ],
    whyNotImplementable:
      'A country-wide viewport over a mature marketplace is tens of thousands of rows. Transferring them to count them is the wrong shape at any client speed, and the truncation this phase applies is an honest mitigation rather than a solution.',
    isLocationSensitive: false,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  providerProximity: {
    id: 'FRONTEND-MAPS-GAP-003',
    key: 'providerProximity',
    title: 'Proximity query for service providers',
    feature: '§34 Providers Integration',
    frontendBehaviour:
      'Provider markers come from the real `GET /listings` response, and distance is computed client-side from the coordinates each listing carries. Because the route accepts no geographic parameters, the map filters the returned page rather than asking for the right page.',
    coverage: 'partial',
    missingContract: [
      '`latitude`, `longitude`, `radiusKm` and `bounds` accepted on `GET /listings`, matching the parameters `GET /housing` already takes',
      '`sortBy=distance` on `GET /listings`',
      'A `distanceKm` field on the listing response, computed server-side, so the client stops deriving a number it should be told',
    ],
    existingSeams: [
      '`GET /listings` is real and every listing carries `location.cityName`, `location.areaName` and coordinates',
      '`GET /location/nearby` already returns providers filtered by radius — the filtering logic exists, it is simply not exposed on the providers route itself',
      '`GET /housing` is the template: same platform, same shape, proximity parameters already implemented',
    ],
    whyNotImplementable:
      'Client-side filtering of a page cannot find a provider the server did not return. A member 4 km outside the page the server chose sees an empty map rather than the nearest plumber.',
    isLocationSensitive: false,
    owner: 'location-platform',
    priority: 'high',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  guideGeographicScope: {
    id: 'FRONTEND-MAPS-GAP-004',
    key: 'guideGeographicScope',
    title: 'Geographic scope query for guides',
    feature: '§35 Guides Integration',
    frontendBehaviour:
      'Guides appear on the map at the centroid of their declared scope — country, city or neighbourhood — using the `location` object guides already carry. Guides with country-level scope only are drawn at neighbourhood precision and marked as area-scoped rather than pinned to a point.',
    coverage: 'partial',
    missingContract: [
      'GET /guides?bounds|latitude&longitude&radiusKm — guides whose scope intersects an area',
      'A `scopeLevel` field (Country | Region | City | Neighborhood | Area) so the client stops inferring it from which optional fields are populated',
      'An optional `scopeBounds` for area-scoped guides, so a transit guide can be drawn over the area it covers rather than at a single point',
    ],
    existingSeams: [
      '`Guide.location` already carries `countryCode`, `cityName`, `neighborhood` and `latitude`',
      '`Guide.country` is a required `CountryRef` on every guide, so a country-level fallback always resolves',
      'The guide directory, search and quality signals are all real and this phase adds no second discovery path for them',
    ],
    whyNotImplementable:
      'Scope level is currently inferred from field presence, which conflates "a guide about Peckham" with "a UK guide that happens to mention a coordinate". Drawing the second as a pin in Peckham would be a false claim about what the guide covers.',
    isLocationSensitive: false,
    owner: 'B8-guides',
    priority: 'medium',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOCODING — §46
  // ═══════════════════════════════════════════════════════════════════════════

  forwardGeocoding: {
    id: 'FRONTEND-MAPS-GAP-005',
    key: 'forwardGeocoding',
    title: 'Address geocoding and place autocomplete',
    feature: '§46 Geocoding · §17 Route Planning',
    frontendBehaviour:
      'Place search runs against the real `GET /location/search`, which resolves neighbourhoods and cities. Street addresses and points of interest resolve through the development adapter. Both paths are debounced, cached and country-restricted, and the result list marks which entries are simulated.',
    coverage: 'partial',
    missingContract: [
      'GET /location/geocode?q&countryCodes&near&limit — free-text address and POI resolution returning coordinate, structured address and a confidence',
      'GET /location/autocomplete?q&near&countryCodes&sessionToken — incremental suggestions, session-tokened so a keystroke sequence bills as one lookup',
      'A structured `Address` in the response — `street`, `postalCode`, `region`, `regionCode` — none of which `PlatformLocation` currently carries',
    ],
    existingSeams: [
      '`GET /location/search` is real and resolves neighbourhood and city names against a curated node set',
      '`PlatformLocation` already normalizes country, region, city, neighbourhood and street across the app, and `store/location.ts` already owns the active location',
      'The `LocationInput` and `GlobalLocationSelector` components already exist and are reused unchanged',
    ],
    whyNotImplementable:
      'A member planning a route to "14 Rye Lane" cannot be served by a neighbourhood lookup. Guessing a street coordinate from a neighbourhood centroid would send somebody to the wrong end of a road with no indication the answer was invented.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'high',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  reverseGeocodingDetail: {
    id: 'FRONTEND-MAPS-GAP-006',
    key: 'reverseGeocodingDetail',
    title: 'Street-level reverse geocoding',
    feature: '§46 Reverse Geocoding · §6 Current Location',
    frontendBehaviour:
      'A coordinate resolves through the real `GET /location/reverse-geocode`, which returns the nearest known neighbourhood node. The UI shows "near Peckham, London" and never claims a street. Street-level detail comes from the adapter and is marked.',
    coverage: 'partial',
    missingContract: [
      'A structured address on the reverse-geocode response — street, postal code, region code — rather than the nearest curated node',
      'A `distanceToMatchMetres` field, so the client can say "near Peckham" versus "in Peckham" from data rather than from a guess',
      'A documented behaviour when no node is within a sensible distance, instead of returning the nearest node anywhere on Earth',
    ],
    existingSeams: [
      '`GET /location/reverse-geocode` is real, takes `latitude` and `longitude`, and returns a full `PlatformLocation`',
      'The current-location banner and the neighbourhood context switcher already consume it',
    ],
    whyNotImplementable:
      'The route always answers, even when the nearest node is 400 km away, because nearest-node has no failure mode. A member in a city the node set does not cover is told they are somewhere else entirely, and the client cannot tell that case from a good match without a distance.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'high',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTING & NAVIGATION — §14–§19
  // ═══════════════════════════════════════════════════════════════════════════

  walkingRoutes: {
    id: 'FRONTEND-MAPS-GAP-007',
    key: 'walkingRoutes',
    title: 'Walking distance and duration',
    feature: '§14 Walking Distance',
    frontendBehaviour:
      'Walking distance, duration, route preview and the directions entry point are complete. Where no routing provider is configured the figure comes from the development routing adapter and is rendered through `<EstimateQualifier>`, which says "estimated from straight-line distance" rather than presenting it as a walking route.',
    coverage: 'none',
    missingContract: [
      'A routing capability reachable from the backend, or a configured client-side routing provider — see MAP-PROVIDER-GAP-003',
      'POST /location/routes { origin, destination, waypoints[], travelMode, alternatives } → Route[] with distance, duration, decoded geometry and instructions',
      'A caching and freshness policy per mode, since a walking route is stable for hours and a driving duration is not',
    ],
    existingSeams: [
      '`utils/geo.ts` already exposes `getCommuteTimeEstimate(km, "walk" | "drive" | "transit")`, which is the estimate the adapter builds on and which the app already shows on `DistanceBadge`',
      '`getDistanceKm` gives an authoritative straight-line distance, which bounds the route from below and is used as the estimate floor',
    ],
    whyNotImplementable:
      'A straight line crosses rivers, railways and buildings. In Peckham the difference between the crow-flies distance and the walk is routinely 30–60%, and there is no correction factor that is honest across a river. §48 forbids presenting the one as the other, so the UI presents it as what it is.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'high',
    recommendedPhase: 'B18 Routing Integration',
  },

  drivingRoutes: {
    id: 'FRONTEND-MAPS-GAP-008',
    key: 'drivingRoutes',
    title: 'Driving time, traffic and alternative routes',
    feature: '§15 Driving Time',
    frontendBehaviour:
      'Driving distance, duration, alternative-route selection and route preview are complete and run through the adapter. Traffic-aware duration is never claimed: `TravelTime.inTrafficSeconds` is left absent, and the UI renders "typical traffic not included" instead of a live figure.',
    coverage: 'none',
    missingContract: [
      'The routing contract in GAP-007, plus `alternatives: true` support returning two or three distinct routes with `summary` strings',
      'A traffic-aware duration field, explicitly distinguished from the free-flow duration, and a statement of how current the traffic model is',
      'A documented behaviour for "no route" — an island, a closed border — distinct from a provider failure',
    ],
    existingSeams: [
      'Every consumer of a driving figure already goes through `TravelEstimate`, which carries `isRouted` and `source`',
      'The alternatives picker, the route summary card and the mode switcher are provider-independent and already built',
    ],
    whyNotImplementable:
      'Traffic is the entire value of a driving estimate and it cannot be derived from any data this platform holds. An invented figure would be worse than no figure, because a member would plan around it.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'high',
    recommendedPhase: 'B18 Routing Integration',
  },

  transitRoutes: {
    id: 'FRONTEND-MAPS-GAP-009',
    key: 'transitRoutes',
    title: 'Public transit routing',
    feature: '§16 Transit Time',
    frontendBehaviour:
      'The complete transit experience is built: total duration, the walking and riding portions separately, transfers, line names, headsigns, departure and arrival times, and the reviewable itinerary §53 Journey 7 requires. All of it is served by the adapter and every screen carries the marker.',
    coverage: 'none',
    missingContract: [
      'A transit routing provider — see MAP-PROVIDER-GAP-004 — or a backend transit contract',
      'POST /location/routes with `travelMode: "transit"` and `departureAt`, returning legs typed by mode with `line`, `agency`, `headsign`, `departureStop`, `arrivalStop`, `departureAt`, `arrivalAt` and `stopCount`',
      'A freshness contract: a departure time more than a few minutes old is misinformation, not stale data, and the response must carry enough to enforce that',
      'A coverage declaration per city, so the UI can say "transit directions are not available in Rose Hill" rather than returning nothing',
    ],
    existingSeams: [
      '`TransitDetail` and the mode-typed `RouteSegment` in `types/maps.ts` already model everything a GTFS-derived itinerary carries',
      '`getCommuteTimeEstimate(km, "transit")` gives the coarse estimate the adapter uses as a floor',
    ],
    whyNotImplementable:
      'Transit requires a schedule. There is no timetable, no stop inventory and no service calendar anywhere on this platform, and none of it is derivable from coordinates. Every element of a transit itinerary would be fabricated.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Routing Integration',
  },

  turnByTurnNavigation: {
    id: 'FRONTEND-MAPS-GAP-010',
    key: 'turnByTurnNavigation',
    title: 'Turn-by-turn navigation instructions',
    feature: '§18 Navigation · §19 Navigation State Machine',
    frontendBehaviour:
      'The full navigation state machine is implemented and unit-tested: route overview, live progress, next instruction, distance to manoeuvre, estimated arrival, remaining distance and duration, off-route detection, bounded recalculation, arrival and cancellation. Off-route detection and progress matching are **real** — they are geometry over whatever route is loaded. The instructions themselves come from the adapter, and the navigation screen states plainly that guidance is a preview.',
    coverage: 'none',
    missingContract: [
      'The routing contract in GAP-007 returning `instructions[]` with a normalized manoeuvre kind, text, per-instruction distance and the coordinate the manoeuvre happens at',
      'Decoded or documented-encoding route geometry dense enough for map matching — a two-point line cannot be navigated',
      'A route-refresh contract for recalculation that does not re-plan from scratch',
    ],
    existingSeams: [
      '`lib/maps/navigation-machine.ts` is a pure reducer over `NavigationState` and is fully exercised by unit tests with synthetic routes — it does not become more correct when a provider arrives, only more useful',
      '`distanceToPath` in `lib/maps/geo.ts` does the map matching, and is real geometry regardless of who produced the path',
    ],
    whyNotImplementable:
      '§18 is explicit: do not claim turn-by-turn navigation if the provider integration does not support it. It does not, so the screen says so. What is built is the state machine, which is the part that would otherwise be written under time pressure once a provider does arrive.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Routing Integration',
  },

  savedLocations: {
    id: 'FRONTEND-MAPS-GAP-011',
    key: 'savedLocations',
    title: 'Server-side saved places and recent destinations',
    feature: '§20 Saved Locations',
    frontendBehaviour:
      'Home, Work, favourites, saved places and recent destinations all work, held in the existing client location store. Recent destinations are capped and TTL-pruned per §40. Nothing is uploaded, so nothing syncs between devices, and the saved-places screen says so.',
    coverage: 'partial',
    missingContract: [
      'GET/PUT/DELETE /location/saved-places — the member’s own places, requiring authentication and readable by nobody else',
      'A documented server-side retention and deletion policy, including deletion on account closure',
      'An explicit statement that saved places are never included in any profile, search or recommendation response',
    ],
    existingSeams: [
      '`store/location.ts` already carries `savedLocations` (Home, Work, School) and `recentLocations`, and every existing screen already reads them',
      '`lib/maps/privacy.ts` already refuses to emit `home`/`work`/`school` labels in analytics or shared content',
    ],
    whyNotImplementable:
      'A home address is the most sensitive field this application would ever persist server-side, and it must not be created without a retention policy, an access rule and a deletion path specified first. Local-only is the correct default until those exist.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'low',
    recommendedPhase: 'B18 Geospatial Query Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOGRAPHIC INTELLIGENCE — §21–§26
  // ═══════════════════════════════════════════════════════════════════════════

  heatMapAggregates: {
    id: 'FRONTEND-MAPS-GAP-012',
    key: 'heatMapAggregates',
    title: 'Heat-map aggregates',
    feature: '§21 Heat Maps · §22 Heat Map Controls',
    frontendBehaviour:
      'Eight layers, a legend that states whether the scale is absolute or fitted to the viewport, a time-range control, zoom-dependent visibility and an accessible textual summary of every layer are all implemented. Layer data comes from the adapter and every layer carries `DataFreshness` naming the source.',
    coverage: 'none',
    missingContract: [
      'GET /geo/heatmap?layer&bounds&zoom&timeRange&category&countryCode → { points: [{ latitude, longitude, value }], minValue, maxValue, computedAt, sourceName }',
      'A documented aggregation cell size per zoom, so the client stops guessing at what a point represents',
      'A minimum-cell-count suppression rule, because a cell of one listing is a listing’s address rendered as a heat map — a privacy leak dressed as an aggregate',
    ],
    existingSeams: [
      '`GET /location/nearby` already counts housing, jobs, marketplace, events, providers and updates for a centre and radius — repeated over a grid this is exactly a density layer, and it is what the adapter derives from',
      '`GET /neighborhood/{id}` already returns `resourceCounts` per neighbourhood, which is a coarse activity layer already',
    ],
    whyNotImplementable:
      'Deriving a heat map on the device means fetching every entity in the viewport to count them, which is precisely the transfer §41 forbids. The suppression rule matters more: an un-suppressed density layer over a sparse area is a map of individual homes.',
    isLocationSensitive: true,
    owner: 'geo-intelligence',
    priority: 'medium',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  neighborhoodScores: {
    id: 'FRONTEND-MAPS-GAP-013',
    key: 'neighborhoodScores',
    title: 'Neighbourhood score breakdown, trend and comparison',
    feature: '§23 Neighborhood Scores · §24 Score Details',
    frontendBehaviour:
      'The overall score, a nine-dimension breakdown, per-dimension explanations, trends, side-by-side comparison of up to three neighbourhoods and the nearby-neighbourhood list are all built. The three raw numbers the certified route returns — safety, walkability, cost band — are shown as **backend** values; every other dimension is simulated and marked at field level via `Sourced<T>`.',
    coverage: 'partial',
    missingContract: [
      'GET /neighborhood/{id}/scores → dimensions[] with `score`, `explanation`, `trend`, `computedAt`, `sourceName`, `methodology`, `sampleSize`',
      'GET /neighborhood/compare?ids[] — a server-side comparison, so the client is not blending scores it did not compute',
      'A stated methodology and sample size per dimension. A score with neither is not publishable',
      'A stable neighbourhood identifier scheme; ids are currently derived by slugifying a name, which breaks on rename and collides across cities',
    ],
    existingSeams: [
      '`GET /neighborhood/{id}` is real and returns `stats.safetyScore`, `stats.walkability`, `stats.costOfLiving` and full `resourceCounts` — the activity dimensions are genuinely derivable from those counts and are marked `backend` where they are',
      '`NeighborhoodCard` and the neighbourhood hub screen already exist and are reused rather than replaced',
    ],
    whyNotImplementable:
      'The certified route returns three bare numbers with no source, no date and no methodology. §23 forbids inventing authoritative scores and §26 forbids presenting them as objective truth — so the numbers are shown, attributed and dated, and the dimensions that do not exist are not silently synthesised into the overall figure without being marked.',
    isLocationSensitive: false,
    owner: 'geo-intelligence',
    priority: 'high',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  costOfLiving: {
    id: 'FRONTEND-MAPS-GAP-014',
    key: 'costOfLiving',
    title: 'Cost-of-living index by category',
    feature: '§25 Cost Of Living Map',
    frontendBehaviour:
      'The cost-of-living layer, the category breakdown (housing, food, transport, utilities, healthcare, leisure), the currency, the baseline, the data date and the source are all implemented. The certified `costOfLiving` band — Low, Medium, High — is shown as the real value; the category indices are simulated and marked.',
    coverage: 'partial',
    missingContract: [
      'GET /neighborhood/{id}/cost-of-living → { overallIndex, baselineName, currency, categories[], computedAt, sourceName, methodology }',
      'A currency and a baseline on every figure. An index of 118 means nothing without "118 against the UK national average"',
      'A `validUntil`, because a cost index more than a quarter old should be shown as historical rather than current',
    ],
    existingSeams: [
      '`GET /neighborhood/{id}` already returns `stats.costOfLiving` as a Low/Medium/High band — real, and shown as such',
      'B15 already owns `Money` and the platform’s currency formatting, so no second money representation is introduced here',
    ],
    whyNotImplementable:
      'A three-value band cannot be expanded into six category indices without inventing five of them. §25 forbids implying that estimated data is authoritative, so the band is shown as the band it is.',
    isLocationSensitive: false,
    owner: 'geo-intelligence',
    priority: 'medium',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  safetyScoreProvenance: {
    id: 'FRONTEND-MAPS-GAP-015',
    key: 'safetyScoreProvenance',
    title: 'Safety score provenance, methodology and trend',
    feature: '§26 Safety Score',
    frontendBehaviour:
      'The safety layer, the score, the band, the breakdown, the trend, the comparison and the legend are all built. The score itself is the **real** `stats.safetyScore` from the certified neighbourhood route. What is simulated is the provenance around it — the methodology, the sample size, the trend and the sub-dimensions — and the screen renders the mandatory limitations block whether or not the provenance is real.',
    coverage: 'partial',
    missingContract: [
      '`computedAt`, `sourceName`, `methodology`, `sampleSize` and `limitations[]` alongside `stats.safetyScore`',
      'A trend contract — the same score for a previous period — so "improving" is a fact rather than an impression',
      'A documented statement of what the score does *not* measure, published by whoever computes it',
    ],
    existingSeams: [
      '`stats.safetyScore` is real and is rendered as the real value it is',
      'The community trust and verification vocabulary already exists platform-wide and the safety surfaces reuse its visual language',
    ],
    whyNotImplementable:
      'A safety score materially affects where somebody chooses to live, and this community includes people with the least margin for a bad move. §26 requires the source, the date and the limitations to be displayed; the number exists and the rest does not, so the rest is marked as simulated rather than quietly asserted.',
    isLocationSensitive: false,
    owner: 'geo-intelligence',
    priority: 'high',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  neighborhoodBoundaries: {
    id: 'FRONTEND-MAPS-GAP-016',
    key: 'neighborhoodBoundaries',
    title: 'Neighbourhood boundary geometry',
    feature: '§23 Neighborhood Scores · §7 Interactive Maps',
    frontendBehaviour:
      'Neighbourhoods render as a labelled centroid with an indicative radius derived from the distance to the nearest neighbouring centroid. The map never draws a filled polygon it cannot substantiate, and the neighbourhood layer is labelled "approximate area".',
    coverage: 'none',
    missingContract: [
      'GET /neighborhood/{id}/boundary → GeoJSON Polygon or MultiPolygon, simplified for mobile rendering',
      'A `boundarySource` and a licence statement, since administrative boundaries are frequently third-party licensed data',
    ],
    existingSeams: [
      '`GET /neighborhood/{id}` returns a real centroid, and `mockLocationDatabase` carries a curated set of neighbourhood nodes with coordinates',
      '`MapRegion.polygon` already exists in the domain model, so the render path is ready',
    ],
    whyNotImplementable:
      'A drawn boundary is a claim about where a neighbourhood ends. Members use those lines to decide where to rent, and inventing one from a centroid would put a confident line through the middle of somebody’s street.',
    isLocationSensitive: false,
    owner: 'geo-intelligence',
    priority: 'low',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTS & REALTIME — §27, §28, §29, §30
  // ═══════════════════════════════════════════════════════════════════════════

  alertAffectedArea: {
    id: 'FRONTEND-MAPS-GAP-017',
    key: 'alertAffectedArea',
    title: 'Community alert affected area and extended lifecycle',
    feature: '§28 Live Alert Map Experience · §29 Alert Lifecycle',
    frontendBehaviour:
      'Live community alerts are **real**. They are B9 Community Updates, read through the existing contract, mapped onto the alert vocabulary and drawn as severity-coloured markers with detail, timestamp, expiry, source, community verification count and share. What is simulated is the affected *area* geometry and the two lifecycle states the certified model lacks.',
    coverage: 'partial',
    missingContract: [
      'An `affectedArea` on the update contract — `{ radiusMetres }` or a polygon — so a road closure covers the road rather than sitting on a point',
      '`Withdrawn` and `Cancelled` added to `UpdateStatus`, which today carries Active, Expired, Archived, Hidden and Removed. §29 distinguishes an author retracting a report from a moderator removing it, and the distinction is visible to members',
      'An `updatedAt` on the update contract, so an amended alert can say it was amended',
      'A `severity` distinct from `urgency`, or a documented statement that urgency *is* severity — this phase assumes the latter and maps between them in one place',
    ],
    existingSeams: [
      '`CommunityUpdate` already carries category, urgency, coordinates, area name, city, country, `publishedAt`, `expiresAt`, `isExpired`, `status`, `confirmationCount` and `verificationStatus` — the alert feed is real and complete enough to publish',
      '`GET /location/nearby` already returns updates filtered by radius, which is the alert map query',
      'B13 already delivers update notifications, and `notification-routes.ts` already routes them — no second notification path is created',
    ],
    whyNotImplementable:
      'Drawing a 500 m circle around a reported road closure would be the client inventing the scope of an emergency. A member could route around an area that is not closed, or through one that is.',
    isLocationSensitive: false,
    owner: 'B9-updates',
    priority: 'high',
    recommendedPhase: 'B18 Community Updates Extension',
  },

  mapRealtimeChannels: {
    id: 'FRONTEND-MAPS-GAP-018',
    key: 'mapRealtimeChannels',
    title: 'Realtime map channels',
    feature: '§30 Realtime Map Updates',
    frontendBehaviour:
      'The map subscribes through the platform’s existing realtime seam. Where a channel exists the subscription is real; where none does, the repository degrades to a bounded, viewport-scoped refetch and the UI says the figure is periodic rather than live. **No second websocket or SSE infrastructure is created** — §30 forbids it and this phase adds none.',
    coverage: 'partial',
    missingContract: [
      'A geographic subscription primitive: `geo:alerts:{countryCode}:{cell}` or a bounds-scoped subscribe, since a per-entity channel does not work for "everything near me"',
      'Event payloads for `alert.published`, `alert.updated`, `alert.expired`, `alert.withdrawn`, `listing.availability.changed` and `event.changed`',
      'A documented authorization rule per channel, so a private organization event does not appear on a public alert channel',
      'A backfill-on-subscribe rule, so a client that reconnects does not miss the alert published while it was away',
    ],
    existingSeams: [
      '`lib/realtime-mock.ts`, `store/presence.ts` and `store/typing.ts` are the existing B13.2 realtime seam and carry conversations today — this phase subscribes through it and adds no transport',
      'TanStack Query invalidation is already how every phase applies a push to the UI, and the map uses the same mechanism',
    ],
    whyNotImplementable:
      'The transport exists and carries conversation-scoped channels. There is no geographic subscription, and a client cannot invent one without opening a second connection — which is the exact duplication §30 prohibits.',
    isLocationSensitive: true,
    owner: 'B13.2-realtime',
    priority: 'medium',
    recommendedPhase: 'B13.3 Realtime Channel Extension',
  },

  alertAuthoring: {
    id: 'FRONTEND-MAPS-GAP-019',
    key: 'alertAuthoring',
    title: 'Authorization for publishing geographic alerts',
    feature: '§49 Authorization',
    frontendBehaviour:
      'The map never decides who may publish. Alert creation routes to the existing Community Update composer, which the certified backend authorizes. Where the map surfaces an "add an alert" affordance it is gated on a capability the server reported, never on a client-side role check, and the affordance is hidden rather than disabled when no capability was reported.',
    coverage: 'partial',
    missingContract: [
      'A capability field on the alert/update contract — `canPublishAlert`, `canWithdraw`, `canAmend` — evaluated server-side per caller',
      'A documented rule for who may publish an `Emergency`-urgency update, since that is the one that pushes to everyone nearby',
      'A rejection contract distinguishing "not permitted" from "not signed in", so the UI can offer the right next step',
    ],
    existingSeams: [
      'The Community Update composer, moderation queue and reporting flow are all real and already authorize server-side',
      '`OrganizationCapabilities` in Phase 12 is the established pattern for a server-reported capability set, and this phase copies its shape rather than inventing one',
    ],
    whyNotImplementable:
      '§49 forbids frontend-only authorization. Without a reported capability the client can only guess, and a map that shows a publish button to somebody the server will reject is a worse experience than one that shows nothing.',
    isLocationSensitive: false,
    owner: 'B9-updates',
    priority: 'medium',
    recommendedPhase: 'B18 Community Updates Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM — §38, §43, §51
  // ═══════════════════════════════════════════════════════════════════════════

  nearbyRecommendations: {
    id: 'FRONTEND-MAPS-GAP-020',
    key: 'nearbyRecommendations',
    title: 'Location-scoped recommendations',
    feature: '§38 Recommendation Integration',
    frontendBehaviour:
      'The nearby-recommendation rail on the map is a **surface on the existing engine**, never a second one. No scoring, ranking or personalization happens in the frontend. Where the engine accepts no geographic scope the rail falls back to the real `GET /location/nearby` aggregate, ordered by distance only, and says it is showing nearby rather than recommended.',
    coverage: 'partial',
    missingContract: [
      'A geographic scope on the recommendation request — `latitude`, `longitude`, `radiusKm` or `bounds` — so B14 can rank within an area',
      'A `reason` string per recommendation, so the rail can say why something was surfaced instead of asserting relevance',
    ],
    existingSeams: [
      'B14 is the recommendation engine and remains authoritative; §38 forbids implementing scoring in the frontend and this phase implements none',
      '`GET /location/nearby` is real and returns a distance-ordered cross-domain aggregate, which is a correct and honest fallback',
    ],
    whyNotImplementable:
      'Ranking by distance in the client is not personalization and must not be labelled as such. Without a geographic parameter on the engine, distance ordering is the only defensible thing to show, and the label says exactly that.',
    isLocationSensitive: true,
    owner: 'B14-recommendation',
    priority: 'low',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  offlineMapData: {
    id: 'FRONTEND-MAPS-GAP-021',
    key: 'offlineMapData',
    title: 'Offline map metadata and cached area packs',
    feature: '§43 Offline Experience',
    frontendBehaviour:
      'Offline, the map falls back to the schematic canvas renderer, which needs no tiles, and serves cached search results, cached saved places, cached neighbourhood metadata and cached alerts from the TanStack Query cache — each stamped with when it was fetched. Alerts and any traffic-derived figure are explicitly **not** presented as current while offline, per §43.',
    coverage: 'partial',
    missingContract: [
      'An offline area-pack contract: a downloadable bundle of neighbourhood metadata, place nodes and recent listings for a bounded area',
      'A tile-pack contract, or a documented statement that offline tiles are out of scope — see MAP-PROVIDER-GAP-007',
      'A server-supplied `asOf` on cacheable responses, so staleness is the server’s statement rather than the client’s fetch timestamp',
    ],
    existingSeams: [
      '`lib/connectivity.ts` already tracks reachability from observed request outcomes and from `expo-network`, and every screen already consumes it',
      'The canvas map renderer requires no network at all, which makes the offline map degradation genuine rather than a placeholder',
      'TanStack Query already persists and serves the cached list surfaces',
    ],
    whyNotImplementable:
      'An offline pack is a server-side bundling decision with a size budget and an expiry policy. The client can cache what it has already seen — and does — but cannot pre-fetch an area it has never visited.',
    isLocationSensitive: false,
    owner: 'location-platform',
    priority: 'low',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  mapAnalyticsIngestion: {
    id: 'FRONTEND-MAPS-GAP-022',
    key: 'mapAnalyticsIngestion',
    title: 'Analytics ingestion for map events',
    feature: '§51 Analytics',
    frontendBehaviour:
      'Every §51 event is emitted through the platform’s existing analytics buffer with a property allow-list applied at emit. No precise coordinate is ever attached: the only geographic property permitted is `geoCell`, an ~11 km grid cell. The buffer drains to nothing because no ingestion endpoint exists — the same absence Phase 7 registered as CREATOR-GAP-016.',
    coverage: 'none',
    missingContract: [
      'POST /analytics/events — batched, fire-and-forget, with a documented schema and a size limit',
      'A retention policy for geographic properties, and confirmation that `geoCell` at ~11 km is acceptable under it',
    ],
    existingSeams: [
      '`lib/creator-analytics.ts` already owns the buffer, the sanitiser and the allow-list, and this phase registers its vocabulary there rather than building a second pipeline',
      '`lib/maps/privacy.ts` already reduces any coordinate to a grid cell before it can reach an event',
    ],
    whyNotImplementable:
      'There is nowhere to send events. Registering the vocabulary and the allow-list now is what makes the eventual endpoint a configuration change rather than an audit of every call site.',
    isLocationSensitive: true,
    owner: 'future-evolution',
    priority: 'low',
    recommendedPhase: 'B17 Operational Excellence',
  },
};

/** Every gap, ordered by identifier. Used by the register screen and the docs. */
export const MAPS_GAP_LIST: MapsGap[] = Object.values(MAPS_GAPS).sort((a, b) =>
  a.id.localeCompare(b.id)
);

export function getMapsGap(key: string): MapsGap | undefined {
  return MAPS_GAPS[key];
}

/**
 * Whether this build may reach the maps development adapter.
 *
 * Delegates to `areSimulatedFeaturesEnabled()` — the single switch shared with
 * Phases 5, 6, 7 and 12. Five different answers to "may this build simulate?"
 * would be five things to get wrong.
 *
 * True under Metro and in a debug binary, and in an internal test build that
 * explicitly opted in with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. False in every
 * production build, where Metro's minifier additionally strips the dead branch
 * — so a production binary contains no path to a fabricated route, an invented
 * safety score or a synthetic heat map.
 */
export function areMapsGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/**
 * The URL space every simulated maps route lives under.
 *
 * Never `/location`, `/housing`, `/marketplace`, `/jobs`, `/community-life` or
 * `/neighborhood` — those are real and this phase reads them directly. A gap
 * call that escaped a development build 404s at the gateway rather than
 * shadowing a certified route.
 */
export const MAPS_GAP_PREFIX = '/maps-gap/v0';
