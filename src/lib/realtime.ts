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
  RealtimeCapabilities,
  ReadReceiptEvent,
  TypingEvent,
} from '@/types/conversation';
// A value, not a type: the client's starting position is a real object.
import { NO_REALTIME_CAPABILITIES } from '@/types/conversation';

/**
 * `RealtimeHandshake`, as it arrives on the wire.
 *
 * camelCase because `NotificationsModule` pins
 * `PayloadSerializerOptions.PropertyNamingPolicy` to camel and says why — it
 * matches the HTTP surface deliberately, so one client never sees two shapes for
 * one payload. No PascalCase fallback here for that reason: a tolerance nobody
 * needs is a claim that the contract is uncertain when it is written down.
 *
 * Every field optional, because absence and `false` have to be distinguishable
 * from a malformed payload — and all three land in the same place, which is off.
 */
interface RealtimeHandshakePayload {
  connectionId?: string;
  userId?: string;
  serverTime?: string;
  presenceEnabled?: boolean;
  typingEnabled?: boolean;
  readReceiptsEnabled?: boolean;
  deliveryReceiptsEnabled?: boolean;
  conversationRelayEnabled?: boolean;
}

/**
 * The handshake, reduced to what the client acts on.
 *
 * `=== true` rather than a truthiness check: a payload that arrived with these
 * as strings, or missing, must read as off. Anything short of the server saying
 * yes is not a yes.
 */
function toCapabilities(payload: RealtimeHandshakePayload | null | undefined): RealtimeCapabilities {
  return {
    conversationRelay: payload?.conversationRelayEnabled === true,
    presence: payload?.presenceEnabled === true,
    typing: payload?.typingEnabled === true,
    readReceipts: payload?.readReceiptsEnabled === true,
    deliveryReceipts: payload?.deliveryReceiptsEnabled === true,
  };
}

type MessageHandler = (message: Message) => void;
type TypingHandler = (event: TypingEvent) => void;
type PresenceHandler = (event: PresenceEvent) => void;
type ReadReceiptHandler = (event: ReadReceiptEvent) => void;
type DeliveryHandler = (event: DeliveryReceiptEvent) => void;

/**
 * `ResourceChanged` — the hub's "a record you are watching changed" frame.
 *
 * Content-free on purpose: a type, an id, what kind of change, and a stable
 * reason key — never words a person wrote, because a socket frame is the one
 * place moderation and erasure cannot reach. A listener refetches. Sent on
 * `event:{id}` for Community Life and, since 16 Sep 2026, on
 * `geo:alerts:{cell}` for the live alert map (`resourceType: 'alert'`).
 */
export interface ResourceChangedPayload {
  resourceType: string;
  resourceId: string;
  /** `created`, `updated`, `cancelled`, `rescheduled`, `status.changed` or `removed`. */
  changeKind: string;
  /** `withdrawn`, `expired`, `amended`, `edited`, `author` or `moderation`, where there is one. */
  reason: string | null;
  occurredAt: string;
}

type ResourceChangedHandler = (change: ResourceChangedPayload) => void;

/**
 * `NotificationReceived`: a notification just landed in the member's inbox
 * (a message, a decision, a reply). Sent to the member's own socket only, and
 * only while one is open; the push covers the rest.
 */
export interface RealtimeNotificationPayload {
  id: string;
  title: string;
  body: string;
  categoryKey: string;
  priority: string;
  createdAt: string;
  /** The app route to open, already filled in. Null when it opens nothing. */
  targetRoute: string | null;
  imageMediaId: string | null;
}

/** A badge total pushed by the server: `InboxCountersChanged` and `ConversationUnreadChanged`. */
export interface RealtimeCountPayload {
  total: number;
  at: string;
}

/**
 * A conversation this member is in was just started: `ConversationCreatedPayload`
 * in `Realtime/ConversationRealtimePayloads.cs`, sent to each participant.
 */
export interface ConversationCreatedEvent {
  conversationId: string;
  contextType: string;
  entityId: string;
  initiatorUserId: string;
  state: string;
  createdAt: string;
}

