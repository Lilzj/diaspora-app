// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Service provider directory (certified)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL, read from
//    `src/Diaspora.Modules.Providers/Api/ProviderEndpoints.cs` and
//    `ProviderReviewEndpoints.cs` in the backend repository rather than inferred
//    from a name.
//
//      GET  /providers                        SearchProvidersQuery
//      GET  /providers/featured               SearchProvidersQuery (FeaturedOnly)
//      GET  /providers/capabilities           GetProviderCapabilitiesQuery
//      GET  /providers/categories             ListServiceCategoriesQuery
//      GET  /providers/{providerId:guid}      GetProviderQuery
//      GET  /providers/slug/{slug}            GetProviderQuery
//      GET  /providers/{providerId:guid}/reviews   ListProviderReviewsQuery
//      GET  /providers/me                     ListMyProvidersQuery
//      GET  /providers/me/reviews             ListMyProviderReviewsQuery
//      PUT  /providers/{providerId:guid}/bookmark
//      DELETE /providers/{providerId:guid}/bookmark
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// `app/provider/[id].tsx` opened with:
//
//     const listing = mockListings.find((l) => l.listingId === id) ?? mockListings[0];
//
// The `?? mockListings[0]` is the part that mattered. **Any** id at all — a real
// provider's, a deleted one's, a typo, a deep link from a stale share — rendered
// a fabricated business, with a fabricated address, fabricated opening hours,
// fabricated prices, a fabricated verification badge and fabricated five-star
// reviews from people who do not exist. A member could tap "Call" and dial a
// number nobody had ever given the platform. Nothing on the screen distinguished
// this from a real business, because as far as the screen was concerned there
// was no such thing as a real business.
//
// ── Two contract facts that shape the mapping below ──────────────────────────
//
//   1. **`{providerId:guid}` is route-constrained.** A non-GUID id does not
//      reach the handler at all — the route simply does not match and ASP.NET
//      returns 404. `mockListings` used ids like `listing-1`, so every deep link
//      minted while the fixture was in place is unresolvable. `fetchProvider`
//      routes those through the by-slug endpoint instead, which does exist and
//      binds a free-form string, and reports a genuine not-found rather than
//      substituting anything.
//
//   2. **Media is a reference, never a URL.** `ProviderMediaResponse` carries a
//      `mediaId`; the bytes come from the Media module. The screen resolves the
//      cover through `useMediaAsset`, and renders no image at all rather than a
//      stock photograph of somebody else's shop.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';

/** The platform's `{ data, meta }` envelope, as `PlatformResults.Ok` writes it. */
interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

const ROOT = '/providers';

/**
 * A GUID, in the shape ASP.NET's `:guid` route constraint accepts.
 *
 * Checked in the client rather than discovered by a 404, because the two
 * failures need different words: an id that cannot be a provider id is a broken
 * link, and an id that can be but is not found is a provider that has gone.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProviderGuid(value: string): boolean {
  return GUID.test(value.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract types — mirrors of the backend records, field for field.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderCategory {
  categoryId: string;
  slug: string;
  name: string;
  icon?: string | null;
  parentId?: string | null;
  path?: string | null;
}

export interface ProviderProfile {
  description: string;
  summary: string;
  tagline?: string | null;
  mission?: string | null;
  foundedOn?: string | null;
  typicalResponseHours?: number | null;
}

export interface ProviderLocation {
  countryCode?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  cityName?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
  displayName?: string | null;
}

export interface ProviderOwner {
  userId: string;
  displayName?: string | null;
  originCountryCode?: string | null;
}

/** A Media reference. There is no URL on this type, by design. */
export interface ProviderMedia {
  mediaId: string;
  role: string;
  position: number;
  caption?: string | null;
  isClaimed: boolean;
}

export interface ProviderPricing {
  model: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  currency?: string | null;
  unit?: string | null;
  isNegotiable: boolean;
  /** The server's own rendering. Preferred over re-deriving one on device. */
  displayText?: string | null;
}

export interface ProviderService {
  serviceId: string;
  name: string;
  description?: string | null;
  category?: ProviderCategory | null;
  pricing: ProviderPricing;
  effectivePricing: ProviderPricing;
  deliveryMode: string;
  durationMinutes?: number | null;
  isAvailable: boolean;
  isFeatured: boolean;
  imageMediaId?: string | null;
  position: number;
}

export interface ProviderContactMethod {
  contactMethodId: string;
  /** `Phone`, `Email`, `Website`, `WhatsApp`, … — the `ContactMethodKind` name. */
  kind: string;
  value: string;
  label?: string | null;
  isPrimary: boolean;
}

