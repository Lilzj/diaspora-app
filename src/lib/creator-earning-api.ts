// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator earnings (CREATOR-GAP-008)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. It is the certified arm of the creator
//    revenue split; `creator-gap-api.ts` is the development arm.
//
// ── What this closes ────────────────────────────────────────────────────────
//
// The register's complaint was never the wallet — that was always real, read
// from B15. It was the *attribution*: which earning came from sponsored content
// rather than a referral, what is pending versus available, and the per-source
// breakdown. B15 records that £12.00 moved; nothing recorded what the movement
// meant, so the revenue dashboard drew a real balance beside simulated reasons.
//
// ── Where the client's model and the server's differ ────────────────────────
//
// Four divergences, mapped here rather than bent on either side.
//
//   1. **`amount`, `fee` and `netAmount` against a gross and a share.** The
//      client models an earning as an amount the platform takes a fee from; the
//      server records what a member paid and what the creator's rate gives them.
//      They describe the same two numbers, so the mapping is exact: `amount` is
//      the gross, `netAmount` is the share, and `fee` is the difference. No
//      figure is computed that the server did not send — the subtraction is
//      between two served numbers and it is the only one in this file.
//
//   2. **`Money` against minor units.** The server sends minor units and an
//      exponent, which is the only pair that survives arithmetic. Dividing once
//      here is what stops four screens dividing by the wrong exponent.
//
//   3. **Percentages and period labels come from the server.** §11 forbids
//      revenue being authoritative client-side data, and a client dividing one
//      served total by another is doing arithmetic on money whose rounding
//      nobody agreed.
//
//   4. **`transactionId` is served, and null still means null.** The earning
//      carries the B15 ledger transaction the capture posted, so a row opens the
//      money movement behind it. It is absent where no posting exists — a
//      zero-priced product, something the platform granted — and this file does
//      not fill that in. A fabricated reference is worse than none: it offers a
//      link to a transaction that is not there.
//
// ── The cursor is opaque and this file keeps it that way ────────────────────
//
// `nextCursor` is a string the server issued and this file passes back
// unexamined. It encodes a position — an instant *and* a row — because two
// earnings settling in the same instant is ordinary here, and a cursor that was
// only a timestamp would drop one of them from a creator's ledger with nothing
// on screen to show a row had gone. Constructing one on the device would be
// this client deciding where a page boundary falls in somebody's income.
//
// ── What this file does not do ──────────────────────────────────────────────
//
// There is no payouts function — and not because payouts are missing, which was
// this file's first answer and was wrong. A creator being paid **is** a B15
// withdrawal: `GET /financial/wallets/me/withdrawals` has served the caller's
// own payouts all along, on an aggregate that is built and connected with the
// payout routing matrix on top of it. It read as empty because nobody had
// withdrawn, not because nothing could ever fill it, and those two look
// identical from a row count.
//
// A creator copy of that route would be a second vocabulary for one thing,
// which §16 forbids in as many words: reuse the Phase 5 financial
// infrastructure rather than forking it. The revenue dashboard's payout history
// reads `useWithdrawals()` from the financial hooks; see `PayoutRow` for the
// mapping, and why it renders `net` rather than `gross`.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import type { Money } from '@/types/financial';
import type {
  CreatorEarning,
  CreatorEarningsPage,
  CreatorRevenueBreakdownRow,
  CreatorRevenueSummary,
} from '@/types/creator-economy';

const ROOT = '/creators';

interface Envelope<T> {
  data: T;
}

async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(`${ROOT}${path}`, { params, signal });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

// ── The wire ─────────────────────────────────────────────────────────────────

interface EarningWire {
  earningId: string;
  source: string;
  state: string;
  amountMinorUnits: number;
  grossMinorUnits: number;
  currency: string;
  exponent: number;
  subjectType?: string | null;
  subjectId?: string | null;
  transactionId?: string | null;
  occurredAt: string;
  settledAt?: string | null;
  stateReason?: string | null;
  availableAt?: string | null;
  description: string;
}

interface EarningPageWire {
  items: EarningWire[];
  nextCursor?: string | null;
  hasMore: boolean;
}

interface SourceWire {
  source: string;
  label: string;
  minorUnits: number;
  count: number;
  sharePercentage: number;
}

