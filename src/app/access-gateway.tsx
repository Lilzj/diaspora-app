import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useMyVerifications, useSubmitAppeal } from '@/hooks/trust';
import { APPEAL_REASON_MIN_LENGTH, isAppealAlreadyOpenError, trustErrorMessage } from '@/lib/trust-api';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar } from '@/components/Avatar';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNotification } from '@/providers/notification-provider';
import { useThemeTokens } from '@/design-system';

export default function AccessGatewayScreen() {
  const tokens = useThemeTokens();
  const { user, signOut, setAccountState, setExploringLimited } = useAuthStore();
  // Why the account is suspended, and until when, from the server's access decision (7 Nov 2026).
  const access = useAuthStore((state) => state.access);
  const { showToast, showAlert } = useNotification();

  // ── Where this screen's verification comes from, after Wave D-4 ───────────
  //
  // `GET /trust/verifications?type=Diaspora`, and the appeal goes to
  // `POST /trust/appeals`.
  //
  // It read `store/trust.ts`'s `diasporaVerification` — a record the wizard
  // wrote locally and nothing on the server had ever seen. The appeal it filed
  // went to `trustStore.submitVerificationAppeal`, which appended a fabricated
  // appeal to a local array and then set the account state to `AppealPending`
  // itself. A member could reach "Appeal Under Review" without any request
  // leaving the device.
  const { latestOfType } = useMyVerifications({ type: 'Diaspora' });
  const { submit: submitAppeal, isPending: isSubmittingAppeal } = useSubmitAppeal();
  const diasporaVerification = latestOfType('Diaspora');

  // An appeal is in flight when the server moved the verification to
  // `Appealed`. Previously this was a local `appealStatus` field the client set
  // on itself.
  const isAppealInFlight = diasporaVerification?.status === 'Appealed';

  const accountState = user?.accountState || 'LimitedAccess';

  // Appeal flow state
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealExplanation, setAppealExplanation] = useState('');
  const [uploadedAppealDoc, setUploadedAppealDoc] = useState<string | null>(null);
  const [suspensionAppealSent, setSuspensionAppealSent] = useState(false);

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

  // The reviewer's decision lands on the server, not here. Asking each time this
  // screen comes into view is what moves an approved member on without signing
  // out and in again — the effect above then routes them to the tabs.
  useFocusEffect(
    useCallback(() => {
      void useAuthStore.getState().syncAccess();
    }, []),
  );

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)');
  };

  const handleRetryUpload = () => {
    // Nothing local to reset any more — the server holds the verification, and
    // a resubmission opens a new one.
    setAccountState('LimitedAccess');
    // We let the useEffect trigger route to discover first, and then verification can be opened.
    // Or we can direct to verification directly:
    router.push('/verification/diaspora');
  };

  const handleAppealSubmit = async () => {
    if (appealExplanation.trim().length < APPEAL_REASON_MIN_LENGTH) {
      showToast({
        type: 'error',
        title: 'Tell us a little more',
        message: `Please explain your appeal in at least ${APPEAL_REASON_MIN_LENGTH} characters.`,
      });
      return;
    }

    // The appeal names the verification it is against. There is no placeholder
    // for this: the old code fell back to the literal string
    // `'diaspora-verify'`, which the server would answer with
    // `trust.verification.not-found`.
    if (!diasporaVerification) {
      showToast({
        type: 'error',
        title: 'Nothing to appeal yet',
        message: 'We could not find a verification decision to appeal. Try again in a moment.',
      });
      return;
    }

    try {
      await submitAppeal({
        type: 'Verification',
        targetId: diasporaVerification.verificationId,
        reason: appealExplanation.trim(),
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
    }
  };

  /**
   * An appeal against the suspension itself (6 Nov 2026).
   *
   * The suspended state used to send its appeal through `handleAppealSubmit`,
   * which files a **Verification** appeal and needs a verification decision to
   * name, so a suspended member was told "Nothing to appeal yet". A suspension
   * appeal names the member's own account, as a points-hold appeal does, and
   * stays on this screen: moving to `AppealPending` would show the
   * verification-appeal page about documents they never sent.
   */
  const handleSuspensionAppealSubmit = async () => {
    if (appealExplanation.trim().length < APPEAL_REASON_MIN_LENGTH) {
      showToast({
        type: 'error',
        title: 'Tell us a little more',
        message: `Please explain your appeal in at least ${APPEAL_REASON_MIN_LENGTH} characters.`,
      });
      return;
    }
    if (!user?.userId) return;

    try {
      await submitAppeal({
        type: 'Suspension',
        targetId: user.userId,
        reason: appealExplanation.trim(),
        additionalDocuments: [],
        correctionRequest: false,
      });
      setSuspensionAppealSent(true);
      setShowAppealForm(false);
      setAppealExplanation('');
      showAlert({
        type: 'success',
        title: 'Appeal sent',
        message: 'A person on the Diaspora team will review it.',
      });
    } catch (cause) {
      if (isAppealAlreadyOpenError(cause)) {
        setSuspensionAppealSent(true);
        setShowAppealForm(false);
        return;
      }
      showToast({ type: 'error', title: 'Not sent', message: trustErrorMessage(cause) });
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
      <View className="bg-surface-background border border-faint rounded-3xl p-5 mb-6">
        <Text className="text-xs font-extrabold text-content-muted uppercase tracking-wider mb-4">Review Progress Tracker</Text>
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
                      backgroundColor: isCompleted ? '#10B981' : tokens.color.neutral[200],
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
                    borderColor: isCompleted ? '#059669' : isActive ? '#F59300' : tokens.color.neutral[200],
                    backgroundColor: isCompleted ? '#10B981' : tokens.color.surface.card,
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
                      color: isCompleted ? tokens.color.text.primary : isActive ? '#D97706' : '#9CA3AF',
                    }}
                  >
                    {step.label}
                  </Text>
                  {isActive && (
                    <Text style={{ fontSize: 10, color: tokens.color.text.placeholder, marginTop: 4, lineHeight: 15 }}>
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
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      {/* Access Header */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-faint bg-surface-card">
        <View className="flex-row items-center">
          <Avatar uri={user?.avatarUrl} name={user?.fullName || 'User'} size={38} />
          <View className="ml-3">
            <Text className="text-xs text-content-faint font-extrabold uppercase">Account Security</Text>
            <Text className="text-sm font-bold text-content-primary">{user?.fullName}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} className="px-3 py-1.5 rounded-xl border border-error-default bg-surface-muted">
          <Text className="text-xs font-bold text-error-default">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* The appeal/more-information states put a multiline field at the
          bottom of this screen, which the keyboard covered. */}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24 }}
        showsVerticalScrollIndicator={false}
      >
        
        {/* State A: Verification Under Review / Pending */}
        {(accountState === 'DiasporaVerificationPending' || accountState === 'VerificationUnderReview') && (
          <View>
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-surface-muted rounded-full items-center justify-center mb-4 border border-subtle">
                <Text className="text-3xl">🛡️</Text>
              </View>
              <Text className="text-xl font-black text-content-primary text-center tracking-tight">Verification Under Review</Text>
              <Text className="text-xs text-content-muted text-center mt-2 px-4 leading-relaxed">
                Your Diaspora verification files have been sent for manual compliance check. We restrict community access until verified.
              </Text>
            </View>

            {renderVerificationTimeline('UnderReview')}

            {/* Submitted Info Snapshot */}
            {diasporaVerification && (
              <View className="bg-surface-card border border-subtle rounded-3xl p-5 mb-8 shadow-sm">
                <Text className="text-xs font-extrabold text-content-muted uppercase tracking-wider mb-3">Submitted Application details</Text>
                <View className="space-y-2">
                  <View className="flex-row justify-between py-1.5 border-b border-faint">
                    <Text className="text-xs text-content-muted">Nationality</Text>
                    <Text className="text-xs font-semibold text-content-strong">{diasporaVerification.nationality ?? '—'}</Text>
                  </View>
                  <View className="flex-row justify-between py-1.5 border-b border-faint">
                    <Text className="text-xs text-content-muted">Current Residence</Text>
                    <Text className="text-xs font-semibold text-content-strong">{diasporaVerification.residenceCountry ?? '—'}</Text>
                  </View>
                  <View className="flex-row justify-between py-1.5 border-b border-faint">
                    <Text className="text-xs text-content-muted">Status</Text>
                    <Text className="text-xs font-semibold text-content-strong">{diasporaVerification.status}</Text>
                  </View>
                  <View className="flex-row justify-between py-1.5">
                    <Text className="text-xs text-content-muted">Submitted</Text>
                    <Text className="text-xs font-semibold text-content-strong">
                      {diasporaVerification.submittedAt.slice(0, 10)}
                      {/*
                        `documentCount`, not the document metadata. The server's
                        list projection does not carry per-document details —
                        that is the detail route — and the fields this card used
                        to show came from the local copy of the form.
                      */}
                      {` · ${diasporaVerification.documentCount} document${diasporaVerification.documentCount === 1 ? '' : 's'}`}
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
              <View className="w-16 h-16 bg-surface-muted rounded-full items-center justify-center mb-4 border border-subtle">
                <Text className="text-3xl">⚠️</Text>
              </View>
              <Text className="text-xl font-black text-content-primary text-center tracking-tight">Verification Rejected</Text>
              <Text className="text-xs text-content-muted text-center mt-2 px-4 leading-relaxed">
                Unfortunately, our safety agents could not approve your submitted documents.
              </Text>
            </View>

            {/* Rejection Details Box */}
            <View className="bg-surface-muted border border-error-default/20 rounded-3xl p-5 mb-6">
              <Text className="text-xs font-black text-error-default uppercase tracking-wider mb-2">Moderation Reject Details</Text>
              <Text className="text-xs text-content-secondary leading-relaxed font-semibold">
                {/* The reviewer's own words, or nothing invented in their place
                    (6 Nov 2026: this fell back to a made-up finding about the
                    member's document). */}
                {diasporaVerification?.rejectionReasonDetails ??
                  "We could not load the reviewer's explanation. Try again in a moment."}
              </Text>
            </View>

            {/* Appeal status tracking */}
            {isAppealInFlight ? (
              <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-8">
                <Text className="text-xs font-bold text-warning-default">⏳ Appeal Under Review</Text>
                <Text className="text-[10px] text-content-muted mt-1 leading-relaxed">
                  Your priority appeal has been submitted and is currently inside the safety review queue. We will notify you once reviewed.
                </Text>
              </View>
            ) : (
              <View className="space-y-3 mb-8">
                <Button label="Upload Again" variant="primary" onPress={handleRetryUpload} />
                
                {!showAppealForm ? (
                  <Button label="File an Appeal" variant="ghost" onPress={() => setShowAppealForm(true)} />
                ) : (
                  <View className="bg-surface-card border border-subtle rounded-3xl p-5 mt-4">
                    <Text className="text-sm font-bold text-content-strong mb-3">Submit Appeal Request</Text>
                    
                    <Text className="text-xs text-content-faint font-extrabold uppercase mb-2">Appeal Explanation</Text>
                    <TextInput
                      value={appealExplanation}
                      onChangeText={setAppealExplanation}
                      placeholder="Detail why you believe the decision was incorrect..."
                      multiline
                      numberOfLines={4}
                      className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-bold text-content-strong mb-4 min-h-[80px]"
                    />

                    {/* File picker simulation */}
                    <TouchableOpacity
                      onPress={() => setUploadedAppealDoc('additional_supporting_docs.pdf')}
                      className="border border-dashed border-line p-4 rounded-2xl items-center justify-center mb-6"
                    >
                      <Text className="text-xs font-bold text-content-muted">
                        {uploadedAppealDoc ? `📄 ${uploadedAppealDoc}` : '📥 Attach supporting file (optional)'}
                      </Text>
                    </TouchableOpacity>

                    <View className="flex-row gap-2">
                      <TouchableOpacity 
                        onPress={() => setShowAppealForm(false)} 
                        className="flex-1 bg-surface-muted py-3 rounded-2xl items-center border border-subtle"
                      >
                        <Text className="text-xs font-bold text-content-tertiary">Cancel</Text>
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
              <View className="w-16 h-16 bg-surface-muted rounded-full items-center justify-center mb-4 border border-subtle">
                <Text className="text-3xl">⏳</Text>
              </View>
              <Text className="text-xl font-black text-content-primary text-center tracking-tight">Appeal Review Active</Text>
              <Text className="text-xs text-content-muted text-center mt-2 px-4 leading-relaxed">
                Your appeal request is under compliance review. We will notify you immediately once resolved.
              </Text>
            </View>

            <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-6">
              <Text className="text-xs font-bold text-content-strong mb-2">Appeal Details Status</Text>
              <Text className="text-xs text-content-tertiary leading-relaxed">
                Status: <Text className="font-extrabold text-warning-default">Pending Safety Check</Text>
              </Text>
              <Text className="text-xs text-content-tertiary leading-relaxed mt-2">
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
              <View className="w-16 h-16 bg-surface-muted rounded-full items-center justify-center mb-4 border border-subtle">
                <Text className="text-3xl">🚨</Text>
              </View>
              <Text className="text-xl font-black text-content-primary text-center tracking-tight">Account Suspended</Text>
              <Text className="text-xs text-content-muted text-center mt-2 px-4 leading-relaxed">
                Your Diaspora account is suspended.
              </Text>
            </View>

            {/* Only what is true. On 6 Nov this box listed two fixed "Policy
                Violations" to every suspended member; then it said the reason was
                not shown yet. Since 7 Nov the server sends the reason, what the
                staff member wrote, and the end date (a dated suspension now ends
                on its own), and this box shows exactly those. */}
            <View className="bg-surface-muted border border-subtle rounded-3xl p-5 mb-8">
              <Text className="text-xs font-extrabold text-content-tertiary uppercase tracking-wider mb-2">Why</Text>
              {access?.reasonLabel ? (
                <Text className="text-xs text-content-primary leading-relaxed">
                  Diaspora staff found your account was involved in {access.reasonLabel}.
                </Text>
              ) : null}
              {access?.note ? (
                <Text className="text-xs text-content-secondary leading-relaxed mt-2">
                  Their note: {access.note}
                </Text>
              ) : null}
              {!access?.reasonLabel && !access?.note ? (
                <Text className="text-xs text-content-secondary leading-relaxed">
                  The reason could not be loaded just now.
                </Text>
              ) : null}
              <Text className="text-xs text-content-secondary leading-relaxed mt-2">
                {access?.restrictedUntil
                  ? `It ends on ${new Date(access.restrictedUntil).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}.`
                  : 'It has no end date.'}{' '}
                If you think it is a mistake, appeal below and a person on the Diaspora team will review it.
              </Text>
            </View>

            <View className="space-y-3 mb-8">
              {suspensionAppealSent ? (
                <View className="bg-surface-background border border-subtle rounded-3xl p-5">
                  <Text className="text-xs font-bold text-warning-default">Appeal sent</Text>
                  <Text className="text-[11px] text-content-muted mt-1 leading-relaxed">
                    Your appeal is with the Diaspora team. A person will review it.
                  </Text>
                </View>
              ) : !showAppealForm ? (
                <Button label="Appeal this suspension" variant="primary" onPress={() => setShowAppealForm(true)} />
              ) : (
                <View className="bg-surface-card border border-subtle rounded-3xl p-5 mt-4">
                  <Text className="text-sm font-bold text-content-strong mb-3">Appeal this suspension</Text>

                  <Text className="text-xs text-content-faint font-extrabold uppercase mb-2">Why it is a mistake</Text>
                  <TextInput
                    value={appealExplanation}
                    onChangeText={setAppealExplanation}
                    placeholder="Tell us why you think this suspension is a mistake"
                    multiline
                    numberOfLines={4}
                    className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-bold text-content-strong mb-4 min-h-[80px]"
                  />

                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => setShowAppealForm(false)}
                      className="flex-1 bg-surface-muted py-3 rounded-2xl items-center border border-subtle"
                    >
                      <Text className="text-xs font-bold text-content-tertiary">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void handleSuspensionAppealSubmit()}
                      disabled={isSubmittingAppeal}
                      accessibilityState={{ disabled: isSubmittingAppeal }}
                      className="flex-1 bg-primary-500 py-3 rounded-2xl items-center"
                    >
                      <Text className="text-xs font-black text-white">{isSubmittingAppeal ? 'Sending…' : 'Send appeal'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* The "Review Simulation Controls" panel that stood here showed every
            member on this screen buttons to flip their own displayed state to
            approved, rejected or suspended (removed 6 Nov 2026). */}
        <View className="mb-12" />

      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
