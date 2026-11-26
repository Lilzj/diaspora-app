// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community social-graph hooks (Remediation Wave D-2)
//
// The stable interface over `lib/community-social-api.ts`. A screen calls
// `useCommunityFeed('home')` and receives posts; it never builds a query key,
// never decodes a cursor and never decides what a mutation invalidates.
//
// **No screen is wired to these yet.** That is deliberate and is the next task:
// this wave delivers the API layer a screen can adopt, tested against a
// development handler written from the backend's contract rather than from this
// client's expectations.
//
// ── Where an infinite query is honest, and where it is not ───────────────────
//
// **Two routes are genuinely cursor-paged** and get `useInfiniteQuery`:
// `GET /community/feeds/{feedKey}` and the two comment-thread routes. Both
// return a `nextCursor` and a `hasMore`, and both accept the cursor back.
//
// **The moderation queue is not**, despite accepting `cursor` and `limit`. It
// answers with a bare array and no cursor in it, beside it or in `meta`, so
// there is nothing to send as the next page and no signal that a next page
// exists. `useModerationQueue` is therefore a plain query with no `loadMore`,
// and the absence is a finding rather than an oversight — see
// `fetchModerationQueue` for what its `limit` actually bounds.
//
// ── Why paging stops on `hasMore` and never on an empty page ─────────────────
//
// **A malformed cursor comes back as page one at HTTP 200.** Not a 400. So a
// stale, truncated or hand-edited cursor silently re-serves the first page, and
// an infinite query that decided "keep going until a page is empty" would append
// the first page to itself for ever. `getNextPageParam` below returns
// `undefined` — TanStack's "there is no next page" — the moment `hasMore` is
// false, and never inspects the row count.
//
// ── Why nothing here is optimistic ───────────────────────────────────────────
//
// Three of the write paths in this module answer with **`data: null`**: delete a
// post, pin a post, pin a comment. There is no returned record to write into the
// cache, so those are invalidations by necessity.
//
// The reaction routes *do* answer with the new tally, and they are still
// invalidated rather than written: the tally hangs off a post under the name
// `reactions` and off the reaction response under the name `summary`, and a
// cache write that reached for the wrong one would blank a card's reactions
// until the next refetch. `readReactionSummary` exists so that a screen doing
// its own optimistic update can do it correctly; the hooks take the safe route.
//
// Deleting a comment is the sharpest case: the comment is **not removed** from
// the thread. It comes back tombstoned with an empty body so its replies keep
// their parent. A hook that spliced it out of the cached tree would take its
// replies with it.
// ─────────────────────────────────────────────────────────────────────────────

export * from './posts';
export * from './comments';
export * from './engagement';
export * from './follows';
export * from './moderation';
