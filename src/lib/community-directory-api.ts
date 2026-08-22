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
//   1. Calls the certified route with the parameters it **actually binds**.
//
//      ⚠ **Remediation Wave I — this claim was false for four of the five remote
//      routes, and the search term was among the parameters being dropped.** The
//      sentence that stood here named one vocabulary — `query`, `category`,
//      `cityName`, `latitude`, `longitude`, `radiusKm`, `distance` /
//      `distanceRadius`, `sortBy` — and sent it to every route. `GET /jobs`,
//      `GET /community-life/events` and `GET /community-life/organizations` bind
//      `q` and `city` and no point-and-radius; `GET /housing/search` binds
//      `city` and `radiusKm` and never had a `distanceRadius`. Unbound query
//      parameters are discarded by the model binder without an error, so those
//      three sections answered a search with an unfiltered browse.
//
//      `buildParams` is now a per-domain switch with the binding source quoted
//      against each branch, which is the shape that makes the next divergence a
//      diff rather than an archaeology exercise.
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
import { toEventBrowseQuery, toOrganizationBrowseQuery } from './community-life-api';
import { toFinancialError } from './financial-errors';
import { readPage } from './platform-envelope';
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

/**
 * The certified route each domain reads. Recorded here so the matrix is derivable.
 *
 * **Remediation Wave A′ — three of these named routes that do not exist.**
 * `/listings` is not the provider directory (that is `/providers`), `/housing`
 * has no root list (search is `/housing/search`), and `/marketplace` is a
 * dashboard rather than a filtered list. Every community-scoped read of those
 * three domains failed, and because `fetchScopedContent` reports a scoped result
 * either way, the failure surfaced as "no results in your community" rather than
 * as an error.
 *
 * Marketplace is the odd one: its search is a POST with a body, so it is not
 * reachable through the shared `readList` below. It is listed here for the
 * matrix and handled separately.
 */
