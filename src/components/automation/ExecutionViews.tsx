// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Execution history and run detail (Frontend Phase 18, §36–§39)
//
// What happened, and why.
//
// ── The distinction the whole file turns on ──────────────────────────────────
//
// Three of the six outcomes an action can have are **not failures**, and
// rendering them as failures would teach members to distrust the feature:
//
//   `skipped`     the trigger fired and a condition said no. The system working.
//   `suppressed`  the member's own notification settings, or idempotency,
//                 prevented a delivery. Also the system working — §53 and §39.
//   `pending`     a simulation. Nothing was attempted.
//
// Only `failed` is red. `suppressed` in particular gets a neutral tone and an
// explanation, because "this ran and you heard nothing" is the most confusing
// possible outcome and the run detail is where somebody finds out why.
//
// ── §39, and the sentence that matters ───────────────────────────────────────
//
// *"Where the backend returns AlreadyProcessed, show a safe completed state
// rather than an error."*
//
// `<DeduplicationNotice>` is that state. A member who sees "error: duplicate"
// for a system correctly refusing to do something twice has been told a
// correctly-working platform is broken.
//
// ── §36's limit ──────────────────────────────────────────────────────────────
//
// *"Do not expose sensitive internal infrastructure details to ordinary
// users."* So a run detail renders the correlation id — which is opaque and is
// what a support conversation starts from — and nothing else: no host, no
// queue, no stack trace, no provider payload.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { FAILURE_RECOVERY } from '@/lib/automation/errors';
import {
  AUTOMATION_RUN_PRESENTATION,
  type AutomationActionOutcome,
  type AutomationConditionOutcome,
  type AutomationRun,
} from '@/types/automation';
import { RunStatusBadge, SimulationMarker } from './AutomationNotices';

// ═════════════════════════════════════════════════════════════════════════════
// RUN ROW — §36
// ═════════════════════════════════════════════════════════════════════════════

export interface RunRowProps {
  run: AutomationRun;
  onPress: () => void;
  /** Hidden when the list is already scoped to one automation. */
  showAutomationName?: boolean;
}

export const RunRow = memo(function RunRow({
  run,
  onPress,
  showAutomationName = true,
}: RunRowProps) {
  const { tokens } = useTheme();
  const presentation = AUTOMATION_RUN_PRESENTATION[run.status];

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={[
        showAutomationName ? run.automationName : null,
        presentation.accessibilityLabel,
        run.triggerSummary,
        run.isSimulated ? 'Simulated' : null,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens the details of this run"
      onPress={onPress}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
      }}
      className="rounded-2xl border p-3.5 mb-2"
      testID={`automation-run-row-${run.id}`}
    >
      <View className="flex-row items-start" importantForAccessibility="no-hide-descendants">
        <View className="flex-1 pr-2">
          {showAutomationName ? (
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black leading-snug"
              numberOfLines={1}
            >
              {run.automationName}
            </Text>
          ) : null}

          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-semibold mt-0.5 leading-relaxed"
            numberOfLines={2}
          >
            {run.triggerSummary}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={14} color={tokens.color.text.placeholder} />
      </View>

      <View
        className="flex-row items-center mt-2.5"
        importantForAccessibility="no-hide-descendants"
      >
        <RunStatusBadge status={run.status} isSimulated={run.isSimulated} compact />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold ml-2"
        >
          {formatWhen(run.startedAt)}
        </Text>
      </View>
    </Pressable>
  );
});

/**
 * A timestamp, as a member would read it.
 *
 * Uses the device's locale and zone via `Intl`, so §63's "do not hardcode
 * English, UTC or one country" holds for the most frequently rendered value in
 * the phase. Falls back to the raw ISO string when `Intl` cannot help, which is
 * ugly and honest rather than wrong and pretty.
 */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return iso;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DEDUPLICATION NOTICE — §39
// ═════════════════════════════════════════════════════════════════════════════

/**
 * "This had already been done."
 *
 * Neutral, not red. See the file header — §39 requires a safe completed state
 * rather than an error, and the tone is half of what makes it one.
 */
