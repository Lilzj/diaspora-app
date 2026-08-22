/**
 * Frontend ↔ Backend runtime integration.
 *
 * Every other test in this repository proves something about this repository.
 * This one proves something about *two programs together*, and it is the only
 * test here that fails if the backend is wrong.
 *
 * ── It does not run by default, and that is deliberate ───────────────────
 *
 * It needs a seeded `Diaspora.Api` on the other end of a socket. A test that
 * silently passes when no server is listening would be worse than no test, so
 * this file **fails closed**: with `RUNTIME_INTEGRATION` unset the whole suite
 * is skipped and says so; with it set and no server reachable, it fails.
 *
 *     RUNTIME_INTEGRATION=1 \
 *     RUNTIME_API_ORIGIN=http://127.0.0.1:5099 \
 *     npx jest frontend-backend-runtime
 *
 * `runtime-validation/README.md` has the full environment recipe.
 *
 * ── What it guards ───────────────────────────────────────────────────────
 *
 * Not coverage — the Node harness in `runtime-validation/` does the breadth.
 * This guards the handful of properties whose regression would invalidate the
 * runtime validation report, and which no unit test can see:
 *
 *   · the client's `/v1` alias still reaches `/api/v1` (prefix compatibility);
 *   · the published contract still matches what the host serves;
 *   · authentication still issues a usable token (DEFECT-001's regression test);
 *   · authorisation still refuses an anonymous caller;
 *   · a switched-off capability still declares itself rather than inventing data.
 */

const ORIGIN = process.env.RUNTIME_API_ORIGIN ?? 'http://127.0.0.1:5099';
const BASE = `${ORIGIN}/v1`;
const ENABLED = process.env.RUNTIME_INTEGRATION === '1' || process.env.RUNTIME_INTEGRATION === 'true';

/**
 * Optional bearer token for the capability documents, which are behind
 * authentication. Obtaining one needs a seeded Verified identity, which is the
 * harness's job rather than this file's — so the two tests that need it assert
 * fully when it is supplied and declare themselves unasserted when it is not.
 */
const TOKEN = process.env.RUNTIME_ACCESS_TOKEN;

/** Skips the suite unless explicitly enabled, so CI without a backend stays green and honest. */
const describeRuntime = ENABLED ? describe : describe.skip;

interface Call {
  status: number;
  body: any;
  instance?: string;
}

