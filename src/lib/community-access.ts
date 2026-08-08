// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life access (Frontend Phase 12)
//
// What to *draw*, never what to allow. The same contract as
// `financial-access.ts` and `creator-access.ts`, for the same reason: a member
// should see a disabled control with an explanation rather than a control that
// produces a 403, and every check here is re-decided by the server on the
// request that follows.
//
// §19 of the phase brief — "no frontend component makes authoritative
// authorization decisions" — is why this module is deliberately small, and why
// it is split into two halves that must not be confused:
//
//   **The platform ladder.** `AccountState` → `AccessTier`, owned by Trust and
//   mirrored by `financial-access.ts`. Decides whether somebody may spend, give
//   or publish at all. This module delegates and does not re-implement it.
//
//   **The organization's decision.** Whether this member may approve a
//   membership application, publish a campaign or close a poll is an
//   *organization* fact, and no amount of account state answers it. It arrives
//   as `OrganizationCapabilities` from the server — GAP-013 — and is rendered,
//   never computed. There is no function in this file that derives an
//   organization capability from anything, because deriving one would be
//   exactly the thing §19 prohibits.
//
// The distinction matters because the two disagree in both directions. A fully
// verified member is not an administrator of any organization. An organization
// Owner whose account is Restricted must lose the ability to spend the
// organization's money while keeping the ability to read its dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccountState } from '@/types/trust';
import type { MembershipStatus, OrganizationCapabilities } from '@/types/community-advanced';
import {
  AccessTier,
  FinancialPermissions,
  holdsPermission,
  isRestricted,
  toAccessTier,
  type AccessRefusal,
} from './financial-access';

/** The community capabilities a screen actually branches on. */
export const CommunityCapabilities = {
  /** Open the Community Life hub. Everyone, including a signed-out browser. */
  ViewHub: 'community.hub.view',
  /** See a membership programme's details. */
  ViewMembership: 'community.membership.view',
  /** Apply to join a community. */
  ApplyMembership: 'community.membership.apply',
  /** Pay for a membership tier. Moves money. */
  PayMembership: 'community.membership.pay',
  /** Register for an event or an occurrence. */
  RegisterEvent: 'community.event.register',
  /** Create an event series. */
  CreateSeries: 'community.series.create',
  /** Donate to a campaign. Moves money. */
  Donate: 'community.donation.create',
  /** See your own giving history. */
  ViewGiving: 'community.giving.read',
  /** Create a fundraising campaign. */
  CreateCampaign: 'community.campaign.create',
  /** Apply for a volunteer opportunity. */
  ApplyVolunteer: 'community.volunteer.apply',
  /** Vote in a poll. */
  VotePoll: 'community.poll.vote',
  /** Open an organization dashboard at all. Organization role decides the rest. */
  ViewOrganizationDashboard: 'community.organization.dashboard',
} as const;

export type CommunityCapability =
  (typeof CommunityCapabilities)[keyof typeof CommunityCapabilities];

interface CapabilityRule {
  /** The platform tier the action needs, from Trust's ladder. */
  minimumTier: AccessTier;
  /**
   * Whether a restricted account keeps it.
   *
   * Reading survives restriction throughout this app. Anything that spends,
   * joins, applies, votes or publishes does not — a restricted member's vote
   * is exactly the kind of thing a restriction exists to withhold.
   */
  grantedWhenRestricted: boolean;
  /**
   * The B15 permission this mirrors, where one exists.
   *
   * Set on every capability that moves money, so the community ladder cannot
   * drift from the financial one: if B15 raises the bar for giving, this file
   * follows automatically rather than by somebody remembering.
   */
  mirrors?: (typeof FinancialPermissions)[keyof typeof FinancialPermissions];
}

