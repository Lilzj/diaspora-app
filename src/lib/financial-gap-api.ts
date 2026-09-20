// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — API client for UNSUPPORTED financial capabilities
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/financial-gaps.ts`. ⚠
//
// Deliberately separate from `financial-api.ts`, and deliberately behind
// `/financial-gap/v0` rather than `/financial`. Two consequences, both wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether it
//     talks to a real backend.
//   * If one of these calls ever escapes a development build, it 404s at the
//     gateway. It cannot collide with, shadow, or be mistaken for a certified
//     financial route, and it cannot move real money.
//
// Every function here also refuses to run when gap features are disabled, so
// the guarantee does not depend on a screen remembering to check.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { FinancialError, toFinancialError } from './financial-errors';
import { GAP_ROUTE_PREFIX, areGapFeaturesEnabled, BACKEND_GAPS } from '@/config/financial-gaps';
import type { PlatformEnvelope } from '@/types/financial';
import type {
  CreateConversionRequest,
  CreateDepositRequest,
  CreateWithdrawalRequest,
  Deposit,
  DepositLimits,
  PayoutDestination,
  RewardBalance,
  RewardConversion,
  RewardConversionPolicy,
  RewardConversionPreview,
  RewardHistoryPage,
  Withdrawal,
  WithdrawalLimits,
} from '@/types/financial-gaps';

/** Query keys, namespaced away from `financialKeys` so a cache dump is unambiguous. */
export const financialGapKeys = {
  all: ['financial-gap'] as const,

  deposits: () => ['financial-gap', 'deposits'] as const,
  depositLimits: (currency: string) => ['financial-gap', 'deposits', 'limits', currency] as const,

  withdrawals: () => ['financial-gap', 'withdrawals'] as const,
  withdrawalLimits: (currency: string) => ['financial-gap', 'withdrawals', 'limits', currency] as const,
  destinations: () => ['financial-gap', 'withdrawals', 'destinations'] as const,

  rewards: () => ['financial-gap', 'rewards'] as const,
  rewardBalance: () => ['financial-gap', 'rewards', 'balance'] as const,
  rewardHistory: () => ['financial-gap', 'rewards', 'history'] as const,
  conversionPolicy: () => ['financial-gap', 'rewards', 'conversion-policy'] as const,
  conversions: () => ['financial-gap', 'rewards', 'conversions'] as const,
};

/**
 * The refusal a gap route produces in a build where gap features are off.
 *
 * A `FinancialError` rather than a thrown string, so the same error components
 * render it as render every other financial failure — a member on a production
 * build sees a coherent "not available yet" rather than a crash.
 */
function unavailable(gapId: string): FinancialError {
  const gap = BACKEND_GAPS[gapId];
  return new FinancialError({
    kind: 'unavailable',
    code: `frontend.gap.${gapId}`,
    message: `${gap?.title ?? 'This'} is not available on Diaspora yet.`,
    hint: 'The platform does not support it yet. We will let you know when it arrives.',
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
  });
}

function assertEnabled(gapId: string): void {
  if (!areGapFeaturesEnabled()) throw unavailable(gapId);
}

async function read<T>(gapId: string, path: string, params?: Record<string, unknown> | object): Promise<T> {
  assertEnabled(gapId);
  try {
    const response = await apiClient.get<PlatformEnvelope<T>>(`${GAP_ROUTE_PREFIX}${path}`, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

async function write<T>(gapId: string, path: string, body?: unknown): Promise<T> {
  assertEnabled(gapId);
  try {
    const response = await apiClient.post<PlatformEnvelope<T>>(`${GAP_ROUTE_PREFIX}${path}`, body);
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ── Deposits — GAP: deposit ──────────────────────────────────────────────────

export function fetchDepositLimits(currency: string): Promise<DepositLimits> {
  return read<DepositLimits>('deposit', '/wallets/me/deposits/limits', { currency });
}

export function fetchDeposits(): Promise<Deposit[]> {
  return read<Deposit[]>('deposit', '/wallets/me/deposits');
}

export function createDeposit(request: CreateDepositRequest): Promise<Deposit> {
  return write<Deposit>('deposit', '/wallets/me/deposits', request);
}

/** The authoritative state of one deposit. Polled exactly as a real payment would be. */
export function fetchDeposit(depositId: string): Promise<Deposit> {
  return read<Deposit>('deposit', `/wallets/me/deposits/${depositId}`);
}

// ── Withdrawals — GAP: withdrawal ────────────────────────────────────────────

export function fetchWithdrawalLimits(currency: string): Promise<WithdrawalLimits> {
  return read<WithdrawalLimits>('withdrawal', '/wallets/me/withdrawals/limits', { currency });
}

/**
 * The member's payout destinations.
 *
 * Returns masked labels and server-issued ids only. No account number ever
 * reaches this client, which is how §10's "do not store payout credentials in
 * unencrypted client persistence" is satisfied by construction rather than by
 * remembering not to.
 */
export function fetchPayoutDestinations(): Promise<PayoutDestination[]> {
  return read<PayoutDestination[]>('withdrawal', '/wallets/me/withdrawals/destinations');
}

export function fetchWithdrawals(): Promise<Withdrawal[]> {
  return read<Withdrawal[]>('withdrawal', '/wallets/me/withdrawals');
}

export function createWithdrawal(request: CreateWithdrawalRequest): Promise<Withdrawal> {
  return write<Withdrawal>('withdrawal', '/wallets/me/withdrawals', request);
}

export function fetchWithdrawal(withdrawalId: string): Promise<Withdrawal> {
  return read<Withdrawal>('withdrawal', `/wallets/me/withdrawals/${withdrawalId}`);
}

export function cancelWithdrawal(withdrawalId: string): Promise<Withdrawal> {
  return write<Withdrawal>('withdrawal', `/wallets/me/withdrawals/${withdrawalId}/cancel`);
}

// ── Creator rewards — GAP: rewards ───────────────────────────────────────────

export function fetchRewardBalance(): Promise<RewardBalance> {
  return read<RewardBalance>('rewards', '/rewards/me');
}

/**
 * Unused — the live path is `fetchRewardPointsHistory` in `financial-api.ts`.
 *
 * The parameter names are the route's own. They used to be `cursor`/`limit`,
 * which this route has never bound: whoever wired this next would have had
 * every request answered as page one, with nothing to say so. That is not a
 * hypothetical — it is what `GET /creators/me/activity` did for its whole life.
 */
export function fetchRewardHistory(
  params: { before?: string; excludeIds?: string[]; take?: number } = {}
): Promise<RewardHistoryPage> {
  return read<RewardHistoryPage>('rewards', '/rewards/me/history', params);
}

/** The rules. The rate lives here so no screen multiplies points by a constant. */
export function fetchConversionPolicy(): Promise<RewardConversionPolicy> {
  return read<RewardConversionPolicy>('rewards', '/rewards/conversion');
}

/**
 * What converting `points` would produce.
 *
 * Asked for rather than computed, even though the policy above carries a rate.
 * The rate is for *explaining* the deal; the preview is the number the member
 * is shown before they confirm, and it has to be the server's arithmetic or the
 * confirmation screen and the receipt will eventually disagree by a penny.
 */
export function previewConversion(points: number): Promise<RewardConversionPreview> {
  return write<RewardConversionPreview>('rewards', '/rewards/conversions/preview', { points });
}

export function createConversion(request: CreateConversionRequest): Promise<RewardConversion> {
  return write<RewardConversion>('rewards', '/rewards/conversions', request);
}

export function fetchConversions(): Promise<RewardConversion[]> {
  return read<RewardConversion[]>('rewards', '/rewards/conversions');
}
