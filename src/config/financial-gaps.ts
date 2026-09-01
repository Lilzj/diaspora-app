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

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Where the responsibility sits, so the next backend phase can scope it. */
export type GapOwner =
  /** B15's own domain; the seam exists and the capability was scoped out. */
  | 'B15-incomplete'
  /** Never in B15's brief. A later phase's work. */
  | 'future-evolution';

export interface BackendGap {
  /**
   * Whether the backend has since shipped this.
   *
   * The register is a historical record and entries are deliberately not deleted
   * when a gap closes — that is the whole point of the file. But a notice that
   * keeps rendering after the capability arrives tells members the platform
   * cannot do something it does, which is the one failure this pattern exists to
   * prevent, pointing the other way.
   *
   * `connected` means every declared endpoint is served, verified against the
   * deployment rather than assumed. The notice stops rendering; nothing else
   * changes. `partial` means some are, and the notice stays because the screen
   * still has a hole in it.
   */
  backendStatus?: 'connected' | 'partial';
  /** Stable identifier used by screens and by the gap report. */
  id: string;
  /** What a member would call it. */
  title: string;
  /** One sentence on what the frontend does today. */
  frontendBehaviour: string;
  /**
   * Where this gap now stands against the certified backend.
   *
   * Added by the register-drift remediation. `backend-gap-register-drift.test.ts`
   * reads it and stops treating a gap's `missingContract` as a live assertion of
   * absence once it says `BACKEND CONNECTED` or `BACKEND PARTIAL` — the contract
   * stays declared as the historical record, which is the whole point of this
   * file, but it is no longer counted as drift.
   *
   * Absent means what it always meant: nothing of this capability exists.
   */
  frontendStatus?: string;
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
    backendStatus: 'connected',
    title: 'Add money to wallet',
    frontendStatus: 'CONNECTED',
    frontendBehaviour:
      'The deposit flow runs against the real platform: POST /wallets/me/deposits for the intent, GET /wallets/me/deposits/limits for the bounds, and the payment intent read back until it settles. The member completes payment on the provider’s own hosted page, opened from `nextAction`.',
    missingContract: [
      // The two deposit routes that used to head this list were shipped and are
      // now called by add-money.tsx. What is left is the reporting vocabulary,
      // which is why this entry survives rather than being deleted.
      'A `Deposit` or `TopUp` member of `TransactionType` (the enum has `Credit`, granted only by staff)',
      'A deposit-limit `FinancialPolicyKind` (minimum, maximum, per-day cap)',
    ],
    existingSeams: [
      '**Closed 1 Sep 2026.** `DepositEndpoints.cs` maps `POST /wallets/me/deposits`, `GET /wallets/me/deposits` and `GET /wallets/me/deposits/limits`, and the screen now calls them. What was missing was never the route: it was a charge adapter. `IPaymentGateway` had exactly one implementation — `SimulatedPaymentGateway`, excluded outside Development — so a production deployment could create an intent and had nothing to charge it with. `StripePaymentGateway` is that adapter.',
      '**The route is switched off by deployment flag, and the client reads that rather than assuming.** `DepositHandlers.cs:100` refuses with `financial.deposit.not_supported` unless `FinancialOptions.EnableDeposits` is true, and it is a plain `bool` with no initializer — false by default. The limits endpoint reports the same fact as `isEnabled: false` with a reason, and `add-money.tsx` gates on it. A route existing is not a capability existing (NG-39), which is why the gate is the deployment’s answer and never a build flag.',
      '**A successful call still moves no money.** The endpoint summary is explicit: "Starts a top-up. The wallet is credited when the payment captures, never before." It returns a `PaymentIntentResponse` in `Draft`. Crediting takes `POST /payment-intents/{id}/authorize` and a capture. A client that read a 200 here as "deposit succeeded" would be reporting a settlement the server never claimed.',
      '`POST /api/v1/financial/operations/credit` grants credit but is `financial:credit:manage`, Admin-only, and is a grant rather than a purchase',
      '`LedgerEntryType.Credit` and `CreditKind.Purchased` both exist and are never reachable from a member request',
      '`WalletType.Promotional` receives granted credit',
    ],
    owner: 'B15-incomplete',
    whyNotImplementable:
      'The route landed; the capability did not. `EnableDeposits` is false on a default deployment and the handler answers **503** before it looks at the amount, so connecting the flow would replace a screen that says "simulated" with a screen that says "service unavailable". The older reason still stands underneath it and is the reason a single call can never be reported as a completed deposit: a `Draft` intent is not a credited wallet, and showing an increased balance off the create response would be the client inventing a ledger posting that never happened.',
  },

  // `withdrawal` was here. It is closed: POST/GET /wallets/me/withdrawals, the
  // payout-destination contract, the withdrawal-limit policy and a registered
  // ISettlementProvider all landed with the payout phase, and the screen now
  // calls `financial-api` directly. The entry is removed rather than marked
  // done, because a register of closed gaps is a register nobody reads.
  //
  // What the real contract changed, for anyone comparing against the old
  // simulation: `gross`/`net` rather than `amount`/`netAmount`, `label` rather
  // than `maskedLabel`, `requestedAt` rather than `createdAt`, `Reversed` added
  // to the status union and `Pending`/`Rejected` removed from it, and
  // `isCancellable` decided by the server rather than inferred. There is no
  // `receiptReference` and no `expectedArrivalAt`; the platform does not
  // estimate arrival and will not pretend to.

  rewards: {
    id: 'rewards',
    backendStatus: 'connected',
    title: 'Creator rewards and contribution points',
    frontendStatus: 'BACKEND PARTIAL',
    frontendBehaviour:
      'READS ARE REAL (Remediation Wave C-01). The points balance, the lifetime totals, the earning history and the conversion terms all come from `/api/v1/financial/rewards/*` and are shown whether or not this deployment permits converting them. The conversion preview, confirmation and history still run against simulated persistence, because the *write* is refused on a deployment with `EnableRewardConversion` off or no published rate — which is most of them.',
    missingContract: [
      'POST /api/v1/financial/rewards/conversions — converting points into wallet credit, idempotent. The route exists; the capability is switched off by default and returns 409.',
      'GET /api/v1/financial/rewards/conversions — conversion history. Exists, unconsumed, pending the write.',
      'A `RewardPointsGranted` integration event so the reputation engine can award points without owning money',
    ],
    existingSeams: [
      '**`GET /rewards/me`, `/rewards/me/history` and `/rewards/conversion` are real and now consumed.** This entry previously said the module "has no occurrence of points at all", which was true when written and had stopped being true without anybody re-reading it.',
      'The reads answer regardless of the deployment switches, which is why they could be connected while the write could not: a member sees their true balance and is told *why* conversion is unavailable rather than being offered a converter that refuses.',
      '`GET /rewards/conversion` publishes **`minorUnitsPerPoint`** — minor units one point is worth. This client renders `pointsPerMinorUnit`, the reciprocal. The two names are one transposition apart and mapping across by similarity misprices a conversion by the rate squared; `hooks/financial-gaps.ts` inverts once, deliberately, and `rewards-certified.test.ts` pins it.',
      'History pages on `before`/`take` over `occurredAt`. It accepts no `excludeIds`, unlike its deposit and withdrawal siblings.',
      '`PromotionKind.ReferralReward` and `CreditKind.Referral`/`Bonus` exist, but they are operator-granted credit rather than an earned points balance',
      '**The conversion routes exist too.** `RewardEndpoints.cs` maps `POST /rewards/conversions/preview`, `POST /rewards/conversions` and `GET /rewards/conversions`. The refusal is a `409` — `RewardHandlers.cs:305` returns `Error.Conflict(quote.RefusalCode …)` — which confirms the `409` this entry already claimed, verified rather than assumed.',
    ],
    owner: 'B15-incomplete',
    whyNotImplementable:
      'Only the write remains, and it is a deployment decision rather than missing code. `POST /rewards/conversions` requires `FinancialOptions.EnableRewardConversion` — false by default — **and** a published rate greater than zero; without both, `GET /rewards/conversion` reports `isEnabled: false` with `financial.rewards.conversion_not_supported` and the write 409s. Simulating a conversion that the platform would refuse is the client pricing money, which §12 forbids. The honest state is a real balance the member cannot yet convert, and that is what ships.',
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
 * Whether GapFeatures features are reachable in this build.
 *
 * Delegates to `areSimulatedFeaturesEnabled()`, the single switch shared by
 * Phases 5, 6, 7 and 12.
 *
 * True under Metro and in a debug binary, and in an internal test build that
 * explicitly opted in with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. False in every
 * production build, which therefore ships no simulated withdrawal, no simulated deposit and no simulated rewards.
 *
 * Still not a runtime toggle and still not a remote flag: the opt-in is
 * inlined by Babel at build time. A simulated capability a support engineer
 * could switch on in production is one that will one day be switched on.
 * See `src/config/gap-preview.ts`.
 */
export function areGapFeaturesEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/** The prefix every simulated endpoint sits behind. Never `/financial`. */
export const GAP_ROUTE_PREFIX = '/financial-gap/v0';
