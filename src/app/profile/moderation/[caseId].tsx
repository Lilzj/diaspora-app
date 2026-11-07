// ─────────────────────────────────────────────────────────────────────────────
// A decision Diaspora staff made about something the member published
// (7 Nov 2026).
//
// Every moderation notice opens this screen: hidden, hidden after many reports,
// removed, restored, and what a removal cost once it stood. It says what
// happened, the reason, the note Diaspora wrote, and what the member can do:
// ask for a review of something hidden once they have fixed it, or appeal. It
// never names the moderator or the people who reported it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useMyModerationCase } from '@/hooks/trust';
import { useNotification } from '@/providers/notification-provider';
import { canAppeal, decisionHeadline, longDate } from '@/lib/moderation-case';

export default function ModerationDecisionScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { decision, isLoading, error, refresh, requestReview, isRequestingReview } = useMyModerationCase(caseId);
  const { showToast } = useNotification();

  const askForReview = async () => {
    try {
      await requestReview();
      showToast({ type: 'success', title: 'Review requested', message: 'A member of staff will look at it again.' });
    } catch {
      showToast({ type: 'error', title: 'Not sent', message: 'We could not send that just now. Try again in a moment.' });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <ScreenHeader title="A decision about your content" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !decision ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base font-bold text-content-primary text-center">
            {error ?? 'This decision could not be found.'}
          </Text>
          <View className="mt-4">
            <Button label="Try again" variant="outline" onPress={refresh} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <Text className="text-lg font-black text-content-primary">{decisionHeadline(decision)}</Text>
          {decision.title ? (
            <Text className="text-sm text-content-secondary mt-1">&ldquo;{decision.title}&rdquo;</Text>
          ) : null}

          {decision.reasonLabel ? (
            <View className="mt-4 p-4 rounded-2xl bg-surface-card border border-subtle">
              <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">Why</Text>
              <Text className="text-sm text-content-primary mt-1 leading-relaxed">
                {decision.hiddenAutomatically
                  ? `Several members reported it as ${decision.reasonLabel}.`
                  : `It was found to be ${decision.reasonLabel}.`}
              </Text>
              {decision.note ? (
                <Text className="text-sm text-content-secondary mt-2 leading-relaxed">
                  Diaspora&apos;s note: {decision.note}
                </Text>
              ) : null}
            </View>
          ) : null}

          {decision.outcome === 'Remove' && decision.appealDeadline ? (
            <Text className="text-sm text-content-secondary mt-4 leading-relaxed">
              Two members of staff agreed on this. You can appeal until {longDate(decision.appealDeadline)}, and
              nothing else happens to your account before then.
            </Text>
          ) : null}

          {decision.reviewRequestedAt ? (
            <Text className="text-sm text-content-secondary mt-4">
              You asked for a review on {longDate(decision.reviewRequestedAt)}. A member of staff will look at it.
            </Text>
          ) : null}

          <View className="mt-6 gap-3">
            {decision.canRequestReview ? (
              <Button
                label="I've put it right — ask for a review"
                isLoading={isRequestingReview}
                loadingLabel="Sending…"
                onPress={askForReview}
                accessibilityLabel="Ask for a review of this decision"
              />
            ) : null}
            {canAppeal(decision) ? (
              <Button
                label="Appeal this decision"
                variant="outline"
                onPress={() =>
                  router.push({ pathname: '/profile/appeals', params: { type: 'Content', targetId: decision.caseId } })
                }
                accessibilityLabel="Appeal this decision"
              />
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
