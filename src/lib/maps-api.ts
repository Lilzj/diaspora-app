// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps API, certified arm (Frontend Phase 8)
//
// Every route in this file is **real**. Nothing here is simulated.
//
//   GET  /housing/search                 proximity + bounds, real
//   POST /marketplace/search             proximity + bounds, real (POST, with a body)
//   GET  /jobs                           proximity search, real
//   GET  /providers                      provider directory, proximity + bounds, real
//   GET  /community-life/events          proximity search, real
//   GET  /community-life/organizations   proximity search, real
//   GET  /location/nearby                cross-domain aggregate, real
//   GET  /location/search                place lookup, real
//   GET  /location/reverse-geocode       reverse lookup, real
//   GET  /housing/neighborhoods/{idOrSlug}  overview with stats and counts, real
//
// ── Remediation Wave A′ corrected four of those, and two gaps with them ──────
//
// This file used to address `GET /housing`, `GET /marketplace` with filters,
// `GET /listings` and `GET /neighborhood/{id}`. Three of the four have never
// been served by this platform, and the fourth — `/marketplace` — resolves to a
// *dashboard* that ignores every filter sent to it. So four of the six map
// layers drew nothing, or drew whatever the dashboard happened to feature.
//
// Two gap entries fell out with them, and neither was ever true:
//
//   **FRONTEND-MAPS-GAP-003** said the provider directory accepts no geographic
//   parameters. `GET /api/v1/providers` binds `latitude`, `longitude`,
//   `radiusKm` and `bounds`, and returns a per-item `location.distanceKm`. The
//   gap was recorded against `/listings`, so the parameters were never sent to
//   the route that reads them.
//
//   **FRONTEND-MAPS-GAP-001** asked for a `bounds` parameter. Housing,
//   marketplace and providers have all accepted one the whole time, in the same
//   `"north,south,east,west"` format, taking precedence over point-and-radius.
//
// ── The translation that remains, and why ────────────────────────────────────
//
// The map's question is a rectangle. Where a route accepts `bounds`, it is now
// asked in those terms — see `geoBounds()` — and the ~27% overfetch documented
// in the performance report disappears for that layer.
//
// `boundsToCircle()` stays for the layers whose contracts this wave has not yet
// read from source, and as the fallback when the map is showing a point rather
// than a box. It is the correct direction to be wrong in: a *smaller* circle
// would silently drop results the member is looking at empty space where.
//
// ── Cancellation ─────────────────────────────────────────────────────────────
//
// Every search accepts an `AbortSignal` and passes it to axios. §13 requires
// query cancellation, and without it a fast pan leaves six in-flight requests
// racing to write the same state — with the *slowest* winning, which is how a
// map ends up showing the results for a viewport two gestures ago.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toEventBrowseQuery, toOrganizationBrowseQuery } from './community-life-api';
import { toList } from './platform-envelope';
import type { CommunityOrganization, Event } from '@/types/community-life';
import type { Guide } from '@/types/guide';
import type { HousingListing } from '@/types/housing';
import { photoUriOf } from './media-url';
import type { JobOpportunity } from '@/types/job';
import type { MarketplaceListing } from '@/types/marketplace';
import type { CommunityUpdate } from '@/types/update';
import type { NeighborhoodOverview } from '@/mocks/handlers/location';
import {
  type CommunityAlert,
  type DiscoveryCategory,
  type GeoBoundingBox,
  type GeoCoordinate,
  type MapMarker,
  type MapSearchParams,
  type MapSearchResponse,
  type MapSearchResult,
} from '@/types/maps';
import { boundsCacheKey, boundsContain, boundsToCircle, circleToBounds, toKm } from './maps/geo';
import {
  alertMarker,
  eventMarker,
  guideMarker,
  housingMarker,
  jobMarker,
  marketplaceMarker,
  organizationMarker,
  providerMarker,
  toCommunityAlert,
  type ProviderListingLike,
} from './maps/markers';
import { coordinateForRequest } from './maps/privacy';
import { nearbyAlert, nearbyUnavailable, readNearby, type NearbyResult } from './maps/nearby';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced under `maps` so a cache dump is unambiguous about which entries
// came from this phase. Viewport keys use `boundsCacheKey`, which rounds to
// three decimals — that deduplicates a one-metre pan into a cache hit *and*
// keeps precise coordinates out of query keys, which end up in devtools, cache
// dumps and bug reports. §39 does not exempt any of those.
// ─────────────────────────────────────────────────────────────────────────────

