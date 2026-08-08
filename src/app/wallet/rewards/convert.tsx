// ═════════════════════════════════════════════════════════════════════════════
//   ⚠ BACKEND GAP — SIMULATED. See src/config/financial-gaps.ts → rewards. ⚠
//
//   Conversion preview and confirmation.
//
//   **The client never multiplies points by a rate.** §12 of the brief: "Do not
//   calculate conversion rates locally if the backend owns the conversion
//   rules." The policy carries a rate so the deal can be *explained*; every
//   figure the member is shown before confirming comes from
//   `POST /rewards/conversions/preview`.
//
//   That is not pedantry. A client that rounds 4,281 points to £42.81 while the
//   server floors it to £42.80 produces a confirmation screen and a receipt
//   that disagree by a penny, and a member who is certain they were short-
//   changed. One round trip removes the entire class of problem.
// ═════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  FinancialErrorInline,
  GapNotice,
  GapUnavailableView,
  PaymentConfirmButton,
  ReviewDetailRow,
  ReviewRow,
  StatusBanner,
} from '@/components/financial';
import {
  useConversionPolicy,
  useCreateConversion,
  useGapFeaturesEnabled,
  usePreviewConversion,
  useRewardBalance,
} from '@/hooks/financial-gaps';
import { formatMoney } from '@/lib/money';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useNotification } from '@/providers/notification-provider';
import type { StatusPresentation } from '@/lib/financial-status';
import type { RewardConversionPreview } from '@/types/financial-gaps';

function presentConversionStatus(status: string): StatusPresentation {
  if (status === 'Completed') {
    return {
      label: 'Converted', tone: 'positive', icon: 'checkmark-circle-outline',
      description: 'Converted. The credit is in your wallet.',
      isTerminal: true, isSettled: true, needsReconciliation: false,
    };
  }
  if (status === 'Failed') {
    return {
      label: 'Failed', tone: 'negative', icon: 'close-circle-outline',
      description: 'Failed. Your points have not been taken.',
      isTerminal: true, isSettled: false, needsReconciliation: false,
    };
  }
  return {
    label: 'Converting', tone: 'pending', icon: 'time-outline',
    description: 'Converting. This usually takes a few seconds.',
    isTerminal: false, isSettled: false, needsReconciliation: true,
  };
}

