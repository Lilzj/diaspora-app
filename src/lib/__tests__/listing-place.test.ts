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
  providerPlaceLine,
  pinPlaceOf,
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

// Android UAT, 3 Nov 2026: the Discover provider card printed the server's
// distance as it came, "Grand Baie · 2.0667064493783025 km away".
describe('providerPlaceLine', () => {
  it('rounds the distance like every other card', () => {
    expect(providerPlaceLine({ cityName: 'Grand Baie', distanceKm: 2.0667064493783025 }))
      .toBe('📍 Grand Baie · 2.1km away');
  });

  it('prefers the area to the town', () => {
    expect(providerPlaceLine({ areaName: 'Pereybère', cityName: 'Grand Baie', distanceKm: 0.42 }))
      .toBe('📍 Pereybère · 420m away');
  });

  it('leaves the distance out when there is none', () => {
    expect(providerPlaceLine({ cityName: 'Grand Baie', distanceKm: null })).toBe('📍 Grand Baie');
    expect(providerPlaceLine({})).toBe('📍 Location not given');
  });
});

// The same day: a map pin with no distance was given 0 km, which the pin card
// reads as "In Your Neighborhood".
describe('pinPlaceOf', () => {
  it('keeps an unknown distance unknown', () => {
    expect(pinPlaceOf({ latitude: -20.01, longitude: 57.58 }))
      .toEqual({ latitude: -20.01, longitude: 57.58, distanceKm: null });
  });

  it('keeps a known distance', () => {
    expect(pinPlaceOf({ latitude: -20.01, longitude: 57.58, distanceKm: 3.2 })?.distanceKm).toBe(3.2);
  });

  it('places nothing without both coordinates', () => {
    expect(pinPlaceOf({ latitude: -20.01 })).toBeNull();
    expect(pinPlaceOf(undefined)).toBeNull();
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

  /** A file's code, with its prose removed so a comment cannot satisfy a check. */
  const code = (...segments: string[]) =>
    fs
      .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

  // **The mapping moved.** It used to sit inside this screen's fetch effect,
  // where nothing could test it, no other screen could reuse it, and the
  // contract-drift check could not see it — which is how `intent` and `images`
  // stayed wrong long after the fields around them had been fixed. These
  // assertions follow it to `lib/marketplace-wire.ts` rather than pinning it
  // back into the screen.
  const SCREEN = code('app', 'marketplace', '[id].tsx');
  const SEAM = code('lib', 'marketplace-wire.ts');

  it('maps seller.displayName onto the name the render wants', () => {
    expect(SEAM).toContain('seller.displayName');
  });

  it('never calls .split on a value that may be undefined', () => {
    expect(SCREEN).not.toMatch(/listing\.seller\.name\.split/);
  });

  it('flattens the nested price rather than reading listing.price off the wire', () => {
    expect(SEAM).toContain('price.isDisclosed');
    expect(SEAM).toContain('price.amount');
  });

  it('renders an undisclosed price as words, not as a symbol plus undefined', () => {
    expect(SEAM).toContain('Price on request');
  });

  it('takes the listing id from listingId, which is what the wire calls it', () => {
    expect(SEAM).toContain('wire.listingId');
  });

  it('reads the wire through the seam rather than flattening it again inline', () => {
    // The screen must not go back to picking the nested objects apart itself.
    expect(SCREEN).toContain('toListing(');
    expect(SCREEN).not.toContain('raw?.price');
    expect(SCREEN).not.toContain('seller.displayName');
  });
});
