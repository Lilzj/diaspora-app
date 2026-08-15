import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Platform, Modal, FlatList, TouchableWithoutFeedback, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { DatePickerInput } from '@/components/DatePickerInput';
import { useTrustStore } from '@/store/trust';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import { allCountries } from '@/mocks/countries';
import { formatDocumentType } from '@/utils/format';
import { useThemeTokens } from '@/design-system';

const STEPS = ['Document Type', 'Document Details', 'Upload File', 'Facematch (Selfie)', 'Confirm'];

const ACCEPTED_DOCUMENTS = [
  { value: 'Passport', label: 'Passport', icon: '🛂' },
  { value: 'ResidencePermit', label: 'Residence Permit', icon: '🏠' },
  { value: 'WorkPermit', label: 'Work Permit', icon: '💼' },
  { value: 'OccupationPermit', label: 'Occupation Permit', icon: '🛠️' },
  { value: 'StudentPermit', label: 'Student Permit', icon: '🎓' },
  { value: 'Visa', label: 'Visa Document', icon: '📄' },
  { value: 'GovernmentImmigrationDocuments', label: 'Immigration Document', icon: '🏛️' },
];

export default function DiasporaVerificationWizard() {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const trustStore = useTrustStore();
  const authStore = useAuthStore();
  const { showToast, showAlert } = useNotification();

  const [step, setStep] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Form State
  const [nationality, setNationality] = useState('');
  const [residenceCountry, setResidenceCountry] = useState('');
  const [docType, setDocType] = useState<any>('Passport');
  const [issueCountry, setIssueCountry] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [supportingNotes, setSupportingNotes] = useState('');
  const [uploadedDocUri, setUploadedDocUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  // Loading/Draft recovery states
  const [isUploading, setIsUploading] = useState(false);
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

  const handleFileAttach = () => {
    setIsUploading(true);
    setTimeout(() => {
      setUploadedDocUri(`diaspora_doc_${docType.toLowerCase()}_scan.pdf`);
      setIsUploading(false);
    }, 1200);
  };

  const handleSelfieCapture = () => {
    setIsUploading(true);
    setTimeout(() => {
      setSelfieUri('selfie_match_biometric.jpg');
      setIsUploading(false);
    }, 1500);
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

    setIsSubmitting(true);
    
    // Simulate API upload
    setTimeout(async () => {
      try {
        await trustStore.submitDiasporaVerification({
          nationality,
          residenceCountry,
          documentType: docType,
          issueCountry,
          issueDate,
          expiryDate,
          supportingNotes,
          documentUri: uploadedDocUri,
          selfieUri: selfieUri || undefined,
        });

        // 1. Set account state to pending review
        authStore.setAccountState('DiasporaVerificationPending');

        // 2. Clear offline drafts
        await AsyncStorage.removeItem('diaspora_verification_draft');

        setIsSubmitting(false);

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
      } catch (err) {
        setIsSubmitting(false);
        showToast({
          type: 'error',
          title: 'Submission Failed',
          message: 'Failed to submit verification details. Please try again.',
        });
      }
    }, 2000);
  };

  const nextStep = () => {
    if (step === 0 && !docType) return;
    if (step === 1 && (!nationality.trim() || !residenceCountry.trim() || !issueCountry.trim() || !documentNumber.trim())) {
      showToast({
        type: 'error',
        title: 'Missing Details',
        message: 'Please fill in all details.',
      });
      return;
    }
    if (step === 2 && !uploadedDocUri) {
      showToast({
        type: 'error',
        title: 'Missing File',
        message: 'Please upload document files.',
      });
      return;
    }
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
      router.back();
    }
  };

  const progressPct = ((step + 1) / STEPS.length) * 100;

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
          <TouchableOpacity onPress={() => router.back()} className="p-2">
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
                  {nationality || 'Select Nationality'}
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
                  {residenceCountry || 'Select Residence Country'}
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
                    {issueCountry || 'Select Country'}
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
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">Expiry Date</Text>
                <DatePickerInput
                  label=""
                  value={expiryDate}
                  onChangeDate={setExpiryDate}
                  placeholder="YYYY-MM-DD"
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

            {isUploading ? (
              <View className="border-2 border-dashed border-line rounded-3xl p-10 items-center justify-center bg-surface-background">
                <ActivityIndicator size="small" color="#F59300" />
                <Text className="text-xs text-content-muted font-bold mt-3">Uploading credentials scan...</Text>
              </View>
            ) : uploadedDocUri ? (
              <View className="bg-success-surface border border-success-default/20 rounded-3xl p-6 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-3">
                  <Text className="text-3xl mr-3">📄</Text>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-content-strong" numberOfLines={1}>
                      {uploadedDocUri}
                    </Text>
                    <Text className="text-[10px] text-content-muted mt-0.5">1.8 MB · Uploaded</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setUploadedDocUri(null)} className="bg-surface-card px-3 py-1.5 rounded-xl border border-subtle">
                  <Text className="text-[10px] font-black text-error-default">CLEAR</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleFileAttach}
                className="border-2 border-dashed border-line rounded-3xl items-center justify-center bg-surface-background"
                style={{ paddingVertical: 60, paddingHorizontal: 24 }}
              >
                <Text className="text-4xl mb-3">📥</Text>
                <Text className="text-xs font-bold text-content-secondary">Tap to upload verification copy</Text>
                <Text className="text-[9px] text-content-faint mt-1 font-semibold">Supports PDF, PNG, JPG (Max 5MB)</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* STEP 3: BIOMETRIC SELFIE PLACEHOLDER */}
        {step === 3 && (
          <View className="pb-8 items-center">
            <Text className="text-xs text-center text-content-muted leading-relaxed mb-6 px-4">
              To verify document authenticity, take a selfie. We match your selfie with your ID page automatically using secure biometrics.
            </Text>

            {isUploading ? (
              <View className="w-48 h-48 rounded-full bg-surface-inverse border-4 border-primary-500 items-center justify-center mb-8">
                <ActivityIndicator size="large" color="#F59300" />
              </View>
            ) : selfieUri ? (
              <View className="items-center mb-8">
                <View className="w-48 h-48 rounded-full bg-emerald-50 border-4 border-emerald-500 items-center justify-center mb-3">
                  <Text className="text-4xl">📸</Text>
                </View>
                <Text className="text-xs font-black text-emerald-600">✓ Biometric selfie captured</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSelfieCapture}
                className="w-48 h-48 rounded-full bg-surface-background border-4 border-dashed border-primary-300 items-center justify-center mb-8"
              >
                <Text className="text-4xl">📸</Text>
                <Text className="text-[9px] font-bold text-content-faint mt-2">TAP TO SCAN</Text>
              </TouchableOpacity>
            )}

            <Button
              label={selfieUri ? "Retake Selfie" : "Capture Selfie"}
              variant={selfieUri ? "outline" : "primary"}
              onPress={handleSelfieCapture}
              className="w-full"
            />
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
                  <Text className="text-xs font-bold text-content-strong">{nationality}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-faint">
                  <Text className="text-xs text-content-muted">Current Residence</Text>
                  <Text className="text-xs font-bold text-content-strong">{residenceCountry}</Text>
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
                  <Text className="text-xs text-content-muted">Attached File</Text>
                  <Text className="text-xs font-bold text-content-strong">{uploadedDocUri}</Text>
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
                  (activePickerField === 'nationality' && nationality === item.name) ||
                  (activePickerField === 'residenceCountry' && residenceCountry === item.name) ||
                  (activePickerField === 'issueCountry' && issueCountry === item.name);
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (activePickerField === 'nationality') {
                        setNationality(item.name);
                      } else if (activePickerField === 'residenceCountry') {
                        setResidenceCountry(item.name);
                      } else if (activePickerField === 'issueCountry') {
                        setIssueCountry(item.name);
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
            disabled={
              isUploading ||
              (step === 1 && (!nationality.trim() || !residenceCountry.trim() || !documentNumber.trim() || !issueCountry.trim())) ||
              (step === 2 && !uploadedDocUri) ||
              (step === 3 && !selfieUri)
            }
            onPress={nextStep}
          />
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({});
