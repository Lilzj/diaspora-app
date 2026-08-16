// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Plans (Frontend Phase 6)
//
// §10: one plan surface serving all six audiences — business, organisation,
// creator, recruiter, landlord and marketplace seller — plus the personal tier.
// The audience is a filter on a single certified read, not six screens.
//
// `GET /subscriptions/plans` then `POST /subscriptions`. Prices come from the
// response; entitlements are rendered as capabilities, so a plan an operator
// adds tomorrow appears here without a client release.
//
// Subscribing is real and complete. **Changing** plan is not: only activate and
// cancel exist on the wire (MON-GAP-003), so somebody who already has a
// subscription is sent to the change screen, which is honest about being
// simulated, rather than being allowed to activate a second plan through a route
// that does not document what happens to the money already paid.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorInline,
  FinancialErrorView,
  PaymentConfirmButton,
} from '@/components/financial';
import {
  AudiencePicker,
  MonetizationEmpty,
  MonetizationSection,
  PlanCard,
  PlanComparisonTable,
} from '@/components/monetization';
import { useMonetizationPlans } from '@/hooks/monetization';
import { useActivateSubscription, useCanTransact, useMySubscription } from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import { audienceForKey, type SubscriptionAudienceKey } from '@/types/monetization';

export default function PlansScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const { showAlert, showToast } = useNotification();

  const params = useLocalSearchParams<{ audience?: string; highlight?: string }>();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [audienceKey, setAudienceKey] = useState<SubscriptionAudienceKey | null>(
    (audienceForKey(params.audience)?.key as SubscriptionAudienceKey | undefined) ?? null
  );
  const [selectedCode, setSelectedCode] = useState<string | null>(params.highlight ?? null);
  const [error, setError] = useState<FinancialError | null>(null);

  const { views, plans, comparison, availableAudiences, isLoading, isError, error: readError, refetch } =
    useMonetizationPlans(audienceKey ?? undefined);
  const subscriptionQuery = useMySubscription();
  const activate = useActivateSubscription();
  const { canTransact, blockedBy } = useCanTransact();

  const manageRefusal = useMemo(
    () => checkAccess(FinancialPermissions.SubscriptionsManage, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  // Default to the first audience that actually has plans, once they load. A
  // hard-coded default would open onto an empty tab in a deployment that has not
  // configured that audience.
  useEffect(() => {
    if (audienceKey || availableAudiences.length === 0) return;
    setAudienceKey(availableAudiences[0].key);
  }, [audienceKey, availableAudiences]);

  const selected = views.find((view) => view.plan.code === selectedCode) ?? null;
  const current = subscriptionQuery.data;

  /**
   * Subscribing from no plan. Real: `POST /subscriptions`.
   *
   * Somebody who already has a subscription never reaches this — they are sent
   * to the change screen instead, because activating a second plan is not a
   * documented upgrade path and the contract does not say what happens to the
   * period already paid for.
   */
  const handleSubscribe = useCallback(() => {
    if (!selected) return;

    const plan = selected.plan;
    const cycle = pricing.cycle(plan.interval);
    const trial = selected.canStartTrial ? pricing.trial(plan) : null;

    showAlert({
      type: 'question',
      title: trial ? `Start your ${plan.trialDays}-day trial?` : `Subscribe to ${plan.name}?`,
      message: trial
        ? trial.afterwards
        : `${pricing.format(plan.price)} ${cycle.phrase}, until you cancel. You can cancel any time and keep it until the end of the period you have paid for.`,
      buttons: [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setError(null);
            try {
              await activate.mutateAsync({
                planCode: plan.code,
                withTrial: selected.canStartTrial,
              });
              showToast({
                type: 'success',
                title: 'Plan started',
                message: `${plan.name} is active on your account.`,
              });
              router.replace('/monetization/subscription');
            } catch (cause) {
              setError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [selected, activate, pricing, showAlert, showToast]);

  const handleChangePlan = useCallback(() => {
    if (!selected || !current) return;
    router.push({
      pathname: '/monetization/change-plan',
      params: { planCode: selected.plan.code },
    });
  }, [selected, current]);

  if (isError && readError) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <ScreenHeader title="Plans" showBack />
        <FinancialErrorView error={readError} onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const audience = audienceKey ? audienceForKey(audienceKey) : null;
  const isChangingPlan = Boolean(current && selected && selected.plan.code !== current.planCode);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Plans" showBack />

      <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        {!manageRefusal.allowed ? (
          <View className="mb-5">
            <AccessGate refusal={manageRefusal} compact />
          </View>
        ) : null}

        {/* The audience picker. Only audiences with plans appear. */}
        {availableAudiences.length > 1 ? (
          <View className="mb-6">
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-black uppercase tracking-widest mb-2.5"
            >
              What are you using Diaspora for?
            </Text>
            <AudiencePicker
              audiences={availableAudiences}
              selected={audienceKey}
              onSelect={(key) => {
                setAudienceKey(key as SubscriptionAudienceKey);
                setSelectedCode(null);
              }}
            />
          </View>
        ) : null}

        {audience ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-medium leading-relaxed mb-5"
          >
            {audience.outcome}
          </Text>
        ) : null}

        {isLoading ? (
          <View accessible accessibilityLabel="Loading the plans." style={{ gap: 12 }}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.25 }}
                className="rounded-3xl h-52"
              />
            ))}
          </View>
        ) : views.length === 0 ? (
          <MonetizationEmpty
            icon="pricetags-outline"
            title="No plans here yet"
            message="Diaspora does not offer a plan for this in your country at the moment."
          />
        ) : (
          <>
            <View style={{ gap: 12 }}>
              {views.map((view) => (
                <PlanCard
                  key={view.plan.code}
                  view={view}
                  isSelected={selectedCode === view.plan.code}
                  onSelect={() => setSelectedCode(view.plan.code)}
                />
              ))}
            </View>

            {plans.length > 1 ? (
              <View className="mt-8">
                <MonetizationSection
                  title="Side by side"
                  subtitle="Everything the plans differ on."
                >
                  <PlanComparisonTable
                    plans={plans}
                    rows={comparison}
                    currentPlanCode={current?.planCode ?? null}
                    onSelectPlan={(plan) => setSelectedCode(plan.code)}
                  />
                </MonetizationSection>
              </View>
            ) : null}
          </>
        )}

        {error ? (
          <View className="mt-5">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}
      </ScrollEndScrollView>

      {selected && !selected.isCurrent && !selected.plan.isFree ? (
        <View
          style={{
            paddingBottom: insets.bottom + 12,
            borderTopColor: tokens.color.border.default,
            backgroundColor: tokens.color.surface.card,
          }}
          className="px-5 pt-4 border-t"
        >
          {isChangingPlan ? (
            // Changing plan goes through its own screen, which explains what it
            // costs today and when the new entitlements start.
            <TouchableOpacity
              onPress={handleChangePlan}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`See what moving to ${selected.plan.name} would cost`}
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="h-14 rounded-full items-center justify-center"
            >
              <Text style={{ color: '#FFFFFF' }} className="text-sm font-black tracking-tight">
                {selected.relativeToCurrent === 'downgrade' ? 'Move to' : 'Upgrade to'} {selected.plan.name}
              </Text>
            </TouchableOpacity>
          ) : (
            <PaymentConfirmButton
              label={
                selected.canStartTrial
                  ? `Start ${selected.plan.trialDays}-day trial`
                  : `Subscribe to ${selected.plan.name}`
              }
              amount={selected.canStartTrial ? null : selected.plan.price}
              onPress={handleSubscribe}
              isSubmitting={activate.isPending}
              disabled={!canTransact || !manageRefusal.allowed}
              disabledReason={
                blockedBy?.hint ??
                (!manageRefusal.allowed
                  ? 'Diaspora verification is needed before you can subscribe.'
                  : null)
              }
            />
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
