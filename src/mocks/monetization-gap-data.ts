// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Seed data for the simulated monetization capabilities: campaigns,
//   performance figures, targeting options, usage counters, invoices, plan
//   changes, premium analytics and recommendations. The certified B15 platform
//   has none of these.
//
//   The figures are deliberately unremarkable — a campaign that spent about
//   half its budget, a click-through rate in the low single digits, a usage
//   meter at eleven of fifteen. Flattering mock data produces screens that have
//   only ever been seen in their best state, and the layout that breaks is
//   always the one with the number nobody designed for.
//
//   See `src/config/monetization-gaps.ts`.
//
// ═════════════════════════════════════════════════════════════════════════════

import { money } from './financial-data';
import type {
  Campaign,
  MonetizationRecommendation,
  PerformanceMetric,
  PerformanceReport,
  PerformanceSummary,
  PremiumAnalytics,
  TargetingOptions,
  UsageCounter,
} from '@/types/monetization-gaps';

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// ── Campaigns — MON-GAP-001 ──────────────────────────────────────────────────

/**
 * Four campaigns covering the states that are actually hard to render.
 *
 * `cam-0003` is rejected with a reason and an appeal window, because a rejection
 * is the state a dashboard most easily gets wrong: the row has to carry the
 * reason, the detail screen has to explain the appeal, and neither may imply the
 * member was charged.
 */
export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    campaignId: 'cam-0001',
    name: 'Spring removals push',
    status: 'Active',
    objective: 'Enquiries',
    placements: ['HomeFeed', 'SearchResults', 'CategoryDirectory'],
    creative: {
      headline: 'Affordable moves across London',
      body: 'Same-day removals with insured drivers. Nigerian-owned, serving south London since 2019.',
      callToActionLabel: 'Get a quote',
      callToActionRoute: null,
      mediaReference: null,
    },
    audience: {
      countries: ['GB'],
      communities: ['nigerian-uk'],
      neighbourhoods: ['peckham', 'lewisham'],
      audienceTypes: ['Newcomer'],
      interests: ['housing', 'moving'],
      categories: ['removals'],
      minMonthsInCountry: null,
    },
    budgetKind: 'Total',
    budget: money(15000),
    spend: money(8240),
    remaining: money(6760),
    startsAt: isoDaysAgo(9),
    endsAt: isoDaysAhead(5),
    paymentIntentId: 'pay-cam-0001',
    reviewNote: null,
    rejectionCode: null,
    rejectionReason: null,
    appealableUntil: null,
    createdAt: isoDaysAgo(12),
    submittedAt: isoDaysAgo(11),
    approvedAt: isoDaysAgo(10),
    completedAt: null,
  },
  {
    campaignId: 'cam-0002',
    name: 'Weekend legal clinic',
    status: 'UnderReview',
    objective: 'Attendance',
    placements: ['CommunityEvents', 'KnowledgeHub'],
    creative: {
      headline: 'Free immigration advice, every Saturday',
      body: 'Drop-in clinic with qualified advisers. No appointment needed. Deptford, 10am to 2pm.',
      callToActionLabel: 'See the details',
      callToActionRoute: null,
      mediaReference: null,
    },
    audience: {
      countries: ['GB'],
      communities: [],
      neighbourhoods: ['deptford'],
      audienceTypes: ['Newcomer', 'Student'],
      interests: ['legal', 'visas'],
      categories: [],
      minMonthsInCountry: null,
    },
    budgetKind: 'Daily',
    budget: money(2000),
    spend: money(0),
    remaining: money(2000),
    startsAt: isoDaysAhead(2),
    endsAt: isoDaysAhead(16),
    paymentIntentId: 'pay-cam-0002',
    reviewNote: 'Usually decided within a working day.',
    rejectionCode: null,
    rejectionReason: null,
    appealableUntil: null,
    createdAt: isoDaysAgo(1),
    submittedAt: isoDaysAgo(1),
    approvedAt: null,
    completedAt: null,
  },
  {
    campaignId: 'cam-0003',
    name: 'Fast cash transfers',
    status: 'Rejected',
    objective: 'Traffic',
    placements: ['HomeFeed', 'Notifications'],
    creative: {
      headline: 'Cheapest transfers guaranteed — nobody beats us',
      body: 'Send money home in seconds. Lowest rates anywhere, guaranteed or your money back.',
      callToActionLabel: 'Send now',
      callToActionRoute: null,
      mediaReference: null,
    },
    audience: {
      countries: ['GB'],
      communities: [],
      neighbourhoods: [],
      audienceTypes: [],
      interests: ['remittance'],
      categories: [],
      minMonthsInCountry: null,
    },
    budgetKind: 'Total',
    budget: money(30000),
    spend: money(0),
    remaining: money(30000),
    startsAt: isoDaysAhead(1),
    endsAt: isoDaysAhead(31),
    paymentIntentId: null,
    reviewNote: null,
    rejectionCode: 'creative.unsubstantiated_claim',
    rejectionReason:
      'We cannot run advertisements that guarantee to be the cheapest, because we have no way to check it. Remove the guarantee and submit it again — you have not been charged.',
    appealableUntil: isoDaysAhead(12),
    createdAt: isoDaysAgo(4),
    submittedAt: isoDaysAgo(3),
    approvedAt: null,
    completedAt: null,
  },
  {
    campaignId: 'cam-0004',
    name: 'Winter room listings',
    status: 'Completed',
    objective: 'Traffic',
    placements: ['SearchResults'],
    creative: {
      headline: 'Rooms in Croydon from £520',
      body: 'Bills included, five minutes from East Croydon. Verified landlord.',
      callToActionLabel: 'See the rooms',
      callToActionRoute: null,
      mediaReference: null,
    },
    audience: {
      countries: ['GB'],
      communities: [],
      neighbourhoods: ['croydon'],
      audienceTypes: [],
      interests: ['housing'],
      categories: ['rooms'],
      minMonthsInCountry: null,
    },
    budgetKind: 'Total',
    budget: money(9000),
    spend: money(9000),
    remaining: money(0),
    startsAt: isoDaysAgo(58),
    endsAt: isoDaysAgo(30),
    paymentIntentId: 'pay-cam-0004',
    reviewNote: null,
    rejectionCode: null,
    rejectionReason: null,
    appealableUntil: null,
    createdAt: isoDaysAgo(62),
    submittedAt: isoDaysAgo(61),
    approvedAt: isoDaysAgo(60),
    completedAt: isoDaysAgo(30),
  },
];

