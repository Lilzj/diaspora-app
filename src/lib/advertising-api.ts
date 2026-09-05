// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Advertising campaigns (B16)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. It is the certified arm of the
//    monetization split; `monetization-gap-api.ts` is the development arm.
//    Closes MON-GAP-001, -002, -006 and -007.
//
// ── Why this is a mapping layer and not a thin wrapper ───────────────────────
//
// The other certified arms on this platform mostly pass shapes straight
// through. This one cannot: the client's campaign type was drawn against a
// simulated backend and the real one differs in four ways that matter, each of
// which is a decision rather than an accident.
//
//   1. **Two of the client's targeting dimensions are not honoured.**
//      `audienceTypes` (Newcomer / Established / Business / Student) and
//      `minMonthsInCountry` are collected by the builder and this file does not
//      send them. MON-GAP-007's whole complaint was a builder that "collected
//      six more and sent one", so quietly posting fields the delivery engine
//      ignores would be the same defect wearing a certified badge. The register
//      records both as unhonoured and the wizard should stop offering them.
//
//   2. **Budget is a package, not a number.** The payment path prices from the
//      catalogue, so a campaign is bought as a tier — £25 / £50 / £100 / £250
//      over 30 days — and its budget must equal the tier's price. `budgetKind`
//      and a free `budgetAmount` no longer describe what can be bought.
//
//   3. **Submitting does not return a payment intent.** It returns what to buy:
//      product code, subject type, subject id, amount. The client then calls the
//      existing purchase route, which is the one place on this platform that
//      opens an intent. See the backend handler for why — a handler that
//      dispatched into that path is what the DSP1001 analyzer refuses.
//
//   4. **Performance is a flat shape with its definitions attached**, not a
//      list of pre-labelled metrics. §20 forbids inventing metric semantics, so
//      the server sends what each number means and this file turns that into the
//      `PerformanceMetric[]` the dashboard renders — labels and all — rather than
//      the client holding its own copy of the definitions.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import type { Money } from '@/types/financial';
import type {
  Campaign,
  CampaignAudience,
  CampaignObjective,
  CampaignStatus,
  CreateCampaignRequest,
  PerformanceMetric,
  PerformanceReport,
  PerformanceSummary,
  TargetingOption,
  UpdateCampaignRequest,
} from '@/types/monetization-gaps';

const ROOT = '/financial';

interface Envelope<T> {
  data: T;
}

async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(`${ROOT}${path}`, { params, signal });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write here is classified `mutating`, exactly as the rest of the
 * financial client is: a campaign submission opens a charge, and a transport
 * failure on one is an *indeterminate* outcome rather than a failed one. The
 * recovery from "it failed" is to press the button again, which is how somebody
 * ends up with two campaigns and two invoices.
 */
