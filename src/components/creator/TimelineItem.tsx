import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CreatorTimelineEvent } from '@/types/creator';

interface TimelineItemProps {
  event: CreatorTimelineEvent;
  onPressContent?: (contentId: string) => void;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({ event, onPressContent }) => {
  const getEventMeta = () => {
    switch (event.type) {
      case 'published':
        return { icon: '📢', dotColor: 'bg-emerald-500', badgeColor: 'bg-surface-muted text-success-default' };
      case 'updated':
        return { icon: '✏️', dotColor: 'bg-blue-500', badgeColor: 'bg-surface-muted text-info-default' };
      case 'archived':
      case 'deleted':
        return { icon: '📦', dotColor: 'bg-content-muted', badgeColor: 'bg-surface-muted text-content-strong' };
      case 'status_changed':
        return { icon: '⚡', dotColor: 'bg-amber-500', badgeColor: 'bg-surface-muted text-warning-default' };
      case 'verification_earned':
        return { icon: '✓', dotColor: 'bg-success-default', badgeColor: 'bg-surface-muted text-success-default' };
      case 'milestone_achieved':
        return { icon: '🏆', dotColor: 'bg-primary-500', badgeColor: 'bg-surface-muted text-primary-600' };
      default:
        return { icon: '📝', dotColor: 'bg-purple-500', badgeColor: 'bg-surface-muted text-info-default' };
    }
  };

  const meta = getEventMeta();

  return (
    <View className="relative border-l border-subtle pl-4 py-2.5 mb-2">
      {/* Timeline Dot */}
      <View className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ${meta.dotColor}`} />

      <View className="bg-surface-card border border-subtle rounded-2xl p-3.5 shadow-sm">
        <View className="flex-row justify-between items-start">
          <View className="flex-row items-center flex-1 mr-2">
            <Text className="text-base mr-2">{meta.icon}</Text>
            <View className="flex-1">
              <Text className="text-xs font-black text-content-primary">{event.title}</Text>
              <Text className="text-[9px] text-content-faint font-semibold">{event.timestamp} · {event.identityName}</Text>
            </View>
          </View>

          {event.badge && (
            <View className={`px-2 py-0.5 rounded-full ${meta.badgeColor}`}>
              <Text className="text-[8px] font-black">{event.badge}</Text>
            </View>
          )}
        </View>

        <Text className="text-xs text-content-tertiary leading-relaxed mt-2">{event.description}</Text>

        {event.contentId && (
          <TouchableOpacity
            onPress={() => onPressContent?.(event.contentId!)}
            className="mt-2 pt-2 border-t border-faint flex-row items-center"
          >
            <Text className="text-[10px] font-extrabold text-primary-500">View Associated Item →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