export const mapKeys = {
  all: ['maps'] as const,

  search: (categories: DiscoveryCategory[], bounds: GeoBoundingBox, fingerprint: string) =>
    ['maps', 'search', [...categories].sort().join(','), boundsCacheKey(bounds), fingerprint] as const,

  nearby: (center: GeoCoordinate, radiusKm: number) =>
    [
      'maps',
      'nearby',
      // Rounded for the same reason as the bounds key.
      `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}`,
      radiusKm,
    ] as const,

  alerts: (bounds: GeoBoundingBox) => ['maps', 'alerts', boundsCacheKey(bounds)] as const,
  alert: (id: string) => ['maps', 'alert', id] as const,
  neighborhood: (id: string) => ['maps', 'neighborhood', id] as const,
  places: (query: string, countryCode?: string) =>
    ['maps', 'places', query.toLowerCase().trim(), countryCode ?? 'any'] as const,
  reverseGeocode: (coordinate: GeoCoordinate) =>
    [
      'maps',
      'reverse',
      `${coordinate.latitude.toFixed(3)},${coordinate.longitude.toFixed(3)}`,
    ] as const,

  // ── Wave C-06 · the geographic capabilities that have a real route ─────────
  //
  // These six were added with the `lib/maps/geo-client.ts` hooks. They follow
  // the rounding rule stated at the head of this block for the same reason:
  // a neighbourhood id is not a coordinate, but a key ends up in devtools, in a
  // cache dump and in a bug report, so nothing more precise than the request
  // needs goes into one.
  /**
   * A heat layer is keyed by its window as well as its viewport.
   *
   * Omitting `timeRange` would let a seven-day layer and a thirty-day one share
   * one cache entry, so switching the window would show the previous window's
   * data with the new window's label — a wrong map that looks like a working
   * one, which is the failure this whole remediation keeps meeting.
   */
  heatLayer: (layer: string, bounds: GeoBoundingBox, timeRange: string) =>
    ['maps', 'heat-layer', layer, boundsCacheKey(bounds), timeRange] as const,

  neighborhoodScore: (id: string) => ['maps', 'neighborhood-score', id] as const,

  // Sorted, so comparing A with B and B with A is one cache entry rather than
  // two — the server's answer does not depend on the order they were named in.
  neighborhoodComparison: (ids: string[]) =>
    ['maps', 'neighborhood-comparison', [...ids].sort().join(',')] as const,

  costOfLiving: (neighborhoodId: string) => ['maps', 'cost-of-living', neighborhoodId] as const,
  safetyScore: (neighborhoodId: string) => ['maps', 'safety-score', neighborhoodId] as const,

  /**
   * What this deployment can actually answer geographically.
   *
   * Keyed on nothing: it is a property of the deployment rather than of a
   * member or a viewport, so one entry is correct and refetching it per map pan
   * would be a request for an answer that has not moved.
   */
  geoCapabilities: () => ['maps', 'geo-capabilities'] as const,
};

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * The geographic parameters a certified route understands.
 *
 * `radiusKm` is padded by 5%: floating-point rounding at the rectangle's corner
 * would otherwise drop a result sitting exactly on the boundary, which shows up
 * as a pin flickering in and out as the member pans by a metre.
 */
function geoParams(params: MapSearchParams): {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
} {
  if (params.bounds) {
    const circle = boundsToCircle(params.bounds);
    const safe = coordinateForRequest(circle.center, 'search');
    return { latitude: safe.latitude, longitude: safe.longitude, radiusKm: circle.radiusKm * 1.05 };
  }

  if (params.center && typeof params.radiusKm === 'number') {
    const safe = coordinateForRequest(params.center, 'search');
    return { latitude: safe.latitude, longitude: safe.longitude, radiusKm: params.radiusKm };
  }

  return {};
}

