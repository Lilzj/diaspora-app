import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface AIInsightCardProps {
  onActionClick?: (actionType: string) => void;
}

export const AIInsightCard: React.FC<AIInsightCardProps> = ({ onActionClick }) => {
  const insights = [
    {
      id: 'ai-1',
      icon: '📈',
      title: 'Your guide is gaining traction',
      description: 'Your NHS Registration guide received +42% more reads from newcomers moving to London this week.',
      actionText: 'View Impact →',
      actionType: 'impact',
      bg: 'bg-surface-muted border-subtle',
    },
    {
      id: 'ai-2',
      icon: '💬',
      title: 'Listing received no messages in 7 days',
      description: 'Your 2-Bedroom Woolwich apartment listing has had zero inquiries recently. Reducing price by 5% or adding bathroom photos improves engagement.',
      actionText: 'Apply Recommendation →',
      actionType: 'housing_fix',
      bg: 'bg-surface-muted border-subtle',
    },
    {
      id: 'ai-3',
      icon: '💡',
      title: 'Guide missing immigration resources',
      description: 'Readers are asking about 2026 visa extension requirements in the comments section.',
      actionText: 'Update Guide →',
      actionType: 'guide_update',
      bg: 'bg-surface-muted border-subtle',
    },
  ];

  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-5 mb-6 shadow-sm">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">
          ✨ Creator Assistant (AI Insights)
        </Text>
        <Text className="text-[9px] font-bold text-content-faint">REAL-TIME</Text>
      </View>

      <View className="space-y-3 gap-2.5">
        {insights.map((ins) => (
          <TouchableOpacity
            key={ins.id}
            onPress={() => onActionClick?.(ins.actionType)}
            className={`border rounded-2xl p-3.5 ${ins.bg}`}
          >
            <View className="flex-row items-center mb-1">
              <Text className="text-sm mr-2">{ins.icon}</Text>
              <Text className="text-xs font-black text-content-primary flex-1">{ins.title}</Text>
            </View>
            <Text className="text-[11px] text-content-tertiary leading-relaxed font-semibold mb-2">
              {ins.description}
            </Text>
            <Text className="text-[10px] font-black text-primary-500 uppercase">{ins.actionText}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};
