// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics access (Frontend Phase 15, §46 · §48 · §72)
//
// The only place the application decides whether an analytics affordance may be
// drawn, and it decides it by **reading a server-evaluated capability set** and
// nothing else.
//
// ── The property this file exists to guarantee ───────────────────────────────
//
// §48: "Never trust frontend role state." There is no function here that takes a
// role, an account state, a subscription tier or a user id and returns a
// permission. Not one. `evaluateAnalyticsAction` takes an `AnalyticsAccess` — the
// server's answer — and reads a boolean out of it.
//
// That is a stronger guarantee than a code review, and it is testable: the
// permission tests assert that the module exports no function accepting a role,
// and that a caller with no capability set gets `hidden` for every action.
//
// ── Hidden rather than disabled ──────────────────────────────────────────────
//
// Phase 13 established this and it matters more here. A disabled "Platform
// analytics" row tells a member that platform analytics exists and that somebody
// can see it. For an administrative dashboard over a diaspora community — where
// the underlying data can imply nationality and immigration situation — that is
// not a neutral disclosure. So a missing capability renders **nothing**.
//
// The exception is deliberate and narrow: where a capability is missing because
// the member has not *bought* it, the surface renders the Phase 6 upgrade path,
// because in that case the existence of the feature is the product. That
// distinction is carried by `refusalReason` rather than decided per screen.
//
// ── §72: not all analytics is administrative ─────────────────────────────────
//
// A creator's own reach, a seller's own listing performance and a landlord's own
// enquiry funnel are the member's own data and are *user-facing*. The access
// model treats them as such: `canView` for a self-scoped subject is expected to
// be true, and the interesting refusals are for other people's subjects. Nothing
// in this module makes owner-level analytics harder to reach than administrative
// analytics — that would be the opposite of §72.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsAccess,
  AnalyticsComparisonBasis,
  AnalyticsMetricKey,
  AnalyticsRangePreset,
  AnalyticsSubject,
  AnalyticsSubjectType,
} from '@/types/analytics';

/**
 * The actions the UI gates. One per capability field, named for what a member
 * would be doing rather than for the field.
 */
export type AnalyticsAction =
  | 'view-dashboard'
  | 'view-financial'
  | 'view-administrative'
  | 'compare'
  | 'export'
  | 'build-reports';

/**
 * The map from action to capability field.
 *
 * A `Record` with an exhaustive key type, so adding an action without adding its
 * capability is a compile error. This is the only place the two vocabularies
 * meet, exactly as in `lib/community/access.ts`.
 */
const ACTION_CAPABILITY: Record<AnalyticsAction, keyof AnalyticsAccess> = {
  'view-dashboard': 'canView',
  'view-financial': 'canViewFinancial',
  'view-administrative': 'canViewAdministrative',
  compare: 'canCompare',
  export: 'canExport',
  'build-reports': 'canBuildReports',
};

/**
 * Why a surface was refused.
 *
 * Low-cardinality codes rather than messages, because they travel into telemetry
 * (`analytics.refusal.shown`) and a message containing a community name would be
 * a disclosure in a log. The message is derived from the code at render time.
 */
export type AnalyticsRefusalReason =
  /** No capability set has been loaded yet, or the server reported none. */
  | 'no-capability'
  /** The server said no for this specific action. */
  | 'not-permitted'
  /** The capability exists on a plan the member has not bought. §6, §31. */
  | 'requires-plan'
  /** The session ended. */
  | 'signed-out'
  /** The subject itself is unavailable — deleted, suspended, archived. */
  | 'subject-unavailable';

export type AnalyticsVerdict =
  /** The server reported the capability. Render the affordance. */
  | { kind: 'allowed' }
  /** No capability was reported. Render nothing at all. */
  | { kind: 'hidden'; reason: AnalyticsRefusalReason }
  /** Refused, with something the member can act on. */
  | { kind: 'blocked'; reason: AnalyticsRefusalReason; detail: string; action?: 'upgrade' | 'sign-in' };

