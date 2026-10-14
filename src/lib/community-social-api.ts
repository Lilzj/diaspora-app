// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community social-graph client (Remediation Wave D-2)
//
// `Diaspora.Modules.Community` serves **36 routes** under `/api/v1/community` —
// posts, comments, reactions, feeds, bookmarks, shares, follows, moderation and
// hashtag discovery — and until this file **not one of them had a frontend
// consumer**. The client base URL is `.../v1`, so every path here starts
// `/community/...` and the platform's prefix middleware maps it onto
// `/api/v1/community/...`.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Nothing. There was no community social client at all. `community-life-api.ts`
// is a different module (events, organisations, announcements) and
// `/api/v1/bookmarks` is a *different Bookmarks module* with its own folders and
// its own identifiers — see the note over the bookmark section.
//
// ── The nine things worth knowing before calling anything here ───────────────
//
// **1. camelCase enums, with one PascalCase island.** Every enum value in this
// module is camelCase (`hateSpeech`, `verifiedMembers`, `afterVoting`) — the
// opposite of Recommendations, which is PascalCase and is consumed on the same
// screens. The island is `capabilities.reactions[].appliesTo[]`, which is
// PascalCase because it is stored joined and split verbatim.
// `capabilityAppliesTo` below is the only place the two vocabularies meet.
//
// **2. Three values arrive under two names.** `postId`/`updateId`,
// `body`/`description`, `bookmarkId`/`savedId`. Same value, twice. Nothing here
// treats them as distinct.
//
// **3. Two bespoke page shapes, and only one of them survives `readPage`.**
// `FeedResponse` names its rows `items` and its count `totalAvailable`;
// `CommentThreadResponse` names its rows **`comments`** and its count
// `totalCount`. `platform-envelope.ts`'s `toPage` finds a page by looking for
// `items`, so the feed comes back right apart from a lost count and the comment
// thread comes back **empty, with no error**. `toFeedPage` and `toCommentPage`
// below are the explicit adapters. See the long note above them.
//
// **4. Unfollowing something you do not follow is a 404.** `DELETE
// /community/follows/{id}` answers `FollowNotFound`. Unfollow is not idempotent,
// so "make sure I am not following this" is `unfollowTarget` wrapped in
// `isFollowNotFoundError`, which is what `ensureNotFollowing` does.
//
// **5. A body-less follow POST un-mutes.** The handler applies
// `SetMuted(request.Muted)` unconditionally and an absent body deserialises to
// `false`. `followTarget` therefore takes `muted` as a required argument: there
// is no safe default, and defaulting it is how a member's muted follow quietly
// starts notifying them again.
//
// **6. A malformed cursor is page one at HTTP 200.** Feeds and comment threads
// both decode the cursor defensively and fall back to the first page rather than
// refusing. So a client that sent a stale or corrupted cursor gets rows — the
// *wrong* rows — and no error. An infinite query that appended them would show
// the first page twice. The hooks stop paging when `hasMore` is false rather
// than when a page comes back empty, which is what makes that survivable.
//
// **7. Poll counts are `null`, not `0`, while results are hidden.** And
// `post.reportCount` is 0 for everyone who is not the author. Neither absence
// means zero.
//
// **8. `ContentReviewStatus` can be `unavailable`, which is not `clean`.** It
// means no provider answered. `shouldRenderSafetyBadge` is the guard; nothing
// else may branch on the field.
//
// **9. The moderation queue is not pageable.** It accepts `cursor` and `limit`
// and returns a bare array with no cursor anywhere. See
// `fetchModerationQueue`.
//
// ── What this file deliberately does not offer ───────────────────────────────
//
// Because the routes do not exist:
//
//   * **`GET /community/posts`** — there is no list route for posts at all. A
//     post is reached through a feed or by id. `GET` on the collection is a 405,
//     not an empty list.
//   * **`GET /community/feeds/search`** — a declared feed key with no provider
//     registered. 404 on every deployment; see `COMMUNITY_FEEDS_WITHOUT_PROVIDERS`.
//   * **Feed subscriptions**, **visibility rules** (so `visibility: 'custom'` is
//     unusable), **bookmark move**, **mentions**. None of them have a route.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import type { Page } from './platform-envelope';
import type {
  BookmarkCollectionResponse,
  ContentEngagementResponse,
  PostCategoryOption,
  BookmarkFolderResponse,
  BookmarkResponse,
  CastPollVoteRequest,
  CommentResponse,
  CommentThreadResponse,
  CommunityCapabilitiesResponse,
  CommunityCapabilityContentType,
  CommunityContentType,
  CommunityFeedKey,
  AlertCapabilitiesResponse,
  CommunityPostResponse,
  CommunityPostVisibility,
  CommunityReactionCapability,
  CommunityReactionKey,
  CommunityReportReason,
  CreateBookmarkFolderRequest,
  CreateBookmarkRequest,
  CreateCommentRequest,
  CreateModerationDecisionRequest,
  CreatePostRequest,
  CreateReportRequest,
  CreateShareRequest,
  ContentReviewStatus,
  FeedQuery,
  FeedResponse,
  FollowRequest,
  FollowResponse,
  FollowTargetType,
  ModerationDecisionResponse,
  ModerationQueueItemResponse,
  ModerationQueueQuery,
  PollResponse,
  PostRevisionResponse,
  ReactionResponse,
  ReactionSummaryResponse,
  ReportReasonResponse,
  ReportResponse,
  SetPinnedRequest,
  ShareResponse,
  UpdateCommentRequest,
  UpdatePostRequest,
  HashtagSuggestionResponse,
  TrendingHashtagResponse,
} from '@/types/community-social';

