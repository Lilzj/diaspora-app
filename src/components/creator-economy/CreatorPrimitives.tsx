// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy primitives (Frontend Phase 7)
//
// The small pieces every creator surface is built from: a status chip, a stat
// tile, a progress bar, a requirement list, a section frame, a quick action.
//
// Two rules run through all of them, and both come from §38:
//
//   **Nothing is communicated by colour alone.** Every status chip carries an
//   icon and a word as well as a tone. Every progress bar has a text figure
//   beside it. A creator using a monochrome display, or one of the ~8% of men
//   with a colour vision deficiency, loses nothing.
//
//   **The accessible label is a sentence, not a fragment.** A screen reader
//   landing on a stat tile hears "Views: 3,180, up 12 percent on the previous
//   30 days", not "3180". That means the wrapper owns `accessible` and the
//   children are hidden from the reader — which is why icons here never carry
//   their own labels.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from '@/components/financial';
import {
  clampPercentage,
  describeMetricChange,
  describeProgress,
  formatCount,
  type StatusPresentation,
  type StatusTone,
} from '@/lib/creator-economy';
import type { CreatorMetric, CreatorProgress, CreatorRequirement } from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// Tone resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tone, resolved to a foreground and a background.
 *
 * One place, so a "warning" looks the same on a milestone, an earning and a
 * grant. `brand` is the primary palette rather than a semantic colour — it is
 * for the states that are neither good nor bad but *notable*, like Top creator.
 */
