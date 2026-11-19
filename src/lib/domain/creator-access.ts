// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator access (Frontend Phase 7)
//
// What to *draw*, never what to allow. Same contract as `financial-access.ts`,
// and for the same reason: every check here exists so a member sees a disabled
// control with an explanation instead of a control that produces a 403, and
// every one of them is re-decided by the server on the request that follows.
//
// Two ladders meet on the creator surface and they are not the same ladder:
//
//   **The platform's access tier** — `AccountState` → `AccessTier`, owned by
//   Trust. Decides whether somebody may spend money, publish, or see their own
//   wallet. This module does not re-implement it; it delegates to
//   `financial-access.ts`, which mirrors B15's own table.
//
//   **The creator programme's status** — `CreatorStatus`, owned by the (absent)
//   creator platform. Decides whether somebody may sponsor content, apply for a
//   grant, or appear in the directory.
//
// Keeping them separate matters because they disagree in both directions. A
// fully verified member can be `NotACreator`. A `TopCreator` can be `Suspended`
// and must lose the ability to spend while keeping the ability to read. Folding
// them into one number would lose exactly the cases that need care.
//
// §37: the frontend never trusts a client-side entitlement. Everything here is
// advisory, and the accompanying comment on each rule says what the server does.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccountState } from '@/types/trust';
import type { CreatorStatus } from '@/types/creator-economy';
import { AccessTier, isRestricted, toAccessTier, type AccessRefusal } from './financial-access';

/** The creator-programme capabilities a screen actually branches on. */
export const CreatorCapabilities = {
  /** Open the dashboard at all. */
  ViewDashboard: 'creator.dashboard.view',
  /** Edit the creator-facing profile. */
  ManageProfile: 'creator.profile.manage',
  /** Apply for creator verification. */
  ApplyVerification: 'creator.verification.apply',
  /** Join a challenge. */
  JoinChallenge: 'creator.challenge.join',
  /** Claim a milestone, challenge or reward. Grants something of value. */
  ClaimReward: 'creator.reward.claim',
  /** Convert points into wallet credit. Moves money. */
  ConvertPoints: 'creator.points.convert',
  /** Apply for a community grant. */
  ApplyGrant: 'creator.grant.apply',
  /** Buy a sponsored placement. Moves money. */
  SponsorContent: 'creator.sponsored.purchase',
  /** See the revenue dashboard. Reading survives restriction. */
  ViewRevenue: 'creator.revenue.view',
  /** Share a referral link. */
  ShareReferral: 'creator.referral.share',
} as const;

export type CreatorCapability =
  (typeof CreatorCapabilities)[keyof typeof CreatorCapabilities];

interface CapabilityRule {
  /** The platform tier the action needs, from Trust's ladder. */
  minimumTier: AccessTier;
  /**
   * Whether a restricted account keeps it.
   *
   * Reading survives restriction throughout this app. Anything that grants,
   * spends, claims or publishes does not.
   */
  grantedWhenRestricted: boolean;
  /**
   * Creator statuses that block it regardless of tier.
   *
   * `Suspended` blocks everything but reading; `Restricted` blocks the same
   * things `isRestricted` does at platform level, because a creator-level
   * restriction and an account-level one should feel identical to the member.
   */
  blockedByStatus: CreatorStatus[];
}

const SUSPENDED_ONLY: CreatorStatus[] = ['Suspended'];
const SUSPENDED_OR_RESTRICTED: CreatorStatus[] = ['Suspended', 'Restricted'];

