// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Session store (Remediation Wave A)
//
// The one place that decides whether there is a session, what it grants, and
// when it ends.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `login(user, token)` — a pure local setter with no network call behind it.
// `app/(auth)/enable-location.tsx` called it with `userId: 'user-123'` and the
// literal string `mock_access_token`, which meant registration produced a
// client that believed it was signed in and an `Authorization` header the
// server would reject on every subsequent request.
//
// That function is gone. The only way into an authenticated state is
// {@link adoptSession}, which takes an `AuthenticationResult` — a value only
// the server can mint.
//
// ── Why `status` is a union and not a boolean ────────────────────────────────
//
// Restoring a session is asynchronous: it reads the keystore, and it may have
// to refresh. For the duration of that read, `isAuthenticated === false` was
// indistinguishable from "signed out", so the root layout redirected a
// signed-in member to the login screen on cold start. `status` distinguishes
// *not yet known* from *known to be absent*, and the layout waits for the
// former to resolve.
//
// `isAuthenticated` is kept as a derived field because forty-odd call sites
// read it, and none of them needs to care about the machine.
//
// ── Refresh is single-flight ─────────────────────────────────────────────────
//
// A screen that fires six queries on mount with an expired token would
// otherwise start six refreshes, five of which present an already-rotated
// refresh token. With rotation on (ADR-003) those five fail, and the first
// failure ends a session that was perfectly healthy. `refreshPromise` is what
// makes the six requests share one rotation.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { toAccountState } from '@/lib/access-state';
import type { AccountState } from '@/types/trust';
import type {
  AccessDecision,
  AuthStatus,
  AuthenticationResult,
  StoredSession,
  UserProfile,
} from '@/types/auth';
import { clearIdempotencyKeys } from '@/lib/idempotency';
import { clearCommunityPersistence } from '@/lib/community/persistence';
import { useCommunityContextStore } from '@/store/community-context';
import { deactivatePushToken } from '@/lib/integrations/push-lifecycle';
import { clearPendingFlows } from '@/lib/integrations/deep-links';
import { resetAutomationState } from '@/mocks/automation-gap-data';
import { registerAuthBridge } from '@/lib/apiClient';
import {
  clearProfileCache,
  clearSession,
  isSecureStorageActive,
  loadProfileCache,
  loadSession,
  saveProfileCache,
  saveSession,
} from '@/lib/auth-storage';
import { fetchCurrentUser, logout as logoutRequest, refreshSession } from '@/lib/auth-api';

/**
 * Refresh this far ahead of expiry.
 *
 * Sixty seconds covers a slow round trip plus reasonable clock skew between the
 * device and the server. Cutting it finer produces a request that was valid
 * when it was built and expired when it arrived, which reads as an intermittent
 * 401 nobody can reproduce.
 */
const EXPIRY_MARGIN_MS = 60_000;

/** The member, in the shape the application's forty-odd consumers already read. */
export interface User {
  userId: string;
  fullName: string;
  role: string;
  email?: string;
  phone?: string;
  nationality?: string;
  residenceCountry?: string;
  profilePhoto?: string;
  accountState: AccountState;
}

interface CachedIdentity {
  user: User;
  access: AccessDecision | null;
}

interface AuthState {
  status: AuthStatus;
  /** Derived from `status`. Kept because most consumers only need the boolean. */
  isAuthenticated: boolean;
  user: User | null;
  /**
   * The server's answer to what this member may do.
   *
   * Present so `config/featureRegistry.ts` and `app/access-gateway.tsx` can stop
   * deriving it — §7 makes the backend authoritative, and this is the value that
   * makes that possible rather than aspirational.
   */
  access: AccessDecision | null;
  sessionId: string | null;
  isExploringLimited: boolean;
  /** False when the token pair is in AsyncStorage rather than the platform keystore. */
  isSessionStorageSecure: boolean;

  restore: () => Promise<void>;
  adoptSession: (result: AuthenticationResult) => Promise<void>;
  signOut: (options?: { revokeAllSessions?: boolean }) => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setAccountState: (state: AccountState) => void;
  setExploringLimited: (val: boolean) => void;
}

// ── Module-scoped session material ───────────────────────────────────────────
//
// Tokens are held here rather than in the store's state on purpose: nothing
// renders them, a Zustand subscriber has no business being notified when one
// rotates, and keeping them out of the state tree keeps them out of any
// devtools dump or state snapshot a future debugging tool might take.

let tokens: StoredSession | null = null;
let refreshPromise: Promise<string | null> | null = null;

