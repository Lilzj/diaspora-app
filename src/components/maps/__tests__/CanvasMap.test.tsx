// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the schematic map surface (Frontend Phase 8, §7, §9)
//
// `CanvasMapSurface` is the renderer this build actually ships
// (MAP-PROVIDER-GAP-001), so its correctness is not a detail.
//
// The gesture *arithmetic* is tested directly, as pure functions. Driving
// `PanResponder` itself under Jest means synthesising the touch history React
// Native's responder system owns, which tests the framework rather than this
// component — so `canvas-map.tsx` exports `panViewport`, `pinchViewport` and
// `screenToCoordinate`, and the responder is a thin caller of them.
//
// That arithmetic is where a map silently drifts: a sign error moves the camera
// the wrong way, and using the longitude span for a vertical pan is wrong by
// ~60% in London and correct at the equator. Neither throws.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import {
  CanvasMapSurface,
  canvasMapProvider,
  panViewport,
  pinchViewport,
  screenToCoordinate,
} from '@/lib/maps/providers/canvas-map';
import { DiasporaMap } from '@/components/maps';
import { viewportFromCenter } from '@/lib/maps/geo';
import type { MapMarker, MapViewport } from '@/types/maps';

const CENTRE = { latitude: 51.4742, longitude: -0.0691 };
const VIEWPORT: MapViewport = viewportFromCenter(CENTRE, 3);

const WIDTH = 390;
const HEIGHT = 600;
const SIZE = { width: WIDTH, height: HEIGHT };

function marker(id: string, latitude: number, longitude: number): MapMarker {
  return {
    id,
    category: 'housing',
    coordinate: { latitude, longitude },
    title: `Result ${id}`,
    accessibilityLabel: `Result ${id}, 400 metres away`,
    source: 'backend',
  };
}

function renderSurface(node: React.ReactElement) {
  const result = render(<ThemeProvider>{node}</ThemeProvider>);
  // The surface renders nothing until it has been measured — every projection
  // depends on the layout width.
  fireEvent(screen.getByTestId('canvas-map-surface'), 'layout', {
    nativeEvent: { layout: { width: WIDTH, height: HEIGHT, x: 0, y: 0 } },
  });
  return result;
}

describe('the descriptor is honest about what the renderer is', () => {
  it('says it draws no real geography, but that its data is not simulated', () => {
    // The distinction matters: flagging it as simulated would wrongly imply the
    // *results* on it are invented, when only the cartography is absent.
    expect(canvasMapProvider.descriptor.isSimulated).toBe(false);
    expect(canvasMapProvider.rendersRealGeography).toBe(false);
    expect(canvasMapProvider.descriptor.gapKey).toBe('tileMap');
    expect(canvasMapProvider.attribution).toBe('');
  });
});

describe('rendering', () => {
  it('summarises what is on it for a screen reader, and points at the list — §50', () => {
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[marker('a', 51.4742, -0.0691), marker('b', 51.475, -0.07)]}
        clusters={[]}
      />
    );

    const label = screen.getByTestId('canvas-map-surface').props.accessibilityLabel as string;
    expect(label).toContain('2 result');
    expect(label).toContain('list view');
  });

  it('draws markers inside the viewport and skips ones far outside it', () => {
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[marker('near', 51.4742, -0.0691), marker('far', -20.2417, 57.4806)]}
        clusters={[]}
      />
    );

    expect(screen.getByTestId('marker-near')).toBeTruthy();
    // Culled rather than clamped to the edge — a pin pinned to the border is a
    // pin in the wrong place.
    expect(screen.queryByTestId('marker-far')).toBeNull();
  });

  it('exposes each marker as a button carrying its own label', () => {
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[marker('a', 51.4742, -0.0691)]}
        clusters={[]}
      />
    );

    const pin = screen.getByTestId('marker-a');
    expect(pin.props.accessibilityRole).toBe('button');
    expect(pin.props.accessibilityLabel).toBe('Result a, 400 metres away');
  });

  it('marks the selected pin as selected', () => {
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[marker('a', 51.4742, -0.0691)]}
        clusters={[]}
        selectedMarkerId="a"
      />
    );
    expect(screen.getByTestId('marker-a').props.accessibilityState.selected).toBe(true);
  });

  it('renders a cluster with the label the clusterer wrote', () => {
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[]}
        clusters={[
          {
            id: 'c1',
            coordinate: CENTRE,
            count: 12,
            bounds: { north: 51.48, south: 51.47, east: -0.06, west: -0.07 },
            breakdown: { housing: 12 },
            memberIds: [],
            accessibilityLabel: '12 homes grouped together. Activate to zoom in.',
          },
        ]}
      />
    );

    expect(screen.getByTestId('cluster-c1').props.accessibilityLabel).toBe(
      '12 homes grouped together. Activate to zoom in.'
    );
  });
});

