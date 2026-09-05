// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization adapter integration tests (Frontend Phase 6)
//
// ⚠ These exercise the DEVELOPMENT ADAPTER, not a certified backend. ⚠
//
// The real API client, against the real gap handlers, over the real axios
// adapter. Nothing is stubbed between `createCampaign()` and the JSON the
// handler returns, so these tests exercise the route strings, the `{ data }`
// envelope, and the RFC 9457 problem documents becoming `FinancialError`s —
// exactly as the equivalent Phase 5 suite does for the certified routes.
//
// They matter for a reason beyond the simulation: **this is the contract the
// backend is being asked to implement.** A request shape asserted here is the
// request shape in the gap register, and a refusal asserted here is a refusal
// the real backend will have to produce. When the gap closes, this file becomes
// the acceptance test for it.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupMonetizationGapMocks } from '@/mocks/handlers/monetization-gaps';
import { FinancialError } from '../financial-errors';
import * as api from '../monetization-gap-api';
import { presentCampaignStatus } from '../monetization-catalog';
import type { CampaignAudience, CreateCampaignRequest } from '@/types/monetization-gaps';

let mock: MockAdapter;
let teardown: () => void;

const emptyAudience: CampaignAudience = {
  countries: [],
  communities: [],
  neighbourhoods: [],
  audienceTypes: [],
  interests: [],
  categories: [],
  minMonthsInCountry: null,
};

function draft(overrides: Partial<CreateCampaignRequest> = {}): CreateCampaignRequest {
  return {
    name: 'Spring push',
    objective: 'Enquiries',
    creative: {
      headline: 'Affordable moves across London',
      body: 'Same-day removals with insured drivers.',
      callToActionLabel: 'Get a quote',
      callToActionRoute: null,
      mediaReference: null,
    },
    audience: { ...emptyAudience, countries: ['GB'] },
    budgetKind: 'Total',
    budgetAmount: 150,
    currency: 'GBP',
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    ...overrides,
  };
}

beforeAll(() => {
  // No `delayResponse`: these assert contract shape, not timing.
  mock = new MockAdapter(apiClient);
  teardown = setupMonetizationGapMocks(mock);
  mock.onAny().reply(404, { title: 'No handler', status: 404 });
});

afterAll(() => {
  // The simulated gateway schedules a status change 2.5 seconds out. Cancelling
  // those timers stops one test's campaign advancing in the middle of another,
  // and stops the worker hanging after the last assertion.
  teardown();
  mock.restore();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the campaign lifecycle', () => {
  it('lists the seeded campaigns', async () => {
    const campaigns = await api.fetchCampaigns();

    expect(campaigns.length).toBeGreaterThan(0);
    expect(campaigns.some((campaign) => campaign.status === 'Active')).toBe(true);
    expect(campaigns.some((campaign) => campaign.status === 'Rejected')).toBe(true);
  });

  it('narrows by status', async () => {
    const active = await api.fetchCampaigns({ status: 'Active' });
    expect(active.every((campaign) => campaign.status === 'Active')).toBe(true);
  });

  it('creates a draft rather than something already running', async () => {
    const campaign = await api.createCampaign(draft());

    // The split matters: a campaign is a draft before it is funded, and
    // `POST /campaigns` must not be what asks for money.
    expect(campaign.status).toBe('Draft');
    expect(campaign.spend.minorUnits).toBe(0);
    expect(campaign.remaining.minorUnits).toBe(campaign.budget.minorUnits);
    expect(campaign.paymentIntentId).toBeNull();
  });

  it('takes the budget in major units and stores it in minor, as every B15 request DTO does', async () => {
    const campaign = await api.createCampaign(draft({ budgetAmount: 150 }));

    expect(campaign.budget.minorUnits).toBe(15000);
    expect(campaign.budget.currency).toBe('GBP');
  });

  it('refuses a campaign with no name', async () => {
    await expect(api.createCampaign(draft({ name: '   ' }))).rejects.toBeInstanceOf(FinancialError);
    await expect(api.createCampaign(draft({ name: '' }))).rejects.toMatchObject({
      code: 'monetization.campaign.name_required',
    });
  });

  // Removed: 'refuses a campaign with nowhere to appear'.
  //
  // It pinned a rule only the adapter had. B16 accepts no placement on any
  // route — `CreateAdCampaignRequest` has no such field and `AddPlacement` has
  // no callers — so the check made a preview build stricter than production and
  // described a constraint that does not exist.

  it('refuses a campaign with no budget', async () => {
    await expect(api.createCampaign(draft({ budgetAmount: 0 }))).rejects.toMatchObject({
      code: 'monetization.campaign.budget_required',
    });
  });

  it('reads one back by id', async () => {
    const created = await api.createCampaign(draft({ name: 'Readback' }));
    const fetched = await api.fetchCampaign(created.campaignId);

    expect(fetched.campaignId).toBe(created.campaignId);
    expect(fetched.name).toBe('Readback');
  });

  it('refuses an unknown id rather than answering with an empty campaign', async () => {
    await expect(api.fetchCampaign('cam-nope')).rejects.toMatchObject({
      code: 'monetization.campaign.not_found',
    });
  });

  it('edits a draft', async () => {
    const created = await api.createCampaign(draft({ name: 'Before' }));
    const updated = await api.updateCampaign(created.campaignId, { name: 'After' });

    expect(updated.name).toBe('After');
    expect(updated.campaignId).toBe(created.campaignId);
  });

  it('refuses to edit something already running', async () => {
    // `cam-0001` is seeded Active.
    await expect(api.updateCampaign('cam-0001', { name: 'Nope' })).rejects.toMatchObject({
      code: 'monetization.campaign.not_editable',
    });
  });
});

