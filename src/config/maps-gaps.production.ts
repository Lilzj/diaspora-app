// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `maps-gaps.ts`, derived by
// `node scripts/generate-production-registers.js`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// `metro.config.js` and `scripts/production-stubs.js`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
//   existingBackendCapability — community/gaps only
//   frontendBehaviour — analytics/gaps, community/gaps, creator/gaps, map/diagnostics
//   existingSeams — creator/gaps only
//   whyNotImplementable — analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection
//   privacyConsiderations — analytics/gaps, community/gaps
//   securityConsiderations — analytics/gaps, community/gaps
//   caching — community/gaps only
//   integrationWork — map/diagnostics only
//   considerations — no reader outside the registers
//   requiredContracts — analytics/gaps, community/gaps — and emptying it takes the nested request, response, authorization, idempotency, aggregation and retryBehaviour shapes with it
//   currentBehaviour — map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS
//   missingBackendCapability — analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS and MULTI_COMMUNITY_GAPS
//
// Edit the source. `production-registers-drift.test.ts` fails if this file
// stops matching what this script would produce from it.

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
      '',
    coverage: 'partial',
    missingContract: [
      '**Resolved.** Every layer accepts `bounds`: `GET /jobs`, `GET /community-life/events`, `GET /community-life/organizations`, `GET /housing/search` and `GET /providers` all declare it on the served contract. This entry called the last three "not yet verified" and they had been verified by nobody — the same failure it documents one paragraph down, one layer up. What follows is what actually remains.',
      'Antimeridian-safe handling server-side, so a box with `west > east` is not read as spanning the planet',
      'A documented result cap per request with a `hasMore` cursor, so a dense city viewport is bounded rather than truncated silently',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'full',
    missingContract: [],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'full',
    missingContract: [],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      'GET /guides?bounds|latitude&longitude&radiusKm — guides whose scope intersects an area',
      'A `scopeLevel` field (Country | Region | City | Neighborhood | Area) so the client stops inferring it from which optional fields are populated',
      'An optional `scopeBounds` for area-scoped guides, so a transit guide can be drawn over the area it covers rather than at a single point',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      'GET /location/geocode?q&countryCodes&near&limit — free-text address and POI resolution returning coordinate, structured address and a confidence',
      'GET /location/autocomplete?q&near&countryCodes&sessionToken — incremental suggestions, session-tokened so a keystroke sequence bills as one lookup',
      'A structured `Address` in the response — `street`, `postalCode`, `region`, `regionCode` — none of which `PlatformLocation` currently carries',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      'A structured address on the reverse-geocode response — street, postal code, region code — rather than the nearest curated node',
      'A `distanceToMatchMetres` field, so the client can say "near Peckham" versus "in Peckham" from data rather than from a guess',
      'A documented behaviour when no node is within a sensible distance, instead of returning the nearest node anywhere on Earth',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'none',
    missingContract: [
      'A routing capability reachable from the backend, or a configured client-side routing provider — see MAP-PROVIDER-GAP-003',
      'POST /location/routes { origin, destination, waypoints[], travelMode, alternatives } → Route[] with distance, duration, decoded geometry and instructions',
      'A caching and freshness policy per mode, since a walking route is stable for hours and a driving duration is not',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'none',
    missingContract: [
      'The routing contract in GAP-007, plus `alternatives: true` support returning two or three distinct routes with `summary` strings',
      'A traffic-aware duration field, explicitly distinguished from the free-flow duration, and a statement of how current the traffic model is',
      'A documented behaviour for "no route" — an island, a closed border — distinct from a provider failure',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'none',
    missingContract: [
      'A transit routing provider — see MAP-PROVIDER-GAP-004 — or a backend transit contract',
      'POST /location/routes with `travelMode: "transit"` and `departureAt`, returning legs typed by mode with `line`, `agency`, `headsign`, `departureStop`, `arrivalStop`, `departureAt`, `arrivalAt` and `stopCount`',
      'A freshness contract: a departure time more than a few minutes old is misinformation, not stale data, and the response must carry enough to enforce that',
      'A coverage declaration per city, so the UI can say "transit directions are not available in Rose Hill" rather than returning nothing',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'none',
    missingContract: [
      'The routing contract in GAP-007 returning `instructions[]` with a normalized manoeuvre kind, text, per-instruction distance and the coordinate the manoeuvre happens at',
      'Decoded or documented-encoding route geometry dense enough for map matching — a two-point line cannot be navigated',
      'A route-refresh contract for recalculation that does not re-plan from scratch',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'full',
    missingContract: [],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
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
      // What the declaration got wrong: the rows are named `points`, not
      // `items`; bounds are four separate `north`/`south`/`east`/`west` doubles,
      // not one `bounds` parameter; and there is no `category`.
      '**Served since 20 Oct 2026.** `GET /api/v1/geo/heatmap` takes `timeRange` (`24h`|`7d`|`30d`|`90d`, anything else `geo.heat.time_range_invalid`) and filters on each row’s own time, echoing the range it applied (backend edaac7a). The client sends it and shows the echo, so a deployment that ignored it is never presented as filtered.',
      '**Served since 20 Oct 2026.** All eight layers: `housing-price` (median monthly asking rent per square, 5 homes a square) and `cost-of-living` (that median against the country’s, 100 = the same, 5 a square and 20 a country) both require `countryCode` (`geo.heat.country_required`); `safety` counts one named `source` at a time — `community-reports` (default) or `police-recorded-crime` (data.police.uk, OGL credit, `countryCode` required) — and never a score. Withheld squares arrive as `withheldCells` (where and why, never the figure); a source that cannot answer arrives as `isAvailable: false` with `unavailableReason`; rent layers carry `currency`.',
      'The contract published by the backend repository (`contracts/Diaspora.Api.json`) was not regenerated with edaac7a, so `timeRange` and `source` are not on it yet; the parameters are read from the C# endpoint.',
      // Both of these turned out to exist, which is why they now read as
      // resolved rather than missing. `minimumCellCount` and `suppressedCells`
      // are published on every response, so the suppression is visible to the
      // member rather than merely promised.
      'RESOLVED: the aggregation level is published per response as `level` (`Neighborhood`/`City`), so the client no longer guesses what a point represents',
      'RESOLVED: a minimum-cell-count suppression rule exists and is *reported* — `minimumCellCount` and `suppressedCells` are on every response, so a sparse viewport says how much it withheld rather than silently thinning',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isLocationSensitive: true,
    owner: 'geo-intelligence',
    priority: 'medium',
    recommendedPhase: 'Closed 20 Oct 2026 — retain the entry as the record of what it required',
  },

  neighborhoodScores: {
    id: 'FRONTEND-MAPS-GAP-013',
    backendStatus: 'connected',
    key: 'neighborhoodScores',
    title: 'Neighbourhood score breakdown, trend and comparison',
    feature: '§23 Neighborhood Scores · §24 Score Details',
    frontendBehaviour:
      '',
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
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      '**Resolved.** `GET /geo/neighborhoods/{idOrSlug}/cost-of-living` publishes a `housing` category — index, typical monthly rent and currency — with `isAvailable: true`, a `baselineName` and full `freshness` (source "Diaspora listings", method, limitations, `sampleSize`, `validUntil`) wherever at least 5 homes are listed in the neighbourhood and 20 in the country (`GeographicIntelligence:MinimumRentListingsInArea` / `InCountry`). `GET /geo/capabilities` reports `cost-of-living` available, rent only. What follows is what actually remains.',
      'Food, transport, utilities, healthcare and leisure. Nothing on the platform measures them, so they stay unmeasured and `overallIndex` stays null: an overall figure from rent alone would be a rent index under a broader name.',
      'Enough listings. Production held 2 homes on 17 Sep 2026, so no neighbourhood reaches the minimum yet and every screen shows the not-available branch. The index appears on its own as homes are listed; nothing needs deploying.',
      'Asking rents, not agreed rents. A let price would need a completed-tenancy record the platform does not keep.',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isLocationSensitive: false,
    owner: 'geo-intelligence',
    priority: 'medium',
    recommendedPhase: 'B19 Geographic Intelligence',
  },

  safetyScoreProvenance: {
    id: 'FRONTEND-MAPS-GAP-015',
    backendStatus: 'partial',
    key: 'safetyScoreProvenance',
    title: 'Safety score provenance, methodology and trend',
    feature: '§26 Safety Score',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      '**Resolved as decided.** `GET /geo/neighborhoods/{idOrSlug}/safety` publishes `counts[]` — `kind`, `source`, `isAvailable`/`unavailableReason`, `from`/`to`, `area`, `method`, `licence`, `attribution`, `total`, `categories` — and `GET /geo/capabilities` reports `safety-counts` available. The user decided on 16 Sep 2026 that no 0–100 score is published, so `score`, `band`, `breakdown` and `trend` stay empty on purpose. What follows is what remains.',
      'Police data outside England, Wales and Northern Ireland. data.police.uk holds no street-level data for Scotland; Police Scotland publishes ward-level management information as spreadsheets with no stated licence, and Statistics Mauritius publishes national totals only, all rights reserved. Those places show the community count and an explicit “not published” entry, and stay that way until a source publishes figures Diaspora may republish.',
      'A trend. Both sources could publish the previous period for comparison; neither does yet, and a comparison built from two differently-timed reads would be worse than none.',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      '**Resolved.** `GET /location/map/boundaries?bounds=` answers the outlines a viewport overlaps, and every outline the platform serves — there and on `GET /location/areas/{id}` — carries `source`, `licence` (`ODbL-1.0`), `attribution`, `sourceReference` (the OSM relation) and `retrievedOn`. The platform refuses to store an outline without them. What follows is what actually remains.',
      'Neighbourhood outlines. No open dataset matches the catalogue’s neighbourhoods exactly: London’s wards are electoral lines, and Rose Hill Central or Quatre Bornes Center have no administrative boundary at all. Importing a near match would put a sourced-looking line in the wrong place, so the hub lends the containing town’s line (`containingOutline`) instead of inventing the neighbourhood’s.',
      'Outlines for places whose OSM name or level differs from the catalogue’s — Salford is a city in OSM and a neighbourhood here; Beau Bassin-Rose Hill is one municipality in OSM and two places here. Each needs a catalogue decision before an outline can be matched to it.',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'full',
    missingContract: [],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'full',
    missingContract: [],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'full',
    missingContract: [],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      'A geographic scope on the recommendation request — `latitude`, `longitude`, `radiusKm` or `bounds` — so B14 can rank within an area',
      'A `reason` string per recommendation, so the rail can say why something was surfaced instead of asserting relevance',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'partial',
    missingContract: [
      'An offline area-pack contract: a downloadable bundle of neighbourhood metadata, place nodes and recent listings for a bounded area',
      'A tile-pack contract, or a documented statement that offline tiles are out of scope — see MAP-PROVIDER-GAP-007',
      'A server-supplied `asOf` on cacheable responses, so staleness is the server’s statement rather than the client’s fetch timestamp',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
      '',
    coverage: 'none',
    missingContract: [
      'POST /analytics/events — batched, fire-and-forget, with a documented schema and a size limit',
      'A retention policy for geographic properties, and confirmation that `geoCell` at ~11 km is acceptable under it',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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
