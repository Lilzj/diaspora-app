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
//   The decision is sent as a *request*. The server applies it and may refuse — the
//   development adapter refuses with a 403 when the capability is absent, which is
//   there to prove the client is not the thing enforcing it.
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  CommunityModerationDecision,
  CommunityReportStatus,
} from '@/types/community-directory';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityReports,
  useModerationDecision,
} from '@/hooks/communities';
import { canPerform } from '@/lib/community/access';
import { trackCommunityEvent } from '@/lib/community/analytics';
import {
  CommunityAvatar,
  CommunityReportCard,
  CommunityUnavailablePanel,
  MultiCommunityGapNotice,
} from '@/components/community-directory';

const STATUS_TABS: (CommunityReportStatus | 'All')[] = [
  'Open',
  'UnderReview',
  'Escalated',
  'Actioned',
  'Dismissed',
  'All',
];

const DECISIONS: { value: CommunityModerationDecision; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { value: 'dismiss', label: 'Dismiss', icon: 'close-outline' },
    { value: 'remove-content', label: 'Remove', icon: 'trash-outline' },
    { value: 'warn', label: 'Warn', icon: 'alert-outline' },
    { value: 'escalate', label: 'Escalate', icon: 'arrow-up-outline' },
  ];

export default function CommunityModerationScreen() {
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
          onPress={() => router.back()}
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
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}>
          {reports.isSimulated ? (
            <View className="mb-4">
              <MultiCommunityGapNotice
                gapKey="communityModeration"
                detail="Community-level moderation has no backend yet. These reports are development data. Decisions are sent to a simulated route that checks your permission server-side — nothing here changes real content."
              />
            </View>
          ) : null}

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
                    {tab === 'UnderReview' ? 'Under review' : tab}
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
                  canDecide && (report.status === 'Open' || report.status === 'UnderReview') ? (
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

          {decide.isError ? (
            <Text
              accessibilityRole="alert"
              style={{ color: tokens.color.error.default }}
              className="text-[11px] font-bold mt-2"
            >
              That decision was not applied. The server refused it or could not be reached — the
              report is unchanged.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
