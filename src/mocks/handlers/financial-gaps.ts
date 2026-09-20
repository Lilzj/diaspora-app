// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified B15 Financial
//   Platform has no deposit endpoint, no withdrawal endpoint, no payout
//   engine and no rewards or points domain of any kind. These handlers exist
//   so the frontend flows for those capabilities can be built, reviewed and
//   tested now, per §4-C of the Phase 5 brief — and so that closing the gap is
//   a change of import rather than a redesign.
//
//   Three safeguards, none of which is a comment:
//
//     * The prefix is `/financial-gap/v0`, never `/financial`. A call that
//       escaped to a real deployment 404s at the gateway.
//     * `setupFinancialGapMocks` refuses to register in a release build.
//     * Every screen behind these routes renders `<GapNotice>`, which names
//       the missing contract on the screen itself.
//
//   See `src/config/financial-gaps.ts` and
//   `frontend-financial-gap-report.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import { GAP_ROUTE_PREFIX, areGapFeaturesEnabled } from '@/config/financial-gaps';
import { money } from '../financial-data';
import type {
  Deposit,
  PayoutDestination,
  RewardConversion,
  RewardHistoryEntry,
  Withdrawal,
} from '@/types/financial-gaps';

const ROOT = GAP_ROUTE_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown): MockReply {
  return [200, { data }];
}

