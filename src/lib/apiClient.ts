import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useConnectivityStore } from '@/lib/connectivity';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Send this request without a bearer token. Used by the anonymous identity routes. */
    skipAuth?: boolean;
    /**
     * Do not attempt a token refresh if this request returns 401.
     *
     * Set on sign-out: refreshing a session in order to end it is work with no
     * outcome, and it delays the one thing the member asked for.
     */
    skipAuthRetry?: boolean;
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  /** Set once, so a refreshed token that is still refused does not loop. */
  __authRetried?: boolean;
}

/**
 * The client's base URL.
 *
 * One segment short of the platform's canonical `/api/v1`, and deliberately
 * left that way: `RoutePrefixCompatibilityMiddleware` rewrites `/v1/*` onto
 * `/api/v1/*` before routing, so the aliased request reaches the *same endpoint
 * object* with the same authorisation metadata, rate-limit policy and telemetry.
 * Changing it here would be changing it in one repository only.
 */
export const API_BASE_URL =
  // Overridable so a build can be pointed at a locally running `Diaspora.Api` for
  // runtime validation — on an Android emulator the host is reachable at
  // `http://10.0.2.2:5099/v1`. Written as a static member access rather than a
  // computed lookup so Babel inlines it at build time, the same requirement
  // `config/gap-preview.ts` documents for `EXPO_PUBLIC_ENABLE_GAP_PREVIEW`.
  //
  // ── Why the default is a real host (UAT-001) ───────────────────────────────
  //
  // It used to be `https://api.diaspora.app/v1`, **and that domain has never
  // been registered**. `nslookup` returns NXDOMAIN; `curl` fails to resolve.
  // Because `EXPO_PUBLIC_*` is inlined by Babel at bundle time, the whole
  // `process.env.X || '…'` expression collapses to a single string literal in
  // the artefact — there is no runtime override, no remote config, and no way
  // to repoint a build once it is signed. A store build produced from the
  // `production` profile (which declared `env: {}`) therefore failed every
  // request at DNS resolution: registration, sign-in, discovery, messaging.
  // The application was inert, and nothing in the test suite could see it —
  // Jest never resolves a hostname and the E2E harnesses carry their own base
  // URL.
  //
  // The default is now the deployment that actually answers. Two things keep it
  // honest:
  //
  //   * `eas.json` sets `EXPO_PUBLIC_API_BASE_URL` explicitly on every
  //     distributable profile, so the value is visible at the build boundary
  //     rather than inherited silently from this file.
  //   * `__tests__/api-base-url.test.ts` asserts the two agree, and that
  //     neither is the unregistered host. A default that cannot be reached is a
  //     failing test, not a launch.
  //
  // **When the platform moves to its own domain**, change it here *and* in
  // `eas.json` — the test requires both.
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://diaspora-api.fly.dev/v1';

/**
 * A financial request that hangs for ever is a payment whose outcome nobody
 * ever reconciles. Thirty seconds is generous for a gateway round trip and
 * short enough that the client reaches its "confirming the status" state while
 * the member is still holding the phone.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: REQUEST_TIMEOUT_MS,

  // ── Array query parameters (Wave M-4) ──────────────────────────────────────
  //
  // **Without this, every array-valued query parameter in the application was
  // discarded by the server**, and the response was a 200 carrying the
  // unfiltered set — which each screen then rendered as though it had filtered.
  //
  // Axios 1.x defaults to bracket-and-index notation:
  //
  //     { status: ['A', 'B'] }  ->  ?status%5B%5D=A&status%5B%5D=B
  //
  // ASP.NET binds `string[] statuses` from a **repeated bare key**, so
  // `status[]=A` matches no parameter and the whole filter vanishes. Setting
  // `indexes: null` produces the form it binds:
  //
  //     { status: ['A', 'B'] }  ->  ?status=A&status=B
  //
  // **Scalars are unaffected** — verified rather than assumed, by serialising
  // both forms and comparing. So the change reaches exactly the requests that
  // were already broken, and no others.
  //
  // Known casualties before the fix: the job-application status filter and the
  // notification category and priority filters. A member filtering to
  // "Rejected" saw every application they had ever sent, presented as their
  // rejections.
  //
  // Worth recording how the belief survived: `jobs-hiring-api.ts` carried a
  // comment stating the opposite — *"axios serialises an array as
  // `status=A&status=B`, which is what `string[]? Statuses` binds from"* —
  // sitting directly above the call it was wrong about. A comment asserting a
  // library's behaviour is a claim, and this one had never been run.
  paramsSerializer: { indexes: null },
});

// ─────────────────────────────────────────────────────────────────────────────
// The session bridge
//
// This module knows how to *send* an authenticated request. It deliberately
// knows nothing about how a session is stored, refreshed or ended.
//
// **The dependency is inverted on purpose.** The obvious shape —
// `apiClient.ts` importing `store/auth.ts` — was what the client had, and it
// works only while the token is a plain field that never expires. The moment a
// refresh exists, the session layer needs `apiClient` to make the refresh call,
// and `apiClient` needs the session layer to know what to attach: a cycle whose
// two halves initialise in an order Metro decides.
//
// So the session layer registers itself here instead. `apiClient` imports
// nothing from the auth tree, and a test can drive it with a two-function stub.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthBridge {
  /** The current access token, or null when signed out. Must not do I/O. */
  getAccessToken(): string | null;
  /**
   * Returns a token that is valid *now*, refreshing first if the current one is
   * within the expiry margin. Returns null when there is no session.
   *
   * Proactive refresh is what keeps a long-running screen from producing a
   * visible 401-then-retry stutter on every request after the token lapses.
   */
  ensureFreshToken(): Promise<string | null>;
  /**
   * Called after a 401. Refreshes once and returns the new token, or null if
   * the session is genuinely over. Must be single-flight.
   */
  refreshAfterUnauthorized(): Promise<string | null>;
}