const RULES: Record<CreatorCapability, CapabilityRule> = {
  [CreatorCapabilities.ViewDashboard]: {
    minimumTier: AccessTier.Onboarding,
    grantedWhenRestricted: true,
    blockedByStatus: [],
  },
  [CreatorCapabilities.ViewRevenue]: {
    // Mirrors `financial:wallet:read`, which opens at Onboarding and survives
    // restriction: somebody under review must still be able to see what they
    // are owed.
    minimumTier: AccessTier.Onboarding,
    grantedWhenRestricted: true,
    blockedByStatus: [],
  },
  [CreatorCapabilities.ManageProfile]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_ONLY,
  },
  [CreatorCapabilities.ApplyVerification]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
  [CreatorCapabilities.JoinChallenge]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
  [CreatorCapabilities.ShareReferral]: {
    minimumTier: AccessTier.Limited,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
  [CreatorCapabilities.ClaimReward]: {
    // A claim grants something. Same bar as anything else that has value.
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
  [CreatorCapabilities.ConvertPoints]: {
    // Moves money into a wallet. `financial:payments:manage`'s bar, exactly.
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
  [CreatorCapabilities.ApplyGrant]: {
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
  [CreatorCapabilities.SponsorContent]: {
    // Spends money through B15, which requires `financial:purchases:create`.
    minimumTier: AccessTier.Verified,
    grantedWhenRestricted: false,
    blockedByStatus: SUSPENDED_OR_RESTRICTED,
  },
};

/** A creator-programme refusal. Extends the financial one with a creator arm. */
export type CreatorRefusal =
  | AccessRefusal
  | { allowed: false; reason: 'creatorSuspended'; message: string; action?: 'appeal' }
  | { allowed: false; reason: 'creatorRestricted'; message: string; action?: 'appeal' };

/**
 * Whether to draw the control enabled.
 *
 * Returns a *reason* rather than a boolean for the same reason
 * `checkAccess` does: "verify your identity to claim this" and "your creator
 * account is suspended" both mean the button is disabled and mean completely
 * different things to the person reading it.
 */
export function checkCreatorAccess(
  capability: CreatorCapability,
  options: {
    accountState: AccountState | undefined | null;
    isAuthenticated: boolean;
    creatorStatus?: CreatorStatus | null;
  }
): CreatorRefusal {
  const { accountState, isAuthenticated, creatorStatus } = options;

  if (!isAuthenticated) {
    return {
      allowed: false,
      reason: 'signedOut',
      message: 'Sign in to use your creator dashboard.',
      action: 'signIn',
    };
  }

  const rule = RULES[capability];
  if (!rule) {
    return { allowed: false, reason: 'unverified', message: 'This is not available yet.' };
  }

  // The creator-programme block is checked before the platform tier, because a
  // suspended creator who is also fully verified should be told they are
  // suspended — not told to verify something they have already done.
  if (creatorStatus && rule.blockedByStatus.includes(creatorStatus)) {
    return creatorStatus === 'Suspended'
      ? {
          allowed: false,
          reason: 'creatorSuspended',
          message: 'Your creator account is suspended, so this is paused. You can still see your work and what you are owed.',
          action: 'appeal',
        }
      : {
          allowed: false,
          reason: 'creatorRestricted',
          message: 'Some creator features are paused on your account while we review it.',
          action: 'appeal',
        };
  }

  if (isRestricted(accountState) && !rule.grantedWhenRestricted) {
    return {
      allowed: false,
      reason: 'restricted',
      message: 'Your account is under review, so this is paused. You can still see your work and what you are owed.',
      action: 'appeal',
    };
  }

  const tier = toAccessTier(accountState);
  if (tier >= rule.minimumTier) return { allowed: true };

  if (rule.minimumTier === AccessTier.Verified) {
    if (tier === AccessTier.PendingVerification) {
      return {
        allowed: false,
        reason: 'pendingVerification',
        message: 'Your verification is being reviewed. This unlocks as soon as it is approved.',
      };
    }
    return {
      allowed: false,
      reason: 'unverified',
      message: 'Diaspora verification is needed before you can do this.',
      action: 'verify',
    };
  }

  return {
    allowed: false,
    reason: 'onboarding',
    message: 'Finish setting up your account to use this.',
    action: 'verify',
  };
}

/** The resolved capability set, for a screen that branches on several at once. */
export interface CreatorAccess {
  tier: AccessTier;
  isRestricted: boolean;
  creatorStatus: CreatorStatus | null;
  canViewDashboard: boolean;
  canViewRevenue: boolean;
  canManageProfile: boolean;
  canApplyVerification: boolean;
  canJoinChallenge: boolean;
  canClaimReward: boolean;
  canConvertPoints: boolean;
  canApplyGrant: boolean;
  canSponsorContent: boolean;
  canShareReferral: boolean;
}

export function resolveCreatorAccess(options: {
  accountState: AccountState | undefined | null;
  isAuthenticated: boolean;
  creatorStatus?: CreatorStatus | null;
}): CreatorAccess {
  const allowed = (capability: CreatorCapability) =>
    checkCreatorAccess(capability, options).allowed;

  return {
    tier: options.isAuthenticated ? toAccessTier(options.accountState) : AccessTier.Anonymous,
    isRestricted: isRestricted(options.accountState),
    creatorStatus: options.creatorStatus ?? null,
    canViewDashboard: allowed(CreatorCapabilities.ViewDashboard),
    canViewRevenue: allowed(CreatorCapabilities.ViewRevenue),
    canManageProfile: allowed(CreatorCapabilities.ManageProfile),
    canApplyVerification: allowed(CreatorCapabilities.ApplyVerification),
    canJoinChallenge: allowed(CreatorCapabilities.JoinChallenge),
    canClaimReward: allowed(CreatorCapabilities.ClaimReward),
    canConvertPoints: allowed(CreatorCapabilities.ConvertPoints),
    canApplyGrant: allowed(CreatorCapabilities.ApplyGrant),
    canSponsorContent: allowed(CreatorCapabilities.SponsorContent),
    canShareReferral: allowed(CreatorCapabilities.ShareReferral),
  };
}
