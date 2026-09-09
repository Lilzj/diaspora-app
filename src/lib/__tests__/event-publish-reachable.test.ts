// ─────────────────────────────────────────────────────────────────────────────
// An organiser can actually publish their event
//
// ── The gap ─────────────────────────────────────────────────────────────────
//
// `POST /events/{eventId}/publish` has been served since the CommunityLife
// module shipped, and **nothing in this client ever called it.**
//
// Creating a single event always produces a draft — the create request has no
// `publish` flag, unlike the series one — and the create screen says so
// honestly: "Saved as a draft. You can publish it from your events." There was
// no such place. No function, no hook, no control anywhere.
//
// So every event any organiser ever made stayed invisible to everybody, and
// that is why the deployment had no published events: **the platform had never
// had one.** Guides, housing and marketplace listings each got their publish
// call; events were the one that did not.
//
// ── Why the chain and not just the function ─────────────────────────────────
//
// A `publishEvent` with no caller is the same defect one layer up, and that is
// the commonest shape of defect in this repository: correct code with nothing
// producing or consuming it. So this walks the whole chain — api function,
// hook, screen control — because any link missing puts the capability back out
// of reach.
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
const SCREEN = code('app', 'community-life', 'event', '[id].tsx');
const CREATE = code('app', 'community-life', 'event', 'create.tsx');

describe('the publish route is reachable from the application', () => {
  it('has an api function that posts to the route', () => {
    expect(API).toMatch(/publishEvent/);
    expect(API).toMatch(/\/publish/);
  });

  it('maps the answer rather than casting it', () => {
    // The publish route answers the same `EventResponse` as every other event
    // route, and `setEvent` puts the result straight on screen.
    expect(API).toMatch(/publishEvent[\s\S]{0,220}toEvent/);
  });

  it('has a hook that calls the api function', () => {
    expect(HOOKS).toMatch(/usePublishEvent/);
    expect(HOOKS).toMatch(/publishEvent/);
  });

  it('refreshes the discovery lists, because that is the point of publishing', () => {
    // A published event is a new arrival everywhere it was previously absent.
    expect(HOOKS).toMatch(/usePublishEvent[\s\S]{0,600}community-life', 'events'/);
  });

  it('has a control on the screen an organiser is actually looking at', () => {
    expect(SCREEN).toMatch(/usePublishEvent/);
    expect(SCREEN).toMatch(/Publish event/);
  });

  it('shows that control only to the organiser, and only for a draft', () => {
    // Offering it to a member who cannot use it is an affordance that answers
    // 403, and offering it on a published event is a button with nothing to do.
    expect(SCREEN).toMatch(/isOrganiser && event\.status === 'Draft'/);
  });

  it('keeps the create screen honest about what it just did', () => {
    // The create screen was already truthful — it says a draft is a draft. The
    // failure was that the place it pointed at did not exist. If this ever
    // changes to claim the event is live, the claim has to be true.
    expect(CREATE).toMatch(/draft/i);
    expect(CREATE).not.toMatch(/is now live|now visible to everyone/i);
  });
});
