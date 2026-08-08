import type MockAdapter from 'axios-mock-adapter';
import { getDistanceKm, isWithinRadius } from '@/utils/geo';
import { mockHousingListings } from '../housing-data';
import { mockJobs } from '../jobs-data';
import { mockMarketplaceListings } from '../marketplace-data';
import { mockEvents, mockOrganizations } from '../community-life-data';
import { mockGuides, mockCommunityUpdates } from '../community-data';
import { mockListings } from '../data';
import type { PlatformLocation } from '@/store/location';

// Master database of searchable neighborhood/city nodes
export const mockLocationDatabase: PlatformLocation[] = [
  // United Kingdom
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Peckham',
    latitude: 51.4742,
    longitude: -0.0691,
    displayName: 'Peckham, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Brixton',
    latitude: 51.4624,
    longitude: -0.1149,
    displayName: 'Brixton, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Lewisham',
    latitude: 51.4627,
    longitude: -0.0101,
    displayName: 'Lewisham, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Woolwich',
    latitude: 51.4933,
    longitude: 0.0632,
    displayName: 'Woolwich, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Hackney',
    latitude: 51.5450,
    longitude: -0.0553,
    displayName: 'Hackney, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Croydon',
    latitude: 51.3762,
    longitude: -0.0982,
    displayName: 'Croydon, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Greenwich',
    latitude: 51.4802,
    longitude: 0.0030,
    displayName: 'Greenwich, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater London',
    cityName: 'London',
    neighborhood: 'Tottenham',
    latitude: 51.5900,
    longitude: -0.0700,
    displayName: 'Tottenham, London',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater Manchester',
    cityName: 'Manchester',
    neighborhood: 'Salford',
    latitude: 53.4833,
    longitude: -2.2589,
    displayName: 'Salford, Manchester',
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    state: 'Greater Manchester',
    cityName: 'Manchester',
    neighborhood: 'Fallowfield',
    latitude: 53.4442,
    longitude: -2.2223,
    displayName: 'Fallowfield, Manchester',
  },

  // Mauritius
  {
    countryCode: 'MU',
    countryName: 'Mauritius',
    flag: '🇲🇺',
    state: 'Plaines Wilhems',
    cityName: 'Rose Hill',
    neighborhood: 'Rose Hill Central',
    latitude: -20.2417,
    longitude: 57.4806,
    displayName: 'Rose Hill, Mauritius',
  },
  {
    countryCode: 'MU',
    countryName: 'Mauritius',
    flag: '🇲🇺',
    state: 'Plaines Wilhems',
    cityName: 'Quatre Bornes',
    neighborhood: 'Quatre Bornes Center',
    latitude: -20.2644,
    longitude: 57.4786,
    displayName: 'Quatre Bornes, Mauritius',
  },
  {
    countryCode: 'MU',
    countryName: 'Mauritius',
    flag: '🇲🇺',
    state: 'Plaines Wilhems',
    cityName: 'Curepipe',
    neighborhood: 'Curepipe Town',
    latitude: -20.3167,
    longitude: 57.5258,
    displayName: 'Curepipe, Mauritius',
  },
  {
    countryCode: 'MU',
    countryName: 'Mauritius',
    flag: '🇲🇺',
    state: 'Port Louis',
    cityName: 'Port Louis',
    neighborhood: 'Waterfront',
    latitude: -20.1608,
    longitude: 57.5012,
    displayName: 'Waterfront, Port Louis',
  },
  {
    countryCode: 'MU',
    countryName: 'Mauritius',
    flag: '🇲🇺',
    state: 'Port Louis',
    cityName: 'Port Louis',
    neighborhood: 'Ward IV',
    latitude: -20.1642,
    longitude: 57.5029,
    displayName: 'Ward IV, Port Louis',
  },
];

export interface NeighborhoodOverview {
  id: string;
  name: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  overview: string;
  stats: {
    safetyScore: number;
    costOfLiving: 'Low' | 'Medium' | 'High';
    walkability: number;
  };
  resourceCounts: {
    providers: number;
    jobs: number;
    housing: number;
    marketplace: number;
    events: number;
    organizations: number;
  };
}

