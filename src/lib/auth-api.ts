// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Identity client, certified arm (Remediation Wave A)
//
// Every route in this file is real. Each was read from
// `Diaspora.Api/Identity/Controllers/AuthController.cs` at HEAD rather than from
// a phase report, and each request body matches the `Diaspora.Contracts` record
// it binds to.
//
//   POST /auth/register        RegisterRequest      -> RegistrationResponse
//   POST /auth/verify-phone    VerifyPhoneRequest   -> AuthenticationResponse
//   POST /auth/resend-otp      ResendOtpRequest     -> OtpChallengeResponse
//   POST /auth/otp/start       RequestSignInOtpRequest -> OperationAcknowledgedResponse
//   POST /auth/otp/sign-in     OtpSignInRequest     -> AuthenticationResponse
//   POST /auth/login           LoginRequest         -> AuthenticationResponse
//   POST /auth/refresh         RefreshTokenRequest  -> AuthenticationResponse
//   POST /auth/logout          LogoutRequest        -> OperationAcknowledgedResponse
//   GET  /auth/me                                   -> UserProfileResponse
//
// ── The two routes this file exists to correct ───────────────────────────────
//
// The client called `POST /auth/otp/send` and `POST /auth/otp/verify`. Neither
// has ever existed on this platform. The backend serves `otp/start` and
// `otp/sign-in`, and its own XML documentation names the client as the intended
// consumer of both. Every member sign-in 404'd.
//
// ── Why there are two transports ─────────────────────────────────────────────
//
// `apiClient` attaches a bearer token and, since Wave A, retries a 401 by
// refreshing. Neither behaviour is wanted here:
//
//   * The anonymous routes have no session to attach, and sending a *stale*
//     bearer to `otp/sign-in` is how a signed-out member gets a 401 from a route
//     that should have accepted them.
//   * `refresh` is what the 401 interceptor calls. Routing it back through the
//     interceptor would recurse until the stack gave out.
//
// So the anonymous surface uses `authTransport` — the same base URL, the same
// timeout, no interceptors — and only the two authenticated routes use
// `apiClient`.
//
// ── Registration is two calls, not one ───────────────────────────────────────
//
// `POST /auth/register` deliberately returns **no tokens**: an unverified
// account holds no usable access, which is the property the two-step design
// exists to guarantee. `POST /auth/verify-phone` issues the first pair. A client
// that treated registration as sign-in — as this one did, with a hard-coded
// `userId: 'user-123'` and the literal string `mock_access_token` — was not
// simply skipping a call; it was asserting an access state the server had
// refused to grant.
// ─────────────────────────────────────────────────────────────────────────────

import axios, { type AxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { apiClient, API_BASE_URL, REQUEST_TIMEOUT_MS } from './apiClient';
import { integrationError, toIntegrationError, parseRetryAfter } from './integrations/errors';
import type { EmailIdentityState } from './integrations-gap-api';
import type {
  AuthSession,
  AuthenticationResult,
  ChangePasswordRequestBody,
  DeviceDescriptor,
  ForgotPasswordRequestBody,
  SecurityEvent,
  LogoutRequestBody,
  OperationAcknowledged,
  OtpChallenge,
  OtpSignInRequestBody,
  PasswordLoginRequestBody,
  PlatformEnvelope,
  RegisterRequestBody,
  RegistrationResult,
  ResendOtpRequestBody,
  ResetPasswordRequestBody,
  StartOtpRequestBody,
  UserProfile,
  VerifyPhoneRequestBody,
} from '@/types/auth';

const ROOT = '/auth';

/** The interceptor-free transport. See the file header for why it exists. */
export const authTransport = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: REQUEST_TIMEOUT_MS,
});

// ── Device descriptor ────────────────────────────────────────────────────────

let cachedDevice: DeviceDescriptor | null = null;

/**
 * What this device calls itself, for the server's session list.
 *
 * Every token-issuing route accepts these and the client sent none of them, so
 * `GET /auth/sessions` had nothing to distinguish one row from another — which
 * makes "revoke the session on my lost phone" impossible to do correctly.
 *
 * Resolved lazily and cached: `expo-constants` reads a bundled manifest, and
 * doing that on every sign-in attempt buys nothing.
 */
