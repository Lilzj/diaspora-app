import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CommunityTrustBadge } from './CommunityTrustBadge';

interface ProviderCardProps {
  listingId: string;
  title: string;
  category: string;
  areaName?: string;
  distanceKm?: number;
  rating: number;
  reviewCount: number;
  coverImageUrl?: string;
  isVerified?: boolean;
  isOpenNow?: boolean;
  variant?: 'list' | 'featured';
}

export function ProviderCard({
  listingId,
  title,
  category,
  areaName,
  distanceKm,
  rating,
  reviewCount,
  coverImageUrl,
  isVerified,
  isOpenNow,
  variant = 'list',
}: ProviderCardProps) {
  const handlePress = () => {
    router.push(`/provider/${listingId}`);
  };

  if (variant === 'featured') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        className="w-[280px] bg-white rounded-2xl overflow-hidden mr-4"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <Image
          source={{ uri: coverImageUrl }}
          style={{ width: '100%', height: 140 }}
          contentFit="cover"
          transition={200}
        />
        <View className="p-4">
          <View className="flex-row items-center mb-1 flex-wrap gap-1.5">
            <Text className="font-semibold text-neutral-900 text-lg flex-1" numberOfLines={1}>
              {title}
            </Text>
            <CommunityTrustBadge
              profile={{
                isVerified,
                reputationLevel: isVerified ? 'TrustedContributor' : undefined,
                providerVerified: isVerified
              }}
              limit={1}
            />
          </View>
          <Text className="text-base text-neutral-500 mb-2">{category}</Text>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="text-warning-default mr-1">★</Text>
              <Text className="text-base font-medium text-neutral-900">{rating.toFixed(1)}</Text>
              <Text className="text-base text-neutral-400 ml-1">({reviewCount})</Text>
            </View>
            {distanceKm != null && (
              <Text className="text-base text-neutral-500">
                {distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)} m` : `${distanceKm.toFixed(1)} km`}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // List variant
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className="flex-row bg-white rounded-xl p-3 mb-3"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <Image
        source={{ uri: coverImageUrl }}
        style={{ width: 104, height: 104, borderRadius: 12 }}
        contentFit="cover"
        transition={200}
      />
      <View className="flex-1 ml-3 justify-center">
        <View className="flex-row items-center mb-1 flex-wrap gap-1.5">
          <Text className="font-semibold text-neutral-900 text-lg flex-1" numberOfLines={2}>
            {title}
          </Text>
          <CommunityTrustBadge
            profile={{
              isVerified,
              reputationLevel: isVerified ? 'TrustedContributor' : undefined,
              providerVerified: isVerified
            }}
            limit={1}
          />
        </View>
        <Text className="text-base text-neutral-500 mb-1">
          {category}
          {areaName ? ` · ${areaName}` : ''}
        </Text>
        <View className="flex-row items-center">
          <Text className="text-warning-default mr-1">★</Text>
          <Text className="text-base font-medium text-neutral-900">{rating.toFixed(1)}</Text>
          <Text className="text-base text-neutral-400 ml-1">({reviewCount})</Text>
          {distanceKm != null && (
            <Text className="text-base text-neutral-500 ml-3">
              {distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)} m` : `${distanceKm.toFixed(1)} km`}
            </Text>
          )}
        </View>
        {isOpenNow != null && (
          <Text className={`text-sm mt-1 font-medium ${isOpenNow ? 'text-success-default' : 'text-neutral-400'}`}>
            {isOpenNow ? 'Open now' : 'Closed'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
