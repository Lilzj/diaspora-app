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
