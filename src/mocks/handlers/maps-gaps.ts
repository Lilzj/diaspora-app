// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — simulated Maps routes (Frontend Phase 8)
//
// ⚠ BACKEND GAP / DEVELOPMENT ONLY. Nothing here exists in the certified
//   backend. Registered under `/maps-gap/v0` and unreachable in a production
//   build — `registerMapsGapMocks` returns immediately when the simulation
//   switch is off. ⚠
//
// ── The rule this file follows ───────────────────────────────────────────────
//
// **Derive from real data wherever the real data exists.** The neighbourhood
// scores start from the *real* `stats` and `resourceCounts` that
// `/neighborhood/{id}` returns and mark those dimensions `backend`. The safety
// score is the real `stats.safetyScore`, unchanged.
//
// The alternative — random numbers keyed off a name — would produce a UI that
// looks identical and reviews as identical, and would teach whoever reviews it
// nothing about whether the real thing will work. A heat map that is hot where
// the listings are is a heat map somebody can look at and say "yes, that is
// what I expected"; a random one is a coloured blur.
//
// Where nothing real exists — a food price index, a transport dimension, a
// trend over a previous period — the value is generated deterministically from
// the neighbourhood name, so it is stable across reloads and across screenshots,
// and it is marked `simulated` at the field level.
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import { areMapsGapsEnabled } from '@/config/maps-gaps';
import { getDistanceKm, isWithinRadius } from '@/utils/geo';
import type {
  CostOfLivingIndex,
  DataFreshness,
  NeighborhoodScore,
  SafetyScore,
  ScoreDimension,
} from '@/types/maps';
import { toSafetyBand } from '@/types/maps';
import { mockHousingListings } from '../housing-data';
import { mockJobs } from '../jobs-data';
import { mockMarketplaceListings } from '../marketplace-data';
import { mockEvents, mockOrganizations } from '../community-life-data';
import { mockCommunityUpdates } from '../community-data';
import { mockListings } from '../data';
import { mockLocationDatabase } from './location';
import { platformProblem } from '../platform-problem';

const PREFIX = '/maps-gap/v0';

/** The source stamp every simulated figure carries. §23, §25, §26. */
const SIMULATED_SOURCE = 'Diaspora development estimate';

/**
 * A small deterministic hash, so a neighbourhood's simulated figures are the
 * same on every reload.
 *
 * Reviewing a comparison screen means looking at two numbers side by side; if
 * they changed on every render nobody could tell a layout bug from a data
 * change, and every screenshot in a review would differ from the last.
 */
function seed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0) / 0xffffffff;
}

/** A stable pseudo-value in a range, keyed by neighbourhood and dimension. */
function seeded(key: string, min: number, max: number): number {
  return Math.round(min + seed(key) * (max - min));
}

function freshness(overrides: Partial<DataFreshness> = {}): DataFreshness {
  return {
    computedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    sourceName: SIMULATED_SOURCE,
    ...overrides,
  };
}

