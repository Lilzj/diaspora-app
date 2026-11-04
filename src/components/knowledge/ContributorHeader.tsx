import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

import { FollowButton } from '@/components/FollowButton';
import { usePublicCreatorByUser } from '@/hooks/creator-economy';
import { PublicReputationPanel } from '@/components/creator/ReputationPanel';
import { useFollowState } from '@/hooks/community-social';
import { useAuthStore } from '@/store/auth';

/**
 * Who a contributor is, and following them.
 *
 * Added 20 Oct 2026, from `GET /creators/by-user/{userId}` and
 * `GET /community/follows/{userId}`. The page used to say "Diaspora does not
 * have contributor profiles", and had no Follow button, so nobody could follow
 * anybody. A member with no creator profile still has guides; the header then
 * says only that.
 *
 * Since 20 Oct 2026 a creator's public reputation follows
 * (`GET /creators/{creatorId}/reputation`): level, the public dimensions, the
 * counts, earned badges with their source, and what the server withholds, with
 * its reason.
 */
export function ContributorHeader({ userId }: { userId: string }) {
  const { creator, isLoading } = usePublicCreatorByUser(userId);
  const followState = useFollowState(userId);
  const viewerId = useAuthStore((state) => state.user?.userId ?? null);
  const isSelf = viewerId !== null && viewerId.toLowerCase() === userId.toLowerCase();

  if (isLoading) {
    return (
      <View className="bg-surface-card px-6 py-6 border-b border-faint items-center">
        <ActivityIndicator />
      </View>
    );
  }

  const name = creator?.displayName ?? 'This member';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const followers = followState.data?.followerCount ?? creator?.followers ?? 0;

  return (
    <View className="bg-surface-card px-6 py-5 border-b border-faint">
      <View className="flex-row items-center">
        <View className="w-14 h-14 rounded-full bg-surface-muted items-center justify-center mr-4">
          <Text className="text-lg font-black text-primary-600">{initials || '?'}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg font-black text-content-primary" numberOfLines={1}>
            {name} {creator?.isVerifiedCreator ? '✓' : ''}
          </Text>
          {creator ? (
            <Text className="text-xs text-content-muted mt-0.5">
              {followers} {followers === 1 ? 'follower' : 'followers'} · {creator.contentPublished} published
            </Text>
          ) : null}
        </View>
        {/* Seeded from the server's answer and remounted when it arrives. */}
        {!isSelf && followState.data ? (
          <FollowButton
            key={String(followState.data.isFollowing)}
            userId={userId}
            isFollowing={followState.data.isFollowing}
            size="md"
          />
        ) : null}
      </View>

      {creator?.bio ? (
        <Text className="text-sm text-content-secondary mt-3 leading-relaxed">{creator.bio}</Text>
      ) : null}

      {creator && creator.expertise.length > 0 ? (
        <View className="flex-row flex-wrap mt-3">
          {creator.expertise.slice(0, 6).map((item) => (
            <View key={item} className="bg-surface-muted rounded-full px-3 py-1 mr-2 mb-2">
              <Text className="text-[11px] font-semibold text-content-secondary">{item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isSelf && followState.data ? (
        <Text className="text-[11px] text-content-faint mt-2">
          Follow to be told when {creator ? name.split(' ')[0] : 'they'} publish a new guide.
        </Text>
      ) : null}

      {creator ? (
        <View className="mt-4">
          <PublicReputationPanel creatorId={creator.creatorId} />
        </View>
      ) : null}
    </View>
  );
}
