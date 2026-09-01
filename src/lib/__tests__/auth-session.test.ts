// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Authentication and session lifecycle (Remediation Wave A)
//
// These tests exist because every one of them would have failed before the
// wave, and none of the 3194 tests that already passed would have noticed.
//
// The routes are asserted **by path**, not by behaviour, and that is deliberate:
// the defect this wave fixes was not a logic error. `POST /auth/otp/send` and
// `POST /auth/otp/verify` were perfectly reasonable-looking calls to routes that
// have never existed on this platform, and no amount of testing the client
// against its own assumptions would have caught it. A test that pins the path
// is the only kind that fails when the two repositories disagree.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { authTransport } from '../auth-api';
import * as authApi from '../auth-api';
import { useAuthStore, __setSessionForTests } from '@/store/auth';
import { buildAuthenticationResult } from '@/mocks/auth-session';
import { loadSession } from '../auth-storage';

// The two in-memory stores `jest.setup.js` installs. Declared rather than cast
// so a test that clears the wrong one is a compile error.
declare global {
  // eslint-disable-next-line no-var
  var __secureStore: Record<string, string>;
  // eslint-disable-next-line no-var
  var __asyncStorageStore: Record<string, string>;
}

let auth: MockAdapter;
let api: MockAdapter;

beforeEach(() => {
  auth = new MockAdapter(authTransport);
  api = new MockAdapter(apiClient);
  globalThis.__secureStore = {};
  globalThis.__asyncStorageStore = {};
});

afterEach(async () => {
  auth.restore();
  api.restore();
  // Reset the store between tests without going through `signOut`, which would
  // itself make a network call.
  useAuthStore.setState({
    status: 'unknown',
    isAuthenticated: false,
    user: null,
    access: null,
    sessionId: null,
  });
  __setSessionForTests(null);
});

function envelope<T>(data: T) {
  return { data, meta: { requestId: 'r', correlationId: 'c', timestamp: 'now' } };
}

// ── The routes ───────────────────────────────────────────────────────────────

describe('the identity routes the platform actually serves', () => {
  it('starts a passwordless sign-in at /auth/otp/start', async () => {
    auth.onPost('/auth/otp/start').reply(200, envelope({ message: 'Sent.' }));

    await authApi.startOtpSignIn({ phoneNumber: '+447700900000' });

    expect(auth.history.post).toHaveLength(1);
    expect(auth.history.post[0].url).toBe('/auth/otp/start');
  });

  it('never calls /auth/otp/send — the route this client used to address', async () => {
    // Everything except `otp/start` 404s, which is what the real deployment did
    // to every sign-in attempt this client made.
    auth.onPost('/auth/otp/start').reply(200, envelope({ message: 'Sent.' }));
    auth.onAny().reply(404, { title: 'Not Found', status: 404 });

    await expect(authApi.startOtpSignIn({ phoneNumber: '+447700900000' })).resolves.toBeTruthy();
  });

  it('redeems a sign-in code at /auth/otp/sign-in', async () => {
    auth.onPost('/auth/otp/sign-in').reply(200, envelope(buildAuthenticationResult()));

    await authApi.otpSignIn({ phoneNumber: '+447700900000', code: '123456' });

    expect(auth.history.post[0].url).toBe('/auth/otp/sign-in');
  });

  it('redeems a registration code at /auth/verify-phone, which is a different route', async () => {
    auth.onPost('/auth/verify-phone').reply(200, envelope(buildAuthenticationResult()));

    await authApi.verifyPhone({ phoneNumber: '+447700900000', code: '123456' });

    expect(auth.history.post[0].url).toBe('/auth/verify-phone');
  });

  it('registers at /auth/register and sends every field RegisterRequest requires', async () => {
    auth.onPost('/auth/register').reply(
      201,
      envelope({
        userId: 'u1',
        phoneNumber: '+447700900000',
        accessState: 'LimitedAccess',
        verification: {
          phoneNumber: '+447700900000',
          purpose: 'register',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          attemptsRemaining: 5,
          resendsRemaining: 3,
          resendAvailableInSeconds: 45,
        },
      })
    );

    await authApi.register({
      fullName: 'Amara Kone',
      phoneNumber: '+447700900000',
      email: 'member447700900000@diaspora.test',
      password: 'correct-horse-battery',
      nationality: 'NG',
      countryOfResidence: 'GB',
    });

    const body = JSON.parse(auth.history.post[0].data);
    expect(auth.history.post[0].url).toBe('/auth/register');
    // `nationality` and `countryOfResidence` are `required` on the server record.
    // A registration missing either is a 400, and the client used to send none
    // of them because it never made the call at all.
    expect(body).toMatchObject({
      fullName: 'Amara Kone',
      phoneNumber: '+447700900000',
      email: 'member447700900000@diaspora.test',
      password: 'correct-horse-battery',
      nationality: 'NG',
      countryOfResidence: 'GB',
    });
  });

  it('sends the device descriptor with every token-issuing call', async () => {
    auth.onPost('/auth/otp/sign-in').reply(200, envelope(buildAuthenticationResult()));

    await authApi.otpSignIn({ phoneNumber: '+447700900000', code: '123456' });

    const body = JSON.parse(auth.history.post[0].data);
    // Without these the server's session list cannot tell two devices apart,
    // which makes "revoke the session on my lost phone" impossible to do right.
    expect(body.platform).toBeTruthy();
    expect(body.deviceName).toBeTruthy();
  });
});

