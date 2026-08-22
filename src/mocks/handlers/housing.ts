import type MockAdapter from 'axios-mock-adapter';
import { mockHousingListings } from '../housing-data';
import { mediaContentPath, normaliseMediaRole } from './media';
import type { HousingListing } from '@/types/housing';
import { getDistanceKm } from '@/utils/geo';

/**
 * Remediation Wave E — what a created listing's photographs are made of.
 *
 * `CreateHousingListingRequest.Media` is `IReadOnlyList<HousingMediaRequest>`,
 * and a `HousingMediaRequest` is `{ MediaId: Guid, Role: string, Caption? }` —
 * "B5's asset identifier. Never a URL and never bytes." `housing/create.tsx`
 * sends exactly that.
 *
 * This handler used to read `data.coverImage` and fall back to
 * `'https://images.unsplash.com/photo-1522708323590-…'`. That fallback outlived
 * the defect it was hiding: the screens stopped sending `coverImage` in this
 * wave, so **every** listing created against the mock was being stored with the
 * mock's own stock photograph. A listing with no photograph came back with a
 * photograph of somebody else's flat, which is the precise lie this wave exists
 * to remove — it had simply moved from the client to the handler.
 *
 * So the fallback is gone. A listing created with no photograph now comes back
 * with `coverImage: ''` and `gallery: []`, and the cards and the detail screen
 * render an explicit "no photo" state for it. `''` is already this codebase's
 * representation of an absent cover — see the community fixtures.
 *
 * Where there *is* a photograph, the stored string is the media content route,
 * `/api/v1/media/{id}/content`, derived from the identifier rather than invented.
 * That is what `MediaUrlFactory` mints, it is a route into Media rather than a
 * storage location, and it stays correct if the platform changes provider. It is
 * still second-best: a real consumer stores the `mediaId` and renders
 * `MediaAsset.url`, minted per request, because a private asset's link is signed
 * and short-lived. `HousingListing.coverImage` is a non-nullable `string` on the
 * client and cannot hold a reference, so the route form is the least-wrong thing
 * that fits — and it makes the shortcut visible instead of decorative.
 *
 * Roles are compared case-insensitively because `MediaReference.Normalize` lowers
 * and slugifies them: the screen's `'Cover'` is the platform's `'cover'`.
 */
interface HousingMediaRequest {
  mediaId?: unknown;
  role?: unknown;
}

function mediaRequestsFrom(value: unknown): { mediaId: string; role: string }[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => entry as HousingMediaRequest)
    .filter((entry) => typeof entry?.mediaId === 'string' && entry.mediaId.length > 0)
    .map((entry) => ({
      mediaId: String(entry.mediaId),
      role: normaliseMediaRole(entry.role),
    }));
}

// A dynamic memory store for housing listings created during this user session
let customHousing: HousingListing[] = [];

