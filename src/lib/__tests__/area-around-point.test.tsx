// ─────────────────────────────────────────────────────────────────────────────
// The area around a point — 14 Oct 2026
//
// The owner retired the platform's place catalogue. Neighbourhood pages became
// the area around a point (`GET /geo/area`, `/geo/area/compare`), members'
// insights moved to `/housing/area/insights`, community activity to
// `/community-life/area/activity`, and the map's outlines were removed.
//
// Pinned here:
//   * the exact query each client sends, including what it leaves out (a blank
//     name, an out-of-range radius);
//   * "not enough nearby listings yet" for `InsufficientSample`;
//   * no safety score, ever, even if a server sent one;
//   * nothing in the app still asks the retired catalogue routes or for outlines.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { compareAreas, fetchAreaReport, toAreaReport, type AreaReport, type AreaReportWire } from '@/lib/maps/geo-client';
import { areaTitle, costOfLivingUnavailableText, parseAreaPoint } from '@/lib/maps/area-copy';
import { fetchAreaInsights, submitAreaInsight } from '@/lib/area-insights-api';
import { fetchAreaActivity, toEventBrowseQuery } from '@/lib/community-life-api';

const mockAreaReport = jest.fn();

jest.mock('@/hooks/maps', () => ({
  useAreaReport: () => mockAreaReport(),
}));
jest.mock('@/hooks/member-point', () => ({
  useMemberPoint: () => ({
    point: { latitude: -1.2921, longitude: 36.8219, countryCode: 'KE' },
    countryCode: 'KE',
  }),
}));
jest.mock('@/hooks/area-insights', () => ({
  useAreaInsights: () => ({ data: [], isLoading: false, isError: false }),
  useSubmitAreaInsight: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));
jest.mock('@/components/maps', () => ({
  ...jest.requireActual('@/components/maps'),
  DiasporaMap: () => null,
}));

const fs = require('fs') as { readFileSync(p: string, e: string): string; existsSync(p: string): boolean };
const path = require('path') as { join(...s: string[]): string };
const source = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...parts), 'utf8');

// eslint-disable-next-line import/first
import AreaScreen from '@/app/map/area';

const FRESHNESS = { computedAt: '2026-10-14T09:00:00Z', sourceName: 'Diaspora listings' };

/** Nairobi, outside data.police.uk, with too few homes listed. And a score it must never show. */
function nairobi(overrides: Partial<AreaReportWire> = {}): AreaReportWire {
  return {
    latitude: -1.2921,
    longitude: 36.8219,
    radiusKm: 2,
    countryCode: 'KE',
    countryName: 'Kenya',
    name: null,
    displayName: 'Within 2 km of you',
    resourceCounts: { housing: 3, marketplace: 12, jobs: 4, events: 2, updates: 7 },
    lowerBoundResourceTypes: ['marketplace'],
    unavailableResourceTypes: [],
    overall: null,
    dimensions: [],
    unavailableDimensions: [
      { id: 'safety', label: 'Safety', reason: 'NoDataSource', explanation: 'No source measures safety.' },
    ],
    costOfLiving: {
      isAvailable: false,
      unavailableReason: 'InsufficientSample',
      sampleSize: 3,
      countrySampleSize: 11,
      overallIndex: null,
      baselineName: null,
      currency: null,
      categories: [],
      freshness: FRESHNESS,
    },
    safety: {
      isAvailable: false,
      // A server that broke the rule. The client must not pass it on.
      score: 87,
      band: 'high',
      unavailableReason: 'NoDataSource',
      counts: [
        {
          kind: 'community-reports',
          source: 'Diaspora community reports',
          isAvailable: true,
          from: '2026-07-16T09:00:00Z',
          to: '2026-10-14T09:00:00Z',
          area: 'Alerts filed within 2 km',
          method: 'Police and Emergency alerts members published within the circle over 90 days.',
          total: 5,
          categories: [{ id: 'Police', label: 'Police', count: 5 }],
        },
        {
          kind: 'police-recorded-crime',
          source: 'No published source',
          isAvailable: false,
          unavailableReason: 'NotPublished',
          area: 'Places in Kenya',
          method: 'No open, republishable source covers Kenya.',
          total: null,
          categories: [],
        },
      ],
      limitations: ['Diaspora does not publish a safety score.'],
    },
    freshness: FRESHNESS,
    ...overrides,
  };
}

