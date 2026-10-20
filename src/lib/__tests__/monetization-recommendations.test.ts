// ─────────────────────────────────────────────────────────────────────────────
// Monetization suggestions and my gifts to a campaign, after the gaps closed —
// 20 Oct 2026 (backend a7b97c7).
//
//   1. `GET /recommendations/monetization` is read at its real path with
//      `limit`, and the feedback fields come through untouched.
//   2. "Not interested" is the ordinary dismissal, attributed to the
//      `MonetizationOffer` target on the `Monetization` surface.
//   3. `GET /communities/campaigns/{id}/donations/me` keeps B15's donation as
//      sent; nothing reaches a simulated prefix.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  fetchMonetizationRecommendations,
  isAcceptableTargetType,
  monetizationFeedbackFor,
  recordDismiss,
} from '../recommendations-api';
import { fetchMyCampaignDonations } from '../community-programme-api';

describe('monetization suggestions and campaign gifts', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mock.onAny(/-gap\//).reply(() => {
      throw new Error('a real read reached a simulated prefix');
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('reads suggestions from the served route and keeps what feedback needs', async () => {
    let params: Record<string, unknown> = {};
    mock.onGet('/recommendations/monetization').reply((config) => {
      params = config.params;
      return [
        200,
        {
          data: [
            {
              recommendationId: '6d7f2f4e-0000-4000-8000-000000000001',
              kind: 'product',
              code: 'featured-listing-7d',
              title: 'Feature your sofa for a week',
              reason: 'Nothing is promoting Sofa right now',
              reasonCode: 'subject.unpromoted',
              reasonResourceKey: 'recommendations.monetization.unpromoted',
              confidence: 0.6,
              route: '/monetization/promote?subjectId=l-1',
              subjectType: 'listing',
              subjectId: 'l-1',
              price: { amount: 4.99, currency: 'GBP' },
              targetType: 'MonetizationOffer',
              targetId: '6d7f2f4e-0000-4000-8000-000000000001',
              surface: 'Monetization',
              setId: 'set-1',
              position: 0,
            },
          ],
        },
      ];
    });

    const [suggestion] = await fetchMonetizationRecommendations({ limit: 3 });

    expect(params).toMatchObject({ limit: 3 });
    expect(suggestion.reason).toBe('Nothing is promoting Sofa right now');
    expect(suggestion.price).toEqual({ amount: 4.99, currency: 'GBP' });
    expect(monetizationFeedbackFor(suggestion)).toEqual({
      targetType: 'MonetizationOffer',
      targetId: '6d7f2f4e-0000-4000-8000-000000000001',
      surface: 'Monetization',
      setId: 'set-1',
      position: 0,
    });
    expect(isAcceptableTargetType('MonetizationOffer')).toBe(true);
  });

  it('an empty list is an answer, not a failure', async () => {
    mock.onGet('/recommendations/monetization').reply(200, { data: [] });
    await expect(fetchMonetizationRecommendations()).resolves.toEqual([]);
  });

  it('dismisses through the ordinary feedback route', async () => {
    let body: Record<string, unknown> = {};
    mock.onPost('/recommendations/dismiss').reply((config) => {
      body = JSON.parse(config.data);
      return [200, { data: { wasRecorded: true } }];
    });

    await recordDismiss({
      targetType: 'MonetizationOffer',
      targetId: 'offer-1',
      surface: 'Monetization',
      setId: 'set-1',
      position: 2,
    });

    expect(body).toMatchObject({
      targetType: 'MonetizationOffer',
      targetId: 'offer-1',
      surface: 'Monetization',
      setId: 'set-1',
      position: 2,
    });
  });

  it("reads my gifts to a campaign from the served route, B15's record unchanged", async () => {
    const donation = {
      donationId: 'd-1',
      isAnonymous: false,
      beneficiaryType: 'Cause',
      causeCode: 'clinic-roof',
      amount: { amount: 10, currency: 'GBP', minorUnits: 1000, exponent: 2, symbol: '£' },
      status: 'Completed',
      receiptReference: 'R-1',
      createdAt: '2026-10-19T10:00:00Z',
      completedAt: '2026-10-19T10:01:00Z',
    };
    mock.onGet('/communities/campaigns/k-1/donations/me').reply(200, {
      data: [{ donation, campaignId: 'k-1', campaignTitle: 'Clinic roof', status: 'Completed' }],
    });

    const gifts = await fetchMyCampaignDonations('k-1');

    expect(gifts).toHaveLength(1);
    expect(gifts[0].donation).toEqual(donation);
    expect(gifts[0].campaignTitle).toBe('Clinic roof');
    expect(gifts[0].status).toBe('Completed');
  });

  it('a 404 is a failure, never "you have not given"', async () => {
    mock.onGet('/communities/campaigns/k-2/donations/me').reply(404, { status: 404 });
    await expect(fetchMyCampaignDonations('k-2')).rejects.toMatchObject({ httpStatus: 404 });
  });
});
