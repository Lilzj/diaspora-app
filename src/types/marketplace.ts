import type { ReputationLevel } from './reputation';
import type { CountryVerificationSummary } from './verification';
import type { CountryRef } from './guide';

export type ListingIntent =
  | 'Selling'
  | 'Buying Request'
  | 'Giving Away'
  | 'Exchange / Swap'
  | 'Wanted'
  | 'Donation';

export type ListingCondition =
  | 'New'
  | 'Like New'
  | 'Very Good'
  | 'Good'
  | 'Fair';

export type ListingStatus =
  | 'Active'
  | 'Reserved'
  | 'Sold'
  | 'Expired'
  | 'Archived'
  | 'Hidden'
  | 'Draft';

export interface MarketplaceLocation {
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
}

/**
 * A seller, as far as this client is concerned.
 *
 * ── Why most of this is optional ─────────────────────────────────────────────
 *
 * `MarketplaceSellerSummary` — what `POST /marketplace/search` actually sends —
 * carries `sellerId`, `displayName`, `slug`, `sellerType`, `isVerified`,
 * `badge`, `logoMediaId`, `completedSales`, `cancellationRate`,
 * `averageResponseMinutes` and `memberSince`. It carries **no reputation level,
 * no years on platform, no languages, no telephone number and no country
 * verifications**, because Trust owns those and the marketplace card is not
 * where they are published.
 *
 * They were declared required here, which is why every reader could assume them
 * — and it is the same root as the fabricated `rating: 4.8` and the two invented
 * `countryVerifications` that `marketplace/create.tsx` used to send. A type that
 * demands trust data the server does not supply is a type that asks its callers
 * to make it up.
 *
 * **`rating` is now real, and is the one field on this list that changed sides.**
 * The module grew `SellerReview`, gated on a reservation reaching `Completed`,
 * and the summary serves `rating: { average, totalReviews, distribution }` —
 * **null when nobody has reviewed the seller**. It is structured rather than a
 * bare number precisely so that "unrated" cannot be spelled the same way as
 * "rated zero", which is what let the old `rating?: number` be defaulted to 4.8.
 *
 * Optional means a normaliser can leave them absent and a component can render
 * the absence, which `CommunityTrustBadge` already does. Anything still
 * supplying them — the development fixtures — is unaffected.
 */
/**
 * A seller's rating rollup, as `GET /marketplace/sellers/{id}/reviews` and every
 * seller summary send it.
 *
 * Only a completed purchase can produce a review, so this counts transactions
 * rather than opinions. `average` is meaningless unless `totalReviews > 0`.
 */
export interface SellerRating {
  /** One decimal place. Zero when there are no reviews — not a score. */
  average: number;
  totalReviews: number;
  /** Bucket counts keyed '1'…'5', for the proportional bars. */
  distribution: Record<string, number>;
}

export interface SellerInfo {
  sellerId: string;
  name: string;
  avatarUrl?: string | null;
  isVerified: boolean;

  /**
   * The seller's star rating, or **absent when nobody has reviewed them**.
   *
   * Never substitute a default. A seller nobody has bought from has no rating,
   * and that is a fact worth showing rather than papering over.
   */
  rating?: SellerRating | null;

  reputationLevel?: ReputationLevel;

  /**
   * When they joined. `SellerSummaryResponse.MemberSince` on the wire.
   *
   * Declared at last: the detail screen has always computed the seller's
   * tenure from it, and only typechecked because the listing was held as
   * `any`.
   */
  memberSince?: string | null;

  yearsOnPlatform?: number;
  responseTime?: string;
  languagesSpoken?: string[];
  contactPhone?: string;
  contactWhatsapp?: string;
  preferredContactMethod?: 'phone' | 'whatsapp' | 'email';
  countryVerifications?: CountryVerificationSummary[];
  totalHelpfulVotes?: number;
  guidesPublished?: number;
  providerVerified?: boolean;
  originCountry?: CountryRef;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  icon: string;
  parentCategoryId?: string;
  subcategories?: string[];
}

