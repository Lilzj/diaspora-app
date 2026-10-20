// ─────────────────────────────────────────────────────────────────────────────
// Saved reports, funnels, CSV exports and the community dataset, after the gap
// closed — 20 Oct 2026 (backend a7a94da).
//
// The app reached all four through `/analytics-gap/v0`, which no deployment
// serves. These pin what would regress without a screen changing:
//
//   1. The real paths, never the gap prefix.
//   2. A funnel's unrecorded steps pass through with their reasons, and are
//      not turned into steps of zero.
//   3. An export is CSV, and its link — a path on the API origin — becomes a URL
//      the system browser can open.
//   4. A report is saved private; there is no shared list to ask for.
//   5. A community dataset is read from `/analytics/communities/{id}` and keeps
//      the figures it could not count in `unavailableMetrics`.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { API_BASE_URL, apiClient } from '../apiClient';
import { fetchAnalyticsFunnel, fetchOwnerAnalytics, isCertifiedOwnerSubject } from '../analytics-api';
import {
  absoluteExportUrl,
  createAnalyticsReport,
  fetchAnalyticsExport,
  fetchAnalyticsReports,
  requestAnalyticsExport,
} from '../analytics-reports-api';
import type { AnalyticsQuery, AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-09-21',
  to: '2026-10-20',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

const QUERY: AnalyticsQuery = {
  subject: { type: 'seller', id: null },
  range: RANGE,
  metrics: ['content.views'],
};

const freshness = { computedAt: '2026-10-20T08:00:00Z', sourceName: 'Diaspora analytics' };

describe('the analytics routes that left the gap prefix', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mock.onAny(/analytics-gap\/v0/).reply(() => {
      throw new Error('a real read reached the simulated prefix');
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('reads a funnel and keeps the steps nothing records, with their reasons', async () => {
    mock.onGet('/analytics/funnels/housing').reply((config) => {
      expect(config.params).toEqual({
        subjectType: 'landlord',
        subjectId: 'u1',
        period: 'last30d',
        from: RANGE.from,
        to: RANGE.to,
        timezone: RANGE.timezone,
      });
      return [
        200,
        {
          data: {
            key: 'housing',
            label: 'Housing enquiries',
            subject: { type: 'landlord', id: 'u1' },
            steps: [
              { key: 'view', label: 'Viewed', count: 40, conversionFromPrevious: null },
              { key: 'enquiry', label: 'Enquired', count: 6, conversionFromPrevious: 0.15 },
            ],
            unavailableSteps: [
              { key: 'viewing', label: 'Viewing', reason: 'Viewings are not recorded as events.' },
            ],
            range: RANGE,
            source: 'backend',
            computation: 'server-aggregate',
            freshness,
          },
        },
      ];
    });

    const funnel = await fetchAnalyticsFunnel('housing', { type: 'landlord', id: 'u1' }, RANGE);

    expect(funnel.source).toBe('backend');
    expect(funnel.steps.map((step) => step.key)).toEqual(['view', 'enquiry']);
    expect(funnel.unavailableSteps).toEqual([
      { key: 'viewing', label: 'Viewing', reason: 'Viewings are not recorded as events.' },
    ]);
    // Not a step of zero.
    expect(funnel.steps.find((step) => step.key === 'viewing')).toBeUndefined();
  });

  it('requests a CSV export and turns its link into a URL on the API origin', async () => {
    mock.onPost('/analytics/exports').reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ query: QUERY, format: 'csv' });
      return [
        201,
        {
          data: {
            exportId: 'e1',
            format: 'csv',
            status: 'ready',
            query: QUERY,
            requestedAt: '2026-10-20T09:00:00Z',
            downloadUrl: '/api/v1/analytics/exports/e1/download?token=abc',
            sizeBytes: 120,
          },
        },
      ];
    });

    const job = await requestAnalyticsExport(QUERY, 'csv');

    expect(job.status).toBe('ready');
    const origin = API_BASE_URL.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
    expect(job.downloadUrl).toBe(`${origin}/api/v1/analytics/exports/e1/download?token=abc`);
  });

  it('treats an unknown export status as still working, never as ready', async () => {
    mock.onGet('/analytics/exports/e2').reply(200, {
      data: { exportId: 'e2', format: 'csv', status: 'archiving', query: QUERY, requestedAt: 'x' },
    });

    const job = await fetchAnalyticsExport('e2');

    expect(job.status).toBe('queued');
    expect(job.downloadUrl).toBeNull();
  });

  it('leaves an absolute download URL alone', () => {
    expect(absoluteExportUrl('https://files.example/x.csv')).toBe('https://files.example/x.csv');
    expect(absoluteExportUrl(null)).toBeNull();
  });

  it('saves a report as private and lists the caller’s own', async () => {
    mock.onPost('/analytics/reports').reply((config) => {
      const sent = JSON.parse(config.data);
      expect(sent.sharing).toBe('private');
      return [201, { data: { reportId: 'r1', ...sent, ownerId: 'u1', isOwnedByCaller: true, isFavorite: false, createdAt: 'x', updatedAt: 'x' } }];
    });
    mock.onGet('/analytics/reports').reply((config) => {
      expect(config.params).toEqual({ scope: 'favorites' });
      return [200, { data: [] }];
    });

    const report = await createAnalyticsReport({
      name: 'Weekly views',
      query: QUERY,
      visualization: 'line',
      sharing: 'private',
    });

    expect(report.reportId).toBe('r1');
    await expect(fetchAnalyticsReports('favorites')).resolves.toEqual([]);
  });

  it('reads a community dataset from /analytics/communities/{id}', async () => {
    const subject = { type: 'community' as const, id: 'nigerians-leeds' };
    expect(isCertifiedOwnerSubject(subject)).toBe(true);
    expect(isCertifiedOwnerSubject({ type: 'community', id: null })).toBe(false);

    mock.onGet('/analytics/communities/nigerians-leeds').reply(200, {
      data: {
        subject: { type: 'community', id: 'c1', label: 'Nigerians in Leeds' },
        range: RANGE,
        comparison: 'previousPeriod',
        status: 'PARTIAL',
        metrics: [
          {
            key: 'reach.members',
            label: 'Members',
            value: { value: 41, source: 'backend' },
            format: 'count',
            computation: 'server-aggregate',
            higherIsBetter: true,
            freshness,
            privacyClass: 'privileged',
          },
        ],
        series: [],
        breakdowns: [],
        funnels: [],
        leaderboards: [],
        insights: [],
        freshness,
        unavailableMetrics: ['content.engagementRate'],
      },
    });

    const dataset = await fetchOwnerAnalytics(subject, RANGE, true);

    expect(dataset.status).toBe('PARTIAL');
    expect(dataset.metrics.map((metric) => metric.key)).toEqual(['reach.members']);
    expect(dataset.metrics[0].value.source).toBe('backend');
    expect(dataset.unavailableMetrics.length).toBeGreaterThan(0);
  });
});
