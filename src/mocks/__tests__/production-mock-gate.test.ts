// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the production mock gate (Remediation · Rule 5 · §6)
//
// ── The defect this test is the memory of ────────────────────────────────────
//
// `app/_layout.tsx` called `initMocks()` at module scope, unconditionally. Every
// `*-gap` handler guarded itself, so no *simulated* surface leaked. The **core**
// handlers — auth, housing, marketplace, jobs, community life and two dozen
// others — had no guard at all.
//
// A production binary therefore answered every route with a registered handler
// from a fixture before the request reached the backend. `POST /auth/register`
// included: a member could create an account that existed only on their phone,
// be handed a token no server issued, and browse a catalogue of seed listings
// believing it was the platform.
//
// ── Why the test is the deliverable, not the fix ─────────────────────────────
//
// The fix is four lines. The reason it stays fixed is this file. The defect was
// not "somebody wrote a mock" — it was that registering a handler and shipping
// it to production were the same act, and nothing anywhere said otherwise. The
// thirty-first handler will be added by somebody who has not read
// `mocks/index.ts`'s header, and the only thing that will notice is a test.
//
// So these assertions are deliberately about the *shape* of the code as much as
// its behaviour. A behavioural test proves the handlers registered today are
// gated today. The structural ones prove the gate cannot be walked around by
// adding a handler above it, which is the property that has to survive the
// people who come next.
//
// ── Three builds ─────────────────────────────────────────────────────────────
//
//   development   `__DEV__` true.  Must behave exactly as it always has.
//   internal-test `__DEV__` false + EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1. Must still
//                 mock, or every internal APK becomes untestable.
//   production    `__DEV__` false, no flag. Must register nothing at all.
//
// Each is loaded in its own module registry, because the gate is evaluated at
// **import** time — `new MockAdapter(apiClient)` reassigns
// `apiClient.defaults.adapter` inside its constructor, so a test that only
// re-called `initMocks()` would be testing a decision that had already been made.
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type MockAdapter from 'axios-mock-adapter';

// `require`d locally with the narrowest possible signature rather than
// `import fs from 'fs'`. Adding `"node"` to `tsconfig.json`'s `types` array
// shadows the ambient React Native `__DEV__` declaration and breaks twenty
// assertions in Phases 5, 6 and 12 — the same technique, and the same reason, as
// `lib/__tests__/automation-boundary.test.ts`.
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/**
 * Source with its comments removed.
 *
 * `mocks/index.ts` explains this defect at length in prose, naming
 * `setupAuthMocks` and `new MockAdapter` in the course of explaining why they
 * are gated. A naive `toContain` would match the explanation and the structural
 * assertions below would pass — or fail — on the comment rather than the code.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function readSource(...segments: string[]): string {
  return withoutComments(fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading the module graph as a particular kind of build
// ─────────────────────────────────────────────────────────────────────────────

type BuildKind = 'development' | 'internal-test' | 'production';

interface LoadedBuild {
  /** The `apiClient` instance from *this* build's module registry. */
  apiClient: AxiosInstance;
  /** `null` when the build may not simulate. That is the whole assertion. */
  mockApi: MockAdapter | null;
  /**
   * The transport installed before `@/mocks` was imported, and still the
   * adapter afterwards if — and only if — nothing hijacked the client.
   */
  transport: jest.Mock<Promise<AxiosResponse>, [InternalAxiosRequestConfig]>;
  adapterAfterInit: unknown;
  logs: string[];
  warnings: string[];
}

/**
 * Loads `@/lib/apiClient` and `@/mocks` fresh, with `__DEV__` and the preview
 * flag set as the named build has them.
 *
 * The flags are restored before returning, which is safe precisely because the
 * gate is read once at import: by the time this function returns, the build has
 * already made its decision and cannot un-make it. Restoring them matters
 * because `jest.setup.js` sets `__DEV__ = true` for the whole suite and leaving
 * it false would silently change every test that ran afterwards.
 *
 * The same shape as `withReleaseBuild` in
 * `lib/__tests__/automation-boundary.test.ts`, extended to the third build the
 * gate distinguishes.
 */