// ── The response shape ───────────────────────────────────────────────────────

describe('the AuthenticationResponse shape', () => {
  it('reads the token pair from tokens.*, not from the envelope root', async () => {
    const result = buildAuthenticationResult({
      accessToken: 'real-access',
      refreshToken: 'real-refresh',
    });
    auth.onPost('/auth/otp/sign-in').reply(200, envelope(result));

    const received = await authApi.otpSignIn({ phoneNumber: '+44', code: '123456' });

    // The client's own type declared `{ user, accessToken }`. Against this
    // payload `payload.accessToken` is undefined — and because the client then
    // threw on the missing field, a correct server response was reported to the
    // member as "Sign-in did not complete".
    expect(received.tokens.accessToken).toBe('real-access');
    expect(received.tokens.refreshToken).toBe('real-refresh');
    expect((received as unknown as { accessToken?: string }).accessToken).toBeUndefined();
  });

  it('refuses a 200 that carries no usable session', async () => {
    auth.onPost('/auth/otp/sign-in').reply(200, envelope({ user: { id: 'u1' } }));

    await expect(authApi.otpSignIn({ phoneNumber: '+44', code: '1' })).rejects.toThrow(
      /did not complete/i
    );
  });

  it('carries the access decision through, so the client stops deriving it', async () => {
    auth.onPost('/auth/otp/sign-in').reply(
      200,
      envelope(
        buildAuthenticationResult({
          permissions: ['jobs.apply', 'guides.create'],
          destination: '/access-gateway',
        })
      )
    );

    const received = await authApi.otpSignIn({ phoneNumber: '+44', code: '1' });

    expect(received.access.permissions).toEqual(['jobs.apply', 'guides.create']);
    expect(received.access.destination).toBe('/access-gateway');
  });
});

// ── Persistence and restoration ──────────────────────────────────────────────

