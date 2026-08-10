// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation settings (Frontend Phase 18, §6 · §53 · §54)
//
// What automation is allowed to do on this account, and what it depends on.
//
// ── §53, and the thing this screen refuses to do ─────────────────────────────
//
// *"Do not allow an automation to bypass global notification preferences."*
//
// The obvious design gives automation its own notification switches. It would
// be a second preference system — §28 forbids exactly that — and worse, it
// would be a set of switches that could disagree with the member's real ones,
// with no defined winner.
//
// So this screen has **no notification switches**. It *shows* the member's B13
// settings, says which of them automation obeys, and links to the one place
// they are changed. A member who wants automation to stop emailing them turns
// off email; there is nothing here that could contradict that.
//
// ── §54, and why the dependency list is here at all ──────────────────────────
//
// An automation's own preview lists what *it* needs. This screen lists what
// automation as a whole needs, so a member whose calendar connection has
// lapsed can find out here rather than by opening four automations and reading
// four identical warnings.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  useAutomationAccess,
  useAutomationSupport,
  usePersonalScope,
} from '@/hooks/automation';
import { AutomationGapNotice } from '@/components/automation';
import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import { isGapPreviewBuild } from '@/config/gap-preview';
import { areAutomationGapsEnabled } from '@/config/automation-gaps';

