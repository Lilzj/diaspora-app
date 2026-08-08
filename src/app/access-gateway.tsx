import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useTrustStore } from '@/store/trust';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar } from '@/components/Avatar';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNotification } from '@/providers/notification-provider';
import { formatDocumentType } from '@/utils/format';

export default function AccessGatewayScreen() {
  const { user, logout, setAccountState, setExploringLimited } = useAuthStore();
  const { showToast, showAlert } = useNotification();
  const trustStore = useTrustStore();
  const accountState = user?.accountState || 'LimitedAccess';

  // Appeal flow state
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealExplanation, setAppealExplanation] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [uploadedAppealDoc, setUploadedAppealDoc] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check routing redirects for direct flow states
    if (accountState === 'RegistrationStarted' || accountState === 'PhoneVerified') {
      router.replace('/(auth)/register');
    } else if (accountState === 'LimitedAccess') {
      // Allow explore mode in tabs
      router.replace('/(tabs)/discover');
    } else if (accountState === 'DiasporaVerified' || accountState === 'FullCommunityAccess') {
      router.replace('/(tabs)');
    }
  }, [accountState]);

  const handleLogout = () => {
    logout();
    router.replace('/(auth)');
  };

  const handleRetryUpload = () => {
    // Reset state and direct to verification
    trustStore.resetVerificationState();
    setAccountState('LimitedAccess');
    // We let the useEffect trigger route to discover first, and then verification can be opened.
    // Or we can direct to verification directly:
    router.push('/verification/diaspora');
  };

  const handleAppealSubmit = async () => {
    if (!appealExplanation.trim()) {
      showToast({
        type: 'error',
        title: 'Required Field',
        message: 'Please describe your appeal explanation.',
      });
      return;
    }
    setIsSubmittingAppeal(true);
    try {
      await trustStore.submitVerificationAppeal({
        verificationId: trustStore.diasporaVerification?.verificationId || 'diaspora-verify',
        explanation: appealExplanation,
        additionalDocuments: uploadedAppealDoc ? [uploadedAppealDoc] : [],
        correctionRequest: true,
      });
      setAccountState('AppealPending');
      setShowAppealForm(false);
      setAppealExplanation('');
      setUploadedAppealDoc(null);
      showAlert({
        type: 'success',
        title: 'Appeal Submitted',
        message: 'Your appeal has been received by our Safety team.',
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Submission Failed',
        message: 'Failed to submit appeal. Please try again.',
      });
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  // Mock reviewer tools (to easily let tester simulate approve/reject/suspend)
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const simulateStatusChange = (status: 'Approved' | 'Rejected' | 'Suspended') => {
    if (status === 'Approved') {
      trustStore.updateDiasporaVerificationStatus('Approved');
      setAccountState('FullCommunityAccess');
    } else if (status === 'Rejected') {
      trustStore.updateDiasporaVerificationStatus('Rejected', {
        code: 'MISMATCHED_NATIONALITY',
        details: 'The uploaded Passport nationality (Nigeria) does not match your self-declared nationality (Ghana) in registration.',
      });
      setAccountState('VerificationRejected');
    } else if (status === 'Suspended') {
      setAccountState('Suspended');
    }
  };

  // Timeline layout for verification steps
  const renderVerificationTimeline = (status: string) => {
    const steps = [
      { key: 'submit', label: 'File Uploaded', completed: true },
      { key: 'queue', label: 'In Queue', completed: true },
      { key: 'review', label: 'Compliance Review', active: status === 'Pending' || status === 'UnderReview', completed: status === 'Approved' },
      { key: 'complete', label: 'Access Granted', active: false, completed: status === 'Approved' },
    ];

    return (
      <View className="bg-neutral-50 border border-neutral-100 rounded-3xl p-5 mb-6">
        <Text className="text-xs font-extrabold text-neutral-450 uppercase tracking-wider mb-4">Review Progress Tracker</Text>
        <View className="space-y-4">
          {steps.map((step, idx) => {
            const isCompleted = step.completed;
            const isActive = step.active;

            return (
              <View 
                key={step.key} 
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  position: 'relative',
                  paddingBottom: idx === steps.length - 1 ? 0 : 40,
                }}
              >
                {idx < steps.length - 1 && (
                  <View 
                    style={{
                      position: 'absolute',
                      left: 11,
                      top: 24,
                      bottom: 0,
                      width: 2,
                      backgroundColor: isCompleted ? '#10B981' : '#E5E7EB',
                      zIndex: 1,
                    }}
                  />
                )}
                
                <View 
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: isCompleted ? '#059669' : isActive ? '#F59300' : '#E5E7EB',
                    backgroundColor: isCompleted ? '#10B981' : '#FFFFFF',
                    zIndex: 10,
                  }}
                >
                  {isCompleted ? (
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>✓</Text>
                  ) : isActive ? (
                    <ActivityIndicator size="small" color="#F59300" style={{ transform: [{ scale: 0.6 }] }} />
                  ) : (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#9CA3AF' }} />
                  )}
                </View>

                <View style={{ marginLeft: 16, flex: 1, paddingTop: 2 }}>
                  <Text 
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isCompleted ? '#1F2937' : isActive ? '#D97706' : '#9CA3AF',
                    }}
                  >
                    {step.label}
                  </Text>
                  {isActive && (
                    <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 4, lineHeight: 15 }}>
                      Our safety compliance agents are verifying details. This finishes in 24-48 business hours.
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      {/* Access Header */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-neutral-100 bg-white">
        <View className="flex-row items-center">
          <Avatar name={user?.fullName || 'User'} size={38} />
          <View className="ml-3">
            <Text className="text-xs text-neutral-400 font-extrabold uppercase">Account Security</Text>
            <Text className="text-sm font-bold text-neutral-900">{user?.fullName}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} className="px-3 py-1.5 rounded-xl border border-error-default bg-error-surface/10">
          <Text className="text-xs font-bold text-error-default">Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {/* State A: Verification Under Review / Pending */}
        {(accountState === 'DiasporaVerificationPending' || accountState === 'VerificationUnderReview') && (
          <View>
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-amber-50 rounded-full items-center justify-center mb-4 border border-amber-100">
                <Text className="text-3xl">🛡️</Text>
              </View>
              <Text className="text-xl font-black text-neutral-900 text-center tracking-tight">Verification Under Review</Text>
              <Text className="text-xs text-neutral-500 text-center mt-2 px-4 leading-relaxed">
                Your Diaspora verification files have been sent for manual compliance check. We restrict community access until verified.
              </Text>
            </View>

            {renderVerificationTimeline('UnderReview')}

            {/* Submitted Info Snapshot */}
            {trustStore.diasporaVerification?.request && (
              <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-8 shadow-sm">
                <Text className="text-xs font-extrabold text-neutral-450 uppercase tracking-wider mb-3">Submitted Application details</Text>
                <View className="space-y-2">
                  <View className="flex-row justify-between py-1.5 border-b border-neutral-50">
                    <Text className="text-xs text-neutral-500">Nationality</Text>
                    <Text className="text-xs font-semibold text-neutral-800">{trustStore.diasporaVerification.request.nationality}</Text>
                  </View>
                  <View className="flex-row justify-between py-1.5 border-b border-neutral-50">
                    <Text className="text-xs text-neutral-500">Current Residence</Text>
                    <Text className="text-xs font-semibold text-neutral-800">{trustStore.diasporaVerification.request.residenceCountry}</Text>
                  </View>
                  <View className="flex-row justify-between py-1.5 border-b border-neutral-50">
                    <Text className="text-xs text-neutral-500">Document Type</Text>
                    <Text className="text-xs font-semibold text-neutral-800">{formatDocumentType(trustStore.diasporaVerification.request.documentType)}</Text>
                  </View>
                  <View className="flex-row justify-between py-1.5">
                    <Text className="text-xs text-neutral-500">Issue Date / Expiry</Text>
                    <Text className="text-xs font-semibold text-neutral-800">
                      {trustStore.diasporaVerification.request.issueDate} / {trustStore.diasporaVerification.request.expiryDate}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <Button
              label="Explore Diaspora (Limited Access)"
              variant="ghost"
              onPress={() => {
                setExploringLimited(true);
                router.replace('/explore');
              }}
              className="mb-8"
            />
          </View>
        )}

        {/* State B: Verification Rejected */}
        {accountState === 'VerificationRejected' && (
          <View>
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-error-surface rounded-full items-center justify-center mb-4 border border-[#FFE3E3]">
                <Text className="text-3xl">⚠️</Text>
              </View>
              <Text className="text-xl font-black text-neutral-900 text-center tracking-tight">Verification Rejected</Text>
              <Text className="text-xs text-neutral-500 text-center mt-2 px-4 leading-relaxed">
                Unfortunately, our safety agents could not approve your submitted documents.
              </Text>
            </View>

            {/* Rejection Details Box */}
            <View className="bg-error-surface/30 border border-error-default/20 rounded-3xl p-5 mb-6">
              <Text className="text-xs font-black text-error-default uppercase tracking-wider mb-2">Moderation Reject Details</Text>
              <Text className="text-xs text-neutral-700 leading-relaxed font-semibold">
                {trustStore.diasporaVerification?.response?.rejectionReasonDetails || 
                  'The uploaded immigration document could not be authenticated. Check image clarity and expiry details.'}
              </Text>
            </View>

            {/* Appeal status tracking */}
            {trustStore.diasporaVerification?.appealStatus === 'Pending' ? (
              <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-8">
                <Text className="text-xs font-bold text-amber-600">⏳ Appeal Under Review</Text>
                <Text className="text-[10px] text-neutral-500 mt-1 leading-relaxed">
                  Your priority appeal has been submitted and is currently inside the safety review queue. We will notify you once reviewed.
                </Text>
              </View>
            ) : (
              <View className="space-y-3 mb-8">
                <Button label="Upload Again" variant="primary" onPress={handleRetryUpload} />
                
                {!showAppealForm ? (
                  <Button label="File an Appeal" variant="ghost" onPress={() => setShowAppealForm(true)} />
                ) : (
                  <View className="bg-white border border-neutral-200 rounded-3xl p-5 mt-4">
                    <Text className="text-sm font-bold text-neutral-800 mb-3">Submit Appeal Request</Text>
                    
                    <Text className="text-xs text-neutral-400 font-extrabold uppercase mb-2">Appeal Explanation</Text>
                    <TextInput
                      value={appealExplanation}
                      onChangeText={setAppealExplanation}
                      placeholder="Detail why you believe the decision was incorrect..."
                      multiline
                      numberOfLines={4}
                      className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs font-bold text-neutral-800 mb-4 min-h-[80px]"
                    />

                    {/* File picker simulation */}
                    <TouchableOpacity
                      onPress={() => setUploadedAppealDoc('additional_supporting_docs.pdf')}
                      className="border border-dashed border-neutral-300 p-4 rounded-2xl items-center justify-center mb-6"
                    >
                      <Text className="text-xs font-bold text-neutral-500">
                        {uploadedAppealDoc ? `📄 ${uploadedAppealDoc}` : '📥 Attach supporting file (optional)'}
                      </Text>
                    </TouchableOpacity>

                    <View className="flex-row gap-2">
                      <TouchableOpacity 
                        onPress={() => setShowAppealForm(false)} 
                        className="flex-1 bg-neutral-100 py-3 rounded-2xl items-center border border-neutral-200"
                      >
                        <Text className="text-xs font-bold text-neutral-600">Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={handleAppealSubmit} 
                        className="flex-1 bg-primary-500 py-3 rounded-2xl items-center"
                      >
                        <Text className="text-xs font-black text-white">Send Appeal</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            <Button
              label="Explore Diaspora (Limited Access)"
              variant="ghost"
              onPress={() => {
                setExploringLimited(true);
                router.replace('/explore');
              }}
              className="mb-8"
            />
          </View>
        )}

        {/* State C: Appeal Pending */}
        {accountState === 'AppealPending' && (
          <View>
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-primary-50 rounded-full items-center justify-center mb-4 border border-primary-100">
                <Text className="text-3xl">⏳</Text>
              </View>
              <Text className="text-xl font-black text-neutral-900 text-center tracking-tight">Appeal Review Active</Text>
              <Text className="text-xs text-neutral-500 text-center mt-2 px-4 leading-relaxed">
                Your appeal request is under compliance review. We will notify you immediately once resolved.
              </Text>
            </View>

            <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-6">
              <Text className="text-xs font-bold text-neutral-800 mb-2">Appeal Details Status</Text>
              <Text className="text-xs text-neutral-600 leading-relaxed">
                Status: <Text className="font-extrabold text-amber-600">Pending Safety Check</Text>
              </Text>
              <Text className="text-xs text-neutral-600 leading-relaxed mt-2">
                "Our safety and compliance board is reviewing your submitted documents and explanation details."
              </Text>
            </View>

            <Button
              label="Explore Diaspora (Limited Access)"
              variant="ghost"
              onPress={() => {
                setExploringLimited(true);
                router.replace('/explore');
              }}
              className="mb-8"
            />
          </View>
        )}

        {/* State D: Suspended */}
        {accountState === 'Suspended' && (
          <View>
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-error-surface rounded-full items-center justify-center mb-4 border border-[#FFE3E3]">
                <Text className="text-3xl">🚨</Text>
              </View>
              <Text className="text-xl font-black text-neutral-900 text-center tracking-tight">Account Suspended</Text>
              <Text className="text-xs text-neutral-505 text-center mt-2 px-4 leading-relaxed">
                Your account was suspended for violations of Diaspora's Community Guidelines.
              </Text>
            </View>

            <View className="bg-error-surface/20 border border-[#FFE3E3] rounded-3xl p-5 mb-8">
              <Text className="text-xs font-extrabold text-error-default uppercase tracking-wider mb-2">Policy Violations</Text>
              <Text className="text-xs text-neutral-700 leading-relaxed">
                • Suspected document counterfeiting or reuse of image hashes.
              </Text>
              <Text className="text-xs text-neutral-700 leading-relaxed mt-1">
                • Misrepresenting geolocation residence boundaries to bypass eligibility rules.
              </Text>
            </View>

            <View className="space-y-3 mb-8">
              {!showAppealForm ? (
                <Button label="Submit Suspension Appeal" variant="primary" onPress={() => setShowAppealForm(true)} />
              ) : (
                <View className="bg-white border border-neutral-200 rounded-3xl p-5 mt-4">
                  <Text className="text-sm font-bold text-neutral-800 mb-3">Submit Suspension Appeal</Text>
                  
                  <Text className="text-xs text-neutral-400 font-extrabold uppercase mb-2">Provide Justification</Text>
                  <TextInput
                    value={appealExplanation}
                    onChangeText={setAppealExplanation}
                    placeholder="Provide a detailed explanation of your residency boundaries..."
                    multiline
                    numberOfLines={4}
                    className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs font-bold text-neutral-800 mb-4 min-h-[80px]"
                  />

                  <View className="flex-row gap-2">
                    <TouchableOpacity 
                      onPress={() => setShowAppealForm(false)} 
                      className="flex-1 bg-neutral-100 py-3 rounded-2xl items-center border border-neutral-200"
                    >
                      <Text className="text-xs font-bold text-neutral-600">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={handleAppealSubmit} 
                      className="flex-1 bg-primary-500 py-3 rounded-2xl items-center"
                    >
                      <Text className="text-xs font-black text-white">Send Appeal</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <Button
                label="Contact Safety Team"
                variant="ghost"
                onPress={() =>
                  showAlert({
                    type: 'info',
                    title: 'Contact Support',
                    message: 'Email safety@diasporaplatform.com for support.',
                  })
                }
              />
            </View>
          </View>
        )}

        {/* Mock Admins Simulation Tools (Floating review drawer) */}
        <View className="mt-8 pt-6 border-t border-neutral-100 mb-12">
          <TouchableOpacity 
            onPress={() => setShowAdminPanel(!showAdminPanel)} 
            className="bg-neutral-100 py-3 rounded-2xl items-center border border-neutral-200"
          >
            <Text className="text-xs font-extrabold text-neutral-600">⚙️ Review Simulation Controls ({showAdminPanel ? 'Hide' : 'Show'})</Text>
          </TouchableOpacity>

          {showAdminPanel && (
            <View className="bg-neutral-50 rounded-2xl p-4 mt-3 border border-neutral-200 space-y-2">
              <Text className="text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center mb-2">Simulate Compliance Decisions</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity 
                  onPress={() => simulateStatusChange('Approved')}
                  className="flex-1 bg-emerald-500 py-2 rounded-xl items-center"
                >
                  <Text className="text-[10px] font-black text-white">Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => simulateStatusChange('Rejected')}
                  className="flex-1 bg-amber-500 py-2 rounded-xl items-center"
                >
                  <Text className="text-[10px] font-black text-white">Reject Details</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => simulateStatusChange('Suspended')}
                  className="flex-1 bg-red-500 py-2 rounded-xl items-center"
                >
                  <Text className="text-[10px] font-black text-white">Suspend Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
