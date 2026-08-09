// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration status and provenance markers (Frontend Phase 16)
//
// The visible half of §31, §32 and §69. Everything an integration screen shows
// about *whether something is real* is rendered here, and these are the only
// sanctioned way to render it.
//
// Four components, each answering a different question, because one answering
// all four would be wrong three times:
//
//   `<IntegrationGapNotice>`   this capability has no backend behind it
//   `<ProviderGapNotice>`      the frontend is complete, the *native module or
//                              vendor* is missing — a different team, a
//                              different fix
//   `<IntegrationStatusBadge>` what state is this connection in, right now
//   `<SimulationMarker>`       nothing here reached the real service
//
// Deliberately **not** a wrapper around Phase 5's `<GapNotice>`, Phase 6's
// `<MonetizationGapNotice>`, Phase 7's `<CreatorGapNotice>`, Phase 8's
// `<MapsGapNotice>`, Phase 12's `<CommunityGapNotice>` or Phase 15's
// `<AnalyticsGapNotice>`: each looks its gaps up in its own register, and
// passing another phase's key into any of them returns null and renders
// nothing. Same visual language, separate registers — which is what stops one
// phase's gap being closed and another phase's notice silently disappearing.
//
// ── The one rule these enforce that a screen cannot opt out of ───────────────
//
// §69: "The UI must never falsely imply production connectivity."
//
// `<IntegrationStatusBadge>` takes the status *and* the mode, both required, and
// renders the simulation marker itself when the mode is `DEVELOPMENT_PROVIDER`.
// A screen cannot render a status badge that says "Connected" without the
// caveat, because the component that draws the word also draws the caveat.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { INTEGRATION_GAPS } from '@/config/integration-gaps';
import { INTEGRATION_PROVIDER_GAPS } from '@/config/integration-provider-gaps';
import {
  isBlockedByBuild,
  isUsable,
  requiresSimulationMarker,
  statusDescription,
  statusLabel,
} from '@/lib/integrations/status';
import type { IntegrationMode, IntegrationStatus } from '@/types/integrations';

// ═════════════════════════════════════════════════════════════════════════════
// GAP NOTICE
// ═════════════════════════════════════════════════════════════════════════════

export interface IntegrationGapNoticeProps {
  /** A key from `INTEGRATION_GAPS`. An unknown key renders nothing. */
  gapKey: string;
  compact?: boolean;
  /** Overrides the default sentence where a screen has a more specific one. */
  detail?: string;
}

