// ─────────────────────────────────────────────────────────────────────────────
// Payout accounts — where a member's money goes when it leaves Diaspora.
//
// ── Why this screen did not exist ────────────────────────────────────────────
//
// `POST /payout-destinations` was served. `registerPayoutDestination`,
// `removePayoutDestination`, `usePayoutDestinations`,
// `useRegisterPayoutDestination` and `useRemovePayoutDestination` were all
// written. **No screen called any of them.** The withdraw screen read the list,
// let you pick from it, and said "you have not added an account to withdraw to
// yet" — which was true for every member on the platform and had no answer.
//
// ── Why it is a hand-off and not a form ──────────────────────────────────────
//
// **No payout credential passes through this application, and none should.**
// The member types their bank details into the provider's own hosted pages;
// what comes back here is an account reference the platform can pay to. That is
// why "Add an account" opens a browser rather than showing fields — a sort-code
// input on this screen would be the wrong screen, however convenient.
//
// ── Why an account arrives unusable ──────────────────────────────────────────
//
// Verification is the provider's: a micro deposit, a name match, an
// open-banking handshake. An account exists from the moment setup opens and is
// not payable until the provider says so, so a row can read "Setting up" for a
// while. It says that plainly rather than implying something is wrong, and
// "Check again" asks the provider rather than waiting on a human.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { AccessGate, FinancialErrorInline, StatusBadge } from '@/components/financial';
import { FinancialPermissions } from '@/lib/financial-access';
import { checkAccess } from '@/lib/financial-access';
import { useAuthStore } from '@/store/auth';
import {
  usePayoutDestinations,
  useRefreshPayoutDestination,
  usePrimaryWallet,
  useRegisterPayoutIdentity,
  useRemovePayoutDestination,
  useStartPayoutOnboarding,
} from '@/hooks/financial';
import { isSafeChallengeUrl } from '@/lib/integrations/payments';
import { useLocationStore } from '@/store/location';
import type { FinancialError } from '@/lib/financial-errors';
import type { StatusPresentation } from '@/lib/financial-status';
import type { PayoutDestination } from '@/types/financial';

/**
 * How to draw a payout account.
 *
 * **"Setting up" rather than "Unverified".** The state is ordinary and
 * temporary — a provider checking an account it has just been given — and a
 * member reading a word that sounds like a rejection will go looking for a
 * problem that is not there.
 */
function presentDestination(destination: PayoutDestination): StatusPresentation {
  return destination.isUsable
    ? {
        label: 'Ready',
        tone: 'positive',
        icon: 'checkmark-circle-outline',
        description: 'Money can be sent here.',
        isTerminal: true,
        isSettled: false,
        needsReconciliation: false,
      }
    : {
        label: 'Setting up',
        tone: 'warning',
        icon: 'hourglass-outline',
        description: 'Your provider is still checking this account.',

        // Not terminal, and the screen offers Check again because of it: the
        // provider will move this on its own and the member should ask.
        isTerminal: false,
        isSettled: false,
        needsReconciliation: true,
      };
}

