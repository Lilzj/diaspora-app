// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Entitlements (Frontend Phase 6)
//
// §11 of the phase brief: one abstraction, not a plan check scattered across
// screens. Everything a screen needs to ask about a premium capability is a
// function in this file, and every one of them takes the entitlement list as an
// argument rather than reading a store — so they are pure, testable, and cannot
// accidentally consult a stale copy.
//
// **The client's answer is advisory.** §25 is explicit that client-side
// entitlements are never trusted, and the reason is not paranoia: a subscription
// cancelled on another device, a plan whose grace period lapsed an hour ago, and
// a member whose account was restricted this morning all produce a cached
// `true` here. So this module decides *what to draw* — a locked card or an
// unlocked one — and every action it permits is re-authorised by the server on
// the request that follows. Nothing here gates money, and nothing here is the
// last word on access.
//
// The entitlement vocabulary is the backend's. `Entitlement { key, value }` is
// served on both `SubscriptionPlan` and `Subscription`, `value` carries a limit
// or a setting, and a null `value` means the capability is simply granted. An
// unknown key is rendered from its own dotted name rather than hidden — which is
// the property B15 designed the contract to have, and dropping it would mean a
// plan an operator adds tomorrow is invisible until the next app release.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ENTITLEMENT_LABELS,
  type EntitlementDecision,
  type PlanComparisonRow,
  type UsageLimit,
} from '@/types/monetization';
import type { Entitlement, Subscription, SubscriptionPlan } from '@/types/financial';

/**
 * The counter shape this file reads, narrow enough that both arms satisfy it.
 *
 * The certified `UsageCounter` (`types/financial.ts`) and the development
 * adapter's twin (`types/monetization-gaps.ts`) are **not** the same type, and
 * the difference is load-bearing: the adapter declares `consumed: number` while
 * the real `UsageCounterResponse` declares it nullable, because the server
 * reports the ceiling and the vertical reports the consumption and the second
 * often has not happened.
 *
 * Structural rather than a union, so this file states exactly what it needs and
 * neither arm's extra fields leak into the other's call sites. `consumed` is
 * widened to include `null | undefined` here so the strict adapter type is
 * assignable and the meter still resolves "not measured" from the real one.
 */
