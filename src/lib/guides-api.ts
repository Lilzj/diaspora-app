// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Guides client (Remediation Wave D-3)
//
// `Diaspora.Modules.Guides` serves **44 routes** under `/api/v1/guides`, and
// until this file **not one of them had a frontend consumer**. Guide discovery,
// the reader, the version history, the author's workspace and the create wizard
// all rendered `mocks/community-data.ts`.
//
// The client base URL is `.../v1`, so every path here starts `/guides/…` and the
// platform's `RoutePrefixCompatibilityMiddleware` maps it onto
// `/api/v1/guides/…` — the same endpoint object, with the same authorisation
// metadata and rate-limit policy.
//
// ── The eight things worth knowing before calling anything here ──────────────
//
// **1. Publishing is four calls, not one — and `POST /guides` does not
// publish.** `CreateGuideRequest` opens a **draft** with a title, a category, a
// language and a country. It carries no content, no tags and no media. The full
// act is:
//
//     POST   /guides                    → a draft, and its `guideId`
//     PUT    /guides/{id}               → title, summary, difficulty, sections
//     POST   /guides/{id}/media         → the hero, by `mediaId` (optional)
//     PUT    /guides/{id}/tags          → the chip row            (optional)
//     POST   /guides/{id}/publish       → the version goes live
//
// `publishNewGuide` below is that sequence, and it is the only thing a create
// screen should call. **It reports the step that failed rather than swallowing
// it**, because the failure modes are not equivalent: a guide that was created
// but not published is recoverable from the author's drafts, and a member told
// "published" when it is sitting in drafts will never go back for it.
//
// **2. PascalCase enums, kebab sort keys, in the same request.**
// `?sort=most-helpful` returns rows whose `status` is `Published`. Both come
// from `Application/Services/GuideWireNames.cs`, which states the split. This is
// not Community, which is camelCase throughout and is consumed on the same
// screens.
//
// **3. No idempotency key anywhere.** Not a header, not a body field. The module
// ships no `IdempotencyHeader` class and no request DTO carries a key —
// `grep -rn "Idempot" Diaspora.Modules.Guides` finds only prose describing which
// routes are *naturally* idempotent. So `PUT /guides/{id}/bookmark`,
// `DELETE .../bookmark`, `POST .../media` and `DELETE .../featured` are safe to
// retry because of their verbs and their keys, and `POST /guides` is not safe to
// retry and has no mechanism that would make it so. `publishNewGuide` therefore
// never retries the create step.
//
// **4. Two detail reads carry no authorisation, and neither does discovery.**
// `GET /guides/{id}`, `GET /guides/slug/{slug}` and every discovery route are
// anonymous by design — visibility is applied inside the handler, so a draft, a
// hidden guide and a deleted one resolve as *not found* to everybody but their
// author and staff. A 404 from a detail read is therefore not proof the guide
// does not exist.
//
// **5. `currentVersion` is 0 until first publication, and `revision` is not
// `currentVersion`.** `revision` is the optimistic-concurrency token an editor
// sends back as `baseRevision`; `currentVersion` is the published version
// number. Sending the wrong one produces `guides.revision-conflict`.
//
// **6. Every list route answers `items`.** Either `CursorPagedResult<T>` or a
// bare array — there is no bespoke row name in this module, so `readPage`
// absorbs all of them. That is asserted per route in
// `guides-api.integration.test.ts` rather than assumed, because Community's
// comment thread named its rows `comments` and returned a silently empty page
// for every screen that read it.
//
// **7. The report reason is Community's vocabulary, not this module's.**
// `POST /guides/{id}/report` takes a *Community* report reason name and hands
// the report to Community's workflow. The list comes from
// `GET /community/reports/reasons`.
//
// **8. `GET /guides/{id}/analytics` is the author's, and it is a separate
// permission.** `guides.analytics.view` — not `guides.edit.own`. A screen that
// shows an author their own readership can be refused while the edit button
// works.
//
// ── What this file deliberately does not offer ───────────────────────────────
//
// Nothing is omitted for lack of a route: every capability named in
// `Api/GuideEndpoints.cs`, `Api/GuideDiscoveryEndpoints.cs`,
// `Api/GuideEngagementEndpoints.cs`, `Api/GuideVersionEndpoints.cs`,
// `Api/GuideModerationEndpoints.cs` and `Api/GuideCategoryEndpoints.cs` is
// mirrored here. What is **not** in this module, and is worth stating because a
// screen will look for it:
//
//   * **No comment routes.** A guide's discussion is Community's generic content
//     thread — `guide` is one of its `CommunityContentType` values. See
//     `lib/community-social-api.ts`.
//   * **No author profile route.** `GuideCardResponse` carries `authorId` and
//     nothing else; the byline comes from Trust or the profile module.
//   * **No "related guides" route.** A detail screen builds that from
//     `GET /guides/categories/{key}/guides` or the country browse.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { readPage, type Page } from './platform-envelope';
import type {
  AddGuideModerationNoteRequest,
  AttachGuideMediaRequest,
  CastGuideVoteRequest,
  CreateGuideRequest,
  CreateGuideTranslationRequest,
  DecideGuideSuggestionRequest,
  GuideAnalyticsResponse,
  GuideCapabilitiesResponse,
  GuideCardResponse,
  GuideCategoryResponse,
  GuideEngagementResponse,
  GuideMediaRole,
  GuideModerationQueueItemResponse,
  GuideModerationQueueQuery,
  GuideResponse,
  GuideSectionInput,
  GuideSortKey,
  GuideSuggestionResponse,
  GuideSuggestionsQuery,
  GuideTagResponse,
  GuideVerificationStatusResponse,
  GuideVersionDiffResponse,
  GuideVersionResponse,
  GuideVersionSummaryResponse,
  GuidesByCategoryQuery,
  GuidesByCountryQuery,
  HideGuideRequest,
  MyGuidesQuery,
  NearbyGuidesQuery,
  PublishGuideRequest,
  RecordGuideViewRequest,
  ReportGuideRequest,
  RestoreGuideVersionRequest,
  SaveGuideDraftRequest,
  ScheduleGuidePublicationRequest,
  SearchGuidesQuery,
  SetGuideCategoryRequest,
  SetGuideLanguageRequest,
  SetGuideProviderReferencesRequest,
  SetGuideTagsRequest,
  SubmitGuideSuggestionRequest,
  SubmitGuideVerificationRequest,
  UpdateGuideRequest,
} from '@/types/guides';