export function describeDevice(): DeviceDescriptor {
  if (cachedDevice) return cachedDevice;

  let appVersion: string | undefined;
  let deviceIdentifier: string | undefined;
  let deviceName: string | undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    appVersion = Constants?.expoConfig?.version ?? undefined;
    // `installationId` is stable per install and is not a hardware identifier —
    // §21 forbids shipping a device fingerprint, and the server only needs to
    // tell two installs apart.
    deviceIdentifier = Constants?.sessionId ?? Constants?.installationId ?? undefined;
    deviceName = Constants?.deviceName ?? undefined;
  } catch {
    // A build without expo-constants still has to be able to sign in.
  }

  cachedDevice = {
    deviceIdentifier,
    deviceName: deviceName ?? `Diaspora on ${Platform.OS}`,
    platform: Platform.OS,
    appVersion,
  };
  return cachedDevice;
}

// ── Error mapping ────────────────────────────────────────────────────────────

// The existing taxonomy already names this surface: `identity.phone` is the
// provider §21–§23 defined for phone-based identity, and `identity.signIn` is
// its capability. Minting `diaspora.identity` / `identity.authentication`
// instead would have been a second vocabulary for the same thing — which is how
// two error catalogues start.
const CAPABILITY = 'identity.signIn';
const PROVIDER = 'identity.phone';

/** Pulls the human-readable half out of an RFC 9457 problem document. */
function problemDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const problem = payload as { detail?: unknown; title?: unknown; message?: unknown };
  for (const candidate of [problem.detail, problem.title, problem.message]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return undefined;
}

function attemptsRemaining(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as { attemptsRemaining?: unknown }).attemptsRemaining;
  return typeof value === 'number' ? value : undefined;
}

/**
 * Maps a failed identity call onto the shared integration error taxonomy.
 *
 * Reusing `IntegrationError` rather than minting an `AuthError` is deliberate:
 * the OTP screens already render `kind`, `hint` and `retryAfterSeconds`, and a
 * second error type would mean a second set of rendering rules that drift.
 *
 * The one mapping worth stating: **a 401 from an anonymous route is a rejected
 * credential, not an expired session.** `otp/sign-in` has no session to expire,
 * so reporting "your session has ended" there would send a member to re-do
 * something they were in the middle of.
 */
function toAuthError(
  cause: unknown,
  options: { anonymous: boolean; mutating: boolean }
): never {
  if (axios.isAxiosError(cause) && cause.response) {
    const status = cause.response.status;
    const payload = cause.response.data;
    const detail = problemDetail(payload);

    if (status === 429) {
      throw integrationError('RateLimited', {
        provider: PROVIDER,
        capability: CAPABILITY,
        message: detail ?? 'Too many attempts.',
        hint: 'Please wait before trying again.',
        retryAfterSeconds: parseRetryAfter(cause.response.headers?.['retry-after']),
      });
    }

    if (status === 401 && options.anonymous) {
      const remaining = attemptsRemaining(payload);
      throw integrationError('InvalidRequest', {
        provider: PROVIDER,
        capability: CAPABILITY,
        // **Neither string names a credential.** This branch serves every
        // anonymous 401 — password sign-in, OTP verification, password reset —
        // and `toAuthError` is given no operation to tell them apart. It used to
        // say "That code is not right" and "Check the code and try again",
        // which on the email-and-password sign-in form told a member to check a
        // code nobody had sent them. The server's own `detail` carries the
        // specific message where there is one.
        message: detail ?? 'Those details are not right.',
        hint:
          remaining != null
            ? `${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`
            : 'Check them and try again.',
      });
    }

    if (status === 409) {
      throw integrationError('Conflict', {
        provider: PROVIDER,
        capability: CAPABILITY,
        message: detail ?? 'An account with that number already exists.',
        hint: 'Try signing in instead.',
      });
    }

    if (status === 400 || status === 422) {
      throw integrationError('InvalidRequest', {
        provider: PROVIDER,
        capability: CAPABILITY,
        message: detail ?? 'Some of those details were not accepted.',
        hint: 'Check the highlighted fields and try again.',
      });
    }

    if (status === 403) {
      throw integrationError('PermissionDenied', {
        provider: PROVIDER,
        capability: CAPABILITY,
        message: detail ?? 'This account cannot sign in right now.',
        hint: 'Contact support if you think this is wrong.',
      });
    }
  }

  throw toIntegrationError(cause, {
    provider: PROVIDER,
    capability: CAPABILITY,
    mutating: options.mutating,
  });
}

