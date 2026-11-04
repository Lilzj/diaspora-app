// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Poll voting and results (Frontend Phase 12)
//
// §46 asks for "accessible voting controls", and voting is the surface where
// getting accessibility wrong actually disenfranchises somebody. Four decisions
// here follow from that:
//
//   **Options are radios or checkboxes, not styled views.** A single-choice
//   poll uses `accessibilityRole="radio"` inside a `radiogroup`; a
//   multiple-choice poll uses `checkbox`. A screen reader then announces
//   "selected" and "not selected" and the relationship between the options,
//   which a `Pressable` with a coloured border does not.
//
//   **The selection limit is announced, not just enforced.** On a poll that
//   takes two answers, the third tap is refused — and the hint says so before
//   the member tries.
//
//   **Results are bars with numbers, never bars alone.** Every result row
//   carries the count and the percentage in text. §46 forbids colour-only
//   communication, and a bar chart with no numbers is exactly that.
//
//   **Nothing here computes a result.** `PollResults` renders
//   `PollOptionResult.count` and `.percentage` as given. There is no arithmetic
//   in this file — §24 — and a `PollResult` with `options: null` renders the
//   server's "not yet" rather than an empty chart the member would read as
//   "nobody voted".
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityPoll, PollOption, PollResult } from '@/types/community-advanced';
import { ProgressBar } from './CommunityPrimitives';

// ─────────────────────────────────────────────────────────────────────────────
// Voting
// ─────────────────────────────────────────────────────────────────────────────