const ROOT = '/community';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ── Limits, as the server applies them ───────────────────────────────────────
//
// Duplicated from `capabilities.limits` on purpose: a compose box has to know
// its character ceiling before the capabilities request has resolved, and a box
// with no counter until then is a box a member types 700 characters into. These
// are the fallbacks, `useCommunityCapabilities` supplies the live figures, and
// the two are asserted equal in the tests.

/** `CreatePostRequest.body` / `UpdatePostRequest.body`. */
export const POST_BODY_MAX_LENGTH = 500;

/** `CreatePostRequest.title`. */
export const POST_TITLE_MAX_LENGTH = 200;

/** `CreateCommentRequest.body`. Four times the post limit, deliberately. */
export const COMMENT_BODY_MAX_LENGTH = 2000;

/** Feeds and comment threads share one default and one clamp. */
export const DEFAULT_PAGE_SIZE = 20;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 50;

/**
 * `renderedDepth`'s ceiling.
 *
 * The server clamps at six; this constant exists so an indentation calculation
 * on the device uses the same number rather than a second opinion.
 */
export const MAX_RENDERED_COMMENT_DEPTH = 6;

/**
 * Feed keys the server declares and cannot serve.
 *
 * `search` is in the enum, binds happily, and has **no provider registered** —
 * `GET /community/feeds/search` is a 404 on every deployment. It is named here
 * rather than simply omitted from `CommunityFeedKey` so that a reader who finds
 * the key in the backend's enum finds out here why it is not offered.
 */
export const COMMUNITY_FEEDS_WITHOUT_PROVIDERS: readonly string[] = ['search'] as const;

/**
 * The visibilities a picker may offer.
 *
 * `custom` is excluded. It binds, and it means "apply the rule named by
 * `visibilityRuleId`" — and **no route creates a visibility rule**. A post
 * created with it names a rule that cannot exist.
 */
export const SELECTABLE_POST_VISIBILITIES: readonly CommunityPostVisibility[] = [
  'public',
  'followers',
  'verifiedMembers',
  'communityVerified',
] as const;

/**
 * The server's clamp, applied on the way out.
 *
 * The server does not refuse an out-of-range `limit`; it clamps it. Applying the
 * same clamp here means the cache key names the page size that was actually
 * used, so `limit: 200` and `limit: 50` are one cache entry rather than two
 * entries holding identical rows.
 */
export function clampLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(limit)));
}

// ── Cache keys ───────────────────────────────────────────────────────────────
//
// Everything in this module is member-scoped through the bearer token — a feed,
// a bookmark list and a reaction summary are all different answers for different
// members under identical keys. That is handled by clearing the cache on sign-in
// and sign-out, as every other read in this client does, rather than by putting
// a member id in the key.

export const communitySocialKeys = {
  all: ['community-social'] as const,
  capabilities: () => ['community-social', 'capabilities'] as const,
  alertCapabilities: () => ['community-social', 'alert-capabilities'] as const,

  posts: () => ['community-social', 'post'] as const,
  post: (postId: string) => ['community-social', 'post', postId] as const,
  revisions: (postId: string) => ['community-social', 'post', postId, 'revisions'] as const,

  feeds: () => ['community-social', 'feed'] as const,
  feed: (feedKey: CommunityFeedKey, query: FeedQuery = {}) =>
    ['community-social', 'feed', feedKey, feedQueryToken(query)] as const,

  comments: () => ['community-social', 'comments'] as const,
  commentsFor: (contentType: CommunityContentType, contentId: string, limit?: number | null) =>
    ['community-social', 'comments', contentType, contentId, clampLimit(limit)] as const,

  bookmarkCollections: () => ['community-social', 'bookmarks', 'collections'] as const,

  reportReasons: () => ['community-social', 'reports', 'reasons'] as const,
  moderationQueue: (query: ModerationQueueQuery = {}) =>
    [
      'community-social',
      'moderation',
      'queue',
      query.contentType ?? 'all',
      query.reason ?? 'all',
    ] as const,
  moderationHistory: (contentType: CommunityContentType, contentId: string) =>
    ['community-social', 'moderation', 'history', contentType, contentId] as const,

  hashtagSuggestions: (prefix: string, limit?: number | null) =>
    ['community-social', 'hashtags', 'suggest', prefix.trim().toLowerCase(), limit ?? null] as const,
  trendingHashtags: (countryCode?: string | null, limit?: number | null) =>
    ['community-social', 'hashtags', 'trending', countryCode ?? 'all', limit ?? null] as const,
};

/**
 * A stable token for the filter half of a feed request.
 *
 * `cursor` is excluded deliberately: it is the page pointer, an infinite query
 * owns it, and folding it into the key would give every page its own cache entry
 * and defeat the query entirely.
 */
function feedQueryToken(query: FeedQuery): string {
  return JSON.stringify({
    limit: clampLimit(query.limit),
    ranking: query.ranking ?? null,
    countryCode: query.countryCode ?? null,
    areaId: query.areaId ?? null,
    cityName: query.cityName ?? null,
    latitude: query.latitude ?? null,
    longitude: query.longitude ?? null,
    radiusKm: query.radiusKm ?? null,
    category: query.category ?? null,
    urgency: query.urgency ?? null,
    hashtag: query.hashtag ?? null,
    subjectId: query.subjectId ?? null,
    includeExpired: query.includeExpired ?? false,
  });
}

// ── Request plumbing ─────────────────────────────────────────────────────────

/** Drops nulls and undefineds so axios does not serialise `?category=null`. */
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
  const response = await apiClient.get<Envelope<T>>(url, { params: query ? params(query) : undefined });
  return response.data.data;
}

async function post<T>(url: string, data?: unknown, query?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.post<Envelope<T>>(url, data, {
    params: query ? params(query) : undefined,
  });
  return response.data.data;
}

async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<Envelope<T>>(url, data);
  return response.data.data;
}

