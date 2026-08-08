import { create } from 'zustand';
import { CreatorTimelineEvent } from '@/types/creator';
import { mockTimelineEvents } from '@/mocks/creator-data';

interface CreatorTimelineState {
  events: CreatorTimelineEvent[];
  filterType: string; // 'all' | 'published' | 'status_changed' | 'verification' | 'milestones'
  
  // Actions
  addEvent: (event: Omit<CreatorTimelineEvent, 'id' | 'timestamp'>) => void;
  setFilterType: (type: string) => void;
  clearHistory: () => void;
}

export const useCreatorTimelineStore = create<CreatorTimelineState>((set) => ({
  events: mockTimelineEvents,
  filterType: 'all',

  addEvent: (event) => set((state) => ({
    events: [
      {
        ...event,
        id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: 'Just now',
      },
      ...state.events,
    ],
  })),

  setFilterType: (filterType) => set({ filterType }),
  clearHistory: () => set({ events: [] }),
}));
