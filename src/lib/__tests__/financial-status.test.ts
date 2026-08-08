// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Status presentation tests (Frontend Phase 5)
//
// Two rules to hold:
//
//   * an unknown status renders as pending, never as failed — a deployment can
//     be ahead of the app in the store, and inventing "Failed" for a status
//     this build has not heard of would be the client lying about somebody's
//     money
//
//   * `isSettled` and `isTerminal` are different questions, because a payment
//     can be over without money moving and can have moved money while still
//     open
// ─────────────────────────────────────────────────────────────────────────────

import {
  describeBucket,
  describeLedgerEntryType,
  describePaymentMethod,
  describeRefundReason,
  describeSubjectType,
  describeTransactionType,
  paymentNeedsReconciliation,
  presentGivingStatus,
  presentPaymentStatus,
  presentPlacementStatus,
  presentPurchaseStatus,
  presentRefundStatus,
  presentSubscriptionStatus,
  presentTransactionStatus,
  presentWalletStatus,
} from '../financial-status';
import { PAYMENT_STATUSES, TRANSACTION_STATUSES } from '@/types/financial';

describe('every declared status is mapped', () => {
  it.each(PAYMENT_STATUSES)('maps payment status %s', (status) => {
    const presented = presentPaymentStatus(status);
    expect(presented.label).toBeTruthy();
    expect(presented.description).toBeTruthy();
    expect(presented.icon).toBeTruthy();
  });

  it.each(TRANSACTION_STATUSES)('maps transaction status %s', (status) => {
    expect(presentTransactionStatus(status).label).toBeTruthy();
  });
});

describe('unknown statuses degrade safely', () => {
  it('renders an unseen payment status as pending rather than failed', () => {
    const presented = presentPaymentStatus('SomethingAddedInB19');

    expect(presented.tone).toBe('pending');
    expect(presented.isSettled).toBe(false);
    expect(presented.isTerminal).toBe(false);
    expect(presented.needsReconciliation).toBe(true);
    expect(presented.label).not.toMatch(/fail/i);
  });

  it('does the same for every other status family', () => {
    for (const present of [
      presentTransactionStatus,
      presentRefundStatus,
      presentPurchaseStatus,
      presentPlacementStatus,
      presentSubscriptionStatus,
      presentGivingStatus,
      presentWalletStatus,
    ]) {
      expect(present('Unheard-of').tone).toBe('pending');
      expect(present('Unheard-of').isSettled).toBe(false);
    }
  });
});

describe('settled versus terminal', () => {
  it('treats a cancelled payment as over but not settled', () => {
    const cancelled = presentPaymentStatus('Cancelled');
    expect(cancelled.isTerminal).toBe(true);
    expect(cancelled.isSettled).toBe(false);
  });

  it('treats a captured payment as settled but not yet terminal', () => {
    // Captured money has moved; the payment can still become Settled or
    // Refunded, so it is not the end of the story.
    const captured = presentPaymentStatus('Captured');
    expect(captured.isSettled).toBe(true);
    expect(captured.isTerminal).toBe(false);
  });

  it('treats an expired payment as over with nothing charged', () => {
    const expired = presentPaymentStatus('Expired');
    expect(expired.isTerminal).toBe(true);
    expect(expired.isSettled).toBe(false);
    expect(expired.description).toMatch(/nothing was charged/i);
  });

  it('treats a refunded payment as settled — money moved, twice', () => {
    expect(presentPaymentStatus('Refunded').isSettled).toBe(true);
  });
});

describe('reconciliation', () => {
  it.each(['Pending', 'Authorized'])('keeps polling while %s', (status) => {
    expect(paymentNeedsReconciliation(status)).toBe(true);
  });

  it.each(['Captured', 'Settled', 'Failed', 'Cancelled', 'Refunded', 'Expired'])(
    'stops polling once %s',
    (status) => {
      expect(paymentNeedsReconciliation(status)).toBe(false);
    }
  );

  it('flags a subscription in its grace period for reconciliation', () => {
    // Access continues while a failed renewal is retried, so the state changes
    // without the member doing anything.
    expect(presentSubscriptionStatus('GracePeriod').needsReconciliation).toBe(true);
  });
});

describe('accessible descriptions', () => {
  it('gives every status a sentence, not just a word', () => {
    for (const status of PAYMENT_STATUSES) {
      const { description, label } = presentPaymentStatus(status);
      expect(description.length).toBeGreaterThan(label.length);
    }
  });

  it('says explicitly that a failed payment charged nothing', () => {
    expect(presentPaymentStatus('Failed').description).toMatch(/nothing was charged/i);
  });

  it('explains a frozen wallet in both directions', () => {
    const frozen = presentWalletStatus('Frozen');
    expect(frozen.description).toMatch(/still arrive/i);
    expect(frozen.description).toMatch(/nothing can be sent/i);
  });
});

describe('vocabulary translation', () => {
  it('turns a refund reason into something safe to read on your own receipt', () => {
    // "Fraudulent" against your own payment, unexplained, reads as an accusation.
    expect(describeRefundReason('Fraudulent')).toMatch(/security review/i);
    expect(describeRefundReason('RequestedByPayer')).toMatch(/you asked/i);
  });

  it('translates transaction types out of camel case', () => {
    expect(describeTransactionType('CommunityContribution').label).toBe('Community contribution');
    expect(describeTransactionType('Payout').label).toBe('Payout');
  });

  it('keeps an unknown transaction type readable', () => {
    expect(describeTransactionType('SomeNewKind').label).toBe('Some New Kind');
  });

  it('explains the reserved bucket, which nobody guesses', () => {
    expect(describeBucket('Reserved')).toMatch(/held against/i);
    expect(describeBucket('Available')).toMatch(/ready to spend/i);
  });

  it('keeps Wallet and Credit apart, because B15 does', () => {
    expect(describePaymentMethod('Wallet').hint).toMatch(/available balance/i);
    expect(describePaymentMethod('Credit').hint).toMatch(/credit granted/i);
  });

  it('translates ledger entry types', () => {
    expect(describeLedgerEntryType('Hold')).toBe('Held');
    expect(describeLedgerEntryType('Release')).toBe('Hold released');
  });

  it('describes each monetization subject in words', () => {
    expect(describeSubjectType('MarketplaceListing')).toBe('a marketplace listing');
    expect(describeSubjectType('HousingListing')).toBe('a housing listing');
    expect(describeSubjectType(null)).toBe('an item');
  });
});
