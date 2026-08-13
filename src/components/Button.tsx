import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tv, type VariantProps } from 'tailwind-variants';
import { useThemeTokens, type Tokens } from '@/design-system';

/**
 * The application's call-to-action primitive.
 *
 * Three separate implementations of this existed — this one, plus a
 * `PrimaryButton`/`SecondaryButton` pair in both `community/CommunityPrimitives`
 * and `maps/MapPrimitives`. A primary CTA was 16px sentence case on a form and
 * 12px uppercase on a card, and only two of the three told a screen reader they
 * were buttons at all.
 *
 * Both label languages were deliberate, so both survive as the `emphasis`
 * variant rather than being flattened into one. Everything else — height,
 * radius, disabled treatment, busy treatment, accessibility — is decided once,
 * here.
 */

const button = tv({
  base: 'items-center justify-center rounded-full flex-row',
  variants: {
    variant: {
      primary: 'bg-primary-500 active:bg-primary-600',
      outline: 'bg-transparent border-[1.5px] border-line active:bg-surface-muted',
      ghost: 'bg-transparent active:opacity-70',
      danger: 'bg-error-default active:opacity-90',
      neutral: 'bg-surface-muted active:bg-subtle',
    },
    size: {
      sm: 'h-10 px-4',
      default: 'h-12 px-6',
      lg: 'h-14 px-8',
    },
    fullWidth: {
      true: 'w-full',
    },
    disabled: {
      true: 'opacity-60',
    },
  },
  compoundVariants: [
    { variant: 'primary', disabled: true, className: 'bg-subtle' },
    { variant: 'danger', disabled: true, className: 'bg-subtle' },
    { variant: 'outline', disabled: true, className: 'border-subtle' },
  ],
  defaultVariants: {
    variant: 'primary',
    size: 'default',
    // Every existing call site relied on the button filling its container, so
    // that stays the default and inline callers opt out.
    fullWidth: true,
  },
});

const text = tv({
  base: '',
  variants: {
    variant: {
      primary: 'text-white',
      outline: 'text-content-primary',
      ghost: 'text-primary-500',
      danger: 'text-white',
      neutral: 'text-content-primary',
    },
    size: {
      sm: 'text-sm',
      default: 'text-base',
      lg: 'text-lg',
    },
    emphasis: {
      /** Sentence case, the weight of a form submit. */
      default: 'font-semibold',
      /** The dense uppercase micro-label used on cards and map overlays. */
      compact: 'text-xs font-black uppercase tracking-wider',
    },
    disabled: {
      true: 'text-content-faint',
    },
  },
  compoundVariants: [
    { variant: 'primary', disabled: true, className: 'text-content-faint' },
    { variant: 'danger', disabled: true, className: 'text-content-faint' },
    { variant: 'outline', disabled: true, className: 'text-content-faint' },
    { variant: 'ghost', disabled: true, className: 'text-content-faint' },
    { variant: 'neutral', disabled: true, className: 'text-content-faint' },
  ],
  defaultVariants: {
    variant: 'primary',
    size: 'default',
    emphasis: 'default',
  },
});

type ButtonVariants = VariantProps<typeof button>;

interface ButtonProps
  extends Omit<React.ComponentProps<typeof Pressable>, 'disabled' | 'children'>,
    ButtonVariants {
  label: string;
  isLoading?: boolean;
  /** Label shown while `isLoading`. Omit to show a spinner instead. */
  loadingLabel?: string;
  emphasis?: 'default' | 'compact';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconPosition?: 'leading' | 'trailing';
  accessibilityHint?: string;
}

/**
 * Tint for the spinner and icon, matched to the variant's own foreground.
 *
 * Takes the active tokens rather than reading the light set directly: the
 * label beside the icon is a class and follows the colour scheme, so a pinned
 * icon left the two halves of the same button in different palettes.
 *
 * `#FFFFFF` stays literal for the filled variants — it sits on brand amber or
 * error red, which do not change with the scheme.
 */
const foregroundFor = (tokens: Tokens, variant: ButtonProps['variant'], disabled: boolean) => {
  if (disabled) return tokens.color.neutral[400];
  switch (variant) {
    case 'outline':
    case 'neutral':
      return tokens.color.neutral[900];
    case 'ghost':
      return tokens.color.primary[500];
    default:
      return '#FFFFFF';
  }
};

export function Button({
  label,
  variant,
  size,
  fullWidth,
  disabled,
  isLoading,
  loadingLabel,
  emphasis,
  icon,
  iconPosition = 'leading',
  accessibilityHint,
  accessibilityLabel,
  className,
  style,
  ...props
}: ButtonProps) {
  const tokens = useThemeTokens();
  const isDisabled = disabled || isLoading;
  const foreground = foregroundFor(tokens, variant, Boolean(isDisabled));
  const iconNode = icon ? <Ionicons name={icon} size={16} color={foreground} /> : null;

  return (
    <Pressable
      className={button({ variant, size, fullWidth, disabled: isDisabled, className })}
      disabled={isDisabled}
      // Without these a screen reader announces a bare view, and gives no
      // signal that tapping during submission will do nothing.
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(isLoading) }}
      style={({ pressed }) => [
        pressed && !isDisabled && { opacity: 0.8 },
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
      {...props}
    >
      {isLoading && !loadingLabel ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
          {iconPosition === 'leading' ? iconNode : null}
          <Text
            className={text({ variant, size, emphasis, disabled: isDisabled })}
            style={{ includeFontPadding: false, textAlignVertical: 'center' }}
            numberOfLines={1}
          >
            {isLoading && loadingLabel ? loadingLabel : label}
          </Text>
          {iconPosition === 'trailing' ? iconNode : null}
        </View>
      )}
    </Pressable>
  );
}
