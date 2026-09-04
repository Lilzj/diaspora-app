// ─────────────────────────────────────────────────────────────────────────────
// Advertising campaigns, after the gap closed.
//
// `monetization-gap-api.ts` served this whole surface — dashboard, wizard,
// creative, audience, budget, checkout, review, performance — against simulated
// persistence for a phase. It now calls B16's real routes, and the mapping
// between the two shapes carries four decisions worth pinning:
//
//   1. **Two dimensions are not sent.** `audienceTypes` and
//      `minMonthsInCountry` are collected by the builder and the delivery
//      engine does not honour them. MON-GAP-007's complaint was a builder that
//      "collected six more and sent one"; posting them anyway would be that
//      defect wearing a certified badge.
//   2. **Every metric carries the server's own definition.** §20 forbids
//      inventing metric semantics, and the client's own type makes `definition`
//      required — so a metric whose meaning came from a client constant would
//      not compile, and one whose meaning came from the wrong field would.
//   3. **Absent rates stay absent.** "0% opened" and "not shown to anybody yet"
//      are different sentences and only one is a reason to change the creative.
//   4. **Submitting does not open a payment.** It answers what to buy.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  cancelCampaign,
  createCampaign,
  estimateAudience,
  fetchCampaign,
  fetchCampaignPerformance,
  fetchTargetingOptions,
  recordCampaignClick,
  submitCampaign,
} from '../advertising-api';
import type { CampaignAudience } from '@/types/monetization-gaps';

const CAMPAIGN_ID = '3a2b1c40-1e5f-4d2b-8e31-6c7d8e9f0a12';

const envelope = <T,>(data: T) => ({ data, meta: {} });

const money = (minorUnits: number) => ({ minorUnits, currency: 'GBP', exponent: 2 });

const campaignWire = (over: Record<string, unknown> = {}) => ({
  id: CAMPAIGN_ID,
  name: 'Nigerians in London — spring',
  objective: 'Traffic',
  status: 'Draft',
  budget: money(5_000),
  spend: money(0),
  remaining: money(5_000),
  startsAt: '2026-09-05T00:00:00Z',
  endsAt: '2026-10-05T00:00:00Z',
  audience: {
    countryCodes: ['GB'],
    communityIds: [],
    neighbourhoodIds: [],
    interests: [],
    categories: [],
    isEveryone: false,
    constrainedDimensions: ['Country'],
  },
  review: { decision: 'Pending', canAppeal: false },
  createdAt: '2026-09-04T00:00:00Z',
  canEdit: true,
  canSubmit: true,
  canPause: false,
  canResume: false,
  canCancel: true,
  ...over,
});

const definitions = {
  impression: 'The number of times Diaspora showed this because it was promoted.',
  click: 'The number of times somebody opened this from a promoted position.',
  conversion: 'Nothing records these yet, so this reads as zero.',
  result: 'What your objective is paid for.',
  deduplication: 'None.',
  reportingLag: 'Figures follow delivery, usually within seconds.',
};

