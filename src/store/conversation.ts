/**
 * Diaspora Conversations — Primary Conversation Store
 *
 * Manages inbox, messages, requests, search, offline queue.
 */

import { create } from 'zustand';
import { router } from 'expo-router';
import { apiClient } from '@/lib/apiClient';
import { currentUserIdIn, isOwnMessage } from '@/lib/conversation-identity';
import { readPage } from '@/lib/platform-envelope';
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
  /**
   * A message that arrived live. `signedInUserId` names the member when the
   * conversation is not on the device yet, so their own message from another
   * device is still not counted as unread.
   */
  receiveMessage: (message: Message, signedInUserId?: string | null) => void;
  addOptimisticMessage: (
    conversationId: string,
    opts: {
      text?: string;
      replyToMessageId?: string;
      localId: string;
      /** The member sending it. A pending bubble carries their real id, never a fixture's. */
      senderId: string;
      senderName: string;
    }
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

/**
 * A reply's quoted author and preview, from the message it answers.
 *
 * Neither the pending bubble nor the live payload carries them — the live one
 * sends only `replyToMessageId` — and the REST reply reference has no author
 * name. The quoted message is already in the thread, so it is read from there.
 */
function withReplyPreview(message: Message, thread: Message[]): Message {
  const reply = message.replyTo;
  if (!reply || (reply.senderId && reply.previewText)) return message;

  const quoted = thread.find((m) => m.messageId === reply.messageId);
  if (!quoted) return message;

  return {
    ...message,
    replyTo: {
      ...reply,
      senderId: reply.senderId || quoted.senderId,
      previewText: reply.previewText || (quoted.text ?? '').slice(0, 120),
      attachmentType: reply.attachmentType ?? quoted.attachment?.type,
    },
  };
}

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

      // ── `readPage`, and the crash it ends ────────────────────────────────
      //
      // This read `res.data.data` and assigned it straight to `conversations`.
      // `GET /conversations` answers
      // `{ data: { items, nextCursor, hasMore, totalUnread, unappliedFilters } }`
      // — the platform's cursor envelope — so `conversations` became the
      // **envelope object** rather than the array.
      //
      // `selectTotalUnread` then calls `.filter` on it, from `TabLayout`, which
      // renders on every tab. The result was `TypeError: undefined is not a
      // function` and **the app crashed on launch for any member who had at
      // least one conversation.**
      //
      // It survived because nobody with a conversation ever launched a release
      // build: under Metro the inbox came from fixtures, and the seeded
      // walkthrough member had an empty inbox until one was created for them.
      //
      // `readPage` is the shared reader for exactly this and accepts a bare
      // array too, so a route that changes shape cannot reintroduce it.
      set({ conversations: readPage<Conversation>(res.data).items, isLoadingConversations: false });
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
      // ── The envelope, again ────────────────────────────────────────────────
      //
      // This read `res.data.messages`. The route answers
      // `{ data: { conversation, messages, nextCursor, hasMore } }`, so the
      // messages sit one level deeper and the read was always `undefined` —
      // `|| []` then turned that into an empty thread rather than an error.
      //
      // Every private conversation therefore opened blank while its own row in
      // the inbox showed the last message. The `catch` below is silent, so this
      // looked identical to "this conversation has no messages yet".
      const body = res.data?.data ?? res.data;
      const msgs: Message[] = Array.isArray(body?.messages) ? body.messages : [];

      // ── The conversation, which was also being thrown away ─────────────────
      //
      // The same payload carries the conversation itself, and only `messages`
      // was kept. The screen derives its header — and its "does this exist"
      // check — from `conversations.find(...)` over the **inbox list**, and
      // nothing on that screen loads the inbox.
      //
      // So opening a conversation any way other than tapping its row in the
      // inbox — a deep link, a notification tap, a cold start on that route —
      // found an empty list, and rendered **"Conversation not found"** for a
      // conversation that exists and whose messages had just been fetched
      // successfully. Not a race: nothing would ever have populated it.
      const fetched = body?.conversation as Conversation | undefined;

      set((s) => ({
        messages: { ...s.messages, [conversationId]: msgs },
        conversations: fetched
          ? // Replace in place when the inbox already has it, so a list loaded
            // afterwards does not end up with two rows for one conversation.
            s.conversations.some((c) => c.conversationId === fetched.conversationId)
            ? s.conversations.map((c) =>
                c.conversationId === fetched.conversationId ? { ...c, ...fetched } : c
              )
            : [...s.conversations, fetched]
          : s.conversations,
        isLoadingMessages: { ...s.isLoadingMessages, [conversationId]: false },
      }));
    } catch {
      set((s) => ({
        isLoadingMessages: { ...s.isLoadingMessages, [conversationId]: false },
      }));
    }
  },

  receiveMessage: (incoming, signedInUserId) => {
    set((state) => {
      const existing = state.messages[incoming.conversationId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.messageId === incoming.messageId)) return state;

      const conversation = state.conversations.find(
        (c) => c.conversationId === incoming.conversationId
      );

      // The live payload carries only the id of what it replies to.
      const message = withReplyPreview(incoming, existing);

      // ── The member's own message, coming back ──────────────────────────────
      //
      // The server sends `MessageReceived` to the sender too — to every socket
      // they hold, including this one — echoing the `localId` of the pending
      // bubble. Appending it put the message on screen twice whenever the echo
      // beat the send's own response, and counted a member's own message as
      // unread in their inbox.
      const pending = message.localId
        ? existing.findIndex((m) => m.localId === message.localId)
        : -1;
      const own =
        pending >= 0 || isOwnMessage(message, currentUserIdIn(conversation, signedInUserId));

      const thread =
        pending >= 0
          ? existing.map((m, index) => (index === pending ? { ...message, isOptimistic: false } : m))
          : [...existing, message];

      const convs = state.conversations.map((c) => {
        if (c.conversationId !== message.conversationId) return c;
        return {
          ...c,
          lastMessage: message,
          unreadCount: own ? c.unreadCount : c.unreadCount + 1,
          updatedAt: message.createdAt,
        };
      });

      return {
        messages: { ...state.messages, [message.conversationId]: thread },
        conversations: convs,
        newMessageConversationId: own ? state.newMessageConversationId : message.conversationId,
      };
    });
  },

  addOptimisticMessage: (conversationId, { text, replyToMessageId, localId, senderId, senderName }) => {
    set((state) => {
      const existing = state.messages[conversationId] || [];

      // Stamped `senderId: 'user-current'` and `senderName: 'Joshua M.'` — a
      // development fixture's member — on every member's pending bubble.
      const optimistic: Message = withReplyPreview(
        {
          messageId: localId,
          conversationId,
          senderId,
          senderName,
          type: 'text',
          text,
          delivery: { status: 'sending', queuedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
          localId,
          isOptimistic: true,
          replyTo: replyToMessageId
            ? { messageId: replyToMessageId, senderId: '', senderName: '', previewText: '' }
            : undefined,
        },
        existing
      );
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

      // The live echo can land first and take the pending bubble's place (see
      // `receiveMessage`). Then there is nothing left to confirm, and mapping
      // would leave two rows under one message id.
      const echoed = convMessages.some(
        (m) => m.messageId === confirmed.messageId && m.localId !== localId
      );

      const thread = echoed
        ? convMessages.filter((m) => m.localId !== localId || m.messageId === confirmed.messageId)
        : convMessages.map((m) =>
            m.localId === localId
              ? { ...withReplyPreview(confirmed, convMessages), isOptimistic: false }
              : m
          );

      return {
        messages: { ...state.messages, [confirmed.conversationId]: thread },
        conversations: state.conversations.map((c) =>
          c.conversationId === confirmed.conversationId && c.lastMessage?.localId === localId
            ? { ...c, lastMessage: { ...confirmed, isOptimistic: false } }
            : c
        ),
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

      // Same envelope, same reader. This one had the same bug and would have
      // crashed the requests screen the moment a member received a request.
      set({ requests: readPage<ConversationRequest>(res.data).items, isLoadingRequests: false });
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
      // The route answers `{ data: { results, provider } }`, so `res.data.results`
      // was `undefined` and every search assigned a non-array to a list the
      // screen maps over.
      const body = res.data?.data ?? res.data;
      set({ searchResults: Array.isArray(body?.results) ? body.results : [], isSearching: false });
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
