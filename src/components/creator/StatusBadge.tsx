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
        return { bg: 'bg-surface-muted border-subtle', text: 'text-success-default', dot: 'bg-emerald-500', icon: '🟢' };

      case 'Reserved':
      case 'Interviewing':
      case 'Upcoming':
      case 'Pinned':
        return { bg: 'bg-surface-muted border-subtle', text: 'text-warning-default', dot: 'bg-amber-500', icon: '🟡' };

      case 'Sold':
      case 'Rented':
      case 'Filled':
      case 'Completed':
        return { bg: 'bg-surface-muted border-subtle', text: 'text-info-default', dot: 'bg-blue-500', icon: '🔵' };

      case 'Paused':
      case 'Temporarily Closed':
      case 'Holiday Mode':
      case 'Unavailable':
        return { bg: 'bg-surface-muted border-subtle', text: 'text-info-default', dot: 'bg-purple-500', icon: '⏸️' };

      case 'Archived':
      case 'Closed':
      case 'Expired':
      case 'Cancelled':
      case 'Hidden':
      case 'Deleted':
        return { bg: 'bg-surface-muted border-subtle', text: 'text-content-tertiary', dot: 'bg-content-faint', icon: '📦' };

      case 'Draft':
        return { bg: 'bg-surface-muted border-subtle', text: 'text-info-default', dot: 'bg-sky-500', icon: '✏️' };

      default:
        return { bg: 'bg-surface-muted border-subtle', text: 'text-content-secondary', dot: 'bg-content-faint', icon: '⚪' };
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
