// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — OTP verification (Frontend Phase 16, §18 · §57 · §68)
//
// ── What changed here, and why it is the most consequential edit in the phase ─
//
// This screen previously signed the member in **from its `catch` block**. When
// `POST /auth/otp/verify` failed for any reason — a timeout, a 500, no network,
// a wrong code — it fabricated a user, chose an account state from the last
// three digits of the phone number, and called `login()` with the literal token
// `mock-jwt-token`.
//
// That is an authentication bypass reachable by anybody, on the real login
// screen, by putting the device in aeroplane mode. It also fabricated
// `DiasporaVerified` and `Suspended` account states, which drive the access
// gateway — so the fallback did not merely sign somebody in, it chose their
// permissions.
//
// It is gone. A transport failure is now a failure, and the member is told so.
//
// The simulated clipboard code — a `setTimeout` that filled the boxes with
// `987654` after 1.5 seconds — is gone too. §68 forbids fake provider behaviour
// inside a screen, and this one was worse than most: it auto-submitted, so on a
// slow connection the screen would submit a code the member never typed.
//
// ── What replaced them ───────────────────────────────────────────────────────
//
// One adapter. `sendOtp` and `verifyOtp` in `lib/integrations-api.ts` wrap the
// same certified routes and return `OtpChallengeState`, which carries the
// cooldown, expiry and attempts — and an `isServerAuthoritative` flag saying
// whether those came from the server or are the client's conservative defaults
// (FRONTEND-PHASE16-GAP-010). The countdown is honest about which it is showing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Animated, Easing, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/store/auth';
import { sendOtp, verifyOtp, type OtpChallengeState } from '@/lib/integrations-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { registerPushToken } from '@/lib/integrations/push-lifecycle';
import { trackIntegrationEvent } from '@/lib/integrations/events';
import type { AccountState } from '@/types/trust';

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallengeState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const inputs = useRef<(TextInput | null)[]>([]);
  const login = useAuthStore((s) => s.login);

  const successScale = useRef(new Animated.Value(0.3)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // The resend countdown. Seeded from the server's `cooldownSeconds` where one
  // is returned, and from the client's conservative default where it is not —
  // guessing the stricter interval means a "Resend" button that works rather
  // than one that 429s.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((previous) => previous - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handleVerify = useCallback(
    async (codeToVerify?: string) => {
      const code = codeToVerify ?? otp.join('');
      if (code.length < OTP_LENGTH) {
        setError('Please enter the full code');
        return;
      }
      if (!phone) {
        setError('We do not have a phone number to verify.');
        return;
      }

      setIsLoading(true);
      setError('');
      setHint(null);

      try {
        const result = await verifyOtp({ phoneNumber: phone, code });

        trackIntegrationEvent('verification.otp.succeeded', { provider: 'sms.platform' });

        login(
          {
            userId: result.user.userId,
            fullName: result.user.fullName,
            role: result.user.role,
            email: result.user.email,
            phone: result.user.phone ?? phone,
            accountState: (result.user.accountState as AccountState | undefined) ?? 'LimitedAccess',
          },
          result.accessToken
        );

        // §44: the push token is registered for *this* member, immediately after
        // the session exists. Fire-and-forget — a notification registration that
        // failed must never block signing in — and the lifecycle is idempotent,
        // so the next foreground retries it.
        void registerPushToken(result.user.userId).catch(() => {});

        triggerSuccessAnimation(result.user.accountState);
      } catch (cause) {
        // No fallback. See the file header — a transport failure is a failure.
        trackIntegrationEvent('verification.otp.failed', {
          provider: 'sms.platform',
          errorKind: isIntegrationError(cause) ? cause.kind : 'UnknownError',
        });

        if (isIntegrationError(cause)) {
          setError(cause.message);
          setHint(cause.hint ?? null);
          if (cause.kind === 'RateLimited' && cause.retryAfterSeconds != null) {
            setSecondsLeft(cause.retryAfterSeconds);
          }
        } else {
          setError('We could not check that code.');
          setHint('Check your connection and try again.');
        }

        // Cleared so a member does not tap "Verify" on a code the server has
        // already rejected, burning another of their remaining attempts.
        setOtp(Array(OTP_LENGTH).fill(''));
        inputs.current[0]?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [otp, phone, login]
  );

  // Auto-submit when all six boxes are filled. Safe now that nothing fills them
  // on the member's behalf.
  useEffect(() => {
    const code = otp.join('');
    if (code.length === OTP_LENGTH && !isLoading && !isSuccess) {
      void handleVerify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');

    // A genuine paste from the member's own clipboard, which is a real and
    // useful behaviour — unlike the simulated one this screen used to have.
    if (cleaned.length >= 5) {
      const next = [...otp];
      for (let position = 0; position < OTP_LENGTH; position += 1) {
        if (position < cleaned.length) next[position] = cleaned[position];
      }
      setOtp(next);
      setError('');
      inputs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    const next = [...otp];
    next[index] = cleaned.slice(-1);
    setOtp(next);
    setError('');

    if (cleaned && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) inputs.current[index - 1]?.focus();
  };

  const triggerSuccessAnimation = (accountState?: string) => {
    setIsSuccess(true);
    Animated.parallel([
      Animated.spring(successScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        // The destination comes from the account state the *server* returned.
        // It used to be inferred from the last three digits of the phone number,
        // which chose a member's permissions from a string they typed.
        router.replace(accountState ? '/access-gateway' : '/(tabs)');
      }, 1000);
    });
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || !phone) return;

    setOtp(Array(OTP_LENGTH).fill(''));
    setError('');
    setHint(null);
    inputs.current[0]?.focus();

    try {
      const next = await sendOtp({ phoneNumber: phone, purpose: 'signIn' });
      setChallenge(next);
      setSecondsLeft(next.cooldownSeconds);
      trackIntegrationEvent('verification.otp.requested', { provider: 'sms.platform' });
    } catch (cause) {
      if (isIntegrationError(cause)) {
        setError(cause.message);
        setHint(cause.hint ?? null);
        setSecondsLeft(cause.retryAfterSeconds ?? 60);
      } else {
        setError('We could not send another code.');
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white relative">
      <ScreenHeader title="" />

      {isSuccess ? (
        <Animated.View style={{ opacity: successOpacity }} className="absolute inset-0 z-50">
          <View className="w-full h-full bg-white/95 items-center justify-center px-6">
            <Animated.View style={{ transform: [{ scale: successScale }] }}>
              <View className="items-center">
                <View className="w-20 h-20 bg-success-surface border-4 border-success-default rounded-full items-center justify-center mb-5">
                  <Text className="text-4xl text-success-default font-bold">✓</Text>
                </View>
                <Text className="text-2xl font-extrabold text-neutral-900 tracking-tight text-center">
                  Signed in
                </Text>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      ) : (
        <View className="px-6 pt-4 flex-1">
          <Text className="text-3xl font-extrabold text-neutral-900 mb-2 tracking-tight">
            Enter verification code
          </Text>
          <Text className="text-base text-neutral-500 mb-8 leading-relaxed">
            We sent a 6-digit code to{' '}
            <Text className="font-semibold text-neutral-700">{phone ?? 'your phone'}</Text>
          </Text>

          <View className="flex-row justify-between mb-6">
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputs.current[index] = ref;
                }}
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
                className={`w-12 h-14 rounded-2xl border-2 text-center text-2xl font-extrabold text-neutral-900 ${
                  digit ? 'border-primary-500 bg-white' : 'border-neutral-200 bg-neutral-50'
                } ${error ? 'border-error-default' : ''}`}
                accessibilityLabel={`Verification code, digit ${index + 1} of ${OTP_LENGTH}`}
                style={{ color: '#111827' }}
              />
            ))}
          </View>

          {error ? (
            <View accessibilityRole="alert" className="mb-4">
              <Text className="text-error-default text-sm font-semibold">{error}</Text>
              {hint ? <Text className="text-neutral-500 text-xs font-semibold mt-1">{hint}</Text> : null}
            </View>
          ) : null}

          {/* §18's attempts-remaining, rendered only when the server actually
              said so. A locally-invented count would be a promise the backend
              has not made — GAP-010. */}
          {challenge?.isServerAuthoritative && challenge.attemptsRemaining != null ? (
            <Text className="text-neutral-500 text-xs font-semibold mb-4">
              {challenge.attemptsRemaining}{' '}
              {challenge.attemptsRemaining === 1 ? 'attempt' : 'attempts'} left.
            </Text>
          ) : null}

          <Button label="Verify" isLoading={isLoading} onPress={() => void handleVerify()} className="mt-2" />

          <View className="flex-row items-center justify-center mt-8">
            <Text className="text-neutral-500 text-sm font-medium">Didn't receive the code? </Text>
            <TouchableOpacity
              onPress={() => void handleResend()}
              disabled={secondsLeft > 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: secondsLeft > 0 }}
              accessibilityLabel={
                secondsLeft > 0 ? `Resend available in ${secondsLeft} seconds` : 'Resend code'
              }
              activeOpacity={0.7}
            >
              <Text
                className={`text-sm font-bold ${secondsLeft > 0 ? 'text-neutral-400' : 'text-primary-500'}`}
              >
                {secondsLeft > 0
                  ? `Resend in ${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(
                      secondsLeft % 60
                    ).padStart(2, '0')}`
                  : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
