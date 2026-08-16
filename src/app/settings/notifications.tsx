// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notification preferences (Frontend Phase 16, §14 · §17)
//
// ── What changed here ────────────────────────────────────────────────────────
//
// This screen kept its preferences in `AsyncStorage` under
// `diaspora_notification_settings`, with a hardcoded list of seven categories.
// B13 has had a real preference contract the whole time —
// `GET/PUT /notifications/preferences` and `GET /notifications/categories` —
// and `lib/notifications-api.ts` has wrapped it since Phase 5.
//
// So the application had two notification preference systems: one on the
// server, driving what B13 actually sends, and one on the device, driving what
// this screen displayed. They could not agree, because nothing connected them.
// A member switching off "Job Postings" here changed a local boolean and kept
// receiving job notifications.
//
// §14 says "do not duplicate B13 notification preferences". This screen now
// reads and writes B13's record, and the AsyncStorage copy is gone. The
// categories come from the server too, so a category B13 adds appears here
// without a release — the previous hardcoded seven were a subset that would
// have drifted further with every backend change.
//
// ── The three things the server knows that the local copy could not ──────────
//
//   **Which categories are mandatory.** Security and moderation messages cannot
//   be switched off. The old screen had no way to express that and simply did
//   not list them, so a member could not see that they existed. They are now
//   listed with the switch disabled and the reason shown — §37's principle
//   applied to a setting rather than to a consent screen.
//
//   **The per-channel split.** B13 models in-app, push, email and digest
//   separately per category. The old boolean collapsed them, so "off" was
//   ambiguous.
//
//   **Quiet hours, digests and the critical override.** All three are real
//   fields on the contract and none was reachable from the app.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { useNotificationPreferences } from '@/hooks/integrations';
import { fetchNotificationCategories, notificationKeys } from '@/lib/notifications-api';
import { IntegrationErrorNotice } from '@/components/integrations';
import type { CategoryPreference } from '@/types/notification-preferences';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function NotificationSettingsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { preferences, isLoading, error, update, isUpdating } = useNotificationPreferences();

  // The category *definitions*, so a category the member has no preference row
  // for yet still appears with its description and mandatory flag.
  const categories = useQuery({
    queryKey: notificationKeys.categories(),
    queryFn: () => fetchNotificationCategories(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: tokens.color.surface.background }}
      >
        <ActivityIndicator color={tokens.color.primary[500]} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Notifications" showBack />

      <ScrollEndScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {error || !preferences ? (
          <IntegrationErrorNotice
            message="Your notification settings could not be loaded."
            hint="They are saved to your account, so they are safe — check your connection and try again."
          />
        ) : (
          <>
            {/* ── Channels ──────────────────────────────────────────────── */}
            <Heading title="How you hear from Diaspora" />

            <ToggleRow
              title="In the app"
              subtitle="Your notification inbox. This cannot be switched off."
              value={preferences.inApp}
              disabled
              disabledReason="The inbox is how you see anything you have missed."
              onChange={() => {}}
            />

            <ToggleRow
              title="Push notifications"
              subtitle="On your phone, even when the app is closed."
              value={preferences.push}
              disabled={isUpdating}
              onChange={(push) => update({ push })}
            />

            <ToggleRow
              title="Email"
              subtitle="To the address on your account."
              value={preferences.email}
              disabled={isUpdating}
              onChange={(email) => update({ email })}
            />

            <Button
              label="Notification devices"
              variant="ghost"
              onPress={() => router.push('/settings/integrations/push')}
              className="mt-1 mb-2"
            />

            {/* ── Categories, from the server ───────────────────────────── */}
            <Heading
              title="What you hear about"
              subtitle="These apply everywhere you are signed in."
            />

            {preferences.categories.length === 0 && categories.isLoading ? (
              <ActivityIndicator color={tokens.color.primary[500]} />
            ) : (
              [...preferences.categories]
                .sort((a, b) => a.position - b.position)
                .map((category) => (
                  <CategoryRow
                    key={category.key}
                    category={category}
                    disabled={isUpdating}
                    onChange={(enabled) => update({ categories: { [category.key]: enabled } })}
                  />
                ))
            )}

            {/* ── Quiet hours and digests ───────────────────────────────── */}
            <Heading
              title="When"
              subtitle="Quiet hours and digests are in your own time zone, not the server’s."
            />

            <ToggleRow
              title="Quiet hours"
              subtitle={
                preferences.communication.quietHoursEnabled
                  ? `No notifications between ${formatHour(
                      preferences.communication.quietHoursStart
                    )} and ${formatHour(preferences.communication.quietHoursEnd)}.`
                  : 'Notifications can arrive at any time.'
              }
              value={preferences.communication.quietHoursEnabled}
              disabled={isUpdating}
              onChange={(quietHoursEnabled) => update({ quietHoursEnabled })}
            />

            <ToggleRow
              title="Do not disturb"
              subtitle="Hold everything except critical messages."
              value={preferences.communication.doNotDisturb}
              disabled={isUpdating}
              onChange={(doNotDisturb) => update({ doNotDisturb })}
            />

            {/* B13 says this is always true and the switches misrepresent what
                they do unless it is shown. Rendered as a statement rather than
                as a disabled switch, because there is no choice to present. */}
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border p-4 mb-2.5"
              accessible
              accessibilityRole="text"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold mb-1">
                Critical messages always get through
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                A suspension, or a sign-in from a new country, will reach you whatever is set above.
              </Text>
            </View>

            {/* ── Marketing ─────────────────────────────────────────────── */}
            <Heading title="Marketing" />

            <ToggleRow
              title="Product news and offers"
              subtitle="Separate from receipts, alerts and anything about your account."
              value={preferences.communication.allowsMarketing}
              disabled={isUpdating}
              onChange={(allowsMarketing) => update({ allowsMarketing })}
            />
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function CategoryRow({
  category,
  disabled,
  onChange,
}: {
  category: CategoryPreference;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <ToggleRow
      title={category.displayName}
      subtitle={category.description}
      value={category.enabled}
      // A mandatory category is shown with its switch disabled and the reason
      // beside it, rather than hidden. Hiding it means a member cannot see that
      // it exists, and then cannot understand why they received it.
      disabled={disabled || category.isMandatory}
      disabledReason={
        category.isMandatory ? 'This one cannot be switched off.' : undefined
      }
      onChange={onChange}
    />
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  disabled = false,
  disabledReason,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (next: boolean) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ borderColor: tokens.color.border.default }}
      className="flex-row items-center border rounded-2xl p-4 mb-2.5"
    >
      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
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
        {disabledReason ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-bold leading-relaxed mt-1"
          >
            {disabledReason}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={disabledReason ?? subtitle}
        accessibilityState={{ disabled }}
      />
    </View>
  );
}

/** 0–23 as a member's wall clock. B13 stores the hour; this renders it. */
function formatHour(hour: number): string {
  const safe = Math.max(0, Math.min(23, Math.round(hour)));
  return `${String(safe).padStart(2, '0')}:00`;
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
