// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Recommendations, development handlers for the REAL
// contract (Remediation Wave D-1)
//
// `Diaspora.Modules.Recommendations` serves the home feed and the five feedback
// routes under `/api/v1/recommendations`. Until this file there was **no
// `/recommendations` handler at all**, because until this wave there was no
// client either: the Home tab rendered `mocks/community-data.ts` directly and
// never made a request.
//
// **Every shape here was transcribed from the module's contracts**, not from
// what `lib/recommendations-api.ts` expects — which is why the wire types below
// are declared in this file rather than imported from `@/types/recommendations`.
// Typing this handler with the client's own types would make it impossible for
// TypeScript to ever show a divergence between the two: the mock would agree
// with the client by construction, which is precisely the failure mode this
// remediation keeps finding.
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// ── The six refusals this file enforces rather than describes ────────────────
//
//   1. **`kind` is required on every feedback body, and then ignored.** All five
//      routes stamp their own kind from the route segment, but
//      `RecordFeedbackRequest`'s validator requires the field to be present and
//      non-empty. So a body without it is a 400 for a rule that has no effect —
//      exactly the kind of detail that is only ever found by sending the
//      request, and exactly the kind a client "cleans up" and then breaks.
//
//   2. **`targetType` parses case-insensitively and strips nothing.** The
//      module's parse is a plain case-insensitive enum match. `HousingListing`,
//      `housinglisting` and `HOUSINGLISTING` all bind; `housing_listing` and
//      `housing-listing` are 400s. A permissive mock that accepted the
//      snake-cased form — the obvious spelling for anyone used to the rest of
//      this codebase — would hide a 400 until deployment.
//
//   3. **`/view` and `/click` are de-duplicated in a five-minute window, and
//      the repeat is a 200.** `wasRecorded: false`, `feedbackId` all zeros. A
//      client that reads the status code counts impressions the platform did
//      not. `/dismiss`, `/accept` and `/bookmark` are never de-duplicated.
//
//   4. **A section below its minimum is absent, not empty.** The server drops
//      it. Reproduced here because it is the single property most likely to
//      crash a screen that indexes `sections` by position.
//
//   5. **`targetId` binds as a `Guid`.** A non-GUID fails model binding before
//      any handler runs. Reproduced because `'guide-1'`-shaped identifiers are
//      used throughout this codebase's fixtures.
//
//   6. **`position` must be >= 0 when present.** Null is permitted and means
//      "not known"; a negative value is a validation failure.
//
// ── The one modelled behaviour, and why it is modelled that way ──────────────
//
// Cold start is real and it is not a coin toss. A recommender that has never
// seen a member behave has nothing to personalise on, so this handler starts
// cold — `isColdStart: true`, `isPersonalized: false`, a low
// `profileCompleteness`, and **no `continue-learning` section**, because a
// member who has never opened a learning path has nothing to continue.
//
// The first feedback event of any kind warms it. From then on the feed reports
// `isPersonalized: true` and `continue-learning` appears. That means both states
// are reachable in development by using the app rather than by editing a flag,
// and it means a screen that only ever rendered the warm feed is a screen whose
// cold-start path was never run.
//
// A dismissal is honoured: the item is suppressed for ninety days and drops out
// of subsequent feeds, and a section left under its minimum drops with it —
// property 4, reached by a member's own action.
//
// ── What is deliberately NOT here ───────────────────────────────────────────
//
// **No media.** `mediaReference` is a `string?` on this contract rather than the
// `Guid?` every other module holds, and this handler emits the non-GUID form for
// most items on purpose: it is what makes `isMediaId` in the client load-bearing
// rather than decorative. Nothing here serves bytes; see `handlers/media.ts`.
//
// **No second discovery system.** This handler invents recommendations; it does
// not invent jobs, guides, listings or events. Every `targetId` it emits is a
// GUID that no other handler knows, so tapping a card in development reaches the
// owning module's own "not found" — which is true, and is better than a card
// that opens a fixture the recommender never chose.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

const ROOT = '/recommendations';

type Reply = [number, unknown];

