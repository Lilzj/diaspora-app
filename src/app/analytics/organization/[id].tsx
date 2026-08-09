// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Organization analytics (Frontend Phase 15, §21 · §70)
//
// **Organization analytics already existed** in Phase 12 —
// `/community-life/dashboard/analytics` — with five real-shaped series: member
// growth, event attendance, donation totals, volunteer hours and poll
// participation. §2 says reuse rather than rebuild, so this screen does not
// replace it: `lib/analytics/adapters.ts` normalises those five into the shared
// model without a second fetch.
//
// What this adds is profile views, announcement reach, community reach,
// comparison and drill-down.
//
// ── The stock-versus-flow decision ───────────────────────────────────────────
//
// The adapter derives a headline figure per series, and how it does that is not
// uniform: `memberGrowth` is a running membership *level*, so the period figure
// is its last point; `eventAttendance` and `donationTotals` are *flows*, so they
// are summed. Summing a level would report thirty times the membership, which is
// the classic version of this error and the reason the distinction is stated per
// series rather than guessed from the name.
//
// Donation totals continue to come from B15's real giving contracts. §68 forbids
// duplicating wallet logic and none is duplicated.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { AnalyticsSection, SubjectDashboard } from '@/components/analytics';

export default function OrganizationAnalyticsScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SubjectDashboard
      subject={{ type: 'organization', id: id ?? null }}
      title="Organization"
      subtitle="Reach, events and members"
      breakdowns={['community', 'country', 'category']}
      gapDetail="Member growth, event attendance, donations, volunteer hours and poll participation come from the organization analytics projection built in an earlier phase. Profile views and announcement reach are not recorded at all yet."
    >
      <AnalyticsSection title="Related">
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border overflow-hidden"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the organization dashboard"
            onPress={() =>
              router.push({
                pathname: '/community-life/dashboard/analytics',
                params: { organizationId: id ?? '' },
              })
            }
            className="flex-row items-center px-4 py-3.5"
          >
            <Ionicons name="business-outline" size={17} color={tokens.color.text.secondary} />
            <View className="flex-1 mx-3">
              <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
                Organization dashboard
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-semibold mt-0.5"
              >
                Members, events, giving and volunteering
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </Pressable>
        </View>
      </AnalyticsSection>
    </SubjectDashboard>
  );
}