export function IntegrationGapNotice({ gapKey, compact = false, detail }: IntegrationGapNoticeProps) {
  const { tokens } = useTheme();
  const gap = INTEGRATION_GAPS[gapKey];

  // An unknown key — another phase's, or a typo — renders nothing rather than
  // an empty box. Same behaviour as every other phase's notice.
  if (!gap) return null;

  const body =
    detail ??
    `${gap.capability} needs a backend capability that does not exist yet. Everything else on this screen works.`;

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
      testID={`integration-gap-notice-${gapKey}`}
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
        >
          {gap.id}
        </Text>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROVIDER GAP NOTICE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A missing native module or vendor, as distinct from a missing contract.
 *
 * Separate from `<IntegrationGapNotice>` because the two are different work for
 * different people: a backend gap is an endpoint somebody designs, and a
 * provider gap is a package to install and a build to make. A member sees a
 * different sentence too — "this version of the app" rather than "not built
 * yet" — because that is the accurate description and it tells them an update
 * may fix it.
 */
export function ProviderGapNotice({
  gapKey,
  compact = false,
  detail,
}: {
  gapKey: string;
  compact?: boolean;
  detail?: string;
}) {
  const { tokens } = useTheme();
  const gap = INTEGRATION_PROVIDER_GAPS[gapKey];

  if (!gap) return null;

  const body = detail ?? `${gap.capability} is not available in this version of the app.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Not available in this version. ${body}`}
      style={{
        backgroundColor: tokens.color.info.surface,
        borderColor: `${tokens.color.info.default}44`,
      }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
      testID={`provider-gap-notice-${gapKey}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="phone-portrait-outline" size={16} color={tokens.color.info.default} />
        <Text
          style={{ color: tokens.color.info.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Needs a newer version
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
        >
          {gap.id}
        </Text>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION MARKER — §69
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Renders when, and only when, nothing reached the real service.
 *
 * Returns null for every other mode, so a call site can render it
 * unconditionally and be correct — which is what makes it safe to put on every
 * surface that shows a connection, and is why nobody has to remember.
 */
export function SimulationMarker({ mode, compact = false }: { mode: IntegrationMode; compact?: boolean }) {
  const { tokens } = useTheme();

  if (!requiresSimulationMarker(mode)) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Simulated. Nothing has been sent to the real service."
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className={`flex-row items-center rounded-full border ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} self-start`}
      testID="integration-simulation-marker"
    >
      <Ionicons name="flask-outline" size={compact ? 10 : 12} color={tokens.color.warning.default} />
      <Text
        style={{ color: tokens.color.warning.default }}
        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest ml-1`}
      >
        Simulated
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS BADGE — §31
// ═════════════════════════════════════════════════════════════════════════════

/** The colour each status carries. Never the only signal — the label is always shown. */
function toneFor(status: IntegrationStatus, tokens: ReturnType<typeof useTheme>['tokens']) {
  if (isUsable(status)) return tokens.color.success.default;
  if (status === 'ERROR' || status === 'PERMISSION_DENIED' || status === 'REAUTH_REQUIRED') {
    return tokens.color.warning.default;
  }
  if (isBlockedByBuild(status)) return tokens.color.text.placeholder;
  return tokens.color.text.secondary;
}

/**
 * The state of one connection.
 *
 * Takes both the status and the mode, both required. See the file header: this
 * is the component that makes §69 unavoidable, because the thing that draws
 * "Connected" is the same thing that draws "Simulated" beside it.
 *
 * Colour is never the only signal — every badge carries its label as text, so
 * it survives greyscale, colour-blindness and a screen reader (§58).
 */
export function IntegrationStatusBadge({
  status,
  mode,
  showDescription = false,
}: {
  status: IntegrationStatus;
  mode: IntegrationMode;
  showDescription?: boolean;
}) {
  const { tokens } = useTheme();
  const tone = toneFor(status, tokens);

  return (
    <View testID={`integration-status-${status}`}>
      <View className="flex-row items-center flex-wrap">
        <View
          style={{ backgroundColor: `${tone}1A`, borderColor: `${tone}44` }}
          className="flex-row items-center rounded-full border px-2.5 py-1 mr-2"
        >
          <View style={{ backgroundColor: tone }} className="w-1.5 h-1.5 rounded-full mr-1.5" />
          <Text style={{ color: tone }} className="text-[10px] font-black uppercase tracking-widest">
            {statusLabel(status)}
          </Text>
        </View>

        <SimulationMarker mode={mode} compact />
      </View>

      {showDescription ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-2"
        >
          {statusDescription(status, mode)}
        </Text>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR — §29, §32
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A normalised failure, rendered.
 *
 * Takes the already-normalised message and hint rather than an error object, so
 * there is no path by which a raw provider string reaches a member — the
 * translation happened in the adapter, and this component cannot undo it.
 *
 * `retryAfterSeconds` is rendered as a countdown rather than as a number of
 * seconds in prose, because §57 asks for the interval to be honoured and a
 * member watching a number tick down does not tap the button again.
 */
export function IntegrationErrorNotice({
  message,
  hint,
  retryAfterSeconds,
}: {
  message: string;
  hint?: string | null;
  retryAfterSeconds?: number | null;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={hint ? `${message} ${hint}` : message}
      style={{
        backgroundColor: tokens.color.error.surface,
        borderColor: `${tokens.color.error.default}44`,
      }}
      className="rounded-2xl border p-4"
      testID="integration-error-notice"
    >
      <View className="flex-row items-start">
        <Ionicons name="alert-circle-outline" size={18} color={tokens.color.error.default} />
        <View className="flex-1 ml-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black leading-relaxed"
          >
            {message}
          </Text>
          {hint ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mt-1"
            >
              {hint}
            </Text>
          ) : null}
          {retryAfterSeconds != null && retryAfterSeconds > 0 ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold mt-2 uppercase tracking-widest"
            >
              Try again in {formatWait(retryAfterSeconds)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
