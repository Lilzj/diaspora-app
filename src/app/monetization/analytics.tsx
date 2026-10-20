// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Premium analytics (Frontend Phase 6)
//
// §16's upsell, and §12's locked-feature experience applied to it.
//
// **The gate is real.** `analytics.advanced` is a live entitlement key on real
// plans in the certified catalogue, and the decision about whether this member
// has it comes from their actual subscription through `useEntitlements()`. The
// lock, the required plan, the price and the trial offer are all driven by real
// data.
//
// **What is behind the gate is real too**, since 20 Oct 2026:
// `GET /analytics/premium/summary` (MON-GAP-010) answers the member's own views,
// engagements, saves, enquiries and profile visits with their change, the
// breakdowns, the top items and a daily series. The server enforces the same
// gate — 403 `analytics.premium.not-entitled` without `analytics.advanced` — and
// that refusal is drawn as the upgrade state, not as an error. What the summary
// cannot produce (audience country and type are not recorded) arrives in
// `unavailable` and is listed with the server's reason, never filled in.
//
// The important rule is §12's last line, and it shapes the whole screen: the
// locked state shows the *shape* of the reports and their names, never the
// member's own figures obscured. `usePremiumAnalytics` is passed the entitlement
// decision and does not fire at all while it is false — premium data is never
// sent to a device that has not bought it and then hidden in the UI, because
// anything on the device is available to anybody with a debugger.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorView } from '@/components/financial';
import {
  LockedFeature,
  LockedPerformancePreview,
  MonetizationSection,
  renderMetric,
} from '@/components/monetization';
import { useEntitlement, usePromotions } from '@/hooks/monetization';
import { usePremiumAnalytics } from '@/hooks/monetization-gaps';
import { useMySubscription } from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { GATED_FEATURES } from '@/types/monetization';
import { useRefreshControl } from '@/hooks/usePullToRefresh';

const PREMIUM_KEY = 'analytics.advanced';