function problem(status: number, errorCode: string, detail: string): MockReply {
  return [
    status,
    // `code`, as PlatformProblem writes it; `errorCode` is a field no deployment sends.
    { type: `https://docs.diaspora.app/errors/${errorCode}`, title: 'Request refused', status, detail, code: errorCode },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function reference(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const body = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `${prefix}-${body}`;
}

/**
 * Registers the simulated routes — and only in a development build.
 *
 * The guard is here as well as in `financial-gap-api.ts` because defence at one
 * layer is a decision somebody can accidentally undo. A release bundle
 * registers nothing, so even a screen that ignored `areGapFeaturesEnabled()`
 * would get a 404 rather than a convincing fake.
 */
export function setupFinancialGapMocks(mock: MockAdapter) {
  if (!areGapFeaturesEnabled()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[MOCK][BACKEND GAP] Registering SIMULATED financial routes under ' +
      `${ROOT}. Deposits, withdrawals and rewards do not exist in the certified backend.`
  );

  // ── Session state ────────────────────────────────────────────────────────

  let deposits: Deposit[] = [];
  let withdrawals: Withdrawal[] = [];
  let conversions: RewardConversion[] = [];
  const idempotency = new Map<string, unknown>();

  let rewardPoints = 4_280;
  let pendingPoints = 320;
  let lifetimeEarned = 6_150;
  let lifetimeConverted = 1_870;

  /**
   * Points per minor unit. 100 points = £1.00, so 10,000 points = £100.
   *
   * The client is never allowed to apply this: it is served so the rate can be
   * *explained*, and every figure a member sees before confirming comes from
   * the preview endpoint below. That is the arrangement §12 requires and the
   * only one where the confirmation screen and the receipt cannot disagree.
   */
  const POINTS_PER_MINOR_UNIT = 1;
  const CONVERSION_FEE_PERCENTAGE = 0;
  const MINIMUM_POINTS = 1_000;
  const MAXIMUM_POINTS = 50_000;

  const DESTINATIONS: PayoutDestination[] = [
    {
      destinationId: 'dest-0001',
      kind: 'BankAccount',
      // A masked label the server produced. No account number is ever sent to
      // this client, which is how §10's prohibition is met structurally.
      maskedLabel: 'Barclays ••••4417',
      currency: 'GBP',
      countryCode: 'GB',
      isVerified: true,
      isDefault: true,
      createdAt: daysAgo(90),
    },
    {
      destinationId: 'dest-0002',
      kind: 'MobileMoney',
      maskedLabel: 'MTN Mobile Money ••••8823',
      currency: 'GHS',
      countryCode: 'GH',
      isVerified: false,
      isDefault: false,
      createdAt: daysAgo(12),
    },
  ];

  const rewardHistory: RewardHistoryEntry[] = [
    { entryId: 'rh-0012', source: 'GuideHelpfulVote', points: 25, reason: '25 people found “Opening a UK bank account” helpful', subjectType: 'Guide', subjectId: 'guide-0007', occurredAt: daysAgo(1) },
    { entryId: 'rh-0011', source: 'GuidePublished', points: 200, reason: 'Published “Registering with a GP”', subjectType: 'Guide', subjectId: 'guide-0011', occurredAt: daysAgo(4) },
    { entryId: 'rh-0010', source: 'ReviewWritten', points: 40, reason: 'Reviewed Adeola Immigration Services', subjectType: 'Provider', subjectId: 'prov-0003', occurredAt: daysAgo(7) },
    { entryId: 'rh-0009', source: 'CommunityContribution', points: 150, reason: 'Volunteered 6 hours at the Peckham food bank', subjectType: null, subjectId: null, occurredAt: daysAgo(11) },
    { entryId: 'rh-0008', source: 'ReferralJoined', points: 300, reason: 'Someone you invited completed verification', subjectType: null, subjectId: null, occurredAt: daysAgo(16) },
    { entryId: 'rh-0007', source: 'UpdatePublished', points: 75, reason: 'Posted “Home Office appointment delays in Croydon”', subjectType: 'Update', subjectId: 'upd-0021', occurredAt: daysAgo(19) },
    { entryId: 'rh-0006', source: 'GuideHelpfulVote', points: 60, reason: '60 people found “Finding a room in London” helpful', subjectType: 'Guide', subjectId: 'guide-0002', occurredAt: daysAgo(23) },
    { entryId: 'rh-0005', source: 'SeasonalBonus', points: 500, reason: 'Top contributor, autumn season', subjectType: null, subjectId: null, occurredAt: daysAgo(30) },
    { entryId: 'rh-0004', source: 'VerificationCompleted', points: 250, reason: 'Completed Diaspora verification', subjectType: null, subjectId: null, occurredAt: daysAgo(58) },
    { entryId: 'rh-0003', source: 'GuidePublished', points: 200, reason: 'Published “Finding a room in London”', subjectType: 'Guide', subjectId: 'guide-0002', occurredAt: daysAgo(61) },
    { entryId: 'rh-0002', source: 'ModeratorAction', points: 90, reason: 'Helpful report on a duplicate listing', subjectType: null, subjectId: null, occurredAt: daysAgo(67) },
    { entryId: 'rh-0001', source: 'GuidePublished', points: 200, reason: 'Published “Opening a UK bank account”', subjectType: 'Guide', subjectId: 'guide-0007', occurredAt: daysAgo(74) },
  ];

  const SETTLE_DELAY_MS = 6000;

  // ── Deposits ─────────────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/wallets/me/deposits/limits`).reply((config) => {
    const currency = (config.params?.currency as string | undefined) ?? 'GBP';
    return ok({
      currency,
      minimum: money(500, currency),
      maximum: money(200000, currency),
      remainingToday: money(150000, currency),
      supportedMethods: ['Card', 'BankTransfer', 'MobileMoney'],
    });
  });

  mock.onGet(new RegExp(`${ROOT}/wallets/me/deposits/[^/]+$`)).reply((config) => {
    const id = /deposits\/([^/?]+)/.exec(config.url ?? '')?.[1];
    const deposit = deposits.find((item) => item.depositId === id);
    if (!deposit) return problem(404, 'financial.transaction.not_found', 'That deposit could not be found.');
    return ok(deposit);
  });

  mock.onGet(`${ROOT}/wallets/me/deposits`).reply(() => ok(deposits));

  mock.onPost(`${ROOT}/wallets/me/deposits`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    const currency = body.currency ?? 'GBP';
    const amountMinor = Math.round((body.amount ?? 0) * 100);

    if (amountMinor < 500) {
      return problem(422, 'financial.amount.invalid', 'The smallest top-up is £5.00.');
    }
    if (amountMinor > 200000) {
      return problem(422, 'financial.amount.invalid', 'The largest single top-up is £2,000.00.');
    }

    const deposit: Deposit = {
      depositId: newId('dp'),
      walletId: 'b2e4d9a1-7c58-4a3f-8e16-2d9f4c7a3b58',
      status: 'Pending',
      amount: money(amountMinor, currency),
      fee: money(0, currency),
      credited: money(amountMinor, currency),
      methodKind: body.methodKind ?? 'Card',
      paymentIntentId: newId('pi'),
      failureCode: null,
      failureMessage: null,
      receiptReference: reference('DP'),
      createdAt: nowIso(),
      completedAt: null,
    };

    deposits = [deposit, ...deposits];
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, deposit);

    // Amounts ending in .13 decline, the same convention the certified mock
    // uses, so the failure path is reachable from the UI without editing code.
    const willFail = amountMinor % 100 === 13;

    setTimeout(() => {
      deposit.status = 'Processing';
    }, 1500);

    setTimeout(() => {
      if (willFail) {
        deposit.status = 'Failed';
        deposit.failureCode = 'card_declined';
        deposit.failureMessage = 'The card issuer declined this payment.';
        return;
      }
      deposit.status = 'Completed';
      deposit.completedAt = nowIso();
    }, SETTLE_DELAY_MS);

    return ok(deposit);
  });

  // ── Withdrawals ──────────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/wallets/me/withdrawals/limits`).reply((config) => {
    const currency = (config.params?.currency as string | undefined) ?? 'GBP';
    return ok({
      currency,
      minimum: money(1000, currency),
      maximum: money(100000, currency),
      fee: money(50, currency),
      remainingThisPeriod: money(100000, currency),
      outstandingRequirements: [],
    });
  });

  mock.onGet(`${ROOT}/wallets/me/withdrawals/destinations`).reply(() => ok(DESTINATIONS));

  mock.onGet(new RegExp(`${ROOT}/wallets/me/withdrawals/[^/]+$`)).reply((config) => {
    const id = /withdrawals\/([^/?]+)/.exec(config.url ?? '')?.[1];
    const withdrawal = withdrawals.find((item) => item.withdrawalId === id);
    if (!withdrawal) return problem(404, 'financial.transaction.not_found', 'That withdrawal could not be found.');
    return ok(withdrawal);
  });

  mock.onGet(`${ROOT}/wallets/me/withdrawals`).reply(() => ok(withdrawals));

  mock.onPost(new RegExp(`${ROOT}/wallets/me/withdrawals/[^/]+/cancel$`)).reply((config) => {
    const id = /withdrawals\/([^/]+)\/cancel/.exec(config.url ?? '')?.[1];
    const withdrawal = withdrawals.find((item) => item.withdrawalId === id);

    if (!withdrawal) return problem(404, 'financial.transaction.not_found', 'That withdrawal could not be found.');
    if (withdrawal.status !== 'Requested' && withdrawal.status !== 'Pending') {
      return problem(409, 'financial.transaction.not_pending', 'This withdrawal is already being processed.');
    }

    withdrawal.status = 'Cancelled';
    return ok(withdrawal);
  });

  mock.onPost(`${ROOT}/wallets/me/withdrawals`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    const currency = body.currency ?? 'GBP';
    const amountMinor = Math.round((body.amount ?? 0) * 100);
    const destination = DESTINATIONS.find((item) => item.destinationId === body.destinationId);

    if (!destination) {
      return problem(404, 'financial.account.not_found', 'That destination could not be found.');
    }
    if (!destination.isVerified) {
      return problem(
        422,
        'financial.account.not_eligible',
        'This account has not been verified yet. Verify it before withdrawing.'
      );
    }
    if (amountMinor < 1000) {
      return problem(422, 'financial.amount.invalid', 'The smallest withdrawal is £10.00.');
    }
    // The seeded available balance is £147.50. Anything above it must be
    // refused with the specific code, not with a generic failure — "not enough
    // in your wallet" is the member's to fix and nothing else's.
    if (amountMinor > 14750) {
      return problem(
        422,
        'financial.wallet.insufficient_funds',
        'There is not enough in your wallet for this.'
      );
    }

    const fee = money(50, currency);
    const withdrawal: Withdrawal = {
      withdrawalId: newId('wd'),
      walletId: 'b2e4d9a1-7c58-4a3f-8e16-2d9f4c7a3b58',
      destinationId: destination.destinationId,
      destinationLabel: destination.maskedLabel,
      status: 'Requested',
      amount: money(amountMinor, currency),
      fee,
      netAmount: money(amountMinor - fee.minorUnits, currency),
      failureCode: null,
      failureMessage: null,
      rejectionReason: null,
      receiptReference: reference('WD'),
      expectedArrivalAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      createdAt: nowIso(),
      completedAt: null,
    };

    withdrawals = [withdrawal, ...withdrawals];
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, withdrawal);

    setTimeout(() => {
      if (withdrawal.status === 'Cancelled') return;
      withdrawal.status = 'Processing';
    }, 2000);

    setTimeout(() => {
      if (withdrawal.status === 'Cancelled') return;
      withdrawal.status = 'Completed';
      withdrawal.completedAt = nowIso();
    }, SETTLE_DELAY_MS + 2000);

    return ok(withdrawal);
  });

  // ── Creator rewards ──────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/rewards/me`).reply(() =>
    ok({
      available: rewardPoints,
      pending: pendingPoints,
      lifetimeEarned,
      lifetimeConverted,
      nextThreshold: 5_000,
      nextThresholdLabel: 'Senior Contributor',
      updatedAt: nowIso(),
    })
  );

  mock.onGet(`${ROOT}/rewards/me/history`).reply((config) => {
    const limit = (config.params?.limit as number | undefined) ?? 25;
    const cursor = config.params?.cursor as string | undefined;

    const startIndex = cursor ? rewardHistory.findIndex((entry) => entry.entryId === cursor) + 1 : 0;
    const page = rewardHistory.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < rewardHistory.length;

    return ok({
      entries: page,
      nextCursor: hasMore ? page[page.length - 1]?.entryId : null,
      hasMore,
    });
  });

  mock.onGet(`${ROOT}/rewards/conversion`).reply(() =>
    ok({
      isEligible: true,
      ineligibleReason: null,
      pointsPerMinorUnit: POINTS_PER_MINOR_UNIT,
      currency: 'GBP',
      minimumPoints: MINIMUM_POINTS,
      maximumPoints: MAXIMUM_POINTS,
      feePercentage: CONVERSION_FEE_PERCENTAGE,
      availablePoints: rewardPoints,
    })
  );

  mock.onPost(`${ROOT}/rewards/conversions/preview`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');
    const points = Number(body.points ?? 0);

    const grossMinor = Math.floor(points / POINTS_PER_MINOR_UNIT);
    const feeMinor = Math.floor((grossMinor * CONVERSION_FEE_PERCENTAGE) / 100);

    if (!Number.isFinite(points) || points <= 0) {
      return ok({
        points, grossValue: money(0), fee: money(0), netValue: money(0),
        isValid: false,
        refusalCode: 'rewards.points_invalid',
        refusalMessage: 'Choose how many points to convert.',
      });
    }
    if (points < MINIMUM_POINTS) {
      return ok({
        points, grossValue: money(grossMinor), fee: money(feeMinor),
        netValue: money(grossMinor - feeMinor),
        isValid: false,
        refusalCode: 'rewards.below_minimum',
        refusalMessage: `You need at least ${MINIMUM_POINTS.toLocaleString()} points to convert.`,
      });
    }
    if (points > rewardPoints) {
      return ok({
        points, grossValue: money(grossMinor), fee: money(feeMinor),
        netValue: money(grossMinor - feeMinor),
        isValid: false,
        refusalCode: 'rewards.insufficient_points',
        refusalMessage: 'That is more points than you have.',
      });
    }

    return ok({
      points,
      grossValue: money(grossMinor),
      fee: money(feeMinor),
      netValue: money(grossMinor - feeMinor),
      isValid: true,
      refusalCode: null,
      refusalMessage: null,
    });
  });

  mock.onPost(`${ROOT}/rewards/conversions`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    const points = Number(body.points ?? 0);

    if (points < MINIMUM_POINTS) {
      return problem(422, 'rewards.below_minimum', `You need at least ${MINIMUM_POINTS.toLocaleString()} points.`);
    }
    if (points > rewardPoints) {
      return problem(422, 'rewards.insufficient_points', 'That is more points than you have.');
    }

    const grossMinor = Math.floor(points / POINTS_PER_MINOR_UNIT);
    const feeMinor = Math.floor((grossMinor * CONVERSION_FEE_PERCENTAGE) / 100);

    const conversion: RewardConversion = {
      conversionId: newId('cv'),
      status: 'Pending',
      points,
      grossValue: money(grossMinor),
      fee: money(feeMinor),
      netValue: money(grossMinor - feeMinor),
      transactionId: null,
      receiptReference: reference('CV'),
      createdAt: nowIso(),
      completedAt: null,
    };

    conversions = [conversion, ...conversions];
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, conversion);

    rewardPoints -= points;
    lifetimeConverted += points;

    setTimeout(() => {
      conversion.status = 'Completed';
      conversion.completedAt = nowIso();
      conversion.transactionId = newId('tx');
    }, 3000);

    return ok(conversion);
  });

  mock.onGet(`${ROOT}/rewards/conversions`).reply(() => ok(conversions));
}
