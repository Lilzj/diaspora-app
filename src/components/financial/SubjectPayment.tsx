// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Paying for a vertical's subject (Frontend Phase 5)
//
// One component that lets Marketplace, Events and Housing take a payment
// without any of them containing payment logic. §14's division, made concrete:
//
//   the vertical owns the listing, the event, the property
//   B15 owns the money
//   this composes the two, and belongs to neither
//
// It creates a `PaymentIntent` with the vertical's `subjectType`/`subjectId`
// and hands the rest to `PaymentSheet`. **It does not change the subject.**
// Nothing here marks a listing sold, an event booked or a property reserved,
// because B15 exposes no order aggregate and the verticals expose no route that
// a payment could drive — GAP-04. §14's own rule covers the same ground from
// the other side: "Never make the Marketplace UI authoritative for payment
// completion."
//
// So the honest contract is: this records that money moved, for that subject,
// and says so on screen. Arranging the handover stays a conversation between
// two people, which is what it was before this button existed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { PaymentSheet } from './PaymentSheet';
import { useCanTransact, useCreatePaymentIntent, useCurrencies } from '@/hooks/financial';
import { moneyFromMajor, toRequestAmount } from '@/lib/money';
import type { MonetizationSubjectType, PaymentIntent, PaymentMethodKind } from '@/types/financial';

export interface SubjectPaymentProps {
  /** The vertical's own type name, in B15's vocabulary. */
  subjectType: MonetizationSubjectType;
  subjectId: string;
  /** What is being paid for, in the member's words. */
  subjectTitle: string;
  /** Major units, as every card in this client already holds a price. */
  amount: number;
  currency: string;
  /** What appears on the statement. Kept short — it is a ledger reason. */
  description: string;
  /** Extra review rows: a date, a seller, a deposit period. */
  details?: { label: string; value: string; icon?: string }[];
  /** Overrides the button text. */
  label?: string;
  /** A sentence under the button explaining what paying does and does not do. */
  disclosure?: string;
  variant?: 'primary' | 'secondary';
}

export function SubjectPaymentButton({
  subjectType,
  subjectId,
  subjectTitle,
  amount,
  currency,
  description,
  details,
  label,
  disclosure,
  variant = 'primary',
}: SubjectPaymentProps) {
  const { tokens } = useTheme();
  const { data: currencies } = useCurrencies();
  const { canTransact, blockedBy } = useCanTransact();

  const [sheetOpen, setSheetOpen] = useState(false);

  const payable = useMemo(
    () => moneyFromMajor(amount, currency, currencies),
    [amount, currency, currencies]
  );

  /**
   * The idempotency scope is the subject.
   *
   * Two taps on "Pay" for the same listing within the key's window are one
   * payment — which is the double-tap case. Genuinely paying the same seller
   * twice for two different things means two different subjects, so the scope
   * separates them without the member having to think about it.
   */
  const createIntent = useCreatePaymentIntent({
    operation: 'payment',
    subject: `${subjectType}:${subjectId}`,
  });

  const execute = useCallback(
    async (methodKind: PaymentMethodKind): Promise<PaymentIntent | null> =>
      createIntent.mutateAsync({
        amount: toRequestAmount(payable),
        currency: payable.currency,
        methodKind,
        description,
        subjectType,
        subjectId,
      }),
    [createIntent, payable, description, subjectType, subjectId]
  );

  const isDisabled = !canTransact || payable.minorUnits <= 0;

  return (
    <>
      <TouchableOpacity
        onPress={() => setSheetOpen(true)}
        disabled={isDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          isDisabled
            ? `${label ?? 'Pay'}. ${blockedBy?.message ?? 'Not available on your account yet.'}`
            : `${label ?? 'Pay'} ${payable.symbol ?? ''}${payable.amount}`
        }
        accessibilityState={{ disabled: isDisabled }}
        style={{
          backgroundColor: isDisabled
            ? tokens.color.neutral[200]
            : variant === 'primary'
              ? tokens.color.secondary[500]
              : 'transparent',
          borderColor: variant === 'secondary' ? tokens.color.border.default : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
        }}
        className="flex-row items-center justify-center rounded-2xl py-3.5 px-4"
      >
        <Ionicons
          name="lock-closed"
          size={14}
          color={
            isDisabled
              ? tokens.color.text.disabled
              : variant === 'primary'
                ? '#FFFFFF'
                : tokens.color.text.primary
          }
        />
        <Text
          style={{
            color: isDisabled
              ? tokens.color.text.disabled
              : variant === 'primary'
                ? '#FFFFFF'
                : tokens.color.text.primary,
          }}
          className="text-xs font-black ml-2"
        >
          {label ?? 'Pay with Diaspora'}
        </Text>
      </TouchableOpacity>

      {blockedBy || !canTransact ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold text-center mt-2 leading-relaxed"
        >
          {blockedBy?.hint ?? 'Diaspora verification is needed before you can pay.'}
        </Text>
      ) : disclosure ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-medium text-center mt-2 leading-relaxed"
        >
          {disclosure}
        </Text>
      ) : null}

      <PaymentSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={subjectTitle}
        description={description}
        subjectLabel={subjectTitle}
        listPrice={payable}
        payable={payable}
        details={details}
        execute={execute}
        confirmLabel="Confirm and pay"
        onCompleted={(payment) => router.push(`/wallet/payments/${payment.paymentIntentId}`)}
      />
    </>
  );
}

/**
 * The sentence that must sit under any pay-a-stranger button on this platform.
 *
 * Diaspora holds nothing in escrow — see `/wallet/protection` and
 * `financial-gaps.ts` → `protection` — and a payment button without that
 * caveat implies a guarantee the platform has not built.
 */
export function NoEscrowDisclosure({ compact = false }: { compact?: boolean }) {
  const { tokens } = useTheme();

  return (
    <TouchableOpacity
      onPress={() => router.push('/safety/trading' as never)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Diaspora does not hold this money. Only pay someone you know or trust. Tap to read how to trade safely."
      className={compact ? 'mt-2' : 'mt-3'}
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-medium text-center leading-relaxed"
      >
        Diaspora does not hold this money — it goes straight to the other person. Only pay
        someone you know or trust, and check their trust level first.{' '}
        <Text style={{ color: tokens.color.primary[500] }} className="font-bold">
          How to trade safely
        </Text>
      </Text>
    </TouchableOpacity>
  );
}
