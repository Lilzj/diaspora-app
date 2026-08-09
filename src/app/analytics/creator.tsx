// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator analytics, extended (Frontend Phase 15, §15 · §66)
//
// **Creator analytics already existed.** `/creator/analytics` shipped in Phase 7
// with a period selector, served metric definitions, a trend chart and a
// cursor-paged content list, and it works. §2 says reuse rather than rebuild, so
// this screen does not replace it.
//
// What it adds is the dimensions Phase 7's shape had no room for: community and
// cross-community reach, country reach, comparison baselines, breakdowns by
// traffic source, and drill-down. Phase 7's own summary is normalised into the
// shared model by `lib/analytics/adapters.ts`, so both screens read the same
// figures from the same request and cannot disagree.
//
// The two are linked in both directions rather than one superseding the other:
// Phase 7's screen is the creator's daily view, this is the deeper one.
//
// ── Self-scoped by route design ──────────────────────────────────────────────
//
// The subject carries no id. There is deliberately no `/analytics/creators/{id}`
// in the register — a route that cannot name another creator cannot leak one,
// which is a stronger guarantee than a permission check and is why the security
// review has nothing to say about this screen.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { AnalyticsSection, SubjectDashboard } from '@/components/analytics';

export default function CreatorAnalyticsScreen() {
  const { tokens } = useTheme();

  return (
    <SubjectDashboard
      subject={{ type: 'creator', id: null }}
      title="Your content"
      subtitle="How your work is doing"
      breakdowns={['source', 'community', 'country', 'contentType']}
      gapDetail="Diaspora records no view, reach or engagement event yet, so the figures here come from a development adapter. Your revenue and rewards are real — they come from your actual wallet and are marked as such."
    >
      <AnalyticsSection title="Related">
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border overflow-hidden"
        >
          <RelatedRow
            icon="stats-chart-outline"
            label="Your creator dashboard"
            hint="The daily view, with your content list"
            onPress={() => router.push('/creator/analytics')}
          />
          <RelatedRow
            icon="cash-outline"
            label="Revenue"
            hint="What your work earned — real figures from your wallet"
            onPress={() => router.push('/creator/revenue')}
          />
          <RelatedRow
            icon="megaphone-outline"
            label="Sponsored content"
            hint="How your paid placements performed"
            onPress={() => router.push('/creator/sponsored')}
            isLast
          />
        </View>
      </AnalyticsSection>
    </SubjectDashboard>
  );
}

function RelatedRow({
  icon,
  label,
  hint,
  onPress,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
      onPress={onPress}
      style={{
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <Ionicons name={icon} size={17} color={tokens.color.text.secondary} />
      <View className="flex-1 mx-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
