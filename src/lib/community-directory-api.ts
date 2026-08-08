// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community-scoped content reads (Frontend Phase 13)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. It is the certified arm of Phase 13's
//    repository split; `community-gap-directory-api.ts` is the development arm.
//
// This is where "integrate the real backend contract" happens. The community
// *entity* has no certified contract — that is FRONTEND-PHASE13-GAP-001 — but
// community-scoped **discovery** does not need one to be genuinely useful,
// because the routes that serve content are all real and every publisher on them
// carries a real country of origin.
//
// ── What this file does, precisely ───────────────────────────────────────────
//
//   1. Calls the certified route with the parameters it **actually binds**. The
//      audit read each handler to establish what that is: `query`, `category`,
//      `cityName`, `latitude`, `longitude`, `radiusKm`, `distance` /
//      `distanceRadius`, `sortBy`, and each domain's own filters. Nothing is sent
//      that the route ignores.
//
//   2. Applies the community scope **client-side**, through the one projection
//      in `lib/community/scope.ts`, because — and this is the finding that
//      shapes the whole phase — *not one certified route accepts a country-of-
//      origin filter, let alone a community id*. `GET /jobs` binds nine
//      parameters and none of them is the employer's origin.
//
//   3. Reports what it did. Every response carries `scopeApplied`, `isApproximate`
//      and the counts before and after narrowing, so the list header can say
//      "showing 12 of 48 nearby results matched to your communities" rather than
//      quietly showing twelve.
//
// ── Why client-side narrowing is acceptable here, and where it is not ────────
//
// It is acceptable because it is what the application **already does**:
// `(tabs)/discover.tsx:316` and `(tabs)/search.tsx:69` have filtered on
// `owner.originCountry?.code` since long before this phase. Phase 13 does not
// introduce the technique; it moves it into one auditable place, names it a
// projection, and makes the UI admit it.
//
// It is *not* acceptable as a silent substitute for a server filter, and the
// register says so at GAP-009: client-side narrowing cannot find content the
// server did not return. A member scoped to one community, looking at a page the
// server chose for a radius, sees fewer results than exist. `resultTruncated`
// says when that is likely, and the list surfaces it.
//
// ── What is NOT in this file ─────────────────────────────────────────────────
//
// No community record is read here. No membership, no role, no capability, no
// statistic. Those have no certified route at all and live entirely in the
// development arm. Nothing here writes anything: every function is a read, and
// the file exports no mutation, which is why a community switch can never have a
// side effect on a certified resource.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import { matchesProjection, type ScopeProjection } from './community/scope';
import type { CommunityScope } from '@/types/community-directory';
import { communityScopeToken } from './community/scope';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced `community-directory`, which never collides with Phase 12's
// `community-gap`, Phase 12's `community-life`, or Phase 8's `maps`. A cache dump
// showing a `community-directory` entry is unambiguous about which phase owns it.
//
// **Every key carries the scope token.** That is §43, and it is the mechanism
// that makes §72's cache-collision requirement provable: two scopes are two
// tokens are two cache entries, and no amount of component-level mistake can
// make one serve the other.
// ─────────────────────────────────────────────────────────────────────────────

export const communityScopedKeys = {
  all: ['community-directory'] as const,

  content: (domain: CommunityContentDomain, scope: CommunityScope | null, filters: object) =>
    ['community-directory', 'content', domain, communityScopeToken(scope), filters] as const,

  search: (query: string, scope: CommunityScope | null, filters: object) =>
    [
      'community-directory',
      'search',
      query.toLowerCase().trim(),
      communityScopeToken(scope),
      filters,
    ] as const,
};

/**
 * The content domains a community scope applies to.
 *
 * §17–§24's list. `guide` and `update` are included even though they have no
 * dedicated certified list route today — they are served from the platform's
 * existing in-app guide and update data paths, and including them here means the
 * scoping vocabulary is complete rather than having two shapes.
 */
export type CommunityContentDomain =
  | 'provider'
  | 'job'
  | 'housing'
  | 'marketplace'
  | 'event'
  | 'organization'
  | 'guide'
  | 'update';

