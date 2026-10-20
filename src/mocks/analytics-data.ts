// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Development analytics provider (Frontend Phase 15, §59 · §60)
//
// ⚠ EVERY FIGURE PRODUCED BY THIS FILE IS SIMULATED. NONE IS A MEASUREMENT. ⚠
//
// §59 makes a development provider mandatory where backend analytics is
// incomplete, and §60 requires it to be deterministic. Both are load-bearing and
// the second is the harder one.
//
// ── Why determinism, specifically ────────────────────────────────────────────
//
// A provider built on `Math.random()` produces a dashboard whose numbers change
// on every render. Three things break, in increasing order of seriousness:
//
//   A chart flickers as React re-renders, which is merely bad.
//
//   A test asserting "the total equals the sum of the breakdown" passes or fails
//   depending on when it ran, so it gets deleted.
//
//   A reviewer looking at two screens showing the same metric sees two numbers
//   and cannot tell whether they have found a bug or a coin toss. That is the
//   one that matters: an inconsistency in a simulated dashboard should be a
//   *finding*, and randomness makes every finding unfalsifiable.
//
// So every figure here is a pure function of the question asked. The same query
// returns the same dataset, on every render, in every test, on every machine,
// for ever. `Math.random()` and `Date.now()` appear nowhere below.
//
// ── How the numbers are shaped ───────────────────────────────────────────────
//
// The goal is *plausible* rather than pretty. A dashboard where every line rises
// smoothly would hide exactly the UI problems this build exists to find — no
// dips to render, no zero days, no incomplete buckets, no suppressed cells.
// So the generator composes four things:
//
//   **A base magnitude per metric**, so views outnumber saves outnumber sales by
//   the orders of magnitude they do in reality.
//   **A subject scale**, so a neighbourhood is not busier than the platform.
//   **Weekly seasonality**, so weekends dip and the chart has a shape a person
//   recognises.
//   **A slow trend plus deterministic noise**, so a comparison against the
//   previous period is sometimes up and sometimes down.
//
// ── Deliberate edge cases ────────────────────────────────────────────────────
//
// §73 asks the UI to distinguish nine empty and unavailable states, and a
// provider that always returns healthy data makes eight of them unreachable in
// development. So specific subject ids produce specific conditions — see
// `DEV_SUBJECT_FIXTURES`. They are named rather than hashed so a reviewer can
// navigate to one deliberately.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsAccess,
  AnalyticsBreakdown,
  AnalyticsBucket,
  AnalyticsComparison,
  AnalyticsComparisonBasis,
  AnalyticsDataset,
  AnalyticsDimensionKey,
  AnalyticsFunnel,
  AnalyticsGranularity,
  AnalyticsInsight,
  AnalyticsLeaderboard,
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsPoint,
  AnalyticsQuery,
  AnalyticsRetentionTable,
  AnalyticsSeries,
  AnalyticsSubject,
  AnalyticsSubjectType,
  DataFreshness,
} from '@/types/analytics';
import type { Money } from '@/types/financial';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import { dimensionLabel } from '@/lib/analytics/dimension-labels';
import {
  baselineRange,
  defaultGranularity,
  enumerateBuckets,
  isPartialBucket,
  rangeDayCount,
} from '@/lib/analytics/time-range';

// ═════════════════════════════════════════════════════════════════════════════
// DETERMINISM
// ═════════════════════════════════════════════════════════════════════════════

/**
 * FNV-1a, 32-bit.
 *
 * Chosen over anything cryptographic because this is a *spreading* function, not
 * a security one, and because it is eight lines with no dependency. The
 * `>>> 0` keeps it unsigned in a language that will otherwise hand back a
 * negative number halfway through and make every downstream modulo wrong.
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 — a small, well-distributed PRNG.
 *
 * Seeded per call rather than held as module state, which is the property that
 * makes this file safe: a generator with a cursor would produce different values
 * depending on how many times it had been called before, so two screens asking
 * the same question in a different order would disagree. A pure function of the
 * seed cannot.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A single deterministic 0–1 value for a set of dimensions. */
function noise(...parts: (string | number)[]): number {
  return seededRandom(hashString(parts.join('|')))();
}

/** A deterministic value in a range, inclusive of neither end in practice. */
function noiseBetween(min: number, max: number, ...parts: (string | number)[]): number {
  return min + noise(...parts) * (max - min);
}

// ═════════════════════════════════════════════════════════════════════════════
// SHAPE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Roughly how busy a subject is relative to the whole platform.
 *
 * These numbers are not claims about the real product — they are the ratios that
 * make a set of dashboards internally coherent, so a reviewer opening the
 * platform dashboard and then one community does not see the community reporting
 * more views than everybody.
 */
const SUBJECT_SCALE: Record<AnalyticsSubjectType, number> = {
  platform: 1,
  country: 0.11,
  community: 0.045,
  neighborhood: 0.006,
  creator: 0.0015,
  provider: 0.0008,
  employer: 0.0012,
  job: 0.00025,
  seller: 0.0009,
  listing: 0.00018,
  landlord: 0.0007,
  housing: 0.00022,
  organization: 0.0025,
  guide: 0.0004,
  event: 0.0006,
  update: 0.0003,
  campaign: 0.0011,
};

/**
 * A platform-level daily magnitude per metric.
 *
 * Ordered by the funnel they sit in, so impressions ≫ views ≫ saves ≫ contacts ≫
 * sales holds by construction rather than by luck. A generator that produced
 * more sales than views would make every funnel render backwards.
 */
