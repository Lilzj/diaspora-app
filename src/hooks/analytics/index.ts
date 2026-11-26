// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics hooks (Frontend Phase 15, §4 · §52 · §54)
//
// The stable interface above both repository arms. §4's requirement is that a
// screen must not know whether its data came from a certified route, an existing
// phase's adapter, or the development provider — and this file is where that
// stops being a principle and becomes a signature.
//
// A screen calls `useAnalyticsDataset(query)` and receives an `AnalyticsDataset`.
// Behind it, that one call may:
//
//   * read the certified `/jobs`, `/housing`, `/neighborhood/{id}` routes for
//     real inventory counts,
//   * read Phase 13's existing community statistics contract and normalise it,
//   * read the development adapter for everything with no contract,
//   * and compose the three into one object whose per-metric provenance says
//     which is which.
//
// The screen sees none of that. What it does see, and is required to render, is
// `dataset.status` and each metric's `value.source` — because §38 forbids
// presenting a gap as a production number, and the only way to make that
// enforceable is to make the marker unavoidable rather than optional.
//
// ── §54, offline, and the one thing this file will not do ────────────────────
//
// TanStack Query will happily serve a cached dataset for ever. That is the right
// behaviour — analytics is exactly the kind of data worth reading offline — and
// it is also how a dashboard silently shows last Tuesday's numbers as today's.
//
// So `useAnalyticsDataset` computes a **status override**: when the device is
// offline and the cached data is older than its own freshness promise, the
// dataset it returns is marked `STALE` rather than `LIVE`. The data is still
// shown, which §54 permits. It is never shown as current, which §54 forbids.
// ─────────────────────────────────────────────────────────────────────────────

export * from './dataset';
export * from './access';
export * from './reports';
export * from './definitions';
export * from './insights';

/** Re-exported so a screen imports its visualization type from one place. */
export type { AnalyticsVisualization, AnalyticsReport } from '@/types/analytics';