function mapUser(profile: UserProfile, access: AccessDecision | null): User {
  return {
    userId: profile.id,
    fullName: profile.fullName,
    role: profile.role,
    email: profile.email ?? undefined,
    phone: profile.phoneNumber,
    nationality: profile.nationality,
    residenceCountry: profile.countryOfResidence,
    profilePhoto: profile.avatarStorageKey ?? undefined,
    // The access decision is the authority where the two disagree: it is
    // computed for this sign-in, whereas the profile's copy is a column.
    // Translated, not cast. `as AccountState` used to assert that the backend's
    // vocabulary was this client's; it is not, and the lie meant `Verified`
    // never matched the `DiasporaVerified` the gate looks for. See
    // lib/access-state.ts.
    accountState: toAccountState(access?.accessState ?? profile.accessState),
  };
}

function toStoredSession(result: AuthenticationResult): StoredSession {
  return {
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    accessTokenExpiresAt: Date.parse(result.tokens.accessTokenExpiresAt),
    refreshTokenExpiresAt: Date.parse(result.tokens.refreshTokenExpiresAt),
    sessionId: result.sessionId,
    userId: result.user.id,
  };
}

function isExpired(at: number, marginMs = 0): boolean {
  return !Number.isFinite(at) || at - marginMs <= Date.now();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  isAuthenticated: false,
  user: null,
  access: null,
  sessionId: null,
  isExploringLimited: false,
  isSessionStorageSecure: false,

  /**
   * Restores a session from storage, refreshing it if the access token has
   * lapsed. Safe to call more than once.
   *
   * The optimistic step matters: the cached profile is applied *before* the
   * network work, so a returning member sees their own app rather than a
   * spinner. It is never trusted — the refresh below replaces the access
   * decision with the server's, and a failed refresh ends the session.
   */
  restore: async () => {
    if (get().status === 'restoring') return;
    set({ status: 'restoring', isSessionStorageSecure: isSecureStorageActive() });

    const stored = await loadSession();

    if (!stored || isExpired(stored.refreshTokenExpiresAt)) {
      // Nothing to restore, or the refresh token itself has expired. The second
      // case is a real ending: there is no credential left that can mint another.
      if (stored) await clearSession();
      await clearProfileCache();
      tokens = null;
      set({ status: 'unauthenticated', isAuthenticated: false, user: null, access: null, sessionId: null });
      return;
    }

    tokens = stored;

    const cached = await loadProfileCache<CachedIdentity>();
    if (cached?.user) {
      set({
        status: 'authenticated',
        isAuthenticated: true,
        user: cached.user,
        access: cached.access ?? null,
        sessionId: stored.sessionId,
      });
    }

    if (isExpired(stored.accessTokenExpiresAt, EXPIRY_MARGIN_MS)) {
      const token = await runRefresh();
      if (!token) return; // `runRefresh` has already ended the session.
    }

    // A restored session with no cached profile has tokens and no identity. The
    // profile read is what completes it, and a failure here is deliberately not
    // fatal: the tokens are valid, and a member on a bad connection should not
    // be signed out by a profile fetch.
    if (!get().user) {
      try {
        const profile = await fetchCurrentUser();
        const user = mapUser(profile, get().access);
        set({
          status: 'authenticated',
          isAuthenticated: true,
          user,
          sessionId: stored.sessionId,
        });
        void saveProfileCache({ user, access: get().access } satisfies CachedIdentity);
      } catch {
        set({ status: 'authenticated', isAuthenticated: true, sessionId: stored.sessionId });
      }
    } else {
      set({ status: 'authenticated', isAuthenticated: true, sessionId: stored.sessionId });
    }
  },

  /**
   * Accepts a server-issued session. The only route into `authenticated`.
   *
   * Persistence is awaited rather than fired and forgotten: a session the app
   * reports as established but has not written is a session the next launch
   * loses, and that failure is invisible until somebody restarts the app.
   */
  adoptSession: async (result) => {
    const stored = toStoredSession(result);
    tokens = stored;

    const user = mapUser(result.user, result.access);

    await saveSession(stored);
    await saveProfileCache({ user, access: result.access } satisfies CachedIdentity);

    set({
      status: 'authenticated',
      isAuthenticated: true,
      user,
      access: result.access,
      sessionId: result.sessionId,
      isExploringLimited: false,
      isSessionStorageSecure: isSecureStorageActive(),
    });
  },

  /**
   * Ends the session on the server and on the device.
   *
   * **Order is load-bearing, and it is the same reasoning the previous
   * implementation had for its push-token call — now applied to the two
   * network calls that were missing.** `POST /auth/logout` and
   * `DELETE /notifications/devices/{id}` are both authenticated, so they need
   * the token this function is about to discard. Clearing first would send two
   * unauthenticated requests that 401, leaving the server session alive and the
   * device still registered — which means the next member to sign in on this
   * phone receives the previous member's notifications on their lock screen.
   *
   * Neither call may block the sign-out. A member on a shared device needs to
   * be able to leave whatever the network is doing.
   */
  signOut: async (options) => {
    void deactivatePushToken();

    if (tokens) {
      try {
        await logoutRequest({ revokeAllSessions: options?.revokeAllSessions ?? false });
      } catch {
        // The server session may outlive this attempt. The local session must
        // not: an unreachable API is not a reason to keep somebody signed in.
      }
    }

    const userId = get().user?.userId;
    if (userId) void clearPendingFlows(userId);

    // Financial idempotency keys are scoped to the person who created them. A
    // key left in storage would let the next member on this device resume — or
    // be refused as a duplicate of — an operation that was never theirs.
    void clearIdempotencyKeys();

    // Frontend Phase 13, §41/§45. The active community, the recently-visited
    // list and the community display preferences all describe the person who
    // was signed in. Left on a shared device they would show the next member
    // somebody else's community selection — and on this platform a community
    // selection can imply nationality, immigration situation or religion.
    void clearCommunityPersistence();
    useCommunityContextStore.getState().reset();

    // Frontend Phase 18, §58/§59. A member's automation rules are personal — a
    // saved housing search states a budget and a neighbourhood. The TanStack
    // cache is keyed per member so the wrong entry cannot be *found*, but the
    // development adapter's own store is not.
    resetAutomationState();

    tokens = null;
    refreshPromise = null;
    await clearSession();
    await clearProfileCache();

    set({
      status: 'unauthenticated',
      isAuthenticated: false,
      user: null,
      access: null,
      sessionId: null,
      isExploringLimited: false,
    });
  },

  updateUser: (updatedUser) =>
    set((state) => {
      const user = state.user ? { ...state.user, ...updatedUser } : null;
      if (user) void saveProfileCache({ user, access: state.access } satisfies CachedIdentity);
      return { user };
    }),

  setAccountState: (accountState) =>
    set((state) => {
      const user = state.user ? { ...state.user, accountState } : null;
      if (user) void saveProfileCache({ user, access: state.access } satisfies CachedIdentity);
      return { user };
    }),

  setExploringLimited: (val) => set({ isExploringLimited: val }),
}));

