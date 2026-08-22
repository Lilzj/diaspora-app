// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Guides wire contract (Remediation Wave D-3)
//
// A literal mirror of `Diaspora.Modules.Guides`'s `Contracts/V1`, written from
// that source rather than from what any screen wished the server returned.
//
// ── The four things that will trip a reader of this file ─────────────────────
//
// **1. Enums are PascalCase. Sort keys are lower-case kebab.** Both facts come
// from one file — `Application/Services/GuideWireNames.cs` — and it says so
// outright: "Everything here is the enum name except the sort keys, which are
// lower-case kebab because they travel in query strings." So a guide's status
// is `Published` and a discovery sort is `most-helpful`, in the same request.
//
// This module is *not* Community. Community is camelCase throughout and the two
// are consumed on the same screens; a `status === 'published'` comparison
// against a guide is silently false for ever.
//
// **2. There is no author object on a card.** `GuideCardResponse` carries
// `authorId` and nothing else about the person. The byline a list renders comes
// from Trust or from the profile module, not from here. Only the *detail*
// response carries `author`, and it carries Trust's projection —
// `isApprovedContributor`, `isCommunityGuide`, a `trustLevel` label and badges —
// which is a different shape from anything `AuthorSummary` describes.
//
// **3. Media is a reference, never a URL.** `heroMediaId`, `mediaReferences[].
// mediaId`, `blocks[].mediaId`, `providers[].logoMediaId`. Every one is a Media
// identifier that the client resolves through `lib/media-api.ts`. Nothing on
// this contract is renderable as an `<Image src>` without that step, and a field
// that looks like it might be is not one.
//
// **4. `CreateGuideRequest` has no content and no media.** A guide is opened
// with a title, a category, a language and a country — and is created as a
// *draft*. Structure arrives through `PUT /guides/{id}`, media through
// `POST /guides/{id}/media`, and publication through
// `POST /guides/{id}/publish`. Four calls, in that order, and the create screen
// makes all four. See `lib/guides-api.ts`'s `publishNewGuide`.
//
// ── Pagination ───────────────────────────────────────────────────────────────
//
// Every list route in this module answers either `CursorPagedResult<T>` — which
// names its rows `items` — or a bare `IReadOnlyList<T>`. `readPage` in
// `lib/platform-envelope.ts` absorbs both, and `guides-api.integration.test.ts`
// pins each one. This module has none of the bespoke row names that made
// Community's comment thread return an empty page.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums, exactly as `GuideWireNames.ToWire` emits them ─────────────────────

/** `GuideStatus`. Moderation is a separate axis — a hidden guide is still Published. */
export type GuideStatus = 'Draft' | 'Published' | 'Archived';

/** `GuideVisibility`. `Unlisted` is the share-a-link-before-it-is-public state. */
export type GuideVisibility = 'Public' | 'Unlisted' | 'Private';

/** `GuideModerationState`. `Flagged` keeps the guide visible; `Hidden` does not. */
export type GuideModerationState = 'Clear' | 'Flagged' | 'Hidden';

/** `GuideDifficulty`. */
export type GuideDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

/**
 * `GuideBlockKind`.
 *
 * The kind decides what the other fields mean: text kinds carry prose in
 * `content`; `Image`, `Video` and `Attachment` carry `mediaId` and use `content`
 * as a caption; `Table` and `Links` carry an opaque JSON payload in `metadata`
 * that the editor owns and the server never parses.
 */
export type GuideBlockKind =
  | 'Markdown'
  | 'RichText'
  | 'Image'
  | 'Video'
  | 'Table'
  | 'Links'
  | 'Callout'
  | 'Warning'
  | 'Tip'
  | 'Attachment'
  | 'CodeSnippet';

/** `GuideMediaRole`. The pair (media, role) is the attach idempotency key. */
export type GuideMediaRole = 'Hero' | 'Cover' | 'Gallery' | 'Attachment' | 'Embedded';

/** `GuideVoteKind`. Two answers, deliberately not a star scale. */
export type GuideVoteKind = 'Helpful' | 'NotHelpful';

