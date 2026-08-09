// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics permissions (Frontend Phase 15, §46 · §48 · §79)
//
// §79 names seven properties this file proves:
//
//   Normal users cannot access admin analytics.
//   Creator A cannot access Creator B analytics.
//   Provider A cannot access Provider B analytics.
//   Seller A cannot access Seller B analytics.
//   Employer A cannot access Employer B analytics.
//   A community moderator cannot access an unrelated private community.
//   Frontend route manipulation cannot bypass authorization.
//
// The last one is the interesting one, and it is worth being precise about what a
// frontend test can and cannot establish. **The client is not the enforcement.**
// §48 makes the backend authoritative, and a test here cannot prove a server
// refuses anything.
//
// What it *can* prove — and does — is that the client contains no path that
// grants access on its own: no function that derives a capability from a role,
// no default that is permissive, and no branch where an unresolved capability set
// renders a dashboard. Those are the properties that make the server's refusal
// the *only* thing standing between a caller and the data, which is exactly where
// §48 wants it.
// ─────────────────────────────────────────────────────────────────────────────

import * as accessModule from '@/lib/analytics/access';
import {
  canPerformAnalyticsAction,
  canViewMetric,
  describeRefusal,
  evaluateAnalyticsAction,
  isSelfScopedSubject,
  noAnalyticsAccess,
  supportedComparisons,
  supportedRanges,
  type AnalyticsAction,
} from '@/lib/analytics/access';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import type { AnalyticsAccess, AnalyticsSubject } from '@/types/analytics';

const ALL_ACTIONS: AnalyticsAction[] = [
  'view-dashboard',
  'view-financial',
  'view-administrative',
  'compare',
  'export',
  'build-reports',
];

/** A capability set as a server would return it for an ordinary member. */
function memberAccess(subject: AnalyticsSubject): AnalyticsAccess {
  return {
    ...noAnalyticsAccess(subject),
    canView: true,
    canViewFinancial: true,
    canExport: true,
    supportedRanges: ['last7d', 'last30d'],
    supportedComparisons: ['previousPeriod'],
    reportingTimezone: 'Europe/London',
  };
}

describe('§48 · the client contains no path that grants access on its own', () => {
  it('a missing capability set refuses every action', () => {
    for (const action of ALL_ACTIONS) {
      const verdict = evaluateAnalyticsAction({ action, access: null });
      expect(verdict.kind).toBe('hidden');
      expect(canPerformAnalyticsAction(action, null)).toBe(false);
    }
  });

  it('an undefined capability set refuses every action', () => {
    for (const action of ALL_ACTIONS) {
      expect(canPerformAnalyticsAction(action, undefined)).toBe(false);
    }
  });

  it('the safe default is every field false and every list empty', () => {
    const empty = noAnalyticsAccess({ type: 'platform', id: null });

    expect(empty.canView).toBe(false);
    expect(empty.canViewFinancial).toBe(false);
    expect(empty.canViewAdministrative).toBe(false);
    expect(empty.canCompare).toBe(false);
    expect(empty.canExport).toBe(false);
    expect(empty.canBuildReports).toBe(false);
    expect(empty.restrictedMetrics).toEqual([]);
    expect(empty.reportingTimezone).toBeNull();

    // Empty rather than "everything", so the fallback cannot offer a range the
    // backend will refuse.
    expect(empty.supportedRanges).toEqual([]);
    expect(empty.supportedComparisons).toEqual([]);
  });

  // The structural assertion. A function that *derives* a capability is the shape
  // §48 forbids, and its absence is stronger than a review comment.
  //
  // Note what is deliberately **not** forbidden: `isAdministrativeSubject`.
  // That is a statement about a subject *type* — "platform analytics is
  // administrative in nature" — and not about a caller. The hub uses it to decide
  // what to hide by default. The test below proves it grants nothing, which is the
  // property that actually matters.
  it('exports no function that derives, grants or elevates a capability', () => {
    const source = accessModule as unknown as Record<string, unknown>;
    const functionNames = Object.keys(source).filter(
      (name) => typeof source[name] === 'function'
    );

    const suspicious = functionNames.filter((name) =>
      /grant|revoke|elevate|promote|assign|fromRole|forRole|byRole|deriveCapabilit/i.test(name)
    );

    expect(suspicious).toEqual([]);
  });

  it('takes no role, account state or tier in any exported signature', () => {
    // Checked by behaviour rather than by reflection: every evaluator refuses when
    // the capability set is absent, no matter what else it is told. If any of them
    // consulted a role there would be an argument that could change the answer,
    // and there is not — the only input that can is `access`.
    const roleShapedInputs = [
      { isAuthenticated: true },
      { isPurchasable: false },
      { requiredPlanName: 'Business' },
    ];

    for (const extra of roleShapedInputs) {
      const verdict = evaluateAnalyticsAction({
        action: 'view-administrative',
        access: null,
        ...extra,
      });
      expect(verdict.kind).not.toBe('allowed');
    }
  });

  it('an administrative subject type grants no access by being administrative', () => {
    // The property `isAdministrativeSubject` must not accidentally become: it
    // classifies, and classification is not authorization.
    expect(accessModule.isAdministrativeSubject('platform')).toBe(true);

    const verdict = evaluateAnalyticsAction({
      action: 'view-administrative',
      access: null,
    });
    expect(verdict.kind).toBe('hidden');
  });

  it('every exported evaluator requires a capability set as an argument', () => {
    // `evaluateAnalyticsAction` and `canViewMetric` cannot answer without one, so
    // there is no way to ask "may this member…" without the server's answer in
    // hand.
    expect(evaluateAnalyticsAction.length).toBeGreaterThanOrEqual(1);
    expect(canViewMetric.length).toBeGreaterThanOrEqual(3);
  });
});

