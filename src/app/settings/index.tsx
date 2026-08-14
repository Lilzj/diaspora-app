// ─────────────────────────────────────────────────────────────────────────────
// Settings — the hub
//
// `/settings` was already a route in `lib/notification-routes.ts`'s allow-list
// and there was no file behind it, so a notification deep-linking to Settings
// reached an unmatched route. Eight settings screens existed underneath it with
// nothing listing them: `language`, `location`, `notifications`, `origin`,
// `privacy`, `about`, `help` and the integrations tree were each only reachable
// from whichever screen happened to link to one of them.
//
// This is that list, and the home for Appearance.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenScrollView } from '@/components/layout/bottom-inset';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';
import { useTheme } from '@/design-system';

export default function SettingsScreen() {
  const { tokens, preference, colorScheme } = useTheme();

  const appearanceSummary =
    preference === 'system' ? `System default · ${colorScheme}` : preference === 'dark' ? 'Dark' : 'Light';

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1"
      style={{ backgroundColor: tokens.color.surface.background }}
    >
      <ScreenHeader title="Settings" showBack />

      <ScreenScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        <SettingsGroup title="Preferences">
          <SettingsItem
            icon="🎨"
            title="Appearance"
            subtitle={appearanceSummary}
            onPress={() => router.push('/settings/appearance')}
          />
          <SettingsItem
            icon="🌍"
            title="Language"
            subtitle="The language Diaspora is shown in"
            onPress={() => router.push('/settings/language')}
          />
          <SettingsItem
            icon="📍"
            title="Location"
            subtitle="Where Diaspora looks for things near you"
            onPress={() => router.push('/settings/location')}
          />
          <SettingsItem
            icon="🏳️"
            title="Origin"
            subtitle="The country your community is from"
            onPress={() => router.push('/settings/origin')}
          />
        </SettingsGroup>

        <SettingsGroup title="Notifications & privacy">
          <SettingsItem
            icon="🔔"
            title="Notifications"
            subtitle="What Diaspora may contact you about"
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsItem
            icon="🔒"
            title="Privacy"
            subtitle="Who can see your profile and activity"
            onPress={() => router.push('/settings/privacy')}
          />
          <SettingsItem
            icon="🔗"
            title="Connected services"
            subtitle="Calendar, payments, identity and maps"
            onPress={() => router.push('/settings/integrations')}
          />
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsItem
            icon="❓"
            title="Help"
            subtitle="Guides and getting in touch"
            onPress={() => router.push('/settings/help')}
          />
          <SettingsItem
            icon="ℹ️"
            title="About Diaspora"
            subtitle="Version, terms and licences"
            onPress={() => router.push('/settings/about')}
          />
        </SettingsGroup>

        <View className="px-5 pt-2">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium leading-relaxed"
          >
            Looking for verification, security or your saved items? Those live on your Profile.
          </Text>
        </View>
      </ScreenScrollView>
    </SafeAreaView>
  );
}
