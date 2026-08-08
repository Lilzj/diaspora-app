// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment inputs (Frontend Phase 5)
//
// The amount field and the method picker. Two small components carrying most of
// the ways a payment form gets money wrong.
//
// **The amount field never holds a number.** It holds the string the member
// typed and converts to `Money` at the boundary, because a controlled numeric
// input reformats "10." into "10" while somebody is still typing the pence.
// The conversion is `parseAmountInput`, which rounds at the currency's own
// exponent — so the field is correct in JPY and KWD without anybody testing it.
//
// **The method picker offers what the deployment supports**, from
// `GET /capabilities`, never a hard-coded list. A deployment with no gateway
// registered offers nothing and says so, which is §4-D's "not configured" state
// rather than a sheet that fails on submit.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { describePaymentMethod } from '@/lib/financial-status';
import { amountPlaceholder, formatMoney, parseAmountInput, resolveCurrency } from '@/lib/money';
import type { CurrencyFact, Money, PaymentMethodKind, Wallet } from '@/types/financial';

// ── Amount field ─────────────────────────────────────────────────────────────

interface AmountInputProps {
  value: string;
  onChangeText: (next: string) => void;
  currency: string;
  currencies: CurrencyFact[] | undefined;
  label?: string;
  /** A validation message. Shown under the field and announced. */
  error?: string | null;
  /** Amounts offered as one-tap chips. In major units. */
  suggestions?: number[];
  autoFocus?: boolean;
  editable?: boolean;
}

/** Parses what is in the field, or null if it is empty or not a number. */
export function useParsedAmount(
  value: string,
  currency: string,
  currencies: CurrencyFact[] | undefined
): Money | null {
  return useMemo(() => {
    const { exponent, symbol } = resolveCurrency(currency, currencies);
    return parseAmountInput(value, currency, exponent, symbol);
  }, [value, currency, currencies]);
}

