// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the development-adapter boundary (Frontend Phase 8, §57)
//
// §57's guarantee, asserted rather than assumed: **no simulated map data can
// ship in a production build.**
//
// The mechanism has three layers and each is tested here:
//
//   1. `areMapsGapsEnabled()` is false when `__DEV__` is false and the opt-in
//      environment variable is absent.
//   2. Every function in `maps-gap-api.ts` refuses before making a request, so
//      the guarantee does not depend on a screen remembering to check.
//   3. `setupMapsGapMocks` registers nothing at all, so a call that somehow
//      escaped would 404 at the gateway rather than being answered.
//
// It also asserts the structural claim §2 rests on: that the *search* half of
// this phase is real. `maps-api.ts` talks to certified routes and
// `maps-gap-api.ts` exports nothing that returns a listing, a job, an event or
// an alert.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types`. That change is global: it surfaced pre-existing errors in
// the Phase 5, 7 and 12 test suites, and a phase must not alter the typecheck
// configuration for every other phase in order to compile its own test.
// `require` is deliberately NOT re-declared here: Jest's ambient typing already
// provides it as `any`, and shadowing it with a narrower signature breaks every
// other `require` call in this file.
declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

describe('the simulation switch', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;
  const originalEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = originalEnv;
    jest.resetModules();
  });

  it('is on under Metro', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    jest.resetModules();
    const { areMapsGapsEnabled } = require('@/config/maps-gaps');
    expect(areMapsGapsEnabled()).toBe(true);
  });

  it('is off in a release build with no opt-in', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();
    const { areMapsGapsEnabled } = require('@/config/maps-gaps');
    expect(areMapsGapsEnabled()).toBe(false);
  });

  it('is on in a release build that explicitly opted in', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = '1';
    jest.resetModules();
    const { areMapsGapsEnabled } = require('@/config/maps-gaps');
    expect(areMapsGapsEnabled()).toBe(true);
  });

  it('requires exactly "1", not merely a truthy value', () => {
    // An accidentally-empty assignment is `''` and a mistyped `false` is the
    // string `"false"` — both truthy in the wrong hands.
    (global as { __DEV__?: boolean }).__DEV__ = false;

    for (const value of ['', 'false', 'true', '0', 'yes']) {
      process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = value;
      jest.resetModules();
      const { areMapsGapsEnabled } = require('@/config/maps-gaps');
      expect(areMapsGapsEnabled()).toBe(false);
    }
  });

  it('shares one switch with Phases 5, 6, 7 and 12', () => {
    // Five different answers to "may this build simulate?" would be five things
    // to get wrong.
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = '1';
    jest.resetModules();

    const { areMapsGapsEnabled } = require('@/config/maps-gaps');
    const { areSimulatedFeaturesEnabled } = require('@/config/gap-preview');
    const { areCommunityGapsEnabled } = require('@/config/community-gaps');

    expect(areMapsGapsEnabled()).toBe(areSimulatedFeaturesEnabled());
    expect(areMapsGapsEnabled()).toBe(areCommunityGapsEnabled());
  });
});

describe('the API layer refuses before it requests', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    jest.resetModules();
  });

  it('rejects every simulated read in a production build', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();

    const api = require('@/lib/maps-gap-api');

    const calls: [string, () => Promise<unknown>][] = [
      ['fetchNeighborhoodScore', () => api.fetchNeighborhoodScore('peckham')],
      ['compareNeighborhoods', () => api.compareNeighborhoods(['peckham', 'brixton'])],
      ['fetchCostOfLiving', () => api.fetchCostOfLiving('peckham')],
      ['fetchSafetyScore', () => api.fetchSafetyScore('peckham')],
      ['fetchSavedPlacesPreview', () => api.fetchSavedPlacesPreview()],
    ];

    for (const [name, call] of calls) {
      await expect(call()).rejects.toThrow();
      // Rejected, not resolved-empty. An empty result renders as "there is
      // nothing here", which is a claim about the world; a rejection renders as
      // "not available in this build", which is the true claim.
      try {
        await call();
      } catch (error) {
        expect(api.isMapsGapUnavailable(error)).toBe(true);
        expect((error as Error).message).toMatch(/FRONTEND-MAPS-GAP-\d{3}/);
        expect(name).toBeTruthy();
      }
    }
  });

  it('has no simulated alert area left to fetch, because the area is on the alert', () => {
    // FRONTEND-MAPS-GAP-017 closed 16 Sep 2026: `affectedRadiusMetres` arrives on
    // the post and becomes `CommunityAlert.area`. A simulated area beside the real
    // one would be the client inventing the scope of an emergency again.
    jest.resetModules();
    const api = require('@/lib/maps-gap-api') as Record<string, unknown>;

    expect(api.fetchAlertArea).toBeUndefined();
  });

  it('has no simulated heat layer left, because GET /geo/heatmap serves every layer', () => {
    // FRONTEND-MAPS-GAP-012: all eight layers, a time range and the safety
    // source are served since 20 Oct 2026, and `maps/geo-client.ts` reads them
    // in every build. A simulated layer beside the real one would be a test
    // build showing what production does not.
    jest.resetModules();
    const api = require('@/lib/maps-gap-api') as Record<string, unknown>;

    expect(api.fetchHeatLayer).toBeUndefined();
  });
});

