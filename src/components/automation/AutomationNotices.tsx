// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation status and provenance markers (Frontend Phase 18)
//
// The visible half of §34, §55, §57 and §62. Everything an automation screen
// shows about *whether something is real* is rendered here, and these are the
// only sanctioned way to render it.
//
// Five components, each answering a different question, because one answering
// all five would be wrong four times:
//
//   `<AutomationGapNotice>`   this capability has no backend behind it
//   `<SimulationMarker>`      this record came from a development adapter
//   `<AutomationStatusBadge>` what state is this automation in, right now
//   `<SupportBadge>`          how much of this can the platform actually do
//   `<DependencyList>`        §55's check, rendered
//
// Deliberately **not** a wrapper around Phase 5's `<GapNotice>`, Phase 12's
// `<CommunityGapNotice>`, Phase 15's `<AnalyticsGapNotice>` or Phase 16's
// `<IntegrationGapNotice>`: each looks its gaps up in its own register, and
// passing another phase's key into any of them returns null and renders
// nothing. Same visual language, separate registers — which is what stops one
// phase's gap being closed and another phase's notice silently disappearing.
//
// ── §62, and the rule these enforce that a screen cannot opt out of ─────────
//
// **Never rely on colour alone.** Every badge below renders a *word*, and its
// `accessibilityLabel` is the full sentence rather than the abbreviation. A
// member using VoiceOver hears "Paused, nothing will run until you resume it"
// rather than "Paused" — and a member who cannot distinguish amber from green
// reads the same word everybody else does.
//
// ── §57, and why the marker is not optional ─────────────────────────────────
//
// `<AutomationStatusBadge>` takes the status *and* `isSimulated`, both
// required, and renders the simulation marker itself. A screen cannot render a
// badge that says "Active" without the caveat, because the component that
// draws the word also draws the caveat.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import {
  AUTOMATION_RUN_PRESENTATION,
  AUTOMATION_STATUS_PRESENTATION,
  type AutomationDependency,
  type AutomationRunStatus,
  type AutomationStatePresentation,
  type AutomationStatus,
  type AutomationSupportStatus,
} from '@/types/automation';

// ═════════════════════════════════════════════════════════════════════════════
// GAP NOTICE — §55 · §77
// ═════════════════════════════════════════════════════════════════════════════

