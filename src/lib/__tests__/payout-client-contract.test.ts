// ─────────────────────────────────────────────────────────────────────────────
// The payout surface, after the gap closed.
//
// Withdrawal ran against `/financial-gap/v0/…` for as long as the backend had
// no settlement provider. It now calls the certified routes, and these pin the
// three things that could regress silently:
//
//   1. **The URL space.** A withdrawal reaching a gap prefix would 404 against
//      a real deployment; one reaching a *wrong* certified route would not, and
//      that is worse.
//   2. **The fee arithmetic.** The client shows what will arrive before the
//      member commits. The server computes its own figure and stores it. If the
//      two disagree, a member is told one number and paid another.
//   3. **The status vocabulary.** `Reversed` is money that went out and came
//      back; a client that did not treat it as terminal would poll for ever.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  cancelWithdrawal,
  createWithdrawal,
  fetchPayoutDestinations,
  fetchWithdrawalLimits,
  fetchWithdrawals,
} from '../financial-api';
import { estimateWithdrawalFee, fromMinorUnits } from '../money';
import { isWithdrawalSettled } from '@/hooks/financial';
import { BACKEND_GAPS } from '@/config/financial-gaps';

const gbp = (minorUnits: number) => fromMinorUnits(minorUnits, 'GBP', 2, '£');

describe('the withdrawal routes are the certified ones', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('raises a withdrawal against /financial, never a gap prefix', async () => {
    mock.onPost('/financial/wallets/me/withdrawals').reply(200, { data: { withdrawalId: 'w1' } });

    await createWithdrawal({ amount: 10, currency: 'GBP', destinationId: 'd1' });

    expect(mock.history.post).toHaveLength(1);
    expect(mock.history.post[0].url).toBe('/financial/wallets/me/withdrawals');
    expect(mock.history.post[0].url).not.toMatch(/financial-gap/);
  });

  it('sends the idempotency key in the body the server binds', async () => {
    mock.onPost('/financial/wallets/me/withdrawals').reply(200, { data: {} });

    await createWithdrawal({
      amount: 10,
      currency: 'GBP',
      destinationId: 'd1',
      idempotencyKey: 'key-1',
    });

    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
      amount: 10,
      currency: 'GBP',
      destinationId: 'd1',
      idempotencyKey: 'key-1',
    });
  });

  it('asks for limits with the currency and the country, because both change the answer', async () => {
    mock.onGet('/financial/wallets/me/withdrawals/limits').reply(200, { data: {} });

    await fetchWithdrawalLimits('GBP', 'GB');

    expect(mock.history.get[0].params).toEqual({ currency: 'GBP', country: 'GB' });
  });

  it('reads destinations and withdrawals from their own routes', async () => {
    mock.onGet('/financial/payout-destinations').reply(200, { data: [] });
    mock.onGet('/financial/wallets/me/withdrawals').reply(200, { data: [] });

    await fetchPayoutDestinations();
    await fetchWithdrawals();

    expect(mock.history.get.map((request) => request.url)).toEqual([
      '/financial/payout-destinations',
      '/financial/wallets/me/withdrawals',
    ]);
  });

  it('cancels through the withdrawal, not the wallet', async () => {
    mock.onPost('/financial/withdrawals/w1/cancel').reply(200, { data: {} });

    await cancelWithdrawal('w1');

    expect(mock.history.post[0].url).toBe('/financial/withdrawals/w1/cancel');
  });
});

describe('the fee shown is the fee charged', () => {
  // Mirrors MovementLimits.FeeOn: percentage first, then the flat fee, each
  // rounded half away from zero on the minor unit.

  it('applies a percentage', () => {
    expect(estimateWithdrawalFee(gbp(10_000), null, 2.5).minorUnits).toBe(250);
  });

  it('applies a flat fee', () => {
    expect(estimateWithdrawalFee(gbp(10_000), gbp(150), null).minorUnits).toBe(150);
  });

  it('applies both, percentage first', () => {
    expect(estimateWithdrawalFee(gbp(10_000), gbp(150), 2.5).minorUnits).toBe(400);
  });

  it('rounds half away from zero, so the residual stays with the member', () => {
    // 7.5% of 1333 is 99.975 — a fee of 99.975 minor units does not exist.
    expect(estimateWithdrawalFee(gbp(1_333), null, 7.5).minorUnits).toBe(100);
  });

  it('is zero when the policy charges nothing', () => {
    const fee = estimateWithdrawalFee(gbp(10_000), null, null);

    expect(fee.minorUnits).toBe(0);
    expect(fee.currency).toBe('GBP');
  });

  /**
   * The platform never converts, so a flat fee in another currency is not a fee
   * — it is a misconfiguration somebody has to see rather than a member pay.
   * The server ignores it and so does this.
   */
  it('ignores a flat fee denominated in another currency', () => {
    const foreign = fromMinorUnits(500, 'NGN', 2, '₦');

    expect(estimateWithdrawalFee(gbp(10_000), foreign, null).minorUnits).toBe(0);
  });

  it('never swallows the whole amount, because the member must receive something', () => {
    const fee = estimateWithdrawalFee(gbp(100), gbp(500), null);

    expect(fee.minorUnits).toBe(99);
  });
});

describe('the status vocabulary matches the server', () => {
  it('treats Reversed as terminal', () => {
    // Money that went out and came back. The simulated union had no such state,
    // so a client polling on it would never stop.
    expect(isWithdrawalSettled('Reversed')).toBe(true);
  });

  it.each(['Completed', 'Failed', 'Cancelled'])('treats %s as terminal', (status) => {
    expect(isWithdrawalSettled(status)).toBe(true);
  });

  it.each(['Requested', 'Processing'])('keeps polling while %s', (status) => {
    expect(isWithdrawalSettled(status)).toBe(false);
  });

  /**
   * `Processing` means a provider has the instruction and the outcome is not
   * known. If the provider's answer was lost the platform holds the money until
   * something establishes what happened, so this can last — and a client that
   * treated it as settled would tell a member their payout had finished while
   * it had not.
   */
  it('does not treat Processing as an outcome', () => {
    expect(isWithdrawalSettled('Processing')).toBe(false);
  });
});

describe('the gap register', () => {
  it('no longer lists withdrawal', () => {
    expect(BACKEND_GAPS).not.toHaveProperty('withdrawal');
  });
});
