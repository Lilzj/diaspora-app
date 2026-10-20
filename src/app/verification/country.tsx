// ── Where this screen's data goes, after Wave D-4 ────────────────────────────
//
// `POST /api/v1/trust/verifications/country`.
//
// **This screen used to approve its own verification.** It wrote the submission
// into `store/trust.ts`, then set a two-second timer that flipped
// `Country → Approved`, marked the country timeline entry verified, awarded
// itself 100 reputation points and a four-star rating, and appended a trust
// journey node saying *"Compliance team approved document"*. No compliance team
// had seen anything; the alert it showed even said so — *"review is automated
// and finishes in 2-3 seconds for mock review"* — in production copy.
//
// The gates that opened on the back of it were real: `trustEngine.evaluateAction`
// reads `verifications.Country === 'Approved'` and `countryReputations`, so two
// seconds after opening this form a member could publish guides.
//
// Everything after the POST is gone. The server decides, and the Trust Centre
// reads the decision.
//
// Three shape changes the route forced, each of which was a real gap:
//
//   * **`countryCode`, not a country name.** The field was free text and the
//     old code took `country.slice(0, 2).toUpperCase()` as the ISO code, so
//     "United Kingdom" became `UN`.
//   * **`documentType` must be one the handler accepts.** `BRP` is not a
//     `VerificationDocumentType`; it would have been coerced to `Other`, which
//     Country accepts — so it would have gone through as an unnamed document.
//   * **A real document.** `handleFileAttach` was a 1.2-second timer that
//     invented a filename. The route needs a storage key.

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { router } from 'expo-router';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { useMyVerifications, useSubmitVerification } from '@/hooks/trust';
import {
  isVerificationGranted,
  isVerificationInFlight,
  latestVerificationOfType,
  mediaDocumentReference,
  SUPPORTING_NOTES_MAX_LENGTH,
} from '@/lib/trust-api';
import type { WireVerificationDocumentType } from '@/types/trust';
import { allCountries } from '@/mocks/countries';
import { useNotification } from '@/providers/notification-provider';
import { backOr } from '@/lib/navigation';

/**
 * The document types `CountryVerificationHandler` accepts.
 *
 * Not the four the dropdown used to offer. `BRP` is not a member of
 * `VerificationDocumentType` at all — the server would have parsed it to
 * `Other`, which this handler happens to accept, so the submission would have
 * succeeded while telling the reviewer nothing about what they were looking at.
 */
const COUNTRY_DOCUMENT_OPTIONS: { key: WireVerificationDocumentType; label: string }[] = [
  { key: 'ResidencePermit', label: 'Residence permit (e.g. BRP)' },
  { key: 'PassportStamp', label: 'Passport entry stamp' },
  { key: 'Visa', label: 'Valid visa document' },
  { key: 'StudentVisa', label: 'Student visa' },
  { key: 'WorkPermit', label: 'Work permit' },
  { key: 'UtilityBill', label: 'Utility bill' },
  { key: 'BankStatement', label: 'Bank statement' },
  { key: 'ProofOfAddress', label: 'Other proof of address' },
];