const ROOT = '/guides';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ── Limits, as the aggregate enforces them ───────────────────────────────────
//
// Duplicated from `Domain/Policies/GuideLimits.cs` on purpose, and for the
// reason `community-social-api.ts` gives for duplicating its own: an editor has
// to know its ceilings before `GET /guides/capabilities` has resolved, and a
// character counter that appears three seconds late is a counter a member has
// already typed past. `useGuideCapabilities` supplies the live figures and the
// integration test asserts the two agree.

/** `GuideLimits.MinTitle` / `MaxTitle`. Enforced by `CreateGuideCommandValidator`. */
export const GUIDE_TITLE_MIN_LENGTH = 3;
export const GUIDE_TITLE_MAX_LENGTH = 200;

/** `GuideLimits.MaxSummary`. */
export const GUIDE_SUMMARY_MAX_LENGTH = 500;

/** `GuideLimits.MaxBlockLength`. One block's prose. */
export const GUIDE_BLOCK_MAX_LENGTH = 20_000;

/** `GuideLimits.MaxSections` / `MaxBlocksPerSection`. */
export const GUIDE_MAX_SECTIONS = 100;
export const GUIDE_MAX_BLOCKS_PER_SECTION = 200;

/** `GuideLimits.MaxTags`. The client renders these as chips. */
export const GUIDE_MAX_TAGS = 10;

/** `GuideLimits.MaxMediaReferences` / `MaxProviderReferences`. */
export const GUIDE_MAX_MEDIA_REFERENCES = 50;
export const GUIDE_MAX_PROVIDER_REFERENCES = 20;

/** `GuideLimits.DefaultPageSize` / `MaxPageSize`. */
export const GUIDE_DEFAULT_PAGE_SIZE = 20;
export const GUIDE_MAX_PAGE_SIZE = 50;
export const GUIDE_MIN_PAGE_SIZE = 1;

/**
 * `GuideLimits.WordsPerMinute`.
 *
 * The server computes `readingTimeMinutes` at this rate. A screen that wants to
 * show "4 minutes left" as somebody scrolls must use the same number, or its
 * estimate disagrees with the badge on the card the reader tapped.
 */
export const GUIDE_WORDS_PER_MINUTE = 200;

/**
 * The sort keys the discovery endpoints accept, in their canonical spelling.
 *
 * `GuideWireNames.ParseSort` also accepts `mosthelpful`, `helpful`,
 * `recentlyupdated` and `updated`, and **falls back to `newest` for anything it
 * does not recognise rather than erroring**. So a filter sheet that sent a
 * typo would get a plausible page in the wrong order and no complaint; these are
 * the five spellings that mean what they say.
 */
export const GUIDE_SORT_KEYS: readonly GuideSortKey[] = [
  'newest',
  'most-helpful',
  'recently-updated',
  'popular',
  'trending',
] as const;

/**
 * The server's clamp, applied on the way out.
 *
 * `limit: 200` and `limit: 50` are one page on the server, so they are one cache
 * entry here rather than two entries holding identical rows.
 */
export function clampGuideLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return GUIDE_DEFAULT_PAGE_SIZE;
  return Math.min(GUIDE_MAX_PAGE_SIZE, Math.max(GUIDE_MIN_PAGE_SIZE, Math.floor(limit)));
}

// ── Cache keys ───────────────────────────────────────────────────────────────
//
// Member-scoped reads (`/mine`, `/mine/drafts`, `/bookmarked`) carry no member
// id: the cache is cleared on sign-in and sign-out, as every other read in this
// client is.

export const guideKeys = {
  all: ['guides'] as const,
  capabilities: () => ['guides', 'capabilities'] as const,

  guide: (guideId: string) => ['guides', 'guide', guideId] as const,
  guideBySlug: (slug: string) => ['guides', 'slug', slug] as const,
  preview: (guideId: string) => ['guides', 'preview', guideId] as const,

  search: (query: SearchGuidesQuery = {}) => ['guides', 'search', filterToken(query)] as const,
  shelf: (shelf: 'featured' | 'latest' | 'trending', query: Record<string, unknown> = {}) =>
    ['guides', 'shelf', shelf, filterToken(query)] as const,
  nearby: (query: NearbyGuidesQuery = {}) => ['guides', 'nearby', filterToken(query)] as const,
  byCountry: (countryCode: string, query: GuidesByCountryQuery = {}) =>
    ['guides', 'country', countryCode.toUpperCase(), filterToken(query)] as const,
  byCategory: (categoryKey: string, query: GuidesByCategoryQuery = {}) =>
    ['guides', 'category', categoryKey, filterToken(query)] as const,
  byAuthor: (authorId: string, sort?: GuideSortKey | null) =>
    ['guides', 'author', authorId, sort ?? null] as const,
  translations: (guideId: string) => ['guides', 'guide', guideId, 'translations'] as const,

  mine: (query: MyGuidesQuery = {}) => ['guides', 'mine', filterToken(query)] as const,
  myDrafts: () => ['guides', 'mine', 'drafts'] as const,
  bookmarked: () => ['guides', 'bookmarked'] as const,

  categories: (parentKey?: string | null, includeInactive?: boolean) =>
    ['guides', 'categories', parentKey ?? null, includeInactive ?? false] as const,
  tags: (countryCode?: string | null, categoryKey?: string | null) =>
    ['guides', 'tags', countryCode ?? null, categoryKey ?? null] as const,

  versions: (guideId: string) => ['guides', 'guide', guideId, 'versions'] as const,
  version: (guideId: string, versionNumber: number) =>
    ['guides', 'guide', guideId, 'versions', versionNumber] as const,
  versionDiff: (guideId: string, from: number, to: number) =>
    ['guides', 'guide', guideId, 'versions', 'diff', from, to] as const,

  suggestions: (guideId: string, query: GuideSuggestionsQuery = {}) =>
    ['guides', 'guide', guideId, 'suggestions', filterToken(query)] as const,
  analytics: (guideId: string) => ['guides', 'guide', guideId, 'analytics'] as const,
  verification: (guideId: string) => ['guides', 'guide', guideId, 'verification'] as const,

  moderationQueue: (query: GuideModerationQueueQuery = {}) =>
    ['guides', 'moderation', 'queue', filterToken(query)] as const,
};

