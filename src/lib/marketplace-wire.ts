// ─────────────────────────────────────────────────────────────────────────────
// The listing on the wire, and the listing this application draws
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// `ListingResponse` groups a listing's facts into objects, and the screens read
// them flat under different names:
//
//   the screen wanted     the platform sends
//   ───────────────────   ────────────────────────────────────────────────
//   id                    listingId
//   price (a number)      price: { isDisclosed, amount, currency, … }
//   currency              price.currency
//   negotiable            price.isNegotiable
//   quantity              inventory.quantity
//   seller.name           seller.displayName
//   intent                listingType
//   images                media[] — identifiers, and private ones at that
//
// `seller.name` was the fatal one: `listing.seller.name.split(' ')` threw
// `Cannot read property 'split' of undefined` during render and took the
// process down — the same failure as the housing screen's `landlord`/`host`
// mismatch, on its sibling.
//
// Most of that was already fixed **inside the detail screen's fetch effect**,
// which meant it could not be tested, could not be reused by the next screen,
// and was invisible to the contract-drift check. Two fields were missed there
// and are fixed here: `intent` and `images`.
//
// Nothing is invented. An undisclosed price stays `undefined` and the render
// says so, rather than showing a zero somebody might act on.
// ─────────────────────────────────────────────────────────────────────────────

import type { ListingIntent, MarketplaceListing, SwapTerms, SwapTopUp } from '@/types/marketplace';

/** A listing as the platform sends it. Deliberately loose. */
export interface ListingWire {
  listingId?: string;
  id?: string;
  title?: string;
  slug?: string;
  description?: string | null;
  summary?: string | null;
  categoryKey?: string;
  categoryName?: string | null;
  listingType?: string;
  swapWants?: string | null;
  swapTopUp?: string | null;
  condition?: string;
  status?: string;
  price?: {
    isDisclosed?: boolean;
    amount?: number | null;
    currency?: string | null;
    currencyCode?: string | null;
    isNegotiable?: boolean;
    isFree?: boolean;
    minimumOffer?: number | null;
  } | null;
  inventory?: { quantity?: number | null; available?: number | null } | null;
  location?: Record<string, unknown> | null;
  fulfillment?: {
    offersPickup?: boolean;
    offersDelivery?: boolean;
    offersShipping?: boolean;
  } | null;
  media?: Array<{ mediaId?: string; role?: string; order?: number }> | null;
  seller?: {
    sellerId?: string;
    id?: string;
    displayName?: string;
    name?: string;
    isVerified?: boolean;
    badge?: string | null;
    logoMediaId?: string | null;
    providerId?: string | null;
    rating?: unknown;
    [key: string]: unknown;
  } | null;
  engagement?: { views?: number } | null;
  createdAt?: string;
  isFeatured?: boolean;
  [key: string]: unknown;
}

/**
 * What kind of listing this is, in the vocabulary the screens display.
 *
 * The platform's `ListingType` and the client's `ListingIntent` are different
 * vocabularies, and nothing was translating between them: `listing.intent` was
 * `undefined` everywhere, which showed as a **blank label** on the listing
 * header and, worse, made `intent !== 'Swap'` true on every listing.
 *
 * `'Buying Request'` and `'Donation'` are in the client's union with no
 * counterpart on the wire, so they can never be produced here. `'Exchange /
 * Swap'` has one since 15 Sep 2026, when the platform gained a `Swap` type.
 * `Auction` is refused at creation today and is mapped defensively rather than
 * left blank.
 */
export function listingIntent(listingType?: string): ListingIntent {
  switch (listingType) {
    case 'Wanted':
      return 'Wanted';
    case 'Giveaway':
      return 'Giving Away';
    case 'Swap':
      return 'Exchange / Swap';
    case 'FixedPrice':
    case 'Negotiable':
    case 'BusinessInventory':
    case 'Auction':
    default:
      return 'Selling';
  }
}

/**
 * Whether this listing can be bought through Diaspora.
 *
 * The gate used to read `intent !== 'Swap'`, against a value the platform has
 * never sent and the client's own union does not contain — it spells it
 * `'Exchange / Swap'`. So the condition was always true, and the case it was
 * reaching for went unguarded: **a `Wanted` listing is somebody asking for
 * something**, priced as a budget if at all, and offering a Buy button on
 * another member's request is offering to sell them their own advert.
 */
export function isPurchasable<
  T extends Pick<MarketplaceListing, 'price' | 'currency' | 'status' | 'intent'>,
>(listing: T): listing is T & { price: number; currency: string } {
  return (
    typeof listing.price === 'number' &&
    listing.price > 0 &&
    // **A currency is part of a price.** `ListingPriceResponse.Currency` is
    // nullable, and defaulting it — to GBP, say — would offer to take
    // somebody's money in a currency the seller never named. An amount with no
    // currency is not something anyone can be asked to pay.
    typeof listing.currency === 'string' &&
    listing.currency.length > 0 &&
    listing.status === 'Active' &&
    listing.intent !== 'Wanted' &&
    // A swap's price is the top-up somebody adds when the two things differ in
    // value — never the price of the item. Offering to take it as a payment
    // would sell the item for the difference.
    listing.intent !== 'Exchange / Swap'
  );
}

/**
 * The listing types a Discover intent filter means, as `SearchListingsRequest.
 * ListingTypes` takes them — or undefined for no filter.
 *
 * The screen sent `intent`, which the search never bound, so the filter did
 * nothing. "Buying Request" and "Donation" are the same types as "Wanted" and
 * "Giving Away" under other names.
 */
