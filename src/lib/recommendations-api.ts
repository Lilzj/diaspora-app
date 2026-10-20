// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Recommendations client (Remediation Wave D-1)
//
// **The Home tab's data.** Until this module the Home tab rendered
// `mocks/community-data.ts` — the same three guides and the same three community
// updates, on every device, for every member, in every country, with the word
// "Trending" above them. `Diaspora.Modules.Recommendations` has served a real
// personalised feed at `/api/v1/recommendations/feed` the whole time.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Nothing. There was no recommendations client at all.
//
// ── The five things worth knowing before reading further ─────────────────────
//
// **1. `/feed` has no pagination, and this file deliberately offers none.** The
// route takes exactly one parameter, `country`. There is no cursor, no page and
// no limit, so there is no `fetchNextPage` to write and no infinite query to
// build. A feed screen refreshes; it does not scroll for more.
//
// **2. Sections are dropped rather than emptied.** A section below its
// server-side minimum item count is absent from `sections` entirely. So
// `sections[2]` is not a fixed rail, and `findSection(feed, 'continue-learning')`
// legitimately returns `undefined` on a cold start. `findSection` exists so no
// screen indexes by position.
//
// **3. `mediaReference` is a `string?`, not a `Guid?`.** Every other module on
// this platform holds a `mediaId` that Media resolves; Recommendations declares
// a free-form string and its producers do not promise a GUID. `isMediaId` is the
// shape check that stands between it and `fetchMediaAsset`, which binds
// `{mediaId:guid}` and answers 404 for anything else.
//
// **4. A 401 here means "sign in", not "the network is broken".** No route in
// this module calls `.RequireAuthorization()`. Authentication is enforced inside
// a MediatR pipeline behaviour that *throws*, so an anonymous call comes back
// 401 with **no `WWW-Authenticate` header** — which is unusual enough that a
// generic error handler reads it as a transport failure. `isSignedOutError`
// names it so a screen can offer the right next step.
//
// **5. `wasRecorded`, not the status code.** `/view` and `/click` are
// de-duplicated in a five-minute window and answer **HTTP 200** with
// `wasRecorded: false` and an all-zero `feedbackId`. Every feedback function
// below returns the whole result rather than a boolean, so a caller cannot
// accidentally read "200" as "counted".
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import {
  RECOMMENDATION_TARGET_TYPES,
  type HomeFeed,
  type FeedSection,
  type Recommendation,
  type RecommendationFeedbackKind,
  type RecommendationFeedbackRequest,
  type RecommendationFeedbackResult,
  type RecommendationTargetType,
} from '@/types/recommendations';

const ROOT = '/recommendations';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * The surface a feedback event happened on.
 *
 * PascalCase, like `targetType`. The Home tab is the only caller today; the
 * constant exists so the string is written once and cannot drift into
 * `home-feed` or `homeFeed`, either of which the server's parser would refuse.
 */
export const HOME_FEED_SURFACE = 'HomeFeed';

// ── Cache keys ───────────────────────────────────────────────────────────────

/**
 * The feed is keyed by country because that is the only thing the request
 * carries — everything else the server personalises on comes from the bearer
 * token, so a signed-in and a signed-out read of the same country are different
 * answers under the same key.
 *
 * That is handled by clearing the cache on sign-in and sign-out rather than by
 * putting a member id in the key, which is how every other read in this client
 * behaves and is what keeps one member's feed from surviving into another
 * member's session on a shared device.
 */
export const recommendationKeys = {
  all: ['recommendations'] as const,
  feed: (country?: string | null) => ['recommendations', 'feed', country ?? 'all'] as const,
  communities: (country?: string | null) =>
    ['recommendations', 'communities', country ?? 'all'] as const,
};

// ── The feed ─────────────────────────────────────────────────────────────────

/**
 * The Home tab, in one request.
 *
 * `country` is an ISO 3166-1 alpha-2 code and is optional: omitted, the server
 * infers one from the member's profile. It is sent when the client knows it,
 * because a member browsing with the location switcher set to Mauritius should
 * see Mauritius, and the profile does not know that.
 *
 * Nothing is normalised on the way out beyond upper-casing — the server matches
 * the code case-insensitively, but sending `gb` and `GB` under two different
 * cache keys would be two requests for one answer.
 */
export async function fetchHomeFeed(country?: string | null): Promise<HomeFeed> {
  const response = await apiClient.get<Envelope<HomeFeed>>(`${ROOT}/feed`, {
    params: country ? { country: country.trim().toUpperCase() } : undefined,
  });

  return response.data.data;
}

/**
 * A section by its key, or `undefined`.
 *
 * The only supported way to reach a named section. See point 2 in the header:
 * the server drops a section that is under its minimum, so positions are not
 * stable between two reads of the same feed by the same member on the same day.
 */
export function findSection(feed: HomeFeed | null | undefined, key: string): FeedSection | undefined {
  return feed?.sections.find((section) => section.key === key);
}

/** Every item across every section, in render order. For counting, not for rendering. */
export function allItems(feed: HomeFeed | null | undefined): Recommendation[] {
  return (feed?.sections ?? []).flatMap((section) => section.items);
}

