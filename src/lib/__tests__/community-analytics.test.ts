/**
 * Community Life instrumentation — Frontend Phase 12
 *
 * §48 forbids capturing payment credentials, private donor information,
 * sensitive identity information and authentication secrets.
 *
 * The allow-list is the enforcement. These tests assert it holds against the
 * things a screen might plausibly try to send — a donor's name, a message
 * somebody wrote, a raw amount, a membership identifier that resolves to a
 * person — and that the safe reductions (`bucketAmount`, `bucketProgress`) do
 * not leak the value they are supposed to be hiding.
 */

import {
  bucketAmount,
  bucketProgress,
  moneyProps,
  trackCommunityEvent,
} from '../community-analytics';
import { drainCreatorEvents, peekCreatorEvents, resetCreatorEvents } from '../creator-analytics';
import { money } from '@/mocks/financial-data';

beforeEach(() => {
  resetCreatorEvents();
});

describe('the shared buffer', () => {
  it('records a community event', () => {
    trackCommunityEvent('community.life.viewed', { surface: 'hub' });

    const records = peekCreatorEvents();
    expect(records).toHaveLength(1);
    expect(records[0].event).toBe('community.life.viewed');
    expect(records[0].properties).toEqual({ surface: 'hub' });
    expect(records[0].occurredAt).toBeTruthy();
  });

  it('shares one buffer with the creator surface rather than opening a second', () => {
    trackCommunityEvent('community.poll.voted', { pollId: 'poll-1' });
    trackCommunityEvent('community.donation.completed', { campaignId: 'camp-1' });

    expect(drainCreatorEvents()).toHaveLength(2);
    expect(peekCreatorEvents()).toHaveLength(0);
  });

  it('never throws, whatever it is handed', () => {
    expect(() =>
      trackCommunityEvent('community.life.viewed', {
        weird: Symbol('x') as never,
        nested: { deep: { deeper: true } } as never,
        cyclic: (() => {
          const object: Record<string, unknown> = {};
          object.self = object;
          return object;
        })() as never,
      })
    ).not.toThrow();
  });
});

describe('the allow-list — §48', () => {
  it('keeps the Phase 12 identifiers it registered', () => {
    trackCommunityEvent('community.membership.viewed', {
      organizationId: 'org-1',
      tierId: 'tier-1',
      campaignId: 'camp-1',
      seriesId: 'ser-1',
      occurrenceId: 'occ-1',
      opportunityId: 'opp-1',
      pollId: 'poll-1',
      neighborhoodId: 'nbh-1',
    });

    const properties = peekCreatorEvents()[0].properties;
    expect(properties.organizationId).toBe('org-1');
    expect(properties.pollId).toBe('poll-1');
    expect(properties.neighborhoodId).toBe('nbh-1');
  });

  it('DROPS anything that identifies a person', () => {
    trackCommunityEvent('community.donation.completed', {
      campaignId: 'camp-1',
      // Every one of these is forbidden by §48 and none is registered.
      userId: 'user-123',
      donorName: 'Ngozi Eze',
      email: 'someone@example.com',
      phone: '+447700900000',
      membershipId: 'mem-1',
      donationId: 'don-1',
      applicationId: 'app-1',
      receiptReference: 'RCP-12345678',
    });

    const properties = peekCreatorEvents()[0].properties;

    expect(properties.campaignId).toBe('camp-1');
    for (const forbidden of [
      'userId',
      'donorName',
      'email',
      'phone',
      'membershipId',
      'donationId',
      'applicationId',
      'receiptReference',
    ]) {
      expect(properties).not.toHaveProperty(forbidden);
    }
  });

  it('DROPS free text somebody wrote', () => {
    trackCommunityEvent('community.donation.completed', {
      campaignId: 'camp-1',
      message: 'Rest well, Uncle Sam.',
      openResponse: 'More jollof, less pasta.',
      answers: 'I grew up speaking Yoruba.',
      optionLabel: 'Saturday 3 October',
    });

    const properties = peekCreatorEvents()[0].properties;
    expect(Object.keys(properties)).toEqual(['campaignId']);
  });

  it('DROPS a raw financial figure', () => {
    trackCommunityEvent('community.donation.completed', {
      campaignId: 'camp-1',
      amount: 2500,
      balance: 14750,
      raised: 215000,
      target: 400000,
      // Only the bucketed form is allowed.
      currency: 'GBP',
      amountBucket: '10-100',
    });

    const properties = peekCreatorEvents()[0].properties;
    expect(properties.currency).toBe('GBP');
    expect(properties.amountBucket).toBe('10-100');
    for (const forbidden of ['amount', 'balance', 'raised', 'target']) {
      expect(properties).not.toHaveProperty(forbidden);
    }
  });

  it('DROPS an authentication secret even if a call site somehow had one', () => {
    trackCommunityEvent('community.life.viewed', {
      surface: 'hub',
      accessToken: 'eyJhbGciOi…',
      idempotencyKey: 'abcd-1234',
      paymentIntentId: 'pi_123',
    });

    expect(Object.keys(peekCreatorEvents()[0].properties)).toEqual(['surface']);
  });

  it('drops a very long string even on an allowed key', () => {
    // A 64-character ceiling stops an allowed key becoming a channel for free
    // text somebody pasted into a filter box.
    trackCommunityEvent('community.search.performed', {
      hasQuery: true,
      category: 'x'.repeat(200),
    });

    const properties = peekCreatorEvents()[0].properties;
    expect(properties.hasQuery).toBe(true);
    expect(properties).not.toHaveProperty('category');
  });

  it('drops a nested object rather than serialising it', () => {
    // The usual way a whole DTO — with an email in it — reaches telemetry.
    trackCommunityEvent('community.membership.viewed', {
      organizationId: 'org-1',
      programme: { organizationName: 'X', memberCount: 5 } as never,
    });

    expect(Object.keys(peekCreatorEvents()[0].properties)).toEqual(['organizationId']);
  });
});

