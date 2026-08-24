// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Community social graph, development handlers for the REAL
// contract (Remediation Wave D-2)
//
// `Diaspora.Modules.Community` serves **36 routes** under `/api/v1/community` —
// posts, comments, reactions, feeds, bookmarks, shares, follows, moderation and
// hashtag discovery. Until this wave **not one of them had a frontend
// consumer**, so there was no handler either: every one of them would have
// fallen through to `mockApi.onAny().passThrough()` and hit a network that is
// not there.
//
// **Every shape here was written from the module's contract**, not from what
// `lib/community-social-api.ts` expects — which is why the wire types below are
// declared in this file rather than imported from `@/types/community-social`.
// Typing this handler with the client's own types would make it impossible for
// TypeScript to ever show a divergence between the two: the mock would agree
// with the client by construction, which is precisely the failure mode this
// remediation keeps finding.
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// ── The refusals this file ENFORCES rather than describes ────────────────────
//
//   1. **`prefix` is required on `/hashtags/suggest`.** Absent or blank is a
//      **400**, not "everything". Unlike every other filter in this module. The
//      obvious autocomplete — mount, fetch, filter as the member types — fails
//      on its first call, and it fails here too.
//
//   2. **Unfollowing something you do not follow is a 404.** `FollowNotFound`,
//      not a no-op and not a 200. Unfollow is the one non-idempotent removal in
//      this module: un-reacting to something you never reacted to is a 200.
//
//   3. **500 and 2000.** A post body over 500 characters and a comment body over
//      2000 are both 400s. A title over 200 likewise. Enforced rather than
//      trusted, because a compose box that only counts locally is a compose box
//      that loses a member's paragraph to a server they never saw refuse it.
//
//   4. **A malformed cursor is page one at HTTP 200.** Not a 400. Feeds and
//      comment threads both decode defensively and fall back to the first page,
//      so a stale cursor silently re-serves rows a client already has. That is
//      why the hooks stop paging on `hasMore` and never on an empty page — and
//      it is only testable if the handler behaves the same way.
//
//   5. **A body-less follow POST un-mutes.** `SetMuted(request.Muted)` is applied
//      unconditionally and an absent body deserialises to `muted: false`, so
//      "follow" on something already followed-and-muted turns the mute off.
//
// ── The properties this file MODELS rather than refuses ──────────────────────
//
//   6. **camelCase enums, with one PascalCase island.** Every enum value emitted
//      here is camelCase — `marketPrices`, `verifiedMembers`, `hateSpeech`,
//      `afterVoting`, `communityVerified`. The island is
//      `capabilities.reactions[].appliesTo[]`, which is **PascalCase** because
//      the server stores it joined and splits it verbatim, bypassing the
//      wire-name converter that camel-cases `capabilities.contentTypes` on the
//      same response. Both are emitted, so a client that normalised one to the
//      other has something to fail against.
//
//   7. **The same value under two names.** `postId`/`updateId`,
//      `body`/`description`, `bookmarkId`/`savedId` are each emitted twice from
//      one field.
//
//   8. **`changeSummary` is a `string` in and a `string[]` out.** The handler
//      splits what it was sent, exactly as the server does.
//
//   9. **`reason` in, `reasonCode` out.**
//
//  10. **The reaction summary is `summary` on a reaction response and
//      `reactions` on a post or comment.** One record, two names.
//
//  11. **Poll counts are `null` while results are hidden**, not 0. And
//      `reportCount` on a post is **0 for anyone who is not its author** — the
//      figure is suppressed, not the field.
//
//  12. **`reviewStatus` can be `unavailable`.** This deployment has no content
//      review provider configured, so most content carries `unavailable` — which
//      is *not* `clean`. A handler that emitted `clean` everywhere would let a
//      "checked and safe" badge be developed against a guarantee nothing makes.
//
//  13. **Deleted comments are delivered, not omitted.** `isTombstoned: true`,
//      empty `body`, replies intact. `renderedDepth` is clamped at 6 while
//      `depth` keeps counting.
//
//  14. **Four moderation display fields are hardcoded null** —`reporterName`,
//      `moderatorName`, `authorName`, `authorLevel` — and a queue row for
//      content that is already gone carries the literal title `"(removed)"`.
//
//  15. **`ShareResponse.quotePostId` is always null.** `kind: 'quote'` records a
//      share and creates no post.
//
//  16. **`CommentThreadResponse` names its rows `comments` and its count
//      `totalCount`; `FeedResponse` names them `items` and `totalAvailable`.**
//      Neither is a `CursorPagedResult`, and the difference is the whole reason
//      `platform-envelope.ts`'s `readPage` cannot be pointed at the thread.
//
// ── What is deliberately NOT here ───────────────────────────────────────────
//
// **No `GET /community/posts`.** There is no list route for posts at all — a
// post is reached through a feed or by id. The collection answers **405** here,
// which is what ASP.NET does for a path that matches with a method that does
// not, so a client that grows a post list finds out in development.
//
// **No `GET /community/feeds/search`.** A declared feed key with no provider
// registered: 404 on every deployment, and 404 here.
//
// **No feed subscriptions, no visibility rules, no bookmark move, no
// mentions.** None of them have a route, so none of them have a handler. A
// simulated one would be a client-callable path waiting to be pointed at a
// backend that does not have it.
//
// **Not `/api/v1/bookmarks`.** That prefix belongs to a separate Bookmarks
// module with its own contracts. Nothing here touches it.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

const ROOT = '/community';

type Reply = [number, unknown];

// ── The wire contracts, transcribed ──────────────────────────────────────────
//
// Named exactly as the module names them, and typed with `string` where the
// server emits an enum: this handler must be able to *receive* a value outside
// the client's union in order to refuse it, which a union type would prevent it
// from even expressing.

interface WireReactionCount {
  reactionKey: string;
  count: number;
}

interface WireReactionSummary {
  totalCount: number;
  counts: WireReactionCount[];
  myReactionKey: string | null;
}

interface WireReaction {
  contentType: string;
  contentId: string;
  /** Property 10. The same record a post calls `reactions`. */
  summary: WireReactionSummary;
  myReactionKey: string | null;
}

interface WireAttachment {
  attachmentId: string;
  kind: string;
  mediaId: string | null;
  url: string | null;
  role: string | null;
  caption: string | null;
  position: number;
}

interface WirePollOption {
  optionId: string;
  label: string;
  imageMediaId: string | null;
  /** Property 11. Null — not 0 — while results are hidden. */
  voteCount: number | null;
  sharePercent: number | null;
}

interface WirePoll {
  pollId: string;
  question: string;
  options: WirePollOption[];
  allowsMultiple: boolean;
  resultVisibility: string;
  closesAt: string | null;
  isClosed: boolean;
  totalVotes: number | null;
  hasVoted: boolean;
  selectedOptionIds: string[];
}

interface WirePost {
  postId: string;
  /** Property 7. The same value as `postId`. */
  updateId: string;
  title: string | null;
  body: string;
  /** Property 7. The same value as `body`. */
  description: string;
  category: string | null;
  urgency: string | null;
  visibility: string;
  audienceCountryCode: string | null;
  audienceAreaId: string | null;
  visibilityRuleId: string | null;
  countryCode: string | null;
  areaId: string | null;
  cityName: string | null;
  areaName: string | null;
  latitude: number | null;
  longitude: number | null;
  authorId: string;
  organizationId: string | null;
  attachments: WireAttachment[];
  poll: WirePoll | null;
  /** Property 10. The same record a reaction response calls `summary`. */
  reactions: WireReactionSummary;
  commentCount: number;
  shareCount: number;
  bookmarkCount: number;
  isPinned: boolean;
  isEdited: boolean;
  isPublished: boolean;
  isBookmarked: boolean;
  /** Property 11. Zero for anyone who is not the author. */
  reportCount: number;
  reviewStatus: string;
  versionNumber: number;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
}

interface WireRevision {
  revisionId: string;
  postId: string;
  versionNumber: number;
  title: string | null;
  content: string;
  /** Property 8. `string[]`, where the request that produced it sent a `string`. */
  changeSummary: string[];
  createdBy: string;
  createdAt: string;
}

interface WireComment {
  commentId: string;
  contentType: string;
  contentId: string;
  postId: string | null;
  parentCommentId: string | null;
  quotedCommentId: string | null;
  /** Property 13. The empty string when tombstoned. */
  body: string;
  authorId: string;
  depth: number;
  /** `min(depth, 6)`. */
  renderedDepth: number;
  isTombstoned: boolean;
  isPinned: boolean;
  isEdited: boolean;
  attachmentMediaId: string | null;
  reactions: WireReactionSummary;
  replies: WireComment[];
  replyCount: number;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string | null;
}

