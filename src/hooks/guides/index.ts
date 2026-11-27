// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Guides hooks (Remediation Wave D-3)
//
// The stable interface over `lib/guides-api.ts`. A screen calls
// `useGuideSearch({ country: 'GB' })` and receives cards; it never builds a
// query key, never decodes a cursor and never decides what a mutation
// invalidates.
//
// ── Where an infinite query is honest, and where it is not ───────────────────
//
// **Every discovery and browse route in this module is genuinely cursor-paged.**
// `SearchGuidesQuery`, the three shelves, nearby, the two browses, the author
// list, `/mine`, `/mine/drafts`, `/bookmarked`, suggestions and the moderation
// queue all answer `CursorPagedResult<T>` with a real `nextCursor` and a real
// `hasMore`. That is a materially better position than Community's, where the
// moderation queue accepted a cursor and returned a bare array.
//
// **Three routes are bare arrays and are plain queries**: `GET /guides/categories`,
// `GET /guides/tags` and `GET /guides/{id}/translations`. They take no cursor,
// so a `loadMore` on them would be a control with nothing behind it.
//
// **`GET /guides/{id}/versions` is a bare array with a `limit`.** The limit
// bounds the answer at `GuideLimits.MaxVersionsListed` (50) and there is no
// cursor — a guide with more than fifty published versions shows its newest
// fifty, and nothing in the contract offers the rest.
//
// ── Why paging stops on `hasMore` ────────────────────────────────────────────
//
// Same rule as every other wave: `getNextPageParam` returns `undefined` the
// moment `hasMore` is false and never inspects the row count. A page that came
// back short is not the last page, and a page that came back full is not proof
// of another.
//
// ── Why nothing here is optimistic ───────────────────────────────────────────
//
// Almost every write in this module answers with the **whole** `GuideResponse`,
// which is tempting to write straight into the cache. The hooks invalidate
// instead, for one reason: `engagement`, `trustMark` and `isFeatured` are
// server-computed rollups, and a vote's response carries
// `GuideEngagementResponse` while a bookmark's carries a `GuideResponse` whose
// engagement is nested one level deeper. A cache write that reached for the
// wrong one would blank a guide's counters until the next refetch — the exact
// class of silent wrongness this remediation exists to remove.
//
// The one exception is `useGuide`, which seeds the detail cache from a
// mutation's own return value where the shapes are identical. It is marked.
// ─────────────────────────────────────────────────────────────────────────────

export * from './discovery';
export * from './reading';
export * from './authoring';
export * from './engagement';
export type { UseGuideListResult } from './shared';
