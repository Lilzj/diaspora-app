// ─────────────────────────────────────────────────────────────────────────────
// DEFECT-015 — the auth redirect only ever pointed one way
//
// `_layout.tsx` sent a signed-out member *into* `(auth)`. Nothing sent a
// signed-in one back *out*, and the app's initial route is `(auth)/index` — the
// marketing page. So on every cold start a member with a valid session landed on
// "Join Your Community · Already have an account? Sign in" and signed in again.
//
// The session was never the problem, which is what made it invisible from the
// client alone. Observed on a device, in one launch window:
//
//     GET  /financial/capabilities   401
//     GET  /financial/wallets/me     200
//     POST /auth/refresh             200     ← it refreshed its own token
//     GET  /financial/capabilities   200
//
// while rendering the signed-out page. Authenticated throughout; only the
// routing disagreed.
//
// ── Why the rule is duplicated here rather than imported ─────────────────────
//
// `_layout.tsx` is the root component: importing it pulls in every provider, the
// router and the whole navigation tree, and the test would become a rendering
// test of the entire application. The decision itself is four lines of pure
// logic over three inputs, and that is what is worth pinning — including the two
// states where the correct action is *nothing*, which is where the previous
// version of this rule went wrong in the opposite direction.
// ─────────────────────────────────────────────────────────────────────────────

type Status = 'unknown' | 'restoring' | 'refreshing' | 'authenticated' | 'unauthenticated';

type Destination = '/(auth)/login' | '/(tabs)' | null;

/** The redirect decision from `_layout.tsx`, in isolation. */
function decide(input: {
  status: Status;
  isAuthenticated: boolean;
  isExploringLimited: boolean;
  segments: string[];
}): Destination {
  const { status, isAuthenticated, isExploringLimited, segments } = input;

  if (status === 'unknown' || status === 'restoring' || status === 'refreshing') return null;

  const inAuthGroup = segments[0] === '(auth)' || !segments[0];

  if (!isAuthenticated && !isExploringLimited && !inAuthGroup) return '/(auth)/login';
  if (isAuthenticated && inAuthGroup && !isExploringLimited) return '/(tabs)';

  return null;
}

const signedIn = { status: 'authenticated' as Status, isAuthenticated: true, isExploringLimited: false };
const signedOut = { status: 'unauthenticated' as Status, isAuthenticated: false, isExploringLimited: false };

describe('DEFECT-015 — a signed-in member is moved out of the auth group', () => {
  it('redirects to the app when a restored session lands on the marketing page', () => {
    // `segments: []` is the app's initial route, which resolves to `(auth)/index`.
    expect(decide({ ...signedIn, segments: [] })).toBe('/(tabs)');
  });

  it('redirects to the app from anywhere inside the auth group', () => {
    expect(decide({ ...signedIn, segments: ['(auth)'] })).toBe('/(tabs)');
    expect(decide({ ...signedIn, segments: ['(auth)', 'login'] })).toBe('/(tabs)');
  });

  it('leaves a signed-in member alone once they are in the app', () => {
    expect(decide({ ...signedIn, segments: ['(tabs)'] })).toBeNull();
    expect(decide({ ...signedIn, segments: ['marketplace', 'create'] })).toBeNull();
  });

  /**
   * A deliberate signed-out browse. The member chose it and has not asked to be
   * moved, so neither redirect fires.
   */
  it('does not move somebody who chose to explore without signing in', () => {
    expect(decide({ ...signedIn, isExploringLimited: true, segments: [] })).toBeNull();
    expect(decide({ ...signedOut, isExploringLimited: true, segments: ['(tabs)'] })).toBeNull();
  });
});

describe('the original rule, still holding', () => {
  it('sends a signed-out member to login', () => {
    expect(decide({ ...signedOut, segments: ['(tabs)'] })).toBe('/(auth)/login');
    expect(decide({ ...signedOut, segments: ['marketplace', 'create'] })).toBe('/(auth)/login');
  });

  it('leaves a signed-out member alone inside the auth group', () => {
    expect(decide({ ...signedOut, segments: ['(auth)', 'login'] })).toBeNull();
  });
});

describe('not-yet-known means do nothing', () => {
  /**
   * The failure the `status` union was introduced for: a restored session takes
   * a tick to read, and for that tick `isAuthenticated` is `false` and
   * indistinguishable from "signed out". Acting on it bounced signed-in members
   * to login — the mirror image of DEFECT-015, and the reason neither branch may
   * fire until the status resolves.
   */
  it.each(['unknown', 'restoring', 'refreshing'] as const)('does nothing while %s', (status) => {
    expect(decide({ status, isAuthenticated: false, isExploringLimited: false, segments: ['(tabs)'] })).toBeNull();
    expect(decide({ status, isAuthenticated: true, isExploringLimited: false, segments: [] })).toBeNull();
  });
});
