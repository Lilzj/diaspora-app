import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface DraftBannerProps {
  /** What the draft is, in this wizard's own words. */
  message: string;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * The offer to pick up a draft the phone kept: Restore or Discard.
 *
 * One component since 27 Nov 2026 (FARCH-007). Six wizards drew their own, with
 * five titles between them: the home and marketplace wizards said "Unfinished
 * Draft"; the business one "Unfinished draft detected", with narrower buttons;
 * the guide and alert wizards "Guide Draft Detected" and "Alert Draft
 * Detected"; and diaspora verification a smaller card inside its form, titled
 * "Recover Draft Progress". This is the home and marketplace one. The words
 * that differ on purpose, what the draft is, come from each wizard. The buttons
 * now say they are buttons, which none of the six did.
 */
export function DraftBanner({ message, onRestore, onDiscard }: DraftBannerProps) {
  return (
    <View className="bg-surface-muted border-b border-subtle px-6 py-4 flex-row items-center justify-between">
      <View className="flex-1 mr-4">
        <Text className="text-sm font-bold text-content-strong">✏️ Unfinished Draft</Text>
        <Text className="text-xs text-content-tertiary mt-0.5">{message}</Text>
      </View>
      <View className="flex-row">
        <TouchableOpacity
          onPress={onRestore}
          accessibilityRole="button"
          className="bg-primary-500 px-3.5 py-2 rounded-xl mr-2"
        >
          <Text className="text-xs font-bold text-white">Restore</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDiscard}
          accessibilityRole="button"
          className="bg-surface-muted border border-subtle px-3.5 py-2 rounded-xl"
        >
          <Text className="text-xs font-bold text-content-tertiary">Discard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