function loadBuild(kind: BuildKind): LoadedBuild {
  const globals = globalThis as { __DEV__?: boolean };
  const previousDev = globals.__DEV__;
  const previousEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  globals.__DEV__ = kind === 'development';
  if (kind === 'internal-test') {
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = '1';
  } else {
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
  }

  const logs: string[] = [];
  const warnings: string[] = [];
  const log = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });

  let loaded: LoadedBuild | null = null;

  try {
    jest.isolateModules(() => {
      const { apiClient } = require('@/lib/apiClient') as { apiClient: AxiosInstance };

      // A stand-in for the network, installed *before* `@/mocks` is imported.
      //
      // This is what makes "reaches the backend" observable rather than
      // inferred. Asserting that a request fails would prove nothing — a
      // fixture 404 and a real 404 are the same object — so instead the real
      // transport is made identifiable, and the question becomes whether the
      // request arrived at it.
      const transport = jest.fn((config: InternalAxiosRequestConfig) =>
        Promise.resolve<AxiosResponse>({
          data: { reachedTheBackend: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        })
      );
      apiClient.defaults.adapter = transport;

      const mocks = require('@/mocks') as {
        mockApi: MockAdapter | null;
        initMocks: () => void;
      };
      mocks.initMocks();

      loaded = {
        apiClient,
        mockApi: mocks.mockApi,
        transport,
        adapterAfterInit: apiClient.defaults.adapter,
        logs,
        warnings,
      };
    });
  } finally {
    log.mockRestore();
    warn.mockRestore();
    globals.__DEV__ = previousDev;
    if (previousEnv !== undefined) {
      process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = previousEnv;
    } else {
      delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    }
  }

  if (loaded === null) throw new Error('the module graph did not load');
  return loaded;
}

/**
 * One route from each of the five core handler families the brief names — the
 * ones that had no build guard of any kind.
 *
 * Real paths, taken from the handlers themselves rather than invented, because
 * the development half of each pair has to actually match a registered pattern.
 * A typo would make the production assertion pass for the wrong reason: an
 * unmatched path reaches the transport in every build.
 */
const CORE_ROUTES: { name: string; call: (client: AxiosInstance) => Promise<AxiosResponse> }[] = [
  {
    // The one that matters most, and the reason this is the most consequential
    // fix in the remediation: registration answered from `mocks/auth-session.ts`
    // is an account the backend has never heard of.
    name: 'POST /auth/register',
    call: (client) => client.post('/auth/register', { phoneNumber: '+23057000111' }),
  },
  { name: 'GET /housing/search', call: (client) => client.get('/housing/search') },
  { name: 'GET /marketplace', call: (client) => client.get('/marketplace') },
  { name: 'GET /jobs', call: (client) => client.get('/jobs') },
];

/**
 * Served routes that no build may answer from a fixture, development and
 * internal test builds included.
 *
 * Community Life's events were in CORE_ROUTES, asserted as "answered by its
 * fixture" in development. That was the defect, pinned: in every dev and preview
 * build, Publish answered "Event created" from `handlers/community-life.ts` and
 * nothing reached the server, so production had 0 events when one was first
 * posted from the emulator (5 Oct 2026). The handler is no longer registered in
 * the app; these keep it that way.
 */
