// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Recurrence editor (Frontend Phase 12)
//
// §10: "Do not hardcode recurrence semantics into UI. Use a data-driven
// recurrence model."
//
// This component edits a `RecurrenceRule` and does nothing else. In particular
// it does **not**:
//
//   * expand the rule into dates — that is the server's job, and occurrence
//     identifiers minted on a device could not be referred to by a registration
//     or a reminder;
//   * decide whether a combination is valid beyond the shape the contract
//     defines — the server refuses what it will not accept;
//   * compose the human-readable description shown on a series card — the rule
//     carries `description`, written by the backend that owns the semantics,
//     and a client-composed sentence would drift from it the day the rule
//     changed.
//
// `describeDraft` below is the one exception, and it is deliberately scoped: it
// describes the rule *the member is currently editing*, before it has been sent
// anywhere, because a form with no preview is a form people get wrong. Once the
// series exists, `RecurrenceRule.description` from the server is what renders.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/design-system';
import type {
  RecurrenceEndKind,
  RecurrenceFrequency,
  RecurrenceRule,
  Weekday,
} from '@/types/community-advanced';
import { ChipRow } from './CommunityPrimitives';

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Yearly', label: 'Yearly' },
  { value: 'Custom', label: 'Custom' },
];

const END_KINDS: { value: RecurrenceEndKind; label: string }[] = [
  { value: 'Never', label: 'No end date' },
  { value: 'OnDate', label: 'Until a date' },
  { value: 'AfterCount', label: 'After a number' },
];

/** ISO-8601 weekday numbering: 1 = Monday. */
const WEEKDAYS: { value: Weekday; short: string; long: string }[] = [
  { value: 1, short: 'M', long: 'Monday' },
  { value: 2, short: 'T', long: 'Tuesday' },
  { value: 3, short: 'W', long: 'Wednesday' },
  { value: 4, short: 'T', long: 'Thursday' },
  { value: 5, short: 'F', long: 'Friday' },
  { value: 6, short: 'S', long: 'Saturday' },
  { value: 7, short: 'S', long: 'Sunday' },
];

export const EMPTY_RECURRENCE: RecurrenceRule = {
  frequency: 'Weekly',
  interval: 1,
  byWeekday: [],
  byMonthDay: null,
  endKind: 'Never',
  until: null,
  count: null,
  exceptions: [],
  description: null,
};

/**
 * A sentence describing the rule being edited.
 *
 * Only ever shown next to the editor, as a live preview of what the member is
 * building. It is not stored, not sent, and not used to render a saved series —
 * see the file header for why that distinction matters.
 */
export function describeDraft(rule: RecurrenceRule): string {
  const every = rule.interval > 1 ? `every ${rule.interval} ` : 'every ';

  const base =
    rule.frequency === 'Daily'
      ? `${every}${rule.interval > 1 ? 'days' : 'day'}`
      : rule.frequency === 'Weekly' || rule.frequency === 'Custom'
        ? rule.byWeekday.length > 0
          ? `${every}${rule.interval > 1 ? 'weeks' : 'week'} on ${rule.byWeekday
              .slice()
              .sort((a, b) => a - b)
              .map((day) => WEEKDAYS.find((w) => w.value === day)?.long ?? '')
              .join(', ')}`
          : `${every}${rule.interval > 1 ? 'weeks' : 'week'}`
        : rule.frequency === 'Monthly'
          ? `${every}${rule.interval > 1 ? 'months' : 'month'}`
          : `${every}${rule.interval > 1 ? 'years' : 'year'}`;

  const ending =
    rule.endKind === 'OnDate' && rule.until
      ? `, until ${rule.until}`
      : rule.endKind === 'AfterCount' && rule.count
        ? `, ${rule.count} times`
        : '';

  const exceptions =
    rule.exceptions.length > 0
      ? `, skipping ${rule.exceptions.length} ${rule.exceptions.length === 1 ? 'date' : 'dates'}`
      : '';

  return `Repeats ${base}${ending}${exceptions}.`;
}