describe('the mock registrar', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    jest.resetModules();
  });

  it('registers nothing in a production build', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();

    const { setupMapsGapMocks } = require('@/mocks/handlers/maps-gaps');

    const handlers: string[] = [];
    const fakeAdapter = {
      onGet: (matcher: unknown) => {
        handlers.push(String(matcher));
        return { reply: () => undefined };
      },
    };

    setupMapsGapMocks(fakeAdapter as never);
    expect(handlers).toHaveLength(0);
  });

  it('registers the simulated routes in a development build', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    jest.resetModules();

    const { setupMapsGapMocks } = require('@/mocks/handlers/maps-gaps');

    const handlers: string[] = [];
    const fakeAdapter = {
      onGet: (matcher: unknown) => {
        handlers.push(String(matcher));
        return { reply: () => undefined };
      },
    };

    setupMapsGapMocks(fakeAdapter as never);

    expect(handlers.length).toBeGreaterThan(0);
    // Every one under the gap prefix, never shadowing a certified route.
    for (const handler of handlers) {
      expect(handler).toContain('maps-gap');
    }
  });
});

describe('the URL space is separate from every certified route', () => {
  it('never uses a certified prefix', () => {
    const { MAPS_GAP_PREFIX } = require('@/config/maps-gaps');

    expect(MAPS_GAP_PREFIX).toBe('/maps-gap/v0');

    for (const certified of [
      '/location',
      '/neighborhood',
      '/housing',
      '/marketplace',
      '/jobs',
      '/listings',
      '/community-life',
      '/financial',
      '/updates',
    ]) {
      expect(MAPS_GAP_PREFIX.startsWith(certified)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRUCTURAL — asserted against the source, because these are claims about what
// the code *cannot* do, and a runtime test cannot prove an absence.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Reads a source file with its comments removed.
 *
 * Stripping comments is not tidiness — it is what makes these assertions mean
 * anything. Both files below document the thing they promise not to do
 * ("there is no `saveSavedPlace` in this file, and its absence is the point"),
 * so a scan of the raw text finds the promise and reports it as a violation.
 * The assertion is about what the code does, so the prose has to go first.
 */
function readSource(relativePath: string): string {
  const raw = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // block and JSDoc comments
    .replace(/^[ \t]*\/\/.*$/gm, ''); // whole-line comments
}

describe('the development arm carries no discovery capability — §2, §31–§37', () => {
  const gapApi = readSource('lib/maps-gap-api.ts');

  it('exports nothing that returns a listing, job, event, organization or alert', () => {
    // The claim §2 rests on: maps are a presentation layer over what already
    // exists. If a future change added `fetchSimulatedHousing` here, the map
    // would quietly stop showing real listings and nobody would notice from the
    // UI, because both arms render identically.
    const forbidden = [
      'searchHousing',
      'searchMarketplace',
      'searchJobs',
      'fetchListings',
      'fetchEvents',
      'fetchOrganizations',
      'fetchGuides',
      'createAlert',
      'publishAlert',
    ];

    for (const name of forbidden) {
      expect(gapApi).not.toContain(`export async function ${name}`);
      expect(gapApi).not.toContain(`export function ${name}`);
    }
  });

  it('has no write path for a saved place', () => {
    // A home address is the most sensitive field this application would ever
    // persist server-side. FRONTEND-MAPS-GAP-011 says it must not be created
    // before a retention policy exists, and the absence of a writer is the
    // enforcement.
    expect(gapApi).not.toContain('saveSavedPlace');
    expect(gapApi).not.toContain('apiClient.post');
    expect(gapApi).not.toContain('apiClient.put');
    expect(gapApi).not.toContain('apiClient.delete');
  });
});

describe('the certified arm talks to certified routes — §2', () => {
  const api = readSource('lib/maps-api.ts');

  it('never reaches the gap prefix', () => {
    expect(api).not.toContain('maps-gap');
    expect(api).not.toContain('MAPS_GAP_PREFIX');
  });

  it('queries the real discovery routes', () => {
    // Remediation Wave A′. Four of the seven routes this test pinned were not
    // real: `/housing` and `/listings` have never been served, `/marketplace` is
    // a dashboard rather than a search, and `/neighborhood/{id}` did not exist.
    //
    // The test passed the whole time because it asserted the *client's source
    // contains a string* — which is true of any string the client happens to
    // contain, including a wrong one. That is the shape of assertion this whole
    // audit was needed to find, and it is why the replacement below also checks
    // the absences.
    for (const route of [
      "'/housing/search'",
      "'/marketplace/search'",
      "'/jobs'",
      "'/providers'",
      "'/community-life/events'",
      "'/community-life/organizations'",
      "'/location/nearby'",
    ]) {
      expect(api).toContain(route);
    }
  });

  it('no longer addresses the routes that were never served', () => {
    for (const absent of ["'/listings'", "`/neighborhood/${", "'/discovery/search'"]) {
      expect(api).not.toContain(absent);
    }
  });
});

describe('analytics never carry a coordinate — §51, §59', () => {
  const analytics = readSource('lib/maps/analytics.ts');

  it('does not allow-list latitude, longitude or any place name', () => {
    // The allow-list is applied at emit, so a property that is not on it is
    // dropped rather than reviewed later. Asserting the *absence* is what keeps
    // a well-meaning addition from slipping through.
    for (const forbidden of [
      "'latitude'",
      "'longitude'",
      "'coordinate'",
      "'address'",
      "'placeName'",
      "'destinationName'",
      "'originName'",
      "'savedLocationLabel'",
      "'userId'",
    ]) {
      expect(analytics).not.toContain(forbidden);
    }
  });

  it('allow-lists the coarse cell instead', () => {
    expect(analytics).toContain("'geoCell'");
  });
});
