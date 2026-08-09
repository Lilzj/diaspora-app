// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment capability (Frontend Phase 16, §25 · §26 · §29 · §30 · §61)
//
// §26's rule, and the one this file is mostly about:
//
//   **The client returning from a payment surface is not a payment.**
//
// A member closing the gateway sheet tells us nothing. They may have paid and
// the webhook may not have landed; they may have abandoned it; the sheet may
// have crashed after authorisation. So a success screen may only be drawn on an
// *authoritative* success, and the only thing that produces one is reading the
// intent back from the backend.
//
// Its mirror is easier to get wrong and is asserted just as hard: **do not
// assume it failed because the client did not succeed.** A timeout during
// capture may well have taken the money, and reporting that as a failure
// invites the member to pay twice.
// ─────────────────────────────────────────────────────────────────────────────

import {
  canRetryPayment,
  canShowSuccess,
  idlePaymentState,
  isOutcomeUnknown,
  nextPollDelayMs,
  parseNextAction,
  phaseDescription,
  phaseForStatus,
  returnedFromGateway,
  stateFromError,
  stateFromIntent,
} from '@/lib/integrations/payments';
import { integrationError } from '@/lib/integrations/errors';
import type { Money, PaymentIntent } from '@/types/financial';

function money(minorUnits: number, currency = 'GBP'): Money {
  return { amount: minorUnits / 100, currency, minorUnits, exponent: 2, symbol: '£' };
}

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    paymentIntentId: 'pi-1',
    status: 'Captured',
    amount: money(4200),
    captured: money(4200),
    refunded: money(0),
    refundableRemaining: money(4200),
    methodKind: 'Card',
    description: 'A payment',
    attemptCount: 1,
    refunds: [],
    expiresAt: '2026-08-10T00:00:00.000Z',
    createdAt: '2026-08-09T09:00:00.000Z',
    ...overrides,
  };
}

describe('§25 · B15’s lifecycle becomes the product’s vocabulary', () => {
  it('an authorised payment is pending, not succeeded', () => {
    // The single most important line in the mapping. An authorised payment has
    // reserved the money and not taken it; showing "Paid" is a claim the
    // platform has not made, and the capture can still fail.
    expect(phaseForStatus('Authorized')).toBe('pending');
  });

  it('captured and settled are both success', () => {
    expect(phaseForStatus('Captured')).toBe('succeeded');
    expect(phaseForStatus('Settled')).toBe('succeeded');
  });

  it('an unrecognised status is pending, never failed', () => {
    // Guessing "failed" for a status from a newer backend tells a member their
    // money did not move when it may well have.
    expect(phaseForStatus('SomeFutureStatus')).toBe('pending');
  });

  it('cancelled and refunded keep their own meanings', () => {
    expect(phaseForStatus('Cancelled')).toBe('cancelled');
    expect(phaseForStatus('Refunded')).toBe('refunded');
    expect(phaseForStatus('Expired')).toBe('failed');
  });
});

describe('§26 · a success screen needs an authoritative success', () => {
  it('a state read back from the backend is authoritative', () => {
    const state = stateFromIntent(intent());
    expect(state.isAuthoritative).toBe(true);
    expect(canShowSuccess(state)).toBe(true);
  });

  it('returning from the gateway does not succeed the payment', () => {
    const state = returnedFromGateway(stateFromIntent(intent({ status: 'Pending' })));

    expect(state.phase).toBe('processing');
    expect(state.isAuthoritative).toBe(false);
    // The property §26 exists for.
    expect(canShowSuccess(state)).toBe(false);
    expect(state.awaitingWebhook).toBe(true);
  });

  it('a locally-constructed success is not enough on its own', () => {
    // Belt and braces: even a state whose phase says `succeeded` cannot draw the
    // screen unless it was read back.
    const forged = { ...stateFromIntent(intent()), isAuthoritative: false };
    expect(canShowSuccess(forged)).toBe(false);
  });
});

