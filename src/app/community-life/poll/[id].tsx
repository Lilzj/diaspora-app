// ─────────────────────────────────────────────────────────────────────────────
// A poll — viewing, voting, results (§22, §24)
//
// The flow: Poll → View → Vote → Confirmation → Results.
//
// Three rules the brief is emphatic about, and how this screen holds to them:
//
//   §24 — no client-side tallying. The vote mutation *returns the result*, and
//   that is what the confirmation renders. Nothing on this screen adds up an
//   option's votes, and `CommunityPoll` deliberately carries no per-option
//   count for it to try.
//
//   §22/§51 — "already voted" and "poll closed" are states, not errors. Both
//   arrive as `canVote: false` plus a `cannotVoteReason` the server wrote, and
//   both are rendered as an explanation rather than a failure.
//
//   §46 — accessible voting controls. `<PollBallot>` uses real radio and
//   checkbox roles; `<PollResults>` prints every count and percentage as text
//   beside its bar.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  CommunityStatusPanel,
  DetailRow,
  EmptyState,
  InlineRefusal,
  PeriodicUpdateNote,
  PollBallot,
  PollResults,
  PrimaryButton,
  SecondaryButton,
  Section,
  readableDate,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { usePoll, usePollAction, usePollResult, useSubmitPollResponse } from '@/hooks/community-life';
import { describePoll, pollAcceptsVotes } from '@/lib/community-state';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';
import type { PollResult } from '@/types/community-advanced';