interface WireCommentThread {
  contentType: string;
  contentId: string;
  /** Property 16. **`comments`**, not `items`. */
  comments: WireComment[];
  /** Property 16. **`totalCount`**, not `totalAvailable`. */
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

interface WireFeed {
  feedKey: string;
  ranking: string;
  /** Property 16. **`items`**, like the platform envelope. */
  items: WirePost[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Property 16. **`totalAvailable`**, not `totalCount`. */
  totalAvailable: number | null;
  generatedAt: string;
}

interface WireBookmark {
  bookmarkId: string;
  /** Property 7. The same value as `bookmarkId`. */
  savedId: string;
  contentType: string;
  contentId: string;
  folderId: string | null;
  note: string | null;
  createdAt: string;
}

interface WireBookmarkFolder {
  folderId: string;
  name: string;
  glyph: string | null;
  createdAt: string;
}

interface WireBookmarkCollection {
  folderId: string | null;
  name: string;
  glyph: string | null;
  itemCount: number;
  items: WireBookmark[];
  updatedAt: string | null;
}

interface WireShare {
  shareId: string;
  contentType: string;
  contentId: string;
  kind: string;
  destination: string | null;
  recipientId: string | null;
  message: string | null;
  /** Property 15. Always null. */
  quotePostId: null;
  createdAt: string;
}

interface WireFollow {
  targetType: string;
  targetId: string;
  isFollowing: boolean;
  muted: boolean;
  followerCount: number;
  followedAt: string | null;
}

interface WireReport {
  reportId: string;
  contentType: string;
  contentId: string;
  /** Property 9. `reasonCode`, where the request said `reason`. */
  reasonCode: string;
  description: string | null;
  evidenceUrl: string | null;
  status: string;
  createdAt: string;
}

interface WireReportReason {
  code: string;
  label: string;
  description: string | null;
  requiresDescription: boolean;
}

interface WireQueueItem {
  contentType: string;
  contentId: string;
  /** Property 14. The literal `"(removed)"` when the content is gone. */
  title: string;
  reportCount: number;
  reasons: string[];
  firstReportedAt: string;
  lastReportedAt: string;
  status: string;
  /** Property 14. Hardcoded null. */
  reporterName: null;
  /** Property 14. Hardcoded null. */
  authorName: null;
  /** Property 14. Hardcoded null. */
  authorLevel: null;
}

interface WireDecision {
  decisionId: string;
  contentType: string;
  contentId: string;
  action: string;
  reason: string | null;
  reportId: string | null;
  moderatorId: string;
  /** Property 14. Hardcoded null. */
  moderatorName: null;
  createdAt: string;
}

interface WireHashtagSuggestion {
  tag: string;
  postCount: number;
}

interface WireTrendingHashtag {
  tag: string;
  postCount: number;
  rank: number;
  countryCode: string | null;
}

// ── Capabilities ─────────────────────────────────────────────────────────────
//
// Property 6 is visible in this object and nowhere else as clearly: every
// `appliesTo` entry is **PascalCase** and every entry in `contentTypes` is
// **camelCase**, on the same response, describing the same things. That is not a
// transcription error — the `appliesTo` list is persisted as one joined column
// and split back out verbatim, so it never passes through the naming converter.

const CAPABILITIES = {
  reactions: [
    { key: 'like', label: 'Like', glyph: '👍', appliesTo: ['Post', 'Comment', 'Guide', 'Event'] },
    { key: 'celebrate', label: 'Celebrate', glyph: '🎉', appliesTo: ['Post', 'Event'] },
    { key: 'support', label: 'Support', glyph: '🤝', appliesTo: ['Post', 'Comment'] },
    { key: 'insightful', label: 'Insightful', glyph: '💡', appliesTo: ['Post', 'Comment', 'Guide'] },
  ],

  feedKeys: [
    'home',
    'following',
    'nearby',
    'trending',
    'country',
    'neighborhood',
    'contributor',
    'organization',
    'saved',
    'profile',
    'hashtag',
  ],

  // kebab-case, unlike every enum value on this response: these are ordering
  // keys rather than enum names and never pass through the converter.
  rankingKeys: ['chronological', 'trending', 'trust-weighted', 'location-weighted'],

  reportReasons: [
    { code: 'spam', label: 'Spam or advertising', description: null, requiresDescription: false },
    { code: 'harassment', label: 'Harassment', description: null, requiresDescription: false },
    { code: 'hateSpeech', label: 'Hate speech', description: null, requiresDescription: false },
    {
      code: 'misinformation',
      label: 'Misleading information',
      description: null,
      requiresDescription: false,
    },
    {
      code: 'personalData',
      label: "Someone's personal details",
      description: 'Addresses, documents or phone numbers shared without consent.',
      requiresDescription: false,
    },
    { code: 'scam', label: 'Scam or fraud', description: null, requiresDescription: false },
    {
      code: 'other',
      label: 'Something else',
      description: null,
      // The one reason that cannot be submitted bare.
      requiresDescription: true,
    },
  ] as WireReportReason[],

  // camelCase. Contrast `reactions[].appliesTo` above.
  contentTypes: ['post', 'comment', 'guide', 'event', 'listing', 'job', 'organization', 'provider'],

  limits: {
    postBodyMaxLength: 500,
    postTitleMaxLength: 200,
    commentBodyMaxLength: 2000,
    feedPageSize: 20,
    feedMaxPageSize: 50,
    commentPageSize: 20,
    commentMaxPageSize: 50,
  },

  // False on every deployment. No route creates a visibility rule, so
  // `visibility: 'custom'` has nothing to point at.
  visibilityRulesEnabled: false,
};

const REACTION_KEYS = CAPABILITIES.reactions.map((reaction) => reaction.key);
const REPORT_REASON_CODES = CAPABILITIES.reportReasons.map((reason) => reason.code);
const FEED_KEYS = CAPABILITIES.feedKeys;
const RANKING_KEYS = CAPABILITIES.rankingKeys;

const POST_BODY_MAX = CAPABILITIES.limits.postBodyMaxLength;
const POST_TITLE_MAX = CAPABILITIES.limits.postTitleMaxLength;
const COMMENT_BODY_MAX = CAPABILITIES.limits.commentBodyMaxLength;

const DEFAULT_LIMIT = CAPABILITIES.limits.feedPageSize;
const MAX_LIMIT = CAPABILITIES.limits.feedMaxPageSize;

/** `min(depth, 6)`. Property 13. */
const MAX_RENDERED_DEPTH = 6;

/** The moderation actions the server parses. camelCase. */
const MODERATION_ACTIONS = ['dismiss', 'warn', 'hide', 'remove', 'escalate', 'restore'];

/** The share kinds. camelCase. */
const SHARE_KINDS = ['link', 'repost', 'quote', 'direct', 'external'];

/** The follow target types. camelCase. */
const FOLLOW_TARGET_TYPES = ['member', 'organization', 'hashtag', 'community'];

/** The signed-in member, for a handler that has no session. */
const DEV_MEMBER_ID = '00000000-0000-4000-b000-00000000da01';

/** Somebody else. Everything they author is content this member does not own. */
const OTHER_MEMBER_ID = '00000000-0000-4000-b000-00000000da02';

// ── The envelope and the problem document ────────────────────────────────────

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

/** `PlatformResults.Created` — 201 with the same envelope, no Location header. */
function created(data: unknown): Reply {
  return [201, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

function problem(status: number, code: string, title: string, detail: string): Reply {
  return [
    status,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title,
      status,
      detail,
      code,
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: 'dev',
    },
  ];
}

const validation = (code: string, detail: string) => problem(400, code, 'Validation failed', detail);
const notFound = (code: string, detail: string) => problem(404, code, 'Not found', detail);

const postNotFound = () =>
  notFound('community.post.not-found', 'That post does not exist.');
const commentNotFound = () =>
  notFound('community.comment.not-found', 'That comment does not exist.');

/**
 * Property 2, and the single most important refusal in this file.
 *
 * `DELETE /community/follows/{id}` on a follow that does not exist is a genuine
 * failure. Every other removal in this module is idempotent — un-reacting to
 * something you never reacted to is a 200 — so a client that assumed the same
 * of unfollow gets an error toast for an action that achieved exactly what the
 * member wanted.
 */
const followNotFound = () =>
  notFound('community.follow.not-found', 'You are not following that.');

// ── Request reading ──────────────────────────────────────────────────────────

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') {
    const data = config.data;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  }
  try {
    const parsed: unknown = JSON.parse(config.data);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * A query value, from either the params object or the URL.
 *
 * axios puts a `params` object on the config and only serialises it later, so a
 * handler that only read the URL would see no parameters on any request this
 * client makes. Both are read because a test may well build the URL by hand.
 */
function query(config: { params?: unknown; url?: string }, name: string): string | null {
  const params = config.params;
  if (params && typeof params === 'object') {
    const value = (params as Record<string, unknown>)[name];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }

  const match = new RegExp(`[?&]${name}=([^&]*)`).exec(config.url ?? '');
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  return decoded.length > 0 ? decoded : null;
}

/** The path, without the query string, for segment extraction. */
function path(url: string | undefined): string {
  return (url ?? '').split('?')[0];
}

function segments(url: string | undefined): string[] {
  return path(url)
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => decodeURIComponent(part));
}

/**
 * The server's clamp on `limit`.
 *
 * A value outside [1, 50] is **clamped, not refused** — asking for 200 is not an
 * error, it is 50 and no explanation. Reproduced because a client that expected
 * a 400 would never find out its page size is not what it asked for.
 */
function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

// ── Cursors ──────────────────────────────────────────────────────────────────

/**
 * Property 4, in two functions.
 *
 * The cursor is opaque and encodes an offset. `decodeCursor` **never throws and
 * never refuses** — anything it cannot read becomes offset zero, which is page
 * one, at HTTP 200.
 *
 * That is the server's own behaviour and it is a trap rather than a kindness: a
 * client holding a stale cursor is silently handed rows it already has, with no
 * status code and no field to distinguish "here is the next page" from "I could
 * not read your cursor, here is the first page again". An infinite query that
 * appended until a page came back empty would append the first page for ever.
 * The only safe stop condition is `hasMore`, which this handler computes from
 * the real offset rather than from the cursor it was given.
 */
function encodeCursor(offset: number): string {
  return `cur_${offset.toString(36)}`;
}

function decodeCursor(raw: string | null): number {
  if (!raw) return 0;
  const match = /^cur_([0-9a-z]+)$/.exec(raw);
  if (!match) return 0;
  const offset = parseInt(match[1], 36);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

// ── The store ────────────────────────────────────────────────────────────────

interface StoredPost {
  postId: string;
  title: string | null;
  body: string;
  category: string | null;
  urgency: string | null;
  visibility: string;
  audienceCountryCode: string | null;
  audienceAreaId: string | null;
  visibilityRuleId: string | null;
  countryCode: string | null;
  areaId: string | null;
  cityName: string | null;
  areaName: string | null;
  latitude: number | null;
  longitude: number | null;
  authorId: string;
  organizationId: string | null;
  attachments: WireAttachment[];
  poll: StoredPoll | null;
  isPinned: boolean;
  isEdited: boolean;
  isPublished: boolean;
  reviewStatus: string;
  versionNumber: number;
  revisions: WireRevision[];
  hashtags: string[];
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  isDeleted: boolean;
  shareCount: number;
}

interface StoredPollOption {
  optionId: string;
  label: string;
  imageMediaId: string | null;
  voteCount: number;
}

interface StoredPoll {
  pollId: string;
  question: string;
  options: StoredPollOption[];
  allowsMultiple: boolean;
  resultVisibility: string;
  closesAt: string | null;
  selectedOptionIds: string[];
}

interface StoredComment {
  commentId: string;
  contentType: string;
  contentId: string;
  parentCommentId: string | null;
  quotedCommentId: string | null;
  body: string;
  authorId: string;
  depth: number;
  isTombstoned: boolean;
  isPinned: boolean;
  isEdited: boolean;
  attachmentMediaId: string | null;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string | null;
}

interface StoredReport {
  reportId: string;
  contentType: string;
  contentId: string;
  reasonCode: string;
  description: string | null;
  evidenceUrl: string | null;
  status: string;
  createdAt: string;
}

interface StoredFollow {
  targetType: string;
  targetId: string;
  muted: boolean;
  followedAt: string;
}

const posts = new Map<string, StoredPost>();
const comments = new Map<string, StoredComment>();

/** `contentKey` → reaction key → count. The signed-in member's own is separate. */
const reactionCounts = new Map<string, Map<string, number>>();
const myReactions = new Map<string, string>();

const bookmarks = new Map<string, WireBookmark>();
const folders: WireBookmarkFolder[] = [];
const follows = new Map<string, StoredFollow>();
const reports: StoredReport[] = [];
const decisions: WireDecision[] = [];

let sequence = 0;

/**
 * A GUID-shaped identifier.
 *
 * Shaped, not random. Deterministic so a development log reads the same way
 * twice; version nibble `4` and variant nibble `8` so it is a well-formed v4
 * rather than something that merely matches a regex.
 */
function newId(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** The identity a reaction, bookmark or comment thread hangs off. */
function contentKey(contentType: string, contentId: string): string {
  return `${contentType.toLowerCase()}|${contentId}`;
}

// ── Seed content ─────────────────────────────────────────────────────────────
//
// Deliberately small, and deliberately not a second discovery system: this
// handler's job is to exercise the *shape* of the social graph and the refusals
// around it. Every identifier is a GUID no other handler knows, so a card tapped
// in development reaches this module and nothing else.

interface Seed {
  postId: string;
  title: string | null;
  body: string;
  category: string;
  urgency: string;
  visibility: string;
  authorId: string;
  cityName: string | null;
  countryCode: string;
  isPinned?: boolean;
  /** Hours in the past. Ordering is by `createdAt` descending. */
  ageHours: number;
  /** Set for the one expired post, which is absent unless `includeExpired`. */
  expiredHoursAgo?: number;
  reviewStatus?: string;
  hashtags?: string[];
  poll?: {
    question: string;
    options: string[];
    allowsMultiple: boolean;
    resultVisibility: string;
    votes: number[];
  };
  reactions?: Record<string, number>;
}

const SEEDS: Seed[] = [
  {
    postId: '00000000-0000-4000-c000-000000000001',
    title: 'Tomato prices at Ridge market',
    body: 'A crate is 340 this morning, down from 410 last week. Go before eleven.',
    // camelCase. `market-prices` is a 400, not a near miss.
    category: 'marketPrices',
    urgency: 'normal',
    visibility: 'public',
    authorId: OTHER_MEMBER_ID,
    cityName: 'Accra',
    countryCode: 'GH',
    ageHours: 2,
    hashtags: ['markets', 'accra'],
    reactions: { like: 12, insightful: 4 },
  },
  {
    postId: '00000000-0000-4000-c000-000000000002',
    title: null,
    body: 'Does anyone know if the consulate is open on Saturday morning?',
    category: 'question',
    urgency: 'normal',
    visibility: 'public',
    authorId: DEV_MEMBER_ID,
    cityName: 'London',
    countryCode: 'GB',
    ageHours: 5,
    reactions: { like: 2 },
  },
  {
    postId: '00000000-0000-4000-c000-000000000003',
    title: 'Road closed at the junction',
    body: 'Water works. Take the long way round until Thursday.',
    category: 'safetyAlert',
    urgency: 'urgent',
    visibility: 'public',
    authorId: OTHER_MEMBER_ID,
    cityName: 'Accra',
    countryCode: 'GH',
    isPinned: true,
    ageHours: 8,
    // Property 12. Flagged, so a client has something that is genuinely not
    // clean and genuinely not unavailable.
    reviewStatus: 'flagged',
    reactions: { support: 7 },
  },
  {
    postId: '00000000-0000-4000-c000-000000000004',
    title: 'Which evening suits everyone for the meet-up?',
    body: 'Pick one. I will book whichever gets the most.',
    category: 'general',
    urgency: 'normal',
    // camelCase, and one of the values that reads like a typo if you are used to
    // the rest of this codebase.
    visibility: 'verifiedMembers',
    authorId: OTHER_MEMBER_ID,
    cityName: 'London',
    countryCode: 'GB',
    ageHours: 12,
    poll: {
      question: 'Which evening suits everyone?',
      options: ['Thursday', 'Friday', 'Saturday'],
      allowsMultiple: false,
      // Property 11. Counts are null until this member votes.
      resultVisibility: 'afterVoting',
      votes: [8, 14, 3],
    },
  },
  {
    postId: '00000000-0000-4000-c000-000000000005',
    title: 'Room going in Peckham',
    body: 'Bills included, available from the first. Message me.',
    category: 'housingTip',
    urgency: 'normal',
    visibility: 'public',
    authorId: OTHER_MEMBER_ID,
    cityName: 'London',
    countryCode: 'GB',
    ageHours: 20,
    hashtags: ['housing', 'peckham'],
  },
  {
    postId: '00000000-0000-4000-c000-000000000006',
    title: 'Warehouse shifts going',
    body: 'Four nights on, four off. They are taking people this week.',
    category: 'jobLead',
    urgency: 'normal',
    visibility: 'communityVerified',
    authorId: OTHER_MEMBER_ID,
    cityName: 'Dartford',
    countryCode: 'GB',
    ageHours: 30,
    hashtags: ['jobs'],
    reactions: { like: 5, celebrate: 1 },
  },
  {
    postId: '00000000-0000-4000-c000-000000000007',
    title: 'Free advice clinic today only',
    body: 'Drop in until four. Interpreters available.',
    category: 'general',
    urgency: 'urgent',
    visibility: 'public',
    authorId: OTHER_MEMBER_ID,
    cityName: 'London',
    countryCode: 'GB',
    ageHours: 48,
    // Absent from every feed unless `includeExpired` is asked for.
    expiredHoursAgo: 6,
  },
];

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Seeds the store.
 *
 * `reviewStatus` defaults to **`unavailable`** rather than `clean` — property
 * 12. This deployment has no content review provider configured, so nothing
 * looked at most of this content. A handler that said `clean` would let a
 * "checked and safe" badge be built against a guarantee the platform does not
 * make, which is the same defect the Media wave found when it discovered this
 * platform has no virus scanner.
 */
function seed(): void {
  SEEDS.forEach((entry) => {
    const createdAt = hoursAgo(entry.ageHours);

    const poll: StoredPoll | null = entry.poll
      ? {
          pollId: `${entry.postId.slice(0, -1)}f`,
          question: entry.poll.question,
          options: entry.poll.options.map((label, index) => ({
            optionId: `${entry.postId.slice(0, -2)}${index}0`,
            label,
            imageMediaId: null,
            voteCount: entry.poll!.votes[index] ?? 0,
          })),
          allowsMultiple: entry.poll.allowsMultiple,
          resultVisibility: entry.poll.resultVisibility,
          closesAt: null,
          selectedOptionIds: [],
        }
      : null;

    posts.set(entry.postId, {
      postId: entry.postId,
      title: entry.title,
      body: entry.body,
      category: entry.category,
      urgency: entry.urgency,
      visibility: entry.visibility,
      audienceCountryCode: entry.countryCode,
      audienceAreaId: null,
      visibilityRuleId: null,
      countryCode: entry.countryCode,
      areaId: null,
      cityName: entry.cityName,
      areaName: null,
      latitude: null,
      longitude: null,
      authorId: entry.authorId,
      organizationId: null,
      attachments: [],
      poll,
      isPinned: entry.isPinned ?? false,
      isEdited: false,
      isPublished: true,
      // Property 12. `unavailable` is not `clean`.
      reviewStatus: entry.reviewStatus ?? 'unavailable',
      versionNumber: 1,
      revisions: [],
      hashtags: entry.hashtags ?? [],
      createdAt,
      updatedAt: null,
      publishedAt: createdAt,
      expiresAt:
        entry.expiredHoursAgo !== undefined ? hoursAgo(entry.expiredHoursAgo) : null,
      isDeleted: false,
      shareCount: 0,
    });

    if (entry.reactions) {
      const counts = new Map<string, number>();
      for (const [key, count] of Object.entries(entry.reactions)) counts.set(key, count);
      reactionCounts.set(contentKey('post', entry.postId), counts);
    }
  });

  seedComments();
}

/**
 * A thread on the first post.
 *
 * Deliberately awkward, because a thread that is three flat comments proves
 * nothing:
 *
 *   * an eight-deep chain, so `renderedDepth` clamps at 6 while `depth` keeps
 *     counting — a screen that indented by `depth` would run off the side of a
 *     phone at about the fifth reply;
 *   * a **tombstoned** comment in the middle of that chain, with an empty `body`
 *     and its replies still attached, because deleting it outright would orphan
 *     them;
 *   * enough top-level comments to page.
 */
function seedComments(): void {
  const postId = SEEDS[0].postId;

  const top: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const commentId = `00000000-0000-4000-d000-${index.toString().padStart(12, '0')}`;
    comments.set(commentId, {
      commentId,
      contentType: 'post',
      contentId: postId,
      parentCommentId: null,
      quotedCommentId: null,
      body: `Top-level comment ${index + 1}.`,
      authorId: index % 2 === 0 ? OTHER_MEMBER_ID : DEV_MEMBER_ID,
      depth: 0,
      isTombstoned: false,
      isPinned: index === 0,
      isEdited: false,
      attachmentMediaId: null,
      reviewStatus: 'unavailable',
      createdAt: hoursAgo(2 - index * 0.1),
      updatedAt: null,
    });
    top.push(commentId);
  }

  // The deep chain, hanging off the first top-level comment.
  let parentId = top[0];
  for (let depth = 1; depth <= 8; depth += 1) {
    const commentId = `00000000-0000-4000-d001-${depth.toString().padStart(12, '0')}`;
    // One tombstone in the middle. Its replies stay attached.
    const isTombstoned = depth === 4;
    comments.set(commentId, {
      commentId,
      contentType: 'post',
      contentId: postId,
      parentCommentId: parentId,
      quotedCommentId: null,
      // Property 13. The empty string, not a sentence — the server sends no
      // words at all and the client is what decides what to say instead.
      body: isTombstoned ? '' : `Reply at depth ${depth}.`,
      authorId: OTHER_MEMBER_ID,
      depth,
      isTombstoned,
      isPinned: false,
      isEdited: false,
      attachmentMediaId: null,
      reviewStatus: 'unavailable',
      createdAt: hoursAgo(1.5 - depth * 0.05),
      updatedAt: null,
    });
    parentId = commentId;
  }
}

/**
 * Clears everything this handler remembers and re-seeds it.
 *
 * Exported for the tests, which need a known store at the start of each case.
 * Nothing in the application calls it.
 */
export function resetCommunitySocialMocks(): void {
  posts.clear();
  comments.clear();
  reactionCounts.clear();
  myReactions.clear();
  bookmarks.clear();
  folders.length = 0;
  follows.clear();
  reports.length = 0;
  decisions.length = 0;
  sequence = 0;
  seed();
}

seed();

// ── Projection ───────────────────────────────────────────────────────────────

/** Property 10. The record a post calls `reactions` and a reaction calls `summary`. */
function summaryFor(contentType: string, contentId: string): WireReactionSummary {
  const key = contentKey(contentType, contentId);
  const counts = reactionCounts.get(key) ?? new Map<string, number>();
  const mine = myReactions.get(key) ?? null;

  const entries: WireReactionCount[] = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([reactionKey, count]) => ({ reactionKey, count }));

  return {
    totalCount: entries.reduce((total, entry) => total + entry.count, 0),
    counts: entries,
    myReactionKey: mine,
  };
}

/**
 * `PollResponse`, with property 11 applied.
 *
 * When `resultVisibility` is `afterVoting` and this member has not voted, every
 * count on the poll is **`null`** — the option counts, the shares and the total.
 * Not zero. Zero means "nobody chose this"; null means "you are not allowed to
 * know yet", and a client that coalesced them would draw a flat bar chart over a
 * poll with twenty-five votes.
 */
function pollFor(post: StoredPost): WirePoll | null {
  const poll = post.poll;
  if (!poll) return null;

  const hasVoted = poll.selectedOptionIds.length > 0;
  const isClosed = poll.closesAt !== null && Date.parse(poll.closesAt) <= Date.now();

  const hidden =
    (poll.resultVisibility === 'afterVoting' && !hasVoted) ||
    (poll.resultVisibility === 'afterClose' && !isClosed);

  const total = poll.options.reduce((sum, option) => sum + option.voteCount, 0);

  return {
    pollId: poll.pollId,
    question: poll.question,
    options: poll.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      imageMediaId: option.imageMediaId,
      voteCount: hidden ? null : option.voteCount,
      sharePercent: hidden
        ? null
        : total > 0
          ? Math.round((option.voteCount / total) * 1000) / 10
          : 0,
    })),
    allowsMultiple: poll.allowsMultiple,
    resultVisibility: poll.resultVisibility,
    closesAt: poll.closesAt,
    isClosed,
    totalVotes: hidden ? null : total,
    hasVoted,
    selectedOptionIds: poll.selectedOptionIds,
  };
}