/**
 * A stable token for the filter half of a list request.
 *
 * `cursor` is excluded: it is the page pointer, an infinite query owns it, and
 * folding it into the key gives every page its own cache entry — which defeats
 * the query entirely.
 */
function filterToken(query: object): string {
  const entries = Object.entries(query)
    .filter(([name, value]) => name !== 'cursor' && value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

// ── Request plumbing ─────────────────────────────────────────────────────────

/** Drops nulls, undefineds and empty strings so axios does not send `?tag=`. */
function params(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(source).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

async function get<T>(url: string, query?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<Envelope<T>>(url, {
    params: query ? params(query) : undefined,
  });
  return response.data.data;
}

async function getPage<T>(url: string, query?: Record<string, unknown>): Promise<Page<T>> {
  const response = await apiClient.get(url, { params: query ? params(query) : undefined });
  return readPage<T>(response.data);
}

async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.post<Envelope<T>>(url, data);
  return response.data.data;
}

async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<Envelope<T>>(url, data);
  return response.data.data;
}

async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<Envelope<T>>(url);
  return response.data.data;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * `GET /guides/{guideId}` — anonymous.
 *
 * Visibility is applied inside the handler, so a draft belonging to somebody
 * else, a hidden guide and a deleted one all answer **404**. A 404 here is
 * therefore "not visible to you", not "does not exist".
 */
export function fetchGuide(guideId: string): Promise<GuideResponse> {
  return get<GuideResponse>(`${ROOT}/${segment(guideId)}`);
}

/** `GET /guides/slug/{slug}` — anonymous. The handle a deep link carries. */
export function fetchGuideBySlug(slug: string): Promise<GuideResponse> {
  return get<GuideResponse>(`${ROOT}/slug/${segment(slug)}`);
}

/**
 * `GET /guides/{guideId}/preview` — `guides.drafts.view`.
 *
 * The draft rendered exactly as the detail screen would render it published.
 * Distinct from `fetchGuide`, which refuses a draft to everybody but its author.
 */
export function fetchGuidePreview(guideId: string): Promise<GuideResponse> {
  return get<GuideResponse>(`${ROOT}/${segment(guideId)}/preview`);
}

// ── Discovery ────────────────────────────────────────────────────────────────

/**
 * `GET /guides` — anonymous. Every discovery filter the client offers.
 *
 * The server binds both `query` and `q` and coalesces them; this sends `q`.
 */
export function searchGuides(query: SearchGuidesQuery = {}): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(ROOT, { ...query, limit: clampGuideLimit(query.limit) });
}

/** `GET /guides/featured` — what staff chose to put in front of everybody. */
export function fetchFeaturedGuides(
  options: { countryCode?: string; cursor?: string; limit?: number } = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/featured`, {
    ...options,
    limit: clampGuideLimit(options.limit),
  });
}

/** `GET /guides/latest` — the only ordering with no judgement in it. */
export function fetchLatestGuides(
  options: { countryCode?: string; language?: string; cursor?: string; limit?: number } = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/latest`, {
    ...options,
    limit: clampGuideLimit(options.limit),
  });
}

