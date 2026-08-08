import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTrustStore } from '@/store/trust';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { useNotification } from '@/providers/notification-provider';

export default function PhoneVerificationScreen() {
  const trustStore = useTrustStore();
  const { showAlert } = useNotification();
  const [phoneNumber, setPhoneNumber] = useState('+44 7700 900123');
  const [isEditing, setIsEditing] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'display' | 'request_otp' | 'verify_otp'>('display');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestOtp = () => {
    if (phoneNumber.length < 7) {
      showAlert({ type: 'error', title: 'Invalid Number', message: 'Please enter a valid phone number.' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('verify_otp');
    }, 1000);
  };

  const handleVerifyOtp = () => {
    if (otpCode.length < 6) {
      showAlert({ type: 'error', title: 'Error', message: 'Please enter a valid 6-digit OTP code.' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      
      // Update phone verification status
      trustStore.updateVerificationStatus('Phone', 'Approved');
      trustStore.addAuditLog('Phone Number Changed', `Associated phone updated to ${phoneNumber}`);
      
      showAlert({
        type: 'success',
        title: 'Phone Number Updated',
        message: 'Your mobile line has been verified and updated successfully.',
        buttons: [
          {
            text: 'OK',
            onPress: () => {
              setStep('display');
              setIsEditing(false);
              router.back();
            }
          }
        ]
      });
    }, 1200);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      <ScreenHeader title="Phone Verification" />

      <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        
        {step === 'display' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-neutral-50 border border-neutral-200 rounded-full items-center justify-center mb-6">
              <Text className="text-4xl">📱</Text>
            </View>

            <Text className="text-2xl font-black text-neutral-900 tracking-tight mb-2">Phone Verification</Text>
            <Text className="text-sm text-neutral-500 text-center leading-relaxed mb-6">
              Your phone verification helps secure your sessions and is a prerequisite for creating jobs and selling in the marketplace.
            </Text>

            <View className="w-full bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-8">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-neutral-400 font-extrabold uppercase tracking-widest">Active Line</Text>
                <Text className="text-[10px] bg-success-surface text-success-default px-2 py-0.5 rounded font-extrabold">✓ ACTIVE</Text>
              </View>
              <Text className="text-xl font-bold text-neutral-900">{phoneNumber}</Text>
            </View>

            <Button label="Change Phone Number" variant="outline" onPress={() => setStep('request_otp')} className="w-full" />
          </View>
        )}

        {step === 'request_otp' && (
          <View>
            <Text className="text-2xl font-black text-neutral-900 mb-2">Update Phone Number</Text>
            <Text className="text-sm text-neutral-500 mb-6 leading-relaxed">
              We'll send a 6-digit confirmation code via SMS to verify your updated phone line.
            </Text>

            <PhoneInputWithCode
              label="Phone Number"
              value={phoneNumber}
              onChangePhone={setPhoneNumber}
            />

            <Button label={isLoading ? 'Sending SMS...' : 'Send Verification OTP'} disabled={isLoading} onPress={handleRequestOtp} className="w-full" />
          </View>
        )}

        {step === 'verify_otp' && (
          <View>
            <Text className="text-2xl font-black text-neutral-900 mb-2">Verify OTP Code</Text>
            <Text className="text-sm text-neutral-500 mb-6 leading-relaxed">
              Enter the 6-digit code sent to <Text className="font-bold text-neutral-800">{phoneNumber}</Text>
            </Text>

            <Text className="text-xs text-neutral-400 font-extrabold uppercase tracking-widest mb-2">Verification Code</Text>
            <TextInput
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-center text-xl font-black tracking-widest mb-6"
              style={{ color: '#1F2937' }}
              placeholderTextColor="#9CA3AF"
            />

            <Button label={isLoading ? 'Verifying OTP...' : 'Verify & Link Number'} disabled={isLoading} onPress={handleVerifyOtp} className="w-full" />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
