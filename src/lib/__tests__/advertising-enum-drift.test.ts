// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the client's advertising vocabulary against the server's
//
// ── The defect this exists for ──────────────────────────────────────────────
//
// The campaign builder offered six objectives. The server's `AdCampaignObjective`
// has four, the client sends the value unmapped, and `ReadObjective` refuses
// anything it cannot parse with `ObjectiveUnknown` — there is no fallback. Only
// `Awareness` and `Traffic` existed on both sides, so **four of the six entry
// points into the advertising flow failed at create**, and the two that worked
// were the first two in the list.
//
// Everything was green. 4,637 client tests, a clean typecheck, 1,414 backend
// integration tests, and a deployment verified route by route. The mismatch was
// invisible because both sides were internally consistent and nothing compared
// them: the client's own contract test asserts the value it sends round-trips
// through its own mapper, which it does — into a string the server rejects.
//
// `backend-openapi-contract-drift` should have been the net and was not — but
// not because the contract is stale. `contracts/Diaspora.Api.json` is regenerated
// by every build of `Diaspora.Api` and carried all seventeen advertising routes
// the whole time. That diagnosis was wrong, and the way it was reached is worth
// recording: a filtered path list was printed `[:5]`, `targeting` fell outside
// the slice, and its absence from truncated output was read as absence from the
// document.
//
// The real fault was that the contract could not express what was wrong.
// `CreateAdCampaignRequest` declares `public string? Objective` — deliberately,
// so the handler can parse case-insensitively and answer `ObjectiveUnknown`
// instead of the model binder's 400 — and the document therefore described it as
// `{"type": ["null", "string"]}`. The four legal values lived only in C#, so no
// consumer and no check could learn them from the published interface.
//
// `OpenApiEnumValuesAttribute` puts them there without changing how anything
// binds, so this file now reads the contract a consumer would actually read,
// rather than regex-parsing the server's source.
// ─────────────────────────────────────────────────────────────────────────────

import { CAMPAIGN_OBJECTIVES } from '@/types/monetization-gaps';
import { backendSourceRoot } from './support/backend-checkout';

declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

// The backend checkout is located by `support/backend-checkout`, which is
// also where the rule lives: not configured and absent is a skip, configured
// and absent is a failure. Eleven suites resolved this separately until
// 11 November 2026; FBL-001 is what that cost.
const BACKEND_SOURCE_ROOT = backendSourceRoot();

/** The published contract, one directory up from `src/`. */
const CONTRACT_FILE = BACKEND_SOURCE_ROOT
  ? join(BACKEND_SOURCE_ROOT, '..', 'contracts', 'Diaspora.Api.json')
  : null;

const describeWhenBackendPresent =
  CONTRACT_FILE && existsSync(CONTRACT_FILE) ? describe : describe.skip;

describeWhenBackendPresent('the advertising vocabulary matches the server', () => {
  // Read in `beforeAll`, never in the describe body. Jest runs a skipped
  // describe's body to collect its tests, so a read here ran with no backend
  // checkout — `readFileSync(null)` — and failed the whole file in CI instead
  // of skipping it.
  let contract: {
    components?: { schemas?: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
  } = {};
  beforeAll(() => {
    contract = JSON.parse(readFileSync(CONTRACT_FILE as string, 'utf8')) as typeof contract;
  });

  /** The values the contract says a property will accept. */
  function enumMembers(schemaName: string, property: string): string[] {
    return contract.components?.schemas?.[schemaName]?.properties?.[property]?.enum ?? [];
  }

  it('publishes the objective values at all', () => {
    // Guards the guard. Every assertion below compares against this list, and an
    // empty one would make "the client sends nothing the server rejects" true by
    // vacuity — which is exactly the state the contract was in before
    // `OpenApiEnumValuesAttribute`: the property was published as a bare string
    // and this check would have passed against any list whatsoever.
    const members = enumMembers('CreateAdCampaignRequest', 'objective');
    expect(members.length).toBeGreaterThan(2);
    expect(members).toContain('Awareness');
  });

  it('offers no objective the server would refuse', () => {
    const server = enumMembers('CreateAdCampaignRequest', 'objective');

    // `ReadObjective` parses case-insensitively and then checks `Enum.IsDefined`.
    const refused = CAMPAIGN_OBJECTIVES.filter(
      (objective) =>
        !server.some((member) => member.toLowerCase() === String(objective).toLowerCase())
    );

    expect(refused).toEqual([]);
  });

  it('offers every objective the server can judge', () => {
    // The other direction, and not merely tidiness: `Engagement` existed on the
    // server and was absent from the builder, so a campaign that the platform
    // could measure could not be created.
    const server = enumMembers('CreateAdCampaignRequest', 'objective');

    const missing = server.filter(
      (member) =>
        !CAMPAIGN_OBJECTIVES.some(
          (objective) => String(objective).toLowerCase() === member.toLowerCase()
        )
    );

    expect(missing).toEqual([]);
  });
});
