// ─────────────────────────────────────────────────────────────────────────────
// Turning a saved identifier back into something worth looking at
//
// ── Why this is necessary ────────────────────────────────────────────────────
//
// `GET /bookmarks` answers `{ id, targetType, targetId, note, createdAt }` and
// nothing else — no title, no image, no price. That is a reasonable thing for a
// bookmark store to hold, and it means a Saved screen cannot render a row from
// the bookmark alone.
//
// The previous screen solved that by filtering `mockListings`, `mockGuides` and
// five more by the saved ids. Since the ids were seeded to match those mocks, it
// looked like it worked; against a real identifier it matched nothing. So the
// tab showed seven items nobody saved and none of the ones they did.
//
// ── One request per saved item, and why that is acceptable here ──────────────
//
// There is no route that resolves a set of `(type, id)` pairs in one call —
// `/community/content/{type}/{id}/…` covers comments, reactions and shares, but
// nothing returns the item. So each row is fetched from its own module's detail
// route.
//
// That is N requests for N saved items in one category, which is why the caller
// bounds it. It is a real cost, stated rather than hidden: the alternative is a
// batch route that does not exist, and inventing a title from the identifier is
// the defect this replaces.
//
// ── A row that fails to resolve is dropped, not faked ────────────────────────
//
// A saved item can disappear — unpublished, deleted, or made private. Its detail
// route then answers 404 or 403, and the honest render is to leave it out rather
// than show a placeholder card that goes nowhere.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import type { SavedContentType } from '@/types/saved';

/** Enough to render a row and open the thing. */
export interface ResolvedSavedItem {
  contentId: string;
  contentType: SavedContentType;
  title: string;
  subtitle: string | null;
  /** Where tapping the row goes. */
  href: string;
}

/**
 * Each type's detail route, the fields its response spells the title with, and
 * where the row should navigate.
 *
 * The title field differs per module — `title` on most, `name` on an
 * organisation and a provider — which is exactly the drift that has produced a
 * blank heading on four screens in this programme. Listed explicitly so a
 * missing one is visible rather than silently undefined.
 */
const RESOLVERS: Record<
  SavedContentType,
  { path: (id: string) => string; title: (data: any) => string | undefined; href: (id: string) => string }
> = {
  Guide: {
    path: (id) => `/guides/${encodeURIComponent(id)}`,
    title: (d) => d?.title,
    href: (id) => `/guide/${id}`,
  },
  Job: {
    path: (id) => `/jobs/${encodeURIComponent(id)}`,
    title: (d) => d?.title,
    href: (id) => `/job/${id}`,
  },
  Housing: {
    path: (id) => `/housing/listings/${encodeURIComponent(id)}`,
    title: (d) => d?.title,
    href: (id) => `/housing/${id}`,
  },
  Marketplace: {
    path: (id) => `/marketplace/listings/${encodeURIComponent(id)}`,
    title: (d) => d?.title,
    href: (id) => `/marketplace/${id}`,
  },
  Event: {
    path: (id) => `/community-life/events/${encodeURIComponent(id)}`,
    title: (d) => d?.title,
    href: (id) => `/community-life/event/${id}`,
  },
  Organization: {
    path: (id) => `/community-life/organizations/${encodeURIComponent(id)}`,
    // Not `title`. An organisation has a `name`, and reading `title` here is how
    // the organisation profile ended up with a blank heading.
    title: (d) => d?.name,
    href: (id) => `/community-life/org/${id}`,
  },
  Listing: {
    path: (id) => `/providers/${encodeURIComponent(id)}`,
    title: (d) => d?.name ?? d?.title,
    href: (id) => `/provider/${id}`,
  },
  CommunityUpdate: {
    path: (id) => `/community/posts/${encodeURIComponent(id)}`,
    title: (d) => d?.title,
    href: (id) => `/update/${id}`,
  },
};

/** The subtitle each type can honestly show, or nothing. */
function subtitleFor(contentType: SavedContentType, data: any): string | null {
  switch (contentType) {
    case 'Housing':
    case 'Marketplace':
      return data?.location?.displayName ?? data?.location?.cityName ?? null;
    case 'Event':
      return data?.venueName ?? data?.location?.displayName ?? null;
    case 'Organization':
      return data?.organizationTypeName ?? null;
    default:
      return null;
  }
}

/**
 * One saved item, or `null` if it can no longer be seen.
 *
 * Never throws: a Saved screen showing four of five rows is far better than one
 * showing an error because the fifth was unpublished.
 */
export async function resolveSavedItem(
  contentId: string,
  contentType: SavedContentType
): Promise<ResolvedSavedItem | null> {
  const resolver = RESOLVERS[contentType];
  if (!resolver) return null;

  try {
    const response = await apiClient.get(resolver.path(contentId));
    const data = (response.data as any)?.data ?? response.data;
    const title = resolver.title(data);

    // No title means the response was not what this resolver expects, and a row
    // reading "Untitled" tells the member nothing and hides the drift.
    if (typeof title !== 'string' || !title.trim()) return null;

    return {
      contentId,
      contentType,
      title: title.trim(),
      subtitle: subtitleFor(contentType, data),
      href: resolver.href(contentId),
    };
  } catch {
    return null;
  }
}

/**
 * Resolves a page of saved items, concurrently.
 *
 * `limit` bounds the request count, because this is one call per item and a
 * member with two hundred saved guides should not open a screen that fires two
 * hundred requests.
 */
export async function resolveSavedItems(
  entries: { contentId: string; contentType: SavedContentType }[],
  limit = 30
): Promise<{ items: ResolvedSavedItem[]; unresolved: number; truncated: number }> {
  const window = entries.slice(0, limit);
  const truncated = Math.max(0, entries.length - window.length);

  const settled = await Promise.all(
    window.map((entry) => resolveSavedItem(entry.contentId, entry.contentType))
  );

  const items = settled.filter((item): item is ResolvedSavedItem => item !== null);

  return { items, unresolved: window.length - items.length, truncated };
}
