import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { sendOtp } from '@/lib/integrations-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { trackIntegrationEvent } from '@/lib/integrations/events';
import {
  composeE164,
  matchCallingCode,
  splitE164,
  MIN_NATIONAL_DIGITS,
} from '@/lib/calling-code';

/**
 * Sign in with a phone number.
 *
 * ── What used to be here, and why it is gone ────────────────────────────────
 *
 * A country dropdown of seven hard-coded entries — Mauritius, the UK, Nigeria,
 * Ghana, Senegal, Kenya, the US — defaulting to Mauritius, guessed at from the
 * device's timezone. Three separate faults, all of them user-visible:
 *
 *   * **183 countries could not sign in.** The platform's own reference list
 *     carries 190. A member in Germany, Canada, the UAE or anywhere else had no
 *     way to enter their number at all. On an app for people living abroad, the
 *     one screen everybody starts at excluded most of the world.
 *   * **A timezone is not a location.** It is a device setting. A member who
 *     travels, or whose phone is set to UTC, was silently handed a country they
 *     had no connection to.
 *   * **The member was being asked for something they were about to type.** A
 *     number in E.164 carries its own country. The dropdown asked them to state
 *     it twice and made the two disagree possible.
 *
 * One field replaces all of it. The member types their number the way they would
 * write it, and the country is echoed back underneath so a mistyped code is
 * visible before the code is sent rather than after it fails to arrive.
 */
export default function LoginScreen() {
  const { tokens } = useTheme();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  /**
   * What the number says about itself.
   *
   * Recomputed as the member types, which is the whole replacement for the
   * dropdown: instead of choosing a country and then typing a number that might
   * disagree with it, they type the number and watch the platform agree.
   */
  const match = useMemo(() => matchCallingCode(phone), [phone]);
  const split = useMemo(() => splitE164(phone), [phone]);

  const canContinue = split !== null && split.nationalNumber.length >= MIN_NATIONAL_DIGITS;

  /**
   * Requests a code.
   *
   * Frontend Phase 16: this used to advance to the OTP screen from its `catch`
   * block — "proceed anyway" — which sent a member to wait for a code that had
   * never been sent, with no way to tell that from a slow SMS. A failure is now
   * reported where it happened, and the member stays on the screen with the
   * button they need.
   *
   * Remediation Wave A: this now reaches `POST /api/v1/auth/otp/start`, which
   * is the route the platform actually serves. The previous call went to
   * `/auth/otp/send` — a path no module has ever mapped — so the request 404'd
   * and the member was told the code could not be sent, correctly and for the
   * wrong reason.
   *
   * The OTP screen is told which flow it is completing. Sign-in and
   * registration redeem their codes at different backend routes, and a screen
   * that guessed would send half its members to the wrong one.
   */
  const handleContinue = async () => {
    if (!split) return;

    setIsLoading(true);
    setError(null);

    // Normalised rather than sent as typed. The member's spaces, dashes and
    // trunk zero are theirs; E.164 is what the server stores and matches on.
    const fullNumber = composeE164(split.callingCode, split.nationalNumber);

    try {
      await sendOtp({ phoneNumber: fullNumber, purpose: 'signIn' });
      trackIntegrationEvent('verification.otp.requested', { provider: 'sms.platform' });
      router.push({ pathname: '/(auth)/otp', params: { phone: fullNumber, purpose: 'signIn' } });
    } catch (cause) {
      setError(
        isIntegrationError(cause)
          ? { message: cause.message, hint: cause.hint ?? null }
          : { message: 'We could not send a code.', hint: 'Check your connection and try again.' }
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="" />

      {/* A KeyboardAvoidingView alone is not enough here, and this screen is the
          proof. On Android `behavior` is deliberately undefined because the
          window already resizes for the keyboard — but a *plain View* inside
          that shrunken viewport has nowhere to put its overflow, so the bottom
          of the layout is simply clipped. Confirmed on device: with the keyboard
          open the "Continue" button disappeared from the screen and from the
          view hierarchy entirely, on the first screen every member uses.

          The scroll container is what actually fixes it: it gives the content
          somewhere to go when the viewport shrinks. */}
      <KeyboardAwareScrollView
        className="flex-1"
        // `flexGrow` lets the content fill a tall screen so `space-between`
        // still pins the button to the bottom, which is the intended design.
        // The children must be *natural height* for that to work: a `flex-1`
        // child absorbs the whole container, pushing the button to the bottom
        // of a full-height box that sits below the keyboard-shrunken viewport —
        // and because the container then exactly matches the viewport there is
        // no overflow to scroll to it either. That was F-033.
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          <Text className="text-3xl font-extrabold text-content-primary mb-2 tracking-tight">
            Welcome back
          </Text>
          <Text className="text-base text-content-muted mb-8 leading-relaxed">
            Enter your phone number and we'll send you a verification code.
          </Text>

          <Text className="text-sm font-semibold text-content-secondary mb-2">Phone Number</Text>

          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            {/* The flag is an echo of what was typed, not a control. There is
                nothing to open and nothing to choose: the number is the source
                of truth, and this only reflects it back. */}
            <Text className="text-xl mr-2" accessibilityElementsHidden importantForAccessibility="no">
              {match?.isUnambiguous ? match.countries[0].flag : '🌍'}
            </Text>

            <TextInput
              testID="phone-input"
              placeholder="+234 810 020 0001"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              className="flex-1 text-base font-semibold"
              // The visible "Phone Number" label is a sibling Text, which a
              // screen reader does not associate with the field — so the very
              // first field a member meets was announced unnamed.
              accessibilityLabel="Phone number, including country code"
              accessibilityHint="Start with a plus and your country code, for example plus 44"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          {/* ── The country, confirmed back ──────────────────────────────────
              A mistyped calling code used to be undiscoverable: the member saw
              a plausible screen, tapped Continue, and then waited for an SMS
              that had gone to a number in another country. Saying which country
              was understood makes that mistake visible while it is still on
              screen and still costs nothing to correct. */}
          {phone.trim().length > 0 ? (
            <View className="mt-3" accessibilityLiveRegion="polite">
              {match === null ? (
                <Text testID="country-echo" className="text-xs font-semibold text-content-muted">
                  Start with your country code, for example +44 or +234.
                </Text>
              ) : match.isUnambiguous ? (
                <Text testID="country-echo" className="text-xs font-semibold text-content-muted">
                  {match.countries[0].flag} {match.countries[0].name} · {match.callingCode}
                </Text>
              ) : (
                // +1 and +7 are shared by several countries each. Naming one of
                // them would be a guess presented as a fact.
                <Text testID="country-echo" className="text-xs font-semibold text-content-muted">
                  {match.callingCode} · {match.countries.length} countries share this code
                </Text>
              )}
            </View>
          ) : null}

          {/* Reported where it happened. The member stays on the screen with the
              button they need, instead of being advanced to wait for a code
              that was never sent. */}
          {error ? (
            <View accessibilityRole="alert" className="mt-4">
              <Text className="text-error-default text-sm font-semibold">{error.message}</Text>
              {error.hint ? (
                <Text className="text-content-muted text-xs font-semibold mt-1">{error.hint}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="px-6 py-6">
          <Button
            label="Continue"
            isLoading={isLoading}
            disabled={!canContinue}
            onPress={handleContinue}
          />
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            className="mt-4 py-2 items-center active:opacity-75"
          >
            <Text className="text-sm text-content-muted font-medium">
              Don't have an account? <Text className="font-bold text-primary-500">Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