// ── Performance — MON-GAP-002 ────────────────────────────────────────────────

/**
 * Metric definitions.
 *
 * Every one carries the sentence that says what the platform counts. §20 forbids
 * inventing metric semantics; carrying the definition with the number is how the
 * contract this asks for keeps that promise once it is real, rather than the
 * definition living in a client constant that drifts.
 */
function metric(
  key: string,
  label: string,
  value: number,
  unit: PerformanceMetric['unit'],
  definition: string,
  changeRatio: number | null = null,
  moneyValue: PerformanceMetric['money'] = null
): PerformanceMetric {
  return { key, label, value, unit, definition, changeRatio, money: moneyValue };
}

/** A plausible daily series with a weekend dip, so the chart has a shape. */
function series(days: number, base: number): { date: string; impressions: number; clicks: number }[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * 86_400_000);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    // Deterministic, not random: a chart that changes shape on every refetch is
    // a chart nobody can review a screenshot of.
    const wobble = ((index * 37) % 23) - 11;
    const impressions = Math.max(0, Math.round(base * (weekend ? 0.62 : 1) + wobble * 4));
    return {
      date: date.toISOString().slice(0, 10),
      impressions,
      clicks: Math.round(impressions * 0.031),
    };
  });
}

export function mockPlacementPerformance(placementId: string): PerformanceReport {
  const points = series(14, 190);
  const impressions = points.reduce((running, point) => running + point.impressions, 0);
  const clicks = points.reduce((running, point) => running + point.clicks, 0);

  return {
    subjectKind: 'placement',
    subjectId: placementId,
    periodStart: isoDaysAgo(14),
    periodEnd: new Date().toISOString(),
    metrics: [
      metric(
        'impressions',
        'Shown',
        impressions,
        'count',
        'How many times your item appeared on somebody’s screen because it was promoted. The same person on the same day counts once.',
        0.18
      ),
      metric(
        'clicks',
        'Tapped',
        clicks,
        'count',
        'How many people opened your item after seeing it in a promoted position.',
        0.09
      ),
      metric(
        'ctr',
        'Tap rate',
        impressions > 0 ? clicks / impressions : 0,
        'percentage',
        'Taps divided by times shown. Anything above two percent is doing well.',
        -0.04
      ),
      metric(
        'enquiries',
        'Enquiries',
        Math.round(clicks * 0.14),
        'count',
        'How many people messaged you or made contact after arriving from the promotion.',
        0.22
      ),
    ],
    series: points,
    reportingLagHours: 4,
  };
}

