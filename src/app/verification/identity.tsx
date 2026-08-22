// ── Where this screen's data goes, after Wave D-4 ────────────────────────────
//
// `POST /api/v1/trust/verifications/identity`.
//
// It was posting to `POST /trust/verify/identity` with a body of `{ docType }`.
// **That route does not exist.** It was in `mocks/handlers/trust.ts` and nowhere
// else, so in any build without the dev mock this screen's submit button
// produced a 404 that it reported as "check your connection".
//
// The real route needs the evidence it is being asked to judge:
// `documentReference` and `selfieReference`, both required, both storage keys.
// This screen had neither — `handleCaptureDoc` was a 1.8-second `setTimeout` and
// the selfie step was a tap target with no camera behind it. So the two capture
// steps are now real: `ImagePickerInput` uploads through
// `/api/v1/media/uploads/direct` and hands back a `mediaId`, and
// `mediaDocumentReference` turns that into the `media:{guid}` form both Trust's
// domain and Media's `IStorageService` implementation recognise.
//
// **`Other` is not an accepted document type here**, unlike the diaspora route.
// The six offered below are exactly `IdentityVerificationHandler
// .AcceptedDocuments`; anything else is a 400 from the type handler.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { useAuthStore } from '@/store/auth';
import { useSubmitVerification } from '@/hooks/trust';
import { mediaDocumentReference } from '@/lib/trust-api';
import { formatDocumentType } from '@/utils/format';

/** Exactly `IdentityVerificationHandler.AcceptedDocuments`. */
type IdentityDocumentType =
  | 'Passport'
  | 'DriverLicense'
  | 'NationalId'
  | 'WorkPermit'
  | 'ResidencePermit'
  | 'StudentPermit';