function commentCountFor(postId: string): number {
  let total = 0;
  for (const comment of comments.values()) {
    if (comment.contentId === postId && comment.contentType === 'post') total += 1;
  }
  return total;
}

function reportCountFor(contentType: string, contentId: string): number {
  return reports.filter(
    (report) =>
      report.contentType.toLowerCase() === contentType.toLowerCase() &&
      report.contentId === contentId
  ).length;
}

/** `CommunityPostResponse`, with properties 7 and 11 applied. */
function toWirePost(post: StoredPost): WirePost {
  const bookmarked = bookmarks.has(contentKey('post', post.postId));

  return {
    postId: post.postId,
    // Property 7. The same value, twice, because the module was CommunityUpdates
    // before it was Community and the older name is still emitted.
    updateId: post.postId,
    title: post.title,
    body: post.body,
    // Property 7 again.
    description: post.body,
    category: post.category,
    urgency: post.urgency,
    visibility: post.visibility,
    audienceCountryCode: post.audienceCountryCode,
    audienceAreaId: post.audienceAreaId,
    visibilityRuleId: post.visibilityRuleId,
    countryCode: post.countryCode,
    areaId: post.areaId,
    cityName: post.cityName,
    areaName: post.areaName,
    latitude: post.latitude,
    longitude: post.longitude,
    authorId: post.authorId,
    organizationId: post.organizationId,
    attachments: post.attachments,
    poll: pollFor(post),
    // Property 10. Named `reactions` here and `summary` on a reaction response.
    reactions: summaryFor('post', post.postId),
    commentCount: commentCountFor(post.postId),
    shareCount: post.shareCount,
    bookmarkCount: bookmarked ? 1 : 0,
    isPinned: post.isPinned,
    isEdited: post.isEdited,
    isPublished: post.isPublished,
    isBookmarked: bookmarked,
    // Property 11. **Zero for anyone who is not the author.** The figure is
    // suppressed, not the field, so a moderation surface built on this would
    // report a clean platform to every moderator who is not also the author of
    // the thing they are looking at.
    reportCount:
      post.authorId === DEV_MEMBER_ID ? reportCountFor('post', post.postId) : 0,
    reviewStatus: post.reviewStatus,
    versionNumber: post.versionNumber,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
    expiresAt: post.expiresAt,
  };
}

