import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { UnifiedContentItem } from '@/types/creator';
import { HEALTH_STATUS_LABEL } from '@/lib/creator/health';
import { analyticsRouteFor } from '@/lib/creator/editor-route';

interface InsightCardProps {
  item: UnifiedContentItem | null;
  visible: boolean;
  onClose: () => void;
}

/** Colour for a status, so 44% is not drawn in the green that means healthy. */
const STATUS_TEXT: Record<string, string> = {
  healthy: 'text-success-default',
  needs_attention: 'text-warning-default',
  expiring_soon: 'text-warning-default',
  action_required: 'text-error-default',
};

/**
 * One item's sheet in the Creator Studio workspace.
 *
 * It said only some of what it showed until 3 Nov 2026 (Android UAT): "↑ 18% vs
 * last week" and "High audience intent" were fixed text, the conversion rate
 * was `|| '84%'` on a field nothing sets, and each type panel swapped a real
 * 0 for a figure (`|| 89` helpful votes, `|| 7` applications). The views,
 * saves and messages it showed were the workspace's placeholder zeros for most
 * kinds of item. The sheet now opens the item's own analytics for those,
 * states the facts the item carries, and names its health in words.
 */
export const InsightCard: React.FC<InsightCardProps> = ({ item, visible, onClose }) => {
  // Before the early return: a hook after it ran on some renders and not
  // others, which React refuses when an item arrives after an empty render.
  const insets = useSafeAreaInsets();

  if (!item) return null;

  const analytics = analyticsRouteFor(item);
  const status = item.healthStatus ? HEALTH_STATUS_LABEL[item.healthStatus] : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-surface-card rounded-t-3xl p-6 max-h-[85%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-subtle rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-faint mb-4">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-black text-primary-500 uppercase tracking-wider">{item.contentType} Analytics</Text>
              <Text className="text-base font-black text-content-primary leading-snug" numberOfLines={1}>{item.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-surface-muted p-2 rounded-full">
              <Text className="text-xs font-black text-content-tertiary">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Where the real figures are: views, enquiries and saves, compared
                with the period before, on the item's own analytics screen. */}
            <View className="flex-row gap-2.5 mb-6">
              {analytics ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    router.push(analytics as never);
                  }}
                  className="flex-1 bg-surface-background border border-subtle p-3.5 rounded-2xl"
                >
                  <Text className="text-xs font-black text-content-primary">See full analytics</Text>
                  <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Views, enquiries and saves</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.7}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: '/(tabs)/messages',
                    params: { category: item.contentType },
                  });
                }}
                className="flex-1 bg-surface-background border border-subtle p-3.5 rounded-2xl"
              >
                <Text className="text-xs font-black text-content-primary">Messages →</Text>
                <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Enquiries about this item</Text>
              </TouchableOpacity>
            </View>

            {/* What the item itself carries. A row with nothing to say is left out. */}
            {item.contentType === 'Marketplace' && item.price ? (
              <Fact label="Asking price" value={item.price} />
            ) : null}
            {item.contentType === 'Housing' && item.price ? (
              <Fact label="Listed rent" value={item.price} />
            ) : null}
            {item.contentType === 'Job' && item.salaryRange ? (
              <Fact label="Salary range" value={item.salaryRange} />
            ) : null}
            {item.contentType === 'Guide' && typeof item.helpfulVotes === 'number' ? (
              <Fact label="Helpful votes" value={String(item.helpfulVotes)} />
            ) : null}

            {/* Health Score Panel */}
            {typeof item.healthScore === 'number' && status ? (
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-4 mt-2">
                <Text className="text-xs font-black text-content-primary uppercase tracking-wider mb-1">Content health</Text>
                <Text className={`text-xs font-black ${STATUS_TEXT[item.healthStatus ?? ''] ?? 'text-content-secondary'}`}>
                  {item.healthScore}% · {status}
                </Text>
                {(item.healthRecommendations ?? []).map((rec) => (
                  <View key={rec.id} className="mt-2.5">
                    <Text className="text-xs font-bold text-content-strong">💡 {rec.title}</Text>
                    {rec.description ? (
                      <Text className="text-[10px] text-content-faint mt-0.5">{rec.description}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center py-2.5 border-b border-faint">
      <Text className="text-xs text-content-secondary font-semibold">{label}</Text>
      <Text className="text-xs font-black text-content-primary">{value}</Text>
    </View>
  );
}
