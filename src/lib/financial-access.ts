// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial access (Backend Phase B15)
//
// A client-side mirror of B15's permission ladder, used to decide what to
// *draw* — never what to allow. The backend remains authoritative: every one of
// these checks exists so a member sees a disabled button with an explanation
// instead of a button that produces a 403, and each of them is re-decided by
// the server on the request that follows.
//
// The ladder, from `FinancialPermissionContributor.cs`:
//
//   Onboarding  financial:wallet:read                    (granted when restricted)
//   Limited     financial:payments:read                  (granted when restricted)
//               financial:purchases:read                 (granted when restricted)
//               financial:subscriptions:read             (granted when restricted)
//               financial:giving:read                    (granted when restricted)
//   Verified    financial:payments:manage
//               financial:purchases:create
//               financial:subscriptions:manage
//               financial:promotions:redeem
//               financial:giving:create
//
// Two properties of that table matter enough to encode rather than paraphrase:
//
//   * **Everything that moves money is Verified, without exception.** Trust
//     exists so the platform knows who somebody is before that happens.
//   * **Reading survives restriction.** Somebody under review must still be
//     able to see what they hold. `GrantedWhenRestricted` is true on all five
//     read permissions and false on all five write ones.
//
// The client's `AccountState` is projected onto the platform's `AccessTier` by
// the same rules as `AccessTierMap.ToTier`, so the two ladders cannot drift by
// accident — a state added to `AccountState` that this file does not know about
// lands on `Limited`, which is what the backend does with its unknowns too.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccountState } from '@/types/trust';

/** `Diaspora.Contracts.Authorization.AccessTier`. Ordered and comparable. */
export enum AccessTier {
  Anonymous = 0,
  Onboarding = 1,
  Limited = 2,
  PendingVerification = 3,
  Verified = 4,
}

/** `FinancialFeatures`. The six gates B15 owns. */
export const FinancialFeatures = {
  Wallet: 'financial.wallet',
  Payments: 'financial.payments',
  Purchases: 'financial.purchases',
  Subscriptions: 'financial.subscriptions',
  Giving: 'financial.giving',
  Operations: 'financial.operations',
} as const;

/** `FinancialPermissions`, member-facing subset. */
export const FinancialPermissions = {
  WalletRead: 'financial:wallet:read',
  PaymentsRead: 'financial:payments:read',
  PaymentsManage: 'financial:payments:manage',
  PurchasesRead: 'financial:purchases:read',
  PurchasesCreate: 'financial:purchases:create',
  SubscriptionsRead: 'financial:subscriptions:read',
  SubscriptionsManage: 'financial:subscriptions:manage',
  PromotionsRedeem: 'financial:promotions:redeem',
  GivingRead: 'financial:giving:read',
  GivingCreate: 'financial:giving:create',
} as const;

export type FinancialPermission =
  (typeof FinancialPermissions)[keyof typeof FinancialPermissions];

interface PermissionRule {
  minimumTier: AccessTier;
  grantedWhenRestricted: boolean;
}

const RULES: Record<FinancialPermission, PermissionRule> = {
  [FinancialPermissions.WalletRead]: { minimumTier: AccessTier.Onboarding, grantedWhenRestricted: true },
  [FinancialPermissions.PaymentsRead]: { minimumTier: AccessTier.Limited, grantedWhenRestricted: true },
  [FinancialPermissions.PurchasesRead]: { minimumTier: AccessTier.Limited, grantedWhenRestricted: true },
  [FinancialPermissions.SubscriptionsRead]: { minimumTier: AccessTier.Limited, grantedWhenRestricted: true },
  [FinancialPermissions.GivingRead]: { minimumTier: AccessTier.Limited, grantedWhenRestricted: true },

  [FinancialPermissions.PaymentsManage]: { minimumTier: AccessTier.Verified, grantedWhenRestricted: false },
  [FinancialPermissions.PurchasesCreate]: { minimumTier: AccessTier.Verified, grantedWhenRestricted: false },
  [FinancialPermissions.SubscriptionsManage]: { minimumTier: AccessTier.Verified, grantedWhenRestricted: false },
  [FinancialPermissions.PromotionsRedeem]: { minimumTier: AccessTier.Verified, grantedWhenRestricted: false },
  [FinancialPermissions.GivingCreate]: { minimumTier: AccessTier.Verified, grantedWhenRestricted: false },
};

/** The states in which a subject holds nothing that moves money. `AccessState.IsRestricted`. */
const RESTRICTED_STATES: ReadonlySet<AccountState> = new Set<AccountState>([
  'Suspended',
  'Restricted',
  'AppealPending',
  'VerificationRejected',
]);

