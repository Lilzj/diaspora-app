// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community comparison (Frontend Phase 13, §30)
//
// §30's screen, with the constraint §29 and §30 jointly impose:
//
//     THE CLIENT COMPUTES NO WINNER.
//
// No highlighting of the largest value, no ordering by "best", no composite score,
// no recommendation. A bold number in the biggest column would be the frontend
// rendering an authoritative judgement about which community somebody should belong
// to, as typography — and it would be a judgement made from numbers the platform
// mostly cannot measure.
//
// So the table is a table. Bars are decorative and hidden from the accessibility
// tree; the numbers beside them are the content; every estimated figure is marked;
// and restricted metrics are absent from the comparison entirely, because three
// communities side by side make a suppressed cell obvious by subtraction (GAP-008).
//
// Capped at three. Not for layout — a fourth column fits — but because a comparison
// of five communities is a leaderboard, and a leaderboard of invented member counts
// is the thing §31 forbids.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityId, CommunityRef, StatisticsPeriod } from '@/types/community-directory';
import { useCommunityComparison, useCommunityContext } from '@/hooks/communities';
import { canonicalCommunityIds } from '@/lib/community/scope';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useBottomInset } from '@/components/layout/bottom-inset';
import {
  CommunityAvatar,
  CommunityComparisonTable,
  CommunitySelectorSheet,
  CommunityUnavailablePanel,
  MultiCommunityGapNotice,
  StatisticsPeriodSelector,
  communityOriginLabel,
} from '@/components/community-directory';

/** Three. See the header. */
const MAX_COMPARED = 3;

export default function CommunityCompareScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const context = useCommunityContext();

  const [selected, setSelected] = useState<CommunityId[]>(() =>
    // Seeds with the member's own communities, because comparing the two you
    // already belong to is the common case and pre-filling saves two taps.
    canonicalCommunityIds([
      context.primaryMembership?.communityId,
      ...context.interestedCommunityIds,
    ]).slice(0, 2)
  );

  const [period, setPeriod] = useState<StatisticsPeriod>('30d');
  const [pickerOpen, setPickerOpen] = useState(false);

  const comparison = useCommunityComparison(selected, period);

  React.useEffect(() => {
    if (selected.length >= 2) {
      trackCommunityEvent('community.comparison.viewed', {
        communityCount: selected.length,
        period,
      });
    }
  }, [period, selected.length]);

  const chosen = useMemo(
    () =>
      selected
        .map((id) => context.availableCommunities.find((ref) => ref.id === id))
        .filter((ref): ref is CommunityRef => Boolean(ref)),
    [context.availableCommunities, selected]
  );

  const add = useCallback((community: CommunityRef) => {
    setSelected((prev) =>
      prev.includes(community.id) || prev.length >= MAX_COMPARED
        ? prev
        : canonicalCommunityIds([...prev, community.id])
    );
    setPickerOpen(false);
  }, []);

  const remove = useCallback((id: CommunityId) => {
    setSelected((prev) => prev.filter((existing) => existing !== id));
  }, []);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>

        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-lg font-black"
          >
            Compare communities
          </Text>
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
            Up to {MAX_COMPARED}, side by side
          </Text>
        </View>
      </View>

      <ScrollEndScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}>
        {/* Chosen communities */}
        <View className="mb-4">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-2"
          >
            Comparing
          </Text>

          {chosen.map((ref) => (
            <View
              key={ref.id}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="flex-row items-center rounded-2xl border p-3 mb-2"
            >
              <CommunityAvatar community={ref} size={32} />
              <View className="flex-1 ml-2.5">
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                  {ref.name}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold"
                >
                  {communityOriginLabel(ref)}
                </Text>
              </View>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Remove ${ref.name} from the comparison`}
                onPress={() => remove(ref.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={19} color={tokens.color.text.placeholder} />
              </TouchableOpacity>
            </View>
          ))}

          {selected.length < MAX_COMPARED ? (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Add a community to the comparison"
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.8}
              style={{ borderColor: tokens.color.border.default }}
              className="flex-row items-center justify-center rounded-2xl border border-dashed p-3"
            >
              <Ionicons name="add" size={17} color={tokens.color.primary[600]} />
              <Text
                style={{ color: tokens.color.primary[600] }}
                className="text-xs font-bold ml-1.5"
              >
                Add a community
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Period */}
        {selected.length >= 2 ? (
          <View className="mb-4">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest mb-2"
            >
              Period
            </Text>
            <StatisticsPeriodSelector value={period} onChange={setPeriod} />
          </View>
        ) : null}

        {comparison.isSimulated && selected.length >= 2 ? (
          <View className="mb-4">
            <MultiCommunityGapNotice
              gapKey="communityComparison"
              detail="Nothing here ranks these communities, and nothing picks a winner — Diaspora has no basis for either. Content counts are real. Member, growth and engagement figures are development estimates and are marked as such in every column."
            />
          </View>
        ) : null}

        {selected.length < 2 ? (
          <CommunityUnavailablePanel
            reason="empty"
            subject="a comparison"
            detail="Choose at least two communities to compare."
          />
        ) : comparison.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject="the comparison" />
        ) : comparison.unavailable || comparison.isError ? (
          <CommunityUnavailablePanel
            reason={comparison.unavailable ?? 'error'}
            subject="the comparison"
            gapKey="communityComparison"
            onAction={() => void comparison.refetch()}
          />
        ) : comparison.data ? (
          <CommunityComparisonTable comparison={comparison.data} />
        ) : null}
      </ScrollEndScrollView>

      <CommunitySelectorSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add a community to compare"
        onSelect={add}
        selectedIds={selected}
      />
    </SafeAreaView>
  );
}
