// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map search against the certified routes
// (Frontend Phase 8, §52, §53, and RMD-007)
//
// **Every test in this file passed while every layer of the map was wrong
// against a running server.** They ran `maps-api.ts` against the app's mock
// handlers, and those handlers are shaped like the client's own types rather
// than like the routes: the `/providers` mock serves `listingId` and `title`,
// and the `/jobs` mock answers a bare list and filters on `query` and
// `cityName`. So the map read four layers' pages as lists and the mocks agreed;
// it read provider pins off `listingId` and the mock agreed. Several assertions
// could not have failed anyway: "reaches every category without throwing" held
// for a layer that threw, because `allSettled` swallows the throw, and "every
// marker has a destination" held for `{ id: undefined }`.
//
// The federated search is now driven by the cards each route sends. Every
// fixture below is typed as the type the map reads it as, and each of those
// types is compared field by field with the published contract by
// `backend-response-field-drift` — so a fixture can only carry fields the route
// sends — and every page has the route's own shape: `{ data: { items,
// nextCursor, hasMore } }`. The nearby aggregate and the alerts below still use
// the location mocks, whose shape an earlier wave fixed against the route.
//
// The properties that matter are the ones a screen relies on and cannot check
// for itself: that every layer draws a pin from its own card and opens the row
// it came from, that one failing layer does not empty the map, that results are
// filtered back to the rectangle, and that the privacy rule survives the round
// trip.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/transport/apiClient';
import { setupLocationMocks } from '@/mocks/handlers/location';
import {
  fetchAlertsNear,
  fetchNearby,
  mapKeys,
  neighborhoodIdFor,
  searchMap,
} from '@/lib/api/maps-api';
import type { EventWire } from '@/lib/api/event-wire';
import type { ProviderSummary } from '@/lib/api/providers-api';
import { boundsContain, circleToBounds } from '@/lib/maps/geo';
import type { HousingCardWire } from '@/lib/platform/housing-cards';
import type { OrganizationSearchCard } from '@/types/community-life';
import type { GuideCardResponse } from '@/types/guides';
import type { JobCardResponse } from '@/types/jobs-hiring';
import type { DiscoveryCategory, GeoBoundingBox } from '@/types/maps';
import type { MarketplaceListingCardResponse } from '@/types/marketplace';

// A fixed point in south London. This used to read `DEFAULT_LOCATION`, the
// product's Peckham default, which no longer exists — the app ships no default
// place. These cases are about bounding-box arithmetic, so the origin only has
// to be a real coordinate that the fixtures sit inside.
const ORIGIN = { latitude: 51.4742, longitude: -0.0691 };

/** A box around the origin, wide enough to contain every pinned fixture. */
const LONDON: GeoBoundingBox = circleToBounds(ORIGIN, 25);

/** Far outside the box: a route that overfetched would return it. */
const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 };

type Pin = { latitude: number; longitude: number } | null;

const pinOf = (pin: Pin) => ({ latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null });

/** A page, as every search route here answers one: `ApiResponse` around a cursor page. */
function page(items: readonly unknown[]) {
  return { data: { items, nextCursor: null, hasMore: false } };
}

// ── The cards, one factory per route ───────────────────────────────────────

function home(id: string, title: string, pin: Pin): HousingCardWire {
  return {
    id,
    title,
    accommodationTypeName: 'Flat',
    furnishedStatus: 'Furnished',
    price: { isDisclosed: true, amount: 1200, currencyCode: 'GBP', period: 'Monthly' },
    capacity: { bedrooms: 2, bathrooms: 1 },
    // The public coordinate: the server rounds a home to two places for a stranger.
    location: { countryCode: 'GB', cityName: 'London', neighborhoodName: 'Peckham', displayName: 'Peckham, London', ...pinOf(pin) },
    coverImage: null,
  };
}

function listing(listingId: string, title: string, pin: Pin): MarketplaceListingCardResponse {
  return {
    listingId,
    title,
    condition: 'Good',
    listingType: 'Sale',
    categoryKey: 'furniture',
    price: { isDisclosed: true, amount: 450, currency: 'GBP', isNegotiable: false, isFree: false },
    location: { countryCode: 'GB', cityName: 'London', neighbourhood: 'Peckham', displayName: 'Peckham, London', ...pinOf(pin) },
    seller: { sellerId: 'seller-1', displayName: 'Adaeze Okafor', isVerified: true },
  };
}

