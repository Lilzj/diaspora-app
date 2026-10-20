// ─────────────────────────────────────────────────────────────────────────────
// Guide reading positions — device-local, and no longer pre-populated
//
// ── What a `GuideBookmark` is, and what it is not ────────────────────────────
//
// A `GuideBookmark` here is a **reading position**: `guideId`, `sectionId`,
// `scrollPosition` (0–1) and an optional note. It is the Kindle-style "resume
// where you left off" record that `app/guide/[id].tsx` writes on scroll and
// reads to offer its resume banner.
//
// It is **not** the same thing as `GET /guides/bookmarked`, and the two must not
// be joined. That route answers "guides I saved" — a saved-items list, served by
// `useBookmarkedGuides()` in `hooks/guides.ts`, written by
// `PUT /guides/{id}/bookmark` via `useSetGuideBookmark()`, and already wired to
// the "Save guide" control on the reader screen. Saving a guide says nothing
// about how far into it you have read, and there is **no route anywhere for a
// reading position** — no scroll offset, no section, no per-device progress. So
// this store stays local, and stays local honestly: nothing here syncs, nothing
// here is restored on a new device, and no consumer may suggest otherwise.
//
// ── What was wrong ───────────────────────────────────────────────────────────
//
// It opened seeded with `mockGuideBookmarks` from `mocks/community-data.ts`.
// Every member, on every install, started with somebody else's reading
// positions. Concretely: open the guide named in that fixture and the reader
// greeted you with *"📖 Resume from progress 45%?"* — for a guide you had never
// opened, on a device that had never rendered a word of it, offering to skip you
// past half of it. Pressing Resume then jumped you into the middle of an article
// you had not read.
//
// This is a small lie with an unusually direct effect: it does not merely
// misinform, it moves the screen. And because the fixture also carried `note`
// and `userId: 'user-123'`, the app was showing one fabricated member's private
// annotation to everybody.
//
// The store now starts empty, which is the truth on a fresh install: this device
// has not recorded a position in any guide yet. The first scroll writes the
// first real one.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GuideBookmark } from '@/types/guide';

interface BookmarkState {
  /**
   * Positions recorded **on this device**. Kept across restarts since 20 Oct
   * 2026 (they were lost on every restart); not shared between devices, because
   * there is no route to sync them to.
   */
  bookmarks: GuideBookmark[];
  getBookmark: (guideId: string) => GuideBookmark | undefined;
  setBookmark: (guideId: string, sectionId: string, scrollPosition: number, note?: string) => void;
  removeBookmark: (guideId: string, sectionId: string) => void;
}

const STORAGE_KEY = 'diaspora_reading_positions';

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],
  getBookmark: (guideId) => get().bookmarks.find((b) => b.guideId === guideId),
  setBookmark: (guideId, sectionId, scrollPosition, note) =>
    set((state) => {
      const existing = state.bookmarks.findIndex(
        (b) => b.guideId === guideId && b.sectionId === sectionId
      );
      const now = new Date().toISOString();
      if (existing >= 0) {
        const updated = [...state.bookmarks];
        updated[existing] = { ...updated[existing], scrollPosition, note: note ?? null, updatedAt: now };
        return { bookmarks: updated };
      }
      return {
        bookmarks: [
          ...state.bookmarks,
          {
            bookmarkId: `bm-${Date.now()}`,
            // Was the fixture's `'user-123'`. A local record has no server
            // identity to carry, and stamping a fabricated one onto it invites
            // a future reader to send it somewhere.
            userId: '',
            guideId,
            sectionId,
            scrollPosition,
            note: note ?? null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    }),
  removeBookmark: (guideId, sectionId) =>
    set((state) => ({
      bookmarks: state.bookmarks.filter(
        (b) => !(b.guideId === guideId && b.sectionId === sectionId)
      ),
    })),
}));

// Load what this device remembered, then keep it written.
void AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (!saved) return;
    const bookmarks = JSON.parse(saved) as GuideBookmark[];
    if (Array.isArray(bookmarks)) useBookmarkStore.setState({ bookmarks });
  })
  .catch(() => undefined)
  .finally(() => {
    useBookmarkStore.subscribe((state) => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookmarks.slice(-200))).catch(() => undefined);
    });
  });