export default function PollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { poll, isLoading, isError, error, refetch, isEnabled } = usePoll(id);
  const { result, isLoading: isLoadingResult } = usePollResult(
    id,
    poll ? pollAcceptsVotes(poll.status) : false
  );
  const vote = useSubmitPollResponse();
  const action = usePollAction();

  const [selected, setSelected] = useState<string[]>([]);
  const [openResponse, setOpenResponse] = useState('');
  const [justVoted, setJustVoted] = useState<PollResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (poll) {
      trackCommunityEvent('community.poll.viewed', {
        pollId: poll.pollId,
        organizationId: poll.organizationId ?? undefined,
        votingType: poll.votingType,
        audience: poll.audience,
        optionCount: poll.options.length,
      });
      // Pre-select whatever the member already chose, so changing a vote starts
      // from their existing answer rather than from blank.
      if (poll.myResponse) {
        setSelected(poll.myResponse.selectedOptionIds);
        setOpenResponse(poll.myResponse.openResponse ?? '');
      }
      if (poll.hasVoted) setShowResults(true);
    }
  }, [poll?.pollId]);

  const refusal = checkCommunityAccess(CommunityCapabilities.VotePoll, accountState, isAuthenticated);
  const state = describePoll(poll?.status ?? 'Draft');
  const displayedResult = justVoted ?? result;

  const canSubmit =
    poll?.votingType === 'OpenResponse' ? openResponse.trim().length > 0 : selected.length > 0;

  const onVote = () => {
    if (!poll) return;

    vote.mutate(
      {
        pollId: poll.pollId,
        selectedOptionIds: selected,
        openResponse: openResponse.trim() || undefined,
      },
      {
        onSuccess: (returned) => {
          // The *server's* result, rendered. Not a locally-adjusted tally.
          setJustVoted(returned);
          setShowResults(true);
          trackCommunityEvent('community.poll.voted', {
            pollId: poll.pollId,
            votingType: poll.votingType,
            selectionCount: selected.length,
            organizationId: poll.organizationId ?? undefined,
          });
        },
      }
    );
  };

  return (
    <CommunityScreen
      title="Community poll"
      subtitle={poll?.organizationName ?? undefined}
      gapKey="polls"
      gapDetail="Polls, voting and results are simulated. Diaspora's backend has no poll aggregate, so one-member-one-vote cannot be enforced for real yet — which is exactly why the tally is never worked out on your device."
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      footer={
        poll && !showResults ? (
          <View>
            {vote.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={vote.error as FinancialError} />
              </View>
            ) : null}
            {poll.canVote ? (
              <PrimaryButton
                label={poll.hasVoted ? 'Change my vote' : 'Submit my vote'}
                icon="checkmark-circle-outline"
                busy={vote.isPending}
                disabled={vote.isPending || !canSubmit || !refusal.allowed}
                accessibilityHint={
                  !refusal.allowed
                    ? refusal.message
                    : canSubmit
                      ? 'Sends your vote'
                      : 'Choose an answer first'
                }
                onPress={onVote}
              />
            ) : (
              <InlineRefusal
                icon="information-circle-outline"
                reason={poll.cannotVoteReason ?? state.detail}
              />
            )}
          </View>
        ) : null
      }
    >
      {!poll ? (
        <EmptyState
          icon="bar-chart-outline"
          title="Poll not found"
          body="It may have been closed or you may not be in its audience."
        />
      ) : (
        <View className="px-5 pt-4">
          {/* Confirmation, immediately after voting */}
          {justVoted ? (
            <View className="mb-4">
              <InlineRefusal
                icon="checkmark-circle-outline"
                reason="Your vote has been counted. The results below are what Diaspora has recorded, not a total worked out on your phone."
              />
            </View>
          ) : null}

          <View className="flex-row items-center mb-3">
            <CommunityStatusPanel state={state} />
          </View>

          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-lg font-black tracking-tight leading-snug mt-3"
          >
            {poll.question}
          </Text>

          {poll.description ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-sm font-semibold leading-relaxed mt-2"
            >
              {poll.description}
            </Text>
          ) : null}

          <View className="flex-row items-center mt-3 flex-wrap">
            <View className="flex-row items-center mr-4 mb-1">
              <Ionicons name="people-outline" size={13} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold ml-1"
              >
                {poll.totalResponses.toLocaleString()} responses
              </Text>
            </View>
            {poll.isAnonymous ? (
              <View className="flex-row items-center mr-4 mb-1">
                <Ionicons name="eye-off-outline" size={13} color={tokens.color.text.placeholder} />
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-bold ml-1"
                >
                  Anonymous
                </Text>
              </View>
            ) : null}
            {poll.closesAt ? (
              <View className="flex-row items-center mb-1">
                <Ionicons name="time-outline" size={13} color={tokens.color.text.placeholder} />
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-bold ml-1"
                >
                  Closes {readableDate(poll.closesAt)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Ballot or results */}
          <View className="mt-5">
            {showResults ? (
              <>
                {isLoadingResult && !displayedResult ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-xs font-semibold"
                  >
                    Loading results…
                  </Text>
                ) : displayedResult ? (
                  <>
                    <PollResults result={displayedResult} poll={poll} />
                    {pollAcceptsVotes(poll.status) ? (
                      <PeriodicUpdateNote what="These results" />
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    icon="bar-chart-outline"
                    title="No results yet"
                    body="Nobody has voted in this poll."
                  />
                )}

                {poll.canVote ? (
                  <View className="mt-5">
                    <SecondaryButton
                      label={poll.hasVoted ? 'Change my vote' : 'Vote'}
                      icon="create-outline"
                      onPress={() => {
                        setShowResults(false);
                        setJustVoted(null);
                      }}
                    />
                  </View>
                ) : null}
              </>
            ) : (
              <PollBallot
                poll={poll}
                selected={selected}
                onChange={setSelected}
                openResponse={openResponse}
                onOpenResponseChange={setOpenResponse}
              />
            )}
          </View>

          {/* How this poll works */}
          <Section title="About this poll" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <DetailRow
                  label="Answering"
                  icon="list-outline"
                  value={
                    poll.votingType === 'MultipleChoice'
                      ? `Choose up to ${poll.maxSelections ?? poll.options.length}`
                      : poll.votingType === 'OpenResponse'
                        ? 'Written answer'
                        : 'Choose one'
                  }
                />
                <DetailRow
                  label="Who can vote"
                  icon="people-outline"
                  value={
                    poll.audience === 'OrganizationMembers'
                      ? 'Members of the organisation'
                      : poll.audience === 'Neighborhood'
                        ? 'People in the neighbourhood'
                        : poll.audience === 'Country'
                          ? 'Everyone in the country'
                          : poll.audience === 'Invited'
                            ? 'Invited people only'
                            : 'Anyone'
                  }
                />
                <DetailRow
                  label="Changing your mind"
                  icon="swap-horizontal-outline"
                  value={poll.allowsChange ? 'You can change your vote' : 'One vote, final'}
                />
                <DetailRow
                  label="Your name"
                  icon="eye-outline"
                  value={poll.isAnonymous ? 'Not recorded with your answer' : 'Visible to the organiser'}
                />
              </Card>
            </View>
          </Section>

          {/* Organizer controls */}
          {poll.canManage ? (
            <View className="mt-6">
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black tracking-tight mb-3"
              >
                Manage
              </Text>

              {poll.status === 'Draft' ? (
                <PrimaryButton
                  label="Open this poll"
                  icon="megaphone-outline"
                  busy={action.isPending}
                  onPress={() => action.mutate({ pollId: poll.pollId, action: 'publish' })}
                />
              ) : null}

              {poll.status === 'Open' ? (
                <SecondaryButton
                  label="Close voting"
                  icon="lock-closed-outline"
                  disabled={action.isPending}
                  onPress={() => {
                    trackCommunityEvent('community.poll.closed', {
                      pollId: poll.pollId,
                      organizationId: poll.organizationId ?? undefined,
                    });
                    action.mutate({ pollId: poll.pollId, action: 'close' });
                  }}
                />
              ) : null}

              {poll.status === 'Closed' ? (
                <PrimaryButton
                  label="Publish the results"
                  icon="bar-chart-outline"
                  busy={action.isPending}
                  onPress={() => action.mutate({ pollId: poll.pollId, action: 'publish-results' })}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </CommunityScreen>
  );
}
