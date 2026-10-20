// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community moderation queue (Frontend Phase 13, §34, §62)
//
// The screen §34 asks for, built with the constraint §34 and §62 both impose:
//
//     MODERATION AUTHORIZATION IS NOT IMPLEMENTED IN THE FRONTEND.
//
// Concretely, on this screen:
//
//   The queue query does not run without `canViewModerationQueue` — a boolean the
//   **server** put in the capability set. Not a role check; `lib/community/access.ts`
//   has no function that turns a role into a permission.
//
//   Each decision button requires `canReviewReports`, separately, because viewing a
//   queue and acting on it are different permissions and a real deployment will
//   eventually grant one without the other.
//
//   The decision is sent as a *request*. The server applies it and may refuse —
//   `POST /communities/{idOrSlug}/reports/{reportId}/decision` re-reads the same
//   capability set, so the client is not the thing enforcing it.
//
// ── What the real queue serves (21 Oct 2026) ─────────────────────────────────
//
//   Four statuses — Open, Escalated, Actioned, Dismissed. There is no stored
//   "under review" state, so that tab could only ever be empty and is gone.
//   Three decisions — dismiss, remove, escalate. The platform refuses "warn"
//   because no warning can be delivered yet, so there is no Warn button.
//   Only an Open report can be decided; an escalated one is the platform's.
//
//   A caller without the capability sees **nothing**: no locked queue, no greyed
//   button, no count. §34's reasoning is that a disabled moderation control tells
//   somebody they are nearly a moderator and leaks the shape of a community's
//   governance to anyone who opens the screen.
//
// ── One thing that is a property of the type, not of this screen ─────────────
//
// `CommunityReport` carries `reporterCount` and **no reporter identity**. A queue
// that named the reporter would put the person who reported harassment in front of
// somebody who can see who reported them. There is no field for it, so no future
// change to this screen can reveal one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  CommunityModerationDecision,
  CommunityReportStatus,
} from '@/types/community-directory';
import type { FinancialError } from '@/lib/financial-errors';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityReports,
  useModerationDecision,
} from '@/hooks/communities';
import { canPerform } from '@/lib/community/access';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useBottomInset } from '@/components/layout/bottom-inset';
import {
  CommunityAvatar,
  CommunityReportCard,
  CommunityUnavailablePanel,
} from '@/components/community-directory';
import { backOr } from '@/lib/navigation';

const STATUS_TABS: (CommunityReportStatus | 'All')[] = [
  'Open',
  'Escalated',
  'Actioned',
  'Dismissed',
  'All',
];

const DECISIONS: { value: CommunityModerationDecision; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { value: 'dismiss', label: 'Dismiss', icon: 'close-outline' },
    { value: 'remove-content', label: 'Remove', icon: 'trash-outline' },
    { value: 'escalate', label: 'Escalate', icon: 'arrow-up-outline' },
  ];

