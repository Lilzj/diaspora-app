import type MockAdapter from 'axios-mock-adapter';
import { mockEvents, mockOrganizations, mockHolidays } from '../community-life-data';
import type { Event, CommunityOrganization, Holiday } from '@/types/community-life';
import { getDistanceKm } from '@/utils/geo';

// Memory store for custom events and organizations added during session
let customEvents: Event[] = [];
let customOrganizations: CommunityOrganization[] = [];

export function setupCommunityLifeMocks(mock: MockAdapter) {
  
  // GET /community-life/events (list/filter/search)
  mock.onGet(/\/community-life\/events$/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';
    const category = params.category ? String(params.category) : '';
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';
    
    // Proximity parameters
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;
    const radiusKm = params.radiusKm ? Number(params.radiusKm) : null;

    // Core discovery filters
    const filterType = params.filterType ? String(params.filterType) : 'all'; // nearby, recommended, free, popular, community, recently_added, ai, all
    const timeFilter = params.timeFilter ? String(params.timeFilter) : ''; // today, tomorrow, weekend, this_week, upcoming
    const sortBy = params.sortBy ? String(params.sortBy) : 'date'; // date, distance, popular, recently_added

    const allEvents = [...customEvents, ...mockEvents];

    // Reference dates for 2026-07-13 (Monday)
    const todayStr = '2026-07-13';
    const tomorrowStr = '2026-07-14';
    const weekendStartStr = '2026-07-17'; // Friday
    const weekendEndStr = '2026-07-19'; // Sunday

    let filtered = allEvents.filter((evt) => {
      // 1. City Filter (only if coordinates are not used)
      if (cityName && (lat === null || lon === null) && evt.location.cityName.toLowerCase() !== cityName) return false;

      // 2. Category Filter
      if (category && category !== 'All' && evt.category !== category) return false;

      // 3. Search query
      if (query) {
        const matchesTitle = evt.title.toLowerCase().includes(query);
        const matchesDesc = evt.description.toLowerCase().includes(query);
        const matchesHost = evt.host.name.toLowerCase().includes(query);
        const matchesArea = evt.location.areaName.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesHost && !matchesArea) return false;
      }

      // 4. Proximity check
      if (lat !== null && lon !== null && evt.location.latitude && evt.location.longitude) {
        const dist = getDistanceKm(lat, lon, evt.location.latitude, evt.location.longitude);
        if (radiusKm !== null && dist > radiusKm) return false;
      }

      // 5. Discovery Filters
      if (filterType === 'free' && evt.price && evt.price > 0) return false;
      if (filterType === 'nearby') {
        if (lat !== null && lon !== null && evt.location.latitude && evt.location.longitude) {
          const dist = getDistanceKm(lat, lon, evt.location.latitude, evt.location.longitude);
          if (dist > 5.0) return false;
        } else if ((evt.location.distanceKm || 999) > 5.0) {
          return false;
        }
      }
      if (filterType === 'popular' && evt.viewCount < 500) return false;
      if (filterType === 'community' && evt.host.type !== 'Organization') return false;
      if (filterType === 'recently_added') {
        const addedDate = new Date(evt.createdAt);
        const compareDate = new Date('2026-07-01');
        if (addedDate < compareDate) return false;
      }
      if (filterType === 'recommended') {
        const isRecHost = evt.host.id === 'org-1' || evt.host.id === 'org-2';
        const isRecCat = evt.category === 'Networking' || evt.category === 'Church Program' || evt.category === 'Food Festival';
        if (!isRecHost && !isRecCat) return false;
      }
      if (filterType === 'ai') {
        const isAICat = evt.category === 'Basketball' || evt.category === 'Football Match' || evt.category === 'Independence Celebration';
        if (!isAICat) return false;
      }

      // 6. Time Filter
      if (timeFilter) {
        const evtDate = evt.date;
        if (timeFilter === 'today' && evtDate !== todayStr) return false;
        if (timeFilter === 'tomorrow' && evtDate !== tomorrowStr) return false;
        if (timeFilter === 'weekend') {
          if (evtDate < weekendStartStr || evtDate > weekendEndStr) return false;
        }
        if (timeFilter === 'this_week') {
          if (evtDate < todayStr || evtDate > weekendEndStr) return false;
        }
        if (timeFilter === 'upcoming') {
          if (evtDate < todayStr) return false;
        }
      }

      return true;
    });

    // Inject dynamic distances
    let responseData = filtered.map((evt) => {
      if (lat !== null && lon !== null && evt.location.latitude && evt.location.longitude) {
        return {
          ...evt,
          location: {
            ...evt.location,
            distanceKm: getDistanceKm(lat, lon, evt.location.latitude, evt.location.longitude),
          },
        };
      }
      return evt;
    });

    // Apply Sorting
    if (sortBy === 'distance' || (lat !== null && lon !== null && sortBy === 'date')) {
      responseData.sort((a, b) => (a.location.distanceKm || 999) - (b.location.distanceKm || 999));
    } else if (sortBy === 'popular') {
      responseData.sort((a, b) => b.viewCount - a.viewCount);
    } else if (sortBy === 'recently_added') {
      responseData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      // Sort by Date (default)
      responseData.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });
    }

    return [200, {
      data: responseData,
      totalCount: responseData.length
    }];
  });

  // GET /community-life/events/:id (details)
  mock.onGet(/\/community-life\/events\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';
    const allEvents = [...customEvents, ...mockEvents];
    const event = allEvents.find((e) => e.id === id);

    if (event) {
      return [200, { data: event }];
    } else {
      return [404, { message: `Event ${id} not found` }];
    }
  });

  // POST /community-life/events (create event or save draft)
  mock.onPost(/\/community-life\/events$/).reply((config) => {
    try {
      const data = JSON.parse(config.data);
      const isDraft = data.status === 'Draft';
      
      const newEvent: Event = {
        id: data.id || `evt-custom-${Date.now()}`,
        title: data.title || 'Untitled Event',
        description: data.description || '',
        coverImage: data.coverImage || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
        gallery: data.gallery || [data.coverImage || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600'],
        category: data.category || 'Other',
        date: data.date || '2026-07-15',
        time: data.time || '18:00',
        endTime: data.endTime || '20:00',
        timezone: data.timezone || 'BST',
        location: {
          cityName: data.cityName || 'London',
          areaName: data.areaName || 'Peckham',
          addressLine: data.addressLine || 'TBD',
          landmark: data.landmark || '',
          distanceKm: 1.2
        },
        price: data.price ? Number(data.price) : 0,
        currency: data.currency || 'GBP',
        host: {
          id: 'user-123',
          name: data.organizerName || 'Joshua (You)',
          type: 'User',
          isVerified: false
        },
        contact: {
          phone: data.phone || '',
          whatsapp: data.whatsapp || '',
          email: data.email || '',
          website: data.website || ''
        },
        rsvpStatus: null,
        isSaved: false,
        viewCount: 0,
        shareCount: 0,
        saveCount: 0,
        createdAt: new Date().toISOString()
      };

      // Check if updating existing draft
      const existingIdx = customEvents.findIndex(e => e.id === newEvent.id);
      if (existingIdx !== -1) {
        customEvents[existingIdx] = newEvent;
      } else {
        customEvents.unshift(newEvent);
      }

      console.log(`[MOCK] Saved event/draft: ${newEvent.id} (Draft: ${isDraft})`);
      return [201, { data: newEvent }];
    } catch (err) {
      return [400, { message: 'Invalid event registration payload' }];
    }
  });

  // PUT /community-life/events/:id (update event / draft)
  mock.onPut(/\/community-life\/events\/[a-zA-Z0-9_-]+$/).reply((config) => {
    try {
      const url = config.url || '';
      const id = url.split('/').pop() || '';
      const data = JSON.parse(config.data);

      const idx = customEvents.findIndex(e => e.id === id);
      if (idx !== -1) {
        customEvents[idx] = { ...customEvents[idx], ...data };
        return [200, { data: customEvents[idx] }];
      }

      // Check if editing static event
      const staticEvent = mockEvents.find(e => e.id === id);
      if (staticEvent) {
        const updated = { ...staticEvent, ...data };
        customEvents.unshift(updated);
        return [200, { data: updated }];
      }

      return [404, { message: `Event ${id} not found` }];
    } catch (err) {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // DELETE /community-life/events/:id
  mock.onDelete(/\/community-life\/events\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';

    const idx = customEvents.findIndex(e => e.id === id);
    if (idx !== -1) {
      customEvents.splice(idx, 1);
    }
    return [200, { success: true }];
  });

  // GET /community-life/organizations (directory search)
  mock.onGet(/\/community-life\/organizations$/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';
    const category = params.category ? String(params.category) : '';
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';

    // Proximity parameters
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;
    const radiusKm = params.radiusKm ? Number(params.radiusKm) : null;
    const sortBy = params.sortBy ? String(params.sortBy) : '';

    const allOrgs = [...customOrganizations, ...mockOrganizations];

    let filtered = allOrgs.filter((org) => {
      // 1. City Filter (only if coordinates not used)
      if (cityName && (lat === null || lon === null) && org.location.cityName.toLowerCase() !== cityName) return false;

      // 2. Category Filter
      if (category && category !== 'All' && org.category !== category) return false;

      // 3. Text query matching
      if (query) {
        const matchesName = org.name.toLowerCase().includes(query);
        const matchesDesc = org.description.toLowerCase().includes(query);
        const matchesArea = org.location.areaName.toLowerCase().includes(query);
        const matchesServices = org.services.some(s => s.toLowerCase().includes(query));
        if (!matchesName && !matchesDesc && !matchesArea && !matchesServices) return false;
      }

      // 4. Proximity check
      if (lat !== null && lon !== null && org.location.latitude && org.location.longitude) {
        const dist = getDistanceKm(lat, lon, org.location.latitude, org.location.longitude);
        if (radiusKm !== null && dist > radiusKm) return false;
      }

      return true;
    });

    // Inject dynamic distances
    let responseData = filtered.map((org) => {
      if (lat !== null && lon !== null && org.location.latitude && org.location.longitude) {
        return {
          ...org,
          location: {
            ...org.location,
            distanceKm: getDistanceKm(lat, lon, org.location.latitude, org.location.longitude),
          },
        };
      }
      return org;
    });

    // Sort by proximity if requested or if coordinates are present
    if (sortBy === 'distance' || (lat !== null && lon !== null)) {
      responseData.sort((a, b) => (a.location.distanceKm || 999) - (b.location.distanceKm || 999));
    }

    return [200, {
      data: responseData,
      totalCount: responseData.length
    }];
  });

  // GET /community-life/organizations/:id (hub profile)
  mock.onGet(/\/community-life\/organizations\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';
    const allOrgs = [...customOrganizations, ...mockOrganizations];
    const org = allOrgs.find((o) => o.id === id);

    if (org) {
      return [200, { data: org }];
    } else {
      return [404, { message: `Organization ${id} not found` }];
    }
  });

  // POST /community-life/organizations (create organization)
  mock.onPost(/\/community-life\/organizations$/).reply((config) => {
    try {
      const data = JSON.parse(config.data);
      const newOrg: CommunityOrganization = {
        id: `org-custom-${Date.now()}`,
        name: data.name || 'Untitled Organization',
        logo: data.logo || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=120',
        coverImage: data.coverImage || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
        category: data.category || 'Other',
        description: data.description || '',
        mission: data.mission || '',
        services: data.services || [],
        location: {
          cityName: data.cityName || 'London',
          areaName: data.areaName || 'Peckham',
          addressLine: data.addressLine || 'TBD',
          distanceKm: 1.5
        },
        contact: {
          phone: data.phone || '',
          whatsapp: data.whatsapp || '',
          email: data.email || '',
          website: data.website || ''
        },
        openingHours: data.openingHours || [
          { day: 'Monday - Friday', hours: '09:00 - 17:00' },
          { day: 'Saturday - Sunday', hours: 'Closed' }
        ],
        isVerified: false,
        followersCount: 0,
        isFollowing: false,
        leaders: [],
        gallery: [],
        createdAt: new Date().toISOString()
      };

      customOrganizations.unshift(newOrg);
      console.log(`[MOCK] Created organization hub: ${newOrg.id}`);
      return [201, { data: newOrg }];
    } catch (err) {
      return [400, { message: 'Invalid organization registration payload' }];
    }
  });

  // GET /community-life/calendar (events & holidays by date range/location)
  mock.onGet(/\/community-life\/calendar$/).reply((config) => {
    const params = config.params || {};
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';
    
    const allEvents = [...customEvents, ...mockEvents];
    
    // Filter events in this location
    const localEvents = allEvents.filter(e => !cityName || e.location.cityName.toLowerCase() === cityName);

    // Filter holidays (since UK is GB, let's check matching country for city)
    const countryCode = cityName === 'london' ? 'GB' : cityName === 'accra' ? 'GH' : cityName === 'lagos' ? 'NG' : 'GB';
    const localHolidays = mockHolidays.filter(h => h.countryCode === countryCode);

    // Merge into calendar events
    const calendarItems: any[] = [];

    localEvents.forEach(evt => {
      calendarItems.push({
        id: `cal-evt-${evt.id}`,
        title: evt.title,
        date: evt.date,
        time: evt.time,
        type: 'Event',
        associatedId: evt.id,
        color: evt.category === 'Church Program' || evt.category === 'Mosque Event' ? '#4F46E5' : '#FF6B00'
      });
    });

    localHolidays.forEach(hol => {
      calendarItems.push({
        id: `cal-hol-${hol.id}`,
        title: hol.name,
        date: hol.date,
        type: 'Holiday',
        associatedId: hol.id,
        color: hol.type === 'National' ? '#EF4444' : '#10B981'
      });
    });

    return [200, {
      data: calendarItems
    }];
  });
}