describe('the area read — GET /geo/area', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
  });
  afterEach(() => mock.restore());

  it('sends the point, the country, the picked name and the radius', async () => {
    mock.onGet('/geo/area').reply(200, { data: nairobi({ name: 'Westlands', displayName: 'Westlands' }) });

    await fetchAreaReport({ latitude: -1.2675, longitude: 36.8108, countryCode: 'ke', name: ' Westlands ' }, { radiusKm: 5 });

    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].params).toEqual({
      latitude: -1.2675,
      longitude: 36.8108,
      countryCode: 'KE',
      name: 'Westlands',
      radiusKm: 5,
    });
  });

  it('sends no name for "around me", and no radius it cannot honour', async () => {
    mock.onGet('/geo/area').reply(200, { data: nairobi() });

    await fetchAreaReport({ latitude: -1.2921, longitude: 36.8219, countryCode: 'KE', name: '   ' }, { radiusKm: 0 });
    await fetchAreaReport({ latitude: -1.2921, longitude: 36.8219, countryCode: 'KE' }, { radiusKm: 25 });

    expect(mock.history.get[0].params.name).toBeUndefined();
    expect(mock.history.get[0].params.radiusKm).toBeUndefined();
    // Capped at the server's 10 km rather than refused.
    expect(mock.history.get[1].params.radiusKm).toBe(10);
  });

  it('compares two points with one radius, A and B named apart', async () => {
    mock.onGet('/geo/area/compare').reply(200, { data: { radiusKm: 2, areas: [nairobi(), nairobi()] } });

    const comparison = await compareAreas(
      { latitude: -1.2921, longitude: 36.8219, countryCode: 'KE', name: 'Nairobi CBD' },
      { latitude: -4.0435, longitude: 39.6682, countryCode: 'KE', name: 'Mombasa' },
      { radiusKm: 2 }
    );

    expect(mock.history.get[0].params).toEqual({
      latitudeA: -1.2921,
      longitudeA: 36.8219,
      countryCodeA: 'KE',
      nameA: 'Nairobi CBD',
      latitudeB: -4.0435,
      longitudeB: 39.6682,
      countryCodeB: 'KE',
      nameB: 'Mombasa',
      radiusKm: 2,
    });
    expect(comparison.areas).toHaveLength(2);
  });

  it('drops a safety score and band whatever the wire carries', () => {
    const report = toAreaReport(nairobi());

    expect(report.safety).toEqual({
      counts: expect.any(Array),
      limitations: ['Diaspora does not publish a safety score.'],
    });
    expect(JSON.stringify(report)).not.toContain('87');
    expect(JSON.stringify(report)).not.toContain('"band"');
  });

  it('reads InsufficientSample as no index, and says "not enough nearby listings yet"', () => {
    const report = toAreaReport(nairobi());

    expect(report.costOfLiving.index).toBeNull();
    expect(report.costOfLiving.unavailableReason).toBe('InsufficientSample');
    expect(costOfLivingUnavailableText(report.costOfLiving)).toBe(
      'Not enough nearby listings yet to work out typical rent here. 3 homes are listed to rent in this area and 11 in the country; an index needs at least 5 here and 20 in the country.'
    );
  });
});

describe('the title never names a point the member did not', () => {
  const report = toAreaReport(nairobi());

  it('is the place the member picked', () => {
    expect(areaTitle(report, { ...report, name: 'Westlands', origin: 'place' }, 2)).toBe('Westlands');
  });

  it('is a description of the circle for a map cell, not the cell’s coordinates', () => {
    expect(areaTitle(report, { ...report, name: null, origin: 'cell' }, 5)).toBe('Within 5 km of this point');
  });

  it('is the server’s "Within 2 km of you" around the member', () => {
    expect(areaTitle(report, { ...report, name: null, origin: 'me' }, 2)).toBe('Within 2 km of you');
  });

  it('reads a point from route params, upper-casing the country and falling back to the member’s', () => {
    expect(parseAreaPoint({ latitude: '-4.05', longitude: '39.67', origin: 'cell' }, 'ke')).toEqual({
      latitude: -4.05,
      longitude: 39.67,
      countryCode: 'KE',
      name: null,
      placeId: null,
      origin: 'cell',
    });
    expect(parseAreaPoint({ latitude: 'x', longitude: '39.67' }, 'KE')).toBeNull();
  });
});

describe('the area screen', () => {
  const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

  function renderScreen(report: AreaReport) {
    mockAreaReport.mockReturnValue({ data: report, isLoading: false, isError: false, refetch: jest.fn() });
    return render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <AreaScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  it('never renders a safety score, even when the wire carried one', () => {
    renderScreen(toAreaReport(nairobi()));

    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/\b87\b/);
    expect(text).not.toMatch(/\/100/);
    expect(text).not.toMatch(/reported as safe|More caution reported|Mixed reports/);
    expect(screen.getByText(/does not give places a safety score/)).toBeTruthy();
  });

  it('shows safety as sourced counts, and "not available here" where no source publishes', () => {
    renderScreen(toAreaReport(nairobi()));

    expect(screen.getByTestId('safety-count-community-reports')).toBeTruthy();
    expect(screen.getByText(/^Not available here: nobody publishes this figure for this country/)).toBeTruthy();
  });

  it('says there are not enough nearby listings instead of a rent index', () => {
    renderScreen(toAreaReport(nairobi()));

    expect(screen.getByTestId('area-cost-unavailable').props.children).toMatch(/^Not enough nearby listings yet/);
  });

  it('shows each count, a capped one as "at least", and offers 1, 2, 5 and 10 km', () => {
    renderScreen(toAreaReport(nairobi()));

    expect(screen.getByLabelText('3 homes within 2 kilometres')).toBeTruthy();
    expect(screen.getByLabelText('At least 12 items for sale within 2 kilometres')).toBeTruthy();
    for (const km of [1, 2, 5, 10]) expect(screen.getByTestId(`area-radius-${km}`)).toBeTruthy();
  });
});