function posting(jobId: string, title: string, pin: Pin): JobCardResponse {
  return {
    jobId,
    slug: jobId,
    title,
    summary: 'Cooking for a busy kitchen.',
    employerId: 'employer-1',
    employerName: 'Mama Afrika Kitchen',
    employerLogoMediaId: null,
    isEmployerVerified: true,
    isIntermediary: false,
    categoryKey: 'hospitality',
    jobType: 'FullTime',
    experienceLevel: 'Mid',
    countryCode: 'GB',
    locationLabel: 'Peckham, London',
    ...pinOf(pin),
    workplaceType: 'OnSite',
    isRemote: false,
    offersVisaSponsorship: false,
    offersRelocationAssistance: false,
    salary: { isDisclosed: false, isNegotiable: false, isUnpaid: false },
    tags: [],
    skills: [],
    status: 'Published',
    isFeatured: false,
    isVerified: true,
    applicationCount: 0,
  };
}

function provider(providerId: string, name: string, pin: Pin): ProviderSummary {
  return {
    providerId,
    slug: providerId,
    name,
    providerType: 'Business',
    status: 'Active',
    category: { categoryId: 'category-1', slug: 'tailoring', name: 'Tailoring' },
    location: { countryCode: 'GB', areaName: 'Peckham', cityName: 'London', ...pinOf(pin) },
    reviewSummary: { average: 4.6, totalReviews: 12, distribution: {} },
    isVerified: true,
    isFeatured: false,
    deliveryMode: 'InPerson',
    tags: [],
    languages: [],
    // The one card that names its publisher's origin — and here it is not where the row is.
    owner: { userId: 'owner-1', originCountryCode: 'NG' },
  };
}

function gathering(eventId: string, title: string, pin: Pin): EventWire {
  return {
    eventId,
    title,
    slug: eventId,
    categoryKey: 'community-meeting',
    summary: 'A meet-up for new arrivals.',
    startsAt: '2026-12-05T18:00:00Z',
    endsAt: '2026-12-05T20:00:00Z',
    timeZoneId: 'Europe/London',
    attendanceMode: 'InPerson',
    venueName: 'Community Hall',
    // A summary has no venue: its pin is in `location`, since 23 November 2026.
    location: { countryCode: 'GB', cityName: 'London', neighborhoodName: 'Peckham', displayName: 'Peckham, London', ...pinOf(pin) },
    coverMediaId: null,
    isFree: true,
  };
}

function organization(organizationId: string, name: string, pin: Pin): OrganizationSearchCard {
  return {
    organizationId,
    name,
    organizationTypeKey: 'community-association',
    location: { countryCode: 'GB', cityName: 'London', neighborhoodName: 'Peckham', displayName: 'Peckham, London', ...pinOf(pin) },
    logoMediaId: null,
    isVerified: true,
  };
}

function guide(guideId: string, title: string, pin: Pin): GuideCardResponse {
  return {
    guideId,
    slug: guideId,
    title,
    excerpt: null,
    categoryKey: 'healthcare',
    countryCode: 'GB',
    cityName: 'London',
    ...pinOf(pin),
    language: 'en',
    status: 'Published',
    difficulty: 'Beginner',
    readingTimeMinutes: 5,
    isVerified: true,
    isFeatured: false,
    authorId: 'author-1',
    publishedAt: null,
    updatedAt: null,
    heroMediaId: null,
    tags: [],
    views: 0,
    helpfulCount: 0,
    commentCount: 0,
    bookmarkCount: 0,
  };
}

// ── The layers ───────────────────────────────────────────────────────────────

interface Layer {
  readonly category: DiscoveryCategory;
  /** The route, as the mock below is keyed: method and path as the client calls it. */
  readonly route: string;
  /** Pinned in the box, pinned in Manchester, and unpinned — in that order. */
  readonly cards: readonly unknown[];
  readonly id: string;
  readonly title: string;
  readonly pathname: string;
}

