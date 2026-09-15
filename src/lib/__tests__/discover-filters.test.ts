/**
 * What Discover's "Filters & Sort" sheet asks for — 15 Sep 2026.
 *
 * Checked against the live platform with the sheet a member had set: a price of
 * ",5000" to "10000", 2+ bedrooms, 3+ bathrooms, Furnished. The range was never
 * applied (no currency, no period, and ",5000" was NaN), "Partially Furnished"
 * returned no furnished home, and "Very Good" returned items in Good condition.
 *
 * The same evening: the tab read one page, filtered "Unfurnished", "Partially
 * Furnished" and "Pickup Only" out of it on the phone, and sorted "Rating"
 * within it. The server does all three now, and the tabs page.
 */
import type { DiscoverScope } from '../discover-scope';
import {
  amountFromInput,
  amountInputText,
  appendPage,
  byDistance,
  furnishingStatuses,
  housingSearchParams,
  housingSortParam,
  itemPriceBody,
  marketplaceSearchBody,
  orderLoadedHomes,
  orderLoadedItems,
  priceFilterCurrency,
  rentRangeParams,
  unratedSortNote,
  type HousingSheetFilters,
  type MarketplaceSheetFilters,
} from '../discover-filters';

const MAURITIUS: DiscoverScope = { kind: 'country', countryCode: 'MU' };
const ROSE_HILL_5KM: DiscoverScope = {
  kind: 'distance',
  countryCode: 'MU',
  cityName: 'Rose Hill',
  latitude: -20.241,
  longitude: 57.4769,
  radiusKm: 5,
};
/** A country the platform holds no currency for. */
const NOWHERE_KNOWN: DiscoverScope = { kind: 'country', countryCode: 'AQ' };

const NO_HOUSING_FILTERS: HousingSheetFilters = {
  rentMin: '',
  rentMax: '',
  bedrooms: null,
  bathrooms: null,
  furnished: 'All',
  billsIncluded: false,
  internetIncluded: false,
  parking: false,
  verifiedHost: false,
  lifestyle: {},
};

const NO_ITEM_FILTERS: MarketplaceSheetFilters = {
  intent: '',
  condition: '',
  minPrice: '',
  maxPrice: '',
  verifiedSeller: false,
  delivery: false,
  pickupOnly: false,
};

