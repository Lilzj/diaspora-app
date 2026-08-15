// ─────────────────────────────────────────────────────────────────────────────
// `/settings/language` — the route, now rendering the sheet
//
// The picker moved into a bottom sheet, opened from the Settings list. This
// path is kept because it is a real route: it shipped, it can be in a member's
// history, and `lib/notification-routes.ts` allows deep links under
// `/settings`. Deleting the file would turn those into an unmatched route.
//
// So it renders the same sheet over an empty screen, and dismissing it goes
// back. A member arriving by deep link gets the picker; a member arriving from
// the Settings list never comes here at all.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageSheet } from '@/components/settings/LanguageSheet';
import { useTheme } from '@/design-system';

export default function LanguageSettingsRoute() {
  const { tokens } = useTheme();
  const [language, setLanguage] = useState('en');

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1"
      style={{ backgroundColor: tokens.color.surface.background }}
    >
      <View className="flex-1" />

      <LanguageSheet
        visible
        onClose={() => router.back()}
        selected={language}
        onSelect={setLanguage}
      />
    </SafeAreaView>
  );
}
