// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community social graph (Remediation Wave D-2)
//
// A typed mirror of `Diaspora.Modules.Community`'s V1 contracts, named as the
// wire names them. Thirty-six routes under `/api/v1/community` — posts,
// comments, reactions, feeds, bookmarks, shares, follows, moderation and
// hashtag discovery — served by the backend with **zero** frontend consumers
// until this wave.
//
// Nothing is renamed at the boundary. Renaming is how the two repositories
// stopped agreeing in the first place, so where the wire says `reasonCode` this
// file says `reasonCode`, and the translation from a request's `reason` to a
// response's `reasonCode` happens once, visibly, in `lib/community-social-api.ts`.
//
// ── The eight things worth knowing before reading further ────────────────────
//
// **1. Enum values in this module are camelCase.** `marketPrices`,
// `verifiedMembers`, `hateSpeech`, `afterVoting`, `personalData`,
// `communityVerified`. That is the opposite of `Diaspora.Modules.Recommendations`,
// whose `targetType` is PascalCase, and the two modules are consumed side by
// side on the same screens. There is exactly **one** exception, and it is in
// this module rather than the other one: `capabilities.reactions[].appliesTo[]`
// is PascalCase (`"Post"`, `"Guide"`) because that list is persisted as a joined
// string and split verbatim, bypassing the wire-name converter that camel-cases
// every other content-type string on the same response. See
// `CommunityReactionCapability.appliesTo`.
//
// **2. Three facts arrive under two names each.** `postId` is also `updateId`;
// `body` is also `description`; `bookmarkId` is also `savedId`. They are not
// different identifiers or different text — they are the same value emitted
// twice so that an older consumer and a newer one both bind. They are declared
// here as the same type in the same object and must never be modelled as
// distinct, because a client that wrote to one and read the other would work
// until the compatibility alias is dropped.
//
// **3. `changeSummary` changes type across the round trip.** It is `string?` on
// `UpdatePostRequest` and `string[]` on `PostRevisionResponse` — the server
// splits the sentence you sent into the lines it stores. A client that declared
// one type for both would compile and then render `[object Object]` or iterate a
// sentence character by character.
//
// **4. `reason` in, `reasonCode` out.** `CreateReportRequest.reason` becomes
// `ReportResponse.reasonCode`. Reading `response.reason` is `undefined`, which
// renders as an empty chip rather than an error.
//
// **5. The reaction summary has two names depending on where it hangs.**
// `ReactionResponse.summary` and `CommunityPostResponse.reactions` /
// `CommentResponse.reactions` are the same record. `readReactionSummary` in the
// client is the one function that knows this.
//
// **6. `CommentThreadResponse` and `FeedResponse` are not `CursorPagedResult`.**
// The thread names its rows `comments` and its count `totalCount`; the feed
// names its rows `items` and its count `totalAvailable`. Neither matches the
// platform's paged envelope, which is why `platform-envelope.ts`'s `readPage`
// cannot be pointed at them unchanged — see the note on `CommentThreadResponse`.
//
// **7. Comments are recursive and deleted ones are still delivered.** `replies`
// is `CommentResponse[]` all the way down. `depth` is the true depth and
// `renderedDepth` is clamped at 6 for indentation; a deleted comment arrives
// with an **empty `body` and `isTombstoned: true`** rather than being omitted,
// because removing it would orphan its replies.
//
// **8. Several fields are structurally present and permanently null.**
// `ShareResponse.quotePostId`, and the four display names on the moderation
// contracts. They are typed as `null` rather than `string | null` where the
// server hardcodes them, so a screen cannot be written against a value that will
// never arrive.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An open vocabulary.
 *
 * The named members are the values this client has seen on the wire and can
 * spell correctly; the `string` arm is there because the server's enum is wider
 * than this list and **`GET /community/capabilities` is the authority**. A
 * closed union here would turn "the platform added a reaction" into a compile
 * error in a client that should simply render it.
 *
 * `Record<never, never>` rather than `{}` for the intersection: identical to the
 * compiler, and it does not trip the empty-object-type lint rule.
 */
type Open<TKnown extends string> = TKnown | (string & Record<never, never>);

// ── Vocabularies ─────────────────────────────────────────────────────────────

/**
 * What a piece of content is, as this module spells it.
 *
 * **camelCase** — property 1. Used in three places that look interchangeable and
 * are not: the `{contentType}` route segment, the `contentType` body field on
 * requests that also carry it in the path (where it is ignored — see
 * `ReactRequest`), and `capabilities.contentTypes`.
 *
 * It is deliberately **not** the same vocabulary as
 * `capabilities.reactions[].appliesTo[]`, which is PascalCase for the reason in
 * property 1 and is typed separately below so the two cannot be mixed up.
 */
