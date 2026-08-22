// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — A post's poll (Wave D-2b)
//
// One rule governs this file, and it is the reason it is a file rather than
// twenty lines inside the card:
//
//   **`voteCount`, `sharePercent` and `totalVotes` are `null` — not `0` — while
//   results are hidden.**
//
// `0` means "nobody chose this". `null` means "you are not allowed to know
// yet". A component that coalesced them with `?? 0` would draw a bar chart of
// flat zeros over a poll with twenty-five votes in it, and the member's only
// reasonable conclusion is that the count is broken.
//
// So every number on this component is read through `arePollResultsHidden`
// first, and the hidden state renders words rather than figures. There is no
// `?? 0` anywhere below and there must not be one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

import { arePollResultsHidden } from '@/lib/community-social-api';
import type { PollResponse } from '@/types/community-social';

interface PollBlockProps {
  poll: PollResponse;
  /** Absent on a card that only displays; present on the detail screen. */
  onVote?: (optionIds: string[]) => void;
  isVoting?: boolean;
  error?: string | null;
}

/**
 * Why the numbers are missing, in the poll's own terms.
 *
 * The member is not being refused — they are being told when. `afterVoting`
 * and `afterClose` are different promises and saying which one applies is what
 * makes a poll with no numbers on it explicable rather than broken.
 */
function hiddenReason(poll: PollResponse): string {
  if (poll.resultVisibility === 'afterVoting') return 'Results appear once you vote.';
  if (poll.resultVisibility === 'afterClose') return 'Results appear when the poll closes.';
  return 'Results are hidden for now.';
}

export function PollBlock({ poll, onVote, isVoting = false, error = null }: PollBlockProps) {
  // Multi-choice polls collect a set before submitting; single-choice ones
  // submit on the tap, because a "confirm" step for one radio button is a step
  // that exists only to be dismissed.
  const [pending, setPending] = useState<string[]>([]);

  const resultsHidden = arePollResultsHidden(poll);
  const canVote = Boolean(onVote) && !poll.isClosed && !poll.hasVoted;

  const toggle = (optionId: string) => {
    if (!canVote || !onVote) return;

    if (!poll.allowsMultiple) {
      onVote([optionId]);
      return;
    }

    setPending((current) =>
      current.includes(optionId)
        ? current.filter((entry) => entry !== optionId)
        : [...current, optionId]
    );
  };

  return (
    <View className="bg-surface-background border border-faint rounded-2xl p-4 mt-3">
      <Text className="text-sm font-black text-content-strong leading-snug mb-1">
        {poll.question}
      </Text>

      <Text className="text-[10px] font-bold text-content-faint uppercase tracking-wider mb-3">
        {poll.allowsMultiple ? 'Choose as many as you like' : 'Choose one'}
        {poll.isClosed ? ' · Closed' : ''}
      </Text>

      {poll.options.map((option) => {
        const chosen = poll.selectedOptionIds.includes(option.optionId);
        const staged = pending.includes(option.optionId);
        const highlighted = chosen || staged;

        return (
          <TouchableOpacity
            key={option.optionId}
            accessible
            accessibilityRole={poll.allowsMultiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: highlighted, disabled: !canVote }}
            accessibilityLabel={
              // The label says the count or says why there is not one. It never
              // says "0 votes" for a poll that is simply withholding them.
              resultsHidden || option.voteCount === null
                ? `${option.label}. Results hidden.`
                : `${option.label}. ${option.voteCount} ${option.voteCount === 1 ? 'vote' : 'votes'}.`
            }
            disabled={!canVote}
            onPress={() => toggle(option.optionId)}
            activeOpacity={0.85}
            className={`rounded-xl border px-3 py-2.5 mb-2 ${
              highlighted ? 'bg-primary-50 border-primary-200' : 'bg-surface-card border-subtle'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className={`text-xs font-bold flex-1 mr-3 ${
                  highlighted ? 'text-primary-600' : 'text-content-secondary'
                }`}
              >
                {highlighted ? '● ' : '○ '}
                {option.label}
              </Text>

              {/* The whole point of this file. `sharePercent === null` is not
                  zero per cent, so nothing is drawn at all. */}
              {option.sharePercent !== null ? (
                <Text className="text-[10px] font-black text-content-muted">
                  {option.sharePercent}%
                </Text>
              ) : null}
            </View>

            {option.sharePercent !== null ? (
              <View className="h-1.5 bg-subtle rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-primary-500"
                  style={{ width: `${Math.max(0, Math.min(100, option.sharePercent))}%` }}
                />
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {poll.allowsMultiple && canVote ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Submit your choices"
          accessibilityState={{ disabled: pending.length === 0 || isVoting }}
          disabled={pending.length === 0 || isVoting}
          onPress={() => onVote?.(pending)}
          className={`mt-1 py-2.5 rounded-xl items-center ${
            pending.length === 0 || isVoting ? 'bg-surface-muted' : 'bg-primary-500'
          }`}
        >
          {isVoting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text
              className={`text-xs font-black ${
                pending.length === 0 ? 'text-content-faint' : 'text-white'
              }`}
            >
              Submit
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* The total, or the reason there is not one. `totalVotes === null` is
          what `arePollResultsHidden` reads, and it can still be null on the
          answer to this member's own vote: a poll with `afterClose` hides its
          counts from the person who just voted in it. */}
      <Text className="text-[10px] font-bold text-content-faint mt-2">
        {resultsHidden || poll.totalVotes === null
          ? hiddenReason(poll)
          : `${poll.totalVotes} ${poll.totalVotes === 1 ? 'vote' : 'votes'}`}
      </Text>

      {error ? (
        <Text className="text-[10px] font-bold text-error-default mt-1.5">{error}</Text>
      ) : null}
    </View>
  );
}