/** `AccessTierMap.ToTier`, in TypeScript. */
export function toAccessTier(state: AccountState | undefined | null): AccessTier {
  if (!state) return AccessTier.Anonymous;

  switch (state) {
    case 'RegistrationStarted':
    case 'PhoneVerified':
      return AccessTier.Onboarding;

    case 'LimitedAccess':
      return AccessTier.Limited;

    case 'DiasporaVerificationPending':
    case 'VerificationUnderReview':
    case 'RequiresMoreInformation':
      return AccessTier.PendingVerification;

    case 'DiasporaVerified':
    case 'FullCommunityAccess':
      return AccessTier.Verified;

    default:
      // Suspended, Restricted, AppealPending, VerificationRejected. Reporting
      // Limited rather than Anonymous keeps "signed in but restricted"
      // distinguishable from "not signed in" — the backend's own reasoning.
      return AccessTier.Limited;
  }
}

export function isRestricted(state: AccountState | undefined | null): boolean {
  return state ? RESTRICTED_STATES.has(state) : false;
}

/** Whether the subject would hold this permission. Advisory: the server decides. */
export function holdsPermission(
  permission: FinancialPermission,
  state: AccountState | undefined | null,
  isAuthenticated: boolean
): boolean {
  if (!isAuthenticated) return false;

  const rule = RULES[permission];
  if (!rule) return false;

  if (isRestricted(state) && !rule.grantedWhenRestricted) return false;

  return toAccessTier(state) >= rule.minimumTier;
}

/**
 * Why a member cannot do something, in words they can act on.
 *
 * Returning a *reason* rather than a boolean is the point. "Verify your
 * identity to pay" and "your account is under review" both mean the button is
 * disabled and mean completely different things to the person reading it.
 */
export type AccessRefusal =
  | { allowed: true }
  | { allowed: false; reason: 'signedOut'; message: string; action?: 'signIn' }
  | { allowed: false; reason: 'restricted'; message: string; action?: 'appeal' }
  | { allowed: false; reason: 'unverified'; message: string; action?: 'verify' }
  | { allowed: false; reason: 'pendingVerification'; message: string }
  | { allowed: false; reason: 'onboarding'; message: string; action?: 'verify' };

export function checkAccess(
  permission: FinancialPermission,
  state: AccountState | undefined | null,
  isAuthenticated: boolean
): AccessRefusal {
  if (!isAuthenticated) {
    return {
      allowed: false,
      reason: 'signedOut',
      message: 'Sign in to use your Diaspora wallet.',
      action: 'signIn',
    };
  }

  const rule = RULES[permission];
  if (!rule) {
    return { allowed: false, reason: 'unverified', message: 'This is not available yet.' };
  }

  if (isRestricted(state) && !rule.grantedWhenRestricted) {
    return {
      allowed: false,
      reason: 'restricted',
      message: 'Your account is under review, so payments are paused. You can still see your balance and history.',
      action: 'appeal',
    };
  }

  const tier = toAccessTier(state);
  if (tier >= rule.minimumTier) return { allowed: true };

  if (rule.minimumTier === AccessTier.Verified) {
    if (tier === AccessTier.PendingVerification) {
      return {
        allowed: false,
        reason: 'pendingVerification',
        message: 'Your verification is being reviewed. Payments unlock as soon as it is approved.',
      };
    }
    return {
      allowed: false,
      reason: 'unverified',
      message: 'Diaspora verification is needed before money can move.',
      action: 'verify',
    };
  }

  return {
    allowed: false,
    reason: 'onboarding',
    message: 'Finish setting up your account to see this.',
    action: 'verify',
  };
}

/** The five member-facing capabilities a screen actually branches on. */
export interface FinancialAccess {
  tier: AccessTier;
  isRestricted: boolean;
  /** See your balance and statement. Opens at Onboarding and survives restriction. */
  canReadWallet: boolean;
  canReadPayments: boolean;
  canPay: boolean;
  canPurchase: boolean;
  canManageSubscription: boolean;
  canRedeemPromotion: boolean;
  canReadGiving: boolean;
  canGive: boolean;
}

export function resolveFinancialAccess(
  state: AccountState | undefined | null,
  isAuthenticated: boolean
): FinancialAccess {
  const check = (permission: FinancialPermission) =>
    holdsPermission(permission, state, isAuthenticated);

  return {
    tier: isAuthenticated ? toAccessTier(state) : AccessTier.Anonymous,
    isRestricted: isRestricted(state),
    canReadWallet: check(FinancialPermissions.WalletRead),
    canReadPayments: check(FinancialPermissions.PaymentsRead),
    canPay: check(FinancialPermissions.PaymentsManage),
    canPurchase: check(FinancialPermissions.PurchasesCreate),
    canManageSubscription: check(FinancialPermissions.SubscriptionsManage),
    canRedeemPromotion: check(FinancialPermissions.PromotionsRedeem),
    canReadGiving: check(FinancialPermissions.GivingRead),
    canGive: check(FinancialPermissions.GivingCreate),
  };
}
