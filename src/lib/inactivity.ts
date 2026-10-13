// ─────────────────────────────────────────────────────────────────────────────
// Signing a member out after 30 minutes without using the app
//
// Decided by the owner on 13 Oct 2026, after a session opened five days
// earlier was still live: the server's only limit was 30 days without a token
// refresh. Thirty minutes, counted from the member's last touch — whether the
// app sat open, in the background, or closed.
//
// Activity is a touch on the screen, not a network request. Background work
// (push registration, realtime, polling) makes requests on its own, and would
// otherwise keep an abandoned phone signed in forever.
//
// The last-active time is kept in memory for the running app and written to
// storage at most every 30 seconds, so a cold start after the app was killed
// can still tell how long it has been.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

const STORAGE_KEY = 'diaspora.lastActiveAt';
const PERSIST_EVERY_MS = 30 * 1000;

let lastActiveAt = Date.now();
let lastPersistedAt = 0;

/** A touch, or a sign-in. Cheap enough to call on every touch. */
export function recordActivity(now: number = Date.now()): void {
  lastActiveAt = now;

  if (now - lastPersistedAt >= PERSIST_EVERY_MS) {
    lastPersistedAt = now;
    void AsyncStorage.setItem(STORAGE_KEY, String(now)).catch(() => {});
  }
}

/** Writes the in-memory time now — when the app is about to leave the foreground. */
export async function persistActivity(): Promise<void> {
  lastPersistedAt = lastActiveAt;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(lastActiveAt));
  } catch {
    // Storage refusing is not a reason to sign anybody out.
  }
}

/** The last time stored by a previous run, or null when none was. */
export async function readStoredActivity(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function clearActivity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: an unreadable stale time is ignored on the next read.
  }
}

/** The last activity this run has seen. */
export function lastActivity(): number {
  return lastActiveAt;
}

/**
 * Whether more than the limit has passed. A time that was never recorded is not
 * expired: a session from a build before this rule must not end on its first
 * launch for want of a timestamp nobody wrote.
 */
export function hasExpired(since: number | null, now: number = Date.now()): boolean {
  return since !== null && now - since > INACTIVITY_LIMIT_MS;
}