/** `GuideVerificationState`. Nothing in Guides can reach `Verified` — only Trust can. */
export type GuideVerificationState = 'None' | 'Pending' | 'Verified' | 'Revoked';

/** `GuideSuggestionStatus`. */
export type GuideSuggestionStatus = 'Open' | 'Accepted' | 'Rejected' | 'Withdrawn';

/**
 * `GuideSortOrder`, in its **wire** spelling.
 *
 * Kebab and lower-case, unlike every other enum here, because these travel in a
 * query string. `GuideWireNames.ParseSort` also accepts `mosthelpful`,
 * `helpful`, `recentlyupdated` and `updated`, and falls back to `newest` for
 * anything it does not recognise — so a bad sort key is a differently ordered
 * page rather than an error. The client sends the canonical spellings.
 */
export type GuideSortKey =
  | 'newest'
  | 'most-helpful'
  | 'recently-updated'
  | 'popular'
  | 'trending';

// ── Responses ────────────────────────────────────────────────────────────────

/** `GuideAuthorBadgeResponse`. The pair (badge, country) is the identity. */
export interface GuideAuthorBadgeResponse {
  badge: string;
  countryCode: string | null;
  awardedAt: string;
}

/**
 * `GuideAuthorResponse` — Trust's standing for the author, from this module's
 * own projection. `trustLevel` is an opaque label: rendered, never interpreted.
 */
export interface GuideAuthorResponse {
  userId: string;
  isApprovedContributor: boolean;
  isCommunityGuide: boolean;
  trustLevel: string | null;
  badges: GuideAuthorBadgeResponse[];
}

/** `GuideBlockResponse`. */
export interface GuideBlockResponse {
  blockId: string;
  kind: GuideBlockKind;
  order: number;
  /** The prose, or the caption for a media-kind block. */
  content: string | null;
  /** A Media identifier. Never a URL. */
  mediaId: string | null;
  /** Opaque JSON for table and link payloads. The editor owns the shape. */
  metadata: string | null;
}

/** `GuideSectionResponse`. */
export interface GuideSectionResponse {
  sectionId: string;
  title: string;
  order: number;
  blocks: GuideBlockResponse[];
}

/** `GuideMediaReferenceResponse`. */
export interface GuideMediaReferenceResponse {
  mediaId: string;
  role: GuideMediaRole;
  order: number;
  caption: string | null;
}

/**
 * `GuideProviderReferenceResponse`.
 *
 * `name`, `slug`, `isVerified` and `logoMediaId` are hydrated from the Providers
 * directory at read time and are **null when the provider could not be
 * resolved** — which is not the same as the provider having no name.
 */
export interface GuideProviderReferenceResponse {
  providerId: string;
  role: string | null;
  note: string | null;
  order: number;
  name: string | null;
  slug: string | null;
  isVerified: boolean | null;
  logoMediaId: string | null;
}

/**
 * `GuideTrustMarkResponse`.
 *
 * `reason` is populated for the author and never for readers, so a reader-facing
 * screen must not treat its absence as "no reason exists".
 */
export interface GuideTrustMarkResponse {
  state: GuideVerificationState;
  badge: string | null;
  reason: string | null;
  verifiedAt: string | null;
}

/** `GuideEngagementResponse`. Denormalised rollups, kept current by the handlers. */
export interface GuideEngagementResponse {
  views: number;
  uniqueViews: number;
  helpfulCount: number;
  notHelpfulCount: number;
  bookmarkCount: number;
  shareCount: number;
  commentCount: number;
}

/** `GuideSeoResponse`. */
export interface GuideSeoResponse {
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  /** Comma-joined, as the author typed them. */
  keywords: string | null;
}

/** `GuideResponse` — the full document, as the detail screen renders it. */
export interface GuideResponse {
  guideId: string;
  slug: string;
  title: string;
  summary: string | null;
  /** Derived from content when the author wrote no summary. */
  excerpt: string | null;
  categoryKey: string;
  /** Lower-case ISO 639-1. */
  language: string;
  /** Guides sharing this value are translations of each other. */
  translationGroupId: string;

