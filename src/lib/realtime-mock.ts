/**
 * Diaspora Conversations — Mock Real-Time Engine
 *
 * Simulates a SignalR hub pattern without any WebSocket dependency.
 * Replacing this with a real SignalR client only requires swapping
 * this file — no component changes needed.
 */

import type {
  Message,
  TypingEvent,
  PresenceEvent,
  ReadReceiptEvent,
  DeliveryReceiptEvent,
  ConnectionState,
  PresenceStatus,
} from '@/types/conversation';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type MessageHandler = (message: Message) => void;
type TypingHandler = (event: TypingEvent) => void;
type PresenceHandler = (event: PresenceEvent) => void;
type ReadReceiptHandler = (event: ReadReceiptEvent) => void;
type DeliveryHandler = (event: DeliveryReceiptEvent) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

interface DiasporaRealtimeClientConfig {
  userId: string;
  onConnectionStateChange?: ConnectionStateHandler;
}

// ---------------------------------------------------------------------------
// MOCK INCOMING MESSAGES
// ---------------------------------------------------------------------------

const incomingMessages: Partial<Message>[] = [
  {
    senderId: 'user-amara',
    senderName: 'Amara Kone',
    senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
    conversationId: 'conv-001',
    type: 'text',
    text: 'By the way, I also have the full service history documents ready to share. Let me know if you need them!',
  },
  {
    senderId: 'user-sarah',
    senderName: 'Sarah O.',
    senderAvatarUrl: 'https://i.pravatar.cc/150?img=44',
    conversationId: 'conv-002',
    type: 'text',
    text: 'The deposit is one month\'s rent. I\'m flexible on the move-in date within reason.',
  },
  {
    senderId: 'user-fatou',
    senderName: 'Fatou D.',
    senderAvatarUrl: 'https://i.pravatar.cc/150?img=32',
    conversationId: 'conv-004',
    type: 'text',
    text: 'Don\'t forget the event starts at 7pm sharp! Dress code is smart casual 🌟',
  },
];

// ---------------------------------------------------------------------------
// DIASPORA REALTIME CLIENT (SignalR-compatible interface)
// ---------------------------------------------------------------------------

export class DiasporaRealtimeClient {
  private config: DiasporaRealtimeClientConfig;
  private connectionState: ConnectionState = 'disconnected';

