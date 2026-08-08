// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — My promotions (Frontend Phase 6)
//
// §19: every monetized capability gets a management screen. This is the one for
// promotions, across all eight promotable entities.
//
// Real data throughout: `GET /placements/me` joined to `GET /purchases`, so each
// row can show what was actually paid rather than what the catalogue currently
// lists. Filtering happens on the client because the endpoint's `status`
// parameter narrows to one `PlacementStatus` and the tabs here are buckets —
// "ended" covers Expired, Cancelled and Refunded — so one request serves all
// four tabs and switching between them costs nothing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorView } from '@/components/financial';
import { MonetizationEmpty, PromotionRow } from '@/components/monetization';
import { usePromotions } from '@/hooks/monetization';
import type { PromotionFilter } from '@/types/monetization';

const FILTERS: { key: PromotionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Running' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'ended', label: 'Finished' },
];

export default function PromotionsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<PromotionFilter>('all');
  const { promotions, counts, isLoading, isError, error, refetch } = usePromotions(filter);

  const open = useCallback((placementId: string) => {
    router.push(`/monetization/promotions/${placementId}`);
  }, []);

  if (isError && error) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <ScreenHeader title="Your promotions" showBack />
        <FinancialErrorView error={error} onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Your promotions" showBack />

      {/* The filter bar. Counts sit on the chips so somebody can see there is
          something in "Scheduled" without opening it. */}
      <View
        style={{ borderBottomColor: tokens.color.border.default }}
        className="border-b"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}
        >
          {FILTERS.map((entry) => {
            const isSelected = filter === entry.key;
            const count = counts[entry.key];

            return (
              <TouchableOpacity
                key={entry.key}
                onPress={() => setFilter(entry.key)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${entry.label}, ${count} ${count === 1 ? 'promotion' : 'promotions'}`}
                style={{
                  backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                  borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                }}
                className="flex-row items-center rounded-full border px-3.5 py-2"
              >
                <Text
                  style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
                  className="text-xs font-black"
                >
                  {entry.label}
                </Text>
                {count > 0 ? (
                  <Text
                    style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.placeholder }}
                    className="text-xs font-bold ml-1.5"
                  >
                    {count}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refetch} tintColor={tokens.color.primary[500]} />
        }
      >
        {isLoading ? (
          <View accessible accessibilityLabel="Loading your promotions." style={{ gap: 10 }}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.25 }}
                className="rounded-2xl h-28"
              />
            ))}
          </View>
        ) : promotions.length === 0 ? (
          <MonetizationEmpty
            icon="megaphone-outline"
            title={filter === 'all' ? 'No promotions yet' : `Nothing ${FILTERS.find((entry) => entry.key === filter)?.label.toLowerCase()}`}
            message={
              filter === 'all'
                ? 'When you promote a listing, job, property or event it appears here so you can keep track of it.'
                : 'Try another tab, or promote something new.'
            }
            action={{
              label: 'See what you can promote',
              onPress: () => router.push('/monetization/promote'),
            }}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {promotions.map((promotion) => (
              <PromotionRow
                key={promotion.placementId}
                promotion={promotion}
                onPress={() => open(promotion.placementId)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