export interface EvaluateAnalyticsInput {
  action: AnalyticsAction;
  /** The server's answer. `null` means it has not answered — never "yes". */
  access: AnalyticsAccess | null | undefined;
  /** Whether the session is live. The one piece of client state consulted. */
  isAuthenticated?: boolean;
  /**
   * Whether the capability is one the member could buy.
   *
   * Supplied by the screen from Phase 6's **real** entitlement decision, which is
   * a server-evaluated fact about a real subscription. It changes the *shape* of
   * the refusal — hidden becomes an upgrade path — and never turns a refusal into
   * an allowance.
   */
  isPurchasable?: boolean;
  /** The plan that would grant it, for the upgrade copy. From Phase 6. */
  requiredPlanName?: string | null;
  /** Set where the subject itself cannot be reported on. */
  subjectUnavailableDetail?: string | null;
}

/**
 * The only way to ask whether an analytics affordance may be shown.
 *
 * Order matters and it is the order of increasing specificity: an unavailable
 * subject blocks everything regardless of capability, because a member whose
 * community was archived needs to be told that rather than told they lack a
 * permission. Sign-out is next. Only then is the capability consulted — and a
 * missing capability set is `hidden`, never `allowed`.
 */
export function evaluateAnalyticsAction(input: EvaluateAnalyticsInput): AnalyticsVerdict {
  const { action, access, isAuthenticated = true, isPurchasable = false } = input;

  if (input.subjectUnavailableDetail) {
    return {
      kind: 'blocked',
      reason: 'subject-unavailable',
      detail: input.subjectUnavailableDetail,
    };
  }

  if (!isAuthenticated) {
    return {
      kind: 'blocked',
      reason: 'signed-out',
      detail: 'Sign in to see your analytics.',
      action: 'sign-in',
    };
  }

  // No capability set means the server has not said this caller may do anything.
  // Absence is refusal — never an invitation to guess from a role.
  if (!access) return { kind: 'hidden', reason: 'no-capability' };

  if (access[ACTION_CAPABILITY[action]] === true) return { kind: 'allowed' };

  // The one case where a refusal is shown rather than hidden. See the header.
  if (isPurchasable) {
    return {
      kind: 'blocked',
      reason: 'requires-plan',
      detail: input.requiredPlanName
        ? `Advanced analytics are part of ${input.requiredPlanName}.`
        : 'Advanced analytics are part of a paid plan.',
      action: 'upgrade',
    };
  }

  return { kind: 'hidden', reason: 'not-permitted' };
}

/** The common case, for a `{canViewAnalytics(...) && …}` render. */
export function canPerformAnalyticsAction(
  action: AnalyticsAction,
  access: AnalyticsAccess | null | undefined
): boolean {
  return evaluateAnalyticsAction({ action, access }).kind === 'allowed';
}

/**
 * The capability set to use when none was loaded.
 *
 * Every field false and every list empty, so the fallback cannot accidentally
 * permit anything or offer a range the backend will refuse. Exported so a screen
 * can render its `useAnalyticsAccess()` result without a null check and still get
 * the safe answer.
 */
export function noAnalyticsAccess(subject: AnalyticsSubject): AnalyticsAccess {
  return {
    subject,
    canView: false,
    canViewFinancial: false,
    canViewAdministrative: false,
    canCompare: false,
    canExport: false,
    canBuildReports: false,
    supportedRanges: [],
    supportedComparisons: [],
    restrictedMetrics: [],
    reportingTimezone: null,
  };
}

/**
 * Whether a metric may be rendered for this caller.
 *
 * §46 and §73 together: a restricted metric is **omitted**, not shown as zero and
 * not shown blurred. A zero is a claim about the data and a blur is a claim about
 * the member. Both are wrong; absence is correct.
 *
 * Financial metrics are gated separately from everything else, because "may see
 * this community's growth" and "may see this community's money" are genuinely
 * different permissions and collapsing them would grant one with the other.
 *
 * **`restrictedMetrics` is compared against a dotted catalogue key, and until
 * the certified arm landed the server was sending snake keys.** The comparison
 * below was therefore never true for any metric on any caller, which made metric
 * restriction silently non-functional rather than merely wrong. The fix is at
 * the boundary — `lib/analytics/catalogue-keys.ts`, called from
 * `fetchAnalyticsAccess` — rather than here, because widening this comparison to
 * accept either spelling would leave every *other* reader of
 * `AnalyticsAccess.restrictedMetrics` still broken.
 */
