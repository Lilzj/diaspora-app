// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Metric catalogue (Frontend Phase 15, §35 · §63)
//
// One definition per metric, and the type system makes that literal:
// `ANALYTICS_DEFINITIONS` is a `Record<AnalyticsMetricKey, AnalyticsDefinition>`,
// so a metric key added to the union without an entry here is a compile error.
//
// ── Why the catalogue is code rather than only a document ────────────────────
//
// §63 asks for "a centralized documentation artifact" and §35 asks that no two
// dashboards interpret the same metric differently. A markdown table satisfies
// the first and does nothing for the second — the moment a screen renders
// "Active users" with its own hardcoded label, the document is a description of
// what somebody intended rather than of what the app does.
//
// So the catalogue is the *source*: every metric card reads its label, its
// definition, its format and whether higher is better from here, and
// `frontend-phase-15-analytics-metric-catalog.md` is generated from the same
// data. A dashboard cannot disagree with the catalogue because it has no
// definition of its own to disagree with.
//
// ── What a definition may and may not claim ──────────────────────────────────
//
// **`status` is honest about what exists today.** Almost every entry here is
// `BACKEND_GAP` or `DEVELOPMENT_ADAPTER`, because the certified backend exposes
// no analytics contract — it exposes *records*, and a handful of genuine
// aggregates. Marking a metric `CONNECTED` because a screen shows a number would
// be the exact failure §38 names.
//
// **`owner` names the backend module that should own the truth (§64).** Where
// nobody owns it, that is said rather than left blank, because "nobody owns
// this" is the finding a backend planning phase needs.
//
// **`freshnessPolicy` is a sentence, not an enum.** "Recomputed nightly" and
// "counted live from the notification store" are different promises, and
// flattening them to `daily` would lose the part that matters when somebody asks
// why two screens disagree by an hour.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsDefinition,
  AnalyticsDimensionKey,
  AnalyticsMetricFormat,
  AnalyticsMetricKey,
  AnalyticsPrivacyClass,
  AnalyticsSubjectType,
} from '@/types/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Subject groupings
//
// Named rather than repeated, so "which subjects have content metrics" is one
// edit rather than eleven, and so a reviewer can see the grouping decisions.
// ─────────────────────────────────────────────────────────────────────────────

const AUDIENCE_SUBJECTS: AnalyticsSubjectType[] = ['platform', 'country', 'community', 'neighborhood'];

const PUBLISHER_SUBJECTS: AnalyticsSubjectType[] = [
  'platform',
  'country',
  'community',
  'creator',
  'organization',
];

const CONTENT_ITEM_SUBJECTS: AnalyticsSubjectType[] = ['guide', 'event', 'update', 'listing', 'housing', 'job'];

const COMMERCE_SUBJECTS: AnalyticsSubjectType[] = [
  'platform',
  'country',
  'community',
  'seller',
  'landlord',
  'employer',
  'provider',
];

const MONEY_SUBJECTS: AnalyticsSubjectType[] = [
  'platform',
  'creator',
  'seller',
  'landlord',
  'employer',
  'provider',
  'organization',
  'campaign',
];

const ALL_SUBJECTS: AnalyticsSubjectType[] = [
  'platform',
  'country',
  'community',
  'neighborhood',
  'creator',
  'provider',
  'employer',
  'job',
  'seller',
  'listing',
  'landlord',
  'housing',
  'organization',
  'guide',
  'event',
  'update',
  'campaign',
];

// ─────────────────────────────────────────────────────────────────────────────
// Standard dimension sets
// ─────────────────────────────────────────────────────────────────────────────

const TIME_ONLY: AnalyticsDimensionKey[] = ['date'];
const PLACE: AnalyticsDimensionKey[] = ['date', 'country', 'community', 'neighborhood'];
const PLACE_AND_KIND: AnalyticsDimensionKey[] = [
  'date',
  'country',
  'community',
  'category',
  'contentType',
];
const DISCOVERY: AnalyticsDimensionKey[] = ['date', 'country', 'community', 'category', 'surface'];

// ─────────────────────────────────────────────────────────────────────────────
// Standard freshness policies
// ─────────────────────────────────────────────────────────────────────────────

const NIGHTLY = 'Recomputed once a day, after midnight in the reporting timezone.';
const HOURLY = 'Recomputed hourly. Figures for the current hour are incomplete.';
const LIVE_COUNT = 'Counted from live records at the moment of the request.';
const DAILY_COHORT =
  'Recomputed nightly. A cohort is only complete once its measurement window has fully elapsed.';

interface DefinitionSpec {
  format?: AnalyticsMetricFormat;
  higherIsBetter?: boolean;
  privacy?: AnalyticsPrivacyClass;
  owner: string;
  freshness?: string;
  dimensions?: AnalyticsDimensionKey[];
  subjects: AnalyticsSubjectType[];
  status: AnalyticsDefinition['status'];
  gapKey?: string;
  formula?: string;
}

function define(
  key: AnalyticsMetricKey,
  label: string,
  definition: string,
  spec: DefinitionSpec
): AnalyticsDefinition {
  return {
    key,
    label,
    definition,
    formula: spec.formula ?? null,
    format: spec.format ?? 'count',
    higherIsBetter: spec.higherIsBetter ?? true,
    privacyClass: spec.privacy ?? 'owner',
    owner: spec.owner,
    freshnessPolicy: spec.freshness ?? NIGHTLY,
    dimensions: spec.dimensions ?? TIME_ONLY,
    subjects: spec.subjects,
    status: spec.status,
    gapKey: spec.gapKey ?? null,
  };
}

