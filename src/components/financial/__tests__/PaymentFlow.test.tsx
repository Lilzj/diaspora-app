// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment flow component tests (Frontend Phase 5)
//
// The assertions that matter most in this phase, because they are the ones §22
// is written about:
//
//   * "Paid" appears only when the backend says `Captured` or `Settled`
//   * a payment whose outcome is unknown says so, and tells the member not to
//     pay again
//   * a timed-out reconciliation is not a failure
//   * the confirm button cannot be pressed twice
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import {
  PaymentConfirmButton,
  PaymentDisclosure,
  PaymentReview,
} from '../PaymentReview';
import {
  PaymentPendingView,
  PaymentResultView,
  RefundEligibilityNote,
  RefundStatusList,
} from '../PaymentResult';
import { AmountInput, MethodPicker } from '../PaymentInputs';
import { fromMinorUnits } from '@/lib/money';
import type { CurrencyFact, PaymentIntent, PaymentStatus, Refund } from '@/types/financial';

const CURRENCIES: CurrencyFact[] = [
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', exponent: 2, isActive: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0, isActive: true },
];

const gbp = (minorUnits: number) => fromMinorUnits(minorUnits, 'GBP', 2, '£');

function payment(status: PaymentStatus, overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    paymentIntentId: 'pi-test-1',
    status,
    amount: gbp(4500),
    captured: status === 'Captured' || status === 'Settled' ? gbp(4500) : gbp(0),
    refunded: gbp(0),
    refundableRemaining: status === 'Captured' || status === 'Settled' ? gbp(4500) : gbp(0),
    methodKind: 'Card',
    description: 'Vintage armchair',
    subjectType: 'MarketplaceListing',
    subjectId: 'listing-1',
    provider: 'Simulator',
    nextAction: null,
    failureCode: null,
    failureMessage: null,
    attemptCount: 1,
    refunds: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    authorizedAt: null,
    capturedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

describe('"Paid" is a word only the backend may cause', () => {
  it.each<PaymentStatus>(['Captured', 'Settled'])('says the payment completed when %s', (status) => {
    renderWithTheme(<PaymentResultView payment={payment(status)} />);
    expect(screen.getByText('Payment complete')).toBeTruthy();
  });

  it.each<PaymentStatus>(['Failed', 'Cancelled', 'Expired'])(
    'never says complete when %s',
    (status) => {
      renderWithTheme(<PaymentResultView payment={payment(status)} />);
      expect(screen.queryByText('Payment complete')).toBeNull();
    }
  );

  it('says nothing was charged on a failure', () => {
    renderWithTheme(
      <PaymentResultView
        payment={payment('Failed', { failureMessage: 'The card issuer declined this payment.' })}
      />
    );

    expect(screen.getByText(/card issuer declined/i)).toBeTruthy();
  });

  it('says nothing was charged on a cancellation', () => {
    renderWithTheme(<PaymentResultView payment={payment('Cancelled')} />);
    expect(screen.getByText(/nothing was charged/i)).toBeTruthy();
  });

  it('announces the outcome assertively, because it is the answer somebody waited for', () => {
    renderWithTheme(<PaymentResultView payment={payment('Captured')} />);

    const region = screen.getByLabelText(/payment complete/i);
    expect(region.props.accessibilityLiveRegion).toBe('assertive');
  });

  it('shows the reference for a completed payment, since support will ask for it', () => {
    renderWithTheme(<PaymentResultView payment={payment('Captured')} />);
    expect(screen.getByLabelText(/reference, pi-test-1/i)).toBeTruthy();
  });

  it('does not show a reference for a payment that never happened', () => {
    renderWithTheme(<PaymentResultView payment={payment('Failed')} />);
    expect(screen.queryByLabelText(/reference, pi-test-1/i)).toBeNull();
  });
});

describe('the unknown-outcome screen', () => {
  it('says the status is being confirmed rather than guessing', () => {
    renderWithTheme(
      <PaymentPendingView payment={payment('Pending')} hasTimedOut={false} onCheckNow={jest.fn()} />
    );

    expect(screen.getByText('Confirming your payment')).toBeTruthy();
    expect(screen.queryByText(/failed/i)).toBeNull();
    expect(screen.queryByText(/complete/i)).toBeNull();
  });

  it('tells the member not to pay again — the single most important line', () => {
    renderWithTheme(
      <PaymentPendingView payment={payment('Pending')} hasTimedOut={false} onCheckNow={jest.fn()} />
    );

    expect(screen.getByText(/please do not pay again/i)).toBeTruthy();
  });

  it('treats a timeout as slow, not as failed', () => {
    renderWithTheme(
      <PaymentPendingView payment={payment('Pending')} hasTimedOut onCheckNow={jest.fn()} />
    );

    expect(screen.getByText('This is taking longer than usual')).toBeTruthy();
    expect(screen.getByText(/we will send you a notification/i)).toBeTruthy();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it('offers a way to ask again', () => {
    const onCheckNow = jest.fn();
    renderWithTheme(
      <PaymentPendingView payment={payment('Pending')} hasTimedOut onCheckNow={onCheckNow} />
    );

    fireEvent.press(screen.getByLabelText('Check the payment status again'));
    expect(onCheckNow).toHaveBeenCalled();
  });
});

describe('PaymentConfirmButton', () => {
  it('cannot be pressed twice while a payment is in flight', () => {
    const onPress = jest.fn();

    renderWithTheme(
      <PaymentConfirmButton label="Confirm and pay" amount={gbp(4500)} onPress={onPress} isSubmitting />
    );

    fireEvent.press(screen.getByLabelText(/sending your payment/i));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('says what is happening rather than going blank', () => {
    renderWithTheme(
      <PaymentConfirmButton label="Confirm and pay" amount={gbp(4500)} onPress={jest.fn()} isSubmitting />
    );

    // An unlabelled spinner on a pay button is where people tap again.
    expect(screen.getByText('Sending…')).toBeTruthy();
    expect(screen.getByLabelText(/please wait/i)).toBeTruthy();
  });

  it('restates the amount on the button, because people read buttons', () => {
    renderWithTheme(
      <PaymentConfirmButton
        label="Confirm and pay"
        amount={gbp(4500)}
        onPress={jest.fn()}
        isSubmitting={false}
      />
    );

    expect(screen.getByText(/£45\.00/)).toBeTruthy();
  });

  it('explains why it is disabled instead of just being dead', () => {
    renderWithTheme(
      <PaymentConfirmButton
        label="Confirm and pay"
        amount={gbp(4500)}
        onPress={jest.fn()}
        isSubmitting={false}
        disabled
        disabledReason="Diaspora verification is needed before money can move."
      />
    );

    expect(screen.getByText(/verification is needed/i)).toBeTruthy();
    expect(screen.getByLabelText(/unavailable: diaspora verification/i)).toBeTruthy();
  });
});

describe('PaymentReview', () => {
  it('shows the payable total from the backend, not list minus discount', () => {
    renderWithTheme(
      <PaymentReview
        title="Boost for 7 days"
        description="Higher search priority."
        listPrice={gbp(999)}
        discount={gbp(100)}
        payable={gbp(899)}
        methodKind="Card"
      />
    );

    expect(screen.getByLabelText(/total to pay.*8\.99/i)).toBeTruthy();
  });

  it('omits the discount row when there is none', () => {
    renderWithTheme(
      <PaymentReview
        title="Boost"
        description="x"
        listPrice={gbp(999)}
        payable={gbp(999)}
      />
    );

    expect(screen.queryByLabelText(/^discount/i)).toBeNull();
  });

  it('names the payment method', () => {
    renderWithTheme(
      <PaymentReview title="Boost" description="x" listPrice={gbp(999)} payable={gbp(999)} methodKind="Wallet" />
    );

    expect(screen.getByLabelText(/paying with, diaspora wallet/i)).toBeTruthy();
  });
});

describe('PaymentDisclosure', () => {
  it('never promises an outcome the backend has not confirmed', () => {
    renderWithTheme(<PaymentDisclosure methodKind="Card" />);
    expect(screen.getByText(/before anything is marked as paid/i)).toBeTruthy();
  });

  it('warns that a bank transfer takes days', () => {
    renderWithTheme(<PaymentDisclosure methodKind="BankTransfer" />);
    expect(screen.getByText(/few days to clear/i)).toBeTruthy();
  });
});

describe('AmountInput', () => {
  it('refuses digits beyond the currency exponent', () => {
    const onChangeText = jest.fn();

    renderWithTheme(
      <AmountInput value="10.00" onChangeText={onChangeText} currency="GBP" currencies={CURRENCIES} />
    );

    fireEvent.changeText(screen.getByLabelText(/amount in gbp/i), '10.005');
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it('refuses a decimal point in a zero-exponent currency', () => {
    const onChangeText = jest.fn();

    renderWithTheme(
      <AmountInput value="1500" onChangeText={onChangeText} currency="JPY" currencies={CURRENCIES} />
    );

    fireEvent.changeText(screen.getByLabelText(/amount in jpy/i), '1500.5');
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it('strips characters that are not part of a number', () => {
    const onChangeText = jest.fn();

    renderWithTheme(
      <AmountInput value="" onChangeText={onChangeText} currency="GBP" currencies={CURRENCIES} />
    );

    fireEvent.changeText(screen.getByLabelText(/amount in gbp/i), '£12a.34');
    expect(onChangeText).toHaveBeenCalledWith('12.34');
  });

  it('announces a validation error', () => {
    renderWithTheme(
      <AmountInput
        value="1"
        onChangeText={jest.fn()}
        currency="GBP"
        currencies={CURRENCIES}
        error="The smallest top-up is £5.00."
      />
    );

    const message = screen.getByText('The smallest top-up is £5.00.');
    expect(message.props.accessibilityLiveRegion).toBe('polite');
  });
});

describe('MethodPicker', () => {
  it('renders the deployment "not configured" state honestly', () => {
    // §4-D. An empty gateway list is a deployment fact, not a member error, and
    // it must never be hidden behind a spinner that never resolves.
    renderWithTheme(<MethodPicker methods={[]} selected={null} onSelect={jest.fn()} />);

    expect(screen.getByText('Payments unavailable')).toBeTruthy();
    expect(screen.getByText(/nothing you do here will be charged/i)).toBeTruthy();
  });

  it('offers only what the deployment supports', () => {
    renderWithTheme(
      <MethodPicker methods={['Card', 'MobileMoney']} selected="Card" onSelect={jest.fn()} />
    );

    expect(screen.getByLabelText(/^card/i)).toBeTruthy();
    expect(screen.getByLabelText(/mobile money/i)).toBeTruthy();
    expect(screen.queryByLabelText(/bank transfer/i)).toBeNull();
  });

  it('disables the wallet when it cannot cover the payment, and says by how much', () => {
    const wallet = {
      walletId: 'w1', accountId: 'a1', walletType: 'Primary', ownerType: 'Personal',
      status: 'Active', currency: 'GBP',
      available: gbp(1000), pending: gbp(0), reserved: gbp(0),
      lifetimeCredits: gbp(1000), lifetimeDebits: gbp(0),
      entryCount: 1, lastEntryAt: null, statusReason: null,
    } as const;

    const onSelect = jest.fn();
    renderWithTheme(
      <MethodPicker
        methods={['Wallet', 'Card']}
        selected="Card"
        onSelect={onSelect}
        wallet={wallet}
        payable={gbp(4500)}
      />
    );

    const walletOption = screen.getByLabelText(/diaspora wallet.*not enough/i);
    fireEvent.press(walletOption);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables the wallet when it is frozen', () => {
    const frozen = {
      walletId: 'w1', accountId: 'a1', walletType: 'Primary', ownerType: 'Personal',
      status: 'Frozen', currency: 'GBP',
      available: gbp(100000), pending: gbp(0), reserved: gbp(0),
      lifetimeCredits: gbp(0), lifetimeDebits: gbp(0),
      entryCount: 0, lastEntryAt: null, statusReason: 'Under review',
    } as const;

    renderWithTheme(
      <MethodPicker methods={['Wallet']} selected={null} onSelect={jest.fn()} wallet={frozen} payable={gbp(100)} />
    );

    expect(screen.getByLabelText(/wallet is frozen/i)).toBeTruthy();
  });
});

describe('refunds are read-only for a member', () => {
  const refund: Refund = {
    refundId: 'rf-1',
    amount: gbp(1200),
    reason: 'PolicyRule',
    status: 'Succeeded',
    note: 'Organiser reduced capacity.',
    issuedAt: new Date().toISOString(),
  };

  it('shows what happened and why, in words a member can read', () => {
    renderWithTheme(<RefundStatusList refunds={[refund]} />);

    expect(screen.getByText(/refunded under diaspora’s refund policy/i)).toBeTruthy();
    expect(screen.getByText(/organiser reduced capacity/i)).toBeTruthy();
  });

  it('renders nothing when there are no refunds', () => {
    const { toJSON } = renderWithTheme(<RefundStatusList refunds={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('points at support rather than offering a button that returns 403', () => {
    // GAP-05: `POST /payment-intents/{id}/refunds` is Admin-only.
    renderWithTheme(<RefundEligibilityNote payment={payment('Captured')} />);

    expect(screen.getByText(/issued by the diaspora team/i)).toBeTruthy();
    expect(screen.queryByLabelText(/request a refund/i)).toBeNull();
  });

  it('says nothing about refunds on a payment that never settled', () => {
    const { toJSON } = renderWithTheme(<RefundEligibilityNote payment={payment('Failed')} />);
    expect(toJSON()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// One answer about whether the money moved
// ─────────────────────────────────────────────────────────────────────────────

describe('an unknown outcome is not contradicted', () => {
  const SHEET: string = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src/components/financial/PaymentSheet.tsx'),
    'utf8'
  );

  it('drops the pre-flight reason once the outcome is indeterminate', () => {
    // ── The defect this exists for ──────────────────────────────────────────
    //
    // `blockedBy` is the check made before sending, and its offline hint ends
    // "Nothing has been sent." Both it and the indeterminate banner rendered at
    // once, so a member who lost connection mid-payment read "We are checking
    // whether it went through. Do not try again yet." directly above "Paying
    // needs a connection. Nothing has been sent."
    //
    // One sentence says the outcome is unknown; the next says there is no
    // outcome to know. The second invites the retry the first forbids — and a
    // purchase intent had in fact been opened when this was seen.
    expect(SHEET).toMatch(/if \(error\?\.isIndeterminate\) return null;/);

    // Before the pre-flight branch, or it never runs.
    expect(SHEET.indexOf('if (error?.isIndeterminate) return null;')).toBeLessThan(
      SHEET.indexOf('if (blockedBy) return blockedBy.hint')
    );
  });
});
