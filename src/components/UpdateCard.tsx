import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, Animated, Pressable, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import type { UpdateSummary } from '@/types/update';
import type { AuthorSummary } from '@/types/social';
import { UPDATE_CATEGORY_ICONS } from '@/types/update';
import { ReputationBadge } from './ReputationBadge';
import { useTrustStore } from '@/store/trust';
import { useReputationStore } from '@/store/reputation';
import { useThemeTokens } from '@/design-system';

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
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const trustStore = useTrustStore();
  const repStore = useReputationStore();
  const scaleVal = React.useRef(new Animated.Value(1)).current;

  const [confirmations, setConfirmations] = useState(update.confirmationCount || 0);
  const [verifiedCount, setVerifiedCount] = useState(update.verifiedResidentConfirmationCount || 0);
  const [hasVoted, setHasVoted] = useState(false);

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

  const handleVerifyAlert = (e: any) => {
    e.stopPropagation(); // prevent card tap push
    if (hasVoted) return;

    trustStore.verifyCommunityUpdate(update.updateId);
    setConfirmations(confirmations + 1);
    setVerifiedCount(verifiedCount + 1);
    setHasVoted(true);

    showAlert({ type: 'success', title: 'Verification Recorded', message: 'Thank you! Your verification vote has been cast. The community confidence score for this alert has increased.', buttons: [{ text: 'OK' }] });
  };

  const timeAgo = getRelativeTime(update.publishedAt);
  const expiresIn = getTimeUntil(update.expiresAt);
  const categoryIcon = UPDATE_CATEGORY_ICONS[update.category];
  const urgencyStyle = ACCESSIBLE_URGENCY_STYLES[update.urgency];

  const userRepLevel = repStore.reputation?.level;
  const isTrustedContributor =
    userRepLevel === 'TrustedContributor' ||
    userRepLevel === 'CommunityExpert' ||
    userRepLevel === 'CommunityAmbassador';

  const isVerified = update.verificationStatus === 'CommunityVerified' || hasVoted;

  // Recalculate confidence score
  const baseScore = 65;
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
          backgroundColor: tokens.color.surface.card,
          borderRadius: 20,
          padding: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 4,
          elevation: 1,
          borderWidth: 1,
          borderColor: tokens.color.neutral[100],
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
              className="text-xs font-extrabold tracking-wider"
            >
              {urgencyStyle.label}
            </Text>
          </View>
          <Text className="text-xs text-content-faint font-extrabold">
            Expires {expiresIn}
          </Text>
        </View>

        {/* Title & Category Icon */}
        <View className="flex-row items-center mb-1.5">
          <Text className="text-lg mr-2">{categoryIcon}</Text>
          <Text className="font-extrabold text-content-primary text-base flex-1 leading-snug" numberOfLines={1}>
            {update.title}
          </Text>
        </View>

        {/* Description */}
        <Text className="text-sm text-content-muted mb-3 leading-relaxed" numberOfLines={2}>
          {update.description}
        </Text>

        {/* Location & Time */}
        <View className="flex-row items-center justify-between border-t border-faint pt-2.5 mb-3">
          <Text className="text-xs text-content-faint font-bold">
            📍 {update.location.areaName}
            {update.location.distanceKm != null && ` · ${update.location.distanceKm.toFixed(1)} km away`}
          </Text>
          <Text className="text-xs text-content-muted font-bold">🕐 {timeAgo}</Text>
        </View>

        {/* Trust Indicator panel */}
        <View className="bg-surface-background rounded-xl p-3 border border-faint mb-3">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-wider">Community trust scoring</Text>
            <Text className={`text-xs font-black ${isVerified ? 'text-success-default' : 'text-warning-default'}`}>
              🛡️ {confidenceScore}% Confidence
            </Text>
          </View>
          <Text className="text-xs text-content-tertiary leading-relaxed font-semibold mb-2">
            {isVerified
              ? `Verified by ${verifiedCount} Local Residents & confirmed by ${confirmations} community members nearby.`
              : `Pending verification. Needs ${update.requiredConfirmations - confirmations} more confirmations from verified residents.`}
          </Text>

          {/* Trusted Contributor Voting Action */}
          {isTrustedContributor && (
            <TouchableOpacity
              onPress={handleVerifyAlert}
              disabled={hasVoted}
              className={`py-2 rounded-xl border items-center justify-center ${
                hasVoted ? 'bg-success-surface border-success-default' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-xs font-extrabold uppercase ${hasVoted ? 'text-success-default' : 'text-content-secondary'}`}>
                {hasVoted ? '✓ Alert Confirmed' : '🗳️ Confirm Alert Correctness'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom Panel: Author Info */}
        <View className="flex-row items-center justify-between pt-2 border-t border-faint">
          <Text className="text-xs text-content-faint font-bold">
            Alert posted by: <Text className="text-content-secondary font-extrabold">{author.name}</Text>
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
