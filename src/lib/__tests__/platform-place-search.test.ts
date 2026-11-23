// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the platform place search, read as the route sends it
// (RMD-008)
//
// `GET /location/search` answers `{ term, results }`. The providers read it as
// a bare list, so `geocode`'s `.filter`/`.map` and `search`'s `.map` threw
// inside their own `try`, and every platform place search answered "Place
// search is unavailable right now". The tests in `maps-providers.test.ts`
// passed throughout, because the location mock served a bare list too.
//
// No screen asks this today — member place search moved to Google on 14 Oct
// 2026, and `place-search-is-global.test.ts` holds that — but these are the
// providers the registry hands out. The fixtures are typed as the wire types
// the providers read, which `backend-response-field-drift` checks against the
// contract, and they carry what the mock database never does: a town with no
// neighbourhood, and a country with no pin.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/transport/apiClient';
import {
  platformGeocodingProvider,
  platformPlacesProvider,
  type LocationReferenceWire,
  type LocationSearchWire,
} from '@/lib/maps/providers/platform-geocoding';

const NEIGHBOURHOOD: LocationReferenceWire = {
  countryCode: 'NG',
  countryName: 'Nigeria',
  flag: '🇳🇬',
  state: 'Lagos',
  cityName: 'Lagos',
  neighborhood: 'Yaba',
  street: null,
  latitude: 6.5095,
  longitude: 3.3711,
  displayName: 'Yaba, Lagos',
};

/** A town: no neighbourhood, and no state either. */
const TOWN: LocationReferenceWire = {
  countryCode: 'NG',
  countryName: 'Nigeria',
  flag: '🇳🇬',
  state: null,
  cityName: 'Ikeja',
  neighborhood: null,
  street: null,
  latitude: 6.6018,
  longitude: 3.3515,
  displayName: 'Ikeja',
};

/** A country, with no pin to place it by. */
const COUNTRY: LocationReferenceWire = {
  countryCode: 'NG',
  countryName: 'Nigeria',
  flag: '🇳🇬',
  state: null,
  cityName: null,
  neighborhood: null,
  street: null,
  latitude: null,
  longitude: null,
  displayName: 'Nigeria',
};

const GHANA: LocationReferenceWire = {
  countryCode: 'GH',
  countryName: 'Ghana',
  flag: '🇬🇭',
  state: 'Greater Accra',
  cityName: 'Accra',
  neighborhood: 'Osu',
  street: null,
  latitude: 5.556,
  longitude: -0.1826,
  displayName: 'Osu, Accra',
};

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  mock.onGet(/\/location\/search$/).reply((config) => {
    const term = String(config.params?.query ?? '');
    const answer: { data: LocationSearchWire } = {
      data: { term, results: [NEIGHBOURHOOD, TOWN, COUNTRY, GHANA] },
    };
    return [200, answer];
  });
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

describe('geocoding over GET /location/search — RMD-008', () => {
  it('reads the results out of the answer, and places every result that has a pin', async () => {
    const result = await platformGeocodingProvider.geocode('Lagos');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The country has no pin, so it is not offered as a coordinate.
    expect(result.value.map((hit) => hit.address.formatted)).toEqual(['Yaba, Lagos', 'Ikeja', 'Osu, Accra']);
    expect(result.value[0].coordinate).toMatchObject({ latitude: 6.5095, longitude: 3.3711 });
  });

  it('carries a town that has no neighbourhood without inventing one', async () => {
    const result = await platformGeocodingProvider.geocode('Ikeja');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const town = result.value.find((hit) => hit.address.formatted === 'Ikeja');
    expect(town?.address.city).toBe('Ikeja');
    expect(town?.address.neighborhood || undefined).toBeUndefined();
  });

  it('restricts by country', async () => {
    const result = await platformGeocodingProvider.geocode('Lagos', { countryCodes: ['GH'] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((hit) => hit.address.formatted)).toEqual(['Osu, Accra']);
  });
});

describe('place search over GET /location/search — RMD-008', () => {
  it('answers places rather than "unavailable", nearest first', async () => {
    const result = await platformPlacesProvider.search({
      query: 'Lagos',
      near: { latitude: 6.6, longitude: 3.35 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((place) => place.name)).toEqual(['Ikeja', 'Yaba, Lagos', 'Osu, Accra']);
  });
});
