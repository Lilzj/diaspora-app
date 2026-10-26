// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Identity contracts (Remediation Wave A)
//
// These types mirror `Diaspora.Contracts/Identity/V1/{Requests,Responses}` field
// for field. They are not a convenient shape invented for the UI, and that
// distinction is the whole point of this file.
//
// ── What went wrong before ───────────────────────────────────────────────────
//
// The client declared its own `OtpVerificationResult` as
// `{ user: { userId, … }, accessToken }`. The backend returns
// `{ tokens: { accessToken, refreshToken, … }, user: { id, … }, access, sessionId }`.
// The shapes were never compared, so `payload.accessToken` was always
// `undefined` — and because the client checked for it and threw, a *correct*
// server response would have been reported to the member as "Sign-in did not
// complete".
//
// Three things were dropped on the floor by that mismatch, and each is worth
// more than the token:
//
//   * `tokens.refreshToken` — without it there is no session lifecycle at all.
//   * `access` — the server's authoritative answer to what this member may do:
//     `destination`, `requiredActions`, `grantedFeatures`, `blockedFeatures`
//     and `permissions`. The client had been deriving all five locally.
//   * `sessionId` — what `DELETE /auth/sessions/{id}` needs.
//
// ── The rule this file exists to enforce ─────────────────────────────────────
//
// Every property below is named as the wire names it. Where the backend says
// `id`, this says `id`, not `userId`. Renaming at the boundary is how the two
// repositories stopped agreeing in the first place, so the mapping to the
// client's own view models happens once, visibly, in `lib/auth-api.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** `Diaspora.Platform.Http.ApiResponse<T>`. Every successful route returns this. */
export interface PlatformEnvelope<T> {
  data: T;
  meta?: {
    requestId?: string;
    correlationId?: string;
    timestamp?: string;
  };
}

// ── Requests ─────────────────────────────────────────────────────────────────

/**
 * Device fields every token-issuing route accepts.
 *
 * Optional on the wire, and sent anyway. The backend records them against the
 * session, which is what makes `GET /auth/sessions` able to say "iPhone, London,
 * last seen an hour ago" rather than listing five identical rows — and what
 * makes revoking the right one possible.
 */
export interface DeviceDescriptor {
  deviceIdentifier?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}

/** `RegisterRequest`. Every field except the last two is required by the server. */
export interface RegisterRequestBody {
  /**
   * The inviting member's referral code, from a `?ref=` link or typed in.
   * Optional; letters and digits only (`lib/referral-code.ts`).
   */
  referralCode?: string;
  fullName: string;
  /** Verified by SMS after registration. **Not** a sign-in credential. */
  phoneNumber: string;
  /**
   * The address the member signs in with. Required, and unique across the platform.
   *
   * Sign-in moved from a phone one-time code to an email address and a password: a
   * code cost an SMS on every single sign-in, and a password costs nothing to
   * deliver. SMS is now spent only on phone verification, which is the one thing a
   * message actually proves.
   */
  email: string;
  password: string;
  /** ISO 3166-1 alpha-2. The member's country of origin. */
  nationality: string;
  /** ISO 3166-1 alpha-2. Where they live now. */
  countryOfResidence: string;
  preferredLanguage?: string;
  preferredTimeZone?: string;
}

/** `VerifyPhoneRequest`. Redeems the registration code and issues the first token pair. */
export interface VerifyPhoneRequestBody extends DeviceDescriptor {
  phoneNumber: string;
  code: string;
}

/** `RequestSignInOtpRequest`. Passwordless sign-in, step one. */
export interface StartOtpRequestBody {
  phoneNumber: string;
}

/** `OtpSignInRequest`. Passwordless sign-in, step two. */
export interface OtpSignInRequestBody extends DeviceDescriptor {
  phoneNumber: string;
  code: string;
}

/** `ResendOtpRequest`. `purpose` is the server's own vocabulary, not the client's. */
export interface ResendOtpRequestBody {
  phoneNumber: string;
  purpose?: string;
}

/** `LoginRequest`. The sign-in the application uses. */
export interface PasswordLoginRequestBody extends DeviceDescriptor {
  /** The address the account was registered with. Was `phoneNumber`. */
  email: string;
  password: string;
}

/** `ForgotPasswordRequest`. Identified by email; the code arrives by SMS. */
export interface ForgotPasswordRequestBody {
  email: string;
}

