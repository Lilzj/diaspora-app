// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment review and confirmation (Frontend Phase 5)
//
// The last screen before money moves, and the one place the whole app is
// allowed to say "you are about to pay X".
//
// Two rules it enforces:
//
//   **Nothing is arithmetic the client invented.** A list price, a discount and
//   a payable total all arrive from the backend — from `PromotionQuoteResponse`
//   or `MonetizationPurchaseResponse`. `TotalRow` takes a `Money` and renders
//   it; it never subtracts one from another. Where a caller genuinely has to
//   combine amounts it uses `money.ts`, on integers, and passes the result in.
//
//   **Confirmation is explicit and single-use.** The button disables the
//   instant it is pressed and stays disabled while the mutation is in flight —
//   the first line of defence against a double charge, with the idempotency key
//   behind it as the second.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from './AmountDisplay';
import { describeMoney, formatMoney, isZero } from '@/lib/money';
import { describePaymentMethod } from '@/lib/financial-status';
import type { Money, PaymentMethodKind } from '@/types/financial';

// ── Line items ───────────────────────────────────────────────────────────────

export function ReviewRow({
  label,
  value,
  emphasis = false,
  hint,
}: {
  label: string;
  value: Money;
  emphasis?: boolean;
  hint?: string;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${describeMoney(value)}${hint ? `. ${hint}` : ''}`}
      className="flex-row items-center justify-between py-2.5"
    >
      <View className="flex-1 mr-3">
        <Text
          style={{ color: emphasis ? tokens.color.text.primary : tokens.color.text.secondary }}
          className={emphasis ? 'text-sm font-black tracking-tight' : 'text-sm font-semibold'}
        >
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-0.5">
            {hint}
          </Text>
        ) : null}
      </View>

      <AmountDisplay value={value} size={emphasis ? 'large' : 'medium'} tone={emphasis ? 'default' : 'muted'} />
    </View>
  );
}

/** A plain text row, for things that are not amounts — a method, a duration. */
export function ReviewDetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: string;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      className="flex-row items-center justify-between py-2.5"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold">
        {label}
      </Text>
      <View className="flex-row items-center">
        {icon ? (
          <Ionicons name={icon as never} size={15} color={tokens.color.text.primary} style={{ marginRight: 6 }} />
        ) : null}
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-bold tracking-tight"
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ── The review card ──────────────────────────────────────────────────────────

export interface PaymentReviewProps {
  title: string;
  /** What is being bought, in the member's words. */
  description: string;
  /** The full price before anything is taken off. */
  listPrice: Money;
  /** What a promotion removed. Omitted or zero renders no discount line. */
  discount?: Money | null;
  /** What will actually be charged. **From the backend**, never `list - discount`. */
  payable: Money;
  methodKind?: PaymentMethodKind | null;
  /** Extra rows — a duration, a listing name, a cause. */
  details?: { label: string; value: string; icon?: string }[];
}

export function PaymentReview({
  title,
  description,
  listPrice,
  discount,
  payable,
  methodKind,
  details,
}: PaymentReviewProps) {
  const { tokens } = useTheme();
  const hasDiscount = discount != null && !isZero(discount);

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-3xl border p-5"
    >
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight"
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium leading-relaxed mt-1 mb-4"
      >
        {description}
      </Text>

      <View style={{ borderTopColor: tokens.color.border.default }} className="border-t pt-2">
        {details?.map((detail) => (
          <ReviewDetailRow key={detail.label} {...detail} />
        ))}

        {methodKind ? (
          <ReviewDetailRow
            label="Paying with"
            value={describePaymentMethod(methodKind).label}
            icon={describePaymentMethod(methodKind).icon}
          />
        ) : null}

        <ReviewRow label="Price" value={listPrice} />

        {hasDiscount ? (
          <ReviewRow label="Discount" value={discount!} hint="Applied by your promotion code" />
        ) : null}
      </View>

      <View style={{ borderTopColor: tokens.color.border.default }} className="border-t mt-2 pt-2">
        <ReviewRow label="Total to pay" value={payable} emphasis />
      </View>
    </View>
  );
}

// ── Confirmation ─────────────────────────────────────────────────────────────

interface ConfirmButtonProps {
  label: string;
  /** The amount, restated on the button. People read buttons, not headings. */
  amount?: Money | null;
  onPress: () => void;
  isSubmitting: boolean;
  disabled?: boolean;
  /** Why it is disabled, announced and shown. */
  disabledReason?: string | null;
  destructive?: boolean;
}

/**
 * The button that spends money.
 *
 * Disabled while submitting, and its label says what is happening rather than
 * going blank — an unlabelled spinner on a payment button is where people tap
 * again.
 */
export function PaymentConfirmButton({
  label,
  amount,
  onPress,
  isSubmitting,
  disabled,
  disabledReason,
  destructive,
}: ConfirmButtonProps) {
  const { tokens } = useTheme();
  const isDisabled = Boolean(disabled) || isSubmitting;

  const background = destructive
    ? tokens.color.error.default
    : isDisabled
      ? tokens.color.neutral[200]
      : tokens.color.primary[500];

  const spoken = isSubmitting
    ? 'Sending your payment. Please wait.'
    : disabledReason
      ? `${label}. Unavailable: ${disabledReason}`
      : amount
        ? `${label}, ${describeMoney(amount)}`
        : label;

  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityState={{ disabled: isDisabled, busy: isSubmitting }}
        style={{ backgroundColor: background }}
        className="h-14 rounded-full flex-row items-center justify-center px-6"
      >
        {isSubmitting ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text className="text-white text-sm font-black tracking-tight ml-2.5">
              Sending…
            </Text>
          </>
        ) : (
          <Text
            style={{ color: isDisabled ? tokens.color.text.disabled : '#FFFFFF' }}
            className="text-sm font-black tracking-tight"
          >
            {/*
              `formatMoney` here, not `describeMoney`. The two are deliberately
              different: the visible label is "£45.00" and the spoken one is
              "45.00 British pounds". Rendering the spoken form on the button
              would put a sentence where a price belongs.
            */}
            {label}
            {amount ? ` · ${formatMoney(amount)}` : ''}
          </Text>
        )}
      </TouchableOpacity>

      {disabledReason && !isSubmitting ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold text-center mt-2.5 leading-relaxed"
        >
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The sentence under the confirm button.
 *
 * It exists because §22 forbids implying an outcome the backend has not
 * confirmed, and the moment somebody is most likely to assume one is the
 * instant before they tap.
 */
export function PaymentDisclosure({ methodKind }: { methodKind?: PaymentMethodKind | null }) {
  const { tokens } = useTheme();

  const line =
    methodKind === 'Wallet'
      ? 'This comes out of your Diaspora wallet balance.'
      : methodKind === 'Credit'
        ? 'This uses Diaspora credit that was granted to you.'
        : methodKind === 'BankTransfer'
          ? 'Bank transfers can take a few days to clear. We will confirm when the money arrives.'
          : 'We will confirm the result with the payment provider before anything is marked as paid.';

  return (
    <Text
      style={{ color: tokens.color.text.placeholder }}
      className="text-[11px] font-medium text-center leading-relaxed"
    >
      {line}
    </Text>
  );
}