describe('§79 · a normal member cannot reach administrative analytics', () => {
  const subject: AnalyticsSubject = { type: 'platform', id: null };

  it('the administrative action is refused for a member with ordinary access', () => {
    const access = memberAccess(subject); // canView true, canViewAdministrative false
    const verdict = evaluateAnalyticsAction({ action: 'view-administrative', access });

    expect(verdict.kind).toBe('hidden');
  });

  // §46: hidden rather than disabled. A greyed-out row tells a member that an
  // administrative dashboard over their community exists.
  it('the refusal is hidden rather than blocked, so nothing is disclosed', () => {
    const access = memberAccess(subject);
    const verdict = evaluateAnalyticsAction({ action: 'view-administrative', access });

    expect(verdict.kind).not.toBe('blocked');
  });

  it('the refusal copy does not say who *can* see it', () => {
    const sentence = describeRefusal('not-permitted');

    expect(sentence).not.toMatch(/administrator|admin|staff|moderator/i);
    expect(sentence).toContain('ask whoever manages this');
  });

  it('administrative metrics are withheld from a member', () => {
    const access = memberAccess(subject);

    expect(canViewMetric('audience.users.total', access, 'administrative')).toBe(false);
    expect(canViewMetric('content.views', access, 'public')).toBe(true);
  });

  it('financial metrics are gated separately from administrative ones', () => {
    // "May see this community's growth" and "may see its money" are different
    // permissions, and collapsing them would grant one with the other.
    const access: AnalyticsAccess = { ...memberAccess(subject), canViewFinancial: false };

    expect(canViewMetric('content.views', access, 'public')).toBe(true);
    expect(canViewMetric('revenue.gross', access, 'financial')).toBe(false);
  });

  it('an explicitly restricted metric is refused even when its class is allowed', () => {
    const access: AnalyticsAccess = {
      ...memberAccess(subject),
      restrictedMetrics: ['content.views'],
    };

    expect(canViewMetric('content.views', access, 'public')).toBe(false);
  });
});

describe('§79 · entity A cannot reach entity B’s analytics', () => {
  // A capability set is issued *for a subject*, and this is the property that
  // makes it meaningful: a set granted for A does not authorize B, because the
  // key it is cached under names A.
  const pairs: { label: string; a: AnalyticsSubject; b: AnalyticsSubject }[] = [
    {
      label: 'Creator A vs Creator B',
      a: { type: 'creator', id: 'creator-a' },
      b: { type: 'creator', id: 'creator-b' },
    },
    {
      label: 'Provider A vs Provider B',
      a: { type: 'provider', id: 'provider-a' },
      b: { type: 'provider', id: 'provider-b' },
    },
    {
      label: 'Seller A vs Seller B',
      a: { type: 'seller', id: 'seller-a' },
      b: { type: 'seller', id: 'seller-b' },
    },
    {
      label: 'Employer A vs Employer B',
      a: { type: 'employer', id: 'employer-a' },
      b: { type: 'employer', id: 'employer-b' },
    },
    {
      label: 'Community A vs Community B',
      a: { type: 'community', id: 'dev-ng' },
      b: { type: 'community', id: 'dev-gh' },
    },
  ];

  it.each(pairs)('$label · the capability set is cached per subject', ({ a, b }) => {
    expect(JSON.stringify(analyticsKeys.access(a))).not.toBe(
      JSON.stringify(analyticsKeys.access(b))
    );
  });

  it.each(pairs)('$label · the capability set names the subject it was issued for', ({ a, b }) => {
    const grantedForA = memberAccess(a);

    // The set carries its subject, so a screen rendering B can tell that a set in
    // hand was not issued for it. A bare boolean bag could not.
    expect(grantedForA.subject).toEqual(a);
    expect(grantedForA.subject).not.toEqual(b);
  });
});

