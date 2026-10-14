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
    expect(page).toMatchObject({ unavailable: false, attribution: 'Google Maps' });
    expect(page.towns[0]).toMatchObject({ cityName: 'Accra', placeId: 'g1' });
  });

  it('says when Google cannot search, and offers no other list', async () => {
    api.onPost('/location/places/autocomplete').reply(200, {
      data: { status: 'NotConfigured', provider: 'none', suggestions: [], attribution: null, message: null },
    });

    const page = await searchTowns('grand', 'MU', 'session-2');

    expect(page).toEqual({ towns: [], attribution: null, unavailable: true });
    // Global app: no fallback to a place list that only covers some countries.
    expect(api.history.get).toHaveLength(0);
  });

  it('looks a Google pick up for its coordinates and locality', async () => {
    api.onPost('/location/places/details').reply(200, {
      data: { status: 'Success', place: { placeId: 'g1', latitude: 5.6, longitude: -0.19, name: 'Accra', locality: 'Accra', formattedAddress: null, countryCode: 'GH', postalCode: null } },
    });

    const town = await resolveTown({ cityName: 'Accra', placeId: 'g1' }, 'session-1');

    expect(town).toMatchObject({ cityName: 'Accra', latitude: 5.6, longitude: -0.19 });
  });
});
