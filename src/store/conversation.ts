/**
 * Diaspora Conversations — Primary Conversation Store
 *
 * Manages inbox, messages, requests, search, offline queue.
 */

import { create } from 'zustand';
import { router } from 'expo-router';
import { apiClient } from '@/lib/apiClient';
import type {
  Conversation,
  Message,
  ConversationRequest,
  BlockedUser,
  InboxFilter,
  MuteDuration,
  MessageStatus,
  MessageDeliveryReceipt,
} from '@/types/conversation';

// ---------------------------------------------------------------------------
// OFFLINE QUEUE
// ---------------------------------------------------------------------------

export interface QueuedMessage {
  localId: string;
  conversationId: string;
  text?: string;
  replyToMessageId?: string;
  queuedAt: string;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// STATE SHAPE
// ---------------------------------------------------------------------------

interface ConversationState {
  // Inbox
  conversations: Conversation[];
  isLoadingConversations: boolean;
  conversationsError: string | null;

  // Messages (per conversation)
  messages: Record<string, Message[]>;
  isLoadingMessages: Record<string, boolean>;

  // Requests
  requests: ConversationRequest[];
  isLoadingRequests: boolean;

  // Blocked users
  blockedUserIds: string[];
  blockedUsers: BlockedUser[];

  // Active filter
  activeFilter: InboxFilter;

  // Search
  searchQuery: string;
  searchResults: Message[];
  isSearching: boolean;

  // Offline queue
  offlineQueue: QueuedMessage[];

  // New message indicator (for floating badge)
  newMessageConversationId: string | null;

  // -------------------------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------------------------

  // Inbox
  loadConversations: () => Promise<void>;
  addOrUpdateConversation: (conversation: Conversation) => void;
  setActiveFilter: (filter: InboxFilter) => void;

