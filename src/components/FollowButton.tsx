import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useFollowStore } from '@/store/follows';

interface FollowButtonProps {
  userId: string;
  isFollowing: boolean;
  size?: 'sm' | 'md';
}

export function FollowButton({ userId, isFollowing: initialFollowing, size = 'sm' }: FollowButtonProps) {
  const follow = useFollowStore((s) => s.follow);
  const unfollow = useFollowStore((s) => s.unfollow);
  const isFollowing = useFollowStore((s) => s.followedUserIds.has(userId));

  const handlePress = () => {
    if (isFollowing) {
      unfollow(userId);
    } else {
      follow(userId);
    }
  };

  const paddingClass = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <TouchableOpacity
      onPress={handlePress}
      className={`rounded-full ${paddingClass} ${
        isFollowing ? 'bg-neutral-100 border border-neutral-300' : 'bg-primary-500'
      }`}
      activeOpacity={0.7}
    >
      <Text
        className={`${textSize} font-semibold ${
          isFollowing ? 'text-neutral-700' : 'text-white'
        }`}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </TouchableOpacity>
  );
}
