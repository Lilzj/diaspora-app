// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 5)
//
// ⚠ EVERYTHING REGISTERED HERE IS UNSUPPORTED BY THE CERTIFIED BACKEND. ⚠
//
// B15 is frozen. Four capabilities this phase was asked to build have no
// contract behind them, and the brief's instruction (§4-C) is to build the full
// frontend flow against simulated persistence and document the gap exactly,
// rather than to leave a hole or to pretend a backend route exists.
//
// This file is the register. It is the single place that answers, for each gap:
// what is missing, what the UX would be, which contract would have to exist,
// and whether it belongs to B15 or to a later phase.
//
// Three mechanisms keep a simulated capability from being mistaken for a real
// one, because a wallet screen that quietly fakes a withdrawal is worse than
// one that has no withdraw button at all:
//
//   1. **A different URL space.** Gap endpoints live under
//      `/financial-gap/v0/…`, never `/financial/…`. A gap call that escaped to
//      a real deployment gets a 404 from the gateway instead of silently
//      reaching a certified route.
//   2. **A visible marker.** Every gap-backed screen renders `<GapNotice>`,
//      which names the missing contract on the screen itself.
//   3. **A single switch.** `areGapFeaturesEnabled()` is false in production
//      builds, so a release binary does not ship a simulated withdrawal at all.
//
// When a gap is closed by a future backend phase, the entry moves out of this
// file, the screen swaps `financial-gap-api` for `financial-api`, and the
// `GapNotice` disappears. Nothing else about the screen changes — which is the
// reason to build the flow now rather than later.
// ─────────────────────────────────────────────────────────────────────────────

/** Where the responsibility sits, so the next backend phase can scope it. */
export type GapOwner =
  /** B15's own domain; the seam exists and the capability was scoped out. */
  | 'B15-incomplete'
  /** Never in B15's brief. A later phase's work. */
  | 'future-evolution';

export interface BackendGap {
  /** Stable identifier used by screens and by the gap report. */
  id: string;
  /** What a member would call it. */
  title: string;
  /** One sentence on what the frontend does today. */
  frontendBehaviour: string;
  /** What the backend would have to expose. Route-level, not hand-waving. */
  missingContract: string[];
  /** What exists already, so a future phase does not rebuild it. */
  existingSeams: string[];
  owner: GapOwner;
  /** Why the frontend cannot safely implement it against what exists. */
  whyNotImplementable: string;
}

/**
 * The four gaps. Each is derived from reading
 * `src/Diaspora.Modules.Financial/**` rather than from the roadmap: a
 * capability is listed here only after the certified module was searched for it
 * and it was not there.
 */