describe('bucketAmount', () => {
  it('reduces an amount to a band and its currency', () => {
    expect(bucketAmount(money(2500, 'GBP'))).toEqual({ currency: 'GBP', amountBucket: '10-100' });
    expect(bucketAmount(money(50, 'GBP'))).toEqual({ currency: 'GBP', amountBucket: '<1' });
    expect(bucketAmount(money(0, 'GBP'))).toEqual({ currency: 'GBP', amountBucket: '0' });
    expect(bucketAmount(money(150000000, 'GBP'))).toEqual({
      currency: 'GBP',
      amountBucket: '10k+',
    });
  });

  it('returns nothing for a missing amount', () => {
    expect(bucketAmount(null)).toBeNull();
    expect(bucketAmount(undefined)).toBeNull();
  });

  it('does not leak the exact figure through the band', () => {
    // Two different amounts in the same band must be indistinguishable.
    expect(bucketAmount(money(1100, 'GBP'))).toEqual(bucketAmount(money(9900, 'GBP')));
  });

  it('respects a currency exponent rather than assuming two', () => {
    // ¥5,000 is 5000 minor units at exponent 0, not 50.
    expect(bucketAmount(money(5000, 'JPY'))).toEqual({ currency: 'JPY', amountBucket: '1k-10k' });
  });
});

describe('bucketProgress', () => {
  it('reduces a percentage to a band', () => {
    expect(bucketProgress(0)).toEqual({ progressBucket: '0' });
    expect(bucketProgress(13)).toEqual({ progressBucket: '0-25' });
    expect(bucketProgress(54)).toEqual({ progressBucket: '50-75' });
    expect(bucketProgress(99)).toEqual({ progressBucket: '75-100' });
    expect(bucketProgress(100)).toEqual({ progressBucket: '100+' });
  });

  it('clamps rather than inventing a band', () => {
    expect(bucketProgress(-5)).toEqual({ progressBucket: '0' });
    expect(bucketProgress(400)).toEqual({ progressBucket: '100+' });
  });

  it('returns nothing for a missing percentage', () => {
    expect(bucketProgress(null)).toBeNull();
    expect(bucketProgress(undefined)).toBeNull();
    expect(bucketProgress(Number.NaN)).toBeNull();
  });

  it('stops a campaign total being reconstructed from telemetry', () => {
    // A raw percentage plus a campaign id and a known target is the running
    // total by another route. Two different percentages in one band must be
    // indistinguishable.
    expect(bucketProgress(51)).toEqual(bucketProgress(74));
  });
});

describe('moneyProps', () => {
  it('spreads into a safe pair of properties', () => {
    expect(moneyProps(money(2500, 'GBP'))).toEqual({ currency: 'GBP', amountBucket: '10-100' });
  });

  it('spreads into nothing when there is no amount', () => {
    expect(moneyProps(null)).toEqual({});
  });

  it('survives the allow-list intact', () => {
    trackCommunityEvent('community.membership.payment.started', {
      organizationId: 'org-1',
      ...moneyProps(money(2500, 'GBP')),
    });

    expect(peekCreatorEvents()[0].properties).toEqual({
      organizationId: 'org-1',
      currency: 'GBP',
      amountBucket: '10-100',
    });
  });
});