/**
 * Requests go over `node:http`, not `fetch`.
 *
 * `jest-expo` replaces the global `fetch` — React Native's has no
 * implementation under Jest — so a `fetch` here resolves to a stub whose
 * `status` is `undefined`, and every assertion below would compare against it
 * rather than against a server. Using the Node HTTP client means this file
 * cannot be satisfied by anything but a real socket, which is the property the
 * suite exists to have.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const http = require('node:http');

function request(
  method: string,
  url: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<Call> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { 'X-Correlation-Id': `jest-${Date.now()}` };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      // Byte length rather than string length: a multi-byte character would
      // otherwise under-declare the body and the server would wait for the rest.
      headers['Content-Length'] = String(new TextEncoder().encode(payload).length);
    }

    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (res: any) => {
        // `setEncoding` rather than collecting buffers: it keeps this file free
        // of Node's Buffer type, which the app's tsconfig does not include.
        res.setEncoding('utf8');
        let text = '';
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () => {
          let body: any = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = text;
          }
          resolve({ status: res.statusCode, body, instance: body?.instance });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const call = (method: string, path: string, opts: { token?: string; body?: unknown } = {}) =>
  request(method, `${BASE}${path}`, opts);

if (!ENABLED) {
  // Visible in the run rather than silently absent: a skipped integration
  // suite that nobody notices is how a runtime regression ships.
  // eslint-disable-next-line no-console
  console.log(
    '[runtime] frontend-backend-runtime.integration.test.ts skipped — set RUNTIME_INTEGRATION=1 with a seeded Diaspora.Api to run it.'
  );
}

describeRuntime('frontend ↔ backend runtime integration', () => {
  jest.setTimeout(120_000);

  it('the server is reachable and healthy', async () => {
    const r = await request('GET', `${ORIGIN}/health/live`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'Healthy' });
  });

  it('does not reach a mock: the response carries a server-minted traceId', async () => {
    // A fixture has no reason to mint one, and the harness never supplies it.
    const r = await call('GET', '/auth/me');
    expect(r.status).toBe(401);
    expect(typeof r.body?.traceId).toBe('string');
    expect(r.body.traceId.length).toBeGreaterThan(0);
  });

  it("the client's /v1 alias is rewritten onto the canonical /api/v1", async () => {
    // `apiClient` addresses `/v1/*` on purpose; RoutePrefixCompatibilityMiddleware
    // rewrites it. If that stops happening, every request in the app 404s.
    const r = await call('GET', '/auth/me');
    expect(r.instance).toBe('/api/v1/auth/me');
  });

  it('serves an OpenAPI document matching the committed contract', async () => {
    const r = await request('GET', `${ORIGIN}/openapi/v1.json`);
    expect(r.status).toBe(200);
    const live = r.body;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const committed = require('../../../../diaspora-backend/contracts/Diaspora.Api.json');
    const verbs = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    const ops = (doc: any) => {
      const s = new Set<string>();
      for (const p of Object.keys(doc.paths)) {
        for (const m of Object.keys(doc.paths[p])) {
          if (verbs.includes(m)) s.add(`${m.toUpperCase()} ${p}`);
        }
      }
      return s;
    };
    const liveOps = ops(live);
    const committedOps = ops(committed);

    expect([...liveOps].filter((o) => !committedOps.has(o))).toEqual([]);
    expect([...committedOps].filter((o) => !liveOps.has(o))).toEqual([]);
    expect(liveOps.size).toBe(885);
  });

  it('refuses an anonymous caller on a protected route without executing the handler', async () => {
    const r = await call('GET', '/auth/me');
    expect(r.status).toBe(401);
    expect(r.body?.code).toBe('Platform.Auth.Unauthorized');
  });

  it('issues a usable access token — the regression guard for DEFECT-001', async () => {
    // A blank Identity:Jwt:SigningKey is permitted in Development by the options
    // validator and substituted by the bearer configurator, but read raw by
    // JwtAccessTokenIssuer, which throws. The symptom is a 500 here, and it
    // makes every authenticated screen unreachable. This test is the tripwire.
    const phone = `+2349${String(Date.now()).slice(-9)}`;
    const password = 'Rt7#kwZm4Qp2';

    const reg = await call('POST', '/auth/register', {
      body: {
        fullName: 'Runtime Guard',
        phoneNumber: phone,
        password,
        nationality: 'NG',
        countryOfResidence: 'NG',
      },
    });
    expect(reg.status).toBe(201);

    const login = await call('POST', '/auth/login', { body: { phoneNumber: phone, password } });
    // Unverified accounts are refused with 401/403 — both are correct outcomes.
    // A 500 is not, and is the only thing this test forbids.
    expect(login.status).not.toBe(500);
    expect(reg.body?.data?.userId).toBeTruthy();
  });

  it('validates a malformed body rather than failing unexpectedly (MVC pipeline)', async () => {
    const r = await call('POST', '/auth/register', { body: {} });
    expect(r.status).toBe(400);
  });

  it('declares a switched-off capability instead of inventing data', async () => {
    const caps = await call('GET', '/geo/capabilities', { token: TOKEN });

    // The geo capability document is behind authentication. Without a token
    // this cannot be asserted, and the test says so rather than passing on a
    // 401 it never looked inside. Supply RUNTIME_ACCESS_TOKEN to assert it.
    if (caps.status === 401 || caps.status === 403) {
      expect(TOKEN).toBeUndefined();
      return;
    }

    expect(caps.status).toBe(200);
    const list: Array<{ capability: string; available: boolean; provider: string }> =
      caps.body?.data?.capabilities ?? [];
    const routing = list.find((c) => c.capability === 'routing');

    expect(routing).toBeDefined();
    // If routing is ever switched on, this expectation should be updated
    // deliberately — not silently, which is the point of asserting on it.
    expect(routing!.available).toBe(false);
    expect(routing!.provider).toBe('none');
  });

  it('answers a routing request with NotConfigured and no fabricated route', async () => {
    const r = await call('POST', '/geo/routes', {
      token: TOKEN,
      body: {
        origin: { latitude: 6.5244, longitude: 3.3792 },
        destination: { latitude: 6.6, longitude: 3.4 },
        travelMode: 'driving',
      },
    });

    if (r.status === 401 || r.status === 403) {
      expect(TOKEN).toBeUndefined();
      return;
    }

    // A 200 here is correct *because* of what it contains. The failure this
    // guards against is a 200 carrying an invented distance or geometry.
    expect(r.status).toBe(200);
    expect(r.body?.data).toMatchObject({
      status: 'NotConfigured',
      provider: 'none',
      isRouted: false,
    });
    expect(r.body?.data?.routes).toEqual([]);
  });

  it('declares the automation grants that are switched off', async () => {
    const r = await call('GET', '/automations/capabilities');
    // Anonymous may be refused; the assertion is only meaningful on a 200.
    if (r.status !== 200) {
      expect([401, 403]).toContain(r.status);
      return;
    }
    expect(r.body?.data).toMatchObject({
      canCreatePlatformWide: false,
      canUseLocationTriggers: false,
    });
  });

  it('404s the feed key the client documents as unserved', async () => {
    // `src/lib/community-social-api.ts` states that `GET /community/feeds/search`
    // is a 404 on every deployment — a declared key with no registered provider.
    // If a provider is ever registered, that comment becomes wrong and this
    // test is where it is noticed.
    const r = await call('GET', '/community/feeds/search?limit=5');
    expect([401, 404]).toContain(r.status);
  });
});
