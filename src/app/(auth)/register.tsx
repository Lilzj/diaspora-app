import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

export default function RegisterScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
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

  const handleContinue = () => {
    // Proceed to origin country selection first
    router.push({
      pathname: '/(auth)/choose-origin',
      params: { fullName, email, phone },
    });
  };

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
            disabled={!fullName || !email}
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
