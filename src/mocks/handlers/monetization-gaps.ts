// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified B15 Financial
//   Platform has no campaign aggregate, no performance metric of any kind, no
//   plan-change route, no usage counter, no invoice, no premium analytics
//   dataset and no monetization recommendation. These handlers exist so the
//   Phase 6 flows for those capabilities can be built, reviewed and tested now
//   — and so that closing each gap is a change of import rather than a
//   redesign.
//
//   Three safeguards, none of which is a comment:
//
//     * The prefix is `/monetization-gap/v0`, never `/financial`. A call that
//       escaped to a real deployment 404s at the gateway.
//     * `setupMonetizationGapMocks` refuses to register in a release build.
//     * Every screen behind these routes renders `<MonetizationGapNotice>`,
//       which names the missing contract on the screen itself.
//
//   The simulation is **stateful within a session** and deliberately reproduces
//   the awkward parts of the real contract rather than the easy ones: a
//   submitted campaign is `PendingPayment` until a payment reports captured, a
//   plan-change preview is computed server-side and returned rather than being
//   left for the client, and a rejected campaign carries a reason and an appeal
//   window. A flow tested against forgiving mocks is a flow that breaks the
//   first time a real backend says no.
//
//   See `src/config/monetization-gaps.ts` and
//   `frontend-phase-6-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import {
  MONETIZATION_GAP_PREFIX,
  areMonetizationGapsEnabled,
} from '@/config/monetization-gaps';
import { money, MOCK_PLANS } from '../financial-data';
import {
  MOCK_CAMPAIGNS,
  MOCK_INVOICES,
  MOCK_PERFORMANCE_SUMMARY,
  MOCK_PREMIUM_ANALYTICS,
  MOCK_RECOMMENDATIONS,
  MOCK_TARGETING_OPTIONS,
  MOCK_UPCOMING_CHARGES,
  MOCK_USAGE_COUNTERS,
  isoDaysAhead,
  mockCampaignPerformance,
  mockPlacementPerformance,
} from '../monetization-gap-data';
import type { Campaign, CampaignAudience, PlanChangePreview } from '@/types/monetization-gaps';
import type { PaymentIntent } from '@/types/financial';

const ROOT = MONETIZATION_GAP_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown): MockReply {
  return [200, { data }];
}