/**
 * The catalogue.
 *
 * Exhaustive by construction. Ordered by domain rather than alphabetically, so
 * a reviewer reading it top to bottom reads a coherent account of what the
 * platform measures rather than an index.
 */
export const ANALYTICS_DEFINITIONS: Record<AnalyticsMetricKey, AnalyticsDefinition> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIENCE AND ENGAGEMENT — §34
  //
  // §34's instruction is the important one here: "do not define 'active user'
  // differently in different screens". The three activity metrics below share
  // one definition of an active session and differ only in the window, which is
  // why they are written as a family rather than three unrelated sentences.
  // ═══════════════════════════════════════════════════════════════════════════

  'audience.users.total': define(
    'audience.users.total',
    'Total members',
    'Every account that has completed registration and has not been deleted, regardless of whether it has been used recently.',
    {
      owner: 'identity-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'platformAnalytics',
    }
  ),

  'audience.users.new': define(
    'audience.users.new',
    'New members',
    'Accounts that completed registration within the selected period, counted on the day registration completed rather than the day it started.',
    {
      owner: 'identity-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'audience.users.active.daily': define(
    'audience.users.active.daily',
    'Daily active members',
    'Distinct members who opened the app and performed at least one deliberate action — a view, a search, a message, a post — on a given day. Opening a push notification without going further does not count.',
    {
      owner: 'B17-platform',
      privacy: 'administrative',
      freshness: NIGHTLY,
      subjects: AUDIENCE_SUBJECTS,
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  'audience.users.active.weekly': define(
    'audience.users.active.weekly',
    'Weekly active members',
    'Distinct members active at least once in the seven days ending on the selected date. Uses the same definition of "active" as the daily figure.',
    {
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  'audience.users.active.monthly': define(
    'audience.users.active.monthly',
    'Monthly active members',
    'Distinct members active at least once in the thirty days ending on the selected date. Uses the same definition of "active" as the daily figure.',
    {
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  'audience.users.returning': define(
    'audience.users.returning',
    'Returning members',
    'Members active in this period who were also active in the period immediately before it. Not the same as retention, which is measured against a fixed acquisition cohort.',
    {
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  'audience.sessions.count': define(
    'audience.sessions.count',
    'Sessions',
    'App opens separated by at least thirty minutes of inactivity. A session that spans midnight is counted on the day it began.',
    {
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  'audience.sessions.duration.median': define(
    'audience.sessions.duration.median',
    'Median session length',
    'The middle value of session durations in the period. A median rather than a mean, because a handful of sessions left open overnight would move a mean and tell you nothing.',
    {
      format: 'duration',
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  'audience.stickiness.dau_mau': define(
    'audience.stickiness.dau_mau',
    'Stickiness',
    'Daily active members as a share of monthly active members. Roughly, the proportion of a month a typical active member uses the app.',
    {
      format: 'percentage',
      formula: 'audience.users.active.daily ÷ audience.users.active.monthly',
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'engagementAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROWTH — §10
  // ═══════════════════════════════════════════════════════════════════════════

  'growth.members.net': define(
    'growth.members.net',
    'Net member change',
    'Members gained minus members lost in the period. Can be negative, which is why the card shows a sign rather than only a colour.',
    {
      owner: 'B6-community-foundation',
      privacy: 'privileged',
      formula: 'joins − (leaves + revocations)',
      subjects: ['platform', 'country', 'community', 'organization'],
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.members.rate': define(
    'growth.members.rate',
    'Member growth rate',
    'Net member change as a share of the member count at the start of the period.',
    {
      format: 'percentage',
      formula: 'growth.members.net ÷ members at period start',
      owner: 'B6-community-foundation',
      privacy: 'privileged',
      subjects: ['platform', 'country', 'community', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.communities.new': define(
    'growth.communities.new',
    'New communities',
    'Communities created and made visible in the period.',
    {
      owner: 'B6-community-foundation',
      privacy: 'administrative',
      subjects: ['platform', 'country'],
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.content.new': define(
    'growth.content.new',
    'New content',
    'Guides, updates, events, listings, jobs and housing published in the period, counted together.',
    {
      owner: 'B17-platform',
      privacy: 'privileged',
      subjects: PUBLISHER_SUBJECTS,
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.providers.new': define(
    'growth.providers.new',
    'New providers',
    'Service provider profiles published in the period.',
    {
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.organizations.new': define(
    'growth.organizations.new',
    'New organizations',
    'Organizations registered in the period.',
    {
      owner: 'B12-community-life',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.creators.new': define(
    'growth.creators.new',
    'New creators',
    'Members who published their first piece of content in the period. A member who registered years ago and published today counts today.',
    {
      owner: 'B15-financial',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.listings.new': define(
    'growth.listings.new',
    'New marketplace listings',
    'Marketplace listings published in the period, including relisted items.',
    {
      owner: 'B10-marketplace',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'seller'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.jobs.new': define(
    'growth.jobs.new',
    'New jobs',
    'Job postings published in the period.',
    {
      owner: 'B9-jobs',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'employer'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  'growth.housing.new': define(
    'growth.housing.new',
    'New housing listings',
    'Housing listings published in the period.',
    {
      owner: 'B11-housing',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'landlord'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'growthAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // RETENTION — §33
  // ═══════════════════════════════════════════════════════════════════════════

  'retention.day1': define(
    'retention.day1',
    'Day 1 retention',
    'The share of a day’s new members who were active again on the following day. The cohort is fixed at registration; members who never return still count in the denominator forever.',
    {
      format: 'percentage',
      owner: 'B17-platform',
      privacy: 'administrative',
      freshness: DAILY_COHORT,
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'retentionAnalytics',
    }
  ),

  'retention.day7': define(
    'retention.day7',
    'Day 7 retention',
    'The share of a day’s new members active on the seventh day after registration. Same-day-of-week comparison, so weekly usage patterns do not distort it.',
    {
      format: 'percentage',
      owner: 'B17-platform',
      privacy: 'administrative',
      freshness: DAILY_COHORT,
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'retentionAnalytics',
    }
  ),

  'retention.day30': define(
    'retention.day30',
    'Day 30 retention',
    'The share of a day’s new members active on the thirtieth day after registration.',
    {
      format: 'percentage',
      owner: 'B17-platform',
      privacy: 'administrative',
      freshness: DAILY_COHORT,
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'retentionAnalytics',
    }
  ),

  'retention.weekly': define(
    'retention.weekly',
    'Weekly retention',
    'The share of a week’s cohort active in each subsequent week. Weeks begin on Monday in the reporting timezone.',
    {
      format: 'percentage',
      owner: 'B17-platform',
      privacy: 'administrative',
      freshness: DAILY_COHORT,
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'retentionAnalytics',
    }
  ),

  'retention.monthly': define(
    'retention.monthly',
    'Monthly retention',
    'The share of a calendar month’s cohort active in each subsequent calendar month.',
    {
      format: 'percentage',
      owner: 'B17-platform',
      privacy: 'administrative',
      freshness: DAILY_COHORT,
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'retentionAnalytics',
    }
  ),

  'retention.churn': define(
    'retention.churn',
    'Churn',
    'The share of members active in the previous period who were not active in this one. Lower is better, and the card is drawn accordingly.',
    {
      format: 'percentage',
      higherIsBetter: false,
      owner: 'B17-platform',
      privacy: 'administrative',
      subjects: AUDIENCE_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'retentionAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT REACH — §15, §22, §23, §24
  //
  // The impression/view/reach family is the one members most often assume they
  // understand, and the three definitions below are deliberately explicit about
  // where the boundaries are.
  // ═══════════════════════════════════════════════════════════════════════════

  'content.impressions': define(
    'content.impressions',
    'Impressions',
    'Times the item appeared in a feed, a search result or a recommendation rail, whether or not anybody looked at it. One member scrolling past the same card twice is two impressions.',
    {
      owner: 'B17-platform',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS, 'provider', 'seller', 'landlord'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.views': define(
    'content.views',
    'Views',
    'Times the item’s own screen was opened. Repeat visits by the same member count separately; see unique viewers for the deduplicated figure.',
    {
      owner: 'B17-platform',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS, 'provider', 'seller', 'landlord'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.reach': define(
    'content.reach',
    'Reach',
    'Distinct members who saw the item at all, whether as an impression or a view. Always less than or equal to impressions plus views.',
    {
      owner: 'B17-platform',
      subjects: PUBLISHER_SUBJECTS,
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.uniqueViewers': define(
    'content.uniqueViewers',
    'Unique viewers',
    'Distinct members who opened the item’s screen. Never broken down to a level that would identify who they were.',
    {
      owner: 'B17-platform',
      privacy: 'owner',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.saves': define(
    'content.saves',
    'Saves',
    'Times the item was added to a member’s saved collection, net of removals in the same period.',
    {
      owner: 'B17-platform',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.shares': define(
    'content.shares',
    'Shares',
    'Times a member used the share action. Counts the action, not whether anybody opened what was shared — the platform cannot see the other end.',
    {
      owner: 'B17-platform',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.comments': define(
    'content.comments',
    'Comments',
    'Comments left on the item in the period, excluding those later removed by moderation.',
    {
      owner: 'B6-community-foundation',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.helpfulVotes': define(
    'content.helpfulVotes',
    'Helpful votes',
    'Times somebody marked the item helpful. Only the helpful reaction counts here; every other reaction counts towards engagement instead, so this number is always smaller than the reaction total and is not a subset anybody should add twice.',
    {
      owner: 'B6-community-foundation',
      subjects: [...PUBLISHER_SUBJECTS, ...CONTENT_ITEM_SUBJECTS],
      dimensions: DISCOVERY,
      // Genuinely served: `AnalyticsMetricCatalog` marks it `Available` and the
      // per-item dataset carries it. This is one of the few rows in this file
      // that was CONNECTED from the day it was written.
      status: 'CONNECTED',
    }
  ),

  'content.engagementRate': define(
    'content.engagementRate',
    'Engagement rate',
    'Saves, shares and comments as a share of reach. A single definition used by every dashboard: two screens showing different engagement rates for the same item is the thing this catalogue exists to prevent.',
    {
      format: 'percentage',
      formula: '(content.saves + content.shares + content.comments) ÷ content.reach',
      owner: 'B17-platform',
      subjects: PUBLISHER_SUBJECTS,
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.completionRate': define(
    'content.completionRate',
    'Completion rate',
    'Share of views that reached the end of the item. Meaningful for guides and courses; absent for items with no natural end.',
    {
      format: 'percentage',
      owner: 'B8-guides',
      subjects: ['guide', 'creator'],
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'content.published': define(
    'content.published',
    'Items published',
    'Items the subject published in the period. Edits to an existing item do not count.',
    {
      owner: 'B17-platform',
      subjects: PUBLISHER_SUBJECTS,
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // DISCOVERY — §25, §26, §27
  // ═══════════════════════════════════════════════════════════════════════════

  'search.volume': define(
    'search.volume',
    'Searches',
    'Search requests submitted in the period. Typing without submitting does not count.',
    {
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'searchAnalytics',
    }
  ),

  'search.noResultRate': define(
    'search.noResultRate',
    'Searches with no results',
    'Share of searches that returned nothing. Lower is better. The most actionable number on the search dashboard — it names what the platform is missing.',
    {
      format: 'percentage',
      higherIsBetter: false,
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'searchAnalytics',
    }
  ),

  'search.clickThroughRate': define(
    'search.clickThroughRate',
    'Search click-through',
    'Share of searches where the member opened at least one result.',
    {
      format: 'percentage',
      formula: 'searches with ≥1 result opened ÷ search.volume',
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      status: 'BACKEND_GAP',
      gapKey: 'searchAnalytics',
    }
  ),

  'search.toActionRate': define(
    'search.toActionRate',
    'Search to action',
    'Share of searches followed by a contact, application, save or purchase within the same session.',
    {
      format: 'percentage',
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community'],
      status: 'BACKEND_GAP',
      gapKey: 'searchAnalytics',
    }
  ),

  'search.appearances': define(
    'search.appearances',
    'Search appearances',
    'Times the item appeared in someone’s search results. The seller-facing counterpart of search volume.',
    {
      owner: 'B14-recommendation',
      subjects: [...CONTENT_ITEM_SUBJECTS, 'provider', 'seller', 'landlord', 'employer', 'creator'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'searchAnalytics',
    }
  ),

  'recommendation.impressions': define(
    'recommendation.impressions',
    'Recommendation impressions',
    'Times the item was shown in a recommendation rail.',
    {
      owner: 'B14-recommendation',
      subjects: [...CONTENT_ITEM_SUBJECTS, 'platform', 'community', 'creator', 'provider'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'recommendationAnalytics',
    }
  ),

  'recommendation.clicks': define(
    'recommendation.clicks',
    'Recommendation opens',
    'Times a recommended item was opened from the rail.',
    {
      owner: 'B14-recommendation',
      subjects: [...CONTENT_ITEM_SUBJECTS, 'platform', 'community', 'creator', 'provider'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'recommendationAnalytics',
    }
  ),

  'recommendation.clickThroughRate': define(
    'recommendation.clickThroughRate',
    'Recommendation click-through',
    'Opens as a share of recommendation impressions. Computed by the recommendation service, never by this client — §25 forbids the frontend scoring relevance, and a client-computed rate is the first step towards it.',
    {
      format: 'percentage',
      formula: 'recommendation.clicks ÷ recommendation.impressions',
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'country'],
      status: 'BACKEND_GAP',
      gapKey: 'recommendationAnalytics',
    }
  ),

  'recommendation.saves': define(
    'recommendation.saves',
    'Saves from recommendations',
    'Items saved directly from a recommendation rail.',
    {
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'country'],
      status: 'BACKEND_GAP',
      gapKey: 'recommendationAnalytics',
    }
  ),

  'recommendation.dismissals': define(
    'recommendation.dismissals',
    'Recommendations dismissed',
    'Times a member explicitly dismissed a recommendation. Higher is not better — it is the clearest negative signal the engine gets.',
    {
      higherIsBetter: false,
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'country'],
      status: 'BACKEND_GAP',
      gapKey: 'recommendationAnalytics',
    }
  ),

  'recommendation.conversions': define(
    'recommendation.conversions',
    'Recommendation conversions',
    'Recommendations followed by a contact, application, registration or purchase for the recommended item within the same session.',
    {
      owner: 'B14-recommendation',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'country'],
      status: 'BACKEND_GAP',
      gapKey: 'recommendationAnalytics',
    }
  ),

  'map.opens': define(
    'map.opens',
    'Map opens',
    'Times the map screen was opened, from any entry point.',
    {
      owner: 'location-platform',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'mapAnalytics',
    }
  ),

  'map.markerInteractions': define(
    'map.markerInteractions',
    'Map marker taps',
    'Times a member selected a marker or expanded a cluster.',
    {
      owner: 'location-platform',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'mapAnalytics',
    }
  ),

  'map.locationSearches': define(
    'map.locationSearches',
    'Location searches',
    'Place searches performed from the map. Aggregated to an approximately 11 km grid cell; the platform never stores where an individual searched.',
    {
      owner: 'location-platform',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'mapAnalytics',
    }
  ),

  'map.routeRequests': define(
    'map.routeRequests',
    'Route requests',
    'Times a route was planned. Distances are banded before they leave the device and no origin or destination is recorded.',
    {
      owner: 'location-platform',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      status: 'BACKEND_GAP',
      gapKey: 'mapAnalytics',
    }
  ),

  'map.filterUses': define(
    'map.filterUses',
    'Map filters applied',
    'Times a map filter was changed. Tells you which layers people actually use.',
    {
      owner: 'location-platform',
      privacy: 'administrative',
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'mapAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // REACH AND RELATIONSHIPS — §12, §65
  // ═══════════════════════════════════════════════════════════════════════════

  'reach.followers': define(
    'reach.followers',
    'Followers',
    'Members following the subject at the end of the period. A stock, not a flow — the change against the previous period is the flow.',
    {
      owner: 'B6-community-foundation',
      subjects: ['creator', 'organization', 'provider', 'community'],
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  'reach.members': define(
    'reach.members',
    'Members',
    'Members of the community or organization at the end of the period, counting joined members only — expressed interest and following are separate relationships and are not added in.',
    {
      owner: 'B6-community-foundation',
      privacy: 'privileged',
      subjects: ['community', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'communityAnalytics',
    }
  ),

  'reach.communities': define(
    'reach.communities',
    'Communities reached',
    'Distinct communities in which the subject’s content was seen. A community, not a country — the two are separate dimensions and are never interchanged.',
    {
      owner: 'B6-community-foundation',
      subjects: ['creator', 'organization', 'provider', 'seller', 'employer', 'landlord'],
      dimensions: ['date', 'community'],
      status: 'BACKEND_GAP',
      gapKey: 'communityAnalytics',
    }
  ),

  'reach.crossCommunity': define(
    'reach.crossCommunity',
    'Cross-community reach',
    'Share of the subject’s reach that came from outside its primary community.',
    {
      format: 'percentage',
      owner: 'B6-community-foundation',
      subjects: ['creator', 'organization', 'provider', 'community'],
      status: 'BACKEND_GAP',
      gapKey: 'communityAnalytics',
    }
  ),

  'reach.countries': define(
    'reach.countries',
    'Countries reached',
    'Distinct countries the subject’s content was seen from, by the viewer’s residence country where they published it.',
    {
      owner: 'B17-platform',
      subjects: ['creator', 'organization', 'provider', 'community'],
      dimensions: ['date', 'country'],
      status: 'BACKEND_GAP',
      gapKey: 'contentAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKETPLACE, JOBS, HOUSING, PROVIDERS — §17–§20
  // ═══════════════════════════════════════════════════════════════════════════

  'listing.contacts': define(
    'listing.contacts',
    'Contacts',
    'Times a buyer opened a conversation about the listing. Counts the first message, not the whole thread.',
    {
      owner: 'B10-marketplace',
      subjects: ['listing', 'seller', 'community', 'platform'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'marketplaceAnalytics',
    }
  ),

  'listing.offers': define('listing.offers', 'Offers', 'Offers made on the listing in the period.', {
    owner: 'B10-marketplace',
    subjects: ['listing', 'seller'],
    status: 'BACKEND_GAP',
    gapKey: 'marketplaceAnalytics',
  }),

  'listing.reservations': define(
    'listing.reservations',
    'Reservations',
    'Times the item was reserved pending completion.',
    {
      owner: 'B10-marketplace',
      subjects: ['listing', 'seller'],
      status: 'BACKEND_GAP',
      gapKey: 'marketplaceAnalytics',
    }
  ),

  'listing.sales': define(
    'listing.sales',
    'Sales',
    'Completed sales in the period. A sale is counted when payment settles, not when it is initiated.',
    {
      privacy: 'financial',
      owner: 'B15-financial',
      subjects: ['listing', 'seller', 'platform'],
      status: 'BACKEND_GAP',
      gapKey: 'marketplaceAnalytics',
    }
  ),

  'job.applications': define(
    'job.applications',
    'Applications',
    'Applications submitted in the period. Withdrawn applications remain counted on the day they were submitted.',
    {
      owner: 'B9-jobs',
      subjects: ['job', 'employer', 'platform', 'community'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'employerAnalytics',
    }
  ),

  'job.shortlisted': define(
    'job.shortlisted',
    'Shortlisted',
    'Applications the employer moved to a shortlist. Counts of candidates, never candidate identities.',
    {
      owner: 'B9-jobs',
      subjects: ['job', 'employer'],
      status: 'BACKEND_GAP',
      gapKey: 'employerAnalytics',
    }
  ),

  'job.interviewed': define(
    'job.interviewed',
    'Interviewed',
    'Applications that reached an interview stage the employer recorded on the platform.',
    {
      owner: 'B9-jobs',
      subjects: ['job', 'employer'],
      status: 'BACKEND_GAP',
      gapKey: 'employerAnalytics',
    }
  ),

  'job.hired': define(
    'job.hired',
    'Hired',
    'Applications the employer marked as hired. Depends on employers recording the outcome, so it undercounts.',
    {
      owner: 'B9-jobs',
      subjects: ['job', 'employer'],
      status: 'BACKEND_GAP',
      gapKey: 'employerAnalytics',
    }
  ),

  'job.applicationRate': define(
    'job.applicationRate',
    'Application rate',
    'Applications as a share of job views.',
    {
      format: 'percentage',
      formula: 'job.applications ÷ content.views',
      owner: 'B9-jobs',
      subjects: ['job', 'employer'],
      status: 'BACKEND_GAP',
      gapKey: 'employerAnalytics',
    }
  ),

  'housing.inquiries': define(
    'housing.inquiries',
    'Inquiries',
    'Times a prospective tenant contacted the landlord about the listing.',
    {
      owner: 'B11-housing',
      subjects: ['housing', 'landlord', 'platform', 'community'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'housingAnalytics',
    }
  ),

  'housing.applications': define(
    'housing.applications',
    'Applications',
    'Formal tenancy applications submitted through the platform.',
    {
      owner: 'B11-housing',
      subjects: ['housing', 'landlord'],
      status: 'BACKEND_GAP',
      gapKey: 'housingAnalytics',
    }
  ),

  'provider.profileViews': define(
    'provider.profileViews',
    'Profile views',
    'Times the provider’s profile screen was opened.',
    {
      owner: 'B17-platform',
      subjects: ['provider', 'platform', 'community'],
      dimensions: DISCOVERY,
      status: 'BACKEND_GAP',
      gapKey: 'providerAnalytics',
    }
  ),

  'provider.contactActions': define(
    'provider.contactActions',
    'Contact actions',
    'Times somebody tapped call, message or directions on the provider’s profile.',
    {
      owner: 'B17-platform',
      subjects: ['provider'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'providerAnalytics',
    }
  ),

  'provider.leads': define(
    'provider.leads',
    'Leads',
    'Contact actions that started a conversation the provider replied to. A contact tap alone is not a lead.',
    {
      owner: 'B17-platform',
      subjects: ['provider'],
      status: 'BACKEND_GAP',
      gapKey: 'providerAnalytics',
    }
  ),

  'provider.reviews': define(
    'provider.reviews',
    'Reviews received',
    'Reviews published in the period, excluding those removed by moderation.',
    {
      owner: 'B17-platform',
      privacy: 'public',
      subjects: ['provider'],
      freshness: LIVE_COUNT,
      status: 'BACKEND_GAP',
      gapKey: 'providerAnalytics',
    }
  ),

  'provider.ratingAverage': define(
    'provider.ratingAverage',
    'Average rating',
    'Mean published rating at the end of the period, over all time rather than over the period — a rating average that reset each month would swing wildly on two reviews.',
    {
      format: 'score',
      owner: 'B17-platform',
      privacy: 'public',
      subjects: ['provider'],
      freshness: LIVE_COUNT,
      status: 'BACKEND_GAP',
      gapKey: 'providerAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS AND ORGANIZATIONS — §21, §23
  // ═══════════════════════════════════════════════════════════════════════════

  'event.rsvps': define(
    'event.rsvps',
    'Registrations',
    'Registrations held at the end of the period, net of cancellations.',
    {
      owner: 'B12-community-life',
      subjects: ['event', 'organization', 'community', 'platform'],
      dimensions: PLACE_AND_KIND,
      status: 'DEVELOPMENT_ADAPTER',
      gapKey: 'eventAnalytics',
    }
  ),

  'event.attendance': define(
    'event.attendance',
    'Attended',
    'Registrations marked as attended. Depends on an organizer checking people in, so it is absent rather than zero where nobody did.',
    {
      owner: 'B12-community-life',
      subjects: ['event', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'eventAnalytics',
    }
  ),

  'event.attendanceRate': define(
    'event.attendanceRate',
    'Turnout',
    'Attended as a share of registrations. Only shown where attendance was actually recorded.',
    {
      format: 'percentage',
      formula: 'event.attendance ÷ event.rsvps',
      owner: 'B12-community-life',
      subjects: ['event', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'eventAnalytics',
    }
  ),

  'organization.followers': define(
    'organization.followers',
    'Followers',
    'Members following the organization at the end of the period.',
    {
      owner: 'B12-community-life',
      subjects: ['organization'],
      status: 'DEVELOPMENT_ADAPTER',
      gapKey: 'organizationAnalytics',
    }
  ),

  'organization.announcementReach': define(
    'organization.announcementReach',
    'Announcement reach',
    'Distinct members who saw at least one of the organization’s announcements in the period.',
    {
      owner: 'B12-community-life',
      subjects: ['organization'],
      status: 'BACKEND_GAP',
      gapKey: 'organizationAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSION — §32
  // ═══════════════════════════════════════════════════════════════════════════

  'conversion.rate': define(
    'conversion.rate',
    'Conversion rate',
    'The share of people entering a funnel who reached its final step within the attribution window. Every funnel states its own window; there is no single platform-wide conversion rate.',
    {
      format: 'percentage',
      owner: 'B17-platform',
      subjects: ALL_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'funnelAnalytics',
    }
  ),

  'conversion.count': define(
    'conversion.count',
    'Conversions',
    'People who reached a funnel’s final step in the period.',
    {
      owner: 'B17-platform',
      subjects: ALL_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'funnelAnalytics',
    }
  ),

  'funnel.dropOffRate': define(
    'funnel.dropOffRate',
    'Drop-off',
    'The share of people at a funnel step who did not reach the next one. Lower is better.',
    {
      format: 'percentage',
      higherIsBetter: false,
      owner: 'B17-platform',
      subjects: ALL_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'funnelAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // MONEY — §16, §30, §31
  //
  // Every money metric is `financial` privacy class and carries a `Money`, never
  // a bare number. §57: the currency comes from the contract, never from a
  // default.
  // ═══════════════════════════════════════════════════════════════════════════

  'revenue.gross': define(
    'revenue.gross',
    'Gross revenue',
    'Money received before platform fees, refunds and chargebacks. Recognised when payment settles.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: 'Settled from the payment ledger. Trails live activity by up to one settlement cycle.',
      subjects: MONEY_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'revenue.net': define(
    'revenue.net',
    'Net revenue',
    'Gross revenue less platform fees and refunds. The figure that reaches the earner.',
    {
      format: 'currency',
      formula: 'revenue.gross − fees − revenue.refunded',
      privacy: 'financial',
      owner: 'B15-financial',
      subjects: MONEY_SUBJECTS,
      status: 'BACKEND_GAP',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'revenue.pending': define(
    'revenue.pending',
    'Pending',
    'Earned but not yet available to withdraw, usually because a clearing period has not elapsed. Never presented as available money.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['creator', 'seller', 'provider', 'landlord', 'organization'],
      status: 'CONNECTED',
    }
  ),

  'revenue.available': define(
    'revenue.available',
    'Available',
    'Cleared earnings available to withdraw now.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['creator', 'seller', 'provider', 'landlord', 'organization'],
      status: 'CONNECTED',
    }
  ),

  'revenue.paid': define(
    'revenue.paid',
    'Paid out',
    'Money already withdrawn or paid to the earner in the period.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['creator', 'seller', 'provider', 'landlord', 'organization'],
      status: 'CONNECTED',
    }
  ),

  'revenue.refunded': define(
    'revenue.refunded',
    'Refunded',
    'Money returned to buyers in the period, counted on the day the refund settled rather than the day of the original sale.',
    {
      format: 'currency',
      higherIsBetter: false,
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: MONEY_SUBJECTS,
      status: 'CONNECTED',
    }
  ),

  'revenue.perThousandImpressions': define(
    'revenue.perThousandImpressions',
    'Revenue per 1,000 impressions',
    'Gross revenue divided by impressions, times a thousand. Requires impression attribution the platform does not currently have, so it is absent rather than approximated.',
    {
      format: 'currency',
      formula: '(revenue.gross ÷ content.impressions) × 1000',
      privacy: 'financial',
      owner: 'B15-financial',
      subjects: ['creator', 'campaign'],
      status: 'BACKEND_GAP',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'spend.total': define(
    'spend.total',
    'Spend',
    'Money the subject spent on placements, boosts, subscriptions and advertising in the period.',
    {
      format: 'currency',
      higherIsBetter: false,
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: MONEY_SUBJECTS,
      status: 'PARTIAL',
      gapKey: 'walletAnalytics',
    }
  ),

  'wallet.deposits': define(
    'wallet.deposits',
    'Money in',
    'Deposits that settled into the wallet in the period.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'creator', 'seller', 'provider', 'landlord', 'organization'],
      status: 'PARTIAL',
      gapKey: 'walletAnalytics',
    }
  ),

  'wallet.withdrawals': define(
    'wallet.withdrawals',
    'Money out',
    'Withdrawals that settled out of the wallet in the period.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'creator', 'seller', 'provider', 'landlord', 'organization'],
      status: 'PARTIAL',
      gapKey: 'walletAnalytics',
    }
  ),

  'wallet.transactions': define(
    'wallet.transactions',
    'Transactions',
    'Ledger entries in the period, of every kind.',
    {
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'creator', 'seller', 'provider', 'landlord', 'organization'],
      status: 'PARTIAL',
      gapKey: 'walletAnalytics',
    }
  ),

  'wallet.donations': define(
    'wallet.donations',
    'Donated',
    'Money the subject gave to campaigns and causes in the period.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'organization', 'community'],
      status: 'PARTIAL',
      gapKey: 'walletAnalytics',
    }
  ),

  'wallet.contributions': define(
    'wallet.contributions',
    'Contributed',
    'Money the subject contributed to community funds in the period.',
    {
      format: 'currency',
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'organization', 'community'],
      status: 'PARTIAL',
      gapKey: 'walletAnalytics',
    }
  ),

  'rewards.pointsEarned': define(
    'rewards.pointsEarned',
    'Points earned',
    'Contribution points awarded in the period. Points are a count, never money, and are never converted to a currency for display.',
    {
      privacy: 'owner',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['creator', 'platform'],
      status: 'CONNECTED',
    }
  ),

  'rewards.pointsRedeemed': define(
    'rewards.pointsRedeemed',
    'Points redeemed',
    'Points spent on rewards in the period.',
    {
      privacy: 'owner',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['creator', 'platform'],
      status: 'CONNECTED',
    }
  ),

  'monetization.impressions': define(
    'monetization.impressions',
    'Placement impressions',
    'Times a paid placement was displayed.',
    {
      owner: 'B15-financial',
      privacy: 'owner',
      subjects: ['campaign', 'platform', ...MONEY_SUBJECTS],
      dimensions: DISCOVERY,
      status: 'DEVELOPMENT_ADAPTER',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'monetization.clicks': define(
    'monetization.clicks',
    'Placement opens',
    'Times a paid placement was opened.',
    {
      owner: 'B15-financial',
      privacy: 'owner',
      subjects: ['campaign', 'platform', ...MONEY_SUBJECTS],
      dimensions: DISCOVERY,
      status: 'DEVELOPMENT_ADAPTER',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'monetization.conversions': define(
    'monetization.conversions',
    'Placement conversions',
    'Placements followed by the action the campaign was for, within its stated attribution window. Absent where the campaign declared no conversion action — an unattributed conversion count would be a number with no meaning.',
    {
      owner: 'B15-financial',
      privacy: 'owner',
      subjects: ['campaign', 'platform', ...MONEY_SUBJECTS],
      status: 'BACKEND_GAP',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'monetization.activeSubscriptions': define(
    'monetization.activeSubscriptions',
    'Active subscriptions',
    'Subscriptions in an active or trialling state at the end of the period.',
    {
      privacy: 'financial',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform'],
      dimensions: ['date', 'plan'],
      status: 'BACKEND_GAP',
      gapKey: 'monetizationAnalytics',
    }
  ),

  'monetization.featuredPlacements': define(
    'monetization.featuredPlacements',
    'Featured placements',
    'Placements running at the end of the period across every surface.',
    {
      privacy: 'owner',
      owner: 'B15-financial',
      freshness: LIVE_COUNT,
      subjects: ['platform', ...MONEY_SUBJECTS],
      dimensions: ['date', 'placement'],
      status: 'CONNECTED',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNICATION — §28, §29
  //
  // §29 is the constraint that shapes the messaging family: aggregate counts
  // only, never contents, never participants. Every definition below is a count
  // of *events*, and there is no metric key that could carry a thread.
  // ═══════════════════════════════════════════════════════════════════════════

  'notification.delivered': define(
    'notification.delivered',
    'Delivered',
    'Notifications the platform successfully delivered to at least one channel.',
    {
      owner: 'B13-notifications',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'organization'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'notificationAnalytics',
    }
  ),

  'notification.opened': define(
    'notification.opened',
    'Opened',
    'Notifications a member opened. In-app reads and push opens count the same.',
    {
      owner: 'B13-notifications',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'organization'],
      dimensions: PLACE_AND_KIND,
      status: 'BACKEND_GAP',
      gapKey: 'notificationAnalytics',
    }
  ),

  'notification.dismissed': define(
    'notification.dismissed',
    'Dismissed',
    'Notifications a member dismissed without opening.',
    {
      higherIsBetter: false,
      owner: 'B13-notifications',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'notificationAnalytics',
    }
  ),

  'notification.actioned': define(
    'notification.actioned',
    'Actioned',
    'Notifications where the member did the thing the notification was about, not merely opened it.',
    {
      owner: 'B13-notifications',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'notificationAnalytics',
    }
  ),

  'notification.readRate': define(
    'notification.readRate',
    'Read rate',
    'Opened as a share of delivered.',
    {
      format: 'percentage',
      formula: 'notification.opened ÷ notification.delivered',
      owner: 'B13-notifications',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'notificationAnalytics',
    }
  ),

  'notification.actionRate': define(
    'notification.actionRate',
    'Action rate',
    'Actioned as a share of delivered. The number worth optimising; read rate mostly measures how alarming the title was.',
    {
      format: 'percentage',
      formula: 'notification.actioned ÷ notification.delivered',
      owner: 'B13-notifications',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'organization'],
      status: 'BACKEND_GAP',
      gapKey: 'notificationAnalytics',
    }
  ),

  'messaging.conversationsStarted': define(
    'messaging.conversationsStarted',
    'Conversations started',
    'New conversations opened in the period. A count of threads and nothing about them — no participants, no subject, no contents.',
    {
      owner: 'B13.2-messaging',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'provider', 'seller', 'landlord', 'employer'],
      dimensions: PLACE,
      status: 'BACKEND_GAP',
      gapKey: 'messagingAnalytics',
    }
  ),

  'messaging.messagesSent': define(
    'messaging.messagesSent',
    'Messages sent',
    'Messages sent in the period, counted in aggregate only.',
    {
      owner: 'B13.2-messaging',
      privacy: 'administrative',
      subjects: ['platform', 'community', 'provider', 'seller', 'landlord', 'employer'],
      status: 'BACKEND_GAP',
      gapKey: 'messagingAnalytics',
    }
  ),

  'messaging.responseRate': define(
    'messaging.responseRate',
    'Response rate',
    'Share of conversations opened with the subject that the subject replied to within seven days.',
    {
      format: 'percentage',
      owner: 'B13.2-messaging',
      privacy: 'owner',
      subjects: ['provider', 'seller', 'landlord', 'employer'],
      status: 'BACKEND_GAP',
      gapKey: 'messagingAnalytics',
    }
  ),

  'messaging.unreadRate': define(
    'messaging.unreadRate',
    'Unread rate',
    'Share of the subject’s conversations with unread messages at the end of the period. Lower is better.',
    {
      format: 'percentage',
      higherIsBetter: false,
      owner: 'B13.2-messaging',
      privacy: 'owner',
      freshness: LIVE_COUNT,
      subjects: ['provider', 'seller', 'landlord', 'employer'],
      status: 'PARTIAL',
      gapKey: 'messagingAnalytics',
    }
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM INVENTORY — §9
  //
  // The one family with genuinely connected members. These are counts of things
  // that exist rather than of things that happened, and the certified list
  // routes already return a `totalCount` for a filter — so a count of jobs in a
  // country is real today. They are marked `PARTIAL` rather than `CONNECTED`
  // where the count is only available for an area rather than for a community,
  // which is GAP-009's shadow falling across this phase too.
  // ═══════════════════════════════════════════════════════════════════════════

  'inventory.guides': define(
    'inventory.guides',
    'Guides',
    'Published guides matching the subject’s scope at the end of the period.',
    {
      owner: 'B8-guides',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.jobs': define(
    'inventory.jobs',
    'Open jobs',
    'Job postings open at the end of the period.',
    {
      owner: 'B9-jobs',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.listings': define(
    'inventory.listings',
    'Marketplace listings',
    'Active marketplace listings at the end of the period.',
    {
      owner: 'B10-marketplace',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.housing': define(
    'inventory.housing',
    'Housing listings',
    'Active housing listings at the end of the period.',
    {
      owner: 'B11-housing',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.providers': define(
    'inventory.providers',
    'Providers',
    'Published provider profiles at the end of the period.',
    {
      owner: 'B17-platform',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.organizations': define(
    'inventory.organizations',
    'Organizations',
    'Registered organizations at the end of the period.',
    {
      owner: 'B12-community-life',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.events': define(
    'inventory.events',
    'Upcoming events',
    'Events scheduled to start after the end of the period.',
    {
      owner: 'B12-community-life',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.updates': define(
    'inventory.updates',
    'Community updates',
    'Updates published in the period.',
    {
      owner: 'B9-jobs',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country', 'community', 'neighborhood'],
      dimensions: PLACE,
      status: 'PARTIAL',
      gapKey: 'inventoryAnalytics',
    }
  ),

  'inventory.communities': define(
    'inventory.communities',
    'Communities',
    'Communities visible to the caller at the end of the period.',
    {
      owner: 'B6-community-foundation',
      privacy: 'public',
      freshness: LIVE_COUNT,
      subjects: ['platform', 'country'],
      status: 'DEVELOPMENT_ADAPTER',
      gapKey: 'inventoryAnalytics',
    }
  ),
};

/**
 * Looks up a definition.
 *
 * Returns `null` for an unknown key rather than throwing. The key union makes
 * an unknown key impossible in typed code, but a saved report or an export
 * loaded from the server carries strings, and a dashboard that crashed because
 * a backend added a metric before the app knew about it would be a worse
 * outcome than one that skips a card.
 */
export function analyticsDefinition(key: string): AnalyticsDefinition | null {
  return ANALYTICS_DEFINITIONS[key as AnalyticsMetricKey] ?? null;
}

/** Every definition, for the catalogue screen and the generated document. */
export function allAnalyticsDefinitions(): AnalyticsDefinition[] {
  return Object.values(ANALYTICS_DEFINITIONS);
}

/** The definitions meaningful for one kind of subject. */
export function definitionsForSubject(subject: AnalyticsSubjectType): AnalyticsDefinition[] {
  return allAnalyticsDefinitions().filter((entry) => entry.subjects.includes(subject));
}
