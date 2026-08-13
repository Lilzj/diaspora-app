import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';

interface ScreenHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  transparent?: boolean;
}

/**
 * The standard screen header.
 *
 * Deliberately applies no top safe-area inset: 99 of its 101 call sites already
 * sit inside a `SafeAreaView`, so adding one here would double-pad them.
 */
export function ScreenHeader({ title, showBack = true, onBack, rightAction, transparent }: ScreenHeaderProps) {
  const { tokens } = useTheme();
  const handleBack = onBack || (() => router.back());

  return (
    <View className={`flex-row items-center justify-between h-14 px-4 ${transparent ? '' : 'bg-surface-card'}`}>
      {showBack ? (
        <TouchableOpacity
          onPress={handleBack}
          className="w-12 h-12 items-center justify-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          {/* Was the text character "←", which ignored the icon set every other
              back affordance in the app uses and scaled with the font setting
              rather than with the icon scale. */}
          <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
      ) : (
        <View className="w-12" />
      )}

      {!!title && (
        <Text
          className="text-lg font-semibold text-content-primary flex-1 text-center"
          accessibilityRole="header"
          // A long community or organisation name used to wrap and push the
          // header past its 56pt height, shifting the whole screen down.
          numberOfLines={1}
        >
          {title}
        </Text>
      )}

      {rightAction ? rightAction : <View className="w-12" />}
    </View>
  );
}
