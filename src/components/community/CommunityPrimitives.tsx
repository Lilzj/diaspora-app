// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life primitives (Frontend Phase 12)
//
// The small pieces every Phase 12 screen is built from. Three of them carry
// most of the brief's accessibility weight:
//
//   `<CommunityStatusBadge>` renders a `StateDescriptor` from
//   `community-state.ts`. It always draws an **icon and a word**, never a
//   coloured dot — §46 forbids communicating state through colour alone, and a
//   member with a colour-vision difference reads the icon and the label.
//
//   `<ProgressBar>` exposes `accessibilityRole="progressbar"` with
//   `accessibilityValue`, so a screen reader announces "72 per cent of £4,000"
//   rather than reading a decorative view. The bar itself is
//   `accessibilityElementsHidden` because the number is the information.
//
//   `<Stat>` takes a `Sourced` value and cannot render one without its
//   provenance, which is how a real B15 total and a simulated trend stay
//   distinguishable on the same row.
//
// Everything here is token-driven, so light and dark both work without a second
// stylesheet, and nothing caps text scaling.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from '@/components/financial';
import type { StateDescriptor, StateTone } from '@/lib/community-state';
import type { Money } from '@/types/financial';
import type { Sourced } from '@/types/community-advanced';
import { SimulatedFigure, VerifiedFigure } from './CommunityGapNotice';

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

/** Maps a tone to a foreground and a surface. One place, so the two agree. */
export function useToneColours(tone: StateTone): { fg: string; bg: string } {
  const { tokens } = useTheme();

  switch (tone) {
    case 'positive':
      return { fg: tokens.color.success.default, bg: tokens.color.success.surface };
    case 'caution':
      return { fg: tokens.color.warning.default, bg: tokens.color.warning.surface };
    case 'negative':
      return { fg: tokens.color.error.default, bg: tokens.color.error.surface };
    case 'progress':
      return { fg: tokens.color.info.default, bg: tokens.color.info.surface };
    default:
      return { fg: tokens.color.text.secondary, bg: tokens.color.surface.elevated };
  }
}

/**
 * A lifecycle state, rendered.
 *
 * The icon is not decoration and is deliberately not `accessibilityElementsHidden`
 * as a group: the whole badge is one accessible element whose label is the
 * state's own words, so a screen reader says "Pending review" rather than
 * "image, Pending review".
 */
export function CommunityStatusBadge({
  state,
  size = 'medium',
}: {
  state: StateDescriptor;
  size?: 'small' | 'medium';
}) {
  const { fg, bg } = useToneColours(state.tone);
  const isSmall = size === 'small';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={state.label}
      style={{ backgroundColor: bg }}
      className={`flex-row items-center self-start rounded-full ${isSmall ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
    >
      <Ionicons name={state.icon as never} size={isSmall ? 11 : 13} color={fg} />
      <Text
        style={{ color: fg }}
        className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest ml-1`}
      >
        {state.label}
      </Text>
    </View>
  );
}

/** The badge plus its sentence, for a detail screen. */
export function CommunityStatusPanel({
  state,
  extra,
}: {
  state: StateDescriptor;
  extra?: string | null;
}) {
  const { tokens } = useTheme();
  const { fg, bg } = useToneColours(state.tone);

  return (
    <View
      style={{ backgroundColor: bg, borderColor: `${fg}33` }}
      className="rounded-2xl border p-4"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${state.label}. ${state.detail}${extra ? ` ${extra}` : ''}`}
    >
      <View className="flex-row items-center mb-1.5">
        <Ionicons name={state.icon as never} size={16} color={fg} />
        <Text style={{ color: fg }} className="text-[10px] font-black uppercase tracking-widest ml-1.5">
          {state.label}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        {state.detail}
      </Text>

      {extra ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-2"
        >
          {extra}
        </Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A progress bar that a screen reader can read.
 *
 * `accessibilityRole="progressbar"` with an `accessibilityValue` carrying
 * `min`, `max`, `now` and a spoken `text`. §46 asks for accessible progress, and
 * a bare `<View>` with a width percentage is invisible to VoiceOver and
 * TalkBack no matter how it looks.
 *
 * The percentage is **passed in**, never computed here from a raised and a
 * target. §24 and §17: the server does the arithmetic, and a component that
 * divided two `Money` values would be the client inventing a financial figure.
 */
export function ProgressBar({
  percentage,
  label,
  tone = 'positive',
  height = 8,
}: {
  percentage: number;
  /** What a screen reader says. Include the units — "£2,150 of £4,000 raised". */
  label: string;
  tone?: StateTone;
  height?: number;
}) {
  const { tokens } = useTheme();
  const { fg } = useToneColours(tone);
  const clamped = Math.max(0, Math.min(100, percentage));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: `${Math.round(clamped)}%` }}
      style={{
        backgroundColor: tokens.color.surface.elevated,
        height,
        borderRadius: height / 2,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          backgroundColor: fg,
          width: `${clamped}%`,
          height: '100%',
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Figures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A labelled statistic with its provenance attached.
 *
 * The `Sourced` parameter is not optional, which is the point: a screen cannot
 * print a community figure through this component without saying where it came
 * from. §17 and §34.
 */
export function Stat({
  label,
  value,
  money,
  icon,
  showVerified = false,
}: {
  label: string;
  value: Sourced<number>;
  /** Where the statistic is monetary, this renders instead of the count. */
  money?: Sourced<Money> | null;
  icon?: string | null;
  showVerified?: boolean;
}) {
  const { tokens } = useTheme();
  const source = money?.source ?? value.source;

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="flex-1 rounded-2xl border p-3.5"
    >
      {icon ? (
        <Ionicons
          name={icon as never}
          size={16}
          color={tokens.color.text.placeholder}
          style={{ marginBottom: 6 }}
        />
      ) : null}

      {money ? (
        <AmountDisplay value={money.value} size="small" accessibilityPrefix={label} />
      ) : (
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-lg font-black tracking-tight"
          accessibilityLabel={`${label}: ${value.value}`}
        >
          {value.value.toLocaleString()}
        </Text>
      )}

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-bold mt-0.5"
      >
        {label}
      </Text>

      {source === 'simulated' ? (
        <View className="mt-1.5">
          <SimulatedFigure />
        </View>
      ) : showVerified ? (
        <View className="mt-1.5">
          <VerifiedFigure />
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

export function Section({
  title,
  subtitle,
  action,
  onAction,
  children,
  style,
}: {
  title: string;
  subtitle?: string | null;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mt-6" style={style}>
      <View className="flex-row items-end justify-between px-5 mb-3">
        <View className="flex-1 pr-3">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black tracking-tight"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold mt-0.5"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${action}, ${title}`}
            onPress={onAction}
            hitSlop={8}
          >
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();

  const inner = (
    <View
      style={[
        {
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        },
        style,
      ]}
      className="rounded-2xl border p-4"
    >
      {children}
    </View>
  );

  if (!onPress) return inner;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {inner}
    </Pressable>
  );
}

