// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Buyer and seller protection (Frontend Phase 5)
//
// ⚠ THIS CAPABILITY DOES NOT EXIST AND IS NOT SIMULATED. ⚠
//
// §20 of the brief is unambiguous about escrow, buyer protection and seller
// protection: *"If not supported: DO NOT simulate it… Do not make these appear
// functional with mock data."*
//
// So this is the one gap in Phase 5 whose flow is deliberately **not** built.
// The other three — deposits, withdrawals, rewards — were built as full flows,
// on simulated persistence at first and on the certified routes as each one
// landed, because a member can tell a top-up worked. Nobody can tell whether an
// escrow held their money until a dispute goes wrong, and a convincing fake
// would be a promise of safety the platform cannot keep.
//
// What the screen does instead is tell the truth about what protects a
// transaction on Diaspora today: verification, reputation, reporting and the
// ledger's own auditability. All four are real, all four ship, and none of them
// is escrow.
//
// See `src/config/financial-gaps.ts` → `protection`.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { BACKEND_GAPS } from '@/config/financial-gaps';

/** What genuinely protects a transaction on this platform today. */
const REAL_PROTECTIONS = [
  {
    icon: 'walk-outline',
    title: 'How you trade',
    body: 'Meet by day in a busy public place, check the item before paying, and only pay someone you know or trust. This matters more than anything else on this page.',
    action: { label: 'Trading safely', route: '/safety/trading' },
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Verified members',
    body: 'Diaspora verification confirms who somebody is. Check the verification badge and their trust level before you agree to anything, and be careful with a new account that has neither.',
    action: { label: 'Trust centre', route: '/profile/trust-center' },
  },
  {
    icon: 'star-outline',
    title: 'Reputation and reviews',
    body: 'Reputation is earned across the whole platform and cannot be bought. A seller with a long history of good reviews has more to lose than a new account.',
  },
  {
    icon: 'receipt-outline',
    title: 'A permanent record',
    body: 'Every payment you make is recorded on your statement and cannot be edited or deleted — not by the other party, and not by Diaspora. If something goes wrong, the record of what happened is intact.',
    action: { label: 'Your statement', route: '/wallet/statement' },
  },
  {
    icon: 'flag-outline',
    title: 'Reporting and refunds',
    body: 'If you paid in the app for something you did not receive, report it. Diaspora staff review every report and can refund a payment made through the app. Cash handed over in person cannot be recovered by Diaspora.',
    action: { label: 'Get help', route: '/settings/help' },
  },
];

export default function ProtectionScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const gap = BACKEND_GAPS.protection;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Protection" showBack />

      <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {/* The honest headline. Stated first, before anything reassuring, so
            nobody reads the reassurance and assumes the guarantee. */}
        <View
          style={{ backgroundColor: tokens.color.warning.surface, borderColor: `${tokens.color.warning.default}44` }}
          className="rounded-2xl border p-5"
          accessible
          accessibilityLabel="Diaspora does not hold your money in escrow. Payments go directly to the other party, so check who you are dealing with before you pay."
        >
          <View className="flex-row items-center mb-2">
            <Ionicons name="information-circle-outline" size={18} color={tokens.color.warning.default} />
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[10px] font-black uppercase tracking-widest ml-1.5"
            >
              What Diaspora does not do
            </Text>
          </View>

          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight mb-2">
            Diaspora does not hold your money in escrow
          </Text>
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-medium leading-relaxed">
            When you pay somebody on Diaspora, the money goes to them. It is not held back until you
            confirm delivery, and there is no automatic buyer or seller guarantee. Check who you are
            dealing with before you pay — the protections below are real, and they work best before
            money moves rather than after.
          </Text>
        </View>

        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black tracking-tight mt-8 mb-1"
          accessibilityRole="header"
        >
          What does protect you
        </Text>
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-medium leading-relaxed mb-4">
          Four things, all of them real and all of them available today.
        </Text>

        <View style={{ gap: 10 }}>
          {REAL_PROTECTIONS.map((item) => (
            <View
              key={item.title}
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
              accessible
              accessibilityLabel={`${item.title}. ${item.body}`}
            >
              <View className="flex-row items-center mb-2">
                <Ionicons name={item.icon as never} size={18} color={tokens.color.secondary[500]} />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-sm font-black tracking-tight ml-2.5"
                >
                  {item.title}
                </Text>
              </View>

              <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-medium leading-relaxed">
                {item.body}
              </Text>

              {item.action ? (
                <TouchableOpacity
                  onPress={() => router.push(item.action.route as never)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.action.label}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="mt-3 self-start"
                >
                  <Text
                    style={{ color: tokens.color.primary[500] }}
                    className="text-[11px] font-black uppercase tracking-wider"
                  >
                    {item.action.label}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>

        {/* In a development build, the missing contract is named. Whoever is
            reading this screen while building the next backend phase is exactly
            who needs to know what is absent. */}
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-8"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest mb-2"
            >
              Backend gap · development note
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-medium leading-relaxed mb-2">
              {gap.whyNotImplementable}
            </Text>
            {gap.missingContract.slice(0, 3).map((line) => (
              <Text
                key={line}
                style={{ color: tokens.color.text.placeholder, fontFamily: 'monospace' }}
                className="text-[10px] leading-relaxed"
              >
                · {line}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