export default function CommunityModerationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [status, setStatus] = useState<CommunityReportStatus | 'All'>('Open');
  const [deciding, setDeciding] = useState<string | null>(null);

  const community = useCommunity(slug);
  const capabilities = useCommunityCapabilities(community.data?.id);
  const reports = useCommunityReports(
    community.data?.id,
    status === 'All' ? undefined : status
  );
  const decide = useModerationDecision(community.data?.id);

  const canDecide = canPerform('review-reports', capabilities.data);
  const decideError = (decide.error as FinancialError | null) ?? null;

  React.useEffect(() => {
    if (community.data && reports.unavailable === null) {
      trackCommunityEvent('community.moderation_queue.viewed', {
        communityId: community.data.id,
      });
    }
  }, [community.data, reports.unavailable]);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>

        {community.data ? <CommunityAvatar community={community.data} size={28} /> : null}

        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black"
          >
            Reports
          </Text>
          {community.data ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
              numberOfLines={1}
            >
              {community.data.name}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Capability unknown yet — a spinner, not an empty queue. */}
      {capabilities.isLoading ? (
        <CommunityUnavailablePanel reason="loading" subject="this queue" />
      ) : reports.unavailable === 'forbidden' ? (
        // §34: nothing at all. Not a locked queue.
        <CommunityUnavailablePanel reason="forbidden" subject="reports" />
      ) : reports.unavailable === 'feature-disabled' ? (
        // Switched off for this deployment. Never fall through to "empty": that
        // would tell a moderator their queue was clear when it was never read.
        <CommunityUnavailablePanel reason="feature-disabled" subject="the moderation queue" />
      ) : (
        <ScrollEndScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}>

          {/* Status tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            accessibilityRole="tablist"
          >
            {STATUS_TABS.map((tab) => {
              const isActive = status === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  accessible
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Show ${tab === 'All' ? 'all reports' : `${tab} reports`}`}
                  onPress={() => setStatus(tab)}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor: isActive
                      ? tokens.color.primary[500]
                      : tokens.color.neutral[100],
                  }}
                  className="rounded-full px-3 py-1.5 mr-2"
                >
                  <Text
                    style={{
                      color: isActive ? tokens.color.text.inverse : tokens.color.text.secondary,
                    }}
                    className="text-[11px] font-bold"
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {reports.isLoading ? (
            <CommunityUnavailablePanel reason="loading" subject="reports" />
          ) : reports.isError ? (
            <CommunityUnavailablePanel
              reason="error"
              subject="reports"
              onAction={() => void reports.refetch()}
            />
          ) : (reports.data?.length ?? 0) === 0 ? (
            <CommunityUnavailablePanel
              reason="empty"
              subject={status === 'All' ? 'reports' : `${status} reports`}
            />
          ) : (
            (reports.data ?? []).map((report) => (
              <CommunityReportCard
                key={report.id}
                report={report}
                actions={
                  // A second, separate capability. Viewing a queue and deciding on
                  // it are different permissions, and a deployment will grant one
                  // without the other.
                  // Open only: an escalated report is the platform's to decide now.
                  canDecide && report.status === 'Open' ? (
                    <View className="flex-row flex-wrap -mx-0.5">
                      {DECISIONS.map((decision) => {
                        const busy = deciding === `${report.id}:${decision.value}`;

                        return (
                          <View key={decision.value} className="px-0.5 mb-1">
                            <TouchableOpacity
                              accessible
                              accessibilityRole="button"
                              accessibilityLabel={`${decision.label} this report`}
                              accessibilityState={{ busy, disabled: busy }}
                              disabled={busy || decide.isPending}
                              onPress={() => {
                                setDeciding(`${report.id}:${decision.value}`);
                                decide.mutate(
                                  { reportId: report.id, decision: decision.value },
                                  { onSettled: () => setDeciding(null) }
                                );
                              }}
                              activeOpacity={0.8}
                              style={{
                                backgroundColor: tokens.color.surface.card,
                                borderColor: tokens.color.border.default,
                                opacity: busy ? 0.6 : 1,
                              }}
                              className="flex-row items-center rounded-full border px-2.5 py-1.5"
                            >
                              {busy ? (
                                <ActivityIndicator size="small" color={tokens.color.text.secondary} />
                              ) : (
                                <Ionicons
                                  name={decision.icon}
                                  size={12}
                                  color={tokens.color.text.secondary}
                                />
                              )}
                              <Text
                                style={{ color: tokens.color.text.primary }}
                                className="text-[10px] font-bold ml-1"
                              >
                                {decision.label}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ) : null
                }
              />
            ))
          )}

          {reports.hasMore ? (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Show more reports"
              accessibilityState={{ busy: reports.isLoadingMore, disabled: reports.isLoadingMore }}
              disabled={reports.isLoadingMore}
              onPress={reports.loadMore}
              activeOpacity={0.8}
              style={{ borderColor: tokens.color.border.default }}
              className="items-center rounded-2xl border py-2.5 mt-1"
            >
              {reports.isLoadingMore ? (
                <ActivityIndicator size="small" color={tokens.color.text.secondary} />
              ) : (
                <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
                  Show more reports
                </Text>
              )}
            </TouchableOpacity>
          ) : null}

          {decideError ? (
            <Text
              accessibilityRole="alert"
              style={{ color: tokens.color.error.default }}
              className="text-[11px] font-bold mt-2"
            >
              {decideError.isIndeterminate
                ? // Unanswered is not no: the decision may have been applied. The
                  // queue is refetched either way, so what it shows is the truth.
                  'We could not confirm that decision. It may have been applied — the queue has been refreshed to show where each report stands.'
                : decideError.code?.startsWith('community.')
                  ? decideError.message
                  : 'That decision was not applied. The report is unchanged.'}
            </Text>
          ) : null}
        </ScrollEndScrollView>
      )}
    </SafeAreaView>
  );
}
