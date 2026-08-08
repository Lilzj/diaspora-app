// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Your subscription (Frontend Phase 6)
//
// §10's subscription status, usage, entitlements and lifecycle in one place, for
// whichever of the six audiences the member's plan belongs to.
//
// The state most easily got wrong is `GracePeriod`: the status is alarming and
// `grantsAccess` is still true, because a failed renewal is being retried and
// access continues while it is. A screen that read `status === 'Active'` would
// cut somebody off mid-month for a payment problem the platform is still working
// on. `effectiveEntitlements()` reads `grantsAccess`, and this screen explains
// the grace period rather than hiding it.
//
// Cancelling is real (`POST /subscriptions/{id}/cancel`) and never sends
// `immediately` — somebody who has paid for the month keeps the month.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorInline, FinancialErrorView, StatusBanner } from '@/components/financial';
import {
  EntitlementList,
  MonetizationEmpty,
  MonetizationRow,
  MonetizationSection,
  UsageMeter,
} from '@/components/monetization';
import { useEntitlements, useMonetizationPlans } from '@/hooks/monetization';
import { useCancelSubscription, useMySubscription } from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { presentSubscriptionStatus } from '@/lib/financial-status';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useNotification } from '@/providers/notification-provider';

export default function SubscriptionScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const { showAlert, showToast } = useNotification();

  const query = useMySubscription();
  const { plans } = useMonetizationPlans();
  const entitlements = useEntitlements();
  const cancel = useCancelSubscription();

  const [error, setError] = useState<FinancialError | null>(null);

  const subscription = query.data ?? null;
  const plan = useMemo(
    () => (subscription ? (plans.find((entry) => entry.code === subscription.planCode) ?? null) : null),
    [plans, subscription]
  );

  /**
   * Cancelling.
   *
   * `immediately` is never sent — the client always cancels at the period end,
   * which is what B15 does by default and what somebody who has paid for the
   * month is entitled to. The confirmation says the date, so nobody is surprised
   * by access continuing or by it stopping.
   */
  const handleCancel = useCallback(() => {
    if (!subscription) return;

    const endsOn = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
      : null;

    showAlert({
      type: 'warning',
      title: 'Cancel this plan?',
      message: endsOn
        ? `You keep everything on the plan until ${endsOn}, which is what you have already paid for. After that your account goes back to the free plan.`
        : 'Your account goes back to the free plan at the end of the period you have paid for.',
      buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            try {
              await cancel.mutateAsync({
                subscriptionId: subscription.subscriptionId,
                reason: 'MemberRequested',
              });
              showToast({
                type: 'success',
                title: 'Plan cancelled',
                message: endsOn ? `You keep it until ${endsOn}.` : 'It will not renew.',
              });
            } catch (cause) {
              setError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [subscription, cancel, showAlert, showToast]);

  if (query.isError && query.error) {
    return (
      <Shell>
        <FinancialErrorView error={query.error as FinancialError} onRetry={query.refetch} />
      </Shell>
    );
  }

  // No subscription is the free plan, not an error.
  if (!query.isLoading && !subscription) {
    return (
      <Shell>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
          <MonetizationEmpty
            icon="ribbon-outline"
            title="You are on the free plan"
            message="A paid plan adds more live listings, advanced analytics, money off every promotion and priority support."
            action={{ label: 'See what plans include', onPress: () => router.push('/monetization/plans') }}
          />

          <View className="mt-7">
            <MonetizationSection title="What you have now">
              <EntitlementList
                entitlements={entitlements.entitlements}
                emptyMessage="The free plan covers the basics: post listings, publish guides and message people about them."
              />
            </MonetizationSection>
          </View>
        </ScrollView>
      </Shell>
    );
  }

  const status = subscription ? presentSubscriptionStatus(subscription.status) : null;
  const cycle = subscription ? pricing.cycle(subscription.interval) : null;

  return (
    <Shell>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={query.refetch}
            tintColor={tokens.color.primary[500]}
          />
        }
      >
        {query.isLoading || !subscription ? (
          <View accessible accessibilityLabel="Loading your plan." style={{ gap: 12 }}>
            <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-3xl h-44" />
            <View style={{ backgroundColor: tokens.color.neutral[100], opacity: 0.6 }} className="rounded-2xl h-28" />
          </View>
        ) : (
          <>
            {/* A grace period, a trial ending or a cancellation pending are all
                things somebody needs to see before anything else on the screen. */}
            {subscription.status === 'GracePeriod' && subscription.graceEndsAt ? (
              <View className="mb-5">
                <StatusBanner
                  status={status!}
                  detail={`We could not take the last payment. You keep everything on the plan until ${new Date(
                    subscription.graceEndsAt
                  ).toLocaleDateString()} while we try again. Check the card or wallet you pay with.`}
                />
                <TouchableOpacity
                  onPress={() => router.push('/wallet/payments')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Check your payments"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="self-start mt-2.5 px-1"
                >
                  <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                    Check your payments
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={`This plan is set to end on ${new Date(
                  subscription.currentPeriodEnd
                ).toLocaleDateString()}. You keep everything until then.`}
                style={{ backgroundColor: tokens.color.warning.surface, borderColor: `${tokens.color.warning.default}44` }}
                className="rounded-2xl border p-4 mb-5"
              >
                <Text
                  style={{ color: tokens.color.warning.default }}
                  className="text-[10px] font-black uppercase tracking-widest mb-1"
                >
                  Ending
                </Text>
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
                  This plan will not renew. You keep everything on it until{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                </Text>
              </View>
            ) : null}

            {/* The plan itself. */}
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={[
                `You are on ${plan?.name ?? subscription.planCode}.`,
                status?.description,
                plan && !plan.isFree ? `${pricing.describe(plan.price)} ${cycle?.phrase}.` : null,
                subscription.currentPeriodEnd
                  ? `${subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}.`
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-3xl border p-5"
            >
              <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-widest">
                Your plan
              </Text>
              <Text style={{ color: tokens.color.text.primary }} className="text-2xl font-black tracking-tight mt-1">
                {plan?.name ?? subscription.planCode}
              </Text>

              {plan && !plan.isFree && cycle ? (
                <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold mt-1">
                  {pricing.format(plan.price)} {cycle.phrase}
                </Text>
              ) : null}

              <View
                style={{ borderTopColor: tokens.color.border.default }}
                className="border-t mt-4 pt-3.5"
              >
                <Row label="Status" value={status?.label ?? subscription.status} />
                <Row
                  label="Started"
                  value={new Date(subscription.currentPeriodStart).toLocaleDateString()}
                />
                <Row
                  label={subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}
                  value={
                    subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : 'Never — this is a one-off'
                  }
                />
                {subscription.trialEndsAt ? (
                  <Row
                    label="Trial ends"
                    value={new Date(subscription.trialEndsAt).toLocaleDateString()}
                  />
                ) : null}
                {subscription.renewalCount > 0 ? (
                  <Row label="Renewed" value={`${subscription.renewalCount} times`} />
                ) : null}
              </View>
            </View>

            {/* Limits and how much of them is used. Ceiling real, usage not. */}
            {entitlements.limits.length > 0 ? (
              <View className="mt-7">
                <MonetizationSection
                  title="Your limits"
                  subtitle="What your plan allows."
                >
                  <View style={{ gap: 8 }}>
                    {entitlements.limits.map((limit) => (
                      <UsageMeter
                        key={limit.key}
                        usage={limit}
                        isSimulated={limit.consumed !== null}
                      />
                    ))}
                  </View>
                </MonetizationSection>
              </View>
            ) : null}

            <View className="mt-2">
              <MonetizationSection
                title="What is included"
                action={{ label: 'All features', onPress: () => router.push('/monetization/entitlements') }}
              >
                <EntitlementList entitlements={entitlements.entitlements} />
              </MonetizationSection>
            </View>

            <MonetizationSection title="Manage">
              <View
                style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                className="rounded-2xl border overflow-hidden"
              >
                <MonetizationRow
                  icon="swap-horizontal-outline"
                  label="Change plan"
                  hint="Move up or down a tier."
                  marker="Preview"
                  onPress={() => router.push('/monetization/change-plan')}
                />
                <MonetizationRow
                  icon="receipt-outline"
                  label="Billing"
                  hint="What you have been charged."
                  onPress={() => router.push('/monetization/billing')}
                />
                <MonetizationRow
                  icon="pricetags-outline"
                  label="Compare plans"
                  hint="See every plan side by side."
                  onPress={() => router.push('/monetization/plans')}
                  isLast
                />
              </View>

              {!subscription.cancelAtPeriodEnd ? (
                <TouchableOpacity
                  onPress={handleCancel}
                  disabled={cancel.isPending}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel this plan"
                  accessibilityHint="You keep everything on it until the end of the period you have paid for."
                  accessibilityState={{ disabled: cancel.isPending, busy: cancel.isPending }}
                  style={{ borderColor: `${tokens.color.error.default}44`, opacity: cancel.isPending ? 0.6 : 1 }}
                  className="flex-row items-center justify-center rounded-2xl border py-3.5 mt-3"
                >
                  <Ionicons name="close-circle-outline" size={17} color={tokens.color.error.default} />
                  <Text style={{ color: tokens.color.error.default }} className="text-sm font-bold ml-2">
                    Cancel plan
                  </Text>
                </TouchableOpacity>
              ) : null}

              {error ? (
                <View className="mt-3">
                  <FinancialErrorInline error={error} />
                </View>
              ) : null}
            </MonetizationSection>
          </>
        )}
      </ScrollView>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Your plan" showBack />
      {children}
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row items-center justify-between py-1.5"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
        {label}
      </Text>
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
        {value}
      </Text>
    </View>
  );
}