export default function PayoutAccountsScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { wallet } = usePrimaryWallet();
  const country = useLocationStore((state) => state.currentLocation?.countryCode);

  const payRefusal = checkAccess(
    FinancialPermissions.PaymentsManage, accountState, isAuthenticated);

  const destinationsQuery = usePayoutDestinations();
  const startOnboarding = useStartPayoutOnboarding();
  const registerIdentity = useRegisterPayoutIdentity();
  const refreshDestination = useRefreshPayoutDestination();
  const removeDestination = useRemovePayoutDestination();

  const [error, setError] = useState<FinancialError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // **The address prompt, shown only when the server says this country needs
  // one.** It is not a fallback for a failed hand-off: a provider either has
  // hosted setup or it does not, and guessing would put a bank field in front
  // of somebody it cannot help.
  const [identityHint, setIdentityHint] = useState<string | null>(null);
  const [identity, setIdentity] = useState('');

  const destinations = destinationsQuery.data ?? [];
  const currency = wallet?.currency ?? 'GBP';

  const onAdd = useCallback(async () => {
    setError(null);
    setNotice(null);

    try {
      const session = await startOnboarding.mutateAsync({
        currency,

        // The provider opens the account in this country and cannot move it
        // later, so it comes from where the member actually is rather than from
        // the currency — somebody in Nigeria paid in GBP is not a GB account.
        countryCode: country ?? 'GB',
      });

      if (session.requiresIdentity) {
        setIdentityHint(session.identityHint ?? 'the address your payouts should go to');
        return;
      }

      if (!session.started) {
        // The provider's own words. "Connect is not enabled on this account" and
        // "we do not open Express accounts in that country" send somebody to
        // completely different places, and a generic sentence sends them to
        // neither.
        setNotice(session.reason ?? 'That could not be set up right now.');
        return;
      }

      if (!isSafeChallengeUrl(session.url)) {
        setNotice('The setup page could not be opened. Try again in a moment.');
        return;
      }

      await Linking.openURL(session.url);
    } catch (caught) {
      setError(caught as FinancialError);
    }
  }, [currency, country, startOnboarding]);

  const onSaveIdentity = useCallback(async () => {
    setError(null);
    setNotice(null);

    try {
      await registerIdentity.mutateAsync({
        identity: identity.trim(),
        currency,
        countryCode: country ?? 'GB',
      });

      setIdentityHint(null);
      setIdentity('');
    } catch (caught) {
      setError(caught as FinancialError);
    }
  }, [identity, currency, country, registerIdentity]);

  const onCheckAgain = useCallback(
    async (destination: PayoutDestination) => {
      setError(null);
      setNotice(null);

      try {
        const updated = await refreshDestination.mutateAsync(destination.destinationId);

        if (!updated.isVerified) {
          setNotice(
            'Your provider has not finished checking this yet. It can take a few minutes '
            + 'after you finish setting up.'
          );
        }
      } catch (caught) {
        setError(caught as FinancialError);
      }
    },
    [refreshDestination]
  );

  const onRemove = useCallback(
    async (destination: PayoutDestination) => {
      setError(null);
      setNotice(null);

      try {
        await removeDestination.mutateAsync(destination.destinationId);
      } catch (caught) {
        setError(caught as FinancialError);
      }
    },
    [removeDestination]
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Payout accounts" showBack />

      {/*
        `checkAccess` answers a refusal *object* with an `allowed` flag, not
        null-or-refusal. Branching on its truthiness rendered the gate every
        time — and AccessGate draws nothing when access is allowed — so this
        screen shipped its header above an empty page. `.allowed` is the
        question; the object is always there.
      */}
      {!payRefusal.allowed ? (
        <AccessGate refusal={payRefusal} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {error ? (
            <View className="mb-4">
              <FinancialErrorInline error={error} onRetry={() => destinationsQuery.refetch()} />
            </View>
          ) : null}

          {notice ? (
            <View
              style={{
                backgroundColor: tokens.color.warning.surface,
                borderColor: `${tokens.color.warning.default}44`,
              }}
              className="rounded-2xl border p-4 mb-4"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-semibold leading-relaxed"
              >
                {notice}
              </Text>
            </View>
          ) : null}

          {identityHint ? (
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-3xl border p-4 mb-4"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-bold"
              >
                What is {identityHint}?
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold mt-1 leading-relaxed"
              >
                This is where your payouts arrive. It is an address, not a password — Diaspora
                still never asks for your bank details.
              </Text>

              <TextInput
                accessibilityLabel={`Enter ${identityHint}`}
                value={identity}
                onChangeText={setIdentity}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="name@example.com"
                placeholderTextColor={tokens.color.text.placeholder}
                style={{
                  color: tokens.color.text.primary,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border px-4 py-3 mt-3 text-sm font-semibold"
              />

              <View className="flex-row gap-2 mt-3">
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Save this payout address"
                  accessibilityState={{
                    busy: registerIdentity.isPending,
                    disabled: identity.trim().length === 0,
                  }}
                  disabled={registerIdentity.isPending || identity.trim().length === 0}
                  onPress={onSaveIdentity}
                  style={{
                    backgroundColor: identity.trim().length === 0
                      ? tokens.color.border.default
                      : tokens.color.primary[500],
                  }}
                  className="flex-1 rounded-full py-3 items-center"
                >
                  <Text className="text-white text-[11px] font-black uppercase tracking-widest">
                    Save
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Cancel adding a payout address"
                  onPress={() => {
                    setIdentityHint(null);
                    setIdentity('');
                  }}
                  style={{ borderColor: tokens.color.border.default }}
                  className="rounded-full border px-5 py-3"
                >
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[11px] font-black uppercase tracking-widest"
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {destinationsQuery.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="small" color={tokens.color.primary[500]} />
            </View>
          ) : destinations.length === 0 ? (
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-3xl border p-6 items-center"
            >
              <Ionicons
                name="business-outline"
                size={28}
                color={tokens.color.text.placeholder}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-base font-bold mt-3 text-center"
              >
                No payout account yet
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold mt-2 text-center leading-relaxed"
              >
                Money you earn sits in your Diaspora wallet until you add somewhere to send it.
                You set this up with our payments provider, so your bank details never touch
                Diaspora.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {destinations.map((destination) => (
                <DestinationRow
                  key={destination.destinationId}
                  destination={destination}
                  isBusy={refreshDestination.isPending || removeDestination.isPending}
                  onCheckAgain={() => onCheckAgain(destination)}
                  onRemove={() => onRemove(destination)}
                />
              ))}
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              destinations.length === 0 ? 'Add a payout account' : 'Add another payout account'
            }
            accessibilityState={{ busy: startOnboarding.isPending }}
            disabled={startOnboarding.isPending}
            onPress={onAdd}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center mt-6"
          >
            {startOnboarding.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-white text-sm font-black uppercase tracking-widest">
                {destinations.length === 0 ? 'Add an account' : 'Add another'}
              </Text>
            )}
          </TouchableOpacity>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold text-center mt-3 leading-relaxed"
          >
            You finish setting up on our provider's own site. Diaspora never sees or stores your
            account number.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * One account.
 *
 * **"Setting up" rather than "Unverified".** The state is ordinary and
 * temporary, and a member reading a word that sounds like a rejection will go
 * looking for a problem that is not there.
 */
function DestinationRow({
  destination,
  isBusy,
  onCheckAgain,
  onRemove,
}: {
  destination: PayoutDestination;
  isBusy: boolean;
  onCheckAgain: () => void;
  onRemove: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
            {destination.label}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-semibold mt-0.5"
          >
            {destination.currency}
            {destination.countryCode ? ` · ${destination.countryCode}` : ''}
          </Text>
        </View>

        <StatusBadge status={presentDestination(destination)} size="sm" />
      </View>

      {!destination.isUsable ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold mt-3 leading-relaxed"
        >
          Your provider is still checking this. You can withdraw as soon as they are done.
        </Text>
      ) : null}

      <View className="flex-row gap-2 mt-4">
        {!destination.isUsable ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Check again whether ${destination.label} is ready`}
            accessibilityState={{ busy: isBusy }}
            disabled={isBusy}
            onPress={onCheckAgain}
            style={{ borderColor: tokens.color.border.default }}
            className="rounded-full border px-4 py-2"
          >
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-black uppercase tracking-widest"
            >
              Check again
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Remove ${destination.label}`}
          accessibilityState={{ busy: isBusy }}
          disabled={isBusy}
          onPress={onRemove}
          style={{ borderColor: tokens.color.border.default }}
          className="rounded-full border px-4 py-2"
        >
          <Text
            style={{ color: tokens.color.error.default }}
            className="text-[11px] font-black uppercase tracking-widest"
          >
            Remove
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
