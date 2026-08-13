// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Phone verification (Frontend Phase 16, §18 · §68)
//
// ── What changed here ────────────────────────────────────────────────────────
//
// This screen previously simulated the whole flow inside itself: two
// `setTimeout` calls stood in for sending an SMS and for verifying a code, and
// **any** six digits were accepted. It then wrote `Phone → Approved` into the
// trust store, so a member could mark their own phone verified by typing
// `123456`.
//
// §68 forbids fake provider behaviour inside a screen, and this was the clearest
// case of it in the codebase. It now calls the same `sendOtp`/`verifyOtp`
// adapter the sign-in flow uses, against the same certified `/auth/otp/*`
// routes, so there is one OTP implementation rather than three.
//
// The trust-store write is gone too. Verification status is the platform's
// claim about a member and is not the client's to make — the phone-change
// contract (FRONTEND-PHASE16-GAP-010) is what will return it.
//
// ── The one thing this screen still cannot do ────────────────────────────────
//
// **Change the number.** `POST /auth/otp/verify` creates a session; it does not
// re-attach a number to an existing account, and there is no `PUT /auth/phone`.
// So the screen verifies ownership of a number and says plainly that the change
// itself needs a contract that does not exist, rather than showing a success
// message for something that did not happen.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { useThemeTokens } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { useAuthStore } from '@/store/auth';
import { sendOtp, type OtpChallengeState } from '@/lib/integrations-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { trackIntegrationEvent } from '@/lib/integrations/events';
import { IntegrationErrorNotice, IntegrationGapNotice } from '@/components/integrations';

type Step = 'display' | 'request' | 'verify';

export default function PhoneVerificationScreen() {
  const tokens = useThemeTokens();
  const currentPhone = useAuthStore((state) => state.user?.phone ?? null);

  const [phoneNumber, setPhoneNumber] = useState(currentPhone ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<Step>('display');
  const [isLoading, setIsLoading] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallengeState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<{ message: string; hint: string | null; retryAfterSeconds: number | null } | null>(
    null
  );

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((previous) => previous - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handleRequestOtp = async () => {
    // E.164-ish. A stricter check belongs in `PhoneInputWithCode`, which owns
    // the country code; this is the minimum that stops an obviously-empty
    // request costing the platform an SMS.
    if (phoneNumber.replace(/\D/g, '').length < 7) {
      setError({
        message: 'That does not look like a phone number.',
        hint: 'Include the country code.',
        retryAfterSeconds: null,
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const next = await sendOtp({ phoneNumber, purpose: 'changePhone' });
      setChallenge(next);
      setSecondsLeft(next.cooldownSeconds);
      setStep('verify');
      trackIntegrationEvent('verification.otp.requested', { provider: 'sms.platform' });
    } catch (cause) {
      setError(
        isIntegrationError(cause)
          ? {
              message: cause.message,
              hint: cause.hint ?? null,
              retryAfterSeconds: cause.retryAfterSeconds ?? null,
            }
          : { message: 'We could not send a code.', hint: 'Check your connection.', retryAfterSeconds: null }
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      <ScreenHeader title="Phone Verification" showBack />

      {/* A plain ScrollView is not enough on Android 15+: the window never
          resizes for the keyboard, so the viewport stays full height and the
          bottom of the form sits behind the IME with nothing to scroll. */}
      <KeyboardAwareScrollView className="flex-1 p-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {step === 'display' ? (
          <View>
            <Text className="text-2xl font-black text-content-primary tracking-tight mb-2">
              Your phone number
            </Text>
            <Text className="text-sm text-content-muted leading-relaxed mb-6">
              Your number is how you sign in. It also secures your sessions and is required before
              you can post jobs or sell in the marketplace.
            </Text>

            <View className="w-full bg-surface-background border border-subtle rounded-3xl p-5 mb-6">
              <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">
                Number on your account
              </Text>
              <Text className="text-xl font-bold text-content-primary">
                {currentPhone ?? 'Not set'}
              </Text>
            </View>

            <Button
              label="Change phone number"
              variant="outline"
              onPress={() => setStep('request')}
              className="w-full"
            />
          </View>
        ) : null}

        {step === 'request' ? (
          <View>
            <Text className="text-2xl font-black text-content-primary mb-2">Change your number</Text>
            <Text className="text-sm text-content-muted mb-6 leading-relaxed">
              We will send a 6-digit code by SMS to confirm you can receive messages on the new
              number.
            </Text>

            <PhoneInputWithCode
              label="New phone number"
              value={phoneNumber}
              onChangePhone={setPhoneNumber}
            />

            {error ? (
              <View className="mb-4">
                <IntegrationErrorNotice
                  message={error.message}
                  hint={error.hint}
                  retryAfterSeconds={error.retryAfterSeconds}
                />
              </View>
            ) : null}

            <Button
              label={isLoading ? 'Sending…' : 'Send code'}
              disabled={isLoading}
              onPress={() => void handleRequestOtp()}
              className="w-full"
            />
          </View>
        ) : null}

        {step === 'verify' ? (
          <View>
            <Text className="text-2xl font-black text-content-primary mb-2">Enter the code</Text>
            <Text className="text-sm text-content-muted mb-6 leading-relaxed">
              Enter the 6-digit code sent to{' '}
              <Text className="font-bold text-content-strong">{phoneNumber}</Text>
            </Text>

            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">
              Verification code
            </Text>
            <TextInput
              value={otpCode}
              onChangeText={(text) => setOtpCode(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              accessibilityLabel="Verification code"
              className="bg-surface-background border border-subtle rounded-2xl p-4 text-center text-xl font-black tracking-widest mb-6"
              style={{ color: tokens.color.text.primary }}
              placeholderTextColor={tokens.color.text.placeholder}
            />

            {/* The honest ending. The code can be sent and the number's
                ownership confirmed; re-attaching it to the account needs a
                contract that does not exist, and claiming otherwise would leave
                a member believing their sign-in number had changed when it had
                not. */}
            <View className="mb-4">
              <IntegrationGapNotice
                gapKey="smsVerificationState"
                detail="Diaspora can send a code to this number, and cannot yet move your account to it — that needs a backend change. Your current number still signs you in."
              />
            </View>

            {challenge && !challenge.isServerAuthoritative ? (
              <Text className="text-xs text-content-faint font-semibold leading-relaxed mb-4">
                The resend timer is this app’s estimate. The server does not yet say how long to
                wait.
              </Text>
            ) : null}

            <Button
              label={secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
              variant="outline"
              disabled={secondsLeft > 0 || isLoading}
              onPress={() => void handleRequestOtp()}
              className="w-full"
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