/** `GET /guides/trending` — what is earning attention now, not what earned it once. */
export function fetchTrendingGuides(
  options: { countryCode?: string; categoryKey?: string; cursor?: string; limit?: number } = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/trending`, {
    ...options,
    limit: clampGuideLimit(options.limit),
  });
}

/**
 * `GET /guides/nearby`.
 *
 * Every geographic field is optional and all of it goes to Location's scope
 * resolver — this module parses no radius and computes no distance. `radiusKm`
 * carries Location's sentinels: positive is kilometres, `-1` is "this city",
 * `-2` is "this country".
 */
export function fetchNearbyGuides(query: NearbyGuidesQuery = {}): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/nearby`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/** `GET /guides/countries/{countryCode}` — everything published about one country. */
export function fetchGuidesByCountry(
  countryCode: string,
  query: GuidesByCountryQuery = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/countries/${segment(countryCode)}`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/** `GET /guides/categories/{categoryKey}/guides`. Filed by key, never by name. */
export function fetchGuidesByCategory(
  categoryKey: string,
  query: GuidesByCategoryQuery = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/categories/${segment(categoryKey)}/guides`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/** `GET /guides/authors/{authorId}` — the byline a grateful reader clicks. */
export function fetchGuidesByAuthor(
  authorId: string,
  query: { sort?: GuideSortKey; cursor?: string; limit?: number } = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/authors/${segment(authorId)}`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/**
 * `GET /guides/{guideId}/translations`.
 *
 * A bare `IReadOnlyList<GuideCardResponse>`, not a page — what the language
 * switcher is built from.
 */
export function fetchGuideTranslations(guideId: string): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/${segment(guideId)}/translations`);
}

// ── Catalogue ────────────────────────────────────────────────────────────────

/**
 * `GET /guides/categories`.
 *
 * A bare array. `includeInactive` defaults to false on the server, and an
 * inactive category is one **new** guides may not choose — existing guides keep
 * it, so a filter row that hid inactive categories would hide guides.
 */
export function fetchGuideCategories(
  options: { parentKey?: string; includeInactive?: boolean } = {}
): Promise<Page<GuideCategoryResponse>> {
  return getPage<GuideCategoryResponse>(`${ROOT}/categories`, options);
}

/** `GET /guides/tags` — the cloud, built from what authors actually wrote about. */
export function fetchGuideTags(
  options: { countryCode?: string; categoryKey?: string; limit?: number } = {}
): Promise<Page<GuideTagResponse>> {
  return getPage<GuideTagResponse>(`${ROOT}/tags`, options);
}

/** `GET /guides/capabilities` — block kinds, sorts, ranking keys and every ceiling. */
export function fetchGuideCapabilities(): Promise<GuideCapabilitiesResponse> {
  return get<GuideCapabilitiesResponse>(`${ROOT}/capabilities`);
}

// ── The author's workspace ───────────────────────────────────────────────────

/** `GET /guides/mine` — `guides.drafts.view`. Every guide they wrote, in any state. */
export function fetchMyGuides(query: MyGuidesQuery = {}): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/mine`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/** `GET /guides/mine/drafts` — `guides.drafts.view`. */
export function fetchMyDrafts(
  query: { cursor?: string; limit?: number } = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/mine/drafts`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

// ── Authoring ────────────────────────────────────────────────────────────────

/**
 * `POST /guides` — **201**, `guides.create`.
 *
 * Returns a **draft**. Nothing is published by this call, and the response's
 * `currentVersion` is 0. There is no idempotency mechanism on this route — see
 * the header — so it is never retried automatically.
 */
export function createGuide(request: CreateGuideRequest): Promise<GuideResponse> {
  return post<GuideResponse>(ROOT, request);
}

/**
 * `PUT /guides/{guideId}` — `guides.edit.own`.
 *
 * The editor's save. `sections: null` (or omitted) edits metadata only;
 * supplying `sections` replaces the whole structure. `baseRevision` is the
 * optimistic-concurrency token — omitting it opts out of the conflict check,
 * which is right for a create wizard that just made the draft and wrong for an
 * editor that loaded it.
 */
export function updateGuide(guideId: string, request: UpdateGuideRequest): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}`, request);
}

/**
 * `PUT /guides/{guideId}/draft` — `guides.edit.own`.
 *
 * The auto-save. **It never touches the guide** — the snapshot is kept aside and
 * the handler prunes to the newest few. A screen that called this and then
 * navigated away has saved nothing a reader can see.
 */
export function saveGuideDraft(
  guideId: string,
  request: SaveGuideDraftRequest
): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}/draft`, request);
}

/**
 * `POST /guides/{guideId}/translations` — **201**, `guides.create`.
 *
 * A separate guide sharing a translation group, seeded with the source's
 * structure. There is no flag controlling the seeding.
 */
export function createGuideTranslation(
  guideId: string,
  request: CreateGuideTranslationRequest
): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/translations`, request);
}

// ── Editorial sub-resources ──────────────────────────────────────────────────

/** `PUT /guides/{guideId}/tags` — `guides.tags.manage`. Wholesale replacement. */
export function setGuideTags(guideId: string, request: SetGuideTagsRequest): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}/tags`, request);
}

/** `PUT /guides/{guideId}/category` — `guides.edit.own`. */
export function setGuideCategory(
  guideId: string,
  request: SetGuideCategoryRequest
): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}/category`, request);
}

/** `PUT /guides/{guideId}/language` — `guides.edit.own`. */
export function setGuideLanguage(
  guideId: string,
  request: SetGuideLanguageRequest
): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}/language`, request);
}

/**
 * `POST /guides/{guideId}/media` — `guides.edit.own`.
 *
 * By reference, never a URL (ADR-005). **Idempotent on (media, role)** — the
 * same image may legitimately be both the hero and a gallery item, and
 * attaching the same pair twice is one reference.
 */
export function attachGuideMedia(
  guideId: string,
  request: AttachGuideMediaRequest
): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/media`, request);
}

/**
 * `DELETE /guides/{guideId}/media/{mediaId}/{role}` — `guides.edit.own`.
 *
 * The role is a **path segment**, not a query parameter, because the pair is the
 * identity. The asset itself is untouched.
 */
export function detachGuideMedia(
  guideId: string,
  mediaId: string,
  role: GuideMediaRole
): Promise<GuideResponse> {
  return del<GuideResponse>(
    `${ROOT}/${segment(guideId)}/media/${segment(mediaId)}/${segment(role)}`
  );
}

/**
 * `PUT /guides/{guideId}/providers` — `guides.edit.own`. Replaces the whole set.
 *
 * The rows are named `references` and carry no `order` — position in the array
 * is the order. **This is the one editorial write with no `baseRevision`**, so
 * it is not covered by the concurrency check the others are.
 */
export function setGuideProviderReferences(
  guideId: string,
  request: SetGuideProviderReferencesRequest
): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}/providers`, request);
}

// ── Publishing & lifecycle ───────────────────────────────────────────────────

/**
 * `POST /guides/{guideId}/publish` — `guides.publish`.
 *
 * Publishes the current draft as the next version. A guide with no content is
 * refused with `guides.structure.empty`; a stale `baseRevision` with
 * `guides.revision-conflict`.
 */
export function publishGuide(
  guideId: string,
  request: PublishGuideRequest = {}
): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/publish`, request);
}

/** `POST /guides/{guideId}/schedule` — `guides.schedule`. Future only, drafts only. */
export function scheduleGuidePublication(
  guideId: string,
  request: ScheduleGuidePublicationRequest
): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/schedule`, request);
}

/** `DELETE /guides/{guideId}/schedule` — `guides.schedule`. */
export function cancelScheduledGuidePublication(guideId: string): Promise<GuideResponse> {
  return del<GuideResponse>(`${ROOT}/${segment(guideId)}/schedule`);
}

/** `POST /guides/{guideId}/archive` — `guides.archive.own`. Not a delete; versions stay. */
export function archiveGuide(guideId: string): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/archive`);
}

/** `POST /guides/{guideId}/restore` — `guides.restore.own`. */
export function restoreGuide(guideId: string): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/restore`);
}

/** `DELETE /guides/{guideId}` — `guides.delete.own`. Soft, and recoverable. */
export function deleteGuide(guideId: string): Promise<GuideResponse> {
  return del<GuideResponse>(`${ROOT}/${segment(guideId)}`);
}

