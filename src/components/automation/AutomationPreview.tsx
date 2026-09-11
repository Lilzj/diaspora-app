// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Preview and simulation result (Frontend Phase 18, §34 · §35)
//
// What a member sees before they switch something on, and what they see when
// they test it.
//
// ── §34's list, and the two entries that carry the weight ────────────────────
//
// §34 asks the preview to show trigger, conditions, actions, target audience,
// required permissions, connected integrations, expected behaviour, potential
// limitations and backend support status. Seven of those nine are
// straightforward. Two are not:
//
//   **Target audience.** Shown as a count and a sentence, with its provenance,
//   and never as a list. §50 — an audience preview that named members would be
//   an enumeration tool for a community, reachable by anybody who can open the
//   builder. Where the server has not answered, this says the audience is not
//   known rather than showing a number the client guessed.
//
//   **Backend support status.** §34 asks for the words "Frontend configured —
//   backend automation capability pending" when an automation depends on a gap.
//   `<BackendGapBanner>` is that sentence, phrased for a member rather than for
//   a reviewer: it has to say two things at once — that they have finished, and
//   that nothing will happen yet — and those pull in opposite directions.
//
// ── §35, and why the simulation result is a different component ──────────────
//
// It would have been less code to render a simulation with the run components
// and a flag. It is exactly what §57 forbids: a simulated result that differs
// from a real one only by a boolean is one that looks identical in a
// screenshot, a log and a component test. So `<SimulationResult>` has its own
// heading, its own framing, and a "would have" column that a real run does not
// have — different at a glance, deliberately.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { SIMULATION_HEADING } from '@/lib/automation/simulation';
import type { AutomationPreview, AutomationSimulation } from '@/types/automation';
import { DependencyList, SimulationMarker, SupportBadge } from './AutomationNotices';

// ═════════════════════════════════════════════════════════════════════════════
// SECTION — the WHEN / IF / THEN blocks
// ═════════════════════════════════════════════════════════════════════════════

interface RuleSectionProps {
  keyword: string;
  lines: string[];
  emptyText?: string;
}

/**
 * One third of §7's WHEN / IF / THEN.
 *
 * The keyword is rendered as a label rather than as part of the sentence so the
 * three blocks scan as a structure — which is what makes a rule readable
 * without anybody having to explain that a rule has three parts.
 */
