import React, { useState } from 'react';
import { View, Text, Animated, Pressable, TouchableOpacity, Share } from 'react-native';
import { router } from 'expo-router';
import type { GuideSummary } from '@/types/guide';
import type { AuthorSummary } from '@/types/social';
import { GuideQualityBadge } from './GuideQualityBadge';
import { AuthorExpertise } from './AuthorExpertise';
import { Image } from 'expo-image';
import { useSavedStore } from '@/store/saved';

interface GuideCardProps {
  guide: GuideSummary;
  author: AuthorSummary;
  variant?: 'featured' | 'list' | 'compact';
}

export function GuideCard({ guide, author, variant = 'list' }: GuideCardProps) {
  const scaleVal = React.useRef(new Animated.Value(1)).current;
  const { save, unsave, isSaved } = useSavedStore();
  const bookmarked = isSaved(guide.guideId);

  const handlePress = () => router.push(`/guide/${guide.guideId}`);

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

  const handleBookmarkToggle = (e: any) => {
    e.stopPropagation();
    if (bookmarked) {
      unsave(guide.guideId);
    } else {
      save(guide.guideId, 'Guide');
    }
  };

  const handleShare = (e: any) => {
    e.stopPropagation();
    Share.share({
      message: `Check out this helpful guide on Diaspora: "${guide.title}" by ${author.name}`,
      url: `https://diaspora.app/guide/${guide.guideId}`,
    }).catch(() => {});
  };

  const timeAgo = getRelativeTime(guide.lastUpdatedAt);
  const lastVerifiedStr = guide.lastVerifiedAt
    ? `Verified ${getRelativeTime(guide.lastVerifiedAt)}`
    : 'Not verified';

  if (variant === 'featured') {
    return (
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{ marginRight: 16 }}
      >
        <Animated.View
          style={{
            transform: [{ scale: scaleVal }],
            width: 280,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 12,
            elevation: 3,
            borderWidth: 1,
            borderColor: '#F3F4F6',
          }}
        >
          <View className="relative">
            {guide.coverImageUrl ? (
              <Image
                source={{ uri: guide.coverImageUrl }}
                style={{ width: '100%', height: 130 }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View className="w-full h-[130px] bg-neutral-100 items-center justify-center">
                <Text className="text-4xl">📖</Text>
              </View>
            )}
            {/* Floating Bookmark */}
            <TouchableOpacity
              onPress={handleBookmarkToggle}
              className="absolute top-2.5 right-2.5 w-8 h-8 bg-black/40 rounded-full items-center justify-center"
            >
              <Text className="text-white text-xs font-bold">{bookmarked ? '★' : '☆'}</Text>
            </TouchableOpacity>
          </View>
          <View className="p-4">
            <Text className="font-extrabold text-neutral-900 text-sm mb-1 leading-snug" numberOfLines={2}>
              {guide.title}
            </Text>

            <View className="flex-row items-center mb-3">
              <Text className="text-xs text-neutral-400 font-bold uppercase tracking-wider">{guide.country.flag} {guide.country.name}</Text>
              <Text className="text-neutral-300 mx-1">·</Text>
              <Text className="text-xs text-neutral-400 font-semibold">{guide.readingTimeMinutes}m read</Text>
            </View>

            <View className="border-t border-neutral-100 pt-3 flex-row items-center justify-between">
              <AuthorExpertise
                userId={author.userId}
                name={author.name}
                reputationLevel={author.reputationLevel}
                countryVerifications={author.primaryCountry ? [author.primaryCountry] : []}
                expertiseCategories={author.expertiseCategories}
                followerCount={author.followerCount}
                isFollowedByUser={author.isFollowedByUser}
                variant="inline"
              />
              <GuideQualityBadge label={guide.qualityLabel} size="sm" />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  if (variant === 'compact') {
    return (
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={{ transform: [{ scale: scaleVal }] }}
          className="flex-row items-center py-3.5 border-b border-neutral-100 bg-white px-4 my-1 rounded-xl"
        >
          <View className="flex-1 mr-2">
            <Text className="text-sm font-bold text-neutral-900 leading-snug" numberOfLines={1}>
              {guide.title}
            </Text>
            <Text className="text-xs text-neutral-500 mt-1 font-semibold">
              {guide.country.flag} · {guide.readingTimeMinutes} min read · 👍 {guide.helpfulCount}
            </Text>
          </View>
          <GuideQualityBadge label={guide.qualityLabel} size="sm" />
        </Animated.View>
      </Pressable>
    );
  }

  // Default List Variant
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
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 2,
          borderWidth: 1,
          borderColor: '#F3F4F6',
        }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center">
                <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                  {guide.category}
                </Text>
                <Text className="text-neutral-300 mx-1.5">·</Text>
                <Text className="text-xs text-neutral-400 font-bold">{guide.country.flag} {guide.country.name}</Text>
              </View>

              {/* Repositioned Quick Actions Row */}
              <View className="flex-row items-center gap-2">
                <TouchableOpacity onPress={handleBookmarkToggle} className="p-1 active:opacity-60">
                  <Text className="text-neutral-400 text-sm font-bold">{bookmarked ? '★' : '☆'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShare} className="p-1 active:opacity-60">
                  <Text className="text-neutral-400 text-sm">🔗</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text className="font-extrabold text-neutral-900 text-base mb-1.5 leading-snug" numberOfLines={2}>
              {guide.title}
            </Text>
            <Text className="text-xs text-neutral-500 mb-3" numberOfLines={2}>
              {guide.summary}
            </Text>
          </View>

          {/* Cover image as small square on the right side if available */}
          {guide.coverImageUrl && (
            <Image
              source={{ uri: guide.coverImageUrl }}
              style={{ width: 70, height: 70, borderRadius: 12 }}
              contentFit="cover"
            />
          )}
        </View>

        {/* Action button row (Bookmark, Share, Quality, Read Time) */}
        <View className="flex-row items-center justify-between border-t border-neutral-50 pt-3">
          <AuthorExpertise
            userId={author.userId}
            name={author.name}
            reputationLevel={author.reputationLevel}
            countryVerifications={author.primaryCountry ? [author.primaryCountry] : []}
            expertiseCategories={author.expertiseCategories}
            followerCount={author.followerCount}
            isFollowedByUser={author.isFollowedByUser}
            variant="inline"
          />

          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-neutral-400 font-bold mr-1">
              {guide.readingTimeMinutes}m read
            </Text>
            <GuideQualityBadge label={guide.qualityLabel} size="sm" />
          </View>
        </View>

        {/* Confidence Stats indicator & last verified row */}
        <View className="flex-row items-center flex-wrap gap-y-1 mt-3 pt-2 border-t border-neutral-50">
          <Text className="text-xs font-bold text-success-default bg-[#E6F4EA] px-2 py-0.5 rounded mr-2">
            🛡️ {lastVerifiedStr}
          </Text>
          <Text className="text-xs text-neutral-400 font-bold">
            👍 {guide.helpfulCount} helpful · 💬 {guide.commentCount} comments · Updated {timeAgo}
          </Text>
        </View>

      </Animated.View>
    </Pressable>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) return 'just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}