export function listingTypesForIntent(intent: string | null | undefined): string[] | undefined {
  switch (intent) {
    case 'Selling':
      return ['FixedPrice', 'Negotiable', 'BusinessInventory'];
    case 'Wanted':
    case 'Buying Request':
      return ['Wanted'];
    case 'Giving Away':
    case 'Donation':
      return ['Giveaway'];
    case 'Exchange / Swap':
      return ['Swap'];
    default:
      return undefined;
  }
}

// ── Swaps — 15 Sep 2026 ──────────────────────────────────────────────────────
//
// The platform carries a swap's terms as two well-known attributes on the
// listing (`SwapTerms` on the server): what the lister wants back, and who adds
// money when the two things are not worth the same. The listing's price is that
// top-up, and an even swap has no price at all.

/** The attribute key for what the lister would take in exchange. */
export const SWAP_WANTS_KEY = 'swap-wants';

/** The attribute key for who adds money: `none`, `seller-adds` or `buyer-adds`. */
export const SWAP_TOP_UP_KEY = 'swap-top-up';

/** A top-up direction, as the attribute value the server reads. */
export function swapTopUpAttributeValue(topUp: SwapTopUp): string {
  switch (topUp) {
    case 'SellerAdds':
      return 'seller-adds';
    case 'BuyerAdds':
      return 'buyer-adds';
    default:
      return 'none';
  }
}

/** A swap's terms off a card or a listing, or undefined for anything that is not a swap. */
export function swapTermsOf(wire: {
  listingType?: string | null;
  swapWants?: string | null;
  swapTopUp?: string | null;
}): SwapTerms | undefined {
  if ((wire.listingType ?? '').toLowerCase() !== 'swap') return undefined;

  const topUp: SwapTopUp =
    wire.swapTopUp === 'SellerAdds' || wire.swapTopUp === 'BuyerAdds' ? wire.swapTopUp : 'None';

  return { wants: wire.swapWants?.trim() ?? '', topUp };
}

/** "Swap for a road bike" — what a card shows where a price would go. */
export function describeSwapWants(terms: SwapTerms): string {
  return terms.wants ? `Swap for ${terms.wants}` : 'Swap';
}

/**
 * The top-up, as the person reading the listing meets it, or '' for an even
 * swap. An amount the listing does not state is not guessed at.
 */
export function describeSwapTopUp(
  terms: SwapTerms,
  amount: number | undefined | null,
  currencySymbol: string
): string {
  if (terms.topUp === 'None' || typeof amount !== 'number' || amount <= 0) return '';
  const money = `${currencySymbol}${amount}`;
  return terms.topUp === 'SellerAdds'
    ? `The lister adds ${money} on top`
    : `The lister asks for ${money} on top`;
}

/**
 * What the price should read as.
 *
 * Three states, not two. `price.isDisclosed === false` leaves the amount
 * absent, and the listing cards rendered that as a currency symbol followed by
 * the word "undefined" — the detail screen had already been taught to say
 * "Price on request"; the cards had not, and a card is where most people see a
 * listing.
 *
 * A free item and a price on request are different things and must not collapse
 * into each other: one costs nothing, the other costs an unknown amount.
 */
export function describeListingPrice(
  price: number | undefined | null,
  currencySymbol: string
): string {
  if (price == null) {
    return 'Price on request';
  }

  return price === 0 ? 'FREE' : `${currencySymbol}${price}`;
}

/**
 * The wire listing as the screens expect it.
 *
 * `gallery` and `coverImage` stay empty here on purpose: marketplace media is
 * private, so a URL cannot be built from an identifier the way it can
 * elsewhere. Each one needs `POST /media/{id}/signed-url`, which the screen
 * does asynchronously — see `galleryUris` there.
 */
export function toListing(wire: ListingWire): MarketplaceListing {
  const price = wire.price ?? {};
  const seller = wire.seller ?? {};

  return {
    ...(wire as object),
    id: wire.listingId ?? wire.id ?? '',
    title: wire.title ?? '',
    description: wire.description ?? wire.summary ?? '',
    // An undisclosed price is not a free one. Left undefined so the render can
    // say the price is on request rather than showing a zero.
    price: price.isDisclosed === false ? undefined : price.amount,
    currency: price.currency ?? price.currencyCode,
    negotiable: price.isNegotiable ?? false,
    quantity: wire.inventory?.quantity ?? undefined,
    intent: listingIntent(wire.listingType),
    swap: swapTermsOf(wire),
    seller: {
      ...seller,
      // `displayName` on the wire; the render wants `name`, and reading the
      // wrong one crashed this screen.
      name: seller.displayName ?? seller.name ?? 'Seller',
      sellerId: seller.sellerId ?? seller.id ?? '',
      isVerified: seller.isVerified ?? false,
      // Absent on the wire. Left undefined rather than invented — the render
      // guards each one.
      avatarUrl: seller.avatarUrl as string | undefined,
      contactPhone: seller.contactPhone as string | undefined,
      responseTime: seller.responseTime as string | undefined,
      languagesSpoken: seller.languagesSpoken as string[] | undefined,
    },
    viewCount: wire.engagement?.views ?? 0,
    deliveryAvailable: wire.fulfillment?.offersDelivery ?? false,
    pickupOnly:
      (wire.fulfillment?.offersPickup ?? false) &&
      !(wire.fulfillment?.offersDelivery ?? false) &&
      !(wire.fulfillment?.offersShipping ?? false),
  } as unknown as MarketplaceListing;
}
