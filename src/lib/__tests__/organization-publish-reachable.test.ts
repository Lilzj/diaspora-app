// ─────────────────────────────────────────────────────────────────────────────
// An organisation you register is one people can find
//
// `POST /organizations/{organizationId}/publish` has been served since the
// CommunityLife module shipped, and nothing in this client ever called it —
// the same gap events had until it was closed.
//
// It went unnoticed longer than the events one because it sat behind a second
// defect: `POST /organizations` was refused by the server for every payload the
// form could build, so nobody had ever produced even a draft to publish. Fixing
// the create request is what made this gap reachable.
//
// This walks the whole chain — api function, hook, screen control — because a
// `publishOrganization` with no caller is the same defect one layer up, and
// that is the commonest shape of defect in this repository.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...parts: string[]): string };

/** A file's code with its comments removed, so prose cannot satisfy a check. */
function code(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');
}

const API = code('lib', 'community-life-api.ts');
const HOOKS = code('hooks', 'community-life.ts');
const SCREEN = code('app', 'community-life', 'org', '[id].tsx');
const CREATE = code('app', 'community-life', 'org', 'create.tsx');

describe('the organisation publish route is reachable', () => {
  it('has an api function that posts to the route', () => {
    expect(API).toMatch(/publishOrganization/);
    expect(API).toMatch(/organizations\/\$\{organizationId\}\/publish/);
  });

  it('has a hook that calls it', () => {
    expect(HOOKS).toMatch(/usePublishOrganization/);
    expect(HOOKS).toMatch(/publishOrganization/);
  });

  it('refreshes the directory, because that is the point of publishing', () => {
    expect(HOOKS).toMatch(/usePublishOrganization[\s\S]{0,700}community-life', 'organizations'/);
  });

  it('has a control on the page somebody is actually looking at', () => {
    expect(SCREEN).toMatch(/usePublishOrganization/);
    expect(SCREEN).toContain('Publish organisation');
  });

  it('shows it only while the organisation is a draft', () => {
    // A publish button on a published organisation is a button with nothing
    // to do.
    expect(SCREEN).toMatch(/org\.status === 'Draft'/);
  });

  it('gates it on the role the platform states, not on an id the client guesses', () => {
    // `ViewerMembershipRole` is on the response. An id comparison would have
    // under-shown for an organisation's other administrators, who can publish
    // it too.
    expect(SCREEN).toMatch(/viewerMembershipRole === 'Owner'/);
    expect(SCREEN).toMatch(/viewerMembershipRole === 'Administrator'/);
  });

  it('confirms first, because publishing is not undone by the same control', () => {
    expect(SCREEN).toContain('Publish this organisation?');
    expect(SCREEN).toMatch(/cannot put it back to a draft/i);
  });
});

describe('the create screen stays honest about what it produced', () => {
  it('still says a new organisation is a draft', () => {
    // Creating has no publish flag on the request. If this ever claims the
    // organisation is live, the claim has to be true.
    expect(CREATE).toMatch(/draft/i);
    expect(CREATE).not.toMatch(/published immediately|now visible to everyone/i);
  });

  it('does not admit to simulating anything to the member', () => {
    expect(CREATE).not.toContain('(Simulated)');
  });
});
