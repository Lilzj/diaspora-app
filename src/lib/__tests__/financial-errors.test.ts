// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial error mapping tests (Frontend Phase 5)
//
// The property under test is the one §22 turns on: a mutation whose outcome the
// client does not know must be classified **indeterminate**, not failed. Every
// other assertion here is in support of that distinction.
// ─────────────────────────────────────────────────────────────────────────────

import { AxiosError, AxiosHeaders } from 'axios';
import {
  FinancialError,
  FinancialErrorCodes,
  offlineError,
  shouldRetryQuery,
  toFinancialError,
} from '../financial-errors';

/** An axios error shaped the way the interceptor chain produces one. */
function axiosFailure(status: number, body?: unknown): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = {
    status,
    statusText: '',
    data: body,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  } as never;
  return error;
}

function transportFailure(code?: string): AxiosError {
  const error = new AxiosError('Network Error');
  error.code = code;
  error.response = undefined;
  return error;
}

function problem(errorCode: string, detail = 'Refused', status = 422) {
  return { type: 'about:blank', title: 'Refused', status, detail, errorCode };
}

describe('the indeterminate rule', () => {
  it('classifies a timed-out mutation as indeterminate, never as failed', () => {
    const error = toFinancialError(transportFailure('ECONNABORTED'), 'mutating');

    expect(error.isIndeterminate).toBe(true);
    expect(error.isTerminal).toBe(false);
    // Crucially: not retryable. A retry would be the client deciding to send a
    // second payment while the first may already have gone through.
    expect(error.isRetryable).toBe(false);
    expect(error.hint).toMatch(/do not try again|checking/i);
  });

  it('classifies a timed-out read as an ordinary retry', () => {
    const error = toFinancialError(transportFailure('ECONNABORTED'), 'read');

    expect(error.isIndeterminate).toBe(false);
    expect(error.isRetryable).toBe(true);
  });

  it('classifies a 5xx on a mutation as indeterminate', () => {
    // The server may have committed the transaction and failed on the way out.
    const error = toFinancialError(axiosFailure(500), 'mutating');
    expect(error.isIndeterminate).toBe(true);
  });

  it('classifies a 503 on a mutation as indeterminate', () => {
    expect(toFinancialError(axiosFailure(503), 'mutating').isIndeterminate).toBe(true);
  });

  it('does not classify a refusal as indeterminate — the server answered', () => {
    // A 422 means the server read the request and said no. Nothing moved.
    expect(toFinancialError(axiosFailure(422, problem('financial.amount.invalid')), 'mutating').isIndeterminate).toBe(false);
    expect(toFinancialError(axiosFailure(403), 'mutating').isIndeterminate).toBe(false);
    expect(toFinancialError(axiosFailure(409), 'mutating').isIndeterminate).toBe(false);
  });
});

describe('status mapping', () => {
  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [422, 'validation'],
    [400, 'validation'],
    [429, 'rateLimited'],
    [500, 'server'],
    [502, 'server'],
    [503, 'unavailable'],
  ])('maps %i to %s', (status, kind) => {
    expect(toFinancialError(axiosFailure(status), 'read').kind).toBe(kind);
  });

  it('distinguishes a network failure from a timeout', () => {
    expect(toFinancialError(transportFailure(), 'read').kind).toBe('network');
    expect(toFinancialError(transportFailure('ECONNABORTED'), 'read').kind).toBe('timeout');
  });
});

