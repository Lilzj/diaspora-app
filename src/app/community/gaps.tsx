// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend gap register (Frontend Phase 13, §66, §80)
//
// The register, on screen. Same idea as `creator/gaps.tsx`: the document in
// `frontend-phase-13-multi-community-backend-gap-register.md` is the authority, and
// this renders the same `MULTI_COMMUNITY_GAPS` object the repositories are gated on
// — so the screen cannot drift from the behaviour.
//
// Reachable only in a build where the adapters are reachable. In a production build
// there are no simulated surfaces to explain, and a "here is what we faked"
// screen shipped to members would be an odd thing to find.
//
// Sorted by priority then id, because the useful reading of this screen is "what
// should a backend phase do first".
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityGap, CommunityGapPriority } from '@/config/multi-community-gaps';
import { useMultiCommunityGaps } from '@/hooks/communities';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { CommunityUnavailablePanel } from '@/components/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';

const PRIORITY_ORDER: Record<CommunityGapPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function MultiCommunityGapsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { gaps, isEnabled, flags } = useMultiCommunityGaps();
  const [expanded, setExpanded] = useState<string | null>(null);

  React.useEffect(() => {
    trackCommunityEvent('community.gap_register.viewed', { isDevelopmentAdapter: isEnabled });
  }, [isEnabled]);

  const sorted = useMemo(
    () =>
      [...gaps].sort(
        (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id.localeCompare(b.id)
      ),
    [gaps]
  );

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const gap of gaps) {
      byStatus.set(gap.frontendStatus, (byStatus.get(gap.frontendStatus) ?? 0) + 1);
    }
    return byStatus;
  }, [gaps]);

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
        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-lg font-black"
          >
            What is not connected
          </Text>
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
            Multi-community · {gaps.length} entries
          </Text>
        </View>
      </View>

      {!isEnabled ? (
        <CommunityUnavailablePanel
          reason="feature-disabled"
          subject="The gap register"
          detail="This screen only exists in a development or internal test build. There is nothing simulated in this build to explain."
        />
      ) : (
        <ScrollEndScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}>
          {/* Summary */}
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-3 mb-4"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold leading-relaxed"
            >
              Every entry below is a capability the frontend implements in full and the certified
              backend does not yet serve, or serves only in part. Nothing is unfinished; what is
              missing is a contract.
            </Text>

            <View className="mt-3">
              {[...counts.entries()].map(([status, count]) => (
                <View key={status} className="flex-row items-center justify-between py-1">
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold flex-1 pr-2"
                  >
                    {status}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[10px] font-black"
                  >
                    {count}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Flags — §76. Every one on, because every capability is built. */}
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-2"
          >
            Feature flags
          </Text>
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-3 mb-5"
          >
            {Object.entries(flags).map(([flag, value]) => (
              <View key={flag} className="flex-row items-center justify-between py-1">
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[10px] font-bold flex-1 pr-2"
                >
                  {flag}
                </Text>
                <Ionicons
                  name={value ? 'checkmark-circle' : 'close-circle'}
                  size={13}
                  color={value ? tokens.color.success.default : tokens.color.text.placeholder}
                />
              </View>
            ))}
          </View>

          {/* Gaps */}
          {sorted.map((gap) => (
            <GapCard
              key={gap.id}
              gap={gap}
              isExpanded={expanded === gap.id}
              onToggle={() => setExpanded((prev) => (prev === gap.id ? null : gap.id))}
            />
          ))}
        </ScrollEndScrollView>
      )}
    </SafeAreaView>
  );
}

