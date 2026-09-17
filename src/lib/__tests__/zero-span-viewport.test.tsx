// ─────────────────────────────────────────────────────────────────────────────
// A map with no size — 17 Sep 2026
//
// The map session opened on `viewportFromCenter({0, 0}, 0)`, which its comment
// called "the whole world" and which is zero wide. The discovery map re-centred
// it and never sized it, so every projection through it divided by zero. Pins
// projected to Infinity were quietly treated as off screen; the first place
// outline projected to Infinity was written into SVG path text, which Android
// parses natively, and the app died on open.
//
// Held here: a zero span is not a placed viewport or box, the map opens sized,
// and the schematic renderer never writes a non-finite number into a shape.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { CanvasMapSurface, pathData } from '@/lib/maps/providers/canvas-map';
import {
  isPlacedBounds,
  isPlacedViewport,
  openingViewport,
  viewportFromCenter,
  viewportToBounds,
} from '@/lib/maps/geo';
import { DEFAULT_VIEWPORT } from '@/store/map-session';
import type { MapViewport } from '@/types/maps';

const QUATRE_BORNES = { latitude: -20.2644, longitude: 57.4786 };

const OUTLINE = {
  id: 'outline:qb',
  path: [
    { latitude: -20.24, longitude: 57.44 },
    { latitude: -20.24, longitude: 57.52 },
    { latitude: -20.31, longitude: 57.52 },
    { latitude: -20.31, longitude: 57.44 },
  ],
  fillColor: 'transparent',
  strokeColor: '#F59E0BB3',
};

describe('a viewport with no span', () => {
  it('is what the map session opens on, and is not placed', () => {
    expect(DEFAULT_VIEWPORT.latitudeDelta).toBe(0);
    expect(isPlacedViewport(DEFAULT_VIEWPORT)).toBe(false);
    expect(isPlacedBounds(viewportToBounds(DEFAULT_VIEWPORT))).toBe(false);
  });

  it('stays unplaced when only its centre is moved', () => {
    expect(isPlacedViewport({ ...DEFAULT_VIEWPORT, center: QUATRE_BORNES })).toBe(false);
  });
});

describe('the viewport a map opens on', () => {
  it('is built around the place, at the given zoom, when the map holds no size', () => {
    const opened = openingViewport(DEFAULT_VIEWPORT, QUATRE_BORNES, 8)!;

    expect(isPlacedViewport(opened)).toBe(true);
    expect(opened.center).toEqual(QUATRE_BORNES);
    expect(opened).toEqual(viewportFromCenter(QUATRE_BORNES, 8));
  });

  it('keeps a zoom the member already chose, moving only to a new place', () => {
    const zoomedIn = viewportFromCenter({ latitude: -20.1609, longitude: 57.5012 }, 1);
    const opened = openingViewport(zoomedIn, QUATRE_BORNES, 8)!;

    expect(opened.center).toEqual(QUATRE_BORNES);
    expect(opened.latitudeDelta).toBe(zoomedIn.latitudeDelta);
  });

  it('is the same object when nothing moved, so the screen does not re-render for nothing', () => {
    const here = viewportFromCenter(QUATRE_BORNES, 8);

    expect(openingViewport(here, QUATRE_BORNES, 250)).toBe(here);
  });

  it('is not built around nowhere', () => {
    expect(openingViewport(DEFAULT_VIEWPORT, { latitude: Number.NaN, longitude: Number.NaN }, 8)).toBeNull();
  });
});

describe('the schematic renderer', () => {
  it('writes no path text for a point that is not a finite number', () => {
    expect(pathData([{ x: 1, y: 2 }, { x: Infinity, y: -Infinity }], true)).toBeNull();
    expect(pathData([{ x: Number.NaN, y: 2 }], false)).toBeNull();
    expect(pathData([], true)).toBeNull();
    expect(pathData([{ x: 1, y: 2 }, { x: 3, y: 4 }], true)).toBe('M 1,2 L 3,4 Z');
  });

  function renderMap(viewport: MapViewport) {
    const result = render(
      <ThemeProvider>
        <CanvasMapSurface
          viewport={viewport}
          markers={[]}
          clusters={[]}
          polygons={[OUTLINE]}
          onViewportChange={() => undefined}
        />
      </ThemeProvider>
    );

    fireEvent(screen.getByTestId('canvas-map-surface'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 600, x: 0, y: 0 } },
    });

    return result;
  }

  function drawnPaths(root: ReturnType<typeof render>['UNSAFE_root']): string[] {
    return root
      .findAll((node) => typeof node.props?.d === 'string')
      .map((node) => node.props.d as string);
  }

  it('draws an outline through a sized view with finite numbers only', () => {
    const { UNSAFE_root } = renderMap(viewportFromCenter(QUATRE_BORNES, 8));

    const paths = drawnPaths(UNSAFE_root);
    expect(paths.some((d) => d.startsWith('M '))).toBe(true);
    expect(paths.join(' ')).not.toMatch(/Infinity|NaN/);
  });

  it('draws nothing it cannot project through the zero-span placeholder, instead of crashing', () => {
    const { UNSAFE_root } = renderMap({ ...DEFAULT_VIEWPORT, center: QUATRE_BORNES });

    expect(drawnPaths(UNSAFE_root).join(' ')).not.toMatch(/Infinity|NaN/);
  });

  it('draws nothing at all for a view that is not anywhere', () => {
    const { UNSAFE_root } = renderMap({
      center: { latitude: Number.NaN, longitude: Number.NaN },
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    });

    expect(drawnPaths(UNSAFE_root).join(' ')).not.toMatch(/Infinity|NaN/);
  });
});
