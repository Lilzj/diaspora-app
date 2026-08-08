// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization layout primitives (Frontend Phase 6)
//
// Section headers, navigation rows and empty states, extracted because fifteen
// screens were each about to grow their own. Nothing here is monetization-
// specific in its styling — it is the existing Diaspora design language applied
// consistently, which is §24's requirement: monetization should feel premium
// without becoming a second design system.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';

export function MonetizationSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mb-7">
      <View className="flex-row items-end justify-between mb-2.5">
        <View className="flex-1 mr-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black tracking-tight"
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-medium leading-relaxed mt-1"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action ? (
          <TouchableOpacity
            onPress={action.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
              {action.label}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {children}
    </View>
  );
}

/**
 * A navigation row.
 *
 * `badge` carries a count; `marker` carries the "simulated" flag for a
 * destination with no backend behind it, so the dashboard says which of its
 * links lead somewhere real before somebody taps.
 */
export function MonetizationRow({
  icon,
  label,
  hint,
  badge,
  marker,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint?: string;
  badge?: string | number;
  marker?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[label, hint, badge != null ? `${badge}` : null, marker]
        .filter(Boolean)
        .join('. ')}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-9 h-9 rounded-xl items-center justify-center mr-3"
      >
        <Ionicons name={icon as never} size={18} color={tokens.color.text.secondary} />
      </View>

      <View className="flex-1 mr-2">
        <View className="flex-row items-center">
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold" numberOfLines={1}>
            {label}
          </Text>
          {marker ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-full px-1.5 py-0.5 ml-2"
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[9px] font-black uppercase tracking-widest"
              >
                {marker}
              </Text>
            </View>
          ) : null}
        </View>

        {hint ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium leading-relaxed mt-0.5"
            numberOfLines={2}
          >
            {hint}
          </Text>
        ) : null}
      </View>

      {badge != null ? (
        <View
          style={{ backgroundColor: tokens.color.primary[50] }}
          className="rounded-full px-2 py-0.5 mr-2"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-black">
            {badge}
          </Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </TouchableOpacity>
  );
}

/**
 * An empty state with a way out of it.
 *
 * Always carries an action: an empty list with no next step is a dead end, and
 * every monetization list has an obvious thing somebody came here to do.
 */
export function MonetizationEmpty({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${message}`}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-3xl border items-center px-6 py-10"
    >
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
      >
        <Ionicons name={icon as never} size={26} color={tokens.color.text.placeholder} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight text-center"
      >
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-medium leading-relaxed text-center mt-2"
      >
        {message}
      </Text>

      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-6 py-3 mt-5"
        >
          <Text style={{ color: '#FFFFFF' }} className="text-sm font-black tracking-tight">
            {action.label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