// ── The wire contracts, transcribed ──────────────────────────────────────────
//
// Named exactly as the C# records name them. `targetType` is `string` here and
// not a union: the server emits an enum name and this handler must be able to
// *receive* a value outside the union in order to refuse it, which a union type
// would prevent it from even expressing.

interface WireLocation {
  countryCode?: string | null;
  regionName?: string | null;
  cityName?: string | null;
  neighborhoodName?: string | null;
}

interface WireReason {
  code: string;
  resourceKey: string;
  text: string;
  confidence: string;
  signalKinds: string[];
}

interface WireContribution {
  strategyKey: string;
  kind: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
}

interface WireRecommendation {
  targetType: string;
  targetId: string;
  title: string;
  summary: string | null;
  slug: string | null;
  mediaReference: string | null;
  categoryKey: string | null;
  location: WireLocation;
  isVerified: boolean;
  isFeatured: boolean;
  publishedAt: string | null;
  position: number;
  score: number;
  strategy: string;
  reason: WireReason;
  contributions: WireContribution[];
  isProjection: boolean;
}

interface WireSection {
  key: string;
  title: string;
  titleResourceKey: string;
  targetType: string | null;
  items: WireRecommendation[];
  seeAllRoute: string | null;
  isColdStart: boolean;
}

interface WireFeed {
  sections: WireSection[];
  isPersonalized: boolean;
  isColdStart: boolean;
  profileCompleteness: number;
  generatedAt: string;
}

interface WireFeedbackResult {
  feedbackId: string;
  kind: string;
  suppressedUntil: string | null;
  wasRecorded: boolean;
}

// ── The vocabulary ───────────────────────────────────────────────────────────

/**
 * `RecommendationTargetType`, in the casing the server emits.
 *
 * Property 2. Matching is case-insensitive and separator-blind matching does
 * **not** happen: this list is compared with `toLowerCase()` on both sides and
 * nothing is stripped first.
 */
const TARGET_TYPES = [
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
];

/** The five feedback verbs, as route segments. */
const FEEDBACK_KINDS = ['view', 'click', 'dismiss', 'accept', 'bookmark'];

/** The two that are de-duplicated. Property 3. */
const DEDUPLICATED_KINDS = new Set(['view', 'click']);

/** `RecommendationDeduplicationWindow`. Five minutes. */
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** A dismissal's suppression. Ninety days. */
const SUPPRESSION_DAYS = 90;

/** `Guid.Empty`, which is what a de-duplicated call answers with. */
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── The envelope and the problem document ────────────────────────────────────

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
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
 * The `country` query value, from either the params object or the URL.
 *
 * axios puts a `params` object on the config and only serialises it later, so a
 * handler that only read the URL would see no country on any request this client
 * makes. Both are read because a test may well build the URL by hand.
 */
function countryFrom(config: { params?: unknown; url?: string }): string | null {
  const params = config.params;
  if (params && typeof params === 'object') {
    const value = (params as Record<string, unknown>).country;
    if (typeof value === 'string' && value.trim().length > 0) return value.trim().toUpperCase();
  }

  const match = /[?&]country=([^&]+)/.exec(config.url ?? '');
  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}