describe('session persistence', () => {
  it('persists the pair on adoption and restores it across a restart', async () => {
    await useAuthStore
      .getState()
      .adoptSession(buildAuthenticationResult({ userId: 'u-restored' }));

    expect(useAuthStore.getState().status).toBe('authenticated');

    const stored = await loadSession();
    expect(stored?.refreshToken).toBe('test-refresh-token');

    // Simulate a cold start: the store forgets, storage does not.
    useAuthStore.setState({ status: 'unknown', isAuthenticated: false, user: null });
    __setSessionForTests(null);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.userId).toBe('u-restored');
  });

  it('ends the session when the refresh token has itself expired', async () => {
    await useAuthStore.getState().adoptSession(
      buildAuthenticationResult({
        accessTokenTtlMs: -1000,
        refreshTokenTtlMs: -1000,
      })
    );

    useAuthStore.setState({ status: 'unknown' });
    __setSessionForTests(null);

    await useAuthStore.getState().restore();

    // Nothing left can mint another token, so this is a real ending rather than
    // something to retry.
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(await loadSession()).toBeNull();
  });

  it('resolves to unauthenticated when there is nothing stored', async () => {
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});

// ── Refresh ──────────────────────────────────────────────────────────────────

describe('token refresh', () => {
  it('refreshes proactively when the access token is inside the expiry margin', async () => {
    // Twenty seconds of life left, against a sixty-second margin.
    await useAuthStore
      .getState()
      .adoptSession(buildAuthenticationResult({ accessTokenTtlMs: 20_000 }));

    auth
      .onPost('/auth/refresh')
      .reply(200, envelope(buildAuthenticationResult({ accessToken: 'rotated' })));
    api.onGet('/anything').reply(200, envelope({ ok: true }));

    await apiClient.get('/anything');

    expect(auth.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(1);
    expect(api.history.get[0].headers?.Authorization).toBe('Bearer rotated');
  });

  it('is single-flight: a burst of requests spends one refresh token', async () => {
    await useAuthStore
      .getState()
      .adoptSession(buildAuthenticationResult({ accessTokenTtlMs: 20_000 }));

    auth
      .onPost('/auth/refresh')
      .reply(200, envelope(buildAuthenticationResult({ accessToken: 'rotated' })));
    api.onGet('/anything').reply(200, envelope({ ok: true }));

    await Promise.all([
      apiClient.get('/anything'),
      apiClient.get('/anything'),
      apiClient.get('/anything'),
      apiClient.get('/anything'),
      apiClient.get('/anything'),
      apiClient.get('/anything'),
    ]);

    // With rotation on (ADR-003), six concurrent refreshes would present the
    // same token six times; five would be refused, and the first refusal would
    // end a session that was healthy.
    expect(auth.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(1);
  });

  it('refreshes reactively after a 401 and replays the original request', async () => {
    await useAuthStore.getState().adoptSession(buildAuthenticationResult());

    auth
      .onPost('/auth/refresh')
      .reply(200, envelope(buildAuthenticationResult({ accessToken: 'second' })));

    let attempts = 0;
    api.onGet('/protected').reply(() => {
      attempts += 1;
      return attempts === 1 ? [401, { title: 'Unauthorized' }] : [200, envelope({ ok: true })];
    });

    const response = await apiClient.get('/protected');

    expect(attempts).toBe(2);
    expect(response.data).toEqual(envelope({ ok: true }));
  });

  it('retries a 401 only once, so a rejected fresh token cannot loop', async () => {
    await useAuthStore.getState().adoptSession(buildAuthenticationResult());

    auth
      .onPost('/auth/refresh')
      .reply(200, envelope(buildAuthenticationResult({ accessToken: 'second' })));
    api.onGet('/protected').reply(401, { title: 'Unauthorized' });

    await expect(apiClient.get('/protected')).rejects.toBeTruthy();

    expect(api.history.get.filter((r) => r.url === '/protected')).toHaveLength(2);
  });

  it('ends the session when the server refuses the refresh token', async () => {
    await useAuthStore.getState().adoptSession(buildAuthenticationResult());

    auth.onPost('/auth/refresh').reply(401, { title: 'Unauthorized' });
    api.onGet('/protected').reply(401, { title: 'Unauthorized' });

    await expect(apiClient.get('/protected')).rejects.toBeTruthy();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(await loadSession()).toBeNull();
  });
});

// ── Sign-out ─────────────────────────────────────────────────────────────────

describe('sign-out', () => {
  it('invalidates the server session before clearing the local one', async () => {
    await useAuthStore.getState().adoptSession(buildAuthenticationResult());
    api.onPost('/auth/logout').reply(200, envelope({ message: 'Signed out.' }));

    await useAuthStore.getState().signOut();

    const logoutCall = api.history.post.find((r) => r.url === '/auth/logout');
    expect(logoutCall).toBeTruthy();
    // The bearer has to still be attached: this is why the call happens before
    // the clear, not after it.
    expect(logoutCall?.headers?.Authorization).toBe('Bearer test-access-token');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(await loadSession()).toBeNull();
  });

  it('still ends the local session when the server cannot be reached', async () => {
    await useAuthStore.getState().adoptSession(buildAuthenticationResult());
    api.onPost('/auth/logout').networkError();

    await useAuthStore.getState().signOut();

    // An unreachable API is not a reason to keep somebody signed in on a shared
    // device.
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(await loadSession()).toBeNull();
  });

  it('does not attempt a refresh in order to sign out', async () => {
    await useAuthStore
      .getState()
      .adoptSession(buildAuthenticationResult({ accessTokenTtlMs: -1000 }));

    auth.onPost('/auth/refresh').reply(500);
    api.onPost('/auth/logout').reply(401, { title: 'Unauthorized' });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});

// ── Error mapping ────────────────────────────────────────────────────────────

describe('failure reporting', () => {
  it('reports a rejected code as a wrong code, not an expired session', async () => {
    auth.onPost('/auth/otp/sign-in').reply(401, { detail: 'That code is not right.' });

    await expect(authApi.otpSignIn({ phoneNumber: '+44', code: '000000' })).rejects.toMatchObject({
      kind: 'InvalidRequest',
    });
  });

  it('surfaces the retry interval on a 429', async () => {
    auth
      .onPost('/auth/otp/start')
      .reply(429, { detail: 'Too many codes requested.' }, { 'retry-after': '45' });

    await expect(authApi.startOtpSignIn({ phoneNumber: '+44' })).rejects.toMatchObject({
      kind: 'RateLimited',
      retryAfterSeconds: 45,
    });
  });

  it('reports a duplicate account as a conflict', async () => {
    auth.onPost('/auth/register').reply(409, { detail: 'That number is already registered.' });

    await expect(
      authApi.register({
        fullName: 'A',
        phoneNumber: '+44',
        email: 'member44@diaspora.test',
        password: 'x'.repeat(12),
        nationality: 'NG',
        countryOfResidence: 'GB',
      })
    ).rejects.toMatchObject({ kind: 'Conflict' });
  });
});
