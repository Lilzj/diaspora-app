/**
 * The platform reverse geocode reads the record its route sends (RMD-009).
 *
 * `GET /location/reverse-geocode` answers `LocationReferenceResponse`, the record
 * the search's results are made of. It was read as the store's
 * `PlatformLocation`, which declares a `precision` no route sends; the drift
 * suite is what holds that. It goes through the search's mapper now.
 *
 * What it answers did not change, and these pin it: the place the route found,
 * and no answer for a place without a pin. The old read refused that one too,
 * but only by accident: a missing pin counted as 0°, 0° in the distance
 * arithmetic, which is open sea, more than 150 km from anyone on land. The
 * mapper refuses it because there is no distance to measure.
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/transport/apiClient';
import {
  platformGeocodingProvider,
  type LocationReferenceWire,
} from '@/lib/maps/providers/platform-geocoding';

const PECKHAM = { latitude: 51.4742, longitude: -0.0691 };

const NODE: LocationReferenceWire = {
  countryCode: 'GB',
  countryName: 'United Kingdom',
  flag: '🇬🇧',
  state: 'Greater London',
  cityName: 'London',
  neighborhood: 'Peckham',
  street: null,
  latitude: 51.4742,
  longitude: -0.0691,
  displayName: 'Peckham, London',
};

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => api.restore());

describe('the platform reverse geocode', () => {
  it('names the place the route found', async () => {
    api.onGet('/location/reverse-geocode').reply(200, { data: NODE });

    const result = await platformGeocodingProvider.reverseGeocode(PECKHAM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.address).toMatchObject({
      countryCode: 'GB',
      city: 'London',
      neighborhood: 'Peckham',
      formatted: 'Peckham, London',
    });
  });

  it('offers no place it cannot measure the distance to', async () => {
    api.onGet('/location/reverse-geocode').reply(200, { data: { ...NODE, latitude: null, longitude: null } });

    const result = await platformGeocodingProvider.reverseGeocode(PECKHAM);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not-found');
  });
});
