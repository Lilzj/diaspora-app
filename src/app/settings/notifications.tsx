import React, { useState } from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';

export default function NotificationSettingsScreen() {
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [reviews, setReviews] = useState(true);
  const [updates, setUpdates] = useState(true);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <ScreenHeader title="Notifications" />
      <ScrollView className="flex-1 px-4 pt-4">
        <View className="bg-white rounded-xl mb-6">
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <Text className="text-base text-neutral-900">Push Notifications</Text>
            <Switch value={push} onValueChange={setPush} trackColor={{ true: '#F59300' }} />
          </View>
          <View className="flex-row items-center justify-between p-4">
            <Text className="text-base text-neutral-900">Email Notifications</Text>
            <Switch value={email} onValueChange={setEmail} trackColor={{ true: '#F59300' }} />
          </View>
        </View>

        <Text className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 ml-4">
          Notify me about
        </Text>
        <View className="bg-white rounded-xl mb-6">
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View>
              <Text className="text-base text-neutral-900">New Reviews</Text>
              <Text className="text-sm text-neutral-500 mt-1">When someone reviews your listing</Text>
            </View>
            <Switch value={reviews} onValueChange={setReviews} trackColor={{ true: '#F59300' }} />
          </View>
          <View className="flex-row items-center justify-between p-4">
            <View>
              <Text className="text-base text-neutral-900">App Updates</Text>
              <Text className="text-sm text-neutral-500 mt-1">New features and improvements</Text>
            </View>
            <Switch value={updates} onValueChange={setUpdates} trackColor={{ true: '#F59300' }} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