// ── A named surface ──────────────────────────────────────────────────────────

/**
 * The surface `GET /recommendations/communities` answers for, as the feedback
 * routes spell it (`RecommendationSurface.Communities`). A dismissal sent with
 * `HomeFeed` would be attributed to the Home tab.
 */
export const COMMUNITIES_SURFACE = 'Communities';

/**
 * `RecommendationPageResponse`, the shape every named surface answers.
 *
 * `setId` is what a feedback call should echo: the server can look a set up by
 * target when it is absent, but sending it is cheaper and more accurate
 * (`RecordFeedbackRequest`).
 */
export interface RecommendationPage {
  items: Recommendation[];
  setId: string | null;
  surface: string;
  isColdStart: boolean;
  generatedAt: string | null;
}

/**
 * Communities recommended to the caller: `GET /recommendations/communities`.
 *
 * The route binds `country`, `category`, `limit` and `refresh` — **`limit`, not
 * `take`**. Ranked and explained by the server; nothing here reorders.
 */
export async function fetchCommunityRecommendationPage(
  options: { country?: string | null; limit?: number } = {},
  signal?: AbortSignal
): Promise<RecommendationPage> {
  const response = await apiClient.get<Envelope<Partial<RecommendationPage> | null>>(
    `${ROOT}/communities`,
    {
      params: {
        country: options.country ? options.country.trim().toUpperCase() : undefined,
        limit: options.limit,
      },
      signal,
    }
  );
  const page = response.data?.data ?? null;

  return {
    items: Array.isArray(page?.items) ? page!.items : [],
    setId: page?.setId ?? null,
    surface: page?.surface ?? COMMUNITIES_SURFACE,
    isColdStart: page?.isColdStart === true,
    generatedAt: page?.generatedAt ?? null,
  };
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export interface FeedbackInput {
  targetType: RecommendationTargetType;
  targetId: string;
  /** Defaults to `HomeFeed`. The only caller today. */
  surface?: string;
  /** The recommendation set this item came from, when the server supplied one. */
  setId?: string | null;
  /** The item's `position`. Must be >= 0; a negative value is a 400. */
  position?: number | null;
  occurredAt?: string | null;
}

/**
 * Builds the body all five routes take.
 *
 * `kind` is included even though the five routes each stamp their own — the
 * request validator requires the field to be present and non-empty, and the
 * handlers then ignore it. Omitting it is a 400 for a rule that has no effect,
 * which is exactly the kind of contract detail that is only found by sending
 * the request.
 *
 * `position` is normalised to `null` rather than clamped when it is negative. A
 * clamp would send `0`, which is a *different item's* position and would attach
 * the feedback to the wrong row in the server's analytics; `null` is permitted
 * and says "not known", which is true.
 */
export function toFeedbackRequest(
  kind: RecommendationFeedbackKind,
  input: FeedbackInput
): RecommendationFeedbackRequest {
  const position =
    typeof input.position === 'number' && Number.isFinite(input.position) && input.position >= 0
      ? Math.floor(input.position)
      : null;

  return {
    kind,
    targetType: input.targetType,
    targetId: input.targetId,
    surface: input.surface ?? HOME_FEED_SURFACE,
    setId: input.setId ?? null,
    position,
    occurredAt: input.occurredAt ?? null,
  };
}

async function postFeedback(
  kind: RecommendationFeedbackKind,
  input: FeedbackInput
): Promise<RecommendationFeedbackResult> {
  const response = await apiClient.post<Envelope<RecommendationFeedbackResult>>(
    `${ROOT}/${kind}`,
    toFeedbackRequest(kind, input)
  );

  return response.data.data;
}

/**
 * An impression.
 *
 * **De-duplicated in a five-minute window**, and the repeat is a 200 with
 * `wasRecorded: false`. The full result is returned rather than a boolean so a
 * caller counting impressions counts the recorded ones.
 */
export function recordView(input: FeedbackInput): Promise<RecommendationFeedbackResult> {
  return postFeedback('view', input);
}

/** A tap. De-duplicated in the same five-minute window as `/view`. */
export function recordClick(input: FeedbackInput): Promise<RecommendationFeedbackResult> {
  return postFeedback('click', input);
}

/**
 * "Not interested."
 *
 * Never de-duplicated, and the only feedback verb with a lasting effect: the
 * server suppresses the item for **90 days** and answers with the
 * `suppressedUntil` moment. Worth surfacing to the member — "we won't show this
 * again" is a promise with a length.
 */
export function recordDismiss(input: FeedbackInput): Promise<RecommendationFeedbackResult> {
  return postFeedback('dismiss', input);
}

/** An explicit "yes, this". Never de-duplicated. */
export function recordAccept(input: FeedbackInput): Promise<RecommendationFeedbackResult> {
  return postFeedback('accept', input);
}

/** A save. Never de-duplicated. Distinct from the Saved tab's own collections. */
export function recordBookmark(input: FeedbackInput): Promise<RecommendationFeedbackResult> {
  return postFeedback('bookmark', input);
}

// ── Reading a wire value safely ──────────────────────────────────────────────

/**
 * Whether a wire `targetType` is one this client knows.
 *
 * Case-sensitive on purpose. The server parses case-insensitively on the way
 * *in*, but it *emits* PascalCase, so a lower-cased value arriving here means
 * something upstream re-cased it — and a value this client then echoed back
 * unchanged would still be accepted, while `housing_listing` would not. Failing
 * the check is how an unknown type gets skipped instead of round-tripped into a
 * 400.
 */
export function isKnownTargetType(value: string): value is RecommendationTargetType {
  return (RECOMMENDATION_TARGET_TYPES as readonly string[]).includes(value);
}

/**
 * Whether the server would accept this `targetType` on a feedback call.
 *
 * Case-insensitive, because the parser is — and separator-sensitive, because
 * the parser is not. `MediaWireNames`-style normalisation does not happen here:
 * the module's parse is a plain case-insensitive enum match, so `housing_listing`
 * and `housing-listing` are both `400`s while `housinglisting` binds.
 *
 * Exported for the tests and for the development handler, which enforces the
 * same rule the server does.
 */
export function isAcceptableTargetType(value: string): boolean {
  if (value.includes('_') || value.includes('-')) return false;
  return RECOMMENDATION_TARGET_TYPES.some((known) => known.toLowerCase() === value.toLowerCase());
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a `mediaReference` is something Media can resolve.
 *
 * Point 3 in the header. Every Media asset route binds `{mediaId:guid}`, so a
 * non-GUID reference matches no route and answers 404 — and in development it
 * falls through to a network that is not there. This check is what lets a card
 * render its placeholder instead of firing a request that cannot succeed.
 */
export function isMediaId(reference: string | null | undefined): reference is string {
  return typeof reference === 'string' && GUID.test(reference.trim());
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Whether this failure is "you are not signed in".
 *
 * Point 4 in the header, and the reason this is a named function rather than a
 * status comparison at the screen: no route in this module is decorated with
 * `.RequireAuthorization()`, so the framework never produces its usual 401 with
 * a `WWW-Authenticate` challenge. The behaviour throws inside the pipeline and
 * the platform's exception handler writes a bare 401. It looks like a server
 * error and it is not one — it is the one failure here with an action attached.
 */
export function isSignedOutError(cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  return status === 401;
}

/** A sentence a member can act on, from the platform's problem envelope. */
export function feedErrorMessage(cause: unknown): string {
  if (isSignedOutError(cause)) {
    return 'Sign in to see recommendations chosen for you.';
  }

  const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'We could not load your feed just now.';
}

// ── Where a recommendation goes ──────────────────────────────────────────────

/**
 * The app route for a recommended item, or `null` when this client has no screen
 * for it.
 *
 * **Null is a real answer and must be handled.** The feed's `targetType`
 * vocabulary is wider than this application's route table:
 *
 *   * `LearningPath` — no learning-path screen exists. `continue-learning` is a
 *     shipped section, so this is a live gap rather than a hypothetical one.
 *   * `Announcement` — `/community-life/announcements` is a list with no detail
 *     route.
 *   * `Country` — `/country/[code]` takes an ISO code and `targetId` is a GUID.
 *     Routing a GUID into it would open a country page for a country that does
 *     not exist.
 *   * `Community` — `/community/[slug]` takes a slug, so this resolves only when
 *     the item carries one.
 *
 * Returning null rather than guessing is the point: a card that cannot be opened
 * should not look like one that can.
 */
export function routeForRecommendation(item: Recommendation): string | null {
  const id = encodeURIComponent(item.targetId);

  switch (item.targetType) {
    case 'Job':
      return `/job/${id}`;
    case 'MarketplaceListing':
      return `/marketplace/${id}`;
    case 'HousingListing':
      return `/housing/${id}`;
    case 'Provider':
      return `/provider/${id}`;
    case 'Guide':
      return `/guide/${id}`;
    case 'Organization':
      return `/community-life/org/${id}`;
    case 'Event':
      return `/community-life/event/${id}`;
    case 'Neighborhood':
      // Retired with the place catalogue (14 Oct 2026); the server no longer
      // produces these. An old one opens the area around the member.
      return '/map/area';
    case 'Community':
      return item.slug ? `/community/${encodeURIComponent(item.slug)}` : null;
    case 'LearningPath':
    case 'Announcement':
    case 'Country':
      return null;
    default:
      // Exhaustive over the union; a new wire type lands here rather than
      // producing a route that does not exist.
      return null;
  }
}

/**
 * The place-name line for a card, from whatever the server knew.
 *
 * Most specific first, and blank when the server knew nothing — every field on
 * `RecommendationLocation` is optional and a guide is frequently country-wide.
 * Joining unconditionally is how "undefined, undefined" reaches a screen.
 */
export function describeRecommendationLocation(item: Recommendation): string {
  const { neighborhoodName, cityName, regionName, countryCode } = item.location;

  const parts = [neighborhoodName, cityName, regionName ?? countryCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  // De-duplicate: a city-level item often repeats its city as its region.
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);

  return unique.slice(0, 2).join(', ');
}
