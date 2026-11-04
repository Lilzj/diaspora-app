// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promotion detail and management (Frontend Phase 6)
//
// The management screen for one placement: status, dates, what was paid, what it
// is doing, and the four things a member can want to do with it.
//
// Real: the placement, its status and dates, the purchase behind it, the payment
// and the cancellation (`DELETE /placements/{id}`).
//
// Real since B15.1, and the reason this header shrank: pause, resume, the
// auto-renew preference (MON-GAP-005, MON-GAP-004) and the renewal itself.
//
//   · Pause and resume call `POST /placements/{id}/pause` and `/resume`. They
//     move no money, so their answer is authoritative the moment it arrives.
//     The paused days are banked and handed back on resume — which is why this
//     screen shows no countdown while a promotion is paused: `endsAt` is a date
//     that is going to move.
//   · Auto-renew calls `PUT /placements/{id}/auto-renew`. A stored preference,
//     not a subscription: the renewal still buys the product again at whatever
//     it costs then, and the hint says so rather than implying a fixed price.
//   · Renewal calls `POST /placements/{id}/renew`, which **extends this
//     placement** rather than queueing a second one behind it. It answers a
//     purchase whose payment intent has been created and not captured, so this
//     screen reports "renewal started" and sends the member to the payment —
//     never "renewed".
//
// Still not real, and marked: the performance panel (MON-GAP-002).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorInline, FinancialErrorView, StatusBadge } from '@/components/financial';
import {
  MonetizationEmpty,
  MonetizationSection,
  PerformancePanel,
  describeTiming,
} from '@/components/monetization';
import {
  usePausePromotion,
  usePromotion,
  useRenewPromotion,
  useResumePromotion,
  useSetPromotionAutoRenew,
} from '@/hooks/monetization';
import { usePlacementPerformance } from '@/hooks/monetization-gaps';
import { useCancelPlacement } from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { presentPlacementStatus, presentPurchaseStatus } from '@/lib/financial-status';
import { describePlacementKind } from '@/lib/monetization-catalog';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useNotification } from '@/providers/notification-provider';

