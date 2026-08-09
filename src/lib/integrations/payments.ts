// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — payment capability (Frontend Phase 16, §25 · §26 · §29 · §30 · §61)
//
// A provider-neutral state machine over B15's **real** payment contract.
//
// ── What this is not ─────────────────────────────────────────────────────────
//
// It is not a second payment implementation. §27 forbids one and the audit
// found the first already complete: `lib/financial-api.ts` wraps intents,
// authorize, capture, cancel, refunds and `/capabilities`;
// `lib/financial-errors.ts` maps seventy-odd codes with `isRetryable`,
// `isTerminal` and `isIndeterminate`; and Phase 5 built `PaymentSheet`,
// `PaymentResult` and `PaymentReview` over them. Every one of those is used
// unchanged.
//
// What was missing is the layer §25 asks for: a vocabulary the product owns, so
// a marketplace screen and a wallet screen and a donation screen describe a
// payment the same way, and so none of them switches on B15's internal
// `PaymentIntentStatus`.
//
// ── The rule the whole file is shaped around (§26, §30) ──────────────────────
//
// **The client returning from a payment surface is not a payment.**
//
// A member closing the gateway sheet tells us nothing. They may have paid and
// the webhook may not have landed; they may have abandoned it; the sheet may
// have crashed after authorisation. So:
//
//   * `PaymentState.isAuthoritative` is true only for a state derived from
//     reading the intent back from the backend. A success screen may only be
//     drawn on an authoritative `succeeded`, and `canShowSuccess()` is the one
//     predicate that answers it.
//   * Returning from the sheet moves the state to `processing`, never to
//     `succeeded`, and schedules a read.
//   * A transport failure on a write becomes `indeterminate`, never `failed`.
//     `financial-api.ts` already classifies every write as `mutating` for this
//     reason; this file carries the classification into the UI vocabulary
//     instead of discarding it.
//
// ── §61, currency ────────────────────────────────────────────────────────────
//
// `PaymentState.currency` is populated only from a backend response. There is
// no code path here that reads a device locale, a country or an IP to decide
// what somebody is being charged in. A payment whose currency is unknown
// renders no amount at all rather than a guessed symbol.
// ─────────────────────────────────────────────────────────────────────────────

import {
  authorizePayment,
  cancelPayment,
  capturePayment,
  createPaymentIntent,
  fetchPaymentIntent,
} from '@/lib/financial-api';
import { FinancialError } from '@/lib/financial-errors';
import type { CreatePaymentIntentRequest, PaymentIntent, PaymentStatus } from '@/types/financial';
import type { PaymentNextAction, PaymentPhase, PaymentState } from '@/types/integrations';
import { fromFinancialError, integrationError, type IntegrationError } from './errors';
import { trackPayment } from './events';

// ═════════════════════════════════════════════════════════════════════════════
// TRANSLATION — B15's lifecycle → the product's
// ═════════════════════════════════════════════════════════════════════════════

/**
 * B15's `PaymentIntentStatus` in the product's vocabulary.
 *
 * The mapping that stops nine screens each learning what `Settled` means.
 *
 * `Authorized` maps to `pending` rather than to `succeeded`, and that is the
 * single most important line in this file. An authorised payment has reserved
 * the money and not taken it; showing "Paid" at that point is a claim the
 * platform has not yet made, and the capture can still fail.
 */
export function phaseForStatus(status: PaymentStatus): PaymentPhase {
  switch (status) {
    case 'Draft':
      return 'initializing';
    case 'Pending':
      return 'pending';
    case 'Authorized':
      // Reserved, not taken. See above.
      return 'pending';
    case 'Captured':
    case 'Settled':
      return 'succeeded';
    case 'Failed':
      return 'failed';
    case 'Cancelled':
      return 'cancelled';
    case 'Refunded':
      return 'refunded';
    case 'Expired':
      return 'failed';
    default:
      // An unrecognised status from a newer backend is `pending`, not `failed`.
      // Guessing "failed" for a status we do not understand tells a member
      // their money did not move when it may well have.
      return 'pending';
  }
}

/**
 * B15's opaque `nextAction` string, parsed.
 *
 * The field is typed `string | null` on the wire (`types/financial.ts:218`)
 * with no documented structure — FRONTEND-PHASE16-GAP-014 asks for one. So this
 * is best-effort over the two shapes a gateway realistically sends: a URL, or a
 * JSON object with a kind.
 *
 * Anything unrecognised becomes `kind: 'unknown'` with the raw text as an
 * instruction, and the UI tells the member to finish in the provider's own
 * surface. That is the honest degradation: inventing a challenge type we cannot
 * render would send somebody to a blank screen.
 */