const ALWAYS_REAL_ROUTES: { name: string; call: (client: AxiosInstance) => Promise<unknown> }[] = [
  { name: 'GET /community-life/events', call: (client) => client.get('/community-life/events') },
  {
    name: 'POST /community-life/events',
    call: (client) => client.post('/community-life/events', { title: 'x' }),
  },
  {
    name: 'GET /community-life/organizations',
    call: (client) => client.get('/community-life/organizations'),
  },
  // Added 6 Oct 2026: the automation mock answered "Remind me" and nothing was stored.
  {
    name: 'GET /automations/reminders',
    call: (client) => client.get('/automations/reminders', { params: { subjectKind: 'event', subjectId: 'e1' } }),
  },
  {
    name: 'POST /automations/reminders',
    call: (client) => client.post('/automations/reminders', { subjectKind: 'event', subjectId: 'e1' }),
  },
  { name: 'GET /automations', call: (client) => client.get('/automations') },
];

/** Sends a request and reports whether the real transport received it. */
async function reachesTransport(
  build: { apiClient: AxiosInstance; transport: jest.Mock },
  call: (client: AxiosInstance) => Promise<unknown>
): Promise<boolean> {
  build.transport.mockClear();
  await call(build.apiClient).catch(() => undefined);
  return build.transport.mock.calls.length > 0;
}

// ═════════════════════════════════════════════════════════════════════════════

