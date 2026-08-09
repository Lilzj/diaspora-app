// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Builder controls (Frontend Phase 18, §7 · §33 · §62)
//
// The WHEN / IF / THEN pickers, and the schedule editor.
//
// ── §7's requirement, and the design decision it forces ──────────────────────
//
// *"The UI must be understandable to ordinary users. Do not expose raw JSON
// rules to normal users."*
//
// So a condition is not rendered as `{ key, operator, value }`. It is rendered
// as a sentence with the value as the only editable part, and the operator is
// chosen from a list of English phrases. The member reads "Country is Nigeria"
// and taps "Nigeria" — they never meet the word `equals`.
//
// The consequence is that the editors are keyed on **`valueKind`, not on
// condition key**. There are twelve value kinds and twenty-odd conditions, so
// adding a condition adds no UI at all — which is what stops §33's builder
// growing a special case per entry in §9's list.
//
// ── §62, and the two decisions that matter most ──────────────────────────────
//
// **Every option is a real `accessibilityRole="radio"` or `"checkbox"` with
// `accessibilityState`**, not a styled `View`. A picker built from pressable
// boxes looks identical and is unusable with a screen reader, which is the
// single most common accessibility failure in a custom picker.
//
// **Selection is never indicated by colour alone.** Every selected option
// carries a check glyph as well as a fill, and its accessibility state says
// `selected`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useMemo } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { OPERATOR_LABELS } from '@/lib/automation/conditions';
import { REMINDER_OFFSETS, describeOffset } from '@/lib/automation/schedule';
import { firesInBackground } from '@/lib/automation/triggers';
import type {
  AutomationActionDefinition,
  AutomationCondition,
  AutomationConditionDefinition,
  AutomationFrequency,
  AutomationSchedule,
  AutomationTriggerDefinition,
} from '@/types/automation';
import { SupportBadge } from './AutomationNotices';

// ═════════════════════════════════════════════════════════════════════════════
// SHARED — the option row every picker is built from
// ═════════════════════════════════════════════════════════════════════════════

interface OptionRowProps {
  label: string;
  description?: string | null;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  trailing?: React.ReactNode;
  role?: 'radio' | 'checkbox';
  testID?: string;
}

/**
 * One selectable option.
 *
 * The whole builder is made of these. A real `radio`/`checkbox` role with
 * `accessibilityState` rather than a styled box — see the file header.
 */
const OptionRow = memo(function OptionRow({
  label,
  description,
  selected,
  onPress,
  disabled = false,
  disabledReason,
  trailing,
  role = 'radio',
  testID,
}: OptionRowProps) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessible
      accessibilityRole={role}
      accessibilityState={{ selected, checked: selected, disabled }}
      accessibilityLabel={label}
      accessibilityHint={disabled ? (disabledReason ?? 'Not available') : (description ?? undefined)}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: selected ? `${tokens.color.primary[500]}12` : tokens.color.surface.card,
        borderColor: selected ? tokens.color.primary[500] : tokens.color.surface.border,
        opacity: disabled ? 0.5 : 1,
      }}
      className="rounded-2xl border p-3.5 mb-2"
      testID={testID}
    >
      <View className="flex-row items-start">
        {/* The glyph, not the fill, is what carries selection for anybody who
            cannot distinguish the border colour. §62. */}
        <Ionicons
          name={
            selected
              ? role === 'checkbox'
                ? 'checkbox'
                : 'radio-button-on'
              : role === 'checkbox'
                ? 'square-outline'
                : 'radio-button-off'
          }
          size={18}
          color={selected ? tokens.color.primary[500] : tokens.color.text.placeholder}
          style={{ marginTop: 1 }}
        />

        <View className="flex-1 ml-2.5">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-bold leading-snug"
          >
            {label}
          </Text>

          {description ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-medium mt-1 leading-relaxed"
            >
              {description}
            </Text>
          ) : null}

          {disabled && disabledReason ? (
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[10px] font-bold mt-1.5"
            >
              {disabledReason}
            </Text>
          ) : null}
        </View>

        {trailing ? <View className="ml-2">{trailing}</View> : null}
      </View>
    </Pressable>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGER PICKER — §8 · §33
// ═════════════════════════════════════════════════════════════════════════════

