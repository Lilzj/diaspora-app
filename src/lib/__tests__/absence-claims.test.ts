// ─────────────────────────────────────────────────────────────────────────────
// A screen may not announce an absence it never checked — 12 Sep 2026
//
// Swept out of the Community Life hub defect. Six screens shared one shape:
//
//   a hook whose query is `enabled: … && are<Something>GapsEnabled()` — false in
//   every release build, so the query never runs — feeding an empty state whose
//   condition is some variant of `!isLoading && !isError && length === 0`. All
//   three are true of a query that never ran, so the claim was permanent.
//
// What members were told, in a release build, on a platform where each of these
// was false:
//
//   "There is no moderators to show for the communities you have chosen.
//    Try widening your community filter"   — and blamed for their own filter
//   "Nothing is being promoted right now." — with live B15 placements
//   "No event has been posted with this area on it."
//                                          — under a real "Events 12" count
//   "Nothing here yet"                     — to a moderator whose queue had reports
//   "Nothing has been shared with you"     — a claim about other people's actions
//
// The notice that would have explained was gated the wrong way round in each
// case — `{query.isSimulated ? <GapNotice/> : null}`, where `isSimulated` *is*
// the build flag — so it rendered only in the build where the data existed.
//
// These assertions read source rather than rendering, because the defect is
// which branch exists, and a render with a stubbed hook passes whichever the
// test happens to drive.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

function read(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe('the community role directory', () => {
  const source = read('components', 'community-directory', 'CommunityGovernanceScreen.tsx');

  // Since 20 Oct 2026 `GET /communities/{idOrSlug}/roles` is served, and the
  // hook reads it in every build. It replaced a member-list filter that showed
  // nothing to anybody who could not see members.
  const hooks = read('hooks', 'communities.ts');
  const holdersHook = hooks.slice(
    hooks.indexOf('export function useCommunityRoleHolders'),
    hooks.indexOf('export function useCommunityInitiatives')
  );

  it('reads the real role-holders route, ungated by the simulation switch', () => {
    expect(source).toContain('useCommunityRoleHolders');
    expect(holdersHook).toContain('fetchCommunityRoleHolders');
    expect(holdersHook).not.toContain('areMultiCommunityGapsEnabled');
  });

  it('says an unanswered list is unanswered, rather than saying nobody', () => {
    expect(source).toContain('holders.isError');
    expect(source).toContain('reason="error"');
  });

  it('explains a disabled build instead of calling it empty', () => {
    expect(source).toContain("'feature-disabled'");
  });

  it('does not tell a single community to widen its filter', () => {
    // The shared panel's generic body was written for the filtered directory.
    // On one community's moderator list there is no filter to widen, so it read
    // as advice that could not be taken.
    expect(source).toContain('copy.emptyDetail');
    expect(source).toContain('An administrator can give somebody the role');
  });
});

describe('the creator’s sponsored content', () => {
  const source = read('app', 'creator', 'sponsored.tsx');

  it('consults the real placements before claiming nothing is promoted', () => {
    // Both lists come out of the same hook. Only one of them is real.
    expect(source).toContain('query.placements.length');
  });
});

describe('the neighbourhood events list', () => {
  const source = read('app', 'community-life', 'neighborhood.tsx');

  // Since 14 Oct 2026 the list is events around a point, a real read. The
  // simulated neighbourhood binding (gated off in release builds) is gone, and
  // the empty claim must still only follow a query that could run: without a
  // point the screen says it cannot look, not that nothing is there.
  it('checks whether there is a point to ask about before reporting an empty area', () => {
    const noPoint = source.indexOf('{!point ? (');
    const empty = source.indexOf('Nothing published within');

    expect(noPoint).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(noPoint);
    expect(source).toContain('events.events.length === 0 && !events.isLoading');
  });

  it('still keeps the true empty state for an area with no events', () => {
    expect(source).toContain('Nothing published within');
  });
});

describe('the community moderation queue', () => {
  const source = read('app', 'community', '[slug]', 'moderation.tsx');

  it('handles the state a real moderator actually reaches', () => {
    // It handled `forbidden` and fell through to `empty` for everything else —
    // and `feature-disabled` is what a release build returns.
    expect(source).toContain("reports.unavailable === 'feature-disabled'");
  });
});

describe('the saved analytics reports', () => {
  const source = read('app', 'analytics', 'reports', 'index.tsx');

  // Since 20 Oct 2026 the reports are real (`/analytics/reports`) and private
  // only: the server's shared list is always empty, so the "Shared with you"
  // tab is gone rather than guarded, and the screen says sharing is not
  // available instead.
  it('never states that nothing was shared, because nothing can be', () => {
    // Kept verbatim: a claim about what other people have or have not done is
    // the worst thing on this list, because the member cannot check it.
    expect(source).not.toContain('Nothing has been shared with you');
    expect(source).not.toContain("'shared'");
    expect(source).toContain('Sharing a report');
  });

  it('says an unanswered list is unanswered, rather than that there are no reports', () => {
    const error = source.indexOf('isError ?');
    const empty = source.indexOf('You have not built a report yet');

    expect(error).toBeGreaterThan(-1);
    expect(error).toBeLessThan(empty);
  });
});