  status: GuideStatus;
  visibility: GuideVisibility;
  moderationState: GuideModerationState;
  isFeatured: boolean;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  scheduledPublishAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string | null;

  countryCode: string;
  regionName: string | null;
  cityName: string | null;
  areaId: string | null;

  difficulty: GuideDifficulty;
  readingTimeMinutes: number;
  estimatedCompletionMinutes: number | null;
  wordCount: number;

  /** The published version number. **Zero until the first publication.** */
  currentVersion: number;
  /** The optimistic concurrency token the editor sends back as `baseRevision`. */
  revision: number;

  authorId: string;
  author: GuideAuthorResponse | null;

  sections: GuideSectionResponse[];
  tags: string[];
  mediaReferences: GuideMediaReferenceResponse[];
  providers: GuideProviderReferenceResponse[];

  trustMark: GuideTrustMarkResponse;
  engagement: GuideEngagementResponse;
  seo: GuideSeoResponse | null;
}

/**
 * `GuideCardResponse` — one row of any list.
 *
 * Note what is **not** here: no author object, no cover URL, no summary (only
 * `excerpt`), no country name and no flag. A card component fed this shape has
 * to resolve the byline and the hero image itself.
 */
export interface GuideCardResponse {
  guideId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  categoryKey: string;
  countryCode: string;
  cityName: string | null;
  language: string;
  /** Drafts appear only on the author's own lists. */
  status: GuideStatus;
  difficulty: GuideDifficulty;
  readingTimeMinutes: number;
  isVerified: boolean;
  isFeatured: boolean;
  authorId: string;
  publishedAt: string | null;
  updatedAt: string | null;
  /** A Media identifier. Never a URL. */
  heroMediaId: string | null;
  tags: string[];
  views: number;
  helpfulCount: number;
  commentCount: number;
  bookmarkCount: number;
}

/** `GuideCategoryResponse`. `key` is the address and is immutable. */
export interface GuideCategoryResponse {
  categoryId: string;
  key: string;
  name: string;
  description: string | null;
  /** An icon name the client resolves. Opaque to the server. */
  icon: string | null;
  order: number;
  /** Whether **new** guides may choose it. Existing guides keep it either way. */
  isActive: boolean;
  parentKey: string | null;
}

/** `GuideTagResponse`. */
export interface GuideTagResponse {
  tag: string;
  count: number;
}

/**
 * `GuideCapabilitiesResponse`.
 *
 * The reason the editor is not hard-coded: block kinds, sorts, ranking keys and
 * every ceiling come from the deployment. `lib/guides-api.ts` carries fallbacks
 * for the ceilings so a compose box has a limit before this resolves, and the
 * integration test asserts the two agree.
 */
export interface GuideCapabilitiesResponse {
  statuses: GuideStatus[];
  visibilities: GuideVisibility[];
  blockKinds: GuideBlockKind[];
  difficulties: GuideDifficulty[];
  mediaRoles: GuideMediaRole[];
  sortOrders: GuideSortKey[];
  /** Ranking keys registered on this deployment. Grows when a search module ships. */
  rankingKeys: string[];
  voteKinds: GuideVoteKind[];
  /** Whether **any** verification source is registered here. */
  verificationAvailable: boolean;
  maxSections: number;
  maxBlocksPerSection: number;
  maxBlockLength: number;
  maxTags: number;
  maxMediaReferences: number;
  maxProviderReferences: number;
  maxSummaryLength: number;
  maxPageSize: number;
}