/** The route segment after `/recommendations/`. */
function kindFrom(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/recommendations\/([^/?]+)/.exec(url);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

// ── The store ────────────────────────────────────────────────────────────────
//
// Three facts, and no more. Everything else about the feed is derived, so the
// same request produces the same answer twice — which is what makes a difference
// between two screens a finding rather than a coin toss.

interface FeedbackRecord {
  /** `${kind}|${targetType lower}|${targetId}` — the de-duplication identity. */
  identity: string;
  atMs: number;
}

/** The last time each identity was recorded. Property 3's whole mechanism. */
const lastRecorded = new Map<string, FeedbackRecord>();

/** `targetId` → the moment its suppression lapses. Populated by `/dismiss`. */
const suppressedUntil = new Map<string, number>();

/** Whether this member has ever given the recommender anything to work with. */
let hasAnyFeedback = false;

let feedbackSequence = 0;

/**
 * A GUID-shaped identifier.
 *
 * Shaped, not random. Deterministic so a development log reads the same way
 * twice; version nibble `4` and variant nibble `8` so it is a well-formed v4
 * rather than something that merely matches a regex.
 */
function newFeedbackId(): string {
  feedbackSequence += 1;
  return `00000000-0000-4000-9000-${feedbackSequence.toString(16).padStart(12, '0')}`;
}

/**
 * Clears everything this handler remembers.
 *
 * Exported for the tests, which need a cold recommender and an empty
 * de-duplication window at the start of each case. Nothing in the application
 * calls it.
 */
export function resetRecommendationMocks(): void {
  lastRecorded.clear();
  suppressedUntil.clear();
  hasAnyFeedback = false;
  feedbackSequence = 0;
}

// ── The catalogue ────────────────────────────────────────────────────────────
//
// A fixed set of recommendable things, one per section. Deliberately small: this
// handler's job is to exercise the *shape* of a feed and the refusals around it,
// not to be a second discovery system.

interface SeedItem {
  title: string;
  summary: string | null;
  slug: string | null;
  categoryKey: string | null;
  city: string | null;
  isVerified: boolean;
  isFeatured: boolean;
  /**
   * The media reference, verbatim.
   *
   * Mostly **not** a GUID, on purpose — see the header. This contract declares a
   * free-form `string?` where every other module holds a `Guid?`, and a handler
   * that quietly emitted GUIDs would make `isMediaId` look like dead code right
   * up until a production feed shipped a slug.
   */
  mediaReference: string | null;
}

interface SeedSection {
  key: string;
  title: string;
  titleResourceKey: string;
  /** Null for the mixed section. */
  targetType: string | null;
  seeAllRoute: string | null;
  /**
   * Below this many items the server drops the section entirely — property 4.
   *
   * The exact numbers are a server-side configuration this client cannot read,
   * so these are representative rather than transcribed. The *behaviour* is the
   * contract: under the minimum the section is absent, never present-and-empty.
   */
  minimumItems: number;
  /** Only shown once the recommender has something to personalise on. */
  warmOnly?: boolean;
  items: (SeedItem & { targetType: string })[];
}

function item(
  targetType: string,
  title: string,
  extra: Partial<SeedItem> = {}
): SeedItem & { targetType: string } {
  return {
    targetType,
    title,
    summary: extra.summary ?? null,
    slug: extra.slug ?? null,
    categoryKey: extra.categoryKey ?? null,
    city: extra.city ?? null,
    isVerified: extra.isVerified ?? false,
    isFeatured: extra.isFeatured ?? false,
    mediaReference: extra.mediaReference ?? null,
  };
}

const CATALOGUE: SeedSection[] = [
  {
    key: 'for-you',
    title: 'For you',
    titleResourceKey: 'recommendations.section.forYou',
    // The mixed section. Its items carry several different `targetType`s and the
    // section's own is null — a screen that routed by the section's type would
    // send every row here to the same module.
    targetType: null,
    seeAllRoute: '/discover',
    minimumItems: 3,
    items: [
      item('Guide', 'Opening your first bank account', {
        summary: 'What the bank will ask for, and what to bring the second time.',
        slug: 'opening-your-first-bank-account',
        categoryKey: 'banking',
        isVerified: true,
        mediaReference: 'guides/banking/first-account-cover',
      }),
      item('Job', 'Kitchen assistant — evenings', {
        summary: 'Three evenings a week, no experience needed.',
        categoryKey: 'hospitality',
        city: 'London',
      }),
      item('Event', 'Sunday afternoon community lunch', {
        summary: 'Everyone welcome. Bring something if you can.',
        categoryKey: 'community',
        city: 'London',
        isFeatured: true,
      }),
      item('Provider', 'Adeyemi Immigration Advice', {
        summary: 'Regulated adviser, first consultation free.',
        categoryKey: 'legal',
        city: 'London',
        isVerified: true,
      }),
    ],
  },
  {
    key: 'trending-guides',
    title: 'Trending guides',
    titleResourceKey: 'recommendations.section.trendingGuides',
    targetType: 'Guide',
    seeAllRoute: '/knowledge/guides',
    minimumItems: 3,
    items: [
      item('Guide', 'Registering with a GP', {
        summary: 'You do not need proof of address as often as you are told.',
        slug: 'registering-with-a-gp',
        categoryKey: 'health',
        isVerified: true,
      }),
      item('Guide', 'Understanding your payslip', {
        summary: 'Tax code, National Insurance and what the deductions mean.',
        slug: 'understanding-your-payslip',
        categoryKey: 'work',
      }),
      item('Guide', 'Sending money home without losing it to fees', {
        summary: 'Comparing the real cost, including the exchange rate.',
        slug: 'sending-money-home',
        categoryKey: 'money',
        isFeatured: true,
      }),
    ],
  },
  {
    key: 'continue-learning',
    title: 'Continue learning',
    titleResourceKey: 'recommendations.section.continueLearning',
    targetType: 'LearningPath',
    // The one shipped section with nowhere to send a member: this client has no
    // learning-path screen at all. Null rather than a guess — a "see all" that
    // opens the wrong list is worse than one that is not offered.
    seeAllRoute: null,
    minimumItems: 1,
    // A member who has never opened a learning path has nothing to continue, so
    // the server has no reason to send this section on a cold start.
    warmOnly: true,
    items: [
      item('LearningPath', 'Settling in: the first ninety days', {
        summary: 'Six guides, in the order most people need them.',
        categoryKey: 'orientation',
      }),
      item('LearningPath', 'Working here', {
        summary: 'Contracts, rights, and what to do when something is wrong.',
        categoryKey: 'work',
      }),
    ],
  },
  {
    key: 'housing-near-you',
    title: 'Housing near you',
    titleResourceKey: 'recommendations.section.housingNearYou',
    targetType: 'HousingListing',
    seeAllRoute: '/housing',
    minimumItems: 2,
    items: [
      item('HousingListing', 'Room in a shared house, Peckham', {
        summary: 'Bills included. Available from the first.',
        categoryKey: 'room',
        city: 'London',
      }),
      item('HousingListing', 'One-bedroom flat, Woolwich', {
        summary: 'Long let, unfurnished, near the Elizabeth line.',
        categoryKey: 'flat',
        city: 'London',
        isVerified: true,
      }),
    ],
  },
  {
    key: 'jobs-for-you',
    title: 'Jobs for you',
    titleResourceKey: 'recommendations.section.jobsForYou',
    targetType: 'Job',
    seeAllRoute: '/job',
    minimumItems: 2,
    items: [
      item('Job', 'Care assistant — full time', {
        summary: 'Sponsorship available for the right candidate.',
        categoryKey: 'care',
        city: 'London',
        isVerified: true,
      }),
      item('Job', 'Warehouse operative — night shift', {
        summary: 'Four nights on, four off.',
        categoryKey: 'logistics',
        city: 'Dartford',
      }),
      item('Job', 'Barber wanted', {
        summary: 'Chair rental or employed, your choice.',
        categoryKey: 'trades',
        city: 'London',
      }),
    ],
  },
  {
    key: 'events-near-you',
    title: 'Events near you',
    titleResourceKey: 'recommendations.section.eventsNearYou',
    targetType: 'Event',
    seeAllRoute: '/community-life',
    minimumItems: 2,
    items: [
      item('Event', 'Independence Day picnic', {
        summary: 'Bring a chair. Food from two in the afternoon.',
        categoryKey: 'celebration',
        city: 'London',
        isFeatured: true,
      }),
      item('Event', 'Free legal advice clinic', {
        summary: 'Drop in, no appointment. Interpreters available.',
        categoryKey: 'support',
        city: 'London',
        isVerified: true,
      }),
    ],
  },
  {
    key: 'trusted-providers',
    title: 'Trusted providers',
    titleResourceKey: 'recommendations.section.trustedProviders',
    targetType: 'Provider',
    seeAllRoute: '/provider',
    minimumItems: 2,
    items: [
      item('Provider', 'Okonkwo & Co Accountants', {
        summary: 'Self-assessment, payroll and small business accounts.',
        categoryKey: 'finance',
        city: 'London',
        isVerified: true,
      }),
      item('Provider', 'Mama Ngozi Catering', {
        summary: 'Weddings, naming ceremonies and Sunday orders.',
        categoryKey: 'food',
        city: 'London',
      }),
    ],
  },
  {
    key: 'marketplace-near-you',
    title: 'Marketplace near you',
    titleResourceKey: 'recommendations.section.marketplaceNearYou',
    targetType: 'MarketplaceListing',
    seeAllRoute: '/marketplace',
    minimumItems: 2,
    items: [
      item('MarketplaceListing', 'Nearly new pushchair', {
        summary: 'Used for one child, collection only.',
        categoryKey: 'baby',
        city: 'London',
      }),
      item('MarketplaceListing', 'Suitcase, 28 inch', {
        summary: 'One trip. Wheels all good.',
        categoryKey: 'travel',
        city: 'London',
      }),
    ],
  },
  {
    key: 'organizations',
    title: 'Organizations',
    titleResourceKey: 'recommendations.section.organizations',
    targetType: 'Organization',
    seeAllRoute: '/community-life/org',
    minimumItems: 2,
    items: [
      item('Organization', 'Southwark Diaspora Welfare Association', {
        summary: 'Hardship fund, weekly advice desk, funeral support.',
        categoryKey: 'welfare',
        city: 'London',
        isVerified: true,
      }),
      item('Organization', 'Young Professionals Network', {
        summary: 'Mentoring and monthly meet-ups.',
        categoryKey: 'professional',
        city: 'London',
      }),
    ],
  },
];

/**
 * A stable GUID for a catalogue entry.
 *
 * Derived from its section and position rather than generated, so the same item
 * carries the same `targetId` across reloads — which is what makes a dismissal
 * in development actually stick, and what lets a test dismiss a known item.
 */
function targetIdFor(sectionIndex: number, itemIndex: number): string {
  const suffix = `${sectionIndex}${itemIndex}`.padStart(12, '0');
  return `00000000-0000-4000-a000-${suffix}`;
}

/** `RecommendationReasonResponse`, composed the way the strategies compose it. */
function reasonFor(isCold: boolean): WireReason {
  if (isCold) {
    return {
      code: 'popular_in_country',
      resourceKey: 'recommendations.reason.popularInCountry',
      text: 'Popular with people near you',
      // A string, not a number. The contract does not express confidence as a
      // percentage and a client must not render it as one.
      confidence: 'low',
      signalKinds: ['location'],
    };
  }

  return {
    code: 'matches_your_profile',
    resourceKey: 'recommendations.reason.matchesYourProfile',
    text: 'Based on what you have been reading',
    confidence: 'medium',
    signalKinds: ['profile', 'location', 'history'],
  };
}

function contributionsFor(strategy: string, score: number): WireContribution[] {
  return [
    {
      strategyKey: strategy,
      kind: 'primary',
      rawScore: score,
      weight: 0.7,
      weightedScore: Math.round(score * 0.7 * 1000) / 1000,
    },
    {
      strategyKey: 'proximity',
      kind: 'boost',
      rawScore: score / 2,
      weight: 0.3,
      weightedScore: Math.round((score / 2) * 0.3 * 1000) / 1000,
    },
  ];
}

function toWireItem(
  seed: SeedItem & { targetType: string },
  sectionIndex: number,
  itemIndex: number,
  country: string,
  isCold: boolean
): WireRecommendation {
  const strategy = isCold ? 'cold-start-popularity' : 'blended-personalized';
  // Descending, so an ordering assertion has something to assert on.
  const score = Math.round((0.95 - itemIndex * 0.07) * 1000) / 1000;

  return {
    targetType: seed.targetType,
    targetId: targetIdFor(sectionIndex, itemIndex),
    title: seed.title,
    summary: seed.summary,
    slug: seed.slug,
    mediaReference: seed.mediaReference,
    categoryKey: seed.categoryKey,
    location: {
      countryCode: country,
      regionName: null,
      // Null for the country-wide things — a guide is rarely city-scoped, and a
      // card that assumed a city would render a blank line for every one of
      // them.
      cityName: seed.city,
      neighborhoodName: null,
    },
    isVerified: seed.isVerified,
    isFeatured: seed.isFeatured,
    publishedAt: null,
    position: itemIndex,
    score,
    strategy,
    reason: reasonFor(isCold),
    contributions: contributionsFor(strategy, score),
    // Property: declared `= true` on the response record and never assigned.
    // Every item on the wire carries true, regardless of what it is.
    isProjection: true,
  };
}

/**
 * The feed, composed the way the server composes it.
 *
 * Sections are built, then filtered: a section whose surviving item count is
 * below its minimum is **removed**, not emptied. That is property 4, and it is
 * reachable here through a member's own dismissals rather than only through a
 * configuration nobody in development can change.
 */
function buildFeed(country: string): WireFeed {
  const now = Date.now();
  const isCold = !hasAnyFeedback;

  const sections: WireSection[] = [];

  CATALOGUE.forEach((seedSection, sectionIndex) => {
    // A member with no history has nothing to continue.
    if (seedSection.warmOnly && isCold) return;

    const items = seedSection.items
      .map((seed, itemIndex) => toWireItem(seed, sectionIndex, itemIndex, country, isCold))
      .filter((candidate) => {
        const until = suppressedUntil.get(candidate.targetId);
        return until === undefined || until <= now;
      })
      // `position` is the item's position in the section it is actually sent in,
      // so it is re-numbered after suppression. A stale position is what makes a
      // feedback event attach to the wrong row.
      .map((candidate, index) => ({ ...candidate, position: index }));

    if (items.length < seedSection.minimumItems) return;

    sections.push({
      key: seedSection.key,
      title: seedSection.title,
      titleResourceKey: seedSection.titleResourceKey,
      targetType: seedSection.targetType,
      items,
      seeAllRoute: seedSection.seeAllRoute,
      isColdStart: isCold,
    });
  });

  return {
    sections,
    isPersonalized: !isCold,
    isColdStart: isCold,
    // An integer, not a fraction. A client that rendered it as `0.35%` would be
    // out by two orders of magnitude and nothing would ever say so.
    profileCompleteness: isCold ? 35 : 70,
    generatedAt: new Date(now).toISOString(),
  };
}

// ── Feedback validation ──────────────────────────────────────────────────────

/**
 * `RecordFeedbackRequest`'s validator, reproduced.
 *
 * Returns a refusal or null. Every branch is a rule the server actually applies
 * — see properties 1, 2, 5 and 6 in the header.
 */
function refuseFeedback(payload: Record<string, unknown>): Reply | null {
  // Property 1. Required by validation, then ignored by all five handlers.
  const kind = payload.kind;
  if (typeof kind !== 'string' || kind.trim().length === 0) {
    return validation('recommendations.feedback.kind-required', "'Kind' must not be empty.");
  }

  const targetType = payload.targetType;
  if (typeof targetType !== 'string' || targetType.trim().length === 0) {
    return validation(
      'recommendations.feedback.target-type-required',
      "'Target Type' must not be empty."
    );
  }

  // Property 2. Case-insensitive, separator-sensitive. `housing_listing` is a
  // 400; `housinglisting` is not.
  if (!isParsableTargetType(targetType.trim())) {
    return validation(
      'recommendations.feedback.target-type-invalid',
      `'${targetType}' is not a recommendation target type.`
    );
  }

  // Property 5. `Guid` binding, before any handler runs.
  const targetId = payload.targetId;
  if (typeof targetId !== 'string' || !GUID.test(targetId.trim())) {
    return validation(
      'recommendations.feedback.target-id-invalid',
      `The value '${String(targetId)}' is not valid for targetId.`
    );
  }

  const surface = payload.surface;
  if (typeof surface !== 'string' || surface.trim().length === 0) {
    return validation('recommendations.feedback.surface-required', "'Surface' must not be empty.");
  }

  // Property 6. Null is permitted; negative is not.
  const position = payload.position;
  if (position !== undefined && position !== null) {
    if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) {
      return validation(
        'recommendations.feedback.position-invalid',
        "'Position' must be greater than or equal to 0."
      );
    }
  }

  return null;
}