  // Messages
  loadMessages: (conversationId: string) => Promise<void>;
  receiveMessage: (message: Message) => void;
  addOptimisticMessage: (
    conversationId: string,
    opts: { text?: string; replyToMessageId?: string; localId: string }
  ) => void;
  confirmOptimisticMessage: (localId: string, confirmed: Message) => void;
  failOptimisticMessage: (localId: string) => void;
  updateMessageStatus: (
    conversationId: string,
    messageId: string,
    status: MessageStatus,
    timestamps?: Partial<MessageDeliveryReceipt>
  ) => void;
  editMessage: (conversationId: string, messageId: string, newText: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;

  // Conversation state transitions
  archiveConversation: (conversationId: string) => void;
  unarchiveConversation: (conversationId: string) => void;
  muteConversation: (conversationId: string, duration: MuteDuration) => void;
  unmuteConversation: (conversationId: string) => void;
  pinConversation: (conversationId: string) => void;
  unpinConversation: (conversationId: string) => void;
  markConversationRead: (conversationId: string) => void;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;

  // Requests
  loadRequests: () => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => void;

  // Search
  searchMessages: (query: string) => Promise<void>;
  clearSearch: () => void;

  // New message indicator
  setNewMessageIndicator: (conversationId: string | null) => void;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function getMutedUntil(duration: MuteDuration): string | undefined {
  const d = new Date();
  switch (duration) {
    case '8h': d.setHours(d.getHours() + 8); break;
    case '24h': d.setDate(d.getDate() + 1); break;
    case '7d': d.setDate(d.getDate() + 7); break;
    case 'forever': return undefined;
  }
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  isLoadingConversations: false,
  conversationsError: null,
  messages: {},
  isLoadingMessages: {},
  requests: [],
  isLoadingRequests: false,
  blockedUserIds: [],
  blockedUsers: [],
  activeFilter: 'All',
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  offlineQueue: [],
  newMessageConversationId: null,

  // ---------------------------------------------------------------------------
  // INBOX
  // ---------------------------------------------------------------------------

  loadConversations: async () => {
    set({ isLoadingConversations: true, conversationsError: null });
    try {
      const res = await apiClient.get('/conversations');
      set({ conversations: res.data.data, isLoadingConversations: false });
    } catch (err: any) {
      set({
        conversationsError: err?.response?.data?.message || 'Failed to load conversations',
        isLoadingConversations: false,
      });
    }
  },

  addOrUpdateConversation: (conversation) => {
    set((state) => {
      const existing = state.conversations.findIndex(
        (c) => c.conversationId === conversation.conversationId
      );
      if (existing >= 0) {
        const updated = [...state.conversations];
        updated[existing] = conversation;
        return { conversations: updated };
      }
      return { conversations: [conversation, ...state.conversations] };
    });
  },

  setActiveFilter: (filter) => set({ activeFilter: filter }),

  // ---------------------------------------------------------------------------
  // MESSAGES
  // ---------------------------------------------------------------------------

  loadMessages: async (conversationId) => {
    set((s) => ({ isLoadingMessages: { ...s.isLoadingMessages, [conversationId]: true } }));
    try {
      const res = await apiClient.get(`/conversations/${conversationId}`);
      const msgs: Message[] = res.data.messages || [];
      set((s) => ({
        messages: { ...s.messages, [conversationId]: msgs },
        isLoadingMessages: { ...s.isLoadingMessages, [conversationId]: false },
      }));
    } catch {
      set((s) => ({
        isLoadingMessages: { ...s.isLoadingMessages, [conversationId]: false },
      }));
    }
  },

  receiveMessage: (message) => {
    set((state) => {
      const existing = state.messages[message.conversationId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.messageId === message.messageId)) return state;

      const updated = { ...state.messages, [message.conversationId]: [...existing, message] };

      // Update last message + unread count on conversation
      const convs = state.conversations.map((c) => {
        if (c.conversationId !== message.conversationId) return c;
        return {
          ...c,
          lastMessage: message,
          unreadCount: c.unreadCount + 1,
          updatedAt: message.createdAt,
        };
      });

      return {
        messages: updated,
        conversations: convs,
        newMessageConversationId: message.conversationId,
      };
    });
  },

  addOptimisticMessage: (conversationId, { text, replyToMessageId, localId }) => {
    const optimistic: Message = {
      messageId: localId,
      conversationId,
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text,
      delivery: { status: 'sending', queuedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      localId,
      isOptimistic: true,
      replyTo: replyToMessageId
        ? { messageId: replyToMessageId, senderId: '', senderName: '', previewText: '' }
        : undefined,
    };

    set((state) => {
      const existing = state.messages[conversationId] || [];
      return {
        messages: { ...state.messages, [conversationId]: [...existing, optimistic] },
        conversations: state.conversations.map((c) =>
          c.conversationId === conversationId
            ? { ...c, lastMessage: optimistic, updatedAt: optimistic.createdAt }
            : c
        ),
      };
    });
  },

  confirmOptimisticMessage: (localId, confirmed) => {
    set((state) => {
      const convMessages = state.messages[confirmed.conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [confirmed.conversationId]: convMessages.map((m) =>
            m.localId === localId ? { ...confirmed, isOptimistic: false } : m
          ),
        },
      };
    });
  },

  failOptimisticMessage: (localId) => {
    set((state) => {
      const allMessages = { ...state.messages };
      for (const convId of Object.keys(allMessages)) {
        allMessages[convId] = allMessages[convId].map((m) =>
          m.localId === localId
            ? { ...m, delivery: { ...m.delivery, status: 'failed' as MessageStatus } }
            : m
        );
      }
      return { messages: allMessages };
    });
  },

  updateMessageStatus: (conversationId, messageId, status, timestamps = {}) => {
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) =>
            m.messageId === messageId
              ? { ...m, delivery: { ...m.delivery, status, ...timestamps } }
              : m
          ),
        },
      };
    });
  },

  editMessage: (conversationId, messageId, newText) => {
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) =>
            m.messageId === messageId
              ? { ...m, text: newText, isEdited: true, editedAt: new Date().toISOString() }
              : m
          ),
        },
      };
    });
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) =>
            m.messageId === messageId
              ? { ...m, isDeleted: true, text: undefined, deletedAt: new Date().toISOString() }
              : m
          ),
        },
      };
    });
  },

  // ---------------------------------------------------------------------------
  // STATE TRANSITIONS
  // ---------------------------------------------------------------------------

  archiveConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversationId === id ? { ...c, isArchived: true, state: 'Archived' } : c
      ),
    })),

  unarchiveConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversationId === id ? { ...c, isArchived: false, state: 'Active' } : c
      ),
    })),

  muteConversation: (id, duration) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversationId === id
          ? { ...c, isMuted: true, state: 'Muted', mutedUntil: getMutedUntil(duration) }
          : c
      ),
    })),

  unmuteConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversationId === id
          ? { ...c, isMuted: false, state: 'Active', mutedUntil: undefined }
          : c
      ),
    })),

  pinConversation: (id) =>
    set((s) => {
      const pinned = s.conversations.filter((c) => c.isPinned).length;
      if (pinned >= 5) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.conversationId === id ? { ...c, isPinned: true, pinOrder: pinned + 1 } : c
        ),
      };
    }),

  unpinConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversationId === id ? { ...c, isPinned: false, pinOrder: undefined } : c
      ),
    })),

  markConversationRead: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversationId === id ? { ...c, unreadCount: 0 } : c
      ),
    })),

  blockUser: (userId) =>
    set((s) => ({
      blockedUserIds: [...s.blockedUserIds, userId],
      conversations: s.conversations.map((c) => {
        const hasUser = c.participants.some((p) => p.userId === userId);
        return hasUser ? { ...c, isBlocked: true, state: 'Blocked' } : c;
      }),
    })),

  unblockUser: (userId) =>
    set((s) => ({
      blockedUserIds: s.blockedUserIds.filter((id) => id !== userId),
      blockedUsers: s.blockedUsers.filter((u) => u.userId !== userId),
    })),

  // ---------------------------------------------------------------------------
  // REQUESTS
  // ---------------------------------------------------------------------------

  loadRequests: async () => {
    set({ isLoadingRequests: true });
    try {
      const res = await apiClient.get('/conversations/requests');
      set({ requests: res.data.data, isLoadingRequests: false });
    } catch {
      set({ isLoadingRequests: false });
    }
  },

  acceptRequest: async (requestId) => {
    try {
      const res = await apiClient.post(`/conversations/requests/${requestId}/accept`);
      const conversation: Conversation = res.data.data;
      set((s) => ({
        requests: s.requests.filter((r) => r.requestId !== requestId),
        conversations: [conversation, ...s.conversations],
      }));
      router.push(`/conversation/${conversation.conversationId}`);
    } catch (err) {
      console.error('[ConversationStore] acceptRequest failed:', err);
    }
  },

  declineRequest: (requestId) => {
    apiClient.post(`/conversations/requests/${requestId}/decline`).catch(() => {});
    set((s) => ({ requests: s.requests.filter((r) => r.requestId !== requestId) }));
  },

  // ---------------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------------

  searchMessages: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], searchQuery: '' });
      return;
    }
    set({ isSearching: true, searchQuery: query });
    try {
      const res = await apiClient.post('/conversations/search', { query });
      set({ searchResults: res.data.results, isSearching: false });
    } catch {
      set({ isSearching: false });
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [], isSearching: false }),

  // ---------------------------------------------------------------------------
  // NEW MESSAGE INDICATOR
  // ---------------------------------------------------------------------------

  setNewMessageIndicator: (conversationId) => set({ newMessageConversationId: conversationId }),
}));

