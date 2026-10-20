// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promotions analytics (Frontend Phase 15, §31 · §67)
//
// What a member's paid promotions were shown, tapped and cost, over the period
// the platform reports.
//
// ── Where the figures come from ──────────────────────────────────────────────
//
// `GET /financial/placements/me/performance/summary` — the advertising module's
// own rollup of the caller's placements, read in every build through
// `usePerformanceSummary`. Impressions and taps are recorded when a promoted
// item is shown and tapped; conversions are what the platform attributes to a
// placement; spend is what the member paid.
//
// Until 20 Oct 2026 this screen was a Phase 15 dashboard of a `campaign`
// subject keyed by the member's user id, answered by the simulated
// `/analytics-gap/v0` adapter — so a release build showed nothing and a test
// build showed invented figures. `/analytics/campaigns/{id}` is not this: a
// `campaign` there is a fundraising campaign, and its giving is shown to the
// campaign's organisers on the campaign's own page.
//
// ── ROI is deliberately absent ───────────────────────────────────────────────
//
// §31 forbids fabricating ROI without attribution data. Nothing links a
// placement impression to the purchase that followed it, so the card is absent
// and the screen says why. A cost per result is shown only where the server
// computed one; with no results it is "no results yet", never zero.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FinancialErrorView } from '@/components/financial';
import { MonetizationSection } from '@/components/monetization';
import { useTheme } from '@/design-system';
import { usePerformanceSummary } from '@/hooks/monetization-gaps';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import { usePricing } from '@/providers/pricing-provider';

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

export default function PromotionsAnalyticsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const performance = usePerformanceSummary();
  const refreshControl = useRefreshControl([performance.refetch]);

  const summary = performance.summary;

  const body = !performance.isEnabled ? (
    <Text
      testID="promotions-analytics-unavailable"
      accessibilityRole="text"
      style={{ color: tokens.color.text.secondary }}
      className="text-sm font-semibold leading-relaxed"
    >
      Promotion performance is not available on this deployment.
    </Text>
  ) : performance.isLoading ? (
    <View accessible accessibilityLabel="Loading your promotion figures." style={{ gap: 10 }}>
      {[0, 1].map((index) => (
        <View
          key={index}
          style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
          className="rounded-2xl h-28"
        />
      ))}
    </View>
  ) : performance.isError && performance.error ? (
    <FinancialErrorView error={performance.error} onRetry={performance.refetch} />
  ) : summary ? (
    <>
      <MonetizationSection
        title="Your promotions"
        subtitle={`${formatDay(summary.periodStart)} to ${formatDay(summary.periodEnd)}`}
      >
        <View
          testID="promotions-analytics-totals"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Your promotions were shown ${summary.totalImpressions.toLocaleString()} times, tapped ${summary.totalClicks.toLocaleString()} times, led to ${summary.totalConversions.toLocaleString()} actions, and cost ${pricing.describe(summary.totalSpend)}.`}
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-4 flex-row flex-wrap"
        >
          {[
            { label: 'Shown', value: summary.totalImpressions.toLocaleString() },
            { label: 'Tapped', value: summary.totalClicks.toLocaleString() },
            { label: 'Actions', value: summary.totalConversions.toLocaleString() },
            { label: 'Spent', value: pricing.format(summary.totalSpend) },
          ].map((metric) => (
            <View key={metric.label} style={{ flexBasis: '50%' }} className="mb-3">
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest"
              >
                {metric.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xl font-black tracking-tight mt-0.5"
              >
                {metric.value}
              </Text>
            </View>
          ))}

          <View style={{ flexBasis: '100%' }}>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest"
            >
              Cost per result
            </Text>
            <Text
              testID="promotions-analytics-cost-per-result"
              style={{ color: tokens.color.text.primary }}
              className="text-base font-bold mt-0.5"
            >
              {summary.costPerResult ? pricing.format(summary.costPerResult) : 'No results yet'}
            </Text>
          </View>
        </View>
      </MonetizationSection>

      <MonetizationSection title="Not shown here">
        <Text
          accessibilityRole="text"
          style={{ color: tokens.color.text.secondary }}
          className="text-[12px] font-semibold leading-relaxed"
        >
          There is no return-on-investment figure. Diaspora does not link a purchase to the
          promotion that led to it, and a number estimated for that would look reasonable and be
          wrong.
        </Text>
      </MonetizationSection>

      <MonetizationSection title="Each promotion">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your campaigns. Each campaign's own figures, day by day."
          onPress={() => router.push('/monetization/campaigns')}
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="flex-row items-center rounded-2xl border p-4"
        >
          <Ionicons name="megaphone-outline" size={18} color={tokens.color.text.secondary} />
          <Text style={{ color: tokens.color.text.primary }} className="flex-1 mx-3 text-[13px] font-bold">
            Your campaigns, one at a time
          </Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
        </Pressable>
      </MonetizationSection>
    </>
  ) : null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Promotions" showBack />
      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        {body}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
