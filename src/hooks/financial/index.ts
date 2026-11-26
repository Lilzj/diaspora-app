// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial hooks (Backend Phase B15)
//
// TanStack Query owns every piece of server-owned financial state. Zustand owns
// none of it. §24 of the brief is explicit and the reason is not stylistic: a
// balance copied into a global store is a balance that keeps rendering after it
// stops being true, and there is no way to tell by looking at it.
//
// Three behaviours are implemented here rather than in each screen:
//
//   **Reads are cached, writes never are.** A financial mutation's result is
//   applied to the cache only when the backend has reported a state; nothing
//   optimistically credits a wallet.
//
//   **Reconciliation, not optimism.** `usePaymentReconciliation` polls a
//   payment while its status says the outcome is not yet known, and stops the
//   moment it is. A success screen is driven by `Captured`/`Settled` arriving
//   from the server, never by a 200 on the request that started the payment.
//
//   **Mutations do not retry.** `retry: 0` on every one. The client re-sending
//   a payment is the client deciding to charge twice; the idempotency key is
//   there so a *member's* retry is safe, not so the app can retry silently.
// ─────────────────────────────────────────────────────────────────────────────

export * from './wallet';
export * from './payments';
export * from './commerce';
export * from './giving';
export * from './payouts';
export * from './deposits';