  // Event handlers
  private messageHandlers: MessageHandler[] = [];
  private typingHandlers: TypingHandler[] = [];
  private presenceHandlers: PresenceHandler[] = [];
  private readReceiptHandlers: ReadReceiptHandler[] = [];
  private deliveryHandlers: DeliveryHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];

  // Timers
  private messageTimer: ReturnType<typeof setInterval> | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private typingClearTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(config: DiasporaRealtimeClientConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // CONNECTION LIFECYCLE
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    this.setConnectionState('connecting');

    // Simulate connection handshake delay
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    this.setConnectionState('connected');

    // Start simulated event streams
    this.startMessageSimulation();
    this.startPresenceSimulation();
    this.simulateOccasionalDisconnect();
  }

  disconnect(): void {
    this.setConnectionState('disconnected');
    this.clearAllTimers();
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.connectionStateHandlers.forEach((h) => h(state));
    this.config.onConnectionStateChange?.(state);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION API
  // ---------------------------------------------------------------------------

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.push(handler);
    return () => {
      this.typingHandlers = this.typingHandlers.filter((h) => h !== handler);
    };
  }

  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.push(handler);
    return () => {
      this.presenceHandlers = this.presenceHandlers.filter((h) => h !== handler);
    };
  }

  onReadReceipt(handler: ReadReceiptHandler): () => void {
    this.readReceiptHandlers.push(handler);
    return () => {
      this.readReceiptHandlers = this.readReceiptHandlers.filter((h) => h !== handler);
    };
  }

  onDelivery(handler: DeliveryHandler): () => void {
    this.deliveryHandlers.push(handler);
    return () => {
      this.deliveryHandlers = this.deliveryHandlers.filter((h) => h !== handler);
    };
  }

  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.push(handler);
    return () => {
      this.connectionStateHandlers = this.connectionStateHandlers.filter((h) => h !== handler);
    };
  }

  // ---------------------------------------------------------------------------
  // EMIT (outbound — simulates client sending events to server)
  // ---------------------------------------------------------------------------

  emitTypingStarted(conversationId: string): void {
    // In production: sends a TypingStarted event to SignalR hub
    // Mock: simulate the server echoing back to other participants
  }

  emitTypingEnded(conversationId: string): void {
    // In production: sends TypingEnded event to SignalR hub
  }

  emitMessageRead(conversationId: string, messageId: string): void {
    // In production: sends ReadReceipt event
    // Mock: simulate read receipt acknowledged
  }

  // ---------------------------------------------------------------------------
  // SIMULATE DELIVERY + READ STATUS PROGRESSION
  // ---------------------------------------------------------------------------

  simulateDeliveryProgression(
    conversationId: string,
    messageId: string,
    senderId: string
  ): void {
    // sent → delivered after 2s
    setTimeout(() => {
      this.deliveryHandlers.forEach((h) =>
        h({ conversationId, messageId, deliveredAt: new Date().toISOString() })
      );

      // delivered → read after additional 5–15s (random)
      const readDelay = 5000 + Math.random() * 10000;
      setTimeout(() => {
        this.readReceiptHandlers.forEach((h) =>
          h({ conversationId, messageId, readByUserId: senderId, readAt: new Date().toISOString() })
        );
      }, readDelay);
    }, 2000);
  }

  // ---------------------------------------------------------------------------
  // SIMULATE TYPING INDICATOR
  // ---------------------------------------------------------------------------

  simulateTypingFrom(userId: string, userName: string, conversationId: string): void {
    const event: TypingEvent = {
      eventType: 'TypingStarted',
      conversationId,
      userId,
      userName,
      timestamp: new Date().toISOString(),
    };
    this.typingHandlers.forEach((h) => h(event));

    // Auto-clear after 3s
    const key = `${conversationId}-${userId}`;
    const existing = this.typingClearTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const endEvent: TypingEvent = {
        eventType: 'TypingEnded',
        conversationId,
        userId,
        userName,
        timestamp: new Date().toISOString(),
      };
      this.typingHandlers.forEach((h) => h(endEvent));
      this.typingClearTimers.delete(key);
    }, 3000);
    this.typingClearTimers.set(key, timer);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: SIMULATION LOOPS
  // ---------------------------------------------------------------------------

  private startMessageSimulation(): void {
    // Random incoming message every 45–90 seconds
    const scheduleNext = () => {
      const delay = 45000 + Math.random() * 45000;
      this.messageTimer = setTimeout(() => {
        if (this.connectionState !== 'connected') return;

        const template = incomingMessages[Math.floor(Math.random() * incomingMessages.length)];
        const message: Message = {
          messageId: `mock-incoming-${Date.now()}`,
          conversationId: template.conversationId!,
          senderId: template.senderId!,
          senderName: template.senderName!,
          senderAvatarUrl: template.senderAvatarUrl,
          type: template.type || 'text',
          text: template.text,
          delivery: {
            status: 'sent',
            sentAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
        };

        // Simulate typing before message
        this.simulateTypingFrom(template.senderId!, template.senderName!, template.conversationId!);

        setTimeout(() => {
          this.messageHandlers.forEach((h) => h(message));
        }, 2500); // After typing animation

        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  private startPresenceSimulation(): void {
    const users = [
      { userId: 'user-amara', userName: 'Amara Kone' },
      { userId: 'user-sarah', userName: 'Sarah O.' },
      { userId: 'user-fatou', userName: 'Fatou D.' },
    ];
    const statuses: PresenceStatus[] = ['online', 'away', 'offline'];

    this.presenceTimer = setInterval(() => {
      if (this.connectionState !== 'connected') return;
      const user = users[Math.floor(Math.random() * users.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const event: PresenceEvent = {
        userId: user.userId,
        status,
        lastSeenAt: status !== 'online' ? new Date().toISOString() : undefined,
        timestamp: new Date().toISOString(),
      };
      this.presenceHandlers.forEach((h) => h(event));
    }, 30000); // Every 30s
  }

  private simulateOccasionalDisconnect(): void {
    // Simulate a disconnect/reconnect once every ~5 minutes
    const delay = 270000 + Math.random() * 60000;
    this.reconnectTimer = setTimeout(() => {
      if (this.connectionState !== 'connected') return;
      this.setConnectionState('disconnected');
      setTimeout(() => {
        this.setConnectionState('reconnecting');
        setTimeout(() => {
          this.setConnectionState('connected');
          this.simulateOccasionalDisconnect();
        }, 2000);
      }, 1500);
    }, delay);
  }

  private clearAllTimers(): void {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.typingClearTimers.forEach((t) => clearTimeout(t));
    this.typingClearTimers.clear();
  }
}

// ---------------------------------------------------------------------------
// SINGLETON
// ---------------------------------------------------------------------------

let _realtimeClient: DiasporaRealtimeClient | null = null;

export function getRealtimeClient(userId: string = 'user-current'): DiasporaRealtimeClient {
  if (!_realtimeClient) {
    _realtimeClient = new DiasporaRealtimeClient({ userId });
  }
  return _realtimeClient;
}

export function destroyRealtimeClient(): void {
  _realtimeClient?.disconnect();
  _realtimeClient = null;
}
