import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import type { ReputationLevel } from '@/types/reputation';
import type { GuideCategory, CountryRef } from '@/types/guide';
import type { CountryVerificationSummary } from '@/types/verification';
import { ReputationBadge } from './ReputationBadge';
import { FollowButton } from './FollowButton';
import { Avatar } from './Avatar';

interface AuthorExpertiseProps {
  userId: string;
  name: string;
  reputationLevel: ReputationLevel;
  countryVerifications: CountryVerificationSummary[];
  expertiseCategories: GuideCategory[];
  followerCount: number;
  isFollowedByUser: boolean;
  variant?: 'full' | 'compact' | 'inline';
}

export function AuthorExpertise({
  userId,
  name,
  reputationLevel,
  countryVerifications,
  expertiseCategories,
  followerCount,
  isFollowedByUser,
  variant = 'compact',
}: AuthorExpertiseProps) {
  const primaryCountry = countryVerifications.find((v) => v.isVerified);

  const handlePress = () => router.push(`/contributor/${userId}`);

  if (variant === 'inline') {
    return (
      <TouchableOpacity onPress={handlePress} className="flex-row items-center">
        <Avatar name={name} size={20} />
        <Text className="text-xs font-medium text-neutral-700 ml-1.5">{name}</Text>
        <ReputationBadge level={reputationLevel} size="sm" showLabel={false} />
        {primaryCountry && (
          <Text className="text-xs text-neutral-500 ml-1">
            {primaryCountry.flag} {primaryCountry.yearsOfResidence}yrs
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'compact') {
    return (
      <TouchableOpacity onPress={handlePress} className="flex-row items-center">
        <Avatar name={name} size={32} />
        <View className="ml-2.5 flex-1">
          <View className="flex-row items-center">
            <Text className="text-sm font-semibold text-neutral-900">{name}</Text>
            <View className="ml-1.5">
              <ReputationBadge level={reputationLevel} size="sm" />
            </View>
          </View>
          <View className="flex-row items-center mt-0.5">
            {primaryCountry && (
              <Text className="text-xs text-neutral-500">
                {primaryCountry.flag} {primaryCountry.countryName} · {primaryCountry.yearsOfResidence} yrs
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Full variant
  return (
    <TouchableOpacity
      onPress={handlePress}
      className="bg-neutral-50 rounded-xl p-4"
      activeOpacity={0.7}
    >
      <View className="flex-row items-center">
        <Avatar name={name} size={48} />
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-neutral-900">{name}</Text>
          <ReputationBadge level={reputationLevel} size="md" />
        </View>
        <FollowButton userId={userId} isFollowing={isFollowedByUser} size="sm" />
      </View>

      {/* Country verifications */}
      {countryVerifications.filter((v) => v.isVerified).length > 0 && (
        <View className="mt-3">
          {countryVerifications
            .filter((v) => v.isVerified)
            .map((v) => (
              <View key={v.countryCode} className="flex-row items-center mt-1">
                <Text className="text-sm">
                  {v.flag} {v.countryName} Verified
                </Text>
                <Text className="text-xs text-neutral-500 ml-1">· {v.yearsOfResidence} yrs</Text>
              </View>
            ))}
        </View>
      )}

      {/* Expertise */}
      {expertiseCategories.length > 0 && (
        <View className="flex-row flex-wrap mt-2">
          <Text className="text-xs text-neutral-500 mr-1">📚</Text>
          <Text className="text-xs text-neutral-600">
            {expertiseCategories.join(', ')}
          </Text>
        </View>
      )}

      {/* Followers */}
      <Text className="text-xs text-neutral-400 mt-2">
        👥 {followerCount.toLocaleString()} followers
      </Text>
    </TouchableOpacity>
  );
}