describe('submitting and funding', () => {
  it('returns a payment that has not settled, so the client has to reconcile', async () => {
    const created = await api.createCampaign(draft({ name: 'Fundable' }));
    const submission = await api.submitCampaign(created.campaignId, { methodKind: 'Wallet' });

    expect(submission.campaign.status).toBe('PendingPayment');
    expect(submission.payment).not.toBeNull();
    // The important assertion. A mock that returned `Captured` would let through
    // a bug where the client renders success from its own request rather than
    // from a reported status.
    expect(submission.payment!.status).toBe('Pending');
    expect(presentCampaignStatus(submission.campaign.status).isSettled).toBe(false);
  });

  it('denominates the payment in the campaign’s own currency', async () => {
    const created = await api.createCampaign(draft({ name: 'Currency', budgetAmount: 42 }));
    const submission = await api.submitCampaign(created.campaignId);

    expect(submission.payment!.amount.minorUnits).toBe(4200);
    expect(submission.payment!.amount.currency).toBe('GBP');
    expect(submission.payment!.captured.minorUnits).toBe(0);
  });

  it('refuses a second submission', async () => {
    const created = await api.createCampaign(draft({ name: 'Twice' }));
    await api.submitCampaign(created.campaignId);

    await expect(api.submitCampaign(created.campaignId)).rejects.toMatchObject({
      code: 'monetization.campaign.already_submitted',
    });
  });

  it('rejects a creative making an unverifiable claim, and charges nothing for it', async () => {
    const created = await api.createCampaign(
      draft({
        name: 'Claims',
        creative: {
          headline: 'Cheapest transfers guaranteed',
          body: 'Nobody beats our rates.',
          callToActionLabel: 'Send now',
          callToActionRoute: null,
          mediaReference: null,
        },
      })
    );

    const submission = await api.submitCampaign(created.campaignId);

    expect(submission.campaign.status).toBe('Rejected');
    expect(submission.campaign.rejectionCode).toBe('creative.unsubstantiated_claim');
    expect(submission.campaign.rejectionReason).toContain('not been charged');
    expect(submission.campaign.appealableUntil).toBeTruthy();
    // No payment at all: a refused campaign must never produce a charge.
    expect(submission.payment).toBeNull();
  });

  it('lets a rejected campaign be edited and submitted again', async () => {
    const created = await api.createCampaign(
      draft({
        name: 'Fixable',
        creative: {
          headline: 'Cheapest guaranteed',
          body: 'x',
          callToActionLabel: 'Go',
          callToActionRoute: null,
          mediaReference: null,
        },
      })
    );
    await api.submitCampaign(created.campaignId);

    const fixed = await api.updateCampaign(created.campaignId, {
      creative: {
        headline: 'Low-cost transfers',
        body: 'Send money home in minutes.',
        callToActionLabel: 'Send now',
        callToActionRoute: null,
        mediaReference: null,
      },
    });
    expect(fixed.creative.headline).toBe('Low-cost transfers');

    const resubmitted = await api.submitCampaign(created.campaignId);
    expect(resubmitted.campaign.status).toBe('PendingPayment');
    // The old rejection is cleared rather than left to haunt the detail screen.
    expect(resubmitted.campaign.rejectionReason).toBeNull();
  });
});