const RULES: Record<CommunityCapability, CapabilityRule> = {
  // ── Reading. Opens early and survives restriction. ────────────────────────
  [CommunityCapabilities.ViewHub]: {
    minimumTier: AccessTier.Anonymous,
    grantedWhenRestricted: true,
  },
  [CommunityCapabilities.ViewMembership]: {
    minimumTier: AccessTier.Anonymous,
    grantedWhenRestricted: true,
  },
  [CommunityCapabilities.ViewGiving]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: true,
    mirrors: FinancialPermissions.GivingRead,
  },
  [CommunityCapabilities.ViewOrganizationDashboard]: {
    // Opening the dashboard is reading. Every *action* inside it is separately
    // gated by `OrganizationCapabilities`, which the server decides.
    minimumTier: AccessTier.Onboarding,
    grantedWhenRestricted: true,
  },

  // ── Participation. Needs a real, unrestricted account. ────────────────────
  [CommunityCapabilities.RegisterEvent]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
  },
  [CommunityCapabilities.ApplyMembership]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
  },
  [CommunityCapabilities.ApplyVolunteer]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
  },
  [CommunityCapabilities.VotePoll]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
  },
  [CommunityCapabilities.CreateSeries]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
  },

  // ── Money and publishing. Verified only. ──────────────────────────────────
  [CommunityCapabilities.Donate]: {
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
    mirrors: FinancialPermissions.GivingCreate,
  },
  [CommunityCapabilities.PayMembership]: {
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
    mirrors: FinancialPermissions.PaymentsManage,
  },
  [CommunityCapabilities.CreateCampaign]: {
    // A campaign asks strangers for money. It sits at the same bar as spending.
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
  },
};

/**
 * Whether the control should be drawn enabled.
 *
 * Where a capability mirrors a B15 permission, the answer is delegated so the
 * two ladders cannot disagree. Where it does not, the local rule applies.
 */
export function holdsCommunityCapability(
  capability: CommunityCapability,
  state: AccountState | undefined | null,
  isAuthenticated: boolean
): boolean {
  const rule = RULES[capability];
  if (!rule) return false;

  if (rule.mirrors) {
    return holdsPermission(rule.mirrors, state, isAuthenticated);
  }

  if (rule.minimumTier === AccessTier.Anonymous) return true;
  if (!isAuthenticated) return false;
  if (isRestricted(state) && !rule.grantedWhenRestricted) return false;

  return toAccessTier(state) >= rule.minimumTier;
}

/**
 * The refusal, in words a member can act on.
 *
 * Reuses `AccessRefusal` rather than defining a community-specific one, so
 * Phase 5's `<AccessGate>` renders it unchanged. One refusal surface in this
 * app; a second would drift.
 */
export function checkCommunityAccess(
  capability: CommunityCapability,
  state: AccountState | undefined | null,
  isAuthenticated: boolean
): AccessRefusal {
  if (holdsCommunityCapability(capability, state, isAuthenticated)) {
    return { allowed: true };
  }

  if (!isAuthenticated) {
    return {
      allowed: false,
      reason: 'signedOut',
      message: 'Sign in to take part in your community.',
      action: 'signIn',
    };
  }

  const rule = RULES[capability];

  if (isRestricted(state) && rule && !rule.grantedWhenRestricted) {
    return {
      allowed: false,
      reason: 'restricted',
      message:
        'Your account is restricted, so this is paused for now. You can still browse your community.',
      action: 'appeal',
    };
  }

  const tier = toAccessTier(state);

  if (tier === AccessTier.PendingVerification) {
    return {
      allowed: false,
      reason: 'pendingVerification',
      message: 'Your verification is being reviewed. This opens once it is approved.',
    };
  }

  if (tier === AccessTier.Onboarding) {
    return {
      allowed: false,
      reason: 'onboarding',
      message: 'Finish setting up your account to take part.',
      action: 'verify',
    };
  }

  return {
    allowed: false,
    reason: 'unverified',
    message: 'Verify your account to take part in your community.',
    action: 'verify',
  };
}

