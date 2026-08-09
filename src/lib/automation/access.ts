// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation access (Frontend Phase 18, §45–§49 · §66)
//
// The only place the application decides whether an automation affordance may
// be drawn, and it decides it by **reading a server-evaluated capability set**
// and nothing else.
//
// ── The property this file exists to guarantee ───────────────────────────────
//
// §49: "Never trust the frontend for automation authorization, target audience,
// financial action, notification recipient, community scope, user scope or
// integration permissions."
//
// So there is no function here that takes a role, an account state, a
// subscription tier, a creator level or a user id and returns a permission. Not
// one, not a private one, not a convenience one. `evaluateAutomationAction`
// takes an `AutomationAccess` — the server's answer — and reads a boolean out
// of it.
//
// That is a stronger guarantee than a code review because it is testable, and
// `automation-permissions.test.ts` tests exactly it: that this module exports
// no function accepting a role, and that a caller with no capability set gets
// `hidden` for every action. Phase 13 and Phase 15 both established this shape;
// this is the third file to follow it and the pattern should not be broken next
// time either.
//
// ── Hidden rather than disabled ──────────────────────────────────────────────
//
// A missing capability renders **nothing**, not a greyed-out control.
//
// For automation this matters more than it did for analytics. A disabled
// "Create a community-wide announcement" tells an ordinary member that
// community-wide announcements exist, that somebody can send them, and that
// they are not that person — which maps the community's governance for anybody
// who opens the screen, and §66 asks that route manipulation not reveal what
// authorization would have allowed.
//
// The one deliberate exception is `blocked`: where the server named a reason
// worth showing — a suspended account, a revoked role — the reason is rendered,
// because "you cannot do this and here is why" is more useful than silence and
// discloses nothing the member does not already know about themselves.
//
// ── §48, and the capability that is deliberately separate ────────────────────
//
// `canUseFinancialTriggers` is its own field rather than being folded into
// `canCreatePersonal`. Financial automations require stronger authorization
// (§48) and a separate field is what lets the server grant one without the
// other. Deriving it from anything else on the client would be exactly the
// re-implementation this module refuses to contain.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AutomationAccess,
  AutomationActionDefinition,
  AutomationOwnerKind,
  AutomationTriggerDefinition,
} from '@/types/automation';

/**
 * The actions the UI gates. One per capability field, named for what a member
 * would be doing rather than for the field.
 */
export type AutomationAction =
  | 'view-automations'
  | 'create-personal'
  | 'create-community'
  | 'create-organization'
  | 'create-creator'
  | 'create-business'
  | 'create-platform'
  | 'notify-others'
  | 'use-financial-triggers'
  | 'use-location-triggers'
  | 'view-others-runs'
  | 'manage-others-automations';

/**
 * The map from action to capability field.
 *
 * A `Record` with an exhaustive key type, so adding an action without adding
 * its capability is a compile error. This is the only place the two
 * vocabularies meet.
 */
const ACTION_CAPABILITY: Record<AutomationAction, keyof AutomationAccess> = {
  'view-automations': 'canViewAutomations',
  'create-personal': 'canCreatePersonal',
  'create-community': 'canCreateForCommunity',
  'create-organization': 'canCreateForOrganization',
  'create-creator': 'canCreateForCreator',
  'create-business': 'canCreateForBusiness',
  'create-platform': 'canCreatePlatformWide',
  'notify-others': 'canNotifyOtherMembers',
  'use-financial-triggers': 'canUseFinancialTriggers',
  'use-location-triggers': 'canUseLocationTriggers',
  'view-others-runs': 'canViewOthersRuns',
  'manage-others-automations': 'canManageOthersAutomations',
};

/**
 * The three-way answer.
 *
 * Not a boolean, because the UI genuinely renders three different things — the
 * same shape Phase 13's `evaluateCommunityAction` established.
 */
export type AutomationVerdict =
  | { outcome: 'allowed' }
  | { outcome: 'hidden' }
  | { outcome: 'blocked'; reason: string };

const HIDDEN: AutomationVerdict = { outcome: 'hidden' };
const ALLOWED: AutomationVerdict = { outcome: 'allowed' };

/**
 * May this member do this?
 *
 * `access` may be null — a query that has not answered, a signed-out reader, a
 * production build with no capability contract — and null means `hidden` for
 * everything. Failing closed is the only correct direction: a capability set
 * that has not loaded is not evidence of permission.
 */
export function evaluateAutomationAction(
  action: AutomationAction,
  access: AutomationAccess | null | undefined
): AutomationVerdict {
  if (!access) return HIDDEN;
  if (access.provenance !== 'server') return HIDDEN;

  const granted = access[ACTION_CAPABILITY[action]];
  return granted === true ? ALLOWED : HIDDEN;
}

/** Convenience for the common `outcome === 'allowed'` test. */
export function can(
  action: AutomationAction,
  access: AutomationAccess | null | undefined
): boolean {
  return evaluateAutomationAction(action, access).outcome === 'allowed';
}

