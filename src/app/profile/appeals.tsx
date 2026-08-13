import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTrustStore } from '@/store/trust';
import { apiClient } from '@/lib/apiClient';
import { useNotification } from '@/providers/notification-provider';

// Workflow steps for the moderation queue
const workflowSteps = [
  { status: 'PendingReview', label: 'Pending Review' },
  { status: 'Approved', label: 'Approved' },
  { status: 'Rejected', label: 'Rejected' },
  { status: 'Escalated', label: 'Escalated' },
  { status: 'Appealed', label: 'Appealed' },
  { status: 'Resolved', label: 'Resolved' },
];

export default function AppealsScreen() {
  const trustStore = useTrustStore();
  const { showAlert } = useNotification();
  const [appeals, setAppeals] = useState(trustStore.appeals);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  
  // Form State
  const [appealType, setAppealType] = useState<'Verification' | 'Content' | 'Suspension' | 'Publishing'>('Verification');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmitAppeal = () => {
    if (!reason.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'Please provide a justification for your appeal.' });
      return;
    }

    setIsLoading(true);
    // Simulating API POST request
    apiClient.post('/trust/appeals', { type: appealType, targetId, reason })
      .then((res) => {
        setIsLoading(false);
        const newAppeal = res.data.data;
        
        // Add to Zustand state
        trustStore.submitAppeal(appealType, targetId || `tgt-${Date.now()}`, reason);
        setAppeals(useTrustStore.getState().appeals);
        
        showAlert({
          type: 'success',
          title: 'Appeal Received',
          message: 'Your appeal has been received. You can trace its workflow state below.',
          buttons: [
            { text: 'OK', onPress: () => {
              setShowSubmitForm(false);
              setReason('');
              setTargetId('');
            }}
          ]
        });
      })
      .catch(() => {
        setIsLoading(false);
      });
  };

  // Helper to draw the state timeline indicator for moderation progress
  const renderWorkflowTracker = (currentStatus: string) => {
    // Determine active index. For demo we map active state indices
    let activeIdx = 0;
    if (currentStatus === 'Approved') activeIdx = 1;
    else if (currentStatus === 'Rejected') activeIdx = 2;
    else if (currentStatus === 'Escalated') activeIdx = 3;
    else if (currentStatus === 'Appealed') activeIdx = 4;
    else if (currentStatus === 'Resolved') activeIdx = 5;

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
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setAppealType(opt.id)}
                  className={`px-3 py-2 rounded-xl border ${appealType === opt.id ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'}`}
                >
                  <Text className={`text-[10px] font-bold ${appealType === opt.id ? 'text-primary-500' : 'text-content-tertiary'}`}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">Reference ID (Optional)</Text>
            {/* Both fields carried only a placeholder. The visible label above
                each is a sibling Text, which a screen reader does not associate
                with the field — so this form announced two unnamed inputs. It
                matters more here than most: a restricted member's appeal is the
                only route back into the product. */}
            <TextInput
              testID="appeal-reference"
              value={targetId}
              onChangeText={setTargetId}
              placeholder="e.g. guide-123 or suspend-session"
              accessibilityLabel="Reference ID, optional"
              className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-bold text-content-strong mb-4"
            />

            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-widest mb-2">Justification / Reason</Text>
            <TextInput
              testID="appeal-reason"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              placeholder="Explain why this restriction should be reviewed..."
              accessibilityLabel="Justification or reason, required"
              className="bg-surface-background border border-subtle rounded-2xl p-4 text-xs font-bold text-content-strong mb-6 min-h-[80px]"
            />

            <Button
              label={isLoading ? 'Filing Appeal...' : 'Submit Appeal'}
              disabled={isLoading}
              onPress={handleSubmitAppeal}
              className="w-full"
            />
          </View>
        )}

        {/* Appeals List */}
        <View className="space-y-4">
          {appeals.map((item) => (
            <View key={item.appealId} className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-black text-primary-500 uppercase tracking-wider">{item.type} Appeal</Text>
                <View className="bg-surface-muted border border-subtle px-2 py-0.5 rounded">
                  <Text className="text-[9px] text-content-muted font-bold uppercase">{item.status}</Text>
                </View>
              </View>

              <Text className="text-[10px] text-content-faint font-bold mb-3">Filed on {item.createdAt}</Text>
              <Text className="text-xs font-extrabold text-content-strong mb-1">Your justification:</Text>
              <Text className="text-xs text-content-muted leading-relaxed mb-3 bg-surface-background/50 p-2.5 rounded-lg border border-faint">{item.reason}</Text>

              {item.explanation && (
                <>
                  <Text className="text-xs font-extrabold text-content-strong mb-1">Moderator review comments:</Text>
                  <Text className="text-xs text-content-muted leading-relaxed bg-[#E8F7F4]/30 border border-[#A3EBDB]/30 p-2.5 rounded-lg">{item.explanation}</Text>
                </>
              )}

              {/* Render visual timeline */}
              {renderWorkflowTracker(item.status)}
            </View>
          ))}

          {appeals.length === 0 && (
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
