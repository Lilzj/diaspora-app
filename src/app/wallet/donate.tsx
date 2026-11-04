// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Donate (Frontend Phase 5)
//
// `GET /donations/causes` → `POST /donations` → reconcile the payment.
//
// The screen respects the thing B15's giving model was built around: **most
// giving on this platform is not money.** Three of the five support types are
// non-monetary, so a cause that does not accept `Monetary` is not offered a
// donate button — it is pointed at the contribution flow, where a pledge of
// goods or hours is a first-class outcome rather than a zero-value payment.
//
// Anonymity is a checkbox with a consequence, and the consequence is stated
// before it is chosen: an anonymous donation stores no donor identifier at all,
// so it cannot appear in the donor's own history afterwards.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  AmountDisplay,
  AmountInput,
  FinancialErrorInline,
  FinancialErrorView,
  PaymentSheet,
  useParsedAmount,
} from '@/components/financial';
import { useCreateDonation, useCurrencies, useDonationCauses } from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { progressRatio, toRequestAmount, zeroLike } from '@/lib/money';
import { useAuthStore } from '@/store/auth';
import { useMemberCurrency } from '@/lib/member-currency';
import { useLocationStore } from '@/store/location';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import type { DonationCause, PaymentIntent, PaymentMethodKind } from '@/types/financial';

const SUGGESTED = [5, 10, 25, 50];