/** The certified route each domain reads. Recorded here so the matrix is derivable. */
export const DOMAIN_ROUTES: Record<CommunityContentDomain, string> = {
  provider: '/listings',
  job: '/jobs',
  housing: '/housing',
  marketplace: '/marketplace',
  event: '/community-life/events',
  organization: '/community-life/organizations',
  // No dedicated certified list route. Served from the platform's existing guide
  // and update data paths; the scope is applied identically.
  guide: '(in-app guide directory)',
  update: '(in-app community updates)',
};

/**
 * The parameters each certified route genuinely binds.
 *
 * Established by reading each handler rather than by assuming. Sending anything
 * else would be sending a parameter the server ignores, which is how a filter
 * comes to look like it works and does not.
 */
export interface CertifiedContentParams {
  query?: string;
  category?: string;
  cityName?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  sortBy?: string;
  /** `GET /jobs` binds this as `distance`; `GET /housing` as `distanceRadius`. */
  distanceKm?: number;
  /** Domain-specific extras, passed through untouched. */
  extra?: Record<string, unknown>;
}

/**
 * A community-scoped result set, with an honest account of how it was produced.
 *
 * `totalBeforeScope` and `isApproximate` are not diagnostics — they are rendered.
 * §14 says the frontend must not assume discovery is community-exclusive, and a
 * member who scoped to one community is entitled to know that 36 of the 48
 * nearby results were set aside by a country projection rather than by the
 * server.
 */
export interface CommunityScopedResult<T> {
  items: T[];
  /** How many the certified route returned, before the projection narrowed it. */
  totalBeforeScope: number;
  /** How many survived. Equal to `items.length`. */
  totalAfterScope: number;
  /** False when the scope was unscoped and nothing was narrowed. */
  scopeApplied: boolean;
  /** True whenever a country projection stood in for a community filter. */
  isApproximate: boolean;
  /**
   * True when the certified route may well hold matching content it did not
   * return — a narrow scope over a page the server chose for a radius. The list
   * offers "search a wider area" rather than claiming there is nothing.
   */
  resultTruncated: boolean;
  /** Communities in scope with no country to project onto, named to the member. */
  unexpressedCommunityNames: string[];
}

/** The platform's `{ data, meta }` envelope, and B12's `{ data, totalCount }`. */
interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  totalCount?: number;
}

