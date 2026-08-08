import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useFollowStore } from '@/store/follows';

interface FollowButtonProps {
  userId: string;
  isFollowing: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FollowButton({ userId, isFollowing: initialFollowing, size = 'sm', className = '' }: FollowButtonProps) {
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

  let paddingClass = 'px-3 py-1.5';
  let textSize = 'text-xs font-semibold';

  if (size === 'md') {
    paddingClass = 'px-4 py-2';
    textSize = 'text-sm font-semibold';
  } else if (size === 'lg') {
    paddingClass = 'h-12 px-6 justify-center items-center';
    textSize = 'text-xs font-black uppercase tracking-wider';
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      className={`rounded-full ${paddingClass} ${
        isFollowing ? 'bg-neutral-100 border border-neutral-300' : 'bg-primary-500'
      } ${className}`}
      activeOpacity={0.7}
      style={size === 'lg' ? { height: 48, justifyContent: 'center', alignItems: 'center' } : undefined}
    >
      <Text
        className={`${textSize} ${
          isFollowing ? 'text-neutral-700' : 'text-white'
        }`}
        style={size === 'lg' ? { textAlign: 'center', includeFontPadding: false } : undefined}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </TouchableOpacity>
  );
}
