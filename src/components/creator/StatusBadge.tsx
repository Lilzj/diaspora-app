import React from 'react';
import { View, Text } from 'react-native';
import { ContentStatus } from '@/types/creator';

interface StatusBadgeProps {
  status: ContentStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'Available':
      case 'Open':
      case 'Published':
      case 'Live':
        return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: '🟢' };

      case 'Reserved':
      case 'Interviewing':
      case 'Upcoming':
      case 'Pinned':
        return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', icon: '🟡' };

      case 'Sold':
      case 'Rented':
      case 'Filled':
      case 'Completed':
        return { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500', icon: '🔵' };

      case 'Paused':
      case 'Temporarily Closed':
      case 'Holiday Mode':
      case 'Unavailable':
        return { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500', icon: '⏸️' };

      case 'Archived':
      case 'Closed':
      case 'Expired':
      case 'Cancelled':
      case 'Hidden':
      case 'Deleted':
        return { bg: 'bg-surface-muted border-neutral-250', text: 'text-content-tertiary', dot: 'bg-neutral-400', icon: '📦' };

      case 'Draft':
        return { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', dot: 'bg-sky-500', icon: '✏️' };

      default:
        return { bg: 'bg-surface-muted border-subtle', text: 'text-content-secondary', dot: 'bg-neutral-400', icon: '⚪' };
    }
  };

  const style = getBadgeStyle();
  const textSize = size === 'sm' ? 'text-[9px]' : size === 'lg' ? 'text-xs' : 'text-[10px]';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : size === 'lg' ? 'px-3 py-1' : 'px-2 py-0.5';

  return (
    <View className={`flex-row items-center border rounded-full ${style.bg} ${padding}`}>
      <View className={`w-1.5 h-1.5 rounded-full ${style.dot} mr-1`} />
      <Text className={`${textSize} font-black ${style.text} tracking-tight uppercase`}>{status}</Text>
    </View>
  );
};
