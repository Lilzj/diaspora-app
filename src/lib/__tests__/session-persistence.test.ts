// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what a device with no keystore gets (FSEC-006)
//
// `auth-storage.ts` resolved `expo-secure-store` and, when that failed, wrote
// the token pair to `AsyncStorage` instead — "readable on a rooted or
// jailbroken device, and its contents are included in device backups", in the
// module's own words. The refresh token's lifetime is 30 days.
//
// The fallback was deliberate and the trade-off was stated. What made it a
// finding is that **the trade was never reported to anyone**: the outcome was
// recorded in the store as `isSessionStorageSecure` and read by nothing, so the
// member was not told, the operator was not told, and nothing behaved
// differently. The comment beside it said a false value was "worth surfacing
// rather than discovering during an incident".
//
// ── Why the first test is the one that makes the rest mean anything ─────────
//
// Every other test here asserts an **absence** — that no value was written. An
// absence passes just as well when the write path is broken, the mock is wrong
// or the module failed to load. So the first test asserts the opposite: with a
// working keystore the refresh token *is* stored, in the keystore, under the
// key the others check. Without it this file would pass against an
// `auth-storage` that does nothing at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { StoredSession } from '@/types/auth';

declare global {
  var __secureStore: Record<string, string>;
  var __asyncStorageStore: Record<string, string>;
}

const ACCESS_KEY = 'diaspora.session.access';
const REFRESH_KEY = 'diaspora.session.refresh';
const META_KEY = 'diaspora.session.meta';

const SESSION: StoredSession = {
  accessToken: 'access-token-value',
  refreshToken: 'refresh-token-value',
  accessTokenExpiresAt: Date.now() + 15 * 60_000,
  refreshTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60_000,
  sessionId: 'session-1',
  userId: 'user-1',
};

/** The in-memory stores `jest.setup.js` installs, emptied in place. */
function emptyStores(): void {
  for (const store of [globalThis.__secureStore, globalThis.__asyncStorageStore]) {
    for (const key of Object.keys(store ?? {})) delete store[key];
  }
}

type Storage = typeof import('../auth-storage');
type Analytics = typeof import('../creator-analytics');

/**
 * A fresh module registry with `expo-secure-store` replaced.
 *
 * The registry has to be reset rather than the backend: `auth-storage`
 * memoises its resolution, and `require('expo-secure-store')` is evaluated
 * inside that resolution, so a different answer needs a different registry.
 * `creator-analytics` is re-required from the same one, because its event
 * buffer is module state and the copy this file imported at the top would not
 * see anything the reloaded `auth-storage` emits.
 */
function withKeystore(factory: () => unknown): { storage: Storage; analytics: Analytics } {
  jest.resetModules();
  jest.doMock('expo-secure-store', factory);

  const storage = require('../auth-storage') as Storage;
  const analytics = require('../creator-analytics') as Analytics;

  analytics.resetCreatorEvents();
  return { storage, analytics };
}

/** A keystore that loads and works — what every real native build has. */
const workingKeystore = () => {
  const store = (globalThis.__secureStore = globalThis.__secureStore ?? {});
  return {
    __esModule: true,
    getItemAsync: (key: string) => Promise.resolve(key in store ? store[key] : null),
    setItemAsync: (key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    },
    deleteItemAsync: (key: string) => {
      delete store[key];
      return Promise.resolve();
    },
  };
};

/** A build where the native module is not linked: `require` throws. */
const missingKeystore = () => {
  throw new Error('Native module RNSecureStore is not available');
};

/**
 * A build where the module resolves to something that is not a keystore.
 *
 * Worth a case of its own: it takes the *other* branch — no exception, just a
 * shape that fails `typeof store.setItemAsync === 'function'` — and a change
 * that only handled the throw would leave this one silently writing in the
 * clear.
 */
const uselessKeystore = () => ({ __esModule: true });

afterEach(() => {
  jest.dontMock('expo-secure-store');
  jest.resetModules();
});

describe('the control: a working keystore stores the refresh token', () => {
  it('writes all three entries, and writes them to the keystore', async () => {
    emptyStores();
    const { storage } = withKeystore(workingKeystore);

    const outcome = await storage.saveSession(SESSION);

    expect(outcome).toBe('keystore');
    expect(storage.sessionPersistence()).toBe('keystore');
    expect(globalThis.__secureStore[REFRESH_KEY]).toBe('refresh-token-value');
    expect(globalThis.__secureStore[ACCESS_KEY]).toBe('access-token-value');
    expect(globalThis.__secureStore[META_KEY]).toContain('session-1');
    // And not in the unencrypted store, which is the whole point of the module.
    expect(globalThis.__asyncStorageStore[REFRESH_KEY]).toBeUndefined();
  });

  it('reads back what it wrote', async () => {
    emptyStores();
    const { storage } = withKeystore(workingKeystore);

    await storage.saveSession(SESSION);

    expect(await storage.loadSession()).toMatchObject({
      refreshToken: 'refresh-token-value',
      sessionId: 'session-1',
    });
  });
});

