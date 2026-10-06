// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Contextual automation entry points (Frontend Phase 18)
//
// The controls that put an automation on the screen a member is already
// looking at, without putting automation *logic* there.
//
// ── The rule this file exists to keep ────────────────────────────────────────
//
// §0 forbids putting automation rules into UI components and scattering
// trigger/action logic through feature screens. §6 forbids multiple automation
// management screens.
//
// Both are satisfied the same way: these components take a **subject** — an
// event, a search, a listing — and nothing else. They construct no rule, hold
// no trigger key that a feature screen chose, and manage nothing. The
// reminder button calls `useReminders`, which is the same capability the
// Automation Center uses; the save-search button calls
// `useSavedSearchMutations`, which is the same one `/automation/searches` uses.
//
// An event screen that imported `TRIGGER_CATALOG` and assembled a draft would
// be the thing §0 forbids. An event screen that renders `<EventReminderButton
// eventId={id} />` is an entry point.
//
// ── §12, and the state that is easy to get wrong ─────────────────────────────
//
// A reminder has five states and the two that matter here are **configured**
// and **scheduled**. In this build a reminder can be configured and cannot be
// scheduled, and the button says so afterwards rather than showing a tick. A
// tick would be the client claiming a delivery the platform has no way to make.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/design-system';
import { useReminders, useSavedSearchMutations } from '@/hooks/automation';
import { REMINDER_OFFSETS } from '@/lib/automation/schedule';
import { AutomationError } from '@/lib/automation/errors';
import type { SavedSearchSubject } from '@/types/automation';

// ═════════════════════════════════════════════════════════════════════════════
// EVENT REMINDER — §12
// ═════════════════════════════════════════════════════════════════════════════

export interface EventReminderButtonProps {
  eventId: string;
  eventTitle: string;
  /**
   * The event's own IANA zone. §42: an offset is computed in the *event's*
   * timezone, not the device's, so "one day before" stays right if the member
   * travels. Required rather than optional — a reminder with no zone is a
   * reminder that will fire at the wrong time for somebody.
   */
  timeZoneId: string;
  /**
   * When the event starts, as an ISO-8601 instant.
   *
   * The offset counts back from this, and the platform stores the moment rather
   * than recomputing it — so it must be an *instant*, resolved from the event's
   * wall clock in the event's own zone by `convertToInstant`, and never the
   * device's interpretation of `date` + `time`. The caller owns this because
   * only the caller knows when its subject is.
   */
  eventStartsAt: string;
  /**
   * Render the collapsed trigger as one cell of a row rather than a full-width
   * button.
   *
   * The event screen puts "Directions", "Calendar" and this side by side —
   * three short labels, and giving each the whole width of a phone read as
   * three unrelated decisions and pushed the rest of the event a screenful
   * down.
   *
   * Only the *trigger* becomes compact. Once this opens, or once a reminder
   * exists, the panel asks for the full width, and the caller's wrapping row
   * drops it onto its own line: a list of offsets squeezed into a third of a
   * screen would be unreadable.
   */
  compact?: boolean;
}

