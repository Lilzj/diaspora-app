// ─────────────────────────────────────────────────────────────────────────────
// The hub must not say "no memberships" without having asked — 12 Sep 2026
//
// Reported from the emulator. The Community Life hub's "My memberships" section
// said, flatly, **"You have not joined a community yet"**, and offered "Find a
// community" — which opened a screen that answered "No community near you is
// taking members through Diaspora yet". Two dead ends in a row, while the
// directory held twelve active communities.
//
// Two separate faults, and this file pins the first:
//
//   **1. It read `summary.myMemberships`.** The hub summary aggregate is
//   unserved, so its query is `enabled: false` and `summary` is null in every
//   release build. The section therefore asserted a fact — you have joined
//   nothing — about a member the platform had never been asked about.
//   `GET /communities/memberships/me` is real and gated on nothing but being
//   signed in. Unanswered is not no.
//
//   **2. The two things both called "community".** A *membership* is a
//   programme an organisation runs and you pay or apply for; there are zero on
//   this deployment. *Joining a community* is free and lives in the directory;
//   there are twelve. Sending somebody from one empty screen to another emptier
//   one taught them the platform was empty.
//
// This test reads the screen's source, because the defect is *which hook is
// called* — rendering the screen with a mocked hook would pass whichever one it
// used.
// ─────────────────────────────────────────────────────────────────────────────

// `require` rather than `import`, and typed by hand: this project has no
// @types/node, so an `import from 'fs'` typechecks red while passing under Jest.
// The same shape every other source-reading suite here uses.
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

const ROOT = path.join(process.cwd(), 'src', 'app', 'community-life');

const hub = fs.readFileSync(path.join(ROOT, 'index.tsx'), 'utf8');
const discovery = fs.readFileSync(path.join(ROOT, 'membership', 'index.tsx'), 'utf8');

/** Source with comments stripped — a rule must not be satisfied by prose about it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the hub’s memberships section', () => {
  const source = code(hub);

  it('reads the real route, not the unserved summary', () => {
    expect(source).toContain('useMyMemberships');
  });

  it('never renders the list from the summary aggregate', () => {
    // `summary` stays for the counts on the destination tiles, which are
    // optional-chained and simply absent when it is. What must not come back is
    // a membership *list* drawn from something that is null in production.
    expect(source).not.toContain('summary?.myMemberships');
    expect(source).not.toContain('summary.myMemberships');
  });

  it('does not state that the member has joined nothing', () => {
    // The old copy, kept verbatim so it cannot quietly return. Checked against
    // the stripped source: the note explaining why it went quotes it.
    expect(source).not.toContain('You have not joined a community yet');
  });

  it('distinguishes a failure to read from having none', () => {
    // A transport failure and an empty list are different sentences.
    expect(source).toContain('myMemberships.isError');
  });
});

describe('the membership discovery screen', () => {
  const source = code(discovery);

  it('does not describe an empty programme table as an empty platform', () => {
    expect(source).not.toContain('No community near you is taking members through Diaspora yet');
  });

  it('offers the directory, which is not empty, when nothing is filtered', () => {
    expect(source).toContain("router.push('/community')");
  });
});
