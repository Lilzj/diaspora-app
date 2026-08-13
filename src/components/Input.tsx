import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { tv } from 'tailwind-variants';
import { useThemeTokens } from '@/design-system';

const inputStyles = tv({
  base: 'h-14 rounded-xl px-4 bg-surface-background border border-transparent text-base',
  variants: {
    isFocused: {
      true: 'border-primary-500 bg-surface-card',
    },
    hasError: {
      true: 'border-error-default',
    },
  },
});

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const errorId = React.useId();
  // These two are inline styles rather than classes, so the colour-scheme
  // media query never reaches them. Read from the active tokens instead —
  // pinned to the light value, the field's own text turned invisible once the
  // background followed the scheme into dark.
  const tokens = useThemeTokens();

  return (
    <View className="flex-col w-full mb-4">
      {label && <Text className="mb-2 text-sm font-medium text-content-muted">{label}</Text>}
      <TextInput
        className={inputStyles({ isFocused, hasError: !!error, className })}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        // The label is rendered as a sibling Text, which a screen reader does
        // not associate with the field, so the field states its own name.
        accessibilityLabel={props.accessibilityLabel ?? label}
        // Announces the validation message when the field takes focus, instead
        // of leaving it as text the member has to go looking for.
        accessibilityHint={error ? `${error}. ${props.accessibilityHint ?? ''}`.trim() : props.accessibilityHint}
        // `neutral-500` rather than `neutral-400`: placeholder text at
        // #9BA3B8 scores 2.40:1 on the field's own background and fails
        // WCAG AA, which matters because placeholders often carry the format.
        placeholderTextColor={tokens.color.text.placeholder}
        style={[
          { color: tokens.color.text.primary },
          props.multiline ? { paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' } : null,
          props.style,
        ]}
        {...props}
      />
      {!!error && (
        <Text
          nativeID={errorId}
          className="mt-1 text-sm text-error-default"
          // Errors appear after a submit attempt; without a live region the
          // member is told nothing and the form simply refuses to advance.
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}
    </View>
  );
}
