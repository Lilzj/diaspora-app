// ─────────────────────────────────────────────────────────────────────────────
// Saved items, from the module that can actually list them
//
// ── Which of the two bookmark modules, and why ───────────────────────────────
//
// The platform has two, and they are not the same feature:
//
//   `/api/v1/bookmarks`            Bookmarks module
//       GET  /                     every bookmark this member holds
//       POST /                     { targetType, targetId, note? }
//       DELETE /{bookmarkId}       by the bookmark's own id
//
//   `/api/v1/community/bookmarks`  Community module
//       POST /                     { contentType, contentId (Guid), folderId?, note? }
//       DELETE /{contentType}/{contentId}
//       GET  /bookmarks/collections   grouped counts, thumbnails, folders
//
// Community has folders and per-category counts, which the Saved index wants —
// but **no route that lists the items**, which every category screen needs. So
// Saved is backed by the Bookmarks module, and the counts are derived from the
// list rather than read from Community's collections. Mixing them would be
// worse than either: a bookmark written to one is invisible to the other, and
// `community-social-api.ts` already warns that the two "were never meant to be
// one feature and merging them in a client is how a member's saved items start
// disappearing depending on which screen they used".
//
// ── The published contract is wrong about this route ─────────────────────────
//
// `Diaspora.Api.json` says `POST /api/v1/bookmarks` takes
// `CreateBookmarkRequest` — `{ contentType, contentId }`, which is **Community's**
// shape and the only type of that name in the solution. The Bookmarks module
// actually binds `{ targetType, targetId }`. A client generated from the document
// would send field names this route does not read.
//
// The field names below come from `Diaspora.Modules.Bookmarks/Contracts/
// BookmarkContracts.cs`, not from the document.
//
// ── `targetId` is a string, not a Guid ───────────────────────────────────────
//
// Community's `ContentId` is a `Guid`; this module's `TargetId` is a free
// string. That is what lets Saved hold every category — including anything whose
// identifier is not a Guid — and it is why `targetType` can carry the client's
// own `SavedContentType` names verbatim rather than being mapped onto an enum
// that would have to be kept in step.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toList } from './platform-envelope';
import type { SavedContentType } from '@/types/saved';

/** One bookmark, as `BookmarkResponse` sends it. */
export interface Bookmark {
  /** The bookmark's own id. Required to delete it — the content id will not do. */
  bookmarkId: string;
  contentType: SavedContentType;
  contentId: string;
  note: string | null;
  createdAt: string | null;
}

function toBookmark(row: any): Bookmark | null {
  const contentId = row?.targetId;
  const bookmarkId = row?.id;

  // A row missing either identifier cannot be rendered or removed, so it is
  // dropped rather than carried as a half-usable entry.
  if (typeof contentId !== 'string' || !contentId) return null;
  if (typeof bookmarkId !== 'string' || !bookmarkId) return null;

  return {
    bookmarkId,
    contentType: (row?.targetType ?? 'Listing') as SavedContentType,
    contentId,
    note: row?.note ?? null,
    createdAt: row?.createdAt ?? null,
  };
}

/**
 * Everything this member has saved.
 *
 * The route takes no parameters and is not paged — it answers the member's whole
 * set — so there is nothing to filter server-side and the categories are derived
 * here.
 */
export async function fetchBookmarks(): Promise<Bookmark[]> {
  const response = await apiClient.get('/bookmarks');

  return toList<any>(response.data)
    .map(toBookmark)
    .filter((bookmark): bookmark is Bookmark => bookmark !== null);
}

/**
 * Saves one thing, and returns the bookmark so its id can be kept.
 *
 * The id matters: `DELETE /bookmarks/{bookmarkId}` removes by the bookmark's own
 * identifier, not by what was bookmarked. A client that keeps only the content
 * id can save but never un-save.
 */
export async function createBookmark(
  contentId: string,
  contentType: SavedContentType,
  note?: string
): Promise<Bookmark | null> {
  const response = await apiClient.post('/bookmarks', {
    targetType: contentType,
    targetId: contentId,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });

  const body = (response.data as any)?.data ?? response.data;
  return toBookmark(body);
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await apiClient.delete(`/bookmarks/${encodeURIComponent(bookmarkId)}`);
}