describe('the advertising routes are the certified ones', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  // ── The URL space ─────────────────────────────────────────────────────────

  it('reads a campaign from /financial/campaigns, never a gap prefix', async () => {
    mock.onGet(/\/financial\/campaigns\/.+/).reply(200, envelope(campaignWire()));

    await fetchCampaign(CAMPAIGN_ID);

    expect(mock.history.get[0].url).toBe(`/financial/campaigns/${CAMPAIGN_ID}`);
    expect(mock.history.get[0].url).not.toContain('monetization-gap');
  });

  // ── The two dimensions that are not honoured ──────────────────────────────

  it('does not send targeting dimensions the delivery engine ignores', async () => {
    mock.onPost('/financial/campaigns').reply(200, envelope(campaignWire()));

    await createCampaign({
      name: 'Spring',
      objective: 'Traffic',
      placements: [],
      creative: { headline: 'Find your people', body: '', callToActionLabel: 'Open' },
      audience: {
        countries: ['GB'],
        communities: [],
        neighbourhoods: [],
        audienceTypes: ['Newcomer', 'Student'],
        interests: ['technology'],
        categories: [],
        minMonthsInCountry: 6,
      },
      budgetKind: 'Total',
      budgetAmount: 50,
      currency: 'GBP',
      startsAt: '2026-09-05T00:00:00Z',
      endsAt: '2026-10-05T00:00:00Z',
    });

    const sent = JSON.parse(mock.history.post[0].data);

    expect(sent.audience.countryCodes).toEqual(['GB']);
    expect(sent.audience.interests).toEqual(['technology']);

    expect(sent.audience).not.toHaveProperty('audienceTypes');
    expect(sent.audience).not.toHaveProperty('minMonthsInCountry');
  });

  it('reports an unhonoured dimension back as empty rather than echoing it', async () => {
    // An audience that displayed a constraint the server never applied would be
    // the client lying to itself about what its own campaign is doing.
    mock.onGet(/\/financial\/campaigns\/.+/).reply(200, envelope(campaignWire()));

    const campaign = await fetchCampaign(CAMPAIGN_ID);

    expect(campaign.audience.audienceTypes).toEqual([]);
    expect(campaign.audience.minMonthsInCountry).toBeNull();
  });

  it('sends the budget in minor units, having taken it in major ones', async () => {
    mock.onPost('/financial/campaigns').reply(200, envelope(campaignWire()));

    await createCampaign({
      name: 'Spring',
      objective: 'Awareness',
      placements: [],
      creative: { headline: '', body: '', callToActionLabel: '' },
      audience: {
        countries: [],
        communities: [],
        neighbourhoods: [],
        audienceTypes: [],
        interests: [],
        categories: [],
      },
      budgetKind: 'Total',
      budgetAmount: 50,
      currency: 'GBP',
      startsAt: '2026-09-05T00:00:00Z',
      endsAt: '2026-10-05T00:00:00Z',
    });

    expect(JSON.parse(mock.history.post[0].data).budgetMinorUnits).toBe(5_000);
  });

  // ── Submission ────────────────────────────────────────────────────────────

  it('answers what to buy rather than opening a payment', async () => {
    mock.onPost(/\/submit$/).reply(200, envelope({
      campaign: campaignWire({ status: 'PendingPayment', canEdit: false }),
      productCode: 'advertising.campaign.standard.30d',
      subjectType: 'Campaign',
      subjectId: CAMPAIGN_ID,
      amount: money(5_000),
    }));

    const instruction = await submitCampaign(CAMPAIGN_ID);

    expect(instruction.campaign.status).toBe('PendingPayment');
    expect(instruction.campaign.canEdit).toBe(false);
    expect(instruction.productCode).toBe('advertising.campaign.standard.30d');
    expect(instruction.subjectType).toBe('Campaign');
    expect(instruction.amount.amount).toBe(50);
  });

  // ── Performance ───────────────────────────────────────────────────────────

  it('gives every metric the server’s own definition', async () => {
    mock.onGet(/\/performance$/).reply(200, envelope({
      from: '2026-08-06',
      to: '2026-09-04',
      impressions: 400,
      clicks: 20,
      conversions: 0,
      clickThroughRate: 0.05,
      spend: money(2_500),
      results: 20,
      costPerResult: money(125),
      daily: [{ day: '2026-09-04', impressions: 400, clicks: 20 }],
      bySurface: [{ surface: 'Home', impressions: 400, clicks: 20 }],
      definitions,
    }));

    const report = await fetchCampaignPerformance(CAMPAIGN_ID);

    const impressions = report.metrics.find((metric) => metric.key === 'impressions');

    expect(impressions?.value).toBe(400);
    expect(impressions?.definition).toBe(definitions.impression);

    // Every metric, not just the ones with an obvious sentence behind them.
    expect(report.metrics.every((metric) => metric.definition.length > 0)).toBe(true);
  });

  it('leaves an absent rate absent rather than rendering it as zero', async () => {
    mock.onGet(/\/performance$/).reply(200, envelope({
      from: '2026-08-06',
      to: '2026-09-04',
      impressions: 0,
      clicks: 0,
      conversions: 0,
      clickThroughRate: null,
      spend: money(0),
      results: 0,
      costPerResult: null,
      daily: [],
      bySurface: [],
      definitions,
    }));

    const report = await fetchCampaignPerformance(CAMPAIGN_ID);

    expect(report.metrics.find((metric) => metric.key === 'clickThroughRate')).toBeUndefined();
    expect(report.metrics.find((metric) => metric.key === 'costPerResult')).toBeUndefined();
  });

  it('reports a click without saying anything about who clicked', async () => {
    mock.onPost(/\/clicks$/).reply(200, envelope(null));

    await recordCampaignClick(CAMPAIGN_ID, 'Home');

    expect(JSON.parse(mock.history.post[0].data)).toEqual({ surface: 'Home' });
  });

  // ── Targeting ─────────────────────────────────────────────────────────────

  it('distinguishes no catalogue from no options', async () => {
    // "Pick from this empty list" and "type what you want, we cannot enumerate
    // these" are different sentences, and only one leaves the member able to go on.
    mock.onGet('/financial/targeting/options').reply(200, envelope({
      dimension: 'Country',
      options: [],
      hasCatalogue: false,
      note: 'Countries are an ISO list the app already holds.',
    }));

    const options = await fetchTargetingOptions('Country');

    expect(options.hasCatalogue).toBe(false);
    expect(options.note).toContain('ISO');
  });

  it('carries the estimate’s reasoning, not just its numbers', async () => {
    mock.onPost('/financial/targeting/estimate').reply(200, envelope({
      lowerBound: 5,
      upperBound: 8,
      constrainedDimensions: ['Community'],
      basis: 'Based on the members those communities report.',
      isNarrowed: true,
    }));

    const audience: CampaignAudience = {
      countries: [],
      communities: ['a', 'b'],
      neighbourhoods: [],
      audienceTypes: [],
      interests: [],
      categories: [],
    };

    const estimate = await estimateAudience(audience);

    expect(estimate.reachLower).toBe(5);
    expect(estimate.reachUpper).toBe(8);
    expect(estimate.basis).toContain('communities report');
    expect(estimate.isNarrowed).toBe(true);
  });

  // ── Review ────────────────────────────────────────────────────────────────

  it('shows a rejection reason only on a rejection', async () => {
    // An approval note is a note. Rendering it under "why this was refused"
    // would put the wrong sentence in front of somebody whose campaign is live.
    mock.onGet(/\/financial\/campaigns\/.+/).reply(200, envelope(campaignWire({
      status: 'Approved',
      review: {
        decision: 'Approved',
        note: 'Fine, but drop the delivery-time claim next time.',
        decidedAt: '2026-09-04T10:00:00Z',
        canAppeal: false,
      },
    })));

    const campaign = await fetchCampaign(CAMPAIGN_ID);

    expect(campaign.reviewNote).toContain('delivery-time');
    expect(campaign.rejectionReason).toBeNull();
    expect(campaign.rejectionCode).toBeNull();
    expect(campaign.approvedAt).toBe('2026-09-04T10:00:00Z');
  });

  it('surfaces a cancellation’s settled amount through the campaign', async () => {
    mock.onPost(/\/cancel$/).reply(200, envelope(campaignWire({
      status: 'Cancelled',
      spend: money(1_000),
      remaining: money(4_000),
      settled: money(4_000),
      endReason: 'Changed our minds.',
      canCancel: false,
    })));

    const campaign = await cancelCampaign(CAMPAIGN_ID, 'Changed our minds.');

    expect(campaign.status).toBe('Cancelled');
    expect(campaign.remaining.amount).toBe(40);
  });
});
