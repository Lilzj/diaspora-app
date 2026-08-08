// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Change plan (Frontend Phase 6)
//
// ⚠ SIMULATED. MON-GAP-003. ⚠
//
// Only activate and cancel exist on the certified wire. There is no plan-change
// route, no proration policy, and nothing in the contract that says what happens
// to money already paid for the current period. So the whole flow is built —
// comparison, preview, what is credited, when the new entitlements start, the
// downgrade warning, confirmation — against the development adapter.
//
// The preview figures are **asked for**, not computed, even in simulation. That
// is deliberate: a client that multiplies a plan price by the remaining fraction
// of a period is a client pricing money, and building the mock the easy way now
// would mean rewriting this screen when the real contract lands. The request
// shape here is the request shape the backend should implement.
//
// What is real on this screen: the plan catalogue, the current subscription, the
// entitlement diff, and the cancellation path offered as the honest alternative.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorInline, FinancialErrorView, PaymentConfirmButton } from '@/components/financial';
import {
  LabelledPrice,
  MonetizationEmpty,
  MonetizationGapNotice,
  MonetizationSection,
  PlanCard,
} from '@/components/monetization';
import { useMonetizationPlans } from '@/hooks/monetization';
import { useChangePlan, usePlanChangePreview, useMonetizationGapsEnabled } from '@/hooks/monetization-gaps';
import { useCanTransact, useMySubscription } from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { describeEntitlement } from '@/lib/entitlements';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useNotification } from '@/providers/notification-provider';

