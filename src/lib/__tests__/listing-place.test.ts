// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the listing place readers (Android UAT, 31 Aug 2026)
//
// ── The crash ───────────────────────────────────────────────────────────────
//
// `JobCard` read `location.distanceKm` on rows from `GET /jobs`, which sends no
// `location` object at all. `Cannot read property 'distanceKm' of undefined`,
// thrown in render, killed the process — and `JobCard` is on the **Discover →
// Jobs tab**, so a primary navigation destination crashed the moment the jobs
// table stopped being empty.
//
// `HousingCard` had the identical line. `MarketplaceCard` did not crash, but
// read `location.areaName` (the wire says `neighbourhood`) and
// `location.distanceKm` (the wire puts it at the top level), so its place was
// always blank and its distance never appeared.
//
// The fixtures below are **verbatim** rows captured from the deployment on
// 31 Aug 2026. That is the point: every one of these cards had only ever been
// rendered against a hand-written fixture carrying the shape the card expected.
// ─────────────────────────────────────────────────────────────────────────────

import {
  placeLabelOf,
  distanceKmOf,
  formatDistance,
  placeOf,
} from '@/lib/listing-place';

/** `GET /jobs` — flat, no `location`, no distance. This is what crashed. */
const JOB_ROW = {
  jobId: '01a05770-4067-79a8-b1b0-b1bb8b1c0212',
  title: 'Care assistant, Curepipe',
  employerName: 'Okonkwo Consulting Mauritius',
  categoryKey: 'healthcare',
  jobType: 'FullTime',
  countryCode: 'MU',
  locationLabel: 'Curepipe',
  workplaceType: 'OnSite',
  salary: { isDisclosed: false, minimum: null, maximum: null, currencyCode: null, period: null },
};

/** `POST /marketplace/search` — nested, British spelling, top-level distance. */
const MARKETPLACE_ROW = {
  listingId: '01a05769-d351-7514-847e-04ca2a6dbad5',
  title: 'Samsung Galaxy A54, unlocked, 128GB',
  location: {
    countryCode: 'MU',
    regionName: 'Plaines Wilhems',
    cityName: 'Curepipe',
    neighbourhood: 'Curepipe Town',
    areaId: 'ce2b2d59-e312-4bbe-8559-c07ba1e90c0b',
    displayName: 'Curepipe Town, Curepipe, Plaines Wilhems, MU',
  },
  distanceKm: 2.146,
};

/** `GET /housing/listings/{id}` — nested, `neighbourhoodName`, no coordinates. */
const HOUSING_ROW = {
  id: '01a05770-234c-704b-a2a6-1c2b51579912',
  title: 'Furnished 2-bedroom apartment, Quatre Bornes',
  location: {
    countryCode: 'MU',
    regionName: 'Plaines Wilhems',
    cityName: 'Quatre Bornes',
    neighborhoodName: null,
    neighborhoodAreaId: null,
    displayName: 'Quatre Bornes, Plaines Wilhems, MU',
  },
};

describe('placeLabelOf', () => {
  it('reads the jobs row, which has no location object', () => {
    expect(placeLabelOf(JOB_ROW)).toBe('Curepipe');
  });

  it('prefers the neighbourhood on a marketplace row, British spelling and all', () => {
    expect(placeLabelOf(MARKETPLACE_ROW)).toBe('Curepipe Town, Curepipe');
  });

  it('falls back to the city when the housing row has no neighbourhood', () => {
    expect(placeLabelOf(HOUSING_ROW)).toBe('Quatre Bornes');
  });

  it('says nothing rather than "undefined" for a row with no place at all', () => {
    expect(placeLabelOf({})).toBe('');
    expect(placeLabelOf(null)).toBe('');
    expect(placeLabelOf(undefined)).toBe('');
  });

  it('still reads the client fixture shape, so old fixtures keep rendering', () => {
    expect(placeLabelOf({ location: { areaName: 'Peckham', cityName: 'London' } })).toBe(
      'Peckham, London'
    );
  });
});

