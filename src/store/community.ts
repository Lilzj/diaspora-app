import { create } from 'zustand';
import type { UpdateCategory } from '@/types/update';

interface CommunityState {
  selectedCategory: UpdateCategory | null;
  locationName: string;
  showExpired: boolean;
  setCategory: (cat: UpdateCategory | null) => void;
  setLocationName: (name: string) => void;
  toggleShowExpired: () => void;
}

export const useCommunityStore = create<CommunityState>((set) => ({
  selectedCategory: null,
  locationName: 'Peckham, London',
  showExpired: false,
  setCategory: (cat) => set({ selectedCategory: cat }),
  setLocationName: (name) => set({ locationName: name }),
  toggleShowExpired: () => set((s) => ({ showExpired: !s.showExpired })),
}));
