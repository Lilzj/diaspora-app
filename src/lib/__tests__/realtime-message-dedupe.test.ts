// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — MessageReceived arrives twice (Wave M-5)
//
// `realtime.ts` enumerates six contract details a client written from the hub's
// method names would get wrong. `realtime-transport.test.ts` pins five of them.
// **Detail 3 was implemented and asserted by nothing** — found while writing the
// contract verification report, by counting the details against the tests rather
// than by reading either.
//
// The detail: the server sends `MessageReceived` to the conversation group *and*
// to each recipient's user group, and this client joins both. Without the
// de-duplication in `toMessage`, every incoming message renders twice in the
// thread — and it would render twice only against a real hub, so no amount of
// local testing of the surrounding code would have shown it.
//
// This lives in its own file rather than in `realtime-transport.test.ts`
// because it needs `@microsoft/signalr` mocked, and that file's tests
// deliberately exercise the real module — `joinGroup` resolving `false` while
// disconnected is a fact about the real `HubConnection`, and mocking the module
// underneath it would turn that assertion into a test of the mock.
//
// The handler is reached the way the hub reaches it: `connect()` registers it,
// and the captured callback is invoked with the payload the server sends. The
// alternative — casting through `unknown` to call the private `toMessage`
// directly — would assert that a private method de-duplicates, which is not the
// thing that matters. What matters is that a subscriber sees one message.
// ─────────────────────────────────────────────────────────────────────────────

type HubCallback = (payload: unknown) => void;

/** Every `connection.on(...)` registration, by event name. */
const handlers = new Map<string, HubCallback>();

const connectionStub = {
  on(event: string, callback: HubCallback): void {
    handlers.set(event, callback);
  },
  onreconnecting(): void {},
  onreconnected(): void {},
  onclose(): void {},
  start: (): Promise<void> => Promise.resolve(),
  stop: (): Promise<void> => Promise.resolve(),
  invoke: (): Promise<boolean> => Promise.resolve(true),
  state: 'Connected',
};

jest.mock('@microsoft/signalr', () => {
  // The builder is fluent, so every configuration call has to return itself or
  // `connect()` throws on the second link in the chain.
  const builder = {
    withUrl: () => builder,
    withAutomaticReconnect: () => builder,
    configureLogging: () => builder,
    build: () => connectionStub,
  };

  return {
    HubConnectionBuilder: function HubConnectionBuilder() {
      return builder;
    },
    LogLevel: { Warning: 3, Error: 4 },
    HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  };
});

import { DiasporaRealtimeClient } from '../realtime';

/** The payload shape the hub sends, with the field names it really uses. */
function serverPayload(messageId: string) {
  return {
    messageId,
    conversationId: 'conv-1',
    senderId: 'ba7c6d64-0000-4000-8000-000000000001',
    // `text` and `createdAt`, not `body` and `sentAt` — the two names a
    // similarity-based mapping gets wrong, pinned here as well because this
    // payload would otherwise drift away from the one the hub sends.
    text: 'Are you coming on Saturday?',
    createdAt: '2026-08-18T09:00:00Z',
  };
}

describe('MessageReceived arriving on two groups', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('delivers one message to the subscriber when the hub sends it twice', async () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });
    const received: string[] = [];
    client.onMessage((message) => received.push(message.messageId));

    await client.connect();
    const onMessageReceived = handlers.get('MessageReceived');
    expect(onMessageReceived).toBeDefined();

    // Once to the conversation group, once to this member's user group. The
    // client is in both, so the hub is not misbehaving — this is the contract.
    onMessageReceived?.(serverPayload('msg-1'));
    onMessageReceived?.(serverPayload('msg-1'));

    expect(received).toEqual(['msg-1']);

    client.disconnect();
  });

  it('does not suppress a different message', async () => {
    // The failure mode on the other side of the same code: a de-duplication
    // keyed on anything coarser than the message id — the conversation, the
    // sender, a timestamp — silently drops real messages, and drops them from
    // the busiest conversations first.
    const client = new DiasporaRealtimeClient({ userId: 'u1' });
    const received: string[] = [];
    client.onMessage((message) => received.push(message.messageId));

    await client.connect();
    const onMessageReceived = handlers.get('MessageReceived');

    onMessageReceived?.(serverPayload('msg-1'));
    onMessageReceived?.(serverPayload('msg-2'));
    onMessageReceived?.(serverPayload('msg-1'));

    expect(received).toEqual(['msg-1', 'msg-2']);

    client.disconnect();
  });

  it('forgets what it has seen when the connection ends', async () => {
    // `disconnect()` clears the set. Without this a member who signs out and
    // back in — or whose client reconnects after a long background — would have
    // messages suppressed by ids remembered from a session that is over.
    const client = new DiasporaRealtimeClient({ userId: 'u1' });
    const received: string[] = [];
    client.onMessage((message) => received.push(message.messageId));

    await client.connect();
    handlers.get('MessageReceived')?.(serverPayload('msg-1'));
    client.disconnect();

    await client.connect();
    handlers.get('MessageReceived')?.(serverPayload('msg-1'));

    expect(received).toEqual(['msg-1', 'msg-1']);

    client.disconnect();
  });

  it('maps the body and the moment from the names the server uses', async () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });
    const bodies: (string | undefined)[] = [];
    const moments: (string | undefined)[] = [];
    client.onMessage((message) => {
      bodies.push(message.text);
      moments.push(message.delivery.sentAt);
    });

    await client.connect();
    handlers.get('MessageReceived')?.(serverPayload('msg-1'));

    // `text` and `createdAt` on the wire; `text` and `delivery.sentAt` on the
    // client. The first of those is the synonym pair the module warns about —
    // a mapping made by similarity would read `body` and deliver a message that
    // arrives blank with nothing failing anywhere.
    expect(bodies).toEqual(['Are you coming on Saturday?']);
    expect(moments).toEqual(['2026-08-18T09:00:00Z']);

    client.disconnect();
  });
});
