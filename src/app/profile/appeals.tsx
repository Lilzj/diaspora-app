// ── Where this screen's data comes from, after Wave D-4 ──────────────────────
//
// `GET /trust/appeals` and `POST /trust/appeals`.
//
// The POST was already being made — and its response thrown away. The screen
// called `apiClient.post('/trust/appeals', …)`, assigned the response to a
// `newAppeal` variable it never read, then called `trustStore.submitAppeal(…)`
// to **fabricate a second appeal locally** and rendered that. So the list showed
// an appeal with a client-invented id, a client-invented `createdAt`, and the
// placeholder explanation *"Our governance team is reviewing your appeal
// request"* attributed to a moderator who had not seen it.
//
// Three validation rules the form did not enforce and the server does:
//
//   * `reason` must be **at least 20 characters**. The old check was
//     `!reason.trim()`.
//   * `targetId` is **required**. The field was labelled "Optional" and the
//     screen substituted `tgt-${Date.now()}` when it was blank — an identifier
//     pointing at nothing, which a reviewer cannot act on.
//   * One open appeal per target. A second is a 409.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useMyAppeals, useSubmitAppeal } from '@/hooks/trust';
import { APPEAL_REASON_MIN_LENGTH, appealTrackerIndex } from '@/lib/trust-api';
import { appealPrefill } from '@/lib/reward-hold';
import { useAuthStore } from '@/store/auth';
import { usePrimaryWallet } from '@/hooks/financial';
import type { AppealStatus, AppealType } from '@/types/trust';
import { useNotification } from '@/providers/notification-provider';

// The tracker the screen draws. Not a sequence — three of these are terminal
// outcomes — which is why `appealTrackerIndex` in `lib/trust-api.ts` owns the
// mapping from the six real `AppealStatus` values onto it.
const workflowSteps = [
  { status: 'PendingReview', label: 'Pending Review' },
  { status: 'Approved', label: 'Approved' },
  { status: 'Rejected', label: 'Rejected' },
  { status: 'Escalated', label: 'Escalated' },
  { status: 'Appealed', label: 'Appealed' },
  { status: 'Resolved', label: 'Resolved' },
];

