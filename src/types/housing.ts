import type { CountryRef } from './guide';

export interface HousingLocation {
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  /**
   * ISO 3166-1 alpha-2.
   *
   * Remediation Wave A′: the server has always returned this — it is the one
   * required field on `HousingLocationResponse` — and the client's model omitted
   * it, so anything that needed to scope by country had to fall back to a city
   * name. Optional here rather than required because the fixtures predate it.
   */
  countryCode?: string;
}

/**
 * A landlord's rating rollup, as `GET /housing/landlords/{id}/reviews` and every
 * landlord summary send it.
 *
 * Only a reservation that reached `Occupied` can produce a review, so this counts
 * tenancies rather than opinions. `average` is meaningless unless
 * `totalReviews > 0`.
 */
export interface LandlordRating {
  /** One decimal place. Zero when there are no reviews — not a score. */
  average: number;
  totalReviews: number;
  /** Bucket counts keyed '1'…'5', for the proportional bars. */
  distribution: Record<string, number>;
}

/**
 * The landlord behind a listing.
 *
 * ── Why almost everything here is optional ───────────────────────────────────
 *
 * **The wire calls this `landlord`, and this client called it `host`.** The
 * listing read returns `LandlordSummaryResponse` under `landlord`, so
 * `listing.host` was `undefined` and `listing.host.name.substring(0, 1)` threw —
 * the housing detail screen could not render a real listing at all. The screen
 * now normalises `landlord` into this shape at the fetch boundary.
 *
 * `LandlordSummaryResponse` carries `id`, `slug`, `displayName`, `kind`,
 * `isVerified`, `badge`, `logoMediaId`, `providerId` and `rating`. It carries
 * **no reputation level, no years on platform, no languages, no telephone number
 * and no email address** — so those are optional, and a screen must render their
 * absence rather than assume them. They were declared required, which is how the
 * host panel came to promise a tenure and a language list nothing supplies.
 */
export interface HousingHost {
  /** The landlord profile id. Not a provider id — see `providerId`. */
  landlordId: string;
  name: string;
  slug?: string;
  /** Individual, EstateAgent, PropertyManager, Hostel, Hotel and the rest. */
  kind?: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  /** Trust's badge label, when there is one. Rendered, never interpreted. */
  badge?: string | null;
  logoMediaId?: string | null;

  /**
   * The star rating, or **absent when nobody has reviewed them**.
   *
   * Never substitute a default. A landlord nobody has rented from has no rating,
   * and that is a fact worth showing rather than papering over.
   */
  rating?: LandlordRating | null;

  /** The B7 provider behind an agency or hostel, where there is one. */
  providerId?: string | null;

  reputationLevel?: string;
  yearsOnPlatform?: number;
  responseTime?: string;
  languagesSpoken?: string[];
  contactPhone?: string;
  contactEmail?: string;
  preferredContactMethod?: 'phone' | 'email' | 'whatsapp' | 'in_app';
  originCountry?: CountryRef;
}

export interface HousingListing {
  id: string;
  title: string;
  description: string;
  listingType: string; // e.g. 'Apartment', 'Studio', 'Single Room', 'Shared Room', 'Roommate Needed', 'Family House', 'Hostel', 'Student Accommodation'
  propertyType: string; // 'Rent' or 'Share' (e.g. room vs complete flat)
  bedrooms: number;
  bathrooms: number;
  rent: number;
  currency: string; // GBP, MUR, USD, EUR, etc.
  deposit: number;
  billsIncluded: boolean;
  internetIncluded: boolean;
  parkingAvailable: boolean;
  furnished: 'Furnished' | 'Unfurnished' | 'Partially Furnished';
  availabilityDate: string; // YYYY-MM-DD or custom string
  leaseDuration: string; // e.g. '6 Months', '1 Year', 'Flexible'
  coverImage: string;
  gallery: string[];
  location: HousingLocation;
  host: HousingHost;
  amenities: string[];
  houseRules: string[];
  lifestyleMatches: string[]; // e.g., ['Student Friendly', 'Quiet Environment']
  verificationStatus: 'Verified' | 'Unverified';
  isFeatured?: boolean;
  status: 'Active' | 'Draft';
  createdAt: string;
  viewCount: number;
}

export interface HousingFilters {
  query?: string;
  propertyType?: string; // listing category (Apartment, Studio...)
  listingType?: string; // Rent / Share
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  bedrooms?: number;
  bathrooms?: number;
  furnished?: string;
  billsIncluded?: boolean;
  internetIncluded?: boolean;
  parking?: boolean;
  balcony?: boolean;
  airConditioning?: boolean;
  petFriendly?: boolean;
  smokingAllowed?: boolean;
  verifiedHostOnly?: boolean;
  distanceRadius?: number;
  lifestyleMatches?: string[];
}