/**
 * A listing as this client's screens render it.
 *
 * **This is a view model, not the wire contract.** `MarketplaceListingCard` —
 * what the server sends — differs in four ways that matter, and every one of
 * them was being read wrong before `toMarketplaceListing` existed:
 *
 *   | this type     | the server sends                                  |
 *   |---------------|---------------------------------------------------|
 *   | `id`          | **`listingId`** — there is no `id` field at all    |
 *   | `price` number| **`price` object** `{ amount, currency, … }`       |
 *   | `coverImage`  | **`coverMediaId`** — an identifier, not a URL      |
 *   | `createdAt`   | **`publishedAt`**                                  |
 *
 * Reading `item.id` off a response keyed `listingId` yields `undefined`, and
 * `undefined` is not a type error when the response was cast rather than
 * checked — the same failure mode as DEFECT-007. Everything arriving from the
 * server must come through `toMarketplaceListing`.
 */
export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  /**
   * The asking price, when there is one to show.
   *
   * **Optional, because `ListingPriceResponse.IsDisclosed` can be false.** A
   * price on request is not a free item, and a zero here is a number somebody
   * would act on — so an undisclosed price stays absent and the render says
   * so.
   */
  price?: number;
  currency?: string; // e.g. GBP, MUR, USD, EUR, NGN, GHS...
  negotiable: boolean;
  /** Absent when the platform tracks no inventory for the listing. */
  quantity?: number;
  condition: ListingCondition;
  intent: ListingIntent;
  category: string; // matching category.id
  subcategory?: string;
  brand?: string;
  /** A media identifier, or empty when the listing has no photograph. */
  coverImage: string;
  gallery: string[];
  location: MarketplaceLocation;
  seller: SellerInfo;
  status: ListingStatus;
  createdAt: string;
  viewCount: number;
  isFeatured?: boolean;
  deliveryAvailable: boolean;
  pickupOnly: boolean;
}

/**
 * `MarketplaceListingCard`, as `POST /marketplace/search` and
 * `GET /marketplace/listings/{id}` actually send it.
 *
 * Declared so the mapping has something to be checked against. Every member is
 * optional except the identifier: a card the server widens should not stop the
 * list rendering, and a card missing a field the client wanted is a rendering
 * decision, not a parse failure.
 */
export interface MarketplaceListingCardResponse {
  listingId: string;
  title?: string;
  slug?: string | null;
  summary?: string | null;
  description?: string | null;
  categoryKey?: string | null;
  listingType?: string | null;
  condition?: string | null;
  status?: string | null;
  price?: {
    isDisclosed?: boolean;
    amount?: number | null;
    currency?: string | null;
    isNegotiable?: boolean;
    isFree?: boolean;
    minimumOffer?: number | null;
  } | null;
  available?: number | null;
  location?: {
    countryCode?: string | null;
    regionName?: string | null;
    cityName?: string | null;
    neighbourhood?: string | null;
    areaId?: string | null;
    displayName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  coverMediaId?: string | null;
  tags?: string[] | null;
  seller?: {
    sellerId?: string;
    displayName?: string | null;
    slug?: string | null;
    sellerType?: string | null;
    isVerified?: boolean;
    badge?: string | null;
    logoMediaId?: string | null;
    completedSales?: number | null;
    cancellationRate?: number | null;
    averageResponseMinutes?: number | null;
    memberSince?: string | null;
    /** Null when nobody has reviewed this seller. Never default it. */
    rating?: SellerRating | null;
  } | null;
  isFeatured?: boolean;
  isVerified?: boolean;
  offersDelivery?: boolean;
  offersShipping?: boolean;
  viewCount?: number | null;
  saveCount?: number | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  isSaved?: boolean;
  distanceKm?: number | null;
}

export interface MarketplaceFilters {
  query?: string;
  intent?: ListingIntent;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: ListingCondition;
  brand?: string;
  distanceRadius?: number;
  verifiedSellerOnly?: boolean;
  negotiable?: boolean;
  deliveryAvailable?: boolean;
  pickupOnly?: boolean;
  freeItemsOnly?: boolean;
  buyingRequestsOnly?: boolean;
}
