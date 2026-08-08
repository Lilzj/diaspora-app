/**
 * Diaspora Conversations — Mock API Handlers
 *
 * 20 HTTP endpoints using axios-mock-adapter.
 * Follows the exact same pattern as other mock handlers.
 */

import type MockAdapter from 'axios-mock-adapter';
import {
  mockConversations,
  mockMessages,
  mockConversationRequests,
  mockBlockedUsers,
  currentUser as mockCurrentUser,
} from '../conversation-data';
import type { Conversation, Message, ConversationContextSnapshot } from '@/types/conversation';

// In-memory mutable state (session-scoped)
let conversations = [...mockConversations];
let messagesDb: Record<string, Message[]> = Object.fromEntries(
  Object.entries(mockMessages).map(([k, v]) => [k, [...v]])
);
let requests = [...mockConversationRequests];
let blockedUsers = [...mockBlockedUsers];

function nowIso() {
  return new Date().toISOString();
}

function makeMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeConvId() {
  return `conv-${Date.now()}`;
}

export function setupConversationMocks(mock: MockAdapter) {

  // -------------------------------------------------------------------------
  // GET /conversations — Inbox (paginated + filtered)
  // -------------------------------------------------------------------------
  mock.onGet(/\/conversations$/).reply((config) => {
    const params = config.params || {};
    const filter = params.filter || 'All';
    const page = Number(params.page || 1);
    const pageSize = Number(params.pageSize || 30);

    let result = [...conversations];

    if (filter === 'Unread') result = result.filter((c) => c.unreadCount > 0 && !c.isArchived);
    else if (filter === 'Archived') result = result.filter((c) => c.isArchived);
    else result = result.filter((c) => !c.isArchived);

    // Sort: pinned first, then by updatedAt
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const total = result.length;
    const sliced = result.slice((page - 1) * pageSize, page * pageSize);

    return [200, {
      data: sliced,
      pagination: {
        page,
        pageSize,
        totalCount: total,
        hasNextPage: page * pageSize < total,
      },
    }];
  });

  // -------------------------------------------------------------------------
  // GET /conversations/:id — Single conversation + messages
  // -------------------------------------------------------------------------
  mock.onGet(/\/conversations\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    // Skip routes that have sub-paths
    if (url.includes('/messages') || url.includes('/read') || url.includes('/media') || url.includes('/requests') || url.includes('/blocked') || url.includes('/search')) {
      return [404, { message: 'Not found' }];
    }
    const id = url.split('/').pop() || '';
    const conv = conversations.find((c) => c.conversationId === id);
    if (!conv) return [404, { message: `Conversation ${id} not found` }];

    const msgs = messagesDb[id] || [];
    return [200, { data: conv, messages: msgs }];
  });

  // -------------------------------------------------------------------------
  // POST /conversations — Create or find existing by context
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations$/).reply((config) => {
    try {
      const body = JSON.parse(config.data);
      const { recipientId, context } = body;

      const snapshot: ConversationContextSnapshot = {
        ...context,
        snapshotAt: nowIso(),
        appVersion: '1.0.0',
      };

      // Find existing
      const existing = conversations.find(
        (c) =>
          c.context.type === context.type &&
          c.context.entityId === context.entityId &&
          c.participants.some((p) => p.userId === recipientId) &&
          c.state !== 'Blocked' &&
          c.state !== 'Closed'
      );

      if (existing) return [200, { data: existing }];

      // Create new
      const newConv: Conversation = {
        conversationId: makeConvId(),
        state: 'Active',
        context: snapshot,
        participants: [
          mockCurrentUser,
          {
            userId: recipientId,
            displayName: body.recipientName || 'User',
            avatarUrl: body.recipientAvatarUrl,
            trust: { isVerified: false, responseTime: 'Unknown', memberSince: '2026', reputationLevel: 'NewMember' },
            isCurrentUser: false,
          },
        ],
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        isArchived: false,
        isBlocked: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      conversations.unshift(newConv);
      messagesDb[newConv.conversationId] = [{
        messageId: makeMessageId(),
        conversationId: newConv.conversationId,
        senderId: 'system',
        senderName: 'System',
        type: 'system',
        text: `Conversation started from ${context.entityTitle}`,
        delivery: { status: 'delivered', sentAt: nowIso(), deliveredAt: nowIso() },
        createdAt: nowIso(),
      }];

      return [201, { data: newConv }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // -------------------------------------------------------------------------
  // POST /conversations/:id/messages — Send message
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/[a-zA-Z0-9_-]+\/messages$/).reply((config) => {
    try {
      const url = config.url || '';
      const convId = url.split('/').slice(-2)[0];
      const body = JSON.parse(config.data);
      const conv = conversations.find((c) => c.conversationId === convId);
      if (!conv) return [404, { message: 'Conversation not found' }];

      const message: Message = {
        messageId: makeMessageId(),
        conversationId: convId,
        senderId: 'user-current',
        senderName: 'Joshua M.',
        type: body.type || 'text',
        text: body.text,
        replyTo: body.replyToMessageId ? {
          messageId: body.replyToMessageId,
          senderId: '',
          senderName: '',
          previewText: '',
        } : undefined,
        delivery: { status: 'sent', sentAt: nowIso() },
        createdAt: nowIso(),
        localId: body.localId,
      };

      if (!messagesDb[convId]) messagesDb[convId] = [];
      messagesDb[convId].push(message);

      // Update conversation lastMessage
      const idx = conversations.findIndex((c) => c.conversationId === convId);
      if (idx >= 0) {
        conversations[idx] = { ...conversations[idx], lastMessage: message, updatedAt: nowIso() };
      }

      return [201, { data: message }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // -------------------------------------------------------------------------
  // PUT /conversations/:id/messages/:msgId — Edit message
  // -------------------------------------------------------------------------
  mock.onPut(/\/conversations\/[a-zA-Z0-9_-]+\/messages\/[a-zA-Z0-9_-]+$/).reply((config) => {
    try {
      const url = config.url || '';
      const parts = url.split('/');
      const msgId = parts.pop() || '';
      const convId = parts[parts.length - 2];
      const body = JSON.parse(config.data);

      const msgs = messagesDb[convId];
      if (!msgs) return [404, { message: 'Not found' }];

      const idx = msgs.findIndex((m) => m.messageId === msgId);
      if (idx < 0) return [404, { message: 'Message not found' }];

      msgs[idx] = { ...msgs[idx], text: body.text, isEdited: true, editedAt: nowIso() };
      return [200, { data: msgs[idx] }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /conversations/:id/messages/:msgId — Delete message
  // -------------------------------------------------------------------------
  mock.onDelete(/\/conversations\/[a-zA-Z0-9_-]+\/messages\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const parts = url.split('/');
    const msgId = parts.pop() || '';
    const convId = parts[parts.length - 2];

    const msgs = messagesDb[convId];
    if (msgs) {
      const idx = msgs.findIndex((m) => m.messageId === msgId);
      if (idx >= 0) {
        msgs[idx] = { ...msgs[idx], isDeleted: true, text: undefined, deletedAt: nowIso() };
      }
    }
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // PUT /conversations/:id/archive
  // -------------------------------------------------------------------------
  mock.onPut(/\/conversations\/[a-zA-Z0-9_-]+\/archive$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    const idx = conversations.findIndex((c) => c.conversationId === id);
    if (idx >= 0) conversations[idx] = { ...conversations[idx], isArchived: true, state: 'Archived' };
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // PUT /conversations/:id/unarchive
  // -------------------------------------------------------------------------
  mock.onPut(/\/conversations\/[a-zA-Z0-9_-]+\/unarchive$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    const idx = conversations.findIndex((c) => c.conversationId === id);
    if (idx >= 0) conversations[idx] = { ...conversations[idx], isArchived: false, state: 'Active' };
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // PUT /conversations/:id/mute
  // -------------------------------------------------------------------------
  mock.onPut(/\/conversations\/[a-zA-Z0-9_-]+\/mute$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    const idx = conversations.findIndex((c) => c.conversationId === id);
    if (idx >= 0) {
      conversations[idx] = { ...conversations[idx], isMuted: true, state: 'Muted' };
    }
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // PUT /conversations/:id/pin
  // -------------------------------------------------------------------------
  mock.onPut(/\/conversations\/[a-zA-Z0-9_-]+\/pin$/).reply((config) => {
    try {
      const id = (config.url || '').split('/').slice(-2)[0];
      const body = config.data ? JSON.parse(config.data) : {};
      const idx = conversations.findIndex((c) => c.conversationId === id);
      if (idx >= 0) {
        const unpin = body.unpin === true;
        conversations[idx] = { ...conversations[idx], isPinned: !unpin };
      }
      return [200, { success: true }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // -------------------------------------------------------------------------
  // POST /conversations/:id/read — Mark read
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/[a-zA-Z0-9_-]+\/read$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    const idx = conversations.findIndex((c) => c.conversationId === id);
    if (idx >= 0) conversations[idx] = { ...conversations[idx], unreadCount: 0 };
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // GET /conversations/requests — Pending requests
  // -------------------------------------------------------------------------
  mock.onGet(/\/conversations\/requests$/).reply(() => {
    return [200, { data: requests }];
  });

  // -------------------------------------------------------------------------
  // POST /conversations/requests/:id/accept
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/requests\/[a-zA-Z0-9_-]+\/accept$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    const req = requests.find((r) => r.requestId === id);
    if (!req) return [404, { message: 'Request not found' }];

    requests = requests.filter((r) => r.requestId !== id);

    const newConv: Conversation = {
      conversationId: makeConvId(),
      state: 'Accepted',
      context: req.context,
      participants: [mockCurrentUser, req.fromUser],
      unreadCount: 1,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      isBlocked: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    conversations.unshift(newConv);

    return [200, { data: newConv }];
  });

  // -------------------------------------------------------------------------
  // POST /conversations/requests/:id/decline
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/requests\/[a-zA-Z0-9_-]+\/decline$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    requests = requests.filter((r) => r.requestId !== id);
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // POST /conversations/block
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/block$/).reply((config) => {
    try {
      const body = JSON.parse(config.data);
      const { userId, reason } = body;
      if (!blockedUsers.find((u) => u.userId === userId)) {
        blockedUsers.push({ userId, displayName: 'User', blockedAt: nowIso(), reason });
      }
      conversations = conversations.map((c) => {
        const hasUser = c.participants.some((p) => p.userId === userId);
        return hasUser ? { ...c, isBlocked: true, state: 'Blocked' } : c;
      });
      return [200, { success: true }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // -------------------------------------------------------------------------
  // GET /conversations/blocked
  // -------------------------------------------------------------------------
  mock.onGet(/\/conversations\/blocked$/).reply(() => {
    return [200, { data: blockedUsers }];
  });

  // -------------------------------------------------------------------------
  // DELETE /conversations/blocked/:userId
  // -------------------------------------------------------------------------
  mock.onDelete(/\/conversations\/blocked\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const userId = (config.url || '').split('/').pop() || '';
    blockedUsers = blockedUsers.filter((u) => u.userId !== userId);
    return [200, { success: true }];
  });

  // -------------------------------------------------------------------------
  // GET /conversations/:id/media — Attachments gallery
  // -------------------------------------------------------------------------
  mock.onGet(/\/conversations\/[a-zA-Z0-9_-]+\/media$/).reply((config) => {
    const id = (config.url || '').split('/').slice(-2)[0];
    const msgs = messagesDb[id] || [];
    const images = msgs.filter((m) => m.type === 'image' && m.attachment).map((m) => m.attachment);
    const documents = msgs.filter((m) => m.type === 'document' && m.attachment).map((m) => m.attachment);
    const voice = msgs.filter((m) => m.type === 'voice' && m.attachment).map((m) => m.attachment);
    return [200, { data: { images, documents, voice } }];
  });

  // -------------------------------------------------------------------------
  // POST /conversations/search
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/search$/).reply((config) => {
    try {
      const { query } = JSON.parse(config.data);
      if (!query) return [200, { results: [] }];

      const q = query.toLowerCase();
      const results: Message[] = [];

      Object.values(messagesDb).forEach((msgs) => {
        msgs.forEach((m) => {
          if (m.text?.toLowerCase().includes(q)) results.push(m);
        });
      });

      return [200, { results: results.slice(0, 20) }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // -------------------------------------------------------------------------
  // POST /conversations/:id/report
  // -------------------------------------------------------------------------
  mock.onPost(/\/conversations\/[a-zA-Z0-9_-]+\/report$/).reply(() => {
    return [200, { success: true, message: 'Report submitted. Thank you for keeping Diaspora safe.' }];
  });
}
