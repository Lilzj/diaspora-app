// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — real-time transport (Remediation Wave F)
//
// The SignalR client for `/hubs/realtime`, replacing `lib/realtime-mock.ts`.
//
// The mock's own header said it simulated a SignalR hub and was meant to be
// swapped as one file. It was right about the seam — `conversation-hub.ts` is
// the only importer in the whole tree — and wrong about almost everything else,
// because it was written from the client's expectations rather than from
// `RealtimeHub.cs`. What it simulated:
//
//   * an incoming message every 45–90 seconds, from three hard-coded members;
//   * a delivery receipt exactly 2 s after each send, and a read receipt 7–17 s
//     after that, both **manufactured on the sending device**;
//   * a presence sweep every 30 s over five seeded users;
//   * a connection drop every ~5 minutes, for the reconnect UI to have something
//     to show.
//
// So messaging appeared to work end to end, and none of it left the phone.
//
// ── What is deliberately NOT reproduced ──────────────────────────────────────
//
// `simulateDeliveryProgression` survives as a **no-op** because
// `conversation-hub.ts:233` calls it after every send. On a real transport the
// server sends the receipts; a client that also emitted them would show a member
// two ticks against a message that never left the outbox. The method is kept
// rather than deleted so the call site does not break, and it is documented
// rather than silently emptied.
//
// ── Six contract details that would produce a broken client ──────────────────
//
// Each was read from `Diaspora.Modules.Notifications/Realtime` and each is
// invisible from the method names alone.
//
// **1. The hub is not under the API version prefix.** `API_BASE_URL` is
// `…/v1` and the hub is at `/hubs/realtime` on the host root. Concatenating
// gives `…/v1/hubs/realtime`, which 404s at negotiate. The origin is derived.
//
// **2. Hub methods return `bool`, and `false` is routine.** `JoinGroup`,
// `Typing`, `MarkRead` and `AcknowledgeDelivery` answer `false` for "refused" —
// not an exception. They must be `invoke`d rather than `send`, and the result
// branched on, or a client silently believes it joined a conversation it was
// never admitted to.
//
// **3. `MessageReceived` arrives twice.** Once to `conversation:{id}` and once
// to the recipient's `user:{id}` group. A client joined to both — which this one
// is — sees every message double unless it dedupes on `messageId`. The server
// source acknowledges this explicitly.
//
// **4. `TypingChanged` carries no `userName`.** See `resolveTypingName` below;
// this one changed what the UI can honestly say.
//
// **5. `PresenceChanged` is only ever about *you*.** Despite the name, the
// server sends it exclusively to the subject's own user group, so it reports
// your own status to your other devices and never anybody else's. Rendering
// somebody else's dot requires polling `GetPresence`. It also never carries
// `away` — that state is computed on read and no event ever announces it.
//
// **6. The `platform` query parameter must be on the negotiate URL.** It is read
// from the HTTP request at connect time, not from a later frame.
// ─────────────────────────────────────────────────────────────────────────────

import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { Platform } from 'react-native';

import { API_BASE_URL, accessTokenForTransport } from '@/lib/apiClient';
import type {
  ConnectionState,
  DeliveryReceiptEvent,
  Message,
  PresenceEvent,
  PresenceStatus,
  ReadReceiptEvent,
  TypingEvent,
} from '@/types/conversation';

type MessageHandler = (message: Message) => void;
type TypingHandler = (event: TypingEvent) => void;
type PresenceHandler = (event: PresenceEvent) => void;
type ReadReceiptHandler = (event: ReadReceiptEvent) => void;
type DeliveryHandler = (event: DeliveryReceiptEvent) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

export interface DiasporaRealtimeClientConfig {
  userId: string;
  onConnectionStateChange?: ConnectionStateHandler;
  /**
   * Reads the current access token.
   *
   * Injected rather than imported so this module does not depend on the auth
   * store — `apiClient` keeps its bridge module-private and exports no getter,
   * and adding one just for this would widen a deliberately narrow surface.
   * `getRealtimeClient` supplies the real accessor.
   */
  getAccessToken?: () => Promise<string | null>;
}

/**
 * The hub's own URL.
 *
 * Built from the API origin, never by concatenation. `API_BASE_URL` is
 * `https://api.diaspora.app/v1`; the hub lives at `/hubs/realtime` on the host
 * root and is not affected by the server's `/v1` → `/api/v1` rewrite, so
 * appending `hubPath` to the API base produces a path that does not exist.
 */
