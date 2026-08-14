import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/lib/apiClient';
import type { NeighborhoodOverview } from '@/mocks/handlers/location';
import { useLocationStore } from '@/store/location';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useThemeTokens } from '@/design-system';

export default function NeighborhoodHubScreen() {
  const tokens = useThemeTokens();
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<NeighborhoodOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const store = useLocationStore();

  useEffect(() => {
    if (!id) return;

    const fetchDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiClient.get(`/neighborhood/${id}`);
        setData(res.data.data);
      } catch (err) {
        console.error('Failed to load neighborhood details', err);
        setError('Neighborhood details could not be found.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  const handleResourcePress = (tabName: string) => {
    // Override active location in store when clicking into a hub,
    // making discover results align automatically!
    if (data) {
      const selectedNode = {
        countryCode: data.countryCode,
        countryName: data.countryName,
        flag: data.countryCode === 'GB' ? '🇬🇧' : '🇲🇺',
        cityName: data.cityName,
        neighborhood: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        displayName: `${data.name}, ${data.cityName}`,
      };
      
      store.setCurrentLocation(selectedNode);
    }
    
    router.push({
      pathname: '/discover',
      params: { tab: tabName },
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Top Header */}
      <View className="px-6 py-4 flex-row items-center border-b border-faint bg-surface-card">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-2 bg-surface-background rounded-full mr-3.5 border border-subtle"
        >
          <Ionicons name="arrow-back" size={18} color={tokens.color.text.secondary} />
        </TouchableOpacity>
        <Text className="text-lg font-black text-content-primary flex-1">Neighborhood Hub</Text>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator color="#F59300" size="large" />
          <Text className="text-xs font-bold text-content-faint mt-2">Loading neighborhood context...</Text>
        </View>
      ) : error || !data ? (
        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-5xl mb-4">📍</Text>
          <Text className="text-base font-black text-content-primary">Hub Not Found</Text>
          <Text className="text-xs text-content-muted text-center mt-1.5 leading-relaxed">
            {error || 'This neighborhood could not be located in our current geographic directory.'}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-6 bg-surface-inverse px-6 py-3 rounded-xl active:bg-surface-inverse"
          >
            <Text className="text-content-inverse font-extrabold text-xs">Return to Discover</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
          {/* Cover Panel with Gradient Overlays */}
          <View className="bg-primary-500 py-10 px-6 justify-center relative overflow-hidden">
            {/* Background elements */}
            <View className="absolute right-0 bottom-0 opacity-10">
              <Ionicons name="earth" size={240} color="#000" />
            </View>
            
            <View className="flex-row items-center mb-1.5">
              <Text className="text-3xl mr-3">{data.countryCode === 'GB' ? '🇬🇧' : '🇲🇺'}</Text>
              <Text className="text-xs font-black text-white/80 uppercase tracking-widest">
                {data.cityName}, {data.countryName}
              </Text>
            </View>
            <Text className="text-3xl font-black text-white tracking-tight">{data.name}</Text>
            <Text className="text-xs font-extrabold text-white/90 mt-1">
              Active Community Hub Node
            </Text>
          </View>

          {/* Description Block */}
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-2.5">About This Area</Text>
            <Text className="text-sm font-semibold text-content-secondary leading-relaxed">
              {data.overview}
            </Text>
          </View>

          {/* Proximity Stats Grid */}
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3.5">Neighborhood Quality Indexes</Text>
            <View className="flex-row gap-3">
              {/* Safety */}
              <View className="flex-1 bg-surface-background rounded-2xl p-4 border border-faint items-center">
                <Text className="text-2xl mb-1">🛡️</Text>
                <Text className="text-[10px] text-content-faint font-extrabold uppercase">Safety</Text>
                <Text className="text-base font-black text-content-primary mt-0.5">{data.stats.safetyScore}/100</Text>
              </View>

              {/* Cost of Living */}
              <View className="flex-1 bg-surface-background rounded-2xl p-4 border border-faint items-center">
                <Text className="text-2xl mb-1">💰</Text>
                <Text className="text-[10px] text-content-faint font-extrabold uppercase">Cost Index</Text>
                <Text className="text-base font-black text-content-primary mt-0.5">{data.stats.costOfLiving}</Text>
              </View>

              {/* Walkability */}
              <View className="flex-1 bg-surface-background rounded-2xl p-4 border border-faint items-center">
                <Text className="text-2xl mb-1">🚶</Text>
                <Text className="text-[10px] text-content-faint font-extrabold uppercase">Walkability</Text>
                <Text className="text-base font-black text-content-primary mt-0.5">{data.stats.walkability}%</Text>
              </View>
            </View>

            {/*
              Frontend Phase 8. The three figures above are the certified ones
              and stay exactly as they were. This opens the fuller view: the
              dimension breakdown, the cost-of-living categories, the safety
              methodology and limitations, and side-by-side comparison with
              nearby areas — with each figure marked as published or estimated.
            */}
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/map/neighborhood/[id]', params: { id } })}
              accessibilityRole="button"
              accessibilityLabel={`See the full breakdown for ${data.name}, including safety, cost of living and how it compares with nearby areas`}
              className="flex-row items-center justify-center mt-4 py-3 rounded-2xl border border-subtle active:bg-surface-background"
            >
              <Ionicons name="stats-chart-outline" size={14} color={tokens.color.text.secondary} />
              <Text className="text-[11px] font-black text-content-tertiary uppercase tracking-wider ml-2">
                Safety, cost & comparison
              </Text>
            </TouchableOpacity>
          </View>

          {/* Local Resources Dashboard */}
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-6">
            <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3.5">
              Available Resources In This Hub
            </Text>
            
            <View className="flex-col gap-2.5">
              {/* Service Providers */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Providers')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#EBF5FF] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="business" size={16} color="#1E88E5" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Service Providers</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Shops, restaurants, beauty services</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{data.resourceCounts.providers}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Jobs */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Jobs')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#EDFDF5] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="briefcase" size={16} color="#2E7D32" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Job Openings</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Local listings, commercial projects</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{data.resourceCounts.jobs}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Housing */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Housing')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#FFF8E1] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="home" size={16} color="#F57F17" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Homes & Housing</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Rentals, flat shares, room listings</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{data.resourceCounts.housing}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Marketplace */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Marketplace')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#F3E5F5] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="cart" size={16} color="#7B1FA2" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Buy & Sell</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Marketplace goods, items wanted</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{data.resourceCounts.marketplace}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Events & Community Life */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Community')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#FDF2F8] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="people" size={16} color="#C2185B" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-primary">Community Life</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Events, local gatherings, organisations</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">
                    {data.resourceCounts.events + data.resourceCounts.organizations}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View className="h-10" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