describe('running a campaign', () => {
  it('pauses and resumes one that is active', async () => {
    const paused = await api.pauseCampaign('cam-0001');
    expect(paused.status).toBe('Paused');

    const resumed = await api.resumeCampaign('cam-0001');
    expect(resumed.status).toBe('Active');
  });

  it('refuses to pause something that is not running', async () => {
    // `cam-0004` is seeded Completed.
    await expect(api.pauseCampaign('cam-0004')).rejects.toMatchObject({
      code: 'monetization.campaign.not_running',
    });
  });

  it('refuses to resume something that is not paused', async () => {
    await expect(api.resumeCampaign('cam-0001')).rejects.toMatchObject({
      code: 'monetization.campaign.not_paused',
    });
  });

  it('cancels one that is still going', async () => {
    const created = await api.createCampaign(draft({ name: 'Cancellable' }));
    const cancelled = await api.cancelCampaign(created.campaignId, 'MemberRequested');

    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.completedAt).toBeTruthy();
  });

  it('refuses to cancel something already finished', async () => {
    await expect(api.cancelCampaign('cam-0004')).rejects.toMatchObject({
      code: 'monetization.campaign.already_finished',
    });
  });
});

describe('targeting', () => {
  it('serves the selectable values, so the app ships no geography table', async () => {
    const options = await api.fetchTargetingOptions('GB');

    expect(options.countries.length).toBeGreaterThan(0);
    expect(options.communities.length).toBeGreaterThan(0);
    expect(options.neighbourhoods.length).toBeGreaterThan(0);
    expect(options.audienceTypes.length).toBeGreaterThan(0);
    expect(options.interests.length).toBeGreaterThan(0);
    expect(options.categories.length).toBeGreaterThan(0);
  });

  it('estimates reach as a range and never as an exact count', async () => {
    // An exact count of the members matching a fine selection is a privacy leak:
    // narrow until the number is one and the advertiser has learned something
    // about an individual.
    const estimate = await api.estimateAudience({ ...emptyAudience, countries: ['GB'] });

    expect(estimate.reachUpper).toBeGreaterThan(estimate.reachLower);
    expect(estimate.isDeliverable).toBe(true);
  });

  it('narrows the estimate as dimensions are added', async () => {
    const broad = await api.estimateAudience({ ...emptyAudience, countries: ['GB'] });
    const narrow = await api.estimateAudience({
      ...emptyAudience,
      countries: ['GB'],
      neighbourhoods: ['peckham'],
    });

    expect(narrow.reachUpper).toBeLessThan(broad.reachUpper);
  });

  it('narrows without refusing, because the platform has no minimum reach', async () => {
    // -- What this replaced ---------------------------------------------------
    //
    // 'refuses a selection too narrow to deliver, with a reason and a remedy'.
    // The adapter refused any estimate under five hundred people and returned
    // `targeting.too_narrow` with "Remove a filter or two". B16 has no such
    // rule: nothing in `CreateAdCampaignCommand` validates audience size.
    //
    // So a preview build refused campaigns production accepts, and the client
    // gated Continue on it -- which made every community selection a dead end
    // once the real directory shipped with no members. The remedy the message
    // offered did not exist either: no filter change counted differently.
    const estimate = await api.estimateAudience({
      countries: ['GB'],
      communities: ['nigerian-uk'],
      neighbourhoods: ['peckham'],
      audienceTypes: ['Student'],
      interests: ['remittance'],
      categories: ['electronics'],
      minMonthsInCountry: null,
    });

    expect(estimate.refusalCode).toBeNull();
    expect(estimate.reachUpper).toBeGreaterThanOrEqual(estimate.reachLower);

    // Deliverability follows the count, and nothing else.
    expect(estimate.isDeliverable).toBe(estimate.reachUpper > 0);
  });
});

