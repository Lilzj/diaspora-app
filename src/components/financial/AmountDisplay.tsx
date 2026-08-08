// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Amount and currency display (Frontend Phase 5)
//
// The only component in the app that renders money. Everything about how an
// amount looks — the symbol, the grouping, the sign, the accessible reading —
// is decided here, so a second card cannot disagree with the first.
//
// The symbol comes from the server, on the `Money` itself. `JobCard.tsx:75`
// hard-codes two currencies and prints the raw code for the rest; that table
// would have been copied into eight new components in this phase and the copies
// would have drifted. B15 serves `Money.symbol` from the currency catalogue for
// exactly this reason.
//
// **Colour is never the only signal.** A debit is a minus sign and an
// accessible label that says "minus"; a credit is a plus. Section 28 of the
// brief requires it and red-green colour blindness is why.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/design-system';
import { describeMoney, formatMoney, isNegative, isZero } from '@/lib/money';
import type { Money } from '@/types/financial';

export type AmountSize = 'hero' | 'large' | 'medium' | 'small';
export type AmountTone = 'default' | 'credit' | 'debit' | 'muted';

interface AmountDisplayProps {
  value: Money;
  size?: AmountSize;
  /**
   * `auto` reads the tone from the sign. Pass an explicit tone for a statement
   * row, where direction is a property of the entry rather than of the amount:
   * a `Debit` of £45 arrives as a positive number and must still read as money
   * leaving.
   */
  tone?: AmountTone | 'auto';
  /** Force a leading `+` on credits. Statements use it; a balance does not. */
  signed?: boolean;
  /** Show `GBP` rather than `£`. Used wherever two currencies can share a list. */
  showCode?: boolean;
  /** `1.25K` instead of `1,250.00`. Never used for a balance. */
  compact?: boolean;
  /** Prefixes the spoken label — "Available balance, £147.50". */
  accessibilityPrefix?: string;
  className?: string;
}

const SIZE_STYLE: Record<AmountSize, { fontSize: number; lineHeight: number; fontWeight: '600' | '700' | '800' }> = {
  hero: { fontSize: 40, lineHeight: 48, fontWeight: '800' },
  large: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  medium: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
};

export function AmountDisplay({
  value,
  size = 'medium',
  tone = 'auto',
  signed = false,
  showCode = false,
  compact = false,
  accessibilityPrefix,
  className,
}: AmountDisplayProps) {
  const { tokens } = useTheme();

  const resolvedTone: AmountTone =
    tone === 'auto' ? (isNegative(value) ? 'debit' : isZero(value) ? 'muted' : 'default') : tone;

  const colour =
    resolvedTone === 'credit'
      ? tokens.color.success.default
      : resolvedTone === 'debit'
        ? tokens.color.text.primary
        : resolvedTone === 'muted'
          ? tokens.color.text.placeholder
          : tokens.color.text.primary;

  const style = SIZE_STYLE[size];

  const spoken = describeMoney(value);
  const label = accessibilityPrefix ? `${accessibilityPrefix}, ${spoken}` : spoken;

  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel={label}
      // The visible text is already the whole content, so the label above is
      // what a screen reader reads instead of a symbol soup it may mispronounce.
      style={{
        color: colour,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: size === 'hero' ? -1 : -0.2,
        // Tabular figures stop a list of amounts from jittering as digits
        // change — the difference between a statement and a slot machine.
        fontVariant: ['tabular-nums'],
      }}
      className={className}
      // Amounts must survive large-text settings; two lines of a number is
      // unreadable, so it shrinks instead.
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {formatMoney(value, { signed, showCode, compact })}
    </Text>
  );
}

/**
 * An amount with a caption above it. The dashboard's balance blocks and every
 * review row use this so the label and the figure are always spoken together —
 * a bare number in a screen reader's output is a number with no meaning.
 */
export function LabelledAmount({
  label,
  value,
  size = 'medium',
  tone = 'auto',
  hint,
  showCode,
}: {
  label: string;
  value: Money;
  size?: AmountSize;
  tone?: AmountTone | 'auto';
  hint?: string;
  showCode?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${describeMoney(value)}${hint ? `. ${hint}` : ''}`}
    >
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-bold uppercase tracking-wider mb-1"
        // Not read separately: the wrapper above already speaks it with the
        // amount, and hearing the label twice is worse than not hearing it.
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
      <AmountDisplay
        value={value}
        size={size}
        tone={tone}
        showCode={showCode}
        accessibilityPrefix={undefined}
      />
      {hint ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium mt-1"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A currency code with its name — "GBP · Pound Sterling". Used where a member
 * chooses between wallets and the symbol alone is ambiguous.
 */
export function CurrencyDisplay({ code, name }: { code: string; name?: string }) {
  const { tokens } = useTheme();

  return (
    <Text
      style={{ color: tokens.color.text.secondary }}
      className="text-xs font-bold uppercase tracking-wider"
      accessibilityLabel={name ? `${code}, ${name}` : code}
    >
      {name ? `${code} · ${name}` : code}
    </Text>
  );
}
