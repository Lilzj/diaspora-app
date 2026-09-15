// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a home on a list, as the platform sends it
//
// **The Housing tab would crash the moment it found a home.** `/housing/search`
// answers `HousingListingCardResponse` — `landlord`, a `price` object, a
// `capacity` object — and Discover handed those rows to `HousingCard` and to its
// own origin filter as the client's `HousingListing`, which reads `host`,
// `rent`, `bedrooms`. `item.host.originCountry` on a row with no `host` is a
// TypeError in render. It never fired only because every search came back
// empty (see `lib/discover-scope.ts`); once searching worked, the first result
// would have taken the screen down.
//
// The listing page already bridged the same gap for one home
// (`app/housing/[id].tsx`, `hostFromLandlord`). This is the same bridge for a
// page of cards, and like it, it invents nothing: an undisclosed rent stays
// undefined and the card says so.
// ─────────────────────────────────────────────────────────────────────────────

import { hostFromLandlord, type LandlordSummaryWire } from './housing-host';
import type { HousingListing, HousingMediaRef } from '@/types/housing';

/** `HousingListingCardResponse`, loosely — every member optional but the id. */
export interface HousingCardWire {
  id: string;
  slug?: string | null;
  title?: string | null;
  summary?: string | null;
  accommodationTypeKey?: string | null;
  accommodationTypeName?: string | null;
  status?: string | null;
  price?: {
    isDisclosed?: boolean;
    amount?: number | null;
    currencyCode?: string | null;
    period?: string | null;
    depositAmount?: number | null;
    utilitiesIncluded?: boolean;
    internetIncluded?: boolean;
  } | null;
  capacity?: { bedrooms?: number | null; bathrooms?: number | null } | null;
  availability?: { availableFrom?: string | null } | null;
  location?: {
    countryCode?: string | null;
    regionName?: string | null;
    cityName?: string | null;
    neighborhoodName?: string | null;
    displayName?: string | null;
  } | null;
  stayPolicy?: { isSharedAccommodation?: boolean } | null;
  furnishedStatus?: string | null;
  coverImage?: HousingMediaRef | null;
  landlord?: LandlordSummaryWire | null;
  isLandlordVerified?: boolean;
  isFeatured?: boolean;
  publishedAt?: string | null;
  /** Since 15 Sep 2026, on a search made around a point. */
  distanceKm?: number | null;
}

/** `FurnishedStatus`, as the card's three words. */
const FURNISHED: Record<string, HousingListing['furnished']> = {
  Unfurnished: 'Unfurnished',
  PartlyFurnished: 'Partially Furnished',
  Furnished: 'Furnished',
  FullyEquipped: 'Furnished',
};

function readable(key: string | null | undefined): string {
  const words = (key ?? '').replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/**
 * "Available Now" when the home can be taken today, the date when it is later,
 * and nothing when the landlord gave none.
 */
function availabilityLabel(availableFrom: string | null | undefined, now: Date): string {
  if (!availableFrom) return '';
  const from = new Date(availableFrom);
  if (Number.isNaN(from.getTime())) return '';
  if (from.getTime() <= now.getTime()) return 'Available Now';
  return from.toISOString().slice(0, 10);
}

/** One card, in the shape `HousingCard` renders. */
export function toHousingCardListing(card: HousingCardWire, now: Date = new Date()): HousingListing {
  const price = card.price ?? {};
  const capacity = card.capacity ?? {};
  const location = card.location ?? {};
  const host = hostFromLandlord(card.landlord);

  return {
    id: card.id,
    title: card.title ?? '',
    description: card.summary ?? '',
    listingType: card.accommodationTypeName?.trim() || readable(card.accommodationTypeKey),
    propertyType: card.stayPolicy?.isSharedAccommodation ? 'Share' : 'Rent',
    bedrooms: capacity.bedrooms ?? 0,
    bathrooms: capacity.bathrooms ?? 0,
    // Undefined, not 0, when the landlord did not publish a figure.
    rent: price.isDisclosed === false || typeof price.amount !== 'number' ? undefined : price.amount,
    rentPeriod: price.period ?? undefined,
    currency: price.currencyCode ?? '',
    deposit: price.depositAmount ?? 0,
    billsIncluded: price.utilitiesIncluded ?? false,
    internetIncluded: price.internetIncluded ?? false,
    parkingAvailable: false,
    furnished: FURNISHED[card.furnishedStatus ?? ''] ?? 'Unfurnished',
    availabilityDate: availabilityLabel(card.availability?.availableFrom, now),
    leaseDuration: '',
    coverImage: card.coverImage ?? null,
    location: {
      cityName: location.cityName ?? '',
      areaName: location.neighborhoodName ?? '',
      addressLine: location.displayName ?? '',
      countryCode: location.countryCode ?? undefined,
      distanceKm: typeof card.distanceKm === 'number' ? card.distanceKm : undefined,
    },
    host: { ...host, isVerified: card.isLandlordVerified ?? host.isVerified },
    amenities: [],
    houseRules: [],
    lifestyleMatches: [],
    verificationStatus: (card.isLandlordVerified ?? host.isVerified) ? 'Verified' : 'Unverified',
    isFeatured: card.isFeatured ?? false,
    status: 'Active',
    createdAt: card.publishedAt ?? '',
    viewCount: 0,
  };
}

/** A page of cards, dropping any the server sent without an id. */
export function toHousingCardListings(cards: readonly HousingCardWire[], now: Date = new Date()): HousingListing[] {
  return cards.filter((card) => !!card?.id).map((card) => toHousingCardListing(card, now));
}