export default function CountryVerificationScreen() {
  const { showAlert } = useNotification();
  const { submitCountry, isPending, error: submitError } = useSubmitVerification();

  const [countryQuery, setCountryQuery] = useState('');
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [arrivalDate, setArrivalDate] = useState('');
  const [calculatedYears, setCalculatedYears] = useState<number | null>(null);

  const [docType, setDocType] = useState<WireVerificationDocumentType>('ResidencePermit');
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [documentMediaId, setDocumentMediaId] = useState<string | null>(null);

  const country = useMemo(
    () => allCountries.find((item) => item.code === countryCode) ?? null,
    [countryCode]
  );

  const countryMatches = useMemo(() => {
    const needle = countryQuery.trim().toLowerCase();
    if (needle.length < 2 || countryCode !== null) return [];
    return allCountries
      .filter((item) => item.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [countryQuery, countryCode]);

  // Automatically calculate residency years based on arrival date string (e.g. 2024-05-15)
  const handleArrivalDateChange = (text: string) => {
    setArrivalDate(text);
    
    // Simple date parsing check: YYYY-MM-DD
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (regex.test(text)) {
      const year = parseInt(text.split('-')[0], 10);
      const currentYear = new Date().getFullYear(); // e.g. 2026
      const diff = currentYear - year;
      if (diff >= 0) {
        setCalculatedYears(diff);
      } else {
        setCalculatedYears(null);
      }
    } else {
      setCalculatedYears(null);
    }
  };

  const handleSubmit = async () => {
    if (!countryCode) {
      showAlert({
        type: 'error',
        title: 'Choose a country',
        message: 'Pick the country from the list so we send the right community.',
      });
      return;
    }
    if (!arrivalDate.trim()) {
      // Optional on the DTO, required by `CountryVerificationHandler.Validate`.
      // Caught here so the member gets a sentence rather than a 400.
      showAlert({
        type: 'error',
        title: 'Arrival date needed',
        message: 'Your arrival date is what establishes how long you have lived there.',
      });
      return;
    }
    if (!documentMediaId) {
      showAlert({
        type: 'error',
        title: 'Document needed',
        message: 'Attach the document that shows you live there.',
      });
      return;
    }

    try {
      const submitted = await submitCountry({
        countryCode,
        documentType: docType,
        documentReference: mediaDocumentReference(documentMediaId),
        arrivalDate,
        supportingNotes: additionalNotes.trim() || null,
      });

      showAlert({
        type: 'success',
        title: 'Sent for review',
        // The status the server actually returned. It is `Pending` in the
        // ordinary case and `Rejected` when a rule refused without a human —
        // an expired document, for instance — and saying "submitted" for both
        // is how a refusal goes unnoticed.
        message:
          submitted.status === 'Rejected'
            ? (submitted.rejectionReasonDetails ??
              'Your documents were refused. Open the Trust Centre for the reason.')
            : `Your residency evidence for ${country?.name ?? countryCode} is with the compliance team. We will let you know the outcome.`,
        buttons: [{ text: 'Return', onPress: () => router.replace('/profile/trust-center') }],
      });
    } catch {
      showAlert({
        type: 'error',
        title: 'Not submitted',
        message: submitError ?? 'We could not send your documents just now. Please try again.',
      });
    }
  };

  // A case already with the review team is shown, not a blank form to fill in
  // again (20 Oct 2026). Rejected or "need more information" cases fall
  // through to the form, which is how the member answers them.
  const { verifications } = useMyVerifications();
  const current = latestVerificationOfType(verifications, 'Country' as never);
  if (current && (isVerificationInFlight(current.status) || isVerificationGranted(current.status))) {
    const approved = isVerificationGranted(current.status);
    return (
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-4xl mb-3">{approved ? '✅' : '⏳'}</Text>
        <Text className="text-lg font-black text-content-primary text-center">
          {approved ? 'Your residency is verified' : 'Your residency is being reviewed'}
        </Text>
        <Text className="text-sm text-content-muted text-center mt-2 leading-relaxed max-w-[300px]">
          {approved
            ? 'Nothing more to do here.'
            : `You sent it on ${new Date(current.submittedAt).toLocaleDateString()}. We will tell you as soon as it is decided.`}
        </Text>
        <TouchableOpacity
          onPress={() => backOr('/profile/trust-center')}
          accessibilityRole="button"
          className="mt-6 bg-primary-500 px-6 py-3 rounded-full"
        >
          <Text className="text-sm font-black text-white">Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-background">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => backOr()} className="mr-4">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-content-primary tracking-tight">Verify Residency</Text>
      </View>

      {/* The address and evidence fields sit low in this form; with a plain
          ScrollView the keyboard covered them and the submit button. */}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        
        {/* Verification introductory statement */}
        <Text className="text-xs font-semibold text-content-muted mb-6 leading-relaxed">
          Verify your country residency to unlock verified badges, contributor capabilities, and directory placements.
        </Text>

        {/*
          Input: Country.

          A picker, not free text. The server wants an ISO 3166-1 alpha-2 code
          and validates the length; the old field took the first two letters of
          whatever was typed, so "United Kingdom" was submitted as `UN`.
        */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Target Country</Text>
        <TextInput
          value={country ? `${country.flag} ${country.name}` : countryQuery}
          onChangeText={(next) => {
            setCountryCode(null);
            setCountryQuery(next);
          }}
          placeholder="Start typing, e.g. United Kingdom"
          accessibilityLabel="Target country, required"
          className="bg-surface-card border border-subtle rounded-2xl p-4 mb-2 text-xs font-semibold text-content-strong"
        />

        {countryMatches.length > 0 && (
          <View className="bg-surface-card border border-subtle rounded-2xl mb-4 overflow-hidden">
            {countryMatches.map((item) => (
              <TouchableOpacity
                key={item.code}
                onPress={() => {
                  setCountryCode(item.code);
                  setCountryQuery(item.name);
                }}
                className="py-3 px-4 border-b border-faint last:border-b-0 flex-row items-center"
              >
                <Text className="text-base mr-3">{item.flag}</Text>
                <Text className="text-xs font-bold text-content-secondary">{item.name}</Text>
                <Text className="text-[10px] text-content-faint ml-auto font-black">{item.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {countryMatches.length === 0 && <View className="mb-2" />}

        {/* Input: Date of Arrival */}
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Date of Arrival</Text>
          {calculatedYears !== null && (
            <Text className="text-[10px] font-black text-success-default bg-[#E6F4EA] px-2 py-0.5 rounded">
              {calculatedYears} years calculated
            </Text>
          )}
        </View>
        <DatePickerInput
          label=""
          value={arrivalDate}
          onChangeDate={handleArrivalDateChange}
          placeholder="Select arrival date..."
        />

        {/* Dropdown Input: Document Type */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Document Type</Text>
        <TouchableOpacity
          onPress={() => setIsDocSelectorOpen(!isDocSelectorOpen)}
          className="bg-surface-card border border-subtle rounded-2xl p-4 mb-4 flex-row justify-between items-center"
        >
          <Text className="text-xs font-semibold text-content-strong">
            {COUNTRY_DOCUMENT_OPTIONS.find((option) => option.key === docType)?.label ?? docType}
          </Text>
          <Text className="text-content-faint text-xs">▼</Text>
        </TouchableOpacity>

        {/* Document Type Dropdown Selector Options */}
        {isDocSelectorOpen && (
          <View className="bg-surface-card border border-subtle rounded-2xl p-2.5 mb-4 shadow-md">
            {COUNTRY_DOCUMENT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => {
                  setDocType(option.key);
                  setIsDocSelectorOpen(false);
                  setDocumentMediaId(null); // clear the attachment as the type changed
                }}
                className="py-3 px-4 border-b border-faint last:border-b-0"
              >
                <Text className="text-xs font-bold text-content-secondary">{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/*
          Document upload. A real one — `ImagePickerInput` uploads through Media
          and hands back a `mediaId`, which becomes the `media:{guid}` reference
          the submission carries. It replaces a 1.2-second timer that invented a
          filename and a file size.
        */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Upload Verification File</Text>
        <ImagePickerInput
          label="Verification document"
          value={documentMediaId}
          onChangeImage={setDocumentMediaId}
          kind="verificationDocument"
          aspect={[3, 2]}
        />
        <Text className="text-[9px] text-content-faint mt-1 mb-6 font-semibold">
          Photographs up to 5 MB. Make sure your name and the date are readable.
        </Text>

        {/* Additional notes */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Optional Additional Notes</Text>
        <TextInput
          value={additionalNotes}
          onChangeText={(next) => setAdditionalNotes(next.slice(0, SUPPORTING_NOTES_MAX_LENGTH))}
          placeholder="Mention details that may speed up your review..."
          accessibilityLabel="Additional notes, optional"
          className="bg-surface-card border border-subtle rounded-2xl p-4 mb-6 text-xs font-semibold text-content-strong min-h-[60px]"
          multiline
        />

        {submitError !== null && (
          <Text className="text-xs text-error-default font-semibold mb-3">{submitError}</Text>
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={() => void handleSubmit()}
          disabled={isPending}
          className={`rounded-2xl py-4 items-center justify-center shadow-lg shadow-primary-500/10 mb-8 ${isPending ? 'bg-primary-300' : 'bg-primary-500'}`}
        >
          {isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-extrabold text-sm">Submit For Verification</Text>
          )}
        </TouchableOpacity>

        {/* Trust compliance guidelines / privacy policies */}
        <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-10">
          <Text className="text-xs font-bold text-content-strong mb-3">🛡️ Safe & Secure Compliance Guidelines</Text>
          
          <View className="space-y-3">
            <View>
              <Text className="text-xs font-bold text-content-secondary">Why documents are required:</Text>
              <Text className="text-[10px] text-content-muted leading-relaxed mt-0.5">
                To prevent identity impersonation, false reviews, and ensure a highly trusted directory network for African diaspora communities.
              </Text>
            </View>
            <View className="mt-3">
              <Text className="text-xs font-bold text-content-secondary">Privacy & Encryption protection:</Text>
              <Text className="text-[10px] text-content-muted leading-relaxed mt-0.5">
                All documents are encrypted using bank-grade AES-256 standard and saved in isolated storage containers. Only certified compliance reviewers have access.
              </Text>
            </View>
            <View className="mt-3">
              <Text className="text-xs font-bold text-content-secondary">Timeline & Data Retention policy:</Text>
              <Text className="text-[10px] text-content-muted leading-relaxed mt-0.5">
                Application review completes in 24-48 business hours. Uploaded documents are automatically deleted from servers 30 days after review finishes.
              </Text>
            </View>
          </View>
        </View>

      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