export type CommunityContentType = Open<
  | 'post'
  | 'comment'
  | 'guide'
  | 'event'
  | 'listing'
  | 'job'
  | 'organization'
  | 'provider'
  | 'marketplace'
  | 'housing'
  // `message` was added when `MessageContentSource` claimed it: until then a
  // member could report a guide, a listing, a property, an event, a post and a
  // comment — and not a direct message, which is where harassment happens.
  //
  // `member` is in the wire enum and is **claimed by nothing**, so a report about
  // a person is still refused. It is listed here because it is a name the server
  // parses, not because it resolves — `ReportModal` maps it to `null`.
  | 'member'
  | 'message'
>;

/**
 * `capabilities.reactions[].appliesTo[]` — **PascalCase**, and the only
 * PascalCase strings in this module.
 *
 * Property 1's single exception. The server stores this list joined into one
 * column and splits it back out verbatim on read, so it never passes through the
 * naming converter that camel-cases `contentType` everywhere else on the same
 * response. A client that lower-cased these to match `CommunityContentType`
 * would find no reactions apply to anything; a client that up-cased
 * `contentType` to match these would 404 on every route segment.
 *
 * `capabilityAppliesTo` in the client is the one place the two are reconciled.
 */
export type CommunityCapabilityContentType = Open<
  'Post' | 'Comment' | 'Guide' | 'Event' | 'Listing' | 'Job' | 'Organization' | 'Provider'
>;

/**
 * A reaction's key. camelCase.
 *
 * Open, and read from `capabilities.reactions` rather than hardcoded: the set is
 * server configuration, and a client that shipped its own list would either
 * offer a reaction the server refuses or hide one it accepts.
 */
export type CommunityReactionKey = Open<'like' | 'celebrate' | 'support' | 'insightful'>;

/**
 * What a reaction asserts about the content, as opposed to what it is called.
 *
 * `corroborating` is the one that moves `confirmationCount` and drives a post
 * towards `communityVerified`; `disputing` is the one that can flip it to
 * `disputed`. Both are open because the catalogue is server-owned.
 */
export type CommunityReactionSentiment = Open<
  'positive' | 'corroborating' | 'disputing' | 'negative' | 'neutral'
>;

/**
 * A post's category. camelCase — `marketPrices`, not `market_prices`.
 *
 * Open for the same reason as the reaction keys. The camelCase spelling is the
 * trap: every other list surface in this application uses kebab-cased category
 * slugs, and `market-prices` here is a 400 rather than a near miss.
 */
export type CommunityPostCategory = Open<
  'general' | 'marketPrices' | 'safetyAlert' | 'jobLead' | 'housingTip' | 'question'
>;

/** How urgent the author says a post is. camelCase. */
/**
 * How urgent a post is.
 *
 * These are `UrgencyLevel` in `Diaspora.Modules.Community`, camel-cased by
 * `CommunityWireNames.ToWire`: `Low | Normal | Urgent | Emergency`.
 *
 * This union used to read `'normal' | 'elevated' | 'urgent' | 'emergency'` —
 * inventing `elevated` and omitting `low`. `elevated` was not a harmless extra:
 * `CreatePostCommandHandler` parses with
 * `CommunityWireNames.ParseOr(payload.Urgency, UrgencyLevel.Normal)`, so a
 * member who chose **Elevated** had their post silently filed as **Normal**.
 * Urgency drives `ConfirmationThresholds` — Emergency needs 10 confirmations,
 * Normal 3 — so the wrong level also changes how the post gets verified.
 */
export type CommunityPostUrgency = Open<'low' | 'normal' | 'urgent' | 'emergency'>;

/**
 * Who can see a post. camelCase — `verifiedMembers`, `communityVerified`.
 *
 * **`custom` is unusable.** It exists in the enum and binds, but it means "apply
 * the visibility rule named by `visibilityRuleId`", and **there is no route that
 * creates a visibility rule** — the whole rules surface is absent from the
 * module. So a post created with `custom` names a rule that cannot exist. Do not
 * offer it in a picker; `SELECTABLE_POST_VISIBILITIES` in the client is the list
 * a picker may render.
 */
export type CommunityPostVisibility = Open<
  'public' | 'followers' | 'verifiedMembers' | 'communityVerified' | 'custom'
>;

/**
 * When a poll's results become visible. camelCase — `afterVoting`.
 *
 * Drives property 10 on `PollOptionResponse`: while results are hidden the
 * counts arrive as **`null`, not `0`**.
 */
export type PollResultVisibility = Open<'always' | 'afterVoting' | 'afterClose'>;

/** How something was shared. camelCase. */
export type ShareKind = Open<'link' | 'repost' | 'quote' | 'direct' | 'external'>;

/** What a follow points at. camelCase. */
export type FollowTargetType = Open<'member' | 'organization' | 'hashtag' | 'community'>;