describe.each([
  ['the native module is missing', missingKeystore],
  ['the module resolves to something that is not a keystore', uselessKeystore],
])('%s', (_name, factory) => {
  it('refuses to persist, and says that is what it did', async () => {
    emptyStores();
    const { storage } = withKeystore(factory);

    const outcome = await storage.saveSession(SESSION);

    expect(outcome).toBe('refused');
    expect(storage.sessionPersistence()).toBe('refused');
  });

  it('writes no refresh token anywhere — the criterion FSEC-006 names', async () => {
    emptyStores();
    const { storage } = withKeystore(factory);

    await storage.saveSession(SESSION);

    for (const store of [globalThis.__asyncStorageStore, globalThis.__secureStore]) {
      expect(store[REFRESH_KEY]).toBeUndefined();
    }
  });

  it('writes no access token or metadata either', async () => {
    // The audit asks for the refresh token specifically, because it is the
    // long-lived one. An access token in the clear is still a credential, and
    // metadata with no token is a record of who was signed in on this phone.
    emptyStores();
    const { storage } = withKeystore(factory);

    await storage.saveSession(SESSION);

    expect(globalThis.__asyncStorageStore[ACCESS_KEY]).toBeUndefined();
    expect(globalThis.__asyncStorageStore[META_KEY]).toBeUndefined();
    expect(Object.keys(globalThis.__asyncStorageStore)).toHaveLength(0);
  });

  it('has nothing to restore, so the member signs in again', async () => {
    emptyStores();
    const { storage } = withKeystore(factory);

    await storage.saveSession(SESSION);

    expect(await storage.loadSession()).toBeNull();
  });

  it('deletes a session an earlier build left in the clear', async () => {
    // The migration case, and the one that decides whether this change protects
    // anybody today. A build before this refusal wrote the pair to AsyncStorage
    // on exactly these devices, so the plaintext token is already on disk; a
    // change that only stopped *new* writes would leave it there for the rest
    // of its thirty days.
    emptyStores();
    globalThis.__asyncStorageStore[ACCESS_KEY] = 'old-access';
    globalThis.__asyncStorageStore[REFRESH_KEY] = 'old-refresh';
    globalThis.__asyncStorageStore[META_KEY] = JSON.stringify({
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshTokenExpiresAt: Date.now() + 60_000,
      sessionId: 'old-session',
      userId: 'old-user',
    });

    const { storage } = withKeystore(factory);

    expect(await storage.loadSession()).toBeNull();
    expect(globalThis.__asyncStorageStore[REFRESH_KEY]).toBeUndefined();
    expect(Object.keys(globalThis.__asyncStorageStore)).toHaveLength(0);
  });
});

describe('the refusal is observable', () => {
  it('reports itself once per launch', async () => {
    emptyStores();
    const { storage, analytics } = withKeystore(missingKeystore);

    // Several calls, one resolution: the event hangs off resolving the backend,
    // which happens exactly once, rather than off a caller who can forget.
    storage.sessionPersistence();
    await storage.saveSession(SESSION);
    await storage.loadSession();
    storage.sessionPersistence();

    const refusals = analytics
      .peekCreatorEvents()
      .filter((record) => record.event === 'session.storage.refused');

    expect(refusals).toHaveLength(1);
    expect(refusals[0].properties).toMatchObject({ reason: 'keystore-unavailable' });
  });

  it('says nothing when the keystore works', async () => {
    emptyStores();
    const { storage, analytics } = withKeystore(workingKeystore);

    await storage.saveSession(SESSION);

    expect(
      analytics.peekCreatorEvents().filter((r) => r.event.startsWith('session.storage'))
    ).toHaveLength(0);
  });

  it('carries no token, id or anything else that names a person', () => {
    // `trackPlatformEvent` drops any property not on the allow-list, so this is
    // belt and braces — but a telemetry event emitted from the module that
    // holds the credentials is exactly where that would be worth getting wrong.
    emptyStores();
    const { storage, analytics } = withKeystore(missingKeystore);

    storage.sessionPersistence();

    const [refusal] = analytics
      .peekCreatorEvents()
      .filter((record) => record.event === 'session.storage.refused');

    expect(Object.keys(refusal.properties)).toEqual(['reason']);
    expect(JSON.stringify(refusal)).not.toContain('refresh-token-value');
    expect(JSON.stringify(refusal)).not.toContain('user-1');
  });
});
