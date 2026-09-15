/**
 * A home on a list, as the platform sends it — 15 Sep 2026.
 *
 * Discover handed `HousingListingCardResponse` rows to a card and a filter that
 * read `host`, `rent` and `bedrooms`; `item.host.originCountry` threw on the
 * first real home. The fixture below is what production served for Rose Hill.
 */
import { toHousingCardListing, toHousingCardListings, type HousingCardWire } from '../housing-cards';

const NOW = new Date('2026-09-15T12:00:00Z');

function roseHill(overrides: Partial<HousingCardWire> = {}): HousingCardWire {
  return {
    id: '01a0a01d-0000-7000-8000-000000000001',
    slug: 'single-room-in-a-shared-house-rose-hill',
    title: 'Single room in a shared house, Rose Hill',
    summary: 'A bright room near the Plaza.',
    accommodationTypeKey: 'shared-room',
    accommodationTypeName: 'Room in a shared house',
    status: 'Available',
    price: { isDisclosed: true, amount: 9500, currencyCode: 'MUR', period: 'PerMonth', depositAmount: 9500, utilitiesIncluded: true },
    capacity: { bedrooms: 1, bathrooms: 1 },
    availability: { availableFrom: '2026-09-01T00:00:00Z' },
    location: { countryCode: 'MU', cityName: 'Rose Hill', neighborhoodName: null, displayName: 'Rose Hill, MU' },
    stayPolicy: { isSharedAccommodation: true },
    furnishedStatus: 'PartlyFurnished',
    coverImage: { mediaId: 'media-1', role: 'Cover' },
    landlord: { id: 'landlord-1', ownerUserId: 'david', displayName: 'Mensah Property Rentals', isVerified: false },
    isLandlordVerified: false,
    isFeatured: false,
    publishedAt: '2026-09-10T09:00:00Z',
    distanceKm: 0.3,
    ...overrides,
  };
}

describe('a home card', () => {
  it('names the host from the landlord, and never throws on the origin filter', () => {
    const listing = toHousingCardListing(roseHill(), NOW);

    expect(listing.host.name).toBe('Mensah Property Rentals');
    expect(listing.host.ownerUserId).toBe('david');
    // What Discover's origin filter reads — present, and simply unknown.
    expect(listing.host.originCountry?.code).toBeUndefined();
  });

  it('flattens the rent, the rooms and the place the card reads', () => {
    const listing = toHousingCardListing(roseHill(), NOW);

    expect(listing.rent).toBe(9500);
    expect(listing.rentPeriod).toBe('PerMonth');
    expect(listing.currency).toBe('MUR');
    expect(listing.billsIncluded).toBe(true);
    expect(listing.bedrooms).toBe(1);
    expect(listing.furnished).toBe('Partially Furnished');
    expect(listing.listingType).toBe('Room in a shared house');
    expect(listing.propertyType).toBe('Share');
    expect(listing.location.cityName).toBe('Rose Hill');
    expect(listing.location.distanceKm).toBe(0.3);
    expect(listing.availabilityDate).toBe('Available Now');
  });

  it('leaves an undisclosed rent undefined, so the card says "Price on request"', () => {
    const listing = toHousingCardListing(
      roseHill({ price: { isDisclosed: false, amount: null, currencyCode: null, period: null } }),
      NOW
    );

    expect(listing.rent).toBeUndefined();
  });

  it('gives a later date rather than "Available Now" for a home not yet free', () => {
    expect(toHousingCardListing(roseHill({ availability: { availableFrom: '2026-10-01T00:00:00Z' } }), NOW).availabilityDate).toBe(
      '2026-10-01'
    );
  });

  it('has no distance when the search had no point', () => {
    expect(toHousingCardListing(roseHill({ distanceKm: null }), NOW).location.distanceKm).toBeUndefined();
  });

  it('drops a row with no id rather than rendering a card that goes nowhere', () => {
    expect(toHousingCardListings([roseHill(), { id: '' } as HousingCardWire], NOW)).toHaveLength(1);
  });
});