/**
 * Why something was reported. camelCase — `misinformation`, `personalData`.
 *
 * Open, and the authoritative list is `GET /community/reports/reasons` (or
 * `capabilities.reportReasons`, which carries the same rows). A hardcoded picker
 * here would drift from the server's list the first time a reason is added, and
 * a reason the server does not know is a 400 on submit rather than a warning at
 * build time.
 *
 * The union below is the seeded deployment's own list, taken from the recording.
 * It previously named `hateSpeech` and `scam`, which no deployment serves, and
 * omitted `inappropriate`, `outdated` and `copyright`, which every one does —
 * so the two members a test happened to assert were the two that did not exist.
 * `Open<>` is what keeps a later addition from being a compile error rather than
 * a 400.
 */
export type CommunityReportReason = Open<
  | 'misinformation'
  | 'spam'
  | 'harassment'
  | 'inappropriate'
  | 'outdated'
  | 'copyright'
  | 'personalData'
  | 'other'
>;

/** What a moderator did. camelCase. */
export type ModerationAction = Open<'dismiss' | 'warn' | 'hide' | 'remove' | 'escalate' | 'restore'>;

/**
 * What the automated safety review concluded.
 *
 * **`unavailable` is not `clean`.** It means no provider answered — the review
 * did not run, or ran and produced nothing — and it is the value a deployment
 * with no configured provider returns for everything. A screen that rendered a
 * "checked and safe" badge for anything that is not `flagged` would put that
 * badge on content nobody looked at.
 *
 * `shouldRenderSafetyBadge` in the client is the guard. Nothing else in this
 * codebase may branch on this field directly.
 */
export type ContentReviewStatus = Open<'clean' | 'flagged' | 'pending' | 'unavailable'>;

/**
 * The eleven feed keys, closed.
 *
 * Closed rather than open, unlike every vocabulary above, because this one is a
 * **route segment**: `GET /community/feeds/{feedKey}`. A key the server does not
 * know is a 404 rather than a validation message, and a 404 on a tab is a blank
 * screen with no explanation. Compile-time is the right place to catch it.
 *
 * `search` is deliberately absent. It is a declared key with **no provider
 * registered**, so `GET /community/feeds/search` 404s on every deployment. See
 * the client's `COMMUNITY_FEEDS_WITHOUT_PROVIDERS`.
 */
export type CommunityFeedKey =
  | 'home'
  | 'following'
  | 'nearby'
  | 'trending'
  | 'country'
  | 'neighborhood'
  | 'contributor'
  | 'organization'
  | 'saved'
  | 'profile'
  | 'hashtag';

export const COMMUNITY_FEED_KEYS: readonly CommunityFeedKey[] = [
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
] as const;

/**
 * How a feed is ordered.
 *
 * **kebab-case, not camelCase** — `trust-weighted`, not `trustWeighted`. These
 * are configuration keys rather than enum names, so they never pass through the
 * converter that produced every camelCase value above. Sending `trustWeighted`
 * is not a near miss; it is an unknown ranking.
 */
export type CommunityFeedRanking =
  | 'chronological'
  | 'trending'
  | 'trust-weighted'
  | 'location-weighted';

export const COMMUNITY_FEED_RANKINGS: readonly CommunityFeedRanking[] = [
  'chronological',
  'trending',
  'trust-weighted',
  'location-weighted',
] as const;

// ── Reactions ────────────────────────────────────────────────────────────────

/** One reaction key and how many people used it. */
export interface ReactionCountResponse {
  reactionKey: CommunityReactionKey;
  count: number;
}

/**
 * The reaction tally for one piece of content.
 *
 * Property 5: this record hangs off `ReactionResponse` under the name `summary`
 * and off a post or comment under the name `reactions`. Same shape, two field
 * names, and no way to tell from the type which one you are holding — which is
 * why the client exposes `readReactionSummary` rather than letting each screen
 * reach for whichever name it remembers.
 */
export interface ReactionSummaryResponse {
  totalCount: number;
  counts: ReactionCountResponse[];
  /** The signed-in member's reaction, or null. */
  myReactionKey: CommunityReactionKey | null;
}

/**
 * What all four reaction routes answer — **200, never 201**, including the two
 * that create a reaction.
 *
 * A reaction is a set membership rather than a resource, so adding one that is
 * already there is not a conflict and removing one that is not there is not a
 * 404. Both answer 200 with the current tally.
 */
export interface ReactionResponse {
  contentType: CommunityContentType;
  contentId: string;
  /** Property 5. The same record a post calls `reactions`. */
  summary: ReactionSummaryResponse;
  myReactionKey: CommunityReactionKey | null;
}

// ── Attachments and polls ────────────────────────────────────────────────────

/** One attachment on a create or update request. */
export interface PostAttachmentRequest {
  /** Required. */
  kind: string;
  /** A Media GUID, when the attachment is an uploaded asset. */
  mediaId?: string | null;
  /** An external URL, when it is not. */
  url?: string | null;
  role?: string | null;
  caption?: string | null;
}

