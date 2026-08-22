// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Knowledge Hub filter state
//
// ── Why there are two spellings of each filter (Remediation Wave D-3) ───────
//
// The Hub's three tabs are no longer one kind of screen. **Guides is served by
// `GET /guides`**, which filters by an ISO 3166-1 country *code* and a catalogue
// category *key*. Contributors is still fixtures, and filters by a country
// *name* and an expertise *label*.
//
// The filter row cannot serve both with one value: `'United Kingdom'` matches no
// `countryCode`, and `'Immigration & Visas'` matches no `categoryKey`. A single
// field would have meant one of the two tabs filtering to nothing, silently,
// with a filter chip lit up to say it was working — which is precisely the class
// of failure this remediation exists to remove.
//
// So the layout sets both at once, each tab reads the pair it can actually use,
// and `resetFilters` clears all four together.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';

interface KnowledgeSearchState {
  searchQuery: string;
  /** The display name. What the fixture-backed Contributors tab compares against. */
  selectedCountry: string | null;
  /** ISO 3166-1 alpha-2. What `GET /guides?country=` takes. */
  selectedCountryCode: string | null;
  /** The display label. What the fixture-backed Contributors tab compares against. */
  selectedCategory: string | null;
  /** A guide catalogue key. What `GET /guides?category=` takes. */
  selectedCategoryKey: string | null;
  sortBy: 'newest' | 'trending' | 'helpful' | 'updated';
  showExpiredUpdates: boolean;

  setSearchQuery: (query: string) => void;
  /** Both spellings, set together. Passing nulls clears the country filter. */
  setSelectedCountry: (country: string | null, countryCode?: string | null) => void;
  /** Both spellings, set together. Passing nulls clears the category filter. */
  setSelectedCategory: (category: string | null, categoryKey?: string | null) => void;
  setSortBy: (sort: 'newest' | 'trending' | 'helpful' | 'updated') => void;
  toggleShowExpiredUpdates: () => void;
  resetFilters: () => void;
}

export const useKnowledgeSearchStore = create<KnowledgeSearchState>((set) => ({
  searchQuery: '',
  selectedCountry: null,
  selectedCountryCode: null,
  selectedCategory: null,
  selectedCategoryKey: null,
  sortBy: 'trending',
  showExpiredUpdates: false,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCountry: (selectedCountry, selectedCountryCode = null) =>
    set({ selectedCountry, selectedCountryCode }),
  setSelectedCategory: (selectedCategory, selectedCategoryKey = null) =>
    set({ selectedCategory, selectedCategoryKey }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleShowExpiredUpdates: () => set((state) => ({ showExpiredUpdates: !state.showExpiredUpdates })),
  resetFilters: () => set({
    searchQuery: '',
    selectedCountry: null,
    selectedCountryCode: null,
    selectedCategory: null,
    selectedCategoryKey: null,
    sortBy: 'trending',
    showExpiredUpdates: false,
  }),
}));
