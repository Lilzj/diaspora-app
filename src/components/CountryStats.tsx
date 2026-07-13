import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { CountryStatistics } from '@/types/country';
import { Image } from 'expo-image';
import { router } from 'expo-router';

interface CountryStatsProps {
  stats: CountryStatistics;
  variant?: 'card' | 'full';
}

export function CountryStats({ stats, variant = 'card' }: CountryStatsProps) {
  const handlePress = () => router.push(`/country/${stats.countryCode}`);

  if (variant === 'card') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        className="bg-white rounded-xl p-4 mb-3"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 }}
      >
        <View className="flex-row items-center mb-3">
          <Text className="text-2xl mr-2">{stats.flag}</Text>
          <Text className="text-base font-semibold text-neutral-900">{stats.countryName}</Text>
        </View>
        <View className="flex-row justify-between">
          <StatPill value={stats.providerCount} label="Providers" />
          <StatPill value={stats.guideCount} label="Guides" />
          <StatPill value={stats.updatesToday} label="Today" />
          <StatPill value={stats.verifiedContributorCount} label="Verified" />
        </View>
        <Text className="text-xs text-primary-500 font-medium mt-3">View Country Page →</Text>
      </TouchableOpacity>
    );
  }

  // Full variant (for country page header)
  return (
    <View>
      {stats.landmarkImageUrl && (
        <Image
          source={{ uri: stats.landmarkImageUrl }}
          style={{ width: '100%', height: 200 }}
          contentFit="cover"
          transition={200}
        />
      )}
      <View className="px-6 pt-4">
        <View className="flex-row items-center mb-4">
          <Text className="text-3xl mr-3">{stats.flag}</Text>
          <Text className="text-2xl font-bold text-neutral-900">{stats.countryName}</Text>
        </View>
        <View className="flex-row justify-between mb-4">
          <StatBox value={stats.providerCount} label="Providers" />
          <StatBox value={stats.guideCount} label="Guides" />
          <StatBox value={stats.updatesToday} label="Updates Today" />
        </View>
        <View className="flex-row justify-around mb-4">
          <StatBox value={stats.verifiedContributorCount} label="Verified Contributors" />
          <StatBox value={stats.expertCount} label="Experts" />
        </View>
      </View>
    </View>
  );
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="text-sm font-bold text-neutral-900">{formatNumber(value)}</Text>
      <Text className="text-[10px] text-neutral-500">{label}</Text>
    </View>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <View className="bg-white rounded-xl p-3 items-center flex-1 mx-1" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}>
      <Text className="text-xl font-bold text-neutral-900">{formatNumber(value)}</Text>
      <Text className="text-xs text-neutral-500 text-center mt-0.5">{label}</Text>
    </View>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
