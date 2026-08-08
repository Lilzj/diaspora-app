import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AnnouncementCard } from '@/components/explore/AnnouncementCard';
import { apiClient } from '@/lib/apiClient';

export default function ReleaseNotesScreen() {
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
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-100 bg-white flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-black text-neutral-900 tracking-tight">Release Notes</Text>
          <Text className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">What's New Archive</Text>
        </View>
      </View>

      {/* Main List */}
      <ScrollView className="flex-1 px-6 pt-5" showsVerticalScrollIndicator={false}>
        <Text className="text-xs text-neutral-450 leading-relaxed mb-6">
          Review updates, features, improvements, and bug fixes added to Diaspora. Explore walkthroughs of new modules directly from the changelog cards.
        </Text>

        {loading ? (
          <View className="items-center py-10">
            <Text className="text-xs text-neutral-400 font-bold">Loading updates logs...</Text>
          </View>
        ) : announcements.length > 0 ? (
          announcements.map((ann) => (
            <AnnouncementCard key={ann.version} announcement={ann} />
          ))
        ) : (
          <View className="items-center py-20 bg-white rounded-3xl border border-neutral-250 p-6">
            <Text className="text-4xl mb-3">🗞️</Text>
            <Text className="text-sm font-bold text-neutral-800">No release logs found</Text>
          </View>
        )}
        <View className="h-2" />
      </ScrollView>
    </SafeAreaView>
  );
}
