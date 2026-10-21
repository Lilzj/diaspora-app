// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the foreground presence loop
//
// Reports the device's coarse position to `POST /location/me/presence/ping`
// **only while the app is in the foreground and the member has switched
// "Location while the app is open" on.** It is the whole client half of the
// `location.enteredArea` trigger.
//
// ── How it is bounded ────────────────────────────────────────────────────────
//
//   * Two switches, both required: `enabled` (the server's setting) and
//     `foreground` (AppState is `active`). Either going false cancels the timer
//     and invalidates any tick in flight — a tick re-checks after every await,
//     so a position read that resolves after the app was backgrounded is
//     dropped rather than sent.
//   * Permission is **read, never requested** here. Anything but a foreground
//     grant ends the tick without a ping and without rescheduling; the next
//     foreground tries again. The only place that asks is the settings toggle.
//   * At most one report per `minimumIntervalSeconds` (the server's value,
//     never below 30s): on foreground the loop waits out whatever is left of
//     the interval since the last report rather than sending at once.
//   * `tooSoon` is obeyed: the next tick is scheduled at `nextAcceptedAt`.
//   * 409 `location.presence.not-enabled` stops the loop and asks the owner to
//     re-read the setting. Any other failure is not read as "off" — it waits
//     one interval and tries again, while still foreground.
//   * No background location, no TaskManager, no watcher: one
//     `getCurrentPositionAsync` at Balanced accuracy per tick.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_PRESENCE_INTERVAL_SECONDS,
  isPresenceNotEnabled,
  type PresencePing,
  type PresencePingResult,
} from './presence';

export type PresencePermission = 'granted' | 'denied' | 'undetermined';

export interface PresenceLoopDeps {
  /** Reads the foreground permission. Must never prompt. */
  readPermission: () => Promise<PresencePermission>;
  /** One coarse fix, or null when the device cannot give one. */
  readPosition: () => Promise<PresencePing | null>;
  ping: (body: PresencePing) => Promise<PresencePingResult>;
  /** Called on 409 `location.presence.not-enabled`. */
  onNotEnabled: () => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Never faster than the server's own floor, whatever a response says. */
export function presenceIntervalMs(seconds: number | null | undefined): number {
  const value =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? seconds
      : DEFAULT_PRESENCE_INTERVAL_SECONDS;
  return Math.max(value, DEFAULT_PRESENCE_INTERVAL_SECONDS) * 1000;
}

/**
 * Coordinates rounded to three decimals (~110 m) before they leave the device.
 * The server only needs an area, and it discards the point after placing it.
 */
export function coarsen(ping: PresencePing): PresencePing {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    latitude: round(ping.latitude),
    longitude: round(ping.longitude),
    accuracyMetres:
      typeof ping.accuracyMetres === 'number' && Number.isFinite(ping.accuracyMetres)
        ? Math.ceil(ping.accuracyMetres)
        : undefined,
  };
}

export class PresenceLoop {
  private enabled = false;
  private foreground = false;
  private intervalMs = presenceIntervalMs(null);
  private generation = 0;
  private timer: unknown = null;
  private inFlight = false;
  private lastPingAt: number | null = null;
  private notBefore: number | null = null;

  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: PresenceLoopDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setTimer = deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** The server's setting. `minimumIntervalSeconds` comes with it. */
  setEnabled(enabled: boolean, minimumIntervalSeconds?: number | null): void {
    this.intervalMs = presenceIntervalMs(minimumIntervalSeconds);
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    // A switch back on starts a fresh baseline on the server; nothing earlier binds it.
    if (!enabled) {
      this.lastPingAt = null;
      this.notBefore = null;
    }
    this.restart();
  }

  /** AppState `active` or not. */
  setForeground(foreground: boolean): void {
    if (this.foreground === foreground) return;
    this.foreground = foreground;
    this.restart();
  }

  get isRunning(): boolean {
    return this.enabled && this.foreground;
  }

  stop(): void {
    this.enabled = false;
    this.foreground = false;
    this.restart();
  }

  private restart(): void {
    this.generation += 1;
    this.cancelTimer();
    if (!this.isRunning) return;
    this.schedule(this.dueIn());
  }

  /** How long until a report is allowed: the interval since the last one, and any `tooSoon`. */
  private dueIn(): number {
    const now = this.now();
    let due = now;
    if (this.lastPingAt !== null) due = Math.max(due, this.lastPingAt + this.intervalMs);
    if (this.notBefore !== null) due = Math.max(due, this.notBefore);
    return Math.max(0, due - now);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    const generation = this.generation;
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (generation === this.generation) void this.tick(generation);
    }, ms);
  }

  private stillCurrent(generation: number): boolean {
    return generation === this.generation && this.isRunning;
  }

  private async tick(generation: number): Promise<void> {
    if (!this.stillCurrent(generation) || this.inFlight) return;
    this.inFlight = true;

    try {
      let permission: PresencePermission;
      try {
        permission = await this.deps.readPermission();
      } catch {
        permission = 'undetermined';
      }
      // No grant, no ping, and no retry until the next foreground.
      if (permission !== 'granted' || !this.stillCurrent(generation)) return;

      let position: PresencePing | null = null;
      try {
        position = await this.deps.readPosition();
      } catch {
        position = null;
      }
      if (!this.stillCurrent(generation)) return;
      if (!position) {
        this.schedule(this.intervalMs);
        return;
      }

      this.lastPingAt = this.now();

      try {
        const result = await this.deps.ping(coarsen(position));
        const next = result.nextAcceptedAt ? Date.parse(result.nextAcceptedAt) : NaN;
        this.notBefore = result.outcome === 'tooSoon' && Number.isFinite(next) ? next : null;
      } catch (cause) {
        if (isPresenceNotEnabled(cause)) {
          this.enabled = false;
          this.generation += 1;
          this.cancelTimer();
          this.deps.onNotEnabled();
          return;
        }
        // Unanswered is not "off": try again after one interval.
      }

      if (this.stillCurrent(generation)) this.schedule(this.dueIn());
    } finally {
      this.inFlight = false;
      // A switch flipped while this tick was waiting: its own tick may have
      // fired and stepped aside for this one, so make sure one is pending.
      if (generation !== this.generation && this.isRunning && this.timer === null) {
        this.schedule(this.dueIn());
      }
    }
  }
}
