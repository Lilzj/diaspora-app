import type MockAdapter from 'axios-mock-adapter';
import { mockMarketplaceListings } from '../marketplace-data';
import { mockCommunityUpdates } from '../community-data';
import { mockJobs } from '../jobs-data';
import { mockHousingListings } from '../housing-data';
import { mockListings } from '../data';
import { mediaContentPath } from './media';
import type { MarketplaceListing } from '@/types/marketplace';
import { getDistanceKm } from '@/utils/geo';
import { platformProblem } from '../platform-problem';

/**
 * Remediation Wave E — what a created listing's photographs are made of.
 *
 * `CreateListingRequest.MediaIds` is `IReadOnlyList<Guid>?`, documented as
 * "Media identifiers to attach at once, **cover first**. Uploaded through B5
 * beforehand." There is no role field: position 0 is the cover by convention,
 * which is why `marketplace/create.tsx` puts the cover photograph at the head of
 * the array and why the member's gallery ordering in step 5 is load-bearing
 * rather than cosmetic. Housing's contract takes the opposite shape — an
 * explicit `role` per entry — and the two screens differ for that reason alone.
 *
 * This handler used to read `data.coverImage` and fall back to
 * `'https://images.unsplash.com/photo-1511556532299-…'`. The screens stopped
 * sending `coverImage` in this wave, so **every** listing created against the
 * mock was stored with the mock's own stock photograph — including the swap
 * composer, which sends no media at all and never has. The defect this wave
 * removed from the client was still alive on this side of the wire.
 *
 * A listing created with no photograph now comes back with `coverImage: ''` and
 * `gallery: []`, and the cards and the detail gallery render an explicit "no
 * photo" state. Where there is one, the stored string is `MediaUrlFactory`'s own
 * route form, `/api/v1/media/{id}/content`, derived from the identifier — see
 * the longer note in `handlers/housing.ts` for why a route rather than a
 * reference, and why that is still second-best.
 */
function mediaIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

// In-memory memory store for custom marketplace listings created in the active session
let customListings: MarketplaceListing[] = [];

