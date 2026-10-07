// ─────────────────────────────────────────────────────────────────────────────
// A reviewer's approval reaches a member whose app is already open
//
// ── What this pins (7 Oct 2026) ─────────────────────────────────────────────
//
// The account state was read at sign-in and at start-up, and again only when
// the access token happened to expire. A member approved while waiting on the
// gateway stayed there — "Start verification" and all — until they signed out
// and in again. `syncAccess` asks now; the gateway calls it on focus and the
// root layout on every return to the foreground while a decision is pending.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { authTransport } from '@/lib/auth-api';
import { isAwaitingDecision } from '@/lib/access-state';
import { useAuthStore, __setSessionForTests } from '@/store/auth';
import { buildAuthenticationResult } from '@/mocks/auth-session';

declare global {
  // eslint-disable-next-line no-var
  var __secureStore: Record<string, string>;
  // eslint-disable-next-line no-var
  var __asyncStorageStore: Record<string, string>;
}

let auth: MockAdapter;

const HOUR = 60 * 60 * 1000;

function envelope<T>(data: T) {
  return { data, meta: { requestId: 'r', correlationId: 'c', timestamp: 'now' } };
}

/** A signed-in member on the gateway, waiting for a reviewer. */
function waitingMember() {
  __setSessionForTests({
    accessToken: 'access-old',
    refreshToken: 'refresh-old',
    accessTokenExpiresAt: Date.now() + HOUR,
    refreshTokenExpiresAt: Date.now() + 24 * HOUR,
    sessionId: 'session-1',
    userId: 'member-1',
  });

  useAuthStore.setState({
    status: 'authenticated',
    isAuthenticated: true,
    sessionId: 'session-1',
    access: null,
    user: {
      userId: 'member-1',
      fullName: 'John Doe',
      role: 'CommunityUser',
      phone: '+447700900000',
      nationality: 'NG',
      residenceCountry: 'MU',
      accountState: 'DiasporaVerificationPending',
    },
  });
}

beforeEach(() => {
  auth = new MockAdapter(authTransport);
  for (const store of [globalThis.__secureStore, globalThis.__asyncStorageStore]) {
    for (const key of Object.keys(store ?? {})) delete store[key];
  }
});

afterEach(() => {
  auth.restore();
  useAuthStore.setState({
    status: 'unknown',
    isAuthenticated: false,
    user: null,
    access: null,
    sessionId: null,
  });
  __setSessionForTests(null);
});

describe('syncAccess', () => {
  it('moves an approved member off the waiting state without signing in again', async () => {
    waitingMember();
    // The server's vocabulary, not the client's: `Verified`, which the store
    // must translate. The fixture's default ('DiasporaVerified') is a client
    // word and would pass for the wrong reason.
    auth.onPost('/auth/refresh').reply(
      200,
      envelope(buildAuthenticationResult({ userId: 'member-1', accessState: 'Verified' })),
    );

    await useAuthStore.getState().syncAccess();

    expect(auth.history.post).toHaveLength(1);
    expect(useAuthStore.getState().user?.accountState).toBe('DiasporaVerified');
  });

  it('asks even though the access token has not expired', async () => {
    // The defect in one line: a valid token meant nobody asked.
    waitingMember();
    auth.onPost('/auth/refresh').reply(
      200,
      envelope(buildAuthenticationResult({ userId: 'member-1', accessState: 'VerificationPending' })),
    );

    await useAuthStore.getState().syncAccess();

    expect(auth.history.post.map((call) => call.url)).toEqual(['/auth/refresh']);
  });

  it('keeps the member signed in and waiting when the question is not answered', async () => {
    waitingMember();
    auth.onPost('/auth/refresh').networkError();

    await useAuthStore.getState().syncAccess();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.accountState).toBe('DiasporaVerificationPending');
  });

  it('does nothing for somebody who is not signed in', async () => {
    await useAuthStore.getState().syncAccess();

    expect(auth.history.post).toHaveLength(0);
  });
});

describe('isAwaitingDecision', () => {
  it.each(['DiasporaVerificationPending', 'VerificationUnderReview', 'RequiresMoreInformation', 'AppealPending'] as const)(
    '%s is waiting on somebody else',
    (state) => {
      expect(isAwaitingDecision(state)).toBe(true);
    },
  );

  it.each(['DiasporaVerified', 'LimitedAccess', 'Suspended', null, undefined] as const)(
    '%s is not, so the foreground does not rotate tokens for it',
    (state) => {
      expect(isAwaitingDecision(state)).toBe(false);
    },
  );
});
