import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';

interface SettingsItemProps {
  icon?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
  variant?: 'default' | 'danger';
}

export function SettingsItem({
  icon,
  title,
  subtitle,
  onPress,
  showChevron = true,
  rightElement,
  variant = 'default',
}: SettingsItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center py-4 px-4"
    >
      {icon && (
        <View className="w-10 h-10 rounded-xl bg-surface-muted items-center justify-center mr-3">
          <Text className="text-lg">{icon}</Text>
        </View>
      )}
      <View className="flex-1">
        <Text
          className={`font-medium ${
            variant === 'danger' ? 'text-error-default' : 'text-content-primary'
          }`}
        >
          {title}
        </Text>
        {subtitle && <Text className="text-sm text-content-muted mt-0.5">{subtitle}</Text>}
      </View>
      {rightElement ?? (showChevron && <Text className="text-neutral-300 text-xl">›</Text>)}
    </TouchableOpacity>
  );
}

interface SettingsGroupProps {
  title?: string;
  children: React.ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <View className="mb-6">
      {title && (
        <Text className="text-xs font-semibold text-content-faint uppercase tracking-wider px-4 mb-2">
          {title}
        </Text>
      )}
      <View className="bg-surface-card rounded-xl overflow-hidden">{children}</View>
    </View>
  );
}
