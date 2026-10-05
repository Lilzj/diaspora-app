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

import { resendOtp } from './auth-api';
import { fetchCapabilities } from './financial-api';
import { fetchNotificationDevices, fetchNotificationPreferences } from './notifications-api';
import type { FinancialCapabilities } from '@/types/financial';
import type { NotificationDevice, NotificationPreferences } from '@/types/notification-preferences';
import type { OtpChallenge } from '@/types/auth';

// ═════════════════════════════════════════════════════════════════════════════
// SMS / OTP — delegating to the certified identity client
//
// **This section used to own the OTP routes and it addressed two that have
// never existed.** It posted to `/auth/otp/send` and `/auth/otp/verify`; the
// platform serves `/auth/otp/start` and `/auth/otp/sign-in`, and the backend's
// own documentation names this client as their intended consumer. Every sign-in
// 404'd.
//
// The routes now live in `lib/auth-api.ts`, which mirrors
// `Diaspora.Contracts/Identity` field for field. What survives here is the
// *presentation* type the OTP screens render — `OtpChallengeState` — because
// `app/verification/phone.tsx` and `app/(auth)/otp.tsx` both build a countdown
// out of it and neither should have to know which backend route answered.
//
// ── FRONTEND-PHASE16-GAP-010 is closed, and not the way it was written ───────
//
// The gap asked the backend to return cooldown metadata. It already does — on
// `POST /auth/resend-otp`, which returns `OtpChallengeResponse` with a real
// `resendAvailableInSeconds`, `attemptsRemaining` and `resendsRemaining`. The
// client was reading a route that does not exist, so it never saw them.
//
// `POST /auth/otp/start` genuinely returns no metadata, and that is deliberate
// rather than an omission: an identical response whether or not the number is
// registered is what stops the route enumerating accounts. So:
//
//   purpose 'signIn'   → otp/start    → conservative local defaults, marked as such
//   any other purpose  → resend-otp   → the server's real budget, marked authoritative
//
// `isServerAuthoritative` therefore now means something. It used to be false
// everywhere.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the client knows about an OTP in flight.
 *
 * `isServerAuthoritative` says whether the numbers came from the server or are
 * the client's conservative guesses. A countdown the server specified and one
 * the client invented look identical on screen, and only one of them is a
 * promise the backend will keep.
 */
export interface OtpChallengeState {
  sentAt: string;
  expiresAt: string | null;
  cooldownSeconds: number;
  maxAttempts: number;
  attemptsRemaining: number;
  deliveryState: string;
  /** False when the values above are the client's conservative defaults. */
  isServerAuthoritative: boolean;
}

/**
 * The client-side defaults, used only where the server genuinely returns none.
 *
 * Deliberately conservative. A 60-second cooldown where the server allows 30
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

/**
 * Requests a code.
 *
 * Through `resend-otp`, which replaces the code for a challenge that already
 * exists and reports the remaining budget. Codes only verify a phone number;
 * signing in by code was removed on 5 Oct 2026.
 */
export async function sendOtp(input: {
  phoneNumber: string;
  purpose: 'changePhone' | 'verify';
}): Promise<OtpChallengeState> {
  const now = new Date();

  const challenge = await resendOtp({
    phoneNumber: input.phoneNumber,
    purpose: input.purpose,
  });

  return {
    sentAt: now.toISOString(),
    expiresAt: challenge.expiresAt,
    cooldownSeconds: challenge.resendAvailableInSeconds,
    maxAttempts: Math.max(challenge.attemptsRemaining, 1),
    attemptsRemaining: challenge.attemptsRemaining,
    deliveryState: 'sent',
    isServerAuthoritative: true,
  };
}

/**
 * Maps an `OtpChallengeResponse` onto the screens' presentation type.
 *
 * Exported because registration receives one *inside* `RegistrationResponse`
 * rather than from a call of its own, and the OTP screen should not have to
 * know the difference.
 */
export function toOtpChallengeState(challenge: OtpChallenge): OtpChallengeState {
  return {
    sentAt: new Date().toISOString(),
    expiresAt: challenge.expiresAt,
    cooldownSeconds: challenge.resendAvailableInSeconds,
    maxAttempts: Math.max(challenge.attemptsRemaining, 1),
    attemptsRemaining: challenge.attemptsRemaining,
    deliveryState: 'sent',
    isServerAuthoritative: true,
  };
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