async function del<T>(url: string, query?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.delete<Envelope<T>>(url, {
    params: query ? params(query) : undefined,
  });
  return response.data.data;
}

// ── Posts ────────────────────────────────────────────────────────────────────

/**
 * `POST /community/posts` — **201**.
 *
 * `publish` defaults to **true** on the server. Nothing here changes that
 * default, because a client that flipped it would make every existing caller's
 * post a draft; `createDraftPost` is the explicit opposite.
 */
export function createPost(request: CreatePostRequest): Promise<CommunityPostResponse> {
  return post<CommunityPostResponse>(`${ROOT}/posts`, request);
}

/** The same route with `publish: false` stated rather than assumed. */
export function createDraftPost(
  request: Omit<CreatePostRequest, 'publish'>
): Promise<CommunityPostResponse> {
  return post<CommunityPostResponse>(`${ROOT}/posts`, { ...request, publish: false });
}

export function fetchPost(postId: string): Promise<CommunityPostResponse> {
  return get<CommunityPostResponse>(`${ROOT}/posts/${segment(postId)}`);
}

/**
 * `PUT /community/posts/{postId}`.
 *
 * An edit carries the body, the title, a change summary and the attachments —
 * and **nothing else**. Category, urgency, visibility, location, expiry and the
 * poll are not on `UpdatePostRequest`, so a screen that reused the create form
 * for an edit would collect four more fields from the member and discard them.
 */
export function updatePost(
  postId: string,
  request: UpdatePostRequest
): Promise<CommunityPostResponse> {
  return put<CommunityPostResponse>(`${ROOT}/posts/${segment(postId)}`, request);
}

/** What the edit screen lets an author change on their post (14 Oct 2026). */
export interface PostEdits {
  body: string;
  title: string;
  urgency: UpdatePostRequest['urgency'];
  changeSummary: string;
}

/**
 * The `UpdatePostRequest` for an author's edit (14 Oct 2026).
 *
 * **`attachments` is left out on purpose.** `UpdatePostCommandHandler` treats a
 * supplied list as a replacement — it detaches every attachment and applies the
 * new ones, minting fresh ids — and treats an absent one as "keep". The edit
 * screen does not touch photos, so omitting the field is how they survive;
 * echoing them back would replace each with a copy of itself.
 *
 * Urgency is sent only when it changed: `AmendAlert` refuses anything but a
 * published post, so a body fix on a draft must not carry an urgency at all.
 */
export function postEditRequest(post: CommunityPostResponse, edits: PostEdits): UpdatePostRequest {
  const title = edits.title.trim();
  const summary = edits.changeSummary.trim();
  const request: UpdatePostRequest = {
    body: edits.body.trim(),
    title: title.length > 0 ? title : null,
    changeSummary: summary.length > 0 ? summary : null,
  };
  if (edits.urgency && edits.urgency !== post.urgency) {
    request.urgency = edits.urgency;
  }
  return request;
}

/**
 * `DELETE /community/posts/{postId}` — **200 with `data: null`**, not 204.
 *
 * Returns void rather than the null, so a caller cannot be tempted to check it
 * for something.
 */
export async function deletePost(postId: string): Promise<void> {
  await del<null>(`${ROOT}/posts/${segment(postId)}`);
}

/**
 * `POST /community/posts/{postId}/withdraw` — the report was wrong.
 *
 * The post stays readable, marked withdrawn, and leaves every feed and the live
 * map. Only its author, and only while it is in effect: the server answers 403
 * `community.post.not-owned` and 409 `community.post.not-open` otherwise.
 */
export function withdrawPost(postId: string): Promise<CommunityPostResponse> {
  return post<CommunityPostResponse>(`${ROOT}/posts/${segment(postId)}/withdraw`);
}

/** `POST /community/posts/{postId}/cancel` — what it reported is over. Same rules as withdraw. */
export function cancelPost(postId: string): Promise<CommunityPostResponse> {
  return post<CommunityPostResponse>(`${ROOT}/posts/${segment(postId)}/cancel`);
}

/** `GET /community/alerts/capabilities` — what this caller may publish on the alert map. */
export function fetchAlertCapabilities(): Promise<AlertCapabilitiesResponse> {
  return get<AlertCapabilitiesResponse>(`${ROOT}/alerts/capabilities`);
}

/**
 * `GET /community/posts/{postId}/revisions` — a **bare array**.
 *
 * No cursor, no total, no page object. Returned as the array it is rather than
 * pushed through `readPage`, which would report `totalCount: null` and `hasMore:
 * false` for a list that has neither concept.
 *
 * Note `changeSummary` is `string[]` here where the request that produced it
 * sent a `string`.
 */
export function fetchPostRevisions(postId: string): Promise<PostRevisionResponse[]> {
  return get<PostRevisionResponse[]>(`${ROOT}/posts/${segment(postId)}/revisions`);
}

/**
 * `PUT /community/posts/{postId}/pin` — **200 with `data: null`**.
 *
 * The pinned post is not returned, so the caller has nothing to write into the
 * cache and must invalidate. The hook does.
 */
export async function setPostPinned(postId: string, pinned: boolean): Promise<void> {
  const request: SetPinnedRequest = { pinned };
  await put<null>(`${ROOT}/posts/${segment(postId)}/pin`, request);
}

/**
 * `POST /community/posts/{postId}/poll/votes` — **200, not 201**.
 *
 * A vote is not a resource; the answer is the poll's new state. Which may still
 * be all nulls: a poll with `resultVisibility: 'afterClose'` hides its counts
 * from the member who just voted in it.
 */