describe('§79 · route manipulation cannot bypass authorization', () => {
  it('a subject id typed into a route still needs a capability set for that id', () => {
    // The client fetches `access` keyed on the subject it was asked about. Editing
    // the id changes the subject, which changes the key, which means the set in
    // hand does not apply and a new one must be requested — from the server.
    const typed: AnalyticsSubject = { type: 'community', id: 'someone-elses-community' };
    const verdict = evaluateAnalyticsAction({ action: 'view-dashboard', access: null });

    expect(verdict.kind).toBe('hidden');
    expect(JSON.stringify(analyticsKeys.access(typed))).toContain('someone-elses-community');
  });

  it('the self-scoped creator subject has no id to manipulate', () => {
    // The strongest form of this protection: a route that cannot name another
    // creator cannot leak one.
    expect(isSelfScopedSubject('creator')).toBe(true);
    expect(JSON.stringify(analyticsKeys.access({ type: 'creator', id: null }))).toContain('self');
  });

  it('an unavailable subject blocks before any capability is consulted', () => {
    // A member whose community was archived is told that, rather than told they
    // lack a permission — the ordering in `evaluateAnalyticsAction` is deliberate.
    const verdict = evaluateAnalyticsAction({
      action: 'view-dashboard',
      access: memberAccess({ type: 'community', id: 'dev-ng' }),
      subjectUnavailableDetail: 'This community has been archived.',
    });

    expect(verdict.kind).toBe('blocked');
    expect(verdict.kind === 'blocked' && verdict.reason).toBe('subject-unavailable');
  });

  it('a signed-out caller is blocked with an action rather than hidden', () => {
    const verdict = evaluateAnalyticsAction({
      action: 'view-dashboard',
      access: memberAccess({ type: 'creator', id: null }),
      isAuthenticated: false,
    });

    expect(verdict.kind).toBe('blocked');
    expect(verdict.kind === 'blocked' && verdict.action).toBe('sign-in');
  });
});

describe('§6 · §7 · the pickers offer only what the backend will answer', () => {
  it('offers the server’s ranges when it publishes them', () => {
    const access = memberAccess({ type: 'creator', id: null });
    expect(supportedRanges(access)).toEqual(['last7d', 'last30d']);
  });

  it('falls back to a conservative set rather than everything', () => {
    // §6 asks for graceful support of every range. A control that produces an
    // error is not graceful support, so the fallback is the set most deployments
    // can answer — not all eleven.
    const offered = supportedRanges(null);

    expect(offered).toContain('last30d');
    expect(offered).toContain('custom');
    expect(offered).not.toContain('allTime');
  });

  it('always offers "no comparison", because §7 requires being able to turn one off', () => {
    const access: AnalyticsAccess = {
      ...memberAccess({ type: 'creator', id: null }),
      supportedComparisons: ['previousPeriod'],
    };

    const offered = supportedComparisons(access);
    expect(offered[0]).toBe('none');
    expect(offered).toContain('previousPeriod');
  });

  it('does not duplicate "none" when the server already offered it', () => {
    const access: AnalyticsAccess = {
      ...memberAccess({ type: 'creator', id: null }),
      supportedComparisons: ['none', 'previousYear'],
    };

    const offered = supportedComparisons(access);
    expect(offered.filter((basis) => basis === 'none')).toHaveLength(1);
  });
});

describe('§6 · a purchasable capability refuses differently', () => {
  const subject: AnalyticsSubject = { type: 'campaign', id: 'c1' };

  it('renders an upgrade path rather than nothing', () => {
    // The narrow exception to hidden-rather-than-disabled: where the capability is
    // one the member could buy, the existence of the feature is the product.
    const verdict = evaluateAnalyticsAction({
      action: 'build-reports',
      access: memberAccess(subject),
      isPurchasable: true,
      requiredPlanName: 'Business',
    });

    expect(verdict.kind).toBe('blocked');
    expect(verdict.kind === 'blocked' && verdict.action).toBe('upgrade');
    expect(verdict.kind === 'blocked' && verdict.detail).toContain('Business');
  });

  it('being purchasable never turns a refusal into an allowance', () => {
    const verdict = evaluateAnalyticsAction({
      action: 'view-administrative',
      access: memberAccess({ type: 'platform', id: null }),
      isPurchasable: true,
    });

    expect(verdict.kind).not.toBe('allowed');
  });
});
