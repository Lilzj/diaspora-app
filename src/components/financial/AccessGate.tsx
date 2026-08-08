// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial access gate (Frontend Phase 5)
//
// Renders the reason a financial surface is closed, and what to do about it.
//
// Distinct from the app's existing `FeatureGate`, which treats every non-
// verified state as one thing and offers one button. B15's ladder has more
// shape than that, and the differences matter to the person reading:
//
//   not signed in            → sign in
//   onboarding incomplete    → finish setting up
//   verification pending     → nothing to do; it is with the Trust Engine
//   verification not started → start it
//   account restricted       → reading still works; payments are paused
//
// The fourth and fifth are the ones a single gate gets wrong. Telling somebody
// whose verification is already under review to "start verification" is telling
// them to do something they have done, and telling a restricted member to
// verify is telling them the wrong story entirely.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import type { AccessRefusal } from '@/lib/financial-access';

const ICONS: Record<string, string> = {
  signedOut: 'log-in-outline',
  restricted: 'shield-outline',
  unverified: 'shield-checkmark-outline',
  pendingVerification: 'hourglass-outline',
  onboarding: 'person-add-outline',
};

const HEADINGS: Record<string, string> = {
  signedOut: 'Sign in to see your wallet',
  restricted: 'Payments are paused',
  unverified: 'Verify to use your wallet',
  pendingVerification: 'Verification in progress',
  onboarding: 'Finish setting up your account',
};

function actionFor(refusal: Extract<AccessRefusal, { allowed: false }>): { label: string; onPress: () => void } | null {
  // `pendingVerification` is the one refusal with no `action` member at all —
  // there is nothing the member can usefully do — so the field is read
  // defensively rather than the union widened to carry an absent case.
  const action = 'action' in refusal ? refusal.action : undefined;

  switch (action) {
    case 'signIn':
      return { label: 'Sign in', onPress: () => router.replace('/(auth)/login') };
    case 'verify':
      return { label: 'Start verification', onPress: () => router.push('/verification/diaspora') };
    case 'appeal':
      return { label: 'Trust centre', onPress: () => router.push('/profile/trust-center') };
    default:
      // `pendingVerification` deliberately has no action. There is nothing the
      // member can usefully do, and a button would imply otherwise.
      return null;
  }
}

export function AccessGate({
  refusal,
  compact = false,
}: {
  refusal: AccessRefusal;
  compact?: boolean;
}) {
  const { tokens } = useTheme();

  if (refusal.allowed) return null;

  const action = actionFor(refusal);
  const icon = ICONS[refusal.reason] ?? 'lock-closed-outline';
  const heading = HEADINGS[refusal.reason] ?? 'Not available';

  if (compact) {
    return (
      <View
        accessible
        accessibilityLabel={`${heading}. ${refusal.message}`}
        style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
        className="flex-row items-start rounded-2xl border p-4"
      >
        <Ionicons name={icon as never} size={20} color={tokens.color.info.default} style={{ marginRight: 12, marginTop: 1 }} />
        <View className="flex-1">
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
            {heading}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium mt-1 leading-relaxed"
          >
            {refusal.message}
          </Text>

          {action ? (
            <TouchableOpacity
              onPress={action.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="mt-3 self-start"
            >
              <Text style={{ color: tokens.color.info.default }} className="text-[11px] font-black uppercase tracking-wider">
                {action.label}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View
        style={{ backgroundColor: tokens.color.info.surface }}
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
      >
        <Ionicons name={icon as never} size={30} color={tokens.color.info.default} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-lg font-black text-center tracking-tight mb-2"
        accessibilityRole="header"
      >
        {heading}
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-medium text-center leading-relaxed mb-6"
      >
        {refusal.message}
      </Text>

      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="h-12 px-8 rounded-full items-center justify-center"
        >
          <Text className="text-white text-xs font-black uppercase tracking-wider">{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