/**
 * The viewport as the platform's own `bounds` parameter.
 *
 * **FRONTEND-MAPS-GAP-001 is closed, and — like GAP-003 — it was never open.**
 * The gap asked the backend for a `bounds` parameter so the map would stop
 * asking a rectangle-shaped question in circle-shaped terms. Housing search,
 * marketplace search and the provider directory have all accepted one the whole
 * time, in the same format on all three: `"north,south,east,west"`, and it takes
 * precedence over any point-and-radius sent alongside it.
 *
 * The client could not have discovered that from its own code: it was sending
 * the circle to `/housing` and `/listings`, neither of which exists, so no
 * parameter of any name was ever read.
 *
 * `boundsToCircle` stays for the domains whose routes this wave has not yet
 * verified, and as the fallback when the map is showing a point rather than a
 * box. Where `bounds` is sent, the ~27% overfetch it documented disappears.
 */
function geoBounds(params: MapSearchParams): { bounds?: string } {
  if (!params.bounds) return {};

  const { north, south, east, west } = params.bounds;
  if (![north, south, east, west].every((value) => Number.isFinite(value))) return {};

  return { bounds: `${north},${south},${east},${west}` };
}

/** The rectangle results are filtered back to. Null means "no spatial filter". */
function effectiveBounds(params: MapSearchParams): GeoBoundingBox | null {
  if (params.bounds) return params.bounds;
  if (params.center && typeof params.radiusKm === 'number') {
    return circleToBounds(params.center, params.radiusKm);
  }
  return null;
}

function withinBounds(marker: MapMarker, bounds: GeoBoundingBox | null): boolean {
  return bounds === null || boundsContain(bounds, marker.coordinate);
}

/**
 * Whether a result survives the active community scope.
 *
 * Frontend Phase 13, §28/§46, and FRONTEND-PHASE13-GAP-009. The scope reaches the
 * map already projected onto `communityOriginCountryCodes` — the publisher's
 * country of origin, which is the only community-shaped thing a certified route
 * carries. Three properties, each deliberate:
 *
 *   **An unscoped search passes everything.** No projection, no filter.
 *
 *   **A result with no discoverable origin does not pass a scoped search.** An
 *   absent origin is not evidence of belonging, and letting it through would make
 *   the filter mean "these communities, plus anything unlabelled".
 *
 *   **The entity, not the marker, is inspected.** The marker is a presentation
 *   object and carries no publisher. `MapSearchResult.entity` is the raw record
 *   the certified route returned, which is where `owner`, `employer`, `host` and
 *   `seller` live.
 */
function withinCommunityScope(result: MapSearchResult, params: MapSearchParams): boolean {
  const codes = params.communityOriginCountryCodes;
  if (!codes || codes.length === 0) return true;

  const entity = result.entity as Record<string, unknown> | undefined;
  if (!entity) return false;

  const wanted = codes.map((code) => code.toUpperCase());

  for (const key of ['owner', 'employer', 'host', 'seller'] as const) {
    const publisher = entity[key] as Record<string, unknown> | undefined;
    const origin = publisher?.originCountry as Record<string, unknown> | undefined;
    const code = origin?.code;
    if (typeof code === 'string') return wanted.includes(code.toUpperCase());
  }

  // Guides carry `country` directly; events, organizations and alerts carry only
  // a location, which is a weaker basis and is used only as a last resort.
  const direct = entity.country as Record<string, unknown> | undefined;
  if (typeof direct?.code === 'string') return wanted.includes(direct.code.toUpperCase());

  const location = entity.location as Record<string, unknown> | undefined;
  if (typeof location?.countryCode === 'string') {
    return wanted.includes(location.countryCode.toUpperCase());
  }

  return false;
}

// ═════════════════════════════════════════════════════════════════════════════
// PER-DOMAIN SEARCH
//
// One function per domain, each returning `MapSearchResult[]`. They are
// deliberately independent: §54 requires the map to degrade rather than fail,
// and `searchMap` below runs them with `Promise.allSettled` so one domain being
// down costs its own pins and nothing else.
// ═════════════════════════════════════════════════════════════════════════════

