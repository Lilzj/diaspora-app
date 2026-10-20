// ─────────────────────────────────────────────────────────────────────────────
// Heat layers read the real route, for every layer, in every build (20 Oct 2026)
//
// Backend edaac7a serves `housing-price`, `cost-of-living` and `safety` on
// `GET /geo/heatmap`, with `timeRange` and, for safety, `source`. The wire
// fixtures below mirror `HeatLayerResponse.cs` field for field. What is pinned:
//
//   · the parameters each layer sends (source on safety only; the country
//     where the server requires one; the time range always);
//   · a layer that needs a country and has none is not asked for at all;
//   · withheld cells stay withheld — drawn grey, never empty or zero;
//   · an unavailable source keeps its reason and draws nothing;
//   · the police credit and the rent currency arrive on the layer;
//   · no hook here waits on a simulation flag.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import {
  HEAT_SAFETY_SOURCES,
  SERVED_HEAT_LAYERS,
  heatLayerCatalogue,
  heatLayerDefinition,
  heatLayerNeedsCountry,
  heatLayerParams,
  heatLayerProblem,
  toCertifiedHeatLayer,
  type HeatLayerWire,
} from '@/lib/maps/geo-client';
import { WITHHELD_FILL, heatColour, heatLayerPolygons } from '@/lib/maps/heat-shapes';
import { getMapFeatureFlags } from '@/config/map-config';
import { useHeatLayer } from '@/hooks/maps';
import type { MapLayerId } from '@/types/maps';

const BOUNDS = { north: 51.55, south: 51.45, east: -0.05, west: -0.15 };

const square = (north: number, west: number, side = 0.01) => ({
  north,
  south: north - side,
  east: west + side,
  west,
});

function wire(overrides: Partial<HeatLayerWire> = {}): HeatLayerWire {
  return {
    layer: 'housing-price',
    source: 'listings',
    isAvailable: true,
    unavailableReason: null,
    unit: 'median monthly asking rent',
    points: [
      {
        latitude: 51.505,
        longitude: -0.095,
        intensity: 1,
        rawValue: 1850,
        areaName: 'Area around 51.51°N, 0.10°W',
        areaId: '00000000-0000-0000-0000-000000000001',
        cellKey: '-2:5150:-10',
        cellBounds: square(51.51, -0.1),
        sampleSize: 7,
      },
      {
        latitude: 51.495,
        longitude: -0.085,
        intensity: 0,
        rawValue: 1200,
        areaName: 'Area around 51.50°N, 0.09°W',
        areaId: '00000000-0000-0000-0000-000000000002',
        cellKey: '-2:5149:-9',
        cellBounds: square(51.5, -0.09),
        sampleSize: 5,
      },
    ],
    scale: 'relative-to-viewport',
    minValue: 1200,
    maxValue: 1850,
    level: 'Neighborhood',
    cellSizeDegrees: 0.01,
    minimumCellCount: 5,
    suppressedCells: 1,
    withheldCells: [
      {
        cellKey: '-2:5148:-9',
        areaId: '00000000-0000-0000-0000-000000000003',
        areaName: 'Area around 51.49°N, 0.09°W',
        cellBounds: square(51.49, -0.09),
        reason: 'TooFewHomes',
        detail: 'Fewer than 5 homes to rent in this cell, so no median is published. Withheld is not zero.',
      },
    ],
    minimumCountrySample: null,
    currency: 'GBP',
    timeRange: '30d',
    timeBasis: 'published',
    from: '2026-09-20T00:00:00Z',
    to: '2026-10-20T00:00:00Z',
    licence: null,
    attribution: null,
    truncated: false,
    bounds: BOUNDS,
    freshness: {
      computedAt: '2026-10-20T09:00:00Z',
      sourceName: 'Diaspora listings',
      methodology: 'The median monthly asking rent, in GBP, of the homes to rent listed on Diaspora.',
      limitations: ['Asking rents of homes listed on Diaspora, not agreed rents.'],
      sampleSize: 12,
    },
    ...overrides,
  };
}

const POLICE_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0.';

describe('the layers on offer', () => {
  it('serves all eight layers, none marked simulated or carrying a gap key', () => {
    expect([...SERVED_HEAT_LAYERS].sort()).toEqual(
      [
        'community-activity',
        'cost-of-living',
        'events',
        'housing-availability',
        'housing-price',
        'jobs',
        'marketplace-activity',
        'safety',
      ].sort()
    );
    for (const layer of heatLayerCatalogue()) {
      expect(layer.source).toBe('backend');
      expect(layer.gapKey).toBeUndefined();
    }
  });

  it('describes safety as counts from a source, never a score', () => {
    expect(heatLayerDefinition('safety').description).toMatch(/Not a safety score/);
    expect(heatLayerDefinition('safety').unit).not.toMatch(/score/);
  });

  it('is on in every build — the heat flag no longer follows the simulation switch', () => {
    const originalDev = (global as { __DEV__?: boolean }).__DEV__;
    const originalPreview = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    try {
      (global as { __DEV__?: boolean }).__DEV__ = false;
      delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
      expect(getMapFeatureFlags().heatMapsEnabled).toBe(true);
    } finally {
      (global as { __DEV__?: boolean }).__DEV__ = originalDev;
      if (originalPreview !== undefined) process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = originalPreview;
    }
  });
});

