import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Platform, Modal, FlatList, TouchableWithoutFeedback, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { useAuthStore } from '@/store/auth';
import { useMyVerifications, useSubmitVerification } from '@/hooks/trust';
import type { VerificationStatus } from '@/types/trust';
import { mediaDocumentReference, SUPPORTING_NOTES_MAX_LENGTH } from '@/lib/trust-api';
import type { WireVerificationDocumentType } from '@/types/trust';
import { useNotification } from '@/providers/notification-provider';
import { allCountries } from '@/mocks/countries';
import { formatDocumentType } from '@/utils/format';
import { useThemeTokens } from '@/design-system';
import { backOr } from '@/lib/navigation';

// ── Where this wizard's data goes, after Wave D-4 ────────────────────────────
//
// `POST /api/v1/trust/verifications/diaspora`.
//
// It went nowhere. `trustStore.submitDiasporaVerification` wrote the form into
// zustand behind a two-second `setTimeout` that made it look like a request, and
// then the screen set the account state to `DiasporaVerificationPending` itself.
// The route it was meant to reach — `POST /trust/verify/diaspora` — existed only
// in `mocks/handlers/trust.ts` and has never been on the server.
//
// Four things the real contract needed that this form had but discarded:
//
//   * **`documentNumber`.** Collected here, validated here, shown on the confirm
//     step — and absent from the payload type, so it was dropped. A reviewer
//     cannot check a document against a registry without it.
//   * **ISO country codes.** The picker wrote country *names* into state
//     (`setNationality(item.name)`), and the server validates `Length(2)`. Every
//     submission would have been a 400.
//   * **A real document and a real selfie.** `handleFileAttach` and
//     `handleSelfieCapture` were timers that assigned filenames
//     (`diaspora_doc_passport_scan.pdf`, `selfie_match_biometric.jpg`). The
//     route wants storage keys.
//   * **The selfie at all.** `SelfieReference` is `string?` on the DTO and
//     `DiasporaVerificationHandler.RequiresSelfie` is true, so a submission
//     without one is refused by the type handler. The wizard treated it as
//     optional (`selfieUri || undefined`).
//
// **The server can refuse this without a human, at HTTP 201.** If nationality
// equals residence the claim is auto-rejected with `NOT_DIASPORA_ELIGIBLE`, and
// an expired document with `EXPIRED_DOCUMENT`. Both come back as a *created*
// verification whose `status` is `Rejected`, which is why the success handler
// below reads the status rather than the HTTP result.

const STEPS = ['Document Type', 'Document Details', 'Upload File', 'Facematch (Selfie)', 'Confirm'];

/** Exactly `DiasporaVerificationHandler.AcceptedDocuments`, minus `Other`. */
const ACCEPTED_DOCUMENTS: { value: WireVerificationDocumentType; label: string; icon: string }[] = [
  { value: 'Passport', label: 'Passport', icon: '🛂' },
  { value: 'ResidencePermit', label: 'Residence Permit', icon: '🏠' },
  { value: 'WorkPermit', label: 'Work Permit', icon: '💼' },
  { value: 'OccupationPermit', label: 'Occupation Permit', icon: '🛠️' },
  { value: 'StudentPermit', label: 'Student Permit', icon: '🎓' },
  { value: 'Visa', label: 'Visa Document', icon: '📄' },
  { value: 'GovernmentImmigrationDocuments', label: 'Immigration Document', icon: '🏛️' },
];

/** A country's display name from its ISO code. The state holds codes now. */
function countryName(code: string): string {
  return allCountries.find((item) => item.code === code)?.name ?? code;
}

