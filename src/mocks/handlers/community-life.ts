import type MockAdapter from 'axios-mock-adapter';
import { mockEvents, mockOrganizations, mockHolidays } from '../community-life-data';
import type { Event, CommunityOrganization, Holiday } from '@/types/community-life';
import { eventHost } from '@/lib/event-host';
// `getDistanceKm` is deliberately no longer imported. Wave J removed every
// distance this handler used to compute: the two browse routes accept no point
// and no radius, so a real response from them carries no `distanceKm` at all,
// and a mock that invents one teaches every caller to expect a field that will
// never arrive.
import {
  SEEDED_EVENT_CATEGORY_NAMES,
  SEEDED_ORGANIZATION_TYPE_NAMES,
  toEventCategoryKey,
  toOrganizationTypeKey,
} from '@/lib/community-life-catalogue';

// Memory store for custom events and organizations added during session
let customEvents: Event[] = [];
let customOrganizations: CommunityOrganization[] = [];

/**
 * Drops `location.distanceKm` from a browse row.
 *
 * The two browse routes populate that field only when a geographic scope
 * resolved a search centre, and neither accepts a parameter that can resolve one
 * — so on a real browse it is always absent. The fixtures carry a static value
 * for it, which is a distance measured from nobody; leaving it in would keep
 * every caller believing in a number the server will never send.
 */
function stripDistance<T extends { location: { distanceKm?: number } }>(row: T): T {
  const { distanceKm: _discarded, ...location } = row.location;
  return { ...row, location };
}