export interface PostAttachmentResponse {
  attachmentId: string;
  kind: string;
  mediaId: string | null;
  url: string | null;
  role: string | null;
  caption: string | null;
  position: number;
}

export interface PollOptionRequest {
  label: string;
  imageMediaId?: string | null;
}

export interface CreatePollRequest {
  /** Required. */
  question: string;
  /** Required. */
  options: PollOptionRequest[];
  allowsMultiple: boolean;
  resultVisibility?: PollResultVisibility | null;
  closesAt?: string | null;
}

/**
 * One option on a poll.
 *
 * **`voteCount` and `sharePercent` are `null` — not `0` — while results are
 * hidden.** `resultVisibility: 'afterVoting'` on a poll this member has not
 * voted in returns nulls for every option and for `PollResponse.totalVotes`.
 *
 * That distinction is the whole point of the field. `0` means "nobody chose
 * this", `null` means "you are not allowed to know yet", and a client that
 * coalesced them would draw a bar chart of flat zeros over a poll with hundreds
 * of votes and give a member a reason to distrust the count.
 */
export interface PollOptionResponse {
  optionId: string;
  label: string;
  imageMediaId: string | null;
  /** Null while results are hidden. Never coalesce to 0. */
  voteCount: number | null;
  /** Null while results are hidden. 0–100. */
  sharePercent: number | null;
}

export interface PollResponse {
  pollId: string;
  question: string;
  options: PollOptionResponse[];
  allowsMultiple: boolean;
  resultVisibility: PollResultVisibility;
  closesAt: string | null;
  isClosed: boolean;
  /** Null while results are hidden. See `PollOptionResponse.voteCount`. */
  totalVotes: number | null;
  hasVoted: boolean;
  /** What this member chose. Empty until they vote. */
  selectedOptionIds: string[];
}

/** `POST /community/posts/{postId}/poll/votes` — **200, not 201**. */
export interface CastPollVoteRequest {
  optionIds: string[];
}

// ── Posts ────────────────────────────────────────────────────────────────────

/**
 * `CreatePostRequest`.
 *
 * `publish` **defaults to true** server-side. A client that omitted it expecting
 * a draft would publish. `createDraft` in the client sends `false` explicitly
 * rather than relying on anything.
 *
 * `visibilityRuleId` is present because the field is on the contract and is not
 * usable: see `CommunityPostVisibility`.
 */
export interface CreatePostRequest {
  /** Required. Max 500 characters — see `POST_BODY_MAX_LENGTH`. */
  body: string;
  /** Max 200 characters. */
  title?: string | null;
  category?: CommunityPostCategory | null;
  urgency?: CommunityPostUrgency | null;
  visibility?: CommunityPostVisibility | null;
  audienceCountryCode?: string | null;
  audienceAreaId?: string | null;
  /** Only meaningful with `visibility: 'custom'`, which cannot be created. */
  visibilityRuleId?: string | null;
  countryCode?: string | null;
  areaId?: string | null;
  cityName?: string | null;
  areaName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  expiresInHours?: number | null;
  publishAsOrganizationId?: string | null;
  attachments?: PostAttachmentRequest[] | null;
  poll?: CreatePollRequest | null;
  /** **Defaults to true on the server.** Send `false` for a draft. */
  publish?: boolean;
}

/**
 * `UpdatePostRequest`.
 *
 * Note what is *not* here: category, urgency, visibility, location, expiry and
 * the poll are all absent. An edit changes the words and the attachments and
 * nothing else, so a screen that rendered the full create form for an edit would
 * silently discard every other change the member made.
 */
export interface UpdatePostRequest {
  /** Required. Max 500 characters. */
  body: string;
  title?: string | null;
  /**
   * Property 3. A **`string`** here and a **`string[]`** on
   * `PostRevisionResponse.changeSummary`.
   */
  changeSummary?: string | null;
  attachments?: PostAttachmentRequest[] | null;
}

/** `PUT /community/posts/{postId}/pin` and `/comments/{commentId}/pin`. */
export interface SetPinnedRequest {
  pinned: boolean;
}

/**
 * `CommunityPostResponse`.
 *
 * Property 2 lives here twice: `postId`/`updateId` and `body`/`description` are
 * the same values under two names. Both are declared so a reader of either finds
 * the type says so.
 */
export interface CommunityPostResponse {
  postId: string;
  /**
   * Property 2. **The same value as `postId`.**
   *
   * The module was `CommunityUpdates` before it was `Community`, and the older
   * name is still emitted for consumers that bound to it. It is not a separate
   * identifier and there is nothing to look it up in.
   */
  updateId: string;

  title: string | null;
  body: string;
  /** Property 2. **The same value as `body`.** */
  description: string;

