/**
 * Diaspora Conversations — Typing Store
 *
 * Tracks who is typing in each conversation.
 * Uses TypingStarted / TypingEnded event model (SignalR-ready).
 */

import { create } from 'zustand';

interface TypingUser {
  userId: string;
  userName: string;
  startedAt: number; // ms timestamp
}

interface TypingState {
  // conversationId → userId → TypingUser
  typing: Record<string, Record<string, TypingUser>>;

  setTyping: (conversationId: string, userId: string, userName: string) => void;
  clearTyping: (conversationId: string, userId: string) => void;
  clearAllTyping: (conversationId: string) => void;
  getTypingUsers: (conversationId: string) => TypingUser[];
  getTypingLabel: (conversationId: string) => string | null;
}

// Auto-clear typing after 5s of no update
const TYPING_TIMEOUT_MS = 5000;
const clearTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

export const useTypingStore = create<TypingState>((set, get) => ({
  typing: {},

  setTyping: (conversationId, userId, userName) => {
    // Reset auto-clear timer
    const key = `${conversationId}-${userId}`;
    const existing = clearTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      get().clearTyping(conversationId, userId);
      clearTimers.delete(key);
    }, TYPING_TIMEOUT_MS);
    clearTimers.set(key, timer);

    set((state) => ({
      typing: {
        ...state.typing,
        [conversationId]: {
          ...(state.typing[conversationId] || {}),
          [userId]: { userId, userName, startedAt: Date.now() },
        },
      },
    }));
  },

  clearTyping: (conversationId, userId) => {
    set((state) => {
      const conv = { ...(state.typing[conversationId] || {}) };
      delete conv[userId];
      return {
        typing: { ...state.typing, [conversationId]: conv },
      };
    });
  },

  clearAllTyping: (conversationId) => {
    set((state) => ({ typing: { ...state.typing, [conversationId]: {} } }));
  },

  getTypingUsers: (conversationId) => {
    return Object.values(get().typing[conversationId] || {});
  },

  getTypingLabel: (conversationId) => {
    const users = Object.values(get().typing[conversationId] || {});
    if (users.length === 0) return null;
    if (users.length === 1) return `${users[0].userName} is typing...`;
    if (users.length === 2) return `${users[0].userName} and ${users[1].userName} are typing...`;
    return 'Several people are typing...';
  },
}));
