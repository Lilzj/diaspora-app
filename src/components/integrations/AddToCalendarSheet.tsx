// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Add to calendar (Frontend Phase 16, §7 · §51 · §62)
//
// **The only "Add to calendar" in the application.** §7 forbids duplicating
// calendar logic inside each event screen, and the enforcement is that every
// event surface renders this component and none of them builds a draft, picks a
// provider, or handles a permission.
//
// §51 asks for integrations to be discoverable contextually rather than only
// through Settings, and this is the calendar's contextual entry point: it opens
// from an event, not from the connection centre.
//
// ── What the sheet has to get right, and why each is here ────────────────────
//
//   **Only offer what can work.** A provider whose mode is `BACKEND_GAP` is
//   listed with its state rather than hidden — hiding it makes the member
//   wonder whether Diaspora supports Google at all — but it is not tappable,
//   because a row that opens a flow that cannot complete is the "Coming Soon"
//   screen the brief forbids wearing a different hat.
//
//   **Say when the time might be wrong.** `isTimeZoneExact` is false when the
//   runtime could not resolve the event's zone, and the sheet says so rather
//   than silently writing a time that may be an hour out. §62 is about not
//   converting silently; a visible caveat is the honest version of the same
//   rule when the conversion cannot be done properly.
//
//   **Report the honest outcome.** Created, updated, already-there and failed
//   are four different results and each says something different. "Added" for
//   an event that was skipped as a duplicate would send the member looking for
//   a second copy.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { Button } from '@/components/Button';
import { useCalendarSettings, useWritableCalendars } from '@/hooks/integrations';
import {
  eventToDraft,
  exportEventToCalendar,
  prepareCalendarProvider,
  type ExportOutcome,
} from '@/lib/integrations/calendar';
import { resolveCalendarProviders } from '@/lib/integrations/registry';
import { trackIntegrationEvent } from '@/lib/integrations/events';
import { descriptorFor } from '@/lib/integrations/catalog';
import { IntegrationErrorNotice, SimulationMarker } from './IntegrationNotices';
import { PermissionRecovery } from './IntegrationConsent';
import type { Event } from '@/types/community-life';
import type { CalendarRef, IntegrationProviderId } from '@/types/integrations';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface AddToCalendarSheetProps {
  visible: boolean;
  event: Event;
  onClose: () => void;
}

type Stage =
  | { kind: 'choosing' }
  | { kind: 'permission'; provider: IntegrationProviderId; state: 'denied' | 'blocked' | 'restricted' | 'notRequested'; canAskAgain: boolean }
  | { kind: 'working' }
  | { kind: 'done'; outcome: ExportOutcome };