export function setupMarketplaceMocks(mock: MockAdapter) {
  /**
   * POST /marketplace/search — Remediation Wave A′.
   *
   * The real search is a POST with a body; `GET /marketplace` is a *dashboard*
   * and ignores filters entirely. This handler existed only in the GET form, so
   * a development build filtered listings that production would have returned
   * unfiltered — the mock was more capable than the route it stood for.
   *
   * The response is the platform's hand-rolled cursor page, and it names its
   * total `totalMatches` rather than `totalCount`. That difference is real and
   * is why `lib/platform-envelope.ts` normalises rather than assuming.
   */
  mock.onPost(/\/marketplace\/search$/).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');
    const text = body.text ? String(body.text).toLowerCase() : '';
    const city = body.city ? String(body.city).toLowerCase() : '';
    const lat = typeof body.latitude === 'number' ? body.latitude : null;
    const lon = typeof body.longitude === 'number' ? body.longitude : null;
    const radiusKm = typeof body.radiusKm === 'number' ? body.radiusKm : null;

    let items = [...customListings, ...mockMarketplaceListings];

    if (text) {
      items = items.filter(
        (listing) =>
          listing.title.toLowerCase().includes(text) ||
          (listing.description ?? '').toLowerCase().includes(text)
      );
    }
    if (city) {
      items = items.filter((l) => (l.location?.cityName ?? '').toLowerCase() === city);
    }
    if (typeof body.minimumPrice === 'number') {
      items = items.filter((l) => (l.price ?? 0) >= body.minimumPrice);
    }
    if (typeof body.maximumPrice === 'number') {
      items = items.filter((l) => (l.price ?? 0) <= body.maximumPrice);
    }
    if (body.verifiedSellersOnly === true) {
      items = items.filter((l) => l.seller?.isVerified);
    }
    if (lat !== null && lon !== null) {
      items = items
        .map((l) => {
          const latitude = l.location?.latitude;
          const longitude = l.location?.longitude;
          if (latitude == null || longitude == null) return { listing: l, distanceKm: null };
          return { listing: l, distanceKm: getDistanceKm(lat, lon, latitude, longitude) };
        })
        .filter((row) => radiusKm === null || row.distanceKm === null || row.distanceKm <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
        .map((row) =>
          row.distanceKm === null
            ? row.listing
            : ({ ...row.listing, location: { ...row.listing.location, distanceKm: row.distanceKm } } as MarketplaceListing)
        );
    }

    return [
      200,
      { data: { items, nextCursor: null, hasMore: false, totalMatches: items.length } },
    ];
  });

  // GET /marketplace (the dashboard surface — filters are NOT applied by the
  // real route; this handler keeps its filtering only because existing tests
  // depend on it, and no production call site sends filters here any more.)
  mock.onGet(/\/marketplace$/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';
    const category = params.category ? String(params.category) : '';
    const intent = params.intent ? String(params.intent) : '';
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';
    
    // Proximity parameters
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;
    const radiusKm = params.radiusKm ? Number(params.radiusKm) : null;
    const distanceRadius = params.distanceRadius ? Number(params.distanceRadius) : radiusKm;
    const sortBy = params.sortBy ? String(params.sortBy) : '';

    const minPrice = params.minPrice ? Number(params.minPrice) : null;
    const maxPrice = params.maxPrice ? Number(params.maxPrice) : null;
    const condition = params.condition ? String(params.condition) : '';
    
    // Booleans
    const verifiedSellerOnly = params.verifiedSellerOnly === 'true';
    const negotiable = params.negotiable === 'true';
    const deliveryAvailable = params.deliveryAvailable === 'true';
    const pickupOnly = params.pickupOnly === 'true';
    const freeItemsOnly = params.freeItemsOnly === 'true';
    const buyingRequestsOnly = params.buyingRequestsOnly === 'true';

    const allListings = [...customListings, ...mockMarketplaceListings];

    let filtered = allListings.filter((listing) => {
      // 1. Text Search (title, description, brand)
      if (query) {
        const titleMatch = listing.title.toLowerCase().includes(query);
        const descMatch = listing.description.toLowerCase().includes(query);
        const brandMatch = listing.brand?.toLowerCase().includes(query) || false;
        if (!titleMatch && !descMatch && !brandMatch) return false;
      }

      // 2. Category
      if (category && category !== 'All' && listing.category !== category) return false;

      // 3. Intent
      if (intent && listing.intent !== intent) return false;

      // 4. City Name (only if coordinates are NOT used for distance checking)
      if (cityName && (lat === null || lon === null) && listing.location.cityName.toLowerCase() !== cityName) return false;

      // 5. Price bounds
      // A listing whose price is not disclosed matches no price bound. It is
      // not zero and it is not infinite; it is unknown, and excluding it is the
      // honest answer to "under 500".
      if (minPrice !== null && (listing.price == null || listing.price < minPrice)) return false;
      if (maxPrice !== null && (listing.price == null || listing.price > maxPrice)) return false;

      // 6. Condition
      if (condition && listing.condition !== condition) return false;

      // 7. Proximity Distance
      if (lat !== null && lon !== null && listing.location.latitude && listing.location.longitude) {
        const dist = getDistanceKm(lat, lon, listing.location.latitude, listing.location.longitude);
        if (distanceRadius !== null && dist > distanceRadius) return false;
      } else if (distanceRadius !== null && listing.location.distanceKm !== undefined) {
        if (listing.location.distanceKm > distanceRadius) return false;
      }

      // 8. Seller Verification
      if (verifiedSellerOnly && !listing.seller.isVerified) return false;

      // 9. Negotiable
      if (negotiable && !listing.negotiable) return false;

      // 10. Delivery / Pickup
      if (deliveryAvailable && !listing.deliveryAvailable) return false;
      if (pickupOnly && !listing.pickupOnly) return false;

      // 11. Free items
      if (freeItemsOnly && listing.price !== 0 && listing.intent !== 'Giving Away') return false;

      // 12. Buying Requests
      if (buyingRequestsOnly && listing.intent !== 'Buying Request' && listing.intent !== 'Wanted') return false;

      // Filter out drafts or archived listings
      const allowedStatuses = ['Active', 'Reserved', 'Sold'];
      if (!allowedStatuses.includes(listing.status)) return false;

      return true;
    });

    // Inject dynamic distances
    let responseData = filtered.map((listing) => {
      if (lat !== null && lon !== null && listing.location.latitude && listing.location.longitude) {
        return {
          ...listing,
          location: {
            ...listing.location,
            distanceKm: getDistanceKm(lat, lon, listing.location.latitude, listing.location.longitude),
          },
        };
      }
      return listing;
    });

    // Proximity Sorting
    if (sortBy === 'distance' || (lat !== null && lon !== null && sortBy !== 'rating')) {
      responseData.sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
    } else if (sortBy === 'rating') {
      responseData.sort((a, b) => (b.seller.rating?.average ?? -1) - (a.seller.rating?.average ?? -1));
    }

    return [200, {
      data: responseData,
      pagination: {
        page: params.page || 1,
        pageSize: params.pageSize || 20,
        totalCount: filtered.length,
        totalPages: Math.ceil(filtered.length / (params.pageSize || 20)),
        hasNextPage: false,
      }
    }];
  });

  // GET /marketplace/:id (detail & cross-module integration)
  mock.onGet(/\/marketplace\/listings\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';
    const allListings = [...customListings, ...mockMarketplaceListings];
    const listing = allListings.find((item) => item.id === id);

    if (listing) {
      // Cross-module logic: Find items in the same city or nearby neighborhood
      const itemCity = listing.location.cityName.toLowerCase();
      const itemArea = listing.location.areaName.toLowerCase();

      // Surfaced Nearby Community Updates (up to 3)
      const nearbyUpdates = mockCommunityUpdates.filter((up) => 
        up.location.cityName.toLowerCase() === itemCity && up.status === 'active'
      ).slice(0, 3);

      // Surfaced Nearby Jobs (up to 3)
      const nearbyJobs = mockJobs.filter((job) => 
        job.location.cityName.toLowerCase() === itemCity
      ).slice(0, 3);

      // Surfaced Nearby Housing options (up to 3)
      const nearbyHousing = mockHousingListings.filter((h) => 
        h.location.cityName.toLowerCase() === itemCity && h.status === 'Active'
      ).slice(0, 3);

      // Surfaced Nearby Providers/Shops (up to 3)
      const nearbyProviders = mockListings.filter((prov) => 
        prov.location.cityName.toLowerCase() === itemCity && prov.isOpenNow
      ).slice(0, 3);

      // Similar listings from same category (excluding current item)
      const similarListings = allListings.filter((item) => 
        item.category === listing.category && item.id !== listing.id && item.status === 'Active'
      ).slice(0, 4);

      // Nearby alternatives (same city but different category, close proximity)
      const nearbyAlternatives = allListings.filter((item) => 
        item.location.cityName.toLowerCase() === itemCity && item.id !== listing.id && item.status === 'Active'
      ).slice(0, 4);

      return [200, {
        data: listing,
        nearbyUpdates,
        nearbyJobs,
        nearbyHousing,
        nearbyProviders,
        similarListings,
        nearbyAlternatives
      }];
    } else {
      return platformProblem(404, `Marketplace Listing ${id} not found`);
    }
  });

  // POST /marketplace (publish listing)
  mock.onPost(/\/marketplace\/listings$/).reply((config) => {
    try {
      const data = JSON.parse(config.data);

      // `mediaIds: string[]`, cover at index 0.
      const mediaIds = mediaIdsFrom(data.mediaIds);

      const newListing: MarketplaceListing = {
        id: `market-custom-${Date.now()}`,
        title: data.title || 'Untitled Marketplace Item',
        description: data.description || '',
        price: data.price !== undefined ? Number(data.price) : 0,
        currency: data.currency || 'GBP',
        negotiable: !!data.negotiable,
        quantity: Number(data.quantity) || 1,
        condition: data.condition || 'New',
        intent: data.intent || 'Selling',
        category: data.category || 'other',
        subcategory: data.subcategory || '',
        brand: data.brand || '',
        // No photograph in, no photograph out. The swap composer sends no media
        // at all, and its listings now say so.
        coverImage: mediaIds.length > 0 ? mediaContentPath(mediaIds[0]) : '',
        gallery: mediaIds.map(mediaContentPath),
        location: data.location || {
          cityName: 'London',
          areaName: 'Peckham',
          addressLine: '',
        },
        seller: data.seller || {
          sellerId: 'user-123',
          name: 'Amara Kone',
          avatarUrl: null,
          isVerified: true,
          rating: 4.8,
          reputationLevel: 'VerifiedResident',
          yearsOnPlatform: 2,
          responseTime: 'Immediate',
          languagesSpoken: ['English', 'French'],
          contactPhone: '+44 7700 900123',
          contactWhatsapp: '+44 7700 900123',
          preferredContactMethod: 'whatsapp',
          countryVerifications: [
            { countryCode: 'CI', countryName: "Côte d'Ivoire", flag: '🇨🇮', arrivalYear: 2000, yearsOfResidence: 26, isVerified: true, expertiseAreas: ['Food'] },
            { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', arrivalYear: 2024, yearsOfResidence: 2, isVerified: true, expertiseAreas: ['Culture'] },
          ],
          totalHelpfulVotes: 45,
          guidesPublished: 1,
          providerVerified: true,
          originCountry: { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' }
        },
        status: data.status || 'Active',
        createdAt: new Date().toISOString(),
        viewCount: 0,
        deliveryAvailable: !!data.deliveryAvailable,
        pickupOnly: !!data.pickupOnly
      };

      customListings.unshift(newListing);
      console.log('[MOCK] Saved new marketplace listing:', newListing.id);
      return [201, { data: newListing }];
    } catch (err) {
      return platformProblem(400, 'Invalid marketplace listing payload');
    }
  });

  // PUT /marketplace/:id (update details / mark status)
  mock.onPut(/\/marketplace\/listings\/[a-zA-Z0-9_-]+$/).reply((config) => {
    try {
      const url = config.url || '';
      const id = url.split('/').pop() || '';
      const data = JSON.parse(config.data);

      const idx = customListings.findIndex((item) => item.id === id);
      if (idx !== -1) {
        customListings[idx] = { ...customListings[idx], ...data };
        return [200, { data: customListings[idx] }];
      }

      const staticListing = mockMarketplaceListings.find((item) => item.id === id);
      if (staticListing) {
        const updated = { ...staticListing, ...data };
        customListings.unshift(updated);
        return [200, { data: updated }];
      }

      return platformProblem(404, `Marketplace Listing ${id} not found`);
    } catch (err) {
      return platformProblem(400, 'Invalid payload');
    }
  });

  // DELETE /marketplace/:id (delete listing)
  mock.onDelete(/\/marketplace\/listings\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';

    const idx = customListings.findIndex((item) => item.id === id);
    if (idx !== -1) {
      customListings.splice(idx, 1);
    }
    return [200, { success: true }];
  });

  // GET /marketplace/sellers/:id (seller profile)
  mock.onGet(/\/marketplace\/sellers\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const sellerId = url.split('/').pop() || '';
    const allListings = [...customListings, ...mockMarketplaceListings];

    const ref = allListings.find((item) => item.seller.sellerId === sellerId);

    if (ref) {
      const sellerDetails = {
        ...ref.seller,
        description: `Active seller on the Diaspora Marketplace in ${ref.location.cityName}. Highly trusted, providing quality exchanges and fast communication.`,
        followerCount: 15,
        responseRate: '100%',
        memberSince: `${2026 - (ref.seller.yearsOnPlatform ?? 0)}`,
      };

      const sellerListings = allListings.filter((item) => item.seller.sellerId === sellerId);

      return [200, {
        data: {
          seller: sellerDetails,
          listings: sellerListings
        }
      }];
    } else {
      return platformProblem(404, `Seller profile ${sellerId} not found`);
    }
  });
}