describe('per-code copy', () => {
  it('gives insufficient funds a message the member can act on', () => {
    const error = toFinancialError(
      axiosFailure(422, problem(FinancialErrorCodes.InsufficientFunds)),
      'mutating'
    );

    expect(error.code).toBe('financial.wallet.insufficient_funds');
    expect(error.message).toMatch(/not enough/i);
    expect(error.hint).toMatch(/another payment method/i);
    expect(error.isTerminal).toBe(true);
  });

  it('tells a frozen-wallet holder that money can still arrive', () => {
    const error = toFinancialError(
      axiosFailure(422, problem(FinancialErrorCodes.WalletFrozen)),
      'mutating'
    );

    expect(error.message).toMatch(/frozen/i);
    expect(error.hint).toMatch(/still arrive/i);
  });

  it('says a duplicate was not charged twice', () => {
    const error = toFinancialError(
      axiosFailure(409, problem(FinancialErrorCodes.TransactionDuplicate, 'Duplicate', 409)),
      'mutating'
    );

    expect(error.hint).toMatch(/not been charged twice/i);
    expect(error.isTerminal).toBe(true);
  });

  it('marks a gateway outage retryable and says nothing was charged', () => {
    const error = toFinancialError(
      axiosFailure(503, problem(FinancialErrorCodes.PaymentGatewayUnavailable, 'Down', 503)),
      'read'
    );

    expect(error.isRetryable).toBe(true);
    expect(error.hint).toMatch(/nothing has been charged/i);
  });

  it('explains that the platform never converts currency', () => {
    const error = toFinancialError(
      axiosFailure(422, problem(FinancialErrorCodes.ConversionNotSupported)),
      'read'
    );

    expect(error.message).toMatch(/does not convert/i);
    expect(error.isTerminal).toBe(true);
  });

  it('explains that payouts do not exist yet', () => {
    const error = toFinancialError(
      axiosFailure(422, problem(FinancialErrorCodes.PayoutNotSupported)),
      'read'
    );

    expect(error.message).toMatch(/withdrawals are not available/i);
    expect(error.isTerminal).toBe(true);
  });

  it('keeps an unknown code renderable rather than blank', () => {
    // A deployment can be ahead of the app in the store. A code this build has
    // never seen must produce a sentence, not an empty screen.
    const error = toFinancialError(
      axiosFailure(422, problem('financial.something.invented_later')),
      'read'
    );

    expect(error.code).toBe('financial.something.invented_later');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('shows a validation problem detail, since it is written for a person', () => {
    const error = toFinancialError(
      axiosFailure(422, { status: 422, detail: 'Enter an amount greater than zero.' }),
      'mutating'
    );

    expect(error.message).toBe('Enter an amount greater than zero.');
  });

  it('does not show a server detail, which is written for an operator', () => {
    const error = toFinancialError(
      axiosFailure(500, { status: 500, detail: 'NullReferenceException at LedgerPoster.cs:412' }),
      'read'
    );

    expect(error.message).not.toContain('NullReferenceException');
  });

  it('carries field errors through from a 422', () => {
    const error = toFinancialError(
      axiosFailure(422, { status: 422, errors: { amount: ['Too small'] } }),
      'mutating'
    );

    expect(error.fieldErrors).toEqual({ amount: ['Too small'] });
  });
});

describe('offlineError', () => {
  it('says nothing was sent, so nobody tries again on reconnect', () => {
    const error = offlineError('Paying');

    expect(error.kind).toBe('offline');
    expect(error.hint).toMatch(/nothing has been sent/i);
    expect(error.isRetryable).toBe(false);
    expect(error.isIndeterminate).toBe(false);
  });
});

describe('shouldRetryQuery', () => {
  it('retries a transient read failure, twice at most', () => {
    const failure = axiosFailure(503);
    expect(shouldRetryQuery(0, failure)).toBe(true);
    expect(shouldRetryQuery(1, failure)).toBe(true);
    expect(shouldRetryQuery(2, failure)).toBe(false);
  });

  it('does not retry a refusal that will refuse identically', () => {
    expect(shouldRetryQuery(0, axiosFailure(403))).toBe(false);
    expect(shouldRetryQuery(0, axiosFailure(404))).toBe(false);
    expect(shouldRetryQuery(0, axiosFailure(422, problem(FinancialErrorCodes.InsufficientFunds)))).toBe(false);
  });

  it('passes an already-mapped FinancialError straight through', () => {
    const error = new FinancialError({
      kind: 'server',
      message: 'x',
      isRetryable: true,
      isTerminal: false,
      isIndeterminate: false,
    });
    expect(shouldRetryQuery(0, error)).toBe(true);
  });
});
