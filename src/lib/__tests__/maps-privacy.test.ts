// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — location privacy (Frontend Phase 8, §39, §40, §51, §59)
//
// The rules in `lib/maps/privacy.ts` are the ones with real-world consequences
// if they slip, so they are asserted as properties rather than as spot checks.
// The averaging-attack test in particular exists because "add some jitter" is
// the obvious implementation and it is the one that leaks: re-render five
// times, take the centroid, and you have the true position back.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATEGORY_PRECISION,
  coarseForAnalytics,
  coordinateForRequest,
  isSensitiveSavedLocation,
  markerCoordinate,
  publicLabelFor,
  reducePrecision,
} from '@/lib/maps/privacy';
import { distanceBetween, toKm } from '@/lib/maps/geo';
import type { MarkerCategory } from '@/types/maps';

const HOME = { latitude: 51.474212, longitude: -0.069134 };

describe('category precision — §32, §39', () => {
  it('coarsens the two categories that reveal where somebody is', () => {
    // Housing is frequently somebody's current home; a marketplace pin is
    // frequently a seller's address. Both are the leak §32/§39 name.
    expect(CATEGORY_PRECISION.housing).toBe('approximate');
    expect(CATEGORY_PRECISION.marketplace).toBe('approximate');
  });

  it('leaves published locations exact', () => {
    // Coarsening an event venue or an organization office would make the
    // product worse for no privacy gain — these are public facts.
    expect(CATEGORY_PRECISION.event).toBe('exact');
    expect(CATEGORY_PRECISION.organization).toBe('exact');
    expect(CATEGORY_PRECISION.provider).toBe('exact');
    expect(CATEGORY_PRECISION.job).toBe('exact');
    expect(CATEGORY_PRECISION.alert).toBe('exact');
  });

  it('assigns a precision to every marker category', () => {
    // A category added without a precision decision would default to whatever
    // the object lookup returned, which is `undefined` — and `reducePrecision`
    // would then not be exhaustive. Making this explicit keeps the decision
    // deliberate rather than inherited.
    const categories: MarkerCategory[] = [
      'housing', 'marketplace', 'job', 'provider', 'guide', 'organization',
      'event', 'neighborhood', 'alert', 'service', 'place', 'saved',
      'origin', 'destination', 'waypoint',
    ];
    for (const category of categories) {
      expect(CATEGORY_PRECISION[category]).toBeDefined();
    }
  });
});

