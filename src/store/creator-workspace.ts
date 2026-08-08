import { create } from 'zustand';
import { WorkspaceFilters } from '@/types/creator';

export type CreatorSection = 'overview' | 'workspace' | 'organizations' | 'analytics';

interface OfflineAction {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
}

interface CreatorWorkspaceState {
  activeSection: CreatorSection;
  activeCategory: string; // 'all' | 'guides' | 'updates' | 'providers' | 'marketplace' | 'housing' | 'jobs' | 'events' | 'organizations' | 'drafts' | 'archived'
  filters: WorkspaceFilters;
  isMultiSelectMode: boolean;
  selectedItemIds: string[];
  isOffline: boolean;
  offlineQueue: OfflineAction[];
  
  // Actions
  setActiveSection: (section: CreatorSection) => void;
  setActiveCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (statuses: string[]) => void;
  setDateRange: (range: WorkspaceFilters['dateRange']) => void;
  setSortOption: (sort: WorkspaceFilters['sortOption']) => void;
  setIdentityFilter: (identityId: string) => void;
  resetFilters: () => void;
  
  // Multi-select & Bulk
  toggleMultiSelectMode: () => void;
  selectItem: (id: string) => void;
  deselectItem: (id: string) => void;
  toggleSelectItem: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  
  // Offline queueing
  setOfflineStatus: (isOffline: boolean) => void;
  queueOfflineAction: (action: Omit<OfflineAction, 'id' | 'timestamp'>) => void;
  clearOfflineQueue: () => void;
}

const initialFilters: WorkspaceFilters = {
  statusFilter: [],
  dateRange: 'all',
  sortOption: 'newest',
  searchQuery: '',
  contentTypeCategory: 'all',
  identityId: 'all',
};

export const useCreatorWorkspaceStore = create<CreatorWorkspaceState>((set, get) => ({
  activeSection: 'workspace', // Workspace is default destination for active creators
  activeCategory: 'all',
  filters: initialFilters,
  isMultiSelectMode: false,
  selectedItemIds: [],
  isOffline: false,
  offlineQueue: [],

  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveCategory: (activeCategory) => set((state) => ({
    activeCategory,
    filters: { ...state.filters, contentTypeCategory: activeCategory },
  })),

  setSearchQuery: (searchQuery) => set((state) => ({
    filters: { ...state.filters, searchQuery },
  })),

  setStatusFilter: (statusFilter) => set((state) => ({
    filters: { ...state.filters, statusFilter },
  })),

  setDateRange: (dateRange) => set((state) => ({
    filters: { ...state.filters, dateRange },
  })),

  setSortOption: (sortOption) => set((state) => ({
    filters: { ...state.filters, sortOption },
  })),

  setIdentityFilter: (identityId) => set((state) => ({
    filters: { ...state.filters, identityId },
  })),

  resetFilters: () => set((state) => ({
    filters: { ...initialFilters, contentTypeCategory: state.activeCategory },
  })),

  toggleMultiSelectMode: () => set((state) => ({
    isMultiSelectMode: !state.isMultiSelectMode,
    selectedItemIds: [],
  })),

  selectItem: (id) => set((state) => ({
    selectedItemIds: state.selectedItemIds.includes(id) ? state.selectedItemIds : [...state.selectedItemIds, id],
  })),

  deselectItem: (id) => set((state) => ({
    selectedItemIds: state.selectedItemIds.filter((itemId) => itemId !== id),
  })),

  toggleSelectItem: (id) => set((state) => ({
    selectedItemIds: state.selectedItemIds.includes(id)
      ? state.selectedItemIds.filter((itemId) => itemId !== id)
      : [...state.selectedItemIds, id],
  })),

  selectAll: (ids) => set({ selectedItemIds: ids }),

  clearSelection: () => set({ selectedItemIds: [], isMultiSelectMode: false }),

  setOfflineStatus: (isOffline) => set({ isOffline }),

  queueOfflineAction: (action) => set((state) => ({
    offlineQueue: [
      ...state.offlineQueue,
      {
        ...action,
        id: `offline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
      },
    ],
  })),

  clearOfflineQueue: () => set({ offlineQueue: [] }),
}));
