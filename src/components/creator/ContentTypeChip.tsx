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
        return { icon: '📖', label: 'Guide', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700' };
      case 'Update':
        return { icon: '📢', label: 'Update', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' };
      case 'Provider':
        return { icon: '📍', label: 'Provider', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' };
      case 'Marketplace':
        return { icon: '🛍️', label: 'Marketplace', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' };
      case 'Housing':
        return { icon: '🏠', label: 'Housing', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-700' };
      case 'Job':
        return { icon: '💼', label: 'Job', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' };
      case 'Event':
        return { icon: '🎉', label: 'Event', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700' };
      case 'Organization':
        return { icon: '🏛️', label: 'Organization', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' };
      default:
        return { icon: '📝', label: type, bg: 'bg-neutral-100 border-neutral-200', text: 'text-neutral-700' };
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