export const DOMAIN_ROUTES: Record<CommunityContentDomain, string> = {
  provider: '/providers',
  job: '/jobs',
  housing: '/housing/search',
  marketplace: '/marketplace/search',
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
  /**
   * A search radius in kilometres.
   *
   * **Remediation Wave I: this used to say "`GET /jobs` binds this as
   * `distance`; `GET /housing` as `distanceRadius`". Neither is true.** Housing
   * binds `radiusKm` and the jobs browse binds no radius at all — it scopes by
   * `bounds` or by an area id. `buildParams` now sends it only where there is
   * something to send it to.
   */
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
  /**
   * True when the domain carries **no origin signal at all**, so no narrowing
   * was attempted and every row the route returned is present.
   *
   * Wave J. `scopeApplied` is false in this case, but false for a different
   * reason from the unscoped case — "you asked for everything" and "you asked
   * for one community and Diaspora cannot tell which of these belong to it" are
   * different sentences, and a member is owed the second one rather than a list
   * that quietly ignores their filter.
   */
  scopeUnavailable: boolean;
  /**
   * True whenever the narrowing ran over a **single server page** of a
   * cursor-paginated route.
   *
   * The brief names this: client-side narrowing over a server page means a page
   * of 20 can render 3, and there is no way to ask for "the next 20 matches"
   * because the cursor advances the *server's* page, not the projection's. Every
   * route this file reads is cursor-paginated —
   * `ProviderSearchRequest.cs:99`, `JobBrowseParameters.cs:63`,
   * `SearchHousingRequest.cs:161`, `SearchListingsRequest.cs:113`,
   * `CommunityLifeDiscoveryEndpoints.cs:176`, `OrganizationEndpoints.cs:346` —
   * and `fetchScopedContent` takes exactly one page and does not follow the
   * cursor.
   *
   * It **cannot** be fixed from the client: following cursors until enough
   * matches accumulate would mean an unbounded number of requests to satisfy one
   * screenful, with the worst case being every page on the platform when a
   * community has no content. So it is surfaced instead of silently absorbed —
   * that is the whole of this field's purpose.
   */
  pageLimited: boolean;
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
    // Remediation Wave A′ / B. `/marketplace/search` is a POST with a body;
    // every other domain here is a GET with a query string. The platform is not
    // symmetric about this and the client must not pretend otherwise.
    const response =
      path === '/marketplace/search'
        ? await apiClient.post<unknown>(path, toMarketplaceSearchBody(params), { signal })
        : await apiClient.get<unknown>(path, { params, signal });

    // These routes return four different list shapes between them — a bare
    // array, two hand-rolled cursor pages with different total field names, and
    // an offset page. `readPage` is the single place that knows.
    const page = readPage<T>(response.data);
    return { items: page.items, totalCount: page.totalCount ?? page.items.length };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Translates the shared query-parameter bag into `SearchListingsRequest`.
 *
 * Only the parameters the route actually binds, and under the names it binds
 * them: `text` rather than `query`, `minimumPrice`/`maximumPrice` rather than
 * `minPrice`/`maxPrice`. Anything else would be silently dropped by the
 * serializer, which is how the RSVP defect stayed hidden for as long as it did.
 */
function toMarketplaceSearchBody(params: Record<string, unknown>): Record<string, unknown> {
  return {
    text: params.query ?? undefined,
    city: params.cityName ?? params.city ?? undefined,
    countryCode: params.countryCode ?? undefined,
    latitude: params.latitude ?? undefined,
    longitude: params.longitude ?? undefined,
    radiusKm: params.radiusKm ?? params.distanceRadius ?? undefined,
    minimumPrice: params.minPrice ?? undefined,
    maximumPrice: params.maxPrice ?? undefined,
    limit: params.limit ?? undefined,
  };
}

/**
 * Builds the request parameters for a domain.
 *
 * ── Remediation Wave I: four of the five remote routes were being sent names
 *    they do not bind, and the search term was one of them ────────────────────
 *
 * This function used to send one bag of parameters to every route: `query`,
 * `category`, `cityName`, `latitude`, `longitude`, `radiusKm`, `sortBy`, plus a
 * per-domain distance alias. Verified against the backend's own binding
 * attributes, here is what each route actually reads:
 *
 *   `GET /jobs`          `JobBrowseParameters` (Jobs/Api/JobBrowseParameters.cs:18)
 *                        `q`, `country`, `city`, `bounds`, `area`, `category`,
 *                        `tag`, `workplace`, `type`, `experience`, `sponsored`,
 *                        `verified`, `sort`, `cursor`, `limit`.
 *                        **No `query`, no `cityName`, no point-and-radius.**
 *
 *   `GET /housing/search` `SearchHousingRequest` (Housing/Contracts/V1/Requests/
 *                        SearchHousingRequest.cs:26) — `query`, `countryCode`,
 *                        `city`, `latitude`, `longitude`, `radiusKm`, `bounds`,
 *                        and a long tail of housing-specific filters.
 *                        **No `cityName`, no `distanceRadius`, no `category`.**
 *
 *   `GET /community-life/events` `EventSearchParameters`
 *                        (CommunityLife/Api/CommunityLifeDiscoveryEndpoints.cs:113)
 *                        `q`, `category` (repeated), `facet`, `organizationId`,
 *                        `countryCode`, `city`, `neighborhoodAreaId`, `bounds`,
 *                        … `sort`, `cursor`, `limit`.
 *                        **No `query`, no `cityName`, no point-and-radius.**
 *
 *   `GET /community-life/organizations` `OrganizationSearchParameters`
 *                        (CommunityLife/Api/OrganizationEndpoints.cs:310)
 *                        `q`, `type` (repeated), `countryCode`, `city`,
 *                        `neighborhoodAreaId`, `bounds`, `verified`, `featured`,
 *                        `acceptingMembers`, `language`, `sort`, `cursor`,
 *                        `limit`. **No `category` — that was found and fixed
 *                        once already in `community-life-api.ts`, and this file
 *                        was still sending it.**
 *
 *   `GET /providers`     `ProviderSearchRequest` (Providers/Contracts/V1/
 *                        Requests/ProviderSearchRequest.cs:20) — `query`,
 *                        `category`, `cityName`, `countryCode`, `latitude`,
 *                        `longitude`, `radiusKm`, `sort`, … This is the one
 *                        domain whose spellings were already right, except
 *                        `sortBy`.
 *
 * A query parameter the minimal-API model binder does not recognise is
 * **discarded in silence**. So jobs, events and organisations were answering the
 * search tab with an unfiltered browse of everything — the member typed a word,
 * the list did not change, and no error was raised anywhere. That is the same
 * failure shape as the organisation `category`/`type` defect and the provider
 * `categoryId`/`category` defect: a filter that looks like it works.
 *
 * ── Why the proximity triple is dropped rather than renamed for three routes ──
 *
 * `/jobs`, `/community-life/events` and `/community-life/organizations` scope
 * geography by `bounds` (a `north,south,east,west` viewport) or by an area id.
 * Neither can be derived from a point and a radius without this client inventing
 * a rectangle, and a rectangle nobody chose would narrow the results by a
 * boundary the member never drew. Sending nothing is the honest option: the
 * result is wider than asked for rather than wrong, and `cityName` — which does
 * have a target on all three — still narrows it.
 */
function buildParams(
  domain: CommunityContentDomain,
  params: CertifiedContentParams
): Record<string, unknown> {
  const extra = params.extra ?? {};

  switch (domain) {
    // ── Remediation Wave J ────────────────────────────────────────────────
    //
    // The two Community Life domains no longer keep their spellings here. They
    // delegate to `toEventBrowseQuery` / `toOrganizationBrowseQuery` in
    // `community-life-api.ts`, which is the module that owns those two routes
    // and the module Wave J corrected. Two copies of a parameter mapping are two
    // things to keep right, and Wave I's own header says the *point* of a
    // per-domain switch is that the next divergence is a diff — which stops
    // being true the moment the same route is spelled out in two files.
    //
    // Sorts are not forwarded: `CertifiedContentParams.sortBy` is a free string
    // and the two routes parse `sort` as a PascalCase enum, so a value from here
    // would fall back to the default rather than being honoured. A caller that
    // wants an ordering asks the typed client for one.
    case 'event':
      return { ...toEventBrowseQuery({ query: params.query, cityName: params.cityName }), ...extra };

    case 'organization':
      // `category` is deliberately not forwarded: the organisation route binds
      // `type` from a fourteen-key vocabulary that is not the service taxonomy
      // this bag carries, so a value here has nothing to map onto.
      return {
        ...toOrganizationBrowseQuery({ query: params.query, cityName: params.cityName }),
        ...extra,
      };

    // The shareable jobs browse happens to use the same `q`/`city`/`sort`
    // spelling, but it is a different module's route and keeps its own branch.
    case 'job':
      return {
        q: params.query || undefined,
        city: params.cityName || undefined,
        sort: params.sortBy || undefined,
        category: params.category || undefined,
        ...extra,
      };

    case 'housing':
      return {
        query: params.query || undefined,
        city: params.cityName || undefined,
        latitude: params.latitude,
        longitude: params.longitude,
        // One radius name, not two. `distanceRadius` was never bound by this
        // route; `radiusKm` always was.
        radiusKm: params.radiusKm ?? params.distanceKm,
        sort: params.sortBy || undefined,
        // No `category` on the housing search at all — its taxonomy is split
        // into `accommodationTypes` and `amenities`, and neither is a category
        // list.
        ...extra,
      };

    // `POST /marketplace/search` never sees these names: `readList` hands this
    // bag to `toMarketplaceSearchBody`, which is the translation to
    // `SearchListingsRequest` (`text`, `city`, `minimumPrice`, …). The keys here
    // are the ones that function reads.
    case 'marketplace':
      return {
        query: params.query || undefined,
        cityName: params.cityName || undefined,
        latitude: params.latitude,
        longitude: params.longitude,
        radiusKm: params.radiusKm ?? params.distanceKm,
        ...extra,
      };

    // `GET /providers` — the one route whose spellings this file already had
    // right, apart from the sort.
    case 'provider':
      return {
        query: params.query || undefined,
        category: params.category || undefined,
        cityName: params.cityName || undefined,
        latitude: params.latitude,
        longitude: params.longitude,
        radiusKm: params.radiusKm ?? params.distanceKm,
        sort: params.sortBy || undefined,
        ...extra,
      };

    // `guide` and `update` have no route in `DOMAIN_ROUTES`; `fetchScopedContent`
    // throws before reaching here. The branch exists so the switch is exhaustive
    // rather than falling through to a bag of guesses.
    case 'guide':
    case 'update':
    default:
      return { ...extra };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// WHERE THE SCOPE COMES FROM, PER DOMAIN — Remediation Wave J
//
// Wave J's brief asked: "where product requirements require true community
// scoping, implement server-side filtering". The audit that question demanded
// was run against the backend source, route by route, and the answer is the same
// for every domain on this platform:
//
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ NO ROUTE BINDS A COMMUNITY FILTER, AND NO ROUTE BINDS AN ORIGIN-COUNTRY │
//   │ FILTER. EVERY `countryCode` / `country` PARAMETER IN THE PLATFORM       │
//   │ FILTERS ON `<entity>.Location.CountryCode` — WHERE THE THING IS, NOT    │
//   │ WHERE ITS PUBLISHER CAME FROM.                                          │
//   └─────────────────────────────────────────────────────────────────────────┘
//
//   provider     `ProviderSearchRequest.cs:66` `countryCode`
//                → `ProviderRepository.cs:487` `provider.Location.CountryCode == country`
//   job          `JobBrowseParameters.cs:23` `[FromQuery(Name = "country")]`
//                → `JobPostingRepository.cs:271` `posting.Location.CountryCode == country`
//   housing      `SearchHousingRequest.cs:33` `countryCode`
//                → `HousingListingRepository.cs:683` `listing.Location.CountryCode == country`
//   marketplace  `SearchListingsRequest.cs:48` `CountryCode` (body)
//                → `MarketplaceListingRepository.cs:527` `listing.Location.CountryCode == country`
//   event        `CommunityLifeDiscoveryEndpoints.cs:127` `countryCode`
//                → `CommunityEventRepository.cs:619` `communityEvent.Location.CountryCode == country`
//   organization `OrganizationEndpoints.cs:318` `countryCode`
//                → `OrganizationRepository.cs:291` `organization.Location.CountryCode == country`
//   guide        `SearchGuidesRequest.cs:24` `country`
//                → `GuideRepository.cs:335` `guide.Location.CountryCode == country`
//   update       `Community/Api/FeedEndpoints.cs:35` `countryCode`
//                → `CommunityPostRepository.cs:261` `post.Location.CountryCode == …`
//
// **This is why nothing in this file moved to server-side filtering and why no
// `isApproximate` became false.** A location filter is not a community filter
// and substituting one for the other would be worse than the client-side
// projection, not better: a Nigerian-community event held in London has
// `Location.CountryCode = 'GB'`, so `countryCode=NG` would *hide the very
// content the member asked for* while looking like a precise server-side scope.
// That is the single most dangerous move available in this wave, and it is the
// one the brief's "do not silently claim equivalence" rule exists to forbid.
//
// Two near-misses worth recording so nobody re-derives them as capabilities:
//
//   `GET /providers` binds `originCountryCode` (`ProviderSearchRequest.cs:88`)
//   and its own docstring calls it "the client's Lister's Origin Country
//   filter". **It filters nothing.** `SearchProvidersQueryHandler.BuildFilterAsync`
//   (`:129-148`) never copies it into `ProviderQueryFilter`; its only use is
//   `:204` `ViewerCountryCode = request.OriginCountryCode`, which feeds an
//   in-memory ranking context, only for the `Recommended` and `Distance` sorts
//   (`:185`), and `BalancedRanking.cs:167-177` then compares it against
//   `provider.Location.CountryCode` — the provider's *location* again. It is a
//   named, documented, silently-dropped parameter: the exact trap this wave was
//   warned about, sitting in the one place a reader would trust.
//
//   `GET /communities/announcements` binds `scope`/`scopeId`
//   (`PollAndAnnouncementEndpoints.cs:132-134`), which is the closest thing on
//   the platform to a community parameter and is not one:
//   `CommunityProgrammeEnums.cs:222-238` documents `Community = 0` as
//   "everybody in a country", and `scopeId` names an organization, area, event
//   or campaign. There is no diaspora-community identifier in the backend
//   domain at all.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the client-side narrowing can key on, per domain — and, separately,
 * whether the certified response actually carries it.
 *
 * Two fields rather than one, because the two answers differ and the difference
 * is the whole of Wave J's Part 2 finding:
 *
 *   `publisherKey`  the row property this client reads an origin country from,
 *                   or null where the response has no publisher object at all.
 *   `carriedOnCertifiedResponse`
 *                   whether that field is ever populated by the real backend.
 *                   **It is `false` for every domain**, with the evidence
 *                   beside it.
 *
 * The header block above establishes that no route *filters* on origin. This map
 * establishes the further fact that no route *returns* it either — so the
 * client-side projection has, against the real server, nothing to read. In
 * development it reads fixtures that do carry `originCountry`
 * (`mocks/data.ts:29`, `mocks/jobs-data.ts`, `mocks/housing-data.ts`,
 * `mocks/marketplace-data.ts`), which is why community scoping has always
 * appeared to work here and would have returned an empty list in production.
 *
 * This map is therefore not a switch that disables anything. It is the record
 * that makes `narrowToScope`'s runtime check legible, and it is the single place
 * the GAP-009 migration edits when a publisher origin — or, better, a declared
 * `communityIds` — arrives on the response.
 */
export const DOMAIN_SCOPE_BASIS: Record<
  CommunityContentDomain,
  {
    publisherKey: string | null;
    carriedOnCertifiedResponse: boolean;
    evidence: string;
  }
> = {
  provider: {
    publisherKey: 'owner',
    carriedOnCertifiedResponse: false,
    evidence:
      '`ProviderOwnerResponse.OriginCountryCode` is declared (`Providers/Contracts/V1/Responses/ProviderOwnerResponse.cs:26`) and its doc comment says "the client\'s origin-country filter reads this" — but `ProviderMapper.ToOwner` (`Application/Mapping/ProviderMapper.cs:434-444`) assigns `OriginCountryCode = null` unconditionally, and it is the sole producer (called at `:66` and `:105`). The shapes disagree too: the client reads `owner.originCountry.code`, the contract declares a flat `originCountryCode`.',
  },
  job: {
    publisherKey: 'employer',
    carriedOnCertifiedResponse: false,
    evidence:
      '`JobCardResponse` (`Jobs/Contracts/V1/Responses/JobCardResponse.cs:17`) has **no employer object**: the employer is flattened to `EmployerId` `:27`, `EmployerName` `:29`, `EmployerLogoMediaId` `:31`, `IsEmployerVerified` `:33`. The detail response carries `JobEmployerSummaryResponse.CountryCode` `:31`, fed from `employer.PrimaryCountryCode` (`EmployerMapper.cs:98`) — the operating country, not an origin.',
  },
  housing: {
    publisherKey: 'host',
    carriedOnCertifiedResponse: false,
    evidence:
      '`HousingListingCardResponse.Landlord` (`:45`) is a `LandlordSummaryResponse`, whose entire declaration (`LandlordSummaryResponse.cs:4-24`) contains no country field. There is no `host` property under any name.',
  },
  marketplace: {
    publisherKey: 'seller',
    carriedOnCertifiedResponse: false,
    evidence:
      '`ListingCardResponse.Seller` (`:42`) is a `SellerSummaryResponse`, whose entire declaration (`SellerSummaryResponse.cs:12-50`) contains no country field.',
  },
  event: {
    publisherKey: null,
    carriedOnCertifiedResponse: false,
    evidence:
      '`EventSummaryResponse` (`CommunityLife/Contracts/V1/Responses/EventSummaryResponse.cs:4`) has no organiser object — only `OrganizationId` `:16` and `OrganizationName` `:18`. Its `Location.CountryCode` (`LocationResponse.cs:12`) is the venue. The client type agrees: `EventHost` is id/name/avatar/type/isVerified.',
  },
  organization: {
    publisherKey: null,
    carriedOnCertifiedResponse: false,
    evidence:
      '`OrganizationSummaryResponse.cs:4` — the organisation *is* the publisher and has no origin property. `Location.CountryCode` `:18` is where the body is based.',
  },
  guide: {
    publisherKey: null,
    carriedOnCertifiedResponse: false,
    evidence:
      "A guide's country is the jurisdiction it is *about* — `Guides/Domain/…/GuideLocationContext.cs:36`, \"every guide has a jurisdiction\". A guide to renting in the UK is not UK-community content.",
  },
  update: {
    publisherKey: null,
    carriedOnCertifiedResponse: false,
    evidence: 'Community posts carry `post.Location.CountryCode` only (`CommunityPostRepository.cs:261`).',
  },
};

/**
 * The publisher's country of origin, or null when the domain has none.
 *
 * **Remediation Wave J removed the `country` and `location.countryCode`
 * fallbacks.** They made every domain look scopeable by silently substituting a
 * location for an origin — see `DOMAIN_SCOPE_BASIS` above. A domain with no
 * origin signal now returns null for every row, and `narrowToScope` refuses to
 * narrow it rather than narrowing it wrongly.
 *
 * Two response shapes, because the platform genuinely has two: providers carry a
 * flat `owner.originCountryCode` string (`lib/providers-api.ts:112`) and the
 * other three carry a nested `originCountry: CountryRef`. Reading only the
 * nested shape — which is what this function did before Wave J — meant the
 * provider directory matched nothing under any scope and rendered as "no
 * providers in your community".
 */
function originCountryOf(domain: CommunityContentDomain, item: unknown): string | null {
  const { publisherKey } = DOMAIN_SCOPE_BASIS[domain];
  if (!publisherKey) return null;
  if (!item || typeof item !== 'object') return null;

  const publisher = (item as Record<string, unknown>)[publisherKey];
  if (!publisher || typeof publisher !== 'object') return null;

  const record = publisher as Record<string, unknown>;

  // Flat: `owner.originCountryCode`.
  if (typeof record.originCountryCode === 'string') return record.originCountryCode;

  // Nested: `employer.originCountry.code`.
  const origin = record.originCountry;
  if (origin && typeof origin === 'object') {
    const code = (origin as Record<string, unknown>).code;
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
  unexpressedNames: string[] = [],
  options: { pageLimited?: boolean } = {}
): CommunityScopedResult<T> {
  const totalBeforeScope = items.length;
  const pageLimited = options.pageLimited ?? false;

  if (projection.isUnscoped) {
    return {
      items: [...items],
      totalBeforeScope,
      totalAfterScope: totalBeforeScope,
      scopeApplied: false,
      isApproximate: false,
      resultTruncated: false,
      unexpressedCommunityNames: [],
      scopeUnavailable: false,
      // Nothing was narrowed, so a short page is just a short page.
      pageLimited: false,
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
      scopeUnavailable: false,
      pageLimited: false,
    };
  }

  // ── Wave J: refuse to narrow a page that carries nothing to narrow on ──────
  //
  // Checked against the page rather than against a constant, and this is the
  // load-bearing decision of Part 2.
  //
  // Not one certified list response carries a publisher's country of origin —
  // `DOMAIN_SCOPE_BASIS` records the evidence per domain, down to
  // `ProviderMapper.cs:434-444` assigning the one declared origin field a
  // literal `null`. The development fixtures **do** carry it, which is why this
  // projection has looked like a working community filter for four waves and
  // would have removed *every* row in production.
  //
  // Two ways to be wrong here, and this avoids both:
  //
  //   Filtering anyway would return an empty list under every scope, and the
  //   member would read it as "my community has nothing", which is a claim about
  //   their community rather than about the platform.
  //
  //   Falling back to the row's location country — which is what
  //   `originCountryOf` used to do — answers "which community is this for?" with
  //   "which country is it in?". Those diverge for precisely the content this
  //   platform exists to carry: a Ghanaian association meeting in Peckham is
  //   Ghanaian-community content at a GB location, and neither `GH` nor `GB`
  //   selects it correctly.
  //
  // So: return the page whole, narrow nothing, and set `scopeUnavailable` so the
  // list says the filter was not applied. When a publisher origin (or, better, a
  // declared `communityIds`) arrives on the response, this branch stops being
  // taken on its own — no flag to flip, no line to remember.
  const withOrigin = items.filter((item) => originCountryOf(domain, item) !== null);

  if (withOrigin.length === 0) {
    return {
      items: [...items],
      totalBeforeScope,
      totalAfterScope: totalBeforeScope,
      scopeApplied: false,
      // Not approximate — nothing was approximated, because nothing was applied.
      // This is the one place `isApproximate` goes false on a *scoped* request,
      // and it does so by becoming a stronger admission rather than a weaker one.
      isApproximate: false,
      resultTruncated: false,
      unexpressedCommunityNames: unexpressedNames,
      scopeUnavailable: true,
      pageLimited: false,
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
    scopeUnavailable: false,
    // True whenever a server page was narrowed here. `pageLimited` is about the
    // *mechanism* and stays true even when nothing was removed: the member is
    // looking at matches drawn from one page, and the next page is not reachable
    // by asking for more matches.
    pageLimited,
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

  // `pageLimited: true`, unconditionally, because every route reachable from
  // here is cursor-paginated and this function reads exactly one page. It does
  // not follow the cursor and must not start: chasing pages until the projection
  // has enough matches is unbounded, and the pathological case — a community
  // with no content — walks the whole platform to render an empty list.
  const narrowed = narrowToScope(domain, items, projection, options.unexpressedNames, {
    pageLimited: true,
  });

  // `totalCount` is the server's own count of what matched *its* filters, which
  // is a better "before" figure than the page length when the route paginates.
  return { ...narrowed, totalBeforeScope: Math.max(totalCount, narrowed.totalBeforeScope) };
}

/**
 * Community-scoped platform search.
 *
 * §38 forbids a second search engine, and this used to satisfy that by calling
 * `GET /discovery/search`. **Remediation Wave A′: that route does not exist and
 * never has.** The platform has six domain searches and no aggregator — which
 * is recorded as MC-03, genuinely missing from *both* repositories, and is not
 * something this client may invent.
 *
 * So the two halves are fetched from the two routes that do exist and merged
 * here. That is a client-side fan-out rather than a search engine: no relevance
 * is computed, nothing is re-ranked, and each half keeps its own server
 * ordering. When a real aggregator ships this collapses back to one call.
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
    // `allSettled`: one domain being unavailable costs its own half and not the
    // other. The provider directory in particular requires `providers.read`, so
    // a signed-out caller gets guides and no listings rather than nothing.
    const [listingsOutcome, guidesOutcome] = await Promise.allSettled([
      apiClient.post<unknown>(
        '/marketplace/search',
        { text: input.query || undefined, city: input.city || undefined },
        { signal: options.signal }
      ),
      apiClient.get<unknown>('/guides', {
        params: { query: input.query || undefined },
        signal: options.signal,
      }),
    ]);

    const payload = {
      listings:
        listingsOutcome.status === 'fulfilled'
          ? readPage<unknown>(listingsOutcome.value.data).items
          : [],
      guides:
        guidesOutcome.status === 'fulfilled'
          ? readPage<unknown>(guidesOutcome.value.data).items
          : [],
    };

    // Both halves are one server page of a cursor-paginated route, same as
    // `fetchScopedContent`. The guides half additionally has no origin signal at
    // all and comes back `scopeUnavailable` — a guide's country is the
    // jurisdiction it is *about*, not a community it belongs to.
    return {
      listings: narrowToScope('provider', payload.listings ?? [], projection, options.unexpressedNames, {
        pageLimited: true,
      }),
      guides: narrowToScope('guide', payload.guides ?? [], projection, options.unexpressedNames, {
        pageLimited: true,
      }),
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}