export default function AutomationSettingsScreen() {
  const { tokens } = useTheme();
  const scope = usePersonalScope();
  const { access } = useAutomationAccess(scope);
  const { support, isLoading } = useAutomationSupport();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Automation settings" showBack />

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }}>
        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={tokens.color.primary[500]} />
          </View>
        ) : (
          <>
            {/* ── §53. Shown, not duplicated. ─────────────────────────────── */}
            <SectionHeading title="How automations reach you" />

            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.surface.border,
              }}
              className="rounded-2xl border p-4 mb-2"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-medium leading-relaxed mb-3"
              >
                Automations use your normal notification settings. They cannot get round quiet
                hours, and they cannot send you anything on a channel you have turned off.
              </Text>

              {(support?.enabledChannels ?? []).map((channel) => (
                <View key={channel} className="flex-row items-center py-1.5">
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={tokens.color.success.default}
                  />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-xs font-bold ml-2"
                  >
                    {friendlyChannel(channel)}
                  </Text>
                </View>
              ))}

              {support?.quietHours ? (
                <View
                  style={{ backgroundColor: tokens.color.surface.background }}
                  className="rounded-xl px-3 py-2.5 mt-2"
                >
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[11px] font-semibold leading-relaxed"
                  >
                    {support.quietHours}
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change your notification settings"
              onPress={() => router.push('/settings/notifications' as never)}
              className="mb-6 py-2"
            >
              <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                Change your notification settings →
              </Text>
            </Pressable>

            {/* ── §54. What automation depends on. ────────────────────────── */}
            <SectionHeading title="What automations depend on" />

            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.surface.border,
              }}
              className="rounded-2xl border p-4 mb-6"
            >
              <CapabilityRow
                label="Storing your automations"
                available={support?.hasRegistry ?? false}
                gapKey="automationRegistry"
              />
              <CapabilityRow
                label="Running them automatically"
                available={support?.hasExecutionEngine ?? false}
                gapKey="automationEngine"
              />
              <CapabilityRow
                label="Running them at set times"
                available={support?.hasScheduler ?? false}
                gapKey="automationScheduler"
              />
              <CapabilityRow
                label="Keeping a record of what ran"
                available={support?.hasExecutionHistory ?? false}
                gapKey="automationHistory"
              />
              <CapabilityRow
                label="Watching your saved searches"
                available={support?.hasSavedSearchEvaluation ?? false}
                gapKey="savedSearches"
              />
              <CapabilityRow
                label="Notifying you"
                available={support?.hasNotificationInbox ?? false}
                gapKey={null}
              />
              <CapabilityRow
                label="Adding to your phone’s calendar"
                available={support?.hasDeviceCalendar ?? false}
                gapKey={null}
              />
            </View>

            {/* ── §15. The one thing this build deliberately does not do. ─── */}
            <SectionHeading title="Location" />

            <View className="mb-6">
              <AutomationGapNotice
                gapKey="locationTriggers"
                detail="Automations that react to where you are would need Diaspora to see your location even when the app is closed. Diaspora does not do that, and will not start without asking you separately, in plain words."
              />
            </View>

            {/* ── §57. Which build this is. ──────────────────────────────── */}
            <SectionHeading title="This build" />

            <View
              style={{ backgroundColor: tokens.color.surface.background }}
              className="rounded-2xl p-4"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold leading-relaxed"
              >
                {areAutomationGapsEnabled()
                  ? // §57: a development build says so, unmissably. A member
                    // handed an internal APK should never wonder whether what
                    // they are looking at is real.
                    'Automations in this build are simulated. Nothing is sent, nobody is notified and no money moves.'
                  : 'Automations are not available in this build yet.'}
              </Text>

              {isGapPreviewBuild() ? (
                <Text
                  style={{ color: tokens.color.warning.default }}
                  className="text-[10px] font-black mt-2 uppercase tracking-widest"
                >
                  Internal test build
                </Text>
              ) : null}

              {/* The build identity, selectable.
                  Two internal APKs with the same version are indistinguishable
                  once installed, which is how a tester ends up reporting a bug
                  against a build they are no longer running. A version a
                  screenshot can carry is the cheapest fix for that. */}
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-bold mt-2"
                selectable
                accessibilityLabel={`App version ${buildLabel()}`}
              >
                {buildLabel()}
              </Text>

              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-bold mt-2"
              >
                {access.provenance === 'server'
                  ? `Up to ${access.maxActiveAutomations ?? 'unlimited'} active automations`
                  : 'Your automation permissions are not available'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CapabilityRow({
  label,
  available,
  gapKey,
}: {
  label: string;
  available: boolean;
  gapKey: string | null;
}) {
  const { tokens } = useTheme();
  const gap = gapKey ? AUTOMATION_GAPS[gapKey] : undefined;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}. ${available ? 'Ready' : 'Still being built'}.`}
      className="flex-row items-center py-2"
    >
      <Ionicons
        name={available ? 'checkmark-circle' : 'construct-outline'}
        size={16}
        color={available ? tokens.color.success.default : tokens.color.text.placeholder}
      />

      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold ml-2 flex-1">
        {label}
      </Text>

      {/* The word, always — never the icon alone. §62. */}
      <Text
        style={{
          color: available ? tokens.color.success.default : tokens.color.text.placeholder,
        }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        {available ? 'Ready' : 'Coming'}
      </Text>

      {!available && gap ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-bold ml-2"
          selectable
        >
          {gap.id.replace('FRONTEND-PHASE18-', '')}
        </Text>
      ) : null}
    </View>
  );
}

function SectionHeading({ title }: { title: string }) {
  const { tokens } = useTheme();

  return (
    <Text
      accessibilityRole="header"
      style={{ color: tokens.color.text.placeholder }}
      className="text-[10px] font-black uppercase tracking-widest mb-2 mt-3"
    >
      {title}
    </Text>
  );
}

/**
 * "v1.0.1 (2)" — the version and the Android build number.
 *
 * Read through `expo-constants` rather than hardcoded, so it cannot drift from
 * `app.json`. Falls back to the version alone where the native build number is
 * unavailable (web), and to a plain marker where neither is.
 */
function buildLabel(): string {
  const version = Constants.expoConfig?.version ?? null;
  const androidBuild =
    (Constants.expoConfig?.android as { versionCode?: number } | undefined)?.versionCode ?? null;

  if (!version) return 'Version unknown';
  return androidBuild ? `v${version} (${androidBuild})` : `v${version}`;
}

/** B13's identifiers, as a member would say them. Matches `dependencies.ts`. */
function friendlyChannel(channel: string): string {
  const names: Record<string, string> = {
    InApp: 'In Diaspora',
    Push: 'Push notifications',
    Email: 'Email',
    Sms: 'Text messages',
  };
  return names[channel] ?? channel;
}
