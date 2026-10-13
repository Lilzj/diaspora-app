// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Change plan (Frontend Phase 6)
//
// Real, since B15.1 closed MON-GAP-003. Two routes, and the split between them
// is the contract's rather than this screen's:
//
//   · `GET /financial/subscriptions/{id}/change/preview?planCode=` prices the
//     move. It is a GET, it reserves nothing, and it does **not** hold the
//     quoted figure — which is why it is fetched fresh rather than cached.
//   · `POST /financial/subscriptions/{id}/change` is the only call that moves
//     money, and it takes a body-only idempotency key.
//
// Every figure on this screen is asked for rather than computed, and always was.
// The reason has not changed now that the route is real: a client that
// multiplies a plan price by the remaining fraction of a period disagrees with
// the server at the first rounding boundary, and the figure it gets wrong is the
// one it charges somebody.
//
// **The server decides upgrade versus downgrade, not this screen.** An upgrade
// takes effect now and charges the difference; a downgrade waits for the period
// boundary, because somebody who paid for the month keeps the month. The
// confirmation reads `effectiveAt` off the preview rather than inferring it from
// a price comparison — an interval change between equally-priced plans is
// neither, and would be described wrongly by any comparison this screen could
// make.
//
// A preview that comes back `isPermitted: false` carries the server's own
// refusal. The confirm button is not offered, and the mutation refuses to send
// even if something else called it, so a refusal already known cannot be
// rediscovered as a failed charge attempt.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
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
import {
  useChangeSubscriptionPlan,
  useMonetizationPlans,
  usePlanChangePreview,
} from '@/hooks/monetization';
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

  const [selectedCode, setSelectedCode] = useState<string | null>(params.planCode ?? null);
  const [error, setError] = useState<FinancialError | null>(null);

  const subscription = subscriptionQuery.data ?? null;
  const preview = usePlanChangePreview(subscription?.subscriptionId, selectedCode);
  const change = useChangeSubscriptionPlan();
  const { canTransact, blockedBy } = useCanTransact();

  // The current plan is not a destination, and neither is a free plan — moving
  // to free is a cancellation, and it has its own route and its own semantics.
  // ── Downgrading is a plan change too ──────────────────────────────────────
  //
  // This filtered out `isFree`, so the free plan could never be a destination.
  // A member on the only paid tier was told "You are on the only paid plan" and
  // given nothing to do — true, and not the question they came with, which was
  // how to stop paying.
  //
  // Leaving them to hunt for Cancel is the pattern that makes people feel
  // trapped by a subscription. Moving to free is the same operation as moving
  // between paid tiers — a plan change, priced by the same preview, confirmed
  // the same way — and it belongs in the same list.
  const choices = useMemo(() => views.filter((view) => !view.isCurrent), [views]);

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
                // The quote the member was just shown. Passing it is what lets
                // the mutation refuse a change the server has already said no to,
                // rather than sending it and reporting the refusal as a failure.
                preview: detail,
              });

              // Two different true things, and the screen must not say the first
              // when the second happened. A downgrade is accepted now and takes
              // effect at the period boundary; telling that member "you are on
              // the smaller plan" would be wrong for up to a month.
              const takesEffectLater = Date.parse(detail.effectiveAt) > Date.now();

              showToast({
                type: 'success',
                title: takesEffectLater ? 'Plan change scheduled' : 'Plan changed',
                message: takesEffectLater
                  ? `You stay on your current plan until ${new Date(
                      detail.effectiveAt
                    ).toLocaleDateString()}, then move to ${selected.plan.name}.`
                  : `You are on ${selected.plan.name}.`,
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
      <ScrollEndScrollView
        endNavigation={false} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
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
              title="There is nowhere to move"
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
        {selected ? (
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
                    {/* `nextChargeAt` is nullable on the certified contract and
                        was not on the adapter's. A null is not "unknown date" —
                        it is a plan with no next charge, a lifetime or free
                        destination — so the line drops the date rather than
                        rendering "Invalid Date", which is what reading it
                        unguarded produced. */}
                    <Fact
                      icon="refresh-outline"
                      text={
                        detail.nextChargeAt
                          ? `Then ${pricing.format(detail.nextChargeAmount)} from ${new Date(
                              detail.nextChargeAt
                            ).toLocaleDateString()}.`
                          : detail.nextChargeAmount.minorUnits > 0
                            ? `Then ${pricing.format(detail.nextChargeAmount)} each period.`
                            : 'There is nothing further to pay on this plan.'
                      }
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
      </ScrollEndScrollView>

      {selected && detail?.isPermitted ? (
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