/** `ResetPasswordRequest`. Redeems the code from `forgot-password`. */
export interface ResetPasswordRequestBody {
  email: string;
  code: string;
  newPassword: string;
}

/** `ChangePasswordRequest`. For a member who is already signed in. */
export interface ChangePasswordRequestBody {
  currentPassword: string;
  newPassword: string;
}

/** `RefreshTokenRequest`. */
export interface RefreshRequestBody {
  refreshToken: string;
}

/** `LogoutRequest`. */
export interface LogoutRequestBody {
  revokeAllSessions?: boolean;
}

// ── Responses ────────────────────────────────────────────────────────────────

/** `TokenPairResponse`. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  /** Seconds until the access token expires, from the moment it was issued. */
  expiresIn: number;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

/** `UserProfileResponse`. Note `id`, not `userId`. */
export interface UserProfile {
  id: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  nationality: string;
  countryOfResidence: string;
  preferredLanguage: string;
  preferredTimeZone: string;
  avatarStorageKey?: string | null;
  role: string;
  accessState: string;
  accountStatus: string;
  isPhoneVerified: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
}

/**
 * `AccessDecisionResponse` — the server's answer to "what may this member do".
 *
 * It travels with the tokens so a client never has to infer where to send
 * somebody from a raw access state. Consuming `permissions` and `grantedFeatures`
 * here is what lets `config/featureRegistry.ts` stop being the authority (§7).
 */
export interface AccessDecision {
  accessState: string;
  accountStatus: string;
  /** Where the server says this member should land. */
  destination: string;
  message: string;
  requiredActions: string[];
  grantedFeatures: string[];
  blockedFeatures: string[];
  permissions: string[];
  restrictedUntil?: string | null;
}

/** `AuthenticationResponse`. Returned by verify-phone, otp/sign-in, login and refresh. */
export interface AuthenticationResult {
  tokens: TokenPair;
  user: UserProfile;
  access: AccessDecision;
  sessionId: string;
}

/**
 * `OtpChallengeResponse`.
 *
 * `resendAvailableInSeconds` is the real cooldown, and it closes
 * FRONTEND-PHASE16-GAP-010 — the client had been guessing 60 seconds because it
 * was reading a route that does not return this.
 */
export interface OtpChallenge {
  phoneNumber: string;
  purpose: string;
  expiresAt: string;
  attemptsRemaining: number;
  resendsRemaining: number;
  resendAvailableInSeconds: number;
}

/** `RegistrationResponse`. Deliberately carries **no tokens**: an unverified account has no access. */
export interface RegistrationResult {
  userId: string;
  phoneNumber: string;
  accessState: string;
  verification: OtpChallenge;
}

/** `OperationAcknowledgedResponse`. */
export interface OperationAcknowledged {
  message: string;
}

/**
 * `SessionResponse`. Backs `profile/account-security.tsx`.
 *
 * Note what is **not** here: there is no city, country or geo field. The screen
 * used to render "📍 London" from a local fixture; the platform knows only
 * `ipAddress`. Showing a place name would mean the client geolocating an IP and
 * presenting the guess as fact, so it shows the platform and last-seen time
 * instead — which is what actually identifies a device.
 */
export interface AuthSession {
  id: string;
  deviceName: string;
  platform: string;
  appVersion?: string | null;
  ipAddress?: string | null;
  status: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
  isCurrent: boolean;
}

/** `SecurityEventResponse`. Backs `profile/audit-log.tsx`. */
export interface SecurityEvent {
  id: string;
  type: string;
  severity: string;
  description?: string | null;
  ipAddress?: string | null;
  occurredAt: string;
}

// ── Client-side session state ────────────────────────────────────────────────

/**
 * What the client persists between launches.
 *
 * `accessTokenExpiresAt` is stored as epoch milliseconds rather than the wire's
 * ISO string: the refresh decision runs on every request, and parsing a date on
 * each one to compare it with `Date.now()` is work that buys nothing.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  sessionId: string;
  userId: string;
}

/**
 * The authentication state machine.
 *
 * `unknown` is the state the app starts in and it is the reason this is a union
 * rather than a boolean. A restored session takes a tick to read out of secure
 * storage, and for that tick `isAuthenticated === false` was indistinguishable
 * from "signed out" — so the root layout redirected a signed-in member to the
 * login screen on every cold start, and the redirect won the race often enough
 * to look intermittent.
 */
export type AuthStatus =
  | 'unknown'
  | 'restoring'
  | 'authenticated'
  | 'unauthenticated'
  | 'refreshing';