/** One comment and everything under it. Property 13. */
function toWireComment(comment: StoredComment): WireComment {
  const replies = [...comments.values()]
    .filter((candidate) => candidate.parentCommentId === comment.commentId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .map(toWireComment);

  return {
    commentId: comment.commentId,
    contentType: comment.contentType,
    contentId: comment.contentId,
    postId: comment.contentType === 'post' ? comment.contentId : null,
    parentCommentId: comment.parentCommentId,
    quotedCommentId: comment.quotedCommentId,
    // Property 13. A tombstone carries the empty string, and is still delivered.
    body: comment.isTombstoned ? '' : comment.body,
    authorId: comment.authorId,
    // The true depth, unbounded.
    depth: comment.depth,
    // Clamped at six, for indentation only. A screen that indented by `depth`
    // would run a long argument off the side of the phone.
    renderedDepth: Math.min(comment.depth, MAX_RENDERED_DEPTH),
    isTombstoned: comment.isTombstoned,
    isPinned: comment.isPinned,
    isEdited: comment.isEdited,
    attachmentMediaId: comment.attachmentMediaId,
    reactions: summaryFor('comment', comment.commentId),
    replies,
    replyCount: replies.length,
    reviewStatus: comment.reviewStatus,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

/**
 * `CommentThreadResponse`.
 *
 * Property 16. The rows are under **`comments`** and the count is
 * **`totalCount`** — neither of which is what `CursorPagedResult` uses, and the
 * rows in particular are what `platform-envelope.ts`'s `toPage` looks for under
 * `items` and does not find. Pointed at this record, `readPage` returns an empty
 * page with no error, and every comment thread in the application renders "no
 * comments yet".
 *
 * Paging is over **top-level comments only**. Replies come with their parent, so
 * a page of 20 can carry a hundred rows — which is correct, and is why
 * `totalCount` counts what it counts.
 */
function threadFor(
  contentType: string,
  contentId: string,
  cursor: string | null,
  limit: number
): WireCommentThread {
  const roots = [...comments.values()]
    .filter(
      (comment) =>
        comment.contentType.toLowerCase() === contentType.toLowerCase() &&
        comment.contentId === contentId &&
        comment.parentCommentId === null
    )
    .sort((left, right) => {
      // Pinned first, then oldest first — a thread reads top to bottom.
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    });

  // Property 4. A cursor this handler cannot read is offset zero — page one, at
  // 200, with no field saying so.
  const offset = decodeCursor(cursor);
  const window = roots.slice(offset, offset + limit);
  const nextOffset = offset + window.length;
  const hasMore = nextOffset < roots.length;

  return {
    contentType,
    contentId,
    comments: window.map(toWireComment),
    totalCount: roots.length,
    nextCursor: hasMore ? encodeCursor(nextOffset) : null,
    hasMore,
  };
}

// ── Feeds ────────────────────────────────────────────────────────────────────

/**
 * Which posts a feed key selects.
 *
 * Representative rather than transcribed — the real selection reads a member's
 * follow graph, trust weighting and location index, none of which exist here.
 * What *is* contractual and is reproduced exactly: the key set, the ranking set,
 * the expiry rule and the paging.
 */
function feedCandidates(feedKey: string, config: { params?: unknown; url?: string }): StoredPost[] {
  const includeExpired = (query(config, 'includeExpired') ?? 'false').toLowerCase() === 'true';
  const now = Date.now();

  const countryCode = query(config, 'countryCode');
  const cityName = query(config, 'cityName');
  const category = query(config, 'category');
  const urgency = query(config, 'urgency');
  const hashtag = query(config, 'hashtag');
  const subjectId = query(config, 'subjectId');

  let candidates = [...posts.values()].filter((post) => !post.isDeleted && post.isPublished);

  // `includeExpired` defaults to **false**: an expired post is absent from every
  // feed unless it is asked for by name.
  if (!includeExpired) {
    candidates = candidates.filter(
      (post) => post.expiresAt === null || Date.parse(post.expiresAt) > now
    );
  }

  if (countryCode) {
    candidates = candidates.filter(
      (post) => (post.countryCode ?? '').toLowerCase() === countryCode.toLowerCase()
    );
  }
  if (cityName) {
    candidates = candidates.filter(
      (post) => (post.cityName ?? '').toLowerCase() === cityName.toLowerCase()
    );
  }
  if (category) {
    candidates = candidates.filter((post) => post.category === category);
  }
  if (urgency) {
    candidates = candidates.filter((post) => post.urgency === urgency);
  }
  if (hashtag) {
    const wanted = hashtag.replace(/^#/, '').toLowerCase();
    candidates = candidates.filter((post) =>
      post.hashtags.some((tag) => tag.toLowerCase() === wanted)
    );
  }
  if (subjectId) {
    candidates = candidates.filter(
      (post) => post.authorId === subjectId || post.organizationId === subjectId
    );
  }

  switch (feedKey) {
    case 'following':
      return candidates.filter((post) => follows.has(`member|${post.authorId}`));
    case 'saved':
      return candidates.filter((post) => bookmarks.has(contentKey('post', post.postId)));
    case 'profile':
    case 'contributor':
      return candidates.filter((post) => post.authorId === (subjectId ?? DEV_MEMBER_ID));
    case 'organization':
      return candidates.filter((post) => post.organizationId !== null);
    default:
      return candidates;
  }
}

function rank(candidates: StoredPost[], ranking: string): StoredPost[] {
  const sorted = [...candidates];

  if (ranking === 'trending') {
    sorted.sort(
      (left, right) =>
        summaryFor('post', right.postId).totalCount - summaryFor('post', left.postId).totalCount
    );
  } else {
    // `chronological` is the default, and `trust-weighted` and
    // `location-weighted` fall back to it here rather than being invented: this
    // handler holds no trust score and no location index, and a made-up ordering
    // would be a made-up claim about how the platform ranks.
    sorted.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  // A pinned post leads whatever the ranking is.
  return [...sorted.filter((post) => post.isPinned), ...sorted.filter((post) => !post.isPinned)];
}

// ── Validation ───────────────────────────────────────────────────────────────

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Property 3. The 500 and the 200. */
function refusePostText(payload: Record<string, unknown>): Reply | null {
  const postBody = text(payload.body);

  if (postBody === null || postBody.trim().length === 0) {
    return validation('community.post.body-required', "'Body' must not be empty.");
  }
  if (postBody.length > POST_BODY_MAX) {
    return validation(
      'community.post.body-too-long',
      `'Body' must be ${POST_BODY_MAX} characters or fewer. You entered ${postBody.length}.`
    );
  }

  const title = text(payload.title);
  if (title !== null && title.length > POST_TITLE_MAX) {
    return validation(
      'community.post.title-too-long',
      `'Title' must be ${POST_TITLE_MAX} characters or fewer. You entered ${title.length}.`
    );
  }

  return null;
}

/** Property 3. The 2000. */
function refuseCommentText(payload: Record<string, unknown>): Reply | null {
  const commentBody = text(payload.body);

  if (commentBody === null || commentBody.trim().length === 0) {
    return validation('community.comment.body-required', "'Body' must not be empty.");
  }
  if (commentBody.length > COMMENT_BODY_MAX) {
    return validation(
      'community.comment.body-too-long',
      `'Body' must be ${COMMENT_BODY_MAX} characters or fewer. You entered ${commentBody.length}.`
    );
  }

  return null;
}

function isKnownReaction(value: string | null): boolean {
  return value !== null && REACTION_KEYS.includes(value);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export function setupCommunitySocialMocks(mock: MockAdapter): void {
  // ── Discovery and capabilities ────────────────────────────────────────────
  //
  // Registered first. `axios-mock-adapter` matches in registration order and the
  // broader `/community/{something}` patterns below would otherwise capture
  // these.

  mock.onGet(new RegExp(`${ROOT}/capabilities(\\?.*)?$`)).reply(() => ok(CAPABILITIES));

  /**
   * Property 1. **`prefix` is required.**
   *
   * The one filter in this module where absent does not mean "everything". An
   * autocomplete that fires on mount and filters as the member types gets a 400
   * under an empty text field — which is why `useHashtagSuggestions` is disabled
   * until there is something to send.
   */
  mock.onGet(new RegExp(`${ROOT}/hashtags/suggest(\\?.*)?$`)).reply((config) => {
    const prefix = query(config, 'prefix');

    if (prefix === null || prefix.trim().length === 0) {
      return validation('community.hashtag.prefix-required', "'Prefix' must not be empty.");
    }

    const limit = clampLimit(query(config, 'limit'));
    const wanted = prefix.trim().replace(/^#/, '').toLowerCase();

    const tags = new Map<string, number>();
    for (const post of posts.values()) {
      for (const tag of post.hashtags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }

    const suggestions: WireHashtagSuggestion[] = [...tags.entries()]
      .filter(([tag]) => tag.toLowerCase().startsWith(wanted))
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([tag, postCount]) => ({ tag, postCount }));

    return ok(suggestions);
  });

  mock.onGet(new RegExp(`${ROOT}/hashtags/trending(\\?.*)?$`)).reply((config) => {
    const countryCode = query(config, 'countryCode');
    const limit = clampLimit(query(config, 'limit'));

    const tags = new Map<string, number>();
    for (const post of posts.values()) {
      if (countryCode && (post.countryCode ?? '').toLowerCase() !== countryCode.toLowerCase()) {
        continue;
      }
      for (const tag of post.hashtags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }

    const trending: WireTrendingHashtag[] = [...tags.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([tag, postCount], index) => ({
        tag,
        postCount,
        rank: index + 1,
        countryCode: countryCode ? countryCode.toUpperCase() : null,
      }));

    return ok(trending);
  });

  // ── Moderation ────────────────────────────────────────────────────────────
  //
  // Before `/reports` so the broader POST pattern does not capture the reasons
  // list, and before the post routes because `/moderation/history/{ct}/{cid}`
  // has the same arity as several of them.

  mock.onGet(new RegExp(`${ROOT}/reports/reasons(\\?.*)?$`)).reply(() =>
    // A bare array. No page object, no cursor, no total.
    ok(CAPABILITIES.reportReasons)
  );

  /**
   * `POST /community/reports` — **201**.
   *
   * Property 9: the field is **`reason`** here and **`reasonCode`** on the
   * answer. A confirmation screen echoing `response.reason` echoes `undefined`.
   */
  mock.onPost(new RegExp(`${ROOT}/reports$`)).reply((config) => {
    const payload = body(config);

    const contentType = text(payload.contentType);
    const contentId = text(payload.contentId);
    const reason = text(payload.reason);

    if (!contentType || !contentId) {
      return validation('community.report.content-required', "'Content' must not be empty.");
    }
    if (!reason || !REPORT_REASON_CODES.includes(reason)) {
      return validation(
        'community.report.reason-invalid',
        `'${String(reason)}' is not a report reason.`
      );
    }

    const description = text(payload.description);
    const reasonMeta = CAPABILITIES.reportReasons.find((entry) => entry.code === reason);

    if (reasonMeta?.requiresDescription && (description === null || description.trim().length === 0)) {
      return validation(
        'community.report.description-required',
        "'Description' is required for that reason."
      );
    }

    const stored: StoredReport = {
      reportId: newId(),
      contentType,
      contentId,
      // Property 9, in one line.
      reasonCode: reason,
      description,
      evidenceUrl: text(payload.evidenceUrl),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    reports.push(stored);

    const response: WireReport = { ...stored };
    return created(response);
  });

  /**
   * `GET /community/moderation/queue` — a **bare array, and not pageable**.
   *
   * It accepts `cursor` and `limit` and returns **no cursor**: not in the array,
   * not beside it, not in `meta`. Reproduced exactly, including the fact that
   * `limit` bounds the number of **reports** read before they are grouped by
   * content — so the row count is under the limit by an amount the caller cannot
   * predict, and "fewer rows than I asked for" does not mean "that is all there
   * is".
   *
   * Four display fields are hardcoded null and a row for content that has been
   * removed carries the literal title `"(removed)"`.
   */
  mock.onGet(new RegExp(`${ROOT}/moderation/queue(\\?.*)?$`)).reply((config) => {
    const contentType = query(config, 'contentType');
    const reason = query(config, 'reason');
    const limit = clampLimit(query(config, 'limit'));

    let matching = reports.filter((report) => report.status === 'pending');
    if (contentType) {
      matching = matching.filter(
        (report) => report.contentType.toLowerCase() === contentType.toLowerCase()
      );
    }
    if (reason) {
      matching = matching.filter((report) => report.reasonCode === reason);
    }

    // The limit applies **here**, to reports, and the grouping below happens
    // afterwards. That is the whole trap: ten reports about two posts, read at a
    // limit of ten, produce two rows.
    matching = matching.slice(0, limit);

    const grouped = new Map<string, StoredReport[]>();
    for (const report of matching) {
      const key = contentKey(report.contentType, report.contentId);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(report);
      else grouped.set(key, [report]);
    }

    const items: WireQueueItem[] = [...grouped.values()].map((bucket) => {
      const first = bucket[0];
      const post = first.contentType.toLowerCase() === 'post' ? posts.get(first.contentId) : undefined;
      const comment =
        first.contentType.toLowerCase() === 'comment' ? comments.get(first.contentId) : undefined;

      // Property 14. `"(removed)"` is a literal the server writes, not a
      // sentinel a client is expected to recognise — and it is what a row shows
      // for content that has already been deleted.
      const title =
        post && !post.isDeleted
          ? (post.title ?? post.body.slice(0, 80))
          : comment && !comment.isTombstoned
            ? comment.body.slice(0, 80)
            : '(removed)';

      const moments = bucket.map((report) => Date.parse(report.createdAt));

      return {
        contentType: first.contentType,
        contentId: first.contentId,
        title,
        reportCount: bucket.length,
        reasons: [...new Set(bucket.map((report) => report.reasonCode))],
        firstReportedAt: new Date(Math.min(...moments)).toISOString(),
        lastReportedAt: new Date(Math.max(...moments)).toISOString(),
        status: 'pending',
        // Property 14. All three hardcoded null, on every row, on every
        // deployment. A queue that identifies people cannot be built on this.
        reporterName: null,
        authorName: null,
        authorLevel: null,
      };
    });

    // A bare array. There is deliberately no cursor to return.
    return ok(items);
  });

  mock
    .onGet(new RegExp(`${ROOT}/moderation/history/[^/]+/[^/?]+(\\?.*)?$`))
    .reply((config) => {
      const parts = segments(config.url);
      const contentId = parts[parts.length - 1];
      const contentType = parts[parts.length - 2];

      return ok(
        decisions.filter(
          (decision) =>
            decision.contentType.toLowerCase() === contentType.toLowerCase() &&
            decision.contentId === contentId
        )
      );
    });

  mock.onPost(new RegExp(`${ROOT}/moderation/decisions$`)).reply((config) => {
    const payload = body(config);

    const contentType = text(payload.contentType);
    const contentId = text(payload.contentId);
    const action = text(payload.action);

    if (!contentType || !contentId) {
      return validation('community.moderation.content-required', "'Content' must not be empty.");
    }
    if (!action || !MODERATION_ACTIONS.includes(action)) {
      return validation(
        'community.moderation.action-invalid',
        `'${String(action)}' is not a moderation action.`
      );
    }

    // A decision resolves the reports it was made about.
    for (const report of reports) {
      if (
        report.contentType.toLowerCase() === contentType.toLowerCase() &&
        report.contentId === contentId
      ) {
        report.status = 'resolved';
      }
    }

    if (action === 'remove') {
      const post = posts.get(contentId);
      if (post) post.isDeleted = true;
    }

    const decision: WireDecision = {
      decisionId: newId(),
      contentType,
      contentId,
      action,
      reason: text(payload.reason),
      reportId: text(payload.reportId),
      moderatorId: DEV_MEMBER_ID,
      // Property 14. Hardcoded null.
      moderatorName: null,
      createdAt: new Date().toISOString(),
    };

    decisions.push(decision);
    return created(decision);
  });

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  //
  // Not `/api/v1/bookmarks`. That prefix belongs to a separate module.

  mock.onGet(new RegExp(`${ROOT}/bookmarks/collections(\\?.*)?$`)).reply(() => {
    const all = [...bookmarks.values()];

    const collections: WireBookmarkCollection[] = folders.map((folder) => {
      const items = all.filter((bookmark) => bookmark.folderId === folder.folderId);
      return {
        folderId: folder.folderId,
        name: folder.name,
        glyph: folder.glyph,
        itemCount: items.length,
        items,
        updatedAt: items.length > 0 ? items[items.length - 1].createdAt : folder.createdAt,
      };
    });

    // The un-foldered collection carries a **null** `folderId`. It is not a
    // folder and there is no route that creates it — a bookmark saved without a
    // folder lands here and, since no route moves a bookmark between folders,
    // stays here.
    const loose = all.filter((bookmark) => bookmark.folderId === null);
    if (loose.length > 0 || folders.length === 0) {
      collections.unshift({
        folderId: null,
        name: 'Saved',
        glyph: null,
        itemCount: loose.length,
        items: loose,
        updatedAt: loose.length > 0 ? loose[loose.length - 1].createdAt : null,
      });
    }

    // A bare array.
    return ok(collections);
  });

  mock.onPost(new RegExp(`${ROOT}/bookmarks/folders$`)).reply((config) => {
    const payload = body(config);
    const name = text(payload.name);

    if (!name || name.trim().length === 0) {
      return validation('community.bookmark.folder-name-required', "'Name' must not be empty.");
    }

    const folder: WireBookmarkFolder = {
      folderId: newId(),
      name: name.trim(),
      glyph: text(payload.glyph),
      createdAt: new Date().toISOString(),
    };

    folders.push(folder);
    return created(folder);
  });

  mock.onPost(new RegExp(`${ROOT}/bookmarks$`)).reply((config) => {
    const payload = body(config);

    const contentType = text(payload.contentType);
    const contentId = text(payload.contentId);

    if (!contentType || !contentId) {
      return validation('community.bookmark.content-required', "'Content' must not be empty.");
    }

    const key = contentKey(contentType, contentId);
    const existing = bookmarks.get(key);

    // Saving something already saved is not a conflict; the existing record
    // comes back. Only the folder is fixed at creation — there is no move route.
    if (existing) return created(existing);

    const bookmarkId = newId();
    const bookmark: WireBookmark = {
      bookmarkId,
      // Property 7. The same value under the older name.
      savedId: bookmarkId,
      contentType,
      contentId,
      folderId: text(payload.folderId),
      note: text(payload.note),
      createdAt: new Date().toISOString(),
    };

    bookmarks.set(key, bookmark);
    return created(bookmark);
  });

  mock.onDelete(new RegExp(`${ROOT}/bookmarks/[^/]+/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const contentId = parts[parts.length - 1];
    const contentType = parts[parts.length - 2];

    bookmarks.delete(contentKey(contentType, contentId));

    // 200 with `data: null`. Unsaving something that was never saved is a 200 —
    // unlike unfollowing, which is a 404. The two removals do not behave alike.
    return ok(null);
  });

  // ── Follows ───────────────────────────────────────────────────────────────

  /**
   * `POST /community/follows/{targetId}` — **200**.
   *
   * `targetType` is a **body** field here and a **query parameter** on the
   * DELETE. Same fact, two transports, and each route ignores the other's.
   *
   * Property 5: `SetMuted(request.Muted)` is applied **unconditionally**, and an
   * absent body deserialises to `muted: false`. So a bare re-POST on a follow
   * that was muted turns the mute off — which is why the client requires the
   * caller to state `muted` rather than defaulting it.
   */
  mock.onPost(new RegExp(`${ROOT}/follows/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const targetId = parts[parts.length - 1];

    const payload = body(config);
    const declaredType = text(payload.targetType);

    if (declaredType !== null && !FOLLOW_TARGET_TYPES.includes(declaredType)) {
      return validation(
        'community.follow.target-type-invalid',
        `'${declaredType}' is not a follow target type.`
      );
    }

    const targetType = declaredType ?? 'member';
    const key = `${targetType}|${targetId}`;
    const existing = follows.get(key);

    // Property 5. Unconditional, and `undefined` becomes `false`.
    const muted = payload.muted === true;

    const record: StoredFollow = {
      targetType,
      targetId,
      muted,
      followedAt: existing?.followedAt ?? new Date().toISOString(),
    };

    follows.set(key, record);

    const response: WireFollow = {
      targetType,
      targetId,
      isFollowing: true,
      muted,
      followerCount: 1,
      followedAt: record.followedAt,
    };

    // 200, not 201.
    return ok(response);
  });

  /**
   * `DELETE /community/follows/{targetId}?targetType=` — **200, or 404**.
   *
   * Property 2. Unfollowing something you do not follow is a **failure**. Every
   * other removal in this module is idempotent; this one is not, so a retry
   * after a successful-but-unacknowledged call fails and an "undo" loop reports
   * an error for an action that already happened.
   */
  mock.onDelete(new RegExp(`${ROOT}/follows/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const targetId = parts[parts.length - 1];
    const targetType = query(config, 'targetType') ?? 'member';

    const key = `${targetType}|${targetId}`;
    const existing = follows.get(key);

    if (!existing) return followNotFound();

    follows.delete(key);

    const response: WireFollow = {
      targetType,
      targetId,
      isFollowing: false,
      muted: false,
      followerCount: 0,
      followedAt: null,
    };

    return ok(response);
  });

  // ── Feeds ─────────────────────────────────────────────────────────────────

  /**
   * A declared feed key with **no provider registered**.
   *
   * `search` is in the enum and binds happily; nothing serves it. 404 on every
   * deployment, and 404 here — registered before the general feed pattern so it
   * cannot be answered by accident.
   */
  mock.onGet(new RegExp(`${ROOT}/feeds/search(\\?.*)?$`)).reply(() =>
    notFound('community.feed.not-found', 'That feed does not exist.')
  );

  mock.onGet(new RegExp(`${ROOT}/feeds/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const feedKey = parts[parts.length - 1];

    if (!FEED_KEYS.includes(feedKey)) {
      return notFound('community.feed.not-found', `'${feedKey}' is not a feed.`);
    }

    const ranking = query(config, 'ranking') ?? 'chronological';
    if (!RANKING_KEYS.includes(ranking)) {
      return validation('community.feed.ranking-invalid', `'${ranking}' is not a ranking.`);
    }

    const limit = clampLimit(query(config, 'limit'));
    // Property 4. Unreadable is page one, at 200.
    const offset = decodeCursor(query(config, 'cursor'));

    const ordered = rank(feedCandidates(feedKey, config), ranking);
    const window = ordered.slice(offset, offset + limit);
    const nextOffset = offset + window.length;
    const hasMore = nextOffset < ordered.length;

    const feed: WireFeed = {
      feedKey,
      ranking,
      // Property 16. `items`, like the platform envelope — which is why
      // `readPage` finds the rows here and not on a comment thread.
      items: window.map(toWirePost),
      nextCursor: hasMore ? encodeCursor(nextOffset) : null,
      hasMore,
      // Property 16. `totalAvailable`, which `readPage` reads as `totalCount`
      // and therefore reports as null.
      totalAvailable: ordered.length,
      generatedAt: new Date().toISOString(),
    };

    return ok(feed);
  });

  // ── Content-scoped comments, reactions and shares ─────────────────────────

  mock
    .onGet(new RegExp(`${ROOT}/content/[^/]+/[^/]+/comments(\\?.*)?$`))
    .reply((config) => {
      const parts = segments(config.url);
      // .../content/{contentType}/{contentId}/comments
      const contentId = parts[parts.length - 2];
      const contentType = parts[parts.length - 3];

      return ok(
        threadFor(contentType, contentId, query(config, 'cursor'), clampLimit(query(config, 'limit')))
      );
    });

  mock.onPost(new RegExp(`${ROOT}/content/[^/]+/[^/]+/comments$`)).reply((config) => {
    const parts = segments(config.url);
    const contentId = parts[parts.length - 2];
    const contentType = parts[parts.length - 3];

    return addComment(config, contentType, contentId, null);
  });

  mock.onPost(new RegExp(`${ROOT}/content/[^/]+/[^/]+/reactions$`)).reply((config) => {
    const parts = segments(config.url);
    const contentId = parts[parts.length - 2];
    const contentType = parts[parts.length - 3];

    return applyReaction(config, contentType, contentId);
  });

  mock
    .onDelete(new RegExp(`${ROOT}/content/[^/]+/[^/]+/reactions/[^/?]+(\\?.*)?$`))
    .reply((config) => {
      const parts = segments(config.url);
      const reactionKey = parts[parts.length - 1];
      const contentId = parts[parts.length - 3];
      const contentType = parts[parts.length - 4];

      return removeReaction(contentType, contentId, reactionKey);
    });

  mock.onPost(new RegExp(`${ROOT}/content/[^/]+/[^/]+/shares$`)).reply((config) => {
    const parts = segments(config.url);
    const contentId = parts[parts.length - 2];
    const contentType = parts[parts.length - 3];

    return addShare(config, contentType, contentId);
  });

  // ── Comment-scoped routes ─────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/comments/[^/]+/replies$`)).reply((config) => {
    const parts = segments(config.url);
    const parentId = parts[parts.length - 2];

    const parent = comments.get(parentId);
    if (!parent) return commentNotFound();

    return addComment(config, parent.contentType, parent.contentId, parent);
  });

  mock.onPut(new RegExp(`${ROOT}/comments/[^/]+/pin$`)).reply((config) => {
    const parts = segments(config.url);
    const commentId = parts[parts.length - 2];

    const comment = comments.get(commentId);
    if (!comment) return commentNotFound();

    const payload = body(config);
    comment.isPinned = payload.pinned === true;

    // `data: null` at 200. Nothing to write into a cache.
    return ok(null);
  });

  mock.onPut(new RegExp(`${ROOT}/comments/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const commentId = parts[parts.length - 1];

    const comment = comments.get(commentId);
    if (!comment) return commentNotFound();

    const payload = body(config);
    const refusal = refuseCommentText(payload);
    if (refusal) return refusal;

    comment.body = String(payload.body);
    comment.isEdited = true;
    comment.updatedAt = new Date().toISOString();

    return ok(toWireComment(comment));
  });

  mock.onDelete(new RegExp(`${ROOT}/comments/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const commentId = parts[parts.length - 1];

    const comment = comments.get(commentId);
    if (!comment) return commentNotFound();

    // Property 13. **Tombstoned, not removed.** The row survives so its replies
    // keep a parent, and it comes back on the next read with an empty body. A
    // client that spliced it out of its cached tree would take every reply under
    // it off the screen.
    comment.isTombstoned = true;
    comment.body = '';
    comment.updatedAt = new Date().toISOString();

    return ok(null);
  });

  // ── Post-scoped routes ────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/posts/[^/]+/comments(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 2];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    return ok(
      threadFor('post', postId, query(config, 'cursor'), clampLimit(query(config, 'limit')))
    );
  });

  mock.onPost(new RegExp(`${ROOT}/posts/[^/]+/comments$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 2];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    return addComment(config, 'post', postId, null);
  });

  mock.onPost(new RegExp(`${ROOT}/posts/[^/]+/reactions$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 2];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    return applyReaction(config, 'post', postId);
  });

  mock
    .onDelete(new RegExp(`${ROOT}/posts/[^/]+/reactions/[^/?]+(\\?.*)?$`))
    .reply((config) => {
      const parts = segments(config.url);
      const reactionKey = parts[parts.length - 1];
      const postId = parts[parts.length - 3];

      const post = posts.get(postId);
      if (!post || post.isDeleted) return postNotFound();

      return removeReaction('post', postId, reactionKey);
    });

  mock.onPost(new RegExp(`${ROOT}/posts/[^/]+/shares$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 2];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    post.shareCount += 1;
    return addShare(config, 'post', postId);
  });

  mock.onGet(new RegExp(`${ROOT}/posts/[^/]+/revisions(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 2];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    // A bare array. No cursor and no total — revisions are bounded by how many
    // times one member edited one post.
    return ok(post.revisions);
  });

  mock.onPut(new RegExp(`${ROOT}/posts/[^/]+/pin$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 2];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    const payload = body(config);
    post.isPinned = payload.pinned === true;

    // `data: null` at 200. The pinned post is **not** returned, so a caller has
    // nothing to write into its cache and must invalidate.
    return ok(null);
  });

  /**
   * `POST /community/posts/{postId}/poll/votes` — **200, not 201**.
   *
   * A vote is not a resource; the answer is the poll's new state. Which may
   * still be entirely null — a poll with `resultVisibility: 'afterClose'` hides
   * its counts from the member who just voted in it.
   */
  mock.onPost(new RegExp(`${ROOT}/posts/[^/]+/poll/votes$`)).reply((config) => {
    const parts = segments(config.url);
    // .../posts/{postId}/poll/votes
    const postId = parts[parts.length - 3];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();
    if (!post.poll) return notFound('community.poll.not-found', 'That post has no poll.');

    const payload = body(config);
    const optionIds = Array.isArray(payload.optionIds)
      ? payload.optionIds.filter((value): value is string => typeof value === 'string')
      : [];

    if (optionIds.length === 0) {
      return validation('community.poll.option-required', "'Option Ids' must not be empty.");
    }
    if (!post.poll.allowsMultiple && optionIds.length > 1) {
      return validation(
        'community.poll.single-choice',
        'That poll accepts one answer.'
      );
    }

    const known = new Set(post.poll.options.map((option) => option.optionId));
    if (optionIds.some((optionId) => !known.has(optionId))) {
      return validation('community.poll.option-invalid', 'That is not an option on this poll.');
    }

    // Re-voting replaces rather than accumulates.
    for (const previous of post.poll.selectedOptionIds) {
      const option = post.poll.options.find((candidate) => candidate.optionId === previous);
      if (option) option.voteCount = Math.max(0, option.voteCount - 1);
    }

    for (const optionId of optionIds) {
      const option = post.poll.options.find((candidate) => candidate.optionId === optionId);
      if (option) option.voteCount += 1;
    }

    post.poll.selectedOptionIds = optionIds;

    // 200.
    return ok(pollFor(post));
  });

  // ── The post collection ───────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/posts$`)).reply((config) => {
    const payload = body(config);

    const refusal = refusePostText(payload);
    if (refusal) return refusal;

    const now = new Date();
    // **Defaults to true.** A client that omitted it expecting a draft
    // publishes.
    const publish = payload.publish !== false;

    const postId = newId();
    const postBody = String(payload.body);

    const expiresInHours =
      typeof payload.expiresInHours === 'number' && Number.isFinite(payload.expiresInHours)
        ? payload.expiresInHours
        : null;

    const attachments = Array.isArray(payload.attachments)
      ? payload.attachments
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
          .map((entry, index): WireAttachment => ({
            attachmentId: newId(),
            kind: String(entry.kind ?? 'unknown'),
            mediaId: text(entry.mediaId),
            url: text(entry.url),
            role: text(entry.role),
            caption: text(entry.caption),
            position: index,
          }))
      : [];

    const pollPayload = payload.poll;
    let poll: StoredPoll | null = null;

    if (pollPayload && typeof pollPayload === 'object') {
      const record = pollPayload as Record<string, unknown>;
      const question = text(record.question);
      const options = Array.isArray(record.options) ? record.options : [];

      if (!question || options.length === 0) {
        return validation('community.poll.invalid', 'A poll needs a question and options.');
      }

      poll = {
        pollId: newId(),
        question,
        options: options
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
          .map((entry) => ({
            optionId: newId(),
            label: String(entry.label ?? ''),
            imageMediaId: text(entry.imageMediaId),
            voteCount: 0,
          })),
        allowsMultiple: record.allowsMultiple === true,
        resultVisibility: text(record.resultVisibility) ?? 'always',
        closesAt: text(record.closesAt),
        selectedOptionIds: [],
      };
    }

    const stored: StoredPost = {
      postId,
      title: text(payload.title),
      body: postBody,
      category: text(payload.category),
      urgency: text(payload.urgency),
      visibility: text(payload.visibility) ?? 'public',
      audienceCountryCode: text(payload.audienceCountryCode),
      audienceAreaId: text(payload.audienceAreaId),
      visibilityRuleId: text(payload.visibilityRuleId),
      countryCode: text(payload.countryCode),
      areaId: text(payload.areaId),
      cityName: text(payload.cityName),
      areaName: text(payload.areaName),
      latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
      longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
      authorId: DEV_MEMBER_ID,
      organizationId: text(payload.publishAsOrganizationId),
      attachments,
      poll,
      isPinned: false,
      isEdited: false,
      isPublished: publish,
      // Property 12. No review provider is configured on this deployment, so
      // nothing looked at it.
      reviewStatus: 'unavailable',
      versionNumber: 1,
      revisions: [],
      hashtags: [...postBody.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]),
      createdAt: now.toISOString(),
      updatedAt: null,
      publishedAt: publish ? now.toISOString() : null,
      expiresAt:
        expiresInHours !== null
          ? new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString()
          : null,
      isDeleted: false,
      shareCount: 0,
    };

    posts.set(postId, stored);

    // 201.
    return created(toWirePost(stored));
  });

  /**
   * **There is no `GET /community/posts`.**
   *
   * No list route for posts exists at all — a post is reached through a feed or
   * by id. ASP.NET answers **405** for a path that matches with a method that
   * does not, which is what this returns: a client that grows a post list finds
   * out in development rather than in a release.
   */
  mock.onGet(new RegExp(`${ROOT}/posts(\\?.*)?$`)).reply(() => [
    405,
    {
      type: 'https://diaspora.app/errors/method-not-allowed',
      title: 'Method not allowed',
      status: 405,
      detail: 'There is no list route for posts. Read a feed, or a post by id.',
      code: 'method-not-allowed',
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: 'dev',
    },
  ]);

  // ── One post ──────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/posts/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 1];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    return ok(toWirePost(post));
  });

  mock.onPut(new RegExp(`${ROOT}/posts/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 1];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    const payload = body(config);
    const refusal = refusePostText(payload);
    if (refusal) return refusal;

    // The revision records the version being replaced.
    const summary = text(payload.changeSummary);

    post.revisions.push({
      revisionId: newId(),
      postId,
      versionNumber: post.versionNumber,
      title: post.title,
      content: post.body,
      // Property 8. **A `string` came in and a `string[]` goes out.** The server
      // splits the sentence it was sent into the lines it stores; a client that
      // declared one type for both would render `[object Object]` or iterate a
      // sentence one character at a time.
      changeSummary:
        summary && summary.trim().length > 0
          ? summary
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
          : [],
      createdBy: post.authorId,
      createdAt: new Date().toISOString(),
    });

    post.body = String(payload.body);
    if (payload.title !== undefined) post.title = text(payload.title);
    post.isEdited = true;
    post.versionNumber += 1;
    post.updatedAt = new Date().toISOString();

    if (Array.isArray(payload.attachments)) {
      post.attachments = payload.attachments
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry, index): WireAttachment => ({
          attachmentId: newId(),
          kind: String(entry.kind ?? 'unknown'),
          mediaId: text(entry.mediaId),
          url: text(entry.url),
          role: text(entry.role),
          caption: text(entry.caption),
          position: index,
        }));
    }

    return ok(toWirePost(post));
  });

  mock.onDelete(new RegExp(`${ROOT}/posts/[^/?]+(\\?.*)?$`)).reply((config) => {
    const parts = segments(config.url);
    const postId = parts[parts.length - 1];

    const post = posts.get(postId);
    if (!post || post.isDeleted) return postNotFound();

    post.isDeleted = true;

    // **200 with `data: null`**, not 204. A client checking for 204 sees a
    // success it does not recognise.
    return ok(null);
  });
}

// ── Shared handler bodies ────────────────────────────────────────────────────

/**
 * `POST` on any of the three comment-creating routes.
 *
 * `CreateCommentRequest.contentType` and `.contentId` are on the contract and
 * are **never read** by a route that carries the target in its path — which is
 * all three of them. This handler takes the target from the route, exactly as
 * the server does, so a client that sent a *different* target in the body finds
 * out here that the route wins.
 */
function addComment(
  config: { data?: unknown },
  contentType: string,
  contentId: string,
  parent: StoredComment | null
): Reply {
  const payload = body(config);

  const refusal = refuseCommentText(payload);
  if (refusal) return refusal;

  // The parent comes from the route on `/replies`, and from the body otherwise.
  const declaredParentId = text(payload.parentCommentId);
  const resolvedParent =
    parent ?? (declaredParentId ? (comments.get(declaredParentId) ?? null) : null);

  if (declaredParentId && !parent && !resolvedParent) return commentNotFound();

  const commentId = newId();

  comments.set(commentId, {
    commentId,
    // From the route. The body's own `contentType`/`contentId` are ignored.
    contentType,
    contentId,
    parentCommentId: resolvedParent?.commentId ?? null,
    quotedCommentId: text(payload.quotedCommentId),
    body: String(payload.body),
    authorId: DEV_MEMBER_ID,
    depth: resolvedParent ? resolvedParent.depth + 1 : 0,
    isTombstoned: false,
    isPinned: false,
    isEdited: false,
    attachmentMediaId: text(payload.attachmentMediaId),
    // Property 12.
    reviewStatus: 'unavailable',
    createdAt: new Date().toISOString(),
    updatedAt: null,
  });

  // 201.
  return created(toWireComment(comments.get(commentId) as StoredComment));
}

/**
 * `POST` on either reaction route — **200, not 201**.
 *
 * `ReactRequest` also declares `contentType` and `contentId` and **never reads
 * them**: the route always wins. This handler reads only `reactionKey`, so a
 * client that populated the other two and expected them to select something
 * finds out here.
 */
function applyReaction(
  config: { data?: unknown },
  contentType: string,
  contentId: string
): Reply {
  const payload = body(config);
  const reactionKey = text(payload.reactionKey);

  if (!isKnownReaction(reactionKey)) {
    return validation(
      'community.reaction.key-invalid',
      `'${String(reactionKey)}' is not a reaction.`
    );
  }

  const key = contentKey(contentType, contentId);
  const counts = reactionCounts.get(key) ?? new Map<string, number>();
  reactionCounts.set(key, counts);

  const previous = myReactions.get(key);

  // One reaction per member per item: choosing a second replaces the first.
  if (previous && previous !== reactionKey) {
    counts.set(previous, Math.max(0, (counts.get(previous) ?? 0) - 1));
  }

  if (previous !== reactionKey) {
    counts.set(reactionKey as string, (counts.get(reactionKey as string) ?? 0) + 1);
    myReactions.set(key, reactionKey as string);
  }

  const response: WireReaction = {
    contentType,
    contentId,
    // Property 10. **`summary`** here; the identical record is **`reactions`**
    // on a post or a comment.
    summary: summaryFor(contentType, contentId),
    myReactionKey: myReactions.get(key) ?? null,
  };

  // 200.
  return ok(response);
}

/**
 * `DELETE` on either reaction route — **200**, always.
 *
 * Un-reacting to something you never reacted to is **not** a 404. A reaction is
 * set membership rather than a resource, so removing an absent one is a no-op
 * that answers with the current tally. That is the opposite of the follow
 * routes, where the same shape of call **is** a 404 — which is why the two are
 * not written as one function.
 */
function removeReaction(contentType: string, contentId: string, reactionKey: string): Reply {
  const key = contentKey(contentType, contentId);
  const counts = reactionCounts.get(key);
  const mine = myReactions.get(key);

  if (counts && mine === reactionKey) {
    counts.set(reactionKey, Math.max(0, (counts.get(reactionKey) ?? 0) - 1));
    myReactions.delete(key);
  }

  const response: WireReaction = {
    contentType,
    contentId,
    summary: summaryFor(contentType, contentId),
    myReactionKey: myReactions.get(key) ?? null,
  };

  return ok(response);
}

/**
 * `POST` on either share route — **201**.
 *
 * Property 15. **`quotePostId` is null**, including for `kind: 'quote'`. Both
 * the request and the response document a quote share that creates a post
 * carrying the original, and no handler ever creates one. A UI that promised the
 * member a quote post would have nowhere to send them.
 */
function addShare(config: { data?: unknown }, contentType: string, contentId: string): Reply {
  const payload = body(config);
  const kind = text(payload.kind);

  if (!kind || !SHARE_KINDS.includes(kind)) {
    return validation('community.share.kind-invalid', `'${String(kind)}' is not a share kind.`);
  }

  const share: WireShare = {
    shareId: newId(),
    contentType,
    contentId,
    kind,
    destination: text(payload.destination),
    recipientId: text(payload.recipientId),
    message: text(payload.message),
    // Property 15. Always null, for every kind, on every deployment.
    quotePostId: null,
    createdAt: new Date().toISOString(),
  };

  return created(share);
}
