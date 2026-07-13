import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';

export default function PrivacySettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <ScreenHeader title="Privacy & Security" />
      <ScrollView className="flex-1 px-4 pt-4">
        <SettingsGroup>
          <SettingsItem title="Change Password" />
          <SettingsItem title="Two-Factor Authentication" subtitle="Disabled" />
        </SettingsGroup>

        <SettingsGroup title="Data Privacy">
          <SettingsItem title="Data Sharing" subtitle="Manage how your data is used" />
          <SettingsItem title="Download My Data" />
        </SettingsGroup>

        <SettingsGroup title="Account Control">
          <SettingsItem title="Deactivate Account" variant="danger" showChevron={false} />
          <SettingsItem title="Delete Account" variant="danger" showChevron={false} />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
