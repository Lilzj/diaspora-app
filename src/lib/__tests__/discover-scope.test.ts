/**
 * How far a Discover search reaches — 15 Sep 2026.
 *
 * "Country-wide" sent the national centroid as a point and searched one town;
 * "5 km" narrowed to the nearest town's area, which no home has. These pin the
 * three reaches and the names each route binds.
 */
import type { PlatformLocation } from '@/store/location';
import {
  describeDiscoverScope,
  guideScopeParams,
  housingScopeParams,
  jobScopeParams,
  marketplaceScopeParams,
  providerScopeParams,
  resolveDiscoverScope,
  tabSearchesByDistance,
} from '../discover-scope';

const MAURITIUS: PlatformLocation = {
  countryCode: 'MU',
  countryName: 'Mauritius',
  flag: '🇲🇺',
  cityName: '',
  neighborhood: '',
  // The national centroid: somewhere to centre a map, never a member.
  latitude: -20.2,
  longitude: 57.5,
  precision: 'country',
};

const ROSE_HILL: PlatformLocation = {
  ...MAURITIUS,
  cityName: 'Rose Hill',
  latitude: -20.241,
  longitude: 57.4769,
  precision: 'device',
};

describe('what the member asked for', () => {
  it('searches the whole country from a country-precision location, whatever radius is stored', () => {
    expect(resolveDiscoverScope(MAURITIUS, -2)).toEqual({ kind: 'country', countryCode: 'MU' });
    expect(resolveDiscoverScope(MAURITIUS, 5)).toEqual({ kind: 'country', countryCode: 'MU' });
    expect(resolveDiscoverScope(MAURITIUS, -1)).toEqual({ kind: 'country', countryCode: 'MU' });
  });

  it('searches by distance only from a real point', () => {
    expect(resolveDiscoverScope(ROSE_HILL, 5)).toEqual({
      kind: 'distance',
      countryCode: 'MU',
      cityName: 'Rose Hill',
      latitude: -20.241,
      longitude: 57.4769,
      radiusKm: 5,
    });
  });

  it('searches the town when asked for the town', () => {
    expect(resolveDiscoverScope(ROSE_HILL, -1)).toEqual({ kind: 'town', countryCode: 'MU', cityName: 'Rose Hill' });
  });

  it('searches the whole country when asked, even with a real point', () => {
    expect(resolveDiscoverScope(ROSE_HILL, -2)).toEqual({ kind: 'country', countryCode: 'MU' });
  });

  it('does not send a national centroid as a point to any tab', () => {
    const scope = resolveDiscoverScope(MAURITIUS, 5);
    for (const params of [housingScopeParams(scope), providerScopeParams(scope)]) {
      expect(params).not.toHaveProperty('latitude');
      expect(params).not.toHaveProperty('radiusKm');
    }
  });
});

describe('the names each route binds', () => {
  const distance = resolveDiscoverScope(ROSE_HILL, 5);
  const town = resolveDiscoverScope(ROSE_HILL, -1);
  const country = resolveDiscoverScope(ROSE_HILL, -2);

  it('homes: countryCode, city, latitude, longitude, radiusKm', () => {
    expect(housingScopeParams(distance)).toEqual({
      countryCode: 'MU',
      latitude: -20.241,
      longitude: 57.4769,
      radiusKm: 5,
    });
    expect(housingScopeParams(town)).toEqual({ countryCode: 'MU', city: 'Rose Hill' });
    expect(housingScopeParams(country)).toEqual({ countryCode: 'MU' });
  });

  it('services: countryCode, cityName, latitude, longitude, radiusKm', () => {
    expect(providerScopeParams(distance)).toMatchObject({ countryCode: 'MU', radiusKm: 5 });
    expect(providerScopeParams(town)).toEqual({ countryCode: 'MU', cityName: 'Rose Hill' });
    expect(providerScopeParams(country)).toEqual({ countryCode: 'MU' });
  });

  it('items and jobs have no position, so a distance is the town', () => {
    expect(marketplaceScopeParams(distance)).toEqual({ countryCode: 'MU', city: 'Rose Hill' });
    expect(marketplaceScopeParams(country)).toEqual({ countryCode: 'MU' });
    expect(jobScopeParams(distance)).toEqual({ country: 'MU', city: 'Rose Hill' });
    expect(jobScopeParams(country)).toEqual({ country: 'MU' });
  });

  it('guides are about a country', () => {
    expect(guideScopeParams(distance)).toEqual({ country: 'MU' });
  });
});

describe('what the member is told', () => {
  it('says which tabs measure distance', () => {
    expect(tabSearchesByDistance('Housing')).toBe(true);
    expect(tabSearchesByDistance('Providers')).toBe(true);
    expect(tabSearchesByDistance('Marketplace')).toBe(false);
    expect(tabSearchesByDistance('Jobs')).toBe(false);
  });

  it('describes each reach in the member’s terms', () => {
    const distance = resolveDiscoverScope(ROSE_HILL, 5);

    expect(describeDiscoverScope(distance, 'Housing', 'Mauritius')).toBe('Within 5 km of Rose Hill');
    expect(describeDiscoverScope(resolveDiscoverScope(ROSE_HILL, 0.5), 'Providers', 'Mauritius')).toBe('Within 500 m of Rose Hill');
    expect(describeDiscoverScope(distance, 'Marketplace', 'Mauritius')).toBe(
      'In Rose Hill · items are found by town, not distance'
    );
    expect(describeDiscoverScope(resolveDiscoverScope(ROSE_HILL, -1), 'Jobs', 'Mauritius')).toBe('In Rose Hill');
    expect(describeDiscoverScope(resolveDiscoverScope(MAURITIUS, -2), 'Housing', 'Mauritius')).toBe('Across Mauritius');
  });
});
