// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community access decisions (Frontend Phase 13, §37, §62)
//
// The rule this file exists to make structural rather than aspirational:
//
//     UI VISIBILITY IS NOT AUTHORIZATION. THE BACKEND IS AUTHORITATIVE.
//
// §62 forbids trusting frontend community state for membership, roles,
// moderation, ambassador status, community permissions, content access or
// private statistics. §37 adds that a role-aware UI must never assume a role
// means the user is authorized.
//
// So there is exactly one way to ask "may this member do X?" — read the boolean
// the *server* put in `CommunityCapabilities`. And there is deliberately **no**
// function in this file that takes a `CommunityRole` and returns a permission.
// Not a private one, not a convenience one. If somebody adds
// `canModerate(roles)` later, the whole guarantee is gone, so the shape of this
// module is the enforcement: `CommunityRole` appears in exactly one exported
// signature (`hasRoleBadge`) and that function's name says it is about a badge.
//
// ── The three-way answer ─────────────────────────────────────────────────────
//
// `evaluateCommunityAction` returns one of three verdicts rather than a boolean,
// because the UI genuinely renders three different things:
//
//   `allowed`   the server said yes. Show the affordance.
//   `hidden`    the server said nothing, or said no. Show **nothing**.
//   `blocked`   the server said no *and* named a reason worth showing — a
//               suspended community, a revoked membership. Show the reason.
//
// `hidden` rather than "disabled" is the default on purpose. A greyed-out
// "Review reports" button tells somebody they are nearly a moderator, invites
// them to ask why not, and leaks the shape of the community's governance to
// anybody who opens the screen. §34's requirement that moderation authorization
// not be implemented in the frontend is easier to honour if the frontend does
// not draw the door.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Community,
  CommunityCapabilities,
  CommunityMembership,
  CommunityRole,
  CommunityUnavailableReason,
} from '@/types/community-directory';
import { noCommunityCapabilities } from '@/types/community-directory';

/**
 * The actions the UI gates. One per capability field, named for what a member
 * would be doing rather than for the field.
 */
export type CommunityAction =
  | 'view-members'
  | 'view-private-statistics'
  | 'post-to-community'
  | 'moderate-content'
  | 'review-reports'
  | 'publish-notice'
  | 'manage-rules'
  | 'manage-roles'
  | 'appoint-administrators'
  | 'request-deletion'
  | 'transfer-ownership'
  | 'view-moderation-queue'
  | 'view-ambassador-directory'
  | 'manage-initiatives';

/**
 * The map from action to capability field.
 *
 * A `Record` with an exhaustive key type, so adding an action without adding its
 * capability is a compile error. This is the only place the two vocabularies
 * meet.
 */
const ACTION_CAPABILITY: Record<CommunityAction, keyof CommunityCapabilities> = {
  'view-members': 'canViewMembers',
  'view-private-statistics': 'canViewPrivateStatistics',
  'post-to-community': 'canPostToCommunity',
  'moderate-content': 'canModerateContent',
  'review-reports': 'canReviewReports',
  'publish-notice': 'canPublishNotice',
  'manage-rules': 'canManageRules',
  'manage-roles': 'canManageRoles',
  'appoint-administrators': 'canAppointAdministrators',
  'request-deletion': 'canRequestDeletion',
  'transfer-ownership': 'canTransferOwnership',
  'view-moderation-queue': 'canViewModerationQueue',
  'view-ambassador-directory': 'canViewAmbassadorDirectory',
  'manage-initiatives': 'canManageInitiatives',
};

export type CommunityAccessVerdict =
  /** The server reported the capability. Render the affordance. */
  | { kind: 'allowed' }
  /** No capability was reported. Render nothing at all. */
  | { kind: 'hidden' }
  /** Refused, with a reason the member is entitled to see. */
  | { kind: 'blocked'; reason: CommunityUnavailableReason; detail?: string };

/**
 * The only way to ask whether an affordance may be shown.
 *
 * Order matters, and it is the order of increasing specificity: a suspended
 * community blocks everything regardless of capability, because a member whose
 * community was suspended needs to be told that rather than told they lack a
 * permission. A revoked membership is next for the same reason. Only then is the
 * capability consulted — and a missing capability set is `hidden`, never
 * `allowed`.
 */
export function evaluateCommunityAction(input: {
  action: CommunityAction;
  capabilities: CommunityCapabilities | null | undefined;
  /** For the lifecycle checks. Omitted where the caller has not loaded it. */
  community?: Community | null;
  membership?: CommunityMembership | null;
}): CommunityAccessVerdict {
  const { action, capabilities, community, membership } = input;

  if (community?.status === 'Suspended') {
    return {
      kind: 'blocked',
      reason: 'community-suspended',
      detail: community.statusReason ?? undefined,
    };
  }

  if (community?.status === 'Archived') {
    return {
      kind: 'blocked',
      reason: 'community-archived',
      detail: community.statusReason ?? undefined,
    };
  }

  if (membership?.state === 'Revoked') {
    return {
      kind: 'blocked',
      reason: 'membership-revoked',
      detail: membership.stateReason ?? undefined,
    };
  }

  // No capability set means the server has not said this caller may do anything.
  // Absence is refusal — never an invitation to guess from the role.
  if (!capabilities) return { kind: 'hidden' };

  return capabilities[ACTION_CAPABILITY[action]] === true ? { kind: 'allowed' } : { kind: 'hidden' };
}

