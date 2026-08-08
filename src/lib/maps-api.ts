// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps API, certified arm (Frontend Phase 8)
//
// Every route in this file is **real**. Nothing here is simulated.
//
//   GET /housing                     proximity search, real
//   GET /marketplace                 proximity search, real
//   GET /jobs                        proximity search, real
//   GET /listings                    provider directory, real (no proximity —
//                                    FRONTEND-MAPS-GAP-003)
//   GET /community-life/events       proximity search, real
//   GET /community-life/organizations proximity search, real
//   GET /location/nearby             cross-domain aggregate, real
//   GET /location/search             place lookup, real
//   GET /location/reverse-geocode    reverse lookup, real
//   GET /neighborhood/{id}           overview with stats and counts, real
//
// The development arm is `maps-gap-api.ts`, deliberately separate and behind
// `/maps-gap/v0`. `hooks/maps.ts` is the stable interface above both, and a
// screen cannot tell which answered — except through the `isSimulated` flag it
// is required to render.
//
// ── The one translation this file performs, and why ──────────────────────────
//
// The map's question is a rectangle. Every route above answers questions about
// circles. So `boundsToCircle()` computes the smallest enclosing circle, the
// request goes out as `latitude`/`longitude`/`radiusKm`, and the results are
// filtered back down to the rectangle here.
//
// That overfetches — up to ~27% more area for a square viewport, more for a
// wide one — and the waste is real and measured in the performance report. It
// is the correct direction to be wrong in: a *smaller* circle would silently
// drop results the member is looking at empty space where. FRONTEND-MAPS-GAP-001
// asks for a `bounds` parameter, at which point this translation becomes two
// lines shorter and the overfetch disappears.
//
// ── Cancellation ─────────────────────────────────────────────────────────────
//
// Every search accepts an `AbortSignal` and passes it to axios. §13 requires
// query cancellation, and without it a fast pan leaves six in-flight requests
// racing to write the same state — with the *slowest* winning, which is how a
// map ends up showing the results for a viewport two gestures ago.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import type { CommunityOrganization, Event } from '@/types/community-life';
import type { Guide } from '@/types/guide';
import type { HousingListing } from '@/types/housing';
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
  const response = await apiClient.get<Envelope<HousingListing[]>>('/housing', {
    params: {
      ...geoParams(params),
      query: params.query || undefined,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      cityName: params.cityName,
      sortBy: params.sortBy === 'distance' ? 'distance' : undefined,
    },
    signal: options.signal,
  });

  return (response.data?.data ?? []).flatMap((listing) => {
    const marker = housingMarker(listing, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'housing' as const,
        detail: `${listing.bedrooms} bed · ${listing.furnished}`,
        imageUrl: listing.coverImage,
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
  const response = await apiClient.get<Envelope<MarketplaceListing[]>>('/marketplace', {
    params: {
      ...geoParams(params),
      query: params.query || undefined,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      cityName: params.cityName,
      verifiedSellerOnly: params.verifiedOnly ? 'true' : undefined,
    },
    signal: options.signal,
  });

  return (response.data?.data ?? []).flatMap((listing) => {
    const marker = marketplaceMarker(listing, origin);
    if (!marker) return [];
    return [
      {
        marker,
        category: 'marketplace' as const,
        detail: `${listing.condition} · ${listing.intent}`,
        imageUrl: listing.coverImage,
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
 * FRONTEND-MAPS-GAP-003: `/listings` accepts no geographic parameters, so the
 * whole page is fetched and filtered here. That is a real limitation and not a
 * stylistic choice — a provider outside the page the server chose to return
 * cannot be found by any amount of client filtering, which is exactly what the
 * gap entry says.
 */
async function searchProviders(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  const response = await apiClient.get<Envelope<ProviderListingLike[]>>('/listings', {
    params: { query: params.query || undefined, cityName: params.cityName },
    signal: options.signal,
  });

  return (response.data?.data ?? []).flatMap((listing) => {
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
  const response = await apiClient.get<Envelope<Event[]>>('/community-life/events', {
    params: {
      ...geoParams(params),
      query: params.query || undefined,
      cityName: params.cityName,
      from: params.from,
      to: params.to,
    },
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
  const response = await apiClient.get<Envelope<CommunityOrganization[]>>(
    '/community-life/organizations',
    {
      params: {
        ...geoParams(params),
        query: params.query || undefined,
        cityName: params.cityName,
      },
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
 * `/location/nearby` aggregate — the same records the Knowledge tab shows —
 * translated by `toCommunityAlert`. `alertMarker` drops anything expired or
 * withdrawn, so §29 holds without a screen having to remember.
 */
async function searchAlerts(
  params: MapSearchParams,
  origin: GeoCoordinate | null,
  options: RequestOptions
): Promise<MapSearchResult[]> {
  const geo = geoParams(params);
  if (typeof geo.latitude !== 'number') return [];

  const response = await apiClient.get<Envelope<{ updates?: CommunityUpdate[] }>>(
    '/location/nearby',
    {
      params: { latitude: geo.latitude, longitude: geo.longitude, radiusKm: geo.radiusKm },
      signal: options.signal,
    }
  );

  return (response.data?.data?.updates ?? []).flatMap((update) => {
    const alert = toCommunityAlert(update);
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
): Promise<{
  housing: HousingListing[];
  jobs: JobOpportunity[];
  marketplace: MarketplaceListing[];
  events: Event[];
  providers: ProviderListingLike[];
  updates: CommunityUpdate[];
}> {
  const safe = coordinateForRequest(center, 'search');

  const response = await apiClient.get<
    Envelope<{
      housing?: HousingListing[];
      jobs?: JobOpportunity[];
      marketplace?: MarketplaceListing[];
      events?: Event[];
      providers?: ProviderListingLike[];
      updates?: CommunityUpdate[];
    }>
  >('/location/nearby', {
    params: { latitude: safe.latitude, longitude: safe.longitude, radiusKm },
    signal: options.signal,
  });

  const data = response.data?.data ?? {};

  return {
    housing: data.housing ?? [],
    jobs: data.jobs ?? [],
    marketplace: data.marketplace ?? [],
    events: data.events ?? [],
    providers: data.providers ?? [],
    updates: data.updates ?? [],
  };
}

/** Active community alerts near a point, as `CommunityAlert`. */
export async function fetchAlertsNear(
  center: GeoCoordinate,
  radiusKm: number,
  options: RequestOptions = {}
): Promise<CommunityAlert[]> {
  const { updates } = await fetchNearby(center, radiusKm, options);
  return updates
    .map(toCommunityAlert)
    .filter((alert) => alert.status !== 'Expired' && alert.status !== 'Withdrawn');
}

/** One alert, read from the real community-update route. */
export async function fetchAlert(
  id: string,
  options: RequestOptions = {}
): Promise<CommunityAlert> {
  const response = await apiClient.get<Envelope<CommunityUpdate>>(`/updates/${id}`, {
    signal: options.signal,
  });
  return toCommunityAlert(response.data.data);
}

/** The certified neighbourhood overview: stats, counts and a centroid. */
export async function fetchNeighborhoodOverview(
  id: string,
  options: RequestOptions = {}
): Promise<NeighborhoodOverview> {
  const response = await apiClient.get<Envelope<NeighborhoodOverview>>(`/neighborhood/${id}`, {
    signal: options.signal,
  });
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
