// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Recommendations (Remediation Wave D-1)
//
// A typed mirror of `Diaspora.Modules.Recommendations`'s V1 contracts, named as
// the wire names them. Nothing is renamed at the boundary — renaming is how the
// two repositories stopped agreeing in the first place — so the mapping from a
// `RecommendationResponse` to something a card can render happens at the screen,
// visibly.
//
// ── What this module actually is ─────────────────────────────────────────────
//
// The Home tab. `GET /recommendations/feed?country={iso2}` returns the whole
// screen in one response: an ordered list of sections, each with its own title,
// its own "see all" route and its own items. Until this wave the Home tab
// rendered `mocks/community-data.ts` — fixtures, on every device, for every
// member, in every country.
//
// ── The four things worth knowing before reading further ─────────────────────
//
// **1. `RecommendationResponse` is flat and uniform, not polymorphic.** A guide,
// a job, a housing listing and an organisation all arrive as the *same record*
// with a `targetType` discriminator. There is no per-type payload, so there is
// no per-type field to read: whatever a card needs beyond `title`, `summary`,
// `location`, `categoryKey`, `isVerified`, `isFeatured` and `publishedAt` is not
// in this response and must be fetched from the owning module by `targetId`.
//
// **2. There is no pagination.** `/feed` takes exactly one parameter, `country`.
// No cursor, no page, no limit. The feed is the whole feed.
//
// **3. Sections are dropped, not emptied.** A section that does not meet its
// server-side minimum item count is *absent* from `sections` — it does not
// arrive with `items: []`. So `sections[2]` is not `continue-learning` on a cold
// start, it is whatever happens to be third. Index by `key`, never by position;
// `findFeedSection` below exists so no screen is tempted.
//
// **4. `targetType` is PascalCase and the server does not normalise
// separators.** Parsing on the way in is case-insensitive, so `job` and `JOB`
// both bind — but `housing_listing` and `housing-listing` are 400s.
// `HousingListing` is the only spelling that works for the two-word types, which
// is why `RecommendationTargetType` below is a closed union in exactly that
// casing and why nothing in this client ever snake-cases one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `RecommendationTargetType`, in the casing the wire uses.
 *
 * A closed union rather than `string`, so a mis-cased or under-scored value is a
 * compile error here rather than a 400 the member sees. See point 4 above: the
 * server upper-cases nothing and strips nothing.
 *
 * The feed can carry a type this client has no screen for — `Announcement` and
 * `Community` have no detail route today — so a reader must still handle "known
 * type, no destination" rather than assuming every member of this union is
 * navigable. `routeForRecommendation` in `lib/recommendations-api.ts` returns
 * null for those, deliberately.
 */
export type RecommendationTargetType =
  | 'Job'
  | 'MarketplaceListing'
  | 'HousingListing'
  | 'Provider'
  | 'Guide'
  | 'LearningPath'
  | 'Organization'
  | 'Event'
  | 'Neighborhood'
  | 'Community'
  | 'Country'
  | 'Announcement';

/** Every member of the union, for a runtime check against a wire value. */
export const RECOMMENDATION_TARGET_TYPES: readonly RecommendationTargetType[] = [
  'Job',
  'MarketplaceListing',
  'HousingListing',
  'Provider',
  'Guide',
  'LearningPath',
  'Organization',
  'Event',
  'Neighborhood',
  'Community',
  'Country',
  'Announcement',
] as const;

/**
 * Where a recommended thing is.
 *
 * Every field is optional on the wire — the server omits what it does not know,
 * and a `Guide` is frequently country-wide with no city at all. A screen that
 * assumed `cityName` would render "undefined, undefined" for every guide on the
 * platform.
 */
export interface RecommendationLocation {
  countryCode?: string | null;
  regionName?: string | null;
  cityName?: string | null;
  neighborhoodName?: string | null;
}

/**
 * Why this item is here, as the server explains it.
 *
 * `text` is the pre-rendered English sentence and `resourceKey` is the
 * localisation key for the same sentence — the pair exists so a localised client
 * can translate and an unlocalised one can still say something true. This client
 * renders `text` and carries `resourceKey` untouched, so switching to a
 * translation table later is a change at the screen and not a change here.
 *
 * `confidence` is a string on the wire rather than a number. It is not a
 * percentage and must not be rendered as one.
 */
export interface RecommendationReason {
  code: string;
  resourceKey: string;
  text: string;
  confidence: string;
  /** Which signals fed the decision — e.g. profile, location, history. */
  signalKinds: string[];
}

/**
 * One strategy's contribution to an item's score.
 *
 * Diagnostic rather than presentational: the feed is a blend of several
 * strategies and this is the audit trail of how one item's `score` was reached.
 * Nothing on the Home tab renders it. It is typed because it arrives and because
 * a debug surface will want it, not because a card should show it.
 */
export interface RecommendationContribution {
  strategyKey: string;
  kind: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
}

/**
 * `RecommendationResponse` — one recommended thing.
 *
 * See point 1 in the header: this is the *whole* item. There is no nested job,
 * listing or guide, and there is no field on it that only appears for one
 * `targetType`. A card that wants a salary, a rent, a price or an author has to
 * read the owning module by `targetId`.
 */
export interface Recommendation {
  targetType: RecommendationTargetType;
  /** A GUID. The identifier in the owning module, and what a detail route takes. */
  targetId: string;
  title: string;
  summary: string | null;

  /**
   * The owning module's URL slug, where it has one.
   *
   * Not a route, and not a substitute for `targetId`: every detail screen in
   * this client is keyed by id. Carried because it arrives.
   */
  slug: string | null;

