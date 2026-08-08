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
      bgColor: 'bg-[#E8F7F4]', // Forest Teal light tint
      textColor: 'text-[#0D7C66]',
      borderColor: 'border-[#A3EBDB]'
    });
  }

  // 2. Reputation Levels
  if (profile.reputationLevel === 'CommunityExpert' || profile.reputationLevel === 'CommunityAmbassador') {
    badges.push({
      id: 'community_expert',
      label: 'Community Expert',
      emoji: '⭐',
      bgColor: 'bg-[#FFF8EB]', // Amber light tint
      textColor: 'text-[#B56500]',
      borderColor: 'border-[#FDD98A]'
    });
  } else if (profile.reputationLevel === 'TrustedContributor') {
    badges.push({
      id: 'trusted_contributor',
      label: 'Trusted Contributor',
      emoji: '🏅',
      bgColor: 'bg-[#EFF6FF]', // Info blue light tint
      textColor: 'text-[#2563EB]',
      borderColor: 'border-[#BFDBFE]'
    });
  }

  // 3. Verified Service Provider
  if (profile.providerVerified) {
    badges.push({
      id: 'service_provider',
      label: 'Verified Provider',
      emoji: '🏠',
      bgColor: 'bg-[#FEF4F2]', // Warm coral light tint
      textColor: 'text-[#EE8175]',
      borderColor: 'border-[#FAD0CB]'
    });
  }

  // 4. Guide Author
  if (profile.guidesPublished && profile.guidesPublished > 0) {
    badges.push({
      id: 'guide_author',
      label: 'Guide Author',
      emoji: '📖',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200'
    });
  }

  // 5. Years in Community
  if (profile.yearsOnPlatform && profile.yearsOnPlatform > 0) {
    const yrs = profile.yearsOnPlatform;
    badges.push({
      id: 'years_in_community',
      label: `${yrs} Yr${yrs > 1 ? 's' : ''} in Community`,
      emoji: '🤝',
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-700',
      borderColor: 'border-slate-200'
    });
  }

  // 6. Responds Quickly
  if (profile.responseTime === 'Immediate' || profile.responseTime === 'Fast') {
    badges.push({
      id: 'responds_quickly',
      label: 'Responds Quickly',
      emoji: '💬',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-200'
    });
  }

  // 7. Helped Members
  if (profile.totalHelpfulVotes && profile.totalHelpfulVotes > 0) {
    badges.push({
      id: 'helped_members',
      label: `Helped ${profile.totalHelpfulVotes.toLocaleString()}`,
      emoji: '❤️',
      bgColor: 'bg-pink-50',
      textColor: 'text-pink-700',
      borderColor: 'border-pink-200'
    });
  }

  // Fallback: If no badges but user is generally verified
  if (badges.length === 0 && profile.isVerified) {
    badges.push({
      id: 'verified_general',
      label: 'Verified Member',
      emoji: '✓',
      bgColor: 'bg-neutral-50',
      textColor: 'text-neutral-600',
      borderColor: 'border-neutral-200'
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
