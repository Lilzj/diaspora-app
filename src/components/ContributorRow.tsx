import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import type { AuthorExpertise as AuthorExpertiseType } from '@/types/social';
import { Avatar } from './Avatar';
import { ReputationBadge } from './ReputationBadge';
import { FollowButton } from './FollowButton';

interface ContributorRowProps {
  contributor: AuthorExpertiseType;
  rank?: number;
}

export function ContributorRow({ contributor, rank }: ContributorRowProps) {
  const handlePress = () => router.push(`/contributor/${contributor.userId}`);
  const primaryCountry = contributor.countryVerifications.find((v) => v.isVerified);

  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      className="flex-row items-center bg-white rounded-xl p-4 mb-2"
      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}
    >
      {rankEmoji && <Text className="text-xl mr-3">{rankEmoji}</Text>}
      <Avatar name={contributor.name} size={44} />
      <View className="flex-1 ml-3">
        <Text className="text-sm font-semibold text-neutral-900">{contributor.name}</Text>
        <ReputationBadge level={contributor.reputationLevel} size="sm" />
        {primaryCountry && (
          <Text className="text-xs text-neutral-500 mt-0.5">
            {primaryCountry.flag} {primaryCountry.countryName} · {primaryCountry.yearsOfResidence} yrs
          </Text>
        )}
        <Text className="text-xs text-neutral-400 mt-0.5">
          📚 {contributor.expertiseCategories.join(', ')}
        </Text>
        <Text className="text-xs text-neutral-400 mt-0.5">
          {contributor.guidesPublished} guides · 👥 {contributor.followerCount} followers
        </Text>
      </View>
      <FollowButton
        userId={contributor.userId}
        isFollowing={contributor.isFollowedByUser}
        size="sm"
      />
    </TouchableOpacity>
  );
}