export function setupHousingMocks(mock: MockAdapter) {
  // GET /housing/search (Remediation Wave A': the platform's housing search)
  mock.onGet(/\/housing\/search$/).reply((config) => {
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
  mock.onGet(/\/housing\/listings\/[a-zA-Z0-9_-]+$/).reply((config) => {
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
  mock.onPost(/\/housing\/listings$/).reply((config) => {
    try {
      const data = JSON.parse(config.data);

      // `media: [{ mediaId, role }]`. The cover is the entry whose role
      // normalises to `cover`; everything else is gallery, in the order the
      // member arranged it — `position` is the member's ordering and firing the
      // attachments concurrently is what would lose it.
      const media = mediaRequestsFrom(data.media);
      const cover = media.find((entry) => entry.role === 'cover') ?? null;
      const galleryMedia = media.filter((entry) => entry !== cover);

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
        // No photograph in, no photograph out. See the note above the handler.
        coverImage: cover ? mediaContentPath(cover.mediaId) : '',
        // The cover leads the gallery, as it does on the detail carousel, and a
        // listing with neither has an empty one rather than one stock image
        // repeated.
        gallery: [...(cover ? [cover] : []), ...galleryMedia].map((entry) =>
          mediaContentPath(entry.mediaId)
        ),
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
  mock.onPut(/\/housing\/listings\/[a-zA-Z0-9_-]+$/).reply((config) => {
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
  mock.onDelete(/\/housing\/listings\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';
    
    const idx = customHousing.findIndex(h => h.id === id);
    if (idx !== -1) {
      customHousing.splice(idx, 1);
      return [200, { success: true }];
    }
    
    return [200, { success: true }]; // Noop for static
  });

  // ── POST /housing/listings/:id/viewings ────────────────────────────────────
  //
  // Remediation Wave B′. Written from `Api/HousingRelocationEndpoints.cs` and
  // `Application/Viewings/RequestViewingCommandHandler.cs` rather than from what
  // `housing/[id].tsx` would like to receive — which is the whole point, since
  // the screen previously received nothing and reported success anyway.
  //
  // The handler's guards run in a fixed order and the first one to fail is the
  // one the member sees, so this reproduces that order exactly. A dev handler
  // that checked them in a different order would hand the screen a different
  // refusal from the one production will send, and the screen's wording is
  // chosen per refusal.
  //
  // **Two of the backend's checks cannot be modelled here**, and pretending
  // otherwise would put this handler in the same category as the button it
  // replaces:
  //
  //   * `listing.AcceptsViewings` — `HousingListingResponse` carries it, the
  //     client's legacy `HousingListing` type does not, and the fixtures
  //     therefore have no value to read. Every fixture listing accepts viewings
  //     here. The `not-accepted-here` branch is still written, keyed on an
  //     explicit opt-out, so the screen's wording for it stays exercised.
  //   * `landlord.CanLet` — landlord suspension lives on `LandlordProfile`,
  //     which the housing fixtures do not model at all.
  //
  // The `:guid` route constraint is also not reproduced: fixture ids are
  // `house-1`, not GUIDs. Against the real server an id that is not a GUID does
  // not reach the handler — it fails to bind and 404s — which is exactly why
  // `requestViewing` is documented to take `listing.id` and never a slug.
  const openViewings: {
    id: string;
    listingId: string;
    seekerUserId: string;
    status: string;
  }[] = [];

  /** `HousingOptions.MaxOpenViewingsPerSeeker`. The address-harvesting bound. */
  const MAX_OPEN_VIEWINGS_PER_SEEKER = 5;

  /** `HousingOptions.DefaultViewingDurationMinutes`. */
  const DEFAULT_VIEWING_DURATION_MINUTES = 30;

  function housingProblem(status: number, code: string, title: string, detail: string) {
    return [
      status,
      {
        type: `https://diaspora.app/errors/${code.toLowerCase()}`,
        title,
        status,
        detail,
        code,
        correlationId: 'dev',
        traceId: 'dev',
        timestamp: 'dev',
      },
    ] as [number, unknown];
  }

  mock.onPost(/\/housing\/listings\/[a-zA-Z0-9_-]+\/viewings$/).reply((config) => {
    const url = config.url || '';
    const listingId = url.split('/').slice(-2)[0] || '';

    // `_authorization.RequireCaller()`. The route is behind
    // `HousingPolicies.ViewingSchedule`, so an unauthenticated caller never
    // reaches the handler at all.
    const authorization =
      (config.headers?.Authorization as string | undefined) ??
      (config.headers?.authorization as string | undefined);

    if (!authorization) {
      return housingProblem(
        401,
        'auth.unauthenticated',
        'Unauthenticated',
        'Sign in to ask to view a property.'
      );
    }

    // A stand-in for the member behind the bearer. The fixtures have no session
    // identity, and every request in a dev session is the same person — which is
    // what makes the "already open" branch below reachable.
    const seekerUserId = 'dev-seeker';

    const allListings = [...customHousing, ...mockHousingListings];
    const listing = allListings.find((h) => h.id === listingId);

    if (!listing) {
      return housingProblem(
        404,
        'housing.listing.not-found',
        'Not found',
        'We cannot find that property.'
      );
    }

    // `!listing.AcceptsViewings`. See the note above: opt-out only, because the
    // fixtures carry no value for it.
    if ((listing as { acceptsViewings?: boolean }).acceptsViewings === false) {
      return housingProblem(
        409,
        'housing.viewing.not-accepted-here',
        'Conflict',
        'This property is not taking viewing requests.'
      );
    }

    // `landlord.OwnerUserId == caller.Value`.
    if (listing.host?.providerId === seekerUserId) {
      return housingProblem(
        400,
        'housing.viewing.self',
        'Validation failed',
        'You cannot book a viewing on your own property.'
      );
    }

    // `_viewings.GetOpenForSeekerAsync(listing.Id, caller.Value)`.
    const existing = openViewings.find(
      (v) => v.listingId === listingId && v.seekerUserId === seekerUserId
    );

    if (existing) {
      return housingProblem(
        409,
        'housing.viewing.already-open',
        'Conflict',
        'You already have a viewing open on this property.'
      );
    }

    // `_viewings.CountOpenBySeekerAsync(caller.Value)`.
    if (openViewings.filter((v) => v.seekerUserId === seekerUserId).length >= MAX_OPEN_VIEWINGS_PER_SEEKER) {
      return housingProblem(
        429,
        'housing.viewings.too-many',
        'Too many requests',
        'You have too many viewings open. Close some before booking more.'
      );
    }

    let request: {
      preferredAt?: string;
      isVirtual?: boolean;
      durationMinutes?: number;
      message?: string;
    } = {};

    try {
      request = config.data ? JSON.parse(config.data) : {};
    } catch {
      return housingProblem(400, 'validation.failed', 'Validation failed', 'Invalid payload.');
    }

    // `ViewingWindow.Create`. The only part of it reproducible without the
    // domain object: a requested slot in the past is refused rather than
    // silently accepted and then missed.
    if (request.preferredAt) {
      const preferred = Date.parse(request.preferredAt);

      if (Number.isNaN(preferred)) {
        return housingProblem(
          400,
          'housing.viewing.window.invalid',
          'Validation failed',
          'That viewing time is not valid.'
        );
      }

      if (preferred < Date.now()) {
        return housingProblem(
          400,
          'housing.viewing.slot.in-past',
          'Validation failed',
          'That viewing time has already passed.'
        );
      }
    }

    const id = `viewing-${Date.now()}`;
    openViewings.push({ id, listingId, seekerUserId, status: 'Requested' });

    const now = new Date().toISOString();

    // `HousingRelocationMapper.ToResponse`. Note `unlocksAddress: false` — a
    // *requested* viewing unlocks nothing; only a confirmed one does. A handler
    // that returned `true` here would teach the screen to reveal an address the
    // server would not have given it.
    return [
      201,
      {
        data: {
          id,
          listingId,
          listingTitle: listing.title,
          listingSlug: null,
          landlordId: listing.host?.providerId ?? '',
          landlordName: listing.host?.name ?? '',
          seekerUserId,
          status: 'Requested',
          preferredAt: request.preferredAt ?? null,
          confirmedAt: null,
          durationMinutes: request.durationMinutes ?? DEFAULT_VIEWING_DURATION_MINUTES,
          isVirtual: request.isVirtual === true,
          place: null,
          message: request.message ?? null,
          landlordFailedToAttend: null,
          closureReason: null,
          unlocksAddress: false,
          satisfiesReservationRequirement: false,
          history: [
            {
              entryId: `${id}-1`,
              status: 'Requested',
              actorId: seekerUserId,
              reason: null,
              occurredAt: now,
            },
          ],
          createdAt: now,
        },
        meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' },
      },
    ] as [number, unknown];
  });

  // GET /housing/hosts/:id (host profile)
  mock.onGet(/\/housing\/landlords\/[a-zA-Z0-9_-]+$/).reply((config) => {
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
