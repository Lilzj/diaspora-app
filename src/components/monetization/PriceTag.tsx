// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Price rendering (Frontend Phase 6)
//
// The only component on the monetization surface that draws a price, and it
// draws a `PriceView` — the thing `usePricing().resolve()` produces — rather
// than a `Money`. That is the enforcement mechanism behind §7: a screen cannot
// render a price without having gone through the provider, because this
// component will not take a raw amount.
//
// Six states, six renderings, and none of them is a blank. "Price at checkout"
// and "Not available" are answers; "—" is not.
//
// Accessibility: the strike-through on a discounted original is presentational
// and invisible to a screen reader, so the whole tag carries one label built
// from `PriceView.spoken`, and the two `Text` nodes inside are hidden from the
// accessibility tree. Otherwise VoiceOver reads "twenty-five pounds, ten pounds"
// and leaves the listener to guess which one they are paying.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { PriceView } from '@/lib/pricing';

export type PriceTagSize = 'small' | 'medium' | 'large' | 'hero';

const SIZES: Record<PriceTagSize, { price: string; original: string; note: string }> = {
  small: { price: 'text-sm font-black', original: 'text-[11px] font-semibold', note: 'text-[10px] font-semibold' },
  medium: { price: 'text-lg font-black', original: 'text-xs font-semibold', note: 'text-[11px] font-semibold' },
  large: { price: 'text-2xl font-black', original: 'text-sm font-semibold', note: 'text-xs font-semibold' },
  hero: { price: 'text-4xl font-black', original: 'text-base font-semibold', note: 'text-sm font-semibold' },
};

export interface PriceTagProps {
  price: PriceView;
  size?: PriceTagSize;
  /** Right-aligns, for a price sitting at the end of a row. */
  align?: 'left' | 'right';
  /** Hides the note line where the surrounding card already says it. */
  hideNote?: boolean;
}

export function PriceTag({ price, size = 'medium', align = 'left', hideNote = false }: PriceTagProps) {
  const { tokens } = useTheme();
  const styles = SIZES[size];

  const tone =
    price.state === 'error' || price.state === 'unavailable'
      ? tokens.color.text.placeholder
      : price.state === 'free'
        ? tokens.color.success.default
        : tokens.color.text.primary;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={price.spoken}
      className={align === 'right' ? 'items-end' : 'items-start'}
    >
      <View className="flex-row items-baseline">
        {/* The original, struck through, before the effective price — the order
            somebody reads a discount in. */}
        {price.formattedOriginal ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              color: tokens.color.text.placeholder,
              textDecorationLine: 'line-through',
            }}
            className={`${styles.original} mr-1.5`}
          >
            {price.formattedOriginal}
          </Text>
        ) : null}

        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ color: tone }}
          className={`${styles.price} tracking-tight`}
        >
          {price.formatted}
        </Text>
      </View>

      {price.discountLabel ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ backgroundColor: tokens.color.success.surface }}
          className="flex-row items-center self-start rounded-full px-2 py-0.5 mt-1"
        >
          <Ionicons name="pricetag" size={10} color={tokens.color.success.default} />
          <Text
            style={{ color: tokens.color.success.default }}
            className="text-[10px] font-black uppercase tracking-wider ml-1"
          >
            {price.discountLabel}
          </Text>
        </View>
      ) : null}

      {price.note && !hideNote ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ color: tokens.color.text.placeholder }}
          className={`${styles.note} mt-1 leading-relaxed ${align === 'right' ? 'text-right' : ''}`}
        >
          {price.note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A price with a label beside it, for a review row.
 *
 * The label and the figure are one accessibility node — "Total, twelve pounds
 * fifty" — because read separately they arrive as two unrelated announcements
 * and the listener has to hold the first while the second loads.
 */
export function LabelledPrice({
  label,
  price,
  emphasise = false,
}: {
  label: string;
  price: PriceView;
  emphasise?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}. ${price.spoken}`}
      className="flex-row items-center justify-between py-2"
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ color: emphasise ? tokens.color.text.primary : tokens.color.text.secondary }}
        className={emphasise ? 'text-sm font-black' : 'text-xs font-semibold'}
      >
        {label}
      </Text>

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PriceTag price={price} size={emphasise ? 'medium' : 'small'} align="right" hideNote />
      </View>
    </View>
  );
}
