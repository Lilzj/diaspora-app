// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map diagnostics (Frontend Phase 8, §55, §56)
//
// The gap registers, on screen. Which provider is answering, which backend
// contracts are missing, and what each would take.
//
// ── Why this ships rather than living only in a markdown file ────────────────
//
// The registers in `frontend-phase-8-*-gap-register.md` are the authoritative
// documents and a reviewer reads those. But the person holding a test build and
// wondering *why the map looks like a grid* is not reading a markdown file —
// and the honest answer ("no tile provider is configured, here is what that
// would take") is one screen away rather than one repository away.
//
// It renders in every build, including production, and contains no key, no key
// prefix and no URL that could carry one. `getProviderStatus()` is built to be
// safe to screenshot into a bug report.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getProviderStatus } from '@/lib/maps/providers/registry';
import { describeMapConfiguration, getMapFeatureFlags } from '@/config/map-config';
import { MAPS_GAP_LIST } from '@/config/maps-gaps';
import { MAP_PROVIDER_GAP_LIST } from '@/config/map-provider-gaps';
import { describeNativeAvailability } from '@/lib/maps/providers/native-map';

type Tab = 'providers' | 'backend' | 'provider-gaps';

export default function MapDiagnosticsScreen() {
  const { tokens } = useTheme();
  const [tab, setTab] = useState<Tab>('providers');

  const status = useMemo(() => getProviderStatus(), []);
  const flags = getMapFeatureFlags();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Map diagnostics" />

      <View
        accessibilityRole="tablist"
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="flex-row rounded-2xl p-1 mx-4 mb-3"
      >
        {(
          [
            ['providers', 'Providers'],
            ['backend', `Backend (${MAPS_GAP_LIST.length})`],
            ['provider-gaps', `Vendors (${MAP_PROVIDER_GAP_LIST.length})`],
          ] as const
        ).map(([value, label]) => {
          const isActive = tab === value;
          return (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
              style={{ backgroundColor: isActive ? tokens.color.surface.card : 'transparent' }}
              className="flex-1 py-2.5 rounded-xl items-center"
              testID={`diagnostics-tab-${value}`}
            >
              <Text
                style={{ color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder }}
                className="text-[11px] font-black"
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40, gap: 10 }}>
        {tab === 'providers' ? (
          <>
            <Card>
              <CardTitle>Active configuration</CardTitle>
              <Mono>{describeMapConfiguration()}</Mono>
              <Mono>{describeNativeAvailability()}</Mono>
            </Card>

            <Card>
              <CardTitle>Map surface</CardTitle>
              <Row label="Renderer" value={status.surface.label} />
              <Row
                label="Real cartography"
                value={status.surface.rendersRealGeography ? 'yes' : 'no — schematic'}
              />
              {status.surface.gapKey ? <Row label="Gap" value={status.surface.gapKey} /> : null}
              {status.tiles.configured ? (
                <Row label="Attribution" value={status.tiles.attribution || '—'} />
              ) : null}
            </Card>

            <Card>
              <CardTitle>Location</CardTitle>
              <Row label="Provider" value={status.location.label} />
              <Row label="Native module" value={status.location.isNative ? 'installed' : 'absent'} />
              <Row label="Simulated" value={status.location.isSimulated ? 'yes' : 'no'} />
            </Card>

            <Card>
              <CardTitle>Routing</CardTitle>
              <Row label="Provider" value={status.routing.label} />
              <Row
                label="Modes"
                value={status.routing.supportedModes.join(', ') || 'none'}
              />
              <Row label="Simulated" value={status.routing.isSimulated ? 'yes' : 'no'} />
            </Card>

            <Card>
              <CardTitle>Geocoding</CardTitle>
              <Row label="Provider" value={status.geocoding.label} />
              <Row label="Simulated" value={status.geocoding.isSimulated ? 'yes' : 'no'} />
            </Card>

            <Card>
              <CardTitle>Feature gates</CardTitle>
              {Object.entries(flags).map(([key, value]) => (
                <Row key={key} label={key} value={value ? 'on' : 'off'} />
              ))}
            </Card>
          </>
        ) : null}

        {tab === 'backend'
          ? MAPS_GAP_LIST.map((gap) => (
              <Card key={gap.id}>
                <View className="flex-row items-center justify-between mb-1">
                  <Text
                    style={{ color: tokens.color.warning.default }}
                    className="text-[10px] font-black uppercase tracking-widest"
                  >
                    {gap.id}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-black uppercase tracking-wider"
                  >
                    {gap.priority} · {gap.coverage}
                  </Text>
                </View>

                <CardTitle>{gap.title}</CardTitle>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-semibold leading-relaxed mt-1"
                >
                  {gap.frontendBehaviour}
                </Text>

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-wider mt-3 mb-1"
                >
                  Needs
                </Text>
                {gap.missingContract.map((line, index) => (
                  <Mono key={index}>• {line}</Mono>
                ))}

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold mt-2"
                >
                  Owner: {gap.owner} · {gap.recommendedPhase}
                </Text>
              </Card>
            ))
          : null}

        {tab === 'provider-gaps'
          ? MAP_PROVIDER_GAP_LIST.map((gap) => (
              <Card key={gap.id}>
                <View className="flex-row items-center justify-between mb-1">
                  <Text
                    style={{ color: tokens.color.info.default }}
                    className="text-[10px] font-black uppercase tracking-widest"
                  >
                    {gap.id}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-black uppercase tracking-wider"
                  >
                    {gap.priority}
                  </Text>
                </View>

                <CardTitle>{gap.capability}</CardTitle>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-semibold leading-relaxed mt-1"
                >
                  {gap.currentBehaviour}
                </Text>

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-wider mt-3 mb-1"
                >
                  Candidates
                </Text>
                {gap.candidateProviders.map((line, index) => (
                  <Mono key={index}>• {line}</Mono>
                ))}

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-wider mt-3 mb-1"
                >
                  Integration work
                </Text>
                {gap.integrationWork.map((line, index) => (
                  <Mono key={index}>• {line}</Mono>
                ))}
              </Card>
            ))
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-4"
    >
      {children}
    </View>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
      {children}
    </Text>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();
  return (
    <View
      className="flex-row items-center justify-between py-1.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-[11px] font-black flex-shrink ml-3 text-right"
      >
        {value}
      </Text>
    </View>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text
      style={{ color: tokens.color.text.placeholder }}
      className="text-[10px] font-semibold leading-relaxed mt-0.5"
    >
      {children}
    </Text>
  );
}
