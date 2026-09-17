// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Geographic intelligence, certified arm
// (Remediation Wave C-06)
//
// `config/maps-gaps.ts` declares heat maps, neighbourhood scores, cost of
// living, safety provenance and routing as absent. `Diaspora.Modules.Geographic
// Intelligence` serves all five under `/api/v1/geo`, and has done for some time.
//
// ── Why the drift check never caught this ────────────────────────────────────
//
// `backend-gap-register-drift.test.ts` reports `maps-gaps.ts` as contributing
// **nothing** to its stale list, and prints that fact as evidence the check
// discriminates: "`src/config/maps-gaps.ts` contributes nothing at all: every
// contract it declares missing is still missing."
//
// It is not evidence of that. It is a structural blind spot, and the shape of
// it is worth stating because it is the second time this remediation has found
// a register wrong in a way the ratchet cannot see:
//
//   · `GET /geo/heatmap?layer&bounds&zoom&timeRange` — the parser drops any
//     declaration containing a `?`, deliberately, because a query string cannot
//     be compared to a mapped route without inventing what it expands to.
//   · `GET /neighborhood/{id}/scores` — parses cleanly and matches nothing,
//     because the real path is `/api/v1/geo/neighborhoods/{}/scores`. A
//     declaration that is stale **and wrong about where** looks identical to
//     one that is simply still missing.
//   · `POST /location/routes` — same: the route is `POST /api/v1/geo/routes`.
//
// So the register was wrong on six entries and the check agreed with it on all
// six. That is not a reason to loosen the parser — every loosening is a false
// positive waiting to happen, and a check that cries wolf gets skipped — it is
// a reason to read the backend, which is what this wave did.
//
// ── What is real, what is real-and-empty, and what is genuinely absent ───────
//
// The distinction runs through every function below and it is the whole value
// of connecting to these routes at all. A route that answers "I cannot" is
// worth far more than a client that guesses: it is the *deployment's* answer,
// it arrives with a reason, and it becomes a success the day somebody
// configures a provider without this file changing.
//
//   **Real and populated.** `GET /geo/neighborhoods/{id}/scores`,
//   `/compare`, `GET /geo/heatmap`, `GET /geo/capabilities`. Scores are composed
//   from resource counts the platform genuinely holds, and the composer marks
//   each dimension it cannot compute as *unavailable with a reason* rather than
//   omitting it — which is exactly the provenance §23 asked for.
//
//   **Real and deliberately empty.** `GET /geo/neighborhoods/{id}/cost-of-living`
//   answers `isAvailable: false` with `categories: []` on every deployment
//   (`GetCostOfLivingQuery.cs:97`), and `/safety` the same
//   (`GetSafetyScoreQuery.cs:79` hardcodes a null band). The routes exist; the
//   data behind them does not. This client returns `null` for both rather than
//   a zero-filled object, so the screens keep rendering their honest
//   "not available" branch instead of a fabricated index.
//
//   **Real and switched off.** `POST /geo/routes` is always mapped and answers
//   `status: "NotConfigured"` because `NotConfiguredRoutingProvider` is what
//   `TryAddScoped` leaves in place. GAP-007 through GAP-010 stay open — but the
//   client can now say "this deployment has no routing provider" from the wire
//   rather than from `MAP_PROVIDER_GAP_003`.
//
// ── Three casing traps, all of them live ─────────────────────────────────────
//
// **1. Two travel-mode vocabularies, one platform.** Location's
// `DistanceResponse.commuteMinutes` is keyed `walk`/`drive`/`transit` —
// lowercase, no gerund. GeoIntel's `travelMode` is
// `Walking`/`Cycling`/`Driving`/`Transit` — PascalCase gerunds. They are not
// interchangeable and `toWireTravelMode` below is the only place either is
// spelled.
//
// **2. Score dimension ids are kebab-case string constants**, not enum names:
// `cost-of-living`, never `CostOfLiving`. They happen to match this client's
// `ScoreDimension['id']` union exactly, which is luck rather than design and is
// asserted by a test rather than assumed.
//
// **3. Everything else in the module is PascalCase** — `level`, the dimension
// `reason`, the route `status`. `cost-of-living` (a dimension id) and `Low` (a
// band) coexist in one response tree.
//
// **And one that is not a casing trap but reads like one:** `band` is echoed
// verbatim from whatever B11 called it. The parser accepts `verylow`,
// `very-low`, `very low`, `moderate`, `medium` and more, and the *emitted*
// value is the raw incoming string. It is typed here as an open `string` for
// that reason — a closed union would be wrong the first time a deployment
// spelled a band differently.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';
import type {
  CostOfLivingIndex,
  DataFreshness,
  GeoBoundingBox,
  HeatMapLayerData,
  MapLayer,
  MapLayerId,
  NeighborhoodScore,
  SafetyScore,
  ScoreDimension,
  TravelMode,
} from '@/types/maps';

