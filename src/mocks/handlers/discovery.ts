// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Provider discovery fixtures
//
// ── What was removed here, and why (Remediation Wave D-3) ───────────────────
//
// This file used to answer **`GET /discovery/search`**, returning a `listings`
// array from `mocks/data.ts` and a `guides` array from
// `mocks/community-data.ts`, filtered by city.
//
// **There is no `/api/v1/discovery` prefix on the backend.** Every module
// declares its prefix in a `*ModuleMetadata.cs` constant and the twenty-nine
// that exist are `/analytics`, `/telemetry`, `/automations`, `/bookmarks`,
// `/community`, `/community-life`, `/communities`, `/conversations`,
// `/creators`, `/challenges`, `/grants`, `/academy`, `/referrals`, `/rewards`,
// `/financial`, `/geo`, `/guides`, `/knowledge`, `/intelligence`, `/housing`,
// `/integrations`, `/jobs`, `/location`, `/marketplace`, `/media`,
// `/notifications`, `/providers`, `/recommendations` and `/trust`. No
// aggregator sits above them, and the platform has no cross-domain search route
// at all.
//
// Wave A′ had already removed the *client's* calls to it —
// `lib/community-directory-api.ts` and `app/housing/[id].tsx` both carry notes
// saying the route does not exist — but the handler stayed, so a development
// build still answered it. A route that answers in development and 404s in
// production is worse than one that 404s in both: it is how a screen gets built
// on it in the first place.
//
// The `/providers` fixture below is a **real** prefix
// (`ProvidersModuleMetadata.RoutePrefix`) and is left alone; note that its
// `{ data, pagination }` envelope is not the platform's — the platform puts the
// page *inside* `data` — which is a separate finding for whichever wave owns
// Providers.
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';

export function setupDiscoveryMocks(mock: MockAdapter) {
  mock.onGet(/\/providers(\?.*)?$/).reply(200, {
    data: [
      {
        listingId: 'list-1',
        listingType: 'Service',
        title: 'Mama Afrika Kitchen',
        description: 'Authentic Ghanaian cuisine...',
        category: { id: 'cat-1', name: 'Food & Restaurants', iconName: 'restaurant-outline' },
        location: {
          cityId: 'city-1',
          cityName: 'London',
          areaName: 'Peckham',
          distanceKm: 1.2,
          serviceType: 'Fixed',
        },
        coverImageUrl: 'https://images.unsplash.com/photo-1544148103-0773bf10d330',
        rating: { average: 4.8, totalReviews: 124 },
        verificationStatus: 'Verified',
        isFeatured: true,
        isOpenNow: true,
      },
      {
        listingId: 'list-2',
        listingType: 'Service',
        title: 'Ebony Braids & Beauty',
        description: 'Professional hair braiding services.',
        category: { id: 'cat-2', name: 'Hair & Beauty', iconName: 'cut-outline' },
        location: {
          cityId: 'city-1',
          cityName: 'London',
          areaName: 'Brixton',
          distanceKm: 3.5,
          serviceType: 'Fixed',
        },
        coverImageUrl: 'https://images.unsplash.com/photo-1560014169-42b78ce13eb0',
        rating: { average: 4.9, totalReviews: 89 },
        verificationStatus: 'Verified',
        isFeatured: false,
        isOpenNow: false,
      },
    ],
    pagination: { page: 1, pageSize: 20, totalCount: 2, totalPages: 1, hasNextPage: false },
  });

}

