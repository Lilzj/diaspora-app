// The foreground presence loop (21 Oct 2026): what it may send, and when.
//
// Every case is about a ping that must NOT happen — off, denied, backgrounded,
// too soon — plus the 409 that turns the loop off. Timers are injected so the
// test owns the clock rather than racing a real one.

import { PresenceLoop, coarsen, presenceIntervalMs, type PresenceLoopDeps } from '../location/presence-loop';
import {
  isPresenceNotEnabled,
  toPresencePingResult,
  toPresenceSetting,
  type PresencePingResult,
} from '../location/presence';

interface Harness {
  loop: PresenceLoop;
  ping: jest.Mock;
  readPermission: jest.Mock;
  readPosition: jest.Mock;
  onNotEnabled: jest.Mock;
  advance: (ms: number) => Promise<void>;
  pending: () => number;
  setNow: (ms: number) => void;
}

const POSITION = { latitude: -20.16234, longitude: 57.50121, accuracyMetres: 64.2 };

function result(partial: Partial<PresencePingResult> = {}): PresencePingResult {
  return { evaluated: true, outcome: 'unchanged', area: null, announced: false, nextAcceptedAt: null, ...partial };
}

/** Lets every awaited promise in a tick settle. */
async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function harness(overrides: Partial<PresenceLoopDeps> = {}): Harness {
  let now = Date.parse('2026-10-21T10:00:00Z');
  let timers: { at: number; callback: () => void; id: number }[] = [];
  let nextId = 1;

  const ping = jest.fn().mockResolvedValue(result());
  const readPermission = jest.fn().mockResolvedValue('granted');
  const readPosition = jest.fn().mockResolvedValue(POSITION);
  const onNotEnabled = jest.fn();

  const loop = new PresenceLoop({
    ping,
    readPermission,
    readPosition,
    onNotEnabled,
    now: () => now,
    setTimer: (callback, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, callback, id });
      return id;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
    ...overrides,
  });

  const advance = async (ms: number) => {
    const until = now + ms;
    for (;;) {
      await flush();
      const due = timers.filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((timer) => timer !== due);
      now = due.at;
      due.callback();
    }
    now = until;
    await flush();
  };

  return {
    loop,
    ping,
    readPermission,
    readPosition,
    onNotEnabled,
    advance,
    pending: () => timers.length,
    setNow: (ms) => {
      now = ms;
    },
  };
}