/** `POST /guides/{guideId}/undelete` — `guides.restore.own`. */
export function undeleteGuide(guideId: string): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/undelete`);
}

/** `PUT /guides/{guideId}/featured` — `guides.feature`. A staff act. */
export function featureGuide(guideId: string): Promise<GuideResponse> {
  return put<GuideResponse>(`${ROOT}/${segment(guideId)}/featured`);
}

/** `DELETE /guides/{guideId}/featured` — `guides.feature`. Idempotent. */
export function unfeatureGuide(guideId: string): Promise<GuideResponse> {
  return del<GuideResponse>(`${ROOT}/${segment(guideId)}/featured`);
}

// ── Author tools ─────────────────────────────────────────────────────────────

/**
 * `POST /guides/{guideId}/verification` — `guides.verify.submit`.
 *
 * **It asks; it does not grant.** The strongest state this can return is
 * `Pending`; only a Trust integration event reaches `Verified`. A screen that
 * rendered the response as a verified badge would be lying.
 */
export function submitGuideVerification(
  guideId: string,
  request: SubmitGuideVerificationRequest = {}
): Promise<GuideVerificationStatusResponse> {
  return post<GuideVerificationStatusResponse>(`${ROOT}/${segment(guideId)}/verification`, request);
}

/** `GET /guides/{guideId}/verification` — `guides.verify.submit`. For the author. */
export function fetchGuideVerificationStatus(
  guideId: string
): Promise<GuideVerificationStatusResponse> {
  return get<GuideVerificationStatusResponse>(`${ROOT}/${segment(guideId)}/verification`);
}

/** `GET /guides/{guideId}/analytics` — **`guides.analytics.view`**, its own permission. */
export function fetchGuideAnalytics(guideId: string): Promise<GuideAnalyticsResponse> {
  return get<GuideAnalyticsResponse>(`${ROOT}/${segment(guideId)}/analytics`);
}

// ── Versions ─────────────────────────────────────────────────────────────────
//
// **The reads are public, and that is the accountability.** A reader who acted
// on a fee, a deadline or a document list can see that it changed and when — a
// version history visible only to its author is a record kept by the one person
// it could exonerate. Versions are addressed by *number*, not by row identifier.

/** `GET /guides/{guideId}/versions` — anonymous. A bare array, newest first. */
export function fetchGuideVersions(
  guideId: string,
  options: { limit?: number } = {}
): Promise<Page<GuideVersionSummaryResponse>> {
  return getPage<GuideVersionSummaryResponse>(`${ROOT}/${segment(guideId)}/versions`, options);
}

/** `GET /guides/{guideId}/versions/{versionNumber}` — anonymous. What readers were shown. */
export function fetchGuideVersion(
  guideId: string,
  versionNumber: number
): Promise<GuideVersionResponse> {
  return get<GuideVersionResponse>(`${ROOT}/${segment(guideId)}/versions/${versionNumber}`);
}

/**
 * `GET /guides/{guideId}/versions/compare` — anonymous.
 *
 * The version numbers are **query parameters named `fromVersion` and
 * `toVersion`**, not path segments — the route is `/versions/compare`, which is
 * why it is declared before `/versions/{versionNumber:int}` on the server.
 * Unchanged sections are omitted from the answer entirely.
 */
export function compareGuideVersions(
  guideId: string,
  fromVersion: number,
  toVersion: number
): Promise<GuideVersionDiffResponse> {
  return get<GuideVersionDiffResponse>(`${ROOT}/${segment(guideId)}/versions/compare`, {
    fromVersion,
    toVersion,
  });
}

/**
 * `POST /guides/{guideId}/versions/{versionNumber}/restore` — `guides.edit.own`.
 *
 * Applies an old version's content back onto the **draft**. Not time travel for
 * readers: publishing afterwards is what mints the next version, and the
 * versions themselves are immutable — a guide that once gave wrong advice cannot
 * rewrite the record of having given it.
 */
export function restoreGuideVersion(
  guideId: string,
  versionNumber: number,
  request: RestoreGuideVersionRequest = {}
): Promise<GuideResponse> {
  return post<GuideResponse>(
    `${ROOT}/${segment(guideId)}/versions/${versionNumber}/restore`,
    request
  );
}

// ── Engagement ───────────────────────────────────────────────────────────────

/** `GET /guides/bookmarked` — `guides.bookmark`. Personal, and nobody else's business. */
export function fetchBookmarkedGuides(
  query: { cursor?: string; limit?: number } = {}
): Promise<Page<GuideCardResponse>> {
  return getPage<GuideCardResponse>(`${ROOT}/bookmarked`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/**
 * `PUT /guides/{guideId}/bookmark` — `guides.bookmark`. Idempotent.
 *
 * A PUT and a DELETE on one resource rather than two verbs on a collection, so
 * a double-tapped bookmark cannot produce two. The storage is Community's.
 */
export async function saveGuideBookmark(guideId: string): Promise<void> {
  // The server answers `{ data: null }`: the command returns no guide. Typing it
  // as a guide made the hook write `null.guideId` and report a saved bookmark
  // as "could not reach the knowledge base" (20 Oct 2026).
  await put<unknown>(`${ROOT}/${segment(guideId)}/bookmark`);
}

/** `DELETE /guides/{guideId}/bookmark` — `guides.bookmark`. Idempotent. No body back. */
export async function removeGuideBookmark(guideId: string): Promise<void> {
  await del<unknown>(`${ROOT}/${segment(guideId)}/bookmark`);
}

/**
 * `POST /guides/{guideId}/vote` — `guides.vote`.
 *
 * One vote per member. Casting the other kind **changes** the vote rather than
 * adding one, and casting the same kind twice answers `guides.vote.unchanged`.
 * Voting on your own guide is `guides.vote.self`.
 */
export function castGuideVote(
  guideId: string,
  request: CastGuideVoteRequest
): Promise<GuideEngagementResponse> {
  return post<GuideEngagementResponse>(`${ROOT}/${segment(guideId)}/vote`, request);
}

/**
 * `POST /guides/{guideId}/view` — **anonymous**.
 *
 * Anonymous readers are most of the traffic on a knowledge base, and a counter
 * that only counted signed-in members would report the wrong number
 * confidently. `isUniqueView` is the client's claim, not a fingerprint.
 */
export function recordGuideView(
  guideId: string,
  request: RecordGuideViewRequest = {}
): Promise<GuideEngagementResponse> {
  return post<GuideEngagementResponse>(`${ROOT}/${segment(guideId)}/view`, request);
}

/** `POST /guides/{guideId}/share` — **anonymous**. The client reports what the platform cannot see. */
export function recordGuideShare(guideId: string): Promise<GuideEngagementResponse> {
  return post<GuideEngagementResponse>(`${ROOT}/${segment(guideId)}/share`);
}

/**
 * `POST /guides/{guideId}/report` — `guides.report`.
 *
 * `reason` is a **Community** report reason name. The workflow that follows —
 * the duplicate rule, the auto-hide threshold, the appeal trail — is Community's
 * and this module implements none of it.
 */
export function reportGuide(guideId: string, request: ReportGuideRequest): Promise<unknown> {
  return post<unknown>(`${ROOT}/${segment(guideId)}/report`, request);
}

// ── Suggestions — the platform's lightweight merge request ───────────────────

/** `GET /guides/{guideId}/suggestions` — **anonymous**, deliberately. */
export function fetchGuideSuggestions(
  guideId: string,
  query: GuideSuggestionsQuery = {}
): Promise<Page<GuideSuggestionResponse>> {
  return getPage<GuideSuggestionResponse>(`${ROOT}/${segment(guideId)}/suggestions`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/** `POST /guides/{guideId}/suggestions` — **201**, `guides.suggest`. */
export function submitGuideSuggestion(
  guideId: string,
  request: SubmitGuideSuggestionRequest
): Promise<GuideSuggestionResponse> {
  return post<GuideSuggestionResponse>(`${ROOT}/${segment(guideId)}/suggestions`, request);
}

/** `POST /guides/suggestions/{suggestionId}/decision` — `guides.edit.own`. */
export function decideGuideSuggestion(
  suggestionId: string,
  request: DecideGuideSuggestionRequest
): Promise<GuideSuggestionResponse> {
  return post<GuideSuggestionResponse>(
    `${ROOT}/suggestions/${segment(suggestionId)}/decision`,
    request
  );
}

/** `POST /guides/suggestions/{suggestionId}/withdrawal` — `guides.suggest`. Only the suggester. */
export function withdrawGuideSuggestion(suggestionId: string): Promise<GuideSuggestionResponse> {
  return post<GuideSuggestionResponse>(`${ROOT}/suggestions/${segment(suggestionId)}/withdrawal`);
}

// ── Moderation — `guides.moderate`, staff only ───────────────────────────────
//
// A **fourth** moderation queue on this platform, distinct from Community's,
// Housing's and Marketplace's. `moderation/queue.tsx` currently shows one
// invented queue; this is the Guides half of the real answer.

/** `GET /guides/moderation/queue` — `guides.moderate`. */
export function fetchGuideModerationQueue(
  query: GuideModerationQueueQuery = {}
): Promise<Page<GuideModerationQueueItemResponse>> {
  return getPage<GuideModerationQueueItemResponse>(`${ROOT}/moderation/queue`, {
    ...query,
    limit: clampGuideLimit(query.limit),
  });
}

/** `POST /guides/{guideId}/hide` — `guides.moderate`. The reason is required. */
export function hideGuide(guideId: string, request: HideGuideRequest): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/hide`, request);
}