export function votePoll(postId: string, optionIds: string[]): Promise<PollResponse> {
  const request: CastPollVoteRequest = { optionIds };
  return post<PollResponse>(`${ROOT}/posts/${segment(postId)}/poll/votes`, request);
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface CommentPageQuery {
  cursor?: string | null;
  /** Default 20, clamped to [1, 50]. */
  limit?: number | null;
}

/**
 * `GET /community/posts/{postId}/comments`.
 *
 * A **malformed cursor is page one at HTTP 200**, not a 400. So a stale cursor
 * silently re-serves the first page instead of failing, which an infinite query
 * would append to itself. The hooks page on `hasMore` rather than on "the page
 * came back non-empty" for exactly that reason.
 */
export function fetchPostComments(
  postId: string,
  query: CommentPageQuery = {}
): Promise<CommentThreadResponse> {
  return get<CommentThreadResponse>(`${ROOT}/posts/${segment(postId)}/comments`, {
    cursor: query.cursor,
    limit: clampLimit(query.limit),
  });
}

/** The same thread, for any other content type. */
export function fetchContentComments(
  contentType: CommunityContentType,
  contentId: string,
  query: CommentPageQuery = {}
): Promise<CommentThreadResponse> {
  return get<CommentThreadResponse>(
    `${ROOT}/content/${segment(contentType)}/${segment(contentId)}/comments`,
    { cursor: query.cursor, limit: clampLimit(query.limit) }
  );
}

/**
 * The comment body, with the two fields the route ignores stripped.
 *
 * `CreateCommentRequest.contentType` and `.contentId` are declared on the
 * contract and **never read** by any route that carries the target in its path —
 * which is all three of them. Sending them suggests they select something, and
 * the day someone sets them to a *different* target than the URL they will
 * spend an afternoon finding out that the route wins.
 */
function commentBody(request: CreateCommentRequest): CreateCommentRequest {
  const { body, parentCommentId, quotedCommentId, attachmentMediaId } = request;
  return {
    body,
    parentCommentId: parentCommentId ?? null,
    quotedCommentId: quotedCommentId ?? null,
    attachmentMediaId: attachmentMediaId ?? null,
  };
}

/** `POST /community/posts/{postId}/comments` — **201**. */
export function createPostComment(
  postId: string,
  request: CreateCommentRequest
): Promise<CommentResponse> {
  return post<CommentResponse>(`${ROOT}/posts/${segment(postId)}/comments`, commentBody(request));
}

/** `POST /community/content/{contentType}/{contentId}/comments` — **201**. */
export function createContentComment(
  contentType: CommunityContentType,
  contentId: string,
  request: CreateCommentRequest
): Promise<CommentResponse> {
  return post<CommentResponse>(
    `${ROOT}/content/${segment(contentType)}/${segment(contentId)}/comments`,
    commentBody(request)
  );
}

/**
 * `POST /community/comments/{commentId}/replies` — **201**.
 *
 * The parent comes from the route, so `parentCommentId` in the body is
 * redundant. Stripped along with the rest by `commentBody`.
 */
export function replyToComment(
  commentId: string,
  request: CreateCommentRequest
): Promise<CommentResponse> {
  return post<CommentResponse>(`${ROOT}/comments/${segment(commentId)}/replies`, {
    ...commentBody(request),
    parentCommentId: null,
  });
}

export function updateComment(commentId: string, body: string): Promise<CommentResponse> {
  const request: UpdateCommentRequest = { body };
  return put<CommentResponse>(`${ROOT}/comments/${segment(commentId)}`, request);
}

/**
 * `DELETE /community/comments/{commentId}` — **200 with `data: null`**.
 *
 * The comment is **not removed from the thread**. It comes back on the next read
 * with `isTombstoned: true` and an empty `body`, because deleting it outright
 * would orphan its replies. So this is an invalidation, never a local removal.
 */
export async function deleteComment(commentId: string): Promise<void> {
  await del<null>(`${ROOT}/comments/${segment(commentId)}`);
}

/** `PUT /community/comments/{commentId}/pin` — **200 with `data: null`**. */
export async function setCommentPinned(commentId: string, pinned: boolean): Promise<void> {
  const request: SetPinnedRequest = { pinned };
  await put<null>(`${ROOT}/comments/${segment(commentId)}/pin`, request);
}

// ── Reactions ────────────────────────────────────────────────────────────────
//
// All four routes answer **200**, including the two that create a reaction. A
// reaction is set membership: adding one twice is not a conflict and removing
// one that is not there is not a 404. Contrast the follow routes, where removing
// something that is not there **is** a 404 (property 4 in the header) — the two
// look alike and behave differently, which is why they are not written as one
// helper.

/**
 * `POST /community/content/{contentType}/{contentId}/reactions`.
 *
 * `ReactRequest` also declares `contentType` and `contentId` and **never reads
 * them** — the route always wins. Only `reactionKey` is sent.
 */
export function reactToContent(
  contentType: CommunityContentType,
  contentId: string,
  reactionKey: CommunityReactionKey
): Promise<ReactionResponse> {
  return post<ReactionResponse>(
    `${ROOT}/content/${segment(contentType)}/${segment(contentId)}/reactions`,
    { reactionKey }
  );
}

/**
 * `GET /community/content/{contentType}/{contentId}/engagement` — reaction
 * counts, the viewer's own reactions and the comment count, for content whose
 * response does not carry them (an official notice).
 */
export function fetchContentEngagement(
  contentType: CommunityContentType,
  contentId: string
): Promise<ContentEngagementResponse> {
  return get<ContentEngagementResponse>(
    `${ROOT}/content/${segment(contentType)}/${segment(contentId)}/engagement`
  );
}

/** `GET /community/posts/categories` — what an update may be filed under. */
export function fetchPostCategories(): Promise<PostCategoryOption[]> {
  return get<PostCategoryOption[]>(`${ROOT}/posts/categories`);
}

export function unreactToContent(
  contentType: CommunityContentType,
  contentId: string,
  reactionKey: CommunityReactionKey
): Promise<ReactionResponse> {
  return del<ReactionResponse>(
    `${ROOT}/content/${segment(contentType)}/${segment(contentId)}/reactions/${segment(reactionKey)}`
  );
}

export function reactToPost(
  postId: string,
  reactionKey: CommunityReactionKey
): Promise<ReactionResponse> {
  return post<ReactionResponse>(`${ROOT}/posts/${segment(postId)}/reactions`, { reactionKey });
}

export function unreactToPost(
  postId: string,
  reactionKey: CommunityReactionKey
): Promise<ReactionResponse> {
  return del<ReactionResponse>(
    `${ROOT}/posts/${segment(postId)}/reactions/${segment(reactionKey)}`
  );
}

// ── Feeds ────────────────────────────────────────────────────────────────────

/**
 * `GET /community/feeds/{feedKey}`.
 *
 * `includeExpired` is sent explicitly rather than omitted when false. The server
 * defaults it to false either way, but a request whose query string says what it
 * wants is a request whose behaviour survives a change to that default.
 */
export function fetchFeed(feedKey: CommunityFeedKey, query: FeedQuery = {}): Promise<FeedResponse> {
  return get<FeedResponse>(`${ROOT}/feeds/${segment(feedKey)}`, {
    cursor: query.cursor,
    limit: clampLimit(query.limit),
    ranking: query.ranking,
    countryCode: query.countryCode,
    areaId: query.areaId,
    cityName: query.cityName,
    latitude: query.latitude,
    longitude: query.longitude,
    radiusKm: query.radiusKm,
    category: query.category,
    urgency: query.urgency,
    hashtag: query.hashtag,
    subjectId: query.subjectId,
    includeExpired: query.includeExpired ?? false,
  });
}

// ── The two bespoke page shapes ──────────────────────────────────────────────
//
// Property 3, and the reason both of these are hand-written rather than handed
// to `platform-envelope.ts`:
//
//   * `readPage(FeedResponse)` **works, minus the count.** `toPage` recognises a
//     page by `Array.isArray(payload.items)`, which this record satisfies, and
//     reads the total from `totalCount`, which this record spells
//     `totalAvailable`. The rows and the cursor come back right; the total comes
//     back `null`, which `Page` documents as "the server declined to count".
//     Almost right, and quiet about the part that is not.
//
//   * `readPage(CommentThreadResponse)` **returns an empty page.** The rows are
//     under `comments`, `toPage` does not find `items`, and its fourth case —
//     the one that exists so a dashboard returned where a list was expected does
//     not crash a screen — returns `{ items: [], hasMore: false }`. Every comment
//     thread in the application would render "no comments yet" with no error
//     anywhere on the device or in the logs.
//
// Widening `toPage` to accept `comments` and `totalAvailable` was the other
// option and was rejected: it is a platform-wide function and every alias added
// to it is a shape it will silently accept from a route that meant something
// else. Two named adapters at the one call site that needs them keeps the
// tolerance local to the module that actually has the problem.

/** `FeedResponse` as the platform's `Page`, with `totalAvailable` carried across. */
export function toFeedPage(feed: FeedResponse): Page<CommunityPostResponse> {
  return {
    items: feed.items,
    nextCursor: feed.nextCursor,
    hasMore: feed.hasMore,
    // The one thing `readPage` would have dropped.
    totalCount: feed.totalAvailable,
    page: null,
    pageSize: null,
    // `FeedResponse` *does* have `items`, so `readPage` would have produced a
    // page here — a `cursor` one, with the total silently null. `adapted` is the
    // honest label: the rows were never the problem, the count was, and a reader
    // seeing `cursor` on this page would reasonably conclude nothing was lost.
    shape: 'adapted',
  };
}

/** `CommentThreadResponse` as the platform's `Page`. */
export function toCommentPage(thread: CommentThreadResponse): Page<CommentResponse> {
  return {
    // The rows `readPage` would not have found at all.
    items: thread.comments,
    nextCursor: thread.nextCursor,
    hasMore: thread.hasMore,
    totalCount: thread.totalCount,
    page: null,
    pageSize: null,
    shape: 'adapted',
  };
}

// ── Bookmarks ────────────────────────────────────────────────────────────────
//
// **Not `/api/v1/bookmarks`.** That prefix belongs to a separate Bookmarks
// module with its own contracts, its own folders and its own identifiers. A
// bookmark created here does not appear there and cannot be deleted there. The
// two were never meant to be one feature and merging them in a client is how a
// member's saved items start disappearing depending on which screen they used.

/** `POST /community/bookmarks` — **201**. */
export function createBookmark(request: CreateBookmarkRequest): Promise<BookmarkResponse> {
  return post<BookmarkResponse>(`${ROOT}/bookmarks`, request);
}

/**
 * `DELETE /community/bookmarks/{contentType}/{contentId}` — **200 `data: null`**.
 *
 * Keyed by the *content*, not by the `bookmarkId`, so a caller who only has the
 * bookmark's identifier cannot delete it. Which is fine: everything that can
 * un-save something is looking at the content.
 */
export async function deleteBookmark(
  contentType: CommunityContentType,
  contentId: string
): Promise<void> {
  await del<null>(`${ROOT}/bookmarks/${segment(contentType)}/${segment(contentId)}`);
}

/**
 * `GET /community/bookmarks/collections` — a **bare array**.
 *
 * The whole saved-items surface in one response: every folder, with its items
 * inside it. There is no per-folder route and **no route that moves a bookmark
 * between folders** — the folder is chosen at save time and never again.
 */
export function fetchBookmarkCollections(): Promise<BookmarkCollectionResponse[]> {
  return get<BookmarkCollectionResponse[]>(`${ROOT}/bookmarks/collections`);
}

/** `POST /community/bookmarks/folders` — **201**. */
export function createBookmarkFolder(
  request: CreateBookmarkFolderRequest
): Promise<BookmarkFolderResponse> {
  return post<BookmarkFolderResponse>(`${ROOT}/bookmarks/folders`, request);
}

// ── Shares ───────────────────────────────────────────────────────────────────

/**
 * `POST /community/content/{contentType}/{contentId}/shares` — **201**.
 *
 * **`quotePostId` on the answer is always null.** `kind: 'quote'` records a
 * share and creates no post, on any deployment, despite both the request and the
 * response documenting one. Do not offer "quote this" as a compose action.
 */
export function shareContent(
  contentType: CommunityContentType,
  contentId: string,
  request: CreateShareRequest
): Promise<ShareResponse> {
  return post<ShareResponse>(
    `${ROOT}/content/${segment(contentType)}/${segment(contentId)}/shares`,
    request
  );
}

/** `POST /community/posts/{postId}/shares` — **201**. Same caveat. */
export function sharePost(postId: string, request: CreateShareRequest): Promise<ShareResponse> {
  return post<ShareResponse>(`${ROOT}/posts/${segment(postId)}/shares`, request);
}

// ── Follows ──────────────────────────────────────────────────────────────────

/**
 * `POST /community/follows/{targetId}` — **200**.
 *
 * Two traps, both in the signature:
 *
 *   * **`targetType` goes in the body here and in the query string on DELETE.**
 *     Same fact, two transports, and each route ignores the other's. Sending it
 *     the wrong way is not an error — it is a follow on the wrong target type.
 *   * **`muted` is required by this function** even though the wire lets the
 *     whole body be absent. The handler applies `SetMuted(request.Muted)`
 *     unconditionally, and an absent body deserialises to `false`, so a
 *     "follow" tap on something already followed-and-muted un-mutes it. There is
 *     no safe default to supply, so the caller states it.
 */
export function followTarget(
  targetId: string,
  options: { targetType?: FollowTargetType | null; muted: boolean }
): Promise<FollowResponse> {
  const request: FollowRequest = {
    targetType: options.targetType ?? null,
    // Unconditionally applied server-side. See above.
    muted: options.muted,
  };
  return post<FollowResponse>(`${ROOT}/follows/${segment(targetId)}`, request);
}

/**
 * `DELETE /community/follows/{targetId}?targetType=` — **200**, or **404**.
 *
 * `targetType` is a **query parameter** here, not a body field.
 *
 * **This throws when you were not following.** `FollowNotFound` is a genuine
 * failure rather than a no-op, so unfollow is not idempotent and a retry after a
 * successful-but-unacknowledged call fails. `ensureNotFollowing` is the
 * idempotent form.
 */
export function unfollowTarget(
  targetId: string,
  targetType?: FollowTargetType | null
): Promise<FollowResponse> {
  return del<FollowResponse>(`${ROOT}/follows/${segment(targetId)}`, { targetType });
}

/**
 * "Make sure I am not following this", which the wire does not offer.
 *
 * Returns the response when a follow was actually removed and `null` when there
 * was nothing to remove. A caller that only wants the end state — a retry, a
 * cleanup, an undo — wants this rather than `unfollowTarget`, because the raw
 * route reports "already not following" as a failure.
 */
export async function ensureNotFollowing(
  targetId: string,
  targetType?: FollowTargetType | null
): Promise<FollowResponse | null> {
  try {
    return await unfollowTarget(targetId, targetType);
  } catch (cause) {
    if (isFollowNotFoundError(cause)) return null;
    throw cause;
  }
}

// ── Moderation ───────────────────────────────────────────────────────────────

/**
 * `POST /community/reports` — **201**.
 *
 * The field is `reason` going out and **`reasonCode`** coming back. Reading
 * `response.reason` is `undefined`, which renders as a blank chip rather than
 * anything that looks wrong.
 */
export function reportContent(request: CreateReportRequest): Promise<ReportResponse> {
  return post<ReportResponse>(`${ROOT}/reports`, request);
}

/** `GET /community/reports/reasons` — a **bare array**. The picker's source. */
export function fetchReportReasons(): Promise<ReportReasonResponse[]> {
  return get<ReportReasonResponse[]>(`${ROOT}/reports/reasons`);
}

/**
 * `GET /community/moderation/queue` — a **bare array, and not pageable**.
 *
 * The route accepts `cursor` and `limit` and returns no cursor: not in the
 * array, not beside it, not in `meta`. There is therefore **no value to send as
 * the next page's cursor and no signal that a next page exists**, so infinite
 * scroll is not implementable against this route and this client does not
 * pretend otherwise — `useModerationQueue` is a plain query with no
 * `fetchNextPage`.
 *
 * `limit` is a further trap. It bounds the number of **reports** the server
 * reads, and those reports are then grouped by content, so a limit of 50 returns
 * between 1 and 50 rows and the client cannot tell which. **"Fewer rows than the
 * limit" does not mean "that is all there is"**, which is the inference every
 * paging control in this codebase makes. It is exposed because callers should be
 * able to ask for a smaller read, and it is documented because the obvious use
 * of it is wrong.
 */
export function fetchModerationQueue(
  query: ModerationQueueQuery = {}
): Promise<ModerationQueueItemResponse[]> {
  return get<ModerationQueueItemResponse[]>(`${ROOT}/moderation/queue`, {
    contentType: query.contentType,
    reason: query.reason,
    // Forwarded because the route accepts them. Neither is a paging mechanism.
    cursor: query.cursor,
    limit: query.limit,
  });
}

/** `POST /community/moderation/decisions` — **201**. */
export function submitModerationDecision(
  request: CreateModerationDecisionRequest
): Promise<ModerationDecisionResponse> {
  return post<ModerationDecisionResponse>(`${ROOT}/moderation/decisions`, request);
}

/** `GET /community/moderation/history/{contentType}/{contentId}` — a **bare array**. */
export function fetchModerationHistory(
  contentType: CommunityContentType,
  contentId: string
): Promise<ModerationDecisionResponse[]> {
  return get<ModerationDecisionResponse[]>(
    `${ROOT}/moderation/history/${segment(contentType)}/${segment(contentId)}`
  );
}

// ── Discovery ────────────────────────────────────────────────────────────────

/**
 * `GET /community/hashtags/suggest?prefix=&limit=` — **`prefix` is required**.
 *
 * Unlike every other filter in this module, an absent or blank `prefix` is a
 * **400**, not "everything". The obvious autocomplete implementation — fire on
 * mount, then filter as the member types — therefore fails on its first call and
 * shows an error under an empty text field. `useHashtagSuggestions` is disabled
 * until there is a prefix for exactly that reason.
 */
export function suggestHashtags(
  prefix: string,
  limit?: number | null
): Promise<HashtagSuggestionResponse[]> {
  return get<HashtagSuggestionResponse[]>(`${ROOT}/hashtags/suggest`, { prefix, limit });
}

/** `GET /community/hashtags/trending` — `countryCode` and `limit` both optional. */
export function fetchTrendingHashtags(
  countryCode?: string | null,
  limit?: number | null
): Promise<TrendingHashtagResponse[]> {
  return get<TrendingHashtagResponse[]>(`${ROOT}/hashtags/trending`, {
    countryCode: countryCode ? countryCode.trim().toUpperCase() : null,
    limit,
  });
}

/**
 * `GET /community/capabilities`.
 *
 * The authority for reaction keys, feed keys, ranking keys, report reasons and
 * the character limits. Read it rather than hardcoding: everything on it is
 * deployment configuration, and a client with its own copy either offers a
 * member something the server refuses or hides something it accepts.
 */
export function fetchCommunityCapabilities(): Promise<CommunityCapabilitiesResponse> {
  return get<CommunityCapabilitiesResponse>(`${ROOT}/capabilities`);
}

// ── Reading what came back ───────────────────────────────────────────────────

/**
 * The reaction tally, whichever record is holding it.
 *
 * Property 5 in one function. `ReactionResponse` calls it `summary`; a post and
 * a comment call it `reactions`. Identical shape, two names, and no way to tell
 * from a type parameter which one a caller is holding — so this narrows at
 * runtime and every screen reads reactions through it.
 *
 * Without this, the optimistic update after a reaction reads `response.reactions`
 * — `undefined` — and renders a card with no reactions on it until the next
 * refetch puts them back.
 */
export function readReactionSummary(
  source:
    | ReactionResponse
    | CommunityPostResponse
    | CommentResponse
    | ContentEngagementResponse
    | null
    | undefined
): ReactionSummaryResponse | null {
  if (!source) return null;
  if ('summary' in source && source.summary) return toReactionSummary(source.summary);
  if ('reactions' in source && source.reactions) return toReactionSummary(source.reactions);
  return null;
}

/**
 * The server's reaction summary, in the shape this app reads.
 *
 * **The server never sent `counts` or `myReactionKey`.** Its `ReactionSummaryResponse`
 * is `{ totalCount, reactions: [{ reactionKey, count, reactedByViewer }],
 * viewerReactions: [key] }`; the app's type and its mock server both invented the
 * other names, so every test agreed. `ReactionBar` read `summary.counts.find(...)`
 * on `undefined` and threw, which crashed the official-notice screen on its first
 * real use (14 Oct 2026), and `UpdateCard` never knew the member had reacted.
 * Either shape is accepted, so the mock and the real server both read correctly.
 */
export function toReactionSummary(raw: unknown): ReactionSummaryResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as {
    totalCount?: number;
    counts?: ReactionSummaryResponse['counts'];
    myReactionKey?: CommunityReactionKey | null;
    reactions?: { reactionKey: CommunityReactionKey; count: number; reactedByViewer?: boolean }[];
    viewerReactions?: CommunityReactionKey[];
  };

  const counts = Array.isArray(record.counts)
    ? record.counts
    : Array.isArray(record.reactions)
      ? record.reactions.map(({ reactionKey, count }) => ({ reactionKey, count }))
      : [];

  const myReactionKey =
    record.myReactionKey ??
    record.viewerReactions?.[0] ??
    (Array.isArray(record.reactions) ? record.reactions.find((r) => r.reactedByViewer)?.reactionKey : undefined) ??
    null;

  return {
    totalCount: record.totalCount ?? counts.reduce((sum, entry) => sum + entry.count, 0),
    counts,
    myReactionKey,
  };
}

