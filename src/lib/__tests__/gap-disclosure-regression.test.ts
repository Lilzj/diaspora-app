// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — capability-disclosure regression suite
//
// Every test here exists because a screen told members the platform could not do
// something it could. The sweep that found them checked the running deployment;
// this suite is what stops the same sentences coming back, and — more usefully —
// what fails if a capability the screens now *rely on* quietly goes away.
//
// ── Two directions, both of them necessary ───────────────────────────────────
//
// **Forwards.** A stale sentence must not return. That is a source assertion,
// because the sentence is the artefact.
//
// **Backwards.** The wiring must keep calling the route it was wired to. That is
// a request assertion against a mock adapter, because a client that silently
// stops calling `/guides/mine` produces an empty workspace and no error — which
// is exactly the failure mode the old disclosure was covering for.
//
// ── What is deliberately *not* asserted ──────────────────────────────────────
//
// Nothing here asserts that a capability the deployment switched off is absent.
// Deposits, payouts, location triggers and platform-wide automations are all
// still refused, and `runtime-validation/e2e/gap-claims-probe.mjs` is where that
// is checked — against the real server, which is the only place the answer lives.
// A unit test that pinned them would pin the client's *opinion* of them.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { fetchWorkspaceArchive, fetchWorkspaceContent, workspaceCoverageNote } from '../creator/workspace';
import { canPerform, performWorkspaceAction } from '../creator/workspace-actions';
import { fetchCertifiedAutomationSupport } from '../automation-api';
import type { UnifiedContentItem } from '@/types/creator';

const IDENTITY: UnifiedContentItem['publishingIdentity'] = {
  id: 'a3d0c2f4-1111-4a2b-9c3d-4e5f60718293',
  name: 'Ada Nwosu',
  type: 'personal',
  avatar: '',
  handle: '',
  verified: false,
  followerCount: 0,
};

// `require` and a declared `__dirname`, matching `inert-affordances.test.ts`:
// this project has no `@types/node` and the type-check runs over the test files.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;

// Declared locally with a narrow signature, like `readFileSync` above and for
// the same reason: adding "node" to tsconfig's `types` shadows the ambient
// React Native declaration that gives several phases' boundary tests `__DEV__`.
const readdirSync: (path: string, options: { withFileTypes: true }) =>
  { name: string; isDirectory(): boolean }[] = require('fs').readdirSync;
const join: (...parts: string[]) => string = require('path').join;

const source = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

/**
 * A screen's source with its comments blanked, line numbering preserved.
 *
 * This repository documents every removal by quoting the sentence it removed, so
 * an assertion that a phrase is *gone* will keep finding it in the paragraph
 * explaining why it went. That is not hypothetical: the creator banner assertion
 * below failed on the comment describing its own fix.
 */
const rendered = (...parts: string[]) => {
  const NEWLINE = String.fromCharCode(10);
  const block = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
  const line = new RegExp('//[^\\n]*', 'g');

  return source(...parts)
    .replace(block, (match) =>
      match
        .split(NEWLINE)
        .map((row) => ' '.repeat(row.length))
        .join(NEWLINE)
    )
    .replace(line, (match) => ' '.repeat(match.length));
};

/**
 * Every `.tsx` under `src/app`, concatenated.
 *
 * Used to ask what the *screens* offer, as distinct from what a component says
 * is possible. The gap between those two is where two reportable subjects were
 * hiding, and neither side alone could have shown it.
 */
function appSource(): string {
  const root = join(__dirname, '..', '..', 'app');
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) out.push(readFileSync(full, 'utf8'));
    }
  };

  walk(root);
  return out.join(String.fromCharCode(10));
}

/**
 * The same file with its comments removed.
 *
 * Necessary rather than fussy. Every one of these files **quotes the sentence it
 * replaced**, deliberately: a register entry is a claim with a date on it, and
 * the value of keeping the old wording is that a reader can see what was wrong
 * and when. A plain `not.toContain` would therefore fail on the record of the
 * fix rather than on the fix, so the assertions run against what is rendered.
 */
