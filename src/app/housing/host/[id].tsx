import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HousingCard } from '@/components/HousingCard';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/apiClient';
import type { HousingListing, HousingHost } from '@/types/housing';
import { ConversationHub } from '@/lib/conversation-hub';

interface HostProfileDetails extends HousingHost {
  description: string;
  followerCount: number;
  verificationDate: string;
}

export default function HostProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [host, setHost] = useState<HostProfileDetails | null>(null);
  const [listings, setListings] = useState<HousingListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHostProfile = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(`/housing/hosts/${id}`);
        setHost(response.data.data.host);
        setListings(response.data.data.listings);
      } catch (err) {
        console.error('Failed to load host profile', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchHostProfile();
    }
  }, [id]);

  const handleCall = () => {
    if (!host?.contactPhone) return;
    Linking.openURL(`tel:${host.contactPhone}`);
  };

  const handleEmail = () => {
    if (!host?.contactEmail) return;
    Linking.openURL(`mailto:${host.contactEmail}`);
  };

  const handleMessage = async () => {
    if (!host?.providerId) return;
    await ConversationHub.openOrCreateConversation({
      recipientId: host.providerId,
      recipientName: host.name,
      contextType: 'HousingListing',
      entityId: id,
      entityTitle: `${host.name}'s Properties`,
      entitySubtitle: `${listings.length} active listing${listings.length !== 1 ? 's' : ''}`,
      entityStatus: 'Active',
      deepLink: `/housing/host/${id}`,
      campaignSource: 'host_profile',
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#FF6B00" />
        <Text className="text-sm font-semibold text-neutral-500 mt-3">Loading host profile...</Text>
      </SafeAreaView>
    );
  }

  if (!host) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-4xl mb-3">👤</Text>
        <Text className="text-base font-extrabold text-neutral-850">Host Profile Not Found</Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <ScreenHeader title="Host Profile" showBack />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Profile Details Card */}
        <View className="bg-white px-6 py-6 border-b border-neutral-200 shadow-sm items-center">
          <View className="w-20 h-20 rounded-full bg-primary-50 items-center justify-center mb-3 border-2 border-primary-500">
            <Text className="text-3xl font-extrabold text-primary-500">{host.name.substring(0, 1)}</Text>
          </View>

          <Text className="text-xl font-black text-neutral-900 mb-1">{host.name}</Text>
          
          <View className="flex-row items-center mb-3">
            {host.isVerified && (
              <View className="bg-[#E8F7F4] px-2 py-0.5 rounded border border-[#A3EBDB] mr-2">
                <Text className="text-[9px] font-black text-[#0D7C66] uppercase">✓ Verified Host</Text>
              </View>
            )}
            <Text className="text-xs text-neutral-450 font-bold bg-neutral-50 border border-neutral-200 px-2.5 py-0.5 rounded-full">
              ★ {host.rating} Rating
            </Text>
          </View>

          <Text className="text-xs text-neutral-400 font-extrabold uppercase tracking-wider mb-3">
            Tenure: {host.yearsOnPlatform} Year{host.yearsOnPlatform > 1 && 's'} on Platform
          </Text>

          <Text className="text-sm text-neutral-600 text-center leading-relaxed max-w-[280px] mb-5">
            {host.description}
          </Text>

          {/* Core counts Row */}
          <View className="flex-row gap-6 border-t border-neutral-50 pt-4 w-full justify-around mb-2">
            <View className="items-center">
              <Text className="text-base font-black text-neutral-850">{host.followerCount}</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Followers</Text>
            </View>
            <View className="items-center">
              <Text className="text-base font-black text-neutral-850">{listings.length}</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Active Homes</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs font-black text-neutral-850" numberOfLines={1}>{host.responseTime || 'Immediate'}</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Response Time</Text>
            </View>
          </View>
        </View>

        {/* Contact actions */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Contact Channels</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleCall}
              className="flex-1 bg-neutral-50 border border-neutral-200 py-3 rounded-xl items-center active:bg-neutral-100"
            >
              <Text className="text-xs font-bold text-neutral-700">📞 Call Host</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMessage}
              className="flex-1 py-3 rounded-xl items-center active:opacity-85"
              style={{ backgroundColor: '#F59300' }}
            >
              <Text className="text-xs font-black text-white">💬 Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              className="flex-1 bg-neutral-50 border border-neutral-200 py-3 rounded-xl items-center active:bg-neutral-100"
            >
              <Text className="text-xs font-bold text-neutral-700">✉️ Send Email</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Other properties listings */}
        <View className="p-6 mb-10 mt-3 bg-white border-y border-neutral-200">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">
            Active Properties by {host.name}
          </Text>

          {listings.length > 0 ? (
            listings.map((item) => (
              <HousingCard key={item.id} listing={item} />
            ))
          ) : (
            <View className="items-center py-8">
              <Text className="text-xs text-neutral-450 font-bold">No active properties listed currently.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
