// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization home (Frontend Phase 6)
//
// §6's central business dashboard. Five concurrent reads, all certified:
// `/subscriptions/me`, `/subscriptions/plans`, `/placements/me`, `/purchases`
// and `/wallets/me/transactions`. Two more — the performance rollup and the
// recommendation rail — are gap-backed and marked as such.
//
// The ordering is by urgency rather than by product area, which is why an
// expiring promotion sits above the subscription card and a failed payment sits
// above both. B15 emits no `placement.expiring` event (MON-GAP-004), so this
// screen is the only warning a member gets before a promotion they paid for
// lapses; burying it under a plan comparison would waste the one chance.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { AccessGate, FinancialErrorView, StatusBadge } from '@/components/financial';
import {
  ExpiringPromotionCard,
  MonetizationEmpty,
  MonetizationRow,
  MonetizationSection,
  PromotionRow,
  SimulatedFigureBadge,
} from '@/components/monetization';
import { useMonetizationOverview, useEntitlements } from '@/hooks/monetization';
import { usePerformanceSummary, useMonetizationRecommendations } from '@/hooks/monetization-gaps';
import { usePricing } from '@/providers/pricing-provider';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { presentSubscriptionStatus, presentPurchaseStatus } from '@/lib/financial-status';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';
import type { Promotion } from '@/types/monetization';
import { useRefreshControl } from '@/hooks/usePullToRefresh';