function visible(...parts: string[]): string {
  return source(...parts)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

let api: MockAdapter;
beforeEach(() => { api = new MockAdapter(apiClient); });
afterEach(() => { api.restore(); });

// ═════════════════════════════════════════════════════════════════════════════
// THE CREATOR WORKSPACE — four routes that must keep being called
// ═════════════════════════════════════════════════════════════════════════════

describe('the creator workspace reads the routes it says it reads', () => {
  it('asks all five /mine routes and merges what they return', async () => {
    api.onGet('/guides/mine').reply(200, {
      data: { items: [{ guideId: 'g1', title: 'Registering a birth', status: 'Published', views: 12, commentCount: 3 }] },
    });
    api.onGet('/marketplace/listings/mine').reply(200, {
      data: { items: [{ listingId: 'm1', title: 'Refurbished laptop', status: 'Active', viewCount: 5 }] },
    });
    api.onGet('/housing/listings/mine').reply(200, {
      data: { items: [{ listingId: 'h1', title: 'Two-bedroom in Yaba', status: 'Published' }] },
    });
    api.onGet('/community-life/events/mine').reply(200, {
      data: { items: [{ eventId: 'e1', title: 'Lagos meetup', status: 'Published' }] },
    });
    // Businesses since 14 Oct 2026; an archived (removed) one is not listed.
    api.onGet('/providers/me').reply(200, {
      data: [
        { providerId: 'p1', name: 'Josh Kitchen', status: 'Active' },
        { providerId: 'p2', name: 'Removed Barber', status: 'Archived' },
      ],
    });

    const result = await fetchWorkspaceContent(IDENTITY);

    expect(result.items.map((i) => i.contentType).sort()).toEqual(['Event', 'Guide', 'Housing', 'Marketplace', 'Provider']);
    expect(result.isUnavailable).toBe(false);
    expect(result.sources.every((s) => s.outcome === 'listed')).toBe(true);

    // The fields come from the rows rather than from anywhere else.
    const guide = result.items.find((i) => i.contentType === 'Guide')!;
    expect(guide.views).toBe(12);
    expect(guide.commentsCount).toBe(3);
  });

  it('never invents a health score', async () => {
    // The whole reason the workspace sat empty for a release was that filling it
    // meant inventing `healthScore` / `healthStatus` / `healthRecommendations`.
    // Nothing computes them, so they must arrive undefined and be rendered as
    // "not measured" — a 0 would read to a member as a failing grade.
    api.onGet('/guides/mine').reply(200, { data: { items: [{ guideId: 'g1', title: 'A guide', status: 'Published' }] } });
    api.onGet('/marketplace/listings/mine').reply(200, { data: { items: [] } });
    api.onGet('/housing/listings/mine').reply(200, { data: { items: [] } });
    api.onGet('/community-life/events/mine').reply(200, { data: { items: [] } });

    const result = await fetchWorkspaceContent(IDENTITY);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].healthScore).toBeUndefined();
    expect(result.items[0].healthStatus).toBeUndefined();
    expect(result.items[0].healthRecommendations).toBeUndefined();
  });

  it('reads a 403 as "you are not a seller", not as a failure', async () => {
    // Marketplace and Housing refuse until a seller or landlord profile exists.
    // A guide author must still see their guides, and must be told plainly which
    // lists are not theirs rather than shown an error.
    api.onGet('/guides/mine').reply(200, { data: { items: [{ guideId: 'g1', title: 'A guide', status: 'Published' }] } });
    api.onGet('/marketplace/listings/mine').reply(403, { code: 'Platform.Auth.Forbidden' });
    api.onGet('/housing/listings/mine').reply(403, { code: 'housing.not-landlord' });
    api.onGet('/community-life/events/mine').reply(200, { data: { items: [] } });

    const result = await fetchWorkspaceContent(IDENTITY);

    expect(result.isUnavailable).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.sources.find((s) => s.key === 'marketplace')?.outcome).toBe('notEnrolled');
    expect(result.sources.find((s) => s.key === 'housing')?.outcome).toBe('notEnrolled');

    const note = workspaceCoverageNote(result.sources);
    expect(note).toContain('seller profile');
    expect(note).toContain('landlord profile');
  });

  it('only calls the workspace unavailable when every vertical failed', async () => {
    api.onGet('/guides/mine').reply(500);
    api.onGet('/marketplace/listings/mine').reply(500);
    api.onGet('/housing/listings/mine').reply(500);
    api.onGet('/community-life/events/mine').reply(500);
    api.onGet('/providers/me').reply(500);

    const allDown = await fetchWorkspaceContent(IDENTITY);
    expect(allDown.isUnavailable).toBe(true);

    api.reset();
    api.onGet('/guides/mine').reply(200, { data: { items: [] } });
    api.onGet('/marketplace/listings/mine').reply(500);
    api.onGet('/housing/listings/mine').reply(500);
    api.onGet('/community-life/events/mine').reply(500);

    // Three of four down is a partial view, not an unknown one. Saying "we
    // cannot tell you what you have published" when one route answered would be
    // the same overreach the old sentence made.
    const partial = await fetchWorkspaceContent(IDENTITY);
    expect(partial.isUnavailable).toBe(false);
  });

  it('reads the archive from the same routes with status=Archived', async () => {
    const seen: Record<string, unknown>[] = [];
    api.onGet(/\/guides\/mine/).reply((config) => { seen.push(config.params); return [200, { data: { items: [] } }]; });
    api.onGet(/\/marketplace\/listings\/mine/).reply((config) => { seen.push(config.params); return [200, { data: { items: [] } }]; });
    api.onGet(/\/housing\/listings\/mine/).reply((config) => { seen.push(config.params); return [200, { data: { items: [] } }]; });
    api.onGet('/community-life/events/mine').reply(200, { data: { items: [] } });

    await fetchWorkspaceArchive(IDENTITY);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.every((params) => params?.status === 'Archived')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE ACTIONS — the routes the menu was told to call once ids were real
// ═════════════════════════════════════════════════════════════════════════════

describe('workspace lifecycle actions reach the module that owns the verb', () => {
  const GUID = '11111111-2222-4333-8444-555555555555';

  it.each([
    ['archive', 'Guide', 'post', `/guides/${GUID}/archive`],
    ['archive', 'Marketplace', 'post', `/marketplace/listings/${GUID}/archive`],
    ['archive', 'Housing', 'post', `/housing/listings/${GUID}/archive`],
    ['restore', 'Guide', 'post', `/guides/${GUID}/restore`],
    ['restore', 'Marketplace', 'post', `/marketplace/listings/${GUID}/restore`],
    ['restore', 'Housing', 'post', `/housing/listings/${GUID}/restore`],
    ['markSold', 'Marketplace', 'post', `/marketplace/listings/${GUID}/sold`],
    ['markOccupied', 'Housing', 'post', `/housing/listings/${GUID}/occupied`],
  ] as const)('%s on a %s calls %s %s', async (kind, contentType, method, path) => {
    let called: string | null = null;
    api.onPost(path).reply(() => { called = path; return [200, { data: {} }]; });

    const result = await performWorkspaceAction(kind, contentType, GUID);

    expect(result).toEqual({ outcome: 'done' });
    expect(called).toBe(path);
    expect(method).toBe('post');
  });

  it.each([
    ['Guide', `/guides/${GUID}`],
    ['Marketplace', `/marketplace/listings/${GUID}`],
    ['Housing', `/housing/listings/${GUID}`],
  ] as const)('delete on a %s issues DELETE %s', async (contentType, path) => {
    let called: string | null = null;
    api.onDelete(path).reply(() => { called = path; return [204]; });

    const result = await performWorkspaceAction('delete', contentType, GUID);

    expect(result).toEqual({ outcome: 'done' });
    expect(called).toBe(path);
  });

  it('refuses to send a request for a verb no module implements', async () => {
    // `Job`, `Event`, `Update` and `Organization` are in the client's
    // `ContentType` union with no archive route. The menu must not offer a
    // control that would 404 on somebody's own content. (A `Provider` archives
    // through its status since 14 Oct 2026; see the test below.)
    for (const contentType of ['Job', 'Event', 'Update', 'Organization'] as const) {
      expect(canPerform('archive', contentType)).toBe(false);
      const result = await performWorkspaceAction('archive', contentType, GUID);
      expect(result.outcome).toBe('notSupported');
    }
    expect(api.history.post).toHaveLength(0);
    expect(api.history.delete).toHaveLength(0);
  });

  it('archives and removes a business by changing its status', async () => {
    api.onPut(`/providers/${GUID}/status`).reply(200, { data: {} });

    expect((await performWorkspaceAction('delete', 'Provider', GUID)).outcome).toBe('done');
    expect((await performWorkspaceAction('restore', 'Provider', GUID)).outcome).toBe('done');

    expect(api.history.put.map((call) => JSON.parse(call.data).status)).toEqual(['Archived', 'Active']);
    expect(api.history.delete).toHaveLength(0);
  });

  it('refuses to send a request for an id that did not come from the server', async () => {
    // The failure this replaced: fixture ids like `cnt-hou-1` reaching a route
    // that binds a Guid, so a member read a validation error about their own
    // listing.
    const result = await performWorkspaceAction('archive', 'Guide', 'cnt-hou-1');
    expect(result.outcome).toBe('notSupported');
    expect(api.history.post).toHaveLength(0);
  });

  it('reports a refusal in the server’s own words rather than claiming success', async () => {
    api.onPost(`/guides/${GUID}/archive`).reply(409, { detail: 'This guide is featured and cannot be archived.' });

    const result = await performWorkspaceAction('archive', 'Guide', GUID);

    expect(result).toEqual({
      outcome: 'refused',
      status: 409,
      reason: 'This guide is featured and cannot be archived.',
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTOMATION SUPPORT — derived from the served documents, never hardcoded
// ═════════════════════════════════════════════════════════════════════════════

describe('automation support is read from the deployment rather than declared', () => {
  const preferences = { data: { push: true, email: false, communication: { quietHoursEnabled: false } } };
  const categories = { data: { items: [] } };

  function serve(capabilities: object, catalog: object) {
    api.onGet('/notifications/preferences').reply(200, preferences);
    api.onGet('/notifications/categories').reply(200, categories);
    api.onGet('/automations/capabilities').reply(200, { data: capabilities });
    api.onGet('/automations/catalog').reply(200, { data: catalog });
  }

  const FULL_CATALOG = {
    triggers: [
      { key: 'guide.published', isAvailable: true },
      { key: 'savedSearch.newMatch', isAvailable: true },
      { key: 'location.enteredArea', isAvailable: false, unavailableReason: 'Background location is not implemented.' },
    ],
    conditions: [],
    actions: [
      { key: 'notify.self', isAvailable: true },
      { key: 'reminder.schedule', isAvailable: true },
    ],
  };

  it('reports the engine as present when the catalogue carries a trigger and an action', async () => {
    // This is the regression that matters most. The six flags were hardcoded
    // `false` with a comment saying "there is no route to ask", and every
    // automation screen therefore told members Diaspora could not store or run
    // automations — over a deployment doing both.
    serve({ canViewAutomations: true, canCreatePersonal: true, provenance: 'server', maxActiveAutomations: 50 }, FULL_CATALOG);

    const support = await fetchCertifiedAutomationSupport();

    expect(support.hasRegistry).toBe(true);
    expect(support.hasExecutionEngine).toBe(true);
    expect(support.hasExecutionHistory).toBe(true);
    expect(support.hasScheduler).toBe(true);
    expect(support.hasNotificationDispatch).toBe(true);
    expect(support.hasSavedSearchEvaluation).toBe(true);
  });

  it('reports the engine as absent when the catalogue has nothing available', async () => {
    serve(
      { canViewAutomations: true, canCreatePersonal: true, provenance: 'server', maxActiveAutomations: 50 },
      { triggers: [{ key: 'guide.published', isAvailable: false }], conditions: [], actions: [{ key: 'notify.self', isAvailable: false }] }
    );

    const support = await fetchCertifiedAutomationSupport();

    expect(support.hasExecutionEngine).toBe(false);
    expect(support.hasScheduler).toBe(false);
    expect(support.hasNotificationDispatch).toBe(false);
  });

  it('assumes nothing when the capability document does not answer', async () => {
    // A failed read is not evidence of absence, but it is not evidence of
    // presence either — and a screen that assumed presence would offer controls
    // the server refuses. Absent stays the safe default.
    api.onGet('/notifications/preferences').reply(200, preferences);
    api.onGet('/notifications/categories').reply(200, categories);
    api.onGet('/automations/capabilities').reply(503);
    api.onGet('/automations/catalog').reply(200, { data: FULL_CATALOG });

    const support = await fetchCertifiedAutomationSupport();

    expect(support.hasRegistry).toBe(false);
    expect(support.hasExecutionEngine).toBe(false);
    // B13 is a separate question and still answered.
    expect(support.hasNotificationPreferences).toBe(true);
    expect(support.enabledChannels).toContain('Push');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE SENTENCES — stale ones gone, true ones kept
// ═════════════════════════════════════════════════════════════════════════════

describe('the disclosures on screen match the platform', () => {
  it('no longer tells members automations cannot be stored or run', () => {
    for (const file of [
      ['app', 'automation', 'index.tsx'],
      ['app', 'automation', '[id].tsx'],
      ['app', 'automation', 'history.tsx'],
      ['app', 'automation', 'run', '[runId].tsx'],
    ]) {
      const text = visible(...file);
      expect(text).not.toContain('Diaspora cannot store automations yet');
      expect(text).not.toContain('Diaspora cannot run automations automatically yet');
      expect(text).not.toContain('Diaspora cannot run them automatically yet');
    }
  });

  it('no longer claims no route serves a creator’s own content', () => {
    const store = visible('store', 'content-management.ts');
    expect(store).not.toContain('Diaspora cannot list your published content yet');
    expect(store).toContain('fetchWorkspaceContent');
  });

  it('no longer denies the activity history the platform now serves', () => {
    // This test used to assert the opposite, and its comment read:
    // "`CreatorActivityEntry` is written server-side and no route reads it back.
    //  Re-checked against the live contract; this sentence stays."
    //
    // That was the last true denial in this file and BG-06 closed it.
    // `GET /creators/me/activity` is cursor-paged and newest-first, and the
    // Timeline Log reads it through `lib/creator/activity.ts`.
    //
    // What replaces one denial is FOUR states, because an empty list here is
    // genuinely ambiguous: loading, failed, "you have not started publishing"
    // (isCreator false) and "nothing recognised yet" (isCreator true). A single
    // empty state would have collapsed the last two, which is the distinction
    // the route carries `isCreator` in order to make.
    const section = visible('components', 'creator', 'sections', 'WorkspaceSection.tsx');

    expect(section).not.toContain('Diaspora cannot show your activity history yet');
    expect(section).not.toContain('serves no route to read that history back');

    expect(section).toContain('Reading your activity history');
    expect(section).toContain('Your activity history could not be loaded');
    expect(section).toContain('Nothing recognised yet');
    expect(section).toContain('Your history starts with your first publication');
  });

  it('can reach every subject it claims is reportable', () => {
    // The structural version, and the one that catches the NEXT one.
    //
    // `ReportModal` maps ten subjects to a content type, and a non-null mapping
    // is the client asserting "the platform accepts a report about this". A
    // subject no screen ever passes is that assertion with nothing behind it:
    // the capability is real, the mapping is right, and a member cannot get to
    // it.
    //
    // Two were in that state and both were found by walking screens on a
    // device rather than by reading either side alone — `Member` (BG-05a, this
    // phase) and `Organization` (BG-02, closed a phase earlier and never
    // wired). Both are reachable now.
    const modal = source('components', 'ReportModal.tsx');

    // The subjects the modal claims, minus the ones reported through the
    // dynamic `reportTarget` path on guides, updates and comments — those pass
    // a wire type rather than a `ReportSubject` literal and are reachable by a
    // different mechanism.
    const claimed = ['Marketplace', 'Housing', 'Listing', 'Event', 'Job', 'Organization', 'Member', 'Message'];

    for (const subject of claimed) {
      expect(modal).toContain(`${subject}: '`);
    }

    const reachable = new Set(
      [...appSource().matchAll(/contentType="(\w+)"/g)].map((m) => m[1]),
    );

    const unreachable = claimed.filter((subject) => !reachable.has(subject));

    expect(unreachable).toEqual([]);
  });

  it('offers reporting the person, not only the message', () => {
    // BG-05a closed member reporting in the backend and the ReportModal maps
    // `Member`. **No screen passed that subject**, so the capability existed
    // end to end and a member could not reach it — found by walking the
    // conversation screen on a device, where the options sheet offered Block
    // and no report.
    //
    // The two are not substitutes and that is the whole point of the fix:
    // blocking is private and tells moderation nothing, while a report opens a
    // case. BG-05a's own justification was that somebody harassed across
    // several surfaces had to complain about each *thing* separately and no
    // single case described the pattern — which is exactly what reporting one
    // message at a time is.
    const screen = source('app', 'conversation', '[id].tsx');

    expect(screen).toContain('Report this person');
    expect(screen).toContain('contentType="Member"');

    // Block stays. It is the immediate protection and the report does not
    // replace it — the confirmation says so in as many words.
    expect(screen).toContain('Block User');

    const modal = source('components', 'ReportModal.tsx');
    expect(modal).toContain('Reporting does not block them');
  });

  it('does not gate the real half of Creator Studio on the simulated half', () => {
    // FD-04, twice. The first fix replaced a full-tab denial with a narrower
    // *sentence* and left the *structure*: every section still sat inside
    // `dashboard.isEnabled && …`, and `useCreatorDashboard` is `gapApi`. So a
    // release build rendered one notice and nothing else — no standing card, no
    // points, no achievements, no quick actions — while four of those six
    // sections read certified routes.
    //
    // This is the structural assertion rather than a sentence match, because a
    // sentence match is what passed last time.
    const screen = source('app', 'creator', 'index.tsx');

    // The standing card reads the profile route, not the simulated summary.
    expect(screen).toContain('useCreatorProfile');
    expect(screen).toContain('presentCreatorStatus(profile.data.status)');
    expect(screen).not.toContain('presentCreatorStatus(summary.status)');

    // Verification and points likewise.
    expect(screen).toContain('verification.verification.state');
    expect(screen).toContain('points.data.available');
    expect(screen).not.toContain('summary.points.available');

    // And the notice names what the *deployment* says it cannot measure, metric
    // by metric, rather than denying the whole thirty days.
    //
    // The sentence this replaces — "Suggestions and your last 30 days are not
    // measured yet … views, reach, saves … need an audience measurement the
    // platform does not record yet" — was wrong about two of the three things it
    // named. `GET /analytics/creators/me/summary` answers 200 with fourteen
    // metrics including `content_views` and `saves`; only `reach` is genuinely
    // unavailable, and the route publishes that list itself.
    expect(screen).toContain('unavailableMetricLabels');
    expect(screen).toContain('useCreatorAnalytics');

    // Read past the prose: the sentence survives in the comment that explains
    // its removal, which is documentation rather than something a member sees.
    const shown = rendered('app', 'creator', 'index.tsx');
    expect(shown).not.toContain('Suggestions and your last 30 days are not measured yet');
    expect(shown).not.toContain('Headline figures are not available yet');
  });

  it('maps every subject to the content type the platform actually claims', () => {
    // This test used to assert the opposite — that the modal *refuses* jobs,
    // because `CommunityContentType.Job` was declared in B6's enum and claimed by
    // no content source. Four types were in that state: Job, Organization, Member
    // and Message (which was not in the enum at all). All four are claimed now.
    //
    // `Member` was the last, and it held out across several phases for an
    // architectural reason rather than a product one: a source for it was written
    // in Trust, worked at runtime, and was reverted because the platform's tests
    // refuse Trust depending on Identity's domain and refuse a module depending on
    // one composed after it. BG-05a closed it by giving Community its own member
    // projection — `CommunityMember`, fed by `UserRegisteredIntegrationEvent` — so
    // `MemberContentSource` lives in Community and reaches into nothing. All 693
    // architecture tests still pass.
    const modal = source('components', 'ReportModal.tsx');

    expect(modal).toContain("Job: 'job'");
    expect(modal).toContain("Organization: 'organization'");
    expect(modal).toContain("Message: 'message'");
    expect(modal).toContain("Member: 'member'");
    expect(modal).not.toContain('Job: null');
    expect(modal).not.toContain('Member: null');

    // The refusal branch stays, unreachable, because the *mapping* is what
    // decides — a subject added tomorrow against an unclaimed type must still
    // meet a sentence rather than a form.
    expect(modal).toContain('Diaspora cannot report this yet');
  });

  it('offers a message report and keeps blocking as the immediate action', () => {
    // The inbox was the one surface with no way to raise a complaint. It has one
    // now — but a report is reviewed and a block takes effect immediately, so the
    // screen must still offer both.
    const screen = visible('app', 'conversation', '[id].tsx');

    expect(screen).not.toContain('Diaspora cannot report messages yet');
    expect(screen).toContain('Report message');
    expect(screen).toContain('contentType="Message"');
    expect(screen).toMatch(/Block \$\{otherParty\.displayName\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A disclosure is not a state
// ─────────────────────────────────────────────────────────────────────────────

describe('a gap notice is never the only thing a branch renders', () => {
  // -- The defect this exists for ──────────────────────────────────────────────────────────────────────
  //
  // `PerformancePanel` answered "there is no report" by returning the gap notice
  // and nothing else. That reads as an empty state for exactly as long as the
  // gap is open. The day MON-GAP-002 connected, the notice went quiet -- which is
  // correct -- and took the panel's only no-data rendering with it, so a campaign
  // that had not been delivered yet drew a heading over blank space.
  //
  // The failure is silent in every check that existed: types pass, the register
  // is accurate, the notice behaves as designed, and the screen renders nothing.
  // It is only visible on a device, on the narrow day a gap closes.
  //
  // -- The rule ──────────────────────────────────────────────────────────────────────
  //
  // A gap notice may sit *beside* what a branch renders. It may not *be* it.
  // Disclosures expire by design; the state underneath has to survive them.
  it('never returns a gap notice as an entire branch', () => {
    const fs = require('fs');
    const path = require('path');

    const root = process.cwd();
    const files: string[] = [];

    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
        } else if (entry.name.endsWith('.tsx')) {
          files.push(full);
        }
      }
    };

    walk(path.join(root, 'src', 'app'));
    walk(path.join(root, 'src', 'components'));

    // `return <XGapNotice`, and the ternary spellings on either side of a null.
    const SOLE_NOTICE = /return\s+(?:[^;{}<]*\?\s*)?(?:null\s*:\s*)?<[A-Za-z]*GapNotice\b/;

    const offenders: string[] = [];

    for (const file of files) {
      const source: string = fs.readFileSync(file, 'utf8');

      source.split('\n').forEach((line: string, index: number) => {
        if (SOLE_NOTICE.test(line)) {
          offenders.push(`${path.relative(root, file)}:${index + 1}  ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe('a person is reported for conduct, not for being inaccurate', () => {
  // Found on a device: "Report this person" opened a form headed "Category of
  // violation" whose choices were "Conflicting information (with another post)"
  // and "Inaccurate or outdated details". Two of the five were unanswerable
  // about a human being, and the two a person is most often reported for --
  // exposing somebody's private details, and conduct rather than a post -- were
  // not offered at all.
  //
  // That is a moderation problem as much as a wording one. The server's own
  // catalogue notes that PersonalData "carries a legal clock"; a report that
  // could only be filed as Other arrives without the attribute that would
  // prioritise it.
  it('offers conduct reasons when the subject is a person or an organisation', () => {
    const modal = source('components', 'ReportModal.tsx');

    expect(modal).toContain('SUBJECT_CATEGORIES');
    expect(modal).toMatch(/Harassment or abusive behaviour/);
    expect(modal).toMatch(/private information/);

    // And the heading has to ask a question those answers fit.
    expect(modal).toContain("'What are you reporting?'");
  });

  it('keeps the content reasons for content', () => {
    const modal = source('components', 'ReportModal.tsx');

    expect(modal).toContain('CONTENT_CATEGORIES');
    expect(modal).toContain('Conflicting information (with another post)');
    expect(modal).toContain('Category of violation');
  });

  it('sends only reason keys the server resolves', () => {
    // Verified against the running API on 22 Aug 2026: each key below was
    // submitted against a distinct subject and read back from
    // `community.content_reports`, landing on its own distinct enum member --
    // Harassment, Inappropriate, Spam, PersonalData, Other. Testing the keys
    // rather than a 201 is deliberate: a duplicate report answers 409, so a
    // status code alone cannot tell an accepted reason from a rejected one.
    const modal = source('components', 'ReportModal.tsx');

    const subjectBlock = modal.slice(
      modal.indexOf('const SUBJECT_CATEGORIES'),
      modal.indexOf('function categoriesFor'),
    );
    const keys = Array.from(subjectBlock.matchAll(/key: '([^']+)'/g)).map((m) => m[1]);

    expect(keys).toEqual(['abusive', 'inappropriate', 'spam', 'personalData', 'other']);
  });


  it('asks for conduct in the details prompt too', () => {
    // The reasons were fixed first and the prompt below them was not, so the
    // form asked somebody reporting harassment to "describe why this content is
    // incorrect, misleading, or inappropriate". Found on a device after the
    // reason list already read correctly.
    const modal = source('components', 'ReportModal.tsx');

    expect(modal).toContain('What happened?');
    expect(modal).toContain('isSubjectReport');

    // The content prompt stays for content.
    expect(modal).toContain('Describe why this content is incorrect');
  });

  it('does not leave three overlapping report controls in the conversation sheet', () => {
    // "Report or block" told the member to "open the message you want to report
    // and choose Report from there". That was honest while a conversation was
    // the only unreportable subject in the sheet; it became false the moment
    // "Report this person" was added directly above it.
    const screen = source('app', 'conversation', '[id].tsx');

    const labels = Array.from(screen.matchAll(/label: '([^']+)'/g)).map((m) => m[1]);
    expect(labels).toContain('Report this person');
    expect(labels).toContain('Block User');
    expect(labels).not.toContain('Report or block');

    // The message-level flow it used to share is untouched.
    expect(screen).toContain('onReport={handleReport}');
  });
});
