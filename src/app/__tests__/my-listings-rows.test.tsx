/**
 * My Listings says where each listing is and what it costs (RMD-009, 24 Nov 2026).
 *
 * The rows read `location.areaName ?? location.cityName` and `price.displayText`
 * off the owner's two routes, which answer with the cards the searches send.
 * Neither card has `areaName` or `displayText`, so every row fell back to its
 * city and no listing or home ever showed its price here. The stubs are those
 * cards, typed as the client's declarations of them, which the drift suite
 * holds to the published contract.
 */
import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/transport/apiClient';
import type { HousingCardWire } from '@/lib/platform/housing-cards';
import type { MarketplaceListingCardResponse } from '@/types/marketplace';
import MyListingsScreen from '../my-listings';

jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function listing(overrides: Partial<MarketplaceListingCardResponse> = {}): MarketplaceListingCardResponse {
  return {
    listingId: 'a1b2c3d4-0000-4000-8000-000000000001',
    title: 'Refurbished laptop',
    slug: 'refurbished-laptop',
    summary: 'Eight gigabytes, new battery.',
    categoryKey: 'electronics',
    listingType: 'FixedPrice',
    swapWants: null,
    swapTopUp: null,
    donationCauseId: null,
    donationCauseTitle: null,
    condition: 'Good',
    status: 'Active',
    price: { isDisclosed: true, amount: 15000, currency: 'MUR', isNegotiable: false, isFree: false, minimumOffer: null },
    available: 1,
    location: {
      countryCode: 'MU',
      regionName: 'Plaines Wilhems',
      cityName: 'Curepipe',
      neighbourhood: 'Forest Side',
      areaId: null,
      displayName: 'Forest Side, Curepipe',
      latitude: null,
      longitude: null,
    },
    coverMediaId: null,
    tags: [],
    isFeatured: false,
    isVerified: false,
    offersDelivery: false,
    offersShipping: false,
    viewCount: 4,
    saveCount: 1,
    publishedAt: '2026-11-20T09:00:00Z',
    expiresAt: null,
    distanceKm: null,
    ...overrides,
  };
}

const HOME: HousingCardWire = {
  id: 'b1c2d3e4-0000-4000-8000-000000000002',
  slug: 'studio-near-the-market',
  title: 'Studio near the market',
  summary: 'Bright, quiet, two minutes from the bus.',
  accommodationTypeKey: 'studio',
  accommodationTypeName: 'Studio',
  status: 'Published',
  price: {
    isDisclosed: true,
    amount: 9500,
    currencyCode: 'MUR',
    period: 'PerMonth',
    depositAmount: null,
    utilitiesIncluded: true,
    internetIncluded: false,
  },
  capacity: { bedrooms: 1, bathrooms: 1 },
  availability: { availableFrom: null },
  location: {
    countryCode: 'MU',
    regionName: 'Plaines Wilhems',
    cityName: 'Rose Hill',
    neighborhoodName: 'Plateau',
    displayName: 'Plateau, Rose Hill',
    latitude: null,
    longitude: null,
  },
  furnishedStatus: 'Furnished',
  isLandlordVerified: false,
  isFeatured: false,
  publishedAt: '2026-11-18T09:00:00Z',
};

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient, { delayResponse: 0 });
  api.onGet('/providers/me').reply(200, { data: [] });
});

afterEach(() => api.restore());

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <MyListingsScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

describe('a row on My Listings', () => {
  it('gives an item its neighbourhood and its price, as its card does', async () => {
    api.onGet('/marketplace/listings/mine').reply(200, { data: { items: [listing()], nextCursor: null, hasMore: false } });
    api.onGet('/housing/listings/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });

    renderScreen();

    expect(await screen.findByText('Refurbished laptop')).toBeTruthy();
    expect(screen.getByText('electronics · Forest Side, Curepipe · Rs 15000')).toBeTruthy();
  });

  it('gives a home its neighbourhood and its rent with the period', async () => {
    api.onGet('/marketplace/listings/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });
    api.onGet('/housing/listings/mine').reply(200, { data: { items: [HOME], nextCursor: null, hasMore: false } });

    renderScreen();

    expect(await screen.findByText('Studio near the market')).toBeTruthy();
    expect(screen.getByText('Studio · Plateau, Rose Hill · Rs 9500/month')).toBeTruthy();
  });

  it('says a price was not published rather than leaving it out', async () => {
    api.onGet('/marketplace/listings/mine').reply(200, {
      data: {
        items: [
          listing({
            price: { isDisclosed: false, amount: null, currency: null, isNegotiable: false, isFree: false, minimumOffer: null },
          }),
        ],
        nextCursor: null,
        hasMore: false,
      },
    });
    api.onGet('/housing/listings/mine').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });

    renderScreen();

    expect(await screen.findByText('electronics · Forest Side, Curepipe · Price on request')).toBeTruthy();
  });
});
