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
// Remediation Wave F. Was `@/lib/realtime-mock`, a simulated transport that
// manufactured its own delivery and read receipts on device timers — which is
// why messaging appeared to work end to end while nothing left the phone.
import { conversationGroup, getRealtimeClient } from '@/lib/realtime';
import { useConversationStore } from '@/store/conversation';
import { usePresenceStore } from '@/store/presence';
import { useTypingStore } from '@/store/typing';
import { showAlertOutsideReact } from '@/providers/notification-provider';
import type {
  BlockedUser,
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

    // Remediation Wave F. This was missing, and against the mock it did not
    // matter — unsubscribing left some timers running and nobody noticed. A real
    // socket outlives the Messages tab that opened it: the connection stays up,
    // stays joined to the member's user group, and the server keeps counting it
    // against `MaxConnectionsPerUser` (10). Ten mounts of that tab and the
    // eleventh connection is refused, which presents as messaging silently
    // stopping until the app is restarted.
    getRealtimeClient().disconnect();
  }

  /**
   * Joins the conversation's realtime group.
   *
   * Server-side group membership is what makes typing signals, read receipts and
   * delivery receipts arrive for a conversation. Only the member's own
   * `user:{id}` group is joined automatically, on connect; everything else is by
   * request and is authorized — `JoinGroup` answers **false** for a conversation
   * the caller is not a participant in rather than throwing, so the result is
   * returned for the caller to act on rather than assumed.
   */
  async joinConversation(conversationId: string): Promise<boolean> {
    return getRealtimeClient().joinGroup(conversationGroup(conversationId));
  }

  async leaveConversation(conversationId: string): Promise<void> {
    await getRealtimeClient().leaveGroup(conversationGroup(conversationId));
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

      // **This used to navigate anyway.**
      //
      // The comment said "Fallback: navigate anyway with params", so *every*
      // refusal — a block, a restricted account, messaging yourself, a
      // recipient the platform will not accept — sent the member to a screen
      // that said "Conversation not found". A refusal presented as a missing
      // thing, on a path with eight callers.
      //
      // The platform explains itself; this repeats what it said. Only a
      // request that never arrived gets the "try again" wording, because only
      // that one is worth trying again.
      const response = (err as { response?: { status?: number; data?: { detail?: string } } })
        ?.response;

      const shown = showAlertOutsideReact({
        type: 'error',
        title: response ? 'Cannot start this conversation' : 'We could not reach Diaspora',
        message:
          response?.data?.detail?.trim() ||
          (response
            ? 'This conversation could not be started.'
            : 'Check your connection and try again.'),
      });

      // Nowhere to say it — no provider mounted. Rethrowing beats a silence
      // the caller cannot distinguish from success.
      if (!shown) {
        throw err;
      }
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

  /**
   * Blocks somebody, and **says whether it worked** — Remediation Wave B′.
   *
   * This used to swallow its failure into a `console.error` and return `void`,
   * which made every caller structurally unable to tell the member the truth.
   * That matters more here than on the pin and archive helpers around it, for
   * two reasons:
   *
   *   * Blocking is the platform's only protective action in a private
   *     conversation. There is no route to report a message — see the note on
   *     `handleReport` in `conversation/[id].tsx` — so this is the whole of what
   *     a member being harassed can do.
   *   * On failure the local store is never updated, because `blockUser` sits
   *     after the `await`. So the conversation carried on looking unblocked
   *     while the member believed it was blocked, and nothing anywhere said
   *     otherwise.
   *
   * It returns a boolean rather than throwing so that the existing callers which
   * ignore the result keep their current behaviour instead of raising an
   * unhandled rejection. Callers that show the member an outcome await it.
   */
  async block(userId: string, reason?: string): Promise<boolean> {
    try {
      await apiClient.post('/conversations/block', { userId, reason });
      useConversationStore.getState().blockUser(userId);
      return true;
    } catch (err) {
      console.error('[ConversationHub] block failed:', err);
      return false;
    }
  }

  /**
   * Reads the blocklist the **server** holds — `GET /conversations/blocked`,
   * `ListBlockedUsersQuery`, scoped to the caller by `RequireCaller()`.
   *
   * Added because `conversation/blocked.tsx` seeded its list from
   * `mockBlockedUsers`. That is the worst possible place for a fixture: the
   * blocklist is a safety surface, and every member was shown the *same three
   * fabricated names* as though they had blocked them. A member checking
   * whether someone who had harassed them was still blocked got a confident
   * answer about somebody who does not exist, while the person they actually
   * blocked — or failed to block — was not on the list at all.
   *
   * This throws rather than returning `[]` on failure. An empty blocklist and
   * an unreachable blocklist mean opposite things to somebody who is frightened,
   * and the screen renders them differently.
   */
  async listBlocked(): Promise<BlockedUser[]> {
    const response = await apiClient.get<{ data: BlockedUser[] } | BlockedUser[]>(
      '/conversations/blocked'
    );

    // `PlatformResults.Ok` wraps in `{ data }`; the raw array is accepted too so
    // that an envelope change does not silently empty a safety list.
    const payload = response.data;
    const list = Array.isArray(payload) ? payload : payload?.data;

    return Array.isArray(list) ? list : [];
  }

  /**
   * Unblocks somebody, and **says whether it worked** — the same correction
   * `block` above received, for the same reason and with more force.
   *
   * `blocked.tsx` removed the row from its list the moment this resolved. As
   * this used to swallow every failure into a `console.error` and return
   * `void`, a failed unblock still removed the row: the member was left
   * believing they had lifted a block that the server still enforces, and the
   * person they meant to let back in stayed silently unable to reach them.
   */
  async unblock(userId: string): Promise<boolean> {
    try {
      await apiClient.delete(`/conversations/blocked/${userId}`);
      useConversationStore.getState().unblockUser(userId);
      return true;
    } catch (err) {
      console.error('[ConversationHub] unblock failed:', err);
      return false;
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