export function mockCampaignPerformance(campaignId: string): PerformanceReport {
  const points = series(10, 420);
  const impressions = points.reduce((running, point) => running + point.impressions, 0);
  const clicks = points.reduce((running, point) => running + point.clicks, 0);
  const conversions = Math.round(clicks * 0.11);

  return {
    subjectKind: 'campaign',
    subjectId: campaignId,
    periodStart: isoDaysAgo(10),
    periodEnd: new Date().toISOString(),
    metrics: [
      metric('impressions', 'Shown', impressions, 'count', 'How many times the advertisement appeared on somebody’s screen. The same person on the same day counts once.', 0.31),
      metric('clicks', 'Tapped', clicks, 'count', 'How many people tapped the advertisement.', 0.14),
      metric('conversions', 'Results', conversions, 'count', 'How many people did the thing the campaign was for — messaged, applied, registered or bought.', 0.07),
      metric('spend', 'Spent', 8240, 'currency', 'What has been taken from your budget so far.', null, money(8240)),
      metric(
        'cpr',
        'Cost per result',
        conversions > 0 ? 8240 / conversions : 0,
        'currency',
        'What each result has cost you on average. Spend divided by results.',
        -0.11,
        money(conversions > 0 ? Math.round(8240 / conversions) : 0)
      ),
      metric('ctr', 'Tap rate', impressions > 0 ? clicks / impressions : 0, 'percentage', 'Taps divided by times shown.', 0.02),
    ],
    series: points,
    reportingLagHours: 4,
  };
}

export const MOCK_PERFORMANCE_SUMMARY: PerformanceSummary = {
  periodStart: isoDaysAgo(30),
  periodEnd: new Date().toISOString(),
  totalImpressions: 12480,
  totalClicks: 389,
  totalConversions: 41,
  totalSpend: money(11240),
  costPerResult: money(274),
  topPlacementId: 'pl-0001',
  reportingLagHours: 4,
};

// ── Targeting — MON-GAP-007 ──────────────────────────────────────────────────

export const MOCK_TARGETING_OPTIONS: TargetingOptions = {
  countries: [
    { value: 'GB', label: 'United Kingdom', group: 'Europe' },
    { value: 'IE', label: 'Ireland', group: 'Europe' },
    { value: 'DE', label: 'Germany', group: 'Europe' },
    { value: 'CA', label: 'Canada', group: 'North America' },
    { value: 'US', label: 'United States', group: 'North America' },
  ],
  communities: [
    { value: 'nigerian-uk', label: 'Nigerian', group: 'West Africa' },
    { value: 'ghanaian-uk', label: 'Ghanaian', group: 'West Africa' },
    { value: 'kenyan-uk', label: 'Kenyan', group: 'East Africa' },
    { value: 'filipino-uk', label: 'Filipino', group: 'South East Asia' },
    { value: 'polish-uk', label: 'Polish', group: 'Europe' },
  ],
  neighbourhoods: [
    { value: 'peckham', label: 'Peckham', group: 'London' },
    { value: 'lewisham', label: 'Lewisham', group: 'London' },
    { value: 'deptford', label: 'Deptford', group: 'London' },
    { value: 'croydon', label: 'Croydon', group: 'London' },
    { value: 'moss-side', label: 'Moss Side', group: 'Manchester' },
  ],
  audienceTypes: [
    { value: 'Newcomer', label: 'New arrivals', group: null },
    { value: 'Established', label: 'Settled members', group: null },
    { value: 'Student', label: 'Students', group: null },
    { value: 'Business', label: 'Business owners', group: null },
  ],
  interests: [
    { value: 'housing', label: 'Housing', group: null },
    { value: 'jobs', label: 'Jobs', group: null },
    { value: 'legal', label: 'Legal and visas', group: null },
    { value: 'moving', label: 'Moving and removals', group: null },
    { value: 'remittance', label: 'Sending money', group: null },
    { value: 'food', label: 'Food and groceries', group: null },
  ],
  categories: [
    { value: 'rooms', label: 'Rooms to rent', group: 'Housing' },
    { value: 'removals', label: 'Removals', group: 'Services' },
    { value: 'hospitality', label: 'Hospitality jobs', group: 'Jobs' },
    { value: 'care', label: 'Care work', group: 'Jobs' },
    { value: 'electronics', label: 'Electronics', group: 'Marketplace' },
  ],
};

// ── Usage — MON-GAP-008 ──────────────────────────────────────────────────────

/**
 * Counters against the entitlement keys the certified catalogue actually serves.
 *
 * `listings.concurrent` is at eleven of fifteen: close enough to the ceiling
 * that the meter is worth looking at, far enough that it is not the at-limit
 * state — which is the seed most likely to be mistaken for the only state.
 */
