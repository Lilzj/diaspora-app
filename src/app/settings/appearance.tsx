// ─────────────────────────────────────────────────────────────────────────────
// Settings → Appearance
//
// The member's Light / Dark / System choice. The preference is persisted and
// applied through `ThemeProvider`; see `design-system/ThemeContext.tsx` for why
// one call moves both the token layer and the NativeWind utility layer, which
// is the thing that used to make an override here impossible.
//
// ── Why the change is instant and there is no Save button ────────────────────
//
// The whole screen restyles as the member taps, which *is* the preview — a Save
// button would ask them to commit to something they had already seen and could
// already undo. It also removes the state where a member changes the setting,
// navigates away, and finds it did not take.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenScrollView } from '@/components/layout/bottom-inset';
import { useTheme, type ThemePreference } from '@/design-system';

interface Option {
  value: ThemePreference;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const OPTIONS: Option[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use the light theme, whatever your phone is set to.',
    icon: 'sunny-outline',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use the dark theme, whatever your phone is set to.',
    icon: 'moon-outline',
  },
  {
    value: 'system',
    label: 'System default',
    description: 'Follow your phone. Diaspora changes when your phone does.',
    icon: 'phone-portrait-outline',
  },
];

export default function AppearanceSettingsScreen() {
  const { tokens, preference, setPreference, colorScheme } = useTheme();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1"
      style={{ backgroundColor: tokens.color.surface.background }}
    >
      <ScreenHeader title="Appearance" showBack />

      <ScreenScrollView contentContainerStyle={{ padding: 16 }}>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Appearance"
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.surface.border,
          }}
          className="rounded-2xl border overflow-hidden"
        >
          {OPTIONS.map((option, index) => {
            const selected = preference === option.value;

            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setPreference(option.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                accessibilityHint={option.description}
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: tokens.color.surface.border,
                  // 44pt minimum touch target (WCAG 2.5.5).
                  minHeight: 44,
                }}
                className="flex-row items-center px-4 py-4"
              >
                <View
                  style={{
                    backgroundColor: selected
                      ? tokens.color.neutral[100]
                      : tokens.color.surface.elevated,
                  }}
                  className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={selected ? tokens.color.primary[600] : tokens.color.text.secondary}
                  />
                </View>

                <View className="flex-1 mr-3">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black tracking-tight"
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[11px] font-medium mt-0.5 leading-relaxed"
                  >
                    {option.description}
                  </Text>
                </View>

                {/* The shape carries the state, not only the tint — a filled
                    circle against an empty ring, so it reads without colour. */}
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected ? tokens.color.primary[500] : tokens.color.text.disabled}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium leading-relaxed mt-4 px-1"
        >
          {preference === 'system'
            ? `Following your phone, which is currently set to ${colorScheme}.`
            : `Diaspora will stay ${preference} until you change it here.`}
        </Text>
      </ScreenScrollView>
    </SafeAreaView>
  );
}