export function DeduplicationNotice() {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="This had already been done, so Diaspora did not repeat it. Nothing is wrong."
      style={{ backgroundColor: tokens.color.info.surface }}
      className="rounded-2xl p-4 mb-3"
      testID="automation-deduplication-notice"
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="shield-checkmark-outline" size={16} color={tokens.color.info.default} />
        <Text
          style={{ color: tokens.color.info.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Already done
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        This had already been done, so Diaspora did not repeat it. Nothing is wrong — this is how
        you are kept from being told the same thing twice.
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONDITION AND ACTION OUTCOMES — §37
// ═════════════════════════════════════════════════════════════════════════════

function ConditionOutcomeRow({ outcome }: { outcome: AutomationConditionOutcome }) {
  const { tokens } = useTheme();

  const color = outcome.matched ? tokens.color.success.default : tokens.color.text.placeholder;
  const word = outcome.matched ? 'Matched' : 'Did not match';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${outcome.label}. ${word}. ${outcome.explanation}`}
      className="flex-row items-start py-2.5"
    >
      <Ionicons
        name={outcome.matched ? 'checkmark-circle' : 'close-circle-outline'}
        size={16}
        color={color}
        style={{ marginTop: 1 }}
      />

      <View className="flex-1 ml-2.5">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold leading-snug"
        >
          {outcome.label}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium mt-0.5 leading-relaxed"
        >
          {outcome.explanation}
        </Text>

        {/* §9, made observable. A sensitive condition reporting `client` in a
            real run is a defect, and this is where it would be visible. */}
        {outcome.evaluatedBy === 'server' ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mt-1"
          >
            Checked by Diaspora
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ActionOutcomeRow({ outcome }: { outcome: AutomationActionOutcome }) {
  const { tokens } = useTheme();

  const presentation = ACTION_OUTCOME_PRESENTATION[outcome.status];
  const color =
    presentation.tone === 'positive'
      ? tokens.color.success.default
      : presentation.tone === 'critical'
        ? tokens.color.error.default
        : tokens.color.text.placeholder;

  const detail =
    outcome.suppressionReason ??
    outcome.message ??
    (outcome.failureKind ? FAILURE_RECOVERY[outcome.failureKind].summary : null);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${outcome.label}. ${presentation.label}.${detail ? ` ${detail}` : ''}`}
      className="flex-row items-start py-2.5"
    >
      <Ionicons name={presentation.icon} size={16} color={color} style={{ marginTop: 1 }} />

      <View className="flex-1 ml-2.5">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold leading-snug"
        >
          {outcome.label}
        </Text>

        {/* The word, always — never the icon alone. §62. */}
        <Text style={{ color }} className="text-[10px] font-black uppercase tracking-widest mt-0.5">
          {presentation.label}
        </Text>

        {detail ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-medium mt-1 leading-relaxed"
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * How each action outcome reads.
 *
 * `suppressed` is `muted` and worded as a normal event, not a fault — see the
 * file header. `pending` exists only in a simulation and says "would run".
 */
const ACTION_OUTCOME_PRESENTATION: Record<
  AutomationActionOutcome['status'],
  { label: string; tone: 'positive' | 'critical' | 'muted'; icon: keyof typeof Ionicons.glyphMap }
> = {
  succeeded: { label: 'Done', tone: 'positive', icon: 'checkmark-circle' },
  failed: { label: 'Did not work', tone: 'critical', icon: 'alert-circle' },
  skipped: { label: 'Skipped', tone: 'muted', icon: 'remove-circle-outline' },
  suppressed: { label: 'Not sent', tone: 'muted', icon: 'notifications-off-outline' },
  pending: { label: 'Would run', tone: 'muted', icon: 'ellipse-outline' },
};

// ═════════════════════════════════════════════════════════════════════════════
// RUN DETAIL — §37 · §38
// ═════════════════════════════════════════════════════════════════════════════

export interface RunDetailProps {
  run: AutomationRun;
  onRetry?: () => void;
  onNavigate?: (route: string) => void;
}

/**
 * §37's run detail, in the order §37 lists it.
 *
 * Trigger, conditions, actions, result, and — where there is one — the failure
 * with its recovery guidance.
 */
export function RunDetail({ run, onRetry, onNavigate }: RunDetailProps) {
  const { tokens } = useTheme();

  const recovery = run.failureKind ? FAILURE_RECOVERY[run.failureKind] : null;

  return (
    <View testID="automation-run-detail">
      {run.isSimulated ? (
        <View className="mb-3 flex-row">
          <SimulationMarker subject="This run" />
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.surface.border,
        }}
        className="rounded-2xl border p-4 mb-3"
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            What set it off
          </Text>
          <RunStatusBadge status={run.status} isSimulated={run.isSimulated} compact />
        </View>

        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-bold leading-relaxed"
        >
          {run.triggerSummary}
        </Text>

        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold mt-1"
        >
          {formatWhen(run.startedAt)}
          {run.durationMs !== null ? ` · took ${formatDuration(run.durationMs)}` : ''}
        </Text>
      </View>

      {run.wasDeduplicated ? <DeduplicationNotice /> : null}

      {run.conditionOutcomes.length > 0 ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.surface.border,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            Your conditions
          </Text>
          {run.conditionOutcomes.map((outcome) => (
            <ConditionOutcomeRow key={outcome.conditionId} outcome={outcome} />
          ))}
        </View>
      ) : null}

      {run.actionOutcomes.length > 0 ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.surface.border,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            What it did
          </Text>
          {run.actionOutcomes.map((outcome) => (
            <ActionOutcomeRow key={outcome.actionId} outcome={outcome} />
          ))}
        </View>
      ) : null}

      {run.failureMessage || recovery ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`${run.failureMessage ?? recovery?.summary ?? ''}. ${run.recoveryHint ?? recovery?.hint ?? ''}`}
          style={{
            backgroundColor:
              recovery?.blame === 'platform'
                ? tokens.color.surface.background
                : tokens.color.error.surface,
          }}
          className="rounded-2xl p-4 mb-3"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-bold leading-relaxed"
          >
            {run.failureMessage ?? recovery?.summary}
          </Text>

          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium mt-1.5 leading-relaxed"
          >
            {run.recoveryHint ?? recovery?.hint}
          </Text>

          <View className="flex-row mt-3">
            {recovery?.route && onNavigate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fix this"
                onPress={() => onNavigate(recovery.route!)}
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="rounded-xl px-3.5 py-2 mr-2"
              >
                <Text style={{ color: tokens.color.text.inverse }} className="text-xs font-black">
                  Fix this
                </Text>
              </Pressable>
            ) : null}

            {/* §77: no retry for a platform gap. Pressing it would fail
                identically for ever, and offering it implies otherwise. */}
            {onRetry && recovery?.blame !== 'platform' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Run this again"
                onPress={onRetry}
                style={{ borderColor: tokens.color.surface.border }}
                className="rounded-xl border px-3.5 py-2"
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black">
                  Run it again
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* §36: the correlation id, and nothing else internal. Selectable so
          somebody can copy it into a support conversation. */}
      {run.correlationId ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold text-center"
          selectable
          accessibilityLabel={`Reference for support: ${run.correlationId}`}
        >
          Reference: {run.correlationId}
        </Text>
      ) : null}
    </View>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds / 60)} min`;
}