export const MOCK_USAGE_COUNTERS: UsageCounter[] = [
  {
    key: 'listings.concurrent',
    limit: 15,
    consumed: 11,
    remaining: 4,
    periodStart: isoDaysAgo(14),
    periodEnd: null,
    atLimitBehaviour: 'Refuse',
  },
  {
    key: 'jobs.concurrent',
    limit: 5,
    consumed: 5,
    remaining: 0,
    periodStart: isoDaysAgo(14),
    periodEnd: null,
    atLimitBehaviour: 'Refuse',
  },
  {
    key: 'housing.concurrent',
    limit: 10,
    consumed: 2,
    remaining: 8,
    periodStart: isoDaysAgo(14),
    periodEnd: null,
    atLimitBehaviour: 'Refuse',
  },
];

// ── Premium analytics — MON-GAP-010 ──────────────────────────────────────────

export const MOCK_PREMIUM_ANALYTICS: PremiumAnalytics = {
  periodStart: isoDaysAgo(30),
  periodEnd: new Date().toISOString(),
  headline: [
    metric('views', 'Views', 4210, 'count', 'How many times your listings and guides were opened.', 0.12),
    metric('saves', 'Saves', 186, 'count', 'How many people saved something of yours to come back to.', 0.24),
    metric('enquiries', 'Enquiries', 74, 'count', 'How many people messaged you about something you posted.', -0.06),
    metric('profileVisits', 'Profile visits', 512, 'count', 'How many people opened your profile.', 0.08),
  ],
  breakdowns: [
    {
      dimension: 'country',
      label: 'Where your audience is',
      buckets: [
        { label: 'United Kingdom', value: 3210, ratio: 0.76 },
        { label: 'Ireland', value: 505, ratio: 0.12 },
        { label: 'Germany', value: 295, ratio: 0.07 },
        { label: 'Elsewhere', value: 200, ratio: 0.05 },
      ],
    },
    {
      dimension: 'audienceType',
      label: 'Who they are',
      buckets: [
        { label: 'New arrivals', value: 1852, ratio: 0.44 },
        { label: 'Settled members', value: 1600, ratio: 0.38 },
        { label: 'Students', value: 758, ratio: 0.18 },
      ],
    },
    {
      dimension: 'source',
      label: 'How they found you',
      buckets: [
        { label: 'Search', value: 1810, ratio: 0.43 },
        { label: 'Nearby feed', value: 1263, ratio: 0.3 },
        { label: 'Promotions', value: 758, ratio: 0.18 },
        { label: 'Shared links', value: 379, ratio: 0.09 },
      ],
    },
  ],
  series: Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.now() - (29 - index) * 86_400_000);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const wobble = ((index * 29) % 31) - 15;
    const views = Math.max(0, Math.round(140 * (weekend ? 0.7 : 1) + wobble * 3));
    return { date: date.toISOString().slice(0, 10), views, engagements: Math.round(views * 0.09) };
  }),
  topSubjects: [
    {
      subjectType: 'Guide',
      subjectId: 'g-0001',
      title: 'Opening a UK bank account without a payslip',
      views: 1284,
      engagements: 211,
    },
    {
      subjectType: 'MarketplaceListing',
      subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
      title: 'Double bed and mattress, Peckham',
      views: 806,
      engagements: 94,
    },
    {
      subjectType: 'Job',
      subjectId: 'j-0002',
      title: 'Kitchen porter — evenings',
      views: 512,
      engagements: 61,
    },
  ],
  reportingLagHours: 6,
};

// ── Recommendations — MON-GAP-011 ────────────────────────────────────────────

export const MOCK_RECOMMENDATIONS: MonetizationRecommendation[] = [
  {
    recommendationId: 'rec-0001',
    kind: 'product',
    code: 'mp-boost-7',
    title: 'Boost your Peckham listing',
    reason:
      'It has been up for eleven days with fewer views than your other listings. A week of boost usually doubles the views on a listing this age.',
    reasonCode: 'listing.stale_with_low_views',
    confidence: 0.72,
    route: '/monetization/promote',
    subjectType: 'MarketplaceListing',
    subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
  },
  {
    recommendationId: 'rec-0002',
    kind: 'plan',
    code: 'pro-yearly',
    title: 'Professional would save you money',
    reason:
      'You have bought four promotions in the last two months. The 25% discount on Professional would have covered most of the plan.',
    reasonCode: 'placement.spend_exceeds_plan_delta',
    confidence: 0.64,
    route: '/monetization/plans',
    subjectType: null,
    subjectId: null,
  },
];
