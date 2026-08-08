import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTrustStore } from '@/store/trust';
import { DatePickerInput } from '@/components/DatePickerInput';
import { useNotification } from '@/providers/notification-provider';

export default function CountryVerificationScreen() {
  const trustStore = useTrustStore();
  const { showAlert } = useNotification();
  const [country, setCountry] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [calculatedYears, setCalculatedYears] = useState<number | null>(null);
  
  const [docType, setDocType] = useState<'BRP' | 'Passport' | 'Visa' | 'UtilityBill'>('BRP');
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Simulating uploads
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string } | null>(null);

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

  // Simulating document attachment picker
  const handleFileAttach = () => {
    setIsUploading(true);
    setTimeout(() => {
      setUploadedFile({
        name: `verification_doc_${docType.toLowerCase()}_copy.pdf`,
        size: '1.4 MB',
      });
      setIsUploading(false);
    }, 1200);
  };

  const handleClearFile = () => {
    setUploadedFile(null);
  };

  const handleSubmit = () => {
    if (!country.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'Please enter your country.' });
      return;
    }
    if (!arrivalDate.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'Please specify your arrival date.' });
      return;
    }
    if (!uploadedFile) {
      showAlert({ type: 'error', title: 'Error', message: 'Please upload a verification document.' });
      return;
    }

    // 1. Submit Country Verification in state
    trustStore.submitVerification('Country', { country, arrivalDate, docType, additionalNotes });
    
    // 2. Add pending timeline slot
    const arrivalYear = parseInt(arrivalDate.split('-')[0]) || 2026;
    
    useTrustStore.setState((state) => {
      // Find if country already on timeline
      const cleanTimeline = state.experienceTimeline.filter((item) => item.countryName !== country);
      return {
        experienceTimeline: [
          ...cleanTimeline,
          {
            countryCode: country.slice(0, 2).toUpperCase(),
            countryName: country,
            flag: '📍',
            startYear: arrivalYear,
            endYear: null,
            isVerified: false,
            role: 'Diaspora Member',
          }
        ]
      };
    });

    // 3. Simulate backend worker approval delay (1.5 seconds)
    setTimeout(() => {
      trustStore.updateVerificationStatus('Country', 'Approved');
      trustStore.addAuditLog('Residency Verified', `Residency approved for country: ${country}`);
      
      // Update timeline verification and rank
      useTrustStore.setState((state) => {
        const updatedTimeline = state.experienceTimeline.map((item) => {
          if (item.countryName === country) {
            return {
              ...item,
              isVerified: true,
              role: 'Verified Resident',
            };
          }
          return item;
        });

        // Add visual Trust Journey node
        const journeyNode = {
          eventId: `je-cty-${Date.now()}`,
          type: 'Country',
          label: `Verified Resident in ${country}`,
          timestamp: new Date().toISOString().split('T')[0],
          icon: '🛡️',
          description: `Compliance team approved document. Residency established since ${arrivalYear}.`,
        };

        // Also award country-specific reputation points
        const cleanReps = state.countryReputations.filter((r) => r.countryName !== country);
        const newRep = {
          countryCode: country.slice(0, 2).toUpperCase(),
          countryName: country,
          flag: '📍',
          points: 100, // baseline Verified Resident points
          level: 'VerifiedResident' as const,
          stars: 4,
        };

        return {
          experienceTimeline: updatedTimeline,
          countryReputations: [...cleanReps, newRep],
          trustJourney: [...state.trustJourney, journeyNode],
        };
      });

      trustStore.addNotification(
        'Residency Verified',
        `Your residency files for ${country} were approved. Unlocked Verified Resident badge.`,
        'Verification'
      );
    }, 2000);

    showAlert({
      type: 'success',
      title: 'Verification Uploaded',
      message: `Your verification details for ${country} were submitted. Standard review is automated and finishes in 2-3 seconds for mock review.`,
      buttons: [
        {
          text: 'Return',
          onPress: () => router.replace('/profile/trust-center'),
        },
      ]
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-neutral-50/40">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-neutral-600">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-neutral-900 tracking-tight">Verify Residency</Text>
      </View>

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        
        {/* Verification introductory statement */}
        <Text className="text-xs font-semibold text-neutral-500 mb-6 leading-relaxed">
          Verify your country residency to unlock verified badges, contributor capabilities, and directory placements.
        </Text>

        {/* Input: Country */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Target Country</Text>
        <TextInput 
          value={country}
          onChangeText={setCountry}
          placeholder="e.g. United Kingdom"
          className="bg-white border border-neutral-200 rounded-2xl p-4 mb-4 text-xs font-semibold text-neutral-800"
        />

        {/* Input: Date of Arrival */}
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Date of Arrival</Text>
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
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Document Type</Text>
        <TouchableOpacity
          onPress={() => setIsDocSelectorOpen(!isDocSelectorOpen)}
          className="bg-white border border-neutral-200 rounded-2xl p-4 mb-4 flex-row justify-between items-center"
        >
          <Text className="text-xs font-semibold text-neutral-800">
            {docType === 'BRP' && 'Biometric Residence Permit (BRP)'}
            {docType === 'Passport' && 'Passport (ID Page)'}
            {docType === 'Visa' && 'Valid Visa Document'}
            {docType === 'UtilityBill' && 'Utility Bill / Bank Statement'}
          </Text>
          <Text className="text-neutral-400 text-xs">▼</Text>
        </TouchableOpacity>

        {/* Document Type Dropdown Selector Options */}
        {isDocSelectorOpen && (
          <View className="bg-white border border-neutral-200 rounded-2xl p-2.5 mb-4 shadow-md">
            {[
              { key: 'BRP', label: 'Biometric Residence Permit (BRP)' },
              { key: 'Passport', label: 'Passport (ID Page)' },
              { key: 'Visa', label: 'Valid Visa Document' },
              { key: 'UtilityBill', label: 'Utility Bill / Bank Statement' },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => {
                  setDocType(option.key as any);
                  setIsDocSelectorOpen(false);
                  setUploadedFile(null); // clear uploaded file as type changed
                }}
                className="py-3 px-4 border-b border-neutral-50 last:border-b-0"
              >
                <Text className="text-xs font-bold text-neutral-700">{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Document upload picker */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Upload Verification File</Text>
        {isUploading ? (
          <View className="border-2 border-dashed border-neutral-300 rounded-3xl p-8 items-center justify-center mb-6 bg-white">
            <ActivityIndicator size="small" color="#FF6B00" />
            <Text className="text-xs text-neutral-400 font-bold mt-2">Uploading attachment...</Text>
          </View>
        ) : uploadedFile ? (
          <View className="bg-[#E6F4EA] border border-[#CEEAD6] rounded-3xl p-5 mb-6 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">📄</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-neutral-800" numberOfLines={1}>
                  {uploadedFile.name}
                </Text>
                <Text className="text-[10px] text-neutral-500 mt-0.5">{uploadedFile.size}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClearFile} className="bg-white px-3 py-1.5 rounded-xl border border-neutral-200">
              <Text className="text-[9px] font-black text-error-default">CLEAR</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleFileAttach}
            className="border-2 border-dashed border-neutral-300 rounded-3xl p-8 items-center justify-center mb-6 bg-white"
          >
            <Text className="text-3xl mb-2">📥</Text>
            <Text className="text-xs font-bold text-neutral-700">Tap to upload verification copy</Text>
            <Text className="text-[9px] text-neutral-400 mt-1 font-semibold">Supports PDF, PNG, JPG (Max 5MB)</Text>
          </TouchableOpacity>
        )}

        {/* Additional notes */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Optional Additional Notes</Text>
        <TextInput 
          value={additionalNotes}
          onChangeText={setAdditionalNotes}
          placeholder="Mention details that may speed up your review..."
          className="bg-white border border-neutral-200 rounded-2xl p-4 mb-6 text-xs font-semibold text-neutral-800 min-h-[60px]"
          multiline
        />

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          className="bg-primary-500 rounded-2xl py-4 items-center justify-center shadow-lg shadow-primary-500/10 mb-8"
        >
          <Text className="text-white font-extrabold text-sm">Submit For Verification</Text>
        </TouchableOpacity>

        {/* Trust compliance guidelines / privacy policies */}
        <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-10">
          <Text className="text-xs font-bold text-neutral-800 mb-3">🛡️ Safe & Secure Compliance Guidelines</Text>
          
          <View className="space-y-3">
            <View>
              <Text className="text-xs font-bold text-neutral-700">Why documents are required:</Text>
              <Text className="text-[10px] text-neutral-500 leading-relaxed mt-0.5">
                To prevent identity impersonation, false reviews, and ensure a highly trusted directory network for African diaspora communities.
              </Text>
            </View>
            <View className="mt-3">
              <Text className="text-xs font-bold text-neutral-700">Privacy & Encryption protection:</Text>
              <Text className="text-[10px] text-neutral-500 leading-relaxed mt-0.5">
                All documents are encrypted using bank-grade AES-256 standard and saved in isolated storage containers. Only certified compliance reviewers have access.
              </Text>
            </View>
            <View className="mt-3">
              <Text className="text-xs font-bold text-neutral-700">Timeline & Data Retention policy:</Text>
              <Text className="text-[10px] text-neutral-500 leading-relaxed mt-0.5">
                Application review completes in 24-48 business hours. Uploaded documents are automatically deleted from servers 30 days after review finishes.
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