/** How many people used one reaction key, from either record shape. */
export function reactionCount(
  source: ReactionResponse | CommunityPostResponse | CommentResponse | null | undefined,
  reactionKey: CommunityReactionKey
): number {
  const summary = readReactionSummary(source);
  return summary?.counts.find((entry) => entry.reactionKey === reactionKey)?.count ?? 0;
}

/**
 * Whether a poll is withholding its numbers.
 *
 * `null` is not `0`. A hidden poll returns `null` for `totalVotes` and for every
 * option's `voteCount` and `sharePercent`, and a client that coalesced them
 * would draw a bar chart of flat zeros over a poll with hundreds of votes.
 * Anything reading a count must ask this first and render "results after voting"
 * rather than a number.
 */
export function arePollResultsHidden(poll: PollResponse | null | undefined): boolean {
  if (!poll) return false;
  return poll.totalVotes === null;
}

/**
 * Whether a safety badge may be shown for this content.
 *
 * **`unavailable` is not `clean`.** It means no provider answered — the review
 * did not happen. A badge on it would be the application vouching for something
 * nothing looked at, which is the same defect as the "verified safe" claim the
 * Media wave removed when it found this platform has no virus scanner.
 *
 * `pending` is also refused: a review that has not finished has not concluded
 * anything either.
 */