/** `POST /guides/{guideId}/unhide` — `guides.moderate`. Restores exactly what was there. */
export function unhideGuide(guideId: string): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/unhide`);
}

/** `POST /guides/{guideId}/moderation-notes` — `guides.moderate`. Never shown to readers. */
export function addGuideModerationNote(
  guideId: string,
  request: AddGuideModerationNoteRequest
): Promise<GuideResponse> {
  return post<GuideResponse>(`${ROOT}/${segment(guideId)}/moderation-notes`, request);
}

// ── The composite the create wizard needs ────────────────────────────────────

/** Which call in `publishNewGuide` failed. Every one needs a different next step. */
export type GuidePublishStep = 'create' | 'content' | 'media' | 'tags' | 'publish';

/**
 * A step of `publishNewGuide` that did not complete.
 *
 * Carries `guideId` once the draft exists, because that is what makes the
 * failure recoverable: the author can be told where their work is instead of
 * being told it is gone.
 */
export class GuidePublishError extends Error {
  readonly step: GuidePublishStep;
  readonly guideId: string | null;
  readonly cause: unknown;

  constructor(step: GuidePublishStep, guideId: string | null, cause: unknown) {
    super(`Guide publishing failed at the "${step}" step.`);
    this.name = 'GuidePublishError';
    this.step = step;
    this.guideId = guideId;
    this.cause = cause;
  }
}

export interface PublishNewGuideInput {
  create: CreateGuideRequest;
  /** The document. Omit to publish a metadata-only guide, which the server refuses. */
  sections: GuideSectionInput[];
  difficulty?: UpdateGuideRequest['difficulty'];
  estimatedCompletionMinutes?: number | null;
  /** A `mediaId` from `ImagePickerInput`. Attached as `Hero`. */
  heroMediaId?: string | null;
  tags?: string[];
  revisionNotes?: string | null;
}

/**
 * Create → save content → attach hero → set tags → publish.
 *
 * **The single most important function in this wave.** `guide/create.tsx` used
 * to run a `TrustEngine` check, write to the local trust store and then tell the
 * member "Your guide has been published" — having made no request at all. This
 * is what that button does now, and every step is awaited before the next one
 * starts.
 *
 * ── Why the order is what it is ──────────────────────────────────────────────
 *
 * Content before media: `AttachGuideMediaRequest` needs a guide that exists, and
 * `CreateGuideRequest` has no media field — the module's own comment says media
 * "arrives through later edits". Tags before publish: the published version
 * snapshots what is on the guide, so tags set afterwards are not in version 1.
 * Publish last, obviously — it is the step that makes the rest visible.
 *
 * ── Why the optional steps do not abort the publication ─────────────────────
 *
 * A hero image that failed to attach and a tag set that was refused are both
 * **losses a member can repair from the editor**. Refusing to publish over them
 * would throw away a finished guide to protect a photograph. They are collected
 * into `warnings` so the screen can say what did not make it, and the guide
 * still goes live. Content and publication are not optional: without either the
 * member has no published guide, and saying otherwise is the defect this
 * function exists to end.
 */
export async function publishNewGuide(input: PublishNewGuideInput): Promise<{
  guide: GuideResponse;
  warnings: { step: GuidePublishStep; error: unknown }[];
}> {
  const warnings: { step: GuidePublishStep; error: unknown }[] = [];

  let draft: GuideResponse;
  try {
    draft = await createGuide(input.create);
  } catch (error) {
    // No draft exists, so there is nothing to recover and nothing to name.
    throw new GuidePublishError('create', null, error);
  }

  const guideId = draft.guideId;

  let saved: GuideResponse;
  try {
    saved = await updateGuide(guideId, {
      title: input.create.title,
      summary: input.create.summary ?? null,
      difficulty: input.difficulty ?? null,
      estimatedCompletionMinutes: input.estimatedCompletionMinutes ?? null,
      countryCode: input.create.countryCode,
      regionName: input.create.regionName ?? null,
      cityName: input.create.cityName ?? null,
      sections: input.sections,
      // The draft was created one call ago by this same client, so there is no
      // concurrent editor to conflict with. Sending `draft.revision` would be
      // equally correct and one more thing to get wrong on a retry.
      baseRevision: null,
    });
  } catch (error) {
    throw new GuidePublishError('content', guideId, error);
  }

  if (input.heroMediaId) {
    try {
      saved = await attachGuideMedia(guideId, { mediaId: input.heroMediaId, role: 'Hero' });
    } catch (error) {
      warnings.push({ step: 'media', error });
    }
  }

  if (input.tags && input.tags.length > 0) {
    try {
      saved = await setGuideTags(guideId, { tags: input.tags, baseRevision: null });
    } catch (error) {
      warnings.push({ step: 'tags', error });
    }
  }

  try {
    const published = await publishGuide(guideId, {
      revisionNotes: input.revisionNotes ?? null,
      baseRevision: null,
    });
    return { guide: published, warnings };
  } catch (error) {
    // `saved` is deliberately unused on this path: the member's guide exists as a
    // draft, and telling them it is published because the content save worked is
    // exactly the lie this function was written to remove.
    void saved;
    throw new GuidePublishError('publish', guideId, error);
  }
}

// ── Errors ───────────────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function httpStatus(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

/** The module's wire-level code, when the failure carried one. Frozen contract. */
export function guideErrorCode(cause: unknown): string | null {
  return problemCode(cause);
}

/**
 * Whether the save lost a race with another editor.
 *
 * `guides.revision-conflict` is the one failure a client can genuinely recover
 * from — reload, merge, send the new `baseRevision`. Every other 409 in this
 * module is a lifecycle refusal that reloading will not change.
 */
export function isGuideRevisionConflict(cause: unknown): boolean {
  return problemCode(cause) === 'guides.revision-conflict';
}

/**
 * Whether the guide was refused publication for having nothing in it.
 *
 * Worth its own predicate because it is the one publish failure that is the
 * member's to fix and is fixable in one step.
 */
export function isGuideStructureEmpty(cause: unknown): boolean {
  return problemCode(cause) === 'guides.structure.empty';
}

/** Whether the deployment has no verification source registered at all. */
export function isGuideVerificationUnavailable(cause: unknown): boolean {
  return problemCode(cause) === 'guides.verification.unavailable';
}

/**
 * A sentence a member can act on.
 *
 * The platform's `detail` is preferred wherever the server wrote one — it knows
 * *which* limit was exceeded and this client does not. The named cases below are
 * the ones whose server text is accurate but unhelpful on a phone.
 */
export function guideErrorMessage(cause: unknown): string {
  const status = httpStatus(cause);
  const code = problemCode(cause);

  if (status === 401) return 'Sign in to write and publish guides.';

  if (code === 'guides.revision-conflict') {
    return 'Somebody else saved this guide while you were editing. Reload it before saving again.';
  }
  if (code === 'guides.structure.empty') {
    return 'A guide needs some content before it can be published.';
  }
  if (code === 'guides.slug.taken') {
    return 'That web address is already in use by another guide.';
  }
  if (code === 'guides.too-many') {
    return 'You have reached the limit for guides in draft. Publish or delete one first.';
  }
  if (code === 'guides.vote.self') {
    return 'You cannot vote on your own guide.';
  }
  if (code === 'guides.verification.unavailable') {
    return 'Verification is not available on this deployment.';
  }

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'That guide is not available.';

  return 'We could not reach the knowledge base just now.';
}

/**
 * Whether a guide has anything a reader could read.
 *
 * `PublishGuideCommandHandler` refuses an empty structure with
 * `guides.structure.empty`, so a wizard that let a member reach the publish
 * button with no blocks would have shown them a server error at the last step.
 */
export function hasPublishableContent(sections: GuideSectionInput[]): boolean {
  return sections.some((section) =>
    section.blocks.some(
      (block) => (block.content ?? '').trim().length > 0 || Boolean(block.mediaId)
    )
  );
}

// ── Editing a guide that already exists (14 Oct 2026) ────────────────────────
//
// `PUT /guides/{id}` is **replace-style**: `UpdateGuideCommandHandler` hands
// every field to `Guide.UpdateMetadata` as it arrives. `visibility` and
// `difficulty` fall back to the stored value when null, but `summary`, the SEO
// four, the location and `estimatedCompletionMinutes` do not — an edit screen
// that sent only what it showed would blank the rest. So the request is built
// from the guide **as read**, and only the fields the member changed differ.
//
// Category and tags are not on that request at all; they have their own routes,
// each guarded by `baseRevision`. Every write bumps the revision, so the token is
// threaded through the chain from each response — sending the one the screen
// loaded to the second write would make the save conflict with itself.
//
// ── Why a published guide is not re-published ───────────────────────────────
//
// `GET /guides/{id}` reads the live aggregate ("the guide is the draft"), so a
// save to a published guide is what readers see straight away. Publishing again
// would stamp a new version for the history, but it also re-raises
// `GuidePublishedIntegrationEvent`, which Trust pays as a *publication* and
// counts in `GuidesPublished` — an edit would be scored as a new guide. The
// update already earns `GuideUpdated` through its own capped rule, so the edit
// stops at the save. `PUT /guides/{id}/draft` is the editor's auto-save shelf
// and never touches the guide, so it is not used either.

/** What the edit screen lets the author change. Absent means unchanged. */
export interface GuideEdits {
  title?: string;
  summary?: string | null;
  /** The whole structure, with the existing ids. Absent edits metadata only. */
  sections?: GuideSectionInput[];
  categoryKey?: string;
  tags?: string[];
  /** The new hero's `mediaId`, or null to remove the cover. Absent keeps it. */
  heroMediaId?: string | null;
}

export type GuideEditStep = 'content' | 'category' | 'tags' | 'cover';

/**
 * A step of `saveGuideEdits` that did not complete.
 *
 * `guide` is the server's latest answer before the failure, so the screen can
 * adopt it as its new starting point: the steps that landed are not resent, and
 * the next attempt carries the revision the server now holds.
 */
export class GuideEditError extends Error {
  readonly step: GuideEditStep;
  readonly guide: GuideResponse;
  readonly cause: unknown;

  constructor(step: GuideEditStep, guide: GuideResponse, cause: unknown) {
    super(`Saving the guide failed at the "${step}" step.`);
    this.name = 'GuideEditError';
    this.step = step;
    this.guide = guide;
    this.cause = cause;
  }
}

/** The guide's current structure as the editor submits it — every field kept. */
export function sectionsAsInput(guide: GuideResponse): GuideSectionInput[] {
  return [...guide.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      order: section.order,
      blocks: [...section.blocks]
        .sort((a, b) => a.order - b.order)
        .map((block) => ({
          blockId: block.blockId,
          kind: block.kind,
          order: block.order,
          content: block.content,
          mediaId: block.mediaId,
          metadata: block.metadata,
        })),
    }));
}

/**
 * `UpdateGuideRequest` for `guide`, with `edits` applied and every other field
 * sent back exactly as it was read. See the section header for why.
 */
export function guideUpdateRequest(
  guide: GuideResponse,
  edits: Pick<GuideEdits, 'title' | 'summary' | 'sections'>
): UpdateGuideRequest {
  return {
    title: edits.title ?? guide.title,
    summary: edits.summary !== undefined ? edits.summary : guide.summary,
    visibility: guide.visibility,
    difficulty: guide.difficulty,
    estimatedCompletionMinutes: guide.estimatedCompletionMinutes,
    countryCode: guide.countryCode,
    regionName: guide.regionName,
    cityName: guide.cityName,
    areaId: guide.areaId,
    metaTitle: guide.seo?.metaTitle ?? null,
    metaDescription: guide.seo?.metaDescription ?? null,
    canonicalUrl: guide.seo?.canonicalUrl ?? null,
    keywords: guide.seo?.keywords ?? null,
    // Null is "metadata only" on the server, so an untouched document is not
    // rewritten — and not re-claimed from Media — on a title fix.
    sections: edits.sections ?? null,
    baseRevision: guide.revision,
  };
}

function currentHero(guide: GuideResponse): string | null {
  return guide.mediaReferences.find((reference) => reference.role === 'Hero')?.mediaId ?? null;
}

/**
 * Saves an author's edits: content → category → tags → cover.
 *
 * Only the steps with something to change are called. Each write answers the
 * guide, and its `revision` is the next write's `baseRevision`. A new cover is
 * attached **before** the old one is detached, so a failed swap leaves the guide
 * with its old cover rather than none.
 */
export async function saveGuideEdits(
  guide: GuideResponse,
  edits: GuideEdits
): Promise<GuideResponse> {
  let latest = guide;

  const touchesDocument =
    (edits.title !== undefined && edits.title !== guide.title) ||
    (edits.summary !== undefined && (edits.summary ?? null) !== (guide.summary ?? null)) ||
    edits.sections !== undefined;

  if (touchesDocument) {
    try {
      latest = await updateGuide(guide.guideId, guideUpdateRequest(latest, edits));
    } catch (error) {
      throw new GuideEditError('content', latest, error);
    }
  }

  if (edits.categoryKey !== undefined && edits.categoryKey !== latest.categoryKey) {
    try {
      latest = await setGuideCategory(guide.guideId, {
        categoryKey: edits.categoryKey,
        baseRevision: latest.revision,
      });
    } catch (error) {
      throw new GuideEditError('category', latest, error);
    }
  }

  if (edits.tags !== undefined && edits.tags.join('\n') !== latest.tags.join('\n')) {
    try {
      latest = await setGuideTags(guide.guideId, {
        tags: edits.tags,
        baseRevision: latest.revision,
      });
    } catch (error) {
      throw new GuideEditError('tags', latest, error);
    }
  }

  if (edits.heroMediaId !== undefined) {
    const previous = currentHero(latest);
    if (edits.heroMediaId !== previous) {
      try {
        if (edits.heroMediaId) {
          latest = await attachGuideMedia(guide.guideId, {
            mediaId: edits.heroMediaId,
            role: 'Hero',
          });
        }
        if (previous) {
          latest = await detachGuideMedia(guide.guideId, previous, 'Hero');
        }
      } catch (error) {
        throw new GuideEditError('cover', latest, error);
      }
    }
  }

  return latest;
}
