// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator instrumentation tests (Frontend Phase 7, §40)
//
// §40 forbids sending payment credentials, private information, sensitive
// identity data or raw financial figures in an analytics event. That is a rule
// nobody can enforce by reading forty call sites, so it is enforced by an
// allow-list at the emit boundary — and these tests are what keep the
// allow-list honest.
//
// The most important test in this file is the last one: it walks
// `ALLOWED_PROPERTIES` looking for anything that names a person or an amount.
// A future contributor adding `userId` to make a funnel easier fails here
// rather than in a privacy review.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bucketAmount,
  bucketPoints,
  drainCreatorEvents,
  peekCreatorEvents,
  resetCreatorEvents,
  sanitise,
  trackCreatorEvent,
} from '../creator-analytics';
import { fromMinorUnits } from '../money';

beforeEach(() => {
  resetCreatorEvents();
});

describe('the allow-list drops anything it was not asked for', () => {
  it('keeps the permitted keys', () => {
    const { safe, dropped } = sanitise({
      courseId: 'course-1',
      challengeId: 'challenge-2',
      period: '30d',
      passed: true,
      correctCount: 3,
    });

    expect(safe).toEqual({
      courseId: 'course-1',
      challengeId: 'challenge-2',
      period: '30d',
      passed: true,
      correctCount: 3,
    });
    expect(dropped).toHaveLength(0);
  });

  it('drops anything that identifies a person', () => {
    const { safe, dropped } = sanitise({
      courseId: 'course-1',
      userId: 'user-1',
      email: 'somebody@example.com',
      displayName: 'Amara Kone',
      handle: 'amarak',
      phone: '+447700900000',
    });

    expect(safe).toEqual({ courseId: 'course-1' });
    expect(dropped.sort()).toEqual(['displayName', 'email', 'handle', 'phone', 'userId']);
  });

  it('drops a raw financial figure even when the key looks innocuous', () => {
    const { safe, dropped } = sanitise({
      currency: 'GBP',
      amount: 1250,
      balance: 42_000,
      minorUnits: 1250,
      paymentIntentId: 'pi-abc',
    });

    // The currency survives — it is not sensitive and it is useful. The
    // figures do not.
    expect(safe).toEqual({ currency: 'GBP' });
    expect(dropped.sort()).toEqual(['amount', 'balance', 'minorUnits', 'paymentIntentId']);
  });

  it('drops a referral code, because a code identifies a person', () => {
    const { safe } = sanitise({ code: 'AMARA-LDN', surface: 'referrals' });

    expect(safe).toEqual({ surface: 'referrals' });
  });

  it('refuses a nested object outright rather than serialising it', () => {
    // The usual way a whole DTO with an email address in it reaches a
    // telemetry payload.
    const { safe, dropped } = sanitise({
      courseId: { id: 'course-1', owner: { email: 'somebody@example.com' } },
      contentType: 'Guide',
    });

    expect(safe).toEqual({ contentType: 'Guide' });
    expect(dropped).toContain('courseId');
  });

  it('refuses an array', () => {
    const { safe } = sanitise({ category: ['a', 'b'], period: '7d' });

    expect(safe).toEqual({ period: '7d' });
  });

  it('refuses a long string, which is how free text arrives', () => {
    const { safe } = sanitise({ reason: 'x'.repeat(200), period: '7d' });

    expect(safe).toEqual({ period: '7d' });
  });

  it('ignores null and undefined without reporting them as dropped', () => {
    const { safe, dropped } = sanitise({ courseId: 'course-1', category: null, level: undefined });

    expect(safe).toEqual({ courseId: 'course-1' });
    expect(dropped).toHaveLength(0);
  });

  it('handles no properties at all', () => {
    expect(sanitise(undefined)).toEqual({ safe: {}, dropped: [] });
  });
});

