// ─────────────────────────────────────────────────────────────────────────────
// Stating an organisation's opening hours
//
// `PUT /organizations/{id}/operating-hours` has been served since the module
// shipped and nothing called it. The register form carried three hardcoded rows
// — "Monday - Friday, 09:00 - 17:00" and two more — with no editor behind them
// and no payload in front of them, so a member could neither state their hours
// nor correct the ones the form had invented on their behalf. Every
// organisation on the platform has none.
//
// ── Three things the contract decides and this does not ─────────────────────
//
// **A missing row is not a closed one.** `IsClosed` is explicit, and having no
// row for Sunday says "we have not said", which is a different answer. So a day
// left untouched is omitted rather than sent as shut.
//
// **The note is where the real answer usually lives.** "Jumu'ah 13:15",
// "second Sunday only", "by arrangement" — a platform for mosques, churches and
// volunteer-run food banks cannot express its opening hours in two clock times,
// and the contract says as much. It is a first-class field here, not an extra.
//
// **A row that closes before it opens is refused by the platform**, which is
// right: the organisation meant one of the two and nobody can know which. It is
// checked here as well so the member is told which day is wrong, rather than
// getting one generic refusal for a form of seven.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/design-system';
import type { OperatingHourWire } from '@/lib/community-life-api';

/**
 * The days the platform accepts.
 *
 * `OperatingDay` rather than `System.DayOfWeek`, because it carries
 * `PublicHoliday` — the row a community centre most wants to write down.
 */
const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'PublicHoliday',
] as const;

type Day = (typeof DAYS)[number];

const DAY_LABELS: Record<Day, string> = {
  Monday: 'Monday',
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday',
  Friday: 'Friday',
  Saturday: 'Saturday',
  Sunday: 'Sunday',
  PublicHoliday: 'Public holidays',
};

interface DraftRow {
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  note: string;
}

const EMPTY: DraftRow = { opensAt: '', closesAt: '', isClosed: false, note: '' };

/** The rows the platform sent, as a full week of drafts. */
export function toDrafts(hours: OperatingHourWire[]): Record<Day, DraftRow> {
  const drafts = Object.fromEntries(DAYS.map((day) => [day, { ...EMPTY }])) as Record<
    Day,
    DraftRow
  >;

  for (const hour of hours) {
    const day = DAYS.find((candidate) => candidate.toLowerCase() === hour.day?.toLowerCase());

    if (!day) continue;

    drafts[day] = {
      opensAt: hour.opensAt ?? '',
      closesAt: hour.closesAt ?? '',
      isClosed: Boolean(hour.isClosed),
      note: hour.note ?? '',
    };
  }

  return drafts;
}

/** `9:0` and `900` and `9` all mean nine o'clock to somebody typing quickly. */
function normalise(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) return '';

  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (colon) {
    return `${colon[1].padStart(2, '0')}:${colon[2].padStart(2, '0')}`;
  }

  const digits = /^(\d{3,4})$/.exec(trimmed);
  if (digits) {
    const raw = digits[1].padStart(4, '0');
    return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  }

  const hourOnly = /^(\d{1,2})$/.exec(trimmed);
  if (hourOnly) {
    return `${hourOnly[1].padStart(2, '0')}:00`;
  }

  return trimmed;
}

function isTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match) && Number(match![1]) <= 23 && Number(match![2]) <= 59;
}

/**
 * The rows worth sending, and the first thing wrong with them.
 *
 * A day nobody touched is left out entirely: no row means "we have not said",
 * which the platform distinguishes from being shut.
 */
export function toRequest(drafts: Record<Day, DraftRow>): {
  hours: OperatingHourWire[];
  problem: string | null;
} {
  const hours: OperatingHourWire[] = [];

  for (const day of DAYS) {
    const draft = drafts[day];
    const opensAt = normalise(draft.opensAt);
    const closesAt = normalise(draft.closesAt);
    const note = draft.note.trim();

    if (draft.isClosed) {
      hours.push({ day, opensAt: null, closesAt: null, isClosed: true, note: note || null });
      continue;
    }

    if (!opensAt && !closesAt) {
      // A note on its own is "by arrangement", which the contract allows.
      if (note) {
        hours.push({ day, opensAt: null, closesAt: null, isClosed: false, note });
      }
      continue;
    }

    if (!opensAt || !closesAt) {
      return {
        hours: [],
        problem: `${DAY_LABELS[day]} has only one time. Give both, or mark it closed.`,
      };
    }

    if (!isTime(opensAt) || !isTime(closesAt)) {
      return {
        hours: [],
        problem: `${DAY_LABELS[day]} needs times like 09:00 and 17:30.`,
      };
    }

    if (closesAt <= opensAt) {
      // Refused by the platform too. Named here so the member knows which day.
      return {
        hours: [],
        problem: `${DAY_LABELS[day]} closes before it opens.`,
      };
    }

    hours.push({ day, opensAt, closesAt, isClosed: false, note: note || null });
  }

  return { hours, problem: null };
}