type NotificationHandler = (notification: RealtimeNotificationPayload) => void;
type CountHandler = (count: RealtimeCountPayload) => void;
type ConversationCreatedHandler = (event: ConversationCreatedEvent) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;
type RealtimeCapabilityHandler = (capabilities: RealtimeCapabilities) => void;

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
 * Built from the API origin, never by concatenation. `API_BASE_URL` ends in a
 * version prefix; the hub lives at `/hubs/realtime` on the host **root** and is
 * not affected by the server's `/v1` → `/api/v1` rewrite, so appending
 * `hubPath` to the API base produces a path that does not exist.
 *
 * Written without naming the host, because the host has changed once already —
 * see `apiClient.ts` on UAT-001 — and a comment that pins it is a comment that
 * silently becomes wrong.
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
  private resourceChangedHandlers = new Set<ResourceChangedHandler>();
  private notificationHandlers = new Set<NotificationHandler>();
  private inboxCountHandlers = new Set<CountHandler>();
  private conversationUnreadHandlers = new Set<CountHandler>();
  private conversationCreatedHandlers = new Set<ConversationCreatedHandler>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  private capabilityHandlers = new Set<RealtimeCapabilityHandler>();

  /**
   * What the hub says this deployment serves.
   *
   * Starts with everything off and is only ever raised by a handshake — see
   * `NO_REALTIME_CAPABILITIES`. Reset on disconnect, because a capability set
   * belongs to a connection: a deployment that changed between reconnects must
   * not be described by the previous one's answer.
   */
  private capabilities: RealtimeCapabilities = NO_REALTIME_CAPABILITIES;

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

    connection.onreconnecting(() => {
      this.emitConnectionState('reconnecting');

      // The capability set belonged to the connection that just dropped. Holding
      // it across the gap would let the client keep rendering indicators for a
      // deployment it is no longer talking to — and the reconnect may well land
      // on a different instance with different flags.
      this.setCapabilities(NO_REALTIME_CAPABILITIES);
    });

    connection.onreconnected(() => {
      this.emitConnectionState('connected');
      // A reconnect gets a fresh `ConnectionAcknowledged`: the hub sends it from
      // `OnConnectedAsync`, which runs again. Nothing to restore here.
      // Group membership is per-connection and does not survive a reconnect.
      // Without this a member who briefly lost signal stops receiving typing and
      // read receipts for the conversation they are looking at, with the UI
      // showing "connected".
      void this.rejoinGroups();
    });
    connection.onclose(() => {
      this.emitConnectionState('disconnected');
      this.setCapabilities(NO_REALTIME_CAPABILITIES);
    });

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

  /** Every `ResourceChanged` frame on any group this connection has joined. */
  onResourceChanged(handler: ResourceChangedHandler): () => void {
    this.resourceChangedHandlers.add(handler);
    return () => this.resourceChangedHandlers.delete(handler);
  }

  /** A notification landed in the member's inbox while this socket was open. */
  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  /** The notification inbox's unread total, as the server counts it. */
  onInboxCount(handler: CountHandler): () => void {
    this.inboxCountHandlers.add(handler);
    return () => this.inboxCountHandlers.delete(handler);
  }

  /** The member's unread conversation total, as the server counts it. */
  onConversationUnread(handler: CountHandler): () => void {
    this.conversationUnreadHandlers.add(handler);
    return () => this.conversationUnreadHandlers.delete(handler);
  }

  /** Someone started a conversation with this member, or they started one elsewhere. */
  onConversationCreated(handler: ConversationCreatedHandler): () => void {
    this.conversationCreatedHandlers.add(handler);
    return () => this.conversationCreatedHandlers.delete(handler);
  }

  /**
   * The features this connection's deployment actually serves.
   *
   * Read it before rendering any live indicator. Everything is false until the
   * hub's handshake says otherwise, which is the honest reading of "we have not
   * been told".
   */
  getCapabilities(): RealtimeCapabilities {
    return this.capabilities;
  }

  /**
   * Notified when the handshake lands, and again when a connection ends.
   *
   * Called immediately with the current value, so a subscriber that arrives
   * after the handshake is not left waiting for a second one that never comes.
   */
  onCapabilities(handler: RealtimeCapabilityHandler): () => void {
    this.capabilityHandlers.add(handler);
    handler(this.capabilities);

    return () => this.capabilityHandlers.delete(handler);
  }

  private setCapabilities(next: RealtimeCapabilities): void {
    this.capabilities = next;
    this.capabilityHandlers.forEach((handler) => handler(next));
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
    // ── The handshake the client used to throw away ──────────────────────────
    //
    // `RealtimeHub.OnConnectedAsync` sends this to every caller before anything
    // else. Without a handler SignalR logged "No client method with the name
    // 'connectionacknowledged' found" and discarded five booleans describing
    // exactly the features the handlers below deliver.
    //
    // The method name is registered in the casing the server declares it in.
    // SignalR matches case-insensitively — which is why the warning arrived
    // lower-cased — but a name that reads differently from `IRealtimeClient` is
    // one more thing for the next person to reconcile.
    connection.on('ConnectionAcknowledged', (payload: RealtimeHandshakePayload) => {
      this.setCapabilities(toCapabilities(payload));
    });

    connection.on('MessageReceived', (payload: ConversationMessagePayload) => {
      // ── Deliberately not gated on `conversationRelay` ────────────────────
      //
      // It reads like the flag for this, and it is not.
      // `RealtimeHandshake.ConversationRelayEnabled` documents itself as
      // "whether conversation groups can be joined at all" — it is
      // `_channels.IsOwned(ConversationPrefix)`, a statement about group
      // authorisation, not about message delivery.
      //
      // And a message reaches a member twice: once via the conversation group
      // and once via their own user group, which `OnConnectedAsync` joins
      // unconditionally. So on a deployment where no module owns conversations,
      // the flag is false and messages still legitimately arrive. Gating here
      // would drop them.
      //
      // Caught by `realtime-message-dedupe.test.ts`, which had been sending
      // `MessageReceived` without a handshake since long before this flag
      // existed.
      const message = this.toMessage(payload);
      if (!message) return;
      this.messageHandlers.forEach((handler) => handler(message));
    });

    connection.on('TypingChanged', (payload: TypingSignal) => {
      if (!this.capabilities.typing) return;

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
      if (!this.capabilities.presence) return;

      const event: PresenceEvent = {
        userId: normaliseUserId(payload.userId),
        status: toPresenceStatus(payload.status),
        lastSeenAt: payload.lastSeenAt ?? undefined,
        timestamp: payload.timestamp,
      };
      this.presenceHandlers.forEach((handler) => handler(event));
    });

    connection.on('ReadReceiptReceived', (payload: ReadReceiptPayload) => {
      if (!this.capabilities.readReceipts) return;

      const event: ReadReceiptEvent = {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        readByUserId: normaliseUserId(payload.readByUserId),
        readAt: payload.readAt,
      };
      this.readReceiptHandlers.forEach((handler) => handler(event));
    });

    connection.on('DeliveryReceiptReceived', (payload: DeliveryReceiptPayload) => {
      if (!this.capabilities.deliveryReceipts) return;

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

    connection.on('ResourceChanged', (payload: ResourceChangedPayload) => {
      if (!payload || typeof payload.resourceType !== 'string') return;
      this.resourceChangedHandlers.forEach((handler) => handler(payload));
    });

    // ── Frames the server always sent and the client dropped (16 Oct 2026) ──
    //
    // Without these a member learned of a message only by opening Messages:
    // the tab badge counted conversations already loaded, and nothing said a
    // notification had arrived anywhere but on the Home bell.
    connection.on('NotificationReceived', (payload: RealtimeNotificationPayload) => {
      if (!payload || typeof payload.title !== 'string') return;
      this.notificationHandlers.forEach((handler) => handler(payload));
    });

    connection.on('InboxCountersChanged', (payload: RealtimeCountPayload) => {
      if (!payload || typeof payload.total !== 'number') return;
      this.inboxCountHandlers.forEach((handler) => handler(payload));
    });

    connection.on('ConversationUnreadChanged', (payload: RealtimeCountPayload) => {
      if (!payload || typeof payload.total !== 'number') return;
      this.conversationUnreadHandlers.forEach((handler) => handler(payload));
    });

    // ── A new conversation (6 Nov 2026) ──────────────────────────────────────
    //
    // Dropped with "No client method with the name 'conversationcreated'". The
    // first message of a new conversation still arrived, but the inbox only
    // updates conversations it already holds, so an open Messages list did not
    // show the new one until it was reloaded.
    connection.on('ConversationCreated', (payload: ConversationCreatedEvent) => {
      if (!payload || typeof payload.conversationId !== 'string') return;
      this.conversationCreatedHandlers.forEach((handler) => handler(payload));
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
      // Lower case, as the server spells it (`ConversationWireNames`). The
      // fallback said 'Text', which no bubble renders.
      type: (payload.type ?? 'text') as Message['type'],
      // `text`, not `body`. Two field names one synonym apart, and a mapping made
      // by similarity would produce a message that arrives blank with nothing
      // failing anywhere.
      text: payload.text ?? undefined,
      createdAt: payload.createdAt,
      // The client's own optimistic id, echoed back by the server so the
      // pending bubble can be reconciled rather than duplicated.
      localId: payload.localId ?? undefined,
      // Only the identifier travels live. The store names the author and the
      // preview from the message it already holds.
      replyTo: payload.replyToMessageId
        ? { messageId: payload.replyToMessageId, senderId: '', senderName: '', previewText: '' }
        : undefined,
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
/**
 * The live client, or null when nothing has created one.
 *
 * `getRealtimeClient` constructs on demand, which is right for a caller that is
 * about to connect and wrong for one that only wants to read state — a React
 * render should not bring a client into being as a side effect.
 */
export function peekRealtimeClient(): DiasporaRealtimeClient | null {
  return client;
}

export function getRealtimeClient(userId?: string): DiasporaRealtimeClient {
  // ── Called without a member far more often than with one ─────────────────
  //
  // Joining a conversation, leaving it, typing, and every connection-state
  // subscription call this with no argument, meaning "the member's
  // connection". The parameter used to default to `'user-current'` — the
  // development fixtures' member — so each of those calls found a client keyed
  // on the real member, saw a different id, **disconnected it**, and built an
  // unconnected one in its place. Opening any conversation cut the socket the
  // Messages tab had opened: no incoming messages, no typing, no receipts.
  // Found 15 Sep 2026 with the own-message display, which used the same literal.
  if (userId === undefined) {
    if (!client) {
      client = new DiasporaRealtimeClient({ userId: '', getAccessToken: accessTokenForTransport });
      clientUserId = null;
    }
    return client;
  }

  // A client made before anybody initialised the hub — a screen subscribing to
  // connection state ahead of the Messages tab — becomes this member's, rather
  // than being thrown away with the subscriptions it already holds.
  if (client && clientUserId === null) {
    clientUserId = userId;
    return client;
  }

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