/** The capability set a Community Life screen branches on. */
export interface CommunityAccess {
  tier: AccessTier;
  isRestricted: boolean;
  isAuthenticated: boolean;
  canViewHub: boolean;
  canViewMembership: boolean;
  canApplyMembership: boolean;
  canPayMembership: boolean;
  canRegisterEvent: boolean;
  canCreateSeries: boolean;
  canDonate: boolean;
  canViewGiving: boolean;
  canCreateCampaign: boolean;
  canApplyVolunteer: boolean;
  canVotePoll: boolean;
  canViewOrganizationDashboard: boolean;
}

export function resolveCommunityAccess(
  state: AccountState | undefined | null,
  isAuthenticated: boolean
): CommunityAccess {
  const check = (capability: CommunityCapability) =>
    holdsCommunityCapability(capability, state, isAuthenticated);

  return {
    tier: isAuthenticated ? toAccessTier(state) : AccessTier.Anonymous,
    isRestricted: isRestricted(state),
    isAuthenticated,
    canViewHub: check(CommunityCapabilities.ViewHub),
    canViewMembership: check(CommunityCapabilities.ViewMembership),
    canApplyMembership: check(CommunityCapabilities.ApplyMembership),
    canPayMembership: check(CommunityCapabilities.PayMembership),
    canRegisterEvent: check(CommunityCapabilities.RegisterEvent),
    canCreateSeries: check(CommunityCapabilities.CreateSeries),
    canDonate: check(CommunityCapabilities.Donate),
    canViewGiving: check(CommunityCapabilities.ViewGiving),
    canCreateCampaign: check(CommunityCapabilities.CreateCampaign),
    canApplyVolunteer: check(CommunityCapabilities.ApplyVolunteer),
    canVotePoll: check(CommunityCapabilities.VotePoll),
    canViewOrganizationDashboard: check(CommunityCapabilities.ViewOrganizationDashboard),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Organization capabilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The capability set for somebody with no role in an organization.
 *
 * Used as the value a repository returns *before* the server has answered, so a
 * dashboard renders nothing management-related during the first paint rather
 * than flashing controls and then withdrawing them. Every flag is false: the
 * conservative direction is the only safe default for an authorization answer.
 */
export function noOrganizationCapabilities(organizationId: string): OrganizationCapabilities {
  return {
    organizationId,
    role: null,
    canManageMembers: false,
    canApproveMembers: false,
    canManageTiers: false,
    canManageEvents: false,
    canManageCampaigns: false,
    canManageVolunteers: false,
    canManagePolls: false,
    canPublishAnnouncements: false,
    canViewAnalytics: false,
    canViewFinancials: false,
  };
}

/**
 * Combines the organization's answer with the platform ladder.
 *
 * The organization may say a Treasurer can manage campaigns; the platform still
 * says a Restricted account cannot spend. The **intersection** is what the UI
 * draws, and the server enforces both independently.
 *
 * Note the direction of the combination: this can only ever *remove*
 * capabilities. There is no path through this function that grants one the
 * organization did not, which is what keeps §19 true.
 */
export function combineOrganizationCapabilities(
  granted: OrganizationCapabilities,
  access: CommunityAccess
): OrganizationCapabilities {
  const restricted = access.isRestricted || !access.isAuthenticated;

  if (!restricted) return granted;

  return {
    ...granted,
    // Reading survives restriction, exactly as it does everywhere else.
    canManageMembers: false,
    canApproveMembers: false,
    canManageTiers: false,
    canManageEvents: false,
    canManageCampaigns: false,
    canManageVolunteers: false,
    canManagePolls: false,
    canPublishAnnouncements: false,
    canViewAnalytics: granted.canViewAnalytics,
    canViewFinancials: granted.canViewFinancials,
  };
}

/**
 * Whether a membership status should let its holder into members-only surfaces.
 *
 * Advisory, and named so it cannot be mistaken for an authorization check: a
 * private poll is withheld by the server, and this only decides whether the
 * client bothers asking.
 */
export function membershipOpensMemberSurfaces(status: MembershipStatus | undefined | null): boolean {
  return status === 'Active' || status === 'RenewalDue';
}
