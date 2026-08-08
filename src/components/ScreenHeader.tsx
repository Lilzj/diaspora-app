import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

interface ScreenHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  transparent?: boolean;
}

export function ScreenHeader({ title, showBack = true, onBack, rightAction, transparent }: ScreenHeaderProps) {
  const handleBack = onBack || (() => router.back());

  return (
    <View className={`flex-row items-center justify-between h-14 px-4 ${transparent ? '' : 'bg-white'}`}>
      {showBack ? (
        <TouchableOpacity
          onPress={handleBack}
          className="w-12 h-12 items-center justify-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-2xl text-neutral-900">←</Text>
        </TouchableOpacity>
      ) : (
        <View className="w-12" />
      )}

      {!!title && (
        <Text className="text-lg font-semibold text-neutral-900 flex-1 text-center">
          {title}
        </Text>
      )}

      {rightAction ? rightAction : <View className="w-12" />}
    </View>
  );
}