export interface UsageCounterLike {
  key: string;
  limit: number | null;
  consumed?: number | null;
  atLimitBehaviour?: string | null;
  /**
   * Carried so a counter literal from either arm is assignable — TypeScript's
   * excess-property check rejects an object literal with fields the parameter
   * type does not name. This function computes remaining from limit and
   * consumed and never reads these; they are here to keep the door open, not
   * because anything below uses them.
   */
  remaining?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading an entitlement set
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the set grants a capability.
 *
 * Key comparison is case-insensitive and trimmed. B15 documents its keys as
 * "lower case, dotted" and every one it serves is, but a comparison that breaks
 * on `Analytics.Advanced` is a comparison that will one day silently lock
 * somebody out of something they paid for.
 */
export function hasEntitlement(
  entitlements: Entitlement[] | undefined | null,
  key: string
): boolean {
  return findEntitlement(entitlements, key) !== null;
}

/** The entitlement itself, or null. */
export function findEntitlement(
  entitlements: Entitlement[] | undefined | null,
  key: string
): Entitlement | null {
  if (!entitlements || entitlements.length === 0) return null;
  const wanted = key.trim().toLowerCase();
  return entitlements.find((entry) => entry.key?.trim().toLowerCase() === wanted) ?? null;
}

/** The raw value — `"15"`, `"unlimited"`, `"10%"` — or null when granted without one. */
export function entitlementValue(
  entitlements: Entitlement[] | undefined | null,
  key: string
): string | null {
  return findEntitlement(entitlements, key)?.value ?? null;
}

/**
 * The entitlements actually in force.
 *
 * `Subscription.grantsAccess` is the field that matters and the one most easily
 * missed: a subscription in `GracePeriod` still grants access while a failed
 * renewal is retried, and a `Cancelled` one keeps granting until the paid period
 * ends. Reading `status === 'Active'` instead would cut somebody off mid-month
 * for a payment problem the platform is still working on.
 *
 * A null subscription is the free plan, not an error, and yields an empty set.
 */
export function effectiveEntitlements(
  subscription: Subscription | null | undefined
): Entitlement[] {
  if (!subscription) return [];
  if (!subscription.grantsAccess) return [];
  return subscription.entitlements ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a limit out of an entitlement value.
 *
 * Three shapes appear in the certified catalogue: a plain integer (`"15"`), the
 * word `"unlimited"`, and a percentage (`"10%"`) which is not a limit at all.
 * Anything unrecognised returns `{ limit: null, isUnlimited: false }` — unknown
 * rather than unbounded, because treating an unparsable value as unlimited would
 * be the client granting itself something.
 */
export function parseLimitValue(value: string | null | undefined): {
  limit: number | null;
  isUnlimited: boolean;
} {
  if (value == null) return { limit: null, isUnlimited: false };

  const cleaned = value.trim().toLowerCase();
  if (cleaned === 'unlimited' || cleaned === 'infinite' || cleaned === '∞') {
    return { limit: null, isUnlimited: true };
  }
  if (!/^\d+$/.test(cleaned)) return { limit: null, isUnlimited: false };

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isSafeInteger(parsed) ? { limit: parsed, isUnlimited: false } : { limit: null, isUnlimited: false };
}

/**
 * A limit and what has been used against it.
 *
 * ── The three states, and why two of them used to be one ─────────────────────
 *
 * `GET /financial/entitlements/me` (MON-GAP-008) resolves the ceiling from the
 * plan and the consumption from whichever vertical owns the thing being counted,
 * and the two arrive separately. That produces three states a meter must keep
 * apart:
 *
 *   · **no counter at all** — nothing was reported for this key;
 *   · **a counter with `consumed: null`** — the key is metered, and nobody
 *     measured it. The backend's own summary is explicit: *"A counter with no
 *     consumption means 'not measured', never zero."*
 *   · **a counter with `consumed: 0`** — measured, and none used.
 *
 * The first two are indistinguishable to a member and are both reported here as
 * `isMeasured: false` with a null `ratio`, so the meter says "usage not
 * reported" rather than drawing an empty bar. The third draws an empty bar,
 * which is now a claim somebody actually made.
 *
 * Before this route was wired the distinction could not be expressed at all: the
 * development adapter's `UsageCounter.consumed` is `number`, so every simulated
 * counter arrived measured and a zero was indistinguishable from silence.
 *
 * ── At the limit ─────────────────────────────────────────────────────────────
 *
 * `atLimitBehaviour` is carried through rather than assumed. Some limits refuse,
 * some queue, some charge for the overage, and a meter showing 15/15 without
 * saying which tells a member their next listing will fail when in fact it will
 * cost them money.
 */
export function getUsageLimit(
  entitlements: Entitlement[] | undefined | null,
  key: string,
  counters?: readonly UsageCounterLike[] | null
): UsageLimit {
  const value = entitlementValue(entitlements, key);
  const { limit, isUnlimited } = parseLimitValue(value);

  const counter = counters?.find((entry) => entry.key?.trim().toLowerCase() === key.trim().toLowerCase());
  const consumed = counter?.consumed ?? null;

  // The counter's own limit wins when it disagrees with the entitlement: a
  // counter is served by whatever resolves the member's plan, and it is closer
  // to the truth than a plan document that may have been cached for an hour.
  const effectiveLimit = counter?.limit ?? limit;

  const ratio =
    consumed !== null && effectiveLimit !== null && effectiveLimit > 0
      ? Math.min(1, Math.max(0, consumed / effectiveLimit))
      : null;

  return {
    key,
    label: describeEntitlement(key).label,
    limit: effectiveLimit,
    isUnlimited,
    consumed,
    isMeasured: consumed !== null,
    atLimitBehaviour: counter?.atLimitBehaviour ?? null,
    ratio,
    isAtLimit:
      consumed !== null && effectiveLimit !== null ? consumed >= effectiveLimit : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Explaining an entitlement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A key, in words.
 *
 * Falls back to unpacking the dotted key — `analytics.advanced` becomes
 * "Analytics advanced" — for anything the table does not know, so a plan an
 * operator adds tomorrow renders legibly without a client release. That is the
 * whole point of the backend serving capabilities rather than plan names.
 */
export function describeEntitlement(key: string): { label: string; description: string | null } {
  const known = ENTITLEMENT_LABELS[key.trim().toLowerCase()];
  if (known) return { label: known.label, description: known.description };

  const label = key
    .replace(/[._]/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return { label: label.length > 0 ? label : key, description: null };
}

/** How an entitlement's value reads next to its label. `"15"` → "15", `null` → "Included". */
export function describeEntitlementValue(value: string | null | undefined): string {
  if (value == null || value.trim().length === 0) return 'Included';
  const { isUnlimited } = parseLimitValue(value);
  return isUnlimited ? 'Unlimited' : value.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Deciding what to draw
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cheapest plan that grants a key, or null when nothing in the catalogue
 * does.
 *
 * "Cheapest" compares `minorUnits` and only within a single currency — the
 * platform never converts, and a catalogue mixing currencies would produce a
 * meaningless ordering. Plans in another currency are skipped rather than
 * mis-ranked; where every plan is in another currency the lowest `sortOrder`
 * wins, which is the operator's own ranking.
 */
export function cheapestPlanGranting(
  plans: SubscriptionPlan[] | undefined | null,
  key: string,
  preferredCurrency?: string
): SubscriptionPlan | null {
  if (!plans || plans.length === 0) return null;

  const granting = plans.filter((plan) => hasEntitlement(plan.entitlements, key));
  if (granting.length === 0) return null;

  const currency = preferredCurrency ?? granting[0]?.price?.currency;
  const comparable = granting.filter((plan) => plan.price?.currency === currency);

  if (comparable.length === 0) {
    return granting.slice().sort((left, right) => left.sortOrder - right.sortOrder)[0];
  }

  return comparable
    .slice()
    .sort(
      (left, right) =>
        left.price.minorUnits - right.price.minorUnits || left.sortOrder - right.sortOrder
    )[0];
}

/**
 * Whether the member may use a feature, and what stands in the way.
 *
 * `isUpgradePath` is the field worth reading carefully. It is true only when a
 * subscription is genuinely what is missing. Somebody whose account is
 * restricted, or who has not completed Diaspora verification, cannot fix that by
 * paying — and an upgrade button shown to them is a button that takes their
 * money and still refuses them. Those cases set `isUpgradePath` false and leave
 * the calling screen to render the access refusal the financial layer already
 * produces.
 */
export function decideEntitlement(input: {
  key: string;
  entitlements: Entitlement[] | undefined | null;
  plans?: SubscriptionPlan[] | null;
  /** From `useFinancialAccess()`. False for an unverified or restricted member. */
  canSubscribe?: boolean;
  preferredCurrency?: string;
}): EntitlementDecision {
  const { key, entitlements, plans, canSubscribe = true, preferredCurrency } = input;

  const entitlement = findEntitlement(entitlements, key);
  if (entitlement) {
    return {
      key,
      isAvailable: true,
      value: entitlement.value ?? null,
      requiredPlan: null,
      reason: null,
      isUpgradePath: false,
    };
  }

  const requiredPlan = cheapestPlanGranting(plans, key, preferredCurrency);
  const { label } = describeEntitlement(key);

  if (!canSubscribe) {
    return {
      key,
      isAvailable: false,
      value: null,
      requiredPlan,
      reason: `${label} is on a paid plan, and your account cannot start one yet.`,
      isUpgradePath: false,
    };
  }

  if (!requiredPlan) {
    return {
      key,
      isAvailable: false,
      value: null,
      requiredPlan: null,
      reason: `${label} is not available on any plan at the moment.`,
      isUpgradePath: false,
    };
  }

  return {
    key,
    isAvailable: false,
    value: null,
    requiredPlan,
    reason: `${label} is included with ${requiredPlan.name}.`,
    isUpgradePath: true,
  };
}

/** The plain question, when a screen only needs a boolean. */
export function isFeatureAvailable(
  entitlements: Entitlement[] | undefined | null,
  key: string
): boolean {
  return hasEntitlement(entitlements, key);
}

/** Whether buying something is what unlocks this. Null when nothing would. */
export function requiresUpgrade(input: {
  key: string;
  entitlements: Entitlement[] | undefined | null;
  plans?: SubscriptionPlan[] | null;
  canSubscribe?: boolean;
  preferredCurrency?: string;
}): SubscriptionPlan | null {
  const decision = decideEntitlement(input);
  return decision.isUpgradePath ? decision.requiredPlan : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparing plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The rows of a comparison table: one per distinct entitlement key across the
 * plans given, ordered by how many plans grant it — so the things everybody gets
 * sit at the top and the differentiators sit where somebody scanning for a
 * reason to pay will find them.
 *
 * `isDifferentiator` marks a row where the plans genuinely differ. A row every
 * plan grants identically tells a member nothing, and the comparison screen
 * collapses those behind "what everyone gets".
 */
export function buildPlanComparison(plans: SubscriptionPlan[]): PlanComparisonRow[] {
  const keys = new Map<string, number>();

  for (const plan of plans) {
    for (const entitlement of plan.entitlements ?? []) {
      const key = entitlement.key?.trim().toLowerCase();
      if (!key) continue;
      keys.set(key, (keys.get(key) ?? 0) + 1);
    }
  }

  const rows: PlanComparisonRow[] = [];

  for (const [key, grantCount] of keys) {
    // A plan that does not grant the key is **absent** from `values`, rather
    // than present with null. Null means "granted, with no value attached", and
    // collapsing the two would put a checkmark in every cell of every row.
    const values: Record<string, string | null> = {};
    const distinct = new Set<string>();

    for (const plan of plans) {
      const entitlement = findEntitlement(plan.entitlements, key);
      if (entitlement) {
        values[plan.code] = entitlement.value ?? null;
        distinct.add(entitlement.value ?? '__granted__');
      } else {
        distinct.add('__absent__');
      }
    }

    rows.push({
      key,
      label: describeEntitlement(key).label,
      values,
      // Differs if some plan lacks it, or if the granted values are not all equal.
      isDifferentiator: grantCount < plans.length || distinct.size > 1,
    });
  }

  return rows.sort((left, right) => {
    if (left.isDifferentiator !== right.isDifferentiator) return left.isDifferentiator ? 1 : -1;
    return left.label.localeCompare(right.label);
  });
}

/**
 * Whether moving from one plan to another is an upgrade.
 *
 * Compares price within a single billing interval; across intervals the two are
 * not orderable by price alone — £5/month against £99/year is a different
 * question — so the comparison is normalised to a yearly figure first. Returns
 * null when the currencies differ, because the platform never converts and a
 * guess would be the client pricing money.
 */
export function planRelation(
  from: SubscriptionPlan | null | undefined,
  to: SubscriptionPlan
): 'upgrade' | 'downgrade' | 'same' | null {
  if (!from) return to.isFree ? 'same' : 'upgrade';
  if (from.code === to.code) return 'same';
  if (from.price.currency !== to.price.currency) return null;

  const left = annualisedMinorUnits(from);
  const right = annualisedMinorUnits(to);
  if (left === null || right === null) return null;

  if (right > left) return 'upgrade';
  if (right < left) return 'downgrade';
  return 'same';
}

/**
 * A plan's price over a year, in minor units.
 *
 * Lifetime has no annual equivalent — dividing a one-off payment by an assumed
 * lifespan would be inventing a number — so it returns null and the caller
 * declines to rank it.
 */
export function annualisedMinorUnits(plan: SubscriptionPlan): number | null {
  const periods = periodsPerYear(plan.interval);
  if (periods === null) return null;
  return plan.price.minorUnits * periods;
}

/** How many billing periods make a year. Null for Lifetime and for anything unknown. */
export function periodsPerYear(interval: string): number | null {
  switch (interval) {
    case 'Monthly':
      return 12;
    case 'Quarterly':
      return 4;
    case 'Yearly':
      return 1;
    case 'Lifetime':
      return null;
    default:
      return null;
  }
}

/** Entitlements `to` has that `from` does not. The upgrade's actual content. */
export function gainedEntitlements(
  from: Entitlement[] | undefined | null,
  to: Entitlement[] | undefined | null
): Entitlement[] {
  return (to ?? []).filter((entry) => !hasEntitlement(from, entry.key));
}

/** Entitlements `from` has that `to` does not. The downgrade warning. */
export function lostEntitlements(
  from: Entitlement[] | undefined | null,
  to: Entitlement[] | undefined | null
): Entitlement[] {
  return (from ?? []).filter((entry) => !hasEntitlement(to, entry.key));
}

/**
 * Whether a trial may be offered.
 *
 * `trialDays > 0` is necessary and not sufficient: B15 refuses
 * `financial.subscription.trial_used` to a member who has held the plan before,
 * and a subscription of the same code with any renewals behind it is the signal
 * this client has. Offering a trial that is taken away at the confirmation step
 * is worse than never offering it.
 */
export function canStartTrial(
  plan: SubscriptionPlan,
  current: Subscription | null | undefined
): boolean {
  if (plan.trialDays <= 0) return false;
  if (!current) return true;
  if (current.planCode !== plan.code) return true;
  return current.renewalCount === 0 && current.status === 'Trial';
}
