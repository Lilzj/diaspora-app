// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Idempotency keys (Backend Phase B15)
//
// B15 uniquely indexes `IdempotencyKey` on payment intents, purchases,
// subscriptions, donations and contributions, so a duplicate submission is
// refused by the database rather than by a check somebody can refactor past.
// That protection only works if the client sends the *same* key on a retry.
//
// §21 of the phase brief states the rule plainly: "Generate and persist it for
// the lifecycle of the operation. Do not generate a new key on every retry."
// This module is that lifecycle.
//
// The shape of the problem
// ------------------------
// A member taps Pay. The request times out. They tap Pay again — or the app is
// killed and reopened and they tap Pay again. Three ways to get this wrong:
//
//   1. A fresh key each tap  → two payments, both valid, both charged.
//   2. A key held in memory  → survives the retry, dies with the process, and
//                              the second launch charges again.
//   3. A key that is never   → a member who genuinely wants to donate twice
//      released                 cannot, because the second donation is refused
//                              as a duplicate of the first.
//
// So a key is derived from an *operation scope* — what is being paid for, not
// when — persisted to AsyncStorage, and released only when the operation
// reaches a terminal state. A scope that is genuinely repeatable (donating to
// the same cause twice) carries a caller-supplied discriminator.
//
// What this is not
// ----------------
// It is not an offline queue. Nothing here replays a request later. §23 forbids
// that, and the storage exists so a *resumed* attempt reuses a key, never so a
// deferred one executes unattended.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'diaspora.financial.idem.';

/**
 * How long an unreleased key stays reusable. Ten minutes is longer than B15's
 * payment-intent expiry window, so a key never outlives the intent it belongs
 * to; and it is short enough that a member who abandons a checkout and comes
 * back tomorrow starts a genuinely new operation rather than resurrecting a
 * stale one.
 */
const KEY_TTL_MS = 10 * 60 * 1000;

interface StoredKey {
  key: string;
  createdAt: number;
}

/**
 * Identifies one financial operation across retries and app restarts.
 *
 * `discriminator` is what separates "the member retried" from "the member did
 * it again on purpose". Purchases and subscriptions leave it out — buying the
 * same boost for the same listing twice in ten minutes is a double tap.
 * Donations pass the amount, because giving £10 twice to the same cause is a
 * thing people do.
 */
export interface OperationScope {
  /** `payment`, `purchase`, `subscription`, `donation`, `contribution`. */
  operation: string;
  /** What the operation is about — a product code, a cause code, a subject id. */
  subject: string;
  /** Makes a deliberately repeatable operation distinct. Optional. */
  discriminator?: string;
}

function storageKey(scope: OperationScope): string {
  const parts = [scope.operation, scope.subject, scope.discriminator ?? ''];
  return `${STORAGE_PREFIX}${parts.join('|')}`;
}

/**
 * A RFC 4122-shaped v4 identifier.
 *
 * `crypto.randomUUID` is absent from Hermes, and `expo-crypto` is not a
 * dependency of this app. `Math.random` is not a cryptographic source — and
 * does not need to be: an idempotency key is a *collision*-avoidance token, not
 * a secret. It is never used for authorisation, never sent anywhere but the
 * body of the caller's own request, and the server scopes uniqueness per user.
 * Timestamp-seeding the first block makes a collision between two keys minted
 * on one device in one millisecond the only case that matters, and 2^61 of
 * randomness covers it.
 */
export function newIdempotencyKey(): string {
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  const time = Date.now().toString(16).padStart(12, '0').slice(-12);

  return [
    time.slice(0, 8),
    time.slice(8, 12),
    `4${hex(3)}`,
    ((8 + Math.floor(Math.random() * 4)).toString(16) + hex(3)),
    hex(12),
  ].join('-');
}

/**
 * The key for this operation — the one already stored if there is a live one,
 * otherwise a new one which is stored before it is returned.
 *
 * Storage failures are not fatal. AsyncStorage can refuse on a device that is
 * out of space, and refusing to let somebody pay because their disk is full
 * would be worse than the duplicate risk that a memoryless key carries. The
 * failure is swallowed and a fresh key returned, which degrades to case (1)
 * above only for the launch where the disk was full.
 */
export async function acquireIdempotencyKey(scope: OperationScope): Promise<string> {
  const name = storageKey(scope);

  try {
    const raw = await AsyncStorage.getItem(name);
    if (raw) {
      const stored = JSON.parse(raw) as StoredKey;
      if (Date.now() - stored.createdAt < KEY_TTL_MS && typeof stored.key === 'string') {
        return stored.key;
      }
    }
  } catch {
    // Unreadable or corrupt — fall through and mint a new one.
  }

  const key = newIdempotencyKey();

  try {
    const record: StoredKey = { key, createdAt: Date.now() };
    await AsyncStorage.setItem(name, JSON.stringify(record));
  } catch {
    // See above: a key that cannot be persisted is still better than no key.
  }

  return key;
}

/**
 * Ends the operation's lifecycle.
 *
 * Call this — and only this — when the backend has reported a *terminal* state:
 * captured, settled, failed, cancelled, expired, refunded. Releasing on an
 * HTTP 200 would release it while the payment is still `Pending`, and the next
 * tap would then be a second payment rather than a resumption of the first.
 */
export async function releaseIdempotencyKey(scope: OperationScope): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(scope));
  } catch {
    // A key that outlives its operation expires on its own in ten minutes.
  }
}

/**
 * Drops every stored key. Called on sign-out: the next member to use this
 * device must not inherit the last one's in-flight operations.
 */
export async function clearIdempotencyKeys(): Promise<void> {
  try {
    const names = await AsyncStorage.getAllKeys();
    const ours = names.filter((name) => name.startsWith(STORAGE_PREFIX));
    // `multiRemove` is gone from AsyncStorage v3's surface; removing one at a
    // time is equivalent here because the set is tiny — at most one key per
    // financial operation a member has open.
    await Promise.all(ours.map((name) => AsyncStorage.removeItem(name)));
  } catch {
    // Best effort. Every key expires within ten minutes regardless.
  }
}
