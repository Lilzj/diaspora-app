import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';

export default function HelpSettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <ScreenHeader title="Help & Support" />
      <ScrollView className="flex-1 px-4 pt-4">
        <SettingsGroup>
          <SettingsItem title="FAQ" subtitle="Find answers to common questions" />
          <SettingsItem title="Contact Us" subtitle="Send us a message" />
          <SettingsItem title="Report a Problem" />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
