// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Session persistence (Remediation Wave A)
//
// Where the token pair lives between launches, and why it is not AsyncStorage.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `store/auth.ts` held `accessToken` in a plain Zustand field and persisted
// nothing. Two consequences, and the second is the one nobody noticed: a restart
// signed the member out, *and* there was nowhere to put a refresh token, so the
// backend's rotation lifecycle (ADR-003) had no client half at all.
//
// ── Why SecureStore, with a web fallback ─────────────────────────────────────
//
// A refresh token is a long-lived credential: it re-mints access tokens for as
// long as the server allows, so it is worth more than the access token it
// replaces. On device it belongs in the platform keystore — Keychain on iOS,
// EncryptedSharedPreferences on Android — which is what `expo-secure-store`
// wraps.
//
// `expo-secure-store` has no web implementation. This project ships
// `react-native-web`, so a straight import would throw at module load on that
// platform rather than at the call site. The adapter below resolves the backend
// once, at first use, and falls back to AsyncStorage on web with the honesty
// that deserves: `sessionPersistence()` reports which one answered, and the
// session store records it, so "the token is in the keystore" is never assumed.
//
// ── What changed on 18 Nov 2026 (FSEC-006) ───────────────────────────────────
//
// That honesty was the whole of the control, and it was a boolean nobody read.
// `isSecureStorageActive()` was exported, the store recorded it in
// `isSessionStorageSecure`, and **a search for any consumer of that field
// returned the two assignments and nothing else.** No screen showed it, no
// telemetry reported it, and nothing behaved differently because of it. The
// comment above it said a false value "is worth surfacing rather than
// discovering during an incident", and then it was not surfaced.
//
// So on a native device whose keystore did not load, a refresh token with a
// 30-day lifetime — a credential that re-mints access tokens for as long as the
// server allows — was written to `AsyncStorage`, which this file's own prose
// correctly describes as readable on a rooted device and included in backups.
// Silently, in every direction.
//
// **A device with no keystore now gets a degraded session rather than an unsafe
// one.** Nothing of the token pair is persisted; the access token lives in the
// store for as long as the app is open, and a restart requires a fresh sign-in.
// That is a worse experience than today and a better one than a long-lived
// credential in the clear, and it is the trade the audit asked for.
//
// Web is deliberately unchanged: `Platform.OS === 'web'` is a known branch, the
// web target is not a shipped product here, and refusing there would break the
// one platform where the fallback was always the design.
//
// ── The size constraint, and why the shape below respects it ─────────────────
//
// Android's SecureStore entries are capped (2048 bytes in the versions this app
// supports) and a JWT pair can approach that. So the record is stored as three
// entries — access token, refresh token, and a small JSON envelope for the
// expiry timestamps and identifiers — rather than one blob. Reading is a
// `Promise.all`; the extra round trip is cheaper than a write that silently
// fails at the platform boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackPlatformEvent } from '@/lib/platform/creator-analytics';
import type { StoredSession } from '@/types/auth';

const ACCESS_KEY = 'diaspora.session.access';
const REFRESH_KEY = 'diaspora.session.refresh';
const META_KEY = 'diaspora.session.meta';

interface KeyValueBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * Where this device's session can be kept, and therefore whether it is kept.
 *
 * * `keystore` — Keychain or EncryptedSharedPreferences, through
 *   `expo-secure-store`. The intended answer on every native build.
 * * `web` — `localStorage` behind AsyncStorage. Deliberate, and the reason the
 *   adapter exists at all.
 * * `refused` — a native device whose keystore did not load. **Nothing is
 *   persisted**, because the only place left to put a 30-day credential is in
 *   the clear.
 */
export type SessionPersistence = 'keystore' | 'web' | 'refused';

let backend: KeyValueBackend | null = null;
let persistence: SessionPersistence = 'refused';
let reported = false;

/** Emitted once per launch when a native device has no keystore. */
const STORAGE_REFUSED = 'session.storage.refused';

/**
 * Resolves the storage backend once.
 *
 * `require` rather than a static import so a missing or web-stubbed native
 * module is a caught failure with a working fallback, not a module-load crash
 * that takes the whole bundle down before any screen renders.
 */
function resolveBackend(): KeyValueBackend {
  if (backend) return backend;

  if (Platform.OS !== 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const store = require('expo-secure-store');
      if (typeof store?.setItemAsync === 'function') {
        persistence = 'keystore';
        backend = {
          getItemAsync: (key) => store.getItemAsync(key),
          setItemAsync: (key, value) => store.setItemAsync(key, value),
          deleteItemAsync: (key) => store.deleteItemAsync(key),
        };
        return backend;
      }
    } catch {
      // Falls through to AsyncStorage. A device without a working keystore is
      // still a device somebody has to be able to *use*; what it does not get
      // is a credential written to it in the clear.
    }
  }

  persistence = Platform.OS === 'web' ? 'web' : 'refused';

  // AsyncStorage still answers in the refused case, and it has to: that is
  // where an earlier build of this app may have left a session, and
  // `loadSession` and `saveSession` both use this backend to delete it.
  backend = {
    getItemAsync: (key) => AsyncStorage.getItem(key),
    setItemAsync: (key, value) => AsyncStorage.setItem(key, value),
    deleteItemAsync: (key) => AsyncStorage.removeItem(key),
  };

  // Reported here rather than by a caller, because this function runs exactly
  // once and a caller can forget. Only the native refusal is reported: `web` is
  // a deliberate, known branch, and an alert that fires on an expected state is
  // an alert somebody learns to ignore.
  if (persistence === 'refused' && !reported) {
    reported = true;
    trackPlatformEvent(STORAGE_REFUSED, { reason: 'keystore-unavailable' });
  }

  return backend;
}

