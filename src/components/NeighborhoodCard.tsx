import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface NeighborhoodCardProps {
  id: string;
  name: string;
  cityName: string;
  countryFlag: string;
  stats?: {
    safetyScore: number;
    costOfLiving: 'Low' | 'Medium' | 'High';
    walkability: number;
  };
  resourceCounts?: {
    providers: number;
    jobs: number;
    housing: number;
  };
  className?: string;
}

export function NeighborhoodCard({
  id,
  name,
  cityName,
  countryFlag,
  stats,
  resourceCounts,
  className = '',
}: NeighborhoodCardProps) {
  const handlePress = () => {
    // Generate URL slug format
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    router.push(`/neighborhood/${slug}`);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className={`bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm ${className}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Top Header */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center flex-1 pr-2">
          <Text className="text-xl mr-2">{countryFlag}</Text>
          <View className="flex-1">
            <Text className="text-sm font-extrabold text-neutral-900 leading-snug" numberOfLines={1}>
              {name}
            </Text>
            <Text className="text-[11px] text-neutral-450 font-bold mt-0.5">
              District in {cityName}
            </Text>
          </View>
        </View>
        <View className="bg-primary-50 px-2.5 py-1 rounded-full">
          <Text className="text-[9px] font-black text-primary-500 uppercase">View Hub</Text>
        </View>
      </View>

      {/* Ratings Indicators */}
      {stats && (
        <View className="flex-row items-center gap-1.5 mb-3.5 flex-wrap">
          <View className="bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100 flex-row items-center">
            <Text className="text-[10px] mr-1">🛡️</Text>
            <Text className="text-[9px] font-bold text-neutral-500">Safety: {stats.safetyScore}/100</Text>
          </View>
          <View className="bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100 flex-row items-center">
            <Text className="text-[10px] mr-1">💰</Text>
            <Text className="text-[9px] font-bold text-neutral-500">Cost: {stats.costOfLiving}</Text>
          </View>
          <View className="bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100 flex-row items-center">
            <Text className="text-[10px] mr-1">🚶</Text>
            <Text className="text-[9px] font-bold text-neutral-500">Walk: {stats.walkability}%</Text>
          </View>
        </View>
      )}

      {/* Resource Count Pills */}
      {resourceCounts && (
        <View className="flex-row items-center justify-between border-t border-neutral-50 pt-3">
          <View className="items-center flex-1">
            <Text className="text-[10px] text-neutral-400 font-extrabold uppercase">Shops</Text>
            <Text className="text-sm font-black text-neutral-850 mt-0.5">{resourceCounts.providers}</Text>
          </View>
          <View className="items-center flex-1 border-x border-neutral-100">
            <Text className="text-[10px] text-neutral-400 font-extrabold uppercase">Vacancies</Text>
            <Text className="text-sm font-black text-neutral-850 mt-0.5">{resourceCounts.jobs}</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-[10px] text-neutral-400 font-extrabold uppercase">Rentals</Text>
            <Text className="text-sm font-black text-neutral-850 mt-0.5">{resourceCounts.housing}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}