export function setupCommunityLifeMocks(mock: MockAdapter) {
  // ── Every pattern below is anchored with `^`, and must stay that way ───────
  //
  // These handlers are registered before `setupCommunityGapMocks`, and
  // axios-mock-adapter takes the *first* pattern that matches. Unanchored,
  // `/\/community-life\/events\/[a-zA-Z0-9_-]+$/` also matches
  //
  //     /community-gap/v0/community-life/events/series
  //
  // because the gap namespace nests the simulated event-series routes under
  // `/community-life`. The gap list request was therefore answered here, as a
  // request for an *event* whose id is the literal string "series" — which does
  // not exist, so every caller of `useSeriesList` got a 404.
  //
  // That broke `/community-life/series`, the organisation Events tab and
  // anything else reading the series list, and it did so silently: a 404 from a
  // mock looks exactly like a 404 from a server.
  //
  // `^` confines these to the real B12 routes, which is what they are for.

  // ── GET /community-life/events ─────────────────────────────────────────────
  //
  // **Remediation Wave J — this handler was written from the client's
  // assumptions, not the server's contract, and that is what hid the defect.**
  //
  // It used to read `query`, `cityName`, `latitude`, `longitude`, `radiusKm`,
  // `filterType`, `timeFilter` and `sortBy`. `EventSearchParameters`
  // (`CommunityLife/Api/CommunityLifeDiscoveryEndpoints.cs:113`) binds none of
  // those names. Because the mock mirrored the client, every filter appeared to
  // work in development and every one of them was discarded in production by the
  // model binder — silently, with a 200 and an unfiltered page.
  //
  // A development handler that agrees with the client instead of the server is
  // not a test double; it is a second implementation of the same mistake. This
  // one is now derived parameter-by-parameter from the C# record, and the
  // filters the record has no property for are simply gone rather than
  // reimplemented under a name the server will drop.
  mock.onGet(/^\/community-life\/events$/).reply((config) => {
    const params = config.params || {};

    // Every name below is a `[FromQuery(Name = …)]` on `EventSearchParameters`.
    const q = params.q ? String(params.q).toLowerCase() : '';
    const categoryKey = params.category ? String(params.category) : '';
    const city = params.city ? String(params.city).toLowerCase() : '';
    const countryCode = params.countryCode ? String(params.countryCode).toUpperCase() : '';
    const freeOnly = params.free === true || params.free === 'true';
    const startsAfter = params.startsAfter ? String(params.startsAfter) : '';
    const startsBefore = params.startsBefore ? String(params.startsBefore) : '';
    const sort = params.sort ? String(params.sort) : 'Soonest';

    const allEvents = [...customEvents, ...mockEvents];

    const filtered = allEvents.filter((evt) => {
      // `city` — `CommunityEventRepository.cs:625-628`. An **exact** comparison
      // on the server, not a prefix or a contains. Lower-cased on both sides
      // here only because the fixtures are inconsistently cased; the server's
      // rows are not.
      if (city && evt.location.cityName.toLowerCase() !== city) return false;

      // `countryCode` — `CommunityEventRepository.cs:616-620`, comparing
      // `Location.CountryCode`. The fixtures mostly carry no country, and an
      // unlabelled row does **not** match a country filter on the server either:
      // the predicate is an equality, and NULL fails it. Passing them through
      // would make this handler kinder than the route it stands in for.
      if (countryCode && (evt.location.countryCode ?? '').toUpperCase() !== countryCode) {
        return false;
      }

      // `category` — repeated lower-kebab catalogue keys, normalized by the
      // server before `keys.Contains(communityEvent.CategoryKey)`
      // (`CommunityEventRepository.cs:594-601`). The fixtures carry display
      // categories, so both sides go through the same translation.
      if (
        categoryKey &&
        toEventCategoryKey(evt.category) !== toEventCategoryKey(categoryKey)
      ) {
        return false;
      }

      // `q` — the free-text term. The server's full-text predicate spans more
      // columns than this; matching fewer is a narrower mock than the route,
      // which is the safe direction for a double to err in.
      if (q) {
        const matchesTitle = evt.title.toLowerCase().includes(q);
        const matchesDesc = evt.description.toLowerCase().includes(q);
        const matchesHost = (eventHost(evt)?.name ?? '').toLowerCase().includes(q);
        const matchesArea = evt.location.areaName.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesHost && !matchesArea) return false;
      }

      // `free` — `Audience.IsFree` on the server. The fixtures express the same
      // fact as a zero or absent price.
      if (freeOnly && typeof evt.price === 'number' && evt.price > 0) return false;

      // `startsAfter` / `startsBefore` — a real window, compared against
      // `Schedule.StartsAt`. This replaces the `timeFilter` buckets the handler
      // used to implement against a frozen 2026-07-13 clock: the buckets exist
      // nowhere in the C# record, and the frozen clock meant the mock answered a
      // question about "today" that the server could not be asked at all.
      const startsAt = `${evt.date}T${evt.time || '00:00'}`;
      if (startsAfter && startsAt < startsAfter) return false;
      if (startsBefore && startsAt > startsBefore) return false;

      return true;
    });

    // No distance — injected *or* inherited.
    //
    // The route computes `distanceKm` only when a geographic scope resolved a
    // centre, and no parameter this client can send resolves one. This handler
    // used to compute one from the unbound lat/lon it accepted; the fixtures
    // *also* carry a hardcoded `distanceKm`, which is a distance from nobody in
    // particular, and passing it through would keep the field populated for
    // exactly the callers the removal is meant to warn.
    const responseData = filtered.map((evt) => stripDistance(evt));

    // `sort` — `EventSortOrder`, parsed case-insensitively and defaulted to
    // `Soonest` (`SearchEventsQueryHandler.cs:100-101`). `Nearest` and
    // `Relevance` fall through to the schedule ordering in the repository
    // (`CommunityEventRepository.cs:788-806`), and so do they here.
    const normalizedSort = sort.toLowerCase();
    if (normalizedSort === 'mostpopular') {
      responseData.sort((a, b) => b.viewCount - a.viewCount);
    } else if (normalizedSort === 'newest') {
      responseData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
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
  mock.onGet(/^\/community-life\/events\/[a-zA-Z0-9_-]+$/).reply((config) => {
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
  mock.onPost(/^\/community-life\/events$/).reply((config) => {
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
  // `onPatch`, not `onPut`. `EventEndpoints.cs:102` maps `MapPatch` for the edit,
  // and this handler served PUT — mirroring the client's verb rather than the
  // server's. So the dev build accepted every event edit and production refused
  // every one with a 405 before any handler ran, and the integration test
  // asserting "updates an event" passed against the wrong verb.
  //
  // The twelfth handler in this repository found written from the client's
  // assumptions rather than the server's contract. The rule it keeps proving:
  // a development handler that agrees with the client proves the client is
  // self-consistent and nothing about the platform.
  //
  // The RSVP handler below is genuinely PUT — `MapPut` at `EventEndpoints.cs:225`
  // and the four routes after it — which is exactly why this one looked right.
  mock.onPatch(/^\/community-life\/events\/[a-zA-Z0-9_-]+$/).reply((config) => {
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

  // ── RSVP ───────────────────────────────────────────────────────────────────
  //
  // Remediation Wave A′. These two routes did not exist here either, because the
  // client sent RSVPs to the event-edit handler above — which happily merged
  // `{ rsvpStatus }` into the stored event and returned 200. The real backend
  // drops the unknown field and changes nothing, so the development handler was
  // the *only* place an RSVP ever appeared to work.
  //
  // Capacity is modelled because the real route models it: an event with a
  // `capacity` already at its attendee count answers `Waitlisted` with a
  // position, which is the half of COMMUNITY-LIFE-GAP-005 that turns out to
  // exist.

  // PUT /community-life/events/:id/rsvp
  mock.onPut(/^\/community-life\/events\/[a-zA-Z0-9_-]+\/rsvp$/).reply((config) => {
    try {
      const id = (config.url || '').split('/').slice(-2)[0] || '';
      const body = JSON.parse(config.data ?? '{}');
      const requested: string = body.status;

      if (requested !== 'Going' && requested !== 'Interested') {
        // The server refuses a lifecycle state as an invalid transition rather
        // than storing it.
        return [
          400,
          { title: 'Bad Request', status: 400, detail: `'${requested}' cannot be set by an attendee.` },
        ];
      }

      const event = customEvents.find(e => e.id === id) ?? mockEvents.find(e => e.id === id);
      if (!event) return [404, { title: 'Not Found', status: 404 }];

      const capacity = (event as { capacity?: number }).capacity;
      const attending = (event as { attendeeCount?: number }).attendeeCount ?? 0;
      const waitlisted = requested === 'Going' && typeof capacity === 'number' && attending >= capacity;

      return [
        200,
        {
          data: {
            rsvpId: `rsvp-${id}`,
            eventId: id,
            organizationId: (event as { organizationId?: string }).organizationId ?? null,
            attendeeUserId: 'user-123',
            status: waitlisted ? 'Waitlisted' : requested,
            partySize: Math.max(1, Number(body.partySize) || 1),
            note: body.note ?? null,
            declineReason: 'None',
            respondedAt: new Date().toISOString(),
            checkedInAt: null,
            checkInMethod: null,
            revision: 1,
            waitlistPosition: waitlisted ? 1 : null,
            seriesId: null,
          },
        },
      ];
    } catch {
      return [400, { title: 'Bad Request', status: 400 }];
    }
  });

  // DELETE /community-life/events/:id/rsvp
  mock.onDelete(/^\/community-life\/events\/[a-zA-Z0-9_-]+\/rsvp$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0] || '';
    return [
      200,
      {
        data: {
          rsvpId: `rsvp-${id}`,
          eventId: id,
          organizationId: null,
          attendeeUserId: 'user-123',
          status: 'Cancelled',
          partySize: 1,
          note: null,
          declineReason: 'WithdrawnByAttendee',
          respondedAt: new Date().toISOString(),
          checkedInAt: null,
          checkInMethod: null,
          revision: 2,
          waitlistPosition: null,
          seriesId: null,
        },
      },
    ];
  });

  // DELETE /community-life/events/:id
  mock.onDelete(/^\/community-life\/events\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const id = url.split('/').pop() || '';

    const idx = customEvents.findIndex(e => e.id === id);
    if (idx !== -1) {
      customEvents.splice(idx, 1);
    }
    return [200, { success: true }];
  });

  // ── GET /community-life/organizations ──────────────────────────────────────
  //
  // Same treatment, same reasons as the event browse above: every name below is
  // a `[FromQuery(Name = …)]` on `OrganizationSearchParameters`
  // (`CommunityLife/Api/OrganizationEndpoints.cs:310`), and the filters that
  // record has no property for are gone rather than reimplemented.
  //
  // The `category` fallback that used to sit here is also gone. It was added in
  // good faith — "so an unconverted caller still filters here rather than
  // silently getting the whole directory" — but its effect was to keep hiding
  // the very defect it described: a caller sending `category` filtered correctly
  // in development and got the entire directory in production. A double that is
  // more forgiving than the route it stands in for cannot fail a request the
  // route would fail, which is the only thing it is for.
  mock.onGet(/^\/community-life\/organizations$/).reply((config) => {
    const params = config.params || {};

    const q = params.q ? String(params.q).toLowerCase() : '';
    const typeKey = params.type ? String(params.type) : '';
    const city = params.city ? String(params.city).toLowerCase() : '';
    const countryCode = params.countryCode ? String(params.countryCode).toUpperCase() : '';
    const verifiedOnly = params.verified === true || params.verified === 'true';
    const sort = params.sort ? String(params.sort) : 'MostMembers';

    const allOrgs = [...customOrganizations, ...mockOrganizations];

    const filtered = allOrgs.filter((org) => {
      // `city` — `OrganizationRepository.cs:295-299`, an exact comparison.
      if (city && org.location.cityName.toLowerCase() !== city) return false;

      // `countryCode` — `OrganizationRepository.cs:288-291`, on
      // `Location.CountryCode`. Unlabelled fixtures do not match, for the same
      // reason as on the event list.
      if (countryCode && (org.location.countryCode ?? '').toUpperCase() !== countryCode) {
        return false;
      }

      // `type` — the fourteen lower-kebab catalogue keys.
      if (typeKey && toOrganizationTypeKey(org.category) !== toOrganizationTypeKey(typeKey)) {
        return false;
      }

      // `q` — the free-text term.
      if (q) {
        const matchesName = org.name.toLowerCase().includes(q);
        const matchesDesc = org.description.toLowerCase().includes(q);
        const matchesArea = org.location.areaName.toLowerCase().includes(q);
        const matchesServices = org.services.some((s) => s.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesArea && !matchesServices) return false;
      }

      // `verified` — `OrganizationSearchParameters:326`.
      if (verifiedOnly && !org.isVerified) return false;

      return true;
    });

    // As on the event list, and for the same reason: no distance, injected or
    // inherited from the fixture.
    const responseData = filtered.map((org) => stripDistance(org));

    // `sort` — `OrganizationSortOrder`, defaulting to `MostMembers`. `Nearest`
    // has no centre to measure from and falls through, as it does server-side.
    const normalizedSort = sort.toLowerCase();
    if (normalizedSort === 'name') {
      responseData.sort((a, b) => a.name.localeCompare(b.name));
    } else if (normalizedSort === 'newest') {
      responseData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      responseData.sort((a, b) => b.followersCount - a.followersCount);
    }

    return [200, {
      data: responseData,
      totalCount: responseData.length
    }];
  });

  // GET /community-life/organizations/:id (hub profile)
  mock.onGet(/^\/community-life\/organizations\/[a-zA-Z0-9_-]+$/).reply((config) => {
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
  mock.onPost(/^\/community-life\/organizations$/).reply((config) => {
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

  // GET /community-life/catalogue (the real event-category / org-type catalogue)
  //
  // Added in remediation. The route is real and anonymous
  // (`Api/CommunityLifeCatalogEndpoints.cs:26`) and nothing here served it, so a
  // screen built off the live catalogue would have got a 404 from the dev
  // adapter and concluded the deployment has no categories.
  //
  // The rows below are the seeded catalogue, reproduced from
  // `DefaultEventCategoryContributor` and `DefaultOrganizationTypeContributor`
  // via the tables in `lib/community-life-catalogue.ts`, so a picker built
  // against this handler offers exactly the keys the server will resolve. Counts
  // are zero rather than invented: a fixture must not claim a deployment has
  // forty weddings on file.
  mock.onGet(/^\/community-life\/catalogue$/).reply(() => {
    const eventCategories = Object.entries(SEEDED_EVENT_CATEGORY_NAMES).map(
      ([key, name], index) => ({
        key,
        name,
        description: null,
        iconName: null,
        groupName: null,
        facets: [],
        order: (index + 1) * 10,
        // The server's own default is true. The four the seed switches off —
        // `worship-service`, `religious-festival`, `funeral` and `market` — are
        // named from `DefaultEventCategoryContributor` rather than guessed.
        // Nobody signs up for a Sunday service, and a guest list at a funeral is
        // the organizer's business.
        defaultsToRsvp: !['worship-service', 'religious-festival', 'funeral', 'market'].includes(key),
        eventCount: 0,
      })
    );

    const organizationTypes = Object.entries(SEEDED_ORGANIZATION_TYPE_NAMES).map(
      ([key, name], index) => ({
        key,
        name,
        description: null,
        iconName: null,
        groupName: null,
        order: (index + 1) * 10,
        encouragesVerification: false,
        organizationCount: 0,
      })
    );

    return [
      200,
      {
        data: {
          organizationTypes,
          eventCategories,
          facets: [
            'business', 'cultural', 'family', 'religious', 'sport', 'student', 'volunteer',
          ],
        },
      },
    ];
  });

  // ── GET /community-life/calendar ───────────────────────────────────────────
  //
  // **Wave J — the twelfth instance of the same pattern, found while fixing the
  // eleventh.** This handler read `cityName` and derived a country from it with
  // a three-city lookup table. `GET /community-life/calendar` binds exactly four
  // parameters — `from`, `to`, `countryCode`, `neighborhoodAreaId`
  // (`CommunityLifeDiscoveryEndpoints.cs:36-39`) — and **no city, under any
  // spelling**. So the calendar screen has always shown the whole feed with a
  // city name written above it, and this handler is why nobody noticed.
  //
  // The city lookup is gone. `countryCode` is read directly, as the route reads
  // it, and a request with no country gets everything — which is what the route
  // does too.
  mock.onGet(/^\/community-life\/calendar$/).reply((config) => {
    const params = config.params || {};
    const countryCode = params.countryCode ? String(params.countryCode).toUpperCase() : '';
    const from = params.from ? String(params.from) : '';
    const to = params.to ? String(params.to) : '';

    const allEvents = [...customEvents, ...mockEvents];

    const inWindow = (date: string) => (!from || date >= from.slice(0, 10)) && (!to || date <= to.slice(0, 10));

    // `countryCode` is compared against the entry's own country. The event
    // fixtures carry none, so a country-scoped calendar returns holidays only —
    // which is the honest answer for rows that have no country on them.
    const localEvents = allEvents.filter(
      (e) => inWindow(e.date) && (!countryCode || (e.location.countryCode ?? '').toUpperCase() === countryCode)
    );

    const localHolidays = mockHolidays.filter(
      (h) => inWindow(h.date) && (!countryCode || h.countryCode === countryCode)
    );

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
