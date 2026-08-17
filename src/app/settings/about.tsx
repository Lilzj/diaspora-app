import React from 'react';
import { View, Text, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { router } from 'expo-router';
import { useNotification } from '@/providers/notification-provider';

export default function AboutSettingsScreen() {
  const { showAlert } = useNotification();
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

        {/*
          These four rows had no `onPress` at all — a settings list of chevrons
          that did nothing when pressed. Three now open documents; the fourth is
          honest about not existing yet.
          
          Community Guidelines opens the screen that already exists under
          `/profile`, rather than a second copy. `push` rather than `replace`, so
          back returns here.
        */}
        <SettingsGroup>
          <SettingsItem
            icon="📄"
            title="Terms of Service"
            subtitle="What Diaspora does, and what it does not"
            onPress={() => router.push('/legal/terms')}
          />
          <SettingsItem
            icon="🔒"
            title="Privacy Policy"
            subtitle="What we know about you, and what you can do about it"
            onPress={() => router.push('/legal/privacy')}
          />
          <SettingsItem
            icon="🤝"
            title="Community Guidelines"
            subtitle="What is expected of everybody here"
            onPress={() => router.push('/profile/community-guidelines')}
          />
          <SettingsItem
            icon="⚖️"
            title="Open Source Licenses"
            subtitle="Not published yet"
            onPress={() =>
              showAlert({
                type: 'info',
                title: 'Not published yet',
                message:
                  'The licence list is generated at build time and is not in this build. It will be here before release.',
                buttons: [{ text: 'Close', style: 'cancel' }],
              })
            }
          />
        </SettingsGroup>

        <Text className="text-center text-xs text-content-faint mt-8 mb-4">
          © 2026 Diaspora Platform Ltd. All rights reserved.
        </Text>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
