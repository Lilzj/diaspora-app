import React from 'react';
import { View, Text, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function AboutSettingsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="About" />
      <ScrollEndScrollView className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="items-center mb-8">
          <View className="w-24 h-24 bg-primary-100 rounded-2xl items-center justify-center mb-4">
            <Text className="text-4xl text-primary-500 font-bold">D</Text>
          </View>
          <Text className="text-xl font-bold text-content-primary">Diaspora</Text>
          <Text className="text-sm text-content-muted mt-1">Version 1.0.0 (Build 42)</Text>
        </View>

        <SettingsGroup>
          <SettingsItem title="Terms of Service" />
          <SettingsItem title="Privacy Policy" />
          <SettingsItem title="Community Guidelines" />
          <SettingsItem title="Open Source Licenses" />
        </SettingsGroup>

        <Text className="text-center text-xs text-content-faint mt-8 mb-4">
          © 2026 Diaspora Platform Ltd. All rights reserved.
        </Text>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