  category: CommunityPostCategory | null;
  urgency: CommunityPostUrgency | null;
  visibility: CommunityPostVisibility;

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
  /** The publishing organisation, when the author posted on its behalf. */
  organizationId: string | null;

  attachments: PostAttachmentResponse[];
  poll: PollResponse | null;

  /** Property 5. The same record `ReactionResponse` calls `summary`. */
  reactions: ReactionSummaryResponse;

  commentCount: number;
  shareCount: number;
  bookmarkCount: number;

  isPinned: boolean;
  isEdited: boolean;
  isPublished: boolean;
  isBookmarked: boolean;

  /**
   * **Zero for anyone who is not the author.**
   *
   * Not "no reports" — "not your business". The server suppresses the figure
   * rather than the field, so a moderation surface built on this would report a
   * clean platform to every moderator who is not also the author of the thing
   * they are reviewing. The moderation queue is where report counts come from.
   */
  reportCount: number;

  /** See `ContentReviewStatus`. `unavailable` is not `clean`. */
  reviewStatus: ContentReviewStatus;

  versionNumber: number;

  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
}

/**
 * `PostRevisionResponse` — one entry in a post's edit history.
 *
 * `GET /community/posts/{postId}/revisions` returns a **bare array**, not a
 * page: no cursor, no total, no envelope object inside `data`. There is no way
 * to ask for more, and none is needed — revisions are bounded by how many times
 * one member edited one post.
 */
export interface PostRevisionResponse {
  revisionId: string;
  postId: string;
  versionNumber: number;
  title: string | null;
  /** The post's body at this version. Named `content` here and `body` there. */
  content: string;
  /**
   * Property 3. **`string[]`**, where `UpdatePostRequest.changeSummary` was a
   * `string`. The server splits what you sent into the lines it stores.
   */
  changeSummary: string[];
  createdBy: string;
  createdAt: string;
}

// ── Comments ─────────────────────────────────────────────────────────────────

/**
 * `CreateCommentRequest`.
 *
 * `contentType` and `contentId` are on the contract and are **ignored by every
 * route that carries them in the path** — `/posts/{postId}/comments`,
 * `/content/{contentType}/{contentId}/comments` and `/comments/{id}/replies`
 * all take the target from the route. They are declared here because the wire
 * declares them; the client never populates them, because populating them
 * suggests they do something.
 */
export interface CreateCommentRequest {
  /** Required. Max 2000 characters — see `COMMENT_BODY_MAX_LENGTH`. */
  body: string;
  /** Ignored on every route that carries it in the path. */
  contentType?: CommunityContentType | null;
  /** Ignored on every route that carries it in the path. */
  contentId?: string | null;
  parentCommentId?: string | null;
  quotedCommentId?: string | null;
  attachmentMediaId?: string | null;
}

export interface UpdateCommentRequest {
  body: string;
}

/**
 * `CommentResponse` — recursive.
 *
 * Property 7. Three things about this record are load-bearing:
 *
 *   * **`replies` is the same type, all the way down.** There is no separate
 *     "reply" contract and no flat list with parent pointers — the server sends
 *     the tree.
 *   * **`depth` and `renderedDepth` are different numbers.** `depth` is the true
 *     depth in the tree; `renderedDepth` is clamped at 6 so a hundred-deep
 *     argument does not indent off the side of a phone. Indent by
 *     `renderedDepth`; count, thread and reply by `depth`.
 *   * **A deleted comment is still delivered.** `isTombstoned: true` and `body`
 *     is the empty string. It is not omitted, because omitting it would orphan
 *     its replies. A screen that rendered `body` unconditionally would show a
 *     blank bubble where "this comment was removed" belongs.
 */
export interface CommentResponse {
  commentId: string;
  contentType: CommunityContentType;
  contentId: string;
  /** Set when the comment hangs off a post. Null for other content types. */
  postId: string | null;
  parentCommentId: string | null;
  quotedCommentId: string | null;

  /** **Empty string when `isTombstoned`.** See the note above. */
  body: string;

  authorId: string;
  /** True depth in the tree. Unbounded. */
  depth: number;
  /** `min(depth, 6)`. For indentation only. */
  renderedDepth: number;
  /** A deleted comment, still delivered so its replies keep their parent. */
  isTombstoned: boolean;
  isPinned: boolean;
  isEdited: boolean;

  attachmentMediaId: string | null;

  /** Property 5. The same record `ReactionResponse` calls `summary`. */
  reactions: ReactionSummaryResponse;

  replies: CommentResponse[];
  replyCount: number;

  reviewStatus: ContentReviewStatus;

  createdAt: string;
  updatedAt: string | null;
}

