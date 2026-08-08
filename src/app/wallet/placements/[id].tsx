// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Placement detail (Frontend Phase 5)
//
// The target of `billing.placement.activated` and `billing.placement.ended`,
// both deep-linking to `/wallet/placements/{placementid}`.
//
// **There is no `GET /placements/{id}`.** The placement is found in
// `GET /placements/me`, which is what the backend exposes. GAP-08.
//
// Cancelling stops the placement. It does *not* promise a refund: B15 puts that
// decision in the refund-window policy, and `CancelPlacementRequest` has no
// refund flag precisely so a client cannot imply one. The confirmation dialog
// says so rather than leaving somebody to find out.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  FinancialErrorInline,
  FinancialErrorView,
  ReviewDetailRow,
  StatusBanner,
} from '@/components/financial';
import { useCancelPlacement, useMyPlacements } from '@/hooks/financial';
import { describeSubjectType, presentPlacementStatus } from '@/lib/financial-status';
import { FinancialError, toFinancialError } from '@/lib/financial-errors';
import { useNotification } from '@/providers/notification-provider';
import { formatRelativeTime } from '@/utils/format';

export default function PlacementDetailScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showAlert, showToast } = useNotification();

  const query = useMyPlacements();
  const cancel = useCancelPlacement();
  const [error, setError] = useState<FinancialError | null>(null);

  const placement = useMemo(
    () => query.data?.find((item) => item.placementId === id),
    [query.data, id]
  );

  const handleCancel = useCallback(() => {
    if (!placement) return;

    showAlert({
      type: 'warning',
      title: 'Stop this promotion?',
      // Deliberately explicit about the refund, because the backend genuinely
      // does not decide it here and implying otherwise would be a promise the
      // client cannot keep.
      message:
        'Your listing goes back to its normal position straight away. Whether any money comes back depends on Diaspora’s refund policy — it is not automatic.',
      buttons: [
        { text: 'Keep it running', style: 'cancel' },
        {
          text: 'Stop promotion',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            try {
              await cancel.mutateAsync({ placementId: placement.placementId });
              showToast({ type: 'success', title: 'Promotion stopped' });
            } catch (cause) {
              setError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [placement, cancel, showAlert, showToast]);

  if (query.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Promotion" showBack />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!placement) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Promotion" showBack />
        <FinancialErrorView
          error={
            new FinancialError({
              kind: 'notFound',
              message: 'We could not find that promotion.',
              hint: 'It may have finished and been removed from your list.',
              isRetryable: false,
              isTerminal: true,
              isIndeterminate: false,
            })
          }
          action={{ label: 'See your purchases', onPress: () => router.replace('/wallet/purchases') }}
        />
      </SafeAreaView>
    );
  }

  const status = presentPlacementStatus(placement.status);
  const canStop = placement.isActive || placement.status === 'Scheduled';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Promotion" showBack />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        <View className="items-center py-4">
          <View
            style={{ backgroundColor: tokens.color.primary[50] }}
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
          >
            <Ionicons name="flash-outline" size={30} color={tokens.color.primary[600]} />
          </View>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xl font-black text-center tracking-tight"
            accessibilityRole="header"
          >
            {placement.kind}
          </Text>
          <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold text-center mt-1">
            on {describeSubjectType(placement.subjectType)}
          </Text>
        </View>

        <StatusBanner
          status={status}
          detail={
            placement.status === 'Scheduled'
              ? 'This starts once the payment for it has been confirmed.'
              : placement.isActive && placement.endsAt
                ? `Running until ${new Date(placement.endsAt).toLocaleDateString()}.`
                : null
          }
        />

        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-4 mt-4"
        >
          <ReviewDetailRow label="Started" value={formatRelativeTime(placement.startsAt)} />
          {placement.endsAt ? (
            <ReviewDetailRow
              label={placement.isActive ? 'Ends' : 'Ended'}
              value={formatRelativeTime(placement.endsAt)}
            />
          ) : null}
          <ReviewDetailRow label="Product" value={placement.productCode} />
          {/* The weight is what the ranking engine actually reads. Shown as a
              multiplier rather than a raw number, because "1.6" means nothing
              and "1.6× more visible" means something. */}
          <ReviewDetailRow label="Visibility" value={`${placement.priorityWeight}× normal`} />
          {placement.countryCode ? <ReviewDetailRow label="Country" value={placement.countryCode} /> : null}
        </View>

        {error ? (
          <View className="mt-4">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}

        {canStop ? (
          <TouchableOpacity
            onPress={handleCancel}
            disabled={cancel.isPending}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Stop this promotion"
            accessibilityState={{ disabled: cancel.isPending }}
            style={{ borderColor: tokens.color.error.default }}
            className="h-12 rounded-full border items-center justify-center mt-8"
          >
            <Text style={{ color: tokens.color.error.default }} className="text-xs font-black uppercase tracking-wider">
              {cancel.isPending ? 'Stopping…' : 'Stop promotion'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