describe('amounts and points are reduced to a band', () => {
  it('reports a currency and an order of magnitude, never a figure', () => {
    expect(bucketAmount(fromMinorUnits(1_250, 'GBP', 2, '£'))).toEqual({
      currency: 'GBP',
      amountBucket: '10-100',
    });
    expect(bucketAmount(fromMinorUnits(50, 'GBP', 2, '£'))).toEqual({
      currency: 'GBP',
      amountBucket: '<1',
    });
    expect(bucketAmount(fromMinorUnits(0, 'GBP', 2, '£'))).toEqual({
      currency: 'GBP',
      amountBucket: '0',
    });
    expect(bucketAmount(fromMinorUnits(1_500_000, 'GBP', 2, '£'))).toEqual({
      currency: 'GBP',
      amountBucket: '10k+',
    });
  });

  it('derives the band from minorUnits rather than from the display amount', () => {
    // A zero-exponent currency. Bucketing off `amount` would land it in the
    // wrong band, which is the same class of bug `money.ts` exists to prevent.
    const yen = fromMinorUnits(5_000, 'JPY', 0, '¥');

    expect(bucketAmount(yen)).toEqual({ currency: 'JPY', amountBucket: '1k-10k' });
  });

  it('returns nothing for an absent amount', () => {
    expect(bucketAmount(null)).toBeNull();
    expect(bucketAmount(undefined)).toBeNull();
  });

  it('bands points separately from money', () => {
    expect(bucketPoints(250)).toEqual({ pointsBucket: '100-500' });
    expect(bucketPoints(0)).toEqual({ pointsBucket: '0' });
    expect(bucketPoints(9_000)).toEqual({ pointsBucket: '5k+' });
    expect(bucketPoints(Number.NaN)).toBeNull();
  });
});

describe('emitting an event', () => {
  it('records the event, its safe properties and when it happened', () => {
    trackCreatorEvent('creator.dashboard.viewed', { surface: 'dashboard' });

    const events = peekCreatorEvents();

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('creator.dashboard.viewed');
    expect(events[0].properties).toEqual({ surface: 'dashboard' });
    expect(events[0].occurredAt).toBeTruthy();
  });

  it('applies the allow-list at emit rather than trusting the call site', () => {
    trackCreatorEvent('creator.referral.shared', {
      method: 'share_sheet',
      code: 'AMARA-LDN',
      userId: 'user-1',
    });

    expect(peekCreatorEvents()[0].properties).toEqual({ method: 'share_sheet' });
  });

  it('never throws, whatever it is handed', () => {
    expect(() => trackCreatorEvent('creator.dashboard.viewed', undefined)).not.toThrow();
    expect(() =>
      trackCreatorEvent('creator.dashboard.viewed', { weird: Symbol('x') as never })
    ).not.toThrow();
  });

  it('drains the buffer', () => {
    trackCreatorEvent('creator.rewards.viewed');
    trackCreatorEvent('creator.milestones.viewed');

    expect(drainCreatorEvents()).toHaveLength(2);
    expect(peekCreatorEvents()).toHaveLength(0);
  });

  it('bounds the buffer rather than growing without limit', () => {
    // There is nowhere to send events yet, so the buffer must not become a
    // slow memory leak in a long session.
    for (let index = 0; index < 500; index += 1) {
      trackCreatorEvent('creator.dashboard.viewed');
    }

    expect(peekCreatorEvents().length).toBeLessThanOrEqual(200);
  });
});

describe('the allow-list itself contains nothing sensitive', () => {
  it('admits no key that names a person, an amount or a credential', () => {
    // This is the test that survives a future contributor adding a key to make
    // a funnel easier. It reads the list through `sanitise` rather than
    // importing the private constant, so it tests behaviour rather than shape.
    const forbidden = [
      'userId', 'creatorId', 'email', 'phone', 'displayName', 'handle', 'name',
      'code', 'token', 'password', 'secret', 'apiKey', 'cardNumber',
      'amount', 'balance', 'minorUnits', 'price', 'total', 'points',
      'paymentIntentId', 'walletId', 'transactionId', 'accountNumber',
      'documentId', 'evidenceId', 'address', 'query', 'searchTerm', 'text', 'note',
    ];

    const probe = Object.fromEntries(forbidden.map((key) => [key, 'value']));
    const { safe } = sanitise(probe);

    expect(Object.keys(safe)).toEqual([]);
  });
});
