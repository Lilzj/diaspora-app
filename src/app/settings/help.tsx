import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsItem, SettingsGroup } from '@/components/SettingsItem';
import { router } from 'expo-router';

export default function HelpSettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <ScreenHeader title="Help & Support" />
      <ScrollView className="flex-1 px-4 pt-4">
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
          <View className="bg-white/20 w-8 h-8 rounded-full items-center justify-center">
            <Text className="text-white text-xs font-black">→</Text>
          </View>
        </TouchableOpacity>

        <SettingsGroup>
          <SettingsItem title="FAQ" subtitle="Find answers to common questions" />
          <SettingsItem title="Contact Us" subtitle="Send us a message" />
          <SettingsItem title="Report a Problem" />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
