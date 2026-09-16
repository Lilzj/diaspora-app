/**
 * Everything a member has listed, including their business — 16 Sep 2026.
 *
 * "My Listings" read marketplace and housing and declared the third impossible:
 * its header stated "there is no `GET /providers/mine`", and a line under the
 * list told the member "Diaspora cannot yet list the service-provider profiles
 * you own". The route is `/providers/me`, served since the module shipped — the
 * register was looking for the wrong spelling, and a member who had registered
 * a business was told the platform could not show it.
 *
 * Driven through the real client at the network boundary, because the defect
 * was never in the rendering: it was in which routes the screen believed in.
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { fetchMyProviders } from '../providers-api';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  mock.restore();
});

function business(id: string, name: string, status = 'Active') {
  return {
    providerId: id,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    providerType: 'Business',
    status,
    category: { categoryId: 'c1', slug: 'catering', name: 'Catering' },
    location: { cityName: 'Rose Hill', areaName: null },
    reviewSummary: { average: 0, totalReviews: 0 },
    isVerified: false,
    isFeatured: false,
    deliveryMode: 'AtProvider',
    tags: [],
    languages: [],
    owner: { userId: 'u1', originCountryCode: 'NG' },
  };
}

describe('the businesses a member runs', () => {
  it('are read from the route that exists, under the name it exists at', async () => {
    mock.onGet('/providers/me').reply(200, { data: [business('p1', 'Aisha Kitchen')] });

    const providers = await fetchMyProviders();

    expect(providers.map((provider) => provider.name)).toEqual(['Aisha Kitchen']);
    expect(mock.history.get[0].url).toBe('/providers/me');
  });

  it('carry the platform’s own status word, so an unpublished business is not shown as live', async () => {
    mock.onGet('/providers/me').reply(200, {
      data: [business('p1', 'Draft Catering', 'Draft'), business('p2', 'Live Catering', 'Active')],
    });

    expect((await fetchMyProviders()).map((provider) => provider.status)).toEqual([
      'Draft',
      'Active',
    ]);
  });

  it('are an empty list for a member who runs none — the platform saying "none", not refusing', async () => {
    mock.onGet('/providers/me').reply(200, { data: [] });

    await expect(fetchMyProviders()).resolves.toEqual([]);
  });

  it('raise a read failure rather than being silently counted as none', async () => {
    mock.onGet('/providers/me').reply(500, {});

    await expect(fetchMyProviders()).rejects.toBeTruthy();
  });
});

describe('the screen that lists them', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const screen = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'my-listings.tsx'),
    'utf8'
  );

  it('reads all three universes, each settled on its own', () => {
    expect(screen).toContain("apiClient.get('/marketplace/listings/mine')");
    expect(screen).toContain("apiClient.get('/housing/listings/mine')");
    expect(screen).toContain('fetchMyProviders()');
    expect(screen).toContain('Promise.allSettled');
  });

  it('opens a business at its own page, and marks the row as one', () => {
    expect(screen).toContain('/provider/${provider.providerId}');
    expect(screen).toContain("kind: 'provider'");
    expect(screen).toContain('ROW_ICON[item.kind]');
  });

  it('no longer tells the member their business cannot be listed', () => {
    // The two sentences the member actually read.
    expect(screen).not.toMatch(/Service-provider profiles are not shown here/);
    expect(screen).not.toMatch(/Diaspora cannot yet list the service-provider/);
  });

  it('leaves room for each row’s words beside the button', () => {
    // `Button` is full width by default, so "Open" took the whole row and the
    // title, subtitle and status were laid out in a column of zero width:
    // present in the tree, one character per line, and invisible. Every row on
    // this screen was a bare icon and a button.
    expect(screen).toContain('fullWidth={false}');
  });

  it('says the list is incomplete only when a read genuinely failed', () => {
    expect(screen).toContain('partial: [marketplace, housing, providers].some(couldNotAsk)');
    // Housing refuses `/housing/listings/mine` for a member with no landlord
    // profile, and every one of them used to read "part of this list could not
    // be loaded" under their own items.
    expect(screen).toContain('holdingsFromFailure(outcome.reason) === null');
  });
});