/** `GuideSuggestionResponse`. */
export interface GuideSuggestionResponse {
  suggestionId: string;
  guideId: string;
  /** The suggester — never the guide's author. */
  authorId: string;
  targetSectionId: string | null;
  proposedContent: string;
  rationale: string | null;
  status: GuideSuggestionStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

/** `GuideVersionSummaryResponse`. The content stays behind the detail call. */
export interface GuideVersionSummaryResponse {
  versionId: string;
  guideId: string;
  versionNumber: number;
  title: string;
  revisionNotes: string | null;
  /** Usually the author; staff after a moderation edit. */
  editorId: string;
  publishedAt: string;
  wordCount: number;
  readingTimeMinutes: number;
}

/** `GuideAnalyticsResponse`. Measurement, not state. */
export interface GuideAnalyticsResponse {
  guideId: string;
  views: number;
  uniqueViews: number;
  completions: number;
  totalReadSeconds: number;
  bookmarks: number;
  shares: number;
  helpfulVotes: number;
  notHelpfulVotes: number;
  searchImpressions: number;
  searchClicks: number;
  /** A signal that recent edits made things worse. */
  versionAdoptions: number;
  lastViewedAt: string | null;
}

/**
 * `GuideVerificationStatusResponse`.
 *
 * The strongest thing a submission returns is `Pending`. Outcomes arrive later
 * through Trust's integration events, so a screen must never render a
 * submission's response as "verified".
 */
export interface GuideVerificationStatusResponse {
  guideId: string;
  state: GuideVerificationState;
  verificationId: string | null;
  badge: string | null;
  reason: string | null;
  verifiedAt: string | null;
  changedAt: string | null;
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** `GuideBlockInput`. `blockId` is the client's, and stable across saves. */
export interface GuideBlockInput {
  blockId: string;
  kind: GuideBlockKind;
  order: number;
  content?: string | null;
  /** Required for media-kind blocks. */
  mediaId?: string | null;
  metadata?: string | null;
}

/**
 * `GuideSectionInput`.
 *
 * `sectionId` is supplied by the client and **stable across saves** — it is what
 * version diffs match sections by, so "renamed" and "replaced" stay
 * distinguishable years later. Regenerating it on every save destroys that.
 */
export interface GuideSectionInput {
  sectionId: string;
  title: string;
  order: number;
  blocks: GuideBlockInput[];
}

/** `CreateGuideRequest`. Deliberately thin — no content, no media, no tags. */
export interface CreateGuideRequest {
  title: string;
  /** A requested handle. Omitted, one is derived from the title. */
  slug?: string | null;
  categoryKey: string;
  /** Lower-case ISO 639-1 two-letter. */
  language: string;
  /** Upper-case ISO 3166-1 alpha-2. Every guide has a jurisdiction. */
  countryCode: string;
  regionName?: string | null;
  cityName?: string | null;
  areaId?: string | null;
  summary?: string | null;
}

/** `UpdateGuideRequest`. `sections: null` edits metadata only. */
export interface UpdateGuideRequest {
  title: string;
  summary?: string | null;
  visibility?: GuideVisibility | null;
  difficulty?: GuideDifficulty | null;
  estimatedCompletionMinutes?: number | null;
  countryCode: string;
  regionName?: string | null;
  cityName?: string | null;
  areaId?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  keywords?: string | null;
  /** The whole document, when the save includes content. */
  sections?: GuideSectionInput[] | null;
  /** The revision the editor loaded. Null opts out of the conflict check. */
  baseRevision?: number | null;
}

/** `SaveGuideDraftRequest`. The auto-save; it never touches the guide itself. */
export interface SaveGuideDraftRequest {
  sections: GuideSectionInput[];
  baseRevision?: number | null;
}

/** `PublishGuideRequest`. */
export interface PublishGuideRequest {
  revisionNotes?: string | null;
  baseRevision?: number | null;
}

/** `AttachGuideMediaRequest`. Idempotent on (media, role). */
export interface AttachGuideMediaRequest {
  mediaId: string;
  role: GuideMediaRole;
  caption?: string | null;
}

/** `SetGuideTagsRequest`. Wholesale replacement — free text in, slugs out. */
export interface SetGuideTagsRequest {
  tags: string[];
  baseRevision?: number | null;
}

/** `SetGuideCategoryRequest`. */
export interface SetGuideCategoryRequest {
  categoryKey: string;
  baseRevision?: number | null;
}

/** `SetGuideLanguageRequest`. */
export interface SetGuideLanguageRequest {
  language: string;
  baseRevision?: number | null;
}

/** `CastGuideVoteRequest`. Casting again with the other kind *changes* the vote. */
export interface CastGuideVoteRequest {
  kind: GuideVoteKind;
}

/**
 * `RecordGuideViewRequest`.
 *
 * Uniqueness is the **client's claim**, not a server-side fingerprint. Nothing
 * here is a source of truth for anything except measurement.
 */
export interface RecordGuideViewRequest {
  isUniqueView?: boolean | null;
  completed?: boolean | null;
  readSeconds?: number | null;
}

/**
 * `ReportGuideRequest`.
 *
 * `reason` is a **Community** report reason name, not a Guides enum — the report
 * is routed into Community's moderation workflow and this module implements none
 * of it. So the values come from `GET /community/reports/reasons`.
 */
export interface ReportGuideRequest {
  reason: string;
  description?: string | null;
}

/** `SubmitGuideSuggestionRequest`. Accepting one does **not** auto-edit the guide. */
export interface SubmitGuideSuggestionRequest {
  targetSectionId?: string | null;
  proposedContent: string;
  rationale?: string | null;
}

/** `DecideGuideSuggestionRequest`. */
export interface DecideGuideSuggestionRequest {
  accept: boolean;
  note?: string | null;
}

/** `ScheduleGuidePublicationRequest`. Future only, drafts only. */
export interface ScheduleGuidePublicationRequest {
  publishAt: string;
}

/**
 * `GuideVerificationEvidenceInput`.
 *
 * `documentType` is **Trust's** `VerificationDocumentType` name, not a Guides
 * value. Omitted, the module supplies the guide-evidence type its verification
 * handler accepts — which is the right default, because Trust refuses document
 * types it does not recognise and evidence that cannot describe itself is
 * evidence the reviewer never sees.
 */
export interface GuideVerificationEvidenceInput {
  /** A Media identifier. Never a URL and never bytes. */
  mediaId: string;
  documentType?: string | null;
}

/**
 * `SubmitGuideVerificationRequest`. It asks; it does not grant.
 *
 * The free-text field is `notes`, plural — the *response* spells its own
 * explanation `reason`. Two different fields, and neither echoes the other.
 */
export interface SubmitGuideVerificationRequest {
  evidence?: GuideVerificationEvidenceInput[];
  notes?: string | null;
}

/** `GuideProviderReferenceInput`. Order is the array's; there is no `order` field. */
export interface GuideProviderReferenceInput {
  providerId: string;
  /** What the guide calls this provider — "Recommended lawyer". Editorial free text. */
  role?: string | null;
  note?: string | null;
}

/**
 * `SetGuideProviderReferencesRequest`.
 *
 * The rows are named `references`, and — unlike every other editorial write in
 * this module — **there is no `baseRevision`**. This one write is not covered by
 * the optimistic-concurrency check.
 */
export interface SetGuideProviderReferencesRequest {
  references: GuideProviderReferenceInput[];
}

/**
 * `CreateGuideTranslationRequest`.
 *
 * The new guide is seeded with the source's structure automatically; there is no
 * flag that controls it.
 */
export interface CreateGuideTranslationRequest {
  /** Lower-case ISO 639-1. */
  language: string;
  /** Omitted, the source title carries over untranslated. */
  title?: string | null;
  slug?: string | null;
}

/** `RestoreGuideVersionRequest`. Restoring writes the *draft*; publishing mints the next version. */
export interface RestoreGuideVersionRequest {
  baseRevision?: number | null;
}

/**
 * `HideGuideRequest` — `guides.moderate`.
 *
 * One field, and it is required: "a moderation action nobody can explain six
 * months later is an action that should not have been possible." There is no
 * separate note here — that is `AddGuideModerationNoteRequest`.
 */
export interface HideGuideRequest {
  reason: string;
}

/** `GuideModerationQueueItemResponse`. */
export interface GuideModerationQueueItemResponse {
  guideId: string;
  slug: string;
  title: string;
  authorId: string;
  status: GuideStatus;
  /** Why it is in the queue. */
  moderationState: GuideModerationState;
  countryCode: string;
  categoryKey: string;
  openSuggestions: number;
  updatedAt: string | null;
}

/** `GET /guides/moderation/queue` — `guides.moderate`. */
export interface GuideModerationQueueQuery {
  moderationState?: GuideModerationState;
  countryCode?: string;
  cursor?: string;
  limit?: number;
}

/** `AddGuideModerationNoteRequest` — `guides.moderate`. Never shown to readers. */
export interface AddGuideModerationNoteRequest {
  note: string;
}

/** `GuideVersionResponse` — one immutable version, content included. */
export interface GuideVersionResponse {
  versionId: string;
  guideId: string;
  versionNumber: number;
  title: string;
  summary: string | null;
  /** Lower-case ISO 639-1, **as it stood at publication**. */
  language: string;
  categoryKey: string;
  revisionNotes: string | null;
  editorId: string;
  publishedAt: string;
  wordCount: number;
  readingTimeMinutes: number;
  sections: GuideSectionResponse[];
}

/**
 * `GuideSectionDiffResponse.change`.
 *
 * **Kebab and lower-case**, unlike every enum in this module — it is a hand-written
 * string in the diff service rather than an enum through `GuideWireNames`, so
 * `content-changed` is the literal a client compares against.
 */
export type GuideSectionChangeKind = 'added' | 'removed' | 'retitled' | 'content-changed';

/** `GuideSectionDiffResponse`. */
export interface GuideSectionDiffResponse {
  sectionId: string;
  change: GuideSectionChangeKind;
  /** Null for an added section. */
  fromTitle: string | null;
  /** Null for a removed section. */
  toTitle: string | null;
  /** Always true for added and removed. */
  contentChanged: boolean;
}

/** `GuideVersionDiffResponse`. Unchanged sections are **omitted**, not listed as unchanged. */
export interface GuideVersionDiffResponse {
  guideId: string;
  fromVersion: number;
  toVersion: number;
  sections: GuideSectionDiffResponse[];
}

// ── Query shapes, as the endpoints bind them from the query string ───────────

/**
 * `SearchGuidesRequest`.
 *
 * `query` and `q` are two spellings of one term and the handler coalesces them;
 * the client sends `q` only. Every field is optional — minimal-API binding
 * treats a non-nullable value type bound from the query string as *required*,
 * which is why even the flags are nullable on the server.
 */
export interface SearchGuidesQuery {
  q?: string;
  country?: string;
  region?: string;
  city?: string;
  category?: string;
  tag?: string;
  language?: string;
  authorId?: string;
  verified?: boolean;
  featured?: boolean;
  difficulty?: GuideDifficulty;
  sort?: GuideSortKey;
  cursor?: string;
  limit?: number;
}

/** `GET /guides/mine`. `status` is a `GuideStatus` name. */
export interface MyGuidesQuery {
  status?: GuideStatus;
  sort?: GuideSortKey;
  cursor?: string;
  limit?: number;
}

/** `GET /guides/countries/{countryCode}`. */
export interface GuidesByCountryQuery {
  categoryKey?: string;
  language?: string;
  sort?: GuideSortKey;
  cursor?: string;
  limit?: number;
}

/** `GET /guides/categories/{categoryKey}/guides`. */
export interface GuidesByCategoryQuery {
  countryCode?: string;
  language?: string;
  sort?: GuideSortKey;
  cursor?: string;
  limit?: number;
}

/**
 * `ListNearbyGuidesRequest`.
 *
 * Every geographic field is optional and every combination is accepted — it all
 * goes to Location's scope resolver. `radiusKm` carries that module's sentinels:
 * a positive value is kilometres, `-1` means "this city", `-2` means "this
 * country".
 */
export interface NearbyGuidesQuery {
  cityName?: string;
  countryCode?: string;
  areaId?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  category?: string;
  limit?: number;
  cursor?: string;
}

/** `GET /guides/{id}/suggestions`. `status` is a `GuideSuggestionStatus` name. */
export interface GuideSuggestionsQuery {
  status?: GuideSuggestionStatus;
  cursor?: string;
  limit?: number;
}