describe('interaction', () => {
  it('reports a marker press', () => {
    const onMarkerPress = jest.fn();
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[marker('a', 51.4742, -0.0691)]}
        clusters={[]}
        onMarkerPress={onMarkerPress}
      />
    );

    fireEvent(screen.getByTestId('marker-a'), 'responderRelease');
    expect(onMarkerPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('reports a cluster press', () => {
    const onClusterPress = jest.fn();
    renderSurface(
      <CanvasMapSurface
        viewport={VIEWPORT}
        markers={[]}
        clusters={[
          {
            id: 'c1',
            coordinate: CENTRE,
            count: 5,
            bounds: { north: 51.48, south: 51.47, east: -0.06, west: -0.07 },
            breakdown: { housing: 5 },
            memberIds: [],
            accessibilityLabel: '5 homes grouped together.',
          },
        ]}
        onClusterPress={onClusterPress}
      />
    );

    fireEvent(screen.getByTestId('cluster-c1'), 'responderRelease');
    expect(onClusterPress).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE ARITHMETIC
// ═════════════════════════════════════════════════════════════════════════════

describe('pan arithmetic — the part that drifts silently', () => {
  it('moves the camera opposite to the drag, on both axes', () => {
    // Dragging the map right-and-down moves the camera west and north, the way
    // a paper map behaves under a finger. A sign error here is invisible except
    // to somebody using it.
    const next = panViewport(VIEWPORT, 100, 60, SIZE);

    expect(next.center.longitude).toBeLessThan(CENTRE.longitude);
    expect(next.center.latitude).toBeGreaterThan(CENTRE.latitude);
  });

  it('moves by the number of degrees the viewport span implies', () => {
    const next = panViewport(VIEWPORT, WIDTH / 2, 0, SIZE);
    expect(CENTRE.longitude - next.center.longitude).toBeCloseTo(VIEWPORT.longitudeDelta / 2, 6);
  });

  it('scales vertical movement by the latitude span, not the longitude one', () => {
    // The two spans differ by `cos(latitude)`. Using the wrong one makes
    // vertical panning wrong by ~60% in London and correct at the equator —
    // exactly the kind of bug that ships.
    const next = panViewport(VIEWPORT, 0, HEIGHT / 2, SIZE);
    expect(next.center.latitude - CENTRE.latitude).toBeCloseTo(VIEWPORT.latitudeDelta / 2, 6);
  });

  it('is a no-op for a zero drag', () => {
    const next = panViewport(VIEWPORT, 0, 0, SIZE);
    expect(next.center.latitude).toBeCloseTo(CENTRE.latitude, 10);
    expect(next.center.longitude).toBeCloseTo(CENTRE.longitude, 10);
  });

  it('stops at the poles rather than wrapping to the other hemisphere', () => {
    const northern: MapViewport = { ...VIEWPORT, center: { latitude: 84, longitude: 0 } };
    const next = panViewport(northern, 0, HEIGHT * 40, SIZE);

    expect(next.center.latitude).toBeLessThanOrEqual(85);
    expect(next.center.latitude).toBeGreaterThan(0);
  });

  it('wraps longitude across the antimeridian rather than clamping it', () => {
    // Longitude is a circle and latitude is not, so they are treated
    // differently on purpose.
    const pacific: MapViewport = { ...VIEWPORT, center: { latitude: 0, longitude: 179.9 } };
    const next = panViewport(pacific, -WIDTH * 2, 0, SIZE);

    expect(next.center.longitude).toBeGreaterThanOrEqual(-180);
    expect(next.center.longitude).toBeLessThanOrEqual(180);
  });

  it('survives a zero-sized layout without dividing by zero', () => {
    const next = panViewport(VIEWPORT, 50, 50, { width: 0, height: 0 });
    expect(Number.isFinite(next.center.latitude)).toBe(true);
    expect(Number.isFinite(next.center.longitude)).toBe(true);
  });
});

describe('pinch arithmetic', () => {
  it('narrows the span when the fingers spread', () => {
    const next = pinchViewport(VIEWPORT, 2);
    expect(next.latitudeDelta).toBeCloseTo(VIEWPORT.latitudeDelta / 2, 8);
    expect(next.longitudeDelta).toBeCloseTo(VIEWPORT.longitudeDelta / 2, 8);
  });

  it('widens the span when the fingers close', () => {
    const next = pinchViewport(VIEWPORT, 0.5);
    expect(next.latitudeDelta).toBeGreaterThan(VIEWPORT.latitudeDelta);
  });

  it('clamps rather than collapsing to zero or expanding past the globe', () => {
    expect(pinchViewport(VIEWPORT, 1e9).latitudeDelta).toBeGreaterThan(0);
    expect(pinchViewport(VIEWPORT, 1e-9).longitudeDelta).toBeLessThanOrEqual(360);
  });
});

describe('screen-to-coordinate', () => {
  it('maps the centre of the view to the centre of the viewport', () => {
    const coordinate = screenToCoordinate(VIEWPORT, WIDTH / 2, HEIGHT / 2, SIZE);
    expect(coordinate.latitude).toBeCloseTo(CENTRE.latitude, 8);
    expect(coordinate.longitude).toBeCloseTo(CENTRE.longitude, 8);
  });

  it('maps upward on screen to northward on the map', () => {
    // Screen y grows downwards and latitude grows upwards, which is the one
    // inversion every projection gets wrong once.
    const above = screenToCoordinate(VIEWPORT, WIDTH / 2, HEIGHT / 4, SIZE);
    expect(above.latitude).toBeGreaterThan(CENTRE.latitude);
  });

  it('maps rightward on screen to eastward on the map', () => {
    const right = screenToCoordinate(VIEWPORT, (WIDTH * 3) / 4, HEIGHT / 2, SIZE);
    expect(right.longitude).toBeGreaterThan(CENTRE.longitude);
  });
});

describe('DiasporaMap composes the surface with clustering and controls', () => {
  function renderMap(props: Partial<React.ComponentProps<typeof DiasporaMap>> = {}) {
    const result = render(
      <ThemeProvider>
        <DiasporaMap
          viewport={VIEWPORT}
          onViewportChange={jest.fn()}
          markers={[]}
          {...props}
        />
      </ThemeProvider>
    );

    fireEvent(screen.getByTestId('canvas-map-surface'), 'layout', {
      nativeEvent: { layout: { width: WIDTH, height: HEIGHT, x: 0, y: 0 } },
    });

    return result;
  }

  it('clusters coincident markers before handing them to the renderer — §9', () => {
    const markers = Array.from({ length: 12 }, (_, i) =>
      marker(`m${i}`, CENTRE.latitude + i * 0.00001, CENTRE.longitude)
    );

    renderMap({ markers });

    // Twelve pins became one cluster, and the summary still reports twelve.
    const label = screen.getByTestId('canvas-map-surface').props.accessibilityLabel as string;
    expect(label).toContain('12 result');
    expect(screen.queryByTestId('marker-m0')).toBeNull();
  });

  it('states on its face that the background is a diagram', () => {
    // Somebody looking at a grid needs to be told it is a grid.
    renderMap();
    expect(screen.getByTestId('map-attribution')).toBeTruthy();
  });

  it('offers zoom controls with real labels', () => {
    renderMap();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
  });

  it('zooms in by halving the span', () => {
    const onViewportChange = jest.fn();
    renderMap({ onViewportChange });

    fireEvent.press(screen.getByLabelText('Zoom in'));

    const next = onViewportChange.mock.calls.at(-1)![0] as MapViewport;
    expect(next.latitudeDelta).toBeCloseTo(VIEWPORT.latitudeDelta / 2, 6);
  });

  it('zooms out by doubling it', () => {
    const onViewportChange = jest.fn();
    renderMap({ onViewportChange });

    fireEvent.press(screen.getByLabelText('Zoom out'));

    const next = onViewportChange.mock.calls.at(-1)![0] as MapViewport;
    expect(next.latitudeDelta).toBeCloseTo(VIEWPORT.latitudeDelta * 2, 6);
  });

  it('hides the recentre control when there is no position to centre on', () => {
    renderMap();
    expect(screen.queryByLabelText('Centre the map on your position')).toBeNull();
  });

  it('offers recentre once a position is known, and follows on activation', () => {
    const onFollowUserChange = jest.fn();
    const onViewportChange = jest.fn();

    renderMap({
      userLocation: { coordinate: CENTRE, timestamp: Date.now(), source: 'simulated' },
      onFollowUserChange,
      onViewportChange,
    });

    fireEvent.press(screen.getByLabelText('Centre the map on your position'));
    expect(onFollowUserChange).toHaveBeenCalledWith(true);
  });

  it('releases follow mode when the control is pressed again', () => {
    const onFollowUserChange = jest.fn();

    renderMap({
      userLocation: { coordinate: CENTRE, timestamp: Date.now(), source: 'simulated' },
      followUser: true,
      onFollowUserChange,
    });

    fireEvent.press(screen.getByLabelText('Stop following your position'));
    expect(onFollowUserChange).toHaveBeenCalledWith(false);
  });

  it('says the map is empty rather than saying nothing — §54', () => {
    renderMap({ markers: [] });
    const label = screen.getByTestId('canvas-map-surface').props.accessibilityLabel as string;
    expect(label).toContain('no results');
    expect(label).toContain('change your filters');
  });
});
