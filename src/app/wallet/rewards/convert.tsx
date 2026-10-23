// ═════════════════════════════════════════════════════════════════════════════
//   Conversion preview and confirmation, against the certified routes:
//   `GET /financial/rewards/conversion` (the terms and this member's standing),
//   `POST /financial/rewards/conversions/preview` and
//   `POST /financial/rewards/conversions`. This header said "BACKEND GAP —
//   SIMULATED" after both went real. Whether a member may convert is the
//   server's answer; on most deployments it is no, and the screen says why.
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  FinancialErrorInline,
  PaymentConfirmButton,
  ReviewDetailRow,
  ReviewRow,
  StatusBanner,
} from '@/components/financial';
import {
  useConversionPolicy,
  useCreateConversion,
  usePreviewConversion,
  useRewardBalance,
} from '@/hooks/financial-gaps';
import { formatMoney } from '@/lib/money';
import { conversionReasonText } from '@/lib/reward-conversion-text';
import { CREDIT_IS_ONE_WAY } from '@/lib/reward-copy';
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

  // The most the field can take right now: the balance, or less where the
  // server's maximum for this member is lower.
  const available = balance?.available ?? 0;
  const useMost = Math.min(available, policy?.maximumPoints ?? available);
  const isCapped = useMost < available;

  // Which preview request is the latest. Only its answer is applied.
  const latestPreview = useRef(0);

  /**
   * Every change of the number is a preview request, debounced.
   *
   * Debounced rather than fired per keystroke: typing "10000" would otherwise
   * be five requests, four of which describe a number the member never meant.
   *
   * **What is on screen describes the number in the field, and nothing else.**
   * A failed preview used to leave the previous quote showing beside its error,
   * a successful one left an earlier error showing beside the new quote, and a
   * slow answer for "100" could land after the answer for "1000" and replace it.
   * Each request now has a number, only the latest is applied, a success clears
   * the error, a failure clears the quote, and clearing the field clears both.
   */
  useEffect(() => {
    const request = ++latestPreview.current;

    if (!Number.isFinite(points) || points <= 0) {
      setQuote(null);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await preview.mutateAsync(points);
        if (request !== latestPreview.current) return;
        setQuote(result);
        setError(null);
      } catch (cause) {
        if (request !== latestPreview.current) return;
        setQuote(null);
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

  // **The platform decides whether conversion is open, not a build flag.**
  //
  // This used to be `if (!gapsEnabled) return <GapUnavailableView …>` — and
  // `GapUnavailableView` returns null for a gap whose entry says the backend is
  // connected, which `rewards` does. So on any real build the screen rendered a
  // header over an entirely empty body, on a money screen.
  //
  // `GET /rewards/conversion` says whether *this member* may convert and why
  // not — the deployment, their account, a hold, the minimum, today's allowance
  // — and `useConversionPolicy` reads it. That is the answer to show.
  if (policy && !policy.isEligible) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Convert points" showBack />
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="swap-horizontal-outline" size={40} color={tokens.color.text.placeholder} />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black tracking-tight mt-4 text-center"
          >
            You cannot convert points right now
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-xs font-semibold mt-2 text-center leading-relaxed"
          >
            {/*
              The server's sentence where it sent one; a bare code goes through
              the one shared map in lib/reward-conversion-text.ts, and is never
              shown as a code. This screen kept a table of its own, keyed on a
              code the server never sends.
            */}
            {conversionReasonText(policy.ineligibleReason)}
          </Text>
        </View>
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

          <View className="items-center py-8">
            {/*
              `formatMoney`, which writes the code when a currency has no
              symbol. This was the symbol and the amount pasted together, so a
              currency without one printed a bare number.
            */}
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-3xl font-black tracking-tight"
              accessibilityLabel={formatMoney(completed.netValue)}
            >
              {formatMoney(completed.netValue)}
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
            {/* No fee row: conversion has no fee anywhere in the platform. */}
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

      {/* The amount field is in the scroll body and Convert is in a pinned
          footer, so both have to lift together — wrapping only the body would
          leave the button the member is reaching for behind the keyboard.
          `padding` rather than the platform default: on Android 15+ the window
          does not resize, so there is nothing for the default to react to. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

        {policy ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-5"
            accessible
            accessibilityLabel={`You have ${balance?.available.toLocaleString() ?? 0} points. ${policy.pointsPerMajorUnit.toLocaleString()} points is worth 1 ${policy.currency}.`}
          >
            <Text style={{ color: tokens.color.text.secondary }} className="text-[10px] font-black uppercase tracking-widest mb-2">
              The rate
            </Text>
            {/*
              From the currency's exponent. `pointsPerMinorUnit × 100` was right
              only where a unit has a hundred minor units — a hundred times out
              for yen, ten times for dinars.
            */}
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
              {policy.pointsPerMajorUnit.toLocaleString()} points = 1 {policy.currency}
            </Text>
            {/*
              The most is the server's `maximumNow`: the smallest of the single
              maximum, today's allowance and the balance. It was the stated
              maximum, else today's allowance, else the balance — labelled as a
              limit either way. And no fee clause: conversion has no fee, so
              neither "no fee" nor a fee is a fact this screen should assert.
            */}
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-1.5 leading-relaxed">
              At least {policy.minimumPoints.toLocaleString()} points, and at most{' '}
              {policy.maximumPoints.toLocaleString()} right now. Diaspora works out the exact value — the
              figure below comes from the server, not from this app.
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
              onPress={() => setPointsText(String(useMost))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                isCapped
                  ? `Convert the most you can right now, ${useMost.toLocaleString()} points`
                  : `Convert all ${useMost.toLocaleString()} points`
              }
              className="mt-3 self-start"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {/*
                It said "Use all N" with N the whole balance while filling in
                the capped number, so the field disagreed with the button.
              */}
              <Text style={{ color: tokens.color.primary[500] }} className="text-[11px] font-black uppercase tracking-wider">
                {isCapped
                  ? `Use the most you can (${useMost.toLocaleString()})`
                  : `Use all ${useMost.toLocaleString()}`}
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
              <ReviewRow label="You would receive" value={quote.netValue} emphasis />
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

        {/*
          The shared statement. This said credit "can be spent on the platform"
          while the FAQ called the wallet "a record, not a balance"; what credit
          can be used for is decision D-7, so neither is said here.
        */}
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed mt-6"
        >
          {CREDIT_IS_ONE_WAY}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
