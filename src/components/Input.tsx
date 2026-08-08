import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { tv } from 'tailwind-variants';

const inputStyles = tv({
  base: 'h-14 rounded-xl px-4 bg-neutral-50 border border-transparent text-base',
  variants: {
    isFocused: {
      true: 'border-primary-500 bg-white',
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

  return (
    <View className="flex-col w-full mb-4">
      {label && <Text className="mb-2 text-sm font-medium text-neutral-500">{label}</Text>}
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
        placeholderTextColor="#9BA3B8"
        style={[
          { color: '#111827' },
          props.multiline ? { paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' } : null,
          props.style
        ]}
        {...props}
      />
      {!!error && <Text className="mt-1 text-sm text-error-default">{error}</Text>}
    </View>
  );
}