function layer(
  category: DiscoveryCategory,
  route: string,
  pathname: string,
  make: (id: string, title: string, pin: Pin) => unknown,
  title: string,
  inside: { latitude: number; longitude: number }
): Layer {
  const id = `${category}-in-the-box`;
  return {
    category,
    route,
    cards: [make(id, title, inside), make(`${category}-in-manchester`, `${title} (Manchester)`, MANCHESTER), make(`${category}-unpinned`, `${title} (no pin)`, null)],
    id,
    title,
    pathname,
  };
}

// Each inside pin is a different distance from the origin, so "nearest first" has an order to keep.
const LAYERS: readonly Layer[] = [
  layer('housing', 'get /housing/search', '/housing/[id]', home, 'Two-bed flat in Peckham', { latitude: 51.47, longitude: -0.07 }),
  layer('marketplace', 'post /marketplace/search', '/marketplace/[id]', listing, 'Oak dining table', { latitude: 51.476, longitude: -0.065 }),
  layer('job', 'get /jobs', '/job/[id]', posting, 'Line cook', { latitude: 51.48, longitude: -0.08 }),
  layer('provider', 'get /providers', '/provider/[id]', provider, 'Ankara Tailoring', { latitude: 51.4705, longitude: -0.06 }),
  layer('event', 'get /community-life/events', '/community-life/event/[id]', gathering, 'Newcomers meet-up', { latitude: 51.465, longitude: -0.075 }),
  layer('organization', 'get /community-life/organizations', '/community-life/org/[id]', organization, 'Peckham Nigerian Association', { latitude: 51.482, longitude: -0.069 }),
  layer('guide', 'get /guides/nearby', '/guide/[id]', guide, 'Registering with a GP', { latitude: 51.49, longitude: -0.07 }),
];

const EVERY_LAYER = LAYERS.map((each) => each.category);

const byCategory = (category: DiscoveryCategory): Layer => LAYERS.find((each) => each.category === category)!;

// ── The routes ───────────────────────────────────────────────────────────────

type Reply = [number, unknown];

/** What each route answers in the current test. Reset before every test. */
const answers = new Map<string, () => Reply>();

/** Every request a route received, with what it was asked. */
const sent: { route: string; params: Record<string, unknown>; body: unknown }[] = [];

function answerFrom(route: string) {
  return (config: { params?: Record<string, unknown>; data?: unknown }): Reply => {
    sent.push({
      route,
      params: config.params ?? {},
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    });
    const answer = answers.get(route);
    return answer ? answer() : [404, {}];
  };
}

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  mock.onGet(/\/housing\/search$/).reply(answerFrom('get /housing/search'));
  mock.onPost(/\/marketplace\/search$/).reply(answerFrom('post /marketplace/search'));
  mock.onGet(/\/jobs$/).reply(answerFrom('get /jobs'));
  mock.onGet(/\/providers$/).reply(answerFrom('get /providers'));
  mock.onGet(/\/community-life\/events$/).reply(answerFrom('get /community-life/events'));
  mock.onGet(/\/community-life\/organizations$/).reply(answerFrom('get /community-life/organizations'));
  mock.onGet(/\/guides\/nearby$/).reply(answerFrom('get /guides/nearby'));
  mock.onGet(/\/guides$/).reply(answerFrom('get /guides'));
  setupLocationMocks(mock);
  mock.onAny().reply(404);
});

beforeEach(() => {
  sent.length = 0;
  answers.clear();
  for (const each of LAYERS) answers.set(each.route, () => [200, page(each.cards)]);
  // A typed query sends guides to the text route, which answers the same cards.
  answers.set('get /guides', () => [200, page(byCategory('guide').cards)]);
});

afterAll(() => {
  mock.restore();
});

