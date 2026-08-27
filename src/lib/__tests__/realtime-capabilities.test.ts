// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the client only renders what the hub says it serves
//
// ── The defect these tests are the memory of ─────────────────────────────────
//
// Seen live on an Android build against the hosted deployment, in logcat:
//
//     Warning: No client method with the name 'connectionacknowledged' found.
//
// `RealtimeHub.OnConnectedAsync` sends `ConnectionAcknowledged(handshake)` to
// every caller. The handshake carries five booleans — PresenceEnabled,
// TypingEnabled, ReadReceiptsEnabled, DeliveryReceiptsEnabled and
// ConversationRelayEnabled — and the client had no handler, so SignalR threw
// them away with a warning.
//
// Meanwhile it registered handlers for TypingChanged, PresenceChanged,
// ReadReceiptReceived and DeliveryReceiptReceived: precisely the four features
// those flags gate. On a deployment with presence switched off, a member watched
// a status dot that would never change.
//
// ── The default, pinned ──────────────────────────────────────────────────────
//
// Off until the handshake says otherwise. The alternative — assume everything
// works until told — is the same defect with a shorter window. A client that has
// not been told what the server serves knows nothing, and rendering an indicator
// on that basis is a claim it cannot support.
// ─────────────────────────────────────────────────────────────────────────────

import { DiasporaRealtimeClient } from '@/lib/realtime';
import { NO_REALTIME_CAPABILITIES } from '@/types/conversation';

/**
 * A stand-in hub connection that records its handlers so a test can deliver a
 * server message by name, exactly as SignalR would.
 */
class FakeConnection {
  readonly handlers = new Map<string, (payload: unknown) => void>();

  on(method: string, handler: (payload: unknown) => void) {
    this.handlers.set(method, handler);
  }

  send(method: string, payload: unknown) {
    const handler = this.handlers.get(method);
    if (!handler) throw new Error(`no handler registered for '${method}'`);
    handler(payload);
  }
}

/** The handshake as the hub serialises it — camelCase, per `NotificationsModule`. */
function handshake(overrides: Record<string, boolean> = {}) {
  return {
    connectionId: 'conn-1',
    userId: '00000000-0000-0000-0000-000000000001',
    serverTime: '2026-08-26T12:00:00Z',
    presenceEnabled: false,
    typingEnabled: false,
    readReceiptsEnabled: false,
    deliveryReceiptsEnabled: false,
    conversationRelayEnabled: false,
    ...overrides,
  };
}

/** A client with its handlers registered against a fake connection. */
function build() {
  const client = new DiasporaRealtimeClient({ userId: 'user-1' });
  const connection = new FakeConnection();

  // `registerHandlers` is private, and deliberately so — nothing outside the
  // client should be wiring hub methods. Reaching for it here is the narrowest
  // way to exercise the dispatch rules without standing up a real socket.
  (client as unknown as { registerHandlers(c: unknown): void }).registerHandlers(connection);

  return { client, connection };
}

describe('before the hub has said anything', () => {
  it('reports every feature off', () => {
    const { client } = build();

    expect(client.getCapabilities()).toEqual(NO_REALTIME_CAPABILITIES);
  });

  it('drops every gated event rather than rendering it', () => {
    // The property that matters: with no handshake, a stray server message
    // cannot reach a store and cannot become an indicator.
    const { client, connection } = build();

    const seen: string[] = [];
    client.onTyping(() => seen.push('typing'));
    client.onPresence(() => seen.push('presence'));
    client.onReadReceipt(() => seen.push('read'));
    client.onDelivery(() => seen.push('delivery'));
    client.onMessage(() => seen.push('message'));

    connection.send('TypingChanged', { eventType: 'TypingStarted', conversationId: 'c1', userId: 'u1', timestamp: 't' });
    connection.send('PresenceChanged', { userId: 'u1', status: 'online', timestamp: 't' });
    connection.send('ReadReceiptReceived', { conversationId: 'c1', messageId: 'm1', readByUserId: 'u1', readAt: 't' });
    connection.send('DeliveryReceiptReceived', { conversationId: 'c1', messageId: 'm1', deliveredAt: 't' });

    expect(seen).toEqual([]);
  });
});

