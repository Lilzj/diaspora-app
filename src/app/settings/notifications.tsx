import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenHeader } from '@/components/ScreenHeader';

function CustomSwitch({ value, onValueChange }: { value: boolean; onValueChange: (val: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#E4E4E7', true: '#FF6B00' }}
      thumbColor={value ? '#009688' : '#FFFFFF'}
      ios_backgroundColor="#E4E4E7"
    />
  );
}

export default function NotificationSettingsScreen() {
  const [loading, setLoading] = useState(true);

  // States
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  
  const [reviews, setReviews] = useState(true);
  const [updates, setUpdates] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [marketplace, setMarketplace] = useState(true);
  const [guides, setGuides] = useState(true);
  const [jobs, setJobs] = useState(true);
  const [housing, setHousing] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem('diaspora_notification_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.push !== undefined) setPush(parsed.push);
          if (parsed.email !== undefined) setEmail(parsed.email);
          if (parsed.reviews !== undefined) setReviews(parsed.reviews);
          if (parsed.updates !== undefined) setUpdates(parsed.updates);
          if (parsed.alerts !== undefined) setAlerts(parsed.alerts);
          if (parsed.marketplace !== undefined) setMarketplace(parsed.marketplace);
          if (parsed.guides !== undefined) setGuides(parsed.guides);
          if (parsed.jobs !== undefined) setJobs(parsed.jobs);
          if (parsed.housing !== undefined) setHousing(parsed.housing);
        }
      } catch (err) {
        console.warn('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save settings helper
  const saveSetting = async (key: string, value: boolean) => {
    const currentSettings = {
      push,
      email,
      reviews,
      updates,
      alerts,
      marketplace,
      guides,
      jobs,
      housing,
      [key]: value,
    };
    try {
      await AsyncStorage.setItem('diaspora_notification_settings', JSON.stringify(currentSettings));
    } catch (err) {
      console.warn('Failed to save settings', err);
    }
  };

  const handleToggle = (key: string, value: boolean, setter: (val: boolean) => void) => {
    setter(value);
    saveSetting(key, value);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="small" color="#FF6B00" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Notifications" showBack />
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Delivery Methods */}
        <Text className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-2 ml-4">
          Delivery Methods
        </Text>
        <View className="bg-white rounded-2xl border border-neutral-100 mb-6">
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <Text className="text-sm font-semibold text-neutral-900">Push Notifications</Text>
            <CustomSwitch
              value={push}
              onValueChange={(val) => handleToggle('push', val, setPush)}
            />
          </View>
          <View className="flex-row items-center justify-between p-4">
            <Text className="text-sm font-semibold text-neutral-900">Email Notifications</Text>
            <CustomSwitch
              value={email}
              onValueChange={(val) => handleToggle('email', val, setEmail)}
            />
          </View>
        </View>

        {/* Notify Me About section */}
        <Text className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-2 ml-4">
          Notify me about
        </Text>
        
        <View className="bg-white rounded-2xl border border-neutral-100">
          {/* Reviews */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">New Reviews</Text>
              <Text className="text-xs text-neutral-500 mt-1">When someone reviews your listing</Text>
            </View>
            <CustomSwitch
              value={reviews}
              onValueChange={(val) => handleToggle('reviews', val, setReviews)}
            />
          </View>

          {/* App Updates */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">App Updates</Text>
              <Text className="text-xs text-neutral-500 mt-1">New features and improvements</Text>
            </View>
            <CustomSwitch
              value={updates}
              onValueChange={(val) => handleToggle('updates', val, setUpdates)}
            />
          </View>

          {/* New Alerts */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">New Alerts</Text>
              <Text className="text-xs text-neutral-500 mt-1">Safety alerts and area updates</Text>
            </View>
            <CustomSwitch
              value={alerts}
              onValueChange={(val) => handleToggle('alerts', val, setAlerts)}
            />
          </View>

          {/* Marketplace Posts */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">Marketplace Posts</Text>
              <Text className="text-xs text-neutral-500 mt-1">New items and listings on the marketplace</Text>
            </View>
            <CustomSwitch
              value={marketplace}
              onValueChange={(val) => handleToggle('marketplace', val, setMarketplace)}
            />
          </View>

          {/* Community Guides */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">Community Guides</Text>
              <Text className="text-xs text-neutral-500 mt-1">Newly published expert community guides</Text>
            </View>
            <CustomSwitch
              value={guides}
              onValueChange={(val) => handleToggle('guides', val, setGuides)}
            />
          </View>

          {/* Job Postings */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-100">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">Job Postings</Text>
              <Text className="text-xs text-neutral-500 mt-1">New job vacancies in your industry</Text>
            </View>
            <CustomSwitch
              value={jobs}
              onValueChange={(val) => handleToggle('jobs', val, setJobs)}
            />
          </View>

          {/* Housing Listings */}
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-neutral-900">Housing Listings</Text>
              <Text className="text-xs text-neutral-500 mt-1">New apartment rentals and flat shares</Text>
            </View>
            <CustomSwitch
              value={housing}
              onValueChange={(val) => handleToggle('housing', val, setHousing)}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