describe('Rule 5 · §6 — a production build registers no mock handler', () => {
  let build: LoadedBuild;

  beforeAll(() => {
    build = loadBuild('production');
  });

  it('constructs no mock adapter at all', () => {
    // Not "constructs one that declines". The adapter's constructor *is* the
    // hijack, so the only safe answer is that it was never built.
    expect(build.mockApi).toBeNull();
  });

  it('leaves the real axios transport bolted to apiClient', () => {
    // If this fails, `apiClient` is being served by axios-mock-adapter with no
    // handlers registered — whose default `onNoMatch` is a fabricated **404**,
    // not a passthrough. That is strictly worse than the defect being fixed,
    // and it is what a guard placed only inside `initMocks()` would produce.
    expect(build.adapterAfterInit).toBe(build.transport);
  });

  it.each(CORE_ROUTES)('$name reaches the backend rather than a fixture', async ({ call }) => {
    build.transport.mockClear();

    const response = await call(build.apiClient);

    expect(build.transport).toHaveBeenCalledTimes(1);
    expect(response.data).toEqual({ reachedTheBackend: true });
  });

  it('says so in the log rather than going quiet', () => {
    // §6: a production capability must not silently fall back — and the
    // converse, a build that silently stopped mocking, is the same failure read
    // from the other end. "Sign-in does nothing" is the bug report either
    // produces, and the startup log is the first thing anyone reads.
    const line = build.logs.find((entry) => entry.includes('[MOCK]'));

    expect(line).toBeDefined();
    expect(line).toMatch(/production build/i);
    expect(line).toMatch(/real backend/i);
  });

  it('does not warn, because there is nothing to warn about', () => {
    // The loud warning belongs to the internal test build. A production build
    // that shouted would teach everyone to ignore the shouting.
    expect(build.warnings.filter((entry) => entry.includes('[MOCK]'))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('development is unchanged', () => {
  let build: LoadedBuild;

  beforeAll(() => {
    build = loadBuild('development');
  });

  it('installs the mock adapter', () => {
    expect(build.mockApi).not.toBeNull();
    expect(build.adapterAfterInit).not.toBe(build.transport);
  });

  it.each(CORE_ROUTES)('$name is answered by its fixture', async ({ call }) => {
    build.transport.mockClear();

    const response = await call(build.apiClient);

    // The request never reached the transport, which is the whole of "mocked".
    expect(build.transport).not.toHaveBeenCalled();
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });

  it.each(ALWAYS_REAL_ROUTES)('$name reaches the backend even here', async ({ call }) => {
    expect(await reachesTransport(build, call)).toBe(true);
  });

  it('registration still answers 201 from the fixture', async () => {
    const response = await build.apiClient.post('/auth/register', {
      phoneNumber: '+23057000111',
    });

    expect(response.status).toBe(201);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('an internal test build still simulates', () => {
  let build: LoadedBuild;

  beforeAll(() => {
    build = loadBuild('internal-test');
  });

  it('installs the mock adapter on the strength of the opt-in alone', () => {
    // `__DEV__` is false here. Without this, `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`
    // would produce an APK whose gap screens render their notices and their
    // controls over a backend that answers none of them — every Phase 5, 6, 7
    // and 12 surface enabled and broken, which is worse than either extreme.
    expect(build.mockApi).not.toBeNull();
    expect(build.adapterAfterInit).not.toBe(build.transport);
  });

  it.each(CORE_ROUTES)('$name is answered by its fixture', async ({ call }) => {
    build.transport.mockClear();

    await call(build.apiClient);

    expect(build.transport).not.toHaveBeenCalled();
  });

  it.each(ALWAYS_REAL_ROUTES)('$name reaches the backend even here', async ({ call }) => {
    expect(await reachesTransport(build, call)).toBe(true);
  });

  it('warns loudly, and names authentication specifically', () => {
    const warning = build.warnings.find((entry) => entry.includes('INTERNAL TEST BUILD'));

    expect(warning).toBeDefined();
    expect(warning).toContain('EXPO_PUBLIC_ENABLE_GAP_PREVIEW');
    // The part that is new, and the part a release manager needs: this is no
    // longer only about simulated gap surfaces. The whole API is fixtures,
    // sign-in included, and an account created in this build is not real.
    expect(warning).toMatch(/auth\/register|sign-in/i);
    expect(warning).toMatch(/release/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The structural half — the part that survives the next handler
// ═════════════════════════════════════════════════════════════════════════════

describe('the gate cannot be walked around by adding a handler', () => {
  const source = readSource('src', 'mocks', 'index.ts');

  it('the adapter is constructed conditionally, never unconditionally', () => {
    // The exact line that was the defect:
    //     export const mockApi = new MockAdapter(apiClient, …)
    expect(source).not.toMatch(/export const mockApi(\s*:[^=]*)?\s*=\s*new MockAdapter/);
    expect(source).toContain('areSimulatedFeaturesEnabled()');
  });

  it('every handler registration sits after the guard', () => {
    // The property, stated as a position: a `setup…Mocks(` call that appeared
    // above the null check would be a handler registering in production, and it
    // is exactly the mistake a hurried addition makes. It is checked rather
    // than trusted because the file is 400 lines long and the guard is four of
    // them.
    const guard = source.indexOf('if (mockApi === null)');
    expect(guard).toBeGreaterThan(-1);

    const registrations = [...source.matchAll(/\bsetup[A-Za-z]*Mocks\(mockApi\)/g)];
    // A sanity floor: if this ever matches nothing, the assertion below would
    // pass vacuously while the file registered thirty handlers.
    expect(registrations.length).toBeGreaterThan(20);

    for (const match of registrations) {
      expect({ call: match[0], afterGuard: match.index! > guard }).toEqual({
        call: match[0],
        afterGuard: true,
      });
    }
  });

  it('the type itself forces the check', () => {
    // `MockAdapter | null` is not documentation. It is why a new
    // `setupWhateverMocks(mockApi)` added above the guard fails to compile
    // rather than shipping — the comment explains the rule, the type enforces
    // it, and only one of those two is checked on every build.
    expect(source).toMatch(/export const mockApi:\s*MockAdapter\s*\|\s*null/);
  });

  it('the call site does not pretend to be a second gate', () => {
    const layout = readSource('src', 'app', '_layout.tsx');

    // `import { initMocks } from '@/mocks'` is a static import: its side
    // effects — including the adapter construction — run whether or not the
    // call below is reached. An `if` here would look like a defence and be
    // none, and a reader who found one would reasonably stop looking for the
    // real gate. So the call stays unconditional and the gate stays in one
    // place.
    expect(layout).toContain('initMocks();');
    expect(layout).not.toMatch(/if\s*\([^)]*\)\s*\{?\s*initMocks\(\)/);
  });
});