function unwrap<T>(payload: PlatformEnvelope<T> | undefined, what: string): T {
  const data = payload?.data;
  if (data == null) {
    // A 2xx with no payload is a contract violation, not a success. Treating it
    // as one is how a client ends up "signed in" holding nothing.
    throw integrationError('BackendUnavailable', {
      provider: PROVIDER,
      capability: CAPABILITY,
      message: `${what} did not complete.`,
      hint: 'Please try again.',
    });
  }
  return data;
}

/** Guards the one thing that must never be half-present. */
function assertSession(result: AuthenticationResult): AuthenticationResult {
  if (!result?.tokens?.accessToken || !result?.tokens?.refreshToken || !result?.user?.id) {
    throw integrationError('BackendUnavailable', {
      provider: PROVIDER,
      capability: CAPABILITY,
      message: 'Sign-in did not complete.',
      hint: 'Please try again.',
    });
  }
  return result;
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Creates the account and sends the first verification code.
 *
 * Returns no tokens by design. The caller must take `verification` to the OTP
 * screen and redeem it through {@link verifyPhone}.
 */
export async function register(body: RegisterRequestBody): Promise<RegistrationResult> {
  try {
    const response = await authTransport.post<PlatformEnvelope<RegistrationResult>>(
      `${ROOT}/register`,
      body
    );
    return unwrap(response.data, 'Registration');
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: true });
  }
}

/** Redeems the registration code. This is the call that issues the first token pair. */
export async function verifyPhone(
  body: Omit<VerifyPhoneRequestBody, keyof DeviceDescriptor>
): Promise<AuthenticationResult> {
  try {
    const response = await authTransport.post<PlatformEnvelope<AuthenticationResult>>(
      `${ROOT}/verify-phone`,
      { ...body, ...describeDevice() }
    );
    return assertSession(unwrap(response.data, 'Verification'));
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: false });
  }
}

// ── Passwordless sign-in ─────────────────────────────────────────────────────

/**
 * Starts a passwordless sign-in.
 *
 * The response is `OperationAcknowledgedResponse` — a message and nothing else —
 * and that is deliberate on the server's side: an identical answer whether or
 * not the number is registered is what stops this route enumerating accounts.
 *
 * So it carries **no cooldown metadata**, and the client must not pretend
 * otherwise. {@link resendOtp} is the route that returns a real
 * `OtpChallengeResponse`, and the OTP screen distinguishes the two.
 */
export async function startOtpSignIn(body: StartOtpRequestBody): Promise<OperationAcknowledged> {
  try {
    const response = await authTransport.post<PlatformEnvelope<OperationAcknowledged>>(
      `${ROOT}/otp/start`,
      body
    );
    return unwrap(response.data, 'Sending the code');
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: true });
  }
}

/** Completes a passwordless sign-in. Same response shape as `login` and `verify-phone`. */
export async function otpSignIn(
  body: Omit<OtpSignInRequestBody, keyof DeviceDescriptor>
): Promise<AuthenticationResult> {
  try {
    const response = await authTransport.post<PlatformEnvelope<AuthenticationResult>>(
      `${ROOT}/otp/sign-in`,
      { ...body, ...describeDevice() }
    );
    return assertSession(unwrap(response.data, 'Sign-in'));
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: false });
  }
}

/** Requests a replacement code. Returns the real cooldown, attempt and resend budget. */
export async function resendOtp(body: ResendOtpRequestBody): Promise<OtpChallenge> {
  try {
    const response = await authTransport.post<PlatformEnvelope<OtpChallenge>>(
      `${ROOT}/resend-otp`,
      body
    );
    return unwrap(response.data, 'Resending the code');
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: true });
  }
}

