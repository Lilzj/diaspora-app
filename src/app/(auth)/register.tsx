import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { setRegistrationDraft } from '@/lib/registration-draft';

/**
 * The server's floor, mirrored so the member is told before the round trip.
 *
 * The backend is authoritative and will refuse a weak password with a 400; this
 * only saves a wasted request and a worse error message. It deliberately does
 * not try to reproduce the full policy — a client that guesses the rules and
 * gets them wrong rejects passwords the server would have accepted.
 */
const MIN_PASSWORD_LENGTH = 8;

export default function RegisterScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');

  const openTerms = () => {
    setModalTitle('Terms of Service');
    setModalContent(
      'Welcome to Diaspora. By using our platform, you agree to connect honestly, share authentic feedback, and help support fellow community members. We do not tolerate spam, hate speech, or fraudulent business practices. All reviews and contributions are verified by local residents.'
    );
    setIsModalOpen(true);
  };

  const openPrivacy = () => {
    setModalTitle('Privacy Policy');
    setModalContent(
      'Your privacy is our priority. We collect phone verification details and profile settings solely to maintain trust and prevent fake reviews. We do not share your private contact information with third parties. Listings and guides published are public to help other diaspora members.'
    );
    setIsModalOpen(true);
  };

  /**
   * Remediation Wave A.
   *
   * `POST /api/v1/auth/register` requires a password — `RegisterRequest` marks
   * it `required` — and this screen never collected one, which is part of why
   * registration had no backend call behind it at all. The field is here
   * because the server's contract says so, not because a design asked for it.
   *
   * The password does **not** go into the route params the next three screens
   * forward to each other. See `lib/registration-draft.ts`.
   */
  const handleContinue = () => {
    setRegistrationDraft({ fullName, email: email || undefined, password });

    router.push({
      pathname: '/(auth)/choose-origin',
      params: { fullName, email, phone },
    });
  };

  const canContinue =
    fullName.trim() !== '' && email.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH;

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="" showBack={true} />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
          <Text className="text-3xl font-extrabold text-content-primary mb-2 tracking-tight">Join your community</Text>
          <Text className="text-base text-content-muted mb-8 leading-relaxed">
            Welcome to Diaspora! Let's get your profile set up so you can find verified local services, read trusted guides, and connect with other residents.
          </Text>

          <Input
            label="Full Name"
            placeholder="e.g. Amara Kone"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <Input
            label="Email Address"
            placeholder="e.g. amara@diaspora.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Text className="text-xs text-content-faint -mt-2 mb-2">
            You will use this to sign in if you ever lose access to your phone number.
          </Text>

          {/* Interactive Terms & Privacy Links */}
          <View className="mt-4">
            <Text className="text-xs text-content-faint leading-relaxed">
              By creating an account, you agree to our{' '}
              <Text onPress={openTerms} className="text-primary-500 font-semibold underline">
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text onPress={openPrivacy} className="text-primary-500 font-semibold underline">
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </ScrollView>

        <View className="px-6 py-6">
          <Button
            label="Next: Choose Origin"
            disabled={!canContinue}
            onPress={handleContinue}
          />
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            className="mt-4 py-2 items-center active:opacity-75"
          >
            <Text className="text-sm text-content-muted font-medium">
              Already have an account? <Text className="font-bold text-primary-500">Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Info Modal for Terms/Privacy */}
      <Modal
        visible={isModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsModalOpen(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <View className="flex-1 justify-center items-center bg-black/50 px-6 relative">
          {/* Clickable Backdrop Overlay */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsModalOpen(false)}
            accessibilityLabel="Close terms modal"
          />

          <View className="bg-surface-card rounded-3xl p-6 shadow-2xl w-full max-w-[340px]">
            <Text className="text-xl font-bold text-content-primary mb-4">{modalTitle}</Text>
            <Text className="text-sm text-content-tertiary leading-relaxed mb-6">
              {modalContent}
            </Text>
            <Button label="I Understand" onPress={() => setIsModalOpen(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
