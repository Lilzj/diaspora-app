// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Identity development handlers (Remediation Wave A)
//
// **These handlers were the reason the sign-in defect survived development.**
//
// They served `/auth/otp/send` and `/auth/otp/verify` — the two routes the
// client addressed and the platform has never mapped — and they returned
// `{ data: { accessToken, user: { userId } } }`, which is the shape the client
// expected rather than the shape `AuthenticationResponse` has. So under Metro
// everything worked: the paths matched, the payload parsed, the member signed
// in. The mock had been written from the client's assumptions instead of from
// the server's contract, and it validated the assumption it was derived from.
//
// They now mirror `Diaspora.Api/Identity/Controllers/AuthController.cs`:
//
//   POST /auth/register      -> 201 RegistrationResponse   (no tokens, by design)
//   POST /auth/verify-phone  -> 200 AuthenticationResponse
//   POST /auth/otp/start     -> 200 OperationAcknowledgedResponse (no metadata)
//   POST /auth/otp/sign-in   -> 200 AuthenticationResponse
//   POST /auth/resend-otp    -> 200 OtpChallengeResponse
//   POST /auth/refresh       -> 200 AuthenticationResponse   (rotates)
//   POST /auth/logout        -> 200 OperationAcknowledgedResponse
//   GET  /auth/me            -> 200 UserProfileResponse
//
// The two properties worth keeping: `otp/start` returns an acknowledgement and
// nothing else, because a response that varied by whether the number was
// registered would let this route enumerate accounts; and `refresh` issues a
// *new* refresh token every time, because ADR-003 rotates and a handler that
// returned the same one would hide a client that reuses a spent token.
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import { platformProblem } from '../platform-problem';

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_DAYS = 30;

let rotation = 0;

function envelope<T>(data: T) {
  return {
    data,
    meta: {
      requestId: `dev-${Date.now()}`,
      correlationId: `dev-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * The access state a development phone number produces.
 *
 * Preserved from the previous handler because the suffixes are how anybody
 * exercises the gateway states without a real backend.
 */
function accessStateFor(phoneNumber: string | undefined): string {
  if (phoneNumber?.endsWith('666')) return 'Suspended';
  if (phoneNumber?.endsWith('999')) return 'VerificationRejected';
  if (phoneNumber?.endsWith('775')) return 'LimitedAccess';
  return 'DiasporaVerified';
}

function destinationFor(accessState: string): string {
  return accessState === 'DiasporaVerified' ? '/(tabs)' : '/access-gateway';
}

function userProfile(phoneNumber: string, accessState: string) {
  const now = new Date();
  return {
    id: 'user-123',
    fullName: 'Amara Kone',
    phoneNumber,
    email: null,
    nationality: 'NG',
    countryOfResidence: 'GB',
    preferredLanguage: 'en',
    preferredTimeZone: 'Europe/London',
    avatarStorageKey: null,
    role: 'CommunityUser',
    accessState,
    accountStatus: accessState === 'Suspended' ? 'Suspended' : 'Active',
    isPhoneVerified: true,
    createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
    lastLoginAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
  };
}

function authenticationResponse(phoneNumber: string) {
  const accessState = accessStateFor(phoneNumber);
  const now = Date.now();
  rotation += 1;

  return {
    tokens: {
      accessToken: `dev_access_${rotation}`,
      // Rotated on every issue. A handler that returned a constant would let a
      // client reuse a spent refresh token indefinitely and never find out.
      refreshToken: `dev_refresh_${rotation}`,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TTL_SECONDS,
      accessTokenExpiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(now + REFRESH_TTL_DAYS * 86_400_000).toISOString(),
    },
    user: userProfile(phoneNumber, accessState),
    access: {
      accessState,
      accountStatus: accessState === 'Suspended' ? 'Suspended' : 'Active',
      destination: destinationFor(accessState),
      message: 'Signed in.',
      requiredActions: accessState === 'DiasporaVerified' ? [] : ['CompleteDiasporaVerification'],
      grantedFeatures: [],
      blockedFeatures: [],
      permissions: [],
      restrictedUntil: null,
    },
    sessionId: `session-${rotation}`,
  };
}

function otpChallenge(phoneNumber: string, purpose: string) {
  return {
    phoneNumber,
    purpose,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    attemptsRemaining: 5,
    resendsRemaining: 3,
    resendAvailableInSeconds: 45,
  };
}

export function setupAuthMocks(mock: MockAdapter) {
  mock.onPost('/auth/register').reply((config) => {
    const { phoneNumber } = JSON.parse(config.data ?? '{}');

    if (phoneNumber?.endsWith('000')) {
      return platformProblem(409, 'That number is already registered.');
    }

    // 201, and deliberately no tokens: an unverified account holds no usable
    // access. A handler that returned a session here would let the client skip
    // `verify-phone`, which is exactly what the old registration flow did.
    return [
      201,
      envelope({
        userId: 'user-123',
        phoneNumber,
        accessState: 'PhoneVerificationPending',
        verification: otpChallenge(phoneNumber, 'register'),
      }),
    ];
  });

  mock.onPost('/auth/verify-phone').reply((config) => {
    const { code, phoneNumber } = JSON.parse(config.data ?? '{}');
    if (code === '000000') {
      return [401, { title: 'Unauthorized', detail: 'That code is not right.', status: 401 }];
    }
    return [200, envelope(authenticationResponse(phoneNumber))];
  });

  // Acknowledgement only. See the file header.
  mock.onPost('/auth/otp/start').reply(200, envelope({ message: 'If that number is registered, a code is on its way.' }));

  mock.onPost('/auth/otp/sign-in').reply((config) => {
    const { code, phoneNumber } = JSON.parse(config.data ?? '{}');
    if (code === '000000') {
      return [
        401,
        { title: 'Unauthorized', detail: 'That code is not right.', status: 401, attemptsRemaining: 3 },
      ];
    }
    return [200, envelope(authenticationResponse(phoneNumber))];
  });

  mock.onPost('/auth/resend-otp').reply((config) => {
    const { phoneNumber, purpose } = JSON.parse(config.data ?? '{}');
    return [200, envelope(otpChallenge(phoneNumber, purpose ?? 'verify'))];
  });

  mock.onPost('/auth/refresh').reply((config) => {
    const { refreshToken } = JSON.parse(config.data ?? '{}');
    if (!refreshToken || refreshToken === 'expired') {
      return platformProblem(401, 'That session has ended.');
    }
    return [200, envelope(authenticationResponse('+447700900123'))];
  });

  mock.onPost('/auth/logout').reply(200, envelope({ message: 'Signed out.' }));

  mock.onGet('/auth/me').reply(200, envelope(userProfile('+447700900123', 'DiasporaVerified')));
}
