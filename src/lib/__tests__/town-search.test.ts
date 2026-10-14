// The shared town search (14 Oct 2026): Google first, for any country; the
// place catalogue when Google cannot answer.

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { resolveTown, searchTowns } from '../town-search';

let api: MockAdapter;
beforeEach(() => {
  api = new MockAdapter(apiClient);
});
afterEach(() => api.restore());

describe('searchTowns', () => {
  it('asks Google for towns in the member country, and credits it', async () => {
    api.onPost('/location/places/autocomplete').reply(200, {
      data: {
        status: 'Success',
        provider: 'google',
        attribution: 'Google Maps',
        message: null,
        suggestions: [{ placeId: 'g1', text: 'Accra, Ghana', mainText: 'Accra', secondaryText: 'Ghana', types: ['locality'] }],
      },
    });

    const page = await searchTowns('Accr', 'GH', 'session-1');

    expect(JSON.parse(api.history.post[0].data)).toMatchObject({ input: 'Accr', countryCodes: ['GH'], townsOnly: true });
    expect(page).toMatchObject({ source: 'google', attribution: 'Google Maps' });
    expect(page.towns[0]).toMatchObject({ cityName: 'Accra', placeId: 'g1' });
  });

  it('falls back to the place catalogue when Google is not available', async () => {
    api.onPost('/location/places/autocomplete').reply(200, {
      data: { status: 'NotConfigured', provider: 'none', suggestions: [], attribution: null, message: null },
    });
    api.onGet('/location/search').reply(200, {
      data: { term: 'grand', results: [{ cityName: 'Grand Baie', displayName: 'Grand Baie, Riviere du Rempart', cityId: 'a1', latitude: -20.0, longitude: 57.5 }] },
    });

    const page = await searchTowns('grand', 'MU', 'session-2');

    expect(page.source).toBe('catalogue');
    expect(page.towns).toEqual([
      expect.objectContaining({ cityName: 'Grand Baie', context: 'Riviere du Rempart', areaId: 'a1' }),
    ]);
  });

  it('looks a Google pick up for its coordinates and locality', async () => {
    api.onPost('/location/places/details').reply(200, {
      data: { status: 'Success', place: { placeId: 'g1', latitude: 5.6, longitude: -0.19, name: 'Accra', locality: 'Accra', formattedAddress: null, countryCode: 'GH', postalCode: null } },
    });

    const town = await resolveTown({ cityName: 'Accra', placeId: 'g1' }, 'session-1');

    expect(town).toMatchObject({ cityName: 'Accra', latitude: 5.6, longitude: -0.19 });
  });
});