export function shouldRenderSafetyBadge(status: ContentReviewStatus | null | undefined): boolean {
  return status === 'clean';
}

/** Whether the automated review actually flagged this. */
export function isFlaggedContent(status: ContentReviewStatus | null | undefined): boolean {
  return status === 'flagged';
}

/**
 * The comment tree, flattened in render order.
 *
 * Depth-first, parents before their replies, tombstones **included** — a deleted
 * comment is still delivered (`isTombstoned: true`, empty `body`) because
 * removing it would orphan its replies, and a flattener that dropped it would
 * orphan them here instead.
 *
 * Indent by `renderedDepth`, which the server clamps at 6. `depth` is the true
 * depth and is what a "collapse this thread" control counts.
 */
export function flattenComments(comments: CommentResponse[]): CommentResponse[] {
  const flat: CommentResponse[] = [];

  const walk = (nodes: CommentResponse[]): void => {
    for (const node of nodes) {
      flat.push(node);
      if (node.replies.length > 0) walk(node.replies);
    }
  };

  walk(comments);
  return flat;
}

/**
 * What to render in place of a deleted comment's body.
 *
 * The server sends an empty string, not a sentence. A screen that rendered
 * `body` unconditionally would draw an empty bubble with a reply count under it.
 */
export function commentBodyText(comment: CommentResponse): string {
  return comment.isTombstoned ? 'This comment was removed.' : comment.body;
}

