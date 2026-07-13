import { create } from 'zustand';
import type { UserReputation } from '@/types/reputation';
import { mockUserReputation } from '@/mocks/community-data';

interface ReputationState {
  reputation: UserReputation | null;
  isLoading: boolean;
  setReputation: (rep: UserReputation) => void;
  loadReputation: () => void;
}

export const useReputationStore = create<ReputationState>((set) => ({
  reputation: null,
  isLoading: false,
  loadReputation: () => {
    set({ isLoading: true });
    // Simulate API call — in production this would call /v1/reputation/me
    setTimeout(() => {
      set({ reputation: mockUserReputation, isLoading: false });
    }, 300);
  },
  setReputation: (rep) => set({ reputation: rep }),
}));