/** The freshness stamp for a figure that came from the certified route. */
function backendFreshness(overrides: Partial<DataFreshness> = {}): DataFreshness {
  return {
    computedAt: new Date().toISOString(),
    sourceName: 'Diaspora community data',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// NEIGHBOURHOOD FIGURES
// ═════════════════════════════════════════════════════════════════════════════

/** Mirrors the certified `/neighborhood/{id}` derivation exactly. */
function safetyScoreFor(_neighborhood: string, cityName: string): number {
  return cityName.toLowerCase() === 'london' ? 84 : 92;
}

function walkabilityFor(cityName: string): number {
  return cityName.toLowerCase() === 'london' ? 88 : 78;
}

function costBandFor(cityName: string): 'Low' | 'Medium' | 'High' {
  return cityName.toLowerCase() === 'london' ? 'High' : 'Medium';
}

/** The band the certified route publishes, as an index. */
function costIndexFor(neighborhood: string, cityName: string): number {
  const band = costBandFor(cityName);
  const base = band === 'High' ? 128 : band === 'Medium' ? 100 : 82;
  return base + seeded(`cost:${neighborhood}`, -8, 8);
}

function findNode(id: string) {
  return mockLocationDatabase.find(
    (node) => node.neighborhood.toLowerCase().replace(/\s+/g, '-') === id.toLowerCase()
  );
}

interface Positioned {
  latitude?: number;
  longitude?: number;
}

function countsWithin(latitude: number, longitude: number, radiusKm: number) {
  const within = (items: { location?: Positioned }[]) =>
    items.filter(
      (item) =>
        typeof item.location?.latitude === 'number' &&
        typeof item.location?.longitude === 'number' &&
        isWithinRadius(latitude, longitude, item.location.latitude, item.location.longitude, radiusKm)
    ).length;

  return {
    housing: within(mockHousingListings),
    jobs: within(mockJobs),
    marketplace: within(mockMarketplaceListings),
    events: within(mockEvents),
    organizations: within(mockOrganizations),
    providers: within(mockListings),
    updates: within(mockCommunityUpdates),
  };
}

/** Turns a raw count into a 0–100 dimension. Saturating, deliberately. */
function countToScore(count: number, saturateAt: number): number {
  return Math.round(Math.min(100, (count / saturateAt) * 100));
}

function buildDimensions(id: string, node: { neighborhood: string; cityName: string; latitude: number; longitude: number }): ScoreDimension[] {
  const counts = countsWithin(node.latitude, node.longitude, 5);
  const key = `${node.cityName}:${node.neighborhood}`;

  // ── Dimensions with real data behind them ──────────────────────────────────
  //
  // These four are derived from figures the certified `/neighborhood/{id}`
  // route genuinely returns, so they are stamped with the platform as their
  // source rather than with the adapter. Marking them as simulated would be its
  // own kind of dishonesty — it would tell a reviewer the safety number is
  // invented when it is the one number that is not.
  const real: ScoreDimension[] = [
    {
      id: 'safety',
      label: 'Safety',
      score: safetyScoreFor(node.neighborhood, node.cityName),
      explanation: 'Community safety score published for this neighbourhood.',
      freshness: backendFreshness({
        limitations: [
          'A community-reported figure, not an official crime statistic.',
          'It does not describe any individual street or any particular time of day.',
        ],
      }),
    },
    {
      id: 'transport',
      label: 'Transport',
      score: walkabilityFor(node.cityName),
      explanation: 'Walkability score published for this neighbourhood.',
      freshness: backendFreshness(),
    },
    {
      id: 'community-activity',
      label: 'Community activity',
      score: countToScore(counts.events + counts.organizations + counts.updates, 12),
      explanation: `${counts.events} events, ${counts.organizations} organizations and ${counts.updates} community reports within 5 km.`,
      freshness: backendFreshness(),
    },
    {
      id: 'housing',
      label: 'Housing',
      score: countToScore(counts.housing, 10),
      explanation: `${counts.housing} homes listed within 5 km.`,
      freshness: backendFreshness(),
    },
    {
      id: 'jobs',
      label: 'Jobs',
      score: countToScore(counts.jobs, 10),
      explanation: `${counts.jobs} jobs advertised within 5 km.`,
      freshness: backendFreshness(),
    },
    {
      id: 'services',
      label: 'Services',
      score: countToScore(counts.providers, 12),
      explanation: `${counts.providers} service providers within 5 km.`,
      freshness: backendFreshness(),
    },
    {
      id: 'events',
      label: 'Events',
      score: countToScore(counts.events, 8),
      explanation: `${counts.events} events within 5 km.`,
      freshness: backendFreshness(),
    },
  ];

  // ── Dimensions with nothing behind them ────────────────────────────────────
  //
  // Cost of living and amenities have no derivable basis. Seeded so they are
  // stable, and stamped with the adapter so every surface marks them.
  const simulated: ScoreDimension[] = [
    {
      id: 'cost-of-living',
      label: 'Cost of living',
      // Inverted so that, like every other dimension, higher is better.
      score: Math.max(0, Math.min(100, 200 - costIndexFor(node.neighborhood, node.cityName))),
      trend: { direction: 'up', delta: seeded(`col-trend:${key}`, 1, 4), periodDays: 90 },
      explanation: 'Estimated from the published cost band. No category breakdown exists yet.',
      freshness: freshness({
        limitations: ['No backend cost-of-living contract exists. This is a development estimate.'],
      }),
    },
    {
      id: 'amenities',
      label: 'Amenities',
      score: seeded(`amenities:${key}`, 55, 92),
      explanation: 'No amenity data source is connected yet.',
      freshness: freshness({
        limitations: ['No backend amenity contract exists. This is a development estimate.'],
      }),
    },
  ];

  return [...real, ...simulated];
}

function buildNeighborhoodScore(id: string): NeighborhoodScore | null {
  const node = findNode(id);
  if (!node) return null;

  const dimensions = buildDimensions(id, node);
  const average = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);

  // Nearby neighbourhoods, by real distance from the real node set.
  const nearby = mockLocationDatabase
    .filter((other) => other.neighborhood !== node.neighborhood)
    .map((other) => ({
      id: other.neighborhood.toLowerCase().replace(/\s+/g, '-'),
      distance: getDistanceKm(node.latitude, node.longitude, other.latitude, other.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)
    .map((entry) => entry.id);

  return {
    neighborhoodId: id,
    name: node.neighborhood,
    cityName: node.cityName,
    countryCode: node.countryCode,
    center: { latitude: node.latitude, longitude: node.longitude },
    // `simulated`, not `backend`, and this is the important line in the file.
    // The overall figure is a blend of seven real dimensions and two invented
    // ones. A blend containing an invented input is not a backend value, and
    // §23 forbids the client presenting an authoritative composite score.
    overall: { value: average, source: 'simulated', gapKey: 'neighborhoodScores' },
    dimensions,
    freshness: freshness({
      methodology:
        'An unweighted mean of the dimensions below. Seven are derived from published Diaspora data; two are development estimates.',
      limitations: [
        'The overall figure blends real and estimated dimensions and should not be treated as authoritative.',
      ],
    }),
    nearbyNeighborhoodIds: nearby,
  };
}

function buildCostOfLiving(id: string): CostOfLivingIndex | null {
  const node = findNode(id);
  if (!node) return null;

  const overall = costIndexFor(node.neighborhood, node.cityName);
  const currency = node.countryCode === 'GB' ? 'GBP' : 'MUR';
  const key = `${node.cityName}:${node.neighborhood}`;

  const categories: CostOfLivingIndex['categories'] = [
    { id: 'housing', label: 'Housing', index: overall + seeded(`h:${key}`, 4, 22) },
    { id: 'food', label: 'Food', index: overall + seeded(`f:${key}`, -12, 6) },
    { id: 'transport', label: 'Transport', index: overall + seeded(`t:${key}`, -8, 12) },
    { id: 'utilities', label: 'Utilities', index: overall + seeded(`u:${key}`, -10, 8) },
    { id: 'healthcare', label: 'Healthcare', index: overall + seeded(`hc:${key}`, -15, 5) },
    { id: 'leisure', label: 'Leisure', index: overall + seeded(`l:${key}`, -6, 14) },
  ];

  return {
    neighborhoodId: id,
    name: node.neighborhood,
    overallIndex: overall,
    baselineName: node.countryCode === 'GB' ? 'the UK national average' : 'the Mauritius average',
    currency,
    categories,
    freshness: freshness({
      methodology:
        'Derived from the published cost band for this city, spread across categories. Not a survey.',
      limitations: [
        'No backend cost-of-living contract exists. Every category figure here is a development estimate.',
        'Category figures are not based on any price survey and must not be used for budgeting.',
      ],
      // A cost index older than a quarter is history, not current. Stated so
      // the UI can say so — §25 asks for a data date and this is the other half.
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  };
}

function buildSafetyScore(id: string): SafetyScore | null {
  const node = findNode(id);
  if (!node) return null;

  // The real figure, unchanged. Only the provenance around it is simulated.
  const score = safetyScoreFor(node.neighborhood, node.cityName);
  const counts = countsWithin(node.latitude, node.longitude, 5);
  const key = `${node.cityName}:${node.neighborhood}`;

  return {
    neighborhoodId: id,
    name: node.neighborhood,
    score,
    band: toSafetyBand(score),
    breakdown: [
      {
        id: 'safety',
        label: 'Overall',
        score,
        explanation: 'The community safety score published for this neighbourhood.',
        freshness: backendFreshness(),
      },
      {
        id: 'community-activity',
        label: 'Community presence',
        score: countToScore(counts.organizations + counts.events, 10),
        explanation: `${counts.organizations} organizations and ${counts.events} events within 5 km. A more active community usually means more people around.`,
        freshness: backendFreshness(),
      },
      {
        id: 'services',
        label: 'Services nearby',
        score: countToScore(counts.providers, 12),
        explanation: `${counts.providers} service providers within 5 km.`,
        freshness: backendFreshness(),
      },
    ],
    trend: {
      direction: seed(`trend:${key}`) > 0.5 ? 'up' : 'flat',
      delta: seeded(`trend-delta:${key}`, 0, 3),
      periodDays: 90,
    },
    freshness: freshness({
      sourceName: 'Diaspora community reports',
      methodology:
        'Aggregated from community reports and verification signals for this neighbourhood. Not derived from police or government crime statistics.',
      // §26: display limitations. These are rendered verbatim beside the score
      // on every safety surface, whether or not the provenance is simulated.
      limitations: [
        'This is a community-reported figure, not an official crime statistic.',
        'It describes a whole neighbourhood and says nothing about a particular street, building or time of day.',
        'Areas with few community members will have very little data behind their score.',
        'It must not be used as the only basis for a decision about where to live.',
      ],
      sampleSize: counts.updates + counts.organizations,
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

export function setupMapsGapMocks(mock: MockAdapter) {
  // §57: nothing is registered at all in a build that may not simulate. The
  // routes do not exist rather than existing and refusing, so a call that
  // somehow escaped would 404 at the gateway.
  if (!areMapsGapsEnabled()) return;

  console.warn(
    '[MOCK][BACKEND GAP] Registering simulated Maps routes under /maps-gap/v0. ' +
      'Neighbourhood score breakdowns, cost-of-living categories, safety ' +
      'provenance and alert affected areas are SIMULATED. Search, listings, events, ' +
      'organizations, guides and community alerts are real.'
  );

  // GET /maps-gap/v0/neighborhoods/compare — before the {id} routes, since
  // `compare` would otherwise match as an id.
  mock.onGet(new RegExp(`${PREFIX}/neighborhoods/compare`)).reply((config) => {
    const ids = String(config.params?.ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const scores = ids
      .map(buildNeighborhoodScore)
      .filter((score): score is NeighborhoodScore => score !== null);

    return [200, { data: scores }];
  });

  // GET /maps-gap/v0/neighborhoods/{id}/scores
  mock.onGet(new RegExp(`${PREFIX}/neighborhoods/[^/]+/scores$`)).reply((config) => {
    const id = extractNeighborhoodId(config.url ?? '');
    const score = buildNeighborhoodScore(id);
    return score ? [200, { data: score }] : platformProblem(404, `Unknown neighbourhood ${id}`);
  });

  // GET /maps-gap/v0/neighborhoods/{id}/cost-of-living
  mock.onGet(new RegExp(`${PREFIX}/neighborhoods/[^/]+/cost-of-living$`)).reply((config) => {
    const id = extractNeighborhoodId(config.url ?? '');
    const index = buildCostOfLiving(id);
    return index ? [200, { data: index }] : platformProblem(404, `Unknown neighbourhood ${id}`);
  });

  // GET /maps-gap/v0/neighborhoods/{id}/safety
  mock.onGet(new RegExp(`${PREFIX}/neighborhoods/[^/]+/safety$`)).reply((config) => {
    const id = extractNeighborhoodId(config.url ?? '');
    const score = buildSafetyScore(id);
    return score ? [200, { data: score }] : platformProblem(404, `Unknown neighbourhood ${id}`);
  });

  // /maps-gap/v0/alerts/{id}/area is gone: the affected area is on the post (16 Sep 2026).

  // GET /maps-gap/v0/saved-places
  //
  // Read-only and deliberately empty of anything sensitive. See the note in
  // `maps-gap-api.ts`: this route exists to record the contract shape, not so a
  // development build can start holding where people live.
  mock.onGet(new RegExp(`${PREFIX}/saved-places$`)).reply(() => [200, { data: [] }]);
}

function extractNeighborhoodId(url: string): string {
  const parts = url.split('/').filter(Boolean);
  const index = parts.indexOf('neighborhoods');
  return index >= 0 && parts[index + 1] ? parts[index + 1] : '';
}
