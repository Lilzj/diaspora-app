import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { HealthStatusLevel } from '@/types/creator';

interface ContentHealthBadgeProps {
  /**
   * Both optional, because **nothing on the platform computes content health.**
   *
   * Every score this badge has ever drawn came from `mocks/creator-data.ts`. The
   * real workspace fan-out returns rows with no score at all, and the honest
   * rendering of "no score" is a badge that says so — not a 0% in rose, which
   * reads as "your listing is failing".
   */
  score?: number;
  status?: HealthStatusLevel;
  recommendationCount?: number;
  onPress?: () => void;
  showDetails?: boolean;
}

export const ContentHealthBadge: React.FC<ContentHealthBadgeProps> = ({
  score,
  status,
  recommendationCount = 0,
  onPress,
  showDetails = true,
}) => {
  const getStatusConfig = (level: HealthStatusLevel) => {
    switch (level) {
      case 'healthy':
        return {
          icon: '🟢',
          label: 'Healthy',
          bg: 'bg-emerald-50 border-emerald-200',
          text: 'text-emerald-800',
          badgeText: 'text-emerald-700 bg-emerald-100',
        };
      case 'needs_attention':
        return {
          icon: '🟡',
          label: 'Needs Attention',
          bg: 'bg-amber-50 border-amber-200',
          text: 'text-amber-800',
          badgeText: 'text-amber-700 bg-amber-100',
        };
      case 'expiring_soon':
        return {
          icon: '🟠',
          label: 'Expiring Soon',
          bg: 'bg-orange-50 border-orange-200',
          text: 'text-orange-800',
          badgeText: 'text-orange-700 bg-orange-100',
        };
      case 'action_required':
        return {
          icon: '🔴',
          label: 'Action Required',
          bg: 'bg-rose-50 border-rose-200',
          text: 'text-rose-800',
          badgeText: 'text-rose-700 bg-rose-100',
        };
    }
  };

  // Not measured is a state, not a zero. Rendered in the neutral palette so it
  // does not read as a verdict, and it is not pressable: there is no health
  // detail to open.
  if (status === undefined || score === undefined) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel="Content health is not measured on this platform."
        className="flex-row items-center border rounded-xl px-2.5 py-1 bg-surface-muted border-subtle"
      >
        <Text className="text-[10px] font-black text-content-tertiary uppercase tracking-tight">
          Health not measured
        </Text>
      </View>
    );
  }

  const config = getStatusConfig(status);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-center border rounded-xl px-2.5 py-1 ${config.bg}`}
    >
      <Text className="text-xs mr-1">{config.icon}</Text>
      <Text className={`text-[10px] font-black ${config.text} uppercase tracking-tight`}>
        {config.label}
      </Text>
      <View className={`ml-1.5 px-1.5 py-0.2 rounded-full ${config.badgeText}`}>
        <Text className="text-[9px] font-extrabold">{score}%</Text>
      </View>
      {recommendationCount > 0 && showDetails && (
        <View className="ml-1.5 bg-surface-inverse px-1.5 py-0.2 rounded-full">
          <Text className="text-[8px] font-black text-content-inverse">{recommendationCount} AI Tip</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
