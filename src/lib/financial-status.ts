// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial status presentation (Backend Phase B15)
//
// One table from a backend status string to everything the UI needs to show it:
// a label, an icon, a tone, and — the part §28 of the brief makes mandatory —
// a spoken description, so a status is never carried by colour alone.
//
// Two rules encoded here rather than repeated in each screen:
//
//   * **`isSettled` is not `isFinished`.** A payment can be over (`Cancelled`,
//     `Expired`) without any money having moved, and can have moved money while
//     still being open (`Captured` before `Settled`). Screens ask which of the
//     two they mean.
//
//   * **An unknown status renders as pending, not as an error.** A deployment
//     ahead of the app in the store can return a status this build has never
//     seen. Showing "In progress" and letting the member refresh is honest;
//     showing "Failed" is a lie the client invented, and showing nothing hides
//     a real payment.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  GivingStatus,
  PaymentStatus,
  PlacementStatus,
  PurchaseStatus,
  RefundStatus,
  SubscriptionStatus,
  TransactionStatus,
  WalletStatus,
  WithdrawalStatus,
} from '@/types/financial';

/** How strongly a state should read. Maps onto the design system's semantic colours. */
export type StatusTone = 'positive' | 'pending' | 'negative' | 'neutral' | 'warning';

export interface StatusPresentation {
  /** Two or three words, sentence case. */
  label: string;
  tone: StatusTone;
  /** An Ionicons name. Carries the state where colour cannot. */
  icon: string;
  /** What a screen reader says. Never relies on the icon or the colour. */
  description: string;
  /** Whether the operation has reached a state it will not leave on its own. */
  isTerminal: boolean;
  /** Whether money has actually moved. */
  isSettled: boolean;
  /** Whether the client should keep reconciling with the backend. */
  needsReconciliation: boolean;
}

const UNKNOWN: StatusPresentation = {
  label: 'In progress',
  tone: 'pending',
  icon: 'time-outline',
  description: 'In progress. Pull down to refresh for the latest status.',
  isTerminal: false,
  isSettled: false,
  needsReconciliation: true,
};

// ── Payments ─────────────────────────────────────────────────────────────────

