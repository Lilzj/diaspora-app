// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integrations, certified arm (Frontend Phase 16)
//
// Real routes only. Every endpoint below exists in the certified backend and is
// called by the application today.
//
// ── Why this file is short, and what that means ──────────────────────────────
//
// It is short because most of what this phase needs from the certified backend
// is **already wrapped**, and re-wrapping it would be building the duplicate
// systems §14, §21 and §27 each forbid:
//
//   push devices and preferences  → `lib/notifications-api.ts`   (B13, real)
//   payments and capabilities     → `lib/financial-api.ts`       (B15, real)
//   geocoding and places          → `lib/maps/providers/`        (Phase 8, real)
//   notification deep links       → `lib/notification-routes.ts` (Phase 5, real)
//
// This file adds the one certified surface nothing else wraps — the OTP
// routes — and the composition helpers that read the *existing* clients to
// answer integration-shaped questions. `hooks/integrations.ts` sits above this
// and the development arm, and a screen cannot tell which answered.
//
// So the shortness is the point: the audit found more real backend than the
// brief's framing assumed, and the honest response was to connect it rather
// than to rebuild it behind a new name.
//
// ── The one thing removed rather than added ──────────────────────────────────
//
// The previous OTP implementation logged the member in from its `catch` block
// with a fabricated user and the literal token `mock-jwt-token` whenever the
// API call failed — an authentication bypass reachable from any network error,
// on the real login screen. It is gone. `verifyOtp` below reports failures as
// failures. That is the single most consequential change in this phase and it
// is a deletion.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toIntegrationError, integrationError, parseRetryAfter } from './integrations/errors';
import { fetchCapabilities } from './financial-api';
import { fetchNotificationDevices, fetchNotificationPreferences } from './notifications-api';
import type { FinancialCapabilities } from '@/types/financial';
import type { NotificationDevice, NotificationPreferences } from '@/types/notification-preferences';
import axios from 'axios';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ═════════════════════════════════════════════════════════════════════════════
// SMS / OTP — the certified `/auth/otp/*` routes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the client knows about an OTP in flight.
 *
 * The backend returns none of this today (FRONTEND-PHASE16-GAP-010), so every
 * field has a local default and `isServerAuthoritative` says which it is. That
 * flag exists so the UI can be honest: a countdown the server specified and a
 * countdown the client invented look identical on screen, and only one of them
 * is a promise the backend will keep.
 */
export interface OtpChallengeState {
  sentAt: string;
  expiresAt: string | null;
  cooldownSeconds: number;
  maxAttempts: number | null;
  attemptsRemaining: number | null;
  deliveryState: 'queued' | 'sent' | 'undeliverable' | 'unknown';
  /** False when the values above are the client's conservative defaults. */
  isServerAuthoritative: boolean;
}

/**
 * The client-side defaults, used until GAP-010 lands.
 *
 * Deliberately conservative. A 60-second cooldown where the server may allow 30
 * costs a member half a minute; a 15-second cooldown where the server enforces
 * 60 produces a "Resend" button that fails, which is worse. When in doubt about
 * a limit somebody else enforces, guess the stricter one.
 */
const LOCAL_OTP_DEFAULTS = {
  cooldownSeconds: 60,
  /** Five is the conventional floor across the providers this platform might use. */
  maxAttempts: 5,
  expiryMinutes: 10,
} as const;

export async function sendOtp(input: {
  phoneNumber: string;
  purpose: 'signIn' | 'changePhone' | 'verify';
}): Promise<OtpChallengeState> {
  try {
    const response = await apiClient.post<Envelope<Partial<OtpChallengeState>>>('/auth/otp/send', {
      phoneNumber: input.phoneNumber,
      purpose: input.purpose,
    });

    const payload = response.data?.data ?? {};
    const now = new Date();
    // If the server sent any of the metadata GAP-010 asks for, it is
    // authoritative and is used. If it sent none, the locals are used and are
    // marked as locals.
    const hasServerMetadata =
      payload.cooldownSeconds != null || payload.expiresAt != null || payload.maxAttempts != null;

    return {
      sentAt: payload.sentAt ?? now.toISOString(),
      expiresAt:
        payload.expiresAt ??
        new Date(now.getTime() + LOCAL_OTP_DEFAULTS.expiryMinutes * 60_000).toISOString(),
      cooldownSeconds: payload.cooldownSeconds ?? LOCAL_OTP_DEFAULTS.cooldownSeconds,
      maxAttempts: payload.maxAttempts ?? LOCAL_OTP_DEFAULTS.maxAttempts,
      attemptsRemaining: payload.attemptsRemaining ?? LOCAL_OTP_DEFAULTS.maxAttempts,
      deliveryState: payload.deliveryState ?? 'unknown',
      isServerAuthoritative: hasServerMetadata,
    };
  } catch (cause) {
    // A 429 here is the rate limit §57 asks to be surfaced with its interval,
    // rather than a generic failure the member retries into.
    if (axios.isAxiosError(cause) && cause.response?.status === 429) {
      throw integrationError('RateLimited', {
        provider: 'sms.platform',
        capability: 'sms.verification',
        message: 'Too many codes requested.',
        hint: 'Please wait before asking for another.',
        retryAfterSeconds:
          parseRetryAfter(cause.response.headers?.['retry-after']) ??
          LOCAL_OTP_DEFAULTS.cooldownSeconds,
      });
    }
    throw toIntegrationError(cause, {
      provider: 'sms.platform',
      capability: 'sms.verification',
      mutating: true,
    });
  }
}

export interface OtpVerificationResult {
  user: {
    userId: string;
    fullName: string;
    role: string;
    email?: string;
    phone?: string;
    accountState?: string;
  };
  accessToken: string;
}

