import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { UnifiedContentItem } from '@/types/creator';
import { StatusBadge } from './StatusBadge';
import { ContentTypeChip } from './ContentTypeChip';
import { ContentHealthBadge } from './ContentHealthBadge';
import { ContentMetrics } from './ContentMetrics';

interface ContentCardProps {
  item: UnifiedContentItem;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpenQuickActions: (item: UnifiedContentItem) => void;
  onOpenHealthModal: (item: UnifiedContentItem) => void;
  onOpenComments: (item: UnifiedContentItem) => void;
  onCardPress?: (item: UnifiedContentItem) => void;
}

export const ContentCard: React.FC<ContentCardProps> = ({
  item,
  isMultiSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onOpenQuickActions,
  onOpenHealthModal,
  onOpenComments,
  onCardPress,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        if (isMultiSelectMode) {
          onToggleSelect?.(item.id);
        } else {
          onCardPress ? onCardPress(item) : onOpenQuickActions(item);
        }
      }}
      className={`bg-surface-card border rounded-3xl p-4 mb-3 shadow-sm ${
        isSelected ? 'border-primary-500 bg-primary-50/10' : 'border-subtle'
      }`}
    >
      <View className="flex-row items-start">
        {/* Checkbox in multi-select mode */}
        {isMultiSelectMode && (
          <TouchableOpacity
            onPress={() => onToggleSelect?.(item.id)}
            className={`w-6 h-6 rounded-lg mr-3 items-center justify-center border ${
              isSelected ? 'bg-primary-500 border-primary-500' : 'border-line bg-surface-card'
            }`}
          >
            {isSelected && <Text className="text-white text-xs font-black">✓</Text>}
          </TouchableOpacity>
        )}

        {/* Thumbnail Image */}
        {item.thumbnail ? (
          <Image
            source={{ uri: item.thumbnail }}
            className="w-16 h-16 rounded-2xl mr-3 bg-surface-muted"
            resizeMode="cover"
          />
        ) : (
          <View className="w-16 h-16 rounded-2xl mr-3 bg-surface-muted items-center justify-center">
            <Text className="text-2xl">📝</Text>
          </View>
        )}

        {/* Title & Core Details */}
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-1.5 mb-1">
            <ContentTypeChip type={item.contentType} size="sm" />
            <StatusBadge status={item.currentStatus} size="sm" />
            {item.performanceBadge && (
              <View className="bg-surface-inverse px-1.5 py-0.2 rounded-md">
                <Text className="text-[8px] font-black text-content-inverse uppercase">{item.performanceBadge}</Text>
              </View>
            )}
          </View>

          <Text className="text-sm font-bold text-content-primary leading-snug" numberOfLines={2}>
            {item.title}
          </Text>

          {/* Pricing or Salary if available */}
          {(item.price || item.salaryRange) && (
            <Text className="text-xs font-black text-primary-500 mt-0.5">
              {item.price || item.salaryRange}
            </Text>
          )}

          {/* Publishing Identity */}
          <View className="flex-row items-center mt-1.5">
            <Text className="text-[9px] text-content-faint font-semibold mr-1">Published as:</Text>
            <View className="bg-surface-muted px-1.5 py-0.2 rounded flex-row items-center">
              <Text className="text-[9px] font-bold text-content-secondary">{item.publishingIdentity.name}</Text>
              {item.publishingIdentity.verified && (
                <Text className="text-[8px] text-success-default font-black ml-0.5">✓</Text>
              )}
            </View>
          </View>
        </View>

        {/* Quick actions trigger */}
        <TouchableOpacity
          onPress={() => onOpenQuickActions(item)}
          className="p-1.5 bg-surface-background rounded-xl border border-subtle ml-1"
        >
          <Text className="text-content-muted font-black text-xs">•••</Text>
        </TouchableOpacity>
      </View>

      {/* Metrics Row */}
      <ContentMetrics item={item} />

      {/* Footer bar with Health score badge & Quick response button */}
      <View className="flex-row justify-between items-center mt-3 pt-2.5 border-t border-faint">
        {/* Content Health Indicator */}
        <ContentHealthBadge
          score={item.healthScore}
          status={item.healthStatus}
          recommendationCount={item.healthRecommendations.length}
          onPress={() => onOpenHealthModal(item)}
        />

        {/* Unread conversation trigger shortcut */}
        <TouchableOpacity
          onPress={() => onOpenComments(item)}
          className="bg-surface-background border border-subtle px-2.5 py-1 rounded-xl flex-row items-center"
        >
          <Text className="text-[9px] font-extrabold text-content-secondary">Manage Comments ({item.commentsCount})</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};
