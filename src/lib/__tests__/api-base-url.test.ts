// ─────────────────────────────────────────────────────────────────────────────
// The shipped API base URL — the guard for UAT-001
//
// ── What went wrong ──────────────────────────────────────────────────────────
//
// `apiClient.ts` defaulted to `https://api.diaspora.app/v1` and the `production`
// EAS profile declared `"env": {}`. That domain has never been registered, so a
// store build failed **every** request at DNS resolution and the application was
// inert. Registration, sign-in, discovery, messaging — none of it could work.
//
// ── Why nothing caught it ────────────────────────────────────────────────────
//
// `EXPO_PUBLIC_*` is inlined by Babel at bundle time. Jest runs under Node with
// the variable unset, so it sees the same literal a production bundle would —
// and then never resolves a hostname. `tsc` sees a valid string. The E2E
// harnesses in `runtime-validation/` carry their own `RUNTIME_API_ORIGIN` and
// never read this constant at all. Every gate was green while the shipped
// artefact could not reach a server.
//
// So the defect was not "a test was missing coverage of a branch". It was that
// **no test asserted anything about the one value every request depends on**.
// That is what this file exists to fix.
//
// ── What this asserts, and what it deliberately does not ─────────────────────
//
// It does **not** perform DNS or make a request. A unit test that depends on the
// network is a test that fails on a train, gets marked `.skip`, and protects
// nothing. Reachability is a deployment concern and belongs in the release
// checklist.
//
// What it asserts is the part that is knowable from the repository, and that is
// enough to have caught UAT-001 on the commit that introduced it:
//
//   1. The default is not the unregistered host, nor any obvious placeholder.
//   2. It is a syntactically valid absolute `https://` URL.
//   3. Every distributable EAS profile sets `EXPO_PUBLIC_API_BASE_URL`
//      explicitly, so the shipped value is visible at the build boundary rather
//      than inherited silently from a source file.
//   4. Those profile values agree with the default — one host, changed in one
//      commit, not two that drift.
//   5. The path shape is preserved, because `realtimeHubUrl()` derives the
//      SignalR origin from this constant and the media URL in
//      `community-life/org/[id]` concatenates onto it.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE_URL } from '@/lib/apiClient';

// Node globals, declared locally rather than by widening `tsconfig`'s `types`.
// Same pattern as `backend-request-binding-drift.test.ts`, which reads the
// backend repository the same way: the app itself must not see `@types/node`,
// because a React Native bundle has no `fs` and a stray import of one is a
// runtime crash rather than a compile error.
declare const __dirname: string;
declare function require(id: string): any;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

/** The host that was shipped for months and has never resolved. */
const UNREGISTERED_HOST = 'api.diaspora.app';

/**
 * Profiles whose artefacts leave this machine. `development` is excluded: it
 * runs against a dev server or a local `Diaspora.Api`, and pinning it would
 * break the loopback workflow `plugins/with-loopback-cleartext.js` exists for.
 */
const DISTRIBUTABLE_PROFILES = ['preview', 'production'] as const;

const easJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'eas.json'), 'utf8')
) as {
  build: Record<string, { env?: Record<string, string> }>;
};

describe('the shipped API base URL', () => {
  it('is not the unregistered host that made every request fail at DNS', () => {
    expect(API_BASE_URL).not.toContain(UNREGISTERED_HOST);
  });

  it('is not a placeholder', () => {
    for (const placeholder of ['example.com', 'localhost', '127.0.0.1', '10.0.2.2', 'TODO', 'CHANGEME']) {
      expect(API_BASE_URL.toLowerCase()).not.toContain(placeholder.toLowerCase());
    }
  });

  it('is an absolute https URL with a host and no trailing slash', () => {
    const url = new URL(API_BASE_URL);

    expect(url.protocol).toBe('https:');
    expect(url.hostname).not.toBe('');
    // A trailing slash doubles the separator on every request axios composes.
    expect(API_BASE_URL.endsWith('/')).toBe(false);
  });

  it('keeps the version prefix the rest of the client depends on', () => {
    // `realtimeHubUrl()` takes the *origin* of this value and appends
    // `/hubs/realtime`, and `community-life/org/[id]` builds
    // `${API_BASE_URL}/media/{id}/content`. Both break silently if the shape
    // changes, and neither would fail loudly.
    expect(new URL(API_BASE_URL).pathname).toMatch(/^\/(api\/)?v1$/);
  });
});

describe('eas.json', () => {
  it.each(DISTRIBUTABLE_PROFILES)(
    'sets EXPO_PUBLIC_API_BASE_URL explicitly on the %s profile',
    (profile) => {
      // The original defect was an *absence*: `"env": {}` looked deliberate and
      // silently inherited a broken default. Requiring the key means the shipped
      // value is stated at the build boundary, where a reviewer sees it.
      const env = easJson.build[profile]?.env ?? {};

      expect(Object.keys(env)).toContain('EXPO_PUBLIC_API_BASE_URL');
      expect(env.EXPO_PUBLIC_API_BASE_URL).not.toContain(UNREGISTERED_HOST);
    }
  );

  it.each(DISTRIBUTABLE_PROFILES)(
    'agrees with the source default on the %s profile',
    (profile) => {
      // Two places to change is two places to forget. If a deployment moves,
      // this test names the file that was missed.
      expect(easJson.build[profile]?.env?.EXPO_PUBLIC_API_BASE_URL).toBe(API_BASE_URL);
    }
  );
});