/**
 * Sign in with an email address and a password.
 *
 * ── Why this replaced the one-time code ─────────────────────────────────────
 *
 * Sign-in used to be `startOtpSignIn` + `otpSignIn`: two calls, and an **SMS on
 * every single sign-in**. A password costs nothing to deliver. SMS is now spent
 * only on phone verification — the one thing a message actually proves, and a
 * once-per-account event rather than a once-per-session one.
 *
 * This function existed before any screen called it, recorded as a frontend gap
 * (UAT-021). It is now the only sign-in the application performs.
 */
export async function loginWithPassword(
  body: Omit<PasswordLoginRequestBody, keyof DeviceDescriptor>
): Promise<AuthenticationResult> {
  try {
    const response = await authTransport.post<PlatformEnvelope<AuthenticationResult>>(
      `${ROOT}/login`,
      { ...body, ...describeDevice() }
    );
    return assertSession(unwrap(response.data, 'Sign-in'));
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: false });
  }
}

// ── Password lifecycle ───────────────────────────────────────────────────────
//
// None of the three below had a client function or a screen before this change,
// which is how the platform reached a state where `settings/delete-account`
// **required** the password while the product offered no way to change it, no
// way to recover it, and never asked for it at sign-in. A member who forgot the
// password they set at registration could not delete their own account
// (UAT-127). The routes were deployed and answering the whole time.

/**
 * Starts account recovery.
 *
 * **Always resolves**, whether or not the address belongs to an account: the
 * server answers identically either way so that this endpoint cannot be used to
 * discover who has registered. Treat a success as "if that address exists, a
 * code is on its way" and never as confirmation the account is real.
 *
 * The member is identified by **email** — the credential they actually use —
 * but the code is delivered by **SMS to the phone on the account**, because the
 * deployment has no configured email sender. The server's acknowledgement says
 * so, and the screen shows the server's sentence rather than inventing one.
 */
export async function forgotPassword(
  body: ForgotPasswordRequestBody
): Promise<OperationAcknowledged> {
  try {
    const response = await authTransport.post<PlatformEnvelope<OperationAcknowledged>>(
      `${ROOT}/forgot-password`,
      body
    );
    return unwrap(response.data, 'Account recovery');
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: true });
  }
}

/**
 * Completes recovery with the code from {@link forgotPassword}.
 *
 * **Every session is revoked on success**, including this device's — which is
 * the point: a member resetting a password they may have lost control of should
 * not leave an attacker's session alive. The caller must send them to sign in
 * again rather than assuming the current tokens still work.
 */
export async function resetPassword(
  body: ResetPasswordRequestBody
): Promise<OperationAcknowledged> {
  try {
    const response = await authTransport.post<PlatformEnvelope<OperationAcknowledged>>(
      `${ROOT}/reset-password`,
      body
    );
    return unwrap(response.data, 'Password reset');
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: true });
  }
}

/**
 * Changes the password of a member who is already signed in.
 *
 * Requires the current password, so a stolen unlocked handset cannot lock the
 * owner out of their own account. On `apiClient` rather than `authTransport`
 * because it is an authenticated call and should carry the interceptor.
 */
export async function changePassword(
  body: ChangePasswordRequestBody
): Promise<OperationAcknowledged> {
  try {
    const response = await apiClient.post<PlatformEnvelope<OperationAcknowledged>>(
      `${ROOT}/change-password`,
      body
    );
    return unwrap(response.data, 'Password change');
  } catch (cause) {
    return toAuthError(cause, { anonymous: false, mutating: true });
  }
}

// ── Email verification (Phase 9, 5 Oct 2026) ─────────────────────────────────
//
// Served by `GET /auth/email` and `POST /auth/email/verification`, shaped to the
// `EmailIdentityState` the gap adapter (FRONTEND-PHASE16-GAP-008) always read.
// The link in the email opens a page on the API that verifies only when its
// button is pressed, so there is no deep link to handle here: the member comes
// back to the app and this query reads the new state.

/** The member's address and whether they have proven they receive mail there. */
export async function fetchEmailIdentity(): Promise<EmailIdentityState> {
  try {
    const response = await apiClient.get<PlatformEnvelope<EmailIdentityState>>(`${ROOT}/email`);
    return unwrap(response.data, 'Loading your email address');
  } catch (cause) {
    throw toIntegrationError(cause, { mutating: false });
  }
}

