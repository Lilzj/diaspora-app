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
      const result = await register({
        fullName: draft.fullName || params.fullName,
        phoneNumber: params.phone,
        password: draft.password,
        nationality: params.originCountryCode,
        countryOfResidence: params.residenceCountryCode,
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

  return (
    <SafeAreaView className="flex-1 bg-surface-card justify-between">
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-28 h-28 rounded-full bg-primary-50 items-center justify-center mb-8">
          <Text className="text-5xl">📍</Text>
        </View>

        <Text className="text-2xl font-bold text-content-primary text-center mb-4">
          Enable Location
        </Text>
        <Text className="text-base text-content-muted text-center leading-relaxed">
          Allow location access to discover services near you. We use this to verify your residency
          boundaries.
        </Text>

        {error ? (
          <View className="mt-6 w-full rounded-2xl bg-error-subtle px-4 py-3">
            <Text className="text-sm font-semibold text-error-default">{error.message}</Text>
            {error.hint ? (
              <Text className="mt-1 text-xs text-error-default/80">{error.hint}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="px-6 pb-6">
        <Button
          label={isSubmitting ? 'Creating your account…' : 'Enable Location & Enter'}
          variant="primary"
          disabled={isSubmitting}
          onPress={handleComplete}
        />
        <Button
          label="Not now"
          variant="ghost"
          className="mt-2"
          disabled={isSubmitting}
          onPress={handleComplete}
        />
      </View>
    </SafeAreaView>
  );
}