describe('the parameters each layer sends', () => {
  it('sends the time range on every layer, and no source except on safety', () => {
    for (const layer of SERVED_HEAT_LAYERS) {
      const params = heatLayerParams(layer, BOUNDS, {
        timeRange: '7d',
        source: 'police-recorded-crime',
        countryCode: 'gb',
      });
      expect(params.layer).toBe(layer);
      expect(params.timeRange).toBe('7d');
      expect(params.north).toBe(BOUNDS.north);
      expect(params.west).toBe(BOUNDS.west);
      // `geo.heat.source_unsupported` on any other layer.
      expect(params.source).toBe(layer === 'safety' ? 'police-recorded-crime' : undefined);
      expect(params.countryCode).toBe('GB');
    }
  });

  it('never sends one `bounds` string — /geo/heatmap takes four numbers', () => {
    expect(heatLayerParams('jobs', BOUNDS)).not.toHaveProperty('bounds', expect.anything());
  });

  it('omits a blank country rather than sending an empty one', () => {
    expect(heatLayerParams('housing-price', BOUNDS, { countryCode: '  ' }).countryCode).toBeUndefined();
  });

  it('knows which layers the server refuses without a country', () => {
    expect(heatLayerNeedsCountry('housing-price')).toBe(true);
    expect(heatLayerNeedsCountry('cost-of-living')).toBe(true);
    expect(heatLayerNeedsCountry('safety', 'police-recorded-crime')).toBe(true);
    expect(heatLayerNeedsCountry('safety', 'community-reports')).toBe(false);
    expect(heatLayerNeedsCountry('safety')).toBe(false);
    for (const layer of [
      'community-activity',
      'housing-availability',
      'marketplace-activity',
      'jobs',
      'events',
    ] as MapLayerId[]) {
      expect(heatLayerNeedsCountry(layer)).toBe(false);
    }
    expect(HEAT_SAFETY_SOURCES[0]).toBe('community-reports');
  });
});

describe('the response, mapped', () => {
  it('keeps withheld cells as withheld, with the reason and no figure', () => {
    const layer = toCertifiedHeatLayer(heatLayerDefinition('housing-price'), wire());

    expect(layer.withheldCells).toEqual([
      {
        cellKey: '-2:5148:-9',
        cellBounds: square(51.49, -0.09),
        reason: 'TooFewHomes',
        detail: expect.stringMatching(/Withheld is not zero/),
      },
    ]);
    expect(layer.suppressedCells).toBe(1);
    // Withheld is not zero: no point stands for it.
    expect(layer.points).toHaveLength(2);
    expect(layer.points.every((point) => point.rawValue > 0)).toBe(true);
  });

  it('carries the currency, the unit and the time range the server applied', () => {
    const layer = toCertifiedHeatLayer(heatLayerDefinition('housing-price'), wire());

    expect(layer.currency).toBe('GBP');
    expect(layer.layer.unit).toBe('median monthly asking rent');
    expect(layer.timeRange).toBe('30d');
    expect(layer.points[0].cellBounds).toEqual(square(51.51, -0.1));
    expect(layer.points[0].sampleSize).toBe(7);
  });

  it('never carries a cell name — a square is a position, not a place', () => {
    const layer = toCertifiedHeatLayer(heatLayerDefinition('housing-price'), wire());

    expect(JSON.stringify(layer)).not.toMatch(/Area around/);
  });

  it('reads a range the server did not echo as not applied, not as the one asked for', () => {
    const layer = toCertifiedHeatLayer(heatLayerDefinition('jobs'), wire({ timeRange: null }));
    expect(layer.timeRange).toBeNull();
  });

  it('draws nothing for an unavailable source and keeps the server reason', () => {
    const layer = toCertifiedHeatLayer(
      heatLayerDefinition('safety'),
      wire({
        layer: 'safety',
        source: 'police-recorded-crime',
        isAvailable: false,
        unavailableReason: 'NotYetPublished',
        unit: 'crimes',
        currency: null,
        withheldCells: [],
        licence: 'OGL-UK-3.0',
        attribution: POLICE_ATTRIBUTION,
      })
    );

    expect(layer.isAvailable).toBe(false);
    expect(layer.unavailableReason).toBe('NotYetPublished');
    expect(layer.points).toEqual([]);
    expect(heatLayerPolygons(layer)).toEqual([]);
    expect(layer.attribution).toBe(POLICE_ATTRIBUTION);
  });

  it('carries the police licence and credit when its data is drawn', () => {
    const layer = toCertifiedHeatLayer(
      heatLayerDefinition('safety'),
      wire({
        layer: 'safety',
        source: 'police-recorded-crime',
        unit: 'crimes',
        currency: null,
        timeBasis: 'month',
        licence: 'OGL-UK-3.0',
        attribution: POLICE_ATTRIBUTION,
        freshness: { computedAt: '2026-10-20T09:00:00Z', sourceName: 'data.police.uk' },
      })
    );

    expect(layer.source).toBe('police-recorded-crime');
    expect(layer.licence).toBe('OGL-UK-3.0');
    expect(layer.attribution).toBe(POLICE_ATTRIBUTION);
    expect(layer.timeBasis).toBe('month');
  });

  it('reads a refusal in the server’s own words', () => {
    const problem = heatLayerProblem({
      response: {
        status: 400,
        data: {
          code: 'geo.heat.country_required',
          detail: "countryCode is required for the 'housing-price' layer from this source.",
        },
      },
    });
    expect(problem.code).toBe('geo.heat.country_required');
    expect(problem.detail).toMatch(/countryCode is required/);
    expect(heatLayerProblem(new Error('Network Error'))).toEqual({ code: null, detail: null });
  });
});