/**
 * `CommentThreadResponse` — **not** a `CursorPagedResult`.
 *
 * Property 6, and the more dangerous half of it. The platform's paged envelope
 * names its rows `items`; this one names them **`comments`**, and it names its
 * count **`totalCount`** rather than the feed's `totalAvailable`.
 *
 * That matters because `platform-envelope.ts`'s `toPage` recognises a page by
 * `Array.isArray(payload.items)` and falls through to **an empty page** when it
 * does not find one — deliberately, so that a route returning a dashboard does
 * not crash a list screen. Point `readPage` at this record and every comment
 * thread in the application renders as "no comments yet", silently, with no
 * error anywhere. `toCommentPage` in the client is the explicit adapter; nothing
 * may call `readPage` on this shape.
 */
export interface CommentThreadResponse {
  contentType: CommunityContentType;
  contentId: string;
  /** **`comments`, not `items`.** */
  comments: CommentResponse[];
  /** **`totalCount`, not `totalAvailable`.** Top-level comments, not replies. */
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Feeds ────────────────────────────────────────────────────────────────────

/**
 * Everything `GET /community/feeds/{feedKey}` accepts.
 *
 * `limit` defaults to 20 and is clamped to [1, 50] server-side rather than
 * refused, so asking for 200 is not an error — it is 50, silently. `clampLimit`
 * in the client applies the same clamp on the way out so the cache key matches
 * what the server actually did.
 *
 * `includeExpired` defaults to **false**: a post with `expiresAt` in the past is
 * absent from every feed unless asked for.
 */
export interface FeedQuery {
  cursor?: string | null;
  /** Default 20, clamped to [1, 50]. */
  limit?: number | null;
  ranking?: CommunityFeedRanking | null;
  countryCode?: string | null;
  areaId?: string | null;
  cityName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  category?: CommunityPostCategory | null;
  urgency?: CommunityPostUrgency | null;
  hashtag?: string | null;
  /** The contributor, organisation or profile a subject-scoped feed is about. */
  subjectId?: string | null;
  /** Default false. */
  includeExpired?: boolean | null;
}

/**
 * `FeedResponse` — also not a `CursorPagedResult`, but for a milder reason.
 *
 * Property 6's other half. This one *does* name its rows `items`, so
 * `platform-envelope.ts`'s `toPage` recognises it and returns the right rows,
 * the right cursor and the right `hasMore`. What it loses is the count:
 * `toPage` reads `totalCount`, this record spells it **`totalAvailable`**, and
 * the result is `totalCount: null` — which `Page` documents as "the server
 * declined to count" and a screen renders as no figure at all.
 *
 * Losing a number quietly is better than losing every row quietly, but it is
 * still a loss, so `toFeedPage` in the client maps it explicitly rather than
 * letting `readPage` be almost right.
 */
export interface FeedResponse {
  feedKey: CommunityFeedKey;
  ranking: CommunityFeedRanking;
  /** **`items`**, like the platform envelope. */
  items: CommunityPostResponse[];
  nextCursor: string | null;
  hasMore: boolean;
  /** **`totalAvailable`, not `totalCount`.** */
  totalAvailable: number | null;
  generatedAt: string;
}

// ── Bookmarks ────────────────────────────────────────────────────────────────
//
// **These are not `/api/v1/bookmarks`.** A separate Bookmarks module serves that
// prefix with its own contracts, its own folders and its own identifiers. The
// two must never be merged, and a bookmark created here cannot be deleted there.

export interface CreateBookmarkRequest {
  /** Required. */
  contentType: CommunityContentType;
  /** Required. */
  contentId: string;
  folderId?: string | null;
  note?: string | null;
}

export interface CreateBookmarkFolderRequest {
  /** Required. */
  name: string;
  /** An emoji or icon key. */
  glyph?: string | null;
}

export interface BookmarkResponse {
  bookmarkId: string;
  /** Property 2. **The same value as `bookmarkId`.** */
  savedId: string;
  contentType: CommunityContentType;
  contentId: string;
  folderId: string | null;
  note: string | null;
  createdAt: string;
}

export interface BookmarkFolderResponse {
  folderId: string;
  name: string;
  glyph: string | null;
  createdAt: string;
}

/**
 * One folder and what is in it.
 *
 * `GET /community/bookmarks/collections` returns a **bare array** of these — no
 * cursor, no total. There is no route that lists the bookmarks in a folder
 * separately and **no route that moves a bookmark between folders**: a bookmark's
 * folder is set when it is created and never again.
 */
export interface BookmarkCollectionResponse {
  folderId: string | null;
  name: string;
  glyph: string | null;
  itemCount: number;
  items: BookmarkResponse[];
  updatedAt: string | null;
}

// ── Shares and follows ───────────────────────────────────────────────────────

export interface CreateShareRequest {
  /** Required. */
  kind: ShareKind;
  destination?: string | null;
  recipientId?: string | null;
  message?: string | null;
}

/**
 * `ShareResponse`.
 *
 * **`quotePostId` is always null.** Both the request and the response document a
 * quote share that creates a new post carrying the original — and no handler
 * ever creates one. `kind: 'quote'` records a share like any other and answers
 * with a null `quotePostId`.
 *
 * Typed as `null` rather than `string | null` on purpose: a UI that promised
 * "your quote has been posted" and then had nowhere to send the member is worse
 * than one that never offered it. If the server ever starts populating it, this
 * type is the thing that has to change, and that change is the moment to build
 * the screen.
 */
export interface ShareResponse {
  shareId: string;
  contentType: CommunityContentType;
  contentId: string;
  kind: ShareKind;
  destination: string | null;
  recipientId: string | null;
  message: string | null;
  /** **Always null.** No post is ever created from a quote share. */
  quotePostId: null;
  createdAt: string;
}

/**
 * `FollowRequest` — the **body** of `POST /community/follows/{targetId}`.
 *
 * The whole body is optional and nullable: `POST` with no body at all is valid.
 *
 * Two traps, and they compound:
 *
 *   * **`targetType` is a body field here and a query parameter on `DELETE`.**
 *     Same fact, two transports. Sending it as a query parameter on the POST is
 *     ignored; sending it in a DELETE body is ignored.
 *   * **A body-less re-POST un-mutes.** The handler applies
 *     `SetMuted(request.Muted)` unconditionally, and an absent body deserialises
 *     to `muted: false`. So "follow" on something already followed-and-muted
 *     turns the mute off. `followTarget` in the client therefore requires the
 *     caller to state `muted` rather than defaulting it.
 */
export interface FollowRequest {
  targetType?: FollowTargetType | null;
  /** Applied unconditionally on every POST. See above. */
  muted: boolean;
}

/**
 * What both follow routes answer — **200 on POST as well as DELETE**.
 *
 * **`DELETE` on something you do not follow is a failure, not a no-op.** The
 * handler answers `FollowNotFound` (404). Unfollow is therefore not idempotent
 * and a "make sure I am not following this" call cannot be written as a bare
 * DELETE — see `isFollowNotFoundError` in the client.
 */
export interface FollowResponse {
  targetType: FollowTargetType;
  targetId: string;
  isFollowing: boolean;
  muted: boolean;
  followerCount: number;
  followedAt: string | null;
}

// ── Moderation ───────────────────────────────────────────────────────────────

/**
 * `CreateReportRequest`.
 *
 * Property 4: the field is **`reason`** on the way in and **`reasonCode`** on the
 * way back.
 */
export interface CreateReportRequest {
  contentType: CommunityContentType;
  contentId: string;
  /** Required. Becomes `reasonCode` on the response. */
  reason: CommunityReportReason;
  description?: string | null;
  evidenceUrl?: string | null;
}

export interface ReportResponse {
  reportId: string;
  contentType: CommunityContentType;
  contentId: string;
  /** Property 4. **`reasonCode`**, where the request said `reason`. */
  reasonCode: CommunityReportReason;
  description: string | null;
  evidenceUrl: string | null;
  status: string;
  createdAt: string;
}

export interface ReportReasonResponse {
  code: CommunityReportReason;
  label: string;

