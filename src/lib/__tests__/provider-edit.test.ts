// Editing a business after registering it (14 Oct 2026): each part goes to the
// route that owns it, and the replace-style identity PUT is sent whole.

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  removeProviderPhoto,
  removeProviderService,
  updateProviderDetails,
  updateProviderIdentity,
  updateProviderService,
} from '../provider-registration-api';

const ID = '01a13811-a1d9-7b6a-8a42-7a6ca85058a9';
let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});
afterEach(() => mock.restore());

describe('editing a business', () => {
  it('sends only what changed to the details route', async () => {
    mock.onPatch(`/providers/${ID}/details`).reply(200, { data: {} });

    await updateProviderDetails(ID, { cityName: 'Grand Baie', phone: '' });

    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ cityName: 'Grand Baie', phone: '' });
  });

  it('sends the whole identity, because that PUT replaces', async () => {
    mock.onPut(`/providers/${ID}`).reply(200, { data: {} });

    await updateProviderIdentity(ID, {
      name: 'Josh Kitchen',
      providerType: 'Business',
      category: 'food-restaurants',
      deliveryMode: 'OnSite',
      tags: ['catering'],
    });

    expect(Object.keys(JSON.parse(mock.history.put[0].data)).sort()).toEqual(
      ['category', 'deliveryMode', 'name', 'providerType', 'tags']
    );
  });

  it('removes photos and menu items, and reprices one, on their own routes', async () => {
    mock.onDelete(`/providers/${ID}/photos/m1`).reply(200, { data: {} });
    mock.onDelete(`/providers/${ID}/services/s1`).reply(200, { data: {} });
    mock.onPut(`/providers/${ID}/services/s2`).reply(200, { data: {} });

    await removeProviderPhoto(ID, 'm1');
    await removeProviderService(ID, 's1');
    await updateProviderService(ID, 's2', {
      name: 'Jollof rice',
      pricing: { model: 'Fixed', minAmount: 350, currency: 'MUR' },
    });

    expect(mock.history.delete.map((call) => call.url)).toEqual([
      `/providers/${ID}/photos/m1`,
      `/providers/${ID}/services/s1`,
    ]);
    expect(JSON.parse(mock.history.put[0].data).pricing.minAmount).toBe(350);
  });
});
