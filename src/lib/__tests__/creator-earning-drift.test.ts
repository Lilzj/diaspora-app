// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the client's earnings vocabulary against the server's
//
// ── The defect this exists for ──────────────────────────────────────────────
//
// `CREATOR_REVENUE_SOURCES` listed ten values. The server's `CreatorEarningSource`
// has four. Six of the ten — `RewardConversion`, `Contribution`, `Grant`,
// `Challenge`, `Milestone`, `Other` — had no source anywhere on the platform, so a
// revenue screen offering "Grants" as a filter would have returned an empty list
// for ever. And the one that did exist was spelled differently on each side:
// `SponsoredContent` here, `Sponsorship` there.
//
// This is the campaign-objective mismatch, exactly. That one shipped six
// objectives against four and four of them failed at create, and it was invisible
// because both sides were internally consistent and nothing compared them.
//
// ── Why it reads the enum rather than the contract ──────────────────────────
//
// Unlike `advertising-enum-drift`, which reads `Diaspora.Api.json` because the
// objective is published there as an `enum`, an earning's source appears in the
// contract only as a bare `string` on a response — a response schema cannot
// constrain what a server chooses to return. The enum is the authority, so this
// reads the enum.
//
// The backend checkout is found via `DIASPORA_BACKEND_PATH`, or beside this
// repository, and the suite skips when it is absent so CI on this repository
// alone stays green.
// ─────────────────────────────────────────────────────────────────────────────

import { CREATOR_EARNING_STATES, CREATOR_REVENUE_SOURCES } from '@/types/creator-economy';

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
      'Diaspora.Modules.Creator',
      'Domain',
      'Enums',
      'CreatorEarningEnums.cs'
    )
  : null;

const describeWhenBackendPresent = ENUM_FILE && existsSync(ENUM_FILE) ? describe : describe.skip;

describeWhenBackendPresent('the earnings vocabulary matches the server', () => {
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

  it('parses both enums at all', () => {
    // Guards the guard. Every assertion below compares against these lists, and empty ones would
    // make "the client names nothing the server cannot produce" true by vacuity — which is how a
    // drift check goes quietly blind after a rename or a file move on the other side.
    expect(enumMembers('CreatorEarningSource').length).toBeGreaterThan(2);
    expect(enumMembers('CreatorEarningState').length).toBeGreaterThan(4);
  });

  it('names no source the platform cannot produce', () => {
    // The direction that matters to a member: a filter that can only ever come back empty.
    const server = enumMembers('CreatorEarningSource');

    const invented = CREATOR_REVENUE_SOURCES.filter(
      (value) => !server.some((member) => member.toLowerCase() === String(value).toLowerCase())
    );

    expect(invented).toEqual([]);
  });

  it('names every source the platform can produce', () => {
    // The other direction. A source the server records and the client cannot name is an earning
    // that appears in a ledger under a label nobody wrote.
    const server = enumMembers('CreatorEarningSource');

    const missing = server.filter(
      (member) =>
        !CREATOR_REVENUE_SOURCES.some(
          (value) => String(value).toLowerCase() === member.toLowerCase()
        )
    );

    expect(missing).toEqual([]);
  });

  it('agrees on every earning state', () => {
    // States are worse than sources to get wrong: `Available` is the figure a creator reads twice,
    // and a client that did not recognise the server's spelling would show it as nothing at all.
    const server = enumMembers('CreatorEarningState');

    expect([...CREATOR_EARNING_STATES].sort()).toEqual([...server].sort());
  });
});
