/**
 * The community gap boundary — Frontend Phase 12
 *
 * Three mechanisms keep a simulated capability from being mistaken for a real
 * one (`config/community-gaps.ts`), and these tests assert all three plus the
 * property specific to this phase:
 *
 *   1. A different URL space. Every simulated route is under
 *      `/community-gap/v0`, never `/community-life` (B12 owns that, and its
 *      routes are real) and never `/financial` (B15 owns that, and its routes
 *      move money).
 *   2. A visible marker. Every gap has an id, a title and a proposed contract,
 *      so the notice can name what is missing.
 *   3. A single switch. Every function in the adapter refuses when gaps are
 *      disabled, so a release binary contains no path to a simulated
 *      membership approval or an invented fundraising total.
 *
 *   4. **This phase's rule: the adapter never moves money.** No function in
 *      `community-gap-api.ts` may create a donation, a payment intent or a
 *      contribution. Those go to `financial-api.ts` and land on real B15
 *      routes, and this is asserted structurally rather than by reading it.
 */

import * as gapApi from '../community-gap-api';
import {
  COMMUNITY_GAPS,
  COMMUNITY_GAP_LIST,
  COMMUNITY_GAP_PREFIX,
  areCommunityGapsEnabled,
  getCommunityGap,
} from '@/config/community-gaps';
import { FinancialError } from '../financial-errors';

describe('the gap register', () => {
  it('gives every gap a stable identifier in the documented format', () => {
    for (const gap of COMMUNITY_GAP_LIST) {
      expect(gap.id).toMatch(/^COMMUNITY-LIFE-GAP-\d{3}$/);
    }
  });

  it('has no duplicate identifiers', () => {
    const ids = COMMUNITY_GAP_LIST.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keys every gap consistently with its own `key` field', () => {
    for (const [key, gap] of Object.entries(COMMUNITY_GAPS)) {
      expect(gap.key).toBe(key);
    }
  });

  it('gives every gap something a notice can render', () => {
    for (const gap of COMMUNITY_GAP_LIST) {
      expect(gap.title.length).toBeGreaterThan(0);
      expect(gap.feature.length).toBeGreaterThan(0);
      expect(gap.frontendBehaviour.length).toBeGreaterThan(0);
      expect(gap.whyNotImplementable.length).toBeGreaterThan(0);
    }
  });

  it('proposes at least one concrete contract for every gap', () => {
    // §43: every backend gap contains a proposed contract. A gap with an empty
    // list is a complaint rather than a specification.
    for (const gap of COMMUNITY_GAP_LIST) {
      expect(gap.missingContract.length).toBeGreaterThan(0);
      for (const line of gap.missingContract) {
        expect(line.length).toBeGreaterThan(10);
      }
    }
  });

  it('names existing seams so a later phase does not rebuild them', () => {
    for (const gap of COMMUNITY_GAP_LIST) {
      expect(gap.existingSeams.length).toBeGreaterThan(0);
    }
  });

  it('classifies coverage honestly', () => {
    // A gap marked `partial` must name the certified thing it partly rests on.
    const partial = COMMUNITY_GAP_LIST.filter((gap) => gap.coverage === 'partial');
    expect(partial.length).toBeGreaterThan(0);
    for (const gap of partial) {
      expect(gap.existingSeams.join(' ')).toMatch(/B12|B13|B14|B15|Phase|financial|community-life/i);
    }
  });

  it('assigns every gap an owner and a recommended phase', () => {
    for (const gap of COMMUNITY_GAP_LIST) {
      expect(gap.owner.length).toBeGreaterThan(0);
      expect(gap.recommendedPhase.length).toBeGreaterThan(0);
      expect(['critical', 'high', 'medium', 'low']).toContain(gap.priority);
    }
  });

  it('marks the financial gaps as financial', () => {
    // Every gap that decides or is decided by money, so the financial
    // integration document can enumerate them without a reader guessing.
    const financial = COMMUNITY_GAP_LIST.filter((gap) => gap.isFinancial).map((gap) => gap.key);
    expect(financial).toEqual(
      expect.arrayContaining([
        'membershipCatalogue',
        'membershipPayment',
        'fundraisingCampaign',
        'campaignTransparency',
        'recurringDonation',
        'communityIdempotency',
      ])
    );
  });

  it('looks a gap up by key and returns nothing for an unknown one', () => {
    expect(getCommunityGap('membershipCatalogue')?.id).toBe('COMMUNITY-LIFE-GAP-001');
    expect(getCommunityGap('not-a-real-gap')).toBeUndefined();
  });
});

describe('the URL space', () => {
  it('is versioned and separate from every certified route', () => {
    expect(COMMUNITY_GAP_PREFIX).toBe('/community-gap/v0');
    // Never B12's namespace: those routes are real.
    expect(COMMUNITY_GAP_PREFIX.startsWith('/community-life')).toBe(false);
    // Never B15's: those routes move money.
    expect(COMMUNITY_GAP_PREFIX.startsWith('/financial')).toBe(false);
    // Never another phase's simulation space.
    expect(COMMUNITY_GAP_PREFIX).not.toBe('/financial-gap/v0');
    expect(COMMUNITY_GAP_PREFIX).not.toBe('/monetization-gap/v0');
    expect(COMMUNITY_GAP_PREFIX).not.toBe('/creator-gap/v0');
  });
});

