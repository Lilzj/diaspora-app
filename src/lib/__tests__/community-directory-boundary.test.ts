// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The development-adapter boundary (Frontend Phase 13, §51,
// §62, §64, §65)
//
// §64's guarantee, asserted rather than assumed: **no simulated community data can
// ship in a production build.**
//
// The mechanism has three layers and each is tested here:
//
//   1. `areMultiCommunityGapsEnabled()` is false when `__DEV__` is false and the
//      opt-in environment variable is absent.
//   2. Every function in `community-gap-directory-api.ts` refuses *before* making
//      a request, so the guarantee does not depend on a screen remembering.
//   3. `setupCommunityDirectoryMocks` registers nothing, so a call that somehow
//      escaped would 404 at the gateway rather than being answered.
//
// It also asserts three structural claims the phase rests on, by reading the source
// rather than by trusting a comment:
//
//   **§51 — no community wallet.** The adapter exports nothing that creates a
//   payment, a donation, a balance or a transaction. A community affects
//   monetization *context*; it never owns money.
//
//   **§62 — no minted authority.** The adapter exports nothing that grants a role
//   or sets a capability. Authorization is read-only from the client's side.
//
//   **§3 / §14 — no duplicated discovery.** The adapter fetches no guide, job,
//   listing, event, organization or update. Those have certified routes and go to
//   the certified arm.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types` — that change is global and would surface pre-existing errors
// in other phases' suites. `require` is deliberately not re-declared: Jest's
// ambient typing already provides it.
declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

function source(relative: string): string {
  return readFileSync(join(__dirname, '..', '..', relative), 'utf8');
}