  /**
   * **A string, not a GUID.**
   *
   * This is the one field in this contract that diverges from the platform's own
   * convention. Community, Housing, Marketplace and the rest hold a `mediaId`
   * that `Diaspora.Modules.Media` will resolve; Recommendations declares a
   * free-form `string?` here and its producers do not promise a GUID. So it must
   * not be handed to a GUID-typed media helper without a shape check first —
   * `fetchMediaAsset('cover-fallback')` is a 404 in production and a thrown
   * request in development.
   *
   * `isMediaId` in `lib/recommendations-api.ts` is that check.
   */
  mediaReference: string | null;

  /** The owning module's taxonomy key, where it has one. Not localised. */
  categoryKey: string | null;

  location: RecommendationLocation;
  isVerified: boolean;
  isFeatured: boolean;
  publishedAt: string | null;

  /** Position within the section, zero-based. Echoed back on feedback. */
  position: number;

  /** The blended score. Diagnostic; nothing renders it. */
  score: number;

  /** Which strategy surfaced this item. Diagnostic. */
  strategy: string;

  reason: RecommendationReason;
  contributions: RecommendationContribution[];

  /**
   * **Always `true`. Do not branch on it.**
   *
   * Declared `public bool IsProjection { get; init; } = true;` on the response
   * record and never assigned by any mapper, so every item on the wire carries
   * `true` regardless of what it is. It means "this record is a projection of
   * the owning module's data, not the owning module's data" — which is true of
   * all of them.
   *
   * A client that read it as "this is a stub, fetch the real one" would fetch
   * everything; a client that read it as "this is stale" would distrust
   * everything. Typed so the field is not a surprise, documented so nothing
   * reads it.
   */
  isProjection: boolean;
}

/**
 * `FeedSectionResponse` — one rail on the Home tab.
 *
 * `key` is the layout discriminator and the only stable identifier a screen may
 * match on: `title` is display text and is expected to change, and position is
 * not stable at all (point 3 in the header).
 */
export interface FeedSection {
  /** e.g. `for-you`, `trending-guides`, `housing-near-you`. Stable. */
  key: string;

  /** Display text, already in English. Expected to change; never matched on. */
  title: string;

  /** The localisation key for `title`. Carried untouched. */
  titleResourceKey: string;

  /**
   * The single type this section holds, or `null` for a mixed section.
   *
   * `for-you` is the mixed one — its items carry several different
   * `targetType`s. A screen that read the section's type instead of each item's
   * would route every `for-you` tap to the same module.
   */
  targetType: RecommendationTargetType | null;

  items: Recommendation[];

  /**
   * Where "see all" goes, as an app route — e.g. `/housing`, `/discover`.
   *
   * Server-supplied, and null for a section with nowhere to go. Rendered as a
   * link only when present: fabricating a destination for a null one is how a
   * member ends up on a screen that does not contain what they were promised.
   */
  seeAllRoute: string | null;

  /**
   * Whether this section is showing generic content because the platform does
   * not yet know the member.
   *
   * Per-section rather than global: a member with a complete profile can still
   * cold-start `continue-learning` by never having opened a learning path.
   */
  isColdStart: boolean;
}

/**
 * `HomeFeedResponse` — the whole Home tab in one object.
 *
 * `sections` arrives in render order and must be rendered in that order.
 */
export interface HomeFeed {
  sections: FeedSection[];

  /** Whether the platform used anything it knows about this member. */
  isPersonalized: boolean;

  /** Whether the feed as a whole is generic. Distinct from per-section cold start. */
  isColdStart: boolean;

  /** 0–100, integer. What a "complete your profile" prompt reads. */
  profileCompleteness: number;

  generatedAt: string;
}

/**
 * The five feedback verbs, as route segments.
 *
 * Each is its own route — `POST /recommendations/{kind}` — and each stamps its
 * own kind server-side. The `kind` field in the request body is required by
 * validation and then **ignored** by all five handlers, which is a genuine sharp
 * edge in the contract rather than an oversight in this client: omitting it is a
 * 400, and setting it to the wrong verb changes nothing.
 */
export type RecommendationFeedbackKind = 'view' | 'click' | 'dismiss' | 'accept' | 'bookmark';

/**
 * `RecordFeedbackRequest`.
 *
 * `surface` is PascalCase like `targetType`. The Home tab sends `HomeFeed`.
 */
export interface RecommendationFeedbackRequest {
  kind: RecommendationFeedbackKind;
  targetType: RecommendationTargetType;
  targetId: string;
  surface: string;
  setId: string | null;
  /** Must be >= 0 when present. The item's `position` within its section. */
  position: number | null;
  occurredAt: string | null;
}

/**
 * What a feedback call answers.
 *
 * **`wasRecorded` is the field that matters, and the status code is not.**
 * `/view` and `/click` are de-duplicated in a five-minute window: a repeat
 * inside it comes back **HTTP 200** with `wasRecorded: false` and an all-zero
 * `feedbackId`. A client that treats 200 as "recorded" will count impressions
 * that the platform did not.
 *
 * `/dismiss`, `/accept` and `/bookmark` are never de-duplicated.
 */
export interface RecommendationFeedbackResult {
  /** All zeros when nothing was recorded. */
  feedbackId: string;
  kind: string;
  /** When a dismissal's suppression lapses. 90 days out for `/dismiss`. */
  suppressedUntil: string | null;
  wasRecorded: boolean;
}
