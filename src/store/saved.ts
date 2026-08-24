// ─────────────────────────────────────────────────────────────────────────────
// Saved items
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// This store was an in-memory `Map` seeded with seven hard-coded identifiers:
//
//     ['list-1', 'Listing'], ['guide-001', 'Guide'], ['evt-1', 'Event'], …
//
// It imported no client and called no route. Three consequences, all live:
//
//   1. **Every member saw seven saved items they never saved.** Those ids match
//      the ones in `mockListings` / `mockGuides` / `mockEvents`, so unlike a real
//      identifier they *did* resolve, and rendered as genuine saved content.
//   2. **Anything actually saved never rendered.** A real identifier matches no
//      mock, so `saved/[category]` filtered it away.
//   3. **Nothing survived a restart**, because nothing was persisted or sent.
//
// So saving worked, displaying what was saved did not, and the tab showed
// somebody else's content as their own.
//
// ── The interface is deliberately unchanged ──────────────────────────────────
//
// Fourteen screens call `save`, `unsave`, `isSaved` and `getCountByType`, and
// they are all synchronous. Changing that would mean touching every one of them,
// so the writes stay fire-and-forget and reconcile themselves — see below.
// `load()` is the only addition.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { SavedContentType } from '@/types/saved';
import { createBookmark, deleteBookmark, fetchBookmarks } from '@/lib/bookmarks-api';

interface SavedState {
  /** contentId → contentType, for the screens that only ask "is this saved?". */
  savedItems: Map<string, SavedContentType>;
  /**
   * contentId → the bookmark's own id.
   *
   * Kept because `DELETE /bookmarks/{bookmarkId}` removes by the bookmark's
   * identifier and not by what was bookmarked. Without this a member could save
   * something and never un-save it.
   */
  bookmarkIds: Map<string, string>;
  isLoading: boolean;
  /** True once the server has answered. `false` with an empty map means unknown. */
  isLoaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (contentId: string, contentType: SavedContentType) => void;
  unsave: (contentId: string) => void;
  isSaved: (contentId: string) => boolean;
  getCountByType: (type: SavedContentType) => number;
}

export const useSavedStore = create<SavedState>((set, get) => ({
  // Empty, not seeded. An empty map before `load()` means "not known yet", which
  // `isLoaded` distinguishes from "known to be empty".
  savedItems: new Map(),
  bookmarkIds: new Map(),
  isLoading: false,
  isLoaded: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const bookmarks = await fetchBookmarks();

      set({
        savedItems: new Map(bookmarks.map((b) => [b.contentId, b.contentType])),
        bookmarkIds: new Map(bookmarks.map((b) => [b.contentId, b.bookmarkId])),
        isLoading: false,
        isLoaded: true,
      });
    } catch {
      // The previous contents are left alone. Emptying the map on a failed
      // refresh would tell a member their saved items were gone.
      set({ isLoading: false, error: 'We could not load your saved items.' });
    }
  },

  /**
   * Optimistic, and reconciled.
   *
   * The heart fills immediately because a control that waits on a round trip
   * reads as broken — but a heart that stays filled after the server refused is
   * a lie, so the entry is removed again if the write fails.
   */
  save: (contentId, contentType) => {
    if (get().savedItems.has(contentId)) return;

    set((state) => ({ savedItems: new Map(state.savedItems).set(contentId, contentType) }));

    createBookmark(contentId, contentType)
      .then((bookmark) => {
        if (!bookmark) return;
        // The bookmark id arrives only now, which is why `unsave` has to cope
        // with not having one yet.
        set((state) => ({
          bookmarkIds: new Map(state.bookmarkIds).set(contentId, bookmark.bookmarkId),
        }));
      })
      .catch(() => {
        set((state) => {
          const next = new Map(state.savedItems);
          next.delete(contentId);
          return { savedItems: next, error: 'We could not save that.' };
        });
      });
  },

  /**
   * Removes it locally, then on the server.
   *
   * When the bookmark id is not known — saved moments ago and the create has not
   * answered, or the list has never been loaded — the local removal still
   * happens and the store reloads to reconcile. Guessing an id, or silently
   * doing nothing, would both leave the member's view disagreeing with the
   * server.
   */
  unsave: (contentId) => {
    const bookmarkId = get().bookmarkIds.get(contentId);
    const previousType = get().savedItems.get(contentId);

    set((state) => {
      const items = new Map(state.savedItems);
      const ids = new Map(state.bookmarkIds);
      items.delete(contentId);
      ids.delete(contentId);
      return { savedItems: items, bookmarkIds: ids };
    });

    if (!bookmarkId) {
      // Nothing to delete by yet. A reload settles which of the two is right.
      void get().load();
      return;
    }

    deleteBookmark(bookmarkId).catch(() => {
      set((state) => {
        const items = new Map(state.savedItems);
        const ids = new Map(state.bookmarkIds);
        if (previousType) items.set(contentId, previousType);
        ids.set(contentId, bookmarkId);
        return { savedItems: items, bookmarkIds: ids, error: 'We could not remove that.' };
      });
    });
  },

  isSaved: (contentId) => get().savedItems.has(contentId),

  getCountByType: (type) => {
    let count = 0;
    get().savedItems.forEach((t) => {
      if (t === type) count += 1;
    });
    return count;
  },
}));
