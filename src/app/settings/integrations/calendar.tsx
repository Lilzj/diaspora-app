// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Calendar integration settings (Frontend Phase 16, §8 · §62)
//
// §8's settings, and the distinction it asks to be made visible:
//
//   **Exporting an event** — Diaspora writes one event into a calendar you
//   chose. One direction, one moment, nothing read.
//
//   **Two-way synchronisation** — Diaspora also reads your calendar, and keeps
//   both in step.
//
// Those are wildly different privacy propositions and the second is off by
// default. The screen states the difference in the section that offers it,
// rather than relying on the switch labels to imply it — a member who reads
// "Sync" and thinks "keep my events up to date" has not agreed to Diaspora
// reading a calendar that contains their medical appointments.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useCalendarSettings, useWritableCalendars } from '@/hooks/integrations';
import {
  IntegrationGapNotice,
  IntegrationStatusBadge,
  ProviderGapNotice,
  IntegrationErrorNotice,
} from '@/components/integrations';
import { resolveCalendarProviders } from '@/lib/integrations/registry';
import { descriptorFor } from '@/lib/integrations/catalog';
import { hasDeviceCalendar } from '@/lib/integrations/providers/device-calendar';
import type { CalendarSyncSettings } from '@/types/integrations';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function CalendarIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { settings, update, isPersisted, isLoading } = useCalendarSettings();
  const calendars = useWritableCalendars();
  const providers = resolveCalendarProviders();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Calendar" showBack />

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* ── Providers ─────────────────────────────────────────────────── */}
        <Heading title="Calendars" />

        {providers.map((provider) => {
          const descriptor = descriptorFor(provider.descriptor.id);
          return (
            <View
              key={provider.descriptor.id}
              style={{ borderColor: tokens.color.border.default }}
              className="border rounded-2xl p-4 mb-2.5"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black mb-2"
              >
                {descriptor?.name ?? provider.descriptor.label}
              </Text>
              <IntegrationStatusBadge
                status={provider.capabilities.length > 0 ? 'CONNECTED' : 'BACKEND_GAP'}
                mode={provider.descriptor.mode}
                showDescription
              />
            </View>
          );
        })}

        {!hasDeviceCalendar() ? (
          <View className="mb-3">
            <ProviderGapNotice
              gapKey="deviceCalendar"
              detail="Adding events to the calendar on this phone needs a newer version of the app. Everything else here still works."
            />
          </View>
        ) : null}

        <View className="mb-5">
          <IntegrationGapNotice
            gapKey="googleCalendarList"
            detail="Connecting a Google calendar needs a backend that does not exist yet. The calendar on this phone is unaffected."
          />
        </View>

        {/* ── Exporting ─────────────────────────────────────────────────── */}
        <Heading
          title="Adding events"
          subtitle="Diaspora writes an event into the calendar you choose. It never reads what is already there."
        />

        {isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : (
          <>
            <Row
              title="Add events I say I am going to"
              subtitle="When you RSVP, the event goes into your default calendar automatically."
              value={settings.autoExportRsvps}
              onChange={(autoExportRsvps) => update({ autoExportRsvps })}
            />

            <ChoiceRow
              title="Default calendar"
              value={
                calendars.data?.calendars.find(
                  (calendar) => calendar.id === settings.defaultCalendarId
                )?.title ?? 'Ask me every time'
              }
            />

            <ChoiceRow
              title="Reminder"
              value={describeReminders(settings.defaultReminderMinutes)}
            />

            <ChoiceRow
              title="If the event is already there"
              value={describeConflict(settings.conflictBehaviour)}
            />
          </>
        )}

        {/* ── Timezone — §62 ────────────────────────────────────────────── */}
        <Heading
          title="Time zones"
          subtitle="An event in Lagos happens at Lagos time, whether or not you are there."
        />

        <Row
          title="Use each event’s own time zone"
          subtitle="Off means events are converted to this device’s time zone, which changes what the entry says when you travel."
          value={settings.timeZoneBehaviour === 'eventTimeZone'}
          onChange={(useEventZone) =>
            update({ timeZoneBehaviour: useEventZone ? 'eventTimeZone' : 'deviceTimeZone' })
          }
        />

        {/* ── Two-way sync — §8 ─────────────────────────────────────────── */}
        <Heading
          title="Two-way sync"
          subtitle="Different from adding events: this would let Diaspora read your calendar as well as write to it."
        />

        <View className="mb-3">
          <IntegrationGapNotice
            gapKey="calendarTwoWaySync"
            detail="Two-way sync is not available. Diaspora can add events to your calendar, and cannot read it — which is the safer half and the half that works."
          />
        </View>

        {!isPersisted ? (
          <View className="mt-4">
            <IntegrationErrorNotice
              message="These settings apply now but are not saved to your account."
              hint="They will reset when you reinstall the app, until the backend can store them."
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function describeReminders(minutes: number[]): string {
  if (minutes.length === 0) return 'None';
  const first = minutes[0];
  if (first >= 60) {
    const hours = Math.round(first / 60);
    return hours === 1 ? '1 hour before' : `${hours} hours before`;
  }
  return `${first} minutes before`;
}

function describeConflict(behaviour: CalendarSyncSettings['conflictBehaviour']): string {
  switch (behaviour) {
    case 'skip':
      return 'Leave it alone';
    case 'update':
      return 'Update it';
    case 'duplicate':
      return 'Add it again';
  }
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

function Row({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
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
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
      />
    </View>
  );
}

function ChoiceRow({ title, value }: { title: string; value: string }) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ borderColor: tokens.color.border.default }}
      className="flex-row items-center justify-between border rounded-2xl p-4 mb-2.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}: ${value}`}
    >
      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold flex-1 mr-3">
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-bold text-right"
      >
        {value}
      </Text>
    </View>
  );
}
