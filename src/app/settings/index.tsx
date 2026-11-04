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

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenScrollView } from '@/components/layout/bottom-inset';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';
import { useTheme } from '@/design-system';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { LanguageSheet } from '@/components/settings/LanguageSheet';
import { mockLanguages } from '@/mocks/data';
import { useAuthStore } from '@/store/auth';

export default function SettingsScreen() {
  const { tokens, preference, colorScheme } = useTheme();

  // The language picker is a sheet rather than a route. See `LanguageSheet`.
  const [isLanguageOpen, setLanguageOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const languageName = mockLanguages.find((l) => l.code === language)?.name ?? 'English';

  // The platform's own grants are posted by its administrators (UAT, 3 Nov
  // 2026, item 7). Shown only where the server granted the permission; the
  // screen behind it asks the server again.
  const canManageGrants = useAuthStore(
    (state) => state.access?.permissions?.includes('creator:programme:manage') ?? false
  );

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
        {/*
          Location and Origin used to sit here. They are not settings a member
          goes looking for in a settings list — Location is changed from the
          banner on Discover and Community Life, where they are already looking
          at results for a place, and Origin is asked once during onboarding and
          then lives on the profile it describes. A settings row for each was a
          third way to reach something already reachable, and made this list
          longer without making anything easier to find.

          The routes still exist and are still linked from those places.
        */}
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
            subtitle={languageName}
            onPress={() => setLanguageOpen(true)}
          />
          <SettingsItem
            icon="🔔"
            title="Notifications"
            subtitle="What Diaspora may contact you about"
            onPress={() => router.push('/settings/notifications')}
          />
        </SettingsGroup>

        {/*
          Privacy, security, the audit log and appeals were the Trust & Safety
          Center's "Governance Controls" card, and privacy was *also* linked
          from the creator profile's "Managed elsewhere" list. Three routes into
          the same four screens.

          They belong here. The Trust Centre is where Diaspora tells you what it
          has verified about you — a status surface. These are things you change,
          which is what a settings screen is for.
        */}
        <TourSpotlight spotlightKey="trust_privacy_toggles">
        <SettingsGroup title="Privacy & security">
          <SettingsItem
            icon="🔒"
            title="Privacy"
            subtitle="Who can see your profile, your activity and your location"
            onPress={() => router.push('/profile/privacy-settings')}
          />
          <SettingsItem
            icon="📱"
            title="Devices & sessions"
            subtitle="Where you are signed in, and signing others out"
            onPress={() => router.push('/profile/account-security')}
          />
          <SettingsItem
            icon="📜"
            title="Security activity"
            subtitle="Sign-ins and settings changes on your account"
            onPress={() => router.push('/profile/audit-log')}
          />
          <SettingsItem
            icon="⚖️"
            title="Appeals"
            subtitle="Challenge a moderation decision"
            onPress={() => router.push('/profile/appeals')}
          />
          <SettingsItem
            icon="🔗"
            title="Connected services"
            subtitle="Calendar, payments, identity and maps"
            onPress={() => router.push('/settings/integrations')}
          />
        </SettingsGroup>
        </TourSpotlight>

        {/*
          Your data.

          Its own group rather than a row inside "Privacy & security", because these two
          are not settings — they are the two things a member can do *to* their account
          that nothing else on this platform can undo. Burying "Delete Account" under a
          chevron next to "Who can see your profile" is how people delete an account by
          accident, and how the ones who mean to cannot find it.

          Both routes are real: `GET /privacy/export` and `POST /privacy/deletion`.
        */}
        <SettingsGroup title="Your data">
          <SettingsItem
            icon="📤"
            title="Download my data"
            subtitle="Everything you gave Diaspora, to keep or take elsewhere"
            onPress={() => router.push('/settings/data-export')}
          />
          <SettingsItem
            icon="🗑️"
            title="Delete my account"
            subtitle="Permanently remove your account and everything that names you"
            variant="danger"
            onPress={() => router.push('/settings/delete-account')}
          />
        </SettingsGroup>

        {canManageGrants ? (
          <SettingsGroup title="Platform">
            <SettingsItem
              icon="🎁"
              title="Grants"
              subtitle="Post, edit and close the grants members can apply to"
              onPress={() => router.push('/moderation/grants' as never)}
            />
          </SettingsGroup>
        ) : null}

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
            Your verification status lives in the Trust &amp; Safety Center, and your saved items on
            your Profile. Your location is changed from the banner on Discover.
          </Text>
        </View>
      </ScreenScrollView>

      <LanguageSheet
        visible={isLanguageOpen}
        onClose={() => setLanguageOpen(false)}
        selected={language}
        onSelect={setLanguage}
      />
    </SafeAreaView>
  );
}
