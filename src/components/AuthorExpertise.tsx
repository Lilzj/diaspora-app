import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import type { ReputationLevel } from '@/types/reputation';
import type { GuideCategory, CountryRef } from '@/types/guide';
import type { CountryVerificationSummary } from '@/types/verification';
import { ReputationBadge } from './ReputationBadge';
import { FollowButton } from './FollowButton';
import { Avatar } from './Avatar';
import { CommunityTrustBadge } from './CommunityTrustBadge';
import { useLiveFollowerCount } from '@/hooks/community-social';

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
  // Moves when the reader follows from this card (Android UAT, 3 Nov 2026).
  const followers = useLiveFollowerCount(userId, followerCount);

  const handlePress = () => router.push(`/contributor/${userId}`);

  if (variant === 'inline') {
    return (
      <TouchableOpacity onPress={handlePress} className="flex-row items-center">
        <Avatar name={name} size={20} />
        <Text className="text-xs font-medium text-content-secondary ml-1.5">{name}</Text>
        <ReputationBadge level={reputationLevel} size="sm" showLabel={false} />
        {primaryCountry && (
          <Text className="text-xs text-content-muted ml-1">
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
            <Text className="text-sm font-semibold text-content-primary">{name}</Text>
            <View className="ml-1.5">
              <ReputationBadge level={reputationLevel} size="sm" />
            </View>
          </View>
          <View className="flex-row items-center mt-0.5 flex-wrap">
            {primaryCountry && (
              <Text className="text-xs text-content-muted mr-2">
                {primaryCountry.flag} {primaryCountry.countryName} · {primaryCountry.yearsOfResidence} yrs
              </Text>
            )}
            <CommunityTrustBadge
              profile={{
                reputationLevel,
                countryVerifications,
                guidesPublished: 1
              }}
              limit={1}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Full variant
  return (
    <TouchableOpacity
      onPress={handlePress}
      className="bg-surface-background rounded-xl p-4"
      activeOpacity={0.7}
    >
      <View className="flex-row items-center">
        <Avatar name={name} size={48} />
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-content-primary">{name}</Text>
          <ReputationBadge level={reputationLevel} size="md" />
        </View>
        <FollowButton userId={userId} isFollowing={isFollowedByUser} size="sm" />
      </View>

      {/* Country & Community Trust Badges */}
      <View className="mt-3">
        <CommunityTrustBadge
          profile={{
            reputationLevel,
            countryVerifications,
            guidesPublished: followerCount > 100 ? 5 : 1,
            yearsOnPlatform: primaryCountry ? primaryCountry.yearsOfResidence : undefined,
            totalHelpfulVotes: followerCount * 3
          }}
          size="md"
        />
      </View>

      {/* Expertise */}
      {expertiseCategories.length > 0 && (
        <View className="flex-row flex-wrap mt-2">
          <Text className="text-xs text-content-muted mr-1">📚</Text>
          <Text className="text-xs text-content-tertiary">
            {expertiseCategories.join(', ')}
          </Text>
        </View>
      )}

      {/* Followers */}
      <Text className="text-xs text-content-faint mt-2">
        👥 {followers.toLocaleString()} {followers === 1 ? 'follower' : 'followers'}
      </Text>
    </TouchableOpacity>
  );
}