const METRIC_BASE: Partial<Record<AnalyticsMetricKey, number>> = {
  // Audience
  'audience.users.total': 148_000,
  'audience.users.new': 420,
  'audience.users.active.daily': 21_500,
  'audience.users.active.weekly': 58_000,
  'audience.users.active.monthly': 96_000,
  'audience.users.returning': 17_800,
  'audience.sessions.count': 42_000,
  'audience.sessions.duration.median': 384,
  // Growth
  'growth.members.net': 310,
  'growth.communities.new': 2,
  'growth.content.new': 890,
  'growth.providers.new': 34,
  'growth.organizations.new': 8,
  'growth.creators.new': 46,
  'growth.listings.new': 260,
  'growth.jobs.new': 118,
  'growth.housing.new': 74,
  // Content
  'content.impressions': 640_000,
  'content.views': 88_000,
  'content.reach': 52_000,
  'content.uniqueViewers': 41_000,
  'content.saves': 4_900,
  'content.shares': 2_100,
  'content.comments': 3_400,
  'content.published': 890,
  // Discovery
  'search.volume': 34_000,
  'search.appearances': 96_000,
  'recommendation.impressions': 210_000,
  'recommendation.clicks': 12_600,
  'recommendation.saves': 2_800,
  'recommendation.dismissals': 4_100,
  'recommendation.conversions': 940,
  'map.opens': 9_800,
  'map.markerInteractions': 26_000,
  'map.locationSearches': 5_400,
  'map.routeRequests': 1_900,
  'map.filterUses': 7_300,
  // Reach
  'reach.followers': 3_200,
  'reach.members': 12_400,
  'reach.communities': 9,
  'reach.countries': 24,
  // Commerce
  'listing.contacts': 3_100,
  'listing.offers': 860,
  'listing.reservations': 410,
  'listing.sales': 240,
  'job.applications': 1_850,
  'job.shortlisted': 430,
  'job.interviewed': 180,
  'job.hired': 42,
  'housing.inquiries': 1_320,
  'housing.applications': 290,
  'provider.profileViews': 14_000,
  'provider.contactActions': 2_400,
  'provider.leads': 780,
  'provider.reviews': 210,
  // Events and organizations
  'event.rsvps': 1_650,
  'event.attendance': 1_040,
  'organization.followers': 2_900,
  'organization.announcementReach': 18_000,
  // Conversion
  'conversion.count': 940,
  // Money — minor units. See `MONEY_BASE_NOTE`.
  'revenue.gross': 4_820_00,
  'revenue.net': 4_100_00,
  'revenue.pending': 640_00,
  'revenue.available': 1_180_00,
  'revenue.paid': 3_460_00,
  'revenue.refunded': 190_00,
  'spend.total': 1_240_00,
  'wallet.deposits': 2_900_00,
  'wallet.withdrawals': 2_150_00,
  'wallet.transactions': 3_600,
  'wallet.donations': 780_00,
  'wallet.contributions': 420_00,
  'rewards.pointsEarned': 24_000,
  'rewards.pointsRedeemed': 9_800,
  'monetization.impressions': 180_000,
  'monetization.clicks': 7_400,
  'monetization.conversions': 620,
  'monetization.activeSubscriptions': 1_840,
  'monetization.featuredPlacements': 320,
  // Communication
  'notification.delivered': 128_000,
  'notification.opened': 61_000,
  'notification.dismissed': 22_000,
  'notification.actioned': 19_400,
  'messaging.conversationsStarted': 4_600,
  'messaging.messagesSent': 31_000,
  // Inventory — stocks rather than flows, so they do not scale with range length.
  'inventory.guides': 4_180,
  'inventory.jobs': 1_240,
  'inventory.listings': 6_900,
  'inventory.housing': 2_310,
  'inventory.providers': 3_450,
  'inventory.organizations': 610,
  'inventory.events': 480,
  'inventory.updates': 1_900,
  'inventory.communities': 84,
};

/** Rates, as a plausible band rather than a base magnitude. */
const RATE_BAND: Partial<Record<AnalyticsMetricKey, [number, number]>> = {
  'audience.stickiness.dau_mau': [0.18, 0.28],
  'growth.members.rate': [-0.01, 0.06],
  'retention.day1': [0.38, 0.52],
  'retention.day7': [0.19, 0.31],
  'retention.day30': [0.11, 0.2],
  'retention.weekly': [0.22, 0.34],
  'retention.monthly': [0.16, 0.27],
  'retention.churn': [0.04, 0.11],
  'content.engagementRate': [0.03, 0.09],
  'content.completionRate': [0.32, 0.61],
  'search.noResultRate': [0.06, 0.15],
  'search.clickThroughRate': [0.41, 0.62],
  'search.toActionRate': [0.08, 0.17],
  'recommendation.clickThroughRate': [0.04, 0.09],
  'reach.crossCommunity': [0.12, 0.38],
  'job.applicationRate': [0.05, 0.14],
  'event.attendanceRate': [0.54, 0.78],
  'conversion.rate': [0.02, 0.09],
  'funnel.dropOffRate': [0.18, 0.55],
  'provider.ratingAverage': [3.8, 4.8],
  'notification.readRate': [0.36, 0.58],
  'notification.actionRate': [0.09, 0.21],
  'messaging.responseRate': [0.52, 0.86],
  'messaging.unreadRate': [0.04, 0.19],
};

/** Metrics that are a stock at a point in time, not a sum over a period. */
const STOCK_METRICS = new Set<AnalyticsMetricKey>([
  'audience.users.total',
  'audience.users.active.daily',
  'audience.users.active.weekly',
  'audience.users.active.monthly',
  'audience.stickiness.dau_mau',
  'reach.followers',
  'reach.members',
  'reach.communities',
  'reach.countries',
  'reach.crossCommunity',
  'revenue.pending',
  'revenue.available',
  'provider.ratingAverage',
  'monetization.activeSubscriptions',
  'monetization.featuredPlacements',
  'messaging.unreadRate',
  'inventory.guides',
  'inventory.jobs',
  'inventory.listings',
  'inventory.housing',
  'inventory.providers',
  'inventory.organizations',
  'inventory.events',
  'inventory.updates',
  'inventory.communities',
]);

/**
 * Weekly seasonality.
 *
 * Index 0 is Sunday. Weekends are quieter for jobs and busier for events in
 * reality; one curve is used for everything here because the point is to give
 * charts a recognisable rhythm, not to model the product.
 */
const WEEKDAY_FACTOR = [0.78, 1.06, 1.09, 1.07, 1.04, 0.97, 0.81];

