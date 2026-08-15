import React, { useState, useEffect } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { Input } from '@/components/Input';
import { mockJobCategories } from '@/mocks/jobs-data';
import { apiClient } from '@/lib/apiClient';
import { useTrustStore } from '@/store/trust';
import { TrustEngine } from '@/lib/trustEngine';
import { useBottomInset } from '@/components/layout/bottom-inset';

// Module-level global draft storage
let globalJobDraft: any = null;

const steps = ['Type & Category', 'Job details', 'Location', 'Contact', 'Duration', 'Preview & Publish'];

const EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Freelance', 'Internship', 'Volunteer', 'Other'];
const CURRENCIES = ['GBP', 'MUR', 'USD', 'EUR'];
const FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];
const CONTACT_METHODS = [
  { label: 'Phone Call', value: 'phone' },
  { label: 'Email Address', value: 'email' },
  { label: 'In-App Message', value: 'in_app' },
];

export default function CreateJobScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const trustStore = useTrustStore();
  const evaluation = TrustEngine.evaluateAction('CreateJob', 'GB');

  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);



  // STEP 1: Basic Classification
  const [category, setCategory] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState<string>('Full-Time');

  // STEP 2: Job details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirementsText, setRequirementsText] = useState('');
  const [responsibilitiesText, setResponsibilitiesText] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('GBP');
  const [salaryFrequency, setSalaryFrequency] = useState('hourly');
  const [accommodationIncluded, setAccommodationIncluded] = useState(false);
  const [mealsIncluded, setMealsIncluded] = useState(false);
  const [transportIncluded, setTransportIncluded] = useState(false);

  // STEP 3: Location
  const [cityName, setCityName] = useState('London');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isSelectingPin, setIsSelectingPin] = useState(false);

  // STEP 4: Contact
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'phone' | 'email' | 'in_app'>('phone');

  // STEP 5: Duration & Expiration
  const [expiryOption, setExpiryOption] = useState<string>('7 Days');
  const [visibility, setVisibility] = useState<'Active' | 'Draft'>('Active');

  // STEP 6: AI Assistant
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Check draft on mount
  useEffect(() => {
    if (globalJobDraft) {
      setDraftBannerVisible(true);
    }
  }, []);

  // Auto-save draft trigger
  const saveDraft = () => {
    globalJobDraft = {
      category,
      employmentType,
      title,
      description,
      requirementsText,
      responsibilitiesText,
      salaryAmount,
      salaryCurrency,
      salaryFrequency,
      accommodationIncluded,
      mealsIncluded,
      transportIncluded,
      cityName,
      areaName,
      addressLine,
      landmark,
      contactPhone,
      contactEmail,
      preferredContactMethod,
      expiryOption,
      visibility,
      currentStep,
    };
  };

  useEffect(() => {
    if (title || description || category) {
      saveDraft();
    }
  }, [
    category,
    employmentType,
    title,
    description,
    requirementsText,
    responsibilitiesText,
    salaryAmount,
    salaryCurrency,
    salaryFrequency,
    accommodationIncluded,
    mealsIncluded,
    transportIncluded,
    cityName,
    areaName,
    addressLine,
    landmark,
    contactPhone,
    contactEmail,
    preferredContactMethod,
    expiryOption,
    visibility,
  ]);

  const restoreDraft = () => {
    if (globalJobDraft) {
      const d = globalJobDraft;
      setCategory(d.category);
      setEmploymentType(d.employmentType);
      setTitle(d.title);
      setDescription(d.description);
      setRequirementsText(d.requirementsText);
      setResponsibilitiesText(d.responsibilitiesText);
      setSalaryAmount(d.salaryAmount);
      setSalaryCurrency(d.salaryCurrency);
      setSalaryFrequency(d.salaryFrequency);
      setAccommodationIncluded(d.accommodationIncluded);
      setMealsIncluded(d.mealsIncluded);
      setTransportIncluded(d.transportIncluded);
      setCityName(d.cityName);
      setAreaName(d.areaName);
      setAddressLine(d.addressLine);
      setLandmark(d.landmark);
      setContactPhone(d.contactPhone);
      setContactEmail(d.contactEmail);
      setPreferredContactMethod(d.preferredContactMethod);
      setExpiryOption(d.expiryOption);
      setVisibility(d.visibility);
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalJobDraft = null;
    setDraftBannerVisible(false);
  };

  // AI Assistant trigger
  const runAiPolisher = () => {
    setAiLoading(true);
    setAiSuggestions(null);
    setTimeout(() => {
      setAiLoading(false);
      setAiSuggestions(
        `🤖 AI Optimization Suggestions:\n\n` +
        `• Title: Changing to "Urgent: House Cleaner for Ghanaian Household in Peckham" can increase click-throughs.\n` +
        `• Salary: Average cleaning rates in ${cityName} are £13-15/hr. Your rate (£${salaryAmount || 14}/hr) is competitive.\n` +
        `• Description: Added key safety phrases and localized directions.`
      );
    }, 1200);
  };

  const handlePublish = async () => {
    // Record the rate limit hit when actually submitting/publishing
    const recordCheck = TrustEngine.evaluateAction('CreateJob', 'GB', false);
    if (!recordCheck.allowed) {
      const errMsg = recordCheck.reason || 'Rate limit active. Please try again later.';
      if (Platform.OS === 'web') {
        alert(errMsg);
      } else {
        showAlert({ type: 'error', title: 'Rate Limit Active', message: errMsg });
      }
      return;
    }

    setIsSubmitting(true);

    const parseLines = (text: string) =>
      text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    const jobPayload = {
      title,
      category,
      employmentType,
      description,
      requirements: parseLines(requirementsText),
      responsibilities: parseLines(responsibilitiesText),
      benefits: [
        accommodationIncluded ? 'Accommodation Provided' : '',
        mealsIncluded ? 'Meals Provided' : '',
        transportIncluded ? 'Transport Provided' : '',
      ].filter(Boolean),
      salary: {
        amount: Number(salaryAmount) || 0,
        currency: salaryCurrency,
        frequency: salaryFrequency,
      },
      location: {
        cityName,
        areaName: areaName || cityName,
        addressLine,
        landmark,
        distanceKm: 0.5,
      },
      employer: {
        providerId: 'user-123',
        name: 'Amara Kone',
        avatarUrl: null,
        isVerified: true,
        rating: 4.9,
        reputationLevel: 'VerifiedResident',
        contactPhone,
        contactEmail,
        preferredContactMethod,
      },
      benefitsFlags: {
        accommodationIncluded,
        mealsIncluded,
        transportIncluded,
      },
      experienceRequired: parseLines(requirementsText).length > 0,
      languages: ['English'],
      urgency: expiryOption === 'Today' || expiryOption === 'Tomorrow' ? 'Urgent' : 'Normal',
      status: visibility,
    };

    try {
      await apiClient.post('/jobs', jobPayload);
      globalJobDraft = null;
      setIsSubmitting(false);
      
      // Log audit security trace
      trustStore.addAuditLog('Job Posted', `Successfully posted job opportunity: "${title}"`);
      
      if (Platform.OS === 'web') {
        alert('Published! Your opportunity has been shared with the community.');
        router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Jobs' } });
      } else {
        showAlert({ type: 'success', title: 'Published!', message: 'Your opportunity has been shared with the community.', buttons: [
          {
            text: 'Return to Discover',
            onPress: () => {
              router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Jobs' } });
            },
          },
        ] });
      }
    } catch (err) {
      setIsSubmitting(false);
      if (Platform.OS === 'web') {
        alert('Error: Failed to publish job. Please try again.');
      } else {
        showAlert({ type: 'error', title: 'Error', message: 'Failed to publish job. Please try again.' });
      }
    }
  };

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  // If publishing is locked under current governance parameters, render explainable progress checklist
  if (!evaluation.allowed) {
    const jobUnlock = TrustEngine.getFeatureUnlockRequirements('GB').find((f) => f.featureId === 'jobs');
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
        <ScreenHeader title="Posting Locked" />
        <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: bottomInset }}>
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-full items-center justify-center mb-6">
              <Text className="text-4xl">🔒</Text>
            </View>
            <Text className="text-2xl font-black text-content-primary text-center mb-3 tracking-tight">
              Job Posting Locked
            </Text>
            <Text className="text-sm text-content-muted text-center leading-relaxed max-w-[280px]">
              Creating opportunities requires verified residency and identity status to avoid false listings.
            </Text>
          </View>

          {/* Progress checklists */}
          <View className="bg-surface-background border border-subtle rounded-3xl p-5 w-full mb-8">
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-4">Requirements Checklist</Text>
            <View className="gap-3">
              {jobUnlock?.requirements.map((r, idx) => (
                <View key={idx} className="flex-row justify-between items-center py-2 border-t border-faint first:border-t-0">
                  <View className="flex-row items-center flex-1 mr-3">
                    <Text className="text-xs mr-2">{r.isMet ? '✅' : '❌'}</Text>
                    <Text className="text-xs font-extrabold text-content-strong">{r.description}</Text>
                  </View>
                  <Text className="text-[10px] font-bold text-content-muted">{r.currentProgress}</Text>
                </View>
              ))}
            </View>
          </View>

          <Button 
            label="Go back to Opportunities" 
            variant="primary" 
            onPress={() => router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Jobs' } })} 
            className="w-full mb-3" 
          />
          <Button label="Visit Trust Center" variant="outline" onPress={() => router.push('/profile/trust-center')} className="w-full" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Stepper progress bar */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Post Job / Opportunity
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader
        title={steps[currentStep]}
        showBack={currentStep > 0}
        rightAction={
          <TouchableOpacity onPress={() => router.back()} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        {/* Draft Recovery banner */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-content-strong">✏️ Unfinished Draft</Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                Would you like to restore your previous job draft details?
              </Text>
            </View>
            <View className="flex-row">
              <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3.5 py-2 rounded-xl mr-2">
                <Text className="text-xs font-bold text-white">Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={discardDraft} className="bg-surface-muted border border-subtle px-3.5 py-2 rounded-xl">
                <Text className="text-xs font-bold text-content-tertiary">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          {/* STEP 1: Classification */}
          {currentStep === 0 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Choose the best category for this opportunity, and pick the type of work arrangement.
              </Text>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Job Category</Text>
              <View className="flex-row flex-wrap mb-6">
                {mockJobCategories.slice(0, 15).map((cat) => {
                  const isSelected = category === cat.name;
                  return (
                    <CategoryChip
                      key={cat.id}
                      label={cat.name}
                      icon={cat.icon}
                      isSelected={isSelected}
                      onPress={() => setCategory(cat.name)}
                    />
                  );
                })}
              </View>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Employment Type</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {EMPLOYMENT_TYPES.map((type) => {
                  const isSelected = employmentType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setEmploymentType(type)}
                      className={`px-4 py-2.5 rounded-full border ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 2: Details */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Specify clear descriptions, expectations, compensation, and perks for the position.
              </Text>

              <Input
                label="Job Title"
                placeholder="e.g. House Cleaner Needed for Family"
                value={title}
                onChangeText={setTitle}
              />

              <Input
                label="Job Description"
                placeholder="Describe the opportunity details and what makes it special..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                className="h-24"
              />

              <Input
                label="Requirements (one per line)"
                placeholder="e.g. Bilingual in Twi and English&#10;DBS checks completed"
                value={requirementsText}
                onChangeText={setRequirementsText}
                multiline
                numberOfLines={3}
                className="h-20"
              />

              <Input
                label="Responsibilities (one per line)"
                placeholder="e.g. Clean kitchen and floors&#10;Fold laundry"
                value={responsibilitiesText}
                onChangeText={setResponsibilitiesText}
                multiline
                numberOfLines={3}
                className="h-20"
              />

              {/* Salary Fields */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Compensation</Text>
              <View className="flex-row items-center gap-2 mb-6">
                <TextInput
                  value={salaryAmount}
                  onChangeText={setSalaryAmount}
                  keyboardType="numeric"
                  placeholder="Rate (e.g. 15)"
                  className="flex-1 bg-surface-background border border-subtle rounded-xl px-4 h-12 text-sm font-semibold text-content-primary"
                />
                <View className="border border-subtle rounded-xl overflow-hidden bg-surface-background h-12 justify-center px-2">
                  <Text className="text-xs font-bold text-content-secondary">{salaryCurrency}</Text>
                </View>
                <View className="border border-subtle rounded-xl overflow-hidden bg-surface-background h-12 justify-center px-2">
                  <Text className="text-xs font-bold text-content-secondary">/{salaryFrequency}</Text>
                </View>
              </View>

              {/* Perks */}
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Perks & Benefits</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {[
                  { label: '🛌 Accommodation Included', value: accommodationIncluded, setter: setAccommodationIncluded },
                  { label: '🍲 Meals Included', value: mealsIncluded, setter: setMealsIncluded },
                  { label: '🚗 Transport Included', value: transportIncluded, setter: setTransportIncluded },
                ].map((perk, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => perk.setter(!perk.value)}
                    className={`px-4 py-2.5 rounded-2xl flex-row items-center border ${
                      perk.value ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-content-secondary'}`}>
                      {perk.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* STEP 3: Location */}
          {currentStep === 2 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide location directions. You can set the approximate area or pinpoint on the map.
              </Text>

              <Text className="text-xs font-bold text-content-secondary mb-2">City</Text>
              <View className="flex-row gap-2 mb-4">
                {['London', 'Port Louis', 'Lagos', 'Accra'].map((city) => (
                  <TouchableOpacity
                    key={city}
                    onPress={() => setCityName(city)}
                    className={`flex-1 py-3 rounded-xl border items-center justify-center ${
                      cityName === city ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-strong">{city}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Neighborhood / Area"
                placeholder="e.g. Peckham, Lewisham, Curepipe Town"
                value={areaName}
                onChangeText={setAreaName}
              />

              <Input
                label="Address Line"
                placeholder="e.g. 82 Lyndhurst Way, SE15"
                value={addressLine}
                onChangeText={setAddressLine}
              />

              <Input
                label="Nearby Landmark"
                placeholder="e.g. Next to Peckham Rye Station, opposite town hall"
                value={landmark}
                onChangeText={setLandmark}
              />

              <Text className="text-xs font-bold text-content-secondary mb-3">Map Coordinates</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsSelectingPin(true);
                  setTimeout(() => {
                    setIsSelectingPin(false);
                    if (Platform.OS === 'web') {
                      alert('Map Pin Configured: Simulated GPS coordinates saved for this address.');
                    } else {
                      showAlert({ type: 'success', title: 'Map Pin Configured', message: 'Simulated GPS coordinates saved for this address.' });
                    }
                  }, 1200);
                }}
                className="h-32 bg-surface-muted rounded-2xl border border-subtle overflow-hidden items-center justify-center"
              >
                {isSelectingPin ? (
                  <ActivityIndicator size="small" color="#F59300" />
                ) : (
                  <View className="items-center">
                    <Text className="text-2xl mb-1">🗺️</Text>
                    <Text className="text-xs font-extrabold text-content-muted uppercase">Interactive Map Picker</Text>
                    <Text className="text-[10px] text-content-faint mt-1 font-semibold">Tap to set coordinates pin</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4: Contact */}
          {currentStep === 3 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Choose the best way for community applicants to contact you.
              </Text>

              <Input
                label="Phone Number"
                placeholder="e.g. +44 7700 900456"
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />

              <Input
                label="Email Address"
                placeholder="e.g. employer@diaspora.net"
                value={contactEmail}
                onChangeText={setContactEmail}
                keyboardType="email-address"
              />

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Preferred Contact Channel</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {CONTACT_METHODS.map((method) => {
                  const isSel = preferredContactMethod === method.value;
                  return (
                    <TouchableOpacity
                      key={method.value}
                      onPress={() => setPreferredContactMethod(method.value as any)}
                      className={`px-4 py-3 rounded-xl border flex-row items-center justify-between ${
                        isSel ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
                      style={{ width: '47%' }}
                    >
                      <Text className="text-xs font-bold text-content-strong">{method.label}</Text>
                      <Text className="text-xs">{isSel ? '🟢' : '⚪'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 5: Expiration */}
          {currentStep === 4 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Jobs on Diaspora automatically expire after a set time to keep opportunities fresh and relevant.
              </Text>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Expiration Window</Text>
              <View className="flex-row flex-wrap gap-2.5 mb-6">
                {['Today', 'Tomorrow', '3 Days', '7 Days', 'Custom'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setExpiryOption(opt)}
                    className={`px-4 py-2.5 rounded-full border ${
                      expiryOption === opt ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${expiryOption === opt ? 'text-white' : 'text-content-secondary'}`}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Default Visibility</Text>
              <View className="flex-row gap-2">
                {[
                  { label: 'Active (Publish immediately)', value: 'Active' },
                  { label: 'Draft (Save internally first)', value: 'Draft' },
                ].map((item) => {
                  const isSel = visibility === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      onPress={() => setVisibility(item.value as any)}
                      className={`flex-1 p-4 rounded-xl border ${
                        isSel ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className="text-xs font-bold text-content-primary leading-snug">{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 6: Preview & Publish */}
          {currentStep === 5 && (
            <View className="pb-8">
              {/* AI assistant toolbar */}
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-6">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-xs font-black text-content-faint uppercase tracking-wider">🤖 Smart AI Checker</Text>
                  <TouchableOpacity onPress={runAiPolisher} className="bg-primary-500 px-2.5 py-1.5 rounded-lg">
                    <Text className="text-[10px] font-black text-white uppercase">Polishing assistant</Text>
                  </TouchableOpacity>
                </View>

                {aiLoading && (
                  <View className="flex-row items-center py-2">
                    <ActivityIndicator size="small" color="#F59300" className="mr-2" />
                    <Text className="text-xs font-medium text-content-tertiary">Analyzing job descriptions...</Text>
                  </View>
                )}

                {aiSuggestions ? (
                  <Text className="text-xs font-medium text-content-secondary leading-relaxed bg-[#FFF8E1] border border-[#FFE082] p-3 rounded-xl mt-1">
                    {aiSuggestions}
                  </Text>
                ) : (
                  <Text className="text-xs text-content-faint font-semibold italic">
                    Tap polishing assistant to review salary competitiveness, spelling checks, and title recommendations.
                  </Text>
                )}
              </View>

              {/* Layout Preview Representer */}
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Opportunity Card Preview</Text>
              
              <View className="bg-surface-card border border-line rounded-2xl p-4 mb-6 shadow-sm">
                <View className="flex-row justify-between mb-2">
                  <View className="bg-surface-background px-2 py-0.5 rounded border border-faint">
                    <Text className="text-[9px] font-bold text-content-tertiary uppercase">{employmentType}</Text>
                  </View>
                  <Text className="text-[9px] font-bold text-content-faint">{expiryOption === 'Today' ? 'Expires tonight' : `Expires in ${expiryOption}`}</Text>
                </View>
                <Text className="text-base font-black text-content-primary leading-snug">{title || 'Opportunity Title'}</Text>
                <Text className="text-xs text-content-muted font-bold mt-1">🏢 Amara Kone ✓</Text>
                <Text className="text-xs text-content-muted font-semibold mt-1">📍 {areaName || 'Peckham'} · {cityName}</Text>
                
                {/* Benefits */}
                <View className="flex-row gap-1 mt-2.5">
                  {accommodationIncluded && <Text className="bg-primary-50 text-[9px] font-bold text-primary-600 px-2 py-0.5 rounded-full">🛌 Accom.</Text>}
                  {mealsIncluded && <Text className="bg-success-surface text-[9px] font-bold text-success-default px-2 py-0.5 rounded-full">🍲 Meals</Text>}
                  {transportIncluded && <Text className="bg-info-surface text-[9px] font-bold text-info-default px-2 py-0.5 rounded-full">🚗 Transport</Text>}
                </View>

                <View className="flex-row justify-between items-center border-t border-faint mt-3 pt-3">
                  <Text className="text-sm font-black text-primary-500">
                    £{salaryAmount || '0'} / {salaryFrequency}
                  </Text>
                  <View className="bg-surface-background px-3 py-1.5 rounded-lg border border-subtle">
                    <Text className="text-[10px] font-bold text-content-secondary">Preview Mode</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Footer controls */}
        <View className="px-6 py-4 border-t border-faint bg-surface-card">
          <View className="flex-row">
            {currentStep > 0 && (
              <Button
                label="Back"
                variant="outline"
                className="flex-1 mr-2"
                onPress={() => setCurrentStep(currentStep - 1)}
              />
            )}
            <Button
              label={currentStep === steps.length - 1 ? 'Publish Opportunity' : 'Next'}
              className="flex-1"
              isLoading={isSubmitting}
              disabled={
                (currentStep === 0 && !category) ||
                (currentStep === 1 && (!title || !description || !salaryAmount)) ||
                (currentStep === 2 && (!areaName || !addressLine)) ||
                (currentStep === 3 && !contactPhone)
              }
              onPress={() => {
                if (currentStep < steps.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else {
                  handlePublish();
                }
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