async function searchHousing(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  // Remediation Wave A′. `GET /housing` has never existed — the platform's
  // housing search is `GET /api/v1/housing/search`. Three parameter names were
  // wrong with it: the free-text field is `query`, the price bounds are
  // `minRent`/`maxRent` (this is rent, not a sale price), the city is `city`
  // rather than `cityName`, and the sort field is `sort`, not `sortBy`.
  const response = await apiClient.get<Envelope<unknown>>('/housing/search', {
    params: {
      ...geoParams(params),
      ...geoBounds(params),
      query: params.query || undefined,
      minRent: params.minPrice,
      maxRent: params.maxPrice,
      city: params.cityName,
      sort: params.sortBy === 'distance' ? 'Nearest' : undefined,
    },
    signal: options.signal,
  });

  // The route returns `{ items, nextCursor, hasMore, totalCount, … }`, not a
  // bare array. `toList` is the one place that knows which of the platform's
  // four list shapes came back.
  return toList<HousingListing>(response.data).flatMap((listing) => {
    const marker = housingMarker(listing, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'housing' as const,
        detail: `${listing.bedrooms} bed · ${listing.furnished}`,
        // A home's cover is a media reference; the image route serves it.
        imageUrl: photoUriOf(listing.coverImage),
        entity: listing,
      },
    ];
  });
}

async function searchMarketplace(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  // Remediation Wave A′. `GET /marketplace` resolves, but to
  // `GetMarketplaceDashboardQuery` — a home surface of `topCategories`,
  // `featured`, `recentlyAdded` and `nearby`. It is not a filtered list, so
  // every filter sent here was ignored and the map drew whatever the dashboard
  // happened to feature. Search is `POST /api/v1/marketplace/search` with a
  // body, which is also why this is the one map layer that is not a GET.
  const response = await apiClient.post<Envelope<unknown>>(
    '/marketplace/search',
    {
      ...geoParams(params),
      ...geoBounds(params),
      text: params.query || undefined,
      minimumPrice: params.minPrice,
      maximumPrice: params.maxPrice,
      city: params.cityName,
      verifiedSellersOnly: params.verifiedOnly === true,
      sort: params.sortBy === 'distance' ? 'Nearest' : undefined,
    },
    { signal: options.signal }
  );

  return toList<MarketplaceListing>(response.data).flatMap((listing) => {
    const marker = marketplaceMarker(listing, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'marketplace' as const,
        detail: `${listing.condition} · ${listing.intent}`,
        // Search rows carry the cover as `coverMediaId`; the image route serves it.
        imageUrl: photoUriOf(
          listing.coverImage || (listing as { coverMediaId?: string | null }).coverMediaId
        ),
        entity: listing,
      },
    ];
  });
}

async function searchJobs(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  const response = await apiClient.get<Envelope<JobOpportunity[]>>('/jobs', {
    params: {
      ...geoParams(params),
      query: params.query || undefined,
      cityName: params.cityName,
    },
    signal: options.signal,
  });

  return (response.data?.data ?? []).flatMap((job) => {
    const marker = jobMarker(job, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'job' as const,
        detail: [job.employer?.name, job.employmentType].filter(Boolean).join(' · '),
        imageUrl: job.employer?.avatarUrl ?? null,
        entity: job,
      },
    ];
  });
}

/**
 * Service providers.
 *
 * **FRONTEND-MAPS-GAP-003 is closed, and it was never true.** The gap recorded
 * that the provider directory "accepts no geographic parameters", so this
 * function fetched an unfiltered page and narrowed it on the device — meaning a
 * provider outside whatever page the server happened to return could not be
 * found at all.
 *
 * The directory has always accepted them. `GET /api/v1/providers` binds
 * `latitude`, `longitude`, `radiusKm` and `bounds`, forwards them to the shared
 * geographic scope resolver, and returns a per-item `location.distanceKm`. The
 * gap was recorded against `/listings` — a path this platform has never served —
 * so the parameters were never sent to the route that reads them.
 *
 * `sort: 'distance'` is passed through where the map asked for it, which is a
 * server-side ordering the client previously had to approximate.
 *
 * One consequence worth stating: unlike the other map layers, this route
 * requires the `providers.read` policy. An anonymous map draws no provider pins.
 */