export function OperatingHoursEditor({
  hours,
  isSaving,
  onCancel,
  onSave,
}: {
  hours: OperatingHourWire[];
  isSaving: boolean;
  onCancel: () => void;
  onSave: (hours: OperatingHourWire[]) => void;
}) {
  const { tokens } = useTheme();
  const [drafts, setDrafts] = useState<Record<Day, DraftRow>>(() => toDrafts(hours));
  const [problem, setProblem] = useState<string | null>(null);

  const set = (day: Day, patch: Partial<DraftRow>) =>
    setDrafts((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const filledCount = useMemo(
    () =>
      DAYS.filter(
        (day) =>
          drafts[day].isClosed ||
          drafts[day].opensAt.trim() ||
          drafts[day].closesAt.trim() ||
          drafts[day].note.trim()
      ).length,
    [drafts]
  );

  const handleSave = () => {
    const { hours: next, problem: found } = toRequest(drafts);

    if (found) {
      setProblem(found);
      return;
    }

    setProblem(null);
    onSave(next);
  };

  return (
    <View className="bg-surface-card border border-subtle rounded-2xl p-4 gap-3">
      <View>
        <Text className="text-xs font-black text-content-strong">Opening hours</Text>
        <Text className="text-[11px] text-content-muted font-semibold mt-1 leading-relaxed">
          A day you leave blank is not published as closed — it is left unsaid. Use the note for
          anything two clock times cannot say.
        </Text>
      </View>

      {DAYS.map((day) => {
        const draft = drafts[day];

        return (
          <View key={day} className="border-t border-faint pt-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-black text-content-secondary">{DAY_LABELS[day]}</Text>

              <TouchableOpacity
                accessibilityRole="switch"
                accessibilityState={{ checked: draft.isClosed }}
                accessibilityLabel={`${DAY_LABELS[day]} closed`}
                onPress={() => set(day, { isClosed: !draft.isClosed })}
                className={`rounded-full px-3 py-1.5 border ${
                  draft.isClosed ? 'bg-primary-500 border-primary-500' : 'border-subtle'
                }`}
              >
                <Text
                  className={`text-[10px] font-black uppercase tracking-widest ${
                    draft.isClosed ? 'text-white' : 'text-content-muted'
                  }`}
                >
                  Closed
                </Text>
              </TouchableOpacity>
            </View>

            {!draft.isClosed ? (
              <View className="flex-row gap-2">
                <TextInput
                  placeholder="09:00"
                  value={draft.opensAt}
                  onChangeText={(value) => set(day, { opensAt: value })}
                  onBlur={() => set(day, { opensAt: normalise(draft.opensAt) })}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={`${DAY_LABELS[day]} opens at`}
                  className="flex-1 bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs font-semibold text-content-strong"
                />
                <TextInput
                  placeholder="17:00"
                  value={draft.closesAt}
                  onChangeText={(value) => set(day, { closesAt: value })}
                  onBlur={() => set(day, { closesAt: normalise(draft.closesAt) })}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={`${DAY_LABELS[day]} closes at`}
                  className="flex-1 bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs font-semibold text-content-strong"
                />
              </View>
            ) : null}

            <TextInput
              placeholder="Note — e.g. Jumu'ah 13:15, second Sunday only"
              value={draft.note}
              onChangeText={(value) => set(day, { note: value })}
              accessibilityLabel={`${DAY_LABELS[day]} note`}
              className="bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs font-semibold text-content-strong mt-2"
            />
          </View>
        );
      })}

      {problem ? (
        <Text
          style={{ color: tokens.color.error.default }}
          className="text-[11px] font-bold"
        >
          {problem}
        </Text>
      ) : null}

      <View className="flex-row gap-2 mt-1">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Save opening hours"
          accessibilityState={{ busy: isSaving }}
          disabled={isSaving}
          onPress={handleSave}
          className="flex-1 bg-primary-500 rounded-full py-3 items-center"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white text-[10px] font-black uppercase tracking-widest">
              {filledCount === 0 ? 'Clear hours' : 'Save hours'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={onCancel}
          disabled={isSaving}
          className="border border-subtle rounded-full px-5 py-3 items-center"
        >
          <Text className="text-[10px] font-black text-content-secondary uppercase tracking-widest">
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