describe('the presence loop sends nothing it should not', () => {
  it('sends nothing while the setting is off, even in the foreground', async () => {
    const h = harness();
    h.loop.setForeground(true);
    await h.advance(10 * 60_000);

    expect(h.ping).not.toHaveBeenCalled();
    expect(h.readPosition).not.toHaveBeenCalled();
    expect(h.readPermission).not.toHaveBeenCalled();
  });

  it('sends nothing while backgrounded, even with the setting on', async () => {
    const h = harness();
    h.loop.setEnabled(true, 30);
    await h.advance(10 * 60_000);

    expect(h.ping).not.toHaveBeenCalled();
    expect(h.readPosition).not.toHaveBeenCalled();
  });

  it('sends nothing when location permission is denied, and does not retry until the next foreground', async () => {
    const h = harness();
    h.readPermission.mockResolvedValue('denied');
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(10 * 60_000);

    expect(h.readPermission).toHaveBeenCalledTimes(1);
    expect(h.readPosition).not.toHaveBeenCalled();
    expect(h.ping).not.toHaveBeenCalled();
    expect(h.pending()).toBe(0);
  });

  it('reports on foreground, then at most once per interval, coarsened', async () => {
    const h = harness();
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);

    expect(h.ping).toHaveBeenCalledTimes(1);
    expect(h.ping).toHaveBeenCalledWith({ latitude: -20.162, longitude: 57.501, accuracyMetres: 65 });

    await h.advance(29_000);
    expect(h.ping).toHaveBeenCalledTimes(1);

    await h.advance(1_000);
    expect(h.ping).toHaveBeenCalledTimes(2);

    await h.advance(5 * 60_000);
    // 30 s cadence: 10 more in five minutes, never more.
    expect(h.ping).toHaveBeenCalledTimes(12);
  });

  it('stops when backgrounded, and waits out the interval on return rather than sending at once', async () => {
    const h = harness();
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);
    expect(h.ping).toHaveBeenCalledTimes(1);

    await h.advance(5_000);
    h.loop.setForeground(false);
    expect(h.pending()).toBe(0);
    await h.advance(10 * 60_000);
    expect(h.ping).toHaveBeenCalledTimes(1);

    // Back after the interval: immediately.
    h.loop.setForeground(true);
    await h.advance(0);
    expect(h.ping).toHaveBeenCalledTimes(2);

    // Away and back within it: not until the interval is up.
    h.loop.setForeground(false);
    await h.advance(10_000);
    h.loop.setForeground(true);
    await h.advance(0);
    expect(h.ping).toHaveBeenCalledTimes(2);
    await h.advance(20_000);
    expect(h.ping).toHaveBeenCalledTimes(3);
  });

  it('drops a position read that finishes after the app went to the background', async () => {
    let resolvePosition: (value: typeof POSITION) => void = () => undefined;
    const h = harness({
      readPosition: jest.fn(
        () => new Promise<typeof POSITION>((resolve) => (resolvePosition = resolve))
      ),
    });
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);

    h.loop.setForeground(false);
    resolvePosition(POSITION);
    await h.advance(60_000);

    expect(h.ping).not.toHaveBeenCalled();
  });

  it('obeys tooSoon: the next report waits for nextAcceptedAt', async () => {
    const h = harness();
    const start = Date.parse('2026-10-21T10:00:00Z');
    h.ping.mockResolvedValueOnce(
      result({ evaluated: false, outcome: 'tooSoon', nextAcceptedAt: new Date(start + 90_000).toISOString() })
    );
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);
    expect(h.ping).toHaveBeenCalledTimes(1);

    await h.advance(89_000);
    expect(h.ping).toHaveBeenCalledTimes(1);

    await h.advance(1_000);
    expect(h.ping).toHaveBeenCalledTimes(2);
  });

  it('a 409 not-enabled stops the loop and asks for the setting to be re-read', async () => {
    const h = harness();
    h.ping.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'location.presence.not-enabled' } },
    });
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);

    expect(h.onNotEnabled).toHaveBeenCalledTimes(1);
    expect(h.loop.isRunning).toBe(false);
    await h.advance(10 * 60_000);
    expect(h.ping).toHaveBeenCalledTimes(1);
  });

  it('any other failure is not read as "off": it tries again after one interval', async () => {
    const h = harness();
    h.ping.mockRejectedValueOnce(new Error('Network Error'));
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);
    expect(h.onNotEnabled).not.toHaveBeenCalled();

    await h.advance(30_000);
    expect(h.ping).toHaveBeenCalledTimes(2);
  });

  it('switching the setting off cancels a scheduled report', async () => {
    const h = harness();
    h.loop.setEnabled(true, 30);
    h.loop.setForeground(true);
    await h.advance(0);
    h.loop.setEnabled(false);
    expect(h.pending()).toBe(0);
    await h.advance(10 * 60_000);
    expect(h.ping).toHaveBeenCalledTimes(1);
  });
});

describe('the bounds themselves', () => {
  it('never runs faster than the server floor, whatever a response says', () => {
    expect(presenceIntervalMs(30)).toBe(30_000);
    expect(presenceIntervalMs(5)).toBe(30_000);
    expect(presenceIntervalMs(undefined)).toBe(30_000);
    expect(presenceIntervalMs(120)).toBe(120_000);
  });

  it('rounds coordinates to about a hundred metres', () => {
    expect(coarsen({ latitude: 51.507351, longitude: -0.127758, accuracyMetres: null })).toEqual({
      latitude: 51.507,
      longitude: -0.128,
      accuracyMetres: undefined,
    });
  });

  it('reads 409 not-enabled by its code, not by the status alone', () => {
    expect(isPresenceNotEnabled({ response: { status: 409, data: { code: 'location.presence.not-enabled' } } })).toBe(true);
    expect(isPresenceNotEnabled({ response: { status: 409, data: { code: 'something.else' } } })).toBe(false);
    expect(isPresenceNotEnabled({ response: { status: 500 } })).toBe(false);
    expect(isPresenceNotEnabled(new Error('offline'))).toBe(false);
  });

  it('maps the wire shapes, defaulting the interval to the server floor', () => {
    expect(toPresenceSetting({ enabled: true, lastArea: { areaId: 'a', name: 'Port Louis', level: 'City', countryCode: 'MU' } })).toEqual({
      enabled: true,
      enabledAt: null,
      lastArea: { areaId: 'a', name: 'Port Louis', level: 'City', countryCode: 'MU' },
      lastEvaluatedAt: null,
      minimumIntervalSeconds: 30,
    });
    expect(toPresenceSetting(undefined).enabled).toBe(false);
    expect(toPresencePingResult({ evaluated: false, outcome: 'tooSoon', announced: false, nextAcceptedAt: 'x' }).outcome).toBe('tooSoon');
  });
});
