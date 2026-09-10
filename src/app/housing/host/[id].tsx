import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HousingCard } from '@/components/HousingCard';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/apiClient';
import type { HousingListing, HousingHost } from '@/types/housing';
import { ConversationHub } from '@/lib/conversation-hub';
import { useBottomInset } from '@/components/layout/bottom-inset';

interface HostProfileDetails extends HousingHost {
  description: string;
  followerCount: number;
  verificationDate: string;
}

export default function HostProfileScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const [host, setHost] = useState<HostProfileDetails | null>(null);
  const [listings, setListings] = useState<HousingListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHostProfile = async () => {
      setLoading(true);
      try {
        // Remediation Wave A′. The platform's vocabulary is `landlord`, not
        // `host` — there is no `host` identifier anywhere in the Housing
        // module's contracts. The difference is more than a rename: a landlord
        // is a verified entity with its own creation, verification and
        // management lifecycle, and the response carries `trust` and
        // `statistics` blocks this screen can show.
        const response = await apiClient.get(
          `/housing/landlords/${encodeURIComponent(String(id))}`
        );
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
      recipientId: host.ownerUserId ?? '',
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
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-semibold text-content-muted mt-3">Loading host profile...</Text>
      </SafeAreaView>
    );
  }

  if (!host) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">👤</Text>
        <Text className="text-base font-extrabold text-content-primary">Host Profile Not Found</Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Host Profile" showBack />

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* Profile Details Card */}
        <View className="bg-surface-card px-6 py-6 border-b border-subtle shadow-sm items-center">
          <View className="w-20 h-20 rounded-full bg-primary-50 items-center justify-center mb-3 border-2 border-primary-500">
            <Text className="text-3xl font-extrabold text-primary-500">{host.name.substring(0, 1)}</Text>
          </View>

          <Text className="text-xl font-black text-content-primary mb-1">{host.name}</Text>
          
          <View className="flex-row items-center mb-3">
            {host.isVerified && (
              <View className="bg-[#E8F7F4] px-2 py-0.5 rounded border border-[#A3EBDB] mr-2">
                <Text className="text-[9px] font-black text-[#0D7C66] uppercase">✓ Verified Host</Text>
              </View>
            )}
            {/* Absent until a tenancy produced one. `★ {host.rating}` rendered
                a bare star against a field nothing sent. */}
            {host.rating && host.rating.totalReviews > 0 ? (
              <Text className="text-xs text-content-muted font-bold bg-surface-background border border-subtle px-2.5 py-0.5 rounded-full">
                ★ {host.rating.average.toFixed(1)} · {host.rating.totalReviews}{' '}
                {host.rating.totalReviews === 1 ? 'review' : 'reviews'}
              </Text>
            ) : (
              <Text className="text-xs text-content-faint font-bold bg-surface-background border border-subtle px-2.5 py-0.5 rounded-full">
                No reviews yet
              </Text>
            )}
          </View>

          {/* Rendered only when the platform actually said so. It used to read
              "Tenure: undefined Years on Platform" for every landlord. */}
          {host.yearsOnPlatform != null && (
            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-wider mb-3">
              Tenure: {host.yearsOnPlatform} Year{host.yearsOnPlatform === 1 ? '' : 's'} on Platform
            </Text>
          )}

          <Text className="text-sm text-content-tertiary text-center leading-relaxed max-w-[280px] mb-5">
            {host.description}
          </Text>

          {/* Core counts Row */}
          <View className="flex-row gap-6 border-t border-faint pt-4 w-full justify-around mb-2">
            <View className="items-center">
              <Text className="text-base font-black text-content-primary">{host.followerCount}</Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase mt-0.5">Followers</Text>
            </View>
            <View className="items-center">
              <Text className="text-base font-black text-content-primary">{listings.length}</Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase mt-0.5">Active Homes</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs font-black text-content-primary" numberOfLines={1}>{host.responseTime || 'Immediate'}</Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase mt-0.5">Response Time</Text>
            </View>
          </View>
        </View>

        {/* Contact actions */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">Contact Channels</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleCall}
              className="flex-1 bg-surface-background border border-subtle py-3 rounded-xl items-center active:bg-surface-muted"
            >
              <Text className="text-xs font-bold text-content-secondary">📞 Call Host</Text>
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
              className="flex-1 bg-surface-background border border-subtle py-3 rounded-xl items-center active:bg-surface-muted"
            >
              <Text className="text-xs font-bold text-content-secondary">✉️ Send Email</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Other properties listings */}
        <View className="p-6 mb-10 mt-3 bg-surface-card border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">
            Active Properties by {host.name}
          </Text>

          {listings.length > 0 ? (
            listings.map((item) => (
              <HousingCard key={item.id} listing={item} />
            ))
          ) : (
            <View className="items-center py-8">
              <Text className="text-xs text-content-muted font-bold">No active properties listed currently.</Text>
            </View>
          )}
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