export function EventReminderButton({
  eventId,
  eventTitle,
  timeZoneId,
  eventStartsAt,
  compact = false,
}: EventReminderButtonProps) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<AutomationError | null>(null);
  const [configured, setConfigured] = useState<number | null>(null);
  // The state the server returned when this reminder was created. Read before the
  // list, which is refetched after the create and may not have it yet.
  const [createdState, setCreatedState] = useState<string | null>(null);

  const { reminders, create, isOffline } = useReminders('event', eventId, eventStartsAt);

  const existing = useMemo(
    () => reminders.filter((reminder) => reminder.state !== 'cancelled'),
    [reminders]
  );

  const choose = useCallback(
    async (offsetMinutes: number) => {
      setError(null);
      try {
        // No `channel`. The platform has no such field on a reminder: delivery
        // follows the member's notification preferences, which is the right
        // owner for it — a reminder that hard-coded `InApp` would go unseen by
        // somebody who had asked for push and nothing else.
        const result = await create.mutateAsync({
          offsetMinutes,
          anchor: 'start',
          timeZoneId,
          subjectTitle: eventTitle,
        });

        // §12: `configured` is what the member did; `scheduled` is what the
        // platform accepted. The result is rendered from the state the server
        // returned rather than from the fact that the call succeeded.
        setConfigured(offsetMinutes);
        setCreatedState(result?.state ?? null);
        setOpen(false);
        return result;
      } catch (cause) {
        setError(cause instanceof AutomationError ? cause : null);
        return null;
      }
    },
    [create, timeZoneId, eventTitle, setConfigured, setCreatedState]
  );

  if (configured !== null || existing.length > 0) {
    const minutes = configured ?? existing[0]?.offsetMinutes ?? 0;
    const label = REMINDER_OFFSETS.find((offset) => offset.minutes === minutes)?.label;
    // Until 6 Oct 2026 this read only the list. When the list came back without the
    // new reminder, a reminder the server had just scheduled was shown as "saved,
    // cannot send yet".
    const isScheduled =
      createdState === 'scheduled' || existing.some((reminder) => reminder.state === 'scheduled');

    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={
          isScheduled
            ? `Reminder set for ${label ?? 'before this event'}.`
            : `Reminder saved for ${label ?? 'before this event'}. Diaspora cannot send reminders automatically yet.`
        }
        style={{
          backgroundColor: tokens.color.surface.background,
          // In a wrapping row this claims its own line. A reminder summary
          // squeezed into a third of a screen would be unreadable.
          ...(compact ? { width: '100%' as const } : {}),
        }}
        className="rounded-2xl px-4 py-3 mt-2"
      >
        <View className="flex-row items-center">
          <Ionicons
            // Not a tick unless it is genuinely scheduled. See the file header.
            name={isScheduled ? 'checkmark-circle' : 'bookmark'}
            size={15}
            color={isScheduled ? tokens.color.success.default : tokens.color.text.secondary}
          />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black ml-1.5 flex-1"
          >
            {isScheduled ? `Reminder set — ${label}` : `Reminder saved — ${label}`}
          </Text>
        </View>

        {!isScheduled ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-medium mt-1 leading-relaxed"
          >
            Diaspora cannot send reminders automatically yet. This is saved and will start working
            when it can.
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage your automations"
          onPress={() => router.push('/automation' as never)}
          className="mt-1.5"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-black">
            Manage automations →
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remind me about ${eventTitle}`}
        accessibilityHint="Choose how long before the event you want to be reminded"
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: tokens.color.surface.background,
          borderColor: tokens.color.surface.border,
        }}
        className={
          compact
            ? 'flex-1 items-center justify-center border py-3 rounded-2xl'
            : 'flex-row items-center justify-center border py-3 rounded-2xl mt-2'
        }
        testID="event-reminder-button"
      >
        <Ionicons name="alarm-outline" size={compact ? 16 : 15} color={tokens.color.text.secondary} />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className={compact ? 'text-[10px] font-black mt-1' : 'text-xs font-black ml-1.5'}
        >
          Remind me
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
        // Same reason as the summary above: the offsets are a vertical list.
        ...(compact ? { width: '100%' as const } : {}),
      }}
      className="rounded-2xl border p-3 mt-2"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest mb-2"
      >
        Remind me
      </Text>

      <View accessibilityRole="radiogroup" accessibilityLabel="How long before">
        {REMINDER_OFFSETS.map((offset) => (
          <Pressable
            key={offset.minutes}
            accessibilityRole="radio"
            accessibilityState={{ selected: false, disabled: create.isPending }}
            accessibilityLabel={offset.label}
            disabled={create.isPending}
            onPress={() => void choose(offset.minutes)}
            className="py-2.5"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
              {offset.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* §42, where the member can see it: the offset is in the event's own
          time, not theirs. */}
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold mt-1 leading-relaxed"
      >
        Times are in the event’s own timezone, so this stays right if you travel.
      </Text>

      {isOffline ? (
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[11px] font-black mt-2"
        >
          You are offline. Nothing can be saved right now.
        </Text>
      ) : null}

      {error ? (
        <Text
          style={{
            color: error.blame === 'platform' ? tokens.color.text.secondary : tokens.color.error.default,
          }}
          className="text-[11px] font-semibold mt-2 leading-relaxed"
        >
          {error.message}
        </Text>
      ) : null}

      {create.isPending ? (
        <View className="items-center py-2">
          <ActivityIndicator size="small" color={tokens.color.primary[500]} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={() => setOpen(false)}
        className="pt-2"
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-black text-center"
        >
          Cancel
        </Text>
      </Pressable>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVE THIS SEARCH — §30
// ═════════════════════════════════════════════════════════════════════════════

export interface SaveSearchButtonProps {
  subject: SavedSearchSubject;
  /** The filters the list screen currently has applied. */
  criteria: Record<string, string | number | boolean | string[]>;
  /** What the member typed, for display. "Software · Mauritius". */
  querySummary: string;
  /** A default name. The member can change it later on the searches screen. */
  suggestedName: string;
}

/**
 * "Save this search, and tell me about new matches."
 *
 * The one saved-search control, shared by every list screen. §30 forbids
 * duplicating saved-search logic across modules and this is how that is kept:
 * a list screen passes its own filters and knows nothing about alerts,
 * frequencies or automations.
 */
export function SaveSearchButton({
  subject,
  criteria,
  querySummary,
  suggestedName,
}: SaveSearchButtonProps) {
  const { tokens } = useTheme();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<AutomationError | null>(null);
  const mutations = useSavedSearchMutations();

  const save = useCallback(async () => {
    setError(null);
    try {
      await mutations.create.mutateAsync({
        subject,
        name: suggestedName,
        criteria,
        querySummary,
        alertsEnabled: true,
        alertFrequency: 'instant',
        watchFor: ['newMatch'],
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof AutomationError ? cause : null);
    }
  }, [mutations, subject, suggestedName, criteria, querySummary]);

  if (saved) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel="Search saved. Diaspora cannot watch it automatically yet."
        style={{ backgroundColor: tokens.color.surface.background }}
        className="rounded-2xl px-4 py-3"
      >
        <View className="flex-row items-center">
          <Ionicons name="bookmark" size={15} color={tokens.color.text.secondary} />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black ml-1.5 flex-1"
          >
            Search saved
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See your saved searches"
          onPress={() => router.push('/automation/searches' as never)}
          className="mt-1.5"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-black">
            See your saved searches →
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save this search and be told about new matches"
        accessibilityState={{ disabled: mutations.create.isPending }}
        disabled={mutations.create.isPending}
        onPress={save}
        style={{
          backgroundColor: tokens.color.surface.background,
          borderColor: tokens.color.surface.border,
        }}
        className="flex-row items-center justify-center border py-3 rounded-2xl"
        testID="save-search-button"
      >
        {mutations.create.isPending ? (
          <ActivityIndicator size="small" color={tokens.color.text.secondary} />
        ) : (
          <Ionicons name="bookmark-outline" size={15} color={tokens.color.text.secondary} />
        )}
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-black ml-1.5">
          Save this search
        </Text>
      </Pressable>

      {error ? (
        <Text
          style={{
            color:
              error.blame === 'platform' ? tokens.color.text.secondary : tokens.color.error.default,
          }}
          className="text-[11px] font-semibold mt-2 leading-relaxed"
        >
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}
