/**
 * The Discover header — Android UAT, 3 Nov 2026.
 *
 * The header read "📍 Explore Grand Baie, Mauritius · Grand Baie ▾": the town
 * twice, with neither line allowed to shrink, so "Map View" was pushed against
 * the right edge of the screen. The place is now said once, on one line that
 * gives way before the Map View pill does.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DiscoverPlaceHeader } from '../explore/DiscoverPlaceHeader';
import type { PlatformLocation } from '@/store/location';

const HIDDEN = { includeHiddenElements: true } as const;

const GRAND_BAIE = {
  countryCode: 'MU',
  countryName: 'Mauritius',
  cityName: 'Grand Baie',
} as PlatformLocation;

function renderHeader(location: PlatformLocation, isMapView = false) {
  const onOpenPlace = jest.fn();
  const onToggleMap = jest.fn();
  render(
    <DiscoverPlaceHeader
      location={location}
      isMapView={isMapView}
      onOpenPlace={onOpenPlace}
      onToggleMap={onToggleMap}
    />,
  );
  return { onOpenPlace, onToggleMap };
}

describe('the Discover place header', () => {
  it('names the town once', () => {
    renderHeader(GRAND_BAIE);

    expect(screen.getAllByText(/Grand Baie/, HIDDEN)).toHaveLength(1);
    expect(screen.getByText('📍 Grand Baie, Mauritius', HIDDEN)).toBeTruthy();
  });

  it('keeps the place on one line, so it shrinks before Map View does', () => {
    renderHeader(GRAND_BAIE);

    const place = screen.getByText('📍 Grand Baie, Mauritius', HIDDEN);
    expect(place.props.numberOfLines).toBe(1);
    expect(screen.getByText('📍 Map View', HIDDEN)).toBeTruthy();
  });

  it('opens the place picker from the place, and switches the map from the pill', () => {
    const { onOpenPlace, onToggleMap } = renderHeader(GRAND_BAIE);

    fireEvent.press(screen.getByLabelText('Change place: Grand Baie, Mauritius'));
    fireEvent.press(screen.getByText('📍 Map View', HIDDEN));

    expect(onOpenPlace).toHaveBeenCalledTimes(1);
    expect(onToggleMap).toHaveBeenCalledTimes(1);
  });

  it('says List View while the map is showing', () => {
    renderHeader(GRAND_BAIE, true);

    expect(screen.getByText('🗺️ List View', HIDDEN)).toBeTruthy();
  });

  it('shows a country-precision place without an empty town', () => {
    renderHeader({ countryCode: 'MU', countryName: 'Mauritius', cityName: '' } as PlatformLocation);

    expect(screen.getByText('📍 Mauritius', HIDDEN)).toBeTruthy();
    expect(screen.getByText('▾', HIDDEN)).toBeTruthy();
  });
});
