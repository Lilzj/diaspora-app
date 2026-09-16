/**
 * The places a member saves — 16 Sep 2026.
 *
 * Home, Work and School were an in-memory record with no persistence of any
 * kind: a saved Home was gone when the app restarted and had never existed on
 * another device. The maps register called server-side saved places a gap and
 * refused to build one, "a home address is the most sensitive field this
 * application would ever persist server-side" — but the routes were there all
 * along, under `/location/me/saved-locations/{label}` rather than the
 * `/location/saved-places` the register looked for.
 *
 * What the register was right about was the order: erasure and export first
 * (backend), then the save button. These tests cover the client half.
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  byLabel,
  DEFAULT_SAVED_LABELS,
  fetchSavedPlaces,
  removeSavedPlace,
  saveSavedPlace,
  toLocationBody,
  toPlatformLocation,
} from '../location/saved-places';
import type { PlatformLocation } from '@/store/location';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  mock.restore();
});

const PECKHAM = {
  countryCode: 'GB',
  countryName: 'United Kingdom',
  flag: '🇬🇧',
  state: 'Greater London',
  cityName: 'London',
  neighborhood: 'Peckham',
  latitude: 51.4742,
  longitude: -0.0691,
  displayName: 'Peckham, London',
};

function profile(places: unknown[]) {
  return { data: { savedLocations: places, recentLocations: [], travelMode: false } };
}

describe('reading the places a member saved', () => {
  it('reads them from the profile, which is the route that holds them', async () => {
    mock.onGet('/location/me/profile').reply(200, profile([
      { id: 'p1', label: 'Home', location: PECKHAM, savedAt: '2026-09-16T09:00:00Z' },
    ]));

    const places = await fetchSavedPlaces();

    expect(places).toHaveLength(1);
    expect(places[0].label).toBe('Home');
    expect(places[0].location.cityName).toBe('London');
    expect(places[0].location.latitude).toBeCloseTo(51.4742);
    expect(mock.history.get[0].url).toBe('/location/me/profile');
  });

  it('drops a row with no label rather than rendering a blank one', async () => {
    mock.onGet('/location/me/profile').reply(200, profile([
      { id: 'p1', label: '   ', location: PECKHAM },
      { id: 'p2', label: 'Work', location: PECKHAM },
    ]));

    expect((await fetchSavedPlaces()).map((place) => place.label)).toEqual(['Work']);
  });

  it('keeps a place the member saved without coordinates', async () => {
    mock.onGet('/location/me/profile').reply(200, profile([
      { id: 'p1', label: 'Home', location: { countryCode: 'MU', countryName: 'Mauritius', cityName: 'Rose Hill' } },
    ]));

    const place = (await fetchSavedPlaces())[0];

    expect(place.location.cityName).toBe('Rose Hill');
    expect(place.location.latitude).toBe(0);
  });

  it('raises rather than answering an empty list when the read fails', async () => {
    mock.onGet('/location/me/profile').reply(500, {});

    await expect(fetchSavedPlaces()).rejects.toBeTruthy();
  });
});

describe('saving and forgetting', () => {
  it('puts the label in the path, because saving Home twice is a move', async () => {
    mock.onPut('/location/me/saved-locations/Home').reply(200, {
      data: { id: 'p1', label: 'Home', location: PECKHAM, savedAt: '2026-09-16T09:00:00Z' },
    });

    const saved = await saveSavedPlace('Home', PECKHAM as PlatformLocation);

    expect(saved?.label).toBe('Home');
    expect(mock.history.put[0].url).toBe('/location/me/saved-locations/Home');
    expect(JSON.parse(mock.history.put[0].data)).toMatchObject({
      location: { countryCode: 'GB', cityName: 'London', neighborhood: 'Peckham' },
    });
  });

  it('sends no body at all to save where the member is, which is the server’s own behaviour', async () => {
    mock.onPut('/location/me/saved-locations/Work').reply(200, {
      data: { id: 'p2', label: 'Work', location: PECKHAM },
    });

    await saveSavedPlace('Work');

    expect(mock.history.put[0].data).toBeUndefined();
  });

  it('escapes a label a member chose, so "My place" reaches the right resource', async () => {
    mock.onPut(/\/location\/me\/saved-locations\/.+/).reply(200, {
      data: { id: 'p3', label: 'My place', location: PECKHAM },
    });

    await saveSavedPlace('My place', PECKHAM as PlatformLocation);

    expect(mock.history.put[0].url).toBe('/location/me/saved-locations/My%20place');
  });

  it('forgets one by label', async () => {
    mock.onDelete('/location/me/saved-locations/School').reply(200, { data: null });

    await removeSavedPlace('School');

    expect(mock.history.delete[0].url).toBe('/location/me/saved-locations/School');
  });

  it('raises rather than reporting a save that did not happen', async () => {
    mock.onPut(/saved-locations/).reply(500, {});

    await expect(saveSavedPlace('Home', PECKHAM as PlatformLocation)).rejects.toBeTruthy();
  });
});

describe('the shapes between the store and the wire', () => {
  it('sends only what the route binds, and leaves out what the member never gave', () => {
    expect(toLocationBody({ ...PECKHAM, state: undefined, street: undefined } as PlatformLocation)).toEqual({
      countryCode: 'GB',
      countryName: 'United Kingdom',
      cityName: 'London',
      neighborhood: 'Peckham',
      latitude: 51.4742,
      longitude: -0.0691,
      displayName: 'Peckham, London',
    });
  });

  it('reads a neighbourhood from the area name where the wire used that spelling', () => {
    expect(toPlatformLocation({ countryCode: 'MU', areaName: 'Rose Hill Central' }).neighborhood).toBe(
      'Rose Hill Central'
    );
  });

  it('keys rows case-insensitively, as the server treats a label', () => {
    const index = byLabel([
      { id: '1', label: 'home', location: PECKHAM as PlatformLocation, savedAt: null },
    ]);

    expect(index.home).toBeTruthy();
    expect(DEFAULT_SAVED_LABELS.map((label) => index[label.toLowerCase()] ?? null)).toEqual([
      index.home,
      null,
      null,
    ]);
  });
});

describe('where it is used', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const selector = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'GlobalLocationSelector.tsx'),
    'utf8'
  );

  it('reads and writes the profile rather than a store that forgets', () => {
    expect(selector).toContain('useSavedPlaces(');
    expect(selector).toContain('useSavePlace(');
    expect(selector).not.toMatch(/store\.savedLocations|store\.saveLocation|store\.removeSavedLocation/);
  });

  it('does not read a failed read as "Not configured"', () => {
    expect(selector).toContain('savedPlaces.isError');
    expect(selector).toMatch(/could not read your saved places/);
  });
});
