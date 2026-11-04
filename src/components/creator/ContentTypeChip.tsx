import React from 'react';
import { View, Text } from 'react-native';
import { ContentType } from '@/types/creator';

interface ContentTypeChipProps {
  type: ContentType;
  size?: 'sm' | 'md';
}

export const ContentTypeChip: React.FC<ContentTypeChipProps> = ({ type, size = 'md' }) => {
  const getTypeMeta = () => {
    switch (type) {
      case 'Guide':
        return { icon: '📖', label: 'Guide', bg: 'bg-surface-muted border-subtle', text: 'text-warning-default' };
      case 'Update':
        return { icon: '📢', label: 'Update', bg: 'bg-surface-muted border-subtle', text: 'text-success-default' };
      case 'Provider':
        return { icon: '📍', label: 'Provider', bg: 'bg-surface-muted border-subtle', text: 'text-info-default' };
      case 'Marketplace':
        return { icon: '🛍️', label: 'Marketplace', bg: 'bg-surface-muted border-subtle', text: 'text-warning-default' };
      case 'Housing':
        return { icon: '🏠', label: 'Housing', bg: 'bg-surface-muted border-subtle', text: 'text-success-default' };
      case 'Job':
        return { icon: '💼', label: 'Job', bg: 'bg-surface-muted border-subtle', text: 'text-info-default' };
      case 'Event':
        return { icon: '🎉', label: 'Event', bg: 'bg-surface-muted border-subtle', text: 'text-info-default' };
      case 'Organization':
        return { icon: '🏛️', label: 'Organization', bg: 'bg-surface-muted border-subtle', text: 'text-error-default' };
      default:
        return { icon: '📝', label: type, bg: 'bg-surface-muted border-subtle', text: 'text-content-secondary' };
    }
  };

  const meta = getTypeMeta();
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';

  return (
    <View className={`flex-row items-center border rounded-lg ${meta.bg} ${padding}`}>
      <Text className="text-[10px] mr-1">{meta.icon}</Text>
      <Text className={`${textSize} font-black ${meta.text} uppercase tracking-wider`}>{meta.label}</Text>
    </View>
  );
};
