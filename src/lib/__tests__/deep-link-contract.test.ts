// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Deep-link route contract (Remediation Wave G)
//
// This test and `DeepLinkRouteTableTests` in the backend repository assert the
// same literal set of prefixes. Neither can see the other repository, and that
// is deliberate: a shared fixture would have to live somewhere, and wherever it
// lived one side would own it. Two independent copies of the same list mean a
// one-sided edit turns red on the side that made it.
//
// ── What this catches, and why nothing caught it before ──────────────────────
//
// The backend's table said `/jobs`, `/guides`, `/providers`, `/events`,
// `/organizations` and `/trust`. The client's router serves `/job/[id]`,
// `/guide/[id]`, `/provider/[id]`, `/community-life/event/[id]`,
// `/community-life/org/[id]` and `/profile/trust-center`. The client also had
// screens for `/messages`, `/knowledge` and `/search` that its own allowlist did
// not mention.
//
// Ten of twenty-one backend prefixes could not be opened. The failure was
// silent on both sides: the backend's resolver accepted the routes because they
// passed its own table, and the client refused them on arrival and fell back to
// the inbox — which is correct degradation and therefore looks exactly like
// nothing being wrong. Roughly half of the platform's notification templates
// deep-linked into that hole, including `jobs.application.new`,
// `jobs.interview.scheduled`, `events.reminder` and `provider.review.received`.
// ─────────────────────────────────────────────────────────────────────────────

import { KNOWN_PREFIXES, isResolvableRoute } from '../notification-routes';

/**
 * The agreed contract, as a literal.
 *
 * Written out rather than derived from `KNOWN_PREFIXES` — deriving it would
 * make the test pass for any edit, which is the one thing it must not do.
 */
const AGREED_PREFIXES = [
  '/notifications',
  '/settings',
  '/profile',
  '/verification',
  '/saved',
  '/search',
  '/explore',
  '/job',
  '/employer',
  '/marketplace',
  '/housing',
  '/provider',
  '/guide',
  '/knowledge',
  '/neighborhood',
  '/country',
  '/intelligence',
  '/update',
  '/contributor',
  '/community',
  '/community-life',
  '/messages',
  '/conversation',
  '/wallet',
  '/monetization',
  '/creator',
  '/automation',
  '/moderation',
] as const;

describe('the deep-link prefix contract', () => {
  it('matches the set the backend will emit, exactly', () => {
    expect([...KNOWN_PREFIXES].sort()).toEqual([...AGREED_PREFIXES].sort());
  });

  it('has no duplicates', () => {
    expect(new Set(KNOWN_PREFIXES).size).toBe(KNOWN_PREFIXES.length);
  });
});

describe('the prefixes that used to be unopenable', () => {
  // Each of these is a route the backend emitted and this client refused. The
  // singular forms are the ones backed by real screens.
  it.each([
    ['/job/8f2c', 'jobs.application.new · jobs.interview.scheduled'],
    ['/guide/abc', 'guides.featured · learning.guide.featured'],
    ['/provider/xyz', 'provider.review.received · provider.recommendation.received'],
    ['/community-life/event/1', 'events.reminder · events.rsvp.received'],
    ['/community-life/org/1', 'organizations.membership.approved'],
    ['/messages', 'conversation attention'],
    ['/knowledge', 'country knowledge surfaces'],
    ['/search', 'saved-search results'],
  ])('resolves %s (%s)', (route) => {
    expect(isResolvableRoute(route)).toBe(true);
  });
});

describe('what the allowlist still refuses', () => {
  it('refuses a plural form, so a regression on the backend is visible here', () => {
    // If the backend ever reverts to `/jobs`, the link stops resolving and this
    // is the test that says why.
    expect(isResolvableRoute('/jobs/8f2c')).toBe(false);
    expect(isResolvableRoute('/guides/abc')).toBe(false);
    expect(isResolvableRoute('/providers/xyz')).toBe(false);
  });

  it('refuses a prefix this build has no screen for', () => {
    expect(isResolvableRoute('/learning/paths')).toBe(false);
    expect(isResolvableRoute('/organizations/1')).toBe(false);
    expect(isResolvableRoute('/trust/profile')).toBe(false);
  });

  it('refuses a partial-segment match', () => {
    // `/jobsearch` starts with `/job` as a string but is not under it as a route.
    expect(isResolvableRoute('/jobsearch')).toBe(false);
    expect(isResolvableRoute('/settings-export')).toBe(false);
  });

  it('refuses anything that is not an in-app path', () => {
    expect(isResolvableRoute('https://example.com/job/1')).toBe(false);
    expect(isResolvableRoute('job/1')).toBe(false);
    expect(isResolvableRoute('')).toBe(false);
    expect(isResolvableRoute(null)).toBe(false);
    expect(isResolvableRoute(undefined)).toBe(false);
  });
});