export function realtimeHubUrl(hubPath = '/hubs/realtime'): string {
  try {
    return new URL(API_BASE_URL).origin + hubPath;
  } catch {
    // `URL` is present on Hermes, but a malformed base should degrade to a
    // relative path rather than throw during module construction.
    return hubPath;
  }
}

/** SignalR's five states onto the client's four. */
function toConnectionState(state: HubConnectionState): ConnectionState {
  switch (state) {
    case HubConnectionState.Connected:
      return 'connected';
    case HubConnectionState.Connecting:
      return 'connecting';
    case HubConnectionState.Reconnecting:
      return 'reconnecting';
    default:
      // `Disconnecting` and `Disconnected` both read as disconnected: the UI
      // distinction that matters to a member is "is my message going to send",
      // and during a disconnect it is not.
      return 'disconnected';
  }
}

/** The platform string the hub reads at negotiate. Telemetry only; never an error. */
function platformTag(): string {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

/** `conversation:{guid}` — lowercase, hyphenated, no braces. `RealtimeChannels.cs`. */
export function conversationGroup(conversationId: string): string {
  return `conversation:${conversationId.toLowerCase()}`;
}

interface TypingSignal {
  eventType: string;
  conversationId: string;
  userId: string;
  timestamp: string;
}

interface PresenceChangedPayload {
  userId: string;
  status: string;
  lastSeenAt?: string | null;
  timestamp: string;
}

interface ReadReceiptPayload {
  conversationId: string;
  messageId: string;
  readByUserId: string;
  readAt: string;
}

interface DeliveryReceiptPayload {
  conversationId: string;
  messageId: string;
  deliveredToUserId: string;
  deliveredAt: string;
}

interface ConversationMessagePayload {
  conversationId: string;
  messageId: string;
  senderId: string;
  type: string;
  text?: string | null;
  hasAttachment: boolean;
  replyToMessageId?: string | null;
  createdAt: string;
  localId?: string | null;
}

/**
 * The three typing words the server recognises, exactly.
 *
 * `RealtimeConnectionCoordinator` compares these with an ordinal `switch` and
 * **coerces anything else to `TypingEnded`** rather than refusing it. So a
 * casing slip does not produce an error a developer would notice — it produces
 * an indicator that clears the instant it appears, which reads as a flaky UI
 * rather than as a bug in the string.
 */
const TYPING_STARTED = 'TypingStarted';
const TYPING_ENDED = 'TypingEnded';

export class DiasporaRealtimeClient {
  private connection: HubConnection | null = null;
  private readonly config: DiasporaRealtimeClientConfig;

  private messageHandlers = new Set<MessageHandler>();
  private typingHandlers = new Set<TypingHandler>();
  private presenceHandlers = new Set<PresenceHandler>();
  private readReceiptHandlers = new Set<ReadReceiptHandler>();
  private deliveryHandlers = new Set<DeliveryHandler>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();

  /**
   * Message ids already delivered upward.
   *
   * Detail 3: the server sends `MessageReceived` to the conversation group **and**
   * to each recipient's user group, and this client is in both. Without this the
   * member sees every incoming message twice.
   *
   * Bounded, because a long-lived connection would otherwise grow it without
   * limit. Insertion-ordered, so the oldest ids are evicted first — a repeat
   * arriving after 500 further messages is not a duplicate delivery, it is a
   * different message.
   */
  private seenMessageIds = new Set<string>();
  private static readonly SEEN_LIMIT = 500;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private joinedGroups = new Set<string>();

  constructor(config: DiasporaRealtimeClientConfig) {
    this.config = config;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connection) return;

    const connection = new HubConnectionBuilder()
      .withUrl(realtimeHubUrl(), {
        // The hub reads a bearer from the `access_token` query parameter for
        // paths under `/hubs`, which is exactly what `accessTokenFactory`
        // produces — and is what makes the WebSocket upgrade authenticate, since
        // a browser cannot set headers on it.
        accessTokenFactory: async () => (await this.config.getAccessToken?.()) ?? '',
      })
      // The server's defaults are KeepAlive 15 s and ClientTimeout 30 s, which
      // match this client's own defaults, so neither is overridden here. Saying
      // so explicitly because a future change to either side needs the other
      // checked, and there is nothing in the configuration response that would
      // reveal a mismatch.
      .withAutomaticReconnect()
      .configureLogging(__DEV__ ? LogLevel.Warning : LogLevel.Error)
      .build();

    this.connection = connection;
    this.registerHandlers(connection);

    connection.onreconnecting(() => this.emitConnectionState('reconnecting'));
    connection.onreconnected(() => {
      this.emitConnectionState('connected');
      // Group membership is per-connection and does not survive a reconnect.
      // Without this a member who briefly lost signal stops receiving typing and
      // read receipts for the conversation they are looking at, with the UI
      // showing "connected".
      void this.rejoinGroups();
    });
    connection.onclose(() => this.emitConnectionState('disconnected'));

    this.emitConnectionState('connecting');

    try {
      await connection.start();
      this.emitConnectionState('connected');
      this.startHeartbeat();
    } catch (cause) {
      this.emitConnectionState('disconnected');
      this.connection = null;
      throw cause;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.joinedGroups.clear();
    this.seenMessageIds.clear();

    const connection = this.connection;
    this.connection = null;

    if (connection) {
      // Best effort. A stop that rejects still leaves the socket abandoned, and
      // there is nothing a member could do about it.
      void connection.stop().catch(() => {});
    }

    this.emitConnectionState('disconnected');
  }

  getConnectionState(): ConnectionState {
    return this.connection ? toConnectionState(this.connection.state) : 'disconnected';
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────
  //
  // Each returns an unsubscribe closure, matching the shape `conversation-hub`
  // already collects into `this.unsubscribers`.

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.add(handler);
    return () => this.typingHandlers.delete(handler);
  }

  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  onReadReceipt(handler: ReadReceiptHandler): () => void {
    this.readReceiptHandlers.add(handler);
    return () => this.readReceiptHandlers.delete(handler);
  }

  onDelivery(handler: DeliveryHandler): () => void {
    this.deliveryHandlers.add(handler);
    return () => this.deliveryHandlers.delete(handler);
  }

  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  // ── Client → server ────────────────────────────────────────────────────────

  /**
   * Joins a group, and reports whether the server allowed it.
   *
   * `invoke`, not `send`: detail 2. `JoinGroup` answers `false` when the
   * authorizer refuses — a conversation the member is not a participant in, an
   * organisation whose membership is still `Requested` — and never throws for
   * it. A client using `send` cannot tell the difference between joined and
   * refused, and would sit in a conversation receiving nothing.
   */
  async joinGroup(group: string): Promise<boolean> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) return false;

    try {
      const joined = await this.connection.invoke<boolean>('JoinGroup', group);
      if (joined) this.joinedGroups.add(group);
      return joined;
    } catch {
      return false;
    }
  }

  async leaveGroup(group: string): Promise<void> {
    this.joinedGroups.delete(group);
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.send('LeaveGroup', group);
    } catch {
      // Leaving is advisory: the server drops the membership when the socket
      // closes anyway.
    }
  }

  emitTypingStarted(conversationId: string): void {
    void this.sendTyping(conversationId, TYPING_STARTED);
  }

  emitTypingEnded(conversationId: string): void {
    void this.sendTyping(conversationId, TYPING_ENDED);
  }

  /**
   * Reports a message as read over the socket.
   *
   * Kept because the mock declared it, but **nothing calls it**:
   * `ConversationHub.markRead()` uses the REST route instead, and that is the
   * better choice — the REST path is what updates the stored unread counter,
   * and the hub method only fans the receipt out to whoever is currently
   * connected. Wiring both would send two read receipts per message.
   */
  async emitMessageRead(conversationId: string, messageId: string): Promise<boolean> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) return false;
    try {
      return await this.connection.invoke<boolean>('MarkRead', conversationId, messageId);
    } catch {
      return false;
    }
  }

  /**
   * Asks the server for the current presence of specific members.
   *
   * The **only** way to know anybody else's status — see detail 5.
   * `PresenceChanged` never reports on another member, so a presence dot that is
   * not polled is a presence dot that is always stale.
   *
   * Members the caller may not observe are **omitted from the result**, not
   * returned as offline, so the array can be shorter than the request and in a
   * different order. Callers must match on `userId` rather than by index.
   */
  async getPresence(userIds: string[]): Promise<PresenceEvent[]> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) return [];
    if (userIds.length === 0) return [];

    try {
      const snapshots = await this.connection.invoke<
        { userId: string; status: string; lastSeenAt?: string | null }[]
      >('GetPresence', userIds);

      return (snapshots ?? []).map((snapshot) => ({
        userId: normaliseUserId(snapshot.userId),
        status: toPresenceStatus(snapshot.status),
        lastSeenAt: snapshot.lastSeenAt ?? undefined,
        timestamp: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * A no-op, and deliberately still a method.
   *
   * `conversation-hub.ts` calls this after every successful send. On the mock it
   * manufactured a delivery receipt after 2 s and a read receipt 7–17 s later —
   * **on the sending device**, from a timer, with no other participant involved.
   * That is why messaging looked like it worked.
   *
   * The server now owns both receipts and pushes them as
   * `DeliveryReceiptReceived` and `ReadReceiptReceived`. Emitting anything here
   * would show two ticks against a message the recipient has not seen, which is
   * a worse lie than showing none.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  simulateDeliveryProgression(_conversationId: string, _messageId: string, _senderId: string): void {
    // Intentionally empty. See above.
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async sendTyping(conversationId: string, eventType: string): Promise<void> {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke<boolean>('Typing', conversationId, eventType);
    } catch {
      // A dropped typing signal is not worth surfacing. The server expires the
      // indicator on its own timeout.
    }
  }

  private registerHandlers(connection: HubConnection): void {
    connection.on('MessageReceived', (payload: ConversationMessagePayload) => {
      const message = this.toMessage(payload);
      if (!message) return;
      this.messageHandlers.forEach((handler) => handler(message));
    });

    connection.on('TypingChanged', (payload: TypingSignal) => {
      const event: TypingEvent = {
        eventType: payload.eventType as TypingEvent['eventType'],
        conversationId: payload.conversationId,
        userId: normaliseUserId(payload.userId),
        userName: resolveTypingName(payload.userId),
        timestamp: payload.timestamp,
      };
      this.typingHandlers.forEach((handler) => handler(event));
    });

    connection.on('PresenceChanged', (payload: PresenceChangedPayload) => {
      const event: PresenceEvent = {
        userId: normaliseUserId(payload.userId),
        status: toPresenceStatus(payload.status),
        lastSeenAt: payload.lastSeenAt ?? undefined,
        timestamp: payload.timestamp,
      };
      this.presenceHandlers.forEach((handler) => handler(event));
    });

    connection.on('ReadReceiptReceived', (payload: ReadReceiptPayload) => {
      const event: ReadReceiptEvent = {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        readByUserId: normaliseUserId(payload.readByUserId),
        readAt: payload.readAt,
      };
      this.readReceiptHandlers.forEach((handler) => handler(event));
    });

    connection.on('DeliveryReceiptReceived', (payload: DeliveryReceiptPayload) => {
      // The client's `DeliveryReceiptEvent` has no recipient field, and
      // `deliveredToUserId` is dropped rather than renamed onto something it is
      // not. Note the asymmetry on the wire: the read receipt says
      // `readByUserId` and this one says `deliveredToUserId`.
      const event: DeliveryReceiptEvent = {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        deliveredAt: payload.deliveredAt,
      };
      this.deliveryHandlers.forEach((handler) => handler(event));
    });
  }

  /**
   * The server's message payload as the client's `Message`.
   *
   * Returns null for a duplicate — detail 3.
   *
   * The field names differ in two places that a similarity-based mapping would
   * get wrong: the body is `text`, not `body`, and the moment is `createdAt`,
   * not `sentAt`.
   */
  private toMessage(payload: ConversationMessagePayload): Message | null {
    if (!payload?.messageId) return null;

    if (this.seenMessageIds.has(payload.messageId)) return null;
    this.seenMessageIds.add(payload.messageId);

    if (this.seenMessageIds.size > DiasporaRealtimeClient.SEEN_LIMIT) {
      const oldest = this.seenMessageIds.values().next().value;
      if (oldest !== undefined) this.seenMessageIds.delete(oldest);
    }

    return {
      messageId: payload.messageId,
      conversationId: payload.conversationId,
      senderId: normaliseUserId(payload.senderId),
      // The server sends no display name on a message either — the same absence
      // as `TypingSignal`, and for the same reason: the realtime payloads carry
      // identifiers and let the reader resolve them. Empty rather than invented;
      // `ConversationCard` and the thread header already render from the
      // conversation's participant list, which is where a name legitimately
      // comes from.
      senderName: '',
      type: (payload.type ?? 'Text') as Message['type'],
      // `text`, not `body`. Two field names one synonym apart, and a mapping made
      // by similarity would produce a message that arrives blank with nothing
      // failing anywhere.
      text: payload.text ?? undefined,
      createdAt: payload.createdAt,
      // The client's own optimistic id, echoed back by the server so the
      // pending bubble can be reconciled rather than duplicated.
      localId: payload.localId ?? undefined,
      delivery: {
        // `sent` rather than `delivered`: this is the message arriving at *this*
        // device. Whether it reached the other participant is what
        // `DeliveryReceiptReceived` answers, and claiming it here would be the
        // mock's defect reintroduced.
        status: 'sent',
        sentAt: payload.createdAt,
      },
    };
  }

  private emitConnectionState(state: ConnectionState): void {
    this.connectionStateHandlers.forEach((handler) => handler(state));
    this.config.onConnectionStateChange?.(state);
  }

  private async rejoinGroups(): Promise<void> {
    const groups = [...this.joinedGroups];
    this.joinedGroups.clear();
    for (const group of groups) {
      await this.joinGroup(group);
    }
  }

  /**
   * Keeps the member's presence `online`.
   *
   * Distinct from SignalR's own keep-alive, which the library handles and which
   * runs at 15 s. `Heartbeat()` exists only to move `LastActivityAt` so the
   * server's read-time `away` computation does not classify an idle-but-connected
   * member as away after 300 s.
   *
   * The configuration route advertises `heartbeatSeconds` (150 at defaults);
   * this is that value, hard-coded rather than fetched, because a client that
   * cannot reach the configuration route still needs to beat.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connection?.state !== HubConnectionState.Connected) return;
      void this.connection.send('Heartbeat').catch(() => {});
    }, 150_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

/**
 * A display name for a typing indicator.
 *
 * **The server does not send one.** `TypingSignal` is
 * `{ eventType, conversationId, userId, timestamp }` and the client's
 * `TypingEvent` requires `userName`, which the mock supplied from its own
 * fixtures — so "Amara is typing…" was a string the phone invented about a
 * member it had made up.
 *
 * Returning an empty string is the honest answer, and it is deliberately not a
 * placeholder like "Someone": `useTypingStore.getTypingLabel` composes the label
 * from the names it holds, and an empty name lets it fall back to a count
 * ("2 people are typing…") rather than rendering a word the platform never said.
 *
 * The real fix belongs on the server — a display name on `TypingSignal` — or in
 * the client resolving the id against the conversation's participant list, which
 * it already has. Recorded as a gap rather than papered over here, because a
 * name guessed in the transport layer is a name no screen can correct.
 */
function resolveTypingName(_userId: string): string {
  return '';
}

/**
 * A user id from either shape the platform serialises.
 *
 * Over SignalR the strongly-typed `UserId` unwraps to a bare Guid string,
 * because the converter is registered on the hub protocol. Over the REST
 * presence route it does **not** — no `ConfigureHttpJsonOptions` exists — and
 * the same field arrives as `{ "value": "…" }`. Normalising in one place means
 * no caller has to know which surface its data came from.
 */
export function normaliseUserId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === 'string') return inner;
  }
  return '';
}

/** The wire's lowercase status onto the client's union, failing to `offline`. */
export function toPresenceStatus(value: unknown): PresenceStatus {
  return value === 'online' || value === 'away' || value === 'offline' ? value : 'offline';
}

// ─────────────────────────────────────────────────────────────────────────────
// The singleton
// ─────────────────────────────────────────────────────────────────────────────

let client: DiasporaRealtimeClient | null = null;
let clientUserId: string | null = null;

/**
 * The shared connection.
 *
 * **Rebuilt when the member changes**, unlike the mock, which cached on first
 * call and ignored `userId` for the rest of the process. That was harmless for a
 * transport that never authenticated; here it would leave the previous member's
 * socket open, still joined to their user group, receiving their messages.
 */
export function getRealtimeClient(userId: string = 'user-current'): DiasporaRealtimeClient {
  if (client && clientUserId !== userId) {
    client.disconnect();
    client = null;
  }

  if (!client) {
    client = new DiasporaRealtimeClient({
      userId,
      // Through `apiClient`, not the auth store. The store keeps its tokens in a
      // module-private binding and registers them as a bridge — the arrangement
      // Wave A introduced to break the import cycle between the two — so the
      // bridge is the supported way in, and it refreshes a lapsed token rather
      // than handing over a stale one on reconnect.
      getAccessToken: accessTokenForTransport,
    });
    clientUserId = userId;
  }

  return client;
}

export function destroyRealtimeClient(): void {
  client?.disconnect();
  client = null;
  clientUserId = null;
}