/**
 * The module's prefix, relative to `apiClient`'s `/v1` base.
 *
 * Never `/maps-gap/v0`, and never `/location` — `/geo` is a separate module
 * with its own policies, and `maps-gap-boundary.test.ts` asserts the simulated
 * prefix does not shadow a certified one in either direction.
 */
const ROOT = '/geo';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Why nothing here catches.
 *
 * The failure is allowed to propagate as whatever `apiClient` threw, because
 * every maps hook already ends in `classifyError(error)` and that function is
 * deliberately conservative — it reads the status off the axios error and falls
 * to `unknown` rather than guessing. Wrapping here would replace the thing it
 * classifies with a `MapError` object it does not recognise, and every geo
 * failure would render the generic copy.
 *
 * `maps-api.ts` makes the same choice for the same reason, so the two arms
 * behave identically at the call site.
 */
async function get<T>(path: string, params?: object): Promise<T> {
  const response = await apiClient.get<Envelope<T>>(`${ROOT}${path}`, { params });
  return response.data.data;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await apiClient.post<Envelope<T>>(`${ROOT}${path}`, body);
  return response.data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// The wire, mirrored
//
// Declared rather than inferred, because the mapping below is the only place
// this client's domain types and the module's response records meet, and an
// `unknown` here would move every mistake to a screen.
// ─────────────────────────────────────────────────────────────────────────────

/** `DataFreshnessResponse`. Two fields, both required, neither a key. */
interface DataFreshnessWire {
  computedAt: string;
  /**
   * Human-readable prose, not an identifier.
   *
   * "Diaspora platform content", "Diaspora neighbourhood profiles". A client
   * that switched on this string would be switching on English.
   */
  sourceName: string;
  methodology?: string | null;
  limitations?: string[] | null;
  validUntil?: string | null;
  sampleSize?: number | null;
}

/** `SourcedValueResponse<T>`. `source` is the literal `backend`. */
interface SourcedValueWire<T> {
  value: T;
  source: string;
}

interface ScoreTrendWire {
  direction: string;
  delta: number;
  periodDays: number;
}

interface ScoreDimensionWire {
  /** Kebab-case. See trap 2 in the header. */
  id: string;
  label: string;
  score: number;
  /** Echoed from B11 verbatim; deliberately not a closed union. */
  band: string | null;
  explanation: string | null;
  /**
   * **Never present.** `ScoreTrendResponse` is constructed nowhere in the
   * module, so this is `null` on every response today. Mirrored anyway, because
   * a field that arrives one day and is not in the type is a field that gets
   * dropped silently.
   */
  trend: ScoreTrendWire | null;
  freshness: DataFreshnessWire;
}

/**
 * A dimension the server could not compute, **with the reason**.
 *
 * There is no counterpart on this client's `ScoreDimension`, and there should
 * be: §23's whole complaint was that "the certified route returns three bare
 * numbers with no source, no date and no methodology". This is the opposite of
 * that, and dropping it on the floor would throw away the part of the contract
 * that answers the complaint. Carried through on `NeighborhoodScore` as
 * `unavailableDimensions`.
 */
interface UnavailableDimensionWire {
  id: string;
  label: string;
  /** PascalCase: `NoDataSource`, `NotAssessed`, `InsufficientPopulation`, … */
  reason: string;
  explanation: string;
}

interface NeighborhoodScoreWire {
  neighborhoodId: string;
  areaId: string;
  name: string;
  cityName: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  overall: SourcedValueWire<number> | null;
  dimensions: ScoreDimensionWire[];
  unavailableDimensions: UnavailableDimensionWire[];
  resourceCounts: Record<string, number>;
  freshness: DataFreshnessWire;
  nearbyNeighborhoodIds: string[];
}

interface CostOfLivingCategoryWire {
  id: string;
  label: string;
  index: number;
  typicalMonthlyAmount: number | null;
  typicalMonthlyCurrency: string | null;
}

interface CostOfLivingWire {
  neighborhoodId: string;
  areaId: string;
  name: string;
  /** **Hardcoded `false` today.** See the header. */
  isAvailable: boolean;
  band: string | null;
  bandScore: number | null;
  overallIndex: number | null;
  baselineName: string | null;
  currency: string | null;
  categories: CostOfLivingCategoryWire[];
  freshness: DataFreshnessWire;
}

interface SafetyScoreWire {
  neighborhoodId: string;
  areaId: string;
  name: string;
  /** **Always `false` today.** See the header. */
  isAvailable: boolean;
  score: number | null;
  band: string | null;
  breakdown: ScoreDimensionWire[];
  trend: ScoreTrendWire | null;
  unavailableReason: string | null;
  limitations: string[];
}

/** `BoundsResponse` — GeoIntel's own, distinct from Location's `BoundingBoxResponse`. */
interface BoundsWire {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface HeatPointWire {
  latitude: number;
  longitude: number;
  /** Already normalised 0–1 by the server. */
  intensity: number;
  rawValue: number;
  areaName: string;
  areaId: string;
}

interface HeatLayerWire {
  /** Kebab-case, and only five are accepted. See `SERVED_HEAT_LAYERS`. */
  layer: string;
  unit: string;
  points: HeatPointWire[];
  /** Always the literal `relative-to-viewport`. */
  scale: string;
  minValue: number;
  maxValue: number;
  level: string;
  minimumCellCount: number;
  /** Cells dropped for falling under the floor. Published so suppression is visible. */
  suppressedCells: number;
  truncated: boolean;
  bounds: BoundsWire;
  freshness: DataFreshnessWire;
}

interface GeoCapabilityWire {
  /** Kebab-case: `neighborhood-scores`, `routing`, `street-level-geocoding`, … */
  capability: string;
  available: boolean;
  provider: string;
  detail: string;
}

interface GeoCapabilitiesWire {
  capabilities: GeoCapabilityWire[];
  /** PascalCase gerunds. Trap 1. */
  supportedTravelModes: string[];
  supportedHeatLayers: string[];
  supportedScoreDimensions: string[];
}

interface RoutePointWire {
  latitude: number;
  longitude: number;
}

interface RouteStepWire {
  /** British spelling on the wire. `manoeuvre`, not `maneuver`. */
  manoeuvre: string;
  instruction: string;
  distanceMetres: number;
  durationSeconds: number;
  at: RoutePointWire | null;
}

interface RouteLegWire {
  mode: string;
  distanceMetres: number;
  durationSeconds: number;
  steps: RouteStepWire[];
  line: string | null;
  agency: string | null;
  headsign: string | null;
  departureStop: string | null;
  arrivalStop: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
  stopCount: number | null;
}

interface PlannedRouteWire {
  summary: string | null;
  distanceMetres: number;
  durationSeconds: number;
  durationInTrafficSeconds: number | null;
  legs: RouteLegWire[];
  geometry: RoutePointWire[];
}

interface RouteResponseWire {
  /** PascalCase: `Success`, `NotConfigured`, `Unavailable`, `NoRoute`, … */
  status: string;
  travelMode: string;
  provider: string;
  routes: PlannedRouteWire[];
  isRouted: boolean;
  message: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum bridges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five heat layers this platform actually serves.
 *
 * `MapLayerId` has eight. `HeatLayerCatalog.cs:36-43` registers five, and the
 * three it does not — `housing-price`, `cost-of-living`, `safety` — are refused
 * with a **named error rather than an empty set**, which is the right
 * behaviour and is also why a client must not ask for them: a 400 renders as a
 * failure where "this platform does not compute that layer" is the truth.
 */
export const SERVED_HEAT_LAYERS: readonly MapLayerId[] = [
  'community-activity',
  'housing-availability',
  'marketplace-activity',
  'jobs',
  'events',
] as const;

export function isServedHeatLayer(layer: MapLayerId): boolean {
  return SERVED_HEAT_LAYERS.includes(layer);
}

/**
 * The layer catalogue, as a *client-side* fact.
 *
 * It has to live somewhere in `src/lib` rather than in a mock, because the
 * definitions are presentation — a label, a description a screen reader can
 * read instead of seeing the gradient, and a minimum zoom below which the layer
 * is meaningless. None of that is on the wire and none of it should be: the
 * server publishes counts, and how those counts are described to a member is
 * this application's decision.
 *
 * `unit` is the exception and is a claim about the *data*, so the five served
 * layers carry the unit the module pairs them with in `HeatLayerCatalog.cs`
 * and the three it does not serve carry `source: 'simulated'` with the gap key
 * — because for those three there is nothing behind the label at all.
 */
const LAYER_CATALOGUE: Record<MapLayerId, MapLayer> = {
  'community-activity': {
    id: 'community-activity',
    label: 'Community activity',
    description: 'How many community updates have been published in each area.',
    minZoom: 9,
    unit: 'updates',
    source: 'backend',
  },
  'housing-availability': {
    id: 'housing-availability',
    label: 'Housing availability',
    description: 'How many homes are listed in each area.',
    minZoom: 9,
    unit: 'listings',
    source: 'backend',
  },
  'marketplace-activity': {
    id: 'marketplace-activity',
    label: 'Marketplace activity',
    description: 'How many marketplace listings are active in each area.',
    minZoom: 9,
    unit: 'listings',
    source: 'backend',
  },
  jobs: {
    id: 'jobs',
    label: 'Jobs',
    description: 'How many jobs are advertised in each area.',
    minZoom: 9,
    unit: 'jobs',
    source: 'backend',
  },
  events: {
    id: 'events',
    label: 'Events',
    description: 'How many events are happening in each area.',
    minZoom: 9,
    unit: 'events',
    source: 'backend',
  },

  // The three the platform refuses by name. Marked `simulated` and carrying the
  // gap key, so a picker that offers them renders the caveat and a query that
  // asks for one is disabled rather than 400ing.
  'housing-price': {
    id: 'housing-price',
    label: 'Housing prices',
    description: 'Typical asking prices by area. Not computed by this platform.',
    minZoom: 10,
    unit: 'index',
    source: 'simulated',
    gapKey: 'heatMapAggregates',
  },
  safety: {
    id: 'safety',
    label: 'Safety',
    description: 'Community safety by area. Not computed by this platform.',
    minZoom: 10,
    unit: 'score',
    source: 'simulated',
    gapKey: 'safetyScoreProvenance',
  },
  'cost-of-living': {
    id: 'cost-of-living',
    label: 'Cost of living',
    description: 'Relative cost of living by area. Not computed by this platform.',
    minZoom: 10,
    unit: 'index',
    source: 'simulated',
    gapKey: 'costOfLiving',
  },
};

/** The definition for a layer id. Never null — every `MapLayerId` has one. */
export function heatLayerDefinition(layer: MapLayerId): MapLayer {
  return LAYER_CATALOGUE[layer];
}

/** Every layer, for a picker. Five are served; three carry a gap key. */
export function heatLayerCatalogue(): MapLayer[] {
  return Object.values(LAYER_CATALOGUE);
}

/**
 * This client's `TravelMode` as the module spells it.
 *
 * The one place either vocabulary appears. `cycling` → `Cycling`, not
 * `Bicycling`; `walking` → `Walking`, not Location's `walk`. The request side
 * parses case-insensitively, so this is belt and braces — and belt and braces
 * is right for a value that silently changes which route a member is given.
 */
function toWireTravelMode(mode: TravelMode): string {
  switch (mode) {
    case 'walking':
      return 'Walking';
    case 'cycling':
      return 'Cycling';
    case 'driving':
      return 'Driving';
    case 'transit':
      return 'Transit';
    default:
      return 'Walking';
  }
}

/** The nine dimension ids this client models, for narrowing the wire's string. */
const SCORE_DIMENSION_IDS: readonly ScoreDimension['id'][] = [
  'safety',
  'cost-of-living',
  'community-activity',
  'housing',
  'transport',
  'services',
  'events',
  'jobs',
  'amenities',
] as const;

function toDimensionId(value: string): ScoreDimension['id'] | null {
  return SCORE_DIMENSION_IDS.find((candidate) => candidate === value) ?? null;
}

const COST_CATEGORY_IDS: readonly CostOfLivingIndex['categories'][number]['id'][] = [
  'housing',
  'food',
  'transport',
  'utilities',
  'healthcare',
  'leisure',
  'other',
] as const;

function toCostCategoryId(value: string): CostOfLivingIndex['categories'][number]['id'] {
  // `other` rather than dropping the row. A category this client does not model
  // is still a real cost the member pays, and losing it would make the
  // breakdown add up to less than the index it sits under.
  return COST_CATEGORY_IDS.find((candidate) => candidate === value) ?? 'other';
}

/**
 * The provenance of a figure, all of it.
 *
 * This used to keep the date and the source name and drop the rest — the
 * method, the limitations, the sample size and when the figure goes stale —
 * although the server sends all four on every figure. A rent index of 213 means
 * nothing without "5 homes" beside it (17 Sep 2026).
 */
function toFreshness(wire: DataFreshnessWire): DataFreshness {
  return {
    computedAt: wire.computedAt,
    sourceName: wire.sourceName,
    methodology: wire.methodology ?? undefined,
    limitations: wire.limitations && wire.limitations.length > 0 ? wire.limitations : undefined,
    validUntil: wire.validUntil ?? undefined,
    sampleSize: typeof wire.sampleSize === 'number' ? wire.sampleSize : undefined,
  };
}

function toTrend(wire: ScoreTrendWire | null): ScoreDimension['trend'] {
  if (wire === null) return undefined;
  const direction =
    wire.direction === 'up' || wire.direction === 'down' || wire.direction === 'flat'
      ? wire.direction
      : 'flat';
  return { direction, delta: wire.delta, periodDays: wire.periodDays };
}

/**
 * Dimensions this client can render.
 *
 * A dimension whose id is not in the union is **dropped**, not coerced. Every
 * other field on a `ScoreDimension` is presentational; the id is what a screen
 * switches on to choose an icon and a caption, and an unrecognised one rendered
 * as `other` would be a labelled row about something nobody can name.
 */
function toDimensions(wire: ScoreDimensionWire[]): ScoreDimension[] {
  const mapped: ScoreDimension[] = [];

  for (const entry of wire) {
    const id = toDimensionId(entry.id);
    if (id === null) continue;

    mapped.push({
      id,
      label: entry.label,
      score: entry.score,
      trend: toTrend(entry.trend),
      explanation: entry.explanation ?? undefined,
      freshness: toFreshness(entry.freshness),
    });
  }

  return mapped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Neighbourhood scores — MAPS-GAP-013
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A score, with the dimensions the platform could not compute carried beside it.
 *
 * `unavailableDimensions` is additive over `NeighborhoodScore` and is the field
 * §23 was actually asking for. A dimension the server declines to score arrives
 * with a machine-readable `reason` and a sentence, so a screen can say "not
 * assessed here" rather than leaving a silent hole where a number should be.
 */
export interface CertifiedNeighborhoodScore extends NeighborhoodScore {
  unavailableDimensions: {
    id: string;
    label: string;
    /** PascalCase. `NoDataSource`, `NotAssessed`, `InsufficientPopulation`, … */
    reason: string;
    explanation: string;
  }[];
  /** Per-resource-type counts the score was composed from. */
  resourceCounts: Record<string, number>;
}

function toScore(wire: NeighborhoodScoreWire): CertifiedNeighborhoodScore {
  return {
    neighborhoodId: wire.neighborhoodId,
    name: wire.name,
    cityName: wire.cityName ?? '',
    countryCode: wire.countryCode,
    center: { latitude: wire.latitude ?? 0, longitude: wire.longitude ?? 0 },
    overall: {
      value: wire.overall?.value ?? 0,
      // `backend` unless the server says otherwise. This is the one place the
      // client's `DataSource` and the wire's free-form `source` meet, and the
      // safe direction is to treat anything unrecognised as **simulated** — a
      // figure wrongly badged `backend` is a figure a member trusts more than
      // they should.
      source: wire.overall?.source === 'backend' ? 'backend' : 'simulated',
    },
    dimensions: toDimensions(wire.dimensions),
    unavailableDimensions: wire.unavailableDimensions,
    resourceCounts: wire.resourceCounts,
    freshness: toFreshness(wire.freshness),
    nearbyNeighborhoodIds: wire.nearbyNeighborhoodIds,
  };
}

export function fetchNeighborhoodScore(
  neighborhoodId: string
): Promise<CertifiedNeighborhoodScore> {
  return get<NeighborhoodScoreWire>(
    `/neighborhoods/${encodeURIComponent(neighborhoodId)}/scores`
  ).then(toScore);
}

/**
 * Scores for several neighbourhoods, computed server-side.
 *
 * `ids` is a **required, comma-separated** query parameter and the route is
 * `/neighborhoods/compare` — mapped before `/{idOrSlug}/…` so `compare` is
 * never read as an identifier.
 *
 * §24's own objection to the client doing this — "so the client is not blending
 * scores it did not compute" — is answered by the route existing: the ordering,
 * the dimensions and the overall figure all come from one server-side pass, so
 * two neighbourhoods cannot be compared on differently-composed numbers.
 */
export function compareNeighborhoods(ids: string[]): Promise<CertifiedNeighborhoodScore[]> {
  return get<NeighborhoodScoreWire[]>('/neighborhoods/compare', { ids: ids.join(',') }).then(
    (rows) => rows.map(toScore)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost of living — MAPS-GAP-014
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cost index, or `null` when this neighbourhood has none.
 *
 * **Rent only, since 17 Sep 2026.** The platform publishes a `housing` category
 * — the median asking rent of the homes listed on Diaspora in the
 * neighbourhood, against its country's — where enough homes are listed, and
 * nothing for the other five categories. `overallIndex` stays null, because an
 * overall figure from housing alone would be a rent index under a broader name.
 *
 * So the test for "there is something to show" is a category, not the overall
 * figure. It used to be the overall figure, which the server never sends, so a
 * published rent index would have been thrown away here.
 *
 * `null` when no category is published keeps the neighbourhood screen on its
 * "not available" branch rather than rendering an empty panel.
 */
export function fetchCostOfLiving(neighborhoodId: string): Promise<CostOfLivingIndex | null> {
  return fetchCostOfLivingAnswer(neighborhoodId).then((answer) => answer.index);
}

/** The cost index where one is published, and the platform's own reason where it is not. */
export interface CostOfLivingAnswer {
  index: CostOfLivingIndex | null;
  /**
   * Why there is no index here, in the platform's words — "it has 2 homes to
   * rent listed on Diaspora … an index needs at least 5". Null when there is an
   * index, or when the server gave no reason.
   */
  unavailableReason: string | null;
}

/**
 * The cost read with its reason kept.
 *
 * A neighbourhood with too few homes listed has no rent index, and the screen
 * used to explain that with a generic "not something Diaspora can show yet" —
 * false since the index exists. The server says exactly why in the response's
 * methodology, and this keeps it.
 */
export function fetchCostOfLivingAnswer(neighborhoodId: string): Promise<CostOfLivingAnswer> {
  return get<CostOfLivingWire>(
    `/neighborhoods/${encodeURIComponent(neighborhoodId)}/cost-of-living`
  ).then((wire) => {
    if (!wire.isAvailable || wire.categories.length === 0) {
      return { index: null, unavailableReason: wire.freshness?.methodology ?? null };
    }

    return { index: toCostOfLivingIndex(wire), unavailableReason: null };
  });
}

function toCostOfLivingIndex(wire: CostOfLivingWire): CostOfLivingIndex {
  return {
    neighborhoodId: wire.neighborhoodId,
    name: wire.name,
    overallIndex: wire.overallIndex,
    // "An index of 118 means nothing without '118 against the UK national
    // average'." Where the server declines to name a baseline the figure is
    // unreadable, so the absence is rendered rather than papered over.
    baselineName: wire.baselineName ?? 'an unstated baseline',
    currency: wire.currency ?? '',
    categories: wire.categories.map((category) => ({
      id: toCostCategoryId(category.id),
      label: category.label,
      index: category.index,
      typicalMonthly:
        category.typicalMonthlyAmount !== null && category.typicalMonthlyCurrency !== null
          ? { amount: category.typicalMonthlyAmount, currency: category.typicalMonthlyCurrency }
          : undefined,
    })),
    freshness: toFreshness(wire.freshness),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety — MAPS-GAP-015
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The safety score, or `null` when this deployment cannot compute one.
 *
 * Same shape of answer as cost of living, and the stakes are the reason it is
 * `null` rather than a default: §26 exists because a safety score materially
 * affects where somebody chooses to live, and this community includes people
 * with the least margin for a bad move. A `band` invented from a null score
 * would be the single most consequential fabricated value in this application.
 *
 * `limitations` is carried onto `DataFreshness` where the server sends any,
 * because §26 requires them rendered verbatim beside the number and the client
 * type has exactly one place they can live.
 */
export function fetchSafetyScore(neighborhoodId: string): Promise<SafetyScore | null> {
  return get<SafetyScoreWire>(`/neighborhoods/${encodeURIComponent(neighborhoodId)}/safety`).then(
    (wire) => {
      if (!wire.isAvailable || wire.score === null) return null;

      const band = wire.band;

      return {
        neighborhoodId: wire.neighborhoodId,
        name: wire.name,
        score: wire.score,
        // Narrowed from the wire's open string. An unrecognised band falls to
        // `moderate` rather than to `high` or `low`: a wrong band in either
        // direction is a wrong recommendation, and the middle is the only value
        // that does not read as advice.
        band:
          band === 'low' || band === 'moderate' || band === 'good' || band === 'high'
            ? band
            : 'moderate',
        breakdown: toDimensions(wire.breakdown),
        trend: toTrend(wire.trend),
        freshness: {
          computedAt: new Date().toISOString(),
          sourceName: 'Diaspora neighbourhood profiles',
          limitations: wire.limitations.length > 0 ? wire.limitations : undefined,
        },
      };
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Heat layers — MAPS-GAP-012
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An aggregated layer for a viewport.
 *
 * **The bounds go as four separate numbers**, not as the `north,south,east,west`
 * string every other geographic route on this platform takes. `/geo/heatmap` is
 * the single exception, and it recomposes them into the joined form internally
 * — so a client that sent `bounds` here would get a 400 for a parameter name
 * that works everywhere else.
 *
 * **`timeRange` is not sent, because the route does not take one.** §22's time
 * filter has no server-side counterpart; the development adapter accepted the
 * parameter and never read it, which is the same absence wearing a friendlier
 * face. A caller must not present the layer as filtered.
 *
 * `suppressedCells` is carried onto the layer rather than dropped: an
 * un-suppressed density layer over a sparse area is a map of individual homes,
 * and a client that cannot say "some cells were withheld" cannot distinguish
 * that from an empty district.
 */
export interface CertifiedHeatLayer extends HeatMapLayerData {
  /** The unit behind `rawValue` — `updates`, `listings`, `jobs`, `events`. */
  unit: string;
  /** How many cells fell under the privacy floor and were withheld. */
  suppressedCells: number;
  /** True when the viewport held more nodes than one response aggregates. */
  truncated: boolean;
}

export function fetchHeatLayer(
  layer: MapLayer,
  bounds: GeoBoundingBox,
  options: { level?: string; zoom?: number; countryCode?: string } = {}
): Promise<CertifiedHeatLayer> {
  return get<HeatLayerWire>('/heatmap', {
    layer: layer.id,
    north: bounds.north,
    south: bounds.south,
    east: bounds.east,
    west: bounds.west,
    level: options.level,
    zoom: options.zoom,
    countryCode: options.countryCode,
  }).then((wire) => ({
    layer,
    points: wire.points.map((point) => ({
      coordinate: { latitude: point.latitude, longitude: point.longitude },
      intensity: point.intensity,
      rawValue: point.rawValue,
    })),
    // Always `relative-to-viewport` on this platform, and read from the payload
    // rather than assumed — the legend's honesty depends on it, and an
    // `absolute` scale asserted over a fitted one makes an empty region look
    // busy.
    scale: wire.scale === 'absolute' ? 'absolute' : 'relative-to-viewport',
    minValue: wire.minValue,
    maxValue: wire.maxValue,
    freshness: toFreshness(wire.freshness),
    bounds: {
      north: wire.bounds.north,
      south: wire.bounds.south,
      east: wire.bounds.east,
      west: wire.bounds.west,
    },
    unit: wire.unit,
    suppressedCells: wire.suppressedCells,
    truncated: wire.truncated,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this deployment's geography can actually do.
 *
 * The route that lets a screen stop guessing. Eight capability keys, each with
 * `available`, the provider that would serve it, and a sentence saying why not
 * — which is the difference between "this platform has no routing" and "this
 * deployment has not contracted a routing provider".
 */
export interface GeoCapabilityReport {
  capabilities: { capability: string; available: boolean; provider: string; detail: string }[];
  /** PascalCase gerunds — `Walking`, `Cycling`, `Driving`, `Transit`. */
  supportedTravelModes: string[];
  /** Kebab-case layer ids. Five today. */
  supportedHeatLayers: string[];
  /** Kebab-case dimension ids. */
  supportedScoreDimensions: string[];
}

export function fetchGeoCapabilities(): Promise<GeoCapabilityReport> {
  return get<GeoCapabilitiesWire>('/capabilities');
}

/** Whether a named capability is available on this deployment. */
export function hasGeoCapability(report: GeoCapabilityReport | null, key: string): boolean {
  return Boolean(report?.capabilities.some((entry) => entry.capability === key && entry.available));
}

/** Why a capability is unavailable, in the server's own words. */
export function geoCapabilityDetail(
  report: GeoCapabilityReport | null,
  key: string
): string | null {
  return report?.capabilities.find((entry) => entry.capability === key)?.detail ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing — MAPS-GAP-007 · 008 · 009 · 010
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A route plan, or the deployment's stated refusal.
 *
 * **This does not close GAP-007 through GAP-010.** `NotConfiguredRoutingProvider`
 * is what `GeographicIntelligenceModule.cs:88` leaves registered, so `status` is
 * `NotConfigured` and `routes` is empty on every deployment today. What changes
 * is where the refusal comes from: it is now the server's answer with the
 * server's message, rather than a client-side adapter deciding on the
 * deployment's behalf.
 *
 * The distinction is not academic. A screen reading this can say "this
 * deployment has no routing provider" and be right; the same screen reading the
 * local adapter can only say "routing is not available in this build", which is
 * a claim about the app and was never the whole truth.
 *
 * The result is returned as the wire shape rather than mapped into `Route[]`,
 * deliberately: with no provider there is nothing to map, and writing the
 * mapping now would mean writing it against zero real responses.
 */
export interface RoutePlanOutcome {
  /** PascalCase. `Success`, `NotConfigured`, `Unavailable`, `NoRoute`, … */
  status: string;
  travelMode: string;
  provider: string;
  isRouted: boolean;
  message: string | null;
  routes: PlannedRouteWire[];
}

export function planRoute(input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  waypoints?: { latitude: number; longitude: number }[];
  travelMode: TravelMode;
  alternatives?: boolean;
  departAt?: string;
}): Promise<RoutePlanOutcome> {
  return post<RouteResponseWire>('/routes', {
    origin: input.origin,
    destination: input.destination,
    waypoints: input.waypoints,
    travelMode: toWireTravelMode(input.travelMode),
    alternatives: input.alternatives ?? false,
    departAt: input.departAt,
  });
}