function RuleSection({ keyword, lines, emptyText }: RuleSectionProps) {
  const { tokens } = useTheme();

  if (lines.length === 0 && !emptyText) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        lines.length > 0 ? `${keyword}: ${lines.join(', ')}` : `${keyword}: ${emptyText}`
      }
      className="mb-3"
    >
      <Text
        style={{ color: tokens.color.primary[600] }}
        className="text-[10px] font-black uppercase tracking-widest mb-1"
      >
        {keyword}
      </Text>

      {lines.length > 0 ? (
        lines.map((line, index) => (
          <Text
            key={`${line}-${index}`}
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-bold leading-relaxed"
          >
            {line}
          </Text>
        ))
      ) : (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[13px] font-semibold leading-relaxed"
        >
          {emptyText}
        </Text>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BACKEND GAP BANNER — §34's required wording
// ═════════════════════════════════════════════════════════════════════════════

export interface BackendGapBannerProps {
  gapIds: string[];
}

/**
 * §34: *"If the automation relies on a Backend Gap: clearly indicate 'Frontend
 * configured — backend automation capability pending.'"*
 *
 * Said in the member's language, because the brief's phrasing is written for a
 * reviewer. The gap ids are still rendered, selectable, for the reviewer.
 */
export function BackendGapBanner({ gapIds }: BackendGapBannerProps) {
  const { tokens } = useTheme();

  if (gapIds.length === 0) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Waiting on Diaspora. Diaspora cannot run this automatically yet, and it is not something you need to fix."
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className="rounded-2xl border p-4 mb-3"
      testID="automation-backend-gap-banner"
    >
      <View className="flex-row items-center mb-1.5">
        <Ionicons name="construct-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Waiting on Diaspora
        </Text>
      </View>

      {/* Shown in the builder before anything is saved, and on the page of an
          automation that has been, so it claims neither. It said "it is saved"
          over an unsaved draft on the device on 11 Sep 2026. */}
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        Diaspora cannot run this automatically yet — that part is still being built. Nothing will
        happen until it is ready, and it is not something you need to fix.
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-bold mt-2 tracking-wide"
        selectable
      >
        {gapIds.join(' · ')}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIENCE — §34 · §50
// ═════════════════════════════════════════════════════════════════════════════

export interface AudienceCardProps {
  audience: AutomationPreview['audience'];
}

/**
 * Who this reaches.
 *
 * A count and a sentence. §50: never a list, and never a client-side figure
 * presented as the platform's. When the server has not answered, this says so
 * rather than showing nothing — an absent audience block would read as "only
 * you", which for a community automation is the most dangerous possible
 * misreading.
 */
export function AudienceCard({ audience }: AudienceCardProps) {
  const { tokens } = useTheme();

  const unknown = audience.provenance !== 'server' || audience.estimatedRecipients === null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        unknown
          ? 'Who this reaches is not known yet. It will only go to people who are eligible.'
          : `This reaches ${audience.description}`
      }
      style={{ backgroundColor: tokens.color.surface.background }}
      className="rounded-2xl p-4 mb-3"
      testID="automation-audience-card"
    >
      <View className="flex-row items-center mb-1.5">
        <Ionicons name="people-outline" size={16} color={tokens.color.text.secondary} />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Who this reaches
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-[13px] font-bold leading-relaxed"
      >
        {unknown ? 'Not known yet' : audience.description}
      </Text>

      {unknown ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium mt-1 leading-relaxed"
        >
          Diaspora cannot work out how many people this would reach yet. It will only ever go to
          people who are eligible and who have not turned these notifications off.
        </Text>
      ) : null}

      {audience.serverSideFilters.length > 0 ? (
        <View className="mt-2.5">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            Diaspora also leaves out
          </Text>
          {audience.serverSideFilters.map((filter) => (
            <Text
              key={filter}
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-medium leading-relaxed"
            >
              · {filter}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// THE PREVIEW — §34
// ═════════════════════════════════════════════════════════════════════════════

export interface AutomationPreviewCardProps {
  preview: AutomationPreview;
  onNavigate?: (route: string) => void;
  /** Hides the audience block for a self-only automation. */
  showAudience?: boolean;
}

export function AutomationPreviewCard({
  preview,
  onNavigate,
  showAudience = true,
}: AutomationPreviewCardProps) {
  const { tokens } = useTheme();

  return (
    <View testID="automation-preview">
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
            What this does
          </Text>
          <SupportBadge support={preview.support} compact />
        </View>

        <RuleSection keyword="When" lines={[preview.triggerSummary]} />
        <RuleSection
          keyword="If"
          lines={preview.conditionSummaries}
          emptyText="Always — you have not added any conditions."
        />
        <RuleSection
          keyword="Then"
          lines={preview.actionSummaries}
          emptyText="Nothing yet — choose what should happen."
        />

        {preview.scheduleSummary ? (
          <View className="pt-1">
            <Text
              style={{ color: tokens.color.primary[600] }}
              className="text-[10px] font-black uppercase tracking-widest mb-1"
            >
              When it runs
            </Text>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-bold leading-relaxed"
            >
              {preview.scheduleSummary}
            </Text>
            {preview.timezoneSummary ? (
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold mt-0.5"
              >
                {preview.timezoneSummary}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={preview.expectedBehaviour}
        style={{ backgroundColor: tokens.color.info.surface }}
        className="rounded-2xl p-4 mb-3"
      >
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-semibold leading-relaxed"
        >
          {preview.expectedBehaviour}
        </Text>
      </View>

      {showAudience ? <AudienceCard audience={preview.audience} /> : null}

      <BackendGapBanner gapIds={preview.gapIds} />

      {preview.dependencies.length > 0 ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.surface.border,
          }}
          className="rounded-2xl border p-4"
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            What this needs
          </Text>
          <DependencyList dependencies={preview.dependencies} onNavigate={onNavigate} />
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION RESULT — §35 · §57
// ═════════════════════════════════════════════════════════════════════════════

export interface SimulationResultProps {
  simulation: AutomationSimulation;
}

/**
 * §35's test result.
 *
 * Framed so nobody could mistake it for a real run — see the file header. The
 * heading says "test", the marker is at the top, and the disclaimer names the
 * four things that did not happen in the words §35 uses.
 */
export function SimulationResult({ simulation }: SimulationResultProps) {
  const { tokens } = useTheme();

  return (
    <View testID="automation-simulation-result">
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${SIMULATION_HEADING}. ${simulation.disclaimer}`}
        style={{
          backgroundColor: tokens.color.info.surface,
          borderColor: `${tokens.color.info.default}44`,
        }}
        className="rounded-2xl border p-4 mb-3"
      >
        <View className="flex-row items-center mb-2">
          <SimulationMarker subject="This run" />
        </View>

        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black leading-snug"
        >
          {SIMULATION_HEADING}
        </Text>

        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-medium mt-1.5 leading-relaxed"
        >
          {simulation.disclaimer}
        </Text>
      </View>

      {simulation.run.conditionOutcomes.length > 0 ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.surface.border,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-2"
          >
            Your conditions
          </Text>

          {simulation.run.conditionOutcomes.map((outcome) => (
            <View
              key={outcome.conditionId}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${outcome.label}. ${outcome.explanation}`}
              className="py-2"
            >
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
            </View>
          ))}
        </View>
      ) : null}

      {simulation.wouldHaveDone.length > 0 ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.surface.border,
          }}
          className="rounded-2xl border p-4"
        >
          {/* "Would have" rather than "did". The tense is the guarantee. */}
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-2"
          >
            What would have happened
          </Text>

          {simulation.wouldHaveDone.map((entry, index) => (
            <View
              key={`${entry.actionKey}-${index}`}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${entry.label}. ${entry.reason}`}
              className="flex-row items-start py-2"
            >
              <Ionicons
                name="ellipse-outline"
                size={14}
                color={tokens.color.text.placeholder}
                style={{ marginTop: 2 }}
              />
              <View className="flex-1 ml-2.5">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-xs font-bold leading-snug"
                >
                  {entry.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-medium mt-0.5 leading-relaxed"
                >
                  {entry.reason}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