export function PollOptionControl({
  option,
  isSelected,
  isMultiple,
  isDisabled,
  disabledHint,
  onToggle,
  index,
  total,
}: {
  option: PollOption;
  isSelected: boolean;
  isMultiple: boolean;
  isDisabled: boolean;
  disabledHint?: string;
  onToggle: () => void;
  index: number;
  total: number;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole={isMultiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      accessibilityLabel={`${option.label}${option.description ? `. ${option.description}` : ''}`}
      accessibilityHint={isDisabled ? disabledHint : `Option ${index + 1} of ${total}`}
      disabled={isDisabled}
      onPress={onToggle}
      style={({ pressed }) => ({
        backgroundColor: isSelected ? tokens.color.neutral[100] : tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
        opacity: isDisabled ? tokens.opacity.disabled : pressed ? 0.8 : 1,
        minHeight: 56,
      })}
      className="rounded-2xl px-4 py-3.5 mb-2.5 flex-row items-center"
    >
      {/*
        The control glyph. A filled circle for a chosen radio and a ticked box
        for a chosen checkbox — the *shape* differs, so the difference between
        "one of these" and "any of these" survives for somebody who cannot see
        the accent colour.
      */}
      <Ionicons
        name={
          isMultiple
            ? isSelected
              ? 'checkbox'
              : 'square-outline'
            : isSelected
              ? 'radio-button-on'
              : 'radio-button-off'
        }
        size={22}
        color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
      />

      <View className="flex-1 ml-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-bold leading-snug"
        >
          {option.label}
        </Text>
        {option.description ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold mt-0.5 leading-relaxed"
          >
            {option.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function PollBallot({
  poll,
  selected,
  onChange,
  openResponse,
  onOpenResponseChange,
}: {
  poll: CommunityPoll;
  selected: string[];
  onChange: (next: string[]) => void;
  openResponse: string;
  onOpenResponseChange: (next: string) => void;
}) {
  const { tokens } = useTheme();
  const isMultiple = poll.votingType === 'MultipleChoice';
  const limit = poll.maxSelections ?? poll.options.length;
  const atLimit = isMultiple && selected.length >= limit;

  if (poll.votingType === 'OpenResponse') {
    return (
      <View>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mb-2"
          nativeID="poll-open-label"
        >
          Your answer
        </Text>
        <TextInput
          accessibilityLabel="Your answer to this poll"
          accessibilityHint={
            poll.isAnonymous
              ? 'Your answer is anonymous. Nobody will see who wrote it.'
              : 'Your name will be shown with your answer.'
          }
          editable={poll.canVote}
          multiline
          numberOfLines={5}
          value={openResponse}
          onChangeText={onOpenResponseChange}
          placeholder="Write as much or as little as you like"
          placeholderTextColor={tokens.color.text.placeholder}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
            color: tokens.color.text.primary,
            minHeight: 120,
            textAlignVertical: 'top',
          }}
          className="rounded-2xl border px-4 py-3 text-sm font-semibold"
        />
      </View>
    );
  }

  return (
    <View
      /*
        The group, not an element. `accessible` stays **false** deliberately: a
        `radiogroup` marked accessible collapses its children into one node, and
        a screen reader would then announce the question and offer no way to
        reach the individual options. The role and label give the grouping
        semantics; the options underneath stay individually focusable.
      */
      accessibilityRole={isMultiple ? undefined : 'radiogroup'}
      accessibilityLabel={poll.question}
      testID="poll-ballot-group"
    >
      {isMultiple ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mb-2.5"
          accessibilityRole="text"
        >
          Choose up to {limit}. {selected.length} of {limit} chosen.
        </Text>
      ) : null}

      {poll.options.map((option, index) => {
        const isSelected = selected.includes(option.optionId);
        // A poll at its selection limit disables only the *unchosen* options,
        // so a member can always change their mind by deselecting first.
        const isDisabled = !poll.canVote || (atLimit && !isSelected);

        return (
          <PollOptionControl
            key={option.optionId}
            option={option}
            index={index}
            total={poll.options.length}
            isSelected={isSelected}
            isMultiple={isMultiple}
            isDisabled={isDisabled}
            disabledHint={
              !poll.canVote
                ? (poll.cannotVoteReason ?? 'Voting is closed.')
                : `You have already chosen ${limit} options. Deselect one to choose this instead.`
            }
            onToggle={() => {
              if (!isMultiple) {
                onChange([option.optionId]);
                return;
              }
              onChange(
                isSelected
                  ? selected.filter((id) => id !== option.optionId)
                  : [...selected, option.optionId]
              );
            }}
          />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A poll's results.
 *
 * Renders `result.options` exactly as the server sent them. When `options` is
 * null the poll is withholding results and this says so — rather than drawing
 * an empty chart, which a member would reasonably read as "nobody has voted".
 */
export function PollResults({ result, poll }: { result: PollResult; poll: CommunityPoll }) {
  const { tokens } = useTheme();

  if (!result.areResultsVisible || !result.options) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={result.resultsHiddenReason ?? 'Results are not published yet.'}
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="rounded-2xl p-4 items-center"
      >
        <Ionicons name="lock-closed-outline" size={20} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold text-center mt-2 leading-relaxed"
        >
          {result.resultsHiddenReason ?? 'Results are published when this poll closes.'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {result.options.map((option) => (
        <View key={option.optionId} className="mb-4">
          <View className="flex-row items-center justify-between mb-1.5">
            <View className="flex-row items-center flex-1 pr-3">
              {option.isMyChoice ? (
                <Ionicons
                  name="checkmark-circle"
                  size={13}
                  color={tokens.color.primary[500]}
                  style={{ marginRight: 5 }}
                  accessibilityLabel="Your choice"
                />
              ) : null}
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-bold flex-1"
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </View>

            {/*
              The number is always present in text beside the bar. §46: no
              colour-only or length-only communication.
            */}
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black tracking-tight"
            >
              {option.percentage}%
            </Text>
          </View>

          <ProgressBar
            percentage={option.percentage}
            label={`${option.label}: ${option.count} ${option.count === 1 ? 'vote' : 'votes'}, ${option.percentage} per cent${option.isMyChoice ? '. This was your choice.' : ''}`}
            tone={option.isMyChoice ? 'positive' : 'progress'}
            height={10}
          />

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold mt-1"
          >
            {option.count.toLocaleString()} {option.count === 1 ? 'vote' : 'votes'}
          </Text>
        </View>
      ))}

      <View
        className="flex-row items-center pt-2"
        style={{ borderTopWidth: 1, borderTopColor: tokens.color.border.default }}
      >
        <Ionicons name="people-outline" size={13} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold ml-1.5"
        >
          {result.totalResponses.toLocaleString()}{' '}
          {result.totalResponses === 1 ? 'response' : 'responses'}
          {poll.isAnonymous ? ' · anonymous poll' : ''}
        </Text>
      </View>

      {result.openResponses && result.openResponses.length > 0 ? (
        <View className="mt-5">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black tracking-tight mb-2.5"
          >
            What people wrote
          </Text>
          {result.openResponses.map((response, index) => (
            <View
              key={`${index}-${response.slice(0, 12)}`}
              style={{ backgroundColor: tokens.color.surface.elevated }}
              className="rounded-xl p-3 mb-2"
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Response ${index + 1}: ${response}`}
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                {response}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