/**
 * Whether a capability's PascalCase `appliesTo` entry names this content type.
 *
 * Property 1's exception, reconciled in one place. `capabilities.reactions[]
 * .appliesTo` is `["Post", "Guide"]` while `contentType` everywhere else in this
 * module is `"post"`, `"guide"`. Compared case-insensitively because that is the
 * only comparison that is true of both spellings — up-casing the route segment
 * or down-casing the capability list would each be wrong somewhere else.
 */
export function capabilityAppliesTo(
  appliesTo: CommunityCapabilityContentType[],
  contentType: CommunityContentType
): boolean {
  // **An empty `appliesTo` means every content type.** That is the server's rule,
  // not a guess: `ReactionDefinition.Applies` is
  // `AppliesTo.Length == 0 || AppliesTo.Split(',').Contains(type)`, and the
  // response contract says so out loud - "Empty means every type."
  //
  // This clause was missing, and `[].some(...)` is `false`. Three of the five
  // seeded reactions - `like`, `helpful` and `useful` - ship with an empty list,
  // so every picker built on this hid them everywhere and offered only
  // `confirmed` and `disputed`, on posts and guides alone. A comment, an event
  // or a listing got no reaction bar at all. Nothing failed; the row was simply
  // empty, which is indistinguishable from a deployment that offers none.
  if (appliesTo.length === 0) return true;

  const wanted = contentType.toLowerCase();
  return appliesTo.some((entry) => entry.toLowerCase() === wanted);
}