/**
 * How this device can keep a session. Resolves the backend if it has not been.
 *
 * Exposed so the client can *state* the property rather than assume it, and so
 * the account-security screen can tell the member. It replaces
 * `isSecureStorageActive()`, which answered a yes/no question where there are
 * three answers: a boolean could not distinguish "web, as designed" from "this
 * phone has no keystore", and the screen needs to say different things.
 */
export function sessionPersistence(): SessionPersistence {
  resolveBackend();
  return persistence;
}

interface SessionMeta {
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  sessionId: string;
  userId: string;
}

/**
 * Persists the session, or refuses to and says so.
 *
 * Returns what it did rather than `void`, because "saved" and "deliberately not
 * saved" are different outcomes and a caller that cannot tell them apart is how
 * this finding happened in the first place.
 *
 * The refusal **deletes** rather than merely skipping. A build before this
 * change wrote the pair to `AsyncStorage` on exactly the devices that now
 * refuse, so the plaintext refresh token is already on disk there; leaving it
 * would mean this change protected new sessions and left the existing credential
 * lying about for the rest of its thirty days.
 */
export async function saveSession(session: StoredSession): Promise<SessionPersistence> {
  const store = resolveBackend();

  if (persistence === 'refused') {
    await clearSession();
    return persistence;
  }

  const meta: SessionMeta = {
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    sessionId: session.sessionId,
    userId: session.userId,
  };

  await Promise.all([
    store.setItemAsync(ACCESS_KEY, session.accessToken),
    store.setItemAsync(REFRESH_KEY, session.refreshToken),
    store.setItemAsync(META_KEY, JSON.stringify(meta)),
  ]);

  return persistence;
}

/**
 * Reads the persisted session, or null.
 *
 * A partial record — any one of the three entries missing or unparseable — is
 * treated as no session at all rather than as a session with a hole in it. A
 * refresh token with no expiry is a credential nothing can decide to stop
 * using.
 */
export async function loadSession(): Promise<StoredSession | null> {
  const store = resolveBackend();

  if (persistence === 'refused') {
    // There should be nothing here, and if there is it was written by a build
    // that predates this refusal. Reading it would keep a plaintext refresh
    // token working for the rest of its life, which is the credential this
    // change exists to stop existing. One sign-in is the cost, once.
    await clearSession();
    return null;
  }

  try {
    const [accessToken, refreshToken, rawMeta] = await Promise.all([
      store.getItemAsync(ACCESS_KEY),
      store.getItemAsync(REFRESH_KEY),
      store.getItemAsync(META_KEY),
    ]);

    if (!accessToken || !refreshToken || !rawMeta) return null;

    const meta = JSON.parse(rawMeta) as Partial<SessionMeta>;
    if (
      typeof meta.accessTokenExpiresAt !== 'number' ||
      typeof meta.refreshTokenExpiresAt !== 'number' ||
      typeof meta.sessionId !== 'string' ||
      typeof meta.userId !== 'string'
    ) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: meta.accessTokenExpiresAt,
      refreshTokenExpiresAt: meta.refreshTokenExpiresAt,
      sessionId: meta.sessionId,
      userId: meta.userId,
    };
  } catch {
    return null;
  }
}

/**
 * Removes the persisted session.
 *
 * Never rejects. This runs during sign-out and during a failed refresh, and in
 * both cases the local session must end whatever storage does — a member on a
 * shared device who cannot sign out because a keystore write failed is the worst
 * outcome available here.
 */
export async function clearSession(): Promise<void> {
  const store = resolveBackend();
  await Promise.all([
    store.deleteItemAsync(ACCESS_KEY).catch(() => {}),
    store.deleteItemAsync(REFRESH_KEY).catch(() => {}),
    store.deleteItemAsync(META_KEY).catch(() => {}),
  ]);
}

// ── The non-secret half ──────────────────────────────────────────────────────
//
// The profile and the access decision are not credentials, and they are not
// small: `AccessDecision` carries four string arrays whose length is a product
// decision. Putting them in SecureStore would push the record towards Android's
// 2048-byte entry ceiling for no security benefit, so they live in AsyncStorage.
//
// They are cached at all so a cold start can render immediately instead of
// showing a spinner while `GET /auth/me` completes. The cache is **never the
// authority**: every refresh replaces the access decision with the server's,
// and `restoreSession` re-reads the profile in the background.

const PROFILE_KEY = 'diaspora.session.profile';

export async function saveProfileCache(value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(value));
  } catch {
    // A cache that cannot be written costs a spinner, not a session.
  }
}

export async function loadProfileCache<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function clearProfileCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROFILE_KEY);
  } catch {
    // Same reasoning as `clearSession`: sign-out must not be blocked by storage.
  }
}

/** Test seam. Resets the memoised backend so a suite can swap platforms. */
export function __resetAuthStorageForTests(): void {
  backend = null;
  persistence = 'refused';
  reported = false;
}