function GapCard({
  gap,
  isExpanded,
  onToggle,
}: {
  gap: CommunityGap;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { tokens } = useTheme();

  const priorityTone =
    gap.priority === 'critical'
      ? { color: tokens.color.error.default, surface: tokens.color.error.surface }
      : gap.priority === 'high'
        ? { color: tokens.color.warning.default, surface: tokens.color.warning.surface }
        : gap.priority === 'medium'
          ? { color: tokens.color.info.default, surface: tokens.color.info.surface }
          : { color: tokens.color.text.placeholder, surface: tokens.color.neutral[100] };

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      accessibilityLabel={`${gap.id}. ${gap.capability}. Priority ${gap.priority}. ${gap.frontendStatus}. ${
        isExpanded ? 'Collapse' : 'Expand for the required contract'
      }`}
      onPress={onToggle}
      activeOpacity={0.8}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3 mb-2"
      testID={`gap-card-${gap.id}`}
    >
      <View className="flex-row items-center mb-1.5">
        <View style={{ backgroundColor: priorityTone.surface }} className="px-2 py-0.5 rounded-full">
          <Text
            style={{ color: priorityTone.color }}
            className="text-[8px] font-black uppercase tracking-wider"
          >
            {gap.priority}
          </Text>
        </View>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-black ml-2 flex-1"
        >
          {gap.id}
        </Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={tokens.color.text.placeholder}
        />
      </View>

      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
        {gap.capability}
      </Text>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-bold mt-0.5"
      >
        {gap.feature}
      </Text>

      <View className="flex-row items-center mt-2">
        <Ionicons
          name={gap.coverage === 'partial' ? 'git-branch-outline' : 'remove-circle-outline'}
          size={11}
          color={tokens.color.text.placeholder}
        />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[9px] font-bold ml-1"
        >
          {gap.frontendStatus} · owner {gap.owner} · {gap.recommendedPhase}
        </Text>
      </View>

      {isExpanded ? (
        <View className="mt-3">
          <Detail label="What the frontend does today" body={gap.frontendBehaviour} />

          <DetailList label="What the backend already has" items={gap.existingBackendCapability} />
          <DetailList label="What is missing" items={gap.missingBackendCapability} />

          {gap.requiredContracts.map((contract) => (
            <View
              key={contract.endpoint}
              style={{ backgroundColor: tokens.color.neutral[50] }}
              className="rounded-xl p-2.5 mt-2"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[10px] font-black"
              >
                {contract.method} {contract.endpoint}
              </Text>
              <Detail label="Request" body={contract.request} compact />
              <Detail label="Response" body={contract.response} compact />
              <Detail label="Authorization" body={contract.authorization} compact />
              {contract.permission ? (
                <Detail label="Permission" body={contract.permission} compact />
              ) : null}
              {contract.pagination ? (
                <Detail label="Pagination" body={contract.pagination} compact />
              ) : null}
              {contract.filtering ? (
                <Detail label="Filtering" body={contract.filtering} compact />
              ) : null}
              {contract.sorting ? <Detail label="Sorting" body={contract.sorting} compact /> : null}
            </View>
          ))}

          <Detail label="Why the frontend cannot do this itself" body={gap.whyNotImplementable} />
          <Detail label="Privacy" body={gap.privacyConsiderations} />
          <Detail label="Migration" body={gap.migrationConsiderations} />
          <Detail label="Caching" body={gap.caching} />
          {gap.realtimeEvent ? <Detail label="Realtime" body={gap.realtimeEvent} /> : null}
          {gap.notificationEvent ? (
            <Detail label="Notification" body={gap.notificationEvent} />
          ) : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Detail({
  label,
  body,
  compact = false,
}: {
  label: string;
  body: string;
  compact?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View className={compact ? 'mt-1.5' : 'mt-2.5'}>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[8px] font-black uppercase tracking-widest"
      >
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[10px] font-semibold leading-relaxed mt-0.5"
      >
        {body}
      </Text>
    </View>
  );
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  const { tokens } = useTheme();

  if (items.length === 0) return null;

  return (
    <View className="mt-2.5">
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[8px] font-black uppercase tracking-widest mb-0.5"
      >
        {label}
      </Text>
      {items.map((item, index) => (
        <Text
          key={index}
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-semibold leading-relaxed"
        >
          • {item}
        </Text>
      ))}
    </View>
  );
}