async function write<T>(
  method: 'post' | 'put',
  path: string,
  body?: unknown,
  params?: object
): Promise<T> {
  try {
    const url = `${ROOT}${path}`;
    const response =
      method === 'put'
        ? await apiClient.put<Envelope<T>>(url, body, { params })
        : await apiClient.post<Envelope<T>>(url, body, { params });

    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// WIRE SHAPES
// ═════════════════════════════════════════════════════════════════════════════

interface MoneyWire {
  minorUnits: number;
  currency: string;
  exponent: number;
}

interface AudienceWire {
  countryCodes?: string[] | null;
  communityIds?: string[] | null;
  neighbourhoodIds?: string[] | null;
  interests?: string[] | null;
  categories?: string[] | null;
  isEveryone?: boolean;
  constrainedDimensions?: string[] | null;
}

interface ReviewWire {
  decision?: string | null;
  note?: string | null;
  decidedAt?: string | null;
  canAppeal?: boolean;
  appealNote?: string | null;
  appealedAt?: string | null;
}

interface CampaignWire {
  callToActionLabel?: string | null;
  id: string;
  name: string;
  objective: string;
  status: string;
  budget: MoneyWire;
  spend: MoneyWire;
  remaining: MoneyWire;
  settled?: MoneyWire | null;
  startsAt: string;
  endsAt?: string | null;
  audience: AudienceWire;
  creativeMediaId?: string | null;
  headline?: string | null;
  body?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  productCode?: string | null;
  purchaseId?: string | null;
  review: ReviewWire;
  submittedAt?: string | null;
  activatedAt?: string | null;
  pausedAt?: string | null;
  endedAt?: string | null;
  endReason?: string | null;
  createdAt: string;
  canEdit: boolean;
  canSubmit: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
}

interface SubmissionWire {
  campaign: CampaignWire;
  productCode: string;
  subjectType: string;
  subjectId: string;
  amount: MoneyWire;
}

interface DefinitionsWire {
  impression: string;
  click: string;
  conversion: string;
  result: string;
  deduplication: string;
  reportingLag: string;
}

interface PerformanceWire {
  from: string;
  to: string;
  impressions: number;
  clicks: number;
  conversions: number;
  clickThroughRate?: number | null;
  spend: MoneyWire;
  results: number;
  costPerResult?: MoneyWire | null;
  budgetConsumedFraction?: number | null;
  daily: { day: string; impressions: number; clicks: number }[];
  bySurface: { surface: string; impressions: number; clicks: number }[];
  definitions: DefinitionsWire;
}

interface OptionsWire {
  dimension: string;
  options: { value: string; label: string }[];
  hasCatalogue: boolean;
  note?: string | null;
}

interface EstimateWire {
  lowerBound: number;
  upperBound: number;
  constrainedDimensions: string[];
  basis: string;
  isNarrowed: boolean;
  isCounted: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAPPING
// ═════════════════════════════════════════════════════════════════════════════

function toMoney(wire: MoneyWire): Money {
  return {
    // Derived here rather than sent, because the server's money shape is minor
    // units and the exponent that gives them meaning. Dividing once at the
    // boundary is what stops a screen doing it with the wrong exponent.
    amount: wire.minorUnits / 10 ** wire.exponent,
    currency: wire.currency,
    minorUnits: wire.minorUnits,
    exponent: wire.exponent,
  };
}

function toAudience(wire: AudienceWire): CampaignAudience {
  return {
    countries: wire.countryCodes ?? [],
    communities: wire.communityIds ?? [],
    neighbourhoods: wire.neighbourhoodIds ?? [],
    interests: wire.interests ?? [],
    categories: wire.categories ?? [],

    // Not honoured by the delivery engine, so they come back empty rather than
    // echoing whatever the builder collected. An audience that displayed a
    // constraint the server never applied would be the client lying to itself.
    audienceTypes: [],
    minMonthsInCountry: null,
  };
}

function toCampaign(wire: CampaignWire): Campaign {
  return {
    campaignId: wire.id,
    name: wire.name,
    status: wire.status as CampaignStatus,
    objective: wire.objective as CampaignObjective,

    // The backend books placements through the campaign's own lifecycle rather
    // than from the wizard, so there is nothing to show until it is approved.
    placements: [],

    creative: {
      headline: wire.headline ?? '',
      body: wire.body ?? '',
      callToActionLabel: wire.callToActionLabel ?? '',
      callToActionRoute: null,
      mediaReference: wire.creativeMediaId ?? null,
    },

    audience: toAudience(wire.audience),

    // A campaign is bought as a package, so the budget is fixed for its whole
    // run. `Daily` would describe something the platform does not sell.
    budgetKind: 'Total',
    budget: toMoney(wire.budget),
    spend: toMoney(wire.spend),
    remaining: toMoney(wire.remaining),

    startsAt: wire.startsAt,
    endsAt: wire.endsAt ?? wire.startsAt,

    paymentIntentId: wire.purchaseId ?? null,

    reviewNote: wire.review?.note ?? null,

    // Only on a rejection. An approval note is a note, not a refusal, and
    // rendering it under "why this was refused" would be a different sentence.
    rejectionCode: wire.review?.decision === 'Rejected' ? 'review.rejected' : null,
    rejectionReason: wire.review?.decision === 'Rejected' ? (wire.review.note ?? null) : null,

    // The backend allows one appeal and sets no deadline. Null means "no
    // deadline", and `canAppeal` is what actually gates the button — a date the
    // server did not give would be one the client invented.
    appealableUntil: null,

    createdAt: wire.createdAt,
    submittedAt: wire.submittedAt ?? null,
    approvedAt: wire.review?.decision === 'Approved' ? (wire.review.decidedAt ?? null) : null,
    completedAt: wire.endedAt ?? null,

    // Carried through rather than re-derived. The server owns the state machine
    // and these are its answers; a screen computing them from `status` would be
    // holding a second copy of twelve transitions.
    canEdit: wire.canEdit,
    canSubmit: wire.canSubmit,
    canPause: wire.canPause,
    canResume: wire.canResume,
    canCancel: wire.canCancel,
  };
}

/**
 * Turns the flat performance response into the labelled metrics the dashboard
 * renders — using the server's own definitions as the descriptions.
 *
 * §20 forbids inventing metric semantics. The labels here are display text; the
 * *meaning* of every number travels from the server, so a client cannot drift
 * from what the platform actually counts.
 */
function toMetrics(wire: PerformanceWire): PerformanceMetric[] {
  const metrics: PerformanceMetric[] = [
    {
      key: 'impressions',
      label: 'Times shown',
      value: wire.impressions,
      unit: 'count',
      definition: wire.definitions.impression,
    },
    {
      key: 'clicks',
      label: 'Opened',
      value: wire.clicks,
      unit: 'count',
      definition: wire.definitions.click,
    },
    {
      key: 'results',
      label: 'Results',
      value: wire.results,
      unit: 'count',
      definition: wire.definitions.result,
    },
    {
      key: 'spend',
      label: 'Spent',
      value: wire.spend.minorUnits / 10 ** wire.spend.exponent,
      unit: 'currency',
      money: toMoney(wire.spend),

      // The one figure whose meaning is not a counting rule: it is what the
      // campaign was charged, which the server writes beside the campaign's own
      // spend rather than deriving from the counts above.
      definition: 'What this campaign has been charged so far.',
    },
  ];

  // Absent rather than zero. "0% opened" and "we have not shown this to anybody
  // yet" are different sentences, and the server distinguishes them.
  if (wire.clickThroughRate != null) {
    metrics.push({
      key: 'clickThroughRate',
      label: 'Open rate',
      value: wire.clickThroughRate,
      unit: 'ratio',
      definition: `${wire.definitions.click} Shown as a share of the times it was displayed.`,
    });
  }

  if (wire.costPerResult != null) {
    metrics.push({
      key: 'costPerResult',
      label: 'Cost per result',
      value: wire.costPerResult.minorUnits / 10 ** wire.costPerResult.exponent,
      unit: 'currency',
      money: toMoney(wire.costPerResult),
      definition: `What each result cost. ${wire.definitions.result}`,
    });
  }

  return metrics;
}

function toReport(
  wire: PerformanceWire,
  subjectKind: 'placement' | 'campaign',
  subjectId: string
): PerformanceReport {
  return {
    subjectKind,
    subjectId,
    periodStart: wire.from,
    periodEnd: wire.to,
    metrics: toMetrics(wire),
    series: wire.daily.map((day) => ({
      date: day.day,
      impressions: day.impressions,
      clicks: day.clicks,
    })),

    // Zero, and the sentence lives on the metrics instead.
    //
    // The client's type asks how many hours behind live the figures are. The
    // server does not answer in hours and should not: delivery arrives through
    // the outbox, so the honest statement is "usually within seconds" and a
    // number here would imply a guarantee nothing makes. Zero is the least
    // wrong value, and every metric already carries the server's own wording.
    // Not served. The panel omits the sentence rather than claiming a cadence
    // of zero hours, which is what it rendered before: "Figures update about
    // every 0 hours."
    reportingLagHours: null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS — MON-GAP-001
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchCampaigns(
  params: { status?: string; take?: number } = {}
): Promise<Campaign[]> {
  const wire = await read<CampaignWire[]>('/campaigns/me', params);
  return wire.map(toCampaign);
}

export async function fetchCampaign(campaignId: string): Promise<Campaign> {
  return toCampaign(await read<CampaignWire>(`/campaigns/${encodeURIComponent(campaignId)}`));
}

/**
 * Drafts a campaign.
 *
 * `productCode` is the package being bought and the budget must equal its
 * price — the server refuses a mismatch rather than charging one figure and
 * displaying another.
 */
export async function createCampaign(
  request: CreateCampaignRequest & { productCode?: string }
): Promise<Campaign> {
  return toCampaign(await write<CampaignWire>('post', '/campaigns', toWireRequest(request)));
}

export async function updateCampaign(
  campaignId: string,
  request: UpdateCampaignRequest & { productCode?: string }
): Promise<Campaign> {
  return toCampaign(
    await write<CampaignWire>(
      'put',
      `/campaigns/${encodeURIComponent(campaignId)}`,
      toWireRequest(request)
    )
  );
}

/** What the client must buy to fund a campaign it has just submitted. */
export interface CampaignPurchaseInstruction {
  campaign: Campaign;
  productCode: string;
  subjectType: string;
  subjectId: string;
  amount: Money;
}

/**
 * Freezes the campaign and says what to buy.
 *
 * **It does not open a payment.** The campaign moves to `PendingPayment`, and
 * the caller passes the returned triple to the existing purchase route; the
 * capture is what moves the campaign on to review. See the header.
 */
export async function submitCampaign(
  campaignId: string,
  request: { methodKind?: string; idempotencyKey?: string } = {}
): Promise<CampaignPurchaseInstruction> {
  const wire = await write<SubmissionWire>(
    'post',
    `/campaigns/${encodeURIComponent(campaignId)}/submit`,
    request
  );

  return {
    campaign: toCampaign(wire.campaign),
    productCode: wire.productCode,
    subjectType: wire.subjectType,
    subjectId: wire.subjectId,
    amount: toMoney(wire.amount),
  };
}

export async function pauseCampaign(campaignId: string): Promise<Campaign> {
  return toCampaign(
    await write<CampaignWire>('post', `/campaigns/${encodeURIComponent(campaignId)}/pause`)
  );
}

export async function resumeCampaign(campaignId: string): Promise<Campaign> {
  return toCampaign(
    await write<CampaignWire>('post', `/campaigns/${encodeURIComponent(campaignId)}/resume`)
  );
}

export async function cancelCampaign(campaignId: string, reason?: string): Promise<Campaign> {
  return toCampaign(
    await write<CampaignWire>('post', `/campaigns/${encodeURIComponent(campaignId)}/cancel`, {
      reason,
    })
  );
}

/** Contests a rejection. Once, and the campaign's status does not move. */
export async function appealCampaign(campaignId: string, note: string): Promise<ReviewWire> {
  return write<ReviewWire>('post', `/campaigns/${encodeURIComponent(campaignId)}/appeal`, {
    note,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PERFORMANCE — MON-GAP-002
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchCampaignPerformance(
  campaignId: string,
  days?: number
): Promise<PerformanceReport> {
  const wire = await read<PerformanceWire>(
    `/campaigns/${encodeURIComponent(campaignId)}/performance`,
    { days }
  );

  return toReport(wire, 'campaign', campaignId);
}

export async function fetchPlacementPerformance(
  placementId: string,
  days?: number
): Promise<PerformanceReport> {
  const wire = await read<PerformanceWire>(
    `/placements/${encodeURIComponent(placementId)}/performance`,
    { days }
  );

  return toReport(wire, 'placement', placementId);
}

/**
 * The rollup the monetization dashboard leads with.
 *
 * Returns the dashboard's own shape rather than a report, because that is what
 * the screen destructures — totals and a cost per result, not a metric list. The
 * definitions still travel: `costPerResult` is null rather than zero when there
 * are no results, for the same reason the report's rates are.
 */
export async function fetchPerformanceSummary(days?: number): Promise<PerformanceSummary> {
  const wire = await read<PerformanceWire>('/placements/me/performance/summary', { days });

  return {
    periodStart: wire.from,
    periodEnd: wire.to,
    totalImpressions: wire.impressions,
    totalClicks: wire.clicks,
    totalConversions: wire.conversions,
    totalSpend: toMoney(wire.spend),
    costPerResult: wire.costPerResult ? toMoney(wire.costPerResult) : null,

    // The platform does not rank surfaces against each other and will not guess
    // which promotion "performed best" — that is a judgement, not a figure.
    topPlacementId: null,

    // Zero, and the sentence lives on the report's metrics. Delivery arrives
    // through the outbox, so the honest statement is "usually within seconds"
    // and a number here would imply a guarantee nothing makes.
    // Not served. The panel omits the sentence rather than claiming a cadence
    // of zero hours, which is what it rendered before: "Figures update about
    // every 0 hours."
    reportingLagHours: null,
  };
}

/**
 * Every dimension at once, for the builder that shows all six.
 *
 * **Country and the two unhonoured dimensions are not fetched.** Country is an
 * ISO list the app already holds; `audienceTypes` has no equivalent on the wire
 * at all. Each entry says whether the platform has a catalogue, so a picker can
 * tell "nothing to choose" from "type it yourself".
 */
export async function fetchAllTargetingOptions(): Promise<TargetingDimensionOptions[]> {
  const dimensions = ['Community', 'Neighbourhood', 'Interest', 'Category'];

  return Promise.all(dimensions.map((dimension) => fetchTargetingOptions(dimension)));
}

/**
 * Reports a click on a promoted subject.
 *
 * The one metric only the device can observe. The server accepts it only while
 * the campaign is running, and records nothing about who clicked.
 */
export async function recordCampaignClick(campaignId: string, surface?: string): Promise<void> {
  await write<null>('post', `/campaigns/${encodeURIComponent(campaignId)}/clicks`, { surface });
}

// ═════════════════════════════════════════════════════════════════════════════
// TARGETING — MON-GAP-007
// ═════════════════════════════════════════════════════════════════════════════

/** One dimension's selectable values, and whether the platform has a catalogue at all. */
export interface TargetingDimensionOptions {
  dimension: string;
  options: TargetingOption[];
  hasCatalogue: boolean;
  note?: string | null;
}

/**
 * The selectable values for one dimension.
 *
 * `hasCatalogue: false` is not an empty list — it means the platform cannot
 * enumerate this dimension and the member should type instead. Country is
 * deliberately that case: it is an ISO list the app already holds.
 */
export async function fetchTargetingOptions(
  dimension: string,
  query?: string,
  take?: number
): Promise<TargetingDimensionOptions> {
  const wire = await read<OptionsWire>('/targeting/options', { dimension, query, take });

  return {
    dimension: wire.dimension,
    options: wire.options.map((option) => ({ value: option.value, label: option.label })),
    hasCatalogue: wire.hasCatalogue,
    note: wire.note ?? null,
  };
}

/** What a selection could reach, as a range with the reasoning behind it. */
export interface CampaignAudienceEstimate {
  reachLower: number;
  reachUpper: number;
  isNarrowed: boolean;
  constrainedDimensions: string[];
  basis: string;

  /**
   * Whether anything actually counted.
   *
   * Zero and zero mean two different things — "reaches nobody" and "narrowed,
   * and Diaspora cannot say by how much" — and only the first should stop
   * somebody submitting.
   */
  isCounted: boolean;

  /** False only when the platform counted and the answer was nobody. */
  isDeliverable: boolean;
}

export async function estimateAudience(
  audience: CampaignAudience
): Promise<CampaignAudienceEstimate> {
  const wire = await write<EstimateWire>('post', '/targeting/estimate', toWireAudience(audience));

  return {
    reachLower: wire.lowerBound,
    reachUpper: wire.upperBound,
    isNarrowed: wire.isNarrowed,
    constrainedDimensions: wire.constrainedDimensions,
    basis: wire.basis,
    isCounted: wire.isCounted,

    // Undeliverable only when the platform counted and found nobody. A selection
    // it could not count is not a selection it refused.
    isDeliverable: !wire.isCounted || wire.upperBound > 0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST MAPPING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The audience, as the server takes it.
 *
 * **`audienceTypes` and `minMonthsInCountry` are not sent.** The delivery
 * engine does not honour them, and MON-GAP-007's complaint was precisely a
 * builder that collected dimensions nothing applied. Sending them would make
 * this file the new place that happens.
 */
function toWireAudience(audience?: CampaignAudience | null): AudienceWire {
  return {
    countryCodes: audience?.countries ?? [],
    communityIds: audience?.communities ?? [],
    neighbourhoodIds: audience?.neighbourhoods ?? [],
    interests: audience?.interests ?? [],
    categories: audience?.categories ?? [],
  };
}

function toWireRequest(
  request: Partial<CreateCampaignRequest> & { productCode?: string }
): Record<string, unknown> {
  const exponent = 2;

  return {
    name: request.name,
    objective: request.objective,

    // Major units in, minor units out — the server stores the exact figure and
    // the client's request DTOs have always taken the readable one.
    budgetMinorUnits:
      request.budgetAmount == null ? undefined : Math.round(request.budgetAmount * 10 ** exponent),
    currency: request.currency,
    exponent,

    startsAt: request.startsAt,
    endsAt: request.endsAt,
    audience: toWireAudience(request.audience),

    creativeMediaId: request.creative?.mediaReference ?? null,
    headline: request.creative?.headline ?? null,
    body: request.creative?.body ?? null,

    // The builder asks for this and made the member fill it in before they could
    // continue, and it went nowhere: the creative on the wire carried a headline
    // and a body only, so every advertisement rendered the client's default
    // label while its author believed they had chosen one.
    callToActionLabel: request.creative?.callToActionLabel ?? null,

    productCode: request.productCode,
  };
}
