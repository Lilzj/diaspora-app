// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics primitives (Frontend Phase 15, §38 · §73 · §74)
//
// The small pieces every dashboard is assembled from: a section, a card, a chip
// row, and the nine states §73 requires a dashboard to distinguish.
//
// ── §73, and why there are nine states rather than one ───────────────────────
//
// "No data" is the single most over-collapsed state in analytics UIs, and §73
// lists nine things it can actually mean. They prompt genuinely different
// reactions from the person reading them:
//
//   No activity          the platform measured, and the answer is zero
//   No data              nothing has been computed for this subject
//   Data unavailable     the backend tried and could not
//   Not authorized       you may not see this
//   Backend unavailable  the service is down
//   Backend gap          Diaspora does not measure this yet
//   Not enough data      too little history for this figure to mean anything
//   Loading              wait
//   Error                something broke
//
// Showing "No data" for all nine would tell a community moderator their
// community is dead when in fact the platform has never counted anything.
// `<AnalyticsEmptyState>` takes the reason as a required prop for that reason —
// a caller has to decide which of the nine it means.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT
// ═════════════════════════════════════════════════════════════════════════════

export function AnalyticsSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mb-6">
      <View className="flex-row items-start justify-between mb-2.5">
        <View className="flex-1 mr-3">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-[15px] font-black tracking-tight"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold mt-0.5 leading-relaxed"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function AnalyticsCard({
  children,
  padded = true,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { tokens } = useTheme();

  const style = {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.border.default,
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={style}
        className={`rounded-2xl border ${padded ? 'p-4' : ''}`}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'text' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={style}
      className={`rounded-2xl border ${padded ? 'p-4' : ''}`}
    >
      {children}
    </View>
  );
}

/**
 * A horizontally scrolling row of selectable chips.
 *
 * Used for period, comparison, granularity and content-type selection. The
 * `accessibilityState.selected` is what makes a screen reader announce which one
 * is active — without it, the row reads as five identical buttons.
 */
export function AnalyticsChipRow<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={{ paddingRight: 16 }}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive, disabled }}
            accessibilityLabel={option.hint ? `${option.label}. ${option.hint}` : option.label}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={{
              backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
              borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
              opacity: disabled ? tokens.opacity.disabled : 1,
            }}
            className="rounded-full border px-3 py-1.5 mr-2"
          >
            <Text
              style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
              className="text-[11px] font-black"
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STATES — §73
// ═════════════════════════════════════════════════════════════════════════════

/** The nine states §73 requires a dashboard to distinguish. */
export type AnalyticsEmptyReason =
  /** Measured, and the answer is zero. */
  | 'no-activity'
  /** Nothing has been computed for this subject. */
  | 'no-data'
  /** The backend tried and could not produce it. */
  | 'data-unavailable'
  /** The caller may not see it. */
  | 'not-authorized'
  /** The service is down. */
  | 'backend-unavailable'
  /** Diaspora does not measure this yet. */
  | 'backend-gap'
  /** Too little history for the figure to mean anything. */
  | 'not-enough-data'
  /** A filter or range excluded everything. */
  | 'filtered-out';