export default function DiasporaVerificationWizard() {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const authStore = useAuthStore();
  const { submitDiaspora, error: submitError } = useSubmitVerification();
  // What the member already sent. Before 7 Oct 2026 this screen never asked, so a
  // member with a submission waiting (or already approved) who tapped "Start
  // verification" was handed an empty form to fill in again.
  const { latestOfType, isLoading: isLoadingExisting } = useMyVerifications({ type: 'Diaspora' });
  const existing = latestOfType('Diaspora');
  const { showToast, showAlert } = useNotification();

  const [step, setStep] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Form State. The three country fields hold **ISO 3166-1 alpha-2 codes**, not
  // names — the server validates their length and the picker used to write
  // "United Kingdom" into them.
  const [nationality, setNationality] = useState('');
  const [residenceCountry, setResidenceCountry] = useState('');
  const [docType, setDocType] = useState<WireVerificationDocumentType>('Passport');
  const [issueCountry, setIssueCountry] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [supportingNotes, setSupportingNotes] = useState('');
  // `mediaId`s, not device URIs. See the header note.
  const [uploadedDocUri, setUploadedDocUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  // Loading/Draft recovery states
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Country picker selector modal state
  const [activePickerField, setActivePickerField] = useState<'nationality' | 'residenceCountry' | 'issueCountry' | null>(null);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');

  // Monitor network status
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      setIsOnline(navigator.onLine);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    } else {
      setIsOnline(true);
    }
  }, []);

  // Initialize draft check
  useEffect(() => {
    const checkDraft = async () => {
      try {
        const savedDraft = await AsyncStorage.getItem('diaspora_verification_draft');
        if (savedDraft) {
          setDraftBannerVisible(true);
        }
      } catch (err) {
        console.error('Failed to read draft', err);
      }
    };
    checkDraft();
  }, []);

  // Auto-save draft when changes happen
  useEffect(() => {
    const saveDraft = async () => {
      if (nationality || residenceCountry || issueCountry || documentNumber) {
        const draft = {
          nationality,
          residenceCountry,
          docType,
          issueCountry,
          documentNumber,
          issueDate,
          expiryDate,
          supportingNotes,
          uploadedDocUri,
          selfieUri,
          step,
        };
        try {
          await AsyncStorage.setItem('diaspora_verification_draft', JSON.stringify(draft));
        } catch (e) {
          console.warn('Failed to save draft', e);
        }
      }
    };
    saveDraft();
  }, [nationality, residenceCountry, docType, issueCountry, documentNumber, issueDate, expiryDate, supportingNotes, uploadedDocUri, selfieUri, step]);

  const handleRestoreDraft = async () => {
    try {
      const savedDraft = await AsyncStorage.getItem('diaspora_verification_draft');
      if (savedDraft) {
        const d = JSON.parse(savedDraft);
        setNationality(d.nationality || '');
        setResidenceCountry(d.residenceCountry || '');
        setDocType(d.docType || 'Passport');
        setIssueCountry(d.issueCountry || '');
        setDocumentNumber(d.documentNumber || '');
        setIssueDate(d.issueDate || '');
        setExpiryDate(d.expiryDate || '');
        setSupportingNotes(d.supportingNotes || '');
        setUploadedDocUri(d.uploadedDocUri || null);
        setSelfieUri(d.selfieUri || null);
        setStep(d.step || 0);
      }
      setDraftBannerVisible(false);
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Draft Restore Error',
        message: 'Failed to restore draft.',
      });
    }
  };

  const handleDiscardDraft = async () => {
    try {
      await AsyncStorage.removeItem('diaspora_verification_draft');
      setDraftBannerVisible(false);
    } catch (err) {
      console.warn(err);
    }
  };

  const handleSubmit = async () => {
    if (!nationality.trim() || !residenceCountry.trim() || !issueCountry.trim() || !documentNumber.trim()) {
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please complete all document metadata fields.',
      });
      return;
    }
    if (!uploadedDocUri) {
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please upload a scan of your immigration document.',
      });
      return;
    }
    if (!selfieUri) {
      // Required by the type handler even though the DTO marks it optional.
      // Refused here so the member gets a sentence rather than a 400 describing
      // a field they were never told about.
      showToast({
        type: 'error',
        title: 'Selfie needed',
        message: 'A selfie is required for this check — a reviewer compares it with your document.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const submitted = await submitDiaspora({
        nationality,
        residenceCountry,
        documentType: docType,
        issueCountry,
        issueDate: issueDate.trim() || null,
        expiryDate: expiryDate.trim() || null,
        // Collected, validated and displayed by this wizard since it was
        // written, and dropped on the floor until now.
        documentNumber: documentNumber.trim(),
        supportingNotes: supportingNotes.trim() || null,
        documentReference: mediaDocumentReference(uploadedDocUri),
        selfieReference: mediaDocumentReference(selfieUri),
      });

      // The account state moves when *Identity* applies the trust decision the
      // server reports, not when this screen says so. It is set here only for
      // the pending case, and only because the access gateway routes on it —
      // and never for a rejection, which the previous version would also have
      // shown as "submitted for compliance audit".
      if (submitted.status !== 'Rejected') {
        authStore.setAccountState('DiasporaVerificationPending');
      }

      await AsyncStorage.removeItem('diaspora_verification_draft');
      setIsSubmitting(false);

      if (submitted.status === 'Rejected') {
        showAlert({
          type: 'error',
          title: 'Not eligible',
          message:
            submitted.rejectionReasonDetails ??
            'Your submission was refused. Open the Trust Centre for the reason.',
          buttons: [{ text: 'OK', onPress: () => router.replace('/profile/trust-center') }],
        });
        return;
      }

      showAlert({
        type: 'success',
        title: 'Verification Submitted',
        message: 'Your credentials have been submitted for safety compliance audit. Check back in 24-48 business hours.',
        buttons: [
          {
            text: 'OK',
            onPress: () => router.replace('/access-gateway'),
            style: 'default',
          },
        ],
      });
    } catch {
      setIsSubmitting(false);
      showToast({
        type: 'error',
        title: 'Submission Failed',
        message: submitError ?? 'Failed to submit verification details. Please try again.',
      });
    }
  };

  /**
   * What each step will not go forward without, by the name above the field.
   *
   * <p>
   * <b>Four steps were refused and none of them said what for.</b> Steps 1, 2
   * and 3 disabled the Continue button on an expression written inline beside
   * it, duplicating rules that also sat in `nextStep` as toasts — "Missing
   * Details", "Please fill in all details", which names no detail, on a step
   * with four of them.
   * </p>
   * <p>
   * Step 0 was worse: `nextStep` began <code>if (step === 0 && !docType)
   * return;</code> and the button was not disabled at all. A member who had not
   * chosen a document type met a live Continue that did nothing when pressed,
   * with no toast, no change and nothing to read. A control that ignores you is
   * indistinguishable from an application that has crashed.
   * </p>
   */
  // The member's own calendar day, which is what "issued today" means to them.
  const today = localIsoDate(new Date());

  const requiredByStep: Record<number, { label: string; ok: boolean }[]> = {
    0: [{ label: 'Document Type', ok: Boolean(docType) }],
    1: [
      { label: 'My Nationality', ok: nationality.trim().length > 0 },
      { label: 'Current Residence Country', ok: residenceCountry.trim().length > 0 },
      { label: 'Issue Country', ok: issueCountry.trim().length > 0 },
      { label: 'Document ID Number', ok: documentNumber.trim().length > 0 },
      // The server refuses both since 7 Oct 2026, after a passport "issued" three
      // weeks ahead was accepted and approved. Said here, on the step, rather than
      // as a 400 after the selfie. A draft saved before the calendar greyed these
      // days out can still hold one, which is why the calendar is not enough.
      { label: 'Issue Date (cannot be in the future)', ok: !issueDate || issueDate <= today },
      { label: 'Expiry Date (must be after the issue date)', ok: !expiryDate || !issueDate || expiryDate > issueDate },
    ],
    2: [{ label: 'Document scan', ok: Boolean(uploadedDocUri) }],
    // Required by the type handler even though the DTO marks it optional, so
    // it is asked for here rather than arriving as a 400 about a field the
    // member was never told about.
    3: [{ label: 'Selfie', ok: Boolean(selfieUri) }],
    4: [],
  };

  const stillNeeded = (requiredByStep[step] ?? [])
    .filter((field) => !field.ok)
    .map((field) => field.label);

  const nextStep = () => {
    if (stillNeeded.length > 0) return;

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      backOr();
    }
  };

  const progressPct = ((step + 1) / STEPS.length) * 100;

  if (isLoadingExisting) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator color={tokens.color.primary[500]} />
      </SafeAreaView>
    );
  }

  if (existing && SETTLED_OR_WAITING.has(existing.status)) {
    return <ExistingSubmission status={existing.status} submittedAt={existing.submittedAt} />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      {/* Offline Status warning header */}
      {!isOnline && (
        <View className="bg-red-500 py-2 px-6 items-center">
          <Text className="text-white text-xs font-black uppercase tracking-wider">
            ⚠️ Network Offline · Draft Saving Locally
          </Text>
        </View>
      )}

      {/* Stepper Progress bar */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-black text-content-muted uppercase tracking-widest">
            Diaspora Verification
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            {STEPS[step]} ({step + 1} of {STEPS.length})
          </Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader 
        title={STEPS[step]} 
        showBack 
        onBack={prevStep}
        rightAction={
          <TouchableOpacity onPress={() => backOr()} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Cancel</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView 
          className="flex-1 px-6 pt-4" 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        >
        {/* Draft Recovery Alert */}
        {draftBannerVisible && step === 0 && (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-xs font-bold text-content-strong">✏️ Recover Draft Progress</Text>
              <Text className="text-[10px] text-content-muted mt-0.5">
                We found an incomplete Diaspora Verification form draft.
              </Text>
            </View>
            <View className="flex-row gap-1">
              <TouchableOpacity onPress={handleRestoreDraft} className="bg-primary-500 px-3 py-1.5 rounded-xl">
                <Text className="text-[10px] font-black text-white uppercase">Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDiscardDraft} className="bg-surface-muted px-3 py-1.5 rounded-xl border border-subtle">
                <Text className="text-[10px] font-black text-content-tertiary uppercase">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 0: DOCUMENT TYPE SELECTOR */}
        {step === 0 && (
          <View className="pb-8">
            <Text className="text-xs font-semibold text-content-muted leading-relaxed mb-6">
              Diaspora is a private community for people living outside their nationality. Select your official document to prove eligibility.
            </Text>
            <Text className="text-xs font-extrabold text-content-muted uppercase tracking-widest mb-3">Select Document Type</Text>
            <View className="space-y-2.5">
              {ACCEPTED_DOCUMENTS.map((doc) => {
                const isSelected = docType === doc.value;
                return (
                  <TouchableOpacity
                    key={doc.value}
                    onPress={() => setDocType(doc.value)}
                    accessibilityLabel={`Document type ${doc.label}`}
                    className={`flex-row items-center p-4 rounded-2xl border ${
                      isSelected ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className="text-2xl mr-3">{doc.icon}</Text>
                    <Text className={`text-sm font-bold flex-1 ${isSelected ? 'text-primary-500' : 'text-content-strong'}`}>
                      {doc.label}
                    </Text>
                    {isSelected && <Text className="text-primary-500 text-lg">✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* STEP 1: DOCUMENT METADATA */}
        {step === 1 && (
          <View className="pb-8 gap-4">
            <Text className="text-xs font-semibold text-content-muted leading-relaxed mb-4">
              Enter details exactly as they appear on your {formatDocumentType(docType)} document. Declared details will be audited manually.
            </Text>

            <View>
              <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">My Nationality</Text>
              <TouchableOpacity
                onPress={() => setActivePickerField('nationality')}
                activeOpacity={0.7}
                className="bg-surface-background border border-subtle rounded-2xl p-4 flex-row justify-between items-center animate-fade-in"
              >
                <Text className={`text-xs font-semibold ${nationality ? 'text-content-strong' : 'text-content-faint'}`}>
                  {nationality ? countryName(nationality) : 'Select Nationality'}
                </Text>
                <Text className="text-xs text-content-faint">▼</Text>
              </TouchableOpacity>
            </View>

            <View>
              <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Current Residence Country</Text>
              <TouchableOpacity
                onPress={() => setActivePickerField('residenceCountry')}
                activeOpacity={0.7}
                className="bg-surface-background border border-subtle rounded-2xl p-4 flex-row justify-between items-center"
              >
                <Text className={`text-xs font-semibold ${residenceCountry ? 'text-content-strong' : 'text-content-faint'}`}>
                  {residenceCountry ? countryName(residenceCountry) : 'Select Residence Country'}
                </Text>
                <Text className="text-xs text-content-faint">▼</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Document ID Number</Text>
                <TextInput
                  value={documentNumber}
                  onChangeText={setDocumentNumber}
                  placeholder="e.g. AA0012345"
                  className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Issue Country</Text>
                <TouchableOpacity
                  onPress={() => setActivePickerField('issueCountry')}
                  activeOpacity={0.7}
                  className="bg-surface-background border border-subtle rounded-2xl p-4 flex-row justify-between items-center"
                >
                  <Text className={`text-xs font-semibold ${issueCountry ? 'text-content-strong' : 'text-content-faint'}`} numberOfLines={1}>
                    {issueCountry ? countryName(issueCountry) : 'Select Country'}
                  </Text>
                  <Text className="text-xs text-content-faint">▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Issue Date</Text>
                <DatePickerInput
                  label=""
                  value={issueDate}
                  onChangeDate={setIssueDate}
                  placeholder="YYYY-MM-DD"
                  maxDate={today}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Expiry Date</Text>
                <DatePickerInput
                  label=""
                  value={expiryDate}
                  onChangeDate={setExpiryDate}
                  placeholder="YYYY-MM-DD"
                  minDate={issueDate ? dayAfter(issueDate) : undefined}
                />
              </View>
            </View>

            <View>
              <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Optional Supporting Notes</Text>
              <TextInput
                value={supportingNotes}
                onChangeText={setSupportingNotes}
                placeholder="Mention details that may speed up your verification..."
                multiline
                numberOfLines={3}
                className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-semibold text-content-strong min-h-[60px]"
              />
            </View>
          </View>
        )}

        {/* STEP 2: FILE UPLOAD */}
        {step === 2 && (
          <View className="pb-8">
            <Text className="text-xs font-semibold text-content-muted leading-relaxed mb-6">
              Upload a clear photo or PDF scan of your {formatDocumentType(docType)}. All details must be legible.
            </Text>

            {/*
              A real upload. It replaces a `setTimeout` that assigned the string
              `diaspora_doc_passport_scan.pdf` and a card that then displayed
              that filename beside a hard-coded "1.8 MB · Uploaded".
            */}
            <ImagePickerInput
              label="Document scan"
              value={uploadedDocUri}
              onChangeImage={setUploadedDocUri}
              kind="verificationDocument"
              aspect={[3, 2]}
            />
            <Text className="text-[9px] text-content-faint mt-2 font-semibold">
              Photographs up to 5 MB. Every detail on the page must be legible.
            </Text>
          </View>
        )}

        {/* STEP 3: BIOMETRIC SELFIE PLACEHOLDER */}
        {step === 3 && (
          <View className="pb-8 items-center">
            <Text className="text-xs text-center text-content-muted leading-relaxed mb-6 px-4">
              To verify document authenticity, take a selfie. We match your selfie with your ID page automatically using secure biometrics.
            </Text>

            {/*
              A real upload. The previous version set a 1.5-second timer and
              assigned the literal `'selfie_match_biometric.jpg'`, then reported
              "✓ Biometric selfie captured" — no camera had opened and no
              biometric comparison exists on this device. The comparison is a
              reviewer's, and it happens after this.
            */}
            <View className="w-full">
              <ImagePickerInput
                label="Selfie"
                value={selfieUri}
                onChangeImage={setSelfieUri}
                kind="verificationDocument"
                circle
                // The step is already headed "Facematch (Selfie)" and the
                // control says "Tap to add your photo". `label` stays — it is
                // the accessibility name and the dialog's title.
                hideLabel
                aspect={[1, 1]}
                // The one place on this platform that asks for a picture which
                // does not exist yet. Sending a member to their gallery to find
                // a selfie is asking for the wrong thing, and a live capture is
                // harder to borrow from somebody else than a file is. The front
                // camera, pointed at the member's own face.
                allowCamera
                cameraType="front"
              />
            </View>
          </View>
        )}

        {/* STEP 4: REVIEW & CONFIRM */}
        {step === 4 && (
          <View className="pb-8">
            <Text className="text-xs font-semibold text-content-muted leading-relaxed mb-6">
              Review your application details before sending them for compliance verification.
            </Text>

            <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-6">
              <Text className="text-xs font-black text-content-muted uppercase mb-3 tracking-widest">Document Details</Text>
              
              <View className="space-y-2.5">
                <View className="flex-row justify-between py-1.5 border-b border-faint">
                  <Text className="text-xs text-content-muted">Declared Nationality</Text>
                  <Text className="text-xs font-bold text-content-strong">{countryName(nationality)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-faint">
                  <Text className="text-xs text-content-muted">Current Residence</Text>
                  <Text className="text-xs font-bold text-content-strong">{countryName(residenceCountry)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-faint">
                  <Text className="text-xs text-content-muted">Document Type</Text>
                  <Text className="text-xs font-bold text-content-strong">{formatDocumentType(docType)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-faint">
                  <Text className="text-xs text-content-muted">Document Number</Text>
                  <Text className="text-xs font-bold text-content-strong">{documentNumber}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-faint">
                  <Text className="text-xs text-content-muted">Issue / Expiry Dates</Text>
                  <Text className="text-xs font-bold text-content-strong">{issueDate} / {expiryDate}</Text>
                </View>
                <View className="flex-row justify-between py-1.5">
                  <Text className="text-xs text-content-muted">Evidence</Text>
                  {/*
                    Not the identifier. `uploadedDocUri` holds a `mediaId` now,
                    and a GUID on a confirmation screen tells the member nothing
                    — the previous version printed a filename this app had
                    invented, which told them something false instead.
                  */}
                  <Text className="text-xs font-bold text-content-strong">
                    {uploadedDocUri ? 'Document attached' : 'Missing'}
                    {selfieUri ? ' · Selfie attached' : ' · Selfie missing'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Reusable Country Dropdown Modal */}
      <Modal
        visible={activePickerField !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setActivePickerField(null);
          setCountrySearchQuery('');
        }}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setActivePickerField(null);
            setCountrySearchQuery('');
          }}
          className="flex-1 justify-end bg-black/50"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-[32px] h-[80%] max-h-[600px] p-6 shadow-2xl w-full">
            {/* Drag Handle Indicator */}
            <View className="w-12 h-1 bg-subtle rounded-full mx-auto mb-5" />

            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-black text-content-primary">
                Select {activePickerField === 'nationality' ? 'Nationality' : activePickerField === 'residenceCountry' ? 'Residence Country' : 'Issue Country'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setActivePickerField(null);
                  setCountrySearchQuery('');
                }}
                className="p-1"
              >
                <Text className="text-content-faint font-extrabold text-xs uppercase tracking-wider">Close</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View className="bg-surface-background border border-subtle rounded-2xl px-4 py-3 flex-row items-center mb-4 h-12">
              <Text className="text-sm mr-2">🔍</Text>
              <TextInput
                value={countrySearchQuery}
                onChangeText={setCountrySearchQuery}
                placeholder="Search countries..."
                className="flex-1 text-xs font-semibold text-content-strong p-0 h-full"
                placeholderTextColor={tokens.color.text.placeholder}
                autoFocus
              />
              {countrySearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setCountrySearchQuery('')} className="p-1">
                  <Text className="text-xs text-content-faint font-bold">✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            <FlatList
              data={allCountries.filter((c) =>
                c.name.toLowerCase().includes(countrySearchQuery.toLowerCase())
              )}
              keyExtractor={(item) => item.code}
              initialNumToRender={20}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = 
                  (activePickerField === 'nationality' && nationality === item.code) ||
                  (activePickerField === 'residenceCountry' && residenceCountry === item.code) ||
                  (activePickerField === 'issueCountry' && issueCountry === item.code);
                return (
                  <TouchableOpacity
                    onPress={() => {
                      // The **code**, not the name. `SubmitVerificationCommand`
                      // validates each of these as two characters, so a name
                      // here was a 400 on every submission.
                      if (activePickerField === 'nationality') {
                        setNationality(item.code);
                      } else if (activePickerField === 'residenceCountry') {
                        setResidenceCountry(item.code);
                      } else if (activePickerField === 'issueCountry') {
                        setIssueCountry(item.code);
                      }
                      setActivePickerField(null);
                      setCountrySearchQuery('');
                    }}
                    className="flex-row items-center py-3 border-b border-faint active:bg-surface-background px-1"
                  >
                    {/* Centered Flag Circular Shield */}
                    <View className="w-8 h-8 rounded-full bg-surface-background border border-faint items-center justify-center mr-3">
                      <Text className="text-base text-content-strong">{item.flag}</Text>
                    </View>
                    <Text className="text-xs font-bold text-content-strong flex-1">{item.name}</Text>
                    {isSelected && (
                      <View className="w-4 h-4 rounded-full bg-primary-500 items-center justify-center">
                        <Text className="text-white text-[9px] font-black">✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={() => (
                <View className="p-8 items-center">
                  <Text className="text-xs text-content-muted font-bold">No countries found</Text>
                </View>
              )}
            />
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>

      {/* Wizard actions footer buttons */}
      <View 
        className="px-6 pt-4 pb-6 border-t border-faint bg-surface-card"
      >
        {/* The step named, rather than a disabled button and a toast that says
            "Missing Details" on a step with four of them. */}
        {stillNeeded.length > 0 ? (
          <Text className="text-xs font-semibold text-content-muted mb-3">
            Still needed: {stillNeeded.join(', ')}
          </Text>
        ) : null}

        <View className="flex-row gap-2">
          {step > 0 && (
            <Button
              label="Back"
              variant="outline"
              className="flex-1"
              onPress={prevStep}
            />
          )}
          <Button
            label={step === STEPS.length - 1 ? (isSubmitting ? "Submitting..." : "Submit") : "Continue"}
            className="flex-1"
            isLoading={isSubmitting}
            disabled={isSubmitting || stillNeeded.length > 0}
            onPress={nextStep}
          />
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({});

/**
 * Statuses where a fresh submission would be wrong: one is with a reviewer, or
 * already decided in the member's favour. Everything else — rejected, more
 * information asked for, expired, revoked — is a reason to submit again, so the
 * form is shown.
 */
const SETTLED_OR_WAITING: ReadonlySet<VerificationStatus> = new Set([
  'Submitted',
  'Pending',
  'UnderReview',
  'UnderInvestigation',
  'Appealed',
  'Approved',
  'PartiallyApproved',
]);

function ExistingSubmission({ status, submittedAt }: { status: VerificationStatus; submittedAt: string }) {
  const approved = status === 'Approved' || status === 'PartiallyApproved';
  const [isContinuing, setIsContinuing] = useState(false);
  const submitted = new Date(submittedAt);
  const when = Number.isNaN(submitted.getTime())
    ? null
    : submitted.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  const onContinue = async () => {
    setIsContinuing(true);
    // The approval is on the server; the account state on this device is not
    // until it asks. The gateway's own redirect then takes over.
    await useAuthStore.getState().syncAccess();
    setIsContinuing(false);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      <ScreenHeader title="Diaspora Verification" />
      <View className="flex-1 px-6 justify-center">
        <Text className="text-4xl text-center mb-4">{approved ? '✅' : '⏳'}</Text>
        <Text className="text-xl font-black text-content-primary text-center mb-2">
          {approved
            ? 'You are verified'
            : status === 'Appealed'
              ? 'Your appeal is being reviewed'
              : 'Your verification is with a reviewer'}
        </Text>
        <Text className="text-sm text-content-muted text-center leading-relaxed mb-8">
          {approved
            ? 'Your Diaspora verification was approved. Your full community access is ready.'
            : `You sent your documents${when ? ` on ${when}` : ''}. There is nothing more to do — we will notify you when it has been decided.`}
        </Text>
        {approved ? (
          <Button
            label={isContinuing ? 'Opening…' : 'Continue'}
            onPress={onContinue}
            disabled={isContinuing}
            className="w-full"
          />
        ) : (
          <Button label="Back" variant="outline" onPress={() => backOr()} className="w-full" />
        )}
      </View>
    </SafeAreaView>
  );
}

/** YYYY-MM-DD in the device's own time zone. `toISOString` would give UTC's day. */
function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The calendar day after a YYYY-MM-DD date. */
function dayAfter(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return localIsoDate(new Date(year, month - 1, day + 1));
}
