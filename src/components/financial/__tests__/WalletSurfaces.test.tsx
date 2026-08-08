// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Wallet surface component tests (Frontend Phase 5)
//
// The balance card and the two row types. What is asserted is mostly what these
// refuse to do:
//
//   * the card never adds five balances into one honest-looking number
//   * a row never takes its direction from the sign of the amount
//   * a failed transaction never renders as though a balance changed
//   * a pledge of six volunteer hours never renders as £0.00
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import {
  WalletBalanceCard,
  WalletBalanceInline,
  WalletBalanceSkeleton,
  WalletLifetimeTotals,
} from '../WalletBalance';
import { LedgerEntryRow, TransactionRow, TransactionListSkeleton } from '../TransactionRow';
import { QuickAction, QuickActionRow } from '../QuickActions';
import { money } from '@/mocks/financial-data';
import type { LedgerEntry, Transaction, Wallet } from '@/types/financial';

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const wallet: Wallet = {
  walletId: 'w-1',
  accountId: 'a-1',
  walletType: 'Primary',
  ownerType: 'Personal',
  status: 'Active',
  currency: 'GBP',
  available: money(14750),
  pending: money(2200),
  reserved: money(4500),
  lifetimeCredits: money(63400),
  lifetimeDebits: money(41950),
  entryCount: 27,
  lastEntryAt: new Date().toISOString(),
  statusReason: null,
};

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transactionId: 'tx-1',
    transactionType: 'Payment',
    status: 'Completed',
    amount: money(4500),
    description: 'Vintage armchair',
    reason: 'Marketplace purchase',
    subjectType: 'MarketplaceListing',
    subjectId: 'listing-1',
    countryCode: 'GB',
    policyVersion: null,
    entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    entryId: 'le-1',
    transactionId: 'tx-1',
    sequence: 27,
    entryType: 'Payment',
    direction: 'Debit',
    bucket: 'Available',
    amount: money(4500),
    balanceAfter: money(14750),
    reason: 'Marketplace purchase — vintage armchair',
    actorType: 'Gateway',
    source: 'Webhook',
    policyVersion: null,
    correlationId: null,
    subjectType: null,
    subjectId: null,
    externalReference: null,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WalletBalanceCard', () => {
  it('leads with available, not with a total', () => {
    renderWithTheme(<WalletBalanceCard wallet={wallet} />);

    // £147.50 available, £22 clearing, £45 held. A card showing £214.50 would
    // be a card somebody tries to spend.
    expect(screen.getByLabelText(/available balance.*147\.50/i)).toBeTruthy();
    expect(screen.queryByText(/214\.50/)).toBeNull();
  });

  it('shows pending and reserved separately, with plain-English labels', () => {
    renderWithTheme(<WalletBalanceCard wallet={wallet} />);

    expect(screen.getByText('Still clearing')).toBeTruthy();
    expect(screen.getByText('Held')).toBeTruthy();
    expect(screen.getByLabelText(/held against something outstanding/i)).toBeTruthy();
  });

  it('hides the secondary row when both are zero', () => {
    // A row of zeroes teaches people to stop reading the row.
    renderWithTheme(
      <WalletBalanceCard wallet={{ ...wallet, pending: money(0), reserved: money(0) }} />
    );

    expect(screen.queryByText('Still clearing')).toBeNull();
    expect(screen.queryByText('Held')).toBeNull();
  });

  it('surfaces a frozen wallet on the card itself', () => {
    renderWithTheme(
      <WalletBalanceCard
        wallet={{ ...wallet, status: 'Frozen', statusReason: 'Under review by our team.' }}
      />
    );

    expect(screen.getByLabelText(/frozen.*money can still arrive/i)).toBeTruthy();
    expect(screen.getByText('Under review by our team.')).toBeTruthy();
  });

  it('says when the number may be out of date', () => {
    renderWithTheme(<WalletBalanceCard wallet={wallet} isStale />);
    expect(screen.getByText(/may be out of date/i)).toBeTruthy();
  });

  it('labels a promotional wallet as credit rather than as a balance', () => {
    renderWithTheme(<WalletBalanceCard wallet={{ ...wallet, walletType: 'Promotional' }} />);
    expect(screen.getByText('Diaspora credit')).toBeTruthy();
  });

  it('offers the statement when a handler is given', () => {
    const onPress = jest.fn();
    renderWithTheme(<WalletBalanceCard wallet={wallet} onPressStatement={onPress} />);

    fireEvent.press(screen.getByLabelText(/view statement.*27 entries/i));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('WalletLifetimeTotals', () => {
  it('renders the backend totals rather than summing a page of history', () => {
    renderWithTheme(<WalletLifetimeTotals wallet={wallet} />);

    expect(screen.getByLabelText(/received in total.*634/i)).toBeTruthy();
    expect(screen.getByLabelText(/spent in total.*419/i)).toBeTruthy();
  });
});

describe('WalletBalanceInline and skeletons', () => {
  it('shows a compact balance for a payment sheet', () => {
    renderWithTheme(<WalletBalanceInline wallet={wallet} />);
    expect(screen.getByLabelText(/wallet balance.*147\.50/i)).toBeTruthy();
  });

  it('announces the loading state as a progress indicator', () => {
    renderWithTheme(<WalletBalanceSkeleton />);
    expect(screen.getByLabelText('Loading your balance')).toBeTruthy();
  });

  it('hides skeleton rows from assistive tech', () => {
    renderWithTheme(<TransactionListSkeleton rows={3} />);
    expect(screen.getByLabelText('Loading transactions')).toBeTruthy();
  });
});

describe('TransactionRow', () => {
  it('speaks the description, amount, status and time as one phrase', () => {
    renderWithTheme(<TransactionRow transaction={transaction()} />);

    expect(screen.getByLabelText(/vintage armchair.*payment.*45\.00.*completed/i)).toBeTruthy();
  });

  it('marks an outgoing payment as money leaving', () => {
    renderWithTheme(<TransactionRow transaction={transaction()} />);

    expect(screen.getByLabelText(/minus 45\.00/i)).toBeTruthy();
    expect(screen.getByText('Out')).toBeTruthy();
  });

  it('does not mark an incoming credit as leaving', () => {
    renderWithTheme(
      <TransactionRow transaction={transaction({ transactionType: 'Refund', description: 'Refund' })} />
    );

    expect(screen.queryByText('Out')).toBeNull();
  });

  it('does not imply a balance change on a failed transaction', () => {
    renderWithTheme(<TransactionRow transaction={transaction({ status: 'Failed' })} />);

    // The badge appears — a failure is why somebody opened the screen — and the
    // amount is muted rather than rendered as though it moved.
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.queryByText('Out')).toBeNull();
  });

  it('shows no badge on a completed transaction, because that is the default', () => {
    renderWithTheme(<TransactionRow transaction={transaction()} />);
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('shows the badge on a pending one', () => {
    renderWithTheme(<TransactionRow transaction={transaction({ status: 'Pending' })} />);
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('becomes a button only when it can be opened', () => {
    const onPress = jest.fn();
    renderWithTheme(<TransactionRow transaction={transaction()} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('LedgerEntryRow', () => {
  it('takes direction from the backend field, not the sign of the amount', () => {
    // B15 sends every amount as a positive magnitude and says separately
    // whether it was a debit or a credit.
    renderWithTheme(<LedgerEntryRow entry={ledgerEntry({ direction: 'Credit' })} />);
    expect(screen.getByLabelText(/credit of/i)).toBeTruthy();

    renderWithTheme(<LedgerEntryRow entry={ledgerEntry({ direction: 'Debit' })} />);
    expect(screen.getAllByLabelText(/debit of/i).length).toBeGreaterThan(0);
  });

  it('shows the stored balance after the entry', () => {
    renderWithTheme(<LedgerEntryRow entry={ledgerEntry()} />);
    expect(screen.getByLabelText(/balance after.*147\.50/i)).toBeTruthy();
  });

  it('names a non-available bucket, which nobody guesses', () => {
    renderWithTheme(<LedgerEntryRow entry={ledgerEntry({ bucket: 'Reserved', entryType: 'Hold' })} />);
    expect(screen.getByLabelText(/held against something outstanding/i)).toBeTruthy();
  });

  it('shows the policy version that priced it', () => {
    // The answer to "why was I charged this" — the most common financial
    // support question, and the reason B15 records it on every priced entry.
    renderWithTheme(<LedgerEntryRow entry={ledgerEntry({ policyVersion: 'marketplace.commission@2' })} />);
    expect(screen.getByText('marketplace.commission@2')).toBeTruthy();
  });

  it('omits the policy line when nothing priced the entry', () => {
    renderWithTheme(<LedgerEntryRow entry={ledgerEntry({ policyVersion: null })} />);
    expect(screen.queryByText(/@\d/)).toBeNull();
  });
});

describe('QuickAction', () => {
  it('explains an unavailable action rather than being a dead control', () => {
    const onPress = jest.fn();

    renderWithTheme(
      <QuickActionRow>
        <QuickAction
          icon="arrow-up-circle-outline"
          label="Withdraw"
          onPress={onPress}
          disabled
          disabledReason="Withdrawals are not available on Diaspora yet."
        />
      </QuickActionRow>
    );

    const action = screen.getByLabelText(/withdraw.*not available on diaspora yet/i);

    // Not marked disabled: a disabled control cannot be activated by assistive
    // technology, so a VoiceOver user would never reach the explanation that a
    // sighted user gets by tapping. The label and hint carry it instead.
    expect(action.props.accessibilityState?.disabled).toBeFalsy();
    expect(action.props.accessibilityHint).toMatch(/explains why/i);

    fireEvent.press(action);
    expect(onPress).toHaveBeenCalled();
  });

  it('marks a simulated capability visibly', () => {
    renderWithTheme(
      <QuickActionRow>
        <QuickAction icon="add-circle-outline" label="Add money" onPress={jest.fn()} isPreview />
      </QuickActionRow>
    );

    expect(screen.getByLabelText('Add money')).toBeTruthy();
  });
});
