// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what Discover's "Filters & Sort" sheet asks the server
//
// Checked end to end on 15 Sep 2026, filter by filter, against the two homes
// and three items on the live platform. Bedrooms, bathrooms, bills, internet,
// parking, pets, the lifestyle chips and verified hosts all narrowed correctly.
// Three did not:
//
// **The price range was never applied, on either tab.** Both searches leave a
// range alone unless it names its currency — homes, its rent period too —
// because the platform never compares a rupee with a pound. The sheet sent
// neither, so a maximum of 10,000 still returned the Rs 22,000 flat. And a
// minimum typed as ",5000" went through `Number(",5000") || undefined`, which
// is NaN and was dropped without a word.
//
// **"Furnished" and item condition compared words, not ranks.** Both are stored
// by name, so "at least Excellent" returned a phone in Good condition, and
// "Partially Furnished" returned neither furnished home. Fixed on the server;
// the sheet's side of it is `furnishingFloor` and `keepsFurnishing` below.
//
// The screen spreads these into its requests, and the binding-drift ledger
// drives the same functions, so a renamed parameter fails a test instead of
// quietly widening a search.
// ─────────────────────────────────────────────────────────────────────────────

import { countryCurrency } from './country-currency';
import { housingScopeParams, marketplaceScopeParams, type DiscoverScope } from './discover-scope';
import { listingTypesForIntent } from './marketplace-wire';
import { toListingCondition } from './marketplace-categories';

// ── Amounts a person types ───────────────────────────────────────────────────

/**
 * What an amount box keeps as it is typed: digits and one decimal point.
 *
 * Android's numeric keyboard offers a comma, a space and a minus sign, and each
 * of them made the box show one number while the search used another, or none.
 */
export function amountInputText(text: string): string {
  const kept = text.replace(/[^\d.]/g, '');
  const point = kept.indexOf('.');
  return point === -1 ? kept : kept.slice(0, point + 1) + kept.slice(point + 1).replace(/\./g, '');
}

/**
 * An amount box as a number, or undefined when it holds no amount.
 *
 * Grouping commas and spaces are ignored, so "5,000" and ",5000" are both 5000.
 * Zero is no bound at all, as it was before.
 */