export default function AnalyticsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const decision = useEntitlement(PREMIUM_KEY);
  const subscriptionQuery = useMySubscription();
  const promotions = usePromotions('all');

  // Fired only when the entitlement resolves true. See the header.
  const premium = usePremiumAnalytics(decision.isAvailable);

  const handleUpgrade = useCallback(() => {
    router.push({
      pathname: '/monetization/plans',
      params: decision.requiredPlan ? { highlight: decision.requiredPlan.code } : {},
    });
  }, [decision.requiredPlan]);

  // The spinner used to be given a literal `false`, so the refetch ran but
  // the control snapped straight back and the pull read as inert.
  const refreshControl = useRefreshControl([promotions.refetch, premium.refetch]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Analytics" showBack />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        {/* The free tier. Real counts of the member's own promotions — not a
            performance metric, which is exactly why it survives the gate: it is
            a count of things they bought, which the platform genuinely knows. */}
        <MonetizationSection
          title="What you have running"
          subtitle="Free for everybody."
        >
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`You have ${promotions.counts.active} promotions running, ${promotions.counts.scheduled} scheduled and ${promotions.counts.ended} finished.`}
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="flex-row rounded-2xl border p-4"
          >
            {[
              { label: 'Running', value: promotions.counts.active },
              { label: 'Scheduled', value: promotions.counts.scheduled },
              { label: 'Finished', value: promotions.counts.ended },
            ].map((metric) => (
              <View key={metric.label} className="flex-1">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-widest"
                >
                  {metric.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-2xl font-black tracking-tight mt-0.5"
                >
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        </MonetizationSection>

        {/* The member's paid promotions: shown, tapped, actions and spend,
            from the advertising module's own rollup. Free to reach — it is the
            member's own spend, not the premium dataset. */}
        <MonetizationSection title="Go further">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Promotions analytics. What your promotions were shown, tapped and cost."
            onPress={() => router.push('/analytics/monetization')}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-2xl border p-4"
          >
            <Ionicons name="trending-up-outline" size={18} color={tokens.color.text.secondary} />
            <View className="flex-1 mx-3">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-bold"
              >
                Promotion performance
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-semibold mt-0.5"
              >
                Shown, tapped, actions and spend
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </Pressable>
        </MonetizationSection>

        {/* The gate. The server's refusal counts as much as the device's
            reading of the subscription: either one draws the upgrade state. */}
        {!decision.isAvailable || premium.notEntitled ? (
          <MonetizationSection title="Go deeper">
            <LockedFeature
              decision={decision}
              feature={GATED_FEATURES[PREMIUM_KEY]}
              subscription={subscriptionQuery.data ?? null}
              onUpgrade={handleUpgrade}
              onLearnMore={() => router.push('/monetization/plans')}
              preview={<LockedPerformancePreview />}
            />
          </MonetizationSection>
        ) : (
          <>
            {premium.isLoading ? (
              <View className="mt-5" accessible accessibilityLabel="Loading your analytics." style={{ gap: 10 }}>
                {[0, 1].map((index) => (
                  <View
                    key={index}
                    style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
                    className="rounded-2xl h-36"
                  />
                ))}
              </View>
            ) : premium.analytics ? (
              <View className="mt-6">
                <MonetizationSection
                  title="Headline"
                  subtitle={`${new Date(premium.analytics.periodStart).toLocaleDateString()} to ${new Date(
                    premium.analytics.periodEnd
                  ).toLocaleDateString()}`}
                >
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {premium.analytics.headline.map((metric) => (
                      <View
                        key={metric.key}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${metric.label}: ${renderMetric(metric, (money) =>
                          pricing.format(money)
                        )}. ${metric.definition}.`}
                        style={{
                          backgroundColor: tokens.color.surface.card,
                          borderColor: tokens.color.border.default,
                          flexBasis: '48%',
                          flexGrow: 1,
                        }}
                        className="rounded-2xl border p-3.5"
                      >
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[10px] font-black uppercase tracking-widest"
                        >
                          {metric.label}
                        </Text>
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-xl font-black tracking-tight mt-1"
                        >
                          {renderMetric(metric, (money) => pricing.format(money))}
                        </Text>
                      </View>
                    ))}
                  </View>
                </MonetizationSection>

                {premium.analytics.breakdowns.map((breakdown) => (
                  <MonetizationSection key={breakdown.dimension} title={breakdown.label}>
                    <View
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${breakdown.label}. ${breakdown.buckets
                        .map((bucket) => `${bucket.label}, ${Math.round(bucket.ratio * 100)} percent`)
                        .join('. ')}.`}
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: tokens.color.border.default,
                      }}
                      className="rounded-2xl border p-4"
                    >
                      {breakdown.buckets.map((bucket) => (
                        <View key={bucket.label} className="py-1.5">
                          <View className="flex-row items-center justify-between mb-1">
                            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold">
                              {bucket.label}
                            </Text>
                            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold">
                              {Math.round(bucket.ratio * 100)}%
                            </Text>
                          </View>
                          <View
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={{ backgroundColor: tokens.color.neutral[200] }}
                            className="h-1.5 rounded-full overflow-hidden"
                          >
                            <View
                              style={{
                                backgroundColor: tokens.color.primary[500],
                                width: `${Math.round(bucket.ratio * 100)}%`,
                              }}
                              className="h-full rounded-full"
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </MonetizationSection>
                ))}

                {premium.analytics.topSubjects.length > 0 ? (
                  <MonetizationSection title="Your best performing">
                    <View
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: tokens.color.border.default,
                      }}
                      className="rounded-2xl border overflow-hidden"
                    >
                      {premium.analytics.topSubjects.map((subject, index) => (
                        <View
                          key={`${subject.subjectType}-${subject.subjectId}`}
                          accessible
                          accessibilityRole="text"
                          accessibilityLabel={`${subject.title}. ${subject.views} views, ${subject.engagements} interactions.`}
                          style={{
                            borderTopColor: tokens.color.border.default,
                            borderTopWidth: index === 0 ? 0 : 1,
                          }}
                          className="flex-row items-center px-4 py-3.5"
                        >
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-sm font-black mr-3"
                          >
                            {index + 1}
                          </Text>
                          <View className="flex-1 mr-3">
                            <Text
                              style={{ color: tokens.color.text.primary }}
                              className="text-sm font-semibold"
                              numberOfLines={1}
                            >
                              {subject.title}
                            </Text>
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[11px] font-medium mt-0.5"
                            >
                              {subject.views.toLocaleString()} views ·{' '}
                              {subject.engagements.toLocaleString()} interactions
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={15} color={tokens.color.text.placeholder} />
                        </View>
                      ))}
                    </View>
                  </MonetizationSection>
                ) : null}

                {premium.analytics.unavailable.length > 0 ? (
                  <MonetizationSection title="Not recorded">
                    <View testID="premium-analytics-unavailable" style={{ gap: 8 }}>
                      {premium.analytics.unavailable.map((part) => (
                        <View
                          key={part.key}
                          accessible
                          accessibilityRole="text"
                          accessibilityLabel={`${part.label}: not recorded. ${part.reason}`}
                        >
                          <Text
                            style={{ color: tokens.color.text.secondary }}
                            className="text-[12px] font-semibold"
                          >
                            {part.label}
                          </Text>
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-medium leading-relaxed"
                          >
                            {part.reason}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </MonetizationSection>
                ) : null}
              </View>
            ) : premium.isError && premium.error ? (
              <View className="mt-5">
                <FinancialErrorView error={premium.error} onRetry={() => void premium.refetch()} />
              </View>
            ) : null}
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
