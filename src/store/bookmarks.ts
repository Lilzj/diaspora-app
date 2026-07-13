import { create } from 'zustand';
import type { GuideBookmark } from '@/types/guide';
import { mockGuideBookmarks } from '@/mocks/community-data';

interface BookmarkState {
  bookmarks: GuideBookmark[];
  getBookmark: (guideId: string) => GuideBookmark | undefined;
  setBookmark: (guideId: string, sectionId: string, scrollPosition: number, note?: string) => void;
  removeBookmark: (guideId: string, sectionId: string) => void;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: mockGuideBookmarks,
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
            userId: 'user-123',
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