export default function IdentityVerificationScreen() {
  // `submitted` replaced `success`. The screen can report that documents were
  // received; it cannot report that they were accepted.
  const [step, setStep] = useState<'intro' | 'document_select' | 'capture' | 'selfie' | 'analyzing' | 'submitted'>('intro');
  const [docType, setDocType] = useState<IdentityDocumentType | null>(null);
  const [documentMediaId, setDocumentMediaId] = useState<string | null>(null);
  const [selfieMediaId, setSelfieMediaId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const { submitIdentity, error: submitError } = useSubmitVerification();

  // The two countries the app already knows about this member. `issueCountry`
  // is required by the server and was not collected anywhere on this screen;
  // rather than guess one, the member picks between the two that can plausibly
  // have issued the document — a passport comes from their nationality, a
  // residence permit from where they live.
  const { user } = useAuthStore();
  const nationality = user?.nationality ?? null;
  const residence = user?.residenceCountry ?? null;
  const [issueCountry, setIssueCountry] = useState<string | null>(null);

  const startVerification = () => {
    setStep('document_select');
  };

  const handleSelectDoc = (type: IdentityDocumentType) => {
    setDocType(type);
    setStep('capture');
  };

  /**
   * Submits the check.
   *
   * **It does not approve the member**, and it never did after Phase 16 — an
   * earlier version wrote `Identity → Approved` into the trust store from a
   * `setTimeout` and claimed a biometric face match had passed. Nothing had been
   * matched. The screen records nothing locally at all now: the server holds the
   * status and `hooks/trust.ts` invalidates the profile so the Trust Centre
   * reads it back.
   *
   * **It does not name a vendor.** Which verification provider a deployment uses
   * is a backend decision, not in any contract the client reads, and naming one
   * the client cannot confirm is in use falsely implies production connectivity.
   */
  const handleSubmit = async () => {
    if (!docType || !documentMediaId || !selfieMediaId || !issueCountry) {
      setSubmissionError(
        'Add your document photo, a selfie, and where the document was issued before submitting.'
      );
      return;
    }

    setStep('analyzing');
    setSubmissionError(null);

    try {
      await submitIdentity({
        documentType: docType,
        issueCountry,
        documentReference: mediaDocumentReference(documentMediaId),
        selfieReference: mediaDocumentReference(selfieMediaId),
      });

      setStep('submitted');
    } catch {
      setSubmissionError(
        submitError ?? 'Your documents could not be submitted. Check your connection and try again.'
      );
      setStep('selfie');
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
      <ScreenHeader title="Verify Identity" showBack={step !== 'analyzing' && step !== 'submitted'} />

      <ScrollEndScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        
        {/* Step 1: Intro */}
        {step === 'intro' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-primary-50 rounded-full items-center justify-center mb-6 border border-primary-100">
              <Text className="text-4xl">🆔</Text>
            </View>
            <Text className="text-2xl font-black text-content-primary text-center mb-3 tracking-tight">
              Secure Identity Verification
            </Text>
            <Text className="text-sm text-content-muted text-center leading-relaxed mb-6">
              To publish guides, jobs, or high-value listings, Diaspora checks your identity against
              a government document. Your documents are reviewed and you will be told the outcome.
            </Text>

            <View className="bg-surface-background border border-faint rounded-3xl p-5 w-full mb-8">
              <Text className="text-xs font-extrabold text-content-strong mb-3">🛡️ Safe & Protected Data</Text>
              <View className="gap-3">
                <Text className="text-xs text-content-muted leading-relaxed">
                  • Encrypted transfer and secure hosting.
                </Text>
                <Text className="text-xs text-content-muted leading-relaxed">
                  • Your government document details are never shown to other members.
                </Text>
                <Text className="text-xs text-content-muted leading-relaxed">
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
                    <Text className="text-base font-extrabold text-content-primary">{item.name}</Text>
                  </View>
                  <Text className="text-content-faint text-lg">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 3: The document itself. A real upload, not a timer. */}
        {step === 'capture' && (
          <View>
            <Text className="text-xl font-black text-content-primary mb-2">Photograph your {formatDocumentType(docType)}</Text>
            <Text className="text-xs text-content-faint mb-6 leading-relaxed">
              Make sure the whole page is in frame and the text is readable.
            </Text>

            {/*
              `verificationDocument` rather than `image`. Media applies a
              different size ceiling and a private-by-default visibility to that
              kind, which is what an immigration document needs. `owner` is null
              because the verification does not exist yet — the reference travels
              with the submission instead.
            */}
            <ImagePickerInput
              label="Document photo"
              value={documentMediaId}
              onChangeImage={setDocumentMediaId}
              kind="verificationDocument"
              aspect={[3, 2]}
            />

            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mt-6 mb-2">
              Where was it issued?
            </Text>
            <View className="flex-row gap-2 flex-wrap mb-6">
              {[nationality, residence]
                .filter((code, index, all): code is string =>
                  typeof code === 'string' && code.length > 0 && all.indexOf(code) === index
                )
                .map((code) => (
                  <TouchableOpacity
                    key={code}
                    onPress={() => setIssueCountry(code)}
                    className={`px-4 py-2.5 rounded-xl border ${issueCountry === code ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'}`}
                  >
                    <Text className={`text-xs font-bold ${issueCountry === code ? 'text-primary-500' : 'text-content-tertiary'}`}>
                      {code}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            {nationality === null && residence === null && (
              <Text className="text-xs text-error-default leading-relaxed mb-4">
                We do not know which countries you are connected to yet. Finish signing in and try again.
              </Text>
            )}

            <Button
              label="Continue"
              disabled={documentMediaId === null || issueCountry === null}
              onPress={() => setStep('selfie')}
              className="w-full"
            />
          </View>
        )}

        {/* Step 4: The selfie. Required by the server for this type. */}
        {step === 'selfie' && (
          <View>
            <Text className="text-xl font-black text-content-primary mb-2">Add a selfie</Text>
            <Text className="text-xs text-content-faint mb-6 leading-relaxed">
              A reviewer compares it with the photo on your document. Face the camera in good light.
            </Text>

            <ImagePickerInput
              label="Selfie"
              value={selfieMediaId}
              onChangeImage={setSelfieMediaId}
              kind="verificationDocument"
              circle
              aspect={[1, 1]}
            />

            {submissionError ? (
              <View accessibilityRole="alert" className="w-full my-4">
                <Text className="text-error-default text-sm font-semibold text-center">
                  {submissionError}
                </Text>
              </View>
            ) : null}

            <Button
              label="Submit for review"
              disabled={selfieMediaId === null}
              onPress={() => void handleSubmit()}
              className="w-full mt-6"
            />
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

      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
