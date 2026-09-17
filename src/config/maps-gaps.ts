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
  | 'partial'
  /**
   * The certified backend carries all of it, and the client now uses it.
   *
   * Added by Remediation Wave A′, because two entries in this register turned
   * out never to have been gaps: the capability existed and the client was
   * asking a route that does not exist. A register with no way to say "resolved"
   * can only ever grow, which is how 164 closed gaps stayed marked open across
   * thirteen backend waves.
   */
  | 'full';

export interface MapsGap {
  /**
   * Whether the backend has since shipped this.
   *
   * The register is a historical record and entries are deliberately not deleted
   * when a gap closes — that is the whole point of the file. But a notice that
   * keeps rendering after the capability arrives tells members the platform
   * cannot do something it does, which is the one failure this pattern exists to
   * prevent, pointing the other way.
   *
   * `connected` means every declared endpoint is served, verified against the
   * deployment rather than assumed. The notice stops rendering; nothing else
   * changes. `partial` means some are, and the notice stays because the screen
   * still has a hole in it.
   */
  backendStatus?: 'connected' | 'partial';
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
    backendStatus: 'partial',
    key: 'viewportSearch',
    title: 'Bounding-box (viewport) search',
    feature: '§13 Viewport-Based Search · §10 Map-First Discovery',
    frontendBehaviour:
      'RESOLVED for housing, marketplace and providers (Remediation Wave A′). The viewport is sent as the platform\'s own `bounds` parameter — `"north,south,east,west"` — which takes precedence over point-and-radius server-side. The remaining layers still convert to an enclosing circle until their contracts have been read from source. Debounce, movement threshold, request cancellation and cache-key deduplication are unchanged and remain client-side.',
    coverage: 'partial',
    missingContract: [
      '**Resolved.** Every layer accepts `bounds`: `GET /jobs`, `GET /community-life/events`, `GET /community-life/organizations`, `GET /housing/search` and `GET /providers` all declare it on the served contract. This entry called the last three "not yet verified" and they had been verified by nobody — the same failure it documents one paragraph down, one layer up. What follows is what actually remains.',
      'Antimeridian-safe handling server-side, so a box with `west > east` is not read as spanning the planet',
      'A documented result cap per request with a `hasMore` cursor, so a dense city viewport is bounded rather than truncated silently',
    ],
    existingSeams: [
      '**`GET /housing/search`, `POST /marketplace/search` and `GET /providers` all accept `bounds` in `"north,south,east,west"` form, and have the whole time.** The gap was recorded against `GET /housing` and `GET /listings`, neither of which this platform serves — so no parameter of any name was ever read, and the absence of an answer was mistaken for the absence of a feature.',
      '`GET /community-life/events` and `/organizations` accept `latitude`, `longitude`, `radiusKm`, `cityName` and `category`',
      '`GET /location/nearby` aggregates housing, jobs, marketplace, events, providers and updates for a centre and radius',
      '`GET /location/within-bounds` and `GET /location/map/clusters` exist and are unconsumed — worth reading before extending anything',
    ],
    whyNotImplementable:
      'Substantially resolved. The ~27% overfetch is gone for the three verified layers. It remains for jobs, events and organizations only because their request records have not yet been read from backend source, and this register will not claim a contract it has not verified — that is precisely the mistake that kept this entry open.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'Remediation Wave C — verify the three remaining layers',
  },

  serverSideClustering: {
    id: 'FRONTEND-MAPS-GAP-002',
    backendStatus: 'connected',
    key: 'serverSideClustering',
    title: 'Server-side marker aggregation for dense viewports',
    feature: '§9 Marker Clustering · §41 Map Performance',
    frontendBehaviour:
      'RESOLVED (16 Sep 2026). A view wider than about 33 km asks `GET /location/map/clusters` at town level and draws the platform’s own totals per town — homes, jobs, items, services, guides and events — instead of counting a page of pins on the device. Zoomed in, each result is drawn and clustered on the device as before. Refused (signed out, no permission) or failed, the map keeps counting on the device and never shows a total it did not receive.',
    coverage: 'full',
    missingContract: [],
    existingSeams: [
      '**The counts were empty until the same day.** The route was served, and every counter behind it aggregates by an area path that no home or job had ever been given; filing rows under their areas (backend 9359ea2, 05ba6fe) is what made the totals real.',
      '**Town level, on purpose.** Jobs and marketplace listings carry no coordinates and are filed from the town their owner named, so neighbourhood totals would leave them out. A wide view is a question about towns.',
      'Organizations and alerts have no counter: alerts are drawn by their own layer, and organizations do not appear in the wide-view totals.',
      '`lib/maps/clustering.ts` still clusters on the device below the threshold; a server cell replaces its input, not its callers, exactly as this entry expected.',
    ],
    whyNotImplementable:
      'Nothing remains. A tap on a town total zooms into the town rather than listing its members, because a cell carries a count and not the rows.',
    isLocationSensitive: false,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'Closed 16 Sep 2026',
  },

  providerProximity: {
    id: 'FRONTEND-MAPS-GAP-003',
    backendStatus: 'connected',
    key: 'providerProximity',
    title: 'Proximity query for service providers',
    feature: '§34 Providers Integration',
    frontendBehaviour:
      'RESOLVED (Remediation Wave A′). Provider markers come from `GET /api/v1/providers`, which is asked for the right page rather than filtered after the fact: `latitude`, `longitude`, `radiusKm`, `bounds` and `sort=distance` are all sent, and `location.distanceKm` is read from the response instead of derived on the device.',
    coverage: 'full',
    missingContract: [],
    existingSeams: [
      '**This gap was never true.** It was recorded against `GET /listings` — a path this platform has never served — so the parameters it asked for were never sent to the route that reads them. `GET /api/v1/providers` binds `latitude`, `longitude`, `radiusKm`, `bounds`, `areaId`, `cityName`, `countryCode`, `originCountryCode` and `sort=distance`, forwards them to the shared `IGeographicScopeResolver`, and returns a per-item `location.distanceKm` computed server-side.',
      'Note the parameter is `cityName` here, where marketplace and housing say `city`. The platform is not consistent about this and a client must not guess.',
      'The directory requires the `providers.read` policy, unlike housing and marketplace discovery which are anonymous. An unauthenticated map draws no provider pins — which is a real behaviour, not a failure.',
    ],
    whyNotImplementable:
      'Nothing remains. The three things this entry asked for — proximity parameters, distance sorting and a server-computed `distanceKm` — were all already implemented on the real route.',
    isLocationSensitive: false,
    owner: 'location-platform',
    priority: 'low',
    recommendedPhase: 'Closed by Remediation Wave A′ — retain the entry as a record that it was never open',
  },

  guideGeographicScope: {
    id: 'FRONTEND-MAPS-GAP-004',
    backendStatus: 'connected',
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
    backendStatus: 'connected',
    key: 'savedLocations',
    title: 'Server-side saved places and recent destinations',
    feature: '§20 Saved Locations',
    frontendBehaviour:
      'RESOLVED (16 Sep 2026). Home, Work and School are the places the member’s profile holds, read from `GET /location/me/profile` and written with `PUT`/`DELETE /location/me/saved-locations/{label}`. They survive a restart and follow the member to another device. Recent destinations stay device-side and TTL-pruned per §40 — a route exists for them too, and sending every place a member visits is a different decision from saving the three they chose.',
    coverage: 'full',
    missingContract: [],
    existingSeams: [
      '**The routes were never missing.** This entry asked for `/location/saved-places`; the platform serves `/location/me/saved-locations/{label}`, and has since the module shipped. The label is in the path because it is the place’s identity — saving "Home" twice is a move — and the body is optional: omitted, the server saves wherever the member is, which is what "SAVE ACTIVE" means.',
      '**The refusal was right about the rest of it, and it was acted on before the wiring.** This entry required a deletion path and an access rule first. The access rule was there (`/me` only, gated by `LocationPolicies.ReadProfile`/`ManageProfile`, and a saved place appears on no other response). The deletion path was not: the platform held exactly one erasure provider, Identity’s, so closing an account left a home address behind. `LocationDataErasureProvider` and `LocationDataExportProvider` were written first (backend, 16 Sep 2026), with tests.',
      '`lib/maps/privacy.ts` still refuses to emit `home`/`work`/`school` labels in analytics or shared content.',
    ],
    whyNotImplementable:
      'Nothing remains. A home address still deserves the care this entry demanded, which is why erasure and export came before the save button was connected.',
    isLocationSensitive: true,
    owner: 'location-platform',
    priority: 'low',
    recommendedPhase: 'Closed 16 Sep 2026 — retain the entry as the record of what it required first',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOGRAPHIC INTELLIGENCE — §21–§26
  // ═══════════════════════════════════════════════════════════════════════════

  heatMapAggregates: {
    id: 'FRONTEND-MAPS-GAP-012',
    backendStatus: 'connected',
    key: 'heatMapAggregates',
    title: 'Heat-map aggregates',
    feature: '§21 Heat Maps · §22 Heat Map Controls',
    frontendBehaviour:
      'Eight layers, a legend that states whether the scale is absolute or fitted to the viewport, a time-range control, zoom-dependent visibility and an accessible textual summary of every layer are all implemented. Layer data comes from the adapter and every layer carries `DataFreshness` naming the source.',
    coverage: 'full',
    missingContract: [
      // RESOLVED (Remediation Wave C-06). This line used to open
      // `GET /geo/heatmap?layer&bounds&zoom&timeRange&category&countryCode → …`
      // and describe it as absent. The route is real and `lib/maps/geo-client.ts`
      // calls it. It is kept, reworded, because the *ratchet never saw it*: the
      // declaration parser drops any path containing a `?`, deliberately, so a
      // query-string declaration is invisible to the drift check no matter how
      // stale it becomes. That blind spot is the finding, not the route.
      //
      // Three things the declaration got wrong, all of which mattered:
      //   · The rows are named `points`, not `items` — a client keying on
      //     `items` reads an empty layer with no error.
      //   · Bounds are four separate `north`/`south`/`east`/`west` doubles, not
      //     one `bounds` parameter.
      //   · There is no `timeRange` and no `category`. The client still accepts
      //     `timeRange` in its signature and no longer sends it; §22's time
      //     filter is what stays open below.
      'RESOLVED: `GET /api/v1/geo/heatmap` is served and connected. What remains is a time filter — the route takes no `timeRange`, so §22’s control cannot narrow anything',
      'Only five of this client’s eight layers are served — `community-activity`, `housing-availability`, `marketplace-activity`, `jobs`, `events`. `safety`, `cost-of-living` and `housing-price` are refused **by name** with 400, so asking for one is an error rather than an empty layer, and `isServedHeatLayer` checks before the query is enabled rather than after it fails',
      // Both of these turned out to exist, which is why they now read as
      // resolved rather than missing. `minimumCellCount` and `suppressedCells`
      // are published on every response, so the suppression is visible to the
      // member rather than merely promised.
      'RESOLVED: the aggregation level is published per response as `level` (`Neighborhood`/`City`), so the client no longer guesses what a point represents',
      'RESOLVED: a minimum-cell-count suppression rule exists and is *reported* — `minimumCellCount` and `suppressedCells` are on every response, so a sparse viewport says how much it withheld rather than silently thinning',
    ],
    existingSeams: [
      'RE-DERIVED 20 Aug 2026 against the running API. The route is published and answers, and `GET /geo/capabilities` declares this capability `available: true, provider: platform`. Coverage moved from `partial` to `full`: what this entry described as missing is served. Kept rather than deleted, per the note on `MapsGapCoverage` — a register with no way to say "resolved" only ever grows.',
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
    backendStatus: 'connected',
    key: 'neighborhoodScores',
    title: 'Neighbourhood score breakdown, trend and comparison',
    feature: '§23 Neighborhood Scores · §24 Score Details',
    frontendBehaviour:
      'The overall score, a nine-dimension breakdown, per-dimension explanations, trends, side-by-side comparison of up to three neighbourhoods and the nearby-neighbourhood list are all built. The three raw numbers the certified route returns — safety, walkability, cost band — are shown as **backend** values; every other dimension is simulated and marked at field level via `Sourced<T>`.',
    coverage: 'full',
    missingContract: [
      // RESOLVED (Remediation Wave C-06). These two lines used to read
      // `GET /neighborhood/{id}/scores → …` and `GET /neighborhood/compare?ids[] — …`
      // and describe both as absent. Both are real.
      //
      // The first is the more interesting failure, and the reason it is kept
      // rather than deleted: it parses cleanly and matched nothing, because the
      // real path is `/api/v1/geo/neighborhoods/{}/scores` — plural, under a
      // different module. A declaration that is stale **and wrong about where**
      // is indistinguishable, to the drift check, from one that is simply still
      // missing. That is the second blind spot this register exposed, after the
      // query-string one on GAP-012.
      'RESOLVED: `GET /api/v1/geo/neighborhoods/{idOrSlug}/scores` is served and connected — with `explanation`, a per-dimension `freshness`, and an `unavailableDimensions[]` naming each dimension it could **not** compute and why, which is the provenance §23 asked for and more than this line requested',
      'RESOLVED: `GET /api/v1/geo/neighborhoods/compare?ids=` is served and connected. Two behaviours to know: it is capped at five subjects (400 beyond that, and §24 asks for three), and it **silently drops** ids it cannot resolve rather than failing — so a caller must compare what came back against what it asked for',
      '`trend` is on the contract and is `null` on every deployment — no dimension has a previous period, so "improving" is still an impression rather than a fact',
      'A stated methodology and sample size per dimension. `freshness.methodology` and `freshness.sampleSize` exist on the contract but are not populated for every dimension, and a score with neither is not publishable',
      'A stable neighbourhood identifier scheme; ids are currently derived by slugifying a name, which breaks on rename and collides across cities',
    ],
    existingSeams: [
      'RE-DERIVED 20 Aug 2026 against the running API. The route is published and answers, and `GET /geo/capabilities` declares this capability `available: true, provider: platform`. Coverage moved from `partial` to `full`: what this entry described as missing is served. Kept rather than deleted, per the note on `MapsGapCoverage` — a register with no way to say "resolved" only ever grows.',
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
    backendStatus: 'partial',
    key: 'costOfLiving',
    title: 'Cost-of-living index by category',
    feature: '§25 Cost Of Living Map',
    frontendBehaviour:
      'PARTLY RESOLVED (17 Sep 2026). Rent is measured, from Diaspora’s own listings: the median monthly asking rent of the homes listed in a neighbourhood, as an index against the median of its country’s, in the country’s most-listed currency. The panel heads with that rent index under its own name, shows the typical asking rent, lists food, transport, utilities, healthcare and leisure as not measured, and says there is no overall figure. Its source, method, limitations and the number of homes behind it are shown with it. Below the minimum number of homes a neighbourhood has no index and the screen shows the published band, or "not assessed".',
    coverage: 'partial',
    missingContract: [
      '**Resolved.** `GET /geo/neighborhoods/{idOrSlug}/cost-of-living` publishes a `housing` category — index, typical monthly rent and currency — with `isAvailable: true`, a `baselineName` and full `freshness` (source "Diaspora listings", method, limitations, `sampleSize`, `validUntil`) wherever at least 5 homes are listed in the neighbourhood and 20 in the country (`GeographicIntelligence:MinimumRentListingsInArea` / `InCountry`). `GET /geo/capabilities` reports `cost-of-living` available, rent only. What follows is what actually remains.',
      'Food, transport, utilities, healthcare and leisure. Nothing on the platform measures them, so they stay unmeasured and `overallIndex` stays null: an overall figure from rent alone would be a rent index under a broader name.',
      'Enough listings. Production held 2 homes on 17 Sep 2026, so no neighbourhood reaches the minimum yet and every screen shows the not-available branch. The index appears on its own as homes are listed; nothing needs deploying.',
      'Asking rents, not agreed rents. A let price would need a completed-tenancy record the platform does not keep.',
    ],
    existingSeams: [
      'Housing publishes `IRentStatistics` (backend `Diaspora.Modules.Housing.Integration`): the same publicly-visible rule as its counters, weekly/quarterly/yearly rents converted to monthly, nightly and per-stay prices left out, other currencies left out and counted in the limitations rather than converted.',
      'The neighbourhood screen reads `GET /location/neighborhoods/{idOrSlug}` since 17 Sep 2026. It read `/housing/neighborhoods/{idOrSlug}`, which 404s until somebody writes a profile, so the cost tab was unreachable on production.',
      'The moderated band from B11 is still served beside the index, with its own provenance, and the two are never blended.',
    ],
    whyNotImplementable:
      'Five of the six categories have no source anywhere on the platform, and §25 forbids implying that estimated data is authoritative. Rent is the one category Diaspora observes directly, so it is the one it publishes.',
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
      // Remediation Wave C-06. As with cost of living: the route is real and
      // the data is not. `GET /api/v1/geo/neighborhoods/{idOrSlug}/safety`
      // answers 200 with `isAvailable: false`, `score: null`, `band: null`,
      // `breakdown: []`, `trend: null` and `unavailableReason: "NoDataSource"`,
      // all hard-coded. Never a 503.
      //
      // The one thing it *does* carry is the item this entry asked for last:
      // `limitations[]` is four server-authored sentences, present on every
      // response including the unavailable ones. So the mandatory §26
      // limitations block is now rendered from the platform's own words rather
      // than from a client-side constant — which is exactly the right way round
      // for a statement about what a score does not measure.
      'RESOLVED: `limitations[]` is served — four server-authored sentences on every response, which is the documented statement of what the score does *not* measure, published by whoever computes it',
      'The score itself. `isAvailable` is hard-coded `false` and `score` hard-coded `null` on every deployment, with `unavailableReason: "NoDataSource"`. The route is connected and there is no safety score behind it — so nothing renders a number, which is the correct outcome and not a degraded one',
      '`computedAt`, `sourceName`, `methodology` and `sampleSize` alongside a real score — `freshness` carries the shape, the score it would describe does not exist yet',
      'A trend contract — the same score for a previous period — so "improving" is a fact rather than an impression. `trend` is on the contract and is always null',
    ],
    existingSeams: [
      'RE-DERIVED 20 Aug 2026 against the running API. **The route is published**; what is absent is a data source. `GET /geo/capabilities` declares this capability `available: false, provider: none`, in the platform’s own words — so this is a CAPABILITY SWITCHED OFF rather than a missing contract, and a backend phase that "implemented" it would be contracting a data supplier, not writing an endpoint. Coverage left at `partial` because that is the nearest honest value this register can express.',
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
    backendStatus: 'partial',
    key: 'neighborhoodBoundaries',
    title: 'Place boundary geometry',
    feature: '§23 Neighborhood Scores · §7 Interactive Maps',
    frontendBehaviour:
      'PARTLY RESOLVED (17 Sep 2026). The discovery map draws the outline of every place in view that the platform holds one for — at launch Greater London, Greater Manchester, Manchester, Plaines Wilhems, Port Louis (the district), Quatre Bornes and Curepipe, all OpenStreetMap administrative boundaries matched to catalogue places by exact name and level. Outlines are strokes, firmer for a town than for a district or region, and the map’s attribution strip says "Place outlines © OpenStreetMap contributors" exactly while one is drawn; an outline arriving without its credit is not drawn. Neighbourhoods still have no outline, and their screen keeps the labelled approximate-area circle.',
    coverage: 'partial',
    missingContract: [
      '**Resolved.** `GET /location/map/boundaries?bounds=` answers the outlines a viewport overlaps, and every outline the platform serves — there and on `GET /location/areas/{id}` — carries `source`, `licence` (`ODbL-1.0`), `attribution`, `sourceReference` (the OSM relation) and `retrievedOn`. The platform refuses to store an outline without them. What follows is what actually remains.',
      'Neighbourhood outlines. No open dataset matches the catalogue’s neighbourhoods exactly: London’s wards are electoral lines, and Rose Hill Central or Quatre Bornes Center have no administrative boundary at all. Importing a near match would put a sourced-looking line in the wrong place.',
      'Outlines for places whose OSM name or level differs from the catalogue’s — Salford is a city in OSM and a neighbourhood here; Beau Bassin-Rose Hill is one municipality in OSM and two places here. Each needs a catalogue decision before an outline can be matched to it.',
    ],
    existingSeams: [
      'The outlines also file listings: a pin inside a town’s outline is filed in that town when the owner named none, even when the next town’s centre is nearer, and a named town whose outline leaves the pin out is not refined into one of its neighbourhoods (backend `AreaLocator`).',
      '`GET /location/neighborhoods/{idOrSlug}` returns a neighbourhood’s `boundary` with the same credit fields, so the neighbourhood screen can draw one the day the catalogue holds one.',
      'The OSM extract is bundled with the backend (`osm-boundaries.json`, ODbL) and seeded idempotently: a newer extract of the same relation replaces an older one, and an outline from any other source is never overwritten.',
    ],
    whyNotImplementable:
      'A drawn boundary is a claim about where a place ends. Members use those lines to decide where to rent, so a line is drawn only where a named source publishes one for exactly that place, and never inferred from a centroid.',
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
    backendStatus: 'connected',
    key: 'alertAffectedArea',
    title: 'Community alert affected area and extended lifecycle',
    feature: '§28 Live Alert Map Experience · §29 Alert Lifecycle',
    frontendBehaviour:
      'RESOLVED (16 Sep 2026). An alert carries the area its author declared — `affectedRadiusMetres`, 25 m to 50 km — and the map draws exactly that circle and nothing wider. `withdrawn` (the report was wrong) and `cancelled` (what it reported is over) are real statuses: the post stays readable and marked, leaves every feed and the live map, and the author reaches both from the alert’s own page. An amendment says so through `editedAt`.',
    coverage: 'full',
    missingContract: [],
    existingSeams: [
      '**An area needs a pin its author chose.** The composer used to send a place name and no coordinates, and the platform placed every such alert at the centre of the town it named — so every London alert sat on one spot, and a radius around it would have been a precise-looking claim about a place nobody picked. The server now records `location.pointIsExact` and refuses an area without it; the map marks centroid-placed alerts as approximate (`locationPrecision: area`), and the composer offers a pin only when the phone has a real fix.',
      'Nearby answers an alert whose declared area reaches the member even when its pin is outside the searched circle — two circles overlap when their centres are closer than their radii added together.',
      '`severity` is not a second scale: urgency *is* severity, mapped in one place by `toAlertSeverity`.',
      'Polygons are not published. A radius covers a closure reported at a junction; a drawn outline for a road would need an editor this app does not have, and is not promised here.',
    ],
    whyNotImplementable:
      'Nothing remains. The rule the entry insisted on still holds: the app never invents the scope of somebody’s emergency — it draws what the author stated, or a point.',
    isLocationSensitive: false,
    owner: 'B9-updates',
    priority: 'high',
    recommendedPhase: 'Closed 16 Sep 2026',
  },

  mapRealtimeChannels: {
    id: 'FRONTEND-MAPS-GAP-018',
    backendStatus: 'connected',
    key: 'mapRealtimeChannels',
    title: 'Realtime map channels',
    feature: '§30 Realtime Map Updates',
    frontendBehaviour:
      'RESOLVED (16 Sep 2026). The platform announces every change to a public alert — published, amended, withdrawn, cancelled, expired or taken down — as a `ResourceChanged` frame on `geo:alerts:{cell}` for each four-character geohash cell the alert’s area touches. `useMapRealtime` joins the cells the viewport covers over the one SignalR connection the app already holds, refetches when a frame arrives, and says `live`. No connection, or a viewport wider than 16 cells, and it polls once a minute and says so. **No second transport was created.**',
    coverage: 'full',
    missingContract: [],
    existingSeams: [
      '**The authorization rule, per channel:** any signed-in member may watch any real cell, because the channel carries signals about public alerts only — the server announces nothing a public map would not draw. A name that is not a cell is refused.',
      '**Backfill on subscribe is the client’s:** the server replays nothing, so the map refetches once after joining and after every reconnect. The viewport query is the only complete answer; a replay could only be a partial copy of it.',
      'The frame carries no content — type, id, kind, a stable reason key — because a socket frame is the one place moderation and erasure cannot reach. The cell grid is pinned to published geohash vectors on both sides (`GeoCells` on the server, `lib/maps/alert-cells.ts` here).',
      '`listing.availability.changed` and `event.changed` on the map were also asked for. Events already publish `ResourceChanged` on `event:{id}` for members who hold one open; listing availability has no channel and is not claimed here.',
    ],
    whyNotImplementable:
      'Nothing remains for alerts. Listings on the map still refresh with their own queries.',
    isLocationSensitive: true,
    owner: 'B13.2-realtime',
    priority: 'medium',
    recommendedPhase: 'Closed 16 Sep 2026',
  },

  alertAuthoring: {
    id: 'FRONTEND-MAPS-GAP-019',
    backendStatus: 'connected',
    key: 'alertAuthoring',
    title: 'Authorization for publishing geographic alerts',
    feature: '§49 Authorization',
    frontendBehaviour:
      'RESOLVED (16 Sep 2026). `GET /community/alerts/capabilities` answers, per caller, whether they may publish at all and whether they may publish an Emergency, each refusal with its reason, plus the urgencies they may choose and the affected-area limits. The composer renders only the urgencies listed — Emergency is hidden, not disabled, for somebody who may not choose it. Each post carries `canEdit`, `canWithdraw` and `canCancel`, and the alert page offers only what they allow.',
    coverage: 'full',
    missingContract: [],
    existingSeams: [
      '**The Emergency rule (decided 16 Sep 2026):** only verified members may publish, or raise an alert to, Emergency — its own permission, `community:alerts:emergency`, at the verified tier. Posting at any urgency already needed a verified account, so today the rule changes nothing a member can do; it makes the rule a named thing the client can be told about, and one that can tighten on its own.',
      '**The rejection contract:** not signed in is a 401 from the capabilities route; signed in and not permitted is a 200 with the reason, and a 403 `community.post.emergency.not-permitted` if an Emergency is sent anyway.',
    ],
    whyNotImplementable:
      'Nothing remains. The map still decides nothing about who may publish.',
    isLocationSensitive: false,
    owner: 'B9-updates',
    priority: 'medium',
    recommendedPhase: 'Closed 16 Sep 2026',
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
    // ── Closed. See FRONTEND-PHASE15-GAP-029 (`telemetryIngestion`). ──────────
    //
    // This entry asked for `POST /analytics/events`. The route exists and is
    // called: it is `POST /api/v1/telemetry/events`, the analytics module has
    // named that destination since Phase 7, and it takes the batched
    // `TelemetryBatchRequest { events[] }` shape this entry described.
    // `lib/telemetry-api.ts` posts to it and `app/_layout.tsx` starts the
    // sixty-second flush on sign-in. Verified against the deployment on
    // 10 Sep 2026: **202 Accepted**.
    //
    // **What is still true, and belongs to GAP-029 rather than here.** The
    // server registry accepts seven client-submittable names and this app
    // emits four of them — the automation ones. Every other name across the
    // five client vocabularies is refused *locally*, before the network, as
    // `analytics.ingest.event-unknown`. That refusal is the design: the other
    // names are server-produced facts and §41 forbids a client incrementing
    // one. It is not a missing transport, which is what this entry was about.
    //
    // Marked connected rather than deleted: the register is a historical
    // record, and it should show that four entries named one dependency and
    // only one of them was re-read.
    backendStatus: 'connected',
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