describe('approximate precision', () => {
  it('moves the point, but not far enough to be useless', () => {
    const reduced = reducePrecision(HOME, 'approximate', 'listing-1');
    const metres = distanceBetween(HOME, reduced).metres;

    expect(metres).toBeGreaterThan(0);
    // Enough to destroy "which building", little enough to preserve "which end
    // of the road" — the trade documented in `privacy.ts`.
    expect(metres).toBeLessThanOrEqual(151);
    expect(reduced.precision).toBe('approximate');
  });

  it('is stable for the same entity', () => {
    const a = reducePrecision(HOME, 'approximate', 'listing-1');
    const b = reducePrecision(HOME, 'approximate', 'listing-1');
    expect(a).toEqual(b);
  });

  it('cannot be averaged back to the true position', () => {
    // The attack the deterministic offset exists to prevent. With random
    // jitter, the centroid of many renders converges on the truth; with a
    // per-entity offset, every render is the *same* wrong answer.
    const renders = Array.from({ length: 200 }, () =>
      reducePrecision(HOME, 'approximate', 'listing-1')
    );

    const centroid = {
      latitude: renders.reduce((sum, r) => sum + r.latitude, 0) / renders.length,
      longitude: renders.reduce((sum, r) => sum + r.longitude, 0) / renders.length,
    };

    // The centroid is still displaced. If jitter were random this would be
    // within a metre or two of HOME.
    expect(distanceBetween(HOME, centroid).metres).toBeGreaterThan(20);
  });

  it('spreads different entities across the whole circle', () => {
    // The test that caught the real defect. A hash whose low bits carry little
    // entropy — plain FNV-1a, before the avalanche step was added — put eight
    // consecutive short ids inside a 60 degree arc: every pin displaced the
    // same way, the street still legible, the mitigation worthless.
    //
    // Angles are computed in metres, not in raw degrees: a degree of longitude
    // is ~69 km in London against ~111 km for latitude, so an angle taken from
    // unscaled degrees is distorted by a factor of 1.6 and this test would be
    // measuring the projection rather than the hash.
    const METRES_PER_DEG_LAT = 111_320;
    const metresPerDegLon = Math.cos((HOME.latitude * Math.PI) / 180) * METRES_PER_DEG_LAT;

    const ids = Array.from({ length: 60 }, (_, i) => `listing-${i}`);
    const angles = ids.map((seed) => {
      const reduced = reducePrecision(HOME, 'approximate', seed);
      const dy = (reduced.latitude - HOME.latitude) * METRES_PER_DEG_LAT;
      const dx = (reduced.longitude - HOME.longitude) * metresPerDegLon;
      return (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    });

    // Eight 45-degree sectors. A well-distributed hash fills at least six of
    // them with sixty samples; the clumped one filled two.
    const sectors = new Set(angles.map((a) => Math.floor(a / (Math.PI / 4))));
    expect(sectors.size).toBeGreaterThanOrEqual(6);

    // And the mean displacement is near zero — no systematic direction.
    const meanX = angles.reduce((sum, a) => sum + Math.cos(a), 0) / angles.length;
    const meanY = angles.reduce((sum, a) => sum + Math.sin(a), 0) / angles.length;
    expect(Math.hypot(meanX, meanY)).toBeLessThan(0.35);
  });

  it('varies the offset distance as well as the direction', () => {
    // Angle and radius are drawn from separately avalanched values. Slicing one
    // hash would correlate them: ids that hash close together would get both a
    // similar direction and a similar distance.
    const radii = Array.from({ length: 40 }, (_, i) =>
      distanceBetween(HOME, reducePrecision(HOME, 'approximate', `listing-${i}`)).metres
    );

    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(60);
  });

  it('falls back to a coordinate-derived seed when no id is supplied', () => {
    const a = reducePrecision(HOME, 'approximate');
    const b = reducePrecision(HOME, 'approximate');
    expect(a).toEqual(b);
  });
});

describe('snapped precision', () => {
  it('collapses a neighbourhood to a shared centroid', () => {
    const a = reducePrecision({ latitude: 51.4742, longitude: -0.0691 }, 'neighborhood');
    const b = reducePrecision({ latitude: 51.4748, longitude: -0.0695 }, 'neighborhood');

    // Two addresses in the same block land on the same point — there is nothing
    // to recover.
    expect(a).toEqual(b);
    expect(a.precision).toBe('neighborhood');
  });

  it('collapses further at city precision', () => {
    const a = reducePrecision({ latitude: 51.47, longitude: -0.07 }, 'city');
    const b = reducePrecision({ latitude: 51.52, longitude: -0.12 }, 'city');
    expect(a).toEqual(b);
  });

  it('leaves an exact coordinate untouched', () => {
    const exact = reducePrecision(HOME, 'exact');
    expect(exact.latitude).toBe(HOME.latitude);
    expect(exact.longitude).toBe(HOME.longitude);
  });
});

describe('markerCoordinate — the only sanctioned path', () => {
  it('coarsens housing and flags it', () => {
    const { coordinate, isPrivacyReduced } = markerCoordinate(HOME, 'housing', 'listing-1');
    expect(isPrivacyReduced).toBe(true);
    expect(coordinate.precision).toBe('approximate');
    expect(distanceBetween(HOME, coordinate).metres).toBeGreaterThan(0);
  });

  it('leaves an event exact and does not flag it', () => {
    const { coordinate, isPrivacyReduced } = markerCoordinate(HOME, 'event', 'event-1');
    expect(isPrivacyReduced).toBe(false);
    expect(coordinate.latitude).toBe(HOME.latitude);
  });
});

describe('analytics coordinates — §51, §59', () => {
  it('returns a cell, not a coordinate', () => {
    const result = coarseForAnalytics(HOME, 'GB');

    expect(result).not.toBeNull();
    // The field name matters as much as the value: `{ latitude, longitude }` on
    // an event payload reads as a position and would survive review.
    expect(Object.keys(result!)).toEqual(['geoCell']);
    expect(result!.geoCell).toBe('gb:51.5,-0.1');
  });

  it('collapses everything within ~11 km to one cell', () => {
    const peckham = coarseForAnalytics({ latitude: 51.4742, longitude: -0.0691 }, 'GB');
    const brixton = coarseForAnalytics({ latitude: 51.4624, longitude: -0.1149 }, 'GB');
    expect(peckham!.geoCell).toBe(brixton!.geoCell);
  });

  it('distinguishes genuinely different regions', () => {
    const london = coarseForAnalytics({ latitude: 51.4742, longitude: -0.0691 }, 'GB');
    const mauritius = coarseForAnalytics({ latitude: -20.2417, longitude: 57.4806 }, 'MU');
    expect(london!.geoCell).not.toBe(mauritius!.geoCell);
  });

  it('never emits more than one decimal place', () => {
    const cell = coarseForAnalytics({ latitude: 51.474212345, longitude: -0.069134567 }, 'GB')!;
    expect(cell.geoCell).not.toMatch(/\d\.\d\d/);
  });

  it('returns null rather than a placeholder for no coordinate', () => {
    expect(coarseForAnalytics(null)).toBeNull();
    expect(coarseForAnalytics(undefined)).toBeNull();
  });
});

describe('request precision — §59', () => {
  it('rounds a search origin to roughly 110 metres', () => {
    const safe = coordinateForRequest(HOME, 'search');
    expect(safe.latitude).toBe(51.474);
    expect(safe.longitude).toBe(-0.069);
    // Still useful for a radius query, no longer precise enough to place
    // somebody inside a building.
    expect(toKm(distanceBetween(HOME, safe))).toBeLessThan(0.15);
  });

  it('keeps routing precise, because a rounded origin starts the walk elsewhere', () => {
    const safe = coordinateForRequest(HOME, 'routing');
    expect(distanceBetween(HOME, safe).metres).toBeLessThan(2);
  });

  it('rounds reverse geocoding, which only needs a neighbourhood', () => {
    const safe = coordinateForRequest(HOME, 'reverse-geocode');
    expect(safe.latitude).toBe(51.474);
  });
});

describe('sensitive saved locations — §20, §39', () => {
  it('recognises the labels that name where somebody lives', () => {
    expect(isSensitiveSavedLocation('home')).toBe(true);
    expect(isSensitiveSavedLocation('work')).toBe(true);
    expect(isSensitiveSavedLocation('school')).toBe(true);
    expect(isSensitiveSavedLocation('favourite')).toBe(false);
    expect(isSensitiveSavedLocation('custom')).toBe(false);
  });

  it('substitutes a neutral label for anything shared', () => {
    expect(publicLabelFor('home', 'Home')).toBe('A saved place');
    expect(publicLabelFor('work', 'Work')).toBe('A saved place');
    expect(publicLabelFor('favourite', 'Peckham Library')).toBe('Peckham Library');
  });
});
