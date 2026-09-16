/**
 * An owner dashboard with nothing to be about — 16 Sep 2026.
 *
 * Tapping through Phase 6 as a member who has never listed a home: Letting
 * rendered "Views 0 · Unique viewers 0 · Viewings 0 · Enquiries 0", "PARTLY
 * AVAILABLE", and a note about UTC. Nothing on the screen said she had no
 * homes, and a member reading it would conclude nobody had looked at hers.
 *
 * Analytics cannot tell the difference — no homes and a quiet month both sum to
 * nought — so the dashboard asks the module that owns the thing. These tests
 * pin the three answers, and especially the third: a read that failed must
 * leave the figures alone rather than claim the member has nothing.
 */
import {
  holdingsFromFailure,
  holdsAnything,
  OWNER_HOLDINGS_EMPTY,
  OWNER_HOLDINGS_ROUTE,
  type OwnerRole,
} from '../analytics/owner-holdings';

const ROLES: OwnerRole[] = ['landlord', 'seller', 'provider', 'employer'];

describe('what the platform holds for this member', () => {
  it('reads a cursor page of listings, as housing and marketplace answer', () => {
    const page = { data: { items: [{ id: 'a' }], nextCursor: null, hasMore: false } };

    expect(holdsAnything('landlord', page)).toBe(true);
    expect(holdsAnything('seller', page)).toBe(true);
    expect(holdsAnything('landlord', { data: { items: [], hasMore: false } })).toBe(false);
  });

  it('reads the bare array `/providers/me` answers', () => {
    expect(holdsAnything('provider', { data: [{ providerId: 'p1' }] })).toBe(true);
    expect(holdsAnything('provider', { data: [] })).toBe(false);
  });

  it('counts an employer’s jobs in every state, so a closed-only employer still has figures', () => {
    const dashboard = (counts: Record<string, number>) => ({ data: { ...counts } });

    expect(holdsAnything('employer', dashboard({ openCount: 1 }))).toBe(true);
    expect(holdsAnything('employer', dashboard({ closedCount: 2 }))).toBe(true);
    expect(holdsAnything('employer', dashboard({ draftCount: 1 }))).toBe(true);
    expect(holdsAnything('employer', dashboard({ filledCount: 3 }))).toBe(true);
    expect(
      holdsAnything(
        'employer',
        dashboard({ draftCount: 0, openCount: 0, closedCount: 0, filledCount: 0 })
      )
    ).toBe(false);
    // An employer profile with no counters at all is not evidence of jobs.
    expect(holdsAnything('employer', { data: { employerName: 'Mensah' } })).toBe(false);
  });
});

describe('what a failed read established', () => {
  it('is "you hold none" only for the refusals that mean it', () => {
    // Housing refuses `/housing/listings/mine` without a landlord profile;
    // Jobs refuses the employer dashboard the same way.
    expect(holdingsFromFailure({ response: { status: 403 } })).toBe(false);
    expect(holdingsFromFailure({ response: { status: 404 } })).toBe(false);
  });

  it('is nothing at all for a failure that answered nothing', () => {
    expect(holdingsFromFailure(new Error('Network Error'))).toBeNull();
    expect(holdingsFromFailure({ response: { status: 500 } })).toBeNull();
    // A lapsed session is not proof that a landlord has no homes.
    expect(holdingsFromFailure({ response: { status: 401 } })).toBeNull();
    expect(holdingsFromFailure(undefined)).toBeNull();
  });
});

describe('what an empty dashboard says', () => {
  it('names the thing, the figures it would carry, and where to start one', () => {
    expect(OWNER_HOLDINGS_EMPTY.landlord).toEqual({
      title: 'You have not listed a home yet',
      body: 'When you list one, the views, viewings and enquiries it gets are counted here.',
      actionLabel: 'List a home',
      actionHref: '/housing/create',
    });

    for (const role of ROLES) {
      const empty = OWNER_HOLDINGS_EMPTY[role];

      expect(empty.title).toMatch(/^You have not /);
      expect(empty.body).toMatch(/counted here\.$/);
      expect(empty.actionHref.startsWith('/')).toBe(true);
      // Never "no data" or "nothing happened", which is what it used to imply.
      expect(empty.body).not.toMatch(/no data|nothing happened/i);
    }
  });

  it('asks each module for its own things, never analytics for its rollups', () => {
    expect(OWNER_HOLDINGS_ROUTE).toEqual({
      landlord: '/housing/listings/mine',
      seller: '/marketplace/listings/mine',
      provider: '/providers/me',
      employer: '/jobs/employers/dashboard',
    });

    for (const role of ROLES) {
      expect(OWNER_HOLDINGS_ROUTE[role]).not.toMatch(/\/analytics\//);
    }
  });
});

describe('where it is used', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

  it('is wired into all four dashboards that are about a member’s own things', () => {
    for (const role of ROLES) {
      const screen = read('src', 'app', 'analytics', `${role}.tsx`);

      expect(screen).toContain(`useOwnerHoldings('${role}')`);
      expect(screen).toContain(`OWNER_HOLDINGS_EMPTY.${role}`);
    }
  });

  it('replaces the figures only on a definite "none"', () => {
    const dashboard = read('src', 'components', 'analytics', 'SubjectDashboard.tsx');

    expect(dashboard).toContain('holdings?.hasAny === false');
    // Not `!holdings?.hasAny`, which would swallow the unknown answer and tell a
    // landlord with homes that they have none whenever the ask failed.
    expect(dashboard).not.toMatch(/!holdings\?\.hasAny/);
  });
});
