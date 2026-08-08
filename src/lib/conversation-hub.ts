/**
 * Diaspora Conversations — ConversationHub Service
 *
 * The central service that all platform modules communicate through.
 * Never create conversations directly — always go through the Hub.
 *
 * Architecture: This service wraps the HTTP API + Real-Time layer.
 * When the backend is ready, only the API calls change — not the interface.
 *
 * Key methods:
 *   ConversationHub.openOrCreateConversation(params)  ← primary entry point
 *   ConversationHub.findConversation(type, entityId, recipientId)
 *   ConversationHub.createConversation(params)
 *   ConversationHub.archive(conversationId)
 *   ConversationHub.block(userId)
 *   ConversationHub.mute(conversationId, duration)
 *   ConversationHub.canMessage(userId)
 *   ConversationHub.pinConversation(conversationId)   ← enforces 5-pin limit
 */

import { router } from 'expo-router';
import { apiClient } from '@/lib/apiClient';
import { getRealtimeClient } from '@/lib/realtime-mock';
import { useConversationStore } from '@/store/conversation';
import { usePresenceStore } from '@/store/presence';
import { useTypingStore } from '@/store/typing';
import type {
  Conversation,
  OpenConversationParams,
  ConversationContextSnapshot,
  MuteDuration,
  ConnectionState,
} from '@/types/conversation';

const MAX_PINS = 5;

// ---------------------------------------------------------------------------
// HUB SERVICE
// ---------------------------------------------------------------------------

class ConversationHubService {
  private initialized = false;
  private unsubscribers: Array<() => void> = [];

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  async initialize(userId: string): Promise<void> {
    if (this.initialized) return;

    const client = getRealtimeClient(userId);
    await client.connect();

    // Wire real-time events to stores
    const unsub1 = client.onMessage((message) => {
      useConversationStore.getState().receiveMessage(message);
    });

    const unsub2 = client.onTyping((event) => {
      const store = useTypingStore.getState();
      if (event.eventType === 'TypingStarted' || event.eventType === 'TypingUpdated') {
        store.setTyping(event.conversationId, event.userId, event.userName);
      } else {
        store.clearTyping(event.conversationId, event.userId);
      }
    });

    const unsub3 = client.onPresence((event) => {
      usePresenceStore.getState().setPresence(event.userId, event.status, event.lastSeenAt);
    });

    const unsub4 = client.onReadReceipt((event) => {
      useConversationStore.getState().updateMessageStatus(
        event.conversationId,
        event.messageId,
        'read',
        { readAt: event.readAt }
      );
    });

    const unsub5 = client.onDelivery((event) => {
      useConversationStore.getState().updateMessageStatus(
        event.conversationId,
        event.messageId,
        'delivered',
        { deliveredAt: event.deliveredAt }
      );
    });

    this.unsubscribers = [unsub1, unsub2, unsub3, unsub4, unsub5];
    this.initialized = true;
  }

