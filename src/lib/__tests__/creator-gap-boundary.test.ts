// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator gap boundary tests (Frontend Phase 7)
//
// §17, §18 and §34: a development adapter must never be mistakeable for
// production support, and no simulated capability may be presented as real.
//
// Five guarantees are asserted here, because all five are the kind of thing
// that silently stops being true:
//
//   1. No simulated route shares a certified prefix, or either earlier phase's.
//   2. A release build registers no simulated creator routes at all.
//   3. A release build's gap API refuses before touching the network.
//   4. Every registered gap is complete enough for a backend team to act on.
//   5. The three gap registers do not collide on an identifier.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupCreatorEconomyMocks } from '@/mocks/handlers/creator-economy';
import {
  CREATOR_GAPS,
  CREATOR_GAP_PREFIX,
  areCreatorGapsEnabled,
  listCreatorGaps,
} from '@/config/creator-gaps';
import { GAP_ROUTE_PREFIX } from '@/config/financial-gaps';
import { MONETIZATION_GAPS, MONETIZATION_GAP_PREFIX } from '@/config/monetization-gaps';
import * as gapApi from '../creator-gap-api';
import { FinancialError } from '../financial-errors';

/**
 * `MockAdapter.handlers` is not on the published typings, but it is the only
 * way to assert *which* routes were registered — the property under test.
 */
interface RegisteredHandler {
  url: string | RegExp;
}

type InspectableMock = MockAdapter & {
  handlers: Record<'get' | 'post' | 'put' | 'delete', RegisteredHandler[]>;
};

/**
 * Every registered route, as a comparable string.
 *
 * A `RegExp` matcher stringifies with its slashes escaped —
 * `/\/creator-gap\/v0\/…/` — so the backslashes are stripped before comparing.
 * Doing that here rather than in each assertion keeps the assertions readable
 * and keeps the normalisation in one place where it is visible.
 */