describe('federated map search, from the card each route sends — RMD-007', () => {
  it.each(LAYERS.map((each) => [each.category, each] as const))(
    'draws the %s layer from its card, and a tap opens the row it came from',
    async (category, each) => {
      const response = await searchMap({ categories: [category], bounds: LONDON }, ORIGIN);

      // Counted, so the layer answered rather than threw; one, so the
      // Manchester row was filtered back out of the box and the unpinned row
      // was placed nowhere.
      expect(response.counts[category]).toBe(1);
      expect(response.results).toHaveLength(1);

      const [result] = response.results;
      expect(result.category).toBe(category);
      expect(result.marker.title).toBe(each.title);
      expect(result.marker.entityId).toBe(each.id);
      expect(result.marker.destination).toEqual({ pathname: each.pathname, params: { id: each.id } });
      expect(result.entity).toEqual(each.cards[0]);
    }
  );

  it('asks the jobs route in the names it binds', async () => {
    await searchMap({ categories: ['job'], bounds: LONDON, query: 'chef', cityName: 'London' }, ORIGIN);

    const [request] = sent.filter((entry) => entry.route === 'get /jobs');
    expect(request.params).toMatchObject({ q: 'chef', city: 'London' });
    expect(typeof request.params.bounds).toBe('string');
    expect(request.params).not.toHaveProperty('query');
    expect(request.params).not.toHaveProperty('cityName');
  });

  it('asks for guides around the point, and by text only when there is text', async () => {
    await searchMap({ categories: ['guide'], bounds: LONDON }, ORIGIN);
    await searchMap({ categories: ['guide'], bounds: LONDON, query: 'clinic', countryCode: 'GB' }, ORIGIN);

    const nearby = sent.filter((entry) => entry.route === 'get /guides/nearby');
    const text = sent.filter((entry) => entry.route === 'get /guides');
    expect(nearby).toHaveLength(1);
    expect(nearby[0].params).toMatchObject({
      latitude: expect.any(Number),
      longitude: expect.any(Number),
      radiusKm: expect.any(Number),
    });
    expect(text).toHaveLength(1);
    expect(text[0].params).toEqual({ q: 'clinic', country: 'GB' });
  });

  it('leaves a layer uncounted when its route answers something other than a page', async () => {
    // Marketplace, because its old read was `toList`, which answers an
    // unreadable body with an empty list and so drew a confident nought.
    answers.set('post /marketplace/search', () => [200, { data: { unexpected: true } }]);

    const response = await searchMap({ categories: ['marketplace', 'housing'], bounds: LONDON }, ORIGIN);

    // "Nothing for sale here" and "the map could not read what came back" are
    // different facts: the chip shows a dash for the second, not a nought.
    expect(response.counts.marketplace).toBeUndefined();
    expect(response.counts.housing).toBe(1);
  });

  it('survives one layer failing — §54', async () => {
    answers.set('get /jobs', () => [500, {}]);

    const response = await searchMap({ categories: ['housing', 'job'], bounds: LONDON }, ORIGIN);

    // Housing pins still arrive; with `Promise.all` one 500 would empty the map.
    expect(response.counts.housing).toBe(1);
    // And the failed layer is absent from the counts rather than recorded as zero.
    expect(response.counts.job).toBeUndefined();
  });

  it('merges every layer into one result set, nearest first', async () => {
    const response = await searchMap({ categories: EVERY_LAYER, bounds: LONDON }, ORIGIN);

    expect(response.results).toHaveLength(LAYERS.length);
    expect(response.totalCount).toBe(LAYERS.length);
    for (const category of EVERY_LAYER) expect(response.counts[category]).toBe(1);

    const distances = response.results.map((result) => result.marker.distance?.metres);
    expect(distances.every((metres) => typeof metres === 'number')).toBe(true);
    expect([...(distances as number[])].sort((a, b) => a - b)).toEqual(distances);
  });

  it('filters results back to the rectangle', async () => {
    // A box a kilometre and a half around the origin holds some of the pins and not others.
    const tight = circleToBounds(ORIGIN, 1.5);
    const response = await searchMap({ categories: EVERY_LAYER, bounds: tight }, ORIGIN);

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.length).toBeLessThan(LAYERS.length);
    for (const result of response.results) {
      expect(boundsContain(tight, result.marker.coordinate)).toBe(true);
    }
    expect(response.searchedBounds).toEqual(tight);
  });

  it('accepts a centre and radius as well as a box', async () => {
    const response = await searchMap({ categories: ['housing'], center: ORIGIN, radiusKm: 10 }, ORIGIN);

    expect(response.counts.housing).toBe(1);
  });

  it('applies a limit and reports that more exist', async () => {
    const limited = await searchMap({ categories: EVERY_LAYER, bounds: LONDON, limit: 2 }, ORIGIN);

    expect(limited.results).toHaveLength(2);
    expect(limited.hasMore).toBe(true);
    expect(limited.totalCount).toBe(LAYERS.length);
  });

  it('tests a community scope against the country each card names', async () => {
    const inBritain = await searchMap(
      { categories: EVERY_LAYER, bounds: LONDON, communityOriginCountryCodes: ['GB'] },
      ORIGIN
    );

    // Every row is in Britain. The provider's owner is from Nigeria, and a
    // publisher's origin is the better evidence where a card carries one.
    expect(inBritain.counts).toEqual({
      housing: 1,
      marketplace: 1,
      job: 1,
      provider: 0,
      event: 1,
      organization: 1,
      guide: 1,
    });

    const fromNigeria = await searchMap(
      { categories: EVERY_LAYER, bounds: LONDON, communityOriginCountryCodes: ['ng'] },
      ORIGIN
    );

    expect(fromNigeria.counts).toEqual({
      housing: 0,
      marketplace: 0,
      job: 0,
      provider: 1,
      event: 0,
      organization: 0,
      guide: 0,
    });
  });
});

