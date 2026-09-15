// ─────────────────────────────────────────────────────────────────────────────
// The member's one connection — 15 Sep 2026
//
// `getRealtimeClient(userId = 'user-current')`. Everything after the Messages
// tab's `initialize(userId)` — joining a conversation, leaving it, typing, the
// conversation screen's connection-state subscription — calls it with no
// argument. Each call found the member's client, compared its id with
// `'user-current'`, **disconnected it** and built an unconnected one. Opening a
// conversation cut the socket: no live messages, no typing, no receipts.
// ─────────────────────────────────────────────────────────────────────────────

import { destroyRealtimeClient, getRealtimeClient } from '../realtime';

const AISHA = '01a0576f-2c1d-7f00-8000-0000000000a1';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

beforeEach(() => {
  destroyRealtimeClient();
});

afterAll(() => {
  destroyRealtimeClient();
});

describe('the shared realtime client', () => {
  it('is the member’s own connection when asked for without an id', () => {
    const member = getRealtimeClient(AISHA);
    const disconnect = jest.spyOn(member, 'disconnect');

    // What joinConversation, typing and the conversation screen all call.
    const again = getRealtimeClient();

    expect(again).toBe(member);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('keeps the subscriptions of a screen that asked before the hub knew the member', () => {
    const early = getRealtimeClient();
    const onState = jest.fn();
    early.onConnectionStateChange(onState);

    // The Messages tab initialises afterwards.
    const member = getRealtimeClient(AISHA);

    expect(member).toBe(early);
  });

  it('is rebuilt when a different member signs in', () => {
    const first = getRealtimeClient(AISHA);
    const disconnect = jest.spyOn(first, 'disconnect');

    const second = getRealtimeClient(DAVID);

    expect(second).not.toBe(first);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(getRealtimeClient()).toBe(second);
  });
});