export function AmountInput({
  value,
  onChangeText,
  currency,
  currencies,
  label = 'Amount',
  error,
  suggestions,
  autoFocus,
  editable = true,
}: AmountInputProps) {
  const { tokens } = useTheme();
  const { exponent, symbol } = resolveCurrency(currency, currencies);

  /**
   * Filters keystrokes rather than validating on submit.
   *
   * Letters and a second decimal point are simply not accepted, and digits past
   * the currency's exponent are dropped — so a member cannot type £10.005 and
   * be told afterwards that it became £10.01.
   */
  const handleChange = (next: string) => {
    const cleaned = next.replace(/[^0-9.]/g, '');

    const parts = cleaned.split('.');
    if (parts.length > 2) return;

    if (exponent === 0 && parts.length > 1) return;
    if (parts[1] && parts[1].length > exponent) return;

    onChangeText(cleaned);
  };

  return (
    <View>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-black uppercase tracking-widest mb-2"
      >
        {label}
      </Text>

      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: error ? tokens.color.border.error : tokens.color.border.default,
        }}
        className="flex-row items-center rounded-2xl border px-4"
      >
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-2xl font-bold mr-1"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {symbol ?? currency}
        </Text>

        <TextInput
          value={value}
          onChangeText={handleChange}
          placeholder={amountPlaceholder(exponent)}
          placeholderTextColor={tokens.color.text.placeholder}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus={autoFocus}
          editable={editable}
          accessibilityLabel={`${label} in ${currency}`}
          accessibilityHint={error ?? undefined}
          style={{
            color: tokens.color.text.primary,
            fontSize: 28,
            fontWeight: '800',
            letterSpacing: -0.5,
            paddingVertical: 16,
            flex: 1,
            fontVariant: ['tabular-nums'],
          }}
        />

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-black uppercase tracking-widest"
        >
          {currency}
        </Text>
      </View>

      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: tokens.color.error.default }}
          className="text-xs font-semibold mt-2"
        >
          {error}
        </Text>
      ) : null}

      {suggestions && suggestions.length > 0 ? (
        <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
          {suggestions.map((amount) => (
            <TouchableOpacity
              key={amount}
              onPress={() => onChangeText(exponent === 0 ? String(amount) : amount.toFixed(exponent))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Set amount to ${symbol ?? currency}${amount}`}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-full border px-4 py-2"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-bold"
              >
                {symbol ?? ''}{amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── Method picker ────────────────────────────────────────────────────────────

interface MethodPickerProps {
  methods: PaymentMethodKind[] | undefined;
  selected: PaymentMethodKind | null;
  onSelect: (method: PaymentMethodKind) => void;
  /** When present, the Wallet method shows the balance and is disabled if short. */
  wallet?: Wallet | null;
  /** What the member is about to pay, for the wallet-sufficiency check. */
  payable?: Money | null;
  isLoading?: boolean;
}

export function MethodPicker({
  methods,
  selected,
  onSelect,
  wallet,
  payable,
  isLoading,
}: MethodPickerProps) {
  const { tokens } = useTheme();

  if (isLoading) {
    return (
      <View accessibilityLabel="Loading payment methods" accessibilityRole="progressbar">
        <Text style={{ color: tokens.color.text.placeholder }} className="text-xs font-semibold">
          Checking which payment methods are available…
        </Text>
      </View>
    );
  }

  // No gateway configured. §4-D: this is a deployment state, not a member error,
  // and it must never be hidden behind a spinner or a generic failure.
  if (!methods || methods.length === 0) {
    return (
      <View
        style={{ backgroundColor: tokens.color.warning.surface, borderColor: `${tokens.color.warning.default}44` }}
        className="rounded-2xl border p-4"
        accessible
        accessibilityLabel="No payment methods are set up on Diaspora at the moment. Payments are unavailable."
      >
        <Text style={{ color: tokens.color.warning.default }} className="text-xs font-black uppercase tracking-widest mb-1">
          Payments unavailable
        </Text>
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
          No payment provider is set up on Diaspora at the moment. Nothing you do here will be charged.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {methods.map((method) => {
        const { label, icon, hint } = describePaymentMethod(method);
        const isSelected = selected === method;

        // The wallet method is the only one whose availability the client can
        // determine before submitting, because it is the only one whose funds
        // the client can see. Everything else is the gateway's call.
        const isWallet = method === 'Wallet';
        const walletShort =
          isWallet &&
          wallet != null &&
          payable != null &&
          wallet.currency === payable.currency &&
          wallet.available.minorUnits < payable.minorUnits;

        const walletFrozen = isWallet && wallet != null && wallet.status !== 'Active';
        const disabled = Boolean(walletShort || walletFrozen);

        const detail = walletFrozen
          ? 'Your wallet is frozen'
          : walletShort && wallet
            ? `Not enough — you have ${formatMoney(wallet.available)}`
            : isWallet && wallet
              ? `${formatMoney(wallet.available)} available`
              : hint;

        return (
          <TouchableOpacity
            key={method}
            onPress={() => !disabled && onSelect(method)}
            activeOpacity={disabled ? 1 : 0.7}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled }}
            accessibilityLabel={`${label}${detail ? `. ${detail}` : ''}`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
              borderWidth: isSelected ? 2 : 1,
              opacity: disabled ? 0.5 : 1,
            }}
            className="flex-row items-center rounded-2xl px-4 py-3.5"
          >
            <Ionicons
              name={icon as never}
              size={20}
              color={isSelected ? tokens.color.primary[500] : tokens.color.text.secondary}
            />

            <View className="flex-1 ml-3">
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
                {label}
              </Text>
              {detail ? (
                <Text
                  style={{
                    color: walletShort || walletFrozen ? tokens.color.error.default : tokens.color.text.placeholder,
                  }}
                  className="text-[11px] font-semibold mt-0.5"
                >
                  {detail}
                </Text>
              ) : null}
            </View>

            <View
              style={{
                borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                backgroundColor: isSelected ? tokens.color.primary[500] : 'transparent',
              }}
              className="w-5 h-5 rounded-full border-2 items-center justify-center"
            >
              {isSelected ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Promotion code field ─────────────────────────────────────────────────────

interface PromotionFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  onApply: () => void;
  isApplying?: boolean;
  /** The quote's outcome. A refusal is shown with its reason, never swallowed. */
  result?: { isApplicable: boolean; message: string } | null;
}

export function PromotionField({
  value,
  onChangeText,
  onApply,
  isApplying,
  result,
}: PromotionFieldProps) {
  const { tokens } = useTheme();

  return (
    <View>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-black uppercase tracking-widest mb-2"
      >
        Promotion code
      </Text>

      <View className="flex-row" style={{ gap: 8 }}>
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="flex-1 rounded-2xl border px-4"
        >
          <TextInput
            value={value}
            onChangeText={(next) => onChangeText(next.toUpperCase())}
            placeholder="Enter a code"
            placeholderTextColor={tokens.color.text.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Promotion code"
            style={{
              color: tokens.color.text.primary,
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: 1,
              paddingVertical: 14,
            }}
          />
        </View>

        <TouchableOpacity
          onPress={onApply}
          disabled={value.trim().length === 0 || isApplying}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Apply promotion code"
          accessibilityState={{ disabled: value.trim().length === 0 || isApplying }}
          style={{
            backgroundColor: value.trim().length === 0 ? tokens.color.neutral[200] : tokens.color.primary[500],
          }}
          className="rounded-2xl px-5 items-center justify-center"
        >
          <Text className="text-white text-[11px] font-black uppercase tracking-wider">
            {isApplying ? 'Checking' : 'Apply'}
          </Text>
        </TouchableOpacity>
      </View>

      {result ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: result.isApplicable ? tokens.color.success.default : tokens.color.error.default,
          }}
          className="text-xs font-semibold mt-2"
        >
          {result.message}
        </Text>
      ) : null}
    </View>
  );
}