export function AddToCalendarSheet({ visible, event, onClose }: AddToCalendarSheetProps) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const { settings } = useCalendarSettings();
  const calendars = useWritableCalendars();
  const [stage, setStage] = useState<Stage>({ kind: 'choosing' });

  const providers = useMemo(() => resolveCalendarProviders(), []);

  const { draft, isTimeZoneExact } = useMemo(() => {
    try {
      return eventToDraft(event, {
        reminderMinutes: settings.defaultReminderMinutes,
        timeZoneBehaviour: settings.timeZoneBehaviour,
      });
    } catch {
      // An event with an unparseable time. Handled rather than thrown so the
      // sheet renders an explanation instead of crashing the event screen it
      // was opened from.
      return { draft: null, isTimeZoneExact: true } as const;
    }
  }, [event, settings.defaultReminderMinutes, settings.timeZoneBehaviour]);

  const writable = (calendars.data?.calendars ?? []).filter(
    (calendar) => calendar.allowsModifications
  );

  const runExport = useCallback(
    async (providerId: IntegrationProviderId, calendarId: string) => {
      if (!draft) return;

      const prepared = await prepareCalendarProvider(providerId);
      if (!prepared.ok) {
        if (prepared.reason === 'permission') {
          // The snapshot is carried on the result, so the recovery is chosen
          // from the actual permission state rather than inferred from the
          // error's copy.
          const { state } = prepared.permission;
          setStage({
            kind: 'permission',
            provider: providerId,
            state:
              state === 'blocked' || state === 'restricted' || state === 'denied'
                ? state
                : 'notRequested',
            canAskAgain: prepared.permission.canAskAgain,
          });
          return;
        }
        setStage({ kind: 'done', outcome: { kind: 'failed', error: prepared.error } });
        return;
      }

      setStage({ kind: 'working' });
      const outcome = await exportEventToCalendar({
        draft,
        provider: providerId,
        calendarId,
        conflictBehaviour: settings.conflictBehaviour,
        isTimeZoneExact,
      });
      setStage({ kind: 'done', outcome });
    },
    [draft, settings.conflictBehaviour, isTimeZoneExact]
  );

  const close = useCallback(() => {
    setStage({ kind: 'choosing' });
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />

        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="rounded-t-3xl max-h-[85%]"
          testID="add-to-calendar-sheet"
        >
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xl font-black tracking-tight mb-1"
              accessibilityRole="header"
            >
              Add to calendar
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mb-4"
            >
              {event.title}
            </Text>

            {!draft ? (
              <IntegrationErrorNotice
                message="This event does not have a time that can be added to a calendar."
                hint="Try opening the event and checking its date and time."
              />
            ) : stage.kind === 'working' ? (
              <View className="items-center py-8">
                <ActivityIndicator color={tokens.color.primary[500]} />
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-xs font-semibold mt-3"
                >
                  Adding it…
                </Text>
              </View>
            ) : stage.kind === 'permission' ? (
              <View>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-xs font-semibold leading-relaxed mb-4"
                >
                  Diaspora needs permission to add events to your calendar. It never reads what is
                  already in it.
                </Text>
                <PermissionRecovery
                  state={stage.state}
                  canAskAgain={stage.canAskAgain}
                  onRequest={() => {
                    const first = writable[0];
                    if (first) void runExport(stage.provider, first.id);
                  }}
                  onOpenSettings={() => {
                    trackIntegrationEvent('integration.permission.settings_opened', {
                      provider: stage.provider,
                      permissionKey: 'calendar.write',
                    });
                    void resolveCalendarProviders()
                      .find((entry) => entry.descriptor.id === stage.provider)
                      ?.openSettings();
                  }}
                />
              </View>
            ) : stage.kind === 'done' ? (
              <ExportResult outcome={stage.outcome} onClose={close} />
            ) : (
              <>
                {!isTimeZoneExact ? (
                  <View
                    style={{
                      backgroundColor: tokens.color.warning.surface,
                      borderColor: `${tokens.color.warning.default}44`,
                    }}
                    className="rounded-2xl border p-3.5 mb-4"
                    accessible
                    accessibilityRole="text"
                  >
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-xs font-semibold leading-relaxed"
                    >
                      This event is at {event.time} in {event.timezone}, and this device cannot work
                      out what that is in your time zone. The time added may be wrong — check it
                      against the event before you rely on it.
                    </Text>
                  </View>
                ) : null}

                {calendars.isLoading ? (
                  <ActivityIndicator color={tokens.color.primary[500]} />
                ) : (
                  <>
                    {providers.map((provider) => {
                      const descriptor = descriptorFor(provider.descriptor.id);
                      const blocked = provider.capabilities.length === 0;
                      const providerCalendars = writable.filter(
                        (calendar) => calendar.provider === provider.descriptor.id
                      );

                      return (
                        <View key={provider.descriptor.id} className="mb-4">
                          <View className="flex-row items-center mb-2">
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[10px] font-black uppercase tracking-widest mr-2"
                            >
                              {descriptor?.name ?? provider.descriptor.label}
                            </Text>
                            <SimulationMarker mode={provider.descriptor.mode} compact />
                          </View>

                          {blocked ? (
                            // Listed, not hidden, and not tappable. See the header.
                            <Text
                              style={{ color: tokens.color.text.secondary }}
                              className="text-xs font-semibold leading-relaxed"
                            >
                              Not available in this build.
                            </Text>
                          ) : providerCalendars.length === 0 ? (
                            <Text
                              style={{ color: tokens.color.text.secondary }}
                              className="text-xs font-semibold leading-relaxed"
                            >
                              No calendar you can write to.
                            </Text>
                          ) : (
                            providerCalendars.map((calendar) => (
                              <CalendarRow
                                key={calendar.id}
                                calendar={calendar}
                                isDefault={calendar.id === settings.defaultCalendarId}
                                onPress={() => void runExport(provider.descriptor.id, calendar.id)}
                              />
                            ))
                          )}
                        </View>
                      );
                    })}

                    {calendars.data?.failures.map((failure) => (
                      <View key={failure.provider} className="mb-3">
                        <IntegrationErrorNotice
                          message={failure.error.message}
                          hint={failure.error.hint}
                        />
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CalendarRow({
  calendar,
  isDefault,
  onPress,
}: {
  calendar: CalendarRef;
  isDefault: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add to ${calendar.title}${isDefault ? ', your default calendar' : ''}`}
      style={{ borderColor: tokens.color.border.default }}
      className="flex-row items-center border rounded-2xl p-3.5 mb-2 active:opacity-70"
    >
      <View
        style={{ backgroundColor: calendar.color ?? tokens.color.primary[500] }}
        className="w-2.5 h-2.5 rounded-full mr-3"
      />
      <View className="flex-1">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
          {calendar.title}
        </Text>
        {isDefault ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mt-0.5"
          >
            Default
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}

/**
 * The four outcomes, each said accurately.
 *
 * `skipped` is the one that matters: telling a member "Added" for an event that
 * was already there sends them looking for a duplicate, and telling them it
 * failed is worse. "It is already in that calendar" is the true and useful
 * sentence, and it is why `ExportOutcome` has four members rather than a
 * boolean.
 */
function ExportResult({ outcome, onClose }: { outcome: ExportOutcome; onClose: () => void }) {
  const { tokens } = useTheme();

  if (outcome.kind === 'failed') {
    return (
      <View>
        <IntegrationErrorNotice
          message={outcome.error.message}
          hint={
            outcome.error.isIndeterminate
              ? 'It may have been added anyway — check your calendar before adding it again.'
              : outcome.error.hint
          }
          retryAfterSeconds={outcome.error.retryAfterSeconds}
        />
        <Button label="Close" variant="outline" onPress={onClose} className="mt-4" />
      </View>
    );
  }

  const message =
    outcome.kind === 'skipped'
      ? outcome.reason
      : outcome.kind === 'updated'
        ? 'Updated in your calendar.'
        : 'Added to your calendar.';

  return (
    <View className="items-center py-4" accessible accessibilityRole="text" accessibilityLabel={message}>
      <View
        style={{ backgroundColor: tokens.color.success.surface }}
        className="w-14 h-14 rounded-full items-center justify-center mb-3"
      >
        <Ionicons
          name={outcome.kind === 'skipped' ? 'information-circle' : 'checkmark-circle'}
          size={28}
          color={tokens.color.success.default}
        />
      </View>
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black text-center mb-1"
      >
        {message}
      </Text>

      {outcome.kind !== 'skipped' && outcome.timeZoneCaveat ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold text-center leading-relaxed mt-1"
        >
          Check the time — this device could not confirm the event’s time zone.
        </Text>
      ) : null}

      <Button label="Done" onPress={onClose} className="mt-5" />
    </View>
  );
}
