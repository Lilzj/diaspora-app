// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Registration, final step (Remediation Wave A)
//
// **This screen used to create the session itself.** It called
// `useAuthStore.login()` with `userId: 'user-123'` and the literal string
// `mock_access_token`, and `POST /api/v1/auth/register` was never called from
// anywhere in the client. The consequences were not subtle:
//
//   * No account was created. The member existed only on their own device.
//   * Every subsequent request carried `Authorization: Bearer mock_access_token`
//     and was refused.
//   * The client asserted an access state — `LimitedAccess` — that the server
//     had never granted, so `TrustEngine` and `featureRegistry` made decisions
//     from a value nothing had authorised.
//
// It now registers for real. `POST /auth/register` deliberately returns **no
// tokens**: an unverified account holds no usable access, and the token pair is
// issued by `POST /auth/verify-phone` once the code is redeemed. So this screen
// creates the account and hands the challenge to the OTP screen; it no longer
// decides that anybody is signed in.
//
// The local trust seeding that used to run here has gone with it. Verification
// state, the country timeline and the reputation record are the Trust module's
// (`/api/v1/trust`, 26 routes), and a client that writes its own copy at
// registration is a client that will disagree with the server about whether
// somebody is verified.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { register } from '@/lib/auth-api';
import { clearRegistrationDraft, getRegistrationDraft } from '@/lib/registration-draft';
import { isIntegrationError } from '@/lib/integrations/errors';
import { trackIntegrationEvent } from '@/lib/integrations/events';

export default function EnableLocationScreen() {
  const params = useLocalSearchParams<{
    fullName: string;
    email: string;
    phone: string;
    originCountryCode: string;
    originCountryName: string;
    residenceCountryCode: string;
    residenceCountryName: string;
  }>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  /**
   * Creates the account.
   *
   * `nationality` and `countryOfResidence` are both required by
   * `RegisterRequest` and are the two the preceding screens exist to collect,
   * so a missing one is a broken flow rather than a field to default. Saying so
   * is better than sending `'GB'` and creating an account with a residence
   * nobody chose — which is what the previous implementation's `|| 'GB'`
   * fallbacks did to the local record.
   */
  const handleComplete = async () => {
    if (isSubmitting) return;

    const draft = getRegistrationDraft();

    if (!draft?.password) {
      setError({
        message: 'Your registration details are incomplete.',
        hint: 'Please start again from the sign-up screen.',
      });
      return;
    }

    if (!params.phone || !params.originCountryCode || !params.residenceCountryCode) {
      setError({
        message: 'We are missing your phone number or country selection.',
        hint: 'Please go back and complete the previous steps.',
      });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // ── The email was collected and then dropped ──────────────────────────
      //
      // `register.tsx` has always asked for an address and required it to submit,
      // and `RegistrationDraft` has always carried it — but this call never sent
      // it, so every account was created with a null email. That was harmless
      // while sign-in was a phone one-time code. It is not harmless now: the
      // address **is** the sign-in credential, so an account without one could
      // never be signed into.
      const result = await register({
        fullName: draft.fullName || params.fullName,
        phoneNumber: params.phone,
        email: draft.email ?? params.email ?? '',
        password: draft.password,
        nationality: params.originCountryCode,
        countryOfResidence: params.residenceCountryCode,
        // The inviter's code, when there is one (CS-C3). An unknown code still
        // registers the account; the referral programme simply credits nobody.
        ...(draft.referralCode ? { referralCode: draft.referralCode } : {}),
      });

      // The password has done its work. It does not survive the call that used
      // it, successful or not — see `lib/registration-draft.ts`.
      clearRegistrationDraft();

      trackIntegrationEvent('verification.otp.requested', { provider: 'sms.platform' });

      // `result.verification` is a real `OtpChallengeResponse` with the server's
      // own expiry, attempt budget and resend interval — which is what the OTP
      // screen's countdown has wanted since FRONTEND-PHASE16-GAP-010 was raised.
      router.replace({
        pathname: '/(auth)/otp',
        params: {
          phone: params.phone,
          purpose: 'register',
          expiresAt: result.verification.expiresAt,
          attemptsRemaining: String(result.verification.attemptsRemaining),
          resendAvailableInSeconds: String(result.verification.resendAvailableInSeconds),
        },
      });
    } catch (cause) {
      setError(
        isIntegrationError(cause)
          ? { message: cause.message, hint: cause.hint ?? null }
          : {
              message: 'We could not create your account.',
              hint: 'Check your connection and try again.',
            }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // What this screen is (14 Oct 2026): the last registration step, where the
  // account is created. It was titled "Enable Location" with "Enable Location &
  // Enter" and "Not now" buttons, both of which only created the account and
  // neither of which asked for location, so a refused password surfaced here
  // under a location heading. Location is asked once, on first launch, by
  // `StartupLocationPrompt`; this screen shows what is about to be sent.
  const draft = getRegistrationDraft();
  const rows: [string, string | undefined][] = [
    ['Name', draft?.fullName || params.fullName],
    ['Email', draft?.email ?? params.email],
    ['Country of origin', params.originCountryName || params.originCountryCode],
    ['Country of residence', params.residenceCountryName || params.residenceCountryCode],
    ['Phone', params.phone],
  ];

  return (
    <SafeAreaView className="flex-1 bg-surface-card justify-between">
      <View className="flex-1 px-6 pt-12">
        <View className="w-20 h-20 rounded-full bg-surface-muted items-center justify-center mb-6 self-center">
          <Text className="text-4xl">✅</Text>
        </View>

        <Text className="text-2xl font-bold text-content-primary text-center mb-2">
          Create your account
        </Text>
        <Text className="text-base text-content-muted text-center leading-relaxed mb-6">
          Check your details. We will text a code to your phone to confirm it is yours.
        </Text>

        <View className="rounded-2xl border border-subtle bg-surface-background px-4 py-2">
          {rows.map(([label, value]) => (
            <View key={label} className="flex-row justify-between py-2">
              <Text className="text-sm text-content-muted">{label}</Text>
              <Text className="text-sm font-semibold text-content-primary ml-4 flex-shrink text-right">
                {value || '—'}
              </Text>
            </View>
          ))}
        </View>

        {error ? (
          <View accessibilityRole="alert" className="mt-6 w-full rounded-2xl bg-error-subtle px-4 py-3">
            <Text className="text-sm font-semibold text-error-default">{error.message}</Text>
            {error.hint ? (
              <Text className="mt-1 text-xs text-error-default/80">{error.hint}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="px-6 pb-6">
        <Button
          label={isSubmitting ? 'Creating your account…' : 'Create my account'}
          variant="primary"
          disabled={isSubmitting}
          onPress={handleComplete}
        />
        <Button
          label="Go back and change something"
          variant="ghost"
          className="mt-2"
          disabled={isSubmitting}
          onPress={() => router.back()}
        />
      </View>
    </SafeAreaView>
  );
}