describe('§26 · §30 · an unknown outcome is not a failure', () => {
  it('an indeterminate error produces `indeterminate`, not `failed`', () => {
    const error = integrationError('NetworkFailure', { isIndeterminate: true });
    const state = stateFromError(stateFromIntent(intent({ status: 'Pending' })), error);

    expect(state.phase).toBe('indeterminate');
    expect(state.phase).not.toBe('failed');
    expect(isOutcomeUnknown(state)).toBe(true);
  });

  it('a determinate error produces `failed`', () => {
    const error = integrationError('InvalidRequest');
    const state = stateFromError(idlePaymentState(), error);
    expect(state.phase).toBe('failed');
  });

  it('an indeterminate payment offers no retry', () => {
    // §33's "never blindly retry payments", where it matters most: a member
    // looking at "something went wrong" on a payment that may have succeeded
    // must be offered "check status", never "pay again".
    const error = integrationError('NetworkFailure', { isIndeterminate: true });
    const state = stateFromError(stateFromIntent(intent({ status: 'Pending' })), error);

    expect(canRetryPayment(state)).toBe(false);
  });

  it('a failed payment does offer a retry', () => {
    const state = stateFromError(idlePaymentState(), integrationError('InvalidRequest'));
    expect(canRetryPayment(state)).toBe(true);
  });

  it('a payment awaiting a webhook offers no retry', () => {
    const state = stateFromIntent(intent({ status: 'Pending' }));
    expect(state.awaitingWebhook).toBe(true);
    expect(canRetryPayment(state)).toBe(false);
  });

  it('the indeterminate copy tells the member not to pay again', () => {
    const error = integrationError('NetworkFailure', { isIndeterminate: true });
    const state = stateFromError(idlePaymentState(), error);

    // The sentence that stops a double payment. It deliberately says neither
    // "failed" nor "succeeded".
    expect(phaseDescription(state)).toMatch(/do not pay again/i);
    expect(phaseDescription(state)).not.toMatch(/failed/i);
  });
});

describe('§61 · currency is never inferred', () => {
  it('comes from the backend response', () => {
    expect(stateFromIntent(intent({ amount: money(4200, 'NGN') })).currency).toBe('NGN');
  });

  it('is null when no payment has been read', () => {
    // No locale fallback, no country fallback, no default. A payment whose
    // currency is unknown renders no amount at all rather than a guessed symbol.
    expect(idlePaymentState().currency).toBeNull();
  });
});

describe('§26 · §29 · a gateway challenge is parsed, never invented', () => {
  it('parses a structured action', () => {
    const action = parseNextAction(
      JSON.stringify({ kind: 'threeDSecure', url: 'https://gateway.example/3ds' })
    );

    expect(action?.kind).toBe('threeDSecure');
    expect(action?.url).toBe('https://gateway.example/3ds');
  });

  it('treats a bare HTTPS URL as a redirect', () => {
    const action = parseNextAction('https://gateway.example/redirect');
    expect(action?.kind).toBe('redirect');
  });

  it('refuses a non-HTTPS challenge URL', () => {
    // A payment flow is the highest-value phishing surface the app has — the
    // member has already decided to pay and expects to be sent somewhere.
    const action = parseNextAction('http://gateway.example/redirect');
    expect(action?.url).toBeNull();
    expect(action?.kind).toBe('unknown');
  });

  it('refuses a custom-scheme challenge URL', () => {
    const action = parseNextAction('evil://steal');
    expect(action?.url).toBeNull();
  });

  it('drops a URL from a structured action when it is not HTTPS', () => {
    const action = parseNextAction(JSON.stringify({ kind: 'redirect', url: 'http://evil.example' }));
    expect(action?.url).toBeNull();
  });

  it('falls back to `unknown` rather than guessing a kind it cannot render', () => {
    const action = parseNextAction('complete this in your banking app');
    expect(action?.kind).toBe('unknown');
    expect(action?.instruction).toBe('complete this in your banking app');
  });

  it('returns null when there is no action', () => {
    expect(parseNextAction(null)).toBeNull();
    expect(parseNextAction('')).toBeNull();
    expect(parseNextAction('   ')).toBeNull();
  });
});

describe('§30 · §57 · polling a pending payment is bounded', () => {
  it('backs off', () => {
    const first = nextPollDelayMs(0);
    const later = nextPollDelayMs(3);
    expect(first).not.toBeNull();
    expect(later).not.toBeNull();
    expect(later as number).toBeGreaterThan(first as number);
  });

  it('stops rather than polling for ever', () => {
    // An unbounded poll against a payment waiting on a webhook that will never
    // arrive is a battery drain and a rate-limit breach. After the last
    // interval the UI offers a manual refresh, which is cheaper and more honest
    // than a spinner that never resolves.
    expect(nextPollDelayMs(50)).toBeNull();
  });
});