export default function MonetizationHomeScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { overview, isLoading, isError, error, refetch, isFirstRun } = useMonetizationOverview();
  const entitlements = useEntitlements();
  const performance = usePerformanceSummary();
  const recommendations = useMonetizationRecommendations('dashboard');

  const readRefusal = useMemo(
    () => checkAccess(FinancialPermissions.WalletRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const openPromotion = useCallback((promotion: Promotion) => {
    router.push(`/monetization/promotions/${promotion.placementId}`);
  }, []);

  /**
   * Renewing means buying the product again, scheduled to start when the current
   * placement ends. There is no renew route (MON-GAP-004), so the flow goes
   * through the ordinary promote screen with the product pre-selected — which is
   * real, and which the review step describes accurately.
   */
  const renewPromotion = useCallback((promotion: Promotion) => {
    router.push({
      pathname: '/monetization/promote',
      params: {
        subjectType: String(promotion.subjectType),
        subjectId: promotion.subjectId,
        renewFrom: promotion.placementId,
        productCode: promotion.productCode,
      },
    });
  }, []);

  if (!readRefusal.allowed) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <ScreenHeader title="Grow" showBack />
        <AccessGate refusal={readRefusal} />
      </SafeAreaView>
    );
  }

  if (isError && error) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <ScreenHeader title="Grow" showBack />
        <FinancialErrorView error={error as FinancialError} onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const { subscription, promotions, expiring, pendingPurchases, recentCharges } = overview;
  const activePromotions = promotions.filter((promotion) => promotion.isActive);
  const subscriptionStatus = subscription ? presentSubscriptionStatus(subscription.status) : null;

  // The spinner used to be given a literal `false`, so the refetch ran but
  // the control snapped straight back and the pull read as inert.
  const refreshControl = useRefreshControl(refetch);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Grow" showBack />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        {/* 1 — Anything that needs attention now. */}
        {pendingPurchases.length > 0 ? (
          <View className="mb-5" style={{ gap: 8 }}>
            {pendingPurchases.map((purchase) => {
              const status = presentPurchaseStatus(purchase.status);
              return (
                <TouchableOpacity
                  key={purchase.purchaseId}
                  onPress={() =>
                    purchase.payment
                      ? router.push(`/wallet/payments/${purchase.payment.paymentIntentId}`)
                      : router.push('/wallet/purchases')
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`A payment for ${purchase.productCode} is still being confirmed. ${status.description}`}
                  style={{
                    backgroundColor: tokens.color.info.surface,
                    borderColor: `${tokens.color.info.default}33`,
                  }}
                  className="rounded-2xl border p-4"
                >
                  <StatusBadge status={status} size="sm" />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-bold leading-relaxed mt-2"
                  >
                    A payment is still being confirmed. We will let you know as soon as it clears.
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {expiring.length > 0 ? (
          <View className="mb-6" style={{ gap: 8 }}>
            {expiring.map((promotion) => (
              <ExpiringPromotionCard
                key={promotion.placementId}
                promotion={promotion}
                onRenew={() => renewPromotion(promotion)}
                onView={() => openPromotion(promotion)}
              />
            ))}
          </View>
        ) : null}

        {/* 2 — Where the member stands. */}
        <MonetizationSection
          title="Your plan"
          action={{ label: 'See plans', onPress: () => router.push('/monetization/plans') }}
        >
          <TouchableOpacity
            onPress={() => router.push('/monetization/subscription')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={
              subscription
                ? `You are on ${subscription.planCode}. ${subscriptionStatus?.description ?? ''} You have ${entitlements.entitlements.length} features included.`
                : 'You are on the free plan. Tap to see what a paid plan adds.'
            }
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-3xl border p-5"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-widest">
                  Current plan
                </Text>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-xl font-black tracking-tight mt-1"
                >
                  {subscription
                    ? (overview.plans.find((plan) => plan.code === subscription.planCode)?.name ??
                      subscription.planCode)
                    : 'Free'}
                </Text>

                {subscriptionStatus ? (
                  <View className="mt-2.5">
                    <StatusBadge status={subscriptionStatus} size="sm" />
                  </View>
                ) : (
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-medium leading-relaxed mt-1.5"
                  >
                    A paid plan adds reach, analytics and money off every promotion.
                  </Text>
                )}
              </View>

              <Ionicons name="chevron-forward" size={18} color={tokens.color.text.placeholder} />
            </View>

            {subscription?.currentPeriodEnd ? (
              <View
                style={{ borderTopColor: tokens.color.border.default }}
                className="flex-row items-center border-t mt-4 pt-3"
              >
                <Ionicons name="refresh-outline" size={13} color={tokens.color.text.placeholder} />
                <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold ml-1.5">
                  {subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </MonetizationSection>

        {/* 3 — What is running. */}
        <MonetizationSection
          title="Your promotions"
          subtitle={
            activePromotions.length > 0
              ? `${activePromotions.length} running right now.`
              : undefined
          }
          action={
            promotions.length > 0
              ? { label: 'See all', onPress: () => router.push('/monetization/promotions') }
              : undefined
          }
        >
          {isLoading ? (
            <View style={{ gap: 8 }}>
              {[0, 1].map((index) => (
                <View
                  key={index}
                  style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
                  className="rounded-2xl h-28"
                />
              ))}
            </View>
          ) : activePromotions.length === 0 ? (
            <MonetizationEmpty
              icon="megaphone-outline"
              title={isFirstRun ? 'Nothing promoted yet' : 'No promotions running'}
              message="Promote a listing, job, property or event from the item itself and it gets shown to more people nearby."
              action={{ label: 'See what you can promote', onPress: () => router.push('/monetization/promote') }}
            />
          ) : (
            <View style={{ gap: 8 }}>
              {activePromotions.slice(0, 3).map((promotion) => (
                <PromotionRow
                  key={promotion.placementId}
                  promotion={promotion}
                  onPress={() => openPromotion(promotion)}
                />
              ))}
            </View>
          )}
        </MonetizationSection>

        {/* 4 — Performance. Simulated, and marked. */}
        {performance.isEnabled && performance.summary ? (
          <MonetizationSection title="How it is going">
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`In the last period your promotions were shown ${performance.summary.totalImpressions.toLocaleString()} times, tapped ${performance.summary.totalClicks.toLocaleString()} times, and cost ${pricing.describe(performance.summary.totalSpend)}. These figures are simulated.`}
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
            >
              <View className="flex-row justify-between mb-3">
                {[
                  { label: 'Shown', value: performance.summary.totalImpressions.toLocaleString() },
                  { label: 'Tapped', value: performance.summary.totalClicks.toLocaleString() },
                  { label: 'Spent', value: pricing.format(performance.summary.totalSpend) },
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
                      className="text-lg font-black tracking-tight mt-0.5"
                    >
                      {metric.value}
                    </Text>
                  </View>
                ))}
              </View>

              <SimulatedFigureBadge label="Not real figures" />
            </View>
          </MonetizationSection>
        ) : null}

        {/* 5 — Recommendations. Simulated, and marked. */}
        {recommendations.isEnabled && recommendations.recommendations.length > 0 ? (
          <MonetizationSection title="Worth a look">
            <View style={{ gap: 8 }}>
              {recommendations.recommendations.slice(0, 2).map((recommendation) => (
                <TouchableOpacity
                  key={recommendation.recommendationId}
                  onPress={() => router.push(recommendation.route as never)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${recommendation.title}. ${recommendation.reason}. This suggestion is simulated.`}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                  }}
                  className="rounded-2xl border p-4"
                >
                  <View className="flex-row items-start">
                    <Ionicons
                      name="sparkles-outline"
                      size={17}
                      color={tokens.color.primary[500]}
                      style={{ marginRight: 10, marginTop: 1 }}
                    />
                    <View className="flex-1">
                      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
                        {recommendation.title}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-xs font-medium leading-relaxed mt-1"
                      >
                        {recommendation.reason}
                      </Text>
                      <View className="mt-2">
                        <SimulatedFigureBadge label="Suggestion simulated" />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </MonetizationSection>
        ) : null}

        {/* 6 — Everything else. */}
        <MonetizationSection title="Manage">
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border overflow-hidden"
          >
            <MonetizationRow
              icon="megaphone-outline"
              label="Promotions"
              hint="Everything you have promoted, running or finished."
              badge={promotions.length > 0 ? promotions.length : undefined}
              onPress={() => router.push('/monetization/promotions')}
            />
            <MonetizationRow
              icon="albums-outline"
              label="Advertising"
              hint="Campaigns across the whole platform."
              marker={recommendations.isEnabled ? 'Preview' : undefined}
              onPress={() => router.push('/monetization/campaigns')}
            />
            <MonetizationRow
              icon="stats-chart-outline"
              label="Analytics"
              hint="How your listings and promotions perform."
              onPress={() => router.push('/monetization/analytics')}
            />
            <MonetizationRow
              icon="key-outline"
              label="What your plan includes"
              hint="Your features and limits."
              badge={entitlements.entitlements.length > 0 ? entitlements.entitlements.length : undefined}
              onPress={() => router.push('/monetization/entitlements')}
            />
            <MonetizationRow
              icon="receipt-outline"
              label="Billing"
              hint="What you have been charged, and what is next."
              onPress={() => router.push('/monetization/billing')}
              isLast
            />
          </View>
        </MonetizationSection>

        {/* 7 — Recent charges, from real transactions. */}
        {recentCharges.length > 0 ? (
          <MonetizationSection
            title="Recent charges"
            action={{ label: 'All billing', onPress: () => router.push('/monetization/billing') }}
          >
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden"
            >
              {recentCharges.map((charge, index) => (
                <TouchableOpacity
                  key={charge.transactionId}
                  onPress={() => router.push(`/wallet/transactions/${charge.transactionId}`)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${charge.description}. ${pricing.describe(charge.amount)}. ${new Date(
                    charge.occurredAt
                  ).toLocaleDateString()}.`}
                  style={{
                    borderTopColor: tokens.color.border.default,
                    borderTopWidth: index === 0 ? 0 : 1,
                  }}
                  className="flex-row items-center px-4 py-3.5"
                >
                  <View className="flex-1 mr-3">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-sm font-semibold"
                      numberOfLines={1}
                    >
                      {charge.description}
                    </Text>
                    <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-0.5">
                      {new Date(charge.occurredAt).toLocaleDateString()}
                    </Text>
                  </View>

                  <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                    {pricing.format(charge.amount)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </MonetizationSection>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
