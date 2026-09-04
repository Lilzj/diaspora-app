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
// `backend-openapi-contract-drift` should have been the net and was not.
// `contracts/Diaspora.Api.json` has 813 paths and not one advertising route, so
// that check has been blind to everything B16 added since the day it shipped.
// That staleness is worth fixing on its own; this file does not depend on it,
// and reads the enum out of the backend source instead.
// ─────────────────────────────────────────────────────────────────────────────

import { CAMPAIGN_OBJECTIVES } from '@/types/monetization-gaps';

declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

function resolveBackendSourceRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(__dirname, '..', '..', '..', '..', 'diaspora-backend');

  const sourceRoot = join(candidate, 'src');
  return existsSync(sourceRoot) ? sourceRoot : null;
}

const BACKEND_SOURCE_ROOT = resolveBackendSourceRoot();

const ENUM_FILE = BACKEND_SOURCE_ROOT
  ? join(
      BACKEND_SOURCE_ROOT,
      'Diaspora.Modules.Financial',
      'Domain',
      'Advertising',
      'AdCampaignEnums.cs'
    )
  : null;

const describeWhenBackendPresent = ENUM_FILE && existsSync(ENUM_FILE) ? describe : describe.skip;

describeWhenBackendPresent('the advertising vocabulary matches the server', () => {
  const source = readFileSync(ENUM_FILE as string, 'utf8');

  /** The member names of a C# enum, ignoring doc comments and assigned values. */
  function enumMembers(name: string): string[] {
    const body = new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
    if (!body) return [];

    return body[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('/'))
      .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|,|$)/.exec(line)?.[1])
      .filter((member): member is string => Boolean(member));
  }

  it('parses the enum at all', () => {
    // Guards the guard. Every assertion below compares against this list, and an
    // empty one would make "the client sends nothing the server rejects" true by
    // vacuity — which is how a drift check goes quietly blind after a rename or
    // a file move on the other side.
    const members = enumMembers('AdCampaignObjective');
    expect(members.length).toBeGreaterThan(2);
    expect(members).toContain('Awareness');
  });

  it('offers no objective the server would refuse', () => {
    const server = enumMembers('AdCampaignObjective');

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
    const server = enumMembers('AdCampaignObjective');

    const missing = server.filter(
      (member) =>
        !CAMPAIGN_OBJECTIVES.some(
          (objective) => String(objective).toLowerCase() === member.toLowerCase()
        )
    );

    expect(missing).toEqual([]);
  });
});