describe('performance', () => {
  it('carries a definition with every metric', async () => {
    const report = await api.fetchPlacementPerformance('pl-0001');

    expect(report.metrics.length).toBeGreaterThan(0);
    for (const metric of report.metrics) {
      // §20 forbids inventing metric semantics; the definition travelling with
      // the number is how the contract keeps that promise once it is real.
      expect(metric.definition.length).toBeGreaterThan(20);
      expect(metric.label.length).toBeGreaterThan(0);
    }
  });

  it('states how far behind live the figures are', async () => {
    const report = await api.fetchPlacementPerformance('pl-0001');
    expect(report.reportingLagHours).toBeGreaterThan(0);
  });

  it('returns a series a chart can draw', async () => {
    const report = await api.fetchPlacementPerformance('pl-0001');

    expect(report.series.length).toBeGreaterThan(1);
    for (const point of report.series) {
      expect(point.impressions).toBeGreaterThanOrEqual(0);
      expect(point.clicks).toBeGreaterThanOrEqual(0);
      expect(point.clicks).toBeLessThanOrEqual(point.impressions);
    }
  });

  it('is deterministic, so a screenshot can be reviewed twice', async () => {
    const first = await api.fetchPlacementPerformance('pl-0001');
    const second = await api.fetchPlacementPerformance('pl-0001');

    expect(first.series.map((point) => point.impressions)).toEqual(
      second.series.map((point) => point.impressions)
    );
  });

  it('reports campaign spend as Money rather than a bare number', async () => {
    const report = await api.fetchCampaignPerformance('cam-0001');
    const spend = report.metrics.find((metric) => metric.key === 'spend');

    expect(spend?.unit).toBe('currency');
    expect(spend?.money?.currency).toBe('GBP');
    expect(spend?.money?.minorUnits).toBeGreaterThan(0);
  });

  it('summarises across everything', async () => {
    const summary = await api.fetchPerformanceSummary();

    expect(summary.totalImpressions).toBeGreaterThan(0);
    expect(summary.totalSpend.currency).toBe('GBP');
    expect(summary.reportingLagHours).toBeGreaterThan(0);
  });
});

describe('entitlement usage', () => {
  it('reports a limit and a consumption against the keys the real catalogue serves', async () => {
    const snapshot = await api.fetchEntitlementSnapshot();

    const listings = snapshot.counters.find((counter) => counter.key === 'listings.concurrent');
    expect(listings).toBeDefined();
    expect(listings!.limit).toBe(15);
    expect(listings!.consumed).toBe(11);
    expect(listings!.remaining).toBe(4);
    expect(listings!.atLimitBehaviour.length).toBeGreaterThan(0);
  });

  it('includes an at-limit counter, so that state is reachable in review', async () => {
    const snapshot = await api.fetchEntitlementSnapshot();
    const jobs = snapshot.counters.find((counter) => counter.key === 'jobs.concurrent');

    expect(jobs!.consumed).toBe(jobs!.limit);
    expect(jobs!.remaining).toBe(0);
  });
});

describe('billing', () => {
  it('serves invoices with a number, a period, lines and a total', async () => {
    const invoices = await api.fetchInvoices();

    expect(invoices.length).toBeGreaterThan(0);
    for (const invoice of invoices) {
      expect(invoice.number).toMatch(/^DSP-/);
      expect(invoice.lines.length).toBeGreaterThan(0);
      expect(invoice.total.currency).toBe('GBP');
      // Shown even at zero: an omitted tax line and a zero one say different
      // things to somebody doing their books.
      expect(invoice.tax).toBeDefined();
    }
  });

  it('reads one back by id and refuses an unknown one', async () => {
    const invoice = await api.fetchInvoice('inv-0001');
    expect(invoice.invoiceId).toBe('inv-0001');

    await expect(api.fetchInvoice('inv-nope')).rejects.toMatchObject({
      code: 'monetization.invoice.not_found',
    });
  });

  it('serves the next charge with a date and whether it is automatic', async () => {
    const charges = await api.fetchUpcomingCharges();

    expect(charges.length).toBeGreaterThan(0);
    expect(charges[0].dueAt).toBeTruthy();
    expect(typeof charges[0].isAutomatic).toBe('boolean');
  });
});

