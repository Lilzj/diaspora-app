// ─────────────────────────────────────────────────────────────────────────────
// Finding the place a search sentence names (owner, 5 Nov 2026)
//
// The platform is used everywhere, so a town is looked up in the world list
// (GeoNames, on the server) first, then in Google; a country is the whole
// country; "near me" is the member's own position, asked for when the app only
// knows their country. Nothing here guesses: a name that is no town is searched
// as words.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { readSearch } from '../search-intent';
import { closeness, resolveSearch, townRadiusKm, type SearchContext } from '../search-place';
import type { PlatformLocation } from '@/store/location';

let api: MockAdapter;
beforeEach(() => {
  api = new MockAdapter(apiClient);
});
afterEach(() => api.restore());

const MAURITIUS: PlatformLocation = {
  countryCode: 'MU',
  countryName: 'Mauritius',
  flag: '🇲🇺',
  cityName: '',
  neighborhood: '',
  latitude: -20.2,
  longitude: 57.5,
  precision: 'country',
};

const CUREPIPE: PlatformLocation = {
  ...MAURITIUS,
  cityName: 'Curepipe',
  latitude: -20.31,
  longitude: 57.52,
  precision: 'device',
};

function context(overrides: Partial<SearchContext> = {}): SearchContext {
  return {
    location: MAURITIUS,
    searchRadius: -2,
    detectLocation: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function worldList(towns: Record<string, { name: string; countryCode: string; latitude: number; longitude: number; population: number }>) {
  api.onGet('/location/towns/match').reply((config) => {
    const town = towns[String(config.params?.text)];
    return [200, { data: town ? { found: true, exact: true, ...town } : { found: false, exact: false } }];
  });
}

describe('resolveSearch: a named town', () => {
  it('is found in the world list, the member country asked first', async () => {
    worldList({ 'grand baie': { name: 'Grand Baie', countryCode: 'MU', latitude: -20.01, longitude: 57.58, population: 11_000 } });

    const search = await resolveSearch(readSearch('3-bedroom flat in Grand Baie'), context());

    expect(api.history.get[0].params).toEqual({ text: 'grand baie', countryCode: 'MU' });
    expect(search).toMatchObject({
      tab: 'Housing',
      words: '',
      minBedrooms: 3,
      homeTypes: ['apartment'],
      place: { kind: 'town', name: 'Grand Baie', countryCode: 'MU', latitude: -20.01, longitude: 57.58, radiusKm: 5, source: 'world-list' },
    });
    expect(api.history.post).toHaveLength(0);
  });

  it('tries the shorter names, and searches the words left over', async () => {
    worldList({ 'rose hill': { name: 'Rose Hill', countryCode: 'MU', latitude: -20.24, longitude: 57.47, population: 103_000 } });

    const search = await resolveSearch(readSearch('hair salon in Rose Hill market'), context());

    expect(api.history.get.map((call) => call.params.text)).toEqual(['rose hill market', 'rose hill']);
    expect(search).toMatchObject({ words: 'hair salon market', place: { kind: 'town', name: 'Rose Hill', radiusKm: 10 } });
  });

  it('asks Google when the world list has no such place, and keeps a close answer', async () => {
    worldList({});
    api.onPost('/location/places/autocomplete').reply(200, {
      data: {
        status: 'Success',
        attribution: 'Google Maps',
        suggestions: [{ placeId: 'g1', text: 'Trou aux Biches, Mauritius', mainText: 'Trou aux Biches', secondaryText: 'Mauritius' }],
      },
    });
    api.onPost('/location/places/details').reply(200, {
      data: { status: 'Success', place: { placeId: 'g1', latitude: -20.03, longitude: 57.54, name: 'Trou aux Biches', locality: 'Trou aux Biches', countryCode: 'MU' } },
    });

    const search = await resolveSearch(readSearch('villa in Trou aux Biches'), context());

    expect(JSON.parse(api.history.post[0].data)).toMatchObject({ input: 'trou aux biches', countryCodes: ['MU'], townsOnly: true });
    expect(search.place).toMatchObject({ kind: 'town', name: 'Trou aux Biches', countryCode: 'MU', latitude: -20.03, source: 'google' });
  });

  it("does not take Google's answer when it is another name", async () => {
    worldList({});
    api.onPost('/location/places/autocomplete').reply(200, {
      data: { status: 'Success', suggestions: [{ placeId: 'g9', text: 'Constantine, Algeria', mainText: 'Constantine' }] },
    });

    const search = await resolveSearch(readSearch('work in construction'), context());

    expect(search).toMatchObject({ tab: 'Jobs', words: 'construction', place: { kind: 'not-found', said: 'construction' } });
    expect(api.history.post.filter((call) => call.url === '/location/places/details')).toHaveLength(0);
  });

  it('treats a failed lookup as no town, never as an error', async () => {
    api.onGet('/location/towns/match').reply(500);
    api.onPost('/location/places/autocomplete').networkError();

    const search = await resolveSearch(readSearch('plumber in Flacq'), context());

    expect(search).toMatchObject({ words: 'plumber flacq', place: { kind: 'not-found', said: 'flacq' } });
  });
});

describe('resolveSearch: a country, and no place', () => {
  it('a country is the whole country, without asking the server', async () => {
    const search = await resolveSearch(readSearch('jobs in Nigeria'), context());

    expect(search.place).toEqual({ kind: 'country', countryCode: 'NG', name: 'Nigeria' });
    expect(api.history.get).toHaveLength(0);
  });

  it('knows the short names people use', async () => {
    expect((await resolveSearch(readSearch('jobs in the UK'), context())).place).toMatchObject({ kind: 'country', countryCode: 'GB' });
    expect((await resolveSearch(readSearch('housing in USA'), context())).place).toMatchObject({ kind: 'country', countryCode: 'US' });
  });

  it('a sentence with no place leaves the place to Discover', async () => {
    const search = await resolveSearch(readSearch('plumber'), context());

    expect(search).toMatchObject({ words: 'plumber', place: null });
    expect(api.history.get).toHaveLength(0);
  });
});

describe('resolveSearch: near me', () => {
  it("uses the member's position, at the distance they chose", async () => {
    const detectLocation = jest.fn();

    const search = await resolveSearch(
      readSearch('where to braid my hair near me'),
      context({ location: CUREPIPE, searchRadius: 10, detectLocation })
    );

    expect(detectLocation).not.toHaveBeenCalled();
    expect(search).toMatchObject({
      words: 'braid hair',
      place: { kind: 'near-me', name: 'Curepipe', countryCode: 'MU', latitude: -20.31, longitude: 57.52, radiusKm: 10 },
    });
  });

  it('asks the phone where it is when the app only knows the country', async () => {
    const detectLocation = jest.fn().mockResolvedValue(CUREPIPE);

    const search = await resolveSearch(readSearch('jobs near me'), context({ detectLocation }));

    expect(detectLocation).toHaveBeenCalledWith({ prompt: true });
    expect(search.place).toMatchObject({ kind: 'near-me', latitude: -20.31, radiusKm: 5 });
  });

  it('says so when the phone will not say', async () => {
    const search = await resolveSearch(readSearch('housing near me'), context());

    expect(search.place).toEqual({ kind: 'near-me-unknown' });
  });
});

describe('the rules underneath', () => {
  it("a bigger town is searched wider, at one of the radius control's own stops", () => {
    expect(townRadiusKm(null)).toBe(5);
    expect(townRadiusKm(11_000)).toBe(5);
    expect(townRadiusKm(150_000)).toBe(10);
    expect(townRadiusKm(1_200_000)).toBe(25);
    expect(townRadiusKm(9_000_000)).toBe(25);
  });

  it('compares names as the server does: accents, hyphens and a slip', () => {
    expect(closeness('mahebourg', 'Mahébourg')).toBe(1);
    expect(closeness('grand bay', 'Grand-Baie')).toBeGreaterThanOrEqual(0.8);
    expect(closeness('construction', 'Constantine')).toBeLessThan(0.8);
  });
});