export interface TriggerPickerProps {
  triggers: AutomationTriggerDefinition[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function TriggerPicker({ triggers, selectedKey, onSelect }: TriggerPickerProps) {
  const { tokens } = useTheme();

  if (triggers.length === 0) {
    return (
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed"
      >
        There are no triggers available for this kind of automation.
      </Text>
    );
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="What starts this automation"
      testID="automation-trigger-picker"
    >
      {triggers.map((trigger) => (
        <OptionRow
          key={trigger.key}
          label={trigger.label}
          description={
            // The background caveat is appended to the description rather than
            // rendered separately, so a screen reader hears it as part of the
            // option. §8: a member should know before choosing that a
            // device-local trigger cannot fire while the app is closed.
            firesInBackground(trigger)
              ? trigger.description
              : `${trigger.description} Runs only while Diaspora is open.`
          }
          selected={selectedKey === trigger.key}
          onPress={() => onSelect(trigger.key)}
          trailing={<SupportBadge support={trigger.support} compact />}
          testID={`automation-trigger-option-${trigger.key}`}
        />
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONDITION EDITOR — §9 · §33
// ═════════════════════════════════════════════════════════════════════════════

export interface ConditionEditorProps {
  condition: AutomationCondition;
  definition: AutomationConditionDefinition;
  onChange: (condition: AutomationCondition) => void;
  onRemove: () => void;
}

/**
 * One condition, as a sentence.
 *
 * "Country **is** [Nigeria]" — the operator is a control only when the
 * condition genuinely offers more than one, because a picker with a single
 * option is a control that teaches somebody it does something.
 */
export function ConditionEditor({
  condition,
  definition,
  onChange,
  onRemove,
}: ConditionEditorProps) {
  const { tokens } = useTheme();

  const needsValue = condition.operator !== 'isTrue' && condition.operator !== 'isFalse';
  const isRange = condition.operator === 'between' || condition.operator === 'within';

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
      }}
      className="rounded-2xl border p-3.5 mb-2"
      testID={`automation-condition-${condition.id}`}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-black flex-1 pr-2"
        >
          {definition.label}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove the ${definition.label} condition`}
          onPress={onRemove}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={20} color={tokens.color.text.placeholder} />
        </Pressable>
      </View>

      {definition.operators.length > 1 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={`How to compare ${definition.label}`}
          className="flex-row flex-wrap mb-2"
        >
          {definition.operators.map((operator) => {
            const selected = condition.operator === operator;
            return (
              <Pressable
                key={operator}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={OPERATOR_LABELS[operator] ?? operator}
                onPress={() => onChange({ ...condition, operator })}
                style={{
                  backgroundColor: selected
                    ? tokens.color.primary[500]
                    : tokens.color.surface.background,
                }}
                className="rounded-full px-3 py-1.5 mr-1.5 mb-1.5"
              >
                <Text
                  style={{
                    color: selected ? tokens.color.text.inverse : tokens.color.text.secondary,
                  }}
                  className="text-[11px] font-black"
                >
                  {OPERATOR_LABELS[operator] ?? operator}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold mb-2"
        >
          {OPERATOR_LABELS[condition.operator] ?? condition.operator}
        </Text>
      )}

      {needsValue ? (
        <ConditionValueEditor
          definition={definition}
          value={condition.value}
          secondaryValue={condition.secondaryValue ?? null}
          isRange={isRange}
          onChange={(value, secondaryValue) =>
            onChange({ ...condition, value, secondaryValue: secondaryValue ?? undefined })
          }
        />
      ) : null}

      {/* §9's server-evaluation rule, said out loud where the member is
          choosing. Without it, "checked by Diaspora" in a run detail later
          would arrive with no context. */}
      {definition.requiresServerEvaluation ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2 leading-relaxed"
        >
          Diaspora checks this on its own servers when the automation runs.
        </Text>
      ) : null}
    </View>
  );
}

interface ConditionValueEditorProps {
  definition: AutomationConditionDefinition;
  value: AutomationCondition['value'];
  secondaryValue: string | number | null;
  isRange: boolean;
  onChange: (value: AutomationCondition['value'], secondaryValue?: string | number | null) => void;
}

/**
 * The editor for a value, chosen by `valueKind`.
 *
 * Twelve kinds, twenty-odd conditions, one switch. See the file header for why
 * this is keyed on the kind rather than on the condition.
 */
function ConditionValueEditor({
  definition,
  value,
  secondaryValue,
  isRange,
  onChange,
}: ConditionValueEditorProps) {
  const { tokens } = useTheme();

  if (definition.valueKind === 'choice' && definition.choices) {
    const selectedValues = Array.isArray(value) ? value : value !== null ? [String(value)] : [];
    const multiple = definition.operators.includes('includes');

    return (
      <View
        accessibilityRole={multiple ? undefined : 'radiogroup'}
        accessibilityLabel={definition.label}
        className="flex-row flex-wrap"
      >
        {definition.choices.map((choice) => {
          const selected = selectedValues.includes(choice.value);
          return (
            <Pressable
              key={choice.value}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={choice.label}
              onPress={() => {
                if (!multiple) {
                  onChange(choice.value);
                  return;
                }
                const next = selected
                  ? selectedValues.filter((entry) => entry !== choice.value)
                  : [...selectedValues, choice.value];
                onChange(next);
              }}
              style={{
                backgroundColor: selected
                  ? tokens.color.primary[500]
                  : tokens.color.surface.background,
              }}
              className="rounded-full px-3 py-1.5 mr-1.5 mb-1.5 flex-row items-center"
            >
              {selected ? (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={tokens.color.text.inverse}
                  style={{ marginRight: 4 }}
                />
              ) : null}
              <Text
                style={{
                  color: selected ? tokens.color.text.inverse : tokens.color.text.secondary,
                }}
                className="text-[11px] font-black"
              >
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const isNumeric =
    definition.valueKind === 'number' ||
    definition.valueKind === 'money' ||
    definition.valueKind === 'distance';

  return (
    <View className="flex-row items-center">
      <TextInput
        accessibilityLabel={definition.label}
        accessibilityHint={definition.unit ? `Measured in ${definition.unit}` : undefined}
        value={value === null || value === undefined ? '' : String(value)}
        onChangeText={(text) =>
          onChange(isNumeric ? (text === '' ? null : Number(text)) : text, secondaryValue)
        }
        keyboardType={isNumeric ? 'numeric' : 'default'}
        placeholder={placeholderFor(definition)}
        placeholderTextColor={tokens.color.text.placeholder}
        style={{
          color: tokens.color.text.primary,
          borderColor: tokens.color.surface.border,
          backgroundColor: tokens.color.surface.background,
        }}
        className="flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-semibold"
        testID={`automation-condition-value-${definition.key}`}
      />

      {definition.unit ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-black ml-2"
        >
          {definition.unit}
        </Text>
      ) : null}

      {isRange ? (
        <>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black mx-2"
          >
            and
          </Text>
          <TextInput
            accessibilityLabel={`${definition.label}, upper value`}
            value={secondaryValue === null ? '' : String(secondaryValue)}
            onChangeText={(text) =>
              onChange(value, isNumeric ? (text === '' ? null : Number(text)) : text)
            }
            keyboardType={isNumeric ? 'numeric' : 'default'}
            placeholderTextColor={tokens.color.text.placeholder}
            style={{
              color: tokens.color.text.primary,
              borderColor: tokens.color.surface.border,
              backgroundColor: tokens.color.surface.background,
            }}
            className="flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-semibold"
          />
        </>
      ) : null}
    </View>
  );
}

function placeholderFor(definition: AutomationConditionDefinition): string {
  switch (definition.valueKind) {
    case 'country':
      return 'e.g. Mauritius';
    case 'community':
      return 'Choose a community';
    case 'neighbourhood':
      return 'e.g. Curepipe';
    case 'category':
      return 'e.g. Software';
    case 'money':
      return 'Amount';
    case 'distance':
      return 'Distance';
    case 'number':
      return 'Number';
    case 'time':
      return 'HH:MM';
    case 'date':
      return 'Date';
    default:
      return 'Value';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION PICKER — §10 · §33
// ═════════════════════════════════════════════════════════════════════════════

export interface ActionPickerProps {
  actions: AutomationActionDefinition[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  /** Channels the member has switched on. Drives the §53 caveat. */
  enabledChannels: string[];
}

export function ActionPicker({
  actions,
  selectedKeys,
  onToggle,
  enabledChannels,
}: ActionPickerProps) {
  const { tokens } = useTheme();

  if (actions.length === 0) {
    return (
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed"
      >
        Choose a trigger first, and the things it can do will appear here.
      </Text>
    );
  }

  return (
    <View accessibilityLabel="What should happen" testID="automation-action-picker">
      {actions.map((action) => {
        const channelOff =
          action.notificationChannel !== null &&
          !enabledChannels.includes(action.notificationChannel);

        return (
          <OptionRow
            key={action.key}
            role="checkbox"
            label={action.label}
            description={
              // §53's caveat is appended rather than shown as an error: the
              // member's setting is a legitimate choice and the action is still
              // selectable — it just would not be delivered on that channel.
              channelOff
                ? `${action.description} You currently have this kind of notification switched off.`
                : action.description
            }
            selected={selectedKeys.includes(action.key)}
            onPress={() => onToggle(action.key)}
            trailing={<SupportBadge support={action.support} compact />}
            testID={`automation-action-option-${action.key}`}
          />
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHEDULE EDITOR — §41 · §42
// ═════════════════════════════════════════════════════════════════════════════

const FREQUENCIES: { value: AutomationFrequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ScheduleEditorProps {
  schedule: AutomationSchedule;
  onChange: (schedule: AutomationSchedule) => void;
  /** The next-occurrence preview, from the server or from the local estimate. */
  nextOccurrenceLabel: string | null;
  /** False when the estimate is the client's rather than the platform's. §41. */
  isAuthoritative: boolean;
}

export function ScheduleEditor({
  schedule,
  onChange,
  nextOccurrenceLabel,
  isAuthoritative,
}: ScheduleEditorProps) {
  const { tokens } = useTheme();

  if (schedule.frequency === 'eventRelative') {
    return (
      <EventOffsetEditor
        schedule={schedule}
        onChange={onChange}
        nextOccurrenceLabel={nextOccurrenceLabel}
      />
    );
  }

  const hour = schedule.hour ?? 9;
  const minute = schedule.minute ?? 0;

  return (
    <View testID="automation-schedule-editor">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="How often"
        className="flex-row flex-wrap mb-3"
      >
        {FREQUENCIES.map((frequency) => {
          const selected = schedule.frequency === frequency.value;
          return (
            <Pressable
              key={frequency.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={frequency.label}
              onPress={() => onChange({ ...schedule, frequency: frequency.value })}
              style={{
                backgroundColor: selected
                  ? tokens.color.primary[500]
                  : tokens.color.surface.background,
              }}
              className="rounded-full px-3.5 py-2 mr-1.5 mb-1.5"
            >
              <Text
                style={{
                  color: selected ? tokens.color.text.inverse : tokens.color.text.secondary,
                }}
                className="text-[11px] font-black"
              >
                {frequency.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {schedule.frequency === 'weekly' ? (
        <View
          accessibilityLabel="Which days"
          className="flex-row flex-wrap mb-3"
        >
          {DAY_SHORT.map((day, index) => {
            const selected = schedule.daysOfWeek.includes(index);
            return (
              <Pressable
                key={day}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={DAY_FULL[index]}
                onPress={() =>
                  onChange({
                    ...schedule,
                    daysOfWeek: selected
                      ? schedule.daysOfWeek.filter((entry) => entry !== index)
                      : [...schedule.daysOfWeek, index].sort((a, b) => a - b),
                  })
                }
                style={{
                  backgroundColor: selected
                    ? tokens.color.primary[500]
                    : tokens.color.surface.background,
                }}
                className="rounded-full w-11 h-11 items-center justify-center mr-1.5 mb-1.5"
              >
                <Text
                  style={{
                    color: selected ? tokens.color.text.inverse : tokens.color.text.secondary,
                  }}
                  className="text-[10px] font-black"
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {schedule.frequency === 'monthly' ? (
        <View className="mb-3">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black mb-1.5"
          >
            Day of the month
          </Text>
          <TextInput
            accessibilityLabel="Day of the month"
            value={schedule.dayOfMonth === null ? '' : String(schedule.dayOfMonth)}
            onChangeText={(text) =>
              onChange({ ...schedule, dayOfMonth: text === '' ? null : Number(text) })
            }
            keyboardType="numeric"
            placeholder="1–31"
            placeholderTextColor={tokens.color.text.placeholder}
            style={{
              color: tokens.color.text.primary,
              borderColor: tokens.color.surface.border,
              backgroundColor: tokens.color.surface.background,
            }}
            className="rounded-xl border px-3 py-2.5 text-[13px] font-semibold"
          />
        </View>
      ) : null}

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-black mb-1.5"
      >
        Time
      </Text>
      <View className="flex-row items-center mb-3">
        <TextInput
          accessibilityLabel="Hour, from 0 to 23"
          value={String(hour).padStart(2, '0')}
          onChangeText={(text) => onChange({ ...schedule, hour: text === '' ? null : Number(text) })}
          keyboardType="numeric"
          maxLength={2}
          style={{
            color: tokens.color.text.primary,
            borderColor: tokens.color.surface.border,
            backgroundColor: tokens.color.surface.background,
          }}
          className="rounded-xl border px-3 py-2.5 text-[13px] font-semibold w-16 text-center"
        />
        <Text style={{ color: tokens.color.text.primary }} className="text-base font-black mx-1.5">
          :
        </Text>
        <TextInput
          accessibilityLabel="Minute, from 0 to 59"
          value={String(minute).padStart(2, '0')}
          onChangeText={(text) =>
            onChange({ ...schedule, minute: text === '' ? null : Number(text) })
          }
          keyboardType="numeric"
          maxLength={2}
          style={{
            color: tokens.color.text.primary,
            borderColor: tokens.color.surface.border,
            backgroundColor: tokens.color.surface.background,
          }}
          className="rounded-xl border px-3 py-2.5 text-[13px] font-semibold w-16 text-center"
        />

        {/* §42: the zone is rendered next to the time, always. A schedule whose
            timezone is a screen away is a schedule somebody will misread. */}
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-bold ml-3 flex-1"
          numberOfLines={2}
        >
          {schedule.timezone.label}
        </Text>
      </View>

      {nextOccurrenceLabel ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={
            isAuthoritative
              ? `Next run: ${nextOccurrenceLabel}`
              : `If Diaspora could run this, the next time would be ${nextOccurrenceLabel}. This is an estimate.`
          }
          style={{ backgroundColor: tokens.color.surface.background }}
          className="rounded-xl px-3 py-2.5"
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            {/* §41: the client's estimate is never presented as the schedule. */}
            {isAuthoritative ? 'Next run' : 'Would be'}
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-bold mt-0.5"
          >
            {nextOccurrenceLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface EventOffsetEditorProps {
  schedule: AutomationSchedule;
  onChange: (schedule: AutomationSchedule) => void;
  nextOccurrenceLabel: string | null;
}

/** §12's offsets. A separate editor because the choice is one list, not four. */
function EventOffsetEditor({ schedule, onChange, nextOccurrenceLabel }: EventOffsetEditorProps) {
  const { tokens } = useTheme();
  const current = schedule.eventOffset?.minutesBefore ?? 60 * 24;

  const label = useMemo(
    () => (schedule.eventOffset ? describeOffset(schedule.eventOffset) : null),
    [schedule.eventOffset]
  );

  return (
    <View testID="automation-offset-editor">
      <View accessibilityRole="radiogroup" accessibilityLabel="How long before">
        {REMINDER_OFFSETS.map((offset) => (
          <OptionRow
            key={offset.minutes}
            label={offset.label}
            selected={current === offset.minutes}
            onPress={() =>
              onChange({
                ...schedule,
                eventOffset: { minutesBefore: offset.minutes, anchor: 'start' },
              })
            }
            testID={`automation-offset-${offset.minutes}`}
          />
        ))}
      </View>

      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`This runs ${label ?? ''} in ${schedule.timezone.label}`}
        style={{ backgroundColor: tokens.color.surface.background }}
        className="rounded-xl px-3 py-2.5 mt-1"
      >
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold leading-relaxed"
        >
          {label}
        </Text>
        {/* §42's whole point, in one line: the offset is in the *event's* zone,
            so it stays right if the member travels. */}
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {schedule.timezone.label}
        </Text>
        {nextOccurrenceLabel ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold mt-1"
          >
            {nextOccurrenceLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