/**
 * Verifies a code.
 *
 * **There is no fallback path.** A failure to reach the server is a failure to
 * verify, and this function rejects. The previous implementation caught the
 * error and signed the member in with a fabricated identity — see the file
 * header — and the deletion of that `catch` block is why this function is
 * shaped the way it is: there is nowhere for a fallback to be reintroduced
 * without it being obvious in review.
 *
 * The one nuance is `isIndeterminate`. A network failure on verification is
 * *not* indeterminate in the way a payment is: no session was created, because
 * a session is created by a response the client never received. So this is
 * classified non-mutating despite being a POST, and the member is told plainly
 * that it did not work.
 */
export async function verifyOtp(input: {
  phoneNumber: string;
  code: string;
}): Promise<OtpVerificationResult> {
  try {
    const response = await apiClient.post<Envelope<OtpVerificationResult>>('/auth/otp/verify', {
      phoneNumber: input.phoneNumber,
      code: input.code,
    });

    const payload = response.data?.data;
    if (!payload?.accessToken || !payload?.user) {
      // A 200 with no session is a contract violation, not a success. Treating
      // it as one is how a client ends up "signed in" with no token.
      throw integrationError('UnknownError', {
        provider: 'sms.platform',
        capability: 'sms.verification',
        message: 'Sign-in did not complete.',
        hint: 'Please try again.',
      });
    }

    return payload;
  } catch (cause) {
    if (axios.isAxiosError(cause)) {
      const status = cause.response?.status;
      const attemptsRemaining = (cause.response?.data as { attemptsRemaining?: number } | undefined)
        ?.attemptsRemaining;

      // 401 is mapped to "wrong code", not to "your session expired".
      // `/auth/otp/verify` is an anonymous endpoint — there is no session to
      // expire — so a 401 here can only mean the code was rejected. The generic
      // mapping in `toIntegrationError` would produce "You need to sign in
      // again", which on the sign-in screen is both wrong and a dead end.
      if (status === 400 || status === 401 || status === 422) {
        throw integrationError('InvalidRequest', {
          provider: 'sms.platform',
          capability: 'sms.verification',
          message: 'That code is not right.',
          hint:
            typeof attemptsRemaining === 'number'
              ? `${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} left.`
              : 'Check the code and try again.',
        });
      }
      if (status === 410) {
        throw integrationError('ExpiredCredential', {
          provider: 'sms.platform',
          capability: 'sms.verification',
          message: 'That code has expired.',
          hint: 'Ask for a new one.',
        });
      }
      if (status === 429) {
        throw integrationError('RateLimited', {
          provider: 'sms.platform',
          capability: 'sms.verification',
          message: 'Too many attempts.',
          hint: 'Please wait before trying again.',
          retryAfterSeconds: parseRetryAfter(cause.response?.headers?.['retry-after']),
        });
      }
    }

    throw toIntegrationError(cause, {
      provider: 'sms.platform',
      capability: 'sms.verification',
      mutating: false,
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITION over the existing certified clients
//
// These read contracts other modules already own. They exist so a screen asks
// one question — "what can this deployment actually do?" — instead of three,
// and so the answer is assembled in one place rather than in each screen.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the certified backend genuinely supports for integrations, right now.
 *
 * Every field here comes from a real route. Nothing is inferred, defaulted or
 * assumed — which is the point: this is the object the connection centre uses
 * to decide which rows may claim `BACKEND_CONNECTED`, and a guess in it would
 * be a claim of production connectivity the platform cannot keep (§69).
 */
export interface CertifiedIntegrationSupport {
  /** B15. Empty `gateways` means no payment can start at all. */
  payments: FinancialCapabilities | null;
  /** B13. Present means push device registration is real and available. */
  pushDevices: NotificationDevice[] | null;
  /** B13. The real preference record behind the email and push switches. */
  notificationPreferences: NotificationPreferences | null;
  /** Which of the three reads failed, so the UI degrades per-integration. */
  failures: ('payments' | 'push' | 'preferences')[];
}

/**
 * Reads all three certified surfaces, tolerating individual failures.
 *
 * `Promise.allSettled` rather than `all`, deliberately. These are three
 * independent backends and one being down must not blank the whole connection
 * centre — a member whose payment gateway is unreachable should still be able
 * to manage their notification devices. The `failures` array is what lets each
 * row render its own truth instead of sharing one error state.
 */
export async function fetchCertifiedSupport(): Promise<CertifiedIntegrationSupport> {
  const [payments, devices, preferences] = await Promise.allSettled([
    fetchCapabilities(),
    fetchNotificationDevices(),
    fetchNotificationPreferences(),
  ]);

  const failures: CertifiedIntegrationSupport['failures'] = [];
  if (payments.status === 'rejected') failures.push('payments');
  if (devices.status === 'rejected') failures.push('push');
  if (preferences.status === 'rejected') failures.push('preferences');

  return {
    payments: payments.status === 'fulfilled' ? payments.value : null,
    pushDevices: devices.status === 'fulfilled' ? devices.value : null,
    notificationPreferences: preferences.status === 'fulfilled' ? preferences.value : null,
    failures,
  };
}

/**
 * Whether this deployment can start a payment at all.
 *
 * `gateways` being empty is a real, documented B15 state and means no payment
 * can be initiated — a state the UI must render as "not configured" rather than
 * as a failure the member caused. `financial-api.ts` says this in its own
 * words; this is the integration layer's reading of it.
 */
export function canInitiatePayment(capabilities: FinancialCapabilities | null): boolean {
  return Boolean(capabilities && capabilities.gateways.length > 0);
}
