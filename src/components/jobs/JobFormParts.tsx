import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

// The pieces the job forms share: the full wizard (`app/job/create.tsx`) and
// the simple form (`SimpleJobForm`), so the two read as one product.

export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3 ${className}`}>
      {children}
    </Text>
  );
}

export function Chips<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === option.value }}
          onPress={() => onSelect(option.value)}
          className={`px-3.5 py-2 rounded-full border ${
            selected === option.value ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
          }`}
        >
          <Text className={`text-xs font-bold ${selected === option.value ? 'text-white' : 'text-content-secondary'}`}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

