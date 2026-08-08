import type MockAdapter from 'axios-mock-adapter';
import { mockHousingListings } from '../housing-data';
import type { HousingListing } from '@/types/housing';
import { getDistanceKm } from '@/utils/geo';

// A dynamic memory store for housing listings created during this user session
let customHousing: HousingListing[] = [];

export function setupHousingMocks(mock: MockAdapter) {
  // GET /housing (search/filter/list)
  mock.onGet(/\/housing$/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';
    const category = params.category ? String(params.category) : ''; // mapping to propertyType
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';
    
    // Proximity parameters
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;
    const radiusKm = params.radiusKm ? Number(params.radiusKm) : null;
    const distanceFilter = params.distanceRadius ? Number(params.distanceRadius) : radiusKm;
    const sortBy = params.sortBy ? String(params.sortBy) : '';

    const minPrice = params.minPrice ? Number(params.minPrice) : null;
    const maxPrice = params.maxPrice ? Number(params.maxPrice) : null;
    const bedrooms = params.bedrooms ? Number(params.bedrooms) : null;
    const bathrooms = params.bathrooms ? Number(params.bathrooms) : null;
    
    // Boolean perks
    const billsIncluded = params.billsIncluded === 'true';
    const internetIncluded = params.internetIncluded === 'true';
    const parkingAvailable = params.parkingAvailable === 'true';
    const verifiedHostOnly = params.verifiedHostOnly === 'true';
    
    const furnished = params.furnished ? String(params.furnished) : ''; // Furnished, Unfurnished...
    
    // Lifestyle preferences list - expect a comma-separated string or array
    let lifestyleMatches: string[] = [];
    if (params.lifestyleMatches) {
      lifestyleMatches = Array.isArray(params.lifestyleMatches)
        ? params.lifestyleMatches
        : String(params.lifestyleMatches).split(',').map(s => s.trim()).filter(Boolean);
    }

    const allListings = [...customHousing, ...mockHousingListings];

    let filtered = allListings.filter((listing) => {
      // 1. Text Search matching (title, description, landmark, address)
      if (query) {
        const matchesTitle = listing.title.toLowerCase().includes(query);
        const matchesDesc = listing.description.toLowerCase().includes(query);
        const matchesLandmark = listing.location.landmark?.toLowerCase().includes(query) || false;
        const matchesAddress = listing.location.addressLine.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesLandmark && !matchesAddress) return false;
      }

      // 2. Property Type category matching (Horizontal chips)
      if (category && category !== 'All' && listing.propertyType !== category) return false;

      // 3. City matching (only if coordinates are NOT used for distance checking)
      if (cityName && (lat === null || lon === null) && listing.location.cityName.toLowerCase() !== cityName) return false;

      // 4. Rent pricing bounds matching
      if (minPrice !== null && listing.rent < minPrice) return false;
      if (maxPrice !== null && listing.rent > maxPrice) return false;

      // 5. Rooms matching
      if (bedrooms !== null && listing.bedrooms < bedrooms) return false;
      if (bathrooms !== null && listing.bathrooms < bathrooms) return false;

      // 6. Extras / Perks filters
      if (billsIncluded && !listing.billsIncluded) return false;
      if (internetIncluded && !listing.internetIncluded) return false;
      if (parkingAvailable && !listing.parkingAvailable) return false;

      // 7. Verified Host filter
      if (verifiedHostOnly && listing.host.isVerified === false) return false;

      // 8. Furnished status matching
      if (furnished && listing.furnished !== furnished) return false;

      // 9. Distance matching
      if (lat !== null && lon !== null && listing.location.latitude && listing.location.longitude) {
        const dist = getDistanceKm(lat, lon, listing.location.latitude, listing.location.longitude);
        if (distanceFilter !== null && dist > distanceFilter) return false;
      } else if (distanceFilter !== null && listing.location.distanceKm !== undefined) {
        if (listing.location.distanceKm > distanceFilter) return false;
      }

      // 10. Lifestyle Preferences matching (Checking if listing matches ALL checked categories)
      if (lifestyleMatches.length > 0) {
        const matchesAll = lifestyleMatches.every((pref) => 
          listing.lifestyleMatches.some((badge) => badge.includes(pref) || badge.toLowerCase().includes(pref.toLowerCase()))
        );
        if (!matchesAll) return false;
      }

      // Filter out drafts or archived listings unless specific param passed
      if (listing.status !== 'Active') return false;

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
      responseData.sort((a, b) => b.host.rating - a.host.rating);
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

  // GET /housing/:id (details)
  mock.onGet(/\/housing\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';
    const allListings = [...customHousing, ...mockHousingListings];
    const listing = allListings.find((h) => h.id === id);

    if (listing) {
      return [200, { data: listing }];
    } else {
      return [404, { message: `Housing Listing ${id} not found` }];
    }
  });

  // POST /housing (publish listing)
  mock.onPost(/\/housing$/).reply((config) => {
    try {
      const data = JSON.parse(config.data);
      const newListing: HousingListing = {
        id: `house-custom-${Date.now()}`,
        title: data.title || 'Untitled Listing',
        description: data.description || '',
        listingType: data.listingType || 'Rent',
        propertyType: data.propertyType || 'Apartment',
        bedrooms: Number(data.bedrooms) || 1,
        bathrooms: Number(data.bathrooms) || 1,
        rent: Number(data.rent) || 0,
        currency: data.currency || 'GBP',
        deposit: Number(data.deposit) || 0,
        billsIncluded: !!data.billsIncluded,
        internetIncluded: !!data.internetIncluded,
        parkingAvailable: !!data.parkingAvailable,
        furnished: data.furnished || 'Furnished',
        availabilityDate: data.availabilityDate || 'Available Now',
        leaseDuration: data.leaseDuration || '1 Year',
        coverImage: data.coverImage || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600',
        gallery: data.gallery || [data.coverImage || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600'],
        location: data.location || {
          cityName: 'London',
          areaName: 'Peckham',
          addressLine: '',
        },
        host: data.host || {
          providerId: 'user-123',
          name: 'Amara Kone',
          avatarUrl: null,
          isVerified: true,
          rating: 4.9,
          reputationLevel: 'VerifiedResident',
          yearsOnPlatform: 2,
          responseTime: 'Immediate',
          languagesSpoken: ['English'],
          contactPhone: '+44 7700 900123',
          contactEmail: 'amara@diaspora.net',
          preferredContactMethod: 'whatsapp',
          originCountry: { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
        },
        amenities: data.amenities || [],
        houseRules: data.houseRules || [],
        lifestyleMatches: data.lifestyleMatches || [],
        verificationStatus: 'Verified',
        status: data.status || 'Active',
        createdAt: new Date().toISOString(),
        viewCount: 0
      };

      customHousing.unshift(newListing);
      console.log('[MOCK] Saved new housing listing:', newListing.id);
      return [201, { data: newListing }];
    } catch (err) {
      return [400, { message: 'Invalid housing listing payload' }];
    }
  });

  // PUT /housing/:id (update listing)
  mock.onPut(/\/housing\/[a-zA-Z0-9_-]+$/).reply((config) => {
    try {
      const url = config.url || '';
      const id = url.split('/').pop() || '';
      const data = JSON.parse(config.data);
      
      const idx = customHousing.findIndex(h => h.id === id);
      if (idx !== -1) {
        customHousing[idx] = { ...customHousing[idx], ...data };
        return [200, { data: customHousing[idx] }];
      }
      
      const staticListing = mockHousingListings.find(h => h.id === id);
      if (staticListing) {
        // Copy to custom for updates
        const updated = { ...staticListing, ...data };
        customHousing.unshift(updated);
        return [200, { data: updated }];
      }

      return [404, { message: `Listing ${id} not found` }];
    } catch (err) {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // DELETE /housing/:id (delete listing)
  mock.onDelete(/\/housing\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';
    
    const idx = customHousing.findIndex(h => h.id === id);
    if (idx !== -1) {
      customHousing.splice(idx, 1);
      return [200, { success: true }];
    }
    
    return [200, { success: true }]; // Noop for static
  });

  // GET /housing/hosts/:id (host profile)
  mock.onGet(/\/housing\/hosts\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const hostId = url.split('/').pop() || '';
    const allListings = [...customHousing, ...mockHousingListings];

    // Find first listing by host to retrieve details
    const ref = allListings.find((h) => h.host.providerId === hostId);
    
    if (ref) {
      const hostDetails = {
        ...ref.host,
        description: `Dedicated housing provider in the Diaspora community facilitating safe and affordable accommodations in ${ref.location.cityName}.`,
        followerCount: 28,
        verificationDate: '2026-02-15T12:00:00Z',
      };

      // Find all listings by this host
      const hostListings = allListings.filter((h) => h.host.providerId === hostId);

      return [200, {
        data: {
          host: hostDetails,
          listings: hostListings
        }
      }];
    } else {
      return [404, { message: `Host profile ${hostId} not found` }];
    }
  });
}