describe('distanceKmOf', () => {
  it('finds the marketplace distance at the top level of the row', () => {
    expect(distanceKmOf(MARKETPLACE_ROW)).toBeCloseTo(2.146);
  });

  it('finds a nested distance when a route sends one there', () => {
    expect(distanceKmOf({ location: { distanceKm: 0.4 } })).toBeCloseTo(0.4);
  });

  it('is null — not zero — when the platform did not say', () => {
    // The exact case that threw: a jobs row, read for a distance it never had.
    expect(distanceKmOf(JOB_ROW)).toBeNull();
    expect(distanceKmOf(HOUSING_ROW)).toBeNull();
    expect(distanceKmOf({})).toBeNull();
    expect(distanceKmOf(null)).toBeNull();
  });

  it('rejects a non-finite number rather than rendering NaN km away', () => {
    expect(distanceKmOf({ distanceKm: Number.NaN })).toBeNull();
    expect(distanceKmOf({ distanceKm: Number.POSITIVE_INFINITY })).toBeNull();
    expect(distanceKmOf({ distanceKm: '3' })).toBeNull();
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(0.42)).toBe('420m away');
  });

  it('uses one decimal above it', () => {
    expect(formatDistance(2.146)).toBe('2.1km away');
  });

  it('is empty for null, so the caller omits the line', () => {
    expect(formatDistance(null)).toBe('');
  });
});

describe('placeOf never throws on any shape', () => {
  const shapes: unknown[] = [
    JOB_ROW,
    MARKETPLACE_ROW,
    HOUSING_ROW,
    {},
    null,
    undefined,
    { location: null },
    { location: 'Curepipe' },
    { location: [] },
    { location: { distanceKm: 'not a number' } },
  ];

  it.each(shapes.map((shape, index) => [index, shape]))(
    'shape %i renders without throwing',
    (_index, shape) => {
      expect(() => placeOf(shape as never)).not.toThrow();

      const { label, distance } = placeOf(shape as never);
      expect(typeof label).toBe('string');
      expect(typeof distance).toBe('string');
      expect(label).not.toContain('undefined');
      expect(distance).not.toContain('NaN');
    }
  );
});

