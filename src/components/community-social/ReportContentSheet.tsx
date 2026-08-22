// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Reporting community content (Wave D-2b)
//
// The reasons come from **`GET /community/reports/reasons`**, not from a
// constant. The list is deployment configuration: a hardcoded picker drifts
// from the server's the first time a reason is added, and a reason the server
// does not know is a 400 on submit rather than a warning at build time.
//
// ── The two things this sheet gets right that a hand-rolled one would not ────
//
// **`requiresDescription` is per reason.** Exactly one reason on the seeded
// deployment carries it — "Something else" — and submitting that one bare is a
// refusal. The flag is read from the row rather than guessed from its code.
//
// **The field is `reason` going out and `reasonCode` coming back.** A
// confirmation that echoed `response.reason` would echo `undefined`, which
// renders as an empty chip rather than as anything that looks wrong. This sheet
// echoes the label it already has instead of reading anything off the answer,
// which is why `useReportContent` does not expose the response at all.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';

import { Sheet } from '@/components/overlays/AppModal';
import { useReportContent, useReportReasons } from '@/hooks/community-social';
import type { CommunityContentType, CommunityReportReason } from '@/types/community-social';

interface ReportContentSheetProps {
  visible: boolean;
  onClose: () => void;
  contentType: CommunityContentType;
  contentId: string | null;
  onReported?: () => void;
}

export function ReportContentSheet({
  visible,
  onClose,
  contentType,
  contentId,
  onReported,
}: ReportContentSheetProps) {
  const { reasons, isLoading, error: reasonsError } = useReportReasons();
  const reporting = useReportContent();

  const [chosen, setChosen] = useState<CommunityReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const selected = reasons.find((reason) => reason.code === chosen) ?? null;
  const needsDescription = selected?.requiresDescription ?? false;

  const reset = () => {
    setChosen(null);
    setDescription('');
    setLocalError(null);
  };

  const submit = async () => {
    if (!contentId || !chosen) {
      setLocalError('Choose a reason first.');
      return;
    }
    if (needsDescription && description.trim().length === 0) {
      setLocalError('That reason needs a few words of detail.');
      return;
    }

    setLocalError(null);

    try {
      await reporting.report({
        contentType,
        contentId,
        // `reason` on the way in. The answer spells it `reasonCode`.
        reason: chosen,
        description: description.trim().length > 0 ? description.trim() : null,
      });
      reset();
      onReported?.();
      onClose();
    } catch {
      // `reporting.error` carries the server's own sentence.
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Report this"
    >
      <View className="pb-2">
        <Text className="text-xs text-content-muted leading-relaxed mb-4">
          Tell us what is wrong with it. Moderators see the report, not your name next to it on the
          post.
        </Text>

        {isLoading ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="small" color="#6B7280" />
          </View>
        ) : reasonsError ? (
          <Text className="text-xs font-bold text-error-default">{reasonsError}</Text>
        ) : (
          reasons.map((reason) => {
            const isChosen = chosen === reason.code;
            return (
              <TouchableOpacity
                key={reason.code}
                accessible
                accessibilityRole="radio"
                accessibilityState={{ checked: isChosen }}
                accessibilityLabel={reason.label}
                onPress={() => setChosen(reason.code)}
                className={`rounded-xl border px-3 py-3 mb-2 ${
                  isChosen ? 'bg-primary-50 border-primary-200' : 'bg-surface-card border-subtle'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isChosen ? 'text-primary-600' : 'text-content-secondary'
                  }`}
                >
                  {isChosen ? '● ' : '○ '}
                  {reason.label}
                </Text>
                {reason.description ? (
                  <Text className="text-[10px] text-content-faint mt-1 leading-relaxed ml-4">
                    {reason.description}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}

        {chosen ? (
          <View className="mt-2">
            <Text className="text-[10px] font-black text-content-faint uppercase tracking-wider mb-1.5">
              {needsDescription ? 'What happened (required)' : 'Anything to add (optional)'}
            </Text>
            <TextInput
              accessible
              accessibilityLabel="Report details"
              placeholder="A sentence or two helps a moderator act on it."
              value={description}
              onChangeText={setDescription}
              multiline
              className="text-xs p-3 bg-surface-background rounded-xl border border-faint min-h-[70px] text-content-strong font-semibold"
            />
          </View>
        ) : null}

        {localError ?? reporting.error ? (
          <Text className="text-[11px] font-bold text-error-default mt-3">
            {localError ?? reporting.error}
          </Text>
        ) : null}

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Send report"
          accessibilityState={{ disabled: chosen === null || reporting.isPending }}
          disabled={chosen === null || reporting.isPending}
          onPress={() => void submit()}
          className={`mt-4 py-3.5 rounded-2xl items-center ${
            chosen === null || reporting.isPending ? 'bg-surface-muted' : 'bg-primary-500'
          }`}
        >
          {reporting.isPending ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Text
              className={`text-sm font-extrabold ${
                chosen === null ? 'text-content-faint' : 'text-white'
              }`}
            >
              Send report
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}