function dayOfWeek(civil: string): number {
  const [year, month, day] = civil.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Days between two civil dates. Used for the slow trend. */
function dayIndex(civil: string): number {
  const [year, month, day] = civil.split('-').map((part) => Number.parseInt(part, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

// ═════════════════════════════════════════════════════════════════════════════
// FIXTURES — §73's states, reachable on purpose
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Subject ids that produce a specific condition.
 *
 * Named rather than hashed so a reviewer can navigate to one deliberately, and
 * exported so the journey tests can assert each state renders.
 */
export const DEV_SUBJECT_FIXTURES = {
  /** Every metric returns zero. Distinguishes "no activity" from "no data". */
  noActivity: 'dev-analytics-no-activity',
  /** No metrics at all. The subject exists; nothing has been computed for it. */
  noData: 'dev-analytics-no-data',
  /** Half the requested metrics come back; the rest are unavailable. §37 PARTIAL. */
  partial: 'dev-analytics-partial',
  /** Cell counts below the suppression threshold. §47. */
  suppressed: 'dev-analytics-suppressed',
  /** Too young for a comparison baseline. §7 insufficientHistory. */
  newSubject: 'dev-analytics-new',
  /** The backend answered that it cannot produce this. §37 UNAVAILABLE. */
  unavailable: 'dev-analytics-unavailable',
} as const;

type FixtureKind = keyof typeof DEV_SUBJECT_FIXTURES | 'normal';

function fixtureFor(subject: AnalyticsSubject): FixtureKind {
  const id = subject.id ?? '';
  const entry = (Object.entries(DEV_SUBJECT_FIXTURES) as [FixtureKind, string][]).find(
    ([, value]) => value === id
  );
  return entry ? entry[0] : 'normal';
}

// ═════════════════════════════════════════════════════════════════════════════
// CURRENCY — §57
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A small currency catalogue with correct exponents.
 *
 * Four currencies with three different exponents, chosen deliberately: a
 * development provider that only ever emitted GBP would let an exponent bug ship,
 * because every figure would be two-minor-digit and the arithmetic would look
 * right. JPY has none and KWD has three.
 */
const DEV_CURRENCIES: { currency: string; exponent: number; symbol: string }[] = [
  { currency: 'GBP', exponent: 2, symbol: '£' },
  { currency: 'NGN', exponent: 2, symbol: '₦' },
  { currency: 'JPY', exponent: 0, symbol: '¥' },
  { currency: 'KWD', exponent: 3, symbol: 'د.ك' },
];

/**
 * The currency a subject reports in.
 *
 * Deterministic per subject, so a creator's revenue is in the same currency every
 * time it is asked for — a dashboard whose currency changed between renders would
 * be worse than useless.
 */
export function devCurrencyFor(subject: AnalyticsSubject): (typeof DEV_CURRENCIES)[number] {
  const index = hashString(`${subject.type}:${subject.id ?? 'self'}`) % DEV_CURRENCIES.length;
  return DEV_CURRENCIES[index];
}

function devMoney(subject: AnalyticsSubject, majorish: number): Money {
  const currency = devCurrencyFor(subject);
  // `majorish` is expressed in two-minor-digit terms by `METRIC_BASE`; rescale to
  // the currency's actual exponent so a JPY figure is not a hundredth of a yen.
  const minorUnits = Math.round(majorish * 10 ** (currency.exponent - 2));
  return {
    amount: minorUnits / 10 ** currency.exponent,
    currency: currency.currency,
    minorUnits,
    exponent: currency.exponent,
    symbol: currency.symbol,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// VALUE GENERATION
// ═════════════════════════════════════════════════════════════════════════════

/** The value of a metric on one day, for one subject. */
function dailyValue(
  key: AnalyticsMetricKey,
  subject: AnalyticsSubject,
  civil: string
): number {
  const band = RATE_BAND[key];
  if (band) {
    // A rate wanders inside its band rather than scaling with the subject — a
    // small community's conversion rate is not a fraction of the platform's.
    const drift = Math.sin(dayIndex(civil) / 11 + hashString(key) / 1e9) * 0.35;
    const raw = noiseBetween(band[0], band[1], key, subject.type, subject.id ?? '', civil);
    return clamp(raw + drift * (band[1] - band[0]) * 0.5, band[0] * 0.6, band[1] * 1.25);
  }

  const base = METRIC_BASE[key];
  if (base === undefined) return 0;

  const scale = SUBJECT_SCALE[subject.type] ?? 0.001;
  const seasonal = WEEKDAY_FACTOR[dayOfWeek(civil)];

  // A slow trend so a period-on-period comparison is sometimes up and sometimes
  // down, with the direction determined by the subject rather than by the clock.
  const trendDirection = noise('trend', subject.type, subject.id ?? '', key) > 0.42 ? 1 : -1;
  const trend = 1 + trendDirection * (dayIndex(civil) % 180) * 0.0009;

  const jitter = noiseBetween(0.84, 1.16, key, subject.type, subject.id ?? '', civil);

  const value = base * scale * seasonal * trend * jitter;

  // Stocks are a level, not a daily flow, so they are not divided across the
  // period. Flows are daily figures and sum over the range.
  return STOCK_METRICS.has(key) ? Math.max(0, value) : Math.max(0, value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Whether a metric's period value is a sum of its days or the last of them. */
function aggregateOverRange(
  key: AnalyticsMetricKey,
  subject: AnalyticsSubject,
  buckets: string[]
): number {
  if (buckets.length === 0) return 0;

  if (STOCK_METRICS.has(key) || RATE_BAND[key]) {
    // The value at the end of the period. Summing a stock would report a member
    // count of thirty times the membership, which is the classic version of this
    // bug and the reason the distinction is modelled at all.
    return dailyValue(key, subject, buckets[buckets.length - 1]);
  }

  return buckets.reduce((total, civil) => total + dailyValue(key, subject, civil), 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// FRESHNESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The freshness stamp on every simulated figure.
 *
 * `computedAt` is derived from the range rather than from the clock — §60 forbids
 * a value that changes on every render, and `new Date().toISOString()` is exactly
 * that. It is the day after the range ends, at 03:00, which is what a nightly
 * rollup would actually produce.
 *
 * `sourceName` says "Diaspora development adapter" in plain words. §38 forbids
 * silently turning a gap into a production number, and the source name is the
 * part of that which survives into a screenshot.
 */
export function devFreshness(rangeTo: string, gapKey: string): DataFreshness {
  return {
    computedAt: `${rangeTo}T03:00:00.000Z`,
    sourceName: 'Diaspora development adapter',
    methodology:
      'Generated deterministically from the requested subject, metric and date. Not a measurement of anything.',
    limitations: [
      'These figures are simulated and must not be used for any decision.',
      `No backend contract exists for this capability (${gapKey}).`,
    ],
    sampleSize: undefined,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// METRICS
// ═════════════════════════════════════════════════════════════════════════════

function buildComparison(
  key: AnalyticsMetricKey,
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  currentValue: number,
  fixture: FixtureKind
): AnalyticsComparison | null {
  const basis: AnalyticsComparisonBasis = query.comparison ?? 'none';
  if (basis === 'none') return null;

  // §7: a subject with no history has no baseline, and saying "0%" would be a
  // claim that nothing changed rather than that nothing is known.
  if (fixture === 'newSubject') {
    return { basis, changePercent: null, unavailableReason: 'insufficientHistory' };
  }
  if (fixture === 'suppressed') {
    return { basis, changePercent: null, unavailableReason: 'suppressed' };
  }

  const window = baselineRange(query.range, basis);
  if (!window) {
    // Platform, community and country averages are a figure rather than a period.
    // The adapter has no cross-subject aggregate to average, so it says so rather
    // than inventing a peer group.
    return { basis, changePercent: null, unavailableReason: 'unsupported' };
  }

  const baselineBuckets = enumerateBuckets(window, defaultGranularity(window));
  const baselineValue = aggregateOverRange(key, subject, baselineBuckets);

  if (baselineValue <= 0) {
    return {
      basis,
      baselineFrom: window.from,
      baselineTo: window.to,
      baselineValue: 0,
      changePercent: null,
      unavailableReason: 'zeroBaseline',
    };
  }

  return {
    basis,
    baselineFrom: window.from,
    baselineTo: window.to,
    baselineValue,
    changePercent: (currentValue - baselineValue) / baselineValue,
    changeAbsolute: currentValue - baselineValue,
  };
}

function buildMetric(
  key: AnalyticsMetricKey,
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  buckets: string[],
  gapKey: string,
  fixture: FixtureKind
): AnalyticsMetric {
  const definition = ANALYTICS_DEFINITIONS[key];
  const raw = fixture === 'noActivity' ? 0 : aggregateOverRange(key, subject, buckets);

  const isInteger = definition.format === 'count';
  const value = isInteger ? Math.round(raw) : raw;

  const isSuppressed = fixture === 'suppressed' && definition.privacyClass !== 'public';

  return {
    key,
    label: definition.label,
    value: { value, source: 'simulated', gapKey },
    format: definition.format,
    computation: 'server-aggregate',
    money: definition.format === 'currency' ? devMoney(subject, value) : null,
    higherIsBetter: definition.higherIsBetter,
    comparison: buildComparison(key, subject, query, value, fixture),
    freshness: devFreshness(query.range.to, gapKey),
    privacyClass: definition.privacyClass,
    isSuppressed,
    unit: definition.format === 'duration' ? 'seconds' : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SERIES
// ═════════════════════════════════════════════════════════════════════════════

function buildSeries(
  key: AnalyticsMetricKey,
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  granularity: AnalyticsGranularity,
  fixture: FixtureKind
): AnalyticsSeries {
  const definition = ANALYTICS_DEFINITIONS[key];
  const buckets = enumerateBuckets(query.range, granularity);
  const comparisonWindow = query.comparison ? baselineRange(query.range, query.comparison) : null;
  const comparisonBuckets = comparisonWindow
    ? enumerateBuckets(comparisonWindow, granularity)
    : [];

  const points: AnalyticsPoint[] = buckets.map((at, index) => {
    const value = fixture === 'noActivity' ? 0 : dailyValue(key, subject, at);
    const baselineAt = comparisonBuckets[index];

    return {
      at,
      value: definition.format === 'count' ? Math.round(value) : value,
      baselineValue: baselineAt ? dailyValue(key, subject, baselineAt) : null,
      // Derived from the range's own timezone, not from the wall clock, so the
      // flag is stable for a given query. `isPartialBucket` takes a `now` and the
      // range's `to` is used as that instant deliberately.
      isPartialBucket: isPartialBucket(at, granularity, query.range, new Date(`${query.range.to}T12:00:00Z`)),
    };
  });

  return {
    key,
    label: definition.label,
    granularity,
    format: definition.format,
    points,
    source: 'simulated',
    currency: definition.format === 'currency' ? devCurrencyFor(subject).currency : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BREAKDOWNS — §8
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The buckets a dimension can be split into.
 *
 * Country and community are deliberately **different lists with different
 * labels**, because §65's warning applies to the development data too: a provider
 * that used the same nine names for both would make the conflation invisible in
 * exactly the build where somebody would have caught it.
 */
const DIMENSION_BUCKETS: Record<AnalyticsDimensionKey, { key: string; label: string }[]> = {
  date: [],
  country: [
    { key: 'GB', label: 'United Kingdom' },
    { key: 'NG', label: 'Nigeria' },
    { key: 'US', label: 'United States' },
    { key: 'GH', label: 'Ghana' },
    { key: 'IN', label: 'India' },
    { key: 'CA', label: 'Canada' },
    { key: 'MU', label: 'Mauritius' },
    { key: 'KE', label: 'Kenya' },
  ],
  community: [
    { key: 'dev-ng', label: 'Nigerian community' },
    { key: 'dev-gh', label: 'Ghanaian community' },
    { key: 'dev-in', label: 'Indian community' },
    { key: 'dev-ke', label: 'Kenyan community' },
    { key: 'dev-carib', label: 'Caribbean community' },
    { key: 'dev-wafr', label: 'West African diaspora' },
  ],
  neighborhood: [
    { key: 'dev-peckham', label: 'Peckham' },
    { key: 'dev-dalston', label: 'Dalston' },
    { key: 'dev-moss-side', label: 'Moss Side' },
    { key: 'dev-handsworth', label: 'Handsworth' },
  ],
  category: [
    { key: 'housing', label: 'Housing' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'legal', label: 'Legal & immigration' },
    { key: 'health', label: 'Health' },
    { key: 'education', label: 'Education' },
    { key: 'food', label: 'Food & groceries' },
  ],
  contentType: [
    { key: 'guide', label: 'Guides' },
    { key: 'update', label: 'Updates' },
    { key: 'event', label: 'Events' },
    { key: 'listing', label: 'Listings' },
    { key: 'job', label: 'Jobs' },
    { key: 'housing', label: 'Housing' },
  ],
  source: [
    { key: 'search', label: 'Search' },
    { key: 'recommendation', label: 'Recommendations' },
    { key: 'feed', label: 'Home feed' },
    { key: 'map', label: 'Map' },
    { key: 'notification', label: 'Notifications' },
    { key: 'share', label: 'Shared links' },
    { key: 'direct', label: 'Direct' },
  ],
  surface: [
    { key: 'home', label: 'Home' },
    { key: 'discover', label: 'Discover' },
    { key: 'search', label: 'Search results' },
    { key: 'detail', label: 'Detail pages' },
  ],
  placement: [
    { key: 'featured', label: 'Featured' },
    { key: 'boost', label: 'Boost' },
    { key: 'sponsored', label: 'Sponsored' },
    { key: 'promoted', label: 'Promoted' },
  ],
  plan: [
    { key: 'free', label: 'Free' },
    { key: 'starter', label: 'Starter' },
    { key: 'business', label: 'Business' },
    { key: 'recruiter', label: 'Recruiter' },
  ],
  status: [
    { key: 'active', label: 'Active' },
    { key: 'paused', label: 'Paused' },
    { key: 'ended', label: 'Ended' },
  ],
  language: [
    { key: 'en', label: 'English' },
    { key: 'fr', label: 'French' },
    { key: 'yo', label: 'Yoruba' },
    { key: 'tw', label: 'Twi' },
  ],
  platform: [
    { key: 'ios', label: 'iOS' },
    { key: 'android', label: 'Android' },
    { key: 'web', label: 'Web' },
  ],
};

function buildBreakdown(
  metricKey: AnalyticsMetricKey,
  dimension: AnalyticsDimensionKey,
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  total: number,
  fixture: FixtureKind
): AnalyticsBreakdown | null {
  const candidates = DIMENSION_BUCKETS[dimension];
  if (!candidates || candidates.length === 0) return null;

  const definition = ANALYTICS_DEFINITIONS[metricKey];

  // Deterministic weights that sum to the metric total, so a breakdown and its
  // headline agree. A generator that produced independent numbers would show a
  // breakdown summing to more than the total, which is the single most obvious
  // way a simulated dashboard reveals itself — and, worse, the exact bug a real
  // one can have.
  const weights = candidates.map((bucket) =>
    noiseBetween(0.2, 1, metricKey, dimension, bucket.key, subject.id ?? '', query.range.from)
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  const buckets: AnalyticsBucket[] = candidates
    .map((bucket, index) => {
      const share = weights[index] / weightTotal;
      const raw = total * share;
      return {
        key: bucket.key,
        label: bucket.label,
        value: definition.format === 'count' ? Math.round(raw) : raw,
        ratio: share,
        entity: null,
        comparison: null,
      };
    })
    .sort((left, right) => right.value - left.value);

  return {
    metricKey,
    dimension,
    label: `${definition.label} by ${dimensionLabel(dimension)}`,
    buckets: fixture === 'noActivity' ? buckets.map((bucket) => ({ ...bucket, value: 0, ratio: 0 })) : buckets,
    total,
    remainingBucketCount: 0,
    source: 'simulated',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// FUNNELS — §32
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §32's four funnels, verbatim.
 *
 * The brief names exactly these and warns against inventing funnel events, so the
 * development provider offers exactly these and no more. A fifth invented funnel
 * in the dev data would become a fifth expected contract in somebody's head.
 */
export const DEV_FUNNELS: Record<string, { label: string; steps: { key: string; label: string }[] }> = {
  job: {
    label: 'Job application funnel',
    steps: [
      { key: 'view', label: 'Viewed' },
      { key: 'apply', label: 'Applied' },
      { key: 'shortlist', label: 'Shortlisted' },
      { key: 'interview', label: 'Interviewed' },
      { key: 'hire', label: 'Hired' },
    ],
  },
  marketplace: {
    label: 'Marketplace funnel',
    steps: [
      { key: 'impression', label: 'Shown' },
      { key: 'view', label: 'Viewed' },
      { key: 'save', label: 'Saved' },
      { key: 'contact', label: 'Contacted' },
      { key: 'offer', label: 'Offer made' },
      { key: 'reservation', label: 'Reserved' },
      { key: 'purchase', label: 'Bought' },
    ],
  },
  housing: {
    label: 'Housing enquiry funnel',
    steps: [
      { key: 'impression', label: 'Shown' },
      { key: 'view', label: 'Viewed' },
      { key: 'save', label: 'Saved' },
      { key: 'inquiry', label: 'Enquired' },
      { key: 'application', label: 'Applied' },
    ],
  },
  provider: {
    label: 'Provider discovery funnel',
    steps: [
      { key: 'impression', label: 'Shown' },
      { key: 'profile', label: 'Profile opened' },
      { key: 'contact', label: 'Contacted' },
      { key: 'lead', label: 'Replied to' },
      { key: 'conversion', label: 'Converted' },
    ],
  },
  monetization: {
    label: 'Placement funnel',
    steps: [
      { key: 'impression', label: 'Shown' },
      { key: 'click', label: 'Opened' },
      { key: 'purchase', label: 'Bought' },
      { key: 'conversion', label: 'Converted' },
    ],
  },
};

export function buildFunnel(
  funnelKey: string,
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  gapKey: string,
  fixture: FixtureKind = 'normal'
): AnalyticsFunnel | null {
  const spec = DEV_FUNNELS[funnelKey];
  if (!spec) return null;

  const scale = SUBJECT_SCALE[subject.type] ?? 0.001;
  const days = rangeDayCount(query.range);
  let population = Math.round(
    620_000 * scale * days * noiseBetween(0.85, 1.15, funnelKey, subject.id ?? '', query.range.from)
  );

  const steps = spec.steps.map((step, index) => {
    if (index > 0) {
      // Each step keeps a deterministic fraction of the one before it. Bounded
      // well below 1 so the funnel always narrows — a funnel that widened would
      // render a negative drop-off and is not a thing that happens.
      const retained = noiseBetween(0.18, 0.62, funnelKey, step.key, subject.id ?? '', query.range.from);
      population = Math.max(0, Math.round(population * retained));
    }
    return { key: step.key, label: step.label, count: fixture === 'noActivity' ? 0 : population };
  });

  const first = steps[0]?.count ?? 0;

  return {
    key: funnelKey,
    label: spec.label,
    steps: steps.map((step, index) => ({
      ...step,
      conversionFromPrevious:
        index === 0 || steps[index - 1].count === 0 ? null : step.count / steps[index - 1].count,
      conversionFromStart: first === 0 ? null : step.count / first,
      dropOffFromPrevious:
        index === 0 || steps[index - 1].count === 0 ? null : 1 - step.count / steps[index - 1].count,
    })),
    range: query.range,
    source: 'simulated',
    computation: 'server-aggregate',
    freshness: devFreshness(query.range.to, gapKey),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// RETENTION — §33
// ═════════════════════════════════════════════════════════════════════════════

export function buildRetention(
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  gapKey: string,
  granularity: 'day' | 'week' | 'month' = 'week',
  cohortCount = 8
): AnalyticsRetentionTable {
  const offsets = granularity === 'day' ? 8 : granularity === 'week' ? 7 : 6;
  const offsetLabels = Array.from({ length: offsets }, (_, index) =>
    granularity === 'day' ? `Day ${index}` : granularity === 'week' ? `Week ${index}` : `Month ${index}`
  );

  const stepDays = granularity === 'day' ? 1 : granularity === 'week' ? 7 : 30;
  const endIndex = dayIndex(query.range.to);

  const cohorts = Array.from({ length: cohortCount }, (_, cohortPosition) => {
    const cohortOffsetDays = (cohortCount - 1 - cohortPosition) * stepDays;
    const cohortDate = civilFromIndex(endIndex - cohortOffsetDays);
    const cohortSize = Math.round(
      420 * (SUBJECT_SCALE[subject.type] ?? 0.001) * 90 *
        noiseBetween(0.7, 1.3, 'cohort', subject.id ?? '', cohortDate)
    );

    // How many offsets have actually elapsed for this cohort. Beyond that the
    // value is null, not zero — §33 requires an incomplete cohort to be
    // distinguishable from one that genuinely lost everybody.
    const elapsed = Math.floor(cohortOffsetDays / stepDays) + 1;

    // Monotonically decreasing **by construction** rather than by arithmetic that
    // usually decreases: each offset is the previous value times a factor strictly
    // below one. An earlier version multiplied a decay curve by a jitter term,
    // which occasionally produced a cohort whose retention rose between two
    // offsets — a shape that cannot happen, and which would have rendered as a
    // cohort table nobody could trust.
    let running = 1;
    const values = offsetLabels.map((_, offset) => {
      if (offset >= elapsed) return null;
      if (offset === 0) return 1;

      const decay = noiseBetween(0.62, 0.92, 'retain', subject.id ?? '', cohortDate, offset);
      running = clamp(running * decay, 0.01, 1);
      return running;
    });

    return {
      cohortDate,
      cohortSize: Math.max(0, cohortSize),
      values,
      isIncomplete: elapsed < offsets,
    };
  });

  return {
    granularity,
    offsetLabels,
    measurementWindow:
      granularity === 'day'
        ? 'A member counts as retained on day N if they were active at any point during that calendar day, in the reporting timezone.'
        : granularity === 'week'
          ? 'A member counts as retained in week N if they were active at least once during that week. Weeks begin on Monday in the reporting timezone.'
          : 'A member counts as retained in month N if they were active at least once during that calendar month.',
    cohorts,
    unavailableCohorts: [],
    source: 'simulated',
    freshness: devFreshness(query.range.to, gapKey),
  };
}

function civilFromIndex(index: number): string {
  const date = new Date(index * 86_400_000);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARDS
// ═════════════════════════════════════════════════════════════════════════════

const DEV_CONTENT_TITLES = [
  'Registering with a GP when you have just arrived',
  'What a right-to-rent check actually involves',
  'Opening a bank account without a UK credit history',
  'Sending money home: what the fees really are',
  'Getting a National Insurance number',
  'Your rights if your landlord will not do repairs',
  'Recognised qualifications: what transfers and what does not',
  'Finding a barber who knows your hair',
  'Nigerian groceries in South London',
  'Term dates, uniforms and what schools expect',
  'Council tax: who pays, who is exempt',
  'What to do if your visa application is refused',
];

export function buildLeaderboard(
  key: string,
  label: string,
  metricKey: AnalyticsMetricKey,
  subject: AnalyticsSubject,
  query: AnalyticsQuery,
  size = 8
): AnalyticsLeaderboard {
  const definition = ANALYTICS_DEFINITIONS[metricKey];
  const scale = SUBJECT_SCALE[subject.type] ?? 0.001;
  const base = (METRIC_BASE[metricKey] ?? 1000) * scale * rangeDayCount(query.range);

  const rows = Array.from({ length: size }, (_, index) => {
    const title = DEV_CONTENT_TITLES[index % DEV_CONTENT_TITLES.length];
    const value = base * noiseBetween(0.08, 0.34, key, title, subject.id ?? '', query.range.from);
    return {
      title,
      value: definition.format === 'count' ? Math.round(value) : value,
      entityId: `dev-content-${hashString(title) % 100000}`,
    };
  })
    .sort((left, right) => right.value - left.value)
    .map((row, index) => ({
      position: index + 1,
      entity: {
        entityType: 'guide' as AnalyticsSubjectType,
        entityId: row.entityId,
        title: row.title,
        route: `/guide/${row.entityId}`,
      },
      value: row.value,
      format: definition.format,
      secondaryValue: noiseBetween(0.02, 0.12, 'secondary', row.entityId),
      secondaryFormat: 'percentage' as const,
      secondaryLabel: 'engagement',
      comparison: null,
    }));

  return { key, label, metricKey, rows, nextCursor: null, hasMore: false, source: 'simulated' };
}

// ═════════════════════════════════════════════════════════════════════════════
// INSIGHTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Insights the *provider* publishes, standing in for a backend that would.
 *
 * Written as things a platform could genuinely know from its own aggregates, and
 * deliberately never as advice the client could have derived. The distinction
 * matters even in simulated data: if the dev provider emitted "post on Tuesdays",
 * somebody would eventually implement that client-side when the adapter was
 * swapped out, which is the §25 violation this phase is meant to avoid.
 */
export function buildInsights(subject: AnalyticsSubject, query: AnalyticsQuery): AnalyticsInsight[] {
  const pool: AnalyticsInsight[] = [
    {
      key: 'search-no-results',
      headline: 'One in nine searches returns nothing',
      detail:
        'The most common empty searches are about school admissions and dentist registration. Guides on either would land on an existing demand.',
      tone: 'negative',
      action: { label: 'See search analytics', route: '/analytics/discovery' },
      source: 'simulated',
    },
    {
      key: 'cross-community',
      headline: 'A third of your reach is from outside your primary community',
      detail: 'Cross-community reach has been the faster-growing half for three periods.',
      tone: 'positive',
      action: null,
      source: 'simulated',
    },
    {
      key: 'weekend-dip',
      headline: 'Weekend activity is consistently lower',
      detail: 'Saturday and Sunday run about a fifth below weekdays across every content type.',
      tone: 'neutral',
      action: null,
      source: 'simulated',
    },
    {
      key: 'housing-funnel',
      headline: 'Housing enquiries fall off sharply after the save step',
      detail: 'Fewer than one in five saved listings produces an enquiry.',
      tone: 'negative',
      action: { label: 'Open the housing funnel', route: '/analytics/funnel/housing' },
      source: 'simulated',
    },
  ];

  // A deterministic subset, so two subjects do not show identical insight lists
  // and the same subject always shows the same one.
  const start = hashString(`${subject.type}:${subject.id ?? ''}:${query.range.from}`) % pool.length;
  return [pool[start], pool[(start + 1) % pool.length]];
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADLINE METRIC SETS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Which metrics a subject leads with when the query asks for none.
 *
 * One place, so the platform dashboard and the platform export cannot disagree
 * about what "the headline set" means.
 */
export const HEADLINE_METRICS: Record<AnalyticsSubjectType, AnalyticsMetricKey[]> = {
  platform: [
    'audience.users.total',
    'audience.users.active.daily',
    'audience.users.active.monthly',
    'audience.users.new',
    'growth.content.new',
    'audience.stickiness.dau_mau',
  ],
  country: [
    'audience.users.total',
    'audience.users.new',
    'inventory.providers',
    'inventory.guides',
    'inventory.jobs',
    'content.views',
  ],
  community: [
    'reach.members',
    'growth.members.net',
    'growth.members.rate',
    'content.published',
    'content.engagementRate',
    'reach.crossCommunity',
  ],
  neighborhood: [
    'inventory.providers',
    'inventory.housing',
    'inventory.events',
    'inventory.jobs',
    'map.opens',
    'content.views',
  ],
  creator: [
    'content.views',
    'content.reach',
    'reach.followers',
    'content.engagementRate',
    'content.saves',
    'reach.communities',
  ],
  provider: [
    'provider.profileViews',
    'content.impressions',
    'provider.contactActions',
    'provider.leads',
    'provider.ratingAverage',
    'conversion.rate',
  ],
  employer: [
    'content.views',
    'search.appearances',
    'job.applications',
    'job.applicationRate',
    'job.shortlisted',
    'job.hired',
  ],
  job: ['content.views', 'search.appearances', 'job.applications', 'job.applicationRate'],
  seller: [
    'content.impressions',
    'content.views',
    'content.saves',
    'listing.contacts',
    'listing.sales',
    'revenue.gross',
  ],
  listing: ['content.impressions', 'content.views', 'content.saves', 'listing.contacts'],
  landlord: [
    'content.impressions',
    'content.views',
    'content.saves',
    'housing.inquiries',
    'housing.applications',
    'conversion.rate',
  ],
  housing: ['content.impressions', 'content.views', 'content.saves', 'housing.inquiries'],
  organization: [
    'organization.followers',
    'reach.members',
    'event.rsvps',
    'organization.announcementReach',
    'content.engagementRate',
    'reach.communities',
  ],
  guide: ['content.views', 'content.reach', 'content.saves', 'content.completionRate', 'search.appearances'],
  event: ['content.views', 'event.rsvps', 'event.attendance', 'event.attendanceRate', 'content.shares'],
  update: ['content.views', 'content.reach', 'content.shares', 'content.saves'],
  campaign: [
    'monetization.impressions',
    'monetization.clicks',
    'spend.total',
    'monetization.conversions',
    'conversion.rate',
  ],
};

/** Which gap a subject's dataset is attributed to, for the notice and the marker. */
export const SUBJECT_GAP_KEY: Record<AnalyticsSubjectType, string> = {
  platform: 'platformAnalytics',
  country: 'countryAnalytics',
  community: 'communityAnalytics',
  neighborhood: 'neighborhoodAnalytics',
  creator: 'creatorAnalytics',
  provider: 'providerAnalytics',
  employer: 'employerAnalytics',
  job: 'employerAnalytics',
  seller: 'marketplaceAnalytics',
  listing: 'marketplaceAnalytics',
  landlord: 'housingAnalytics',
  housing: 'housingAnalytics',
  organization: 'organizationAnalytics',
  guide: 'contentAnalytics',
  event: 'eventAnalytics',
  update: 'contentAnalytics',
  campaign: 'monetizationAnalytics',
};

/** Which funnel, if any, a subject leads with. */
const SUBJECT_FUNNEL: Partial<Record<AnalyticsSubjectType, string>> = {
  employer: 'job',
  job: 'job',
  seller: 'marketplace',
  listing: 'marketplace',
  landlord: 'housing',
  housing: 'housing',
  provider: 'provider',
  campaign: 'monetization',
};

// ═════════════════════════════════════════════════════════════════════════════
// THE DATASET
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Builds a complete dataset for a query.
 *
 * The one entry point. Pure: same query in, same dataset out, for ever.
 */
export function buildDevDataset(query: AnalyticsQuery): AnalyticsDataset {
  const subject = query.subject;
  const fixture = fixtureFor(subject);
  const gapKey = SUBJECT_GAP_KEY[subject.type] ?? 'platformAnalytics';
  const granularity = query.granularity ?? defaultGranularity(query.range);
  const buckets = enumerateBuckets(query.range, granularity);

  // §73: "no data" is a different state from "no activity", and the difference is
  // whether the platform has anything to say at all. This arm returns a dataset
  // with no metrics; `noActivity` returns metrics that are genuinely zero.
  if (fixture === 'noData' || fixture === 'unavailable') {
    return {
      subject,
      range: query.range,
      comparison: query.comparison ?? 'none',
      status: fixture === 'unavailable' ? 'UNAVAILABLE' : 'DEVELOPMENT_DATA',
      metrics: [],
      series: [],
      breakdowns: [],
      funnels: [],
      retention: null,
      leaderboards: [],
      insights: [],
      freshness: devFreshness(query.range.to, gapKey),
      unavailableMetrics: query.metrics ?? HEADLINE_METRICS[subject.type] ?? [],
      gapKey,
      availableFilters: [],
    };
  }

  const requested = query.metrics?.length
    ? query.metrics
    : (HEADLINE_METRICS[subject.type] ?? []);

  // §37 PARTIAL: some metrics answer and some do not, and a dataset must be able
  // to say so rather than choosing between all-real and all-missing.
  const answered = fixture === 'partial' ? requested.filter((_, index) => index % 2 === 0) : requested;
  const unanswered = requested.filter((key) => !answered.includes(key));

  const metrics = answered.map((key) =>
    buildMetric(key, subject, query, buckets, gapKey, fixture)
  );

  const series = query.includeSeries
    ? answered
        .filter((key) => !RATE_BAND[key] || key === 'content.engagementRate')
        .slice(0, 3)
        .map((key) => buildSeries(key, subject, query, granularity, fixture))
    : [];

  const breakdowns = (query.breakdowns ?? [])
    .map((dimension) => {
      const metricKey = answered[0];
      if (!metricKey) return null;
      const total = metrics[0]?.value.value ?? 0;
      return buildBreakdown(metricKey, dimension, subject, query, total, fixture);
    })
    .filter((entry): entry is AnalyticsBreakdown => entry !== null);

  const funnelKey = SUBJECT_FUNNEL[subject.type];
  const funnel = funnelKey ? buildFunnel(funnelKey, subject, query, gapKey, fixture) : null;

  return {
    subject,
    range: query.range,
    comparison: query.comparison ?? 'none',
    status: fixture === 'partial' ? 'PARTIAL' : 'DEVELOPMENT_DATA',
    metrics,
    series,
    breakdowns,
    funnels: funnel ? [funnel] : [],
    retention: null,
    leaderboards:
      subject.type === 'platform' || subject.type === 'creator' || subject.type === 'community'
        ? [buildLeaderboard('top-content', 'Top content', 'content.views', subject, query)]
        : [],
    insights: fixture === 'noActivity' ? [] : buildInsights(subject, query),
    freshness: devFreshness(query.range.to, gapKey),
    unavailableMetrics: unanswered,
    gapKey,
    availableFilters: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — the development stand-in for GAP-025
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A capability set for a subject.
 *
 * **Simulated authorization, and it must be read as such.** §48 says the backend
 * is authoritative; this is a development adapter standing in for a backend that
 * has no capability endpoint yet, and it grants the caller what a member of that
 * role would plausibly have so the screens can be reviewed.
 *
 * Two things keep this from teaching the codebase a bad habit. It lives in the
 * mock layer rather than in `lib/analytics/access.ts`, so no production module
 * can compute a capability. And it is unreachable in a release build, like every
 * other simulated surface — a production bundle has no path to it at all.
 *
 * Note what it deliberately does **not** grant: `canViewAdministrative` is false
 * unless the caller explicitly asked for the administrative preview, so the
 * default development experience is a member's, and the administrative screens
 * are reached on purpose rather than by accident.
 */
export function buildDevAccess(
  subject: AnalyticsSubject,
  options: { asAdministrator?: boolean; hasPremium?: boolean } = {}
): AnalyticsAccess {
  const isAdministrative = subject.type === 'platform';
  const isFinancialSubject = ['creator', 'seller', 'landlord', 'provider', 'employer', 'organization', 'campaign'].includes(
    subject.type
  );

  const canView = isAdministrative ? Boolean(options.asAdministrator) : true;

  return {
    subject,
    canView,
    canViewFinancial: canView && (isFinancialSubject || Boolean(options.asAdministrator)),
    canViewAdministrative: Boolean(options.asAdministrator),
    canCompare: canView && ['community', 'country', 'neighborhood'].includes(subject.type),
    canExport: canView,
    canBuildReports: canView && Boolean(options.hasPremium || options.asAdministrator),
    supportedRanges: [
      'today',
      'yesterday',
      'last7d',
      'last30d',
      'last90d',
      'thisMonth',
      'previousMonth',
      'thisYear',
      'custom',
    ],
    supportedComparisons: ['none', 'previousPeriod', 'previousMonth', 'previousYear'],
    // §46: a restricted metric is omitted rather than nulled. The adapter
    // restricts administrative metrics for a non-administrative caller so the
    // omission path is exercised in development rather than only in production.
    restrictedMetrics: options.asAdministrator
      ? []
      : (['audience.users.total', 'audience.sessions.count'] as AnalyticsMetricKey[]),
    // §58: the development adapter publishes a reporting timezone, so the
    // "platform timezone" arm of the copy is reachable. A deployment that
    // publishes none exercises the other arm.
    reportingTimezone: 'Europe/London',
  };
}
