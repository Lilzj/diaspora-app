// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Where one item's analytics page is (14 Sep 2026)
//
// `/analytics/content/[type]/[id]` has served a guide's, an event's, an update's,
// a job's, a listing's and a home's own figures since Phase 15, and **nothing in
// the app opened it.** The content list on the creator dashboard drew every row
// as a button whose press recorded a telemetry event and went nowhere; the top
// boards open the item itself; the owner's item screens have no analytics link.
// Found by tapping through the app — the page worked when opened by link, which
// is how every earlier check had opened it.
//
// This file is the one place a content row becomes a route, so the list and any
// later entry point cannot disagree about which kinds have a page.
// ─────────────────────────────────────────────────────────────────────────────

import type { AnalyticsSubjectType } from '@/types/analytics';

/**
 * A content row's type, in the words `GET /analytics/creators/me/content` sends
 * (`AnalyticsContentTypes.ToClientContentType` on the server), to the per-item
 * page's route segment.
 *
 * Only the six kinds `app/analytics/content/[type]/[id].tsx` serves. A provider
 * profile and an organisation have rows but no page of their own, so they are
 * absent and their rows open nothing — which is the honest rendering, rather than
 * a button that goes nowhere.
 *
 * A `Map` rather than an object literal: `ROUTES['constructor']` on a plain
 * object is a function, which is truthy, and would have produced a route.
 */
const ITEM_PAGE_SEGMENTS: ReadonlyMap<string, AnalyticsSubjectType> = new Map<
  string,
  AnalyticsSubjectType
>([
  ['Guide', 'guide'],
  ['Update', 'update'],
  ['Event', 'event'],
  ['Job', 'job'],
  ['Marketplace', 'listing'],
  ['Housing', 'housing'],
]);

/** Every route segment an item page is opened with. Exported for the guard that checks the page serves each. */
export const ITEM_PAGE_SEGMENT_VALUES: readonly AnalyticsSubjectType[] = [...ITEM_PAGE_SEGMENTS.values()];

/**
 * The analytics page for one of the member's items, or null when that kind of
 * item has none.
 */
export function itemAnalyticsRoute(contentType: string, contentId: string): string | null {
  const segment = ITEM_PAGE_SEGMENTS.get(contentType);
  const id = contentId?.trim();

  if (!segment || !id) return null;

  return `/analytics/content/${segment}/${encodeURIComponent(id)}`;
}
