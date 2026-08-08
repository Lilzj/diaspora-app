import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTrustStore } from '@/store/trust';
import { apiClient } from '@/lib/apiClient';
import { formatDocumentType } from '@/utils/format';

export default function IdentityVerificationScreen() {
  const trustStore = useTrustStore();
  const [step, setStep] = useState<'intro' | 'document_select' | 'capture' | 'selfie' | 'analyzing' | 'success'>('intro');
  const [docType, setDocType] = useState<'Passport' | 'DriverLicense' | 'NationalId' | 'WorkPermit' | 'ResidencePermit' | 'StudentPermit' | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const startVerification = () => {
    setStep('document_select');
  };

  const handleSelectDoc = (type: 'Passport' | 'DriverLicense' | 'NationalId' | 'WorkPermit' | 'ResidencePermit' | 'StudentPermit') => {
    setDocType(type);
    setStep('capture');
  };

  const handleCaptureDoc = () => {
    setIsCapturing(true);
    setTimeout(() => {
      setIsCapturing(false);
      setStep('selfie');
    }, 1800);
  };

  const handleCaptureSelfie = () => {
    setStep('analyzing');
    // Simulate Stripe biometric facial matching check
    apiClient.post('/trust/verify/identity', { docType, country: 'United Kingdom' })
      .then(() => {
        setTimeout(() => {
          // Update local store
          trustStore.updateVerificationStatus('Identity', 'Approved');
          
          // Log Audit & Journey Event
          trustStore.addAuditLog('Identity Verified', `Biometric Stripe Identity Verification passed using ${docType}`);
          
          useTrustStore.setState((state) => {
            const now = new Date();
            return {
              trustJourney: [
                ...state.trustJourney,
                {
                  eventId: `je-id-${Date.now()}`,
                  type: 'Identity',
                  label: 'Identity Verified',
                  timestamp: now.toISOString().split('T')[0],
                  icon: '🆔',
                  description: 'Stripe identity validation and biometric face comparison check passed.',
                }
              ]
            };
          });

          trustStore.addNotification(
            'Identity Verified',
            'Your identity verification has been processed and approved.',
            'Verification'
          );

          setStep('success');
        }, 2200);
      })
      .catch(() => {
        setStep('intro');
      });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      <ScreenHeader title="Verify Identity" showBack={step !== 'analyzing' && step !== 'success'} />

      <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        
        {/* Step 1: Intro */}
        {step === 'intro' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-primary-50 rounded-full items-center justify-center mb-6 border border-primary-100">
              <Text className="text-4xl">🆔</Text>
            </View>
            <Text className="text-2xl font-black text-neutral-900 text-center mb-3 tracking-tight">
              Secure Identity Verification
            </Text>
            <Text className="text-sm text-neutral-505 text-center leading-relaxed mb-6">
              To publish guides, jobs, or high-value listings, we use secure identity checks powered by Stripe Identity to keep our community safe.
            </Text>

            <View className="bg-neutral-50 border border-neutral-100 rounded-3xl p-5 w-full mb-8">
              <Text className="text-xs font-extrabold text-neutral-800 mb-3">🛡️ Safe & Protected Data</Text>
              <View className="gap-3">
                <Text className="text-xs text-neutral-505 leading-relaxed">
                  • Encrypted transfer and secure hosting.
                </Text>
                <Text className="text-xs text-neutral-505 leading-relaxed">
                  • Your government document details are never shown to other members.
                </Text>
                <Text className="text-xs text-neutral-505 leading-relaxed">
                  • System-level deletion of files after verification finishes.
                </Text>
              </View>
            </View>

            <Button label="Verify with Stripe" onPress={startVerification} className="w-full" />
          </View>
        )}

        {/* Step 2: Document Select */}
        {step === 'document_select' && (
          <View>
            <Text className="text-xl font-black text-neutral-900 mb-2">Select Document Type</Text>
            <Text className="text-xs text-neutral-400 mb-6 uppercase tracking-wider font-semibold">Government-issued document required</Text>

            <View className="gap-3">
              {[
                { id: 'Passport' as const, name: 'Passport', icon: '🛂' },
                { id: 'DriverLicense' as const, name: 'Driving License', icon: '🪪' },
                { id: 'NationalId' as const, name: 'National Identity Card', icon: '💳' },
                { id: 'WorkPermit' as const, name: 'Work Permit', icon: '💼' },
                { id: 'ResidencePermit' as const, name: 'Residence Permit', icon: '🏠' },
                { id: 'StudentPermit' as const, name: 'Student Permit', icon: '🎓' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleSelectDoc(item.id)}
                  className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 flex-row items-center justify-between"
                >
                  <View className="flex-row items-center">
                    <Text className="text-2xl mr-4">{item.icon}</Text>
                    <Text className="text-base font-extrabold text-neutral-850">{item.name}</Text>
                  </View>
                  <Text className="text-neutral-300 text-lg">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 3: Capture Document */}
        {step === 'capture' && (
          <View className="items-center">
            <Text className="text-xl font-black text-neutral-900 mb-2 text-center">Capture {formatDocumentType(docType)}</Text>
            <Text className="text-xs text-neutral-400 mb-6 text-center leading-relaxed">
              Place the front page inside the frame. Ensure text is clear and readable.
            </Text>

            {isCapturing ? (
              <View className="w-full h-56 rounded-3xl bg-neutral-900 items-center justify-center border-4 border-primary-500 mb-8">
                <ActivityIndicator size="large" color="#FF6B00" />
                <Text className="text-white text-xs font-bold mt-3">Scanning document edges...</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleCaptureDoc}
                className="w-full h-56 rounded-3xl bg-neutral-50 border-2 border-dashed border-neutral-300 items-center justify-center mb-8"
              >
                <Text className="text-4xl mb-2">📸</Text>
                <Text className="text-xs font-bold text-neutral-500">Tap to capture document photo</Text>
              </TouchableOpacity>
            )}

            <Button label="Take Photo" onPress={handleCaptureDoc} disabled={isCapturing} className="w-full" />
          </View>
        )}

        {/* Step 4: Selfie biometric check */}
        {step === 'selfie' && (
          <View className="items-center">
            <Text className="text-xl font-black text-neutral-900 mb-2 text-center">Take a Selfie</Text>
            <Text className="text-xs text-neutral-400 mb-6 text-center leading-relaxed">
              Position your face inside the circle. We match your selfie with your ID page.
            </Text>

            <TouchableOpacity
              onPress={handleCaptureSelfie}
              className="w-48 h-48 rounded-full bg-neutral-50 border-4 border-dashed border-primary-400 items-center justify-center mb-8 overflow-hidden"
            >
              <Text className="text-4xl">📸</Text>
            </TouchableOpacity>

            <Button label="Capture & Submit" onPress={handleCaptureSelfie} className="w-full" />
          </View>
        )}

        {/* Step 5: Analyzing */}
        {step === 'analyzing' && (
          <View className="items-center">
            <ActivityIndicator size="large" color="#FF6B00" className="mb-6" />
            <Text className="text-xl font-black text-neutral-900 mb-2 text-center">Biometric Verification Active</Text>
            <Text className="text-xs text-neutral-500 text-center leading-relaxed">
              Verifying document authenticity and matching face markers. This takes about 10-15 seconds...
            </Text>
          </View>
        )}

        {/* Step 6: Success */}
        {step === 'success' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-success-surface rounded-full items-center justify-center mb-6 border-4 border-success-default">
              <Text className="text-4xl">✓</Text>
            </View>
            <Text className="text-2xl font-black text-neutral-900 text-center mb-2 tracking-tight">
              Verification Successful
            </Text>
            <Text className="text-sm text-neutral-500 text-center leading-relaxed mb-8">
              Thank you! Your identity has been verified. You've unlocked publishing and community expert ranks.
            </Text>

            <Button label="Return to Trust Center" onPress={() => router.replace('/profile/trust-center')} className="w-full" />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
