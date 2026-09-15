// ─────────────────────────────────────────────────────────────────────────────
// A count on an icon — 15 Sep 2026
//
// Reported from Aisha's phone: the bell showed a red badge with "…" in it and no
// number. The number was there — the bell's own label read "Notifications, 10
// unread" — but the badge was a pill with a minimum width and no set width,
// sized by its text, and on Android the text inside an absolutely placed pill
// was measured into the minimum and ellipsised. One digit fitted; "10" became
// "…". David's phone did the same.
//
// So the pill's width is decided here, from how many characters it holds, and
// the text is never ellipsised: a count that does not fit is a layout defect to
// fix, not something to hide. The digits do not scale with the system font —
// a badge is a fixed-size mark on a fixed-size icon, and the count is already in
// the icon's accessible label for anyone who needs it read or enlarged.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatBadgeCount } from '@/components/navigation/destinations';

export interface CountBadgeProps {
  count: number;
  backgroundColor: string;
  /** The ring that separates the badge from the icon under it. */
  borderColor: string;
  textColor?: string;
  /** Height in points; 18 on the bell, 16 on the tab bar. */
  size?: number;
  /** Where the badge sits — `position: absolute` and its offsets. */
  style?: StyleProp<ViewStyle>;
}

/** How wide a badge must be to hold its label without cutting it. */
export function countBadgeWidth(label: string, size: number): number {
  const characters = Math.max(1, label.length);
  // Round for one character; a little wider per extra character than a digit is.
  return characters === 1 ? size : size + (characters - 1) * Math.round(size * 0.38);
}

export function CountBadge({
  count,
  backgroundColor,
  borderColor,
  textColor = '#ffffff',
  size = 18,
  style,
}: CountBadgeProps) {
  if (!(count > 0)) return null;

  const label = formatBadgeCount(count);
  const fontSize = size <= 16 ? 9 : 10;

  return (
    <View
      // The badge must never eat the tap that opens what it counts.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: countBadgeWidth(label, size),
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderWidth: 1.5,
          borderColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: textColor,
          fontSize,
          fontWeight: '800',
          lineHeight: fontSize + 2,
          textAlign: 'center',
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