export interface ProviderOperatingHours {
  dayOfWeek: string;
  isClosed: boolean;
  /** False when the provider never told us about this day. Not the same as closed. */
  isSpecified: boolean;
  displayText: string;
}

export interface ProviderAvailability {
  kind: string;
  timeZoneId: string;
  isOpenNow?: boolean | null;
  nextChangeAt?: string | null;
  statusText?: string | null;
  acceptsWalkIns: boolean;
  acceptsAppointments: boolean;
  offersEmergencyService: boolean;
  offersRemoteService: boolean;
  note?: string | null;
  operatingHours: ProviderOperatingHours[];
}

export interface ProviderVerification {
  isVerified: boolean;
  status: string;
  verifiedKinds: string[];
  verifiedAt?: string | null;
  expiresAt?: string | null;
}

export interface ProviderReviewSummary {
  average: number;
  totalReviews: number;
  /** Keyed by rating as a string — `"1"` … `"5"`. */
  distribution: Record<string, number>;
}

export interface ProviderViewerState {
  role?: string | null;
  canManage: boolean;
  canManageMembers: boolean;
  canManageStatus: boolean;
  canReview: boolean;
  canEditOwnReview: boolean;
  isBookmarked: boolean;
  isFollowing: boolean;
  ownReviewId?: string | null;
  hasRecommended: boolean;
}

