import type { UnifiedContentItem } from '@/types/creator';

/**
 * Each kind of item's own edit screen.
 *
 * One map for the workspace menu's Edit and for a Content Health tip's Edit.
 * The tip's button opened `/housing/create` (the empty new-listing wizard) for
 * every kind of item, so "Add a photograph" on a home led nowhere near that
 * home's photos (Android UAT, 3 Nov 2026).
 */
const EDITOR: Partial<Record<string, (id: string) => string>> = {
  Guide: (id) => `/guide/edit/${id}`,
  Housing: (id) => `/housing/edit/${id}`,
  Marketplace: (id) => `/marketplace/edit/${id}`,
  Provider: (id) => `/provider/edit/${id}`,
  Job: (id) => `/job/edit/${id}`,
  Event: (id) => `/community-life/event/edit/${id}`,
  Organization: (id) => `/community-life/org/edit/${id}`,
  Update: (id) => `/update/edit/${id}`,
};

/**
 * The editor for `item`, or `null` for a kind with none. `focus: 'photos'`
 * asks the editor to open at its photos (the housing editor scrolls there).
 */
export function editorRouteFor(item: Pick<UnifiedContentItem, 'id' | 'contentType'>, focus?: 'photos'): string | null {
  const route = EDITOR[item.contentType]?.(item.id);
  if (!route) return null;

  return focus ? `${route}?focus=${focus}` : route;
}

/** The per-item analytics subject, as `/analytics/content/{type}/{id}` names it. */
const CONTENT_SUBJECT: Partial<Record<string, string>> = {
  Guide: 'guide',
  Event: 'event',
  Update: 'update',
  Job: 'job',
  Marketplace: 'listing',
  Housing: 'housing',
};

/**
 * The item's analytics screen, or `null` for a kind with none. The item sheet
 * sends the member here for views, enquiries and saves, rather than showing
 * the workspace's placeholder zeros beside invented trends.
 *
 * A provider and an organisation are not per-item subjects on the client: a
 * provider's figures are the owner's provider dashboard, and an organisation
 * has its own screen by id.
 */
export function analyticsRouteFor(item: Pick<UnifiedContentItem, 'id' | 'contentType'>): string | null {
  if (item.contentType === 'Provider') return '/analytics/provider';
  if (item.contentType === 'Organization') return `/analytics/organization/${item.id}`;

  const subject = CONTENT_SUBJECT[item.contentType];
  return subject ? `/analytics/content/${subject}/${item.id}` : null;
}