describe('insights and activity around a point', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
  });
  afterEach(() => mock.restore());

  it('lists insights by point and radius', async () => {
    mock.onGet('/housing/area/insights').reply(200, { data: [] });

    await fetchAreaInsights({ latitude: -1.2921, longitude: 36.8219, radiusKm: 2 });

    expect(mock.history.get[0].params).toEqual({
      latitude: -1.2921,
      longitude: 36.8219,
      radiusKm: 2,
      category: undefined,
      mineOnly: undefined,
      cursor: undefined,
      limit: undefined,
    });
  });

  it('submits an insight with the picked place, and none when there was no pick', async () => {
    mock.onPost('/housing/area/insights').reply(201, { data: { id: 'i1', status: 'Pending' } });

    await submitAreaInsight({
      latitude: -1.2675,
      longitude: 36.8108,
      placeName: 'Westlands',
      placeId: 'ChIJ-westlands',
      countryCode: 'ke',
      category: 'Transport',
      body: '  Matatus every few minutes.  ',
    });
    await submitAreaInsight({ latitude: -1.2921, longitude: 36.8219, category: 'Noise', body: 'Quiet after ten.' });

    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      latitude: -1.2675,
      longitude: 36.8108,
      placeName: 'Westlands',
      placeId: 'ChIJ-westlands',
      countryCode: 'KE',
      category: 'Transport',
      body: 'Matatus every few minutes.',
    });
    expect(JSON.parse(mock.history.post[1].data)).toEqual({
      latitude: -1.2921,
      longitude: 36.8219,
      category: 'Noise',
      body: 'Quiet after ten.',
    });
  });

  it('asks community activity around the point', async () => {
    mock.onGet('/community-life/area/activity').reply(200, { data: { displayName: 'Within 2 km of you' } });

    await fetchAreaActivity({ latitude: -1.2921, longitude: 36.8219, radiusKm: 2 });

    expect(mock.history.get[0].params).toEqual({
      latitude: -1.2921,
      longitude: 36.8219,
      radiusKm: 2,
      name: undefined,
      windowDays: undefined,
    });
  });

  it('sends events a point only when it has all three of latitude, longitude and radius', () => {
    expect(toEventBrowseQuery({ latitude: -1.29, longitude: 36.82, radiusKm: 2 })).toMatchObject({
      latitude: -1.29,
      longitude: 36.82,
      radiusKm: 2,
    });
    expect(toEventBrowseQuery({ latitude: -1.29, longitude: 36.82 })).not.toHaveProperty('latitude');
  });
});

describe('nothing asks the retired catalogue routes, or for outlines', () => {
  // The files that used to: the map, the neighbourhood screens, and their clients.
  const FILES = [
    ['app', 'map', 'index.tsx'],
    ['app', 'map', 'area.tsx'],
    ['app', 'map', 'compare.tsx'],
    ['app', 'neighborhood', '[id].tsx'],
    ['app', 'community-life', 'neighborhood.tsx'],
    ['app', 'community-life', 'index.tsx'],
    ['hooks', 'maps.ts'],
    ['hooks', 'community-life.ts'],
    ['lib', 'maps-api.ts'],
    ['lib', 'maps', 'geo-client.ts'],
    ['lib', 'maps', 'server-clusters.ts'],
    ['lib', 'community-life-api.ts'],
    ['lib', 'analytics-api.ts'],
    ['lib', 'recommendations-api.ts'],
    ['lib', 'notification-routes.ts'],
  ];

  // A request path starts right after a quote or backtick. Prose about a route
  // starts with the verb ("`GET /location/…`"), so comments do not trip this.
  const RETIRED = [
    /['"`]\/location\/map\/boundaries/,
    /['"`]\/location\/neighborhoods/,
    /['"`]\/housing\/neighborhoods/,
    /['"`]\/geo\/neighborhoods/,
    /['"`]\/community-life\/neighborhoods/,
    /['"`]\/neighborhoods\//,
    /neighborhoodId=/,
    /place-outlines/,
    /usePlaceOutlines/,
    /'\/map\/neighborhood/,
  ];

  it.each(FILES.map((parts) => [parts.join('/'), parts]))('%s', (_name, parts) => {
    const text = source(...(parts as string[]));
    for (const pattern of RETIRED) expect(text).not.toMatch(pattern);
  });

  it('the outline reader and the catalogue neighbourhood screen are gone', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'lib', 'maps', 'place-outlines.ts'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'app', 'map', 'neighborhood', '[id].tsx'))).toBe(false);
  });

  it('the map draws no polygons and opens the area screen from a cell', () => {
    const map = source('app', 'map', 'index.tsx');
    expect(map).not.toMatch(/polygons=/);
    expect(map).toContain("pathname: '/map/area'");
    expect(map).toContain('onServerClusterPress={handleServerClusterPress}');
  });
});
