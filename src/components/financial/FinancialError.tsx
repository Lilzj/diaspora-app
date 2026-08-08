// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial error surfaces (Frontend Phase 5)
//
// Three shapes for the same model:
//
//   `FinancialErrorView`   a whole screen failed
//   `FinancialErrorInline` a section failed while the screen is fine
//   `GapNotice`            the platform cannot do this yet, and says so
//
// All three read the `FinancialError`'s own classification rather than
// inspecting a status code again. A retry button appears when `isRetryable`; it
// does not appear on a `403` or a frozen wallet, because a button that cannot
// work is a button that teaches somebody the app is broken.
//
// **The indeterminate case is not an error and is never drawn by these.** A
// mutation whose outcome is unknown goes to `PaymentStatusView` and says the
// status is being confirmed — see §22.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import type { FinancialError } from '@/lib/financial-errors';
import { BACKEND_GAPS, type BackendGapId } from '@/config/financial-gaps';

function iconFor(error: FinancialError): { name: string; tone: 'error' | 'warning' | 'info' } {
  switch (error.kind) {
    case 'offline':
    case 'network':
    case 'timeout':
      return { name: 'cloud-offline-outline', tone: 'warning' };
    case 'unauthenticated':
      return { name: 'log-in-outline', tone: 'info' };
    case 'forbidden':
      return { name: 'lock-closed-outline', tone: 'info' };
    case 'unavailable':
      return { name: 'construct-outline', tone: 'warning' };
    case 'rateLimited':
      return { name: 'hourglass-outline', tone: 'warning' };
    case 'notFound':
      return { name: 'help-circle-outline', tone: 'info' };
    default:
      return { name: 'alert-circle-outline', tone: 'error' };
  }
}

function useToneColours(tone: 'error' | 'warning' | 'info') {
  const { tokens } = useTheme();
  if (tone === 'warning') return { fg: tokens.color.warning.default, bg: tokens.color.warning.surface };
  if (tone === 'info') return { fg: tokens.color.info.default, bg: tokens.color.info.surface };
  return { fg: tokens.color.error.default, bg: tokens.color.error.surface };
}

interface ErrorProps {
  error: FinancialError;
  onRetry?: () => void;
  /** Overrides the default action. Used where "Verify now" beats "Try again". */
  action?: { label: string; onPress: () => void };
}

/**
 * Whether an error deserves a Try-again button, and what the fallback action is.
 *
 * An unauthenticated failure sends somebody to sign in; a forbidden one to
 * verification. Both are more useful than a retry that will fail identically.
 */
function resolveAction(error: FinancialError, onRetry?: () => void): { label: string; onPress: () => void } | null {
  if (error.kind === 'unauthenticated') {
    return { label: 'Sign in', onPress: () => router.replace('/(auth)/login') };
  }
  if (error.kind === 'forbidden' && !error.isRetryable) {
    return { label: 'Start verification', onPress: () => router.push('/verification/diaspora') };
  }
  if (error.isRetryable && onRetry) {
    return { label: 'Try again', onPress: onRetry };
  }
  return null;
}

/** A whole screen could not load. */
export function FinancialErrorView({ error, onRetry, action }: ErrorProps) {
  const { tokens } = useTheme();
  const { name, tone } = iconFor(error);
  const { fg, bg } = useToneColours(tone);
  const resolved = action ?? resolveAction(error, onRetry);

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View
        style={{ backgroundColor: bg }}
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
      >
        <Ionicons name={name as never} size={30} color={fg} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-lg font-black text-center tracking-tight mb-2"
        accessibilityRole="header"
      >
        {error.message}
      </Text>

      {error.hint ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-sm font-medium text-center leading-relaxed mb-6"
        >
          {error.hint}
        </Text>
      ) : (
        <View className="mb-6" />
      )}

      {resolved ? (
        <TouchableOpacity
          onPress={resolved.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={resolved.label}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="h-12 px-8 rounded-full items-center justify-center"
        >
          <Text className="text-white text-xs font-black uppercase tracking-wider">
            {resolved.label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** A section failed and the rest of the screen is usable. */
export function FinancialErrorInline({ error, onRetry, action }: ErrorProps) {
  const { tokens } = useTheme();
  const { name, tone } = iconFor(error);
  const { fg, bg } = useToneColours(tone);
  const resolved = action ?? resolveAction(error, onRetry);

  return (
    <View
      accessible
      accessibilityLabel={`${error.message}${error.hint ? `. ${error.hint}` : ''}`}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: bg, borderColor: `${fg}33` }}
      className="flex-row items-start rounded-2xl border p-4"
    >
      <Ionicons name={name as never} size={20} color={fg} style={{ marginRight: 12, marginTop: 1 }} />
      <View className="flex-1">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
          {error.message}
        </Text>
        {error.hint ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium mt-1 leading-relaxed"
          >
            {error.hint}
          </Text>
        ) : null}

        {resolved ? (
          <TouchableOpacity
            onPress={resolved.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            className="mt-3 self-start"
            // A 44pt target on a small label: the hit area is padded rather
            // than the text made bigger.
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={{ color: fg }} className="text-[11px] font-black uppercase tracking-wider">
              {resolved.label}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/**
 * States plainly that a capability does not exist on the platform yet.
 *
 * Rendered by every gap-backed screen. In a development build it also names the
 * missing contract, because the person who most needs to know that a
 * withdrawal is simulated is the engineer looking at the simulated withdrawal.
 */
export function GapNotice({
  gapId,
  compact = false,
}: {
  gapId: BackendGapId | string;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const gap = BACKEND_GAPS[gapId];
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

  if (!gap) return null;

  const spoken = isDev
    ? `Development preview. ${gap.title} is not supported by the Diaspora backend yet. Nothing here moves real money.`
    : `${gap.title} is not available on Diaspora yet.`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={{ backgroundColor: tokens.color.warning.surface, borderColor: `${tokens.color.warning.default}44` }}
      className={`rounded-2xl border ${compact ? 'p-3' : 'p-4'}`}
    >
      <View className="flex-row items-center mb-1">
        <Ionicons name="flask-outline" size={16} color={tokens.color.warning.default} />
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {isDev ? 'Preview · not connected' : 'Not available yet'}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-semibold leading-relaxed"
      >
        {isDev
          ? `${gap.title} has no backend behind it. This flow runs on simulated data so it can be reviewed and tested — nothing here moves real money.`
          : `${gap.title} is not something Diaspora can do yet. We will let you know when it arrives.`}
      </Text>

      {isDev && !compact ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-mono mt-2 leading-relaxed"
        >
          {gap.missingContract[0]}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The whole screen for a capability that does not exist and is not simulated —
 * escrow and the protections. §20 forbids making these look functional, so
 * there is no flow behind this: it explains what is not there.
 */
export function GapUnavailableView({ gapId }: { gapId: BackendGapId | string }) {
  const { tokens } = useTheme();
  const gap = BACKEND_GAPS[gapId];

  if (!gap) return null;

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View
        style={{ backgroundColor: tokens.color.info.surface }}
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
      >
        <Ionicons name="shield-outline" size={30} color={tokens.color.info.default} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-lg font-black text-center tracking-tight mb-2"
        accessibilityRole="header"
      >
        {gap.title} is not available yet
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-medium text-center leading-relaxed"
      >
        Diaspora does not offer this today. When it does, it will appear here — and until then nothing
        on the platform claims to provide it.
      </Text>
    </View>
  );
}
