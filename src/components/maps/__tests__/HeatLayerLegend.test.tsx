// ─────────────────────────────────────────────────────────────────────────────
// The heat legend and picker against the served layer (20 Oct 2026)
//
// The legend is the only place a member learns what the squares mean, so what
// it must say is pinned here: withheld squares are named as withheld (not zero),
// an unavailable source shows the server's reason instead of a gradient, a rent
// layer's values carry the server's currency, the police source carries its
// licence credit, and the time window shown is the one the server applied.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { HeatMapLegend, LayerPicker, heatUnavailableCopy } from '@/components/maps';
import { heatLayerDefinition, type CertifiedHeatLayer } from '@/lib/maps/geo-client';

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const POLICE_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0.';

function layer(overrides: Partial<CertifiedHeatLayer> = {}): CertifiedHeatLayer {
  return {
    layer: heatLayerDefinition('housing-price'),
    points: [
      {
        coordinate: { latitude: 51.505, longitude: -0.095 },
        intensity: 1,
        rawValue: 1850,
        cellBounds: { north: 51.51, south: 51.5, east: -0.09, west: -0.1 },
      },
    ],
    scale: 'relative-to-viewport',
    minValue: 1200,
    maxValue: 1850,
    freshness: { computedAt: '2026-10-20T09:00:00Z', sourceName: 'Diaspora listings' },
    bounds: { north: 51.55, south: 51.45, east: -0.05, west: -0.15 },
    unit: 'median monthly asking rent',
    source: 'listings',
    suppressedCells: 2,
    minimumCellCount: 5,
    withheldCells: [
      {
        cellKey: 'a',
        cellBounds: { north: 51.49, south: 51.48, east: -0.08, west: -0.09 },
        reason: 'TooFewHomes',
        detail: 'Fewer than 5 homes to rent in this cell. Withheld is not zero.',
      },
      {
        cellKey: 'b',
        cellBounds: { north: 51.48, south: 51.47, east: -0.08, west: -0.09 },
        reason: 'TooFewHomes',
        detail: 'Fewer than 5 homes to rent in this cell. Withheld is not zero.',
      },
    ],
    isAvailable: true,
    unavailableReason: null,
    currency: 'GBP',
    timeRange: '30d',
    timeBasis: 'published',
    from: null,
    to: null,
    licence: null,
    attribution: null,
    cellSizeDegrees: 0.01,
    truncated: false,
    ...overrides,
  };
}

describe('the heat legend', () => {
  it('names withheld squares as withheld, not as empty or zero', () => {
    renderWithTheme(<HeatMapLegend data={layer()} requestedTimeRange="30d" countryCode="GB" />);

    expect(screen.getByTestId('heat-legend-withheld')).toBeTruthy();
    expect(screen.getByText('Withheld (2): too few to show. Not zero.')).toBeTruthy();
    const label = screen.getByTestId('heat-map-legend').props.accessibilityLabel as string;
    expect(label).toContain('2 squares withheld');
  });

  it('shows rent values in the currency the server sent, and the country compared within', () => {
    renderWithTheme(<HeatMapLegend data={layer()} requestedTimeRange="30d" countryCode="GB" />);

    expect(screen.getByTestId('heat-legend-min').props.children).toBe('GBP 1,200');
    expect(screen.getByTestId('heat-legend-max').props.children).toBe('GBP 1,850');
    expect(screen.getByText('Median monthly asking rent, in GBP.')).toBeTruthy();
    expect(screen.getByText('Compared within GB.')).toBeTruthy();
  });

  it('states the window the server applied, and says so when it applied none', () => {
    const { unmount } = renderWithTheme(<HeatMapLegend data={layer()} requestedTimeRange="30d" />);
    expect(screen.getByTestId('heat-legend-window').props.children).toBe(
      'Published in the last 30 days.'
    );
    unmount();

    renderWithTheme(<HeatMapLegend data={layer({ timeRange: null })} requestedTimeRange="7d" />);
    expect(screen.getByTestId('heat-legend-window').props.children).toMatch(
      /not narrowed to a time range/
    );
  });

  it('shows the server reason instead of a gradient when the source could not answer', () => {
    renderWithTheme(
      <HeatMapLegend
        data={layer({
          layer: heatLayerDefinition('safety'),
          points: [],
          withheldCells: [],
          isAvailable: false,
          unavailableReason: 'NoCoverage',
          currency: null,
          licence: 'OGL-UK-3.0',
          attribution: POLICE_ATTRIBUTION,
          freshness: { computedAt: '2026-10-20T09:00:00Z', sourceName: 'data.police.uk' },
        })}
      />
    );

    expect(screen.getByTestId('heat-layer-unavailable')).toBeTruthy();
    expect(screen.getByText(heatUnavailableCopy('NoCoverage'))).toBeTruthy();
    expect(screen.queryByTestId('heat-legend-min')).toBeNull();
    expect(heatUnavailableCopy('NoCoverage')).toMatch(/not a count of zero/);
  });

  it('shows a code it does not know as the server wrote it, never drops it', () => {
    expect(heatUnavailableCopy('SomethingNew')).toContain('SomethingNew');
  });

  it('carries the data.police.uk licence credit while its data is drawn', () => {
    renderWithTheme(
      <HeatMapLegend
        data={layer({
          layer: heatLayerDefinition('safety'),
          currency: null,
          source: 'police-recorded-crime',
          timeBasis: 'month',
          licence: 'OGL-UK-3.0',
          attribution: POLICE_ATTRIBUTION,
          freshness: { computedAt: '2026-10-20T09:00:00Z', sourceName: 'data.police.uk' },
        })}
      />
    );

    expect(screen.getByTestId('heat-legend-credit').props.children).toBe(
      `data.police.uk · OGL-UK-3.0 · ${POLICE_ATTRIBUTION}`
    );
    expect(screen.getByTestId('heat-legend-window').props.children).toMatch(/Whole published months/);
  });

  it('labels no square with a place name', () => {
    renderWithTheme(<HeatMapLegend data={layer()} />);
    const label = screen.getByTestId('heat-map-legend').props.accessibilityLabel as string;
    expect(label).not.toMatch(/Area around|neighbourhood of/i);
  });
});

describe('the layer picker', () => {
  it('offers the safety source only while the safety layer is on', () => {
    const onSource = jest.fn();
    const { rerender } = renderWithTheme(
      <LayerPicker
        layers={['housing-price', 'cost-of-living', 'safety']}
        active="housing-price"
        onChange={jest.fn()}
        timeRange="30d"
        onTimeRangeChange={jest.fn()}
        safetySource="community-reports"
        onSafetySourceChange={onSource}
      />
    );

    expect(screen.getByTestId('layer-housing-price')).toBeTruthy();
    expect(screen.getByTestId('layer-cost-of-living')).toBeTruthy();
    expect(screen.getByTestId('time-range-24h')).toBeTruthy();
    expect(screen.queryByTestId('safety-source-picker')).toBeNull();

    rerender(
      <ThemeProvider>
        <LayerPicker
          layers={['housing-price', 'cost-of-living', 'safety']}
          active="safety"
          onChange={jest.fn()}
          timeRange="30d"
          onTimeRangeChange={jest.fn()}
          safetySource="community-reports"
          onSafetySourceChange={onSource}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByTestId('safety-source-community-reports').props.accessibilityState
    ).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('safety-source-police-recorded-crime'));
    expect(onSource).toHaveBeenCalledWith('police-recorded-crime');
  });
});