/**
 * Sends a verification link. The server allows one a minute and six a day; a
 * refusal arrives as a rate-limit error whose message says how long to wait.
 */
export async function sendEmailVerification(): Promise<EmailIdentityState> {
  try {
    const response = await apiClient.post<PlatformEnvelope<EmailIdentityState>>(
      `${ROOT}/email/verification`
    );
    return unwrap(response.data, 'Sending the verification email');
  } catch (cause) {
    // An unanswered send may still have gone out, so it is reported as unknown,
    // not as a failure the member should immediately retry.
    throw toIntegrationError(cause, { mutating: true });
  }
}

// ── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Rotates a refresh token for a new pair.
 *
 * Anonymous by design: the refresh token *is* the credential, and the access
 * token it replaces has usually expired by the time this runs. Deliberately on
 * `authTransport` — this is the function the 401 interceptor calls, and routing
 * it through that interceptor would recurse.
 */
export async function refreshSession(refreshToken: string): Promise<AuthenticationResult> {
  try {
    const response = await authTransport.post<PlatformEnvelope<AuthenticationResult>>(
      `${ROOT}/refresh`,
      { refreshToken }
    );
    return assertSession(unwrap(response.data, 'Session refresh'));
  } catch (cause) {
    return toAuthError(cause, { anonymous: true, mutating: false });
  }
}

/**
 * Ends the server-side session.
 *
 * On `apiClient` because it needs the bearer, with retry suppressed: if the
 * access token has already expired there is nothing to gain by refreshing it in
 * order to invalidate it, and a member signing out must not be made to wait on a
 * token round trip.
 */
export async function logout(body: LogoutRequestBody = {}): Promise<void> {
  await apiClient.post<PlatformEnvelope<OperationAcknowledged>>(`${ROOT}/logout`, body, {
    skipAuthRetry: true,
  } as AxiosRequestConfig);
}

/** The signed-in member's own profile. */
export async function fetchCurrentUser(): Promise<UserProfile> {
  const response = await apiClient.get<PlatformEnvelope<UserProfile>>(`${ROOT}/me`);
  return unwrap(response.data, 'Loading your profile');
}

// ── Sessions (Remediation Wave B′) ───────────────────────────────────────────
//
// `profile/account-security.tsx` listed sessions from `store/trust.ts` and
// "revoked" them by removing a row from that store. It then told the member
// "Security credentials revoked successfully."
//
// Nothing was revoked. The refresh token on the device they were worried about
// stayed valid for its full lifetime, and — before Wave A — sign-out did not
// revoke server-side either, so there was no path by which that device ever lost
// access. Of the twelve inert affordances the audit found, this is the one that
// made a security promise the platform did not keep.

/** Every session on the account, newest activity first. */
export async function fetchSessions(
  options: { includeRevoked?: boolean } = {}
): Promise<AuthSession[]> {
  const response = await apiClient.get<PlatformEnvelope<AuthSession[]>>(`${ROOT}/sessions`, {
    params: { includeRevoked: options.includeRevoked ?? false },
  });
  return unwrap(response.data, 'Loading your sessions') ?? [];
}

/** Ends one session. The device holding it is signed out. */
export async function revokeSession(sessionId: string): Promise<void> {
  await apiClient.delete<PlatformEnvelope<OperationAcknowledged>>(
    `${ROOT}/sessions/${encodeURIComponent(sessionId)}`
  );
}

/**
 * Ends every session except this one.
 *
 * Takes no parameters — the current session is excluded server-side from the
 * ambient identity, and there is deliberately no `exceptCurrent` knob for a
 * client to get wrong.
 */
export async function revokeOtherSessions(): Promise<void> {
  await apiClient.delete<PlatformEnvelope<OperationAcknowledged>>(`${ROOT}/sessions`);
}

/** The account's recent security events. */
export async function fetchSecurityEvents(limit = 50): Promise<SecurityEvent[]> {
  const response = await apiClient.get<PlatformEnvelope<SecurityEvent[]>>(
    `${ROOT}/security-events`,
    { params: { limit } }
  );
  return unwrap(response.data, 'Loading your security history') ?? [];
}
