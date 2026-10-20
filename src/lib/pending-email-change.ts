// ─────────────────────────────────────────────────────────────────────────────
// A requested change of sign-in address, remembered on this device (20 Oct 2026)
//
// `PUT /auth/email` answers with `pendingAddress` once, and `GET /auth/email`
// never repeats it: on the server a pending change is a signed link sitting in
// the new mailbox, not a row. So the only place "you asked to move to X, and
// nothing changes until you open the link" can come from after the screen that
// asked is gone is here.
//
// What is kept is exactly what the server said, nothing inferred:
//
//   from        the address the server reported as still on the account
//   to          the `pendingAddress` it echoed
//   expiresAt   its `verificationExpiresAt` (the link lasts two hours)
//
// It is forgotten when the link can no longer matter: when it expires, or when
// the address the server reports is no longer `from` (the change landed, or
// another one did). The link itself opens a page on the API rather than this
// app, so the app learns the outcome only by reading the address again.
//
// Keyed by member, so a shared handset cannot show one member's pending address
// to another.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingEmailChange {
  from: string;
  to: string;
  /** ISO 8601. When the emailed link stops working. */
  expiresAt: string | null;
  /** ISO 8601. When this device asked. */
  requestedAt: string;
}

/** The server's documented lifetime of the link, used only when it named none. */
const LINK_LIFETIME_MS = 2 * 60 * 60 * 1000;

const KEY_PREFIX = 'diaspora.pendingEmailChange.';

function keyFor(memberId: string): string {
  return `${KEY_PREFIX}${memberId}`;
}

function isPendingEmailChange(value: unknown): value is PendingEmailChange {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.from === 'string' &&
    typeof record.to === 'string' &&
    typeof record.requestedAt === 'string' &&
    (record.expiresAt === null || typeof record.expiresAt === 'string')
  );
}

/** When the link stops working, in milliseconds. */
export function pendingExpiry(pending: PendingEmailChange): number {
  const named = pending.expiresAt ? Date.parse(pending.expiresAt) : Number.NaN;
  if (Number.isFinite(named)) return named;
  return Date.parse(pending.requestedAt) + LINK_LIFETIME_MS;
}

export async function savePendingEmailChange(
  memberId: string,
  pending: PendingEmailChange
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(memberId), JSON.stringify(pending));
  } catch {
    // Storage refusing is not a reason to fail a request the server accepted.
  }
}

export async function clearPendingEmailChange(memberId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(memberId));
  } catch {
    // Nothing to do: the record expires on its own.
  }
}

/** The remembered change, or null when there is none or its link has expired. */
export async function readPendingEmailChange(
  memberId: string,
  now: number = Date.now()
): Promise<PendingEmailChange | null> {
  let parsed: unknown = null;

  try {
    const raw = await AsyncStorage.getItem(keyFor(memberId));
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }

  if (!isPendingEmailChange(parsed)) return null;

  if (pendingExpiry(parsed) <= now) {
    await clearPendingEmailChange(memberId);
    return null;
  }

  return parsed;
}

/**
 * Whether the address the server now reports settles the remembered change.
 * The change landed (the address is now `to`), or something else moved the
 * address away from `from`, which kills the link too.
 */
export function isSettledBy(pending: PendingEmailChange, currentAddress: string): boolean {
  const current = currentAddress.trim().toLowerCase();
  return current !== pending.from.trim().toLowerCase();
}
