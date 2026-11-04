// The one-line safety reminder beside contact and pay actions (Phase 11).
//
// Diaspora holds no money between members, so wherever two of them are about to
// deal with each other, this says how to do it safely and links to the full page.

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { SAFETY_LINE, TRADING_SAFETY_ROUTE } from '@/lib/trading-safety';

export function TradeSafetyNote({ compact = false }: { compact?: boolean }) {
  return (
    <TouchableOpacity
      onPress={() => router.push(TRADING_SAFETY_ROUTE as never)}
      activeOpacity={0.7}
      accessibilityRole="link"
      accessibilityLabel={`${SAFETY_LINE} Read how to trade safely.`}
      testID="trade-safety-note"
    >
      <View
        className={`flex-row items-start rounded-xl bg-surface-muted border border-warning-default ${
          compact ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <Text className="text-sm mr-2">🛡️</Text>
        <Text className="flex-1 text-[11px] font-semibold text-content-secondary leading-relaxed">
          {SAFETY_LINE}{' '}
          <Text className="font-black text-primary-500">How to trade safely →</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}