describe('the squares the map draws', () => {
  it('draws each cell on its own grid square, and each withheld cell grey', () => {
    const layer = toCertifiedHeatLayer(heatLayerDefinition('housing-price'), wire());
    const polygons = heatLayerPolygons(layer);

    expect(polygons).toHaveLength(3);
    const withheld = polygons.filter((polygon) => polygon.id.startsWith('heat-withheld-'));
    expect(withheld).toHaveLength(1);
    expect(withheld[0].fillColor).toBe(WITHHELD_FILL);
    const edges = square(51.49, -0.09);
    expect(withheld[0].path).toEqual([
      { latitude: edges.north, longitude: edges.west },
      { latitude: edges.north, longitude: edges.east },
      { latitude: edges.south, longitude: edges.east },
      { latitude: edges.south, longitude: edges.west },
    ]);
    // Drawn cells are never the withheld grey.
    for (const polygon of polygons.filter((p) => !p.id.startsWith('heat-withheld-'))) {
      expect(polygon.fillColor).not.toBe(WITHHELD_FILL);
    }
  });

  it('skips a square it cannot place rather than drawing NaN', () => {
    const layer = toCertifiedHeatLayer(
      heatLayerDefinition('jobs'),
      wire({
        cellSizeDegrees: null,
        points: [
          {
            latitude: Number.NaN,
            longitude: 0,
            intensity: 1,
            rawValue: 3,
            areaName: '',
            areaId: 'x',
            cellBounds: null,
          },
        ],
        withheldCells: [],
      })
    );
    expect(heatLayerPolygons(layer)).toEqual([]);
  });

  it('maps intensity onto the legend gradient, ends included', () => {
    expect(heatColour(0)).toBe('#FDE68A');
    expect(heatColour(1)).toBe('#DC2626');
    expect(heatColour(Number.NaN)).toBe('#FDE68A');
  });
});

describe('useHeatLayer', () => {
  let queryClient: QueryClient;
  let mock: MockAdapter;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  async function settle() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    mock.onGet('/geo/heatmap').reply((config) => [
      200,
      { data: wire({ layer: String(config.params?.layer) }) },
    ]);
  });

  afterEach(() => {
    queryClient.clear();
    mock.restore();
  });

  it('asks the real route for a rent layer with the country, the range and no source', async () => {
    const { result } = renderHook(
      () => useHeatLayer('housing-price', BOUNDS, { timeRange: '90d', countryCode: 'gb' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].url).toBe('/geo/heatmap');
    expect(mock.history.get[0].params).toMatchObject({
      layer: 'housing-price',
      timeRange: '90d',
      countryCode: 'GB',
    });
    expect(mock.history.get[0].params.source).toBeUndefined();
    expect(result.current.needsCountry).toBe(false);
  });

  it('sends the chosen source for safety, community reports by default', async () => {
    const { result } = renderHook(() => useHeatLayer('safety', BOUNDS, {}), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mock.history.get[0].params).toMatchObject({
      layer: 'safety',
      source: 'community-reports',
      timeRange: '30d',
    });
  });

  it('asks nothing for a layer that needs a country the member has not given, and says so', async () => {
    const { result } = renderHook(
      () => useHeatLayer('safety', BOUNDS, { source: 'police-recorded-crime', countryCode: null }),
      { wrapper }
    );

    await settle();
    expect(mock.history.get).toHaveLength(0);
    expect(result.current.needsCountry).toBe(true);
  });
});
