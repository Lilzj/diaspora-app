import React from 'react';
import { View, Text, Animated, Pressable } from 'react-native';
import { router } from 'expo-router';
import type { UpdateSummary } from '@/types/update';
import type { AuthorSummary } from '@/types/social';
import { UPDATE_CATEGORY_ICONS } from '@/types/update';
import { ReputationBadge } from './ReputationBadge';

interface UpdateCardProps {
  update: UpdateSummary;
  author: AuthorSummary;
}

const ACCESSIBLE_URGENCY_STYLES = {
  Emergency: { text: '#B91C1C', bg: '#FEF2F2', border: '#FEE2E2', label: '🚨 EMERGENCY' },
  Urgent: { text: '#B45309', bg: '#FFFBEB', border: '#FEF3C7', label: '⚠️ URGENT' },
  Normal: { text: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE', label: 'NORMAL' },
  Low: { text: '#374151', bg: '#F3F4F6', border: '#E5E7EB', label: 'LOW' },
};

export function UpdateCard({ update, author }: UpdateCardProps) {
  const scaleVal = React.useRef(new Animated.Value(1)).current;

  const handlePress = () => router.push(`/update/${update.updateId}`);

  const handlePressIn = () => {
    Animated.spring(scaleVal, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleVal, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const timeAgo = getRelativeTime(update.publishedAt);
  const expiresIn = getTimeUntil(update.expiresAt);
  const categoryIcon = UPDATE_CATEGORY_ICONS[update.category];
  const urgencyStyle = ACCESSIBLE_URGENCY_STYLES[update.urgency];

  const isVerified = update.verificationStatus === 'CommunityVerified';

  // Calculate simulated confidence rating
  // Multiplier: verifiedResidentCount * 15 + confirmations * 4 + reputation rating
  const baseScore = 65;
  const confirmations = update.confirmationCount || 0;
  const verifiedCount = update.verifiedResidentConfirmationCount || 0;
  const confidenceScore = Math.min(baseScore + (verifiedCount * 8) + (confirmations * 2), 99);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ marginBottom: 12 }}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleVal }],
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          padding: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 4,
          elevation: 1,
          borderWidth: 1,
          borderColor: '#F3F4F6',
        }}
      >
        {/* Top Header: Urgency badge & Expiry time */}
        <View className="flex-row items-center justify-between mb-3">
          <View
            style={{
              backgroundColor: urgencyStyle.bg,
              borderColor: urgencyStyle.border,
              borderWidth: 1,
            }}
            className="px-2.5 py-0.5 rounded-full"
          >
            <Text
              style={{ color: urgencyStyle.text }}
              className="text-[10px] font-extrabold tracking-wider"
            >
              {urgencyStyle.label}
            </Text>
          </View>
          <Text className="text-[10px] text-neutral-400 font-extrabold">
            Expires {expiresIn}
          </Text>
        </View>

        {/* Title & Category Icon */}
        <View className="flex-row items-center mb-1.5">
          <Text className="text-lg mr-2">{categoryIcon}</Text>
          <Text className="font-extrabold text-neutral-900 text-sm flex-1 leading-snug" numberOfLines={1}>
            {update.title}
          </Text>
        </View>

        {/* Description */}
        <Text className="text-xs text-neutral-500 mb-3 leading-relaxed" numberOfLines={2}>
          {update.description}
        </Text>

        {/* Location & Time */}
        <View className="flex-row items-center justify-between border-t border-neutral-50 pt-2.5 mb-3">
          <Text className="text-[10px] text-neutral-400 font-bold">
            📍 {update.location.areaName}
            {update.location.distanceKm != null && ` · ${update.location.distanceKm.toFixed(1)} km away`}
          </Text>
          <Text className="text-[9px] text-neutral-400 font-bold">🕐 {timeAgo}</Text>
        </View>

        {/* Trust Indicator panel */}
        <View className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 mb-3">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Community trust scoring</Text>
            <Text className={`text-[10px] font-black ${isVerified ? 'text-success-default' : 'text-warning-default'}`}>
              🛡️ {confidenceScore}% Confidence
            </Text>
          </View>
          <Text className="text-[10px] text-neutral-600 leading-relaxed font-semibold">
            {isVerified
              ? `Verified by ${verifiedCount} Local Residents & confirmed by ${confirmations} community members nearby.`
              : `Pending verification. Needs ${update.requiredConfirmations - confirmations} more confirmations from verified residents.`}
          </Text>
        </View>

        {/* Bottom Panel: Author Info */}
        <View className="flex-row items-center justify-between pt-2 border-t border-neutral-50">
          <Text className="text-[10px] text-neutral-400 font-bold">
            Alert posted by: <Text className="text-neutral-700 font-extrabold">{author.name}</Text>
          </Text>
          <ReputationBadge level={author.reputationLevel} size="sm" showLabel={false} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function getTimeUntil(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return 'expired';
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) return `in ${Math.floor(diffMs / 60000)}m`;
  if (diffHrs < 24) return `in ${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `in ${diffDays}d`;
}
