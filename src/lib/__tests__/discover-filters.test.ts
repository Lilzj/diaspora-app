/**
 * What Discover's "Filters & Sort" sheet asks for — 15 Sep 2026.
 *
 * Checked against the live platform with the sheet a member had set: a price of
 * ",5000" to "10000", 2+ bedrooms, 3+ bathrooms, Furnished. The range was never
 * applied (no currency, no period, and ",5000" was NaN), "Partially Furnished"
 * returned no furnished home, and "Very Good" returned items in Good condition.
 */
import type { DiscoverScope } from '../discover-scope';
import {
  amountFromInput,
  amountInputText,
  byDistance,
  furnishingFloor,
  housingSearchParams,
  itemPriceBody,
  keepsFurnishing,
  marketplaceSearchBody,
  priceFilterCurrency,
  rentRangeParams,
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
      minFurnishedStatus: 'Furnished',
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
  it('ask the server for a floor, and nothing for "All" or "Unfurnished"', () => {
    expect(furnishingFloor('Furnished')).toBe('Furnished');
    expect(furnishingFloor('Partially Furnished')).toBe('PartlyFurnished');
    expect(furnishingFloor('Unfurnished')).toBeUndefined();
    expect(furnishingFloor('All')).toBeUndefined();
  });

  it('show only what the chip says, so "Partially Furnished" never shows a furnished card', () => {
    expect(keepsFurnishing('Partially Furnished', 'Partially Furnished')).toBe(true);
    expect(keepsFurnishing('Partially Furnished', 'Furnished')).toBe(false);
    expect(keepsFurnishing('Unfurnished', 'Unfurnished')).toBe(true);
    expect(keepsFurnishing('Unfurnished', 'Furnished')).toBe(false);
    expect(keepsFurnishing('Furnished', 'Furnished')).toBe(true);
    expect(keepsFurnishing('All', 'Unfurnished')).toBe(true);
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

  it('builds both Discover searches from these, not from Number(text) || undefined', () => {
    expect(discover).toContain('housingSearchParams(searchQuery, scope,');
    expect(discover).toContain('marketplaceSearchBody(searchQuery, scope,');
    expect(discover).not.toMatch(/Number\((rentMin|rentMax|marketMinPrice|marketMaxPrice)\)/);
  });
});