export default function ChangePlanScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const { showAlert, showToast } = useNotification();

  const params = useLocalSearchParams<{ planCode?: string }>();

  const subscriptionQuery = useMySubscription();
  const { views, isLoading, isError, error: readError, refetch } = useMonetizationPlans();
  const gapsEnabled = useMonetizationGapsEnabled();

  const [selectedCode, setSelectedCode] = useState<string | null>(params.planCode ?? null);
  const [error, setError] = useState<FinancialError | null>(null);

  const subscription = subscriptionQuery.data ?? null;
  const preview = usePlanChangePreview(subscription?.subscriptionId, selectedCode);
  const change = useChangePlan();
  const { canTransact, blockedBy } = useCanTransact();

  // The current plan is not a destination, and neither is a free plan — moving
  // to free is a cancellation, and it has its own route and its own semantics.
  const choices = useMemo(
    () => views.filter((view) => !view.isCurrent && !view.plan.isFree),
    [views]
  );

  const selected = choices.find((view) => view.plan.code === selectedCode) ?? null;

  const handleConfirm = useCallback(() => {
    if (!selected || !subscription || !preview.preview) return;

    const detail = preview.preview;

    showAlert({
      type: 'question',
      title: `Move to ${selected.plan.name}?`,
      message: [
        detail.dueNow.minorUnits > 0
          ? `You pay ${pricing.format(detail.dueNow)} today.`
          : 'There is nothing to pay today.',
        detail.proratedCredit.minorUnits > 0
          ? `${pricing.format(detail.proratedCredit)} of your current plan is credited against it.`
          : null,
        `From ${new Date(detail.effectiveAt).toLocaleDateString()} you are on ${selected.plan.name}.`,
        detail.lostEntitlementKeys.length > 0
          ? `You would lose: ${detail.lostEntitlementKeys
              .map((key) => describeEntitlement(key).label)
              .join(', ')}.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      buttons: [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setError(null);
            try {
              await change.mutateAsync({
                subscriptionId: subscription.subscriptionId,
                planCode: selected.plan.code,
              });
              showToast({
                type: 'success',
                title: 'Plan changed',
                message: `You are on ${selected.plan.name}.`,
              });
              router.replace('/monetization/subscription');
            } catch (cause) {
              setError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [selected, subscription, preview.preview, change, pricing, showAlert, showToast]);

  if (isError && readError) {
    return (
      <Shell>
        <FinancialErrorView error={readError} onRetry={refetch} />
      </Shell>
    );
  }

  // Nothing to change from. Subscribing is a different flow with a real backend
  // behind it, so send them there rather than showing an empty change screen.
  if (!subscriptionQuery.isLoading && !subscription) {
    return (
      <Shell>
        <View className="p-5">
          <MonetizationEmpty
            icon="swap-horizontal-outline"
            title="Nothing to change yet"
            message="You are on the free plan. Start a paid plan first, and you can move between tiers from here."
            action={{ label: 'See plans', onPress: () => router.replace('/monetization/plans') }}
          />
        </View>
      </Shell>
    );
  }

  const detail = preview.preview;

  return (
    <Shell>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <MonetizationGapNotice gapKey="planChange" />

        <View className="mt-5">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-medium leading-relaxed mb-5"
          >
            Moving up takes effect straight away and you pay the difference for the rest of this period.
            Moving down takes effect when the period you have already paid for ends.
          </Text>

          {isLoading ? (
            <View accessible accessibilityLabel="Loading the plans." style={{ gap: 12 }}>
              {[0, 1].map((index) => (
                <View
                  key={index}
                  style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
                  className="rounded-3xl h-52"
                />
              ))}
            </View>
          ) : choices.length === 0 ? (
            <MonetizationEmpty
              icon="checkmark-circle-outline"
              title="You are on the only paid plan"
              message="There is nothing to move to at the moment. You can cancel from your plan screen if you no longer need it."
              action={{
                label: 'Your plan',
                onPress: () => router.replace('/monetization/subscription'),
              }}
            />
          ) : (
            <View style={{ gap: 12 }}>
              {choices.map((view) => (
                <PlanCard
                  key={view.plan.code}
                  view={view}
                  isSelected={selectedCode === view.plan.code}
                  onSelect={() => setSelectedCode(view.plan.code)}
                />
              ))}
            </View>
          )}
        </View>

        {/* The preview. Every figure asked for, none computed here. */}
        {selected && gapsEnabled ? (
          <View className="mt-8">
            <MonetizationSection title="What it costs to move">
              {preview.isLoading ? (
                <View
                  accessible
                  accessibilityLabel="Working out what the change costs."
                  style={{ backgroundColor: tokens.color.neutral[100] }}
                  className="rounded-2xl h-32"
                />
              ) : !detail ? (
                <MonetizationGapNotice gapKey="planChange" compact />
              ) : !detail.isPermitted ? (
                <View
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={detail.refusalMessage ?? 'This change is not possible at the moment.'}
                  style={{ backgroundColor: tokens.color.warning.surface }}
                  className="rounded-2xl p-4"
                >
                  <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold leading-relaxed">
                    {detail.refusalMessage ?? 'This change is not possible at the moment.'}
                  </Text>
                </View>
              ) : (
                <View
                  style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                  className="rounded-2xl border p-4"
                >
                  <LabelledPrice
                    label="Unused time on your plan"
                    price={pricing.resolve({ price: detail.proratedCredit })}
                  />
                  <LabelledPrice
                    label="To pay today"
                    price={pricing.resolve({ price: detail.dueNow })}
                    emphasise
                  />

                  <View
                    style={{ borderTopColor: tokens.color.border.default }}
                    className="border-t mt-2 pt-3"
                  >
                    <Fact
                      icon="calendar-outline"
                      text={`New plan starts ${new Date(detail.effectiveAt).toLocaleDateString()}.`}
                    />
                    <Fact
                      icon="refresh-outline"
                      text={`Then ${pricing.format(detail.nextChargeAmount)} from ${new Date(
                        detail.nextChargeAt
                      ).toLocaleDateString()}.`}
                    />
                    {detail.gainedEntitlementKeys.length > 0 ? (
                      <Fact
                        icon="add-circle-outline"
                        text={`You gain: ${detail.gainedEntitlementKeys
                          .map((key) => describeEntitlement(key).label)
                          .join(', ')}.`}
                      />
                    ) : null}
                    {detail.lostEntitlementKeys.length > 0 ? (
                      <Fact
                        icon="remove-circle-outline"
                        tone="warning"
                        text={`You lose: ${detail.lostEntitlementKeys
                          .map((key) => describeEntitlement(key).label)
                          .join(', ')}.`}
                      />
                    ) : null}
                  </View>
                </View>
              )}
            </MonetizationSection>
          </View>
        ) : null}

        {error ? (
          <View className="mt-5">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}
      </ScrollView>

      {selected && gapsEnabled && detail?.isPermitted ? (
        <View
          style={{
            paddingBottom: insets.bottom + 12,
            borderTopColor: tokens.color.border.default,
            backgroundColor: tokens.color.surface.card,
          }}
          className="px-5 pt-4 border-t"
        >
          <PaymentConfirmButton
            label={`Move to ${selected.plan.name}`}
            amount={detail.dueNow.minorUnits > 0 ? detail.dueNow : null}
            onPress={handleConfirm}
            isSubmitting={change.isPending}
            disabled={!canTransact}
            disabledReason={blockedBy?.hint ?? null}
          />
        </View>
      ) : null}
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
      <ScreenHeader title="Change plan" showBack />
      {children}
    </SafeAreaView>
  );
}

function Fact({
  icon,
  text,
  tone = 'default',
}: {
  icon: string;
  text: string;
  tone?: 'default' | 'warning';
}) {
  const { tokens } = useTheme();
  const colour = tone === 'warning' ? tokens.color.warning.default : tokens.color.text.secondary;

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} className="flex-row items-start py-1">
      <Ionicons name={icon as never} size={14} color={colour} style={{ marginRight: 8, marginTop: 2 }} />
      <Text style={{ color: colour }} className="flex-1 text-xs font-semibold leading-relaxed">
        {text}
      </Text>
    </View>
  );
}