export interface AutomationGapNoticeProps {
  /** A key from `AUTOMATION_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

/**
 * "This part of the platform does not exist yet."
 *
 * The wording is careful and §77 is why: a backend gap must not be disguised as
 * a frontend defect, and the member-facing consequence is that this must never
 * read as something they did wrong or something they can fix. Every sentence
 * ends by saying their setup is complete.
 */
export function AutomationGapNotice({ gapKey, compact = false, detail }: AutomationGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = AUTOMATION_GAPS[gapKey];

  // An unknown key — another phase's, or a typo — renders nothing rather than
  // an empty box. Same behaviour as every other phase's notice.
  if (!gap) return null;

  const body =
    detail ??
    `Diaspora cannot do this automatically yet. Your setup is saved and complete, and there is nothing for you to fix.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Not available yet. ${body}`}
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      testID={`automation-gap-notice-${gapKey}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="construct-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Not available yet
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        {body}
      </Text>

      {!compact ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2 tracking-wide"
          selectable
        >
          {gap.id}
        </Text>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION MARKER — §57
// ═════════════════════════════════════════════════════════════════════════════

export interface SimulationMarkerProps {
  /** What was simulated. "This automation", "This run". */
  subject?: string;
  compact?: boolean;
}

/**
 * "Nothing here reached the real service."
 *
 * Rendered by `<AutomationStatusBadge>` automatically, and available on its own
 * for the surfaces that show simulated data without a status — a run detail, a
 * saved search list.
 */
export function SimulationMarker({ subject = 'This', compact = false }: SimulationMarkerProps) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${subject} is simulated. It did not really happen.`}
      style={{ backgroundColor: `${tokens.color.info.default}18` }}
      className={`flex-row items-center rounded-full ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
      testID="automation-simulation-marker"
    >
      <Ionicons name="flask-outline" size={compact ? 10 : 12} color={tokens.color.info.default} />
      <Text
        style={{ color: tokens.color.info.default }}
        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest ml-1`}
      >
        Simulated
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS BADGES — §5 · §62
// ═════════════════════════════════════════════════════════════════════════════

/** Maps a presentation tone to the palette. One place, so tones stay consistent. */
function toneColors(
  tone: AutomationStatePresentation['tone'],
  tokens: ReturnType<typeof useTheme>['tokens']
): { text: string; surface: string } {
  switch (tone) {
    case 'positive':
      return { text: tokens.color.success.default, surface: tokens.color.success.surface };
    case 'caution':
      return { text: tokens.color.warning.default, surface: tokens.color.warning.surface };
    case 'critical':
      return { text: tokens.color.error.default, surface: tokens.color.error.surface };
    case 'neutral':
      return { text: tokens.color.info.default, surface: tokens.color.info.surface };
    case 'muted':
      return { text: tokens.color.text.placeholder, surface: tokens.color.surface.background };
  }
}

export interface AutomationStatusBadgeProps {
  status: AutomationStatus;
  /** Required, not optional. §57 — see the file header. */
  isSimulated: boolean;
  compact?: boolean;
}

export function AutomationStatusBadge({
  status,
  isSimulated,
  compact = false,
}: AutomationStatusBadgeProps) {
  const { tokens } = useTheme();
  const presentation = AUTOMATION_STATUS_PRESENTATION[status];
  const colors = toneColors(presentation.tone, tokens);

  return (
    <View className="flex-row items-center">
      <View
        accessible
        accessibilityRole="text"
        // The full sentence, not the word. A screen reader user gets the
        // meaning; a sighted user gets the word plus the colour. §62.
        accessibilityLabel={presentation.accessibilityLabel}
        style={{ backgroundColor: colors.surface }}
        className={`rounded-full ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
        testID={`automation-status-${status}`}
      >
        <Text
          style={{ color: colors.text }}
          className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest`}
        >
          {presentation.label}
        </Text>
      </View>

      {isSimulated ? (
        <View className="ml-1.5">
          <SimulationMarker compact subject="This automation" />
        </View>
      ) : null}
    </View>
  );
}

export interface RunStatusBadgeProps {
  status: AutomationRunStatus;
  isSimulated: boolean;
  compact?: boolean;
}

export function RunStatusBadge({ status, isSimulated, compact = false }: RunStatusBadgeProps) {
  const { tokens } = useTheme();
  const presentation = AUTOMATION_RUN_PRESENTATION[status];
  const colors = toneColors(presentation.tone, tokens);

  return (
    <View className="flex-row items-center">
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={presentation.accessibilityLabel}
        style={{ backgroundColor: colors.surface }}
        className={`rounded-full ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
        testID={`automation-run-status-${status}`}
      >
        <Text
          style={{ color: colors.text }}
          className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest`}
        >
          {presentation.label}
        </Text>
      </View>

      {isSimulated ? (
        <View className="ml-1.5">
          <SimulationMarker compact subject="This run" />
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUPPORT BADGE — §70
// ═════════════════════════════════════════════════════════════════════════════

const SUPPORT_PRESENTATION: Record<
  AutomationSupportStatus,
  { label: string; description: string; tone: AutomationStatePresentation['tone'] }
> = {
  CONNECTED: {
    label: 'Works now',
    description: 'Everything this needs is ready.',
    tone: 'positive',
  },
  PARTIAL: {
    label: 'Partly ready',
    description: 'Some of this works and some of it is still being built.',
    tone: 'caution',
  },
  DEVELOPMENT: {
    label: 'On this device',
    description: 'This works while Diaspora is open, and cannot run in the background yet.',
    tone: 'neutral',
  },
  BACKEND_GAP: {
    label: 'Coming',
    description: 'Diaspora cannot run this automatically yet. Your setup is saved.',
    tone: 'muted',
  },
};

export interface SupportBadgeProps {
  support: AutomationSupportStatus;
  compact?: boolean;
}

/**
 * How much of an automation the platform can actually do.
 *
 * Separate from the status badge because they answer genuinely different
 * questions and a member needs both: an automation can be ACTIVE and
 * BACKEND_GAP at once, which is the single most common state in this build and
 * the one a single badge would misrepresent.
 */
export function SupportBadge({ support, compact = false }: SupportBadgeProps) {
  const { tokens } = useTheme();
  const presentation = SUPPORT_PRESENTATION[support];
  const colors = toneColors(presentation.tone, tokens);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${presentation.label}. ${presentation.description}`}
      style={{ backgroundColor: colors.surface }}
      className={`rounded-full ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
      testID={`automation-support-${support}`}
    >
      <Text
        style={{ color: colors.text }}
        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest`}
      >
        {presentation.label}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR NOTICE — §38
// ═════════════════════════════════════════════════════════════════════════════

export interface AutomationErrorNoticeProps {
  message: string;
  hint?: string | null;
  /** Who can fix it. Drives the tone, and whether a retry is offered at all. */
  blame?: 'member' | 'platform' | 'transient';
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string | null;
}

/**
 * A failure, with the next step.
 *
 * `blame` decides whether a retry control appears. §77: a platform gap must not
 * be presented as something the member did wrong, and a "Try again" button on
 * one is worse than useless — it invites somebody to keep pressing a thing that
 * will fail identically for ever.
 */
export function AutomationErrorNotice({
  message,
  hint,
  blame = 'transient',
  onRetry,
  onAction,
  actionLabel,
}: AutomationErrorNoticeProps) {
  const { tokens } = useTheme();

  const tone = blame === 'platform' ? 'muted' : blame === 'member' ? 'caution' : 'critical';
  const colors = toneColors(tone, tokens);
  const icon =
    blame === 'platform' ? 'construct-outline' : blame === 'member' ? 'alert-circle-outline' : 'cloud-offline-outline';

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={hint ? `${message}. ${hint}` : message}
      style={{ backgroundColor: colors.surface, borderColor: `${colors.text}33` }}
      className="rounded-2xl border p-4"
      testID="automation-error-notice"
    >
      <View className="flex-row items-start">
        <Ionicons name={icon} size={18} color={colors.text} />
        <View className="flex-1 ml-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-bold leading-relaxed"
          >
            {message}
          </Text>

          {hint ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-medium mt-1 leading-relaxed"
            >
              {hint}
            </Text>
          ) : null}
        </View>
      </View>

      {(onRetry && blame !== 'platform') || (onAction && actionLabel) ? (
        <View className="flex-row mt-3">
          {onAction && actionLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              onPress={onAction}
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="rounded-xl px-3.5 py-2 mr-2"
            >
              <Text
                style={{ color: tokens.color.text.inverse }}
                className="text-xs font-black"
              >
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}

          {onRetry && blame !== 'platform' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={onRetry}
              style={{ borderColor: tokens.color.surface.border }}
              className="rounded-xl border px-3.5 py-2"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black">
                Try again
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DEPENDENCY LIST — §34 · §55
// ═════════════════════════════════════════════════════════════════════════════

export interface DependencyListProps {
  dependencies: AutomationDependency[];
  onNavigate?: (route: string) => void;
  /** Hide the ones that are already fine, for a compact preview. */
  onlyProblems?: boolean;
}

/**
 * §55's check, rendered.
 *
 * The three states are visually and textually distinct, and the distinction is
 * the point rather than a nicety: `missing` is a job for the member and `gap` is
 * a job for the platform, and a list that rendered them identically would tell
 * somebody they have four things to fix when three of them are not theirs.
 */
export function DependencyList({
  dependencies,
  onNavigate,
  onlyProblems = false,
}: DependencyListProps) {
  const { tokens } = useTheme();

  const items = onlyProblems
    ? dependencies.filter((dependency) => dependency.state !== 'met')
    : dependencies;

  if (items.length === 0) return null;

  return (
    <View testID="automation-dependency-list">
      {items.map((dependency, index) => {
        const isGap = dependency.state === 'gap';
        const isMissing = dependency.state === 'missing';

        const color = isMissing
          ? tokens.color.warning.default
          : isGap
            ? tokens.color.text.placeholder
            : tokens.color.success.default;

        const icon = isMissing
          ? 'alert-circle-outline'
          : isGap
            ? 'construct-outline'
            : 'checkmark-circle-outline';

        // The screen reader gets the state as a word before the label, so the
        // list is comprehensible without the icons. §62.
        const stateWord = isMissing ? 'Needs your attention' : isGap ? 'Coming later' : 'Ready';

        return (
          <View
            key={`${dependency.kind}-${dependency.label}-${index}`}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${stateWord}. ${dependency.label}. ${dependency.detail}`}
            className="flex-row items-start py-2.5"
          >
            <Ionicons name={icon} size={16} color={color} style={{ marginTop: 1 }} />

            <View className="flex-1 ml-2.5">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-bold leading-snug"
              >
                {dependency.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-medium mt-0.5 leading-relaxed"
              >
                {dependency.detail}
              </Text>

              {dependency.gapId ? (
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9px] font-bold mt-1 tracking-wide"
                  selectable
                >
                  {dependency.gapId}
                </Text>
              ) : null}

              {dependency.actionLabel && dependency.actionRoute && onNavigate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={dependency.actionLabel}
                  onPress={() => onNavigate(dependency.actionRoute!)}
                  className="mt-1.5 self-start"
                >
                  <Text
                    style={{ color: tokens.color.primary[600] }}
                    className="text-[11px] font-black"
                  >
                    {dependency.actionLabel} →
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
