// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the certified analytics module, from source
//
// `Diaspora.Modules.Analytics` serves three reads and one write that the Phase
// 15 register declared absent. These tests encode the four places where what the
// client assumed and what the server sends disagree, because each of them is a
// defect that renders as a plausible number rather than as an error:
//
//   **`restrictedMetrics` arrives in the Phase 7 snake key-space** while every
//   reader of it compares against a dotted Phase 15 key. Nothing ever matched,
//   so metric restriction was non-functional rather than merely wrong.
//
//   **`/definitions` is an envelope, not an array.** `{ version, definitions }`.
//   Typing it as a list fails at render, not at parse.
//
//   **`comparison.changePercent` on the dataset is a ratio.** `0.18` is eighteen
//   percent. The Phase 7 creator contract sends `18` for the same change, and
//   the adapter divides that by a hundred. Applying the same division twice is a
//   hundredfold error that looks plausible in both directions.
//
//   **Almost nothing this client emits is client-submittable.** Seven names, and
//   the app emits four of them.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import {
  fetchAnalyticsAccess,
  fetchAnalyticsDefinitions,
  fetchContentAnalytics,
  isCertifiedContentSubject,
} from '@/lib/analytics-api';
import { catalogueKeyFor, translateMetricKeys } from '@/lib/analytics/catalogue-keys';
import { partitionForDelivery } from '@/lib/telemetry-api';
import type { CreatorAnalyticsRecord } from '@/lib/creator-analytics';
import type { AnalyticsTimeRange } from '@/types/analytics';

let mock: MockAdapter;

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

/** The envelope every platform read answers in. */
const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

// ═════════════════════════════════════════════════════════════════════════════
// KEY SPACES
// ═════════════════════════════════════════════════════════════════════════════