async function searchProviders(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  const response = await apiClient.get<Envelope<unknown>>('/providers', {
    params: {
      ...geoParams(params),
      ...geoBounds(params),
      query: params.query || undefined,
      // `cityName` here, where marketplace and housing both say `city`. The
      // platform is not consistent about this and the client must not guess.
      cityName: params.cityName,
      verifiedOnly: params.verifiedOnly === true ? true : undefined,
      sort: params.sortBy === 'distance' ? 'distance' : undefined,
    },
    signal: options.signal,
  });

  return toList<ProviderListingLike>(response.data).flatMap((listing) => {
    const marker = providerMarker(listing, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'provider' as const,
        detail:
          typeof listing.category === 'string' ? listing.category : (listing.category?.name ?? ''),
        entity: listing,
      },
    ];
  });
}

async function searchEvents(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  // Remediation Wave J. This sent `query`, `cityName`, `from`, `to` and a
  // point-and-radius; the event route binds none of those five names, so the map
  // was drawing an unfiltered browse under whatever filters the member had set.
  //
  // The mapping is `toEventBrowseQuery`'s — shared with the browse screens so
  // there is one spelling of this route in the codebase. The map is also the one
  // caller entitled to send `bounds`: `MapSearchParams.bounds` is a rectangle the
  // member actually drew by panning, not one derived from a point.
  const response = await apiClient.get<Envelope<Event[]>>('/community-life/events', {
    params: toEventBrowseQuery({
      query: params.query,
      cityName: params.cityName,
      ...geoBounds(params),
      startsAfter: params.from,
      startsBefore: params.to,
    }),
    signal: options.signal,
  });

  return (response.data?.data ?? []).flatMap((event) => {
    const marker = eventMarker(event, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'event' as const,
        detail: [event.date, event.time].filter(Boolean).join(' · '),
        imageUrl: event.coverImage,
        entity: event,
      },
    ];
  });
}

async function searchOrganizations(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  // Remediation Wave J — same defect, same fix, same shared mapping as
  // `searchEvents` above.
  const response = await apiClient.get<Envelope<CommunityOrganization[]>>(
    '/community-life/organizations',
    {
      params: toOrganizationBrowseQuery({
        query: params.query,
        cityName: params.cityName,
        ...geoBounds(params),
      }),
      signal: options.signal,
    }
  );

  return (response.data?.data ?? []).flatMap((organization) => {
    const marker = organizationMarker(organization, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'organization' as const,
        detail: organization.category,
        imageUrl: organization.logo,
        entity: organization,
      },
    ];
  });
}

/**
 * Guides.
 *
 * FRONTEND-MAPS-GAP-004: no geographic query exists, and guides carry an
 * optional `location` whose scope level is not declared. Only guides with a
 * coordinate are placed, and `guideMarker` labels them as *covering* an area
 * rather than being *at* a point.
 */
async function searchGuides(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  const response = await apiClient.get<Envelope<Guide[]>>('/guides', {
    params: { query: params.query || undefined, countryCode: params.countryCode },
    signal: options.signal,
  });

  return (response.data?.data ?? []).flatMap((guide) => {
    const marker = guideMarker(guide, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'guide' as const,
        detail: guide.category,
        imageUrl: guide.coverImageUrl,
        entity: guide,
      },
    ];
  });
}

/**
 * Community alerts.
 *
 * §27: no second feed. These are B9 Community Updates read through the real
 * `/location/nearby` aggregate — the same records the Knowledge tab shows.
 *
 * **This layer drew nothing until 16 Sep 2026.** The read took `data.updates`;
 * the route answers a `groups` dictionary keyed by resource type, so the layer
 * resolved to `[]` on every pan, on every build, since it shipped. `readNearby`
 * is now the one place that knows the shape, and `nearbyAlert` maps the item
 * the aggregate carries — which is not a whole `CommunityUpdate`, and never was.
 *
 * `alertMarker` still drops anything expired or withdrawn, so §29 holds without
 * a screen having to remember.
 */
