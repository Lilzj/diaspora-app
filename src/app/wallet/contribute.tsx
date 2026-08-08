// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community contribution (Frontend Phase 5)
//
// `GET /contributions/funds` → `POST /contributions`.
//
// **Four of the five kinds move no money.** `Goods`, `VolunteerService`,
// `ProfessionalSkills` and `Supplies` carry a pledge quantity and a unit —
// "6 hours", "3 boxes" — and no amount at all. B15 refuses the wrong pair with
// a specific code rather than storing a zero, and this screen switches the form
// on the kind so the wrong pair is never sent in the first place.
//
// A non-monetary contribution completes immediately: there is no payment to
// wait for. That is why this screen has two endings — a payment sheet for money
// and a confirmation for a pledge — rather than one flow with a zero-value
// payment in the middle of it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useContributionFunds, useCreateContribution, useCurrencies } from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { progressRatio, toRequestAmount } from '@/lib/money';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import { useNotification } from '@/providers/notification-provider';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import type {
  ContributionFund,
  ContributionKind,
  PaymentIntent,
  PaymentMethodKind,
} from '@/types/financial';

/** The five kinds, in the words the client's donation screen already used. */
const KIND_LABELS: Record<string, { label: string; icon: string; unit: string }> = {
  Monetary: { label: 'Money', icon: 'cash-outline', unit: '' },
  Goods: { label: 'Goods and items', icon: 'cube-outline', unit: 'items' },
  VolunteerService: { label: 'Volunteer time', icon: 'time-outline', unit: 'hours' },
  ProfessionalSkills: { label: 'Professional skills', icon: 'briefcase-outline', unit: 'hours' },
  Supplies: { label: 'Food and supplies', icon: 'basket-outline', unit: 'boxes' },
};