export function amountFromInput(text: string | null | undefined): number | undefined {
  const cleaned = (text ?? '').replace(/[\s,]/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The currency a price filter searches in, or null when there is none to name.
 *
 * The country being searched, not the member's home: a member from Ghana
 * looking at rooms in Mauritius is reading rupees.
 */
export function priceFilterCurrency(scope: Pick<DiscoverScope, 'countryCode'>): string | null {
  return countryCurrency(scope.countryCode);
}

// ── Homes ────────────────────────────────────────────────────────────────────

/** The sheet's furnishing chips. */
export type FurnishingChoice = 'All' | 'Furnished' | 'Unfurnished' | 'Partially Furnished';

export interface HousingSheetFilters {
  rentMin: string;
  rentMax: string;
  bedrooms: number | null;
  bathrooms: number | null;
  furnished: string;
  billsIncluded: boolean;
  internetIncluded: boolean;
  parking: boolean;
  verifiedHost: boolean;
  lifestyle: Readonly<Record<string, boolean>>;
}

/**
 * The monthly rent range, with the currency and period that make it mean
 * something — and nothing at all when no bound was typed.
 *
 * On the server a currency and a period narrow **on their own**, so sending
 * them with every search would hide every weekly and nightly home from a member
 * who never touched the price boxes.
 */
export function rentRangeParams(
  rentMin: string,
  rentMax: string,
  scope: Pick<DiscoverScope, 'countryCode'>
): { minRent?: number; maxRent?: number; currency?: string; rentPeriod?: 'PerMonth' } {
  const minRent = amountFromInput(rentMin);
  const maxRent = amountFromInput(rentMax);
  const currency = priceFilterCurrency(scope);

  if ((minRent === undefined && maxRent === undefined) || currency === null) return {};

  // "Price Range (Monthly)" is what the sheet says, so a monthly rent is what it searches.
  return { minRent, maxRent, currency, rentPeriod: 'PerMonth' };
}

/**
 * The server's floor for a furnishing chip. The server orders Unfurnished,
 * PartlyFurnished, Furnished, FullyEquipped and keeps everything at or above
 * the floor; "Unfurnished" has no floor, and is matched on the page.
 */
export function furnishingFloor(choice: string): 'Furnished' | 'PartlyFurnished' | undefined {
  if (choice === 'Furnished') return 'Furnished';
  if (choice === 'Partially Furnished') return 'PartlyFurnished';
  return undefined;
}

/**
 * Whether a home on the page is what the chip said.
 *
 * A floor of part-furnished also admits furnished homes, and a member who
 * chose "Partially Furnished" and got a card reading "Furnished" would rightly
 * think the filter was broken. Fully equipped homes already read "Furnished".
 */
export function keepsFurnishing(choice: string, furnished: string | undefined): boolean {
  if (choice === 'Unfurnished') return furnished === 'Unfurnished';
  if (choice === 'Partially Furnished') return furnished === 'Partially Furnished';
  return true;
}

/** Every filter in the housing sheet, as `GET /housing/search` binds them. */
export function housingFilterParams(
  filters: HousingSheetFilters,
  scope: Pick<DiscoverScope, 'countryCode'>
): Record<string, string | number | boolean | undefined> {
  const { lifestyle } = filters;

  return {
    ...rentRangeParams(filters.rentMin, filters.rentMax, scope),
    minBedrooms: filters.bedrooms || undefined,
    minBathrooms: filters.bathrooms || undefined,
    minFurnishedStatus: furnishingFloor(filters.furnished),
    utilitiesIncluded: filters.billsIncluded || undefined,
    internetIncluded: filters.internetIncluded || undefined,
    parking: filters.parking || lifestyle['Parking Available'] || undefined,
    verifiedOnly: filters.verifiedHost || undefined,
    studentFriendly: lifestyle['Student Friendly'] || undefined,
    familyFriendly: lifestyle['Family Friendly'] || undefined,
    shared: lifestyle['Shared Living'] || undefined,
    petsAllowed: lifestyle['Pet Friendly'] || undefined,
  };
}

/** The whole housing request: what was typed, where, and the sheet. */
export function housingSearchParams(
  query: string,
  scope: DiscoverScope,
  filters: HousingSheetFilters
): Record<string, string | number | boolean | undefined> {
  return {
    query: query.trim() || undefined,
    ...housingScopeParams(scope),
    ...housingFilterParams(filters, scope),
  };
}

// ── Items ────────────────────────────────────────────────────────────────────

export interface MarketplaceSheetFilters {
  intent: string;
  condition: string;
  minPrice: string;
  maxPrice: string;
  verifiedSeller: boolean;
  delivery: boolean;
}

/** The item price range and its currency, or nothing when no bound was typed. */
export function itemPriceBody(
  minPrice: string,
  maxPrice: string,
  scope: Pick<DiscoverScope, 'countryCode'>
): { minimumPrice?: number; maximumPrice?: number; currency?: string } {
  const minimumPrice = amountFromInput(minPrice);
  const maximumPrice = amountFromInput(maxPrice);
  const currency = priceFilterCurrency(scope);

  if ((minimumPrice === undefined && maximumPrice === undefined) || currency === null) return {};

  return { minimumPrice, maximumPrice, currency };
}

/**
 * The whole `POST /marketplace/search` body. An item has no position, so the
 * place is the member's town or country, never a radius. Pickup-only has no
 * binding and is read off the page by the screen.
 */
export function marketplaceSearchBody(
  query: string,
  scope: DiscoverScope,
  filters: MarketplaceSheetFilters
): Record<string, unknown> {
  return {
    text: query.trim() || undefined,
    ...marketplaceScopeParams(scope),
    listingTypes: listingTypesForIntent(filters.intent),
    ...itemPriceBody(filters.minPrice, filters.maxPrice, scope),
    minimumCondition: filters.condition ? toListingCondition(filters.condition) : undefined,
    verifiedSellersOnly: filters.verifiedSeller || undefined,
    deliveryOnly: filters.delivery || undefined,
  };
}

// ── Sorting the page ─────────────────────────────────────────────────────────

/**
 * Nearest first, and a row with no measured distance last.
 *
 * It sorted as 0 km, so on a distance search a home whose position is not
 * published jumped to the top of "Distance" — ahead of the one next door.
 */
export function byDistance(
  a: { location?: { distanceKm?: number | null } | null },
  b: { location?: { distanceKm?: number | null } | null }
): number {
  const left = a.location?.distanceKm;
  const right = b.location?.distanceKm;
  const leftKnown = typeof left === 'number' && Number.isFinite(left);
  const rightKnown = typeof right === 'number' && Number.isFinite(right);

  if (leftKnown && rightKnown) return (left as number) - (right as number);
  if (leftKnown) return -1;
  if (rightKnown) return 1;
  return 0;
}
