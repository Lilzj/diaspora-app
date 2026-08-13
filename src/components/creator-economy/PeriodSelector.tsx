// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics period selector (Frontend Phase 7)
//
// §15's six periods: today, 7 days, 30 days, 90 days, this year, custom.
//
// The custom range is the interesting one. It is a *sheet*, not an inline pair
// of fields, because a half-filled custom range must not fire a query — and the
// way to guarantee that is for the range to be committed as a unit rather than
// updated field by field. `isRangeQueryable` in `lib/creator-economy.ts` is the
// same check the hook makes, so the button and the query cannot disagree.
//
// The row scrolls horizontally rather than wrapping. Six chips do not fit on a
// small phone at the largest text size, and a wrapped row changes the height of
// everything below it when the text scales — which is worse than a scroll.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { PERIOD_LABELS, isRangeQueryable } from '@/lib/creator-economy';
import { ANALYTICS_PERIODS, type AnalyticsPeriod, type AnalyticsRange } from '@/types/creator-economy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PeriodSelector({
  range,
  onChange,
}: {
  range: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
}) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const [isCustomOpen, setCustomOpen] = useState(false);

  const select = useCallback(
    (period: AnalyticsPeriod) => {
      if (period === 'custom') {
        setCustomOpen(true);
        return;
      }
      onChange({ period, from: null, to: null });
    },
    [onChange]
  );

  const customLabel = useMemo(() => {
    if (range.period !== 'custom' || !range.from || !range.to) return PERIOD_LABELS.custom;
    return `${range.from} → ${range.to}`;
  }, [range]);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 16 }}
        accessibilityRole="tablist"
      >
        {ANALYTICS_PERIODS.map((period) => {
          const isActive = range.period === period;
          const label = period === 'custom' ? customLabel : PERIOD_LABELS[period];

          return (
            <Pressable
              key={period}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={
                period === 'custom' && isActive
                  ? `Custom period, ${customLabel}. Change it.`
                  : `Show ${PERIOD_LABELS[period].toLowerCase()}`
              }
              onPress={() => select(period)}
              style={{
                backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
                borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="rounded-full border px-3.5 py-2 mr-2"
            >
              <Text
                style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                className="text-[11px] font-black"
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <CustomRangeSheet
        visible={isCustomOpen}
        initial={range}
        onClose={() => setCustomOpen(false)}
        onApply={(next) => {
          setCustomOpen(false);
          onChange(next);
        }}
      />
    </>
  );
}

/**
 * The custom range sheet.
 *
 * Dates are typed rather than picked from a calendar, deliberately: this app
 * has no date-picker dependency, and adding one for a development-adapter
 * analytics range would be a dependency added for a simulated feature. The
 * field validates the shape and the *server* validates the range — an inverted
 * range comes back as `creator.analytics.range_inverted`, which the screen
 * renders like any other refusal.
 */
function CustomRangeSheet({
  visible,
  initial,
  onClose,
  onApply,
}: {
  visible: boolean;
  initial: AnalyticsRange;
  onClose: () => void;
  onApply: (range: AnalyticsRange) => void;
}) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');

  const candidate: AnalyticsRange = { period: 'custom', from: from || null, to: to || null };
  const canApply = isRangeQueryable(candidate);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ backgroundColor: tokens.color.surface.overlay }}
        className="flex-1 justify-end"
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
      >
        <Pressable
          style={{ backgroundColor: tokens.color.surface.card, paddingBottom: insets.bottom + 16 }}
          className="rounded-t-3xl p-5"
          // Swallows the tap so it does not reach the backdrop and close the
          // sheet. Optional-called because a synthetic event under test does
          // not always carry it, and a sheet that crashes when tapped would be
          // a worse bug than one that closes.
          onPress={(event) => event?.stopPropagation?.()}
        >
          <View className="flex-row items-center justify-between mb-1">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-lg font-black tracking-tight"
              accessibilityRole="header"
            >
              Custom period
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={tokens.color.text.secondary} />
            </Pressable>
          </View>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-xs font-semibold mb-5 leading-relaxed"
          >
            Enter dates as YYYY-MM-DD. Diaspora checks the range and tells you if it cannot report on it.
          </Text>

          <DateField label="From" value={from} onChange={setFrom} />
          <View className="h-3" />
          <DateField label="To" value={to} onChange={setTo} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              canApply ? `Show ${from} to ${to}` : 'Enter both dates to apply a custom period'
            }
            accessibilityState={{ disabled: !canApply }}
            disabled={!canApply}
            onPress={() => onApply(candidate)}
            style={{
              backgroundColor: canApply ? tokens.color.primary[500] : tokens.color.neutral[200],
            }}
            className="rounded-full py-4 items-center mt-6"
          >
            <Text
              style={{ color: canApply ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-xs font-black uppercase tracking-wider"
            >
              Apply
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-black uppercase tracking-wider mb-1.5"
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={`${label} date, year dash month dash day`}
        value={value}
        onChangeText={onChange}
        placeholder="2026-01-31"
        placeholderTextColor={tokens.color.text.disabled}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        style={{
          backgroundColor: tokens.color.surface.background,
          borderColor: tokens.color.border.default,
          color: tokens.color.text.primary,
        }}
        className="rounded-2xl border px-4 py-3.5 text-sm font-semibold"
      />
    </View>
  );
}