/** Only the names that will go on the wire — axios drops undefined values. */
function sent(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

describe('an amount a member types', () => {
  it('reads grouping commas and spaces as nothing, so ",5000" is 5000', () => {
    expect(amountFromInput(',5000')).toBe(5000);
    expect(amountFromInput('5,000')).toBe(5000);
    expect(amountFromInput('22 000')).toBe(22000);
    expect(amountFromInput('12.50')).toBe(12.5);
  });

  it('is no bound when there is no amount in it', () => {
    expect(amountFromInput('')).toBeUndefined();
    expect(amountFromInput(undefined)).toBeUndefined();
    expect(amountFromInput('0')).toBeUndefined();
    expect(amountFromInput('Rs')).toBeUndefined();
    expect(amountFromInput('1.2.3')).toBeUndefined();
  });

  it('keeps only digits and one decimal point as it is typed', () => {
    expect(amountInputText(',5000')).toBe('5000');
    expect(amountInputText('5 000')).toBe('5000');
    expect(amountInputText('-250')).toBe('250');
    expect(amountInputText('12.5.6')).toBe('12.56');
  });
});

describe('the housing sheet', () => {
  it('sends the screenshot filters as a monthly rupee range the server will apply', () => {
    const params = housingSearchParams('', MAURITIUS, {
      ...NO_HOUSING_FILTERS,
      rentMin: ',5000',
      rentMax: '10000',
      bedrooms: 2,
      bathrooms: 3,
      furnished: 'Furnished',
    });

    expect(sent(params)).toEqual({
      countryCode: 'MU',
      minRent: 5000,
      maxRent: 10000,
      currency: 'MUR',
      rentPeriod: 'PerMonth',
      minBedrooms: 2,
      minBathrooms: 3,
      furnishedStatuses: ['Furnished', 'FullyEquipped'],
    });
  });

  it('names no currency or period when no rent was typed, which would hide weekly and nightly homes', () => {
    expect(rentRangeParams('', '', MAURITIUS)).toEqual({});
    expect(sent(housingSearchParams('', MAURITIUS, NO_HOUSING_FILTERS))).toEqual({ countryCode: 'MU' });
  });

  it('sends one bound on its own, with what makes it mean something', () => {
    expect(sent(rentRangeParams('', '10,000', MAURITIUS))).toEqual({
      maxRent: 10000,
      currency: 'MUR',
      rentPeriod: 'PerMonth',
    });
  });

  it('searches in the currency of the country being searched, around a point too', () => {
    const params = sent(housingSearchParams('studio', ROSE_HILL_5KM, { ...NO_HOUSING_FILTERS, rentMax: '9500' }));

    expect(params).toMatchObject({
      query: 'studio',
      countryCode: 'MU',
      latitude: -20.241,
      longitude: 57.4769,
      maxRent: 9500,
      currency: 'MUR',
    });
  });

  it('offers no rent range where the currency is unknown, rather than a range that does nothing', () => {
    expect(priceFilterCurrency(NOWHERE_KNOWN)).toBeNull();
    expect(rentRangeParams('5000', '10000', NOWHERE_KNOWN)).toEqual({});
  });

  it('sends every other filter under the name the route binds', () => {
    const params = sent(
      housingSearchParams('', MAURITIUS, {
        ...NO_HOUSING_FILTERS,
        billsIncluded: true,
        internetIncluded: true,
        verifiedHost: true,
        lifestyle: { 'Student Friendly': true, 'Family Friendly': true, 'Shared Living': true, 'Pet Friendly': true },
      })
    );

    expect(params).toEqual({
      countryCode: 'MU',
      utilitiesIncluded: true,
      internetIncluded: true,
      verifiedOnly: true,
      studentFriendly: true,
      familyFriendly: true,
      shared: true,
      petsAllowed: true,
    });
    expect(sent(housingSearchParams('', MAURITIUS, { ...NO_HOUSING_FILTERS, parking: true }))).toEqual({
      countryCode: 'MU',
      parking: true,
    });
  });
});

describe('the furnishing chips', () => {
  it('ask the server for exactly what the chip says, so a later page is filtered too', () => {
    // A fully equipped home's card reads "Furnished", so that chip asks for both.
    expect(furnishingStatuses('Furnished')).toEqual(['Furnished', 'FullyEquipped']);
    expect(furnishingStatuses('Partially Furnished')).toEqual(['PartlyFurnished']);
    expect(furnishingStatuses('Unfurnished')).toEqual(['Unfurnished']);
    expect(furnishingStatuses('All')).toBeUndefined();
  });

  it('go out as a repeated parameter and no floor', () => {
    const params = sent(housingSearchParams('', MAURITIUS, { ...NO_HOUSING_FILTERS, furnished: 'Unfurnished' }));

    expect(params).toEqual({ countryCode: 'MU', furnishedStatuses: ['Unfurnished'] });
    expect(params).not.toHaveProperty('minFurnishedStatus');
  });
});

describe('sorting and paging homes', () => {
  it('asks the server for "Rating", and leaves "Recommended" and "Distance" to their own orders', () => {
    expect(housingSortParam('rating')).toBe('HighestRated');
    expect(housingSortParam('default')).toBeUndefined();
    expect(housingSortParam('distance')).toBeUndefined();

    expect(sent(housingSearchParams('', MAURITIUS, NO_HOUSING_FILTERS, 'rating'))).toEqual({
      countryCode: 'MU',
      sort: 'HighestRated',
    });
  });

  it('carries the cursor the previous page returned, and nothing for the first page', () => {
    expect(sent(housingSearchParams('', MAURITIUS, NO_HOUSING_FILTERS, 'default', 'abc=='))).toEqual({
      countryCode: 'MU',
      cursor: 'abc==',
    });
    expect(sent(housingSearchParams('', MAURITIUS, NO_HOUSING_FILTERS, 'default', null))).toEqual({
      countryCode: 'MU',
    });
  });

  it('appends a page once, even when a row moved across the boundary', () => {
    const shown = [{ id: 'a' }, { id: 'b' }];

    expect(appendPage(shown, [{ id: 'b' }, { id: 'c' }]).map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(shown).toHaveLength(2);
  });

  it('keeps the server order for "Recommended" and "Rating", and orders loaded homes by distance', () => {
    const homes = [
      { id: 'far', location: { distanceKm: 9 } },
      { id: 'near', location: { distanceKm: 1 } },
    ];

    expect(orderLoadedHomes(homes, 'default').map((home) => home.id)).toEqual(['far', 'near']);
    expect(orderLoadedHomes(homes, 'rating').map((home) => home.id)).toEqual(['far', 'near']);
    expect(orderLoadedHomes(homes, 'distance').map((home) => home.id)).toEqual(['near', 'far']);
  });

  it('orders loaded items by seller rating, unrated sellers last', () => {
    const items = [
      { id: 'unrated', seller: { rating: null } },
      { id: 'three', seller: { rating: { average: 3 } } },
      { id: 'five', seller: { rating: { average: 5 } } },
    ];

    expect(orderLoadedItems(items, 'rating').map((item) => item.id)).toEqual(['five', 'three', 'unrated']);
    expect(orderLoadedItems(items, 'default').map((item) => item.id)).toEqual(['unrated', 'three', 'five']);
  });

  it('says why "Rating" changed nothing, and only then', () => {
    const unrated = [{ rating: null }, { rating: undefined }];

    expect(unratedSortNote('rating', unrated, 'landlords')).toBe(
      'None of these landlords has been rated yet, so homes are shown newest first.'
    );
    expect(unratedSortNote('rating', [...unrated, { rating: { average: 4.5 } }], 'landlords')).toBeNull();
    expect(unratedSortNote('default', unrated, 'landlords')).toBeNull();
    expect(unratedSortNote('rating', [], 'sellers')).toBeNull();
  });
});

describe('the marketplace sheet', () => {
  it('sends a price range with its currency', () => {
    const body = sent(
      marketplaceSearchBody('', MAURITIUS, { ...NO_ITEM_FILTERS, minPrice: '1,000', maxPrice: '12000' })
    );

    expect(body).toEqual({ countryCode: 'MU', minimumPrice: 1000, maximumPrice: 12000, currency: 'MUR' });
  });

  it('names no currency when no price was typed, or where the currency is unknown', () => {
    expect(itemPriceBody('', '', MAURITIUS)).toEqual({});
    expect(itemPriceBody('100', '', NOWHERE_KNOWN)).toEqual({});
  });

  it('asks for "Very Good" as the server calls it, and a swap as a swap', () => {
    const body = sent(
      marketplaceSearchBody('phone', MAURITIUS, {
        ...NO_ITEM_FILTERS,
        intent: 'Exchange / Swap',
        condition: 'Very Good',
        verifiedSeller: true,
        delivery: true,
      })
    );

    expect(body).toEqual({
      text: 'phone',
      countryCode: 'MU',
      listingTypes: ['Swap'],
      minimumCondition: 'Excellent',
      verifiedSellersOnly: true,
      deliveryOnly: true,
    });
  });

  it('never sends a radius: an item has no position', () => {
    expect(sent(marketplaceSearchBody('', ROSE_HILL_5KM, NO_ITEM_FILTERS))).toEqual({
      countryCode: 'MU',
      city: 'Rose Hill',
    });
  });

  it('asks the server for pickup-only items, and carries the cursor for the next page', () => {
    expect(
      sent(marketplaceSearchBody('', MAURITIUS, { ...NO_ITEM_FILTERS, pickupOnly: true }, 'next=='))
    ).toEqual({ countryCode: 'MU', pickupOnly: true, cursor: 'next==' });
  });
});

describe('sorting by distance', () => {
  it('puts the nearest first and a home with no measured distance last, not at 0 km', () => {
    const rows = [
      { id: 'unmeasured', location: { distanceKm: undefined } },
      { id: 'far', location: { distanceKm: 8.2 } },
      { id: 'near', location: { distanceKm: 0.6 } },
      { id: 'no-location', location: null },
    ];

    expect([...rows].sort(byDistance).map((row) => row.id)).toEqual(['near', 'far', 'unmeasured', 'no-location']);
  });
});

describe('where it is used', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const discover = fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(tabs)', 'discover.tsx'), 'utf8');

  it('filters and pages on the server, not within one page on the phone', () => {
    // The page filters that hid later pages' matches.
    expect(discover).not.toMatch(/keepsFurnishing|item\.pickupOnly|item\.furnished === 'Unfurnished'/);
    expect(discover).toContain('<ShowMoreButton label="Show more homes"');
    expect(discover).toContain('<ShowMoreButton label="Show more items"');
  });

  it('builds both Discover searches from these, not from Number(text) || undefined', () => {
    expect(discover).toContain('housingSearchParams(searchQuery, scope,');
    expect(discover).toContain('marketplaceSearchBody(searchQuery, scope,');
    expect(discover).not.toMatch(/Number\((rentMin|rentMax|marketMinPrice|marketMaxPrice)\)/);
  });
});
