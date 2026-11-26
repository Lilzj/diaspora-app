// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization hooks (Frontend Phase 6)
//
// §26's stable domain interface. The UI calls `usePromotionPackages()` and
// `useEntitlements()` and does not know — or need to know — whether the answer
// came from a certified route or the development adapter. Everything in *this*
// file is backed by a real B15 contract; the gap-backed half lives in
// `hooks/monetization-gaps.ts` behind the same shape of interface.
//
// Nothing here re-implements what Phase 5 already built. `useCatalog`,
// `usePurchaseProduct`, `useMyPlacements`, `useSubscriptionPlans` and the
// payment reconciliation machinery are all imported from `hooks/financial`.
// This file *arranges* them: it joins placements to purchases, groups a flat
// catalogue into packages, and resolves an entitlement question against the plan
// list. Query keys are reused rather than duplicated so a purchase invalidates
// the promotions list without either side knowing about the other.
// ─────────────────────────────────────────────────────────────────────────────

export * from './promotions';
export * from './plans';
export * from './billing';
export * from './entitlements';
export * from './overview';
