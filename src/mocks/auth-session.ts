// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Authentication fixture builder (Remediation Wave A)
//
// A well-formed `AuthenticationResult` for suites that need a signed-in member
// before they can assert anything else.
//
// ── Why this is a fixture and not a store method ─────────────────────────────
//
// The store used to export `login(user, token)`, and because it existed, a
// *screen* used it: `app/(auth)/enable-location.tsx` completed registration by
// calling it with `userId: 'user-123'` and `mock_access_token`. A convenience
// seam for tests became the production sign-in path, and nothing in review
// caught it because the call looked exactly like a real one.
//
// So the seam is gone from the store. The only route into an authenticated
// state is `adoptSession(result)`, which takes a value the server mints — and a
// test that wants one builds it here, in `mocks/`, where the fact that it is
// fabricated is the file's whole subject.
//
// Building the *whole* shape also means a test fails when the contract moves.
// That is the point: `tokens.refreshToken` and `access.permissions` were both
// absent from the client's model of this response, and a fixture that mirrored
// the old shape would have kept them absent.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccessDecision, AuthenticationResult, UserProfile } from '@/types/auth';

/** One hour out, which is longer than any test run and shorter than a real token. */
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthFixtureOverrides {
  userId?: string;
  fullName?: string;
  role?: string;
  accessState?: string;
  phoneNumber?: string;
  email?: string | null;
  permissions?: string[];
  grantedFeatures?: string[];
  accessToken?: string;
  refreshToken?: string;
  /** Milliseconds from now. Negative values produce an already-expired token. */
  accessTokenTtlMs?: number;
  refreshTokenTtlMs?: number;
  destination?: string;
}

export function buildAuthenticationResult(
  overrides: AuthFixtureOverrides = {}
): AuthenticationResult {
  const now = Date.now();
  const accessState = overrides.accessState ?? 'DiasporaVerified';

  const user: UserProfile = {
    id: overrides.userId ?? 'user-current',
    fullName: overrides.fullName ?? 'Test Member',
    phoneNumber: overrides.phoneNumber ?? '+447700900000',
    email: overrides.email ?? null,
    nationality: 'NG',
    countryOfResidence: 'GB',
    preferredLanguage: 'en',
    preferredTimeZone: 'Europe/London',
    avatarStorageKey: null,
    role: overrides.role ?? 'Member',
    accessState,
    accountStatus: 'Active',
    isPhoneVerified: true,
    createdAt: new Date(now - THIRTY_DAYS_MS).toISOString(),
    lastLoginAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
  };

  const access: AccessDecision = {
    accessState,
    accountStatus: 'Active',
    destination: overrides.destination ?? '/(tabs)',
    message: 'Signed in.',
    requiredActions: [],
    grantedFeatures: overrides.grantedFeatures ?? [],
    blockedFeatures: [],
    permissions: overrides.permissions ?? [],
    restrictedUntil: null,
  };

  return {
    tokens: {
      accessToken: overrides.accessToken ?? 'test-access-token',
      refreshToken: overrides.refreshToken ?? 'test-refresh-token',
      tokenType: 'Bearer',
      expiresIn: Math.floor((overrides.accessTokenTtlMs ?? ONE_HOUR_MS) / 1000),
      accessTokenExpiresAt: new Date(now + (overrides.accessTokenTtlMs ?? ONE_HOUR_MS)).toISOString(),
      refreshTokenExpiresAt: new Date(
        now + (overrides.refreshTokenTtlMs ?? THIRTY_DAYS_MS)
      ).toISOString(),
    },
    user,
    access,
    sessionId: 'session-test',
  };
}