export default function DonateScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const { cause: causeParam } = useLocalSearchParams<{ cause?: string }>();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const country = useLocationStore((state) => state.currentLocation?.countryCode);

  const causesQuery = useDonationCauses(country ?? undefined);
  const { data: currencies } = useCurrencies();
  const createDonation = useCreateDonation();

  const [selectedCode, setSelectedCode] = useState<string | undefined>(causeParam);
  const [amountText, setAmountText] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setAnonymous] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<FinancialError | null>(null);

  const giveRefusal = useMemo(
    () => checkAccess(FinancialPermissions.GivingCreate, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const monetaryCauses = useMemo(
    () => (causesQuery.data ?? []).filter((cause) => cause.acceptedKinds.includes('Monetary')),
    [causesQuery.data]
  );

  const otherCauses = useMemo(
    () => (causesQuery.data ?? []).filter((cause) => !cause.acceptedKinds.includes('Monetary')),
    [causesQuery.data]
  );

  const selected = useMemo(
    () => causesQuery.data?.find((cause) => cause.code === selectedCode) ?? null,
    [causesQuery.data, selectedCode]
  );

  // The currency follows the cause's own target where it has one, so somebody
  // giving to a Lagos fund gives in the currency the fund is counting in. The
  // platform never converts, so guessing here would produce a refusal later.
  // With no cause chosen yet, the member's own currency — never GBP for everyone.
  const memberCurrency = useMemberCurrency();
  const currency = selected?.target?.currency ?? selected?.raised?.currency ?? memberCurrency.code;
  const amount = useParsedAmount(amountText, currency, currencies);

  const amountError = useMemo(() => {
    if (amountText.length === 0) return null;
    if (!amount) return 'Enter an amount as a number.';
    if (amount.minorUnits <= 0) return 'Enter an amount greater than zero.';
    return null;
  }, [amountText, amount]);

  const canContinue = Boolean(selected && amount && amount.minorUnits > 0 && !amountError);

  const execute = useCallback(
    async (methodKind: PaymentMethodKind): Promise<PaymentIntent | null> => {
      if (!selected || !amount) return null;

      setError(null);

      try {
        const donation = await createDonation.mutateAsync({
          amount: toRequestAmount(amount),
          currency: amount.currency,
          causeCode: selected.code,
          beneficiaryType: selected.beneficiaryType,
          beneficiaryId: selected.beneficiaryId ?? undefined,
          isAnonymous,
          message: message.trim().length > 0 ? message.trim() : undefined,
          methodKind,
          countryCode: country ?? undefined,
        });

        return donation.payment ?? null;
      } catch (cause) {
        setError(toFinancialError(cause, 'mutating'));
        throw cause;
      }
    },
    [selected, amount, isAnonymous, message, country, createDonation]
  );

  if (!giveRefusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Give" showBack />
        <AccessGate refusal={giveRefusal} />
      </SafeAreaView>
    );
  }

  if (causesQuery.isError && causesQuery.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Give" showBack />
        <FinancialErrorView error={causesQuery.error as FinancialError} onRetry={causesQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Give" showBack />

      {/* The donation amount field sits below the cause list; with a plain
          ScrollView the keyboard covered it and the confirm button. */}
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 20 }}>
        {causesQuery.isLoading ? (
          <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold text-center py-10">
            Loading causes…
          </Text>
        ) : (
          <>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-black uppercase tracking-widest mb-3"
            >
              Choose a cause
            </Text>

            <View style={{ gap: 10 }}>
              {monetaryCauses.map((cause) => (
                <CauseCard
                  key={cause.code}
                  cause={cause}
                  isSelected={selectedCode === cause.code}
                  onSelect={() => setSelectedCode(cause.code)}
                />
              ))}
            </View>

            {monetaryCauses.length === 0 ? (
              <View
                style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                className="rounded-2xl border p-4"
              >
                <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
                  No cause near you is taking money at the moment. Several need goods, time or skills —
                  those are just as valuable.
                </Text>
              </View>
            ) : null}

            {/* Causes that need something other than money. Not hidden: on this
                platform they are the majority, and a donate screen that pretended
                otherwise would be misrepresenting the community. */}
            {otherCauses.length > 0 ? (
              <TouchableOpacity
                onPress={() => router.push('/wallet/contribute')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${otherCauses.length} causes need goods, time or skills rather than money`}
                style={{ backgroundColor: tokens.color.neutral[100], borderColor: `${tokens.color.secondary[500]}33` }}
                className="flex-row items-center rounded-2xl border p-4 mt-4"
              >
                <Ionicons name="people-outline" size={20} color={tokens.color.secondary[600]} />
                <Text
                  style={{ color: tokens.color.secondary[700] }}
                  className="flex-1 text-xs font-bold leading-relaxed ml-3"
                >
                  {otherCauses.length} {otherCauses.length === 1 ? 'cause needs' : 'causes need'} goods, time
                  or skills rather than money.
                </Text>
                <Ionicons name="chevron-forward" size={17} color={tokens.color.secondary[600]} />
              </TouchableOpacity>
            ) : null}

            {selected ? (
              <>
                <View className="mt-8">
                  <AmountInput
                    value={amountText}
                    onChangeText={setAmountText}
                    currency={currency}
                    currencies={currencies}
                    label="How much would you like to give?"
                    error={amountError}
                    suggestions={SUGGESTED}
                  />
                </View>

                <View className="mt-6">
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[11px] font-black uppercase tracking-widest mb-2"
                  >
                    Message (optional)
                  </Text>
                  <View
                    style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                    className="rounded-2xl border px-4"
                  >
                    <TextInput
                      value={message}
                      onChangeText={setMessage}
                      placeholder="A word of encouragement…"
                      placeholderTextColor={tokens.color.text.placeholder}
                      multiline
                      maxLength={280}
                      accessibilityLabel="Message to the organiser, optional"
                      style={{
                        color: tokens.color.text.primary,
                        fontSize: 14,
                        paddingVertical: 14,
                        minHeight: 80,
                        textAlignVertical: 'top',
                      }}
                    />
                  </View>
                </View>

                <View
                  style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                  className="flex-row items-center rounded-2xl border p-4 mt-4"
                >
                  <View className="flex-1 mr-3">
                    <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
                      Give anonymously
                    </Text>
                    {/* The consequence, stated before the choice rather than
                        discovered afterwards. */}
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-medium mt-1 leading-relaxed"
                    >
                      Diaspora will store no record of who gave. Your gift will not appear in your own
                      history — your receipt reference will be the only way to identify it.
                    </Text>
                  </View>

                  <Switch
                    value={isAnonymous}
                    onValueChange={setAnonymous}
                    accessibilityLabel="Give anonymously"
                    accessibilityHint="Diaspora will store no record of who gave"
                    trackColor={{ false: tokens.color.neutral[300], true: tokens.color.primary[500] }}
                  />
                </View>

                {error ? (
                  <View className="mt-4">
                    <FinancialErrorInline error={error} />
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </KeyboardAwareScrollView>

      {selected ? (
        <View
          style={{
            paddingBottom: insets.bottom + 12,
            borderTopColor: tokens.color.border.default,
            backgroundColor: tokens.color.surface.card,
          }}
          className="px-5 pt-4 border-t"
        >
          {/* `amountError` explains a number that will not do, on the field
              itself. Nothing typed at all is not an error and said nothing —
              the Review button simply sat there grey. */}
          {amountText.trim().length === 0 ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold mb-3"
            >
              Still needed: an amount
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => setSheetOpen(true)}
            disabled={!canContinue}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Review your donation"
            accessibilityState={{ disabled: !canContinue }}
            style={{
              backgroundColor: canContinue ? tokens.color.primary[500] : tokens.color.neutral[200],
            }}
            className="h-14 rounded-full items-center justify-center"
          >
            <Text
              style={{ color: canContinue ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-sm font-black tracking-tight"
            >
              Review
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {selected && amount ? (
        <PaymentSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={selected.title}
          description={`Your gift goes to ${selected.organizerName}.`}
          subjectLabel={selected.title}
          listPrice={amount}
          payable={amount}
          details={[
            { label: 'Cause', value: selected.title },
            ...(isAnonymous ? [{ label: 'Visibility', value: 'Anonymous', icon: 'eye-off-outline' }] : []),
          ]}
          execute={execute}
          confirmLabel="Give"
          onCompleted={() => router.replace('/wallet/giving')}
        />
      ) : null}
    </SafeAreaView>
  );
}

function CauseCard({
  cause,
  isSelected,
  onSelect,
}: {
  cause: DonationCause;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { tokens } = useTheme();
  const ratio = progressRatio(cause.raised, cause.target);

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${cause.title}. Organised by ${cause.organizerName}. ${cause.urgency} urgency. ${cause.supporterCount} supporters.`}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
      }}
      className="rounded-2xl p-4"
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="flex-1 text-sm font-black tracking-tight mr-2"
        >
          {cause.title}
        </Text>

        {cause.isVerified ? (
          <Ionicons name="shield-checkmark" size={15} color={tokens.color.success.default} />
        ) : null}
      </View>

      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mb-2">
        {cause.organizerName}
        {cause.locationLabel ? ` · ${cause.locationLabel}` : ''}
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium leading-relaxed"
        numberOfLines={2}
      >
        {cause.description}
      </Text>

      {/* Progress, only where the backend gave a target. A bar with no target
          is a bar with no meaning, and `progressRatio` returns null for it. */}
      {ratio !== null && cause.raised && cause.target ? (
        <View className="mt-3">
          <View
            style={{ backgroundColor: tokens.color.neutral[200] }}
            className="h-1.5 rounded-full overflow-hidden"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
          >
            <View
              style={{ backgroundColor: tokens.color.secondary[500], width: `${ratio * 100}%` }}
              className="h-full rounded-full"
            />
          </View>

          <View className="flex-row items-center justify-between mt-1.5">
            <AmountDisplay value={cause.raised} size="small" tone="credit" compact />
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
              of {cause.target.symbol ?? ''}{cause.target.amount.toLocaleString()} · {cause.supporterCount} supporters
            </Text>
          </View>
        </View>
      ) : (
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold mt-2">
          {cause.supporterCount} supporters
        </Text>
      )}
    </TouchableOpacity>
  );
}