  /**
   * True when the reason is unactionable without a supporting link - on the
   * seeded deployment, `misinformation` alone, whose whole claim is that one
   * post contradicts another.
   *
   * **Advisory, not enforced.** `ContentReport.File` drops a missing evidence
   * URL rather than refusing the report, so this flag exists to make a client
   * *ask* for the link. Nothing rejects a report that arrives without one.
   */
  requiresEvidence: boolean;
}

export interface ModerationQueueQuery {
  contentType?: CommunityContentType | null;
  reason?: CommunityReportReason | null;
  /**
   * Accepted and **useless**. See `ModerationQueueItemResponse`.
   */
  cursor?: string | null;
  /**
   * Accepted, and it limits **reports** rather than rows. See
   * `ModerationQueueItemResponse`.
   */
  limit?: number | null;
}

/**
 * One piece of reported content awaiting a decision.
 *
 * **`GET /community/moderation/queue` is not pageable, despite taking `cursor`
 * and `limit`.** It returns a bare array with no cursor in it and no cursor
 * beside it, so there is no value to send as the next page's `cursor` and no
 * signal that a next page exists. Infinite scroll cannot be built on it.
 *
 * `limit` is worse than useless: it bounds the number of **reports** read, which
 * are then grouped by content, so a limit of 50 returns somewhere between 1 and
 * 50 rows and the client cannot tell which. "Fewer rows than the limit" does not
 * mean "that is all there is".
 *
 * Four display fields are hardcoded null, and `title` falls back to the literal
 * string `"(removed)"` when the content is already gone.
 */
export interface ModerationQueueItemResponse {
  contentType: CommunityContentType;
  contentId: string;
  /** The literal `"(removed)"` when the content no longer exists. */
  title: string;
  reportCount: number;
  reasons: CommunityReportReason[];
  firstReportedAt: string;
  lastReportedAt: string;
  status: string;
  /** **Hardcoded null.** */
  reporterName: null;
  /** **Hardcoded null.** */
  authorName: null;
  /** **Hardcoded null.** */
  authorLevel: null;
}

export interface CreateModerationDecisionRequest {
  contentType: CommunityContentType;
  contentId: string;
  /** Required. */
  action: ModerationAction;
  reason?: string | null;
  reportId?: string | null;
}

export interface ModerationDecisionResponse {
  decisionId: string;
  contentType: CommunityContentType;
  contentId: string;
  action: ModerationAction;
  reason: string | null;
  reportId: string | null;
  moderatorId: string;
  /** **Hardcoded null.** */
  moderatorName: null;
  createdAt: string;
}

// ── Discovery ────────────────────────────────────────────────────────────────

export interface HashtagSuggestionResponse {
  tag: string;
  postCount: number;
}

export interface TrendingHashtagResponse {
  tag: string;
  postCount: number;
  rank: number;
  countryCode: string | null;
}

/**
 * One reaction the platform offers.
 *
 * `appliesTo` is the **PascalCase** list — property 1's single exception. Every
 * other content-type string on this response, including
 * `CommunityCapabilitiesResponse.contentTypes`, is camelCase.
 */
export interface CommunityReactionCapability {
  key: CommunityReactionKey;
  label: string;
  glyph: string | null;

