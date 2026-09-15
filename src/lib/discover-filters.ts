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
// "Partially Furnished" returned neither furnished home. Fixed on the server.
//
// **Discover read one page.** Twenty homes, sorted on the phone, with
// "Unfurnished", "Partially Furnished" and "Pickup Only" filtered out of those
// twenty — so a later page's matches never appeared, and "Rating" reordered a
// page and said nothing about the rest. Since the same evening the server does
// all three, and the tab pages with the cursor it returns (`appendPage`).
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
 * The furnishing a chip means, exactly, as `furnishedStatuses` binds it.
 *
 * Exact rather than a floor: a member who chose "Partially Furnished" and got a
 * card reading "Furnished" would rightly think the filter was broken. A fully
 * equipped home already reads "Furnished" on its card, so that chip asks for
 * both. Undefined for "All".
 */
export function furnishingStatuses(choice: string): string[] | undefined {
  switch (choice) {
    case 'Furnished':
      return ['Furnished', 'FullyEquipped'];
    case 'Partially Furnished':
      return ['PartlyFurnished'];
    case 'Unfurnished':
      return ['Unfurnished'];
    default:
      return undefined;
  }
}

/** The sheet's three sort chips. */
export type DiscoverSort = 'default' | 'distance' | 'rating';

/**
 * The order the housing server applies, so page two continues page one.
 *
 * "Recommended" is the server's own order (featured, then newest). "Rating" is
 * `HighestRated`. "Distance" has no server order that does not reveal where a
 * home is more precisely than its address is published, so the homes loaded
 * so far are ordered on the phone instead — see `orderLoadedHomes`.
 */
export function housingSortParam(sort: DiscoverSort): 'HighestRated' | undefined {
  return sort === 'rating' ? 'HighestRated' : undefined;
}

/** Every filter in the housing sheet, as `GET /housing/search` binds them. */
export function housingFilterParams(
  filters: HousingSheetFilters,
  scope: Pick<DiscoverScope, 'countryCode'>
): Record<string, string | string[] | number | boolean | undefined> {
  const { lifestyle } = filters;

  return {
    ...rentRangeParams(filters.rentMin, filters.rentMax, scope),
    minBedrooms: filters.bedrooms || undefined,
    minBathrooms: filters.bathrooms || undefined,
    furnishedStatuses: furnishingStatuses(filters.furnished),
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

/**
 * The whole housing request: what was typed, where, the sheet, the order, and
 * — for "Show more" — the cursor the previous page returned.
 */
export function housingSearchParams(
  query: string,
  scope: DiscoverScope,
  filters: HousingSheetFilters,
  sort: DiscoverSort = 'default',
  cursor?: string | null
): Record<string, string | string[] | number | boolean | undefined> {
  return {
    query: query.trim() || undefined,
    ...housingScopeParams(scope),
    ...housingFilterParams(filters, scope),
    sort: housingSortParam(sort),
    cursor: cursor || undefined,
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
  pickupOnly: boolean;
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
 * place is the member's town or country, never a radius.
 */
export function marketplaceSearchBody(
  query: string,
  scope: DiscoverScope,
  filters: MarketplaceSheetFilters,
  cursor?: string | null
): Record<string, unknown> {
  return {
    text: query.trim() || undefined,
    ...marketplaceScopeParams(scope),
    listingTypes: listingTypesForIntent(filters.intent),
    ...itemPriceBody(filters.minPrice, filters.maxPrice, scope),
    minimumCondition: filters.condition ? toListingCondition(filters.condition) : undefined,
    verifiedSellersOnly: filters.verifiedSeller || undefined,
    deliveryOnly: filters.delivery || undefined,
    // On the server since 15 Sep 2026 — filtering one page for it hid every later page's matches.
    pickupOnly: filters.pickupOnly || undefined,
    cursor: cursor || undefined,
  };
}

// ── Pages ────────────────────────────────────────────────────────────────────

/**
 * The rows already shown, then the next page's, each once.
 *
 * A home published between two requests can move a row across a page boundary;
 * showing it twice is the visible symptom, and a duplicate key the silent one.
 */
export function appendPage<T extends { id: string }>(shown: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(shown.map((row) => row.id));
  return [...shown, ...next.filter((row) => !seen.has(row.id))];
}

/**
 * The homes loaded so far, in the order the sheet asked for.
 *
 * Only "Distance" is ordered here. "Recommended" and "Rating" are the server's
 * order, and re-sorting them on the phone would shuffle page one every time
 * "Show more" added page two.
 */
export function orderLoadedHomes<T extends { location?: { distanceKm?: number | null } | null }>(
  homes: readonly T[],
  sort: DiscoverSort
): T[] {
  return sort === 'distance' ? [...homes].sort(byDistance) : [...homes];
}

/**
 * The items loaded so far, in the order the sheet asked for.
 *
 * The marketplace has no rating order on the server yet, so "Rating" orders
 * what has been loaded — sellers without a rating last, not as nought stars.
 */
export function orderLoadedItems<
  T extends { seller?: { rating?: { average?: number | null } | null } | null; location?: { distanceKm?: number | null } | null },
>(items: readonly T[], sort: DiscoverSort): T[] {
  if (sort === 'rating') {
    return [...items].sort((a, b) => (b.seller?.rating?.average ?? -1) - (a.seller?.rating?.average ?? -1));
  }
  if (sort === 'distance') {
    return [...items].sort(byDistance);
  }
  return [...items];
}

/**
 * A line saying why "Rating" changed nothing, or null when it did something.
 *
 * With no reviews anywhere the order is simply newest first, and a member who
 * tapped Rating and saw the same list deserves to know that is not a fault.
 */
export function unratedSortNote(
  sort: DiscoverSort,
  hosts: readonly ({ rating?: unknown } | null | undefined)[],
  noun: 'landlords' | 'sellers'
): string | null {
  if (sort !== 'rating' || hosts.length === 0) return null;
  if (hosts.some((host) => host?.rating)) return null;
  return noun === 'landlords'
    ? 'None of these landlords has been rated yet, so homes are shown newest first.'
    : 'None of these sellers has been rated yet, so items are shown newest first.';
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