function problem(status: number, errorCode: string, detail: string): MockReply {
  return [
    status,
    {
      type: `https://docs.diaspora.app/errors/${errorCode}`,
      title: 'Request refused',
      status,
      detail,
      // `code`, as PlatformProblem writes it. These mocks sent `errorCode`,
      // which matched the client's old lookup and nothing the platform ever sent —
      // so mocked runs agreed with the defect instead of exposing it.
      code: errorCode,
    },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

/** The last path segment, for `/campaigns/{id}/pause` style routes. */
function segment(url: string | undefined, fromEnd: number): string {
  const parts = (url ?? '').split('?')[0].split('/').filter(Boolean);
  return parts[parts.length - 1 - fromEnd] ?? '';
}

/**
 * Registers the simulated routes — and only in a development build.
 *
 * The guard is here as well as in `monetization-gap-api.ts` because defence at
 * one layer is a decision somebody can accidentally undo. A release bundle
 * registers nothing, so even a screen that ignored `areMonetizationGapsEnabled()`
 * would get a 404 rather than a convincing fake.
 */
export function setupMonetizationGapMocks(mock: MockAdapter): () => void {
  if (!areMonetizationGapsEnabled()) {
    return () => undefined;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[MOCK][BACKEND GAP] Registering SIMULATED monetization routes under ' +
      `${ROOT}. Campaigns, performance figures, plan changes, usage counters, ` +
      'invoices and premium analytics do not exist in the certified backend.'
  );

  // ── Session state ──────────────────────────────────────────────────────────

  let campaigns: Campaign[] = MOCK_CAMPAIGNS.map((campaign) => ({ ...campaign }));

  /**
   * Payments this adapter minted, so a campaign can be moved out of
   * `PendingPayment` when its payment reports captured.
   *
   * Deliberately its own map rather than a reach into the financial mock's
   * state: the two are separate modules on the real platform too, and a
   * simulation that shared a variable between them would hide the round trip the
   * real client has to make.
   */
  const campaignPayments = new Map<string, string>();

  /**
   * Timers the simulated gateway has scheduled.
   *
   * Tracked so the teardown can cancel them. Without it, one test's campaign
   * settles in the middle of another and the Jest worker hangs waiting on a
   * timer nobody owns — the same reason `setupFinancialMocks` returns a
   * teardown.
   */
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function findCampaign(id: string): Campaign | undefined {
    return campaigns.find((campaign) => campaign.campaignId === id);
  }

  function replaceCampaign(next: Campaign): Campaign {
    campaigns = campaigns.map((campaign) =>
      campaign.campaignId === next.campaignId ? next : campaign
    );
    return next;
  }

  /**
   * A payment intent for a campaign submission.
   *
   * Shaped exactly like B15's, and starting `Pending` rather than `Captured`, so
   * `usePaymentReconciliation` actually polls and the success screen is driven
   * by a reported status. A mock that returned `Captured` immediately would let
   * a bug through where the client renders success from its own request.
   */
  function createCampaignPayment(campaign: Campaign, methodKind: string): PaymentIntent {
    const payment: PaymentIntent = {
      paymentIntentId: newId('pi-cam'),
      status: 'Pending',
      amount: campaign.budget,
      captured: money(0, campaign.budget.currency),
      refunded: money(0, campaign.budget.currency),
      refundableRemaining: money(0, campaign.budget.currency),
      methodKind,
      description: `Campaign: ${campaign.name}`,
      subjectType: 'Member',
      subjectId: campaign.campaignId,
      provider: 'Simulator',
      nextAction: null,
      failureCode: null,
      failureMessage: null,
      attemptCount: 1,
      refunds: [],
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      authorizedAt: null,
      capturedAt: null,
      createdAt: nowIso(),
    };

    campaignPayments.set(payment.paymentIntentId, campaign.campaignId);

    // The gateway answers a moment later, exactly as the financial simulator's
    // does. Once it captures, the campaign moves into review — which is the
    // sequence the real backend would run through an integration event.
    const timer = setTimeout(() => {
      timers.delete(timer);
      const current = findCampaign(campaign.campaignId);
      if (!current || current.status !== 'PendingPayment') return;
      replaceCampaign({ ...current, status: 'UnderReview', submittedAt: nowIso() });
    }, 2500);
    timers.add(timer);

    return payment;
  }

  // ── Campaigns — MON-GAP-001 ────────────────────────────────────────────────

  mock.onGet(`${ROOT}/campaigns/me`).reply((config) => {
    const status = config.params?.status as string | undefined;
    const filtered = status
      ? campaigns.filter((campaign) => campaign.status === status)
      : campaigns;
    return ok(filtered);
  });

  mock.onPost(`${ROOT}/campaigns`).reply((config) => {
    const request = body<{
      name?: string;
      objective?: string;
      placements?: string[];
      creative?: Campaign['creative'];
      audience?: CampaignAudience;
      budgetKind?: 'Total' | 'Daily';
      budgetAmount?: number;
      currency?: string;
      startsAt?: string;
      endsAt?: string;
    }>(config);

    if (!request.name || request.name.trim().length === 0) {
      return problem(400, 'monetization.campaign.name_required', 'A campaign needs a name.');
    }
    if (!request.budgetAmount || request.budgetAmount <= 0) {
      return problem(400, 'monetization.campaign.budget_required', 'A campaign needs a budget.');
    }

    const currency = request.currency ?? 'GBP';
    const budget = money(Math.round(request.budgetAmount * 100), currency);

    const campaign: Campaign = {
      campaignId: newId('cam'),
      name: request.name.trim(),
      status: 'Draft',
      objective: request.objective ?? 'Awareness',
      // Always empty, matching B16: no advertising route accepts a placement, and
      // the aggregate's `AddPlacement` has no callers. The adapter used to refuse
      // a campaign without one, which invented a constraint the platform does not
      // have — a preview build was stricter than production.
      placements: [],
      creative: request.creative ?? {
        headline: '',
        body: '',
        callToActionLabel: '',
        callToActionRoute: null,
        mediaReference: null,
      },
      audience: request.audience ?? {
        countries: [],
        communities: [],
        neighbourhoods: [],
        audienceTypes: [],
        interests: [],
        categories: [],
        minMonthsInCountry: null,
      },
      budgetKind: request.budgetKind ?? 'Total',
      budget,
      spend: money(0, currency),
      remaining: budget,
      startsAt: request.startsAt ?? nowIso(),
      endsAt: request.endsAt ?? isoDaysAhead(14),
      paymentIntentId: null,
      reviewNote: null,
      rejectionCode: null,
      rejectionReason: null,
      appealableUntil: null,
      createdAt: nowIso(),
      submittedAt: null,
      approvedAt: null,
      completedAt: null,
    };

    campaigns = [campaign, ...campaigns];
    return ok(campaign);
  });

  mock.onGet(new RegExp(`${ROOT}/campaigns/[^/]+$`)).reply((config) => {
    const campaign = findCampaign(segment(config.url, 0));
    return campaign
      ? ok(campaign)
      : problem(404, 'monetization.campaign.not_found', 'That campaign is not on your account.');
  });

  mock.onPut(new RegExp(`${ROOT}/campaigns/[^/]+$`)).reply((config) => {
    const campaign = findCampaign(segment(config.url, 0));
    if (!campaign) {
      return problem(404, 'monetization.campaign.not_found', 'That campaign is not on your account.');
    }
    if (campaign.status !== 'Draft' && campaign.status !== 'Rejected') {
      return problem(
        409,
        'monetization.campaign.not_editable',
        'A campaign can only be changed while it is a draft or after it has been refused.'
      );
    }

    const changes = body<Partial<Campaign>>(config);
    return ok(replaceCampaign({ ...campaign, ...changes, campaignId: campaign.campaignId }));
  });

  /**
   * Submit for review, and pay.
   *
   * The creative is checked here rather than only on the client, because that is
   * where the real backend would check it — and a rule the client alone enforces
   * is a rule that stops existing the moment somebody calls the API directly.
   */
  mock.onPost(new RegExp(`${ROOT}/campaigns/[^/]+/submit$`)).reply((config) => {
    const campaign = findCampaign(segment(config.url, 1));
    if (!campaign) {
      return problem(404, 'monetization.campaign.not_found', 'That campaign is not on your account.');
    }
    if (campaign.status !== 'Draft' && campaign.status !== 'Rejected') {
      return problem(
        409,
        'monetization.campaign.already_submitted',
        'This campaign has already been submitted.'
      );
    }

    // A deterministic way to reach the rejection path from the UI without
    // editing the mock: any campaign whose headline promises to be cheapest,
    // best or guaranteed is refused, exactly as the seeded `cam-0003` was.
    const claim = /\b(cheapest|guaranteed|best price|nobody beats)\b/i;
    if (claim.test(campaign.creative.headline) || claim.test(campaign.creative.body)) {
      return ok({
        campaign: replaceCampaign({
          ...campaign,
          status: 'Rejected',
          submittedAt: nowIso(),
          rejectionCode: 'creative.unsubstantiated_claim',
          rejectionReason:
            'We cannot run advertisements that guarantee to be the cheapest or the best, because we have no way to check it. Change the wording and submit it again — you have not been charged.',
          appealableUntil: isoDaysAhead(14),
        }),
        payment: null,
        methodKind: null,
      });
    }

    const request = body<{ methodKind?: string }>(config);
    const payment = createCampaignPayment(campaign, request.methodKind ?? 'Wallet');

    return ok({
      campaign: replaceCampaign({
        ...campaign,
        status: 'PendingPayment',
        paymentIntentId: payment.paymentIntentId,
        rejectionCode: null,
        rejectionReason: null,
        appealableUntil: null,
      }),
      payment,
      methodKind: request.methodKind ?? 'Wallet',
    });
  });

  mock.onPost(new RegExp(`${ROOT}/campaigns/[^/]+/pause$`)).reply((config) => {
    const campaign = findCampaign(segment(config.url, 1));
    if (!campaign) {
      return problem(404, 'monetization.campaign.not_found', 'That campaign is not on your account.');
    }
    if (campaign.status !== 'Active' && campaign.status !== 'Scheduled') {
      return problem(
        409,
        'monetization.campaign.not_running',
        'Only a running or scheduled campaign can be paused.'
      );
    }
    return ok(replaceCampaign({ ...campaign, status: 'Paused' }));
  });

  mock.onPost(new RegExp(`${ROOT}/campaigns/[^/]+/resume$`)).reply((config) => {
    const campaign = findCampaign(segment(config.url, 1));
    if (!campaign) {
      return problem(404, 'monetization.campaign.not_found', 'That campaign is not on your account.');
    }
    if (campaign.status !== 'Paused') {
      return problem(409, 'monetization.campaign.not_paused', 'This campaign is not paused.');
    }
    return ok(replaceCampaign({ ...campaign, status: 'Active' }));
  });

  mock.onPost(new RegExp(`${ROOT}/campaigns/[^/]+/cancel$`)).reply((config) => {
    const campaign = findCampaign(segment(config.url, 1));
    if (!campaign) {
      return problem(404, 'monetization.campaign.not_found', 'That campaign is not on your account.');
    }
    if (campaign.status === 'Completed' || campaign.status === 'Cancelled') {
      return problem(
        409,
        'monetization.campaign.already_finished',
        'This campaign has already finished.'
      );
    }
    return ok(
      replaceCampaign({ ...campaign, status: 'Cancelled', completedAt: nowIso() })
    );
  });

  // ── Targeting — MON-GAP-007 ────────────────────────────────────────────────

  mock.onGet(`${ROOT}/targeting/options`).reply(() => ok(MOCK_TARGETING_OPTIONS));

  /**
   * The reach estimate.
   *
   * Bucketed and never exact, because an exact count of the members matching a
   * fine-grained selection is a privacy leak: narrow the filters until the
   * number is one and the advertiser has learned something about an individual.
   * The simulation refuses anything narrower than a floor for the same reason.
   */
  mock.onPost(`${ROOT}/targeting/estimate`).reply((config) => {
    const audience = body<CampaignAudience>(config);

    const dimensions = [
      audience.countries,
      audience.communities,
      audience.neighbourhoods,
      audience.audienceTypes,
      audience.interests,
      audience.categories,
    ];

    // Each constrained dimension narrows the pool. Deterministic, so a reviewer
    // sees the same number twice.
    const base = 240_000;
    const narrowed = dimensions.reduce(
      (running, values) => (values.length === 0 ? running : running * (0.18 + values.length * 0.06)),
      base
    );

    const lower = Math.max(0, Math.round(narrowed * 0.8));
    const upper = Math.round(narrowed * 1.25);

    // No minimum. B16 has no audience-size rule at all — nothing in
    // `CreateAdCampaignCommand` validates reach — so a five-hundred-member floor
    // here made a preview build refuse campaigns production accepts. Same defect
    // as the `placement_required` rule that used to sit above.
    return ok({
      reachLower: lower,
      reachUpper: upper,
      isCounted: true,
      isDeliverable: upper > 0,
      basis: 'Estimated from current membership.',
      refusalCode: null,
      refusalMessage: null,
    });
  });

  // ── Performance — MON-GAP-002 ──────────────────────────────────────────────

  mock
    .onGet(new RegExp(`${ROOT}/placements/[^/]+/performance$`))
    .reply((config) => ok(mockPlacementPerformance(segment(config.url, 1))));

  mock
    .onGet(new RegExp(`${ROOT}/campaigns/[^/]+/performance$`))
    .reply((config) => ok(mockCampaignPerformance(segment(config.url, 1))));

  mock.onGet(`${ROOT}/performance/summary`).reply(() => ok(MOCK_PERFORMANCE_SUMMARY));

  // ── Usage — MON-GAP-008 ────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/entitlements/me`).reply(() =>
    ok({
      entitlements: MOCK_PLANS.find((plan) => plan.code === 'plus-monthly')?.entitlements ?? [],
      counters: MOCK_USAGE_COUNTERS,
      sourcePlanCode: 'plus-monthly',
      resolvedAt: nowIso(),
    })
  );

  // ── Billing — MON-GAP-009 ──────────────────────────────────────────────────

  mock.onGet(`${ROOT}/invoices/me`).reply(() => ok(MOCK_INVOICES));

  mock.onGet(new RegExp(`${ROOT}/invoices/[^/]+$`)).reply((config) => {
    const invoice = MOCK_INVOICES.find((entry) => entry.invoiceId === segment(config.url, 0));
    return invoice
      ? ok(invoice)
      : problem(404, 'monetization.invoice.not_found', 'That invoice is not on your account.');
  });

  mock.onGet(`${ROOT}/billing/upcoming`).reply(() => ok(MOCK_UPCOMING_CHARGES));

  // ── Plan changes — MON-GAP-003 ─────────────────────────────────────────────

  /**
   * The change preview.
   *
   * Computed **here**, on the server side of the boundary, and returned whole.
   * The client never multiplies a plan price by a remaining fraction of a
   * period, even in simulation — building the mock the easy way would mean
   * rewriting the screen when the real contract lands, and would leave the
   * client owning arithmetic on money that §7 says it must not.
   */
  mock.onGet(new RegExp(`${ROOT}/subscriptions/[^/]+/change/preview`)).reply((config) => {
    const planCode = config.params?.planCode as string | undefined;
    const target = MOCK_PLANS.find((plan) => plan.code === planCode);
    const current = MOCK_PLANS.find((plan) => plan.code === 'plus-monthly');

    if (!target || !current) {
      return problem(404, 'monetization.plan.not_found', 'That plan is not available.');
    }
    if (target.price.currency !== current.price.currency) {
      return problem(
        409,
        'financial.conversion.not_supported',
        'Diaspora does not convert currencies, so these plans cannot be swapped.'
      );
    }

    // Sixteen of thirty days left on the seeded subscription.
    const daysLeft = 16;
    const periodDays = 30;
    const credit = Math.round((current.price.minorUnits * daysLeft) / periodDays);

    const isUpgrade = target.price.minorUnits > current.price.minorUnits;
    const dueNow = isUpgrade ? Math.max(0, target.price.minorUnits - credit) : 0;

    const currentKeys = new Set(current.entitlements.map((entry) => entry.key));
    const targetKeys = new Set(target.entitlements.map((entry) => entry.key));

    const preview: PlanChangePreview = {
      fromPlanCode: current.code,
      toPlanCode: target.code,
      kind: isUpgrade ? 'Upgrade' : 'Downgrade',
      dueNow: money(dueNow, target.price.currency),
      proratedCredit: money(isUpgrade ? credit : 0, current.price.currency),
      nextChargeAmount: target.price,
      nextChargeAt: isoDaysAhead(isUpgrade ? 30 : daysLeft),
      // An upgrade starts now; a downgrade waits for the period already paid for.
      effectiveAt: isUpgrade ? nowIso() : isoDaysAhead(daysLeft),
      gainedEntitlementKeys: target.entitlements
        .filter((entry) => !currentKeys.has(entry.key))
        .map((entry) => entry.key),
      lostEntitlementKeys: current.entitlements
        .filter((entry) => !targetKeys.has(entry.key))
        .map((entry) => entry.key),
      isPermitted: true,
      refusalCode: null,
      refusalMessage: null,
    };

    return ok(preview);
  });

  mock.onPost(new RegExp(`${ROOT}/subscriptions/[^/]+/change$`)).reply((config) => {
    const request = body<{ planCode?: string }>(config);
    const target = MOCK_PLANS.find((plan) => plan.code === request.planCode);

    if (!target) {
      return problem(404, 'monetization.plan.not_found', 'That plan is not available.');
    }

    return ok({
      subscriptionId: 'sub-0001',
      planCode: target.code,
      tier: target.tier,
      status: 'Active',
      interval: target.interval,
      grantsAccess: true,
      entitlements: target.entitlements,
      currentPeriodStart: nowIso(),
      currentPeriodEnd: isoDaysAhead(target.interval === 'Yearly' ? 365 : 30),
      trialEndsAt: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      renewalCount: 3,
    });
  });

  // ── Premium analytics — MON-GAP-010 ────────────────────────────────────────

  mock.onGet(`${ROOT}/analytics/premium/summary`).reply(() => ok(MOCK_PREMIUM_ANALYTICS));

  // ── Recommendations — MON-GAP-011 ──────────────────────────────────────────

  mock.onGet(`${ROOT}/recommendations/monetization`).reply(() => ok(MOCK_RECOMMENDATIONS));

  /** Cancels every pending simulated-gateway timer. Called from a test teardown. */
  return () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
}
