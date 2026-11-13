// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `financial-gaps.ts`, derived by
// `node scripts/generate-production-registers.js`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// `metro.config.js` and `scripts/production-stubs.js`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
//   existingBackendCapability — community/gaps only
//   frontendBehaviour — analytics/gaps, community/gaps, creator/gaps, map/diagnostics
//   existingSeams — creator/gaps only
//   whyNotImplementable — analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection
//   privacyConsiderations — analytics/gaps, community/gaps
//   securityConsiderations — analytics/gaps, community/gaps
//   caching — community/gaps only
//   integrationWork — map/diagnostics only
//   considerations — no reader outside the registers
//   requiredContracts — analytics/gaps, community/gaps — and emptying it takes the nested request, response, authorization, idempotency, aggregation and retryBehaviour shapes with it
//   currentBehaviour — map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS
//   missingBackendCapability — analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS and MULTI_COMMUNITY_GAPS
//
// Edit the source. `production-registers-drift.test.ts` fails if this file
// stops matching what this script would produce from it.

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
  | 'future-evolution'
  /** Decided against. Not a gap waiting for work (escrow, 7 Oct 2026). */
  | 'not-planned';

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
      '',
    missingContract: [
      // The two deposit routes that used to head this list were shipped and are
      // now called by add-money.tsx. What is left is the reporting vocabulary,
      // which is why this entry survives rather than being deleted.
      'A `Deposit` or `TopUp` member of `TransactionType` (the enum has `Credit`, granted only by staff)',
      'A deposit-limit `FinancialPolicyKind` (minimum, maximum, per-day cap)',
    ],
    existingSeams: [],
    owner: 'B15-incomplete',
    whyNotImplementable:
      '',
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
    frontendStatus: 'BACKEND CONNECTED',
    frontendBehaviour:
      '',
    missingContract: [
      // Kept as the record of what was missing. Served, and consumed by
      // `useConversions`, since 27 Oct 2026.
      'GET /api/v1/financial/rewards/conversions — conversion history.',
    ],
    existingSeams: [],
    owner: 'B15-incomplete',
    whyNotImplementable:
      '',
  },

  protection: {
    id: 'protection',
    title: 'Escrow, buyer protection and seller protection',
    frontendBehaviour:
      '',
    missingContract: [
      'POST /api/v1/financial/escrows — open a hold against a marketplace order or housing deposit',
      'POST /api/v1/financial/escrows/{id}/release — release to the seller on delivery',
      'POST /api/v1/financial/escrows/{id}/refund — return to the buyer',
      'POST /api/v1/financial/escrows/{id}/disputes — raise, evidence, resolve',
      'GET /api/v1/financial/escrows/me — a party’s open holds',
      'A dispute-window and protection-eligibility `FinancialPolicyKind`',
      'An order aggregate somewhere on the platform for escrow to attach to — Marketplace exposes no order or checkout route today',
    ],
    existingSeams: [],
    owner: 'not-planned',
    whyNotImplementable:
      '',
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