export const BACKEND_GAPS: Record<string, BackendGap> = {
  deposit: {
    id: 'deposit',
    title: 'Add money to wallet',
    frontendBehaviour:
      'The full deposit flow — amount, method, review, confirmation, processing, result — runs against simulated persistence and is labelled as such on every screen.',
    missingContract: [
      'POST /api/v1/financial/wallets/me/deposits — a member-initiated top-up creating a payment intent whose capture credits the caller’s own Primary wallet',
      'GET /api/v1/financial/wallets/me/deposits — deposit history distinct from payment history',
      'A `Deposit` or `TopUp` member of `TransactionType` (the enum has `Credit`, granted only by staff)',
      'A deposit-limit `FinancialPolicyKind` (minimum, maximum, per-day cap)',
    ],
    existingSeams: [
      '`POST /api/v1/financial/operations/credit` grants credit but is `financial:credit:manage`, Admin-only, and is a grant rather than a purchase',
      '`LedgerEntryType.Credit` and `CreditKind.Purchased` both exist and are never reachable from a member request',
      '`WalletType.Promotional` receives granted credit',
    ],
    owner: 'B15-incomplete',
    whyNotImplementable:
      'A payment intent can be created for any amount, but nothing in B15 credits the payer’s own wallet on capture — a captured intent posts to the platform’s clearing wallet against a subject. Calling `POST /payment-intents` and then showing an increased balance would be the client inventing a ledger posting that never happened.',
  },

  withdrawal: {
    id: 'withdrawal',
    title: 'Withdraw to a bank account',
    frontendBehaviour:
      'The full withdrawal flow — amount, destination, review, confirmation, processing, result — runs against simulated persistence. Destination details are never persisted on the device.',
    missingContract: [
      'POST /api/v1/financial/wallets/me/withdrawals — a member-initiated payout debiting the caller’s available balance',
      'GET /api/v1/financial/wallets/me/withdrawals — withdrawal history and status',
      'A payout-destination contract (create, list, verify, remove a bank account or mobile-money handle)',
      'A withdrawal-limit `FinancialPolicyKind` and the verification requirements that gate it',
      'A settlement provider registered against `ISettlementProvider`',
    ],
    existingSeams: [
      '`ISettlementProvider`, `SettlementInstruction`, `SettlementId` and `SettlementStatus` are declared with no registered implementation',
      '`TransactionType.Withdrawal`, `TransactionType.Payout` and `LedgerEntryType.Payout` exist in the domain',
      '`FinancialErrorCodes.PayoutNotSupported` is declared for exactly this case',
      '`GET /capabilities` reports `payoutsEnabled: false`',
    ],
    owner: 'B15-incomplete',
    whyNotImplementable:
      'B15 states the position in its own error catalogue: “Returned by the payout surface. The seams exist; no settlement engine ships in this phase.” There is no route, and the deployment reports `payoutsEnabled: false`, so a client that offered a withdrawal would be offering something the platform has said it cannot do.',
  },

  rewards: {
    id: 'rewards',
    title: 'Creator rewards and contribution points',
    frontendBehaviour:
      'Points balance, points history, earning sources, conversion eligibility, conversion preview, conversion confirmation and conversion history all run against simulated persistence.',
    missingContract: [
      'GET /api/v1/financial/rewards/me — a points balance and its lifetime totals',
      'GET /api/v1/financial/rewards/me/history — how points were earned, cursor-paged',
      'GET /api/v1/financial/rewards/conversion — the conversion rate, minimum, maximum and any fee, owned by the backend',
      'POST /api/v1/financial/rewards/conversions — converting points into wallet credit, idempotent',
      'GET /api/v1/financial/rewards/conversions — conversion history',
      'A `RewardPointsGranted` integration event so the reputation engine can award points without owning money',
    ],
    existingSeams: [
      '`PromotionKind.ReferralReward` and `CreditKind.Referral`/`Bonus` exist, but they are operator-granted credit rather than an earned points balance',
      'The reputation engine already scores contributions; `LevelBenefits.isRewardsEligible` exists in `types/reputation.ts`',
    ],
    owner: 'future-evolution',
    whyNotImplementable:
      'No points aggregate, no conversion policy and no rate exist anywhere in B15 — the module has no occurrence of “points” at all. B15’s own alignment report addresses `isRewardsEligible` directly: “Not implemented. Rewards are a promotion the operator configures, not a hard-coded consequence of a reputation level. The seam exists; no product ships.” A conversion rate computed on the client would be the client pricing money, which is the one thing §12 of this phase forbids.',
  },

  protection: {
    id: 'protection',
    title: 'Escrow, buyer protection and seller protection',
    frontendBehaviour:
      'A read-only explanation of what protection would cover, plus the marketplace/housing deposit flow built against ordinary payment intents. No escrow state, no dispute, no release, no hold is simulated as though it were real — the screens say the protection does not exist yet.',
    missingContract: [
      'POST /api/v1/financial/escrows — open a hold against a marketplace order or housing deposit',
      'POST /api/v1/financial/escrows/{id}/release — release to the seller on delivery',
      'POST /api/v1/financial/escrows/{id}/refund — return to the buyer',
      'POST /api/v1/financial/escrows/{id}/disputes — raise, evidence, resolve',
      'GET /api/v1/financial/escrows/me — a party’s open holds',
      'A dispute-window and protection-eligibility `FinancialPolicyKind`',
      'An order aggregate somewhere on the platform for escrow to attach to — Marketplace exposes no order or checkout route today',
    ],
    existingSeams: [
      '`WalletType.Escrow` exists as an enum member and a provisioning policy can open such a wallet',
      '`LedgerBucket.Reserved`, `LedgerEntryType.Hold` and `LedgerEntryType.Release` model the money movement a hold would need',
      '`Wallet.reserved` is already served on every wallet response',
    ],
    owner: 'future-evolution',
    whyNotImplementable:
      'The ledger primitives for a hold exist; the aggregate, the state machine, the dispute process and the routes do not. §20 of this phase is explicit that these must not be simulated into looking functional, so this is the one gap whose flow is deliberately *not* built end to end.',
  },
} as const;

export type BackendGapId = keyof typeof BACKEND_GAPS;

/**
 * Whether gap-backed features are reachable in this build.
 *
 * `__DEV__` is React Native's build-time flag: true under Metro and in a
 * development client, false in a release bundle. So a production binary has no
 * simulated withdrawal, no simulated deposit and no simulated rewards — the
 * entry points render an honest "not available yet" instead.
 *
 * This is deliberately not a runtime toggle or a remote flag. A simulated
 * financial capability that a support engineer could switch on in production is
 * a simulated financial capability that will one day be switched on.
 */
export function areGapFeaturesEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** The prefix every simulated endpoint sits behind. Never `/financial`. */
export const GAP_ROUTE_PREFIX = '/financial-gap/v0';