describe('markers produced by the search', () => {
  it('carries a spoken label on every marker — §50', async () => {
    const response = await searchMap({ categories: EVERY_LAYER, bounds: LONDON }, ORIGIN);

    expect(response.results).toHaveLength(LAYERS.length);
    for (const result of response.results) {
      // A sentence, not an id, and not a sentence with a hole in it.
      expect(result.marker.accessibilityLabel.length).toBeGreaterThan(10);
      expect(result.marker.accessibilityLabel).not.toBe(result.marker.id);
      expect(result.marker.accessibilityLabel).not.toMatch(/undefined|null|\[object/);
    }
  });

  it('coarsens housing coordinates and flags them — §39', async () => {
    const response = await searchMap({ categories: ['housing'], bounds: LONDON }, ORIGIN);

    expect(response.results).toHaveLength(1);
    const [result] = response.results;
    expect(result.marker.isPrivacyReduced).toBe(true);
    expect(result.marker.coordinate.precision).toBe('approximate');
    // And the member is told, because navigating to an approximate point
    // means being sent to a block rather than a door.
    expect(result.marker.accessibilityLabel).toContain('Approximate');
  });

  it("prices a pin from the card's price, not from the object it arrives in", async () => {
    const response = await searchMap({ categories: ['marketplace', 'housing'], bounds: LONDON }, ORIGIN);

    const badges = Object.fromEntries(response.results.map((result) => [result.category, result.marker.badge]));
    expect(badges).toEqual({ marketplace: '£450', housing: '£1.2k' });
  });

  it('does not name a marketplace seller — §32', async () => {
    const response = await searchMap({ categories: ['marketplace'], bounds: LONDON }, ORIGIN);

    expect(response.results).toHaveLength(1);
    const [result] = response.results;
    expect(result.marker.accessibilityLabel).not.toContain('Adaeze');
    expect(result.marker.title).not.toContain('Adaeze');
    expect(result.marker.subtitle ?? '').not.toContain('Adaeze');
  });

  it('rates a provider only when somebody has', async () => {
    const rated = await searchMap({ categories: ['provider'], bounds: LONDON }, ORIGIN);
    expect(rated.results[0].marker.badge).toBe('★4.6');

    const [inside] = byCategory('provider').cards as ProviderSummary[];
    answers.set('get /providers', () => [
      200,
      page([{ ...inside, reviewSummary: { average: 0, totalReviews: 0, distribution: {} } }]),
    ]);

    const unrated = await searchMap({ categories: ['provider'], bounds: LONDON }, ORIGIN);
    expect(unrated.results).toHaveLength(1);
    expect(unrated.results[0].marker.badge).toBeUndefined();
  });

  it('marks every certified result as backend-sourced', async () => {
    const response = await searchMap({ categories: EVERY_LAYER, bounds: LONDON }, ORIGIN);

    expect(response.results).toHaveLength(LAYERS.length);
    for (const result of response.results) {
      expect(result.marker.source).toBe('backend');
    }
  });
});

describe('nearby aggregate and alerts', () => {
  it('reads the groups the route answers, not fields at the top of the envelope', async () => {
    const nearby = await fetchNearby(ORIGIN, 10);

    // `NearbyResponse.groups`, keyed by resource type. Read from the top level
    // — as this client did until 16 Sep 2026 — every one of these is undefined
    // and the map draws nothing at all.
    expect(Array.isArray(nearby.groups.housing)).toBe(true);
    expect(Array.isArray(nearby.groups.jobs)).toBe(true);
    expect(Array.isArray(nearby.groups.marketplace)).toBe(true);
    expect(Array.isArray(nearby.groups.events)).toBe(true);
    expect(Array.isArray(nearby.groups.providers)).toBe(true);
    expect(Array.isArray(nearby.groups.updates)).toBe(true);
    expect(nearby.unavailable).toEqual([]);
  });

  it('actually returns alerts, which is what the empty read never proved', async () => {
    const alerts = await fetchAlertsNear(ORIGIN, 50);

    // The assertion this file was missing: every test here passed while the
    // layer was empty, because "for (const alert of [])" proves nothing.
    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];
    expect(alert.title).toBeTruthy();
    // The card renders the body and a "reported …" line from these two.
    expect(alert.body).toBeTruthy();
    expect(Number.isNaN(new Date(alert.publishedAt).getTime())).toBe(false);
    // Camel-cased on the wire; the kind lookup switches on the union and has no
    // default, so an unnormalised category left this undefined.
    expect(alert.kind).toBeTruthy();
    expect(alert.category).toMatch(/^[A-Z]/);
  });

  it('raises rather than drawing an unanswered vertical as nothing nearby', async () => {
    // Its own adapter, restored straight after: the suite's mocks are installed
    // once in `beforeAll`, so an override here would answer every later test.
    const unanswered = new MockAdapter(apiClient, { delayResponse: 0 });
    unanswered.onGet(/\/location\/nearby/).reply(200, {
      data: { groups: {}, unavailableResourceTypes: ['updates'] },
    });
    unanswered.onAny().reply(404);

    await expect(fetchAlertsNear(ORIGIN, 25)).rejects.toThrow(/could not be read/);

    unanswered.restore();
  });

  it('translates community updates into alerts without inventing an area — §27, GAP-017', async () => {
    const alerts = await fetchAlertsNear(ORIGIN, 25);

    for (const alert of alerts) {
      expect(alert.source).toBe('backend');
      // The affected-area geometry has no certified contract. Drawing a radius
      // the publisher never stated would be the client deciding the scope of an
      // emergency.
      expect(alert.area).toBeUndefined();
      expect(alert.severity).toBeTruthy();
      expect(alert.kind).toBeTruthy();
      expect(alert.sourceName).toBeTruthy();
    }
  });

  it('excludes expired alerts — §29', async () => {
    const alerts = await fetchAlertsNear(ORIGIN, 50);
    for (const alert of alerts) {
      expect(alert.status).not.toBe('Expired');
      expect(alert.status).not.toBe('Withdrawn');
      if (alert.expiresAt) {
        expect(new Date(alert.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    }
  });
});

describe('neighbourhood ids', () => {
  it('slugifies a name the way the route expects', () => {
    expect(neighborhoodIdFor('Rose Hill Central')).toBe('rose-hill-central');
    expect(neighborhoodIdFor('  Peckham  ')).toBe('peckham');
  });
});

describe('query keys — §39, §42', () => {
  it('rounds coordinates so no precise position reaches a cache key', () => {
    const key = mapKeys.nearby({ latitude: 51.474212345, longitude: -0.069134567 }, 5);
    expect(key.join('|')).toContain('51.474,-0.069');
    expect(key.join('|')).not.toContain('51.4742123');
  });

  it('is stable across category order, so a reorder is a cache hit', () => {
    const a = mapKeys.search(['housing', 'job'], LONDON, 'x');
    const b = mapKeys.search(['job', 'housing'], LONDON, 'x');
    expect(a).toEqual(b);
  });
});