// ---------------------------------------------------------------------------
// SELECTORS
// ---------------------------------------------------------------------------

export function selectFilteredConversations(
  conversations: Conversation[],
  filter: InboxFilter
): Conversation[] {
  switch (filter) {
    case 'All':
      return conversations.filter((c) => !c.isArchived && !c.isBlocked);
    case 'Unread':
      return conversations.filter((c) => !c.isArchived && c.unreadCount > 0);
    case 'Requests':
      return conversations.filter((c) => c.state === 'PendingRequest');
    case 'VerifiedOnly':
      return conversations.filter((c) =>
        !c.isArchived && c.participants.some((p) => !p.isCurrentUser && p.trust.isVerified)
      );
    case 'Providers':
      return conversations.filter((c) => c.context.type === 'ProviderInquiry' && !c.isArchived);
    case 'Marketplace':
      return conversations.filter((c) => c.context.type === 'MarketplaceListing' && !c.isArchived);
    case 'Housing':
      return conversations.filter((c) => c.context.type === 'HousingListing' && !c.isArchived);
    case 'Jobs':
      return conversations.filter((c) => c.context.type === 'JobOpportunity' && !c.isArchived);
    case 'Community':
      return conversations.filter((c) => c.context.type === 'CommunityEvent' && !c.isArchived);
    case 'Organizations':
      return conversations.filter((c) => c.context.type === 'Organization' && !c.isArchived);
    case 'Events':
      return conversations.filter((c) => c.context.type === 'CommunityEvent' && !c.isArchived);
    case 'Support':
      return conversations.filter((c) => c.context.type === 'SupportTicket' && !c.isArchived);
    case 'Archived':
      return conversations.filter((c) => c.isArchived);
    default:
      return conversations.filter((c) => !c.isArchived);
  }
}

export function selectTotalUnread(conversations: Conversation[]): number {
  return conversations
    .filter((c) => !c.isArchived && !c.isMuted)
    .reduce((sum, c) => sum + c.unreadCount, 0);
}

export function selectSortedConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    // Pinned first, by pinOrder
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.isPinned && b.isPinned) return (a.pinOrder ?? 0) - (b.pinOrder ?? 0);
    // Then by updatedAt
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