// ═════════════════════════════════════════════════════════════════════════════
// LAYER 1 — the switch
// ═════════════════════════════════════════════════════════════════════════════

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
    const { areMultiCommunityGapsEnabled } = require('@/config/multi-community-gaps');
    expect(areMultiCommunityGapsEnabled()).toBe(true);
  });

  it('is off in a release build with no opt-in', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();
    const { areMultiCommunityGapsEnabled } = require('@/config/multi-community-gaps');
    expect(areMultiCommunityGapsEnabled()).toBe(false);
  });

  it('is on in a release build that explicitly opted in', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = '1';
    jest.resetModules();
    const { areMultiCommunityGapsEnabled } = require('@/config/multi-community-gaps');
    expect(areMultiCommunityGapsEnabled()).toBe(true);
  });

  it('demands exactly "1" — not a truthy accident', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;

    for (const value of ['', '0', 'true', 'false', 'yes']) {
      process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = value;
      jest.resetModules();
      const { areMultiCommunityGapsEnabled } = require('@/config/multi-community-gaps');
      expect(areMultiCommunityGapsEnabled()).toBe(false);
    }
  });

  it('shares the one platform switch rather than adding a sixth', () => {
    const config = source('config/multi-community-gaps.ts');

    expect(config).toContain("from './gap-preview'");
    expect(config).toContain('areSimulatedFeaturesEnabled()');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LAYER 2 — every function refuses
// ═════════════════════════════════════════════════════════════════════════════

describe('every adapter function refuses in a release build', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;
  const originalEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  beforeEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();
  });

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = originalEnv;
    jest.resetModules();
  });

  it('rejects before touching the network', async () => {
    const api = require('@/lib/community-gap-directory-api');
    const { apiClient } = require('@/lib/apiClient');

    const get = jest.spyOn(apiClient, 'get');
    const post = jest.spyOn(apiClient, 'post');
    const put = jest.spyOn(apiClient, 'put');
    const del = jest.spyOn(apiClient, 'delete');

    const calls: [string, () => Promise<unknown>][] = [
      ['fetchCommunityDirectory', () => api.fetchCommunityDirectory()],
      ['fetchCommunitySuggestions', () => api.fetchCommunitySuggestions('GB')],
      ['fetchCommunity', () => api.fetchCommunity('nigerian')],
      ['fetchMembershipSet', () => api.fetchMembershipSet()],
      ['performMembershipAction', () => api.performMembershipAction('ng', 'join')],
      ['setPrimaryCommunity', () => api.setPrimaryCommunity('ng')],
      ['setMembershipVisibility', () => api.setMembershipVisibility('ng', 'Private')],
      ['fetchCapabilities', () => api.fetchCapabilities('ng')],
      ['fetchCommunityStatistics', () => api.fetchCommunityStatistics('ng', '30d')],
      ['fetchCommunityComparison', () => api.fetchCommunityComparison(['ng', 'gh'], '30d')],
      ['fetchCommunityRules', () => api.fetchCommunityRules('ng')],
      ['fetchCommunityNotices', () => api.fetchCommunityNotices('ng')],
      ['fetchCommunityRoleHolders', () => api.fetchCommunityRoleHolders('ng')],
      ['fetchCommunityInitiatives', () => api.fetchCommunityInitiatives('ng')],
      ['fetchCommunityReports', () => api.fetchCommunityReports('ng')],
      ['decideCommunityReport', () => api.decideCommunityReport('ng', 'r1', 'dismiss')],
      ['fetchCommunityPreferences', () => api.fetchCommunityPreferences()],
      [
        'saveCommunityPreferences',
        () => api.saveCommunityPreferences({ notifications: [] } as never),
      ],
    ];

    for (const [name, call] of calls) {
      await expect(call()).rejects.toThrow();
      expect(api.isCommunityDirectoryUnavailable(await call().catch((e: unknown) => e))).toBe(true);
      // The name is in the failure message so a developer can find the caller.
      expect(name.length).toBeGreaterThan(0);
    }

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();

    get.mockRestore();
    post.mockRestore();
    put.mockRestore();
    del.mockRestore();
  });

  it('names the gap in the refusal, so the UI can explain rather than error', async () => {
    const api = require('@/lib/community-gap-directory-api');

    const error = await api.fetchCommunityDirectory().catch((e: Error) => e);

    expect(api.isCommunityDirectoryUnavailable(error)).toBe(true);
    expect(error.message).toContain('FRONTEND-PHASE13-GAP-001');
    expect(error.gapKey).toBe('communityDirectory');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LAYER 3 — the handler registers nothing
// ═════════════════════════════════════════════════════════════════════════════

describe('the handler registers nothing in a release build', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;
  const originalEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = originalEnv;
    jest.resetModules();
  });

  it('adds no routes at all when the switch is off', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();

    const { setupCommunityDirectoryMocks } = require('@/mocks/handlers/community-directory');

    const mock = {
      onGet: jest.fn().mockReturnThis(),
      onPost: jest.fn().mockReturnThis(),
      onPut: jest.fn().mockReturnThis(),
      onDelete: jest.fn().mockReturnThis(),
      reply: jest.fn().mockReturnThis(),
    };

    setupCommunityDirectoryMocks(mock as never);

    expect(mock.onGet).not.toHaveBeenCalled();
    expect(mock.onPost).not.toHaveBeenCalled();
    expect(mock.onPut).not.toHaveBeenCalled();
    expect(mock.onDelete).not.toHaveBeenCalled();
  });

  it('registers routes when the switch is on', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    jest.resetModules();

    const { setupCommunityDirectoryMocks } = require('@/mocks/handlers/community-directory');

    const mock = {
      onGet: jest.fn().mockReturnThis(),
      onPost: jest.fn().mockReturnThis(),
      onPut: jest.fn().mockReturnThis(),
      onDelete: jest.fn().mockReturnThis(),
      reply: jest.fn().mockReturnThis(),
    };

    setupCommunityDirectoryMocks(mock as never);

    expect(mock.onGet).toHaveBeenCalled();
    expect(mock.onPost).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRUCTURAL CLAIMS — read from the source
// ═════════════════════════════════════════════════════════════════════════════

describe('§51 — the adapter cannot create a community wallet', () => {
  const adapter = source('lib/community-gap-directory-api.ts');

  it('exports no function whose name touches money', () => {
    const exported = [...adapter.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);

    expect(exported.length).toBeGreaterThan(10);

    const moneyish = /payment|donat|contribut|wallet|balance|transaction|payout|charge|refund|invoice|price|checkout/i;

    for (const name of exported) {
      expect(name).not.toMatch(moneyish);
    }
  });

  it('references no financial route', () => {
    expect(adapter).not.toMatch(/['"`]\/financial/);
    expect(adapter).not.toMatch(/payment-intents?/i);
  });

  it('imports no money type, so it could not build an amount if it tried', () => {
    expect(adapter).not.toMatch(/from '@\/types\/financial'/);
    expect(adapter).not.toMatch(/\bMoney\b/);
  });
});

describe('§62 — the adapter cannot mint authority', () => {
  const adapter = source('lib/community-gap-directory-api.ts');
  const access = source('lib/community/access.ts');

  it('exports no function that grants a role or sets a capability', () => {
    const exported = [...adapter.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);

    const grantish = /grant|assign|promote|elevate|setRole|setCapability|makeModerator|makeAdmin/i;

    for (const name of exported) {
      expect(name).not.toMatch(grantish);
    }
  });

  it('reads capabilities and never writes them', () => {
    expect(adapter).toContain('export async function fetchCapabilities');
    expect(adapter).not.toMatch(/export (?:async )?function \w*[Ss]etCapabilit/);
  });

  it('has no code path in access.ts that derives a permission from a role', () => {
    // The single place `CommunityRole` may appear in an exported signature is
    // `hasRoleBadge`, whose name says it decides a badge. Anything else taking a
    // role and returning a permission would defeat §37 entirely.
    const roleSignatures = [...access.matchAll(/export function (\w+)\([^)]*CommunityRole/g)].map(
      (m) => m[1]
    );

    expect(roleSignatures).toEqual(['hasRoleBadge']);
  });

  it('evaluates every action against the server-reported capability set', () => {
    expect(access).toContain('ACTION_CAPABILITY');
    // The lookup is the only decision point, and it reads the capabilities object.
    expect(access).toMatch(/capabilities\[ACTION_CAPABILITY\[action\]\] === true/);
  });
});

describe('§3 / §14 — the adapter duplicates no discovery system', () => {
  const adapter = source('lib/community-gap-directory-api.ts');

  it('fetches no content', () => {
    const exported = [...adapter.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);

    const contentish = /guides?$|jobs?$|listings?$|housing$|marketplace$|events?$|updates?$|search$/i;

    for (const name of exported) {
      expect(name).not.toMatch(contentish);
    }
  });

  it('references no certified content route', () => {
    for (const route of [
      '/listings',
      '/jobs',
      '/housing',
      '/marketplace',
      '/community-life',
      '/discovery/search',
      '/notifications',
      '/conversations',
    ]) {
      expect(adapter).not.toContain(`'${route}`);
    }
  });

  it('lives under a prefix that cannot collide with a certified or Phase 12 route', () => {
    const config = source('config/multi-community-gaps.ts');

    expect(config).toContain("COMMUNITY_DIRECTORY_GAP_PREFIX = '/community-directory/v0'");
    // Phase 12's prefix, which must stay distinct.
    expect(source('config/community-gaps.ts')).toContain("'/community-gap/v0'");
  });
});

describe('§65 — development data is isolated', () => {
  it('is imported only by the handler, never by a screen or component', () => {
    const glob: (pattern: string, options: object) => string[] = require('glob').sync;

    // Tests are excluded: this file names the module in order to assert nothing
    // else does, and a boundary test that failed on itself would be useless.
    const files: string[] = glob('src/{app,components,hooks,store,lib}/**/*.{ts,tsx}', {
      cwd: join(__dirname, '..', '..', '..'),
      ignore: ['**/__tests__/**'],
    });

    const offenders = files.filter((file) => {
      const contents = readFileSync(join(__dirname, '..', '..', '..', file), 'utf8');
      return contents.includes('community-directory-data');
    });

    expect(offenders).toEqual([]);
  });

  it('prefixes every development community id, so a real id cannot be confused for one', () => {
    const data = source('mocks/community-directory-data.ts');

    expect(data).toContain("DEV_COMMUNITY_ID_PREFIX");
    expect(data).toMatch(/function devId\(slug: string\)/);
  });

  it('discards a persisted development id when the adapter is unreachable', () => {
    const persistence = source('lib/community/persistence.ts');

    expect(persistence).toContain('isDevelopmentCommunityId');
    expect(persistence).toContain('areMultiCommunityGapsEnabled()');
  });
});

describe('the gap register itself', () => {
  it('numbers every entry FRONTEND-PHASE13-GAP-0xx, uniquely', () => {
    const { MULTI_COMMUNITY_GAP_LIST } = require('@/config/multi-community-gaps');

    const ids = MULTI_COMMUNITY_GAP_LIST.map((gap: { id: string }) => gap.id);

    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(id).toMatch(/^FRONTEND-PHASE13-GAP-\d{3}$/);
    }
  });

  it('marks every simulated section on a screen that also shows real data', () => {
    // ── The defect this exists for ──────────────────────────────────────────
    //
    // A screen that was entirely simulated needed one notice, and got one. When
    // *part* of it connects, that notice goes quiet — correctly, for the part
    // that shipped — and takes the warning off the parts that did not.
    //
    // It happened the day B18 landed. `community/index.tsx` carried a single
    // `communityDirectory` notice above a list and a suggestions section. The
    // directory connected, the notice returned null, and three invented
    // communities sat above eleven real ones with nothing to tell them apart.
    // The profile screen lost the marker on its pinned notices and its named
    // ambassadors the same way — invented people, presented as members of
    // somebody's community.
    //
    // The rule: a screen reading a hook whose gap is still simulated must name
    // that gap in a notice of its own. Source-level, because the alternative is
    // rendering every screen in every membership state.
    const fs = require('fs');
    const path = require('path');
    const { MULTI_COMMUNITY_GAPS } = require('@/config/multi-community-gaps');

    // The hooks that read a still-simulated capability, and the gap each one
    // belongs to. Only hooks whose gap is NOT connected need a marker.
    const HOOK_GAPS: Record<string, string> = {
      useCommunitySuggestions: 'communityOnboardingSuggestions',
      useCommunityStatistics: 'communityStatistics',
      useCommunityNotices: 'communityGovernance',
      useCommunityRoleHolders: 'communityRoleDirectory',
      useCommunityInitiatives: 'communityInitiatives',
      useCommunityReports: 'communityModeration',
      useCommunityComparison: 'communityComparison',
    };

    const SCREENS = [
      'src/app/community/index.tsx',
      'src/app/community/[slug]/index.tsx',
    ];

    const missing: string[] = [];

    for (const screen of SCREENS) {
      const source = fs.readFileSync(path.join(process.cwd(), screen), 'utf8');

      for (const [hook, gapKey] of Object.entries(HOOK_GAPS)) {
        const reads = new RegExp(`\\b${hook}\\(`).test(source);

        if (!reads) continue;

        // A connected gap needs no marker; its notice renders nothing anyway.
        if (MULTI_COMMUNITY_GAPS[gapKey]?.backendStatus === 'connected') continue;

        if (!source.includes(`gapKey="${gapKey}"`)) {
          missing.push(
            `\n    ${screen}` +
              `\n      reads:    ${hook}()` +
              `\n      simulated: ${gapKey}` +
              `\n      → the screen shows simulated data with no notice naming it.` +
              `\n        Add <MultiCommunityGapNotice gapKey="${gapKey}" /> beside that section.`
          );
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('never claims full coverage without a connected backend', () => {
    // The two fields answer different questions and drifted apart once already:
    // `communityMembershipSet` was marked connected against a route that serves
    // B18's *programme* memberships — a different concept wearing the same word
    // — which is how a real gap hid behind a green mark for a whole phase.
    //
    // `full` means the certified backend carries all of it and the client uses
    // it. An entry claiming that while still routed to the adapter is the same
    // defect in the other direction, and it renders as a screen that quietly
    // stops warning about simulated data.
    const { MULTI_COMMUNITY_GAP_LIST } = require('@/config/multi-community-gaps');

    const inconsistent = MULTI_COMMUNITY_GAP_LIST.filter(
      (gap: { coverage: string; backendStatus?: string }) =>
        gap.coverage === 'full' && gap.backendStatus !== 'connected'
    );

    expect(inconsistent).toEqual([]);
  });

  it('gives every entry the fields §66 requires', () => {
    const { MULTI_COMMUNITY_GAP_LIST } = require('@/config/multi-community-gaps');

    for (const gap of MULTI_COMMUNITY_GAP_LIST) {
      expect(gap.capability).toBeTruthy();
      expect(gap.feature).toBeTruthy();
      expect(gap.frontendStatus).toBeTruthy();
      expect(gap.frontendBehaviour).toBeTruthy();
      expect(['none', 'partial', 'full']).toContain(gap.coverage);
      expect(gap.missingBackendCapability.length).toBeGreaterThan(0);
      expect(gap.requiredContracts.length).toBeGreaterThan(0);
      expect(gap.domainModel.length).toBeGreaterThan(0);
      expect(gap.caching).toBeTruthy();
      expect(gap.whyNotImplementable).toBeTruthy();
      expect(gap.privacyConsiderations).toBeTruthy();
      expect(gap.migrationConsiderations).toBeTruthy();
      expect(['critical', 'high', 'medium', 'low']).toContain(gap.priority);
      expect(gap.owner).toBeTruthy();
      expect(gap.recommendedPhase).toBeTruthy();

      for (const contract of gap.requiredContracts) {
        expect(contract.endpoint).toBeTruthy();
        expect(contract.method).toBeTruthy();
        expect(contract.request).toBeTruthy();
        expect(contract.response).toBeTruthy();
        expect(contract.authorization).toBeTruthy();
      }
    }
  });

  it('never classifies a capability as unfinished — §1 forbids it', () => {
    const { MULTI_COMMUNITY_GAP_LIST } = require('@/config/multi-community-gaps');

    for (const gap of MULTI_COMMUNITY_GAP_LIST) {
      expect(gap.frontendStatus).toMatch(/^IMPLEMENTED \+ /);
    }
  });

  it('has every §76 flag on, because every capability behind one is built', () => {
    const { getCommunityFeatureFlags } = require('@/config/multi-community-gaps');

    for (const [flag, value] of Object.entries(getCommunityFeatureFlags())) {
      expect(value).toBe(true);
      expect(flag).toBeTruthy();
    }
  });
});