  teardown(): void {
    this.unsubscribers.forEach((fn) => fn());
    this.unsubscribers = [];
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // CORE: FIND OR CREATE — Primary Entry Point for all modules
  // ---------------------------------------------------------------------------

  /**
   * The universal entry point.
   * Finds an existing conversation for (currentUser, recipient, contextType, entityId),
   * or creates a new one. Then navigates to the conversation screen.
   *
   * This ensures there is NEVER a duplicate conversation for the same listing/entity.
   */
  async openOrCreateConversation(params: OpenConversationParams): Promise<void> {
    try {
      const store = useConversationStore.getState();

      // 1. Check local store first (fast path)
      const existing = this.findConversation(
        params.contextType,
        params.entityId,
        params.recipientId
      );

      if (existing) {
        router.push(`/conversation/${existing.conversationId}`);
        return;
      }

      // 2. Call API to find-or-create
      const context: Omit<ConversationContextSnapshot, 'snapshotAt'> = {
        type: params.contextType,
        entityId: params.entityId,
        entityTitle: params.entityTitle,
        entitySubtitle: params.entitySubtitle,
        entityImageUrl: params.entityImageUrl,
        entityPrice: params.entityPrice,
        entityStatus: params.entityStatus,
        deepLink: params.deepLink,
        campaignSource: params.campaignSource,
        appVersion: '1.0.0',
      };

      const res = await apiClient.post('/conversations', {
        recipientId: params.recipientId,
        context,
      });

      const conversation: Conversation = res.data.data;

      // 3. Add to local store
      store.addOrUpdateConversation(conversation);

      // 4. Navigate
      router.push(`/conversation/${conversation.conversationId}`);
    } catch (err) {
      console.error('[ConversationHub] openOrCreateConversation failed:', err);
      // Fallback: navigate anyway with params
      router.push({
        pathname: '/conversation/new',
        params: {
          recipientId: params.recipientId,
          recipientName: params.recipientName,
          contextType: params.contextType,
          entityId: params.entityId,
          entityTitle: params.entityTitle,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // FIND
  // ---------------------------------------------------------------------------

  /**
   * Find an existing conversation by context + recipient from local store.
   */
  findConversation(
    contextType: string,
    entityId: string,
    recipientId: string
  ): Conversation | null {
    const conversations = useConversationStore.getState().conversations;
    return (
      conversations.find(
        (c) =>
          c.context.type === contextType &&
          c.context.entityId === entityId &&
          c.participants.some((p) => p.userId === recipientId) &&
          c.state !== 'Blocked' &&
          c.state !== 'Closed'
      ) ?? null
    );
  }

  /**
   * Navigate to an existing conversation by ID.
   */
  openConversation(conversationId: string): void {
    router.push(`/conversation/${conversationId}`);
  }

  // ---------------------------------------------------------------------------
  // SEND
  // ---------------------------------------------------------------------------

  async sendMessage(
    conversationId: string,
    text: string,
    replyToMessageId?: string
  ): Promise<void> {
    const store = useConversationStore.getState();
    const localId = `local-${Date.now()}`;

    // Optimistic update
    store.addOptimisticMessage(conversationId, {
      text,
      replyToMessageId,
      localId,
    });

    try {
      const res = await apiClient.post(`/conversations/${conversationId}/messages`, {
        conversationId,
        text,
        replyToMessageId,
        localId,
      });
      const confirmed = res.data.data;
      store.confirmOptimisticMessage(localId, confirmed);

      // Simulate delivery progression
      const client = getRealtimeClient();
      client.simulateDeliveryProgression(conversationId, confirmed.messageId, confirmed.senderId);
    } catch {
      store.failOptimisticMessage(localId);
    }
  }

  // ---------------------------------------------------------------------------
  // TYPING
  // ---------------------------------------------------------------------------

  emitTypingStarted(conversationId: string): void {
    const client = getRealtimeClient();
    client.emitTypingStarted(conversationId);
  }

  emitTypingEnded(conversationId: string): void {
    const client = getRealtimeClient();
    client.emitTypingEnded(conversationId);
  }

  // ---------------------------------------------------------------------------
  // ARCHIVE
  // ---------------------------------------------------------------------------

  async archive(conversationId: string): Promise<void> {
    try {
      await apiClient.put(`/conversations/${conversationId}/archive`);
      useConversationStore.getState().archiveConversation(conversationId);
    } catch (err) {
      console.error('[ConversationHub] archive failed:', err);
    }
  }

  async unarchive(conversationId: string): Promise<void> {
    try {
      await apiClient.put(`/conversations/${conversationId}/unarchive`);
      useConversationStore.getState().unarchiveConversation(conversationId);
    } catch (err) {
      console.error('[ConversationHub] unarchive failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // MUTE
  // ---------------------------------------------------------------------------

  async mute(conversationId: string, duration: MuteDuration): Promise<void> {
    try {
      await apiClient.put(`/conversations/${conversationId}/mute`, { duration });
      useConversationStore.getState().muteConversation(conversationId, duration);
    } catch (err) {
      console.error('[ConversationHub] mute failed:', err);
    }
  }

  async unmute(conversationId: string): Promise<void> {
    try {
      await apiClient.put(`/conversations/${conversationId}/mute`, { duration: null });
      useConversationStore.getState().unmuteConversation(conversationId);
    } catch (err) {
      console.error('[ConversationHub] unmute failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // PIN — Max 5 (WhatsApp-inspired limit)
  // ---------------------------------------------------------------------------

  async pinConversation(conversationId: string): Promise<boolean> {
    const store = useConversationStore.getState();
    const pinnedCount = store.conversations.filter((c) => c.isPinned).length;

    if (pinnedCount >= MAX_PINS) {
      return false; // Caller should show "Max 5 pins" feedback
    }

    try {
      await apiClient.put(`/conversations/${conversationId}/pin`);
      store.pinConversation(conversationId);
      return true;
    } catch (err) {
      console.error('[ConversationHub] pin failed:', err);
      return false;
    }
  }

  async unpinConversation(conversationId: string): Promise<void> {
    try {
      await apiClient.put(`/conversations/${conversationId}/pin`, { unpin: true });
      useConversationStore.getState().unpinConversation(conversationId);
    } catch (err) {
      console.error('[ConversationHub] unpin failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // BLOCK
  // ---------------------------------------------------------------------------

  async block(userId: string, reason?: string): Promise<void> {
    try {
      await apiClient.post('/conversations/block', { userId, reason });
      useConversationStore.getState().blockUser(userId);
    } catch (err) {
      console.error('[ConversationHub] block failed:', err);
    }
  }

  async unblock(userId: string): Promise<void> {
    try {
      await apiClient.delete(`/conversations/blocked/${userId}`);
      useConversationStore.getState().unblockUser(userId);
    } catch (err) {
      console.error('[ConversationHub] unblock failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // CAN MESSAGE — Guard before opening conversation
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the current user can message the given userId.
   * Checks: not blocked, not banned, etc.
   */
  canMessage(userId: string): boolean {
    const store = useConversationStore.getState();
    return !store.blockedUserIds.includes(userId);
  }

  // ---------------------------------------------------------------------------
  // MARK READ
  // ---------------------------------------------------------------------------

  async markRead(conversationId: string): Promise<void> {
    try {
      await apiClient.post(`/conversations/${conversationId}/read`);
      useConversationStore.getState().markConversationRead(conversationId);
    } catch (err) {
      console.error('[ConversationHub] markRead failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE MESSAGE
  // ---------------------------------------------------------------------------

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    try {
      await apiClient.delete(`/conversations/${conversationId}/messages/${messageId}`);
      useConversationStore.getState().deleteMessage(conversationId, messageId);
    } catch (err) {
      console.error('[ConversationHub] deleteMessage failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // EDIT MESSAGE
  // ---------------------------------------------------------------------------

  async editMessage(conversationId: string, messageId: string, newText: string): Promise<void> {
    try {
      await apiClient.put(`/conversations/${conversationId}/messages/${messageId}`, { text: newText });
      useConversationStore.getState().editMessage(conversationId, messageId, newText);
    } catch (err) {
      console.error('[ConversationHub] editMessage failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // CONNECTION STATE
  // ---------------------------------------------------------------------------

  getConnectionState(): ConnectionState {
    return getRealtimeClient().getConnectionState();
  }

  onConnectionStateChange(handler: (state: ConnectionState) => void): () => void {
    return getRealtimeClient().onConnectionStateChange(handler);
  }
}

// ---------------------------------------------------------------------------
// SINGLETON EXPORT
// ---------------------------------------------------------------------------

export const ConversationHub = new ConversationHubService();

// React hook for convenience
export function useConversationHub() {
  return ConversationHub;
}