export function setupLocationMocks(mock: MockAdapter) {
  // GET /location/search
  mock.onGet(/\/location\/search/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';

    if (!query) {
      return [200, { data: mockLocationDatabase.slice(0, 5) }];
    }

    const filtered = mockLocationDatabase.filter(
      (loc) =>
        loc.neighborhood.toLowerCase().includes(query) ||
        loc.cityName.toLowerCase().includes(query) ||
        loc.countryName.toLowerCase().includes(query) ||
        loc.displayName?.toLowerCase().includes(query)
    );

    return [200, { data: filtered }];
  });

  // GET /location/reverse-geocode
  mock.onGet(/\/location\/reverse-geocode/).reply((config) => {
    const params = config.params || {};
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;

    if (lat === null || lon === null) {
      return [400, { message: 'Missing coordinates' }];
    }

    // Find closest location node
    let closestNode = mockLocationDatabase[0];
    let minDistance = Infinity;

    mockLocationDatabase.forEach((node) => {
      const dist = getDistanceKm(lat, lon, node.latitude, node.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        closestNode = node;
      }
    });

    return [200, { data: closestNode }];
  });

  // GET /location/nearby
  mock.onGet(/\/location\/nearby/).reply((config) => {
    const params = config.params || {};
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;
    const radius = params.radiusKm ? Number(params.radiusKm) : 5; // default 5km

    if (lat === null || lon === null) {
      return [400, { message: 'Missing center coordinates' }];
    }

    // Dynamic filtering and distance injection
    const nearbyHousing = mockHousingListings
      .filter((h) => h.location.latitude && h.location.longitude && isWithinRadius(lat, lon, h.location.latitude, h.location.longitude, radius))
      .map((h) => ({ ...h, distanceKm: getDistanceKm(lat, lon, h.location.latitude!, h.location.longitude!) }));

    const nearbyJobs = mockJobs
      .filter((j) => j.location.latitude && j.location.longitude && isWithinRadius(lat, lon, j.location.latitude, j.location.longitude, radius))
      .map((j) => ({ ...j, distanceKm: getDistanceKm(lat, lon, j.location.latitude!, j.location.longitude!) }));

    const nearbyMarketplace = mockMarketplaceListings
      .filter((m) => m.location.latitude && m.location.longitude && isWithinRadius(lat, lon, m.location.latitude, m.location.longitude, radius))
      .map((m) => ({ ...m, distanceKm: getDistanceKm(lat, lon, m.location.latitude!, m.location.longitude!) }));

    const nearbyEvents = mockEvents
      .filter((e) => e.location.latitude && e.location.longitude && isWithinRadius(lat, lon, e.location.latitude, e.location.longitude, radius))
      .map((e) => ({ ...e, distanceKm: getDistanceKm(lat, lon, e.location.latitude!, e.location.longitude!) }));

    const nearbyProviders = mockListings
      .filter((p) => p.location.latitude && p.location.longitude && isWithinRadius(lat, lon, p.location.latitude, p.location.longitude, radius))
      .map((p) => ({ ...p, distanceKm: getDistanceKm(lat, lon, p.location.latitude!, p.location.longitude!) }));

    const nearbyUpdates = mockCommunityUpdates
      .filter((u) => u.location.latitude && u.location.longitude && isWithinRadius(lat, lon, u.location.latitude, u.location.longitude, radius))
      .map((u) => ({ ...u, distanceKm: getDistanceKm(lat, lon, u.location.latitude!, u.location.longitude!) }));

    return [
      200,
      {
        data: {
          housing: nearbyHousing.sort((a, b) => a.distanceKm - b.distanceKm),
          jobs: nearbyJobs.sort((a, b) => a.distanceKm - b.distanceKm),
          marketplace: nearbyMarketplace.sort((a, b) => a.distanceKm - b.distanceKm),
          events: nearbyEvents.sort((a, b) => a.distanceKm - b.distanceKm),
          providers: nearbyProviders.sort((a, b) => a.distanceKm - b.distanceKm),
          updates: nearbyUpdates.sort((a, b) => a.distanceKm - b.distanceKm),
        },
      },
    ];
  });

  // GET /neighborhood/:id
  mock.onGet(/\/neighborhood\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';

    // Find in location database by matching neighborhood parameter to slug format
    const targetNode = mockLocationDatabase.find(
      (node) => node.neighborhood.toLowerCase().replace(/\s+/g, '-') === id.toLowerCase()
    );

    if (!targetNode) {
      return [404, { message: `Neighborhood ${id} not found` }];
    }

    // Gather statistics/counts dynamically based on location coordinates
    const centerLat = targetNode.latitude;
    const centerLon = targetNode.longitude;
    const countRadius = 5; // count within 5km

    const housingCount = mockHousingListings.filter(
      (h) => h.location.latitude && h.location.longitude && isWithinRadius(centerLat, centerLon, h.location.latitude, h.location.longitude, countRadius)
    ).length;

    const jobsCount = mockJobs.filter(
      (j) => j.location.latitude && j.location.longitude && isWithinRadius(centerLat, centerLon, j.location.latitude, j.location.longitude, countRadius)
    ).length;

    const marketplaceCount = mockMarketplaceListings.filter(
      (m) => m.location.latitude && m.location.longitude && isWithinRadius(centerLat, centerLon, m.location.latitude, m.location.longitude, countRadius)
    ).length;

    const eventsCount = mockEvents.filter(
      (e) => e.location.latitude && e.location.longitude && isWithinRadius(centerLat, centerLon, e.location.latitude, e.location.longitude, countRadius)
    ).length;

    const providersCount = mockListings.filter(
      (p) => p.location.latitude && p.location.longitude && isWithinRadius(centerLat, centerLon, p.location.latitude, p.location.longitude, countRadius)
    ).length;

    const organizationsCount = mockOrganizations.filter(
      (o) => o.location.latitude && o.location.longitude && isWithinRadius(centerLat, centerLon, o.location.latitude, o.location.longitude, countRadius)
    ).length;

    // Generate mock details based on neighborhood name
    const overview = `Welcome to ${targetNode.neighborhood}, a key district in ${targetNode.cityName}. Highly populated by local community members, it boasts excellent transport options, a diverse range of local food options, and strong neighborhood hubs.`;

    const safetyScore = targetNode.cityName.toLowerCase() === 'london' ? 84 : 92;
    const walkability = targetNode.cityName.toLowerCase() === 'london' ? 88 : 78;
    const costOfLiving = targetNode.cityName.toLowerCase() === 'london' ? 'High' : 'Medium';

    const responseData: NeighborhoodOverview = {
      id,
      name: targetNode.neighborhood,
      cityName: targetNode.cityName,
      countryName: targetNode.countryName,
      countryCode: targetNode.countryCode,
      latitude: targetNode.latitude,
      longitude: targetNode.longitude,
      overview,
      stats: {
        safetyScore,
        costOfLiving,
        walkability,
      },
      resourceCounts: {
        providers: providersCount,
        jobs: jobsCount,
        housing: housingCount,
        marketplace: marketplaceCount,
        events: eventsCount,
        organizations: organizationsCount,
      },
    };

    return [200, { data: responseData }];
  });
}
