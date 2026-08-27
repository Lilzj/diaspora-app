/**
 * Diaspora Conversations — Presence Store
 */

import { create } from 'zustand';
import type { PresenceStatus } from '@/types/conversation';

interface PresenceEntry {
  status: PresenceStatus;
  lastSeenAt?: string;
  updatedAt: string;
}

interface PresenceState {
  presence: Record<string, PresenceEntry>;
  setPresence: (userId: string, status: PresenceStatus, lastSeenAt?: string) => void;
  getPresence: (userId: string) => PresenceEntry | null;
  /**
   * A human label for a member's presence, or null when there is none to give.
   *
   * Null rather than "Offline": an absent entry means nobody has told us, and
   * with `RealtimeHandshake.PresenceEnabled` off nobody ever will. Saying
   * "Offline" there is a claim the platform never made.
   */
  getStatusLabel: (userId: string) => string | null;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presence: {
    // Seed initial presence
    'user-amara': { status: 'online', updatedAt: new Date().toISOString() },
    'user-sarah': { status: 'away', lastSeenAt: new Date(Date.now() - 5 * 60000).toISOString(), updatedAt: new Date().toISOString() },
    'user-fatou': { status: 'online', updatedAt: new Date().toISOString() },
    'user-jean': { status: 'offline', lastSeenAt: new Date(Date.now() - 2 * 3600000).toISOString(), updatedAt: new Date().toISOString() },
    'user-chinwe': { status: 'offline', lastSeenAt: new Date(Date.now() - 1 * 86400000).toISOString(), updatedAt: new Date().toISOString() },
  },

  setPresence: (userId, status, lastSeenAt) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [userId]: { status, lastSeenAt, updatedAt: new Date().toISOString() },
      },
    })),

  getPresence: (userId) => get().presence[userId] ?? null,

  getStatusLabel: (userId) => {
    const entry = get().presence[userId];
    if (!entry) return null;
    if (entry.status === 'online') return 'Active now';
    if (entry.status === 'away') return 'Away';
    if (!entry.lastSeenAt) return 'Offline';

    const diff = Date.now() - new Date(entry.lastSeenAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Last seen just now';
    if (mins < 60) return `Last seen ${mins}m ago`;
    if (hrs < 24) return `Last seen ${hrs}h ago`;
    if (days === 1) return 'Last seen yesterday';
    return `Last seen ${days} days ago`;
  },
}));