async function searchAlerts(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  const geo = geoParams(params);
  if (typeof geo.latitude !== 'number') return [];

  const response = await apiClient.get('/location/nearby', {
    params: { latitude: geo.latitude, longitude: geo.longitude, radiusKm: geo.radiusKm },
    signal: options.signal,
  });

  const nearby = readNearby(response.data);

  // Asked and unanswered. Raising puts this category in `allSettled`'s rejected
  // pile, where the map already knows to leave its count absent rather than
  // draw a confident nought.
  if (nearbyUnavailable(nearby, 'updates')) {
    throw new Error('The community updates near this point could not be read.');
  }

  return nearby.groups.updates.flatMap((item) => {
    const alert = nearbyAlert(item);
    if (!alert) return [];

    const marker = alertMarker(alert, origin);
    if (!marker) return [];

    return [
      {
        marker,
        category: 'alert' as const,
        detail: alert.areaName,
        entity: alert,
      },
    ];
  });
}

const SEARCHERS: Record<
  DiscoveryCategory,
  (
    params: MapSearchParams,
    origin: GeoCoordinate | null,
    options: RequestOptions
  ) => Promise<MapSearchResult[]>
> = {
  housing: searchHousing,
  marketplace: searchMarketplace,
  job: searchJobs,
  provider: searchProviders,
  event: searchEvents,
  organization: searchOrganizations,
  guide: searchGuides,
  alert: searchAlerts,
};

// ═════════════════════════════════════════════════════════════════════════════
// FEDERATED SEARCH
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Searches every requested category and merges the results.
 *
 * `allSettled`, not `all`. §54 requires the map to handle partial failure, and
 * with `all` a single 500 from the jobs route empties the entire map including
 * the housing pins that arrived perfectly well.
 *
 * The merge order is distance where an origin is known and category order
 * otherwise. That is a **client** ordering and is documented as one — there is
 * no federated relevance contract to defer to, which is the same limitation
 * Phase 12 recorded for community search. It is not a ranking and is not
 * presented as one.
 */