export function useToneColours(tone: StatusTone): { fg: string; bg: string } {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  switch (tone) {
    case 'success':
      return { fg: tokens.color.success.default, bg: tokens.color.success.surface };
    case 'warning':
      return { fg: tokens.color.warning.default, bg: tokens.color.warning.surface };
    case 'error':
      return { fg: tokens.color.error.default, bg: tokens.color.error.surface };
    case 'info':
      return { fg: tokens.color.info.default, bg: tokens.color.info.surface };
    case 'brand':
      return { fg: tokens.color.primary[isDark ? 400 : 600], bg: tokens.color.primary[isDark ? 900 : 50] };
    default:
      return {
        fg: tokens.color.text.secondary,
        bg: isDark ? tokens.color.surface.elevated : tokens.color.neutral[100],
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status chip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A status chip.
 *
 * Takes a `StatusPresentation` rather than a raw status string, so the mapping
 * from state to words lives in `lib/creator-economy.ts` where it is testable,
 * and this component never grows a switch statement of its own.
 */
export function CreatorStatusChip({
  presentation,
  size = 'medium',
}: {
  presentation: StatusPresentation;
  size?: 'small' | 'medium';
}) {
  const colours = useToneColours(presentation.tone);
  const isSmall = size === 'small';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={presentation.description}
      style={{ backgroundColor: colours.bg }}
      className={`flex-row items-center self-start rounded-full ${isSmall ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
    >
      <Ionicons name={presentation.icon as never} size={isSmall ? 10 : 12} color={colours.fg} />
      <Text
        style={{ color: colours.fg }}
        className={`font-black uppercase tracking-wider ml-1 ${isSmall ? 'text-[9px]' : 'text-[10px]'}`}
      >
        {presentation.label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat tile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One headline metric.
 *
 * `metric.format` decides the rendering: a currency metric goes through
 * `AmountDisplay` so it obeys the same `Money` discipline as every other amount
 * in the app, and a count goes through `formatCount`. A percentage renders with
 * its sign so 6.8% and −6.8% are distinguishable without the colour.
 */
export function StatTile({
  metric,
  onPress,
  width,
}: {
  metric: CreatorMetric;
  onPress?: () => void;
  width?: ViewStyle['width'];
}) {
  const { tokens } = useTheme();
  const change = describeMetricChange(metric);
  const changeColours = useToneColours(change?.tone ?? 'neutral');

  const valueText =
    metric.format === 'percentage'
      ? `${metric.value.toFixed(1)}%`
      : metric.format === 'duration'
        ? `${Math.round(metric.value)}m`
        : formatCount(metric.value);

  const accessibilityLabel = [
    `${metric.label}:`,
    metric.format === 'currency' && metric.amount
      ? `${metric.amount.currency} ${metric.amount.amount.toFixed(2)}`
      : valueText,
    change ? `${change.text === 'No change' ? 'no change' : change.text} against the previous period` : null,
    metric.definition,
  ]
    .filter(Boolean)
    .join(' ');

  const Container = onPress ? Pressable : View;

  return (
    <Container
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
        width,
      }}
      className="rounded-2xl border p-3.5"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
        numberOfLines={1}
      >
        {metric.label}
      </Text>

      <View className="mt-1.5">
        {metric.format === 'currency' && metric.amount ? (
          <AmountDisplay value={metric.amount} size="medium" />
        ) : (
          <Text
            style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
            className="text-xl font-black tracking-tight"
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {valueText}
          </Text>
        )}
      </View>

      {change ? (
        <View className="flex-row items-center mt-1">
          {change.text !== 'No change' ? (
            <Ionicons
              name={change.text.startsWith('+') ? 'arrow-up' : 'arrow-down'}
              size={10}
              color={changeColours.fg}
            />
          ) : null}
          <Text
            style={{ color: changeColours.fg }}
            className="text-[10px] font-black ml-0.5"
          >
            {change.text}
          </Text>
        </View>
      ) : null}
    </Container>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A progress bar.
 *
 * `percentage` is the served figure, clamped for layout only. The text beside
 * the bar is the same information in words, so the bar is decoration and the
 * meaning survives without it. `accessibilityValue` gives a screen reader the
 * number as well as the sentence, which is what a `progressbar` role expects.
 */
export function CreatorProgressBar({
  progress,
  subject,
  tone = 'brand',
  showFigures = true,
  height = 6,
}: {
  progress: CreatorProgress;
  subject: string;
  tone?: StatusTone;
  showFigures?: boolean;
  height?: number;
}) {
  const { tokens } = useTheme();
  const colours = useToneColours(tone);
  const percentage = clampPercentage(progress.percentage);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={describeProgress(progress, subject)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percentage) }}
    >
      {showFigures ? (
        <View className="flex-row justify-between items-baseline mb-1.5">
          <Text
            style={{ color: tokens.color.text.secondary, fontVariant: ['tabular-nums'] }}
            className="text-[11px] font-bold"
          >
            {progress.current.toLocaleString()} of {progress.target.toLocaleString()}
            {progress.unit ? ` ${progress.unit}` : ''}
          </Text>
          <Text
            style={{ color: colours.fg, fontVariant: ['tabular-nums'] }}
            className="text-[11px] font-black"
          >
            {Math.round(percentage)}%
          </Text>
        </View>
      ) : null}

      <View
        style={{ backgroundColor: tokens.color.neutral[200], height }}
        className="rounded-full overflow-hidden"
      >
        <View
          style={{ backgroundColor: colours.fg, width: `${percentage}%`, height }}
          className="rounded-full"
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A list of requirements, with the server's `isMet` and nothing derived.
 *
 * Note what this component does *not* do: it does not compare `current` to
 * `target` to decide whether a requirement is met. One of the fixtures is
 * deliberately met at 5 of 6, because a real eligibility rule has exceptions —
 * and a component that decided for itself would show that requirement as unmet
 * while the server let the member through.
 */
export function RequirementList({
  requirements,
  onAction,
}: {
  requirements: CreatorRequirement[];
  onAction?: (requirement: CreatorRequirement) => void;
}) {
  const { tokens } = useTheme();

  if (requirements.length === 0) return null;

  return (
    <View>
      {requirements.map((requirement) => {
        const tone: StatusTone = requirement.isMet ? 'success' : 'neutral';
        return (
          <RequirementRow
            key={requirement.key}
            requirement={requirement}
            tone={tone}
            onAction={onAction}
            borderColor={tokens.color.border.default}
          />
        );
      })}
    </View>
  );
}

function RequirementRow({
  requirement,
  tone,
  onAction,
  borderColor,
}: {
  requirement: CreatorRequirement;
  tone: StatusTone;
  onAction?: (requirement: CreatorRequirement) => void;
  borderColor: string;
}) {
  const { tokens } = useTheme();
  const colours = useToneColours(tone);
  const hasAction = Boolean(!requirement.isMet && requirement.actionRoute && onAction);

  const countable =
    typeof requirement.current === 'number' && typeof requirement.target === 'number'
      ? ` ${requirement.current} of ${requirement.target}.`
      : '';

  return (
    <View
      accessible
      accessibilityLabel={`${requirement.label}. ${requirement.isMet ? 'Done.' : 'Still to do.'}${countable}${
        requirement.description ? ` ${requirement.description}` : ''
      }`}
      style={{ borderBottomColor: borderColor }}
      className="flex-row items-start border-b py-3"
    >
      <View
        style={{ backgroundColor: colours.bg }}
        className="w-6 h-6 rounded-full items-center justify-center mr-3 mt-0.5"
      >
        <Ionicons
          name={requirement.isMet ? 'checkmark' : 'ellipse-outline'}
          size={13}
          color={colours.fg}
        />
      </View>

      <View className="flex-1">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-bold leading-snug"
        >
          {requirement.label}
        </Text>

        {requirement.description ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium mt-0.5 leading-relaxed"
          >
            {requirement.description}
          </Text>
        ) : null}

        {typeof requirement.current === 'number' && typeof requirement.target === 'number' ? (
          <Text
            style={{ color: tokens.color.text.secondary, fontVariant: ['tabular-nums'] }}
            className="text-[11px] font-bold mt-1"
          >
            {requirement.current.toLocaleString()} of {requirement.target.toLocaleString()}
          </Text>
        ) : null}

        {hasAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${requirement.actionLabel ?? 'Open'}: ${requirement.label}`}
            onPress={() => onAction?.(requirement)}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="self-start rounded-full px-3 py-1.5 mt-2"
          >
            <Text className="text-white text-[10px] font-black uppercase tracking-wider">
              {requirement.actionLabel ?? 'Open'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A dashboard section.
 *
 * The `count` is what lets the dashboard collapse a section it has nothing to
 * put in — §39's "do not load every creator dataset on initial render" is only
 * achievable if the summary can say "no open grants" without the grants having
 * been fetched.
 */
export function CreatorSection({
  title,
  subtitle,
  count,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black tracking-tight"
              accessibilityRole="header"
            >
              {title}
            </Text>
            {typeof count === 'number' && count > 0 ? (
              <View
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="ml-2 min-w-5 h-5 rounded-full items-center justify-center px-1.5"
                accessible
                accessibilityLabel={`${count} ${count === 1 ? 'item' : 'items'}`}
              >
                <Text className="text-white text-[10px] font-black">{count}</Text>
              </View>
            ) : null}
          </View>

          {subtitle ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold mt-0.5 leading-relaxed"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel}: ${title}`}
            onPress={onAction}
            hitSlop={8}
          >
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

/** A card frame. One radius, one border, one shadow, everywhere. */
export function CreatorCard({
  children,
  onPress,
  accessibilityLabel,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  const Container = onPress ? Pressable : View;

  return (
    <Container
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        {
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        },
        style,
      ]}
      className={`rounded-2xl border ${padded ? 'p-4' : ''}`}
    >
      {children}
    </Container>
  );
}

/** A quick action on the dashboard. Icon, label, tap. */
export function QuickAction({
  icon,
  label,
  onPress,
  tone = 'neutral',
  badge,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  tone?: StatusTone;
  badge?: number;
}) {
  const { tokens } = useTheme();
  const colours = useToneColours(tone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}. ${badge} waiting.` : label}
      onPress={onPress}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3 items-center flex-1 min-w-[88px]"
    >
      <View
        style={{ backgroundColor: colours.bg }}
        className="w-10 h-10 rounded-full items-center justify-center mb-2"
      >
        <Ionicons name={icon as never} size={18} color={colours.fg} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-[10px] font-black text-center leading-tight"
        numberOfLines={2}
      >
        {label}
      </Text>

      {badge && badge > 0 ? (
        <View
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="absolute top-2 right-2 min-w-4 h-4 rounded-full items-center justify-center px-1"
        >
          <Text className="text-white text-[9px] font-black">{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The empty state. Never a blank screen and never a bare "no results". */
export function CreatorEmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View className="items-center px-8 py-12" accessible accessibilityLabel={`${title}. ${body}`}>
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-14 h-14 rounded-full items-center justify-center mb-3"
      >
        <Ionicons name={icon as never} size={24} color={tokens.color.text.placeholder} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black text-center tracking-tight"
      >
        {title}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-medium text-center mt-1.5 leading-relaxed"
      >
        {body}
      </Text>

      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-5 py-3 mt-5"
        >
          <Text className="text-white text-xs font-black uppercase tracking-wider">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A loading placeholder that matches the card it stands in for. */
export function CreatorCardSkeleton({ rows = 3 }: { rows?: number }) {
  const { tokens } = useTheme();

  return (
    <View accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          <View
            style={{ backgroundColor: tokens.color.neutral[200] }}
            className="h-3 rounded-full w-1/3 mb-2.5"
          />
          <View
            style={{ backgroundColor: tokens.color.neutral[200] }}
            className="h-2.5 rounded-full w-4/5 mb-2"
          />
          <View
            style={{ backgroundColor: tokens.color.neutral[200] }}
            className="h-2.5 rounded-full w-2/3"
          />
        </View>
      ))}
    </View>
  );
}
