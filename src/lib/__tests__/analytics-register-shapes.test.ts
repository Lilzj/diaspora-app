// ─────────────────────────────────────────────────────────────────────────────
// A route that exists is not a route that returns what we declared — 13 Sep 2026
//
// Four analytics entries were marked `backendStatus: 'connected'`, and
// `connected` is the field that silences the gap notice. Each had been verified
// by probing its path — one note said so outright: "403 to a member, which is a
// permission, not an absence." That proves a route exists. It proves nothing
// about what the route returns, and the published OpenAPI contract cannot help:
// it declares a response body for 65 of its 959 operations.
//
// Traced through the C# source to the record each one actually returns:
//
//   organizationAnalytics    bespoke { period, memberGrowth[], volunteerHours[],
//                            pollParticipation[] } — not an AnalyticsDataset
//   countryAnalytics         government-intelligence view counters, no date
//                            dimension — closer to a different capability
//   notificationAnalytics    flat totals by channel/category/template, and no
//                            community dimension, which the entry keys on
//   recommendationAnalytics  a list of per-day rows, not a dataset
//
// All four are real routes. None returns the `AnalyticsDataset` the Phase 15
// dashboards render, so `connected` told a reader a dataset was waiting that is
// not.
//
// Equally, two entries that a path-only sweep would call absent are genuinely
// served, and are pinned here so a future sweep does not downgrade them:
// `eventAnalytics` (the generic content route maps `event`) and
// `metricCatalogue` (served, and consumed correctly as an envelope).
// ─────────────────────────────────────────────────────────────────────────────

import { ANALYTICS_GAPS } from '@/config/analytics-gaps';

describe('entries whose route is real but whose shape is not a dataset', () => {
  it.each([
    'organizationAnalytics',
    'countryAnalytics',
    'notificationAnalytics',
    'recommendationAnalytics',
  ])('%s is partial, not connected', (key) => {
    // Re-marking one of these `connected` hides a notice over a dashboard that
    // still cannot render its data. Trace the response record before changing it.
    expect(ANALYTICS_GAPS[key].backendStatus).toBe('partial');
  });

  it('keeps a wallet with totals and no series partial', () => {
    expect(ANALYTICS_GAPS.walletAnalytics.backendStatus).toBe('partial');
  });

  it.each(['marketplaceAnalytics', 'housingAnalytics', 'employerAnalytics'])(
    '%s is partial: a real owner dataset, and most of the declared dashboard still unrecorded',
    (key) => {
      // `connected` would silence the notice over funnels and breakdowns nothing
      // computes; leaving it a gap would deny figures the owner route serves.
      expect(ANALYTICS_GAPS[key].backendStatus).toBe('partial');
    }
  );
});

describe('entries a path-only sweep would get wrong the other way', () => {
  it('keeps event analytics connected, because the content route maps `event`', () => {
    // `GET /analytics/content/event/{eventId}` is the declared endpoint, and the
    // served `/analytics/content/{contentType}/{contentId}` accepts it. A sweep
    // comparing the literal `event` against `{contentType}` calls it absent.
    expect(ANALYTICS_GAPS.eventAnalytics.backendStatus).toBe('connected');
  });

  it('keeps the metric catalogue connected, and describes its real envelope', () => {
    const catalogue = ANALYTICS_GAPS.metricCatalogue;

    expect(catalogue.backendStatus).toBe('connected');
    // `data` is `{ version, definitions }`. Describing it as an array is the
    // `undefined.map` this repository has already shipped once.
    expect(catalogue.requiredContracts[0].response).toContain('version, definitions');
  });

  it('no longer promises revenue metrics the creator dataset does not carry', () => {
    expect(ANALYTICS_GAPS.creatorAnalytics.requiredContracts[0].response).not.toMatch(
      /revenue metrics carrying/
    );
  });
});

describe('what every corrected note records', () => {
  it.each([
    'organizationAnalytics',
    'countryAnalytics',
    'notificationAnalytics',
    'recommendationAnalytics',
    'eventAnalytics',
    'walletAnalytics',
    'marketplaceAnalytics',
    'housingAnalytics',
    'employerAnalytics',
  ])('%s says its payload was traced, not inferred', (key) => {
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'config', 'analytics-gaps.ts'),
      'utf8'
    );

    const start = source.indexOf(`\n  ${key}: {\n`);
    const block = source.slice(start, source.indexOf('backendStatus:', start));

    // The method is the finding. A note that says "served as GET …" and stops
    // is exactly what let four of these be wrong.
    expect(block).toContain('Payload traced in source');
  });
});