interface EmptyPresentation {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const EMPTY_PRESENTATION: Record<AnalyticsEmptyReason, EmptyPresentation> = {
  'no-activity': {
    icon: 'pulse-outline',
    title: 'Nothing happened in this period',
    body: 'Diaspora counted, and the answer was zero. Try a longer period.',
  },
  'no-data': {
    icon: 'document-outline',
    title: 'Nothing to report yet',
    body: 'No figures have been worked out for this yet. There may be nothing to count, or counting may not have started.',
  },
  'data-unavailable': {
    icon: 'remove-circle-outline',
    title: 'These figures could not be produced',
    body: 'Diaspora could not work these out. This is usually temporary.',
  },
  'not-authorized': {
    icon: 'lock-closed-outline',
    title: 'You do not have access to this',
    body: 'If you think you should, ask whoever manages this on Diaspora.',
  },
  'backend-unavailable': {
    icon: 'cloud-offline-outline',
    title: 'Diaspora could not be reached',
    body: 'The service that produces these figures is not answering. Try again shortly.',
  },
  'backend-gap': {
    icon: 'construct-outline',
    title: 'Not measured yet',
    body: 'Diaspora does not record what this report needs yet, so there is nothing real to show.',
  },
  'not-enough-data': {
    icon: 'trending-up-outline',
    title: 'Not enough history yet',
    body: 'There is too little here to say anything meaningful. Come back after a few more days.',
  },
  'filtered-out': {
    icon: 'funnel-outline',
    title: 'Nothing matches these filters',
    body: 'Try widening the period, or clearing a filter.',
  },
};

export function AnalyticsEmptyState({
  reason,
  title,
  body,
  actionLabel,
  onAction,
}: {
  reason: AnalyticsEmptyReason;
  /** Overrides where a screen has something more specific to say. */
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { tokens } = useTheme();
  const presentation = EMPTY_PRESENTATION[reason];

  const headline = title ?? presentation.title;
  const detail = body ?? presentation.body;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${headline}. ${detail}`}
      className="items-center px-6 py-10"
      testID={`analytics-empty-${reason}`}
    >
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-14 h-14 rounded-full items-center justify-center mb-3"
      >
        <Ionicons name={presentation.icon} size={22} color={tokens.color.text.placeholder} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-[13px] font-black tracking-tight text-center"
      >
        {headline}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-semibold text-center mt-1.5 leading-relaxed"
      >
        {detail}
      </Text>

      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-4 py-2.5 mt-4"
        >
          <Text className="text-white text-[11px] font-black uppercase tracking-wider">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A skeleton for a metric grid.
 *
 * Deliberately not animated. A shimmer is a moving element on a screen that may
 * hold twenty of them, and a member with reduce-motion enabled should not have
 * their dashboard pulsing at them while it loads. Static blocks at descending
 * opacity read as "loading" without moving.
 */
export function AnalyticsSkeleton({ rows = 3 }: { rows?: number }) {
  const { tokens } = useTheme();

  return (
    <View accessible accessibilityLabel="Loading figures" style={{ gap: 10 }}>
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            backgroundColor: tokens.color.neutral[100],
            opacity: 1 - index * 0.22,
          }}
          className="rounded-2xl h-20"
        />
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REFUSAL — §46, §48
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A refusal a member can act on.
 *
 * Says nothing about who *can* see the data. "This is restricted to platform
 * administrators" tells a member that a class of people can read data about
 * them, which the refusal did not need to disclose — see `describeRefusal` in
 * `lib/analytics/access.ts`.
 */
export function AnalyticsRefusal({
  detail,
  action,
  onAction,
}: {
  detail: string;
  action?: 'upgrade' | 'sign-in';
  onAction?: () => void;
}) {
  const { tokens } = useTheme();

  const actionLabel =
    action === 'upgrade' ? 'See plans' : action === 'sign-in' ? 'Sign in' : null;

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
      >
        <Ionicons name="lock-closed-outline" size={24} color={tokens.color.text.placeholder} />
      </View>

      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight text-center"
      >
        Not available to you
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-semibold text-center mt-2 leading-relaxed"
      >
        {detail}
      </Text>

      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-5 py-3 mt-6"
        >
          <Text className="text-white text-xs font-black uppercase tracking-wider">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The line shown where some metrics were withheld.
 *
 * Names how many rather than which. §46: a restricted metric is omitted, and
 * listing the names of the omitted ones would disclose what exists.
 */
export function WithheldMetricsNote({ count }: { count: number }) {
  const { tokens } = useTheme();
  if (count <= 0) return null;

  const sentence =
    count === 1
      ? 'One figure is not shown here, either because it is not available or because it is not part of what you can see.'
      : `${count} figures are not shown here, either because they are not available or because they are not part of what you can see.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={sentence}
      className="flex-row items-start mt-2"
    >
      <Ionicons name="information-circle-outline" size={12} color={tokens.color.text.disabled} />
      <Text
        style={{ color: tokens.color.text.disabled }}
        className="text-[10px] font-semibold ml-1.5 flex-1 leading-relaxed"
      >
        {sentence}
      </Text>
    </View>
  );
}