  /**
   * What this reaction *means* — `positive`, `corroborating`, `disputing`,
   * `negative`, `neutral`.
   *
   * B6 has always published it and this type dropped it, which left a client
   * with no way to ask "which of these confirms a post" except by hard-coding
   * the key `confirmed`. The producing contract says plainly why that is wrong:
   * the catalogue is data, and a consumer switching on a fixed set of names
   * stops handling every kind a later deployment adds.
   */
  sentiment: CommunityReactionSentiment;

  /** **PascalCase.** See `CommunityCapabilityContentType`. */
  appliesTo: CommunityCapabilityContentType[];

  /** Display order. Ascending; the server sorts before sending. */
  position: number;
}

export interface CommunityLimitsResponse {
  postBodyMaxLength: number;
  postTitleMaxLength: number;
  commentBodyMaxLength: number;
  feedPageSize: number;
  feedMaxPageSize: number;
  commentPageSize: number;
  commentMaxPageSize: number;
}

/**
 * `CommunityCapabilitiesResponse` — what this deployment actually offers.
 *
 * **Read this rather than hardcoding.** Reactions, feeds, rankings and report
 * reasons are all server configuration, and a client that shipped its own copies
 * would offer a member a reaction the server refuses or hide one it accepts.
 *
 * ── This type was fiction on five of its seven fields ───────────────────────
 *
 * It declared `feedKeys`, `rankingKeys`, `contentTypes`, `limits` and
 * `visibilityRulesEnabled`. The server sends none of those names. Every one read
 * `undefined` on every deployment, and `tsc` could not see it because the fields
 * were declared — a type is a claim about someone else's JSON, and nothing was
 * checking the claim.
 *
 * `limits` was the expensive one: `CommentThread` read
 * `capabilities?.limits.commentBodyMaxLength`, guarding `capabilities` and not
 * `limits`, so the comment box threw on every guide and every update the moment
 * the query resolved.
 *
 * The shape below is `src/mocks/recorded/community-capabilities.ts` — a captured
 * 200 from a running API, not a fixture written from this file. The recording is
 * annotated with this type, so the two cannot drift without one of them failing
 * to compile. **Re-record it; do not repair it.**
 */
export interface CommunityCapabilitiesResponse {
  reactions: CommunityReactionCapability[];

  /** Descriptors, not bare keys: each feed carries its default ranking. */
  feeds: CommunityFeedDescriptor[];

  rankings: CommunityFeedRanking[];
  reportReasons: ReportReasonResponse[];

  /** The visibility values a post may take. */
  visibilityLevels: CommunityPostVisibility[];

  /** camelCase, unlike `reactions[].appliesTo`. Property 1's contrast. */
  supportedContentTypes: CommunityCapabilityContentType[];

  // Flat, not a nested `limits` object. The server sends them at the top level.
  maxPostLength: number;
  maxCommentLength: number;
  maxPostAttachments: number;
  maxPollOptions: number;
  maxFeedPageSize: number;
  maxRenderedCommentDepth: number;

  automatedReviewAvailable: boolean;
}

/**
 * One feed on the capabilities report. A descriptor, not a bare key.
 *
 * `requiresViewer` is why this cannot be a plain key list: a feed that needs a
 * viewer is meaningless to an anonymous caller, and the client has to know which
 * ones those are before offering them.
 */
export interface CommunityFeedDescriptor {
  key: CommunityFeedKey;
  defaultRanking: CommunityFeedRanking;
  requiresViewer: boolean;
}
