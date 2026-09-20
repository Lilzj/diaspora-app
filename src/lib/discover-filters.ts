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
// **"Distance" and the items tab's "Rating" were still sorted on the phone**,
// twenty at a time, so a closer home or a better-rated seller on page two
// stayed below page one. Since later that night the server orders both across
// every page — distance measured from where a home is published, never its
// exact position — and a tab offers only the orders it can honour
// (`sortOptionsFor`). When the server cannot measure, it says which order it
// used instead, and the tab says so too (`distanceSortNote`).
//
// The screen spreads these into its requests, and the binding-drift ledger
// drives the same functions, so a renamed parameter fails a test instead of
// quietly widening a search.
// ─────────────────────────────────────────────────────────────────────────────

import { countryCurrency } from './country-currency';
import { formatKm, housingScopeParams, marketplaceScopeParams, type DiscoverScope } from './discover-scope';
import { listingTypesForIntent } from './marketplace-wire';
import { toListingCondition } from './marketplace-categories';
import { unwrapEnvelope } from './platform-envelope';

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

// ── Sorting ──────────────────────────────────────────────────────────────────

/** The sheet's three sort chips. */
/**
 * The employment types the Jobs sheet offers, and the names `GET /jobs` binds.
 *
 * **The hyphen is the whole problem.** The route parses `type` with
 * `Enum.TryParse(..., ignoreCase: true)` against `JobType`, whose members are
 * `FullTime`, `PartTime` and so on. `Full-Time` does not parse, and an
 * unparseable value is not an error — the filter is dropped and every job comes
 * back. That is the failure the providers category already taught this screen:
 * a filter that looks like it works and does not.
 */
export const JOB_TYPE_WIRE_NAMES: Readonly<Record<string, string>> = {
  'Full-Time': 'FullTime',
  'Part-Time': 'PartTime',
  Contract: 'Contract',
  Temporary: 'Temporary',
  Freelance: 'Freelance',
  Volunteer: 'Volunteer',
};

export const JOB_TYPE_CHOICES: readonly string[] = Object.keys(JOB_TYPE_WIRE_NAMES);

/**
 * The Jobs sheet's filters, as `GET /jobs` binds them.
 *
 * **Two, because two is what the platform can answer.** The sheet also carried
 * "Accommodation / Meals / Transport included" toggles. No job search filters on
 * those, the browse row does not carry them — `JobCard`'s own header records
 * that `benefitsFlags` "the wire has none of" — and a posting's benefits are
 * free-text lines, not three booleans. They set state nothing read, which is a
 * promise the screen could not keep, so they are gone rather than wired.
 *
 * An unknown employment type sends nothing rather than something the route will
 * silently discard.
 */
export function jobFilterParams(
  employmentType: string | null | undefined,
  verifiedEmployersOnly: boolean
): { type?: string; verified?: true } {
  const type = employmentType ? JOB_TYPE_WIRE_NAMES[employmentType] : undefined;

  return {
    ...(type ? { type } : {}),
    ...(verifiedEmployersOnly ? { verified: true as const } : {}),
  };
}

export type DiscoverSort = 'default' | 'distance' | 'rating';

export const SORT_LABELS: Readonly<Record<DiscoverSort, string>> = {
  default: 'Recommended',
  distance: 'Distance',
  rating: 'Rating',
};

/**
 * The sort chips a tab offers: only orders its server applies across every
 * page.
 *
 * Items and jobs have no position, so "Distance" could never mean anything to
 * them. Jobs and guides have no ratings, and their routes read neither word —
 * the chips were there and changed nothing.
 */
export function sortOptionsFor(tab: string): DiscoverSort[] {
  switch (tab) {
    case 'Housing':
    case 'Providers':
      return ['default', 'distance', 'rating'];
    case 'Marketplace':
      return ['default', 'rating'];
    default:
      return [];
  }
}

/**
 * The order a tab searches in: the chip, unless the tab does not offer it.
 *
 * The chip is shared by every tab, so "Distance" chosen on Housing must not
 * follow the member to the items tab as an order it cannot give.
 */
export function effectiveSort(tab: string, sort: DiscoverSort): DiscoverSort {
  return sortOptionsFor(tab).includes(sort) ? sort : 'default';
}

/**
 * The order the housing server applies, so page two continues page one.
 *
 * "Recommended" is the server's own order (featured, then newest). "Rating" is
 * `HighestRated`. "Distance" is `Nearest`, which the server honours for a
 * search within a distance, measuring each home from the position a stranger
 * is shown — so the order reveals nothing the distance on each card does not.
 */
export function housingSortParam(sort: DiscoverSort): 'HighestRated' | 'Nearest' | undefined {
  if (sort === 'rating') return 'HighestRated';
  if (sort === 'distance') return 'Nearest';
  return undefined;
}

/** The order the marketplace server applies: by the seller's rating, or its own. */
export function marketplaceSortParam(sort: DiscoverSort): 'HighestRated' | undefined {
  return sort === 'rating' ? 'HighestRated' : undefined;
}

/** The order a search reports it answered in (`appliedSort`), or null when it did not say. */
export function appliedSortOf(body: unknown): string | null {
  const payload = unwrapEnvelope<Record<string, unknown>>(body);
  const applied = payload && typeof payload === 'object' ? payload.appliedSort : undefined;
  return typeof applied === 'string' && applied ? applied : null;
}

/**
 * A line saying why "Distance" did not put the list in distance order, or null
 * when it did.
 *
 * The server orders by distance only within a distance, and only up to a
 * thousand homes or services; otherwise it answers in its usual order and
 * names that order. A member who tapped Distance and saw the same list is owed
 * the reason, and what to change.
 */
export function distanceSortNote(
  tab: 'Housing' | 'Providers',
  sort: DiscoverSort,
  appliedSort: string | null | undefined,
  scope: DiscoverScope
): string | null {
  if (sort !== 'distance' || !appliedSort) return null;
  if (appliedSort === 'Nearest' || appliedSort === 'Distance') return null;

  const rows = tab === 'Housing' ? 'homes' : 'providers';
  const order = tab === 'Housing' ? 'newest first' : 'in the recommended order';

  return scope.kind === 'distance'
    ? `There are too many ${rows} within ${formatKm(scope.radiusKm)} to sort by distance, so they are shown ${order}. Choose a shorter distance to sort by distance.`
    : `Sorting by distance needs a search within a distance, such as 5 km, so ${rows} are shown ${order}.`;
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
 * place is the member's town or country, never a radius, and there is no
 * distance order.
 */
export function marketplaceSearchBody(
  query: string,
  scope: DiscoverScope,
  filters: MarketplaceSheetFilters,
  sort: DiscoverSort = 'default',
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
    // Likewise "Rating", which ordered the loaded items and left page two's below them.
    sort: marketplaceSortParam(sort),
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