function registeredRoutes(mock: InspectableMock): string[] {
  return [
    ...mock.handlers.get,
    ...mock.handlers.post,
    ...mock.handlers.put,
    ...mock.handlers.delete,
  ].map((handler) => String(handler.url).replace(/\\/g, ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · The URL space cannot collide
// ─────────────────────────────────────────────────────────────────────────────

describe('the URL space cannot collide', () => {
  it('puts every simulated creator route behind a prefix no backend serves', () => {
    expect(CREATOR_GAP_PREFIX).toBe('/creator-gap/v0');
    expect(CREATOR_GAP_PREFIX.startsWith('/financial')).toBe(false);
    expect(CREATOR_GAP_PREFIX.startsWith('/trust')).toBe(false);
  });

  it('is not `/creator`, which the existing Creator Studio mocks already own', () => {
    // `setupCreatorMocks` registers `/creator/content`, `/creator/drafts` and
    // others. A gap route that sat under the same prefix would be
    // indistinguishable from one the platform is expected to grow.
    expect(CREATOR_GAP_PREFIX.startsWith('/creator/')).toBe(false);
  });

  it('does not collide with either earlier phase’s gap prefix', () => {
    expect(CREATOR_GAP_PREFIX).not.toBe(GAP_ROUTE_PREFIX);
    expect(CREATOR_GAP_PREFIX).not.toBe(MONETIZATION_GAP_PREFIX);
  });

  it('registers no route outside its own prefix', () => {
    const mock = new MockAdapter(apiClient) as InspectableMock;
    const teardown = setupCreatorEconomyMocks(mock);

    const routes = registeredRoutes(mock);
    expect(routes.length).toBeGreaterThan(20);

    for (const route of routes) {
      expect(route).toContain(CREATOR_GAP_PREFIX);
    }

    teardown();
    mock.restore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · A release build ships none of it
// ─────────────────────────────────────────────────────────────────────────────

describe('a release build ships no simulated creator capability', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it('reports gap features as unavailable when __DEV__ is false', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    expect(areCreatorGapsEnabled()).toBe(false);
  });

  it('registers no handler at all in a release build', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;

    const mock = new MockAdapter(apiClient) as InspectableMock;
    const teardown = setupCreatorEconomyMocks(mock);

    expect(registeredRoutes(mock)).toHaveLength(0);

    teardown();
    mock.restore();
  });

  it('refuses in the API layer before a request is made', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;

    // No mock adapter is installed. If the guard did not fire, this would
    // attempt a real network call — which is precisely the failure being
    // guarded against.
    await expect(gapApi.fetchCreatorProfile()).rejects.toBeInstanceOf(FinancialError);
    await expect(gapApi.fetchMilestones()).rejects.toBeInstanceOf(FinancialError);
    await expect(gapApi.claimMilestone('milestone-1')).rejects.toBeInstanceOf(FinancialError);
    await expect(gapApi.submitGrantApplication({
      grantId: 'grant-1',
      answers: {},
      attachmentIds: [],
      acceptedDeclarations: [],
    })).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses with a member-safe message rather than a stack trace', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;

    await expect(gapApi.fetchCreatorProfile()).rejects.toMatchObject({
      kind: 'unavailable',
      isRetryable: false,
      isTerminal: true,
      code: 'frontend.creator-gap.profile',
    });
  });

  it('never claims a write succeeded when the build cannot reach the adapter', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;

    // The dangerous failure mode: an acknowledgement that resolves and lets a
    // screen show points that were never awarded.
    await expect(gapApi.acknowledgeSignupBonus()).rejects.toBeInstanceOf(FinancialError);
    await expect(gapApi.redeemReward('reward-1')).rejects.toBeInstanceOf(FinancialError);
    await expect(gapApi.joinChallenge('challenge-1')).rejects.toBeInstanceOf(FinancialError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · The register is actionable
// ─────────────────────────────────────────────────────────────────────────────

describe('the gap register is complete enough to hand to a backend team', () => {
  const gaps = listCreatorGaps();

  it('registers the eighteen capabilities Phase 7 could not connect', () => {
    // Sixteen until `dashboardSummary` and `sponsorship` were split out of
    // `profile` and `analytics`. Both parents are connected and both carried a
    // capability that is not, and `backendStatus` is one boolean over a whole
    // key — so marking the parent connected silenced the notice for the half
    // that was missing, and those two screens rendered nothing at all.
    expect(gaps).toHaveLength(18);
  });

  it.each(gaps.map((gap) => [gap.id, gap] as const))(
    '%s carries everything a backend team needs',
    (_id, gap) => {
      expect(gap.id).toMatch(/^CREATOR-GAP-\d{3}$/);
      expect(gap.key.length).toBeGreaterThan(0);
      expect(gap.title.length).toBeGreaterThan(0);
      expect(gap.feature.length).toBeGreaterThan(0);

      // A gap without a described frontend behaviour is a gap nobody can review.
      expect(gap.frontendBehaviour.length).toBeGreaterThan(40);

      // Route-level, not hand-waving.
      expect(gap.missingContract.length).toBeGreaterThan(0);
      for (const contract of gap.missingContract) {
        expect(contract.length).toBeGreaterThan(10);
      }

      // What already exists, so a future phase does not rebuild it.
      expect(gap.existingSeams.length).toBeGreaterThan(0);

      // Why the frontend could not do it anyway. This is the field that stops a
      // gap being reopened as "why did you not just…".
      expect(gap.whyNotImplementable.length).toBeGreaterThan(60);

      expect(gap.owner.length).toBeGreaterThan(0);
      expect(gap.recommendedPhase.length).toBeGreaterThan(0);
    }
  );

  it('orders by priority so the register reads as a backlog', () => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;

    for (let index = 1; index < gaps.length; index += 1) {
      expect(rank[gaps[index].priority]).toBeGreaterThanOrEqual(rank[gaps[index - 1].priority]);
    }
  });

  it('gives every gap a unique id and a unique key', () => {
    expect(new Set(gaps.map((gap) => gap.id)).size).toBe(gaps.length);
    expect(new Set(gaps.map((gap) => gap.key)).size).toBe(gaps.length);
  });

  it('keys the register by the same key each gap declares', () => {
    for (const [key, gap] of Object.entries(CREATOR_GAPS)) {
      expect(gap.key).toBe(key);
    }
  });
});

describe('the three registers do not collide', () => {
  it('shares no gap identifier with Phase 6', () => {
    const creatorIds = new Set(Object.values(CREATOR_GAPS).map((gap) => gap.id));
    const monetizationIds = new Set(Object.values(MONETIZATION_GAPS).map((gap) => gap.id));

    for (const id of creatorIds) {
      expect(monetizationIds.has(id)).toBe(false);
    }
  });

  it('prefixes creator gaps distinctly from monetization ones', () => {
    for (const gap of Object.values(CREATOR_GAPS)) {
      expect(gap.id.startsWith('CREATOR-GAP-')).toBe(true);
    }
    for (const gap of Object.values(MONETIZATION_GAPS)) {
      expect(gap.id.startsWith('MON-GAP-')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Query keys stay namespaced
// ─────────────────────────────────────────────────────────────────────────────

describe('query keys are namespaced so a cache dump is unambiguous', () => {
  it('puts every creator gap key under its own root', () => {
    const keys = [
      gapApi.creatorGapKeys.dashboard(),
      gapApi.creatorGapKeys.profile(),
      gapApi.creatorGapKeys.milestones(),
      gapApi.creatorGapKeys.challenges(),
      gapApi.creatorGapKeys.grants(),
      gapApi.creatorGapKeys.courses(),
      gapApi.creatorGapKeys.analytics('30d'),
      gapApi.creatorGapKeys.revenueSummary(),
      gapApi.creatorGapKeys.referralProgramme(),
      gapApi.creatorGapKeys.signupBonus(),
      gapApi.creatorGapKeys.leaderboard('top-creators'),
      gapApi.creatorGapKeys.recommendations(),
      gapApi.creatorGapKeys.directory('none'),
      gapApi.creatorGapKeys.sponsored(),
    ];

    for (const key of keys) {
      expect(key[0]).toBe('creator-gap');
    }
  });

  it('keeps analytics keys distinct per period', () => {
    expect(gapApi.creatorGapKeys.analytics('7d')).not.toEqual(
      gapApi.creatorGapKeys.analytics('30d')
    );
  });
});