describe('the switch', () => {
  const originalDev = global.__DEV__;

  afterEach(() => {
    global.__DEV__ = originalDev;
  });

  it('is on in a development build', () => {
    global.__DEV__ = true;
    expect(areCommunityGapsEnabled()).toBe(true);
  });

  it('is off in a release build', () => {
    global.__DEV__ = false;
    expect(areCommunityGapsEnabled()).toBe(false);
  });

  /**
   * The important one.
   *
   * Every exported read and write in the adapter is called with a release build
   * flag set, and every one must refuse *before making a request*. A function
   * that forgot `assertEnabled` would resolve or produce a network error here
   * rather than throwing a `FinancialError` — and would be a path by which a
   * release binary reached a simulated membership approval.
   */
  it('refuses every adapter call in a release build', async () => {
    global.__DEV__ = false;

    // Registration is the platform RSVP since 20 Oct 2026: real, not refused.
    const REAL = new Set(['registerForEvent', 'cancelRegistration', 'fetchMyRegistrations']);
    const callables = Object.entries(gapApi).filter(
      ([name, value]) => typeof value === 'function' && name !== 'communityGapKeys' && !REAL.has(name)
    ) as [string, (...args: unknown[]) => unknown][];

    // A sanity floor: if the adapter's exports were renamed away, this test
    // would silently pass over an empty list.
    expect(callables.length).toBeGreaterThan(45);

    for (const [name, fn] of callables) {
      // Arguments are deliberately junk. A refusal must happen before any of
      // them is used, so the shape does not matter.
      const call = () =>
        (fn as (...args: unknown[]) => Promise<unknown>)(
          'x',
          'y',
          { pollId: 'x', organizationId: 'x', opportunityId: 'x', title: 'x' },
          {}
        );

      await expect(call()).rejects.toBeInstanceOf(FinancialError);

      try {
        await call();
      } catch (error) {
        const financial = error as FinancialError;
        expect(financial.kind).toBe('unavailable');
        expect(String(financial.code).startsWith('frontend.community-gap.')).toBe(true);
        // A refusal is terminal and not retryable: retrying a capability that
        // does not exist produces the same answer more slowly.
        expect(financial.isTerminal).toBe(true);
        expect(financial.isRetryable).toBe(false);
        expect(financial.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the adapter never moves money', () => {
  /**
   * §38 and §58.13–14: no second wallet, no second payment system.
   *
   * Asserted structurally: the adapter's export surface must contain no
   * function whose name implies it creates a payment, a donation or a
   * contribution. Those three verbs belong to `financial-api.ts` alone.
   *
   * `attachMembershipPayment` and `attachCampaignDonation` are deliberately
   * named `attach…`: they take an identifier for money that has *already*
   * moved through B15 and record the community-side link. They create nothing.
   */
  it('exports no function that creates a payment, donation or contribution', () => {
    const forbidden = [
      /^createDonation/,
      /^createPayment/,
      /^createContribution/,
      /^capturePayment/,
      /^authorizePayment/,
      /^refund/,
      /Wallet$/,
      /^fetchWallet/,
    ];

    const names = Object.keys(gapApi);

    for (const pattern of forbidden) {
      const offenders = names.filter((name) => pattern.test(name));
      expect(offenders).toEqual([]);
    }
  });

  it('names its two money-adjacent functions as attachments, not creations', () => {
    expect(typeof gapApi.attachMembershipPayment).toBe('function');
    expect(typeof gapApi.attachCampaignDonation).toBe('function');
  });
});

describe('query keys', () => {
  it('namespaces every key under community-gap', () => {
    const keys = gapApi.communityGapKeys;

    // `readonly` on both axes: the key factories return `as const` tuples, and
    // TanStack Query keys are meant to stay immutable.
    const samples: readonly (readonly unknown[])[] = [
      keys.all,
      keys.hub('GB', 'London'),
      keys.programme('org-1'),
      keys.myMemberships(),
      keys.membership('mem-1'),
      keys.series('ser-1'),
      keys.occurrences('ser-1'),
      keys.campaign('camp-1'),
      keys.opportunity('opp-1'),
      keys.poll('poll-1'),
      keys.pollResult('poll-1'),
      keys.dashboard('org-1'),
      keys.impact('member', 'me', '12m'),
      keys.recommendations('hub'),
      keys.search('q'),
    ];

    for (const key of samples) {
      expect(key[0]).toBe('community-gap');
    }
  });

  it('does not collide with the certified B12 or B15 namespaces', () => {
    expect(gapApi.communityGapKeys.all[0]).not.toBe('community-life');
    expect(gapApi.communityGapKeys.all[0]).not.toBe('financial');
  });
});