export interface Provider {
  providerId: string;
  slug: string;
  name: string;
  providerType: string;
  status: string;
  statusReason?: string | null;
  visibility: string;
  deliveryMode: string;
  isFeatured: boolean;
  category: ProviderCategory;
  profile: ProviderProfile;
  location: ProviderLocation;
  owner: ProviderOwner;
  coverMedia?: ProviderMedia | null;
  logoMedia?: ProviderMedia | null;
  gallery: ProviderMedia[];
  tags: string[];
  services: ProviderService[];
  contactMethods: ProviderContactMethod[];
  availability: ProviderAvailability;
  verification: ProviderVerification;
  reviewSummary: ProviderReviewSummary;
  /** Null for an anonymous caller. Never assume a capability when it is absent. */
  viewerState?: ProviderViewerState | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ProviderReview {
  reviewId: string;
  providerId: string;
  reviewerId: string;
  /** Null when the caller may not see it. Render "A member", never a made-up name. */
  reviewerName?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
  status: string;
  serviceId?: string | null;
  /** The provider's public reply. One, not a thread. */
  response?: string | null;
  respondedAt?: string | null;
  /**
   * A ranking signal, not a gate — the contract says so explicitly. Most trade
   * on this platform happens by phone and leaves no trace, so `false` is the
   * ordinary case and must not be rendered as suspicion.
   */
  isVerifiedInteraction: boolean;
  helpfulCount: number;
  isEdited: boolean;
  createdAt: string;
  editedAt?: string | null;
}

export interface ProviderReviewPage {
  items: ProviderReview[];
  nextCursor?: string | null;
  hasMore: boolean;
  /** Rides on page one only. */
  summary?: ProviderReviewSummary | null;
  /**
   * Which provider the page is about. Null when the caller runs none.
   *
   * Served on both review routes. On `/providers/me/reviews` it is the field a
   * screen reads to tell "no reviews yet" from "you are not a provider".
   */
  providerId?: string | null;
}

export interface ProviderSummary {
  providerId: string;
  slug: string;
  name: string;
  summary?: string | null;
  providerType: string;
  status: string;
  category: ProviderCategory;
  location: ProviderLocation;
  coverMedia?: ProviderMedia | null;
  logoMedia?: ProviderMedia | null;
  reviewSummary: ProviderReviewSummary;
  isVerified: boolean;
  isFeatured: boolean;
  isOpenNow?: boolean | null;
  availabilityText?: string | null;
  deliveryMode: string;
  tags: string[];
  languages: string[];
  owner: ProviderOwner;
  publishedAt?: string | null;
}

export interface ProviderPage {
  items: ProviderSummary[];
  nextCursor?: string | null;
  hasMore: boolean;
  totalCount?: number | null;
  /**
   * The order the page is actually in, since 15 Sep 2026. `Distance` is nearest
   * first across every page; a distance search the server could not order that
   * way reads `Recommended`. Null from a server that predates the field.
   */
  appliedSort?: string | null;
}

export interface ServiceCategory {
  categoryId: string;
  slug: string;
  name: string;
  icon?: string | null;
  parentId?: string | null;
  path?: string | null;
  depth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const providerKeys = {
  all: ['providers'] as const,
  detail: (idOrSlug: string) => ['providers', 'detail', idOrSlug] as const,
  reviews: (providerId: string) => ['providers', 'reviews', providerId] as const,
  myReviews: () => ['providers', 'reviews', 'me'] as const,
  search: (params: object) => ['providers', 'search', params] as const,
  categories: () => ['providers', 'categories'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderNotFoundError extends Error {
  readonly kind: 'provider-not-found';
}

function notFound(idOrSlug: string): ProviderNotFoundError {
  const error = new Error(
    `No provider matched "${idOrSlug}".`
  ) as Error & { kind: 'provider-not-found' };
  error.kind = 'provider-not-found';
  return error;
}

/**
 * Reads one provider, by id or by slug.
 *
 * **This never falls back to another provider.** That is the entire point of the
 * change: an unresolvable id produces a `ProviderNotFoundError` the screen
 * renders as "we could not find this business", and the member is never shown
 * somebody else's shop wearing the name they tapped.
 *
 * The GUID test picks the route rather than trying one and catching: the
 * `:guid` constraint means a non-GUID never reaches `GetProviderQuery`, so
 * attempting it would spend a round trip to learn what the string already says.
 */
export async function fetchProvider(idOrSlug: string): Promise<Provider> {
  const key = idOrSlug.trim();

  if (key.length === 0) throw notFound(idOrSlug);

  const path = isProviderGuid(key)
    ? `${ROOT}/${encodeURIComponent(key)}`
    : `${ROOT}/slug/${encodeURIComponent(key)}`;

  try {
    const response = await apiClient.get<Envelope<Provider>>(path);
    const provider = response.data?.data;

    if (!provider || typeof provider.providerId !== 'string') throw notFound(idOrSlug);

    return provider;
  } catch (cause) {
    if (cause instanceof Error && (cause as { kind?: string }).kind === 'provider-not-found') {
      throw cause;
    }

    const status = (cause as { response?: { status?: number } })?.response?.status;
    if (status === 404) throw notFound(idOrSlug);

    throw toFinancialError(cause, 'read');
  }
}

/**
 * A page of a provider's reviews, newest first.
 *
 * Separate from the provider read because it paginates and the profile does
 * not. The rollup on page one is authoritative over `provider.reviewSummary`
 * only in the sense that it is computed at the same moment as the page; both
 * come from the same projection, so they agree.
 */
export async function fetchProviderReviews(
  providerId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<ProviderReviewPage> {
  if (!isProviderGuid(providerId)) {
    // The route would not match, so there is nothing to ask for. An empty page
    // is the honest answer: no reviews are known for a provider we cannot name.
    return { items: [], hasMore: false, nextCursor: null, summary: null };
  }

  try {
    const response = await apiClient.get<Envelope<ProviderReviewPage>>(
      `${ROOT}/${encodeURIComponent(providerId)}/reviews`,
      { params: { cursor: options.cursor || undefined, limit: options.limit } }
    );

    const page = response.data?.data;

    return {
      items: Array.isArray(page?.items) ? page.items : [],
      nextCursor: page?.nextCursor ?? null,
      hasMore: page?.hasMore === true,
      summary: page?.summary ?? null,
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Reviews left **on the business the caller runs**.
 *
 * ── The gap this closes, and the one it does not ─────────────────────────────
 *
 * `GET /providers/me/reviews` used to answer a bare 404, and the creator surface
 * said *"Diaspora cannot list your reviews yet"*. The per-provider route worked
 * the whole time; nothing mapped a member to the provider they own, so the
 * client had no id to put in it. Both `/providers/me` and `/providers/me/reviews`
 * exist now.
 *
 * **This is not "reviews I have written".** That is a different capability,
 * author-scoped rather than provider-scoped, and it still does not exist — see
 * `app/my-reviews.tsx`, which says so and is right to.
 *
 * `providerId` is null when the caller runs no provider. That is what separates
 * *"nobody has reviewed you yet"* from *"you do not have a business"*, which an
 * empty `items` array cannot.
 */
export async function fetchMyProviderReviews(
  options: { cursor?: string; limit?: number } = {}
): Promise<ProviderReviewPage> {
  try {
    const response = await apiClient.get<Envelope<ProviderReviewPage>>(`${ROOT}/me/reviews`, {
      params: { cursor: options.cursor || undefined, limit: options.limit },
    });

    const page = response.data?.data;

    return {
      items: Array.isArray(page?.items) ? page.items : [],
      nextCursor: page?.nextCursor ?? null,
      hasMore: page?.hasMore === true,
      summary: page?.summary ?? null,
      providerId: page?.providerId ?? null,
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

export interface ProviderSearchParams {
  query?: string;
  /**
   * A `ServiceCategory.categoryId`.
   *
   * Kept under this name because that is what the callers hold and what the
   * taxonomy route returns. It leaves the device as `category` — see the note on
   * `searchProviders`, which is the one place the two spellings meet.
   */
  categoryId?: string;
  cityName?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  verifiedOnly?: boolean;
  openNow?: boolean;
  sortBy?: string;
  cursor?: string;
  limit?: number;
}

/**
 * `GET /providers` — the discovery list the directory and search screens read.
 *
 * ── Remediation Wave I: three parameters the server never saw ────────────────
 *
 * This sent `categoryId`, `openNow` and `sortBy`. **`ProviderSearchRequest`
 * (`Providers/Contracts/V1/Requests/ProviderSearchRequest.cs:20`) binds none of
 * those three names.** It binds `Category`, `OpenNowOnly` and `Sort`. A query
 * parameter the minimal-API model binder does not recognise is discarded in
 * silence, so all three were dropped before the handler ran and the route
 * answered **200 with the whole, unfiltered provider directory**.
 *
 * The category one is the damaging member of the set, and it is damaging in the
 * particular way this codebase keeps rediscovering: a filtered search that
 * returns everything *looks like it worked*. Picking "Plumbing" on the search
 * tab or the Discover providers tab has been returning caterers, tailors and
 * accountants alongside plumbers, and there was nothing on screen to say so.
 * Contrast the failure mode of a *wrong value* under a *right* name — an empty
 * page, which at least reads as wrong.
 *
 * `Category` takes "an identifier, slug, name or legacy alias" and resolves it
 * through the catalogue, so the id the client already holds is a valid value and
 * the callers do not have to change what they pass — only this function has to
 * spell it the way the wire does.
 *
 * `totalCount` is left off deliberately: the route only counts when
 * `includeTotalCount=true`, and nothing on the provider surfaces renders a total
 * today. `ProviderPage.totalCount` being null is therefore the route declining
 * to count rather than a count of zero, which is what `Page` documents.
 */
export async function searchProviders(
  params: ProviderSearchParams = {},
  signal?: AbortSignal
): Promise<ProviderPage> {
  try {
    const response = await apiClient.get<Envelope<ProviderPage>>(ROOT, {
      params: {
        query: params.query || undefined,
        category: params.categoryId || undefined,
        cityName: params.cityName || undefined,
        countryCode: params.countryCode || undefined,
        latitude: params.latitude,
        longitude: params.longitude,
        radiusKm: params.radiusKm,
        verifiedOnly: params.verifiedOnly || undefined,
        openNowOnly: params.openNow || undefined,
        sort: params.sortBy || undefined,
        cursor: params.cursor || undefined,
        limit: params.limit,
      },
      signal,
    });

    const page = response.data?.data;

    return {
      items: Array.isArray(page?.items) ? page.items : [],
      nextCursor: page?.nextCursor ?? null,
      hasMore: page?.hasMore === true,
      totalCount: page?.totalCount ?? null,
      appliedSort: page?.appliedSort ?? null,
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * `GET /providers/categories` — the service category catalogue.
 *
 * The real replacement for `mockCategories`, which several screens rendered as
 * the platform's category list. A fabricated taxonomy is a subtler lie than a
 * fabricated business but it has the same effect: a member filters by a category
 * no listing can ever carry and concludes the platform is empty.
 */
export async function fetchServiceCategories(options: {
  parentId?: string;
  includeRetired?: boolean;
} = {}): Promise<ServiceCategory[]> {
  try {
    const response = await apiClient.get<Envelope<ServiceCategory[] | { items: ServiceCategory[] }>>(
      `${ROOT}/categories`,
      {
        params: {
          parentId: options.parentId || undefined,
          includeRetired: options.includeRetired || undefined,
        },
      }
    );

    const payload = response.data?.data;
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookmarks
//
// `PUT`/`DELETE /providers/{id}/bookmark`. The screen's heart used to be a bare
// `useState` that forgot itself on unmount, which told the member they had saved
// something the platform had no record of.
// ─────────────────────────────────────────────────────────────────────────────

export async function setProviderBookmark(
  providerId: string,
  bookmarked: boolean
): Promise<void> {
  try {
    const path = `${ROOT}/${encodeURIComponent(providerId)}/bookmark`;
    if (bookmarked) await apiClient.put(path);
    else await apiClient.delete(path);
  } catch (cause) {
    // `'mutating'`, not `'write'`. `RequestSafety` is `'read' | 'mutating'`
    // (`financial-errors.ts:470`) and `'write'` is not a member of it — this
    // did not compile, and the reason it went unnoticed is that nothing else in
    // the file classifies a write. The distinction is not cosmetic: `mutating`
    // is what makes a transport failure `isIndeterminate`, so a bookmark that
    // timed out is reported as "we do not know" rather than as "it failed",
    // which is the difference between a member retrying and a member believing
    // the platform lost their save.
    throw toFinancialError(cause, 'mutating');
  }
}
