// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics gap register (Frontend Phase 15, §61)
//
// Every backend capability this phase needs and does not have, in the app rather
// than only in a markdown file.
//
// The same reasoning that put the metric catalogue in the app applies here and
// applies more strongly: a register that lives only in a document is a register
// that goes stale the moment somebody ships a contract without updating it. This
// screen reads `ANALYTICS_GAPS`, which is also what the repository's `assertEnabled`
// guard reads and what every gap notice names — so a gap that is closed in code
// disappears from this screen, and one that is not cannot be quietly forgotten.
//
// Development-only. `areAnalyticsGapsEnabled()` is false in a production bundle
// and the hub does not offer this route there.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design-system';
import { allAnalyticsGaps, areAnalyticsGapsEnabled } from '@/config/analytics-gaps';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import { AnalyticsGapUnavailable, AnalyticsHeader, AnalyticsSection } from '@/components/analytics';
import type { AnalyticsGap, AnalyticsGapPriority } from '@/config/analytics-gaps';

const PRIORITY_ORDER: Record<AnalyticsGapPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function AnalyticsGapsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    trackAnalyticsEvent('analytics.gap_register.viewed');
  }, []);

  const gaps = useMemo(
    () =>
      [...allAnalyticsGaps()].sort(
        (left, right) =>
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
          left.id.localeCompare(right.id)
      ),
    []
  );

  const counts = useMemo(
    () => ({
      total: gaps.length,
      partial: gaps.filter((gap) => gap.coverage === 'partial').length,
      critical: gaps.filter((gap) => gap.priority === 'critical').length,
    }),
    [gaps]
  );

  if (!areAnalyticsGapsEnabled()) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <AnalyticsHeader title="Backend gaps" />
        <AnalyticsGapUnavailable gapKey="platformAnalytics" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <AnalyticsHeader
        title="What is not measured yet"
        subtitle={`${counts.total} capabilities · ${counts.critical} critical`}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${counts.total} analytics capabilities have no backend contract or only a partial one. ${counts.partial} are partly covered by something real. The most important is event ingestion — two thirds of this list depends on it.`}
          style={{
            backgroundColor: tokens.color.warning.surface,
            borderColor: `${tokens.color.warning.default}44`,
          }}
          className="rounded-2xl border p-4 mb-6"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-semibold leading-relaxed"
          >
            {counts.total} analytics capabilities have no backend contract, or only a partial one.
            {counts.partial > 0
              ? ` ${counts.partial} are partly covered by something real.`
              : ''}
          </Text>
          <Text
            style={{ color: tokens.color.warning.default }}
            className="text-[11px] font-bold leading-relaxed mt-2"
          >
            The blocker is FRONTEND-PHASE15-GAP-029: there is nowhere to send events. Two thirds of
            this list is downstream of it, and building the query endpoints first would produce
            contracts that correctly return zero.
          </Text>
        </View>

        <AnalyticsSection title="Capabilities">
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border overflow-hidden"
          >
            {gaps.map((gap, index) => (
              <GapRow
                key={gap.id}
                gap={gap}
                isFirst={index === 0}
                isOpen={expanded === gap.id}
                onToggle={() => setExpanded(expanded === gap.id ? null : gap.id)}
              />
            ))}
          </View>
        </AnalyticsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function GapRow({
  gap,
  isFirst,
  isOpen,
  onToggle,
}: {
  gap: AnalyticsGap;
  isFirst: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { tokens } = useTheme();

  const priorityColour =
    gap.priority === 'critical'
      ? tokens.color.error.default
      : gap.priority === 'high'
        ? tokens.color.warning.default
        : tokens.color.text.placeholder;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      accessibilityLabel={`${gap.id}. ${gap.capability}. Priority ${gap.priority}. ${
        gap.coverage === 'partial' ? 'Partly covered.' : 'Nothing behind it.'
      } ${isOpen ? gap.frontendBehaviour : 'Double tap for detail.'}`}
      onPress={onToggle}
      style={{
        borderTopColor: tokens.color.border.default,
        borderTopWidth: isFirst ? 0 : 1,
      }}
      className="px-4 py-3.5"
    >
      <View className="flex-row items-start">
        <View className="flex-1 mr-2">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest"
          >
            {gap.id}
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-bold mt-0.5"
          >
            {gap.capability}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text
              style={{ color: priorityColour }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              {gap.priority}
            </Text>
            <Text
              style={{ color: tokens.color.text.disabled }}
              className="text-[9px] font-bold uppercase tracking-widest ml-2"
            >
              {gap.coverage === 'partial' ? 'partly covered' : 'nothing behind it'} · {gap.owner}
            </Text>
          </View>
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={15}
          color={tokens.color.text.placeholder}
        />
      </View>

      {isOpen ? (
        <View className="mt-3">
          <GapDetail label="What the frontend does today" value={gap.frontendBehaviour} />
          <GapDetail label="Why it cannot be done properly yet" value={gap.whyNotImplementable} />

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mt-3 mb-1"
          >
            What is missing
          </Text>
          {gap.missingBackendCapability.map((item) => (
            <View key={item} className="flex-row items-start mb-1">
              <Text style={{ color: tokens.color.text.disabled }} className="text-[11px] mr-1.5">
                ·
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold flex-1 leading-relaxed"
              >
                {item}
              </Text>
            </View>
          ))}

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mt-3 mb-1"
          >
            Contracts needed
          </Text>
          {gap.requiredContracts.map((contract) => (
            <View
              key={contract.endpoint}
              style={{ backgroundColor: tokens.color.surface.background }}
              className="rounded-lg px-2.5 py-2 mb-1.5"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[11px] font-black"
              >
                {contract.endpoint}
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-semibold mt-1 leading-relaxed"
              >
                {contract.request}
              </Text>
            </View>
          ))}

          <GapDetail label="Privacy" value={gap.privacyConsiderations} />
          <GapDetail label="Suggested phase" value={gap.recommendedPhase} />
        </View>
      ) : null}
    </Pressable>
  );
}

function GapDetail({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();

  return (
    <View className="mt-2">
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-black uppercase tracking-widest mb-0.5"
      >
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold leading-relaxed"
      >
        {value}
      </Text>
    </View>
  );
}
