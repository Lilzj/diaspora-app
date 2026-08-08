// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promotion detail and management (Frontend Phase 6)
//
// The management screen for one placement: status, dates, what was paid, what it
// is doing, and the four things a member can want to do with it.
//
// Real: the placement, its status and dates, the purchase behind it, the payment
// and the cancellation (`DELETE /placements/{id}`).
//
// Not real, and marked: the performance panel (MON-GAP-002) and pause/resume
// (MON-GAP-005). Pause is not offered on a real placement at all — `PlacementStatus`
// has no `Paused` member, cancelling and re-buying loses the remaining paid time,
// and presenting that as a pause would misdescribe what the member's money just
// did. The screen says so plainly instead.
//
// Renewal (MON-GAP-004) is offered and is honest about what it does: it buys the
// product again, scheduled to start when this one ends, because the backend
// refuses overlapping placements.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorInline, FinancialErrorView, StatusBadge } from '@/components/financial';
import {
  MonetizationEmpty,
  MonetizationGapNotice,
  MonetizationSection,
  PerformancePanel,
  describeTiming,
} from '@/components/monetization';
import { usePromotion } from '@/hooks/monetization';
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

  const [cancelError, setCancelError] = useState<FinancialError | null>(null);

  const kind = useMemo(
    () => describePlacementKind(promotion?.kind),
    [promotion?.kind]
  );

  const handleRenew = useCallback(() => {
    if (!promotion) return;
    router.push({
      pathname: '/monetization/promote',
      params: {
        subjectType: String(promotion.subjectType),
        subjectId: promotion.subjectId,
        renewFrom: promotion.placementId,
        productCode: promotion.productCode,
      },
    });
  }, [promotion]);

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
            setCancelError(null);
            try {
              await cancel.mutateAsync({ placementId: promotion.placementId, reason: 'MemberRequested' });
              showToast({
                type: 'success',
                title: 'Promotion stopped',
                message: 'It is no longer being shown.',
              });
              refetch();
            } catch (cause) {
              setCancelError(toFinancialError(cause, 'mutating'));
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

  const status = presentPlacementStatus(promotion.status);
  const timing = describeTiming(promotion);
  const purchaseStatus = promotion.purchase ? presentPurchaseStatus(promotion.purchase.status) : null;

  return (
    <Shell title={kind.label}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
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
              style={{ backgroundColor: tokens.color.primary[50] }}
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
            {promotion.isRenewable && (promotion.isActive || !promotion.isActive) ? (
              <ActionButton
                icon="refresh-outline"
                label={promotion.isActive ? 'Buy another run' : 'Promote it again'}
                hint={
                  promotion.isActive
                    ? 'Buys the same promotion again, starting when this one ends.'
                    : 'Buys the same promotion again, starting when the payment clears.'
                }
                onPress={handleRenew}
              />
            ) : null}

            {promotion.isActive || promotion.status === 'Scheduled' ? (
              <ActionButton
                icon="stop-circle-outline"
                label="Stop this promotion"
                hint="It stops being shown. A refund is not guaranteed."
                tone="destructive"
                onPress={handleCancel}
                isBusy={cancel.isPending}
              />
            ) : null}
          </View>

          {cancelError ? (
            <View className="mt-3">
              <FinancialErrorInline error={cancelError} />
            </View>
          ) : null}

          {/* Pause is not offered on a real placement, and the screen says why
              rather than showing a disabled button with no explanation. */}
          {promotion.isActive ? (
            <View className="mt-3">
              <MonetizationGapNotice
                gapKey="pause"
                compact
                detail="Pausing a promotion is not something Diaspora can do yet — the only way to stop one is to end it, which does not give the remaining days back. We are working on it."
              />
            </View>
          ) : null}
        </MonetizationSection>
      </ScrollView>
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
