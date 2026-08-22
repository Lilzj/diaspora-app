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
// that deserves: `isSecure()` reports which one answered, and the session store
// records it, so "the token is in the keystore" is never assumed.
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
import type { StoredSession } from '@/types/auth';

const ACCESS_KEY = 'diaspora.session.access';
const REFRESH_KEY = 'diaspora.session.refresh';
const META_KEY = 'diaspora.session.meta';

interface KeyValueBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

let backend: KeyValueBackend | null = null;
let secure = false;

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
        secure = true;
        backend = {
          getItemAsync: (key) => store.getItemAsync(key),
          setItemAsync: (key, value) => store.setItemAsync(key, value),
          deleteItemAsync: (key) => store.deleteItemAsync(key),
        };
        return backend;
      }
    } catch {
      // Falls through to AsyncStorage. A device without a working keystore is
      // still a device somebody has to be able to sign in on.
    }
  }

  secure = false;
  backend = {
    getItemAsync: (key) => AsyncStorage.getItem(key),
    setItemAsync: (key, value) => AsyncStorage.setItem(key, value),
    deleteItemAsync: (key) => AsyncStorage.removeItem(key),
  };
  return backend;
}

/**
 * Whether the persisted session is in platform-secure storage.
 *
 * Exposed so the client can *state* the property rather than assume it. A build
 * where this is false on a native platform is a build whose keystore did not
 * load, and that is worth surfacing rather than discovering during an incident.
 */
export function isSecureStorageActive(): boolean {
  resolveBackend();
  return secure;
}

interface SessionMeta {
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  sessionId: string;
  userId: string;
}

export async function saveSession(session: StoredSession): Promise<void> {
  const store = resolveBackend();
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
  secure = false;
}