/**
 * Whether the server's enum parse would accept this value.
 *
 * Property 2 in one function. The parse is a plain case-insensitive match
 * against the enum names — it does not strip separators, so the snake- and
 * kebab-cased spellings that read naturally to anyone used to the rest of this
 * codebase are refusals.
 */
function isParsableTargetType(value: string): boolean {
  if (value.includes('_') || value.includes('-')) return false;
  return TARGET_TYPES.some((known) => known.toLowerCase() === value.toLowerCase());
}

export function setupRecommendationMocks(mock: MockAdapter): void {
  // ── The feed ──────────────────────────────────────────────────────────────
  //
  // Registered first. `axios-mock-adapter` matches in registration order and the
  // feedback pattern below is broad enough to capture `/feed` if it came first.

  mock.onGet(new RegExp(`${ROOT}/feed(\\?.*)?$`)).reply((config) => {
    // `country` is optional: omitted, the server infers one from the member's
    // profile. Nothing is refused on it here — the module documents the
    // parameter as an ISO 3166-1 alpha-2 code but the client has not verified
    // what it does with a malformed one, and inventing a refusal would be
    // asserting a rule this handler cannot vouch for.
    const country = countryFrom(config) ?? 'GB';

    return ok(buildFeed(country));
  });

  // ── The five feedback routes ──────────────────────────────────────────────
  //
  // One handler, because they are one handler on the server: each route stamps
  // its own kind from the segment and shares the request, the validator and the
  // response record.

  mock.onPost(new RegExp(`${ROOT}/(view|click|dismiss|accept|bookmark)$`)).reply((config) => {
    const kind = kindFrom(config.url);

    if (!kind || !FEEDBACK_KINDS.includes(kind)) {
      return problem(404, 'recommendations.route.not-found', 'Not found', 'No route matches.');
    }

    const payload = body(config);

    const refusal = refuseFeedback(payload);
    if (refusal) return refusal;

    const targetType = String(payload.targetType).trim();
    const targetId = String(payload.targetId).trim();

    // The de-duplication identity. Note that it uses the **route's** kind and
    // not the body's — property 1: the body's `kind` is required and then
    // ignored, so sending `{ kind: 'accept' }` to `/view` records a view.
    const identity = `${kind}|${targetType.toLowerCase()}|${targetId.toLowerCase()}`;
    const now = Date.now();

    if (DEDUPLICATED_KINDS.has(kind)) {
      const previous = lastRecorded.get(identity);

      if (previous && now - previous.atMs < DEDUPE_WINDOW_MS) {
        // Property 3. **200**, not 409 and not 204. A client reading the status
        // code would count this impression; a client reading `wasRecorded` would
        // not.
        const result: WireFeedbackResult = {
          feedbackId: EMPTY_GUID,
          kind,
          suppressedUntil: null,
          wasRecorded: false,
        };
        return ok(result);
      }
    }

    lastRecorded.set(identity, { identity, atMs: now });

    // Any feedback at all is enough to stop the recommender being cold. That is
    // what makes both feed states reachable in development by using the app.
    hasAnyFeedback = true;

    let suppressedUntilIso: string | null = null;

    if (kind === 'dismiss') {
      const until = now + SUPPRESSION_DAYS * 24 * 60 * 60 * 1000;
      suppressedUntil.set(targetId, until);
      suppressedUntilIso = new Date(until).toISOString();
    }

    const result: WireFeedbackResult = {
      feedbackId: newFeedbackId(),
      kind,
      suppressedUntil: suppressedUntilIso,
      wasRecorded: true,
    };

    return ok(result);
  });
}