export default function ConvertRewardsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert } = useNotification();

  const gapsEnabled = useGapFeaturesEnabled();
  const balanceQuery = useRewardBalance();
  const policyQuery = useConversionPolicy();
  const preview = usePreviewConversion();
  const createConversion = useCreateConversion();

  const [pointsText, setPointsText] = useState('');
  const [quote, setQuote] = useState<RewardConversionPreview | null>(null);
  const [error, setError] = useState<FinancialError | null>(null);
  const [completed, setCompleted] = useState<Awaited<ReturnType<typeof createConversion.mutateAsync>> | null>(null);

  const policy = policyQuery.data;
  const balance = balanceQuery.data;
  const points = Number.parseInt(pointsText.replace(/[^0-9]/g, ''), 10);

  /**
   * Every change of the number is a preview request, debounced.
   *
   * Debounced rather than fired per keystroke: typing "10000" would otherwise
   * be five requests, four of which describe a number the member never meant.
   */
  useEffect(() => {
    if (!Number.isFinite(points) || points <= 0) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await preview.mutateAsync(points);
        setQuote(result);
      } catch (cause) {
        setError(toFinancialError(cause, 'read'));
      }
    }, 400);

    return () => clearTimeout(timer);
    // `preview` is a stable mutation object from TanStack Query.
  }, [points]);

  const handleConvert = useCallback(() => {
    if (!quote?.isValid) return;

    showAlert({
      type: 'question',
      title: 'Convert your points?',
      message: `${points.toLocaleString()} points become ${formatMoney(quote.netValue)} of Diaspora credit. Points cannot be converted back.`,
      buttons: [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            setError(null);
            try {
              const conversion = await createConversion.mutateAsync(points);
              setCompleted(conversion);
            } catch (cause) {
              setError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [quote, points, createConversion, showAlert]);

  if (!gapsEnabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Convert points" showBack />
        <GapUnavailableView gapId="rewards" />
      </SafeAreaView>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────
  if (completed) {
    const status = presentConversionStatus(completed.status);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Convert points" showBack />

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <GapNotice gapId="rewards" compact />

          <View className="items-center py-8">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-3xl font-black tracking-tight"
              accessibilityLabel={formatMoney(completed.netValue)}
            >
              {completed.netValue.symbol}
              {completed.netValue.amount.toFixed(completed.netValue.exponent)}
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold mt-2">
              from {completed.points.toLocaleString()} points
            </Text>
          </View>

          <StatusBanner status={status} detail={null} />

          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-4"
          >
            <ReviewRow label="Value" value={completed.grossValue} />
            {completed.fee.minorUnits > 0 ? <ReviewRow label="Fee" value={completed.fee} /> : null}
            <ReviewRow label="Added to your wallet" value={completed.netValue} emphasis />
            <ReviewDetailRow label="Reference" value={completed.receiptReference} />
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/wallet')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to your wallet"
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="h-12 rounded-full items-center justify-center mt-8"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">Back to wallet</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Convert points" showBack />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <GapNotice gapId="rewards" />

        {policy ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-5"
            accessible
            accessibilityLabel={`You have ${balance?.available.toLocaleString() ?? 0} points. ${policy.pointsPerMinorUnit * 100} points is worth 1 ${policy.currency}.`}
          >
            <Text style={{ color: tokens.color.text.secondary }} className="text-[10px] font-black uppercase tracking-widest mb-2">
              The rate
            </Text>
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
              {(policy.pointsPerMinorUnit * 100).toLocaleString()} points = 1 {policy.currency}
            </Text>
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-1.5 leading-relaxed">
              Between {policy.minimumPoints.toLocaleString()} and {policy.maximumPoints.toLocaleString()}{' '}
              points at a time
              {policy.feePercentage > 0 ? ` · ${policy.feePercentage}% fee` : ' · no fee'}. Diaspora works out
              the exact value — the figure below comes from the server, not from this app.
            </Text>
          </View>
        ) : null}

        <View className="mt-6">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black uppercase tracking-widest mb-2"
          >
            How many points?
          </Text>

          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="flex-row items-center rounded-2xl border px-4"
          >
            <TextInput
              value={pointsText}
              onChangeText={(next) => setPointsText(next.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={tokens.color.text.placeholder}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel="Number of points to convert"
              style={{
                color: tokens.color.text.primary,
                fontSize: 28,
                fontWeight: '800',
                paddingVertical: 16,
                flex: 1,
                fontVariant: ['tabular-nums'],
              }}
            />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-black uppercase tracking-widest"
            >
              points
            </Text>
          </View>

          {balance ? (
            <TouchableOpacity
              onPress={() => setPointsText(String(Math.min(balance.available, policy?.maximumPoints ?? balance.available)))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Convert all ${balance.available.toLocaleString()} points`}
              className="mt-3 self-start"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ color: tokens.color.primary[500] }} className="text-[11px] font-black uppercase tracking-wider">
                Use all {balance.available.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* The preview. Every number here came from the server. */}
        {quote ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-6"
          >
            {quote.isValid ? (
              <>
                <ReviewRow label="Value" value={quote.grossValue} />
                {quote.fee.minorUnits > 0 ? <ReviewRow label="Fee" value={quote.fee} /> : null}
                <View style={{ borderTopColor: tokens.color.border.default }} className="border-t mt-1 pt-1">
                  <ReviewRow label="You would receive" value={quote.netValue} emphasis />
                </View>
              </>
            ) : (
              <View className="flex-row items-start">
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={tokens.color.warning.default}
                  style={{ marginRight: 10, marginTop: 1 }}
                />
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ color: tokens.color.text.primary }}
                  className="flex-1 text-xs font-semibold leading-relaxed"
                >
                  {quote.refusalMessage ?? 'That number of points cannot be converted.'}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {error ? (
          <View className="mt-5">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed mt-6"
        >
          Converted points become Diaspora credit in your wallet. Credit can be spent on the platform and
          cannot be converted back into points.
        </Text>
      </ScrollView>

      <View
        style={{
          paddingBottom: insets.bottom + 12,
          borderTopColor: tokens.color.border.default,
          backgroundColor: tokens.color.surface.card,
        }}
        className="px-5 pt-4 border-t"
      >
        <PaymentConfirmButton
          label="Convert"
          amount={quote?.isValid ? quote.netValue : null}
          onPress={handleConvert}
          isSubmitting={createConversion.isPending}
          disabled={!quote?.isValid || preview.isPending}
          disabledReason={
            !pointsText
              ? 'Enter how many points to convert.'
              : preview.isPending
                ? 'Working out the value…'
                : (quote?.refusalMessage ?? null)
          }
        />
      </View>
    </SafeAreaView>
  );
}