describe('plan changes', () => {
  it('computes the preview server-side and returns it whole', async () => {
    // The client never multiplies a plan price by a remaining fraction of a
    // period — even in simulation. Building the mock the easy way would leave
    // the client owning arithmetic on money that §7 forbids.
    const preview = await api.previewPlanChange('sub-0001', 'pro-yearly');

    expect(preview.fromPlanCode).toBe('plus-monthly');
    expect(preview.toPlanCode).toBe('pro-yearly');
    expect(preview.kind).toBe('Upgrade');
    expect(preview.dueNow.minorUnits).toBeGreaterThan(0);
    expect(preview.proratedCredit.minorUnits).toBeGreaterThan(0);
    expect(preview.isPermitted).toBe(true);
  });

  it('starts an upgrade immediately and defers a downgrade to the period end', async () => {
    const upgrade = await api.previewPlanChange('sub-0001', 'pro-yearly');
    const downgrade = await api.previewPlanChange('sub-0001', 'free');

    expect(Date.parse(upgrade.effectiveAt)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(Date.parse(downgrade.effectiveAt)).toBeGreaterThan(Date.now());
    // Somebody who has paid for the month keeps the month, so a downgrade costs
    // nothing today.
    expect(downgrade.dueNow.minorUnits).toBe(0);
    expect(downgrade.kind).toBe('Downgrade');
  });

  it('names what a change gains and loses', async () => {
    const preview = await api.previewPlanChange('sub-0001', 'pro-yearly');

    expect(preview.gainedEntitlementKeys).toContain('analytics.export');
    const downgrade = await api.previewPlanChange('sub-0001', 'free');
    expect(downgrade.lostEntitlementKeys).toContain('analytics.advanced');
  });

  it('refuses an unknown plan', async () => {
    await expect(api.previewPlanChange('sub-0001', 'nope')).rejects.toMatchObject({
      code: 'monetization.plan.not_found',
    });
  });

  it('applies the change and returns the new entitlements', async () => {
    const subscription = await api.changePlan('sub-0001', { planCode: 'pro-yearly' });

    expect(subscription.planCode).toBe('pro-yearly');
    expect(subscription.grantsAccess).toBe(true);
    expect(subscription.entitlements.some((entry) => entry.key === 'analytics.export')).toBe(true);
  });
});

describe('premium analytics', () => {
  it('serves the advanced dataset the analytics.advanced entitlement names', async () => {
    const analytics = await api.fetchPremiumAnalytics();

    expect(analytics.headline.length).toBeGreaterThan(0);
    expect(analytics.breakdowns.length).toBeGreaterThan(0);
    expect(analytics.topSubjects.length).toBeGreaterThan(0);
    expect(analytics.reportingLagHours).toBeGreaterThan(0);
  });

  it('keeps each breakdown’s ratios inside a sensible whole', async () => {
    const analytics = await api.fetchPremiumAnalytics();

    for (const breakdown of analytics.breakdowns) {
      const total = breakdown.buckets.reduce((running, bucket) => running + bucket.ratio, 0);
      expect(total).toBeGreaterThan(0.95);
      expect(total).toBeLessThan(1.05);
    }
  });
});

describe('recommendations', () => {
  it('carries a reason a member could disagree with, and a machine-readable code', async () => {
    const recommendations = await api.fetchMonetizationRecommendations('dashboard');

    expect(recommendations.length).toBeGreaterThan(0);
    for (const recommendation of recommendations) {
      expect(recommendation.reason.length).toBeGreaterThan(20);
      expect(recommendation.reasonCode.length).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
      expect(recommendation.route.startsWith('/')).toBe(true);
    }
  });
});
