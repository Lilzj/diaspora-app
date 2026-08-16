import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AnnouncementCard } from '@/components/explore/AnnouncementCard';
import { apiClient } from '@/lib/apiClient';
import { useThemeTokens } from '@/design-system';

export default function ReleaseNotesScreen() {
  const tokens = useThemeTokens();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/explore/announcements');
        setAnnouncements(res.data.data);
      } catch (err) {
        console.error('Failed to fetch release announcements', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnnouncements();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-black text-content-primary tracking-tight">Release Notes</Text>
          <Text className="text-[10px] text-content-faint font-bold uppercase tracking-wider">What's New Archive</Text>
        </View>
      </View>

      {/* Main List */}
      <ScrollEndScrollView className="flex-1 px-6 pt-5" showsVerticalScrollIndicator={false}>
        <Text className="text-xs text-content-muted leading-relaxed mb-6">
          Review updates, features, improvements, and bug fixes added to Diaspora. Explore walkthroughs of new modules directly from the changelog cards.
        </Text>

        {loading ? (
          <View className="items-center py-10">
            <Text className="text-xs text-content-faint font-bold">Loading updates logs...</Text>
          </View>
        ) : announcements.length > 0 ? (
          announcements.map((ann) => (
            <AnnouncementCard key={ann.version} announcement={ann} />
          ))
        ) : (
          <View className="items-center py-20 bg-surface-card rounded-3xl border border-subtle p-6">
            <Text className="text-4xl mb-3">🗞️</Text>
            <Text className="text-sm font-bold text-content-strong">No release logs found</Text>
          </View>
        )}
        <View className="h-2" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
