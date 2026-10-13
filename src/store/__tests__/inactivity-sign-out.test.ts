// ─────────────────────────────────────────────────────────────────────────────
// Thirty minutes without using the app signs the member out (13 Oct 2026)
//
// A session opened five days earlier was still live; the only limit was the
// server's 30 days without a refresh. These pin the cold-start half — a phone
// that closed the app long ago — which is the commonest case and the one no
// running timer can see.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { authTransport } from '@/lib/auth-api';
import { apiClient } from '@/lib/apiClient';
import { hasExpired, INACTIVITY_LIMIT_MS } from '@/lib/inactivity';
import { saveSession } from '@/lib/auth-storage';
import { useAuthStore, __setSessionForTests } from '@/store/auth';
import { buildAuthenticationResult } from '@/mocks/auth-session';

declare global {
  // eslint-disable-next-line no-var
  var __secureStore: Record<string, string>;
  // eslint-disable-next-line no-var
  var __asyncStorageStore: Record<string, string>;
}

const HOUR = 60 * 60 * 1000;
const KEY = 'diaspora.lastActiveAt';

let auth: MockAdapter;
let api: MockAdapter;

async function storedSession() {
  await saveSession({
    accessToken: 'access',
    refreshToken: 'refresh',
    accessTokenExpiresAt: Date.now() + HOUR,
    refreshTokenExpiresAt: Date.now() + 24 * HOUR,
    sessionId: 'session-1',
    userId: 'member-1',
  });
}

beforeEach(() => {
  auth = new MockAdapter(authTransport);
  api = new MockAdapter(apiClient);
  api.onPost('/auth/logout').reply(204);
  for (const store of [globalThis.__secureStore, globalThis.__asyncStorageStore]) {
    for (const key of Object.keys(store ?? {})) delete store[key];
  }
});

afterEach(() => {
  auth.restore();
  api.restore();
  useAuthStore.setState({
    status: 'unknown',
    isAuthenticated: false,
    user: null,
    access: null,
    sessionId: null,
    signOutReason: null,
  });
  __setSessionForTests(null);
});

describe('hasExpired', () => {
  it('is false up to thirty minutes and true after', () => {
    const now = 1_000_000_000;
    expect(hasExpired(now - INACTIVITY_LIMIT_MS, now)).toBe(false);
    expect(hasExpired(now - INACTIVITY_LIMIT_MS - 1, now)).toBe(true);
  });

  it('is false when nothing was ever recorded', () => {
    // A session from a build before this rule must not end on its first launch.
    expect(hasExpired(null)).toBe(false);
  });
});

describe('starting the app', () => {
  it('signs out a session left unused for more than thirty minutes, and says why', async () => {
    await storedSession();
    globalThis.__asyncStorageStore[KEY] = String(Date.now() - 5 * 24 * HOUR);

    await useAuthStore.getState().restore();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.signOutReason).toBe('inactivity');
    expect(api.history.post.map((call) => call.url)).toContain('/auth/logout');
  });

  it('keeps a session used a few minutes ago', async () => {
    await storedSession();
    globalThis.__asyncStorageStore[KEY] = String(Date.now() - 5 * 60 * 1000);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().signOutReason).toBeNull();
    expect(api.history.post.map((call) => call.url)).not.toContain('/auth/logout');
  });

  it('clears the reason when the member signs in again', async () => {
    useAuthStore.setState({ signOutReason: 'inactivity' });

    await useAuthStore.getState().adoptSession(buildAuthenticationResult({ accessState: 'Verified' }));

    expect(useAuthStore.getState().signOutReason).toBeNull();
  });
});
