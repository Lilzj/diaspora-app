import { create } from 'zustand';

interface KnowledgeSearchState {
  searchQuery: string;
  selectedCountry: string | null;
  selectedCategory: string | null;
  sortBy: 'newest' | 'trending' | 'helpful' | 'updated';
  showExpiredUpdates: boolean;
  
  setSearchQuery: (query: string) => void;
  setSelectedCountry: (country: string | null) => void;
  setSelectedCategory: (category: string | null) => void;
  setSortBy: (sort: 'newest' | 'trending' | 'helpful' | 'updated') => void;
  toggleShowExpiredUpdates: () => void;
  resetFilters: () => void;
}

export const useKnowledgeSearchStore = create<KnowledgeSearchState>((set) => ({
  searchQuery: '',
  selectedCountry: null,
  selectedCategory: null,
  sortBy: 'trending',
  showExpiredUpdates: false,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleShowExpiredUpdates: () => set((state) => ({ showExpiredUpdates: !state.showExpiredUpdates })),
  resetFilters: () => set({
    searchQuery: '',
    selectedCountry: null,
    selectedCategory: null,
    sortBy: 'trending',
    showExpiredUpdates: false,
  }),
}));
