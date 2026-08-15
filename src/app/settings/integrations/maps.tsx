// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Map integration settings (Frontend Phase 16, §11 · §48)
//
// A read-only view onto Phase 8's provider status. **This screen configures
// nothing that Phase 8 does not already own** — §12 forbids a second map
// implementation, and a settings screen that duplicated Phase 8's location and
// map preferences would be exactly that with a different name.
//
// What it adds is the per-capability breakdown, which is genuinely new: the map
// integration is `PARTIALLY_CONNECTED` in production, and until this screen
// there was nowhere a member or a reviewer could see *which* half is real.
// Address search runs on a certified route; route times are estimates. Those are
// different claims and the map itself cannot make the distinction visible
// without cluttering every screen that uses it.
//
// ── §48, and the sentence about location ─────────────────────────────────────
//
// "Do not assume location tracking is required simply because maps exist."
// Diaspora asks for location only while the app is in use, keeps no location
// history, and the map works from a chosen area without any permission at all.
// That is stated here because it is the sort of thing members assume the
// opposite of.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { describeMapProviders, mapConnection } from '@/lib/integrations/maps';
import { IntegrationStatusBadge } from '@/components/integrations';
import { descriptorFor } from '@/lib/integrations/catalog';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function MapIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const connection = mapConnection(new Date().toISOString());
  const lines = describeMapProviders();
  const descriptor = descriptorFor('maps.platform');

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Maps" showBack />

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View
          style={{ borderColor: tokens.color.border.default }}
          className="border rounded-2xl p-4 mb-4"
        >
          <IntegrationStatusBadge
            status={connection.status}
            mode={connection.mode}
            showDescription
          />
        </View>

        <Heading
          title="What is connected"
          subtitle="Some parts of the map run on real platform data and some are estimates. This is which."
        />

        {lines.map((line) => (
          <View
            key={line.label}
            style={{ borderColor: tokens.color.border.default }}
            className="border rounded-2xl p-4 mb-2.5"
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${line.label}. ${line.detail}`}
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold mb-1">
              {line.label}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed"
            >
              {line.detail}
            </Text>
          </View>
        ))}

        {/* ── §48 ───────────────────────────────────────────────────────── */}
        <Heading title="Location and privacy" />

        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          {(descriptor?.consent.doesNotStore ?? []).map((item) => (
            <View key={item} className="flex-row items-start mb-1">
              <Text style={{ color: tokens.color.text.placeholder }} className="text-xs mr-2">
                •
              </Text>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-semibold leading-relaxed flex-1"
              >
                {item}
              </Text>
            </View>
          ))}
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold leading-relaxed mt-2"
          >
            {descriptor?.consent.privacyNote}
          </Text>
        </View>

        {/* Location permission itself is Phase 8's screen. Linking rather than
            re-implementing is §12 applied to a settings surface. */}
        <Button
          label="Location settings"
          variant="outline"
          onPress={() => router.push('/settings/location')}
        />
        <Button
          label="Map diagnostics"
          variant="ghost"
          onPress={() => router.push('/map/diagnostics')}
          className="mt-2"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { tokens } = useTheme();
  return (
    <View className="mb-2.5 mt-4">
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black uppercase tracking-widest"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-1"
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