async function readList<T>(
  path: string,
  params: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ items: T[]; totalCount: number }> {
  try {
    const response = await apiClient.get<Envelope<T[]>>(path, { params, signal });
    const items = response.data.data ?? [];
    return { items, totalCount: response.data.totalCount ?? items.length };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Builds the request parameters for a domain.
 *
 * The distance parameter is named differently by two routes — `distance` on
 * `/jobs`, `distanceRadius` on `/housing` — and both also accept `radiusKm`.
 * Sending all three would be sloppy rather than harmful, so each route gets the
 * one it binds.
 */
function buildParams(
  domain: CommunityContentDomain,
  params: CertifiedContentParams
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    query: params.query || undefined,
    category: params.category || undefined,
    cityName: params.cityName || undefined,
    latitude: params.latitude,
    longitude: params.longitude,
    radiusKm: params.radiusKm,
    sortBy: params.sortBy || undefined,
    ...(params.extra ?? {}),
  };

  if (typeof params.distanceKm === 'number') {
    if (domain === 'job') base.distance = params.distanceKm;
    else if (domain === 'housing') base.distanceRadius = params.distanceKm;
    else base.radiusKm = base.radiusKm ?? params.distanceKm;
  }

  return base;
}

/**
 * How to find the publisher's country of origin, per domain.
 *
 * The field names differ — `owner`, `employer`, `host`, `seller` — and each is a
 * real certified `CountryRef`. This map is the single place those four names are
 * written down, which is also the single place the GAP-009 migration touches when
 * a declared `communityIds` arrives on the response.
 */
function originCountryOf(domain: CommunityContentDomain, item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;

  const record = item as Record<string, unknown>;

  const publisherKey =
    domain === 'job'
      ? 'employer'
      : domain === 'housing'
        ? 'host'
        : domain === 'marketplace'
          ? 'seller'
          : 'owner';

  const publisher = record[publisherKey];
  if (publisher && typeof publisher === 'object') {
    const origin = (publisher as Record<string, unknown>).originCountry;
    if (origin && typeof origin === 'object') {
      const code = (origin as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
    }
  }

  // Guides carry `country` directly rather than through a publisher. Events and
  // organizations carry a location country, which is a weaker basis and is
  // treated as such by `resolveAssociation`.
  const direct = record.country;
  if (direct && typeof direct === 'object') {
    const code = (direct as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }

  const location = record.location;
  if (location && typeof location === 'object') {
    const code = (location as Record<string, unknown>).countryCode;
    if (typeof code === 'string') return code;
  }

  return null;
}

/**
 * Narrows a certified page to a community scope.
 *
 * Exported because the screens that already hold their content in memory — the
 * guide directory, the update feed — need the identical narrowing without a
 * request, and two implementations of "does this item belong to this scope?"
 * would be two answers.
 *
 * `resultTruncated` is heuristic and deliberately conservative: it is true when
 * the projection removed most of a full-looking page, which is precisely the
 * case where the server probably holds more. Claiming an empty result is final
 * when it is an artefact of client-side filtering would be the dishonest option.
 */
export function narrowToScope<T>(
  domain: CommunityContentDomain,
  items: readonly T[],
  projection: ScopeProjection,
  unexpressedNames: string[] = []
): CommunityScopedResult<T> {
  const totalBeforeScope = items.length;

  if (projection.isUnscoped) {
    return {
      items: [...items],
      totalBeforeScope,
      totalAfterScope: totalBeforeScope,
      scopeApplied: false,
      isApproximate: false,
      resultTruncated: false,
      unexpressedCommunityNames: [],
    };
  }

  if (projection.isEmpty) {
    return {
      items: [],
      totalBeforeScope,
      totalAfterScope: 0,
      scopeApplied: true,
      isApproximate: false,
      resultTruncated: false,
      unexpressedCommunityNames: unexpressedNames,
    };
  }

  const kept = items.filter((item) => matchesProjection(originCountryOf(domain, item), projection));

  return {
    items: kept,
    totalBeforeScope,
    totalAfterScope: kept.length,
    scopeApplied: true,
    isApproximate: projection.isApproximate,
    // Most of the page removed, and the page was not trivially small.
    resultTruncated: totalBeforeScope >= 10 && kept.length < totalBeforeScope / 2,
    unexpressedCommunityNames: unexpressedNames,
  };
}

/**
 * Reads a content domain, scoped to a community.
 *
 * The certified route is called with what it binds; the scope is applied after.
 * `guide` and `update` throw rather than silently returning nothing, because
 * there is no route to call — their callers pass in-memory collections to
 * `narrowToScope` directly, and a caller that reached here for a guide has a bug
 * worth finding.
 */
export async function fetchScopedContent<T>(
  domain: CommunityContentDomain,
  params: CertifiedContentParams,
  projection: ScopeProjection,
  options: { signal?: AbortSignal; unexpressedNames?: string[] } = {}
): Promise<CommunityScopedResult<T>> {
  const route = DOMAIN_ROUTES[domain];

  if (route.startsWith('(')) {
    throw new Error(
      `${domain} has no certified list route. Narrow its in-memory collection with narrowToScope() instead.`
    );
  }

  const { items, totalCount } = await readList<T>(route, buildParams(domain, params), options.signal);

  const narrowed = narrowToScope(domain, items, projection, options.unexpressedNames);

  // `totalCount` is the server's own count of what matched *its* filters, which
  // is a better "before" figure than the page length when the route paginates.
  return { ...narrowed, totalBeforeScope: Math.max(totalCount, narrowed.totalBeforeScope) };
}

/**
 * Community-scoped platform search.
 *
 * §38 forbids a second search engine, so this calls the **existing**
 * `GET /discovery/search` and narrows the result. The route binds `city` and
 * nothing community-shaped, which is GAP-010.
 */
export async function searchScoped(
  input: { query?: string; city?: string },
  projection: ScopeProjection,
  options: { signal?: AbortSignal; unexpressedNames?: string[] } = {}
): Promise<{
  listings: CommunityScopedResult<unknown>;
  guides: CommunityScopedResult<unknown>;
}> {
  try {
    const response = await apiClient.get<
      Envelope<{ listings?: unknown[]; guides?: unknown[] }>
    >('/discovery/search', {
      params: { query: input.query || undefined, city: input.city || undefined },
      signal: options.signal,
    });

    const payload = response.data.data ?? {};

    return {
      listings: narrowToScope('provider', payload.listings ?? [], projection, options.unexpressedNames),
      guides: narrowToScope('guide', payload.guides ?? [], projection, options.unexpressedNames),
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}
