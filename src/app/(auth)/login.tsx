import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, TextInput, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { lightTokens } from '@/design-system';
import { sendOtp } from '@/lib/integrations-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { trackIntegrationEvent } from '@/lib/integrations/events';

interface CountryItem {
  name: string;
  code: string;
  flag: string;
}

const COUNTRIES: CountryItem[] = [
  { name: 'Mauritius', code: '+230', flag: '🇲🇺' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { name: 'Ghana', code: '+233', flag: '🇬🇭' },
  { name: 'Senegal', code: '+221', flag: '🇸🇳' },
  { name: 'Kenya', code: '+254', flag: '🇰🇪' },
  { name: 'United States', code: '+1', flag: '🇺🇸' },
];

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<CountryItem>(COUNTRIES[0]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  // Auto-detect country based on Timezone/Locale
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const detected = COUNTRIES.find((c) => {
        if (tz.includes('London')) return c.code === '+44';
        if (tz.includes('Mauritius')) return c.code === '+230';
        if (tz.includes('Lagos') || tz.includes('Nigeria')) return c.code === '+234';
        if (tz.includes('Accra') || tz.includes('Ghana')) return c.code === '+233';
        if (tz.includes('Dakar') || tz.includes('Senegal')) return c.code === '+221';
        if (tz.includes('Nairobi') || tz.includes('Kenya')) return c.code === '+254';
        if (tz.includes('America') || tz.includes('New_York') || tz.includes('Los_Angeles')) return c.code === '+1';
        return false;
      });
      if (detected) {
        setCountry(detected);
      } else {
        // Fallback to UK or Mauritius
        setCountry(COUNTRIES[0]); // Mauritius by default
      }
    } catch (e) {
      console.warn('Country auto-detection failed:', e);
    }
  }, []);

  /**
   * Requests a code.
   *
   * Frontend Phase 16: this used to advance to the OTP screen from its `catch`
   * block — "proceed anyway" — which sent a member to wait for a code that had
   * never been sent, with no way to tell that from a slow SMS. A failure is now
   * reported where it happened, and the member stays on the screen with the
   * button they need.
   *
   * `sendOtp` also carries the server's cooldown through to the next screen so
   * its countdown is the real interval rather than a hardcoded thirty seconds
   * (FRONTEND-PHASE16-GAP-010).
   */
  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);
    const fullNumber = `${country.code}${phone.replace(/\s+/g, '')}`;

    try {
      await sendOtp({ phoneNumber: fullNumber, purpose: 'signIn' });
      trackIntegrationEvent('verification.otp.requested', { provider: 'sms.platform' });
      router.push({ pathname: '/(auth)/otp', params: { phone: fullNumber } });
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

  const selectCountry = (item: CountryItem) => {
    setCountry(item);
    setIsModalOpen(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
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
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-1 px-6">
          <Text className="text-3xl font-extrabold text-neutral-900 mb-2 tracking-tight">Welcome back</Text>
          <Text className="text-base text-neutral-500 mb-8 leading-relaxed">
            Enter your phone number and we'll send you a verification code.
          </Text>

          {/* Label */}
          <Text className="text-sm font-semibold text-neutral-700 mb-2">Phone Number</Text>
          
          {/* International Phone Input Row */}
          <View className="flex-row items-center border border-neutral-200 rounded-2xl bg-neutral-50 px-4 h-14">
            
            {/* Country Selector Button */}
            <TouchableOpacity
              onPress={() => setIsModalOpen(true)}
              className="flex-row items-center pr-3 border-r border-neutral-200"
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Country code, ${country.name}, ${country.code}`}
              accessibilityHint="Opens the country list"
            >
              <Text className="text-xl mr-1.5">{country.flag}</Text>
              <Text className="text-base font-semibold text-neutral-800">{country.code}</Text>
              <Text className="text-xs text-neutral-400 ml-1.5">▼</Text>
            </TouchableOpacity>

            {/* Phone Input Box */}
            <TextInput
              testID="phone-input"
              placeholder="7700 900000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              className="flex-1 text-base font-semibold pl-3"
              // The visible "Phone Number" label is a sibling Text, which a
              // screen reader does not associate with the field — so the very
              // first field a member meets was announced unnamed.
              accessibilityLabel="Phone number"
              placeholderTextColor={lightTokens.color.text.placeholder}
              style={{ color: lightTokens.color.text.primary }}
            />
          </View>

          {/* Reported where it happened. The member stays on the screen with the
              button they need, instead of being advanced to wait for a code
              that was never sent. */}
          {error ? (
            <View accessibilityRole="alert" className="mt-4">
              <Text className="text-error-default text-sm font-semibold">{error.message}</Text>
              {error.hint ? (
                <Text className="text-neutral-500 text-xs font-semibold mt-1">{error.hint}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Modal Country List Selection */}
        <Modal
          visible={isModalOpen}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalOpen(false)}
        >
          <View className="flex-1 justify-end bg-black/40 relative">
            {/* Clickable Backdrop Overlay */}
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setIsModalOpen(false)}
              accessibilityLabel="Close country selector"
            />

            <View className="bg-white rounded-t-3xl p-6 min-h-[350px] shadow-2xl">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-neutral-900">Select Country</Text>
                <TouchableOpacity onPress={() => setIsModalOpen(false)} className="p-2">
                  <Text className="text-neutral-500 font-semibold">Cancel</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={COUNTRIES}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => selectCountry(item)}
                    className="flex-row items-center justify-between py-4 border-b border-neutral-100 active:bg-neutral-50"
                  >
                    <View className="flex-row items-center">
                      <Text className="text-2xl mr-3">{item.flag}</Text>
                      <Text className="text-base font-medium text-neutral-800">{item.name}</Text>
                    </View>
                    <Text className="text-base font-semibold text-neutral-500">{item.code}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        <View className="px-6 py-6">
          <Button
            label="Continue"
            isLoading={isLoading}
            disabled={phone.replace(/\s+/g, '').length < 6}
            onPress={handleContinue}
          />
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            className="mt-4 py-2 items-center active:opacity-75"
          >
            <Text className="text-sm text-neutral-500 font-medium">
              Don't have an account? <Text className="font-bold text-primary-500">Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