/**
 * Whether a specific capability key was granted.
 *
 * Used for the per-trigger and per-action checks, where the capability is named
 * by the catalogue entry rather than by a field on `AutomationAccess`. The
 * lookup is against `grantedCapabilities`, which is **the server's list** — the
 * client never adds to it.
 *
 * ── The order of these two checks is the whole point ─────────────────────────
 *
 * The absent-answer check comes **first**, before the null-requirement
 * shortcut, and the reverse order was a real defect: a catalogue entry needing
 * no specific capability passed for a member with *no capability set at all*,
 * so the template gallery offered eleven templates to somebody the server had
 * said nothing about. In production `useAutomationAccess` resolves to
 * `noAutomationAccess()`, so that was every member.
 *
 * `automation-permissions.test.ts` asserts both halves: no answer means no,
 * and a server answer with no requirement means yes.
 */
export function hasCapability(
  capability: string | null,
  access: AutomationAccess | null | undefined
): boolean {
  if (!access || access.provenance !== 'server') return false;
  if (!capability) return true;
  return access.grantedCapabilities.includes(capability);
}

/**
 * The owner scopes this member may create automations for.
 *
 * Derived from the capability set alone. A screen offering a scope picker calls
 * this rather than assembling its own list, so a scope the server did not grant
 * cannot appear on one screen and be absent on another.
 */
export function allowedOwnerKinds(
  access: AutomationAccess | null | undefined
): AutomationOwnerKind[] {
  if (!access || access.provenance !== 'server') return [];

  const kinds: AutomationOwnerKind[] = [];
  if (access.canCreatePersonal) kinds.push('user');
  if (access.canCreateForCreator) kinds.push('creator');
  if (access.canCreateForCommunity) kinds.push('community');
  if (access.canCreateForOrganization) kinds.push('organization');
  if (access.canCreateForBusiness) kinds.push('provider', 'employer', 'landlord', 'seller');
  if (access.canCreatePlatformWide) kinds.push('platform');
  return kinds;
}

/**
 * Whether a trigger may be offered to this member, for this owner scope.
 *
 * Three independent checks, all of which must pass, and the order is chosen so
 * the cheapest runs first:
 *
 *   1. The catalogue's own `allowedOwners` — a data question.
 *   2. The trigger's `requiredCapability` — the server's answer.
 *   3. The financial and location gates — §48 and §15, which are separate
 *      capabilities precisely so they can be withheld independently.
 */
export function canUseTrigger(
  trigger: AutomationTriggerDefinition,
  ownerKind: AutomationOwnerKind,
  access: AutomationAccess | null | undefined
): boolean {
  if (!trigger.allowedOwners.includes(ownerKind)) return false;
  if (!hasCapability(trigger.requiredCapability, access)) return false;

  if (trigger.domain === 'wallet' && !can('use-financial-triggers', access)) return false;
  if (trigger.domain === 'location' && !can('use-location-triggers', access)) return false;

  return true;
}

/**
 * Whether an action may be offered.
 *
 * The `reachesOtherPeople` gate is the one that matters: §49 forbids trusting
 * the frontend for the notification recipient, and while the server re-decides
 * at dispatch, offering the control to somebody who cannot use it produces a
 * builder that saves and then 403s.
 */
export function canUseAction(
  action: AutomationActionDefinition,
  ownerKind: AutomationOwnerKind,
  access: AutomationAccess | null | undefined
): boolean {
  if (!action.allowedOwners.includes(ownerKind)) return false;
  if (!hasCapability(action.requiredCapability, access)) return false;
  if (action.reachesOtherPeople && !can('notify-others', access)) return false;
  return true;
}

/**
 * Whether the member has room for another active automation. §55 · §67.
 *
 * Returns the limit and the count rather than a boolean, so the UI can warn
 * *before* the last slot rather than refusing at it — "2 of your 20 left" is a
 * different message from "you have reached your limit", and members should see
 * the first.
 */
export interface AutomationQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
  isAtLimit: boolean;
  /** True when the member is close enough that the UI should say so. */
  isNearLimit: boolean;
}

export function evaluateQuota(
  activeCount: number,
  access: AutomationAccess | null | undefined
): AutomationQuota {
  const limit = access?.maxActiveAutomations ?? null;

  if (limit === null) {
    return { used: activeCount, limit: null, remaining: null, isAtLimit: false, isNearLimit: false };
  }

  const remaining = Math.max(0, limit - activeCount);
  return {
    used: activeCount,
    limit,
    remaining,
    isAtLimit: remaining === 0,
    // Three, or a tenth of the allowance, whichever is larger — so a member
    // with a limit of 10 is warned at 7 and one with a limit of 200 at 180
    // rather than at 197.
    isNearLimit: remaining > 0 && remaining <= Math.max(3, Math.floor(limit / 10)),
  };
}

/**
 * Whether this member may act on this automation's scope.
 *
 * §45: a member must not edit an automation outside their scope. The client
 * check is a courtesy — the server refuses regardless — but without it a
 * member who arrives at a detail screen by deep link sees edit controls that
 * 403 on use, which reads as a bug rather than as a permission.
 */
export function canManageScope(
  ownerKind: AutomationOwnerKind,
  isOwnedByViewer: boolean,
  access: AutomationAccess | null | undefined
): boolean {
  if (isOwnedByViewer && ownerKind === 'user') return can('create-personal', access);
  if (isOwnedByViewer) return true;

  // Somebody else's automation — a community or organization one a co-manager
  // is looking at. Needs the explicit management capability, which is separate
  // from the create capability because reviewing a colleague's automation and
  // editing it are different permissions.
  return can('manage-others-automations', access);
}
