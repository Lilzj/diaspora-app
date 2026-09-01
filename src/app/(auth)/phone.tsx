import React, { useMemo, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import {
  callingCodeForCountry,
  composeE164,
  countryByCode,
  MIN_NATIONAL_DIGITS,
} from '@/lib/calling-code';

/**
 * The phone number a member registers with.
 *
 * ── Why this screen did not exist, and what that cost ───────────────────────
 *
 * Registration could not complete. Not for some members — for anybody.
 *
 * `register.tsx` read `phone` from its route params and forwarded it through
 * `choose-origin` and `choose-country` to `enable-location`, which is where
 * `POST /auth/register` is finally called. But none of the three screens that
 * navigate *to* `register` ever passed a `phone`, and no screen in the chain
 * collected one. So `params.phone` was `undefined` from the first step to the
 * last, and every new member reached the end of a five-screen flow to be told
 * *"We are missing your phone number or country selection. Please go back and
 * complete the previous steps."* — with no field anywhere behind them to fill in.
 *
 * The parameter was threaded through four files, which is what made it look
 * handled. Nothing typechecks a route param that is never supplied.
 *
 * ── Why the calling code is fixed rather than chosen ────────────────────────
 *
 * It comes from the country of residence selected on the previous screen, and
 * the member cannot change it here.
 *
 * The platform gates features on where somebody lives, and the Trust Centre
 * presents "Phone Linked" alongside "Country Residency" as steps towards the
 * same standing. A member from Nigeria living in Britain who verifies the
 * Nigerian number they kept proves they still hold a Nigerian SIM — which is
 * not the claim being made on their behalf. Letting the calling code disagree
 * with the stated country of residence would make phone verification a
 * ceremony rather than a signal.
 *
 * This is not, and is not presented as, proof of residence. That is
 * `/verification/country`, which takes documents. This only ensures the number
 * on file is consistent with the country the member says they live in.
 */
export default function PhoneScreen() {
  const { tokens } = useTheme();

  const params = useLocalSearchParams<{
    fullName: string;
    email: string;
    originCountryCode: string;
    originCountryName: string;
    residenceCountryCode: string;
    residenceCountryName: string;
  }>();

  const [nationalNumber, setNationalNumber] = useState('');

  const residence = useMemo(
    () => countryByCode(params.residenceCountryCode),
    [params.residenceCountryCode]
  );

  const callingCode = useMemo(
    () => callingCodeForCountry(params.residenceCountryCode),
    [params.residenceCountryCode]
  );

  const digits = nationalNumber.replace(/\D+/g, '').replace(/^0+/, '');
  const canContinue = callingCode !== null && digits.length >= MIN_NATIONAL_DIGITS;

  const handleContinue = () => {
    if (!callingCode) return;

    router.push({
      pathname: '/(auth)/enable-location',
      params: { ...params, phone: composeE164(callingCode, nationalNumber) },
    });
  };

  /**
   * Arriving here without a country of residence.
   *
   * Only reachable by a deep link or a back-navigation that skipped the previous
   * screen, but it is worth handling rather than rendering a field whose calling
   * code is blank: a member who typed a number into that would produce a
   * malformed one and be refused by the server for a reason nobody could act on.
   */
  if (!residence || !callingCode) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card">
        <ScreenHeader title="Your phone number" showBack />
        <View className="px-6 pt-4" accessibilityRole="alert">
          <Text className="text-error-default text-sm font-semibold">
            We do not have your country of residence yet.
          </Text>
          <Text className="text-content-muted text-xs font-semibold mt-1">
            Go back and choose the country you live in, then enter your number.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Your phone number" showBack />

      {/* The scroll container is what keeps the Continue button reachable when
          the keyboard is open — see the note on `login.tsx`, where its absence
          removed the button from the view hierarchy entirely. */}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          <Text className="text-base text-content-muted mb-8 leading-relaxed">
            {/* It is **not** how you sign in — that is the email address and password
                collected on the previous step. This line survived the move and told
                every new member the wrong thing about their own credential. */}
            We'll send a verification code to this number to confirm you can receive
            messages on it.
          </Text>

          <Text className="text-sm font-semibold text-content-secondary mb-2">
            {residence.name} phone number
          </Text>

          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            {/* Fixed, and visibly so. Not a disabled dropdown — there is nothing
                to open, because the country of residence already answered this. */}
            <View
              className="flex-row items-center pr-3 border-r border-subtle"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Text className="text-xl mr-1.5">{residence.flag}</Text>
              <Text className="text-base font-semibold text-content-strong">{callingCode}</Text>
            </View>

            <TextInput
              testID="national-number-input"
              placeholder="7700 900123"
              value={nationalNumber}
              onChangeText={setNationalNumber}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              className="flex-1 text-base font-semibold pl-3"
              accessibilityLabel={`Phone number in ${residence.name}, country code ${callingCode}`}
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          {/* Said plainly, because a member who wanted to use their old number
              deserves to know why they cannot rather than assuming the field is
              broken. */}
          <Text className="text-xs font-semibold text-content-muted mt-3 leading-relaxed">
            This must be a number in {residence.name}, the country you told us you live in. Your
            number from {params.originCountryName || 'your country of origin'} cannot be used to
            verify where you live now.
          </Text>
        </View>

        <View className="px-6 py-6">
          <Button label="Continue" disabled={!canContinue} onPress={handleContinue} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
