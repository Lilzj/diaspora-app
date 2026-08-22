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
 * `averageResponseMinutes` and `memberSince`. It carries **no rating, no
 * reputation level, no years on platform, no languages, no telephone number and
 * no country verifications**, because Trust owns those and the marketplace card
 * is not where they are published.
 *
 * They were declared required here, which is why every reader could assume them
 * — and it is the same root as the fabricated `rating: 4.8` and the two invented
 * `countryVerifications` that `marketplace/create.tsx` used to send. A type that
 * demands trust data the server does not supply is a type that asks its callers
 * to make it up.
 *
 * Optional means a normaliser can leave them absent and a component can render
 * the absence, which `CommunityTrustBadge` already does. Anything still
 * supplying them — the development fixtures — is unaffected.
 */
export interface SellerInfo {
  sellerId: string;
  name: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  rating?: number;
  reputationLevel?: ReputationLevel;
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
  price: number;
  currency: string; // e.g. GBP, MUR, USD, EUR, NGN, GHS...
  negotiable: boolean;
  quantity: number;
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
