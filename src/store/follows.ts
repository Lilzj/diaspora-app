import { create } from 'zustand';

interface FollowState {
  followedUserIds: Set<string>;
  follow: (userId: string) => void;
  unfollow: (userId: string) => void;
  isFollowing: (userId: string) => boolean;
}

export const useFollowStore = create<FollowState>((set, get) => ({
  followedUserIds: new Set(['user-202']),  // Amara follows Fatima by default
  follow: (userId) =>
    set((state) => {
      const next = new Set(state.followedUserIds);
      next.add(userId);
      return { followedUserIds: next };
    }),
  unfollow: (userId) =>
    set((state) => {
      const next = new Set(state.followedUserIds);
      next.delete(userId);
      return { followedUserIds: next };
    }),
  isFollowing: (userId) => get().followedUserIds.has(userId),
}));
