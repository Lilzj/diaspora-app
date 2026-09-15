/**
 * Listing cards show their photographs — 15 Sep 2026.
 *
 * Every card held a media identifier and handed it to `<Image>` as an address,
 * so a listing with a photograph showed "No photo" or an empty box. Several
 * screens also passed the raw rows a search sent straight to the cards, which
 * threw (homes) or printed "Rs [object Object]" (items).
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { ThemeProvider } from '@/design-system';
import { API_BASE_URL } from '@/lib/apiClient';
import { ListingPhoto } from '../ListingPhoto';
import { HousingCard } from '../HousingCard';
import { MarketplaceCard } from '../MarketplaceCard';
import type { HousingCardWire } from '@/lib/housing-cards';
import type { MarketplaceListingCardResponse } from '@/types/marketplace';

jest.mock('@/store/saved', () => ({
  useSavedStore: () => ({ save: jest.fn(), unsave: jest.fn(), isSaved: () => false }),
}));

const BASE = API_BASE_URL.replace(/\/+$/, '');
const HOME_COVER = 'fe2b38ba-1674-4852-9f1f-761e06abe9d1';
const ITEM_COVER = '4e816ad1-a844-4eb2-8ea5-5c95ce83aee9';

function wrap(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

function imageUris(): string[] {
  return screen.UNSAFE_queryAllByType(Image).map(
    (node) => (node.props.source as { uri?: string } | undefined)?.uri ?? ''
  );
}

/** What `/housing/search` served for the Rose Hill room on 15 Sep 2026, unmapped. */
const HOME_ROW: HousingCardWire = {
  id: '01a05770-2d93-7e65-99ff-d16c25bb0182',
  title: 'Single room in a shared house, Rose Hill',
  accommodationTypeName: 'Studio',
  price: { isDisclosed: true, amount: 9500, currencyCode: 'MUR', period: 'PerMonth', utilitiesIncluded: true },
  capacity: { bedrooms: 1, bathrooms: 1 },
  location: { countryCode: 'MU', cityName: 'Rose Hill' },
  stayPolicy: { isSharedAccommodation: true },
  furnishedStatus: 'Furnished',
  coverImage: { mediaId: HOME_COVER, role: 'Cover' },
  landlord: { id: 'landlord-1', displayName: 'Mensah Property Rentals', isVerified: false },
  isLandlordVerified: false,
};

/** What `/marketplace/search` served for the groceries listing, unmapped. */
const ITEM_ROW: MarketplaceListingCardResponse = {
  listingId: '01a05769-c877-7e1d-a5a3-d367cbfae0e2',
  title: 'West African groceries: egusi, ogbono, palm oil',
  listingType: 'FixedPrice',
  condition: 'New',
  status: 'Active',
  price: { isDisclosed: true, amount: 450, currency: 'MUR', isNegotiable: false, isFree: false },
  location: { countryCode: 'MU', regionName: 'Plaines Wilhems', cityName: 'Rose Hill' },
  coverMediaId: ITEM_COVER,
  seller: { sellerId: 'seller-1', displayName: 'Aisha Okonkwo', isVerified: false },
  offersDelivery: false,
  offersShipping: false,
};

describe('a listing photo', () => {
  it('loads a media identifier from the image route', () => {
    wrap(<ListingPhoto uri={ITEM_COVER} style={{ width: 100, height: 100 }} />);

    expect(imageUris()).toEqual([`${BASE}/media/${ITEM_COVER}/variants/medium`]);
  });

  it('loads a media reference the same way', () => {
    wrap(<ListingPhoto uri={{ mediaId: HOME_COVER }} style={{ width: 100, height: 100 }} />);

    expect(imageUris()).toEqual([`${BASE}/media/${HOME_COVER}/variants/medium`]);
  });

  it('says there is no photo when there is none', () => {
    wrap(<ListingPhoto uri="" style={{ width: 100, height: 100 }} />);

    expect(imageUris()).toEqual([]);
    expect(screen.getByLabelText('No photo')).toBeTruthy();
  });

  it('says the photo is unavailable when it fails to load, rather than leaving a blank box', () => {
    wrap(<ListingPhoto uri={ITEM_COVER} style={{ width: 100, height: 100 }} />);

    const image = screen.UNSAFE_getByType(Image);
    act(() => {
      image.props.onError?.({ error: 'HTTP 404' });
    });

    expect(imageUris()).toEqual([]);
    expect(screen.getByLabelText('Photo unavailable')).toBeTruthy();
  });
});

describe('the cards', () => {
  it('a home card shows its cover, from a raw search row, without throwing', () => {
    wrap(<HousingCard listing={HOME_ROW} />);

    expect(screen.getByText('Single room in a shared house, Rose Hill')).toBeTruthy();
    expect(screen.getByText(/Rs 9500\/month/)).toBeTruthy();
    expect(imageUris()).toEqual([`${BASE}/media/${HOME_COVER}/variants/medium`]);
  });

  it('an item card shows its cover and its price, from a raw search row', () => {
    wrap(<MarketplaceCard listing={ITEM_ROW} variant="list" />);

    expect(screen.getByText('West African groceries: egusi, ogbono, palm oil')).toBeTruthy();
    expect(screen.getByText('Rs 450')).toBeTruthy();
    expect(screen.queryByText(/object Object/)).toBeNull();
    expect(imageUris()).toEqual([`${BASE}/media/${ITEM_COVER}/variants/medium`]);
  });

  it('an item card shows its cover in the grid and featured layouts too', () => {
    const { unmount } = wrap(<MarketplaceCard listing={ITEM_ROW} variant="grid" />);
    expect(imageUris()).toEqual([`${BASE}/media/${ITEM_COVER}/variants/medium`]);
    unmount();

    wrap(<MarketplaceCard listing={ITEM_ROW} variant="featured" />);
    expect(imageUris()).toEqual([`${BASE}/media/${ITEM_COVER}/variants/medium`]);
  });
});