let bridge: AuthBridge | null = null;

/** Installs the session layer. Called once, from `store/auth.ts`. */
export function registerAuthBridge(next: AuthBridge | null): void {
  bridge = next;
}

/**
 * A token valid *now*, for a transport that is not this axios instance.
 *
 * Added in Wave F for the SignalR client, which authenticates through an
 * `accessTokenFactory` rather than through the request interceptor above and so
 * cannot reach `bridge` — which is module-private, deliberately.
 *
 * It delegates to `ensureFreshToken` rather than `getAccessToken` because the
 * factory is called again on every reconnect, and a reconnect after a long
 * background is exactly when the held token has lapsed. Handing SignalR a stale
 * token there produces a negotiate 401 and a connection that retries its way to
 * the same answer.
 *
 * Returns null rather than throwing when there is no session: an unauthenticated
 * transport should decline to connect, not crash the screen that opened it.
 */
export async function accessTokenForTransport(): Promise<string | null> {
  if (!bridge) return null;
  try {
    return await bridge.ensureFreshToken();
  } catch {
    return null;
  }
}

apiClient.interceptors.request.use(async (config) => {
  if (config.skipAuth) return config;
  if (!bridge) return config;

  let token: string | null = null;
  try {
    token = await bridge.ensureFreshToken();
  } catch {
    // A refresh that failed here must not stop the request going out. It will
    // come back 401, the response interceptor will make one more attempt, and
    // the session will end there if it is genuinely over — which keeps the
    // "session ended" decision in exactly one place.
    token = bridge.getAccessToken();
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Records what the last request tells us about the connection, and retries once
 * after a refreshed token.
 *
 * A completed response — of any status — proves the device can reach the API.
 * A failure with no response at all is the only evidence of the opposite, and
 * it is deliberately distinguished from a 500: a server that answers "no" is a
 * server the device can reach.
 *
 * **Nothing here logs a response body.** §21 forbids logging payment
 * information, and an interceptor that logged errors "just for debugging" is
 * exactly how a payment token ends up in a crash report.
 */
apiClient.interceptors.response.use(
  (response) => {
    useConnectivityStore.getState().recordSuccess();
    return response;
  },
  async (error) => {
    if (axios.isAxiosError(error) && !error.response) {
      useConnectivityStore.getState().recordNetworkFailure();
      return Promise.reject(error);
    }

    useConnectivityStore.getState().recordSuccess();

    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const config = error.config as RetryableConfig | undefined;
    if (!config || !bridge || config.skipAuth || config.skipAuthRetry || config.__authRetried) {
      return Promise.reject(error);
    }

    config.__authRetried = true;

    let token: string | null = null;
    try {
      token = await bridge.refreshAfterUnauthorized();
    } catch {
      token = null;
    }

    if (!token) return Promise.reject(error);

    config.headers.Authorization = `Bearer ${token}`;
    return apiClient.request(config as AxiosRequestConfig);
  }
);