export default function ContributeScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useNotification();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const country = useLocationStore((state) => state.currentLocation?.countryCode);

  const fundsQuery = useContributionFunds(country ?? undefined);
  const { data: currencies } = useCurrencies();
  const createContribution = useCreateContribution();

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [kind, setKind] = useState<ContributionKind | null>(null);
  const [amountText, setAmountText] = useState('');
  const [pledgeText, setPledgeText] = useState('');
  const [pledgeDescription, setPledgeDescription] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setAnonymous] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<FinancialError | null>(null);

  const giveRefusal = useMemo(
    () => checkAccess(FinancialPermissions.GivingCreate, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const selected = useMemo(
    () => fundsQuery.data?.find((fund) => fund.code === selectedCode) ?? null,
    [fundsQuery.data, selectedCode]
  );

  const currency = selected?.raised.currency ?? 'GBP';
  const amount = useParsedAmount(amountText, currency, currencies);
  const isMonetary = kind === 'Monetary';
  const pledgeQuantity = Number.parseFloat(pledgeText);

  const canSubmit = Boolean(
    selected &&
      kind &&
      (isMonetary ? amount && amount.minorUnits > 0 : Number.isFinite(pledgeQuantity) && pledgeQuantity > 0)
  );

  /** The unit the organiser counts in, for the selected kind. */
  const unit = kind ? KIND_LABELS[kind]?.unit || 'items' : 'items';

  const executePayment = useCallback(
    async (methodKind: PaymentMethodKind): Promise<PaymentIntent | null> => {
      if (!selected || !amount) return null;

      setError(null);
      try {
        const contribution = await createContribution.mutateAsync({
          fundCode: selected.code,
          kind: 'Monetary',
          amount: toRequestAmount(amount),
          currency: amount.currency,
          isAnonymous,
          message: message.trim() || undefined,
          methodKind,
          countryCode: country ?? undefined,
        });
        return contribution.payment ?? null;
      } catch (cause) {
        setError(toFinancialError(cause, 'mutating'));
        throw cause;
      }
    },
    [selected, amount, isAnonymous, message, country, createContribution]
  );

  /**
   * A pledge has no payment, so it is submitted directly and confirmed here.
   * Routing it through the payment sheet would put a "confirm and pay" button
   * in front of somebody offering six Saturdays of their time.
   */
  const submitPledge = useCallback(async () => {
    if (!selected || !kind) return;

    setError(null);
    try {
      const contribution = await createContribution.mutateAsync({
        fundCode: selected.code,
        kind,
        pledgeQuantity,
        pledgeUnit: unit,
        pledgeDescription: pledgeDescription.trim() || undefined,
        isAnonymous,
        message: message.trim() || undefined,
        countryCode: country ?? undefined,
      });

      showToast({
        type: 'success',
        title: 'Thank you',
        message: `Your pledge is recorded. Reference ${contribution.receiptReference}.`,
      });
      router.replace('/wallet/giving');
    } catch (cause) {
      setError(toFinancialError(cause, 'mutating'));
    }
  }, [
    selected, kind, pledgeQuantity, unit, pledgeDescription, isAnonymous, message, country,
    createContribution, showToast,
  ]);

  if (!giveRefusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Contribute" showBack />
        <AccessGate refusal={giveRefusal} />
      </SafeAreaView>
    );
  }

  if (fundsQuery.isError && fundsQuery.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Contribute" showBack />
        <FinancialErrorView error={fundsQuery.error as FinancialError} onRetry={fundsQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Contribute" showBack />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {fundsQuery.isLoading ? (
          <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold text-center py-10">
            Loading funds…
          </Text>
        ) : (
          <>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-black uppercase tracking-widest mb-3"
            >
              Choose a fund
            </Text>

            <View style={{ gap: 10 }}>
              {(fundsQuery.data ?? []).map((fund) => (
                <FundCard
                  key={fund.code}
                  fund={fund}
                  isSelected={selectedCode === fund.code}
                  onSelect={() => {
                    setSelectedCode(fund.code);
                    setKind(null);
                  }}
                />
              ))}
            </View>

            {selected ? (
              <>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-black uppercase tracking-widest mt-8 mb-3"
                >
                  What can you offer?
                </Text>

                <View style={{ gap: 8 }}>
                  {selected.acceptedKinds.map((accepted) => {
                    const config = KIND_LABELS[accepted] ?? {
                      label: accepted,
                      icon: 'help-outline',
                      unit: 'items',
                    };
                    const isSelected = kind === accepted;

                    return (
                      <TouchableOpacity
                        key={accepted}
                        onPress={() => setKind(accepted)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={config.label}
                        style={{
                          backgroundColor: tokens.color.surface.card,
                          borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                          borderWidth: isSelected ? 2 : 1,
                        }}
                        className="flex-row items-center rounded-2xl px-4 py-3.5"
                      >
                        <Ionicons
                          name={config.icon as never}
                          size={19}
                          color={isSelected ? tokens.color.primary[500] : tokens.color.text.secondary}
                        />
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="flex-1 text-sm font-bold tracking-tight ml-3"
                        >
                          {config.label}
                        </Text>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={19} color={tokens.color.primary[500]} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* The form switches on the kind. A monetary contribution needs
                    an amount; the other four need a quantity and a unit. Sending
                    the wrong pair is refused by the backend with a specific code,
                    and the way to never see that code is to never build it. */}
                {kind ? (
                  <View className="mt-8">
                    {isMonetary ? (
                      <AmountInput
                        value={amountText}
                        onChangeText={setAmountText}
                        currency={currency}
                        currencies={currencies}
                        label="How much would you like to give?"
                        suggestions={[10, 25, 50, 100]}
                      />
                    ) : (
                      <>
                        <Text
                          style={{ color: tokens.color.text.secondary }}
                          className="text-[11px] font-black uppercase tracking-widest mb-2"
                        >
                          How much can you pledge?
                        </Text>

                        <View
                          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                          className="flex-row items-center rounded-2xl border px-4"
                        >
                          <TextInput
                            value={pledgeText}
                            onChangeText={(next) => setPledgeText(next.replace(/[^0-9.]/g, ''))}
                            placeholder="0"
                            placeholderTextColor={tokens.color.text.placeholder}
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Quantity in ${unit}`}
                            style={{
                              color: tokens.color.text.primary,
                              fontSize: 28,
                              fontWeight: '800',
                              paddingVertical: 16,
                              flex: 1,
                            }}
                          />
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-black uppercase tracking-widest"
                          >
                            {unit}
                          </Text>
                        </View>

                        <View className="mt-4">
                          <Text
                            style={{ color: tokens.color.text.secondary }}
                            className="text-[11px] font-black uppercase tracking-widest mb-2"
                          >
                            What exactly? (optional)
                          </Text>
                          <View
                            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                            className="rounded-2xl border px-4"
                          >
                            <TextInput
                              value={pledgeDescription}
                              onChangeText={setPledgeDescription}
                              placeholder="Winter coats, sizes 8–14"
                              placeholderTextColor={tokens.color.text.placeholder}
                              accessibilityLabel="What you are pledging, optional"
                              style={{ color: tokens.color.text.primary, fontSize: 14, paddingVertical: 14 }}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    <View
                      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                      className="flex-row items-center rounded-2xl border p-4 mt-4"
                    >
                      <View className="flex-1 mr-3">
                        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
                          Contribute anonymously
                        </Text>
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-medium mt-1 leading-relaxed"
                        >
                          Your name will not be recorded, and this will not appear in your own history.
                        </Text>
                      </View>
                      <Switch
                        value={isAnonymous}
                        onValueChange={setAnonymous}
                        accessibilityLabel="Contribute anonymously"
                        trackColor={{ false: tokens.color.neutral[300], true: tokens.color.primary[500] }}
                      />
                    </View>

                    {error ? (
                      <View className="mt-4">
                        <FinancialErrorInline error={error} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {selected && kind ? (
        <View
          style={{
            paddingBottom: insets.bottom + 12,
            borderTopColor: tokens.color.border.default,
            backgroundColor: tokens.color.surface.card,
          }}
          className="px-5 pt-4 border-t"
        >
          <TouchableOpacity
            onPress={() => (isMonetary ? setSheetOpen(true) : submitPledge())}
            disabled={!canSubmit || createContribution.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isMonetary ? 'Review your contribution' : 'Confirm your pledge'}
            accessibilityState={{ disabled: !canSubmit || createContribution.isPending }}
            style={{
              backgroundColor: canSubmit ? tokens.color.primary[500] : tokens.color.neutral[200],
            }}
            className="h-14 rounded-full items-center justify-center"
          >
            <Text
              style={{ color: canSubmit ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-sm font-black tracking-tight"
            >
              {createContribution.isPending ? 'Sending…' : isMonetary ? 'Review' : 'Confirm pledge'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {selected && amount && isMonetary ? (
        <PaymentSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={selected.name}
          description={selected.description}
          subjectLabel={selected.name}
          listPrice={amount}
          payable={amount}
          details={[{ label: 'Fund', value: selected.name }]}
          execute={executePayment}
          confirmLabel="Contribute"
          onCompleted={() => router.replace('/wallet/giving')}
        />
      ) : null}
    </SafeAreaView>
  );
}

function FundCard({
  fund,
  isSelected,
  onSelect,
}: {
  fund: ContributionFund;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { tokens } = useTheme();
  const ratio = progressRatio(fund.raised, fund.target);

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${fund.name}. ${fund.description}. ${fund.contributorCount} contributors.`}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
      }}
      className="rounded-2xl p-4"
    >
      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight mb-1">
        {fund.name}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium leading-relaxed"
        numberOfLines={2}
      >
        {fund.description}
      </Text>

      {ratio !== null && fund.target ? (
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
            <AmountDisplay value={fund.raised} size="small" tone="credit" compact />
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
              {fund.contributorCount} contributors
            </Text>
          </View>
        </View>
      ) : (
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold mt-2">
          {fund.contributorCount} contributors
        </Text>
      )}
    </TouchableOpacity>
  );
}