describe('the cards no longer read through an assumed location object', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...p: string[]): string };

  const read = (file: string) =>
    fs
      .readFileSync(path.join(process.cwd(), 'src', 'components', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

  it.each(['JobCard.tsx', 'HousingCard.tsx', 'MarketplaceCard.tsx'])(
    '%s does not dereference location.distanceKm',
    (file) => {
      expect(read(file)).not.toContain('location.distanceKm');
    }
  );

  it.each(['JobCard.tsx', 'HousingCard.tsx', 'MarketplaceCard.tsx'])(
    '%s does not dereference location.areaName',
    (file) => {
      expect(read(file)).not.toContain('location.areaName');
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// The marketplace detail shape (Android UAT, 31 Aug 2026 — screen sweep)
//
// Found by walking all 254 routes with real entity identifiers. Opening a real
// marketplace listing threw:
//
//     TypeError: Cannot read property 'split' of undefined
//     at ListingDetailScreen
//
// from `listing.seller.name.split(' ')`. The wire sends `seller.displayName`,
// not `seller.name` — the identical mismatch to the housing screen's
// `landlord` vs `host`, on the sibling screen, found only once a real listing
// existed to open.
//
// The rest of the response is nested the same way housing's is, and the render
// reads it flat.
// ─────────────────────────────────────────────────────────────────────────────

describe('the marketplace detail screen reads the wire shape', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...p: string[]): string };

  const SOURCE = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'marketplace', '[id].tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

  it('maps seller.displayName onto the name the render wants', () => {
    expect(SOURCE).toContain('seller.displayName');
  });

  it('never calls .split on a value that may be undefined', () => {
    expect(SOURCE).not.toMatch(/listing\.seller\.name\.split/);
  });

  it('flattens the nested price rather than reading listing.price off the wire', () => {
    expect(SOURCE).toContain('price.isDisclosed');
    expect(SOURCE).toContain('price.amount');
  });

  it('renders an undisclosed price as words, not as a symbol plus undefined', () => {
    expect(SOURCE).toContain('Price on request');
  });

  it('takes the listing id from listingId, which is what the wire calls it', () => {
    expect(SOURCE).toContain('raw?.listingId');
  });
});

// The real response, captured 31 Aug 2026, kept so the shape is documented by
// data rather than by prose.
describe('captured marketplace listing response', () => {
  const WIRE = {
    listingId: '01a05769-d351-7514-847e-04ca2a6dbad5',
    title: 'Samsung Galaxy A54, unlocked, 128GB',
    price: {
      isDisclosed: true,
      amount: 11500,
      currency: 'MUR',
      isNegotiable: true,
      isFree: false,
      minimumOffer: null,
    },
    seller: {
      sellerId: '01a0575a-3af2-7ee5-ba97-44fae111074c',
      displayName: 'David Mensah Electronics',
      slug: 'david-mensah-electronics',
      sellerType: 'Individual',
      isVerified: false,
      rating: null,
    },
    location: {
      countryCode: 'MU',
      regionName: 'Plaines Wilhems',
      cityName: 'Curepipe',
      neighbourhood: 'Curepipe Town',
      displayName: 'Curepipe Town, Curepipe, Plaines Wilhems, MU',
    },
  };

  it('has no seller.name — which is what the screen used to read', () => {
    expect((WIRE.seller as Record<string, unknown>).name).toBeUndefined();
    expect(WIRE.seller.displayName).toBe('David Mensah Electronics');
  });

  it('has no top-level price number — price is an object', () => {
    expect(typeof WIRE.price).toBe('object');
    expect(WIRE.price.amount).toBe(11500);
  });

  it('prices a Mauritian listing in MUR', () => {
    expect(WIRE.price.currency).toBe('MUR');
  });

  it('is read correctly by placeOf', () => {
    expect(placeLabelOf(WIRE)).toBe('Curepipe Town, Curepipe');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The event page's "nearby ecosystem" (UAT-111)
//
// Six sections of the event detail page — nearby updates, jobs, housing,
// services, guides and organisations — were assembled by filtering `src/mocks/`
// by city name, with **no `__DEV__` guard and no gap-preview flag**. That is
// live in a signed release bundle: fabricated jobs, homes and businesses
// presented as platform content.
//
// A Mauritian event rendered empty only because the fixtures are all London and
// the city filter matched nothing — which concealed the problem rather than
// solving it.
//
// The six real endpoints exist and none is wired. Wiring them is a feature;
// inventing the content while that waits is the failure mode this release was
// audited for. The sections now render their honest empty states.
// ─────────────────────────────────────────────────────────────────────────────

describe('the event page does not invent what is nearby', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...p: string[]): string };

  const SOURCE = fs
    .readFileSync(
      path.join(process.cwd(), 'src', 'app', 'community-life', 'event', '[id].tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

  it.each([
    'mockJobs',
    'mockHousingListings',
    'mockListings',
    'mockCommunityUpdates',
    'mockGuides',
    'mockOrganizations',
  ])('does not build a section from %s', (fixture) => {
    expect(SOURCE).not.toContain(fixture);
  });

  it('imports no fixture module for its listings', () => {
    for (const module of [
      '@/mocks/jobs-data',
      '@/mocks/housing-data',
      '@/mocks/community-life-data',
    ]) {
      expect(SOURCE).not.toContain(module);
    }
  });

  it('renders empty rather than filtered fiction', () => {
    expect(SOURCE).toMatch(/updates: \[\], jobs: \[\], housing: \[\]/);
  });
});
