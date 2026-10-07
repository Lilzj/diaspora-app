import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';
import { ContactSheet, type ContactKind } from '@/components/settings/ContactSheet';
import { router } from 'expo-router';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function HelpSettingsScreen() {
  const [sheet, setSheet] = useState<ContactKind | null>(null);
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="Help & Support" />
      <ScrollEndScrollView className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* Explore Diaspora Hub Entry Point */}
        <TouchableOpacity
          onPress={() => router.push('/explore')}
          className="bg-primary-500 rounded-3xl p-5 mb-5 shadow-lg shadow-primary-500/10 flex-row items-center justify-between"
        >
          <View className="flex-1 mr-3">
            <Text className="text-white text-sm font-black mb-1">
              Explore Diaspora Hub 🚀
            </Text>
            <Text className="text-white/80 text-[10px] leading-relaxed">
              Interactive guides, safety academies, release notes, and guided tours of all features.
            </Text>
          </View>
          <View className="bg-surface-card/20 w-8 h-8 rounded-full items-center justify-center">
            <Text className="text-white text-xs font-black">→</Text>
          </View>
        </TouchableOpacity>

        <SettingsGroup>
          {/* All three were inert — chevrons that did nothing when pressed. */}
          <SettingsItem
            icon="❓"
            title="FAQ"
            subtitle="Find answers to common questions"
            onPress={() => router.push('/settings/faq')}
          />
          <SettingsItem
            icon="🛡️"
            title="Trading safely"
            subtitle="Meeting in person, paying in the app, and checking trust"
            onPress={() => router.push('/safety/trading' as never)}
          />
          <SettingsItem
            icon="✉️"
            title="Contact Us"
            subtitle="Send us a message"
            onPress={() => setSheet('contact')}
          />
          <SettingsItem
            icon="🚩"
            title="Report a Problem"
            subtitle="Something broken, unsafe or wrong"
            onPress={() => setSheet('report')}
          />
        </SettingsGroup>
      </ScrollEndScrollView>

      <ContactSheet
        kind={sheet ?? 'contact'}
        visible={sheet !== null}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}