describe('once the handshake lands', () => {
  it('registers a handler for the method the server actually calls', () => {
    // The whole defect in one assertion. Without this the hub's call finds
    // nothing and SignalR logs a warning nobody reads.
    const { connection } = build();

    expect(connection.handlers.has('ConnectionAcknowledged')).toBe(true);
  });

  it('reads the five flags off the camelCase payload', () => {
    const { client, connection } = build();

    connection.send('ConnectionAcknowledged', handshake({
      presenceEnabled: true,
      typingEnabled: true,
      readReceiptsEnabled: true,
      deliveryReceiptsEnabled: true,
      conversationRelayEnabled: true,
    }));

    expect(client.getCapabilities()).toEqual({
      conversationRelay: true,
      presence: true,
      typing: true,
      readReceipts: true,
      deliveryReceipts: true,
    });
  });

  it.each([
    ['typing', 'typingEnabled', 'TypingChanged', { eventType: 'TypingStarted', conversationId: 'c1', userId: 'u1', timestamp: 't' }],
    ['presence', 'presenceEnabled', 'PresenceChanged', { userId: 'u1', status: 'online', timestamp: 't' }],
    ['readReceipts', 'readReceiptsEnabled', 'ReadReceiptReceived', { conversationId: 'c1', messageId: 'm1', readByUserId: 'u1', readAt: 't' }],
    ['deliveryReceipts', 'deliveryReceiptsEnabled', 'DeliveryReceiptReceived', { conversationId: 'c1', messageId: 'm1', deliveredAt: 't' }],
  ])('delivers %s only when its flag is on', (_name, flag, method, payload) => {
    const subscribe = {
      TypingChanged: (c: DiasporaRealtimeClient, f: () => void) => c.onTyping(f),
      PresenceChanged: (c: DiasporaRealtimeClient, f: () => void) => c.onPresence(f),
      ReadReceiptReceived: (c: DiasporaRealtimeClient, f: () => void) => c.onReadReceipt(f),
      DeliveryReceiptReceived: (c: DiasporaRealtimeClient, f: () => void) => c.onDelivery(f),
    }[method as string]!;

    // Off first.
    const off = build();
    let offCount = 0;
    subscribe(off.client, () => { offCount += 1; });
    off.connection.send('ConnectionAcknowledged', handshake());
    off.connection.send(method as string, payload);
    expect(offCount).toBe(0);

    // Then on, so the test cannot pass by the event never being deliverable.
    const on = build();
    let onCount = 0;
    subscribe(on.client, () => { onCount += 1; });
    on.connection.send('ConnectionAcknowledged', handshake({ [flag as string]: true }));
    on.connection.send(method as string, payload);
    expect(onCount).toBe(1);
  });

  it('does not gate live messages on the relay flag', () => {
    // ── The gate I nearly shipped ────────────────────────────────────────────
    //
    // `ConversationRelayEnabled` reads like the flag for message push. It is
    // not: it documents itself as "whether conversation groups can be joined at
    // all", and is `_channels.IsOwned(ConversationPrefix)` — group
    // authorisation, not delivery.
    //
    // A message reaches a member twice, once via the conversation group and once
    // via their own user group, which the hub joins unconditionally. So with the
    // flag false, messages still legitimately arrive. Gating here would have
    // dropped them on every deployment that has no module owning conversations —
    // which the contract says is all of them by default.
    const { client, connection } = build();

    let received = 0;
    client.onMessage(() => { received += 1; });

    connection.send('ConnectionAcknowledged', handshake({ conversationRelayEnabled: false }));
    connection.send('MessageReceived', {
      conversationId: 'c1',
      messageId: 'm1',
      senderId: 'u1',
      type: 'text',
      text: 'hello',
      hasAttachment: false,
      sentAt: '2026-08-26T12:00:00Z',
    });

    expect(received).toBe(1);
  });
});

describe('a handshake that is not what it should be', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', {}],
    ['strings instead of booleans', { presenceEnabled: 'true', typingEnabled: 'yes' }],
  ])('leaves everything off when the payload is %s', (_label, payload) => {
    // `=== true`, not truthiness. Anything short of the server saying yes is not
    // a yes, and a client that read `"false"` as enabled would be back where it
    // started.
    const { client, connection } = build();

    connection.send('ConnectionAcknowledged', payload);

    expect(client.getCapabilities()).toEqual(NO_REALTIME_CAPABILITIES);
  });
});

describe('subscribers', () => {
  it('are told the current value the moment they subscribe', () => {
    // A surface that mounts after the handshake must not wait for a second one
    // that will never arrive.
    const { client, connection } = build();
    connection.send('ConnectionAcknowledged', handshake({ typingEnabled: true }));

    let seen: unknown = null;
    client.onCapabilities((next) => { seen = next; });

    expect(seen).toMatchObject({ typing: true });
  });

  it('stop hearing after they unsubscribe', () => {
    const { client, connection } = build();

    let calls = 0;
    const unsubscribe = client.onCapabilities(() => { calls += 1; });
    expect(calls).toBe(1); // the immediate call

    unsubscribe();
    connection.send('ConnectionAcknowledged', handshake({ presenceEnabled: true }));

    expect(calls).toBe(1);
  });
});
