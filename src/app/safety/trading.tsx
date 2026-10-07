// Trading safely (Phase 11, decided 7 Oct 2026).
//
// Diaspora does not hold money between members, so this page is the protection
// it can honestly offer: how to meet, how to pay, and how to read a member's
// trust level before doing either.

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { IN_APP_TIPS, IN_PERSON_TIPS, type SafetyTip } from '@/lib/trading-safety';

function Section({ title, lead, tips }: { title: string; lead: string; tips: SafetyTip[] }) {
  return (
    <View className="mb-7">
      <Text className="text-lg font-black text-content-primary mb-1">{title}</Text>
      <Text className="text-xs text-content-muted leading-relaxed mb-3">{lead}</Text>
      {tips.map((tip) => (
        <View
          key={tip.title}
          className="bg-surface-card border border-faint rounded-2xl p-4 mb-2.5 flex-row"
          accessible
          accessibilityLabel={`${tip.title}. ${tip.body}`}
        >
          <Text className="text-xl mr-3">{tip.icon}</Text>
          <View className="flex-1">
            <Text className="text-sm font-extrabold text-content-primary mb-0.5">{tip.title}</Text>
            <Text className="text-xs text-content-muted leading-relaxed">{tip.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function TradingSafetyScreen() {
  const bottomInset = useBottomInset();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Trading safely" showBack />

      <ScrollEndScrollView className="flex-1" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="p-6">
          <View className="bg-warning-surface border border-warning-default rounded-2xl p-4 mb-6">
            <Text className="text-sm font-black text-content-primary mb-1">
              Diaspora does not hold your money
            </Text>
            <Text className="text-xs text-content-secondary leading-relaxed">
              There is no escrow. Whether you pay in cash or with Diaspora, the money goes to the
              other person straight away. These habits are what keep you safe.
            </Text>
          </View>

          <Section
            title="Paying in person"
            lead="Cash, a card machine, or handing anything over face to face."
            tips={IN_PERSON_TIPS}
          />
          <Section
            title="Paying with Diaspora"
            lead="When you use a Pay button in the app."
            tips={IN_APP_TIPS}
          />

          <TouchableOpacity
            onPress={() => router.push('/wallet/protection' as never)}
            accessibilityRole="link"
            className="bg-surface-card border border-subtle rounded-2xl p-4 items-center"
          >
            <Text className="text-xs font-black text-content-secondary uppercase tracking-widest">
              How payments work on Diaspora
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
