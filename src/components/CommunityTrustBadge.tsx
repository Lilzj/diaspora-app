import React from 'react';
import { View, Text } from 'react-native';
import type { ReputationLevel } from '@/types/reputation';

export interface TrustBadgeData {
  id: string;
  label: string;
  emoji: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

interface ProfileLike {
  name?: string;
  isVerified?: boolean;
  reputationLevel?: string;
  yearsOnPlatform?: number;
  responseTime?: string;
  countryVerifications?: any[];
  countryVerificationsCount?: number;
  totalHelpfulVotes?: number;
  guidesPublished?: number;
  providerVerified?: boolean;
}

interface CommunityTrustBadgeProps {
  profile: ProfileLike;
  limit?: number;
  size?: 'sm' | 'md';
}

export function CommunityTrustBadge({ profile, limit, size = 'sm' }: CommunityTrustBadgeProps) {
  const badges: TrustBadgeData[] = [];

  // 1. Country Verification
  const hasCountryVerification = 
    (profile.countryVerifications && profile.countryVerifications.length > 0) ||
    (profile.countryVerificationsCount && profile.countryVerificationsCount > 0);
  if (hasCountryVerification) {
    badges.push({
      id: 'country_verified',
      label: 'Country Verified',
      emoji: '🛡️',
      bgColor: 'bg-surface-muted', // Forest Teal light tint
      textColor: 'text-success-default',
      borderColor: 'border-subtle'
    });
  }

  // 2. Reputation Levels
  if (profile.reputationLevel === 'CommunityExpert' || profile.reputationLevel === 'CommunityAmbassador') {
    badges.push({
      id: 'community_expert',
      label: 'Community Expert',
      emoji: '⭐',
      bgColor: 'bg-surface-muted', // Amber light tint
      textColor: 'text-primary-600',
      borderColor: 'border-subtle'
    });
  } else if (profile.reputationLevel === 'TrustedContributor') {
    badges.push({
      id: 'trusted_contributor',
      label: 'Trusted Contributor',
      emoji: '🏅',
      bgColor: 'bg-surface-muted', // Info blue light tint
      textColor: 'text-info-default',
      borderColor: 'border-subtle'
    });
  }

  // 3. Verified Service Provider
  if (profile.providerVerified) {
    badges.push({
      id: 'service_provider',
      label: 'Verified Provider',
      emoji: '🏠',
      bgColor: 'bg-surface-muted', // Warm coral light tint
      textColor: 'text-[#EE8175]',
      borderColor: 'border-subtle'
    });
  }

  // 4. Guide Author
  if (profile.guidesPublished && profile.guidesPublished > 0) {
    badges.push({
      id: 'guide_author',
      label: 'Guide Author',
      emoji: '📖',
      bgColor: 'bg-surface-muted',
      textColor: 'text-info-default',
      borderColor: 'border-subtle'
    });
  }

  // 5. Years in Community
  if (profile.yearsOnPlatform && profile.yearsOnPlatform > 0) {
    const yrs = profile.yearsOnPlatform;
    badges.push({
      id: 'years_in_community',
      label: `${yrs} Yr${yrs > 1 ? 's' : ''} in Community`,
      emoji: '🤝',
      bgColor: 'bg-surface-muted',
      textColor: 'text-content-secondary',
      borderColor: 'border-subtle'
    });
  }

  // 6. Responds Quickly
  if (profile.responseTime === 'Immediate' || profile.responseTime === 'Fast') {
    badges.push({
      id: 'responds_quickly',
      label: 'Responds Quickly',
      emoji: '💬',
      bgColor: 'bg-surface-muted',
      textColor: 'text-success-default',
      borderColor: 'border-subtle'
    });
  }

  // 7. Helped Members
  if (profile.totalHelpfulVotes && profile.totalHelpfulVotes > 0) {
    badges.push({
      id: 'helped_members',
      label: `Helped ${profile.totalHelpfulVotes.toLocaleString()}`,
      emoji: '❤️',
      bgColor: 'bg-surface-muted',
      textColor: 'text-error-default',
      borderColor: 'border-subtle'
    });
  }

  // Fallback: If no badges but user is generally verified
  if (badges.length === 0 && profile.isVerified) {
    badges.push({
      id: 'verified_general',
      label: 'Verified Member',
      emoji: '✓',
      bgColor: 'bg-surface-background',
      textColor: 'text-content-tertiary',
      borderColor: 'border-subtle'
    });
  }

  const displayedBadges = limit ? badges.slice(0, limit) : badges;

  if (displayedBadges.length === 0) return null;

  const badgeTextSize = size === 'md' ? 'text-xs' : 'text-[9px]';
  const badgeEmojiSize = size === 'md' ? 'text-sm' : 'text-[10px]';
  const containerPadding = size === 'md' ? 'px-2 py-0.5 rounded-lg border mr-2 mb-1.5' : 'px-1.5 py-0.5 rounded border mr-1.5 mb-1';

  return (
    <View className="flex-row flex-wrap items-center">
      {displayedBadges.map((badge) => (
        <View
          key={badge.id}
          className={`flex-row items-center ${badge.bgColor} ${badge.borderColor} ${containerPadding}`}
        >
          <Text className={`${badgeEmojiSize} mr-1`}>{badge.emoji}</Text>
          <Text className={`${badgeTextSize} font-bold uppercase tracking-wider ${badge.textColor}`}>
            {badge.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