/** The common case, for a `{verdict.kind === 'allowed' && …}` render. */
export function canPerform(
  action: CommunityAction,
  capabilities: CommunityCapabilities | null | undefined
): boolean {
  return evaluateCommunityAction({ action, capabilities }).kind === 'allowed';
}

/**
 * Whether a role badge may be rendered.
 *
 * The **only** exported function in this module that reads a role, and it
 * decides a badge and nothing else. §35 forbids implying ambassador status
 * without backend authorization; a badge that came from the server's own `roles`
 * echo is the server's statement, so rendering it is reporting rather than
 * asserting. Nothing gated on a capability may be gated on this.
 */
export function hasRoleBadge(
  role: CommunityRole,
  membership: CommunityMembership | null | undefined
): boolean {
  return Boolean(membership?.roles?.includes(role));
}

/**
 * The capability set to use when none was loaded.
 *
 * Exported so a screen can render its `useCommunityCapabilities()` result
 * without a null check and still get the safe answer. `noCommunityCapabilities`
 * is every field false, so the fallback cannot accidentally permit anything.
 */
export function capabilitiesOrNone(
  communityId: string,
  capabilities: CommunityCapabilities | null | undefined
): CommunityCapabilities {
  return capabilities ?? noCommunityCapabilities(communityId);
}

/**
 * Whether a community can be interacted with at all.
 *
 * §75's lifecycle, as the one check every community screen runs before it draws
 * anything. `Pending` is readable but not joinable, which is why it is not in
 * the blocked set — the profile renders, the Join button does not.
 */
export function communityUnavailableReason(
  community: Community | null | undefined
): CommunityUnavailableReason | null {
  if (!community) return 'not-found';

  switch (community.status) {
    case 'Suspended':
      return 'community-suspended';
    case 'Archived':
      return 'community-archived';
    case 'Unavailable':
      return 'not-found';
    case 'Active':
    case 'Pending':
    default:
      return null;
  }
}

/**
 * Whether the membership actions in §33 may be offered.
 *
 * Deliberately conservative, and deliberately **not** an authorization: the
 * server decides whether a join succeeds. What this decides is whether offering
 * the button would be incoherent — a Join button on a community the member has
 * already joined, or on one the community has just removed them from.
 *
 * A `Revoked` membership offers nothing. §74 requires the state to be distinct
 * from `None`, and the reason is exactly this: offering "Join" to somebody the
 * community removed an hour ago is worse than offering nothing.
 */
export function offerableMembershipActions(input: {
  community: Community | null | undefined;
  membership: CommunityMembership | null | undefined;
  /** True when the member already has a primary community set. */
  hasPrimary: boolean;
}): Set<
  | 'join'
  | 'leave'
  | 'follow'
  | 'unfollow'
  | 'express-interest'
  | 'remove-interest'
  | 'set-primary'
  | 'clear-primary'
  | 'cancel-application'
> {
  const { community, membership, hasPrimary } = input;
  const offers = new Set<
    | 'join'
    | 'leave'
    | 'follow'
    | 'unfollow'
    | 'express-interest'
    | 'remove-interest'
    | 'set-primary'
    | 'clear-primary'
    | 'cancel-application'
  >();

  if (!community) return offers;
  if (community.status === 'Suspended' || community.status === 'Archived') return offers;
  if (community.status === 'Unavailable') return offers;

  const state = membership?.state ?? 'None';

  // A community the member was removed from offers nothing. Rejoining, where the
  // community permits it, is a decision the community makes — not a button.
  if (state === 'Revoked' || state === 'Declined') return offers;

  switch (state) {
    case 'None':
    case 'Discovering':
    case 'Left':
      if (community.status === 'Active') offers.add('join');
      offers.add('follow');
      offers.add('express-interest');
      break;

    case 'Interested':
      if (community.status === 'Active') offers.add('join');
      offers.add('follow');
      offers.add('remove-interest');
      break;

    case 'Following':
      if (community.status === 'Active') offers.add('join');
      offers.add('unfollow');
      offers.add('express-interest');
      break;

    case 'PendingApproval':
      offers.add('cancel-application');
      break;

    case 'Member':
    case 'VerifiedMember':
      // The platform says who may leave: every member except the owner, whom it
      // refuses. Until 11 Sep 2026 this offered "Leave" by state alone, and the
      // founder's own page showed it beside the owner badge — one tap from a
      // community with nobody left who could appoint anyone.
      if (membership?.capabilities?.canLeave) offers.add('leave');
      if (membership?.isPrimary) {
        if (hasPrimary) offers.add('clear-primary');
      } else {
        offers.add('set-primary');
      }
      break;

    default:
      break;
  }

  return offers;
}