/**
 * The primary action button.
 *
 * `accessibilityState.disabled` and `.busy` are set rather than only greying
 * the button, so a screen reader says "dimmed" or "busy" instead of announcing
 * a button that does nothing when tapped. The 48-point minimum height is the
 * touch-target floor.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  tone = 'primary',
  icon,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'primary' | 'danger' | 'neutral';
  icon?: string;
  accessibilityHint?: string;
}) {
  const { tokens } = useTheme();

  const background =
    tone === 'danger'
      ? tokens.color.error.default
      : tone === 'neutral'
        ? tokens.color.surface.elevated
        : tokens.color.primary[500];

  const foreground = tone === 'neutral' ? tokens.color.text.primary : '#FFFFFF';
  const isInert = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy }}
      disabled={isInert}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: background,
        opacity: isInert ? tokens.opacity.disabled : pressed ? 0.85 : 1,
        minHeight: 48,
      })}
      className="rounded-full items-center justify-center flex-row px-5"
    >
      {icon ? (
        <Ionicons name={icon as never} size={16} color={foreground} style={{ marginRight: 6 }} />
      ) : null}
      <Text
        style={{ color: foreground }}
        className="text-xs font-black uppercase tracking-wider text-center"
      >
        {busy ? 'Working…' : label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: string;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderColor: tokens.color.border.default,
        opacity: disabled ? tokens.opacity.disabled : pressed ? 0.7 : 1,
        minHeight: 48,
      })}
      className="rounded-full border items-center justify-center flex-row px-5"
    >
      {icon ? (
        <Ionicons
          name={icon as never}
          size={16}
          color={tokens.color.text.primary}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black uppercase tracking-wider"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A refusal a member can read.
 *
 * Used wherever the server said no in a way that is not an error — an
 * opportunity that is full, a poll already voted in, a campaign that is closed.
 * §51 requires all of those to be rendered, and none of them is a failure.
 */
export function InlineRefusal({ reason, icon = 'information-circle-outline' }: { reason: string; icon?: string }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={reason}
      style={{ backgroundColor: tokens.color.surface.elevated }}
      className="flex-row items-start rounded-xl p-3"
    >
      <Ionicons
        name={icon as never}
        size={15}
        color={tokens.color.text.placeholder}
        style={{ marginTop: 1 }}
      />
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed ml-2 flex-1"
      >
        {reason}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon = 'people-outline',
  title,
  body,
  action,
  onAction,
}: {
  icon?: string;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View className="items-center px-8 py-12">
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-14 h-14 rounded-full items-center justify-center mb-3"
      >
        <Ionicons name={icon as never} size={24} color={tokens.color.text.placeholder} />
      </View>

      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black tracking-tight text-center"
      >
        {title}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-semibold text-center mt-1.5 leading-relaxed"
      >
        {body}
      </Text>

      {action && onAction ? (
        <View className="mt-5 w-full max-w-xs">
          <PrimaryButton label={action} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** A labelled row for a detail list. */
export function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: string;
}) {
  const { tokens } = useTheme();

  return (
    <View
      className="flex-row items-start py-2.5"
      accessible
      accessibilityLabel={typeof value === 'string' ? `${label}: ${value}` : label}
    >
      {icon ? (
        <Ionicons
          name={icon as never}
          size={15}
          color={tokens.color.text.placeholder}
          style={{ marginTop: 2, marginRight: 10 }}
        />
      ) : null}

      <Text style={{ color: tokens.color.text.placeholder }} className="text-xs font-bold w-28">
        {label}
      </Text>

      <View className="flex-1">
        {typeof value === 'string' ? (
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-semibold leading-relaxed"
          >
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/** A horizontal filter chip row. Each chip is a button with a selected state. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useTheme();

  return (
    <View
      className="flex-row flex-wrap"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, checked: isSelected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
              minHeight: 36,
            }}
            className="rounded-full border px-3.5 py-2 mr-2 mb-2 justify-center"
          >
            <Text
              style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.secondary }}
              className="text-[11px] font-bold"
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
