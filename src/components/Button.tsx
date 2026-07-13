import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const button = tv({
  base: 'items-center justify-center rounded-full flex-row',
  variants: {
    variant: {
      primary: 'bg-primary-500 active:bg-primary-600',
      outline: 'bg-transparent border-[1.5px] border-neutral-300 active:bg-neutral-100',
      ghost: 'bg-transparent active:opacity-70',
    },
    size: {
      default: 'h-12 px-6',
      sm: 'h-10 px-4',
      lg: 'h-14 px-8',
    },
    disabled: {
      true: 'opacity-60',
    },
  },
  compoundVariants: [
    { variant: 'primary', disabled: true, className: 'bg-neutral-200' },
    { variant: 'outline', disabled: true, className: 'border-neutral-200' },
  ],
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

const text = tv({
  base: 'font-semibold',
  variants: {
    variant: {
      primary: 'text-white',
      outline: 'text-neutral-900',
      ghost: 'text-primary-500',
    },
    size: {
      default: 'text-base',
      sm: 'text-sm',
      lg: 'text-lg',
    },
    disabled: {
      true: 'text-neutral-400',
    },
  },
  compoundVariants: [
    { variant: 'primary', disabled: true, className: 'text-neutral-400' },
    { variant: 'outline', disabled: true, className: 'text-neutral-300' },
    { variant: 'ghost', disabled: true, className: 'text-neutral-300' },
  ],
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

type ButtonVariants = VariantProps<typeof button>;

interface ButtonProps extends React.ComponentProps<typeof TouchableOpacity>, ButtonVariants {
  label: string;
  isLoading?: boolean;
}

export function Button({ label, variant, size, disabled, isLoading, className, ...props }: ButtonProps) {
  const isDisabled = disabled || isLoading;
  return (
    <TouchableOpacity
      className={button({ variant, size, disabled: isDisabled, className })}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#F59300'} />
      ) : (
        <Text className={text({ variant, size, disabled: isDisabled })}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
