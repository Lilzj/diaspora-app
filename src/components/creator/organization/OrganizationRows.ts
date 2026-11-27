// ─────────────────────────────────────────────────────────────────────────────
// The organisation sheet's rows (FARCH-004, 27 Nov 2026)
//
// Posts, Events and Members each page, and the sheet drew all three with
// `.map()` inside its scroll view, so every page a member asked for stayed
// mounted. The sheet is one FlashList now, drawing the rows of the tab in view,
// and each of those tabs gives it an `OrganizationTabList`: what it draws above
// its rows, the rows and how to draw one, what it says in their place, and what
// follows them. Discover's shape, at the size of a sheet.
//
// A row is the record itself (an announcement, a series, a member) rather than
// a copy made on each render, so the list redraws a row only when its record,
// or the renderer, changes.
// ─────────────────────────────────────────────────────────────────────────────

import type React from 'react';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import type { ListState } from '@/components/ListState';
import type { CommunityAnnouncement, EventSeries, OrganizationMember } from '@/types/community-advanced';

/** The label over one of the Events tab's two groups. */
export interface EventsHeading {
  heading: 'Upcoming' | 'Nothing scheduled';
}

/** A row of the sheet's list: whichever the tab in view gave it. */
export type OrganizationRow = CommunityAnnouncement | EventSeries | EventsHeading | OrganizationMember;

/** A tab, as the sheet's one list draws it. */
export interface OrganizationTabList {
  /** Under the tab strip, above the rows. */
  header: React.ReactNode;
  rows: readonly OrganizationRow[];
  /** Kept while what it draws with is unchanged: the list redraws every row when it changes. */
  renderItem: (info: ListRenderItemInfo<OrganizationRow>) => React.ReactElement | null;
  /** In place of the rows: the tab's first read, its failure, or its empty, in the shared list state. */
  state: React.ComponentProps<typeof ListState>;
  /** Below the rows: the next page, and what follows it. */
  footer: React.ReactNode;
}

/** Stable, so a tab with nothing to list is the same empty list on every render. */
export const NO_ROWS: OrganizationRow[] = [];

export function organizationRowKey(row: OrganizationRow): string {
  if ('heading' in row) return `heading:${row.heading}`;
  if ('announcementId' in row) return `post:${row.announcementId}`;
  if ('membershipId' in row) return `member:${row.membershipId}`;
  return `series:${row.seriesId}`;
}

/** A post is recycled into a post and a heading into a heading, never into a member. */
export function organizationRowType(row: OrganizationRow): string {
  if ('heading' in row) return 'heading';
  if ('announcementId' in row) return 'post';
  if ('membershipId' in row) return 'member';
  return 'series';
}