export function canViewMetric(
  key: AnalyticsMetricKey,
  access: AnalyticsAccess | null | undefined,
  privacyClass: string
): boolean {
  if (!access?.canView) return false;
  if (access.restrictedMetrics.includes(key)) return false;
  if (privacyClass === 'financial' && !access.canViewFinancial) return false;
  if (privacyClass === 'administrative' && !access.canViewAdministrative) return false;
  return true;
}

/**
 * The ranges a picker may offer.
 *
 * §6 asks the frontend to support every range gracefully even where the backend
 * does not, and this is where "gracefully" is defined: the picker offers what the
 * server says it supports, and where the server has said nothing it offers the
 * conservative default set rather than everything. Offering a range that produces
 * an error is not graceful support, it is a broken control.
 */
/**
 * Corrected against `GetAnalyticsAccessQueryHandler.SupportedRanges()`.
 *
 * The platform answers exactly six presets — `today`, `last7d`, `last30d`,
 * `last90d`, `thisYear`, `custom` — and this list used to offer `thisMonth` and
 * `previousMonth`, which it does not. A picker offering a range the deployment
 * refuses is precisely the "broken control" the paragraph above rules out, and
 * it was reachable in the one case this fallback exists for: before the
 * capability set has landed, or where it never lands at all.
 *
 * `thisYear` is added for the same reason in the other direction: it *is*
 * answered and was not being offered.
 */
const DEFAULT_RANGES: AnalyticsRangePreset[] = [
  'today',
  'last7d',
  'last30d',
  'last90d',
  'thisYear',
  'custom',
];

export function supportedRanges(access: AnalyticsAccess | null | undefined): AnalyticsRangePreset[] {
  return access?.supportedRanges?.length ? access.supportedRanges : DEFAULT_RANGES;
}

/**
 * The comparison baselines a picker may offer.
 *
 * `none` is always available and is always first — §7 forbids showing a
 * misleading comparison, and being able to turn one off is part of that.
 */
const DEFAULT_COMPARISONS: AnalyticsComparisonBasis[] = ['none', 'previousPeriod', 'previousYear'];

export function supportedComparisons(
  access: AnalyticsAccess | null | undefined
): AnalyticsComparisonBasis[] {
  const offered = access?.supportedComparisons?.length
    ? access.supportedComparisons
    : DEFAULT_COMPARISONS;
  return offered.includes('none') ? offered : ['none', ...offered];
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBJECTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Whether a subject type addresses the caller themselves.
 *
 * Used to decide whether an id belongs in a request and in a cache key, not to
 * decide a permission. `creator` is self-only by route design — there is no
 * `GET /analytics/creators/{id}` in the register — and modelling that here keeps
 * the query-key builder from inventing an id for it.
 */
export function isSelfScopedSubject(type: AnalyticsSubjectType): boolean {
  return type === 'creator';
}

/** Whether a subject is administrative, so the hub knows what to hide by default. */
export function isAdministrativeSubject(type: AnalyticsSubjectType): boolean {
  return type === 'platform';
}

/** Human labels, so no screen writes "Marketplace seller" its own way. */
export const SUBJECT_LABELS: Record<AnalyticsSubjectType, string> = {
  platform: 'Platform',
  country: 'Country',
  community: 'Community',
  neighborhood: 'Neighbourhood',
  creator: 'Creator',
  provider: 'Provider',
  employer: 'Employer',
  job: 'Job',
  seller: 'Marketplace seller',
  listing: 'Listing',
  landlord: 'Landlord',
  housing: 'Housing listing',
  organization: 'Organization',
  guide: 'Guide',
  event: 'Event',
  update: 'Community update',
  campaign: 'Campaign',
};

/**
 * The sentence shown when a surface is refused.
 *
 * Deliberately says nothing about who *can* see it. "Ask an administrator" is
 * actionable; "this is restricted to platform administrators" tells a member that
 * a class of people can read data about them, which is a disclosure the refusal
 * did not need to make.
 */
export function describeRefusal(reason: AnalyticsRefusalReason): string {
  switch (reason) {
    case 'no-capability':
    case 'not-permitted':
      return 'You do not have access to this report. If you think you should, ask whoever manages this on Diaspora.';
    case 'requires-plan':
      return 'This report is part of a paid plan.';
    case 'signed-out':
      return 'Sign in to see your analytics.';
    case 'subject-unavailable':
      return 'There is nothing to report on here.';
  }
}