describe('the two metric key-spaces are reconciled', () => {
  it('translates the platform’s snake keys onto catalogue keys', () => {
    expect(catalogueKeyFor('content_views')).toBe('content.views');
    expect(catalogueKeyFor('unique_viewers')).toBe('content.uniqueViewers');
    expect(catalogueKeyFor('helpful_votes')).toBe('content.helpfulVotes');
    // Not `reach.followers` — the platform serves the *net movement* under this
    // key and serves the total separately, as not measured.
    expect(catalogueKeyFor('follower_growth')).toBe('growth.members.net');
    expect(catalogueKeyFor('profile_views')).toBe('provider.profileViews');
  });

  it('passes a dotted key through unchanged', () => {
    expect(catalogueKeyFor('content.views')).toBe('content.views');
  });

  it('refuses a key this build cannot render rather than guessing', () => {
    expect(catalogueKeyFor('quantum_flux')).toBeNull();
    expect(catalogueKeyFor('')).toBeNull();
  });

  it('names what it could not translate instead of dropping it silently', () => {
    const { keys, untranslated } = translateMetricKeys(['content_views', 'quantum_flux']);
    expect(keys).toEqual(['content.views']);
    expect(untranslated).toEqual(['quantum_flux']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS
// ═════════════════════════════════════════════════════════════════════════════

const ACCESS_BODY = {
  subject: { type: 'creator', id: null, label: null },
  canView: true,
  canViewFinancial: false,
  canViewAdministrative: false,
  canCompare: false,
  canExport: false,
  canBuildReports: false,
  supportedRanges: ['today', 'last7d', 'last30d', 'last90d', 'thisYear', 'custom'],
  supportedComparisons: ['previousPeriod'],
  restrictedMetrics: [] as string[],
  reportingTimezone: 'UTC',
};

describe('GET /analytics/access', () => {
  it('reads a refusal as an answer rather than as an error', async () => {
    // The handler answers 200 with everything false rather than 403, so a screen
    // can render "not available to you" and the existence of an administrative
    // dashboard is not confirmed by a status code.
    mock.onGet('/analytics/access').reply(
      200,
      envelope({
        ...ACCESS_BODY,
        canView: false,
        // The all-false answer carries the whole headline set as restricted, in
        // the Phase 7 snake spelling.
        restrictedMetrics: ['content_views', 'unique_viewers', 'reach', 'revenue'],
      })
    );

    const access = await fetchAnalyticsAccess({ type: 'creator', id: null });

    expect(access.canView).toBe(false);
    expect(access.restrictedMetrics).toContain('content.views');
    expect(access.restrictedMetrics).toContain('content.uniqueViewers');
    expect(access.restrictedMetrics).toContain('revenue.gross');
    // And nothing is left in the spelling no reader compares against.
    expect(access.restrictedMetrics).not.toContain('content_views');
  });

  it('does not promote a capability the server hardcodes to false', async () => {
    mock.onGet('/analytics/access').reply(200, envelope(ACCESS_BODY));

    const access = await fetchAnalyticsAccess({ type: 'creator', id: null });

    expect(access.canView).toBe(true);
    expect(access.canViewFinancial).toBe(false);
    expect(access.canCompare).toBe(false);
    expect(access.canExport).toBe(false);
    expect(access.canBuildReports).toBe(false);
  });

  it('offers only presets this deployment answers, and drops any it does not', async () => {
    mock
      .onGet('/analytics/access')
      .reply(200, envelope({ ...ACCESS_BODY, supportedRanges: ['last30d', 'sinceForever'] }));

    const access = await fetchAnalyticsAccess({ type: 'creator', id: null });

    expect(access.supportedRanges).toEqual(['last30d']);
  });

  it('echoes the requested subject rather than the server’s reading of it', async () => {
    mock
      .onGet('/analytics/access')
      .reply(200, envelope({ ...ACCESS_BODY, subject: { type: 'listing', id: 'x' } }));

    const access = await fetchAnalyticsAccess({ type: 'guide', id: 'g1' });

    expect(access.subject).toEqual({ type: 'guide', id: 'g1' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /analytics/definitions', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    key: 'content_views',
    catalogueKey: 'content.views',
    label: 'Views',
    definition: 'The platform’s own sentence about what a view is.',
    formula: 'Distinct (viewer, item, day) combinations in the period',
    format: 'count',
    higherIsBetter: true,
    privacyClass: 'owner',
    owner: 'B19 Analytics',
    freshnessPolicy: 'Recomputed about every 30 seconds from recorded activity.',
    trustClass: 'client',
    status: 'AWAITING_SOURCE',
    ...overrides,
  });

  it('reads the envelope rather than a bare array', async () => {
    mock
      .onGet('/analytics/definitions')
      .reply(200, envelope({ version: '1.0.0', definitions: [row()] }));

    const result = await fetchAnalyticsDefinitions();

    expect(result.version).toBe('1.0.0');
    expect(result.reconciledCount).toBe(1);
    // The shipped catalogue is still the whole list — the server improves rows,
    // it does not replace the catalogue.
    expect(result.definitions.length).toBeGreaterThan(1);
  });

  it('serves the platform’s prose over the shipped sentence', async () => {
    mock
      .onGet('/analytics/definitions')
      .reply(200, envelope({ version: '1.0.0', definitions: [row()] }));

    const result = await fetchAnalyticsDefinitions();
    const views = result.definitions.find((entry) => entry.key === 'content.views');

    expect(views?.definition).toBe('The platform’s own sentence about what a view is.');
    expect(views?.owner).toBe('B19 Analytics');
    // `AWAITING_SOURCE` is "the contract exists and nothing has submitted the
    // event" — partly real, not a backend gap.
    expect(views?.status).toBe('PARTIAL');
  });

  it('maps NOT_MEASURED onto a gap and CONNECTED onto a real measurement', async () => {
    mock.onGet('/analytics/definitions').reply(
      200,
      envelope({
        version: '1.0.0',
        definitions: [
          row({ key: 'reach', catalogueKey: 'content.reach', status: 'NOT_MEASURED' }),
          row({ key: 'saves', catalogueKey: 'content.saves', status: 'CONNECTED' }),
        ],
      })
    );

    const result = await fetchAnalyticsDefinitions();
    const byKey = new Map(result.definitions.map((entry) => [entry.key, entry]));

    expect(byKey.get('content.reach')?.status).toBe('BACKEND_GAP');
    expect(byKey.get('content.saves')?.status).toBe('CONNECTED');
    // A closed gap stops offering a register entry to go and read.
    expect(byKey.get('content.saves')?.gapKey).toBeNull();
  });

  it('drops a row this build has no catalogue key for, and names it', async () => {
    mock.onGet('/analytics/definitions').reply(
      200,
      envelope({
        version: '2.0.0',
        definitions: [row({ key: 'quantum_flux', catalogueKey: 'quantum.flux' })],
      })
    );

    const result = await fetchAnalyticsDefinitions();

    expect(result.reconciledCount).toBe(0);
    expect(result.unknownCatalogueKeys).toEqual(['quantum.flux']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONTENT DATASET
// ═════════════════════════════════════════════════════════════════════════════

const FRESHNESS = {
  computedAt: '2026-08-08T03:00:00.000Z',
  sourceName: 'Diaspora analytics',
  methodology: 'Counted from recorded platform activity.',
  limitations: null,
};

function datasetBody(overrides: Record<string, unknown> = {}) {
  return {
    subject: { type: 'guide', id: 'g1', label: null },
    range: {
      preset: 'last30d',
      from: '2026-07-10',
      to: '2026-08-08',
      timezone: 'UTC',
      isDeviceTimezone: false,
    },
    comparison: 'previousPeriod',
    status: 'PARTIAL',
    metrics: [
      {
        key: 'content.views',
        label: 'Views',
        value: { value: 118, source: 'backend' },
        format: 'count',
        computation: 'server-aggregate',
        higherIsBetter: true,
        comparison: {
          basis: 'previousPeriod',
          baselineFrom: '2026-06-10',
          baselineTo: '2026-07-09',
          baselineValue: 100,
          // A **ratio**. Eighteen percent.
          changePercent: 0.18,
          changeAbsolute: 18,
          unavailableReason: null,
        },
        freshness: FRESHNESS,
        privacyClass: 'owner',
        isSuppressed: false,
      },
    ],
    series: [
      {
        key: 'content.views',
        label: 'Views',
        granularity: 'day',
        format: 'count',
        points: [{ at: '2026-08-08', value: 4, isPartialBucket: true }],
        source: 'backend',
      },
    ],
    breakdowns: [],
    funnels: [],
    leaderboards: [],
    insights: [],
    freshness: FRESHNESS,
    unavailableMetrics: ['content.reach'],
    ...overrides,
  };
}

describe('GET /analytics/content/{type}/{id}', () => {
  it('routes the client’s six per-item subject types and no others', () => {
    for (const type of ['guide', 'event', 'update', 'job', 'listing', 'housing'] as const) {
      expect(isCertifiedContentSubject({ type, id: 'x' })).toBe(true);
    }
    // No certified per-item route, so these keep the development arm.
    expect(isCertifiedContentSubject({ type: 'community', id: 'c1' })).toBe(false);
    expect(isCertifiedContentSubject({ type: 'platform', id: null })).toBe(false);
    // A type with a route but no identifier is not addressable.
    expect(isCertifiedContentSubject({ type: 'guide', id: null })).toBe(false);
  });

  it('keeps changePercent a ratio and does not divide it again', async () => {
    mock.onGet('/analytics/content/guide/g1').reply(200, envelope(datasetBody()));

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    // 0.18 in, 0.18 out. Dividing here would render eighteen percent as 0.18%.
    expect(dataset.metrics[0].comparison?.changePercent).toBe(0.18);
    expect(dataset.metrics[0].comparison?.baselineValue).toBe(100);
  });

  it('renders the server’s empty collections as empty rather than as zero', async () => {
    mock.onGet('/analytics/content/guide/g1').reply(200, envelope(datasetBody()));

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    expect(dataset.breakdowns).toEqual([]);
    expect(dataset.funnels).toEqual([]);
    expect(dataset.insights).toEqual([]);
    expect(dataset.leaderboards).toEqual([]);
    expect(dataset.retention).toBeNull();
    // And nothing on it is a gap.
    expect(dataset.gapKey).toBeNull();
  });

  it('takes the resolved range and the platform’s timezone, not the request’s', async () => {
    mock.onGet('/analytics/content/guide/g1').reply(200, envelope(datasetBody()));

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    expect(dataset.range.timezone).toBe('UTC');
    expect(dataset.range.isDeviceTimezone).toBe(false);
    expect(dataset.status).toBe('PARTIAL');
    expect(dataset.unavailableMetrics).toEqual(['content.reach']);
  });

  it('never marks a real figure simulated', async () => {
    mock.onGet('/analytics/content/guide/g1').reply(200, envelope(datasetBody()));

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    expect(dataset.metrics[0].value.source).toBe('backend');
    expect(dataset.metrics[0].computation).toBe('server-aggregate');
    expect(dataset.series[0].source).toBe('backend');
  });

  it('drops a metric whose key this build cannot render', async () => {
    mock.onGet('/analytics/content/guide/g1').reply(
      200,
      envelope(
        datasetBody({
          metrics: [
            {
              ...datasetBody().metrics[0],
              key: 'quantum.flux',
            },
          ],
        })
      )
    );

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    expect(dataset.metrics).toEqual([]);
  });

  it('uses the marketplace segment for a listing subject', async () => {
    mock.onGet('/analytics/content/listing/l1').reply(
      200,
      envelope(datasetBody({ subject: { type: 'listing', id: 'l1', label: null } }))
    );

    const dataset = await fetchContentAnalytics({ type: 'listing', id: 'l1' }, RANGE);

    expect(dataset.subject).toEqual({ type: 'listing', id: 'l1' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TELEMETRY
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /telemetry/events · what actually reaches the platform', () => {
  const record = (
    event: string,
    properties: Record<string, unknown> = {},
    occurredAt = new Date().toISOString()
  ): CreatorAnalyticsRecord => ({ event, properties, occurredAt });

  it('sends the four submittable names this app emits', () => {
    const { deliverable, refusedLocally } = partitionForDelivery([
      record('automation.tested', { actionCount: 2, wasSimulated: true }),
      record('automation.builder.started', { triggerKey: 'member.joined' }),
      record('automation.builder.abandoned'),
      record('automation.gap.encountered', { gapId: 'automation-templates' }),
    ]);

    expect(deliverable.map((entry) => entry.event)).toEqual([
      'automation.tested',
      'automation.builder.started',
      'automation.builder.abandoned',
      'automation.gap.encountered',
    ]);
    expect(refusedLocally).toEqual({});
  });

  it('refuses an unregistered name with the code the server would have used', () => {
    const { deliverable, refusedLocally } = partitionForDelivery([
      record('creator.dashboard.viewed'),
      record('analytics.dashboard.viewed', { subjectType: 'creator' }),
      record('maps.route.planned'),
    ]);

    expect(deliverable).toEqual([]);
    expect(refusedLocally['analytics.ingest.event-unknown']).toBe(3);
  });

  it('separates a server-produced name from an unknown one', () => {
    const { refusedLocally } = partitionForDelivery([
      record('content.saved', { contentId: 'c1' }),
      record('automation.created', { triggerKey: 't' }),
    ]);

    expect(refusedLocally['analytics.ingest.event-not-submittable']).toBe(2);
    expect(refusedLocally['analytics.ingest.event-unknown']).toBeUndefined();
  });

  it('refuses a property the platform’s narrower allow-list has no room for', () => {
    // `metricKey` is legal at emit — Phase 15 registered it — and illegal at
    // ingest. One disallowed key refuses the whole event, not just the key.
    const { deliverable, refusedLocally } = partitionForDelivery([
      record('automation.tested', { metricKey: 'content.views' }),
    ]);

    expect(deliverable).toEqual([]);
    expect(refusedLocally['analytics.ingest.property-not-allowed']).toBe(1);
  });

  it('refuses an engagement event with no content reference', () => {
    const { refusedLocally } = partitionForDelivery([record('content.viewed')]);
    expect(refusedLocally['analytics.ingest.event-malformed']).toBe(1);
  });

  it('refuses an occurrence older than the platform accepts', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z');
    const { refusedLocally } = partitionForDelivery(
      [record('automation.builder.started', {}, '2026-08-01T12:00:00.000Z')],
      now
    );

    expect(refusedLocally['analytics.ingest.occurred-at-out-of-range']).toBe(1);
  });

  it('accepts a slightly fast device clock, because dropping it would under-count', () => {
    const now = Date.parse('2026-08-08T12:00:00.000Z');
    const { deliverable } = partitionForDelivery(
      [record('automation.builder.started', {}, '2026-08-08T12:05:00.000Z')],
      now
    );

    expect(deliverable).toHaveLength(1);
  });
});
