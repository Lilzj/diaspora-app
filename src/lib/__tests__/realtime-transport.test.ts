// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — real-time transport (Remediation Wave F)
//
// `lib/realtime-mock.ts` had **no tests at all**, which is part of why it
// survived: nothing asserted that a delivery receipt came from the server rather
// than from a `setTimeout` on the sending device.
//
// These pin the contract details that a client written from the method names
// would get wrong, and that no type checker can catch because the payloads
// arrive as `any` off a socket.
// ─────────────────────────────────────────────────────────────────────────────

import {
  conversationGroup,
  normaliseUserId,
  realtimeHubUrl,
  toPresenceStatus,
  DiasporaRealtimeClient,
} from '../realtime';

// ── The hub is not under the API version prefix ──────────────────────────────

describe('the hub URL', () => {
  it('is built from the origin, not by appending to the API base', () => {
    // `API_BASE_URL` is `https://api.diaspora.app/v1` and the hub is mapped on
    // the root endpoint builder at `/hubs/realtime` — outside `/api/v1`, and
    // untouched by the server's `/v1` → `/api/v1` rewrite. Concatenating gives
    // `…/v1/hubs/realtime`, which 404s at negotiate.
    const url = realtimeHubUrl();

    expect(url).toBe('https://api.diaspora.app/hubs/realtime');
    expect(url).not.toContain('/v1/hubs');
  });

  it('honours a hub path supplied by the configuration route', () => {
    // `GET /notifications/realtime/configuration` publishes `hubPath` precisely
    // so a server-side move does not strand installed builds.
    expect(realtimeHubUrl('/hubs/v2/realtime')).toBe('https://api.diaspora.app/hubs/v2/realtime');
  });
});

// ── Group names are composed, never typed by hand ────────────────────────────

describe('group names', () => {
  it('uses the platform’s prefix and lowercase form', () => {
    // `RealtimeChannels.cs` composes `prefix + guid.ToString("D")` — lowercase,
    // hyphenated, no braces. An unclaimed or mis-cased prefix is refused by the
    // registry, and `JoinGroup` answers false rather than raising.
    expect(conversationGroup('7C9E6679-7425-40DE-944B-E07FC1F90AE7')).toBe(
      'conversation:7c9e6679-7425-40de-944b-e07fc1f90ae7'
    );
  });
});

// ── The user id has two shapes on two surfaces ───────────────────────────────

describe('user id normalisation', () => {
  it('accepts the bare guid the hub protocol sends', () => {
    expect(normaliseUserId('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    );
  });

  it('unwraps the object the REST presence route sends', () => {
    // The strongly-typed `UserId` unwrapping converter is registered on the
    // SignalR protocol and on `AddControllers`, but the realtime REST routes are
    // minimal APIs and no `ConfigureHttpJsonOptions` exists — so the same field
    // is a bare string over the socket and `{ "value": "…" }` over HTTP. A
    // client that assumed one shape renders `[object Object]` on the other.
    expect(normaliseUserId({ value: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })).toBe(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    );
  });

  it('degrades to empty rather than to a wrong id', () => {
    expect(normaliseUserId(undefined)).toBe('');
    expect(normaliseUserId(null)).toBe('');
    expect(normaliseUserId(42)).toBe('');
  });
});

// ── Presence has three words and a safe default ──────────────────────────────

describe('presence status', () => {
  it('passes the three the platform sends', () => {
    expect(toPresenceStatus('online')).toBe('online');
    expect(toPresenceStatus('away')).toBe('away');
    expect(toPresenceStatus('offline')).toBe('offline');
  });

  it('fails to offline rather than to online', () => {
    // Failing the other way would show a green dot beside somebody who is not
    // there, and a member would message them expecting a reply.
    expect(toPresenceStatus('Online')).toBe('offline');
    expect(toPresenceStatus(undefined)).toBe('offline');
  });
});

// ── The mock's manufactured receipts are gone ────────────────────────────────

describe('delivery progression', () => {
  it('emits nothing — the server owns receipts now', async () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });

    const delivered: unknown[] = [];
    const read: unknown[] = [];
    client.onDelivery((event) => delivered.push(event));
    client.onReadReceipt((event) => read.push(event));

    // The mock fired a delivery receipt 2 s after every send and a read receipt
    // 7–17 s after that, **from a timer on the sending device**, with no other
    // participant involved. That is why messaging looked like it worked while
    // nothing left the phone.
    //
    // The method survives because `conversation-hub.ts` calls it after every
    // send. It must do nothing: two ticks against a message the recipient has
    // not seen is a worse lie than no ticks.
    client.simulateDeliveryProgression('conv-1', 'msg-1', 'u1');

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(delivered).toHaveLength(0);
    expect(read).toHaveLength(0);
  });
});

// ── Subscriptions unsubscribe ────────────────────────────────────────────────

describe('subscriptions', () => {
  it('each returns a working unsubscribe', () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });

    // `conversation-hub` collects all six into `this.unsubscribers` and calls
    // them on teardown. A subscription that did not release would keep a
    // reference to a store closure for the life of the process.
    const unsubs = [
      client.onMessage(() => {}),
      client.onTyping(() => {}),
      client.onPresence(() => {}),
      client.onReadReceipt(() => {}),
      client.onDelivery(() => {}),
      client.onConnectionStateChange(() => {}),
    ];

    expect(unsubs.every((fn) => typeof fn === 'function')).toBe(true);
    expect(() => unsubs.forEach((fn) => fn())).not.toThrow();
  });

  it('reports disconnected before a connection exists', () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });

    // Not 'connected'. `conversation/[id].tsx` seeds its own state to
    // 'connected' and renders directly off this value, so a client that claimed
    // connection before starting would show a live indicator over a dead socket.
    expect(client.getConnectionState()).toBe('disconnected');
  });
});

// ── Client → server calls are safe before connect ────────────────────────────

describe('sending before the socket is up', () => {
  it('does not throw when typing is emitted while disconnected', () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });

    // `MessageComposer` wires these to keystrokes. A member typing during a
    // reconnect must not crash the thread.
    expect(() => client.emitTypingStarted('conv-1')).not.toThrow();
    expect(() => client.emitTypingEnded('conv-1')).not.toThrow();
  });

  it('reports a refused join rather than assuming success', async () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });

    // `JoinGroup` returns a **bool** and `false` is routine — a conversation the
    // caller is not a participant in, an organisation membership still in
    // `Requested`. It is never an exception, so a client using `send` instead of
    // `invoke` cannot tell joined from refused and sits in a thread receiving
    // nothing.
    await expect(client.joinGroup('conversation:abc')).resolves.toBe(false);
  });

  it('resolves presence to an empty list rather than rejecting', async () => {
    const client = new DiasporaRealtimeClient({ userId: 'u1' });

    await expect(client.getPresence(['u2'])).resolves.toEqual([]);
  });
});