export function RecurrenceEditor({
  rule,
  onChange,
}: {
  rule: RecurrenceRule;
  onChange: (next: RecurrenceRule) => void;
}) {
  const { tokens } = useTheme();
  const showWeekdays = rule.frequency === 'Weekly' || rule.frequency === 'Custom';

  return (
    <View>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-bold mb-2"
      >
        How often
      </Text>
      <ChipRow
        accessibilityLabel="How often the event repeats"
        options={FREQUENCIES}
        value={rule.frequency}
        onChange={(frequency) => onChange({ ...rule, frequency })}
      />

      {/* Interval */}
      <View className="flex-row items-center mt-4">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold flex-1"
          nativeID="recurrence-interval-label"
        >
          Repeat every
        </Text>
        <TextInput
          accessibilityLabel="Repeat interval"
          accessibilityHint="A number. 1 means every time, 2 means every other time."
          keyboardType="number-pad"
          value={String(rule.interval)}
          onChangeText={(text) => {
            const parsed = Number(text.replace(/[^0-9]/g, ''));
            onChange({ ...rule, interval: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
          }}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
            color: tokens.color.text.primary,
            width: 64,
            minHeight: 44,
          }}
          className="rounded-xl border px-3 text-sm font-bold text-center"
        />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-bold ml-2 w-16"
        >
          {rule.frequency === 'Daily'
            ? rule.interval > 1
              ? 'days'
              : 'day'
            : rule.frequency === 'Monthly'
              ? rule.interval > 1
                ? 'months'
                : 'month'
              : rule.frequency === 'Yearly'
                ? rule.interval > 1
                  ? 'years'
                  : 'year'
                : rule.interval > 1
                  ? 'weeks'
                  : 'week'}
        </Text>
      </View>

      {/* Weekdays */}
      {showWeekdays ? (
        <View className="mt-4">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-bold mb-2"
          >
            On these days
          </Text>
          <View className="flex-row" accessibilityLabel="Days of the week">
            {WEEKDAYS.map((day) => {
              const isSelected = rule.byWeekday.includes(day.value);
              return (
                <Pressable
                  key={day.value}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={day.long}
                  onPress={() =>
                    onChange({
                      ...rule,
                      byWeekday: isSelected
                        ? rule.byWeekday.filter((d) => d !== day.value)
                        : [...rule.byWeekday, day.value],
                    })
                  }
                  style={{
                    backgroundColor: isSelected
                      ? tokens.color.primary[500]
                      : tokens.color.surface.card,
                    borderColor: isSelected
                      ? tokens.color.primary[500]
                      : tokens.color.border.default,
                    width: 42,
                    height: 42,
                  }}
                  className="rounded-full border items-center justify-center mr-1.5"
                >
                  <Text
                    style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-xs font-black"
                  >
                    {day.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Ending */}
      <View className="mt-5">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mb-2"
        >
          Ends
        </Text>
        <ChipRow
          accessibilityLabel="When the series ends"
          options={END_KINDS}
          value={rule.endKind}
          onChange={(endKind) =>
            onChange({
              ...rule,
              endKind,
              until: endKind === 'OnDate' ? rule.until : null,
              count: endKind === 'AfterCount' ? (rule.count ?? 10) : null,
            })
          }
        />

        {rule.endKind === 'OnDate' ? (
          <TextInput
            accessibilityLabel="Last date of the series"
            accessibilityHint="Type a date as year, month, day. For example 2026-12-31."
            value={rule.until ?? ''}
            onChangeText={(until) => onChange({ ...rule, until })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={tokens.color.text.placeholder}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
              color: tokens.color.text.primary,
              minHeight: 48,
            }}
            className="rounded-xl border px-4 text-sm font-semibold mt-1"
          />
        ) : null}

        {rule.endKind === 'AfterCount' ? (
          <View className="flex-row items-center mt-1">
            <TextInput
              accessibilityLabel="Number of occurrences"
              accessibilityHint="How many times the event happens in total."
              keyboardType="number-pad"
              value={String(rule.count ?? '')}
              onChangeText={(text) => {
                const parsed = Number(text.replace(/[^0-9]/g, ''));
                onChange({ ...rule, count: Number.isFinite(parsed) && parsed > 0 ? parsed : null });
              }}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
                color: tokens.color.text.primary,
                width: 72,
                minHeight: 48,
              }}
              className="rounded-xl border px-3 text-sm font-bold text-center"
            />
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold ml-2">
              times
            </Text>
          </View>
        ) : null}
      </View>

      {/* Live preview */}
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="rounded-xl p-3 mt-5"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Preview. ${describeDraft(rule)}`}
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-black uppercase tracking-widest mb-1"
        >
          Preview
        </Text>
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold leading-relaxed"
        >
          {describeDraft(rule)}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold mt-1.5 leading-relaxed"
        >
          Diaspora works out the exact dates when you save, so they are the same on every device.
        </Text>
      </View>
    </View>
  );
}