/**
 * Rotates the token pair. Single-flight.
 *
 * Every caller in a burst awaits the same promise, so one rotation happens and
 * one refresh token is spent. Returns the new access token, or null when the
 * session is genuinely over — in which case it has already been ended locally,
 * so a caller never has to decide that for itself.
 */
async function runRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const current = tokens;
  if (!current || isExpired(current.refreshTokenExpiresAt)) {
    await endSessionLocally();
    return null;
  }

  useAuthStore.setState({ status: 'refreshing' });

  refreshPromise = (async () => {
    try {
      const result = await refreshSession(current.refreshToken);
      const stored = toStoredSession(result);
      tokens = stored;

      const user = mapUser(result.user, result.access);
      await saveSession(stored);
      await saveProfileCache({ user, access: result.access } satisfies CachedIdentity);

      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user,
        access: result.access,
        sessionId: result.sessionId,
      });

      return stored.accessToken;
    } catch {
      // A refused refresh is the end of the session. It is not retried: the
      // refresh token has either expired or been rotated away, and neither
      // improves by asking again.
      await endSessionLocally();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Ends the session without calling the server.
 *
 * Used when the server has already told us the session is over. Calling
 * `signOut` here would post a logout with a credential the server has just
 * refused, and would recurse through the same refusal.
 */
async function endSessionLocally(): Promise<void> {
  tokens = null;
  refreshPromise = null;
  await clearSession();
  await clearProfileCache();
  useAuthStore.setState({
    status: 'unauthenticated',
    isAuthenticated: false,
    user: null,
    access: null,
    sessionId: null,
  });
}

// ── The bridge into the HTTP client ──────────────────────────────────────────
//
// Registered at module load. `apiClient` imports nothing from this tree, so the
// direction of the dependency is unambiguous: the session layer knows about the
// transport, and the transport knows about an interface.

registerAuthBridge({
  getAccessToken: () => tokens?.accessToken ?? null,

  ensureFreshToken: async () => {
    if (!tokens) return null;
    if (!isExpired(tokens.accessTokenExpiresAt, EXPIRY_MARGIN_MS)) return tokens.accessToken;
    return runRefresh();
  },

  refreshAfterUnauthorized: async () => {
    if (!tokens) return null;
    return runRefresh();
  },
});

/** Test seam. Installs a session without a server, for suites that need one. */
export function __setSessionForTests(session: StoredSession | null): void {
  tokens = session;
  refreshPromise = null;
}
