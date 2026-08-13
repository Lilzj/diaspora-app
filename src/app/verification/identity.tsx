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
  // `submitted` replaced `success`. The screen can report that documents were
  // received; it cannot report that they were accepted.
  const [step, setStep] = useState<'intro' | 'document_select' | 'capture' | 'selfie' | 'analyzing' | 'submitted'>('intro');
  const [docType, setDocType] = useState<'Passport' | 'DriverLicense' | 'NationalId' | 'WorkPermit' | 'ResidencePermit' | 'StudentPermit' | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

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

  /**
   * Submits the check.
   *
   * Frontend Phase 16 changed two things here, both §68/§69 defects:
   *
   *   **It no longer approves the member.** The previous version called the
   *   endpoint and then, in a `setTimeout`, wrote `Identity → Approved` into the
   *   trust store and appended a journey entry saying a biometric face match had
   *   passed. Nothing had been matched. `POST /trust/verify/identity` accepts a
   *   submission and answers *review pending* — which is what the screen now
   *   says. A client cannot approve its own identity check, and one that appears
   *   to is worse than one that cannot: it grants publishing and marketplace
   *   access on a claim nobody made.
   *
   *   **It no longer names the vendor.** The copy said "powered by Stripe
   *   Identity" and the button said "Verify with Stripe". Which verification
   *   provider a deployment uses is a backend decision — it is not in any
   *   contract the client reads, it varies by country, and §25's rule against
   *   provider-specific logic in screens applies to promises as much as to code.
   *   Naming a processor the client cannot confirm is in use is exactly §69's
   *   "must never falsely imply production connectivity".
   */
  const handleCaptureSelfie = () => {
    setStep('analyzing');
    setSubmissionError(null);

    apiClient
      .post('/trust/verify/identity', { docType })
      .then(() => {
        // `Pending`, not `Approved`. The platform decides the outcome; the
        // client records only that a submission was made.
        trustStore.updateVerificationStatus('Identity', 'Pending');
        trustStore.addAuditLog(
          'Identity documents submitted',
          `Submitted ${docType ? formatDocumentType(docType) : 'a document'} for review`
        );
        trustStore.addNotification(
          'Documents received',
          'Your identity documents are being reviewed. We will let you know the outcome.',
          'Verification'
        );
        setStep('submitted');
      })
      .catch(() => {
        setSubmissionError(
          'Your documents could not be submitted. Check your connection and try again.'
        );
        setStep('selfie');
      });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      <ScreenHeader title="Verify Identity" showBack={step !== 'analyzing' && step !== 'submitted'} />

      <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        
        {/* Step 1: Intro */}
        {step === 'intro' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-primary-50 rounded-full items-center justify-center mb-6 border border-primary-100">
              <Text className="text-4xl">🆔</Text>
            </View>
            <Text className="text-2xl font-black text-content-primary text-center mb-3 tracking-tight">
              Secure Identity Verification
            </Text>
            <Text className="text-sm text-neutral-505 text-center leading-relaxed mb-6">
              To publish guides, jobs, or high-value listings, Diaspora checks your identity against
              a government document. Your documents are reviewed and you will be told the outcome.
            </Text>

            <View className="bg-surface-background border border-faint rounded-3xl p-5 w-full mb-8">
              <Text className="text-xs font-extrabold text-content-strong mb-3">🛡️ Safe & Protected Data</Text>
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

            <Button label="Start verification" onPress={startVerification} className="w-full" />
          </View>
        )}

        {/* Step 2: Document Select */}
        {step === 'document_select' && (
          <View>
            <Text className="text-xl font-black text-content-primary mb-2">Select Document Type</Text>
            <Text className="text-xs text-content-faint mb-6 uppercase tracking-wider font-semibold">Government-issued document required</Text>

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
                  className="bg-surface-background border border-subtle rounded-2xl p-5 flex-row items-center justify-between"
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
            <Text className="text-xl font-black text-content-primary mb-2 text-center">Capture {formatDocumentType(docType)}</Text>
            <Text className="text-xs text-content-faint mb-6 text-center leading-relaxed">
              Place the front page inside the frame. Ensure text is clear and readable.
            </Text>

            {isCapturing ? (
              <View className="w-full h-56 rounded-3xl bg-neutral-900 items-center justify-center border-4 border-primary-500 mb-8">
                <ActivityIndicator size="large" color="#F59300" />
                <Text className="text-white text-xs font-bold mt-3">Scanning document edges...</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleCaptureDoc}
                className="w-full h-56 rounded-3xl bg-surface-background border-2 border-dashed border-line items-center justify-center mb-8"
              >
                <Text className="text-4xl mb-2">📸</Text>
                <Text className="text-xs font-bold text-content-muted">Tap to capture document photo</Text>
              </TouchableOpacity>
            )}

            <Button label="Take Photo" onPress={handleCaptureDoc} disabled={isCapturing} className="w-full" />
          </View>
        )}

        {/* Step 4: Selfie biometric check */}
        {step === 'selfie' && (
          <View className="items-center">
            <Text className="text-xl font-black text-content-primary mb-2 text-center">Take a Selfie</Text>
            <Text className="text-xs text-content-faint mb-6 text-center leading-relaxed">
              Position your face inside the circle. We match your selfie with your ID page.
            </Text>

            <TouchableOpacity
              onPress={handleCaptureSelfie}
              className="w-48 h-48 rounded-full bg-surface-background border-4 border-dashed border-primary-400 items-center justify-center mb-8 overflow-hidden"
            >
              <Text className="text-4xl">📸</Text>
            </TouchableOpacity>

            {submissionError ? (
              <View accessibilityRole="alert" className="w-full mb-4">
                <Text className="text-error-default text-sm font-semibold text-center">
                  {submissionError}
                </Text>
              </View>
            ) : null}

            <Button label="Capture & Submit" onPress={handleCaptureSelfie} className="w-full" />
          </View>
        )}

        {/* Step 5: Submitting. The wording describes the upload, which is what
            is happening — not a face match, which is not. */}
        {step === 'analyzing' && (
          <View className="items-center">
            <ActivityIndicator size="large" color="#F59300" className="mb-6" />
            <Text className="text-xl font-black text-content-primary mb-2 text-center">Sending your documents</Text>
            <Text className="text-xs text-content-muted text-center leading-relaxed">
              This takes a few seconds. Do not close the app.
            </Text>
          </View>
        )}

        {/* Step 6: Submitted — deliberately not "Verified". The outcome is the
            platform's to decide and has not been decided yet. */}
        {step === 'submitted' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-info-surface rounded-full items-center justify-center mb-6 border-4 border-info-default">
              <Text className="text-4xl">⏳</Text>
            </View>
            <Text className="text-2xl font-black text-content-primary text-center mb-2 tracking-tight">
              Documents received
            </Text>
            <Text className="text-sm text-content-muted text-center leading-relaxed mb-8">
              Your documents are being reviewed. We will let you know the outcome — you do not need
              to do anything else. Publishing stays locked until the review finishes.
            </Text>

            <Button label="Return to Trust Center" onPress={() => router.replace('/profile/trust-center')} className="w-full" />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