/** The reaction keys this deployment offers for a given content type. */
export function reactionKeysFor(
  capabilities: CommunityCapabilitiesResponse | null | undefined,
  contentType: CommunityContentType
): CommunityReactionKey[] {
  if (!capabilities) return [];
  return capabilities.reactions
    .filter((reaction) => capabilityAppliesTo(reaction.appliesTo, contentType))
    .map((reaction) => reaction.key);
}

/**
 * The reaction this deployment uses to corroborate a post, if it offers one.
 *
 * Selected by **sentiment, not key**. B6's own contract warns that the reaction
 * catalogue is data and that a consumer switching on fixed names silently stops
 * handling every kind a later deployment adds — so a screen that wants "the
 * confirm control" asks for the corroborating reaction rather than for
 * `confirmed`.
 *
 * Returns `null` when the deployment offers none for this content type, which
 * is the signal to render no confirm control at all rather than one that posts
 * a reaction key the server does not know.
 */
export function corroboratingReactionFor(
  capabilities: CommunityCapabilitiesResponse | null | undefined,
  contentType: CommunityContentType
): CommunityReactionCapability | null {
  if (!capabilities) return null;
  return (
    capabilities.reactions.find(
      (reaction) =>
        reaction.sentiment === 'corroborating' &&
        capabilityAppliesTo(reaction.appliesTo, contentType)
    ) ?? null
  );
}

// ── Errors ───────────────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function status(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

/**
 * Whether this failure is "you were not following that".
 *
 * Property 4. `DELETE /community/follows/{id}` on a follow that does not exist
 * is a **404 `community.follow.not-found`**, not a 200 and not a no-op. Every
 * other "remove" in this module is idempotent — un-reacting to something you
 * never reacted to is a 200 — so this is the one that a retry, an undo or a
 * "clean up my follows" loop will trip over.
 */
export function isFollowNotFoundError(cause: unknown): boolean {
  return status(cause) === 404 && problemCode(cause) === 'community.follow.not-found';
}

/** Whether the server refused the text for being too long. */
export function isContentTooLongError(cause: unknown): boolean {
  const code = problemCode(cause);
  return (
    status(cause) === 400 &&
    (code === 'community.post.body-too-long' ||
      code === 'community.post.title-too-long' ||
      code === 'community.comment.body-too-long')
  );
}

/** Whether the hashtag autocomplete was called with no prefix. */
export function isPrefixRequiredError(cause: unknown): boolean {
  return status(cause) === 400 && problemCode(cause) === 'community.hashtag.prefix-required';
}

/** A sentence a member can act on, from the platform's problem envelope. */
export function communityErrorMessage(cause: unknown): string {
  if (status(cause) === 401) {
    return 'Sign in to take part in the community.';
  }

  if (isFollowNotFoundError(cause)) {
    return 'You were not following that.';
  }

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'We could not reach the community just now.';
}
