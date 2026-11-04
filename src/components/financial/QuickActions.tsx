// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Wallet quick actions (Frontend Phase 5)
//
// The row of actions under the balance. Each one knows three things a plain
// button does not: whether the platform supports it at all, whether this member
// may use it, and whether the device is online.
//
// **An unsupported action is not hidden.** Withdrawals do not exist on this
// platform, and a wallet with no Withdraw button leaves people wondering where
// it went; a wallet with a Withdraw button that fails is worse. So the action is
// shown, visibly unavailable, and says why when tapped. §4-C and §23.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';

export interface QuickActionProps {
  icon: string;
  label: string;
  onPress: () => void;
  /** Whether the action can be taken right now. */
  disabled?: boolean;
  /** Announced and shown when disabled. Always says *why*, never just "unavailable". */
  disabledReason?: string;
  /** Marks a simulated capability in a development build. */
  isPreview?: boolean;
  /** A short fact under the label — "1,200 pts". Announced with it. */
  detail?: string;
}

export function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  disabledReason,
  isPreview,
  detail,
}: QuickActionProps) {
  const spoken = detail ? `${label}, ${detail}` : label;
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      /*
        An unavailable action stays activatable, and is *not* marked
        `accessibilityState.disabled`.

        The two are in tension and the resolution matters. A disabled control
        cannot be activated by assistive technology — so marking it disabled
        would mean a VoiceOver user could never reach the explanation, while a
        sighted user taps and gets one. Instead the label carries the whole
        story ("Withdraw. Withdrawals are not available on Diaspora yet."), the
        hint says what tapping does, and the reduced opacity signals it
        visually. Everybody gets the same information by the same route.
      */
      accessibilityLabel={disabled && disabledReason ? `${spoken}. ${disabledReason}` : spoken}
      accessibilityHint={disabled ? 'Explains why this is not available' : undefined}
      className="items-center"
      style={{ opacity: disabled ? 0.45 : 1, minWidth: 68 }}
    >
      <View
        style={{
          backgroundColor: isDark ? tokens.color.surface.elevated : tokens.color.neutral[100],
          borderColor: tokens.color.border.default,
        }}
        className="w-14 h-14 rounded-2xl border items-center justify-center mb-2"
      >
        <Ionicons name={icon as never} size={22} color={tokens.color.text.primary} />

        {isPreview ? (
          <View
            style={{ backgroundColor: tokens.color.warning.solid }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full items-center justify-center"
          >
            <Ionicons name="flask" size={9} color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-bold text-center"
        numberOfLines={2}
      >
        {label}
      </Text>

      {detail ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold text-center mt-0.5"
          numberOfLines={1}
        >
          {detail}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export function QuickActionRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="flex-row justify-between"
      accessibilityRole="menubar"
      style={{ gap: 8 }}
    >
      {children}
    </View>
  );
}