interface SummaryWire {
  currency: string;
  exponent: number;
  lifetimeMinorUnits: number;
  pendingMinorUnits: number;
  availableMinorUnits: number;
  processingMinorUnits: number;
  paidMinorUnits: number;
  reversedMinorUnits: number;
  clearingDays: number;
  hasOtherCurrencies: boolean;
  currentPeriodMinorUnits: number;
  currentPeriodLabel: string;
  generatedAt: string;
  bySource: SourceWire[];
}

function money(minorUnits: number, currency: string, exponent: number): Money {
  return {
    // Divided once, at the boundary. The server's shape is minor units and the
    // exponent that gives them meaning; a screen dividing for itself is a screen
    // that can divide by the wrong one.
    amount: minorUnits / 10 ** exponent,
    currency,
    minorUnits,
    exponent,
  };
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function toEarning(wire: EarningWire): CreatorEarning {
  return {
    earningId: wire.earningId,
    source: wire.source,
    state: wire.state,

    // `amount` is what was paid and `netAmount` is what the creator gets. Both
    // are served; the fee between them is the only subtraction in this file, and
    // it is between two numbers the server sent rather than a rate applied here.
    amount: money(wire.grossMinorUnits, wire.currency, wire.exponent),
    netAmount: money(wire.amountMinorUnits, wire.currency, wire.exponent),
    fee:
      wire.grossMinorUnits === wire.amountMinorUnits
        ? null
        : money(wire.grossMinorUnits - wire.amountMinorUnits, wire.currency, wire.exponent),

    description: wire.description,
    subjectType: wire.subjectType ?? null,
    subjectId: wire.subjectId ?? null,

    // Served now, and still never invented. Null means the earning had no ledger
    // posting behind it, which is what the revenue screen reads to decide the
    // row is not tappable.
    transactionId: wire.transactionId ?? null,

    availableAt: wire.availableAt ?? null,
    occurredAt: wire.occurredAt,
    settledAt: wire.settledAt ?? null,
  };
}

function toBreakdownRow(
  wire: SourceWire,
  currency: string,
  exponent: number
): CreatorRevenueBreakdownRow {
  return {
    source: wire.source,
    label: wire.label,
    amount: money(wire.minorUnits, currency, exponent),
    sharePercentage: wire.sharePercentage,
    transactionCount: wire.count,
  };
}

function toSummary(wire: SummaryWire): CreatorRevenueSummary {
  const asMoney = (minorUnits: number) => money(minorUnits, wire.currency, wire.exponent);

  return {
    currency: wire.currency,
    lifetimeEarned: asMoney(wire.lifetimeMinorUnits),
    available: asMoney(wire.availableMinorUnits),
    pending: asMoney(wire.pendingMinorUnits),
    processing: asMoney(wire.processingMinorUnits),
    paidOut: asMoney(wire.paidMinorUnits),
    reversed: asMoney(wire.reversedMinorUnits),

    currentPeriod: asMoney(wire.currentPeriodMinorUnits),
    currentPeriodLabel: wire.currentPeriodLabel,

    clearingDays: wire.clearingDays,
    hasOtherCurrencies: wire.hasOtherCurrencies,

    breakdown: wire.bySource.map((row) => toBreakdownRow(row, wire.currency, wire.exponent)),
    generatedAt: wire.generatedAt,
  };
}

// ── The routes ───────────────────────────────────────────────────────────────

/**
 * What the caller has earned, totalled.
 *
 * **The balances are all-time and only the period figure is windowed.** Asking
 * for thirty days does not shrink an available balance — holdings answer "what
 * do I hold", not "what did this window earn me". The server draws that
 * distinction; this passes the window through and does not second-guess it.
 */
export async function fetchRevenueSummary(days?: number): Promise<CreatorRevenueSummary> {
  return toSummary(await read<SummaryWire>('/me/revenue/summary', { days }));
}

/**
 * The caller's own earnings, newest first.
 *
 * `cursor` is whatever the previous page's `nextCursor` was — see the file
 * header on why this client never builds one itself.
 */
export async function fetchEarnings(
  params: { state?: string; source?: string; cursor?: string; take?: number } = {}
): Promise<CreatorEarningsPage> {
  const wire = await read<EarningPageWire>('/me/earnings', {
    state: params.state,
    source: params.source,
    cursor: params.cursor,
    take: params.take,
  });

  return {
    earnings: wire.items.map(toEarning),
    nextCursor: wire.nextCursor ?? null,
    hasMore: wire.hasMore,
  };
}
