// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — API client for UNSUPPORTED monetization capabilities
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/monetization-gaps.ts`. ⚠
//
// Deliberately separate from `financial-api.ts`, and deliberately behind
// `/monetization-gap/v0` rather than `/financial`. Three consequences, all
// wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether it
//     talks to a real backend.
//   * If one of these calls ever escapes a development build it 404s at the
//     gateway. It cannot collide with, shadow, or be mistaken for a certified
//     financial route, and it cannot move real money.
//   * The eventual migration is mechanical: when a backend phase implements
//     campaigns, the screen swaps this import for `financial-api` and the
//     request shapes already match.
//
// Every function here refuses to run when monetization gap features are
// disabled, so the guarantee does not depend on a screen remembering to check.
//
// This is the `MockMonetizationRepository` arm of §26's split. The `Backend`
// arm is `financial-api.ts`, which is real. Hooks in `hooks/monetization.ts`
// and `hooks/monetization-gaps.ts` are the stable domain interface the UI
// depends on; the UI does not know which arm answered.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { FinancialError, toFinancialError } from './financial-errors';
import {
  MONETIZATION_GAPS,
  MONETIZATION_GAP_PREFIX,
  areMonetizationGapsEnabled,
} from '@/config/monetization-gaps';
import type { PlatformEnvelope } from '@/types/financial';
import type {
  AudienceEstimate,
  Campaign,
  CampaignAudience,
  CampaignSubmission,
  ChangePlanRequest,
  CreateCampaignRequest,
  EntitlementSnapshot,
  MonetizationRecommendation,
  PerformanceReport,
  PerformanceSummary,
  PlanChangePreview,
  PremiumAnalytics,
  TargetingOptions,
  UpdateCampaignRequest,
} from '@/types/monetization-gaps';
import type { Subscription } from '@/types/financial';

/** Query keys, namespaced away from `financialKeys` so a cache dump is unambiguous. */
export const monetizationGapKeys = {
  all: ['monetization-gap'] as const,

  campaigns: () => ['monetization-gap', 'campaigns'] as const,
  campaignList: (status?: string) => ['monetization-gap', 'campaigns', 'list', status ?? 'all'] as const,
  campaign: (id: string) => ['monetization-gap', 'campaigns', id] as const,

  /** The reviewer's queue. Keyed by `take` so two page sizes do not share a cache entry. */
  reviewQueue: (take: number) => ['monetization-gap', 'campaigns', 'reviews', take] as const,

  performance: () => ['monetization-gap', 'performance'] as const,
  placementPerformance: (id: string) => ['monetization-gap', 'performance', 'placement', id] as const,
  campaignPerformance: (id: string) => ['monetization-gap', 'performance', 'campaign', id] as const,
  performanceSummary: () => ['monetization-gap', 'performance', 'summary'] as const,

  targeting: () => ['monetization-gap', 'targeting'] as const,
  targetingOptions: () => ['monetization-gap', 'targeting', 'options'] as const,
  audienceEstimate: (fingerprint: string) =>
    ['monetization-gap', 'targeting', 'estimate', fingerprint] as const,

  entitlements: () => ['monetization-gap', 'entitlements'] as const,

  planChange: () => ['monetization-gap', 'plan-change'] as const,
  planChangePreview: (planCode: string) => ['monetization-gap', 'plan-change', planCode] as const,

  premiumAnalytics: (period?: string) =>
    ['monetization-gap', 'premium-analytics', period ?? 'default'] as const,

  recommendations: (surface?: string) =>
    ['monetization-gap', 'recommendations', surface ?? 'all'] as const,
};

/**
 * The refusal a gap route produces in a build where gap features are off.
 *
 * A `FinancialError` rather than a thrown string, so the same components render
 * it as render every other financial failure — a member on a production build
 * sees a coherent "not available yet" rather than a crash.
 */
function unavailable(gapKey: string): FinancialError {
  const gap = MONETIZATION_GAPS[gapKey];
  return new FinancialError({
    kind: 'unavailable',
    code: `frontend.monetization-gap.${gapKey}`,
    message: `${gap?.title ?? 'This'} is not available on Diaspora yet.`,
    hint: 'The platform does not support it yet. We will let you know when it arrives.',
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
  });
}

function assertEnabled(gapKey: string): void {
  if (!areMonetizationGapsEnabled()) throw unavailable(gapKey);
}

async function read<T>(
  gapKey: string,
  path: string,
  params?: Record<string, unknown> | object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const response = await apiClient.get<PlatformEnvelope<T>>(
      `${MONETIZATION_GAP_PREFIX}${path}`,
      { params }
    );
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as `financial-api.ts` does, so a
 * transport failure on a simulated campaign submission becomes an
 * *indeterminate* outcome rather than a failed one. The simulation reproduces
 * the real failure semantics, because a flow tested against forgiving mocks is a
 * flow that breaks the first time a real gateway is slow.
 */
async function write<T>(
  gapKey: string,
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: Record<string, unknown> | object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const url = `${MONETIZATION_GAP_PREFIX}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<PlatformEnvelope<T>>(url, { params })
        : method === 'put'
          ? await apiClient.put<PlatformEnvelope<T>>(url, body, { params })
          : await apiClient.post<PlatformEnvelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ── Campaigns — MON-GAP-001 ──────────────────────────────────────────────────