export default function AppealsScreen() {
  const { showAlert } = useNotification();
  const { appeals, isLoading: isListLoading, isEmpty, error: listError, refresh } = useMyAppeals();
  const { submit, isPending, error: submitError } = useSubmitAppeal();
  // The points screens open this one to review a hold, with the type and the
  // target filled in (RWD-14, CS-4a); the form starts open on it.
  const params = useLocalSearchParams<{ type?: string; targetId?: string }>();
  const [prefill] = useState(() => appealPrefill(params));
  const memberId = useAuthStore((state) => state.user?.userId);
  const [showSubmitForm, setShowSubmitForm] = useState(prefill !== null);

  // Form State
  const [appealType, setAppealType] = useState<AppealType>(prefill?.type ?? 'Verification');
  const [targetId, setTargetId] = useState(prefill?.targetId ?? '');
  const [reason, setReason] = useState('');

  // A points hold is the member's own: it is appealed under their id, so there
  // is no reference to type.
  const isHoldReview = appealType === 'RewardHold';
  // A frozen wallet is the member's own too (7 Nov 2026). The freeze notice
  // says "appeal from Profile, Appeals", and a member never sees their wallet's
  // id, so the form names the wallet itself unless the wallet screen already did.
  const { wallet } = usePrimaryWallet();
  const isWalletReview = appealType === 'Money';
  const namedWallet = prefill?.type === 'Money' && prefill.targetId ? prefill.targetId : null;
  const effectiveTarget = isHoldReview
    ? (memberId ?? '')
    : isWalletReview
      ? (namedWallet ?? wallet?.walletId ?? '')
      : targetId;

  /**
   * What the form will not be sent without, by the name above the field.
   *
   * <p>
   * Both rules were already here and both fired as an alert after the tap:
   * "Reference needed", then "Tell us a little more". A restricted member's
   * appeal is the only route back into the product, and the form let them
   * write nothing, press Submit and be refused — twice, one rule at a time,
   * since the handler returns at the first.
   * </p>
   * <p>
   * The reason's minimum length is not here. It is a length rather than a
   * presence, and the counter under the field already counts it down in the
   * member's own words — "12 more characters needed" — which is a better
   * message than a name on a list.
   * </p>
   */
  const required = [
    { label: 'Reference ID', ok: effectiveTarget.trim().length > 0 },
    { label: 'Justification / Reason', ok: reason.trim().length > 0 },
  ];

  const stillNeeded = required.filter((field) => !field.ok).map((field) => field.label);

  const canSubmit =
    stillNeeded.length === 0 && reason.trim().length >= APPEAL_REASON_MIN_LENGTH;

  const handleSubmitAppeal = async () => {
    const trimmedTarget = effectiveTarget.trim();
    const trimmedReason = reason.trim();

    if (!canSubmit) return;

    try {
      await submit({ type: appealType, targetId: trimmedTarget, reason: trimmedReason });

      showAlert({
        type: 'success',
        title: 'Appeal Received',
        message: 'Your appeal has been received. You can trace its workflow state below.',
        buttons: [
          {
            text: 'OK',
            onPress: () => {
              setShowSubmitForm(false);
              setReason('');
              setTargetId('');
            },
          },
        ],
      });
    } catch {
      // The hook holds the sentence; the banner below renders it. Nothing is
      // written locally, so a failed appeal leaves no trace of one.
      showAlert({
        type: 'error',
        title: 'Appeal not filed',
        message: submitError ?? 'We could not file your appeal just now. Please try again.',
      });
    }
  };

  // Helper to draw the state timeline indicator for moderation progress
  const renderWorkflowTracker = (currentStatus: AppealStatus) => {
    const activeIdx = appealTrackerIndex(currentStatus);

    return (
      <View className="mt-4 bg-surface-background rounded-2xl p-4 border border-faint">
        <Text className="text-[10px] font-black text-content-faint uppercase tracking-wider mb-3">Moderation Queue Progress</Text>
        
        <View className="flex-row justify-between items-center relative">
          {/* Connector line */}
          <View className="absolute left-1.5 right-1.5 h-0.5 bg-subtle top-2.5 z-0" />
          <View className={`absolute left-1.5 h-0.5 bg-primary-500 top-2.5 z-0`} style={{ width: `${(activeIdx / 5) * 100}%` }} />

          {workflowSteps.map((step, idx) => {
            const isCompleted = idx <= activeIdx;
            const isCurrent = idx === activeIdx;

            return (
              <View key={step.status} className="items-center z-10 flex-1 min-w-0 px-0.5">
                <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                  isCurrent ? 'bg-primary-500 border-primary-600' : isCompleted ? 'bg-primary-300 border-primary-400' : 'bg-surface-card border-subtle'
                }`}>
                  <Text className={`text-[8px] font-black ${isCompleted ? 'text-white' : 'text-content-faint'}`}>
                    {idx + 1}
                  </Text>
                </View>
                <Text 
                  numberOfLines={2}
                  className={`text-[8px] font-extrabold text-center mt-1.5 w-full leading-tight ${
                    isCurrent ? 'text-primary-500' : isCompleted ? 'text-content-secondary' : 'text-content-faint'
                  }`}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      <ScreenHeader title="Policy Appeals" />

      {/* The appeal body is a multiline field near the bottom of the form; with
          a plain ScrollView the keyboard covered both it and the submit. */}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        
        <View className="mb-6 flex-row justify-between items-center">
          <Text className="text-sm font-extrabold text-content-muted">Governance Appeals</Text>
          <TouchableOpacity
            onPress={() => setShowSubmitForm(!showSubmitForm)}
            className="bg-primary-500 px-4 py-2 rounded-xl"
          >
            <Text className="text-xs font-black text-white">{showSubmitForm ? 'Hide Form' : 'File New Appeal'}</Text>
          </TouchableOpacity>
        </View>

        {/* Appeal Form */}
        {showSubmitForm && (
          <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-6">
            <Text className="text-base font-black text-content-primary mb-4">File Governance Appeal</Text>

            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">Appeal Type</Text>
            <View className="flex-row gap-2 mb-4 flex-wrap">
              {[
                { id: 'Verification' as const, label: 'Residency Verification' },
                { id: 'Content' as const, label: 'Content Removal' },
                { id: 'Suspension' as const, label: 'Suspension' },
                { id: 'Publishing' as const, label: 'Publishing Restrict' },
                { id: 'RewardHold' as const, label: 'Points Hold' },
                { id: 'Money' as const, label: 'Wallet Frozen' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setAppealType(opt.id)}
                  className={`px-3 py-2 rounded-xl border ${appealType === opt.id ? 'bg-surface-muted border-primary-500' : 'bg-surface-background border-subtle'}`}
                >
                  <Text className={`text-[10px] font-bold ${appealType === opt.id ? 'text-primary-500' : 'text-content-tertiary'}`}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {isHoldReview ? (
              <Text className="text-xs text-content-muted font-semibold mb-4">
                We will review the hold on your own points.
              </Text>
            ) : isWalletReview ? (
              <Text className="text-xs text-content-muted font-semibold mb-4">
                {effectiveTarget
                  ? 'We will review the freeze on your wallet.'
                  : 'You have no wallet to appeal about yet.'}
              </Text>
            ) : (
              <>
                <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">Reference ID</Text>
                {/* Both fields carried only a placeholder. The visible label above
                    each is a sibling Text, which a screen reader does not associate
                    with the field — so this form announced two unnamed inputs. It
                    matters more here than most: a restricted member's appeal is the
                    only route back into the product. */}
                <TextInput
                  testID="appeal-reference"
                  value={targetId}
                  onChangeText={setTargetId}
                  placeholder="The verification or decision id you are appealing"
                  accessibilityLabel="Reference ID, required"
                  className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-bold text-content-strong mb-4"
                />
              </>
            )}

            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">Justification / Reason</Text>
            <TextInput
              testID="appeal-reason"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              placeholder="Explain why this restriction should be reviewed..."
              accessibilityLabel="Justification or reason, required"
              className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-bold text-content-strong mb-2 min-h-[80px]"
            />

            {/* The server's floor, stated before the member hits it. */}
            <Text className="text-[10px] text-content-faint font-semibold mb-6">
              {reason.trim().length < APPEAL_REASON_MIN_LENGTH
                ? `${APPEAL_REASON_MIN_LENGTH - reason.trim().length} more characters needed`
                : `${reason.trim().length} characters`}
            </Text>

            {submitError !== null && (
              <Text className="text-xs text-error-default font-semibold mb-3">{submitError}</Text>
            )}

            {stillNeeded.length > 0 ? (
              <Text className="text-xs font-semibold text-content-muted mb-3">
                Still needed: {stillNeeded.join(', ')}
              </Text>
            ) : null}

            <Button
              label={isPending ? 'Filing Appeal...' : 'Submit Appeal'}
              disabled={isPending || !canSubmit}
              onPress={() => void handleSubmitAppeal()}
              className="w-full"
            />
          </View>
        )}

        {/* Appeals List */}
        <View className="space-y-4">
          {isListLoading && (
            <View className="py-10 items-center" accessibilityLabel="Loading your appeals">
              <ActivityIndicator />
            </View>
          )}

          {listError !== null && (
            <TouchableOpacity
              onPress={refresh}
              className="bg-surface-muted border border-error-default/20 rounded-3xl p-5"
            >
              <Text className="text-xs font-extrabold text-error-default mb-1">
                We could not load your appeals
              </Text>
              <Text className="text-xs text-content-tertiary">{listError} Tap to try again.</Text>
            </TouchableOpacity>
          )}

          {appeals.map((item) => (
            <View key={item.appealId} className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-black text-primary-500 uppercase tracking-wider">{item.type} Appeal</Text>
                <View className="bg-surface-muted border border-subtle px-2 py-0.5 rounded">
                  <Text className="text-[9px] text-content-muted font-bold uppercase">{item.status}</Text>
                </View>
              </View>

              <Text className="text-[10px] text-content-faint font-bold mb-3">
                Filed on {item.createdAt.slice(0, 10)}
                {item.isCorrectionRequest ? ' · Correction request' : ''}
                {item.evidenceCount > 0 ? ` · ${item.evidenceCount} evidence items` : ''}
              </Text>
              <Text className="text-xs font-extrabold text-content-strong mb-1">Your justification:</Text>
              <Text className="text-xs text-content-muted leading-relaxed mb-3 bg-surface-background/50 p-2.5 rounded-lg border border-faint">{item.reason}</Text>

              {item.explanation && (
                <>
                  <Text className="text-xs font-extrabold text-content-strong mb-1">Moderator review comments:</Text>
                  <Text className="text-xs text-content-muted leading-relaxed bg-surface-muted/30 border border-subtle/30 p-2.5 rounded-lg">{item.explanation}</Text>
                </>
              )}

              {/* Render visual timeline */}
              {renderWorkflowTracker(item.status)}
            </View>
          ))}

          {isEmpty && (
            <View className="bg-surface-card border border-subtle rounded-3xl p-8 items-center justify-center">
              <Text className="text-3xl mb-2">📂</Text>
              <Text className="text-xs font-bold text-content-strong">No active appeals</Text>
              <Text className="text-[10px] text-content-faint mt-1 leading-relaxed text-center">
                You currently have no restriction appeals filed.
              </Text>
            </View>
          )}
        </View>

        <View className="h-10" />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
