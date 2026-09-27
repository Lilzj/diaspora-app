// ─────────────────────────────────────────────────────────────────────────────
// Street-address search sessions — 27 Sep 2026
//
// Google bills a run of keystrokes that ends in a pick more cheaply than the
// same keystrokes sent alone, and only when every request carries one token and
// the pick closes it. Reusing a closed token is billed as if there were none.
// So this pins the lifecycle at the network boundary: one token while typing,
// the same token on the pick, a new one afterwards, and nothing sent at all
// once the deployment says it has no address search.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { apiClient } from '@/lib/apiClient';
import { useAddressSearch } from '../address-search';

let mock: MockAdapter;

const suggestion = {
  placeId: 'ChIJ-place-one',
  text: 'Royal Road, Rose Hill, Mauritius',
  mainText: 'Royal Road',
  secondaryText: 'Rose Hill, Mauritius',
  types: ['route'],
};

function page(status = 'Success') {
  return {
    data: {
      status,
      provider: status === 'NotConfigured' ? 'none' : 'google',
      suggestions: status === 'Success' ? [suggestion] : [],
      attribution: status === 'Success' ? 'Google Maps' : null,
      message: status === 'Success' ? null : 'Street address search is not available on Diaspora yet.',
    },
  };
}

function bodies(path: string): Record<string, unknown>[] {
  return mock.history.post
    .filter((request) => request.url?.endsWith(path))
    .map((request) => JSON.parse(request.data as string));
}

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => mock.restore());

it('keeps one token while typing, closes it on the pick, and starts a new one after', async () => {
  mock.onPost(/places\/autocomplete$/).reply(200, page());
  mock.onPost(/places\/details$/).reply(200, {
    data: {
      status: 'Success',
      provider: 'google',
      place: { placeId: 'ChIJ-place-one', latitude: -20.24, longitude: 57.47, formattedAddress: 'Royal Rd, Rose Hill' },
      attribution: 'Google Maps',
      message: null,
    },
  });

  const { result, rerender } = renderHook(({ text }: { text: string }) => useAddressSearch(text), {
    initialProps: { text: 'Roy' },
  });

  await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
  rerender({ text: 'Royal' });
  await waitFor(() => expect(bodies('autocomplete')).toHaveLength(2));

  const [first, second] = bodies('autocomplete');
  expect(first.sessionToken).toEqual(second.sessionToken);
  expect(result.current.attribution).toBe('Google Maps');

  let picked: unknown;
  await act(async () => {
    picked = await result.current.pick(suggestion);
  });

  expect(picked).toMatchObject({ latitude: -20.24, longitude: 57.47 });
  expect(bodies('details')[0].sessionToken).toEqual(first.sessionToken);

  rerender({ text: 'Royal Road 12' });
  await waitFor(() => expect(bodies('autocomplete')).toHaveLength(3));
  expect(bodies('autocomplete')[2].sessionToken).not.toEqual(first.sessionToken);
});

it('sends nothing under three characters', async () => {
  mock.onPost(/places\/autocomplete$/).reply(200, page());

  renderHook(() => useAddressSearch('Ro'));

  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(bodies('autocomplete')).toHaveLength(0);
});

it('goes quiet for good once the deployment says it has no address search', async () => {
  mock.onPost(/places\/autocomplete$/).reply(200, page('NotConfigured'));

  const { result, rerender } = renderHook(({ text }: { text: string }) => useAddressSearch(text), {
    initialProps: { text: 'Royal' },
  });

  await waitFor(() => expect(result.current.isUnavailable).toBe(true));

  rerender({ text: 'Royal Road' });
  await new Promise((resolve) => setTimeout(resolve, 600));

  expect(bodies('autocomplete')).toHaveLength(1);
});