const PAYMENT: Record<string, StatusPresentation> = {
  Draft: {
    label: 'Not started',
    tone: 'neutral',
    icon: 'ellipse-outline',
    description: 'Not started. Nothing has been charged.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: false,
  },
  Pending: {
    label: 'Processing',
    tone: 'pending',
    icon: 'time-outline',
    description: 'Processing. We are confirming this with the payment provider.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Authorized: {
    label: 'Authorised',
    tone: 'pending',
    icon: 'lock-closed-outline',
    description: 'Authorised. The money is held but has not been taken yet.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Captured: {
    label: 'Paid',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Paid. The payment completed successfully.',
    isTerminal: false,
    isSettled: true,
    needsReconciliation: false,
  },
  Settled: {
    label: 'Completed',
    tone: 'positive',
    icon: 'checkmark-done-circle-outline',
    description: 'Completed and settled.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Failed: {
    label: 'Failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    description: 'Failed. Nothing was charged.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'ban-outline',
    description: 'Cancelled. Nothing was charged.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Refunded: {
    label: 'Refunded',
    tone: 'warning',
    icon: 'return-down-back-outline',
    description: 'Refunded. The money has been returned.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Expired: {
    label: 'Expired',
    tone: 'neutral',
    icon: 'hourglass-outline',
    description: 'Expired. This payment took too long and nothing was charged.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentPaymentStatus(status: PaymentStatus): StatusPresentation {
  return PAYMENT[status] ?? UNKNOWN;
}

/**
 * Whether this payment should still be polled.
 *
 * Used by the reconciliation hook rather than a timer somebody set to "a few
 * seconds": a `Pending` payment is polled, a `Captured` one is not, and the
 * decision lives beside the table that defines what those words mean.
 */
export function paymentNeedsReconciliation(status: PaymentStatus): boolean {
  return presentPaymentStatus(status).needsReconciliation;
}

// ── Transactions ─────────────────────────────────────────────────────────────

const TRANSACTION: Record<string, StatusPresentation> = {
  Pending: {
    label: 'Pending',
    tone: 'pending',
    icon: 'time-outline',
    description: 'Pending. This has not completed yet.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Completed: {
    label: 'Completed',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Completed.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Failed: {
    label: 'Failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    description: 'Failed. Your balance was not affected.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Reversed: {
    label: 'Reversed',
    tone: 'warning',
    icon: 'swap-horizontal-outline',
    description: 'Reversed. A correcting entry has undone this.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
};

export function presentTransactionStatus(status: TransactionStatus): StatusPresentation {
  return TRANSACTION[status] ?? UNKNOWN;
}

// ── Refunds ──────────────────────────────────────────────────────────────────

const REFUND: Record<string, StatusPresentation> = {
  Pending: {
    label: 'Refund pending',
    tone: 'pending',
    icon: 'time-outline',
    description: 'Refund pending. It has been requested and is being processed.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Succeeded: {
    label: 'Refunded',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Refunded. The money has been returned.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Failed: {
    label: 'Refund failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    description: 'The refund did not go through. Support can look into it.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentRefundStatus(status: RefundStatus): StatusPresentation {
  return REFUND[status] ?? UNKNOWN;
}

/**
 * What a member's refund reason means to them.
 *
 * B15's `RefundReason` is written for whoever issues the refund, and two of the
 * six would be alarming to read on your own receipt: nobody wants to see
 * "Fraudulent" against their own payment without an explanation of whose fraud
 * is meant.
 */
export function describeRefundReason(reason: string): string {
  switch (reason) {
    case 'RequestedByPayer':
      return 'You asked for this refund';
    case 'Duplicate':
      return 'This was a duplicate payment';
    case 'Fraudulent':
      return 'Refunded after a security review';
    case 'NotDelivered':
      return 'What you paid for was not provided';
    case 'PolicyRule':
      return 'Refunded under Diaspora’s refund policy';
    case 'Goodwill':
      return 'Refunded as a goodwill gesture';
    default:
      return 'Refunded';
  }
}

// ── Purchases ────────────────────────────────────────────────────────────────

const PURCHASE: Record<string, StatusPresentation> = {
  Pending: {
    label: 'Processing',
    tone: 'pending',
    icon: 'time-outline',
    description: 'Processing. We are waiting for the payment to complete.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Completed: {
    label: 'Active',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Complete and active.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Failed: {
    label: 'Failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    description: 'Failed. Nothing was charged.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Refunded: {
    label: 'Refunded',
    tone: 'warning',
    icon: 'return-down-back-outline',
    description: 'Refunded.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'ban-outline',
    description: 'Cancelled.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentPurchaseStatus(status: PurchaseStatus): StatusPresentation {
  return PURCHASE[status] ?? UNKNOWN;
}

// ── Placements ───────────────────────────────────────────────────────────────

const PLACEMENT: Record<string, StatusPresentation> = {
  Scheduled: {
    label: 'Scheduled',
    tone: 'pending',
    icon: 'calendar-outline',
    description: 'Scheduled. It has not started yet.',
    isTerminal: false,
    isSettled: true,
    needsReconciliation: false,
  },
  Active: {
    label: 'Running',
    tone: 'positive',
    icon: 'flash-outline',
    description: 'Running now.',
    isTerminal: false,
    isSettled: true,
    needsReconciliation: false,
  },
  Expired: {
    label: 'Finished',
    tone: 'neutral',
    icon: 'hourglass-outline',
    description: 'Finished. The promotion window has closed.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'ban-outline',
    description: 'Cancelled before it finished.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Refunded: {
    label: 'Refunded',
    tone: 'warning',
    icon: 'return-down-back-outline',
    description: 'Cancelled and refunded.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
};

export function presentPlacementStatus(status: PlacementStatus): StatusPresentation {
  return PLACEMENT[status] ?? UNKNOWN;
}

// ── Subscriptions ────────────────────────────────────────────────────────────

const SUBSCRIPTION: Record<string, StatusPresentation> = {
  Trial: {
    label: 'Trial',
    tone: 'positive',
    icon: 'gift-outline',
    description: 'On a free trial.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: false,
  },
  Active: {
    label: 'Active',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Active.',
    isTerminal: false,
    isSettled: true,
    needsReconciliation: false,
  },
  GracePeriod: {
    label: 'Payment overdue',
    tone: 'warning',
    icon: 'alert-circle-outline',
    description: 'Payment overdue. Access continues while we retry the payment.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Suspended: {
    label: 'Suspended',
    tone: 'negative',
    icon: 'pause-circle-outline',
    description: 'Suspended. The plan is not giving you access right now.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: false,
  },
  Expired: {
    label: 'Expired',
    tone: 'neutral',
    icon: 'hourglass-outline',
    description: 'Expired.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'ban-outline',
    description: 'Cancelled.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentSubscriptionStatus(status: SubscriptionStatus): StatusPresentation {
  return SUBSCRIPTION[status] ?? UNKNOWN;
}

// ── Giving ───────────────────────────────────────────────────────────────────

const GIVING: Record<string, StatusPresentation> = {
  Pending: {
    label: 'Processing',
    tone: 'pending',
    icon: 'time-outline',
    description: 'Processing.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Completed: {
    label: 'Received',
    tone: 'positive',
    icon: 'heart-circle-outline',
    description: 'Received. Thank you.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Failed: {
    label: 'Failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    description: 'Failed. Nothing was charged.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Refunded: {
    label: 'Refunded',
    tone: 'warning',
    icon: 'return-down-back-outline',
    description: 'Refunded.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'ban-outline',
    description: 'Cancelled.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentGivingStatus(status: GivingStatus): StatusPresentation {
  return GIVING[status] ?? UNKNOWN;
}

// ── Wallets ──────────────────────────────────────────────────────────────────

const WALLET: Record<string, StatusPresentation> = {
  Pending: {
    label: 'Opening',
    tone: 'pending',
    icon: 'time-outline',
    description: 'Your wallet is being opened. It can receive money but cannot send yet.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: false,
  },
  Active: {
    label: 'Active',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Active.',
    isTerminal: false,
    isSettled: true,
    needsReconciliation: false,
  },
  Frozen: {
    label: 'Frozen',
    tone: 'negative',
    icon: 'snow-outline',
    description: 'Frozen. Money can still arrive, but nothing can be sent.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: false,
  },
  Closed: {
    label: 'Closed',
    tone: 'neutral',
    icon: 'lock-closed-outline',
    description: 'Closed.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentWalletStatus(status: WalletStatus): StatusPresentation {
  return WALLET[status] ?? UNKNOWN;
}

// ── Withdrawals ───────────────────────────────────────────────────────────

/**
 * A withdrawal's state, in words.
 *
 * **The ninth presenter, and the last one written**, because until now nothing
 * in the application rendered a withdrawal at all:
 * `GET /financial/wallets/me/withdrawals` has been served the whole time,
 * `fetchWithdrawals` and `useWithdrawals` have existed the whole time, and no
 * screen called either. A member could raise a withdrawal and then had nowhere
 * to see what became of it.
 *
 * **`isSettled` is true only for `Completed`.** `Reversed` money *did* move and
 * then came back, and a screen that read it as settled would show a member a
 * payout they no longer have. `Requested` and `Processing` are both unsettled
 * and both hold the amount out of the available balance, which is why neither
 * is `positive`: the money is neither spent nor spendable.
 */
const WITHDRAWAL: Record<string, StatusPresentation> = {
  Requested: {
    label: 'Requested',
    tone: 'pending',
    icon: 'time-outline',
    description:
      'Requested. The amount is held out of your available balance and you can still cancel it.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Processing: {
    label: 'On its way',
    tone: 'pending',
    icon: 'sync-outline',
    description:
      'Sent to your bank or mobile money provider. It can no longer be cancelled from here.',
    isTerminal: false,
    isSettled: false,
    needsReconciliation: true,
  },
  Completed: {
    label: 'Paid',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    description: 'Paid out. The money has left Diaspora and reached your destination.',
    isTerminal: true,
    isSettled: true,
    needsReconciliation: false,
  },
  Failed: {
    label: 'Failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    description: 'Your provider refused it. The money was returned to your available balance.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'remove-circle-outline',
    description: 'Cancelled before it was sent. The money was returned to your available balance.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
  Reversed: {
    label: 'Returned',
    tone: 'warning',
    // Deliberately not the `Failed` icon. A reversal is money that left and came
    // back, which is a different thing for a member to read than one that never
    // left — and the ledger records it as a compensating entry rather than by
    // undoing the payout.
    icon: 'arrow-undo-outline',
    description:
      'Paid out and then returned — a bounced transfer or a recalled payment. The money is back in your balance.',
    isTerminal: true,
    isSettled: false,
    needsReconciliation: false,
  },
};

export function presentWithdrawalStatus(status: WithdrawalStatus): StatusPresentation {
  return WITHDRAWAL[status] ?? UNKNOWN;
}

// ── Transaction and ledger vocabulary ────────────────────────────────────────

/**
 * A `TransactionType` in words, and an icon for the row.
 *
 * The backend's names are precise and several are jargon: a member reading
 * "CommunityContribution" or "InternalTransfer" on their own statement learns
 * nothing. Falling back to spacing out the camel case keeps an unknown type
 * readable rather than blank.
 */
export function describeTransactionType(type: string): { label: string; icon: string } {
  switch (type) {
    case 'Payment': return { label: 'Payment', icon: 'card-outline' };
    case 'Withdrawal': return { label: 'Withdrawal', icon: 'arrow-up-circle-outline' };
    case 'Refund': return { label: 'Refund', icon: 'return-down-back-outline' };
    case 'Credit': return { label: 'Credit added', icon: 'add-circle-outline' };
    case 'Bonus': return { label: 'Bonus', icon: 'gift-outline' };
    case 'Subscription': return { label: 'Subscription', icon: 'repeat-outline' };
    case 'Promotion': return { label: 'Promotion', icon: 'pricetag-outline' };
    case 'InternalTransfer': return { label: 'Transfer', icon: 'swap-horizontal-outline' };
    case 'Donation': return { label: 'Donation', icon: 'heart-outline' };
    case 'CommunityContribution': return { label: 'Community contribution', icon: 'people-outline' };
    case 'Fee': return { label: 'Fee', icon: 'receipt-outline' };
    case 'Commission': return { label: 'Commission', icon: 'business-outline' };
    case 'Reversal': return { label: 'Reversal', icon: 'refresh-outline' };
    case 'Adjustment': return { label: 'Adjustment', icon: 'construct-outline' };
    case 'Purchase': return { label: 'Purchase', icon: 'bag-handle-outline' };
    case 'Payout': return { label: 'Payout', icon: 'cash-outline' };
    default:
      return { label: type.replace(/([A-Z])/g, ' $1').trim(), icon: 'ellipse-outline' };
  }
}

/** A `LedgerEntryType` in words, for the statement. */
export function describeLedgerEntryType(type: string): string {
  switch (type) {
    case 'Debit': return 'Money out';
    case 'Credit': return 'Money in';
    case 'Hold': return 'Held';
    case 'Release': return 'Hold released';
    case 'Refund': return 'Refund';
    case 'Adjustment': return 'Adjustment';
    case 'Commission': return 'Commission';
    case 'Bonus': return 'Bonus';
    case 'Promotion': return 'Promotion';
    case 'Subscription': return 'Subscription';
    case 'Donation': return 'Donation';
    case 'CommunityContribution': return 'Community contribution';
    case 'Fee': return 'Fee';
    case 'Reversal': return 'Reversal';
    case 'InternalTransfer': return 'Transfer';
    case 'Purchase': return 'Purchase';
    case 'Payout': return 'Payout';
    case 'Payment': return 'Payment';
    default: return type.replace(/([A-Z])/g, ' $1').trim();
  }
}

/**
 * What a member should understand a bucket to mean.
 *
 * `Reserved` is the one nobody guesses: it is money that is theirs and is
 * committed against something outstanding, which is neither "spendable" nor
 * "gone" and needs the whole sentence.
 */
export function describeBucket(bucket: string): string {
  switch (bucket) {
    case 'Available': return 'Ready to spend';
    case 'Pending': return 'Still clearing';
    case 'Reserved': return 'Held against something outstanding';
    default: return bucket;
  }
}

/**
 * A `PaymentMethodKind` for a member. Note that `Wallet` and `Credit` are
 * different things — one spends a balance, the other spends granted credit —
 * and B15 keeps them apart, so the client does too.
 */
export function describePaymentMethod(kind: string): { label: string; icon: string; hint?: string } {
  switch (kind) {
    case 'Card':
      return { label: 'Card', icon: 'card-outline', hint: 'Debit or credit card' };
    case 'BankTransfer':
      return { label: 'Bank transfer', icon: 'business-outline', hint: 'May take a few days to clear' };
    case 'MobileMoney':
      return { label: 'Mobile money', icon: 'phone-portrait-outline' };
    case 'Wallet':
      return { label: 'Diaspora wallet', icon: 'wallet-outline', hint: 'Uses your available balance' };
    case 'ManualTransfer':
      return { label: 'Manual transfer', icon: 'document-text-outline', hint: 'Confirmed by our team' };
    case 'Credit':
      return { label: 'Diaspora credit', icon: 'gift-outline', hint: 'Uses credit granted to you' };
    default:
      return { label: kind.replace(/([A-Z])/g, ' $1').trim(), icon: 'card-outline' };
  }
}

/** A `MonetizationSubjectType` in words, for a receipt line. */
export function describeSubjectType(subjectType: string | null | undefined): string {
  switch (subjectType) {
    case 'Member': return 'your account';
    case 'MarketplaceListing': return 'a marketplace listing';
    case 'HousingListing': return 'a housing listing';
    case 'Job': return 'a job post';
    case 'Provider': return 'a provider profile';
    case 'Organization': return 'an organisation';
    case 'Event': return 'an event';
    case 'Guide': return 'a guide';
    case 'Update': return 'an update';
    case 'Community': return 'a community';
    default: return 'an item';
  }
}
