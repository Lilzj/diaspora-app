// ─────────────────────────────────────────────────────────────────────────────
// Place outlines on the map — 17 Sep 2026 (FRONTEND-MAPS-GAP-016)
//
// The platform serves the OpenStreetMap outline of each place it holds one for,
// with the credit the Open Database License requires. The properties that
// matter here are the ones nobody would notice going wrong: that an outline is
// never drawn without its credit, that the credit is shown exactly while an
// outline is, and that a view too wide or not yet anywhere asks for nothing.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { MapAttributionBar } from '@/components/maps';
import { usePlaceOutlines } from '@/hooks/maps';
import { viewportFromCenter } from '@/lib/maps/geo';
import {
  fetchPlaceOutlines,
  outlineAttributions,
  outlinePolygons,
  toPlaceOutline,
  wantsPlaceOutlines,
  type MapBoundaryWire,
} from '@/lib/maps/place-outlines';

const OSM = '© OpenStreetMap contributors';
const QUATRE_BORNES = { latitude: -20.2644, longitude: 57.4786 };

function wire(overrides: Partial<MapBoundaryWire> = {}): MapBoundaryWire {
  return {
    areaId: 'a1',
    name: 'Quatre Bornes',
    slug: 'quatre-bornes',
    level: 'City',
    countryCode: 'MU',
    boundary: {
      vertices: [
        { latitude: -20.24, longitude: 57.44 },
        { latitude: -20.24, longitude: 57.52 },
        { latitude: -20.31, longitude: 57.52 },
        { latitude: -20.31, longitude: 57.44 },
      ],
      source: 'OpenStreetMap',
      licence: 'ODbL-1.0',
      attribution: OSM,
      sourceReference: 'relation/13476401',
      retrievedOn: '2026-09-17',
    },
    ...overrides,
  };
}

describe('an outline from the wire', () => {
  it('keeps its shape and its credit verbatim', () => {
    const outline = toPlaceOutline(wire());

    expect(outline).not.toBeNull();
    expect(outline!.path).toHaveLength(4);
    expect(outline!.attribution).toBe(OSM);
    expect(outline!.licence).toBe('ODbL-1.0');
    expect(outline!.sourceReference).toBe('relation/13476401');
  });

  it('is not drawn without the credit its licence requires', () => {
    expect(toPlaceOutline(wire({ boundary: { ...wire().boundary, attribution: null } }))).toBeNull();
    expect(toPlaceOutline(wire({ boundary: { ...wire().boundary, attribution: '  ' } }))).toBeNull();
  });

  it('is not drawn when fewer than three of its points are usable', () => {
    const vertices = [
      { latitude: -20.24, longitude: 57.44 },
      { latitude: Number.NaN, longitude: 57.52 },
      { latitude: -20.31, longitude: 57.52 },
    ];

    expect(toPlaceOutline(wire({ boundary: { ...wire().boundary, vertices } }))).toBeNull();
    expect(toPlaceOutline(wire({ boundary: null }))).toBeNull();
  });

  it('is a line, firmer for a town than for the district around it, never a filled area', () => {
    const town = toPlaceOutline(wire())!;
    const district = toPlaceOutline(wire({ areaId: 'a2', name: 'Plaines Wilhems', level: 'District' }))!;

    const [townShape, districtShape] = outlinePolygons([town, district], '#F59E0B');

    expect(townShape.fillColor).toBe('transparent');
    expect(districtShape.fillColor).toBe('transparent');
    expect(townShape.strokeColor).toBe('#F59E0BB3');
    expect(districtShape.strokeColor).toBe('#F59E0B59');
  });

  it('credits each source once however many of its outlines are drawn', () => {
    const outlines = [toPlaceOutline(wire())!, toPlaceOutline(wire({ areaId: 'a2', level: 'District' }))!];

    expect(outlineAttributions(outlines)).toEqual([OSM]);
    expect(outlineAttributions([])).toEqual([]);
  });
});

describe('which views ask for outlines', () => {
  it('asks for a town or a region, and not for a continent', () => {
    expect(wantsPlaceOutlines(viewportFromCenter(QUATRE_BORNES, 8))).toBe(true);
    expect(wantsPlaceOutlines(viewportFromCenter(QUATRE_BORNES, 150))).toBe(true);
    expect(wantsPlaceOutlines(viewportFromCenter(QUATRE_BORNES, 1_500))).toBe(false);
  });

  it('asks nothing for a view that is not anywhere yet', () => {
    expect(wantsPlaceOutlines(viewportFromCenter({ latitude: Number.NaN, longitude: Number.NaN }, 8))).toBe(false);
  });
});

describe('the outlines read', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
  });

  afterEach(() => mock.restore());

  it('sends the viewport as north, south, east, west and drops an outline it cannot credit', async () => {
    mock.onGet('/location/map/boundaries').reply(200, {
      data: {
        boundaries: [wire(), wire({ areaId: 'a9', boundary: { ...wire().boundary, attribution: null } })],
        attributions: [OSM],
        isComplete: true,
      },
    });

    const page = await fetchPlaceOutlines({ north: -20.23, south: -20.27, east: 57.5, west: 57.46 });

    expect(mock.history.get[0].params).toEqual({ bounds: '-20.2300,-20.2700,57.5000,57.4600' });
    expect(page.outlines.map((outline) => outline.areaId)).toEqual(['a1']);
    expect(page.isComplete).toBe(true);
  });

  it('is asked by the map only for a view that wants outlines', async () => {
    mock.onGet('/location/map/boundaries').reply(200, {
      data: { boundaries: [wire()], attributions: [OSM], isComplete: true },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const wide = renderHook(() => usePlaceOutlines(viewportFromCenter(QUATRE_BORNES, 1_500)), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(wide.result.current.isActive).toBe(false);
    expect(mock.history.get).toHaveLength(0);

    const town = renderHook(() => usePlaceOutlines(viewportFromCenter(QUATRE_BORNES, 8)), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(town.result.current.isActive).toBe(true);
    expect(mock.history.get).toHaveLength(1);
    expect(town.result.current.page?.outlines).toHaveLength(1);

    // Unmounted, not just cleared: a mounted observer holding fresh data keeps an
    // hour-long staleness timer, and a single-file Jest run waits on it forever.
    wide.unmount();
    town.unmount();
    queryClient.clear();
  });
});

describe('the credit on the map', () => {
  function renderBar(dataAttributions?: string[]) {
    return render(
      <ThemeProvider>
        <MapAttributionBar rendersRealGeography={false} dataAttributions={dataAttributions} />
      </ThemeProvider>
    );
  }

  it('is shown while an outline is drawn', () => {
    renderBar([OSM]);

    expect(screen.getByText(`Place outlines ${OSM}`)).toBeTruthy();
    // The renderer's own statement stays: the outlines do not make the background a real map.
    expect(screen.getByText(/Simplified map/)).toBeTruthy();
  });

  it('is not shown when nothing it credits is on the map', () => {
    renderBar([]);

    expect(screen.queryByText(/OpenStreetMap/)).toBeNull();
  });
});