export function parseNextAction(raw: string | null | undefined): PaymentNextAction | null {
  if (!raw || raw.trim().length === 0) return null;
  const text = raw.trim();

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const kind = typeof parsed.kind === 'string' ? parsed.kind : null;
      const url = typeof parsed.url === 'string' ? parsed.url : null;

      const known: PaymentNextAction['kind'][] = [
        'redirect',
        'threeDSecure',
        'mobileMoneyPrompt',
        'manualTransfer',
      ];
      const resolved = known.find((candidate) => candidate === kind) ?? 'unknown';

      return {
        kind: resolved,
        url: isSafeChallengeUrl(url) ? url : null,
        instruction: typeof parsed.instruction === 'string' ? parsed.instruction : null,
        returnUrl: typeof parsed.returnUrl === 'string' ? parsed.returnUrl : null,
      };
    } catch {
      return { kind: 'unknown', url: null, instruction: text, returnUrl: null };
    }
  }

  if (isSafeChallengeUrl(text)) {
    return { kind: 'redirect', url: text, instruction: null, returnUrl: null };
  }

  return { kind: 'unknown', url: null, instruction: text, returnUrl: null };
}

/**
 * Whether a challenge URL is safe to open.
 *
 * HTTPS only. A payment flow is the highest-value phishing surface the app has
 * — a member has already decided to pay and is expecting to be sent somewhere
 * — and an `http://` or custom-scheme URL arriving in `nextAction` is either a
 * misconfiguration or an attack. Neither is worth opening.
 *
 * The host allow-list belongs server-side (GAP-014 says so), because the client
 * cannot know which gateways a deployment has configured; this is the check the
 * client *can* make without one.
 */
function isSafeChallengeUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https:\/\/[^\s]+$/i.test(url.trim());
}

// ═════════════════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════════════════

export function idlePaymentState(): PaymentState {
  return {
    phase: 'idle',
    paymentIntentId: null,
    currency: null,
    nextAction: null,
    error: null,
    isAuthoritative: false,
    awaitingWebhook: false,
    attemptCount: 0,
    observedAt: new Date().toISOString(),
  };
}

/**
 * A payment intent as the UI's state.
 *
 * Always `isAuthoritative: true` — this is only ever called with an intent read
 * from the backend, which is the definition. That is why the function takes a
 * `PaymentIntent` rather than a phase: there is no way to produce an
 * authoritative state without having read one.
 */