export function fetchCampaigns(params: { status?: string; take?: number } = {}): Promise<Campaign[]> {
  return read<Campaign[]>('campaigns', '/campaigns/me', params);
}

export function fetchCampaign(campaignId: string): Promise<Campaign> {
  return read<Campaign>('campaigns', `/campaigns/${campaignId}`);
}

export function createCampaign(request: CreateCampaignRequest): Promise<Campaign> {
  return write<Campaign>('campaigns', 'post', '/campaigns', request);
}

export function updateCampaign(campaignId: string, request: UpdateCampaignRequest): Promise<Campaign> {
  return write<Campaign>('campaigns', 'put', `/campaigns/${campaignId}`, request);
}

/**
 * Submits a campaign and returns the payment that has to clear before it runs.
 *
 * Shaped to match `MonetizationPurchase`, which carries its `payment` inline for
 * the same reason: the caller can go straight to reconciliation without a second
 * round trip, and the success screen is driven by the payment's authoritative
 * status rather than by this call returning 200.
 */
export function submitCampaign(
  campaignId: string,
  request: { methodKind?: string; idempotencyKey?: string } = {}
): Promise<CampaignSubmission> {
  return write<CampaignSubmission>('campaigns', 'post', `/campaigns/${campaignId}/submit`, request);
}

export function pauseCampaign(campaignId: string): Promise<Campaign> {
  return write<Campaign>('campaigns', 'post', `/campaigns/${campaignId}/pause`);
}

export function resumeCampaign(campaignId: string): Promise<Campaign> {
  return write<Campaign>('campaigns', 'post', `/campaigns/${campaignId}/resume`);
}

export function cancelCampaign(campaignId: string, reason?: string): Promise<Campaign> {
  return write<Campaign>('campaigns', 'post', `/campaigns/${campaignId}/cancel`, { reason });
}

// ── Targeting — MON-GAP-007 ──────────────────────────────────────────────────

/** The selectable values. Owned by the backend so the app ships no geography table. */
export function fetchTargetingOptions(countryCode?: string): Promise<TargetingOptions> {
  return read<TargetingOptions>('targeting', '/targeting/options', { countryCode });
}

/**
 * What a selection would reach.
 *
 * A POST because the selection is a body rather than a query string, and because
 * an estimate that ends up in a URL is a targeting selection in somebody's
 * access logs.
 */
export function estimateAudience(audience: CampaignAudience): Promise<AudienceEstimate> {
  return write<AudienceEstimate>('targeting', 'post', '/targeting/estimate', audience);
}

// ── Performance — MON-GAP-002 ────────────────────────────────────────────────

export function fetchPlacementPerformance(placementId: string): Promise<PerformanceReport> {
  return read<PerformanceReport>('performance', `/placements/${placementId}/performance`);
}

export function fetchCampaignPerformance(campaignId: string): Promise<PerformanceReport> {
  return read<PerformanceReport>('performance', `/campaigns/${campaignId}/performance`);
}

export function fetchPerformanceSummary(): Promise<PerformanceSummary> {
  return read<PerformanceSummary>('performance', '/performance/summary');
}

// ── Entitlement usage — MON-GAP-008 ──────────────────────────────────────────

export function fetchEntitlementSnapshot(): Promise<EntitlementSnapshot> {
  return read<EntitlementSnapshot>('usage', '/entitlements/me');
}

// ── Billing — MON-GAP-009 ────────────────────────────────────────────────────
//
// Connected. Invoices are `fetchMyInvoices` / `fetchInvoice` /
// `fetchInvoiceDocument` and the next charge is `fetchUpcomingCharges`, all in
// `financial-api.ts`. `/billing/upcoming` was this adapter's own invention; the
// served route is `/financial/subscriptions/me/upcoming`.

// ── Plan changes — MON-GAP-003 ───────────────────────────────────────────────

/** What moving to `planCode` would cost. Asked for, never computed on the device. */
export function previewPlanChange(
  subscriptionId: string,
  planCode: string
): Promise<PlanChangePreview> {
  return read<PlanChangePreview>('planChange', `/subscriptions/${subscriptionId}/change/preview`, {
    planCode,
  });
}

export function changePlan(
  subscriptionId: string,
  request: ChangePlanRequest
): Promise<Subscription> {
  return write<Subscription>('planChange', 'post', `/subscriptions/${subscriptionId}/change`, request);
}

// ── Premium analytics — MON-GAP-010 ──────────────────────────────────────────

/**
 * The advanced dataset.
 *
 * Fetched only once the entitlement resolves true. §12 forbids sending premium
 * data to a device that has not bought it and then obscuring it in the UI — the
 * locked state renders shape and labels, and this call is never made behind it.
 */
export function fetchPremiumAnalytics(period?: string): Promise<PremiumAnalytics> {
  return read<PremiumAnalytics>('premiumAnalytics', '/analytics/premium/summary', { period });
}

// ── Recommendations — MON-GAP-011 ────────────────────────────────────────────

export function fetchMonetizationRecommendations(
  surface?: string
): Promise<MonetizationRecommendation[]> {
  return read<MonetizationRecommendation[]>('recommendations', '/recommendations/monetization', {
    surface,
  });
}
