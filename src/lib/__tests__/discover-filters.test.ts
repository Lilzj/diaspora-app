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
 *
 * Later that night: "Distance" and the items tab's "Rating" were still sorted
 * twenty at a time on the phone, and Jobs and Guides offered chips their
 * routes ignored. The server orders both across every page now, and each tab
 * offers only what it can honour.
 */
import type { DiscoverScope } from '../discover-scope';
import {
  amountFromInput,
  amountInputText,
  appendPage,
  appliedSortOf,
  distanceSortNote,
  effectiveSort,
  furnishingStatuses,
  housingSearchParams,
  housingSortParam,
  itemPriceBody,
  marketplaceSearchBody,
  marketplaceSortParam,
  priceFilterCurrency,
  rentRangeParams,
  sortOptionsFor,
  unratedSortNote,
  type HousingSheetFilters,
  type MarketplaceSheetFilters,
} from '../discover-filters';

const MAURITIUS: DiscoverScope = { kind: 'country', countryCode: 'MU' };
const ROSE_HILL: DiscoverScope = { kind: 'town', countryCode: 'MU', cityName: 'Rose Hill' };
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

describe('the home types a search sentence names (5 Nov 2026)', () => {
  it('"3-bedroom flat" sends the flat key the route binds, beside the bedrooms', () => {
    expect(
      sent(housingSearchParams('', MAURITIUS, { ...NO_HOUSING_FILTERS, bedrooms: 3, homeTypes: ['apartment'] }))
    ).toEqual({ countryCode: 'MU', minBedrooms: 3, accommodationTypes: ['apartment'] });
  });

  it('no home type sends none', () => {
    expect(sent(housingSearchParams('', MAURITIUS, { ...NO_HOUSING_FILTERS, homeTypes: [] }))).toEqual({ countryCode: 'MU' });
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

describe('the sort chips', () => {
  it('offer each tab only the orders its server applies across every page', () => {
    expect(sortOptionsFor('Housing')).toEqual(['default', 'distance', 'rating']);
    expect(sortOptionsFor('Providers')).toEqual(['default', 'distance', 'rating']);
    // An item has no position.
    expect(sortOptionsFor('Marketplace')).toEqual(['default', 'rating']);
    // Neither route reads a distance or a rating order; the chips changed nothing.
    expect(sortOptionsFor('Jobs')).toEqual([]);
    expect(sortOptionsFor('Guides')).toEqual([]);
  });

  it('do not carry an order to a tab that cannot give it', () => {
    expect(effectiveSort('Housing', 'distance')).toBe('distance');
    expect(effectiveSort('Marketplace', 'distance')).toBe('default');
    expect(effectiveSort('Marketplace', 'rating')).toBe('rating');
    expect(effectiveSort('Jobs', 'rating')).toBe('default');
  });
});

describe('sorting and paging homes', () => {
  it('asks the server for "Rating" and "Distance", and leaves "Recommended" to its own order', () => {
    expect(housingSortParam('rating')).toBe('HighestRated');
    expect(housingSortParam('distance')).toBe('Nearest');
    expect(housingSortParam('default')).toBeUndefined();

    expect(sent(housingSearchParams('', MAURITIUS, NO_HOUSING_FILTERS, 'rating'))).toEqual({
      countryCode: 'MU',
      sort: 'HighestRated',
    });
    expect(sent(housingSearchParams('', ROSE_HILL_5KM, NO_HOUSING_FILTERS, 'distance', 'page-two'))).toEqual({
      countryCode: 'MU',
      latitude: -20.241,
      longitude: 57.4769,
      radiusKm: 5,
      sort: 'Nearest',
      cursor: 'page-two',
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

  it('reads the order a search says it answered in, from the envelope or without one', () => {
    expect(appliedSortOf({ data: { items: [], appliedSort: 'Nearest' } })).toBe('Nearest');
    expect(appliedSortOf({ items: [], appliedSort: 'Distance' })).toBe('Distance');
    // A server from before the field, or nothing at all.
    expect(appliedSortOf({ data: { items: [] } })).toBeNull();
    expect(appliedSortOf(undefined)).toBeNull();
    expect(appliedSortOf({ data: { appliedSort: 7 } })).toBeNull();
  });

  it('says why "Distance" left the list as it was, and only then', () => {
    // Nearest first, as asked.
    expect(distanceSortNote('Housing', 'distance', 'Nearest', ROSE_HILL_5KM)).toBeNull();
    expect(distanceSortNote('Providers', 'distance', 'Distance', ROSE_HILL_5KM)).toBeNull();
    // Not asked, or a server that does not say.
    expect(distanceSortNote('Housing', 'default', 'Newest', MAURITIUS)).toBeNull();
    expect(distanceSortNote('Housing', 'distance', null, MAURITIUS)).toBeNull();

    // No distance to search within.
    expect(distanceSortNote('Housing', 'distance', 'Newest', ROSE_HILL)).toBe(
      'Sorting by distance needs a search within a distance, such as 5 km, so homes are shown newest first.'
    );
    expect(distanceSortNote('Providers', 'distance', 'Recommended', MAURITIUS)).toBe(
      'Sorting by distance needs a search within a distance, such as 5 km, so providers are shown in the recommended order.'
    );
    // Too many inside it to measure.
    expect(distanceSortNote('Housing', 'distance', 'Newest', ROSE_HILL_5KM)).toBe(
      'There are too many homes within 5 km to sort by distance, so they are shown newest first. Choose a shorter distance to sort by distance.'
    );
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
      sent(marketplaceSearchBody('', MAURITIUS, { ...NO_ITEM_FILTERS, pickupOnly: true }, 'default', 'next=='))
    ).toEqual({ countryCode: 'MU', pickupOnly: true, cursor: 'next==' });
  });

  it('asks the server to order by the seller\'s rating, and for no distance order', () => {
    expect(marketplaceSortParam('rating')).toBe('HighestRated');
    expect(marketplaceSortParam('distance')).toBeUndefined();
    expect(marketplaceSortParam('default')).toBeUndefined();

    expect(sent(marketplaceSearchBody('', MAURITIUS, NO_ITEM_FILTERS, 'rating', 'page-two'))).toEqual({
      countryCode: 'MU',
      sort: 'HighestRated',
      cursor: 'page-two',
    });
  });
});

describe('where it is used', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const discover = fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(tabs)', 'discover.tsx'), 'utf8');

  it('filters, sorts and pages on the server, not within one page on the phone', () => {
    // The page filters that hid later pages' matches, and the page sorts.
    expect(discover).not.toMatch(/keepsFurnishing|item\.pickupOnly|item\.furnished === 'Unfurnished'/);
    expect(discover).not.toMatch(/orderLoaded|byDistance/);
    expect(discover).toContain('<ShowMoreButton label="Show more homes"');
    expect(discover).toContain('<ShowMoreButton label="Show more items"');
  });

  it('pages providers, jobs and guides too, which read one page and stopped', () => {
    expect(discover).toContain('useProviderSearchPages(');
    expect(discover).toContain('useScopedContentPages<');
    expect(discover).not.toMatch(/useProviderSearch\(|useScopedContent</);
    expect(discover).toMatch(/label="Show more providers"/);
    expect(discover).toMatch(/label="Show more jobs"/);
    expect(discover).toMatch(/label="Show more guides"/);
  });

  it('offers the sort chips a tab can honour, not a fixed three', () => {
    expect(discover).toContain('sortOptionsFor(activeTab)');
    expect(discover).not.toContain("{ label: 'Distance', value: 'distance' }");
  });

  it('builds both Discover searches from these, not from Number(text) || undefined', () => {
    expect(discover).toContain('housingSearchParams(searchQuery, scope,');
    expect(discover).toContain('marketplaceSearchBody(searchQuery, scope,');
    expect(discover).not.toMatch(/Number\((rentMin|rentMax|marketMinPrice|marketMaxPrice)\)/);
  });
});
