// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial components (Frontend Phase 5)
//
// One import point for every reusable financial surface, so a vertical adding
// payments imports from here rather than reaching into a file and eventually
// forking a copy. §13 of the brief: no isolated payment implementations.
// ─────────────────────────────────────────────────────────────────────────────

export { AmountDisplay, LabelledAmount, CurrencyDisplay } from './AmountDisplay';
export type { AmountSize, AmountTone } from './AmountDisplay';

export { StatusBadge, StatusBanner, useStatusColours } from './StatusBadge';

export {
  FinancialErrorView,
  FinancialErrorInline,
  GapNotice,
  GapUnavailableView,
} from './FinancialError';

export {
  WalletBalanceCard,
  WalletBalanceInline,
  WalletBalanceSkeleton,
  WalletLifetimeTotals,
} from './WalletBalance';

export {
  TransactionRow,
  LedgerEntryRow,
  TransactionRowSkeleton,
  TransactionListSkeleton,
} from './TransactionRow';

export { AmountInput, MethodPicker, PromotionField, useParsedAmount } from './PaymentInputs';

export {
  PaymentReview,
  PaymentConfirmButton,
  PaymentDisclosure,
  ReviewRow,
  ReviewDetailRow,
} from './PaymentReview';
export type { PaymentReviewProps } from './PaymentReview';

export {
  PaymentPendingView,
  PaymentResultView,
  RefundStatusList,
  RefundEligibilityNote,
} from './PaymentResult';

export { PaymentSheet } from './PaymentSheet';
export type { PaymentSheetProps } from './PaymentSheet';

export { QuickAction, QuickActionRow } from './QuickActions';
export { AccessGate } from './AccessGate';

export { SubjectPaymentButton, NoEscrowDisclosure } from './SubjectPayment';
export type { SubjectPaymentProps } from './SubjectPayment';

export { PromotedBadge } from './PromotedBadge';
