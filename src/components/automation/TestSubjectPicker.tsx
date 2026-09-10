// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what a test run is tested against (Phase 5, §35)
//
// ── Why a builder needs this at all ──────────────────────────────────────────
//
// `POST /automations/simulate` has carried a `sampleSubjectId` since it shipped,
// described as "an optional real subject to evaluate against, so a dry run
// borrows real state". No client ever sent one. So the platform built its
// trigger context with an empty values dictionary and answered every condition
// with *"This trigger does not carry the information the 'country' check
// needs"* — about triggers that carry it perfectly well.
//
// A member who added a condition and pressed Test was told, in effect, that
// their rule was impossible. The fix has two halves and this is the half a
// member can see: something has to name the subject.
//
// ── Why events only, for now ────────────────────────────────────────────────
//
// The platform answers for a subject through `IAutomationSubjectSource`, and
// Community Life is the module that implements one. A trigger about a listing
// or a job has no source yet, so this control does not appear for those — the
// same hidden-not-disabled rule the rest of this phase follows. A member is not
// shown a picker that cannot pick.
//
// ── What it does not do ─────────────────────────────────────────────────────
//
// **It does not decide whether the rule is good.** It shows what the rule would
// be checked against and leaves the reading to the member. The verdicts come
// from the platform, on the test, where they can be trusted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { useEvents } from '@/hooks/community-life';
import { useTriggerContext } from '@/hooks/automation';

/** The subject kinds a member can pick from today. */
const PICKABLE = new Set(['event']);

/**
 * Which kind a trigger is about, from its key.
 *
 * The client's own reading of the same rule the platform applies from the
 * catalogue's domain. Kept deliberately narrow: a prefix this does not know
 * yields null and the control stays hidden, which is the safe direction.
 */
export function subjectKindForTrigger(triggerKey: string | undefined): string | null {
  if (!triggerKey) return null;

  const domain = triggerKey.split('.')[0];

  return domain === 'event' ? 'event' : null;
}

export interface TestSubjectPickerProps {
  triggerKey: string | undefined;
  subjectId: string | null;
  onChange: (subjectId: string | null) => void;
}

export function TestSubjectPicker({
  triggerKey,
  subjectId,
  onChange,
}: TestSubjectPickerProps): React.ReactElement | null {
  const { tokens } = useTheme();
  const kind = subjectKindForTrigger(triggerKey);

  // Hooks run unconditionally; the render below is what is conditional. The
  // event query is inert when the control is not shown.
  const isPickable = kind !== null && PICKABLE.has(kind);
  const { events } = useEvents({ limit: 10 }, isPickable);
  const { context } = useTriggerContext(triggerKey, subjectId);

  const options = useMemo(
    () =>
      events
        .filter((event) => Boolean(event.id))
        .slice(0, 10)
        .map((event) => ({ id: event.id, title: event.title })),
    [events]
  );

  if (!isPickable || options.length === 0) {
    return null;
  }

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-semibold" style={{ color: tokens.color.text.primary }}>
        Test it against
      </Text>

      <Text className="mb-2 text-xs" style={{ color: tokens.color.text.secondary }}>
        Pick a real event and Diaspora will check your rule against it, so you can see
        whether it would have run.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
        {options.map((option) => {
          const isSelected = option.id === subjectId;

          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Test against ${option.title}`}
              onPress={() => onChange(isSelected ? null : option.id)}
              className="mx-1 rounded-full px-3 py-2"
              style={{
                backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                borderWidth: 1,
                borderColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.border,
              }}
            >
              <Text
                className="text-xs font-medium"
                numberOfLines={1}
                style={{ color: isSelected ? tokens.color.text.inverse : tokens.color.text.primary }}
              >
                {option.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {context ? (
        <View
          className="mt-3 rounded-lg p-3"
          style={{ backgroundColor: tokens.color.surface.card,
            borderWidth: 1,
            borderColor: tokens.color.surface.border }}
        >
          <View className="mb-1 flex-row items-center">
            <Ionicons
              name={context.isObservable ? 'eye-outline' : 'help-circle-outline'}
              size={14}
              color={tokens.color.text.secondary}
            />
            <Text className="ml-1 text-xs font-medium" style={{ color: tokens.color.text.primary }}>
              {context.summary}
            </Text>
          </View>

          {context.isObservable && context.answers.length > 0 ? (
            <Text className="text-xs" style={{ color: tokens.color.text.secondary }}>
              {/* The keys, not the values. A member wants to know their check
                  will be made; the figures belong on the test result, and the
                  sensitive ones are not sent here at all. */}
              Diaspora can check: {context.answers.join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