export default function PromotionDetailScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const { showAlert, showToast } = useNotification();

  const { id } = useLocalSearchParams<{ id: string }>();

  const { promotion, isLoading, isError, error, refetch } = usePromotion(id);
  const performance = usePlacementPerformance(promotion?.isActive ? id : undefined);
  const cancel = useCancelPlacement();
  const renew = useRenewPromotion();
  const pause = usePausePromotion();
  const resume = useResumePromotion();
  const autoRenew = useSetPromotionAutoRenew();

  // One error slot for every management action. They are mutually exclusive in
  // practice — each sits behind a confirmation and each disables its row while it
  // runs — and a slot per action would put four empty banners on the screen.
  const [actionError, setActionError] = useState<FinancialError | null>(null);

  const kind = useMemo(
    () => describePlacementKind(promotion?.kind),
    [promotion?.kind]
  );

  /**
   * Extending this promotion.
   *
   * `POST /placements/{id}/renew` moves the end of the placement that already
   * exists, rather than queueing a second one behind it. It answers a
   * `MonetizationPurchase` whose payment intent is created and **not captured**,
   * so nothing here says "renewed": the toast says the renewal has been started
   * and the member is sent to the payment, which is the only thing that can tell
   * them whether it went through.
   *
   * A promotion that has already finished cannot be extended — the backend has
   * nothing left to move — so that case still goes to the purchase flow, which
   * buys a fresh one and says so.
   */
  const handleRenew = useCallback(async () => {
    if (!promotion) return;

    const isExtendable =
      promotion.isActive || promotion.status === 'Scheduled' || promotion.status === 'Paused';

    if (!isExtendable) {
      router.push({
        pathname: '/monetization/promote',
        params: {
          subjectType: String(promotion.subjectType),
          subjectId: promotion.subjectId,
          productCode: promotion.productCode,
        },
      });
      return;
    }

    setActionError(null);
    try {
      const purchase = await renew.mutateAsync({ promotion });

      if (purchase.payment) {
        showToast({
          type: 'info',
          title: 'Renewal started',
          message: 'Finish the payment and the promotion will run for longer.',
        });
        router.push(`/wallet/payments/${purchase.payment.paymentIntentId}`);
        return;
      }

      // No payment at all means the product was free. That is the only case in
      // which the extension has actually happened by the time this returns.
      showToast({
        type: 'success',
        title: 'Promotion extended',
        message: 'It will keep running.',
      });
      refetch();
    } catch (cause) {
      setActionError(toFinancialError(cause, 'mutating'));
    }
  }, [promotion, renew, showToast, refetch]);

  /**
   * Pausing and resuming.
   *
   * The confirmation states the arithmetic rather than assuming the member knows
   * it: pausing banks the remaining days and resuming hands them back, which is
   * the one thing that distinguishes it from stopping and buying again.
   */
  const handlePause = useCallback(() => {
    if (!promotion) return;

    showAlert({
      type: 'warning',
      title: 'Pause this promotion?',
      message:
        'It stops being shown straight away, and the days you have left are kept. When you start it again it runs for exactly as long as it had left.',
      buttons: [
        { text: 'Keep it running', style: 'cancel' },
        {
          text: 'Pause it',
          onPress: async () => {
            setActionError(null);
            try {
              await pause.mutateAsync(promotion.placementId);
              showToast({
                type: 'success',
                title: 'Promotion paused',
                message: 'Your remaining days are kept until you start it again.',
              });
              refetch();
            } catch (cause) {
              setActionError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [promotion, pause, showAlert, showToast, refetch]);

  const handleResume = useCallback(async () => {
    if (!promotion) return;

    setActionError(null);
    try {
      await resume.mutateAsync(promotion.placementId);
      showToast({
        type: 'success',
        title: 'Promotion running again',
        message: 'It runs for exactly as long as it had left when you paused it.',
      });
      refetch();
    } catch (cause) {
      setActionError(toFinancialError(cause, 'mutating'));
    }
  }, [promotion, resume, showToast, refetch]);

  /**
   * The auto-renew preference.
   *
   * Deliberately not described as a subscription. Renewal buys the product again
   * at whatever it costs then, and the hint says so — a member who read "renews
   * automatically" and was later charged a higher price would have been told
   * something untrue by this screen.
   */
  const handleToggleAutoRenew = useCallback(async () => {
    if (!promotion) return;

    setActionError(null);
    try {
      await autoRenew.mutateAsync({
        placementId: promotion.placementId,
        enabled: !promotion.autoRenewEnabled,
      });
      refetch();
    } catch (cause) {
      setActionError(toFinancialError(cause, 'mutating'));
    }
  }, [promotion, autoRenew, refetch]);

  /**
   * Stopping a promotion.
   *
   * Whether money comes back is the refund-window policy's decision and is not
   * this client's to predict — so the confirmation says the truth ("we cannot
   * promise a refund") rather than either promising one or implying there is
   * none.
   */
  const handleCancel = useCallback(() => {
    if (!promotion) return;

    showAlert({
      type: 'warning',
      title: 'Stop this promotion?',
      message:
        'Your ' +
        (promotion.target?.noun ?? 'item') +
        ' goes back to its normal position straight away. Whether any of the money comes back depends on how long it has been running — we cannot promise a refund.',
      buttons: [
        { text: 'Keep it running', style: 'cancel' },
        {
          text: 'Stop it',
          style: 'destructive',
          onPress: async () => {
            setActionError(null);
            try {
              await cancel.mutateAsync({ placementId: promotion.placementId, reason: 'MemberRequested' });
              showToast({
                type: 'success',
                title: 'Promotion stopped',
                message: 'It is no longer being shown.',
              });
              refetch();
            } catch (cause) {
              setActionError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [promotion, cancel, showAlert, showToast, refetch]);

  if (isError && error) {
    return (
      <Shell title="Promotion">
        <FinancialErrorView error={error} onRetry={refetch} />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell title="Promotion">
        <View className="p-5" accessible accessibilityLabel="Loading the promotion." style={{ gap: 12 }}>
          <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-3xl h-40" />
          <View style={{ backgroundColor: tokens.color.neutral[100], opacity: 0.6 }} className="rounded-2xl h-24" />
        </View>
      </Shell>
    );
  }

  if (!promotion) {
    return (
      <Shell title="Promotion">
        <View className="p-5">
          <MonetizationEmpty
            icon="megaphone-outline"
            title="Promotion not found"
            message="This promotion is not on your account. It may have finished and dropped off your list."
            action={{
              label: 'See your promotions',
              onPress: () => router.replace('/monetization/promotions'),
            }}
          />
        </View>
      </Shell>
    );
  }

  // `pausedAt` is the authoritative signal and `status` is the readable one; a
  // deployment that sets one without the other is still paused, so both count.
  const isPaused = promotion.pausedAt != null || promotion.status === 'Paused';
  // What the renew route can actually act on. A finished placement has no window
  // left to extend, and asking the backend to extend one answers a conflict.
  const isExtendable = promotion.isActive || promotion.status === 'Scheduled' || isPaused;

  const status = presentPlacementStatus(promotion.status);
  const timing = describeTiming(promotion);
  const purchaseStatus = promotion.purchase ? presentPurchaseStatus(promotion.purchase.status) : null;

  return (
    <Shell title={kind.label}>
      <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        {/* Headline: what it is, what state it is in, when it ends. */}
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`${kind.label} promotion on your ${promotion.target?.noun ?? 'item'}. ${status.description} ${timing.spoken}.`}
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-3xl border p-5"
        >
          <View className="flex-row items-start justify-between mb-3">
            <View
              style={{ backgroundColor: tokens.color.neutral[100] }}
              className="w-12 h-12 rounded-2xl items-center justify-center"
            >
              <Ionicons name={kind.icon as never} size={24} color={tokens.color.primary[600]} />
            </View>
            <StatusBadge status={status} />
          </View>

          <Text style={{ color: tokens.color.text.primary }} className="text-xl font-black tracking-tight">
            {kind.label}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-medium leading-relaxed mt-1"
          >
            on your {promotion.target?.noun ?? 'item'} · {kind.where}
          </Text>

          <View
            style={{ borderTopColor: tokens.color.border.default }}
            className="border-t mt-4 pt-3.5"
          >
            <DetailRow label="Status" value={status.label} />
            <DetailRow
              label="Starts"
              value={new Date(promotion.startsAt).toLocaleDateString()}
            />
            <DetailRow
              label="Ends"
              value={promotion.endsAt ? new Date(promotion.endsAt).toLocaleDateString() : 'No end date'}
            />
            <DetailRow label={timing.label.includes('left') ? 'Time left' : 'Timing'} value={timing.label} />
            <DetailRow label="Visibility" value={`${promotion.priorityWeight}× normal`} />
            {promotion.paid ? (
              <DetailRow label="Paid" value={pricing.format(promotion.paid)} emphasise />
            ) : null}
          </View>
        </View>

        {/* The thing being promoted, so the member can get to it. */}
        {promotion.target ? (
          <TouchableOpacity
            onPress={() => router.push(promotion.target!.entityRoute(promotion.subjectId) as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Open the ${promotion.target.noun} this promotion is on`}
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="flex-row items-center rounded-2xl border p-4 mt-3"
          >
            <Ionicons
              name={promotion.target.icon as never}
              size={19}
              color={tokens.color.text.secondary}
              style={{ marginRight: 12 }}
            />
            <Text style={{ color: tokens.color.text.primary }} className="flex-1 text-sm font-bold">
              See the {promotion.target.noun}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </TouchableOpacity>
        ) : null}

        {/* The payment behind it. Real, and linked to the real receipt. */}
        {promotion.purchase ? (
          <View className="mt-7">
            <MonetizationSection title="Payment">
              <TouchableOpacity
                onPress={() =>
                  promotion.purchase?.payment
                    ? router.push(`/wallet/payments/${promotion.purchase.payment.paymentIntentId}`)
                    : router.push('/wallet/purchases')
                }
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Payment for this promotion. ${purchaseStatus?.description ?? ''} ${
                  promotion.paid ? pricing.describe(promotion.paid) : ''
                }`}
                style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                className="rounded-2xl border p-4"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    {purchaseStatus ? <StatusBadge status={purchaseStatus} size="sm" /> : null}
                    <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-2">
                      {new Date(promotion.purchase.createdAt).toLocaleDateString()}
                    </Text>
                  </View>

                  <View className="items-end">
                    {promotion.purchase.discount.minorUnits > 0 ? (
                      <Text style={{ color: tokens.color.success.default }} className="text-[11px] font-bold">
                        {pricing.format(promotion.purchase.discount)} off
                      </Text>
                    ) : null}
                    <Text style={{ color: tokens.color.text.primary }} className="text-base font-black">
                      {pricing.format(promotion.purchase.paid)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </MonetizationSection>
          </View>
        ) : null}

        {/* Performance. Entirely simulated, and the panel says so. */}
        {performance.isEnabled ? (
          <View className="mt-2">
            <MonetizationSection title="Performance">
              <PerformancePanel
                report={performance.report}
                isLoading={performance.isLoading}
                title="Since it started"
              />
            </MonetizationSection>
          </View>
        ) : null}

        {/* Actions. */}
        <MonetizationSection title="Manage">
          <View style={{ gap: 8 }}>
            {promotion.isRenewable ? (
              <ActionButton
                icon="refresh-outline"
                label={isExtendable ? 'Run it for longer' : 'Promote it again'}
                hint={
                  isExtendable
                    ? 'Extends this promotion rather than starting a second one. You pay for the extra time.'
                    : 'This one has finished, so this buys a new promotion.'
                }
                onPress={handleRenew}
                isBusy={renew.isPending}
              />
            ) : null}

            {/* Pause and resume. Offered only where the backend can act: a
                scheduled placement has no clock running to stop, and a finished
                one has nothing left to bank. */}
            {isPaused ? (
              <ActionButton
                icon="play-circle-outline"
                label="Start it again"
                hint="It runs for exactly as long as it had left when you paused it."
                onPress={handleResume}
                isBusy={resume.isPending}
              />
            ) : promotion.isActive ? (
              <ActionButton
                icon="pause-circle-outline"
                label="Pause this promotion"
                hint="Stops it being shown and keeps the days you have left."
                onPress={handlePause}
                isBusy={pause.isPending}
              />
            ) : null}

            {/* The auto-renew preference. A toggle rather than a button, because
                it is state the backend stores rather than an action, and the
                hint refuses to imply a fixed future price. */}
            {promotion.isActive || isPaused || promotion.status === 'Scheduled' ? (
              <ActionButton
                icon={promotion.autoRenewEnabled ? 'repeat' : 'repeat-outline'}
                label={
                  promotion.autoRenewEnabled
                    ? 'Renew it automatically: on'
                    : 'Renew it automatically: off'
                }
                hint={
                  promotion.autoRenewEnabled
                    ? 'When it runs out, Diaspora buys it again at whatever it costs then. Tap to switch off.'
                    : 'Tap to have Diaspora buy it again when it runs out, at whatever it costs then.'
                }
                onPress={handleToggleAutoRenew}
                isBusy={autoRenew.isPending}
              />
            ) : null}

            {promotion.isActive || isPaused || promotion.status === 'Scheduled' ? (
              <ActionButton
                icon="stop-circle-outline"
                label="Stop this promotion"
                hint="It stops being shown for good, and the days you have left are not kept. A refund is not guaranteed."
                tone="destructive"
                onPress={handleCancel}
                isBusy={cancel.isPending}
              />
            ) : null}
          </View>

          {actionError ? (
            <View className="mt-3">
              <FinancialErrorInline error={actionError} />
            </View>
          ) : null}

          {/* The pause gap notice that stood here is gone: `POST
              /placements/{id}/pause` and `/resume` ship, this screen calls them,
              and a notice saying the capability is missing would now be the
              inaccurate half of the pair. */}
          {isPaused ? (
            <View className="mt-3">
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-semibold leading-relaxed"
              >
                Paused. Your remaining days are kept and the end date will move by
                however long it stays paused, so there is no countdown to show
                until you start it again.
              </Text>
            </View>
          ) : null}
        </MonetizationSection>
      </ScrollEndScrollView>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title={title} showBack />
      {children}
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
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
      <Text
        style={{ color: tokens.color.text.primary }}
        className={emphasise ? 'text-sm font-black' : 'text-xs font-bold'}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  onPress,
  tone = 'default',
  isBusy = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  tone?: 'default' | 'destructive';
  isBusy?: boolean;
}) {
  const { tokens } = useTheme();
  const colour = tone === 'destructive' ? tokens.color.error.default : tokens.color.text.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isBusy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ disabled: isBusy, busy: isBusy }}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tone === 'destructive' ? `${tokens.color.error.default}44` : tokens.color.border.default,
        opacity: isBusy ? 0.6 : 1,
      }}
      className="flex-row items-center rounded-2xl border p-4"
    >
      <Ionicons name={icon as never} size={19} color={colour} style={{ marginRight: 12 }} />
      <View className="flex-1">
        <Text style={{ color: colour }} className="text-sm font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed mt-0.5"
        >
          {hint}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
