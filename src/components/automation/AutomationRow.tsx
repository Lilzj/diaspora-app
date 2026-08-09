// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation list row (Frontend Phase 18, §6 · §62 · §67)
//
// One automation, as it appears in the Automation Center.
//
// ── Why the row carries two badges ───────────────────────────────────────────
//
// Status and support answer different questions, and in this build the most
// common automation is ACTIVE + BACKEND_GAP — switched on, and unable to run.
// A single badge would have to pick one of those to say, and either choice is a
// lie: "Active" implies it works; "Coming" implies the member has not finished.
//
// ── §62, and the accessibility decision worth explaining ─────────────────────
//
// The whole row is one accessibility element with a composed label, rather than
// six focusable children. A screen reader user swiping through a list of
// twenty automations wants twenty stops, not a hundred and twenty — and the
// composed label carries everything the visual row carries, in the order it
// reads.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { triggerDefinition } from '@/lib/automation/triggers';
import { describeSchedule } from '@/lib/automation/schedule';
import {
  AUTOMATION_RUN_PRESENTATION,
  AUTOMATION_STATUS_PRESENTATION,
  type AutomationDefinition,
} from '@/types/automation';
import { AutomationStatusBadge, SupportBadge } from './AutomationNotices';

export interface AutomationRowProps {
  automation: AutomationDefinition;
  onPress: () => void;
}

/**
 * Memoised because §67 asks the centre to stay responsive with large lists and
 * because the list re-renders whenever connectivity flips — without this, two
 * hundred rows re-render every time the network blinks.
 */
export const AutomationRow = memo(function AutomationRow({
  automation,
  onPress,
}: AutomationRowProps) {
  const { tokens } = useTheme();

  const trigger = triggerDefinition(automation.trigger.key);

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (trigger) parts.push(trigger.label);
    if (automation.schedule) parts.push(describeSchedule(automation.schedule));
    if (automation.conditions.length > 0) {
      parts.push(
        `${automation.conditions.length} ${automation.conditions.length === 1 ? 'condition' : 'conditions'}`
      );
    }
    return parts.join(' · ');
  }, [trigger, automation.schedule, automation.conditions.length]);

  /**
   * The last-run line.
   *
   * Absent rather than "Never run" when there is no history, because in this
   * build *nothing* has run and a column of "Never run" would read as a fault.
   * The support badge already says why.
   */
  const lastRun = useMemo(() => {
    if (!automation.lastRunStatus) return null;
    return AUTOMATION_RUN_PRESENTATION[automation.lastRunStatus].label;
  }, [automation.lastRunStatus]);

  const accessibilityLabel = useMemo(() => {
    const parts = [
      automation.name,
      AUTOMATION_STATUS_PRESENTATION[automation.status].accessibilityLabel,
      subtitle,
    ];
    if (automation.attentionReason) parts.push(automation.attentionReason);
    if (lastRun) parts.push(`Last run: ${lastRun}`);
    if (automation.isSimulated) parts.push('Simulated');
    return parts.filter(Boolean).join('. ');
  }, [automation, subtitle, lastRun]);

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens this automation"
      onPress={onPress}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
      }}
      className="rounded-2xl border p-4 mb-3"
      testID={`automation-row-${automation.id}`}
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black leading-snug"
            numberOfLines={2}
          >
            {automation.name}
          </Text>

          {subtitle ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold mt-1 leading-relaxed"
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
      </View>

      {/* Badges are `importantForAccessibility="no-hide-descendants"` because the
          row's own label already carries every word they render. Without it a
          screen reader announces "Active" twice. */}
      <View
        className="flex-row items-center flex-wrap mt-3"
        importantForAccessibility="no-hide-descendants"
      >
        <View className="mr-1.5 mb-1">
          <AutomationStatusBadge
            status={automation.status}
            isSimulated={automation.isSimulated}
            compact
          />
        </View>
        <View className="mr-1.5 mb-1">
          <SupportBadge support={automation.support} compact />
        </View>

        {lastRun ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold mb-1"
          >
            Last: {lastRun}
          </Text>
        ) : null}
      </View>

      {automation.attentionReason ? (
        <View
          style={{ backgroundColor: tokens.color.error.surface }}
          className="rounded-xl px-3 py-2 mt-2"
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            style={{ color: tokens.color.error.default }}
            className="text-[11px] font-bold leading-relaxed"
          >
            {automation.attentionReason}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// SAVED SEARCH ROW — §30
// ═════════════════════════════════════════════════════════════════════════════

export interface SavedSearchRowProps {
  name: string;
  querySummary: string;
  subject: string;
  alertsEnabled: boolean;
  alertFrequency: string;
  isSimulated: boolean;
  onPress: () => void;
  onToggleAlerts: () => void;
}

const SUBJECT_LABELS: Record<string, string> = {
  jobs: 'Jobs',
  marketplace: 'Marketplace',
  housing: 'Housing',
  providers: 'Providers',
  events: 'Events',
};

export const SavedSearchRow = memo(function SavedSearchRow({
  name,
  querySummary,
  subject,
  alertsEnabled,
  alertFrequency,
  isSimulated,
  onPress,
  onToggleAlerts,
}: SavedSearchRowProps) {
  const { tokens } = useTheme();

  const alertText = alertsEnabled
    ? alertFrequency === 'instant'
      ? 'Alerts on — as they happen'
      : `Alerts on — ${alertFrequency}`
    : 'Alerts off';

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
      }}
      className="rounded-2xl border p-4 mb-3"
      testID={`saved-search-row-${name}`}
    >
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${SUBJECT_LABELS[subject] ?? subject}. ${querySummary}. ${alertText}${isSimulated ? '. Simulated' : ''}`}
        accessibilityHint="Opens this saved search"
        onPress={onPress}
      >
        <View className="flex-row items-start">
          <View className="flex-1 pr-2">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-black leading-snug"
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold mt-0.5"
              numberOfLines={1}
            >
              {SUBJECT_LABELS[subject] ?? subject} · {querySummary}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: alertsEnabled }}
        accessibilityLabel={`Alerts for ${name}`}
        accessibilityHint={alertsEnabled ? 'Turns alerts off' : 'Turns alerts on'}
        onPress={onToggleAlerts}
        className="flex-row items-center mt-3"
      >
        <Ionicons
          name={alertsEnabled ? 'notifications' : 'notifications-off-outline'}
          size={14}
          color={alertsEnabled ? tokens.color.success.default : tokens.color.text.placeholder}
        />
        <Text
          style={{
            color: alertsEnabled ? tokens.color.success.default : tokens.color.text.placeholder,
          }}
          className="text-[11px] font-black ml-1.5"
        >
          {alertText}
        </Text>
      </Pressable>
    </View>
  );
});
