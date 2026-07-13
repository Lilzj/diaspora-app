import { create } from 'zustand';
import type { SavedContentType } from '@/types/saved';

interface SavedState {
  savedItems: Map<string, SavedContentType>;  // contentId → contentType
  save: (contentId: string, contentType: SavedContentType) => void;
  unsave: (contentId: string) => void;
  isSaved: (contentId: string) => boolean;
  getCountByType: (type: SavedContentType) => number;
}

export const useSavedStore = create<SavedState>((set, get) => ({
  savedItems: new Map([
    ['list-1', 'Listing'],
    ['list-2', 'Listing'],
    ['guide-001', 'Guide'],
    ['guide-002', 'Guide'],
  ]),
  save: (contentId, contentType) =>
    set((state) => {
      const next = new Map(state.savedItems);
      next.set(contentId, contentType);
      return { savedItems: next };
    }),
  unsave: (contentId) =>
    set((state) => {
      const next = new Map(state.savedItems);
      next.delete(contentId);
      return { savedItems: next };
    }),
  isSaved: (contentId) => get().savedItems.has(contentId),
  getCountByType: (type) => {
    let count = 0;
    get().savedItems.forEach((t) => { if (t === type) count++; });
    return count;
  },
}));