export function stateFromIntent(intent: PaymentIntent): PaymentState {
  const phase = phaseForStatus(intent.status);

  return {
    phase,
    paymentIntentId: intent.paymentIntentId,
    // §61: from the backend, never inferred.
    currency: intent.amount?.currency ?? null,
    nextAction: parseNextAction(intent.nextAction),
    error: null,
    isAuthoritative: true,
    // A pending payment whose outcome the client cannot observe is waiting on a
    // webhook. §30: the UI must not pretend the operation is complete.
    awaitingWebhook: phase === 'pending' || phase === 'processing',
    attemptCount: intent.attemptCount ?? 0,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Applies a failure.
 *
 * An indeterminate error becomes `indeterminate`, not `failed`. That is §26's
 * rule read in the direction people forget: a timeout during capture may well
 * have taken the money, and telling a member it failed invites them to pay
 * twice.
 */
export function stateFromError(previous: PaymentState, error: IntegrationError): PaymentState {
  const phase: PaymentPhase = error.isIndeterminate ? 'indeterminate' : 'failed';

  return {
    ...previous,
    phase,
    error: error.toSummary(new Date().toISOString()),
    // A locally-derived failure is never authoritative. Only a read of the
    // intent is, and an indeterminate state exists precisely to say "ask again".
    isAuthoritative: false,
    awaitingWebhook: error.isIndeterminate,
    observedAt: new Date().toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PREDICATES the UI must use
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Whether a success screen may be drawn.
 *
 * The one predicate §26 turns on. Both conditions are required and neither is
 * sufficient: a non-authoritative `succeeded` is the client's guess, and an
 * authoritative `pending` is a real payment that has not completed.
 */
export function canShowSuccess(state: PaymentState): boolean {
  return state.phase === 'succeeded' && state.isAuthoritative;
}

/** Whether the member should be told the outcome is still unknown — §29, §30. */
export function isOutcomeUnknown(state: PaymentState): boolean {
  return state.phase === 'indeterminate' || state.phase === 'processing' || state.awaitingWebhook;
}

/**
 * Whether retrying the *payment* is safe.
 *
 * False for anything indeterminate — §33's "never blindly retry payments",
 * applied where it matters most. A member looking at "something went wrong" on
 * a payment that may have succeeded must be offered "check status", not "pay
 * again".
 */
export function canRetryPayment(state: PaymentState): boolean {
  if (state.phase === 'indeterminate') return false;
  if (state.awaitingWebhook) return false;
  return state.phase === 'failed' || state.phase === 'cancelled';
}

/** Member-facing copy for each phase. One sentence, no jargon, no B15 status names. */
export function phaseDescription(state: PaymentState): string {
  switch (state.phase) {
    case 'idle':
      return '';
    case 'initializing':
      return 'Setting up your payment.';
    case 'awaitingAction':
      return 'One more step to finish this payment.';
    case 'processing':
      return 'Finishing your payment.';
    case 'pending':
      return 'Your payment is being confirmed. This can take a moment.';
    case 'succeeded':
      return 'Payment complete.';
    case 'failed':
      return state.error?.message ?? 'The payment did not go through.';
    case 'cancelled':
      return 'Payment cancelled. Nothing has been charged.';
    case 'indeterminate':
      // The sentence that stops a double payment. Deliberately does not say
      // "failed" and deliberately does not say "succeeded".
      return 'We lost contact before we could confirm this payment. Do not pay again — check the status first.';
    case 'refundPending':
      return 'Your refund is being processed.';
    case 'refunded':
      return 'This payment was refunded.';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

function normalise(cause: unknown): IntegrationError {
  if (cause instanceof FinancialError) return fromFinancialError(cause, 'payments.platform');
  return integrationError('UnknownError', {
    provider: 'payments.platform',
    // Unknown cause on a payment write. Indeterminate by default: the safe
    // assumption about money is that it may have moved.
    isIndeterminate: true,
  });
}

/** Starts a payment. No instrument travels through the platform, ever (§28). */
export async function beginPayment(request: CreatePaymentIntentRequest): Promise<PaymentState> {
  trackPayment({ outcome: 'started' });

  try {
    const intent = await createPaymentIntent(request);
    return stateFromIntent(intent);
  } catch (cause) {
    const error = normalise(cause);
    trackPayment({ outcome: error.isIndeterminate ? 'indeterminate' : 'failed', errorKind: error.kind });
    return stateFromError(idlePaymentState(), error);
  }
}

/** Hands the payment to the gateway. May answer with a challenge. */
export async function authorise(state: PaymentState): Promise<PaymentState> {
  if (!state.paymentIntentId) {
    return stateFromError(
      state,
      integrationError('InvalidRequest', {
        provider: 'payments.platform',
        message: 'There is no payment to authorise.',
      })
    );
  }

  try {
    const intent = await authorizePayment(state.paymentIntentId);
    const next = stateFromIntent(intent);

    if (next.nextAction) {
      trackPayment({ outcome: 'action_required', actionKind: next.nextAction.kind });
      return { ...next, phase: 'awaitingAction' };
    }

    return next;
  } catch (cause) {
    const error = normalise(cause);
    trackPayment({ outcome: error.isIndeterminate ? 'indeterminate' : 'failed', errorKind: error.kind });
    return stateFromError(state, error);
  }
}

/**
 * Called when the member comes back from a gateway surface.
 *
 * Moves to `processing` and nothing more. §26: returning is not paying. The
 * caller then polls `refreshPaymentState`, which is the only thing that can
 * produce an authoritative outcome.
 */
export function returnedFromGateway(state: PaymentState): PaymentState {
  return {
    ...state,
    phase: 'processing',
    nextAction: null,
    isAuthoritative: false,
    awaitingWebhook: true,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Re-reads the authoritative state.
 *
 * The only function that can produce `succeeded`. Everything else in this file
 * either sets a non-terminal phase or records a failure.
 */
export async function refreshPaymentState(state: PaymentState): Promise<PaymentState> {
  if (!state.paymentIntentId) return state;

  try {
    const intent = await fetchPaymentIntent(state.paymentIntentId);
    const next = stateFromIntent(intent);

    if (next.phase === 'succeeded') trackPayment({ outcome: 'completed' });
    if (next.phase === 'failed') trackPayment({ outcome: 'failed' });

    return next;
  } catch (cause) {
    const error = normalise(cause);
    // A failed *read* must not overwrite a known good state with a failure —
    // the payment did not change because we could not look at it. The phase is
    // preserved and only the error is recorded.
    return {
      ...state,
      error: error.toSummary(new Date().toISOString()),
      isAuthoritative: false,
      observedAt: new Date().toISOString(),
    };
  }
}

/** Takes the money. Called after an authorisation the backend confirmed. */
export async function capture(state: PaymentState): Promise<PaymentState> {
  if (!state.paymentIntentId) return state;

  try {
    return stateFromIntent(await capturePayment(state.paymentIntentId));
  } catch (cause) {
    const error = normalise(cause);
    trackPayment({ outcome: error.isIndeterminate ? 'indeterminate' : 'failed', errorKind: error.kind });
    return stateFromError(state, error);
  }
}

/** Stops a payment that has not been captured. */
export async function cancel(state: PaymentState): Promise<PaymentState> {
  if (!state.paymentIntentId) {
    return { ...idlePaymentState(), phase: 'cancelled' };
  }

  try {
    const next = stateFromIntent(await cancelPayment(state.paymentIntentId));
    trackPayment({ outcome: 'cancelled' });
    return next;
  } catch (cause) {
    return stateFromError(state, normalise(cause));
  }
}

/**
 * The polling schedule for a pending payment — §30, §57.
 *
 * Backs off and stops. An unbounded poll against a payment waiting on a webhook
 * that will never arrive is a battery drain and a rate-limit breach; after the
 * last interval the UI offers a manual refresh, which is both cheaper and more
 * honest than a spinner that never resolves.
 *
 * Returns null when polling should stop.
 */
export function nextPollDelayMs(attempt: number): number | null {
  const schedule = [2000, 3000, 5000, 8000, 13000, 21000];
  return attempt < schedule.length ? schedule[attempt] : null;
}