export async function searchMap(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions = {}
): Promise<MapSearchResponse> {
  const categories = params.categories.length > 0 ? params.categories : (['housing'] as const);
  const bounds = effectiveBounds(params);

  const settled = await Promise.allSettled(
    categories.map((category) => SEARCHERS[category](params, origin, options))
  );

  const results: MapSearchResult[] = [];
  const counts: Partial<Record<DiscoveryCategory, number>> = {};

  settled.forEach((outcome, index) => {
    const category = categories[index];
    if (outcome.status !== 'fulfilled') {
      // A failed category contributes nothing and is *not* recorded as zero —
      // "no housing here" and "we could not ask about housing" are different
      // facts, and `counts` leaving the key absent is what lets the filter chip
      // show a dash rather than a confident 0.
      return;
    }

    const inBounds = outcome.value.filter((result) => withinBounds(result.marker, bounds));
    // Frontend Phase 13 (§28, §46). The community scope is applied after the
    // bounds filter and before the count, so a filter chip shows the number the
    // member can actually see. Applied client-side because no certified route
    // accepts a community — FRONTEND-PHASE13-GAP-009 — and the map's result list
    // renders `<CommunityScopeNote>` to say so.
    const inScope = inBounds.filter((result) => withinCommunityScope(result, params));
    counts[category] = inScope.length;
    results.push(...inScope);
  });

  if (origin) {
    results.sort(
      (a, b) => (a.marker.distance?.metres ?? Infinity) - (b.marker.distance?.metres ?? Infinity)
    );
  }

  const limited = typeof params.limit === 'number' ? results.slice(0, params.limit) : results;

  return {
    results: limited,
    counts,
    totalCount: results.length,
    hasMore: limited.length < results.length,
    nextCursor: null,
    // Every category above is a certified route. The gap arm sets these.
    hasSimulatedResults: false,
    simulatedCategories: [],
    searchedBounds: bounds ?? undefined,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SINGLE-PURPOSE READS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The cross-domain nearby aggregate.
 *
 * The closest thing the platform has to a native map query, and the basis for
 * the nearby rail (§38) and the density estimate the heat-map adapter derives
 * from (FRONTEND-MAPS-GAP-012).
 */
export async function fetchNearby(
  center: GeoCoordinate,
  radiusKm: number,
  options: RequestOptions = {}
): Promise<NearbyResult> {
  const safe = coordinateForRequest(center, 'search');

  const response = await apiClient.get('/location/nearby', {
    params: { latitude: safe.latitude, longitude: safe.longitude, radiusKm },
    signal: options.signal,
  });

  // Every group used to be read from the top level of the envelope, typed as
  // the verticals' own objects — a cast, so it compiled and returned nothing.
  // `readNearby` reads `groups`, and the items are what they are: pins with a
  // title, a distance and their owner's payload.
  return readNearby(response.data);
}

/** Active community alerts near a point, as `CommunityAlert`. */
export async function fetchAlertsNear(
  center: GeoCoordinate,
  radiusKm: number,
  options: RequestOptions = {}
): Promise<CommunityAlert[]> {
  const nearby = await fetchNearby(center, radiusKm, options);

  if (nearbyUnavailable(nearby, 'updates')) {
    throw new Error('The community updates near this point could not be read.');
  }

  return nearby.groups.updates
    .map((item) => nearbyAlert(item))
    .filter((alert): alert is CommunityAlert => alert !== null)
    .filter((alert) => alert.status !== 'Expired' && alert.status !== 'Withdrawn');
}

/**
 * One alert.
 *
 * ── This was a 404 on every alert the member opened ────────────────────────
 *
 * The path was `/updates/{id}`, and the doc comment above it called that "the
 * real community-update route". **The platform maps no `/updates` route at
 * all**, and no endpoint anywhere mentions `CommunityUpdate` — confirmed
 * against the published OpenAPI contract *and* against backend source, since
 * an absent path in a document is weaker evidence than an absent route.
 *
 * Found by the Wave M-1 contract check, and worth recording why it survived so
 * long: `searchAlerts` immediately above reads **the same objects** out of
 * `/location/nearby`, which does exist. So the list of alerts worked and only
 * the detail failed — the surface looked healthy right up to the tap.
 *
 * A community update *is* a community post. Wave D-2 established that the
 * backend deliberately shaped `CommunityPostResponse` to the client's own
 * field names, to the point of serving the same value twice under two spellings
 * — `postId` and `updateId`, `body` and `description`. Every field
 * `toCommunityAlert` reads (`updateId`, `category`, `status`, `isExpired`,
 * `expiresAt`) is on that response, which is why the type below is honest
 * rather than a cast that happens to compile.
 */
export async function fetchAlert(
  id: string,
  options: RequestOptions = {}
): Promise<CommunityAlert> {
  const response = await apiClient.get<Envelope<CommunityUpdate>>(`/community/posts/${id}`, {
    signal: options.signal,
  });
  return toCommunityAlert(response.data.data);
}

/** The certified neighbourhood overview: stats, counts and a centroid. */
export async function fetchNeighborhoodOverview(
  id: string,
  options: RequestOptions = {}
): Promise<NeighborhoodOverview> {
  // Remediation Wave A′. `GET /neighborhood/{id}` has never existed. The
  // platform serves the profile at `GET /api/v1/housing/neighborhoods/{idOrSlug}`,
  // which accepts either a Location area id or a slug — so the slug derivation
  // below still works, and an area id now works too.
  //
  // The response keys its identifier as `areaId`, not `id`. That is the one
  // shape difference worth naming: every other module's read returns `id`, and
  // a caller that destructured `id` here would get undefined rather than an
  // error.
  const response = await apiClient.get<Envelope<NeighborhoodOverview>>(
    `/housing/neighborhoods/${encodeURIComponent(id)}`,
    { signal: options.signal }
  );
  return response.data.data;
}

/**
 * The neighbourhood id for a coordinate.
 *
 * Derived by slugifying the name the reverse-geocode route returns, which is
 * the same derivation `/neighborhood/{id}` expects. It is fragile — a rename
 * breaks the link and two cities with the same neighbourhood name collide — and
 * FRONTEND-MAPS-GAP-013 asks for a stable identifier for exactly this reason.
 */
export function neighborhoodIdFor(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

/** Straight-line kilometres, for surfaces that speak the platform's km. */
export { toKm };
