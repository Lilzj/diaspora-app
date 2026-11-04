// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Milestone, challenge and grant cards (Frontend Phase 7)
//
// §22 and §23 both say the same thing in different words: milestones and
// challenges are *data*, and there must not be a component per milestone or a
// switch statement per challenge rule. So there are exactly three components
// here, each renders whatever the repository returned, and adding a new
// milestone to the platform requires no frontend change at all.
//
// The thing worth noticing in all three: the primary action is decided by the
// served state, and the disabled reason is the server's sentence rather than a
// generic one. A challenge the member cannot join says *why* — "hosting events
// needs a verified organisation" — because "unavailable" is not an answer
// anybody can act on.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { AmountDisplay } from '@/components/financial';
import {
  formatPoints,
  presentChallengeState,
  presentGrantApplicationState,
  presentMilestoneState,
} from '@/lib/creator-economy';
import { servedIcon } from '@/lib/served-icon';
import { formatRelativeTime } from '@/utils/format';
import { CreatorCard, CreatorProgressBar, CreatorStatusChip, useToneColours } from './CreatorPrimitives';
import type {
  CommunityGrant,
  CreatorChallenge,
  CreatorMilestone,
  CreatorMilestoneReward,
  GrantApplication,
} from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// Reward
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What completing something pays.
 *
 * Branches on `kind` so a points reward renders as a count with its unit and a
 * money reward goes through `AmountDisplay`. The two are never interchangeable
 * — that is the whole reason `CreatorMilestoneReward` has separate `points` and
 * `amount` fields rather than one `value`.
 */
export function RewardPill({ reward }: { reward: CreatorMilestoneReward }) {
  const colours = useToneColours('brand');

  return (
    <View
      accessible
      accessibilityLabel={`Reward: ${reward.label}`}
      style={{ backgroundColor: colours.bg }}
      className="flex-row items-center self-start rounded-full px-2.5 py-1"
    >
      <Ionicons
        name={
          reward.kind === 'money'
            ? 'cash-outline'
            : reward.kind === 'badge'
              ? 'ribbon-outline'
              : 'sparkles-outline'
        }
        size={12}
        color={colours.fg}
      />

      {reward.kind === 'money' && reward.amount ? (
        <View className="ml-1">
          <AmountDisplay value={reward.amount} size="small" />
        </View>
      ) : (
        <Text style={{ color: colours.fg }} className="text-[10px] font-black ml-1">
          {reward.kind === 'points' && typeof reward.points === 'number'
            ? formatPoints(reward.points)
            : reward.label}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone
// ─────────────────────────────────────────────────────────────────────────────

export function MilestoneCard({
  milestone,
  onClaim,
  isClaiming,
  canClaim = true,
  claimBlockedReason,
}: {
  milestone: CreatorMilestone;
  onClaim?: (milestone: CreatorMilestone) => void;
  isClaiming?: boolean;
  canClaim?: boolean;
  claimBlockedReason?: string;
}) {
  const { tokens } = useTheme();
  const presentation = presentMilestoneState(milestone.state);
  const isClaimable = milestone.state === 'Completed';
  const isLocked = milestone.state === 'Locked' || milestone.state === 'Expired';

  return (
    <CreatorCard
      accessibilityLabel={`${milestone.title}. ${presentation.description} ${milestone.description}`}
      style={{ opacity: isLocked ? 0.6 : 1, marginBottom: 12 }}
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
        >
          <Text className="text-xl">{servedIcon(milestone.icon, '🎯')}</Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-black tracking-tight flex-1 mr-2"
              numberOfLines={2}
            >
              {milestone.title}
            </Text>
            <CreatorStatusChip presentation={presentation} size="small" />
          </View>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium mt-1 leading-relaxed"
          >
            {milestone.description}
          </Text>
        </View>
      </View>

      {milestone.state !== 'Claimed' && milestone.state !== 'Locked' ? (
        <View className="mt-3.5">
          <CreatorProgressBar
            progress={milestone.progress}
            subject={milestone.title}
            tone={isClaimable ? 'success' : 'brand'}
          />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-3.5">
        {milestone.reward ? <RewardPill reward={milestone.reward} /> : <View />}

        {isClaimable && onClaim ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              canClaim
                ? `Claim ${milestone.reward?.label ?? 'your reward'} for ${milestone.title}`
                : (claimBlockedReason ?? 'You cannot claim this yet')
            }
            accessibilityState={{ disabled: !canClaim || Boolean(isClaiming), busy: Boolean(isClaiming) }}
            disabled={!canClaim || isClaiming}
            onPress={() => onClaim(milestone)}
            style={{
              backgroundColor: canClaim ? tokens.color.success.default : tokens.color.neutral[200],
            }}
            className="rounded-full px-4 py-2"
          >
            <Text
              style={{ color: canClaim ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-[10px] font-black uppercase tracking-wider"
            >
              {isClaiming ? 'Claiming…' : 'Claim'}
            </Text>
          </Pressable>
        ) : milestone.claimedAt ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold"
          >
            Claimed {formatRelativeTime(milestone.claimedAt)}
          </Text>
        ) : null}
      </View>

      {isClaimable && !canClaim && claimBlockedReason ? (
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[11px] font-semibold mt-2 leading-relaxed"
        >
          {claimBlockedReason}
        </Text>
      ) : null}
    </CreatorCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge
// ─────────────────────────────────────────────────────────────────────────────

export function ChallengeCard({
  challenge,
  onPress,
  compact = false,
}: {
  challenge: CreatorChallenge;
  onPress: (challenge: CreatorChallenge) => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const presentation = presentChallengeState(challenge.state);

  const completedTasks = challenge.tasks.filter((task) => task.isComplete).length;
  const deadline = challenge.endsAt ? formatRelativeTime(challenge.endsAt) : null;

  return (
    <CreatorCard
      onPress={() => onPress(challenge)}
      accessibilityLabel={[
        challenge.title,
        presentation.description,
        challenge.description,
        `${completedTasks} of ${challenge.tasks.length} tasks done.`,
        challenge.reward ? `Reward: ${challenge.reward.label}.` : null,
        deadline ? `Ends ${deadline}.` : null,
        challenge.isEligible ? null : challenge.ineligibleReason,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginBottom: 12, opacity: challenge.isEligible ? 1 : 0.75 }}
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
        >
          <Text className="text-xl">{servedIcon(challenge.icon, '🏁')}</Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-black tracking-tight flex-1 mr-2"
              numberOfLines={2}
            >
              {challenge.title}
            </Text>
            <CreatorStatusChip presentation={presentation} size="small" />
          </View>

          {!compact ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-medium mt-1 leading-relaxed"
              numberOfLines={2}
            >
              {challenge.description}
            </Text>
          ) : null}
        </View>
      </View>

      {challenge.state !== 'Open' && challenge.state !== 'Upcoming' ? (
        <View className="mt-3.5">
          <CreatorProgressBar
            progress={challenge.progress}
            subject={challenge.title}
            tone={challenge.state === 'Completed' || challenge.state === 'Claimed' ? 'success' : 'brand'}
          />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-3.5">
        <View className="flex-row items-center flex-1 mr-2">
          {challenge.reward ? <RewardPill reward={challenge.reward} /> : null}
        </View>

        <View className="flex-row items-center">
          {challenge.participantCount ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold mr-3"
            >
              {challenge.participantCount.toLocaleString()} taking part
            </Text>
          ) : null}
          {deadline ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-black"
            >
              Ends {deadline}
            </Text>
          ) : null}
        </View>
      </View>

      {!challenge.isEligible && challenge.ineligibleReason ? (
        <View
          style={{ backgroundColor: tokens.color.warning.surface }}
          className="rounded-xl p-2.5 mt-3 flex-row items-start"
        >
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={tokens.color.warning.default}
            style={{ marginTop: 1 }}
          />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[11px] font-semibold ml-1.5 flex-1 leading-relaxed"
          >
            {challenge.ineligibleReason}
          </Text>
        </View>
      ) : null}
    </CreatorCard>
  );
}

/** One task inside a challenge. Its own component because it has an action. */
export function ChallengeTaskRow({
  task,
  onAction,
}: {
  task: CreatorChallenge['tasks'][number];
  onAction?: (route: string) => void;
}) {
  const { tokens } = useTheme();
  const colours = useToneColours(task.isComplete ? 'success' : 'neutral');

  return (
    <View
      accessible
      accessibilityLabel={`${task.label}. ${task.isComplete ? 'Done.' : 'Not done yet.'}${
        task.progress ? ` ${task.progress.current} of ${task.progress.target}.` : ''
      }`}
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-start border-b py-3"
    >
      <View
        style={{ backgroundColor: colours.bg }}
        className="w-6 h-6 rounded-full items-center justify-center mr-3 mt-0.5"
      >
        <Ionicons name={task.isComplete ? 'checkmark' : 'ellipse-outline'} size={13} color={colours.fg} />
      </View>

      <View className="flex-1">
        <Text
          style={{
            color: tokens.color.text.primary,
            textDecorationLine: task.isComplete ? 'line-through' : 'none',
          }}
          className="text-[13px] font-bold leading-snug"
        >
          {task.label}
        </Text>

        {task.description ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium mt-0.5 leading-relaxed"
          >
            {task.description}
          </Text>
        ) : null}

        {task.progress && !task.isComplete ? (
          <View className="mt-2">
            <CreatorProgressBar
              progress={task.progress}
              subject={task.label}
              showFigures
              height={4}
            />
          </View>
        ) : null}

        {!task.isComplete && task.actionRoute && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${task.actionLabel ?? 'Open'}: ${task.label}`}
            onPress={() => onAction(task.actionRoute!)}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="self-start rounded-full px-3 py-1.5 mt-2.5"
          >
            <Text className="text-white text-[10px] font-black uppercase tracking-wider">
              {task.actionLabel ?? 'Open'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grant
// ─────────────────────────────────────────────────────────────────────────────

export function GrantCard({
  grant,
  onPress,
}: {
  grant: CommunityGrant;
  onPress: (grant: CommunityGrant) => void;
}) {
  const { tokens } = useTheme();
  const isClosingSoon = grant.state === 'ClosingSoon';
  const deadline = grant.deadlineAt ? formatRelativeTime(grant.deadlineAt) : null;
  const metCount = grant.requirements.filter((requirement) => requirement.isMet).length;

  return (
    <CreatorCard
      onPress={() => onPress(grant)}
      accessibilityLabel={[
        grant.title,
        grant.summary,
        `Up to ${grant.fundingAmount.currency} ${grant.fundingAmount.amount.toFixed(0)}.`,
        `${metCount} of ${grant.requirements.length} requirements met.`,
        deadline ? `Deadline ${deadline}.` : null,
        grant.applicationState ? `You have applied. Status: ${grant.applicationState}.` : null,
        grant.isEligible ? null : grant.ineligibleReason,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginBottom: 12 }}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            style={{ color: tokens.color.primary[500] }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            {grant.category}
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={2}
          >
            {grant.title}
          </Text>
        </View>

        <View className="items-end">
          <AmountDisplay value={grant.fundingAmount} size="medium" />
          {grant.fundingMinimum ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-bold mt-0.5"
            >
              up to
            </Text>
          ) : null}
        </View>
      </View>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-medium leading-relaxed"
        numberOfLines={2}
      >
        {grant.summary}
      </Text>

      <View className="flex-row items-center justify-between mt-3.5">
        <View className="flex-row items-center">
          <Ionicons
            name={metCount === grant.requirements.length ? 'checkmark-circle' : 'ellipse-outline'}
            size={13}
            color={
              metCount === grant.requirements.length
                ? tokens.color.success.default
                : tokens.color.text.placeholder
            }
          />
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-bold ml-1"
          >
            {metCount}/{grant.requirements.length} requirements
          </Text>
        </View>

        {deadline ? (
          <Text
            style={{ color: isClosingSoon ? tokens.color.warning.default : tokens.color.text.secondary }}
            className="text-[10px] font-black"
          >
            {isClosingSoon ? '⏳ ' : ''}
            Closes {deadline}
          </Text>
        ) : null}
      </View>

      {grant.applicationState ? (
        <View className="mt-3">
          <CreatorStatusChip
            presentation={presentGrantApplicationState(grant.applicationState)}
            size="small"
          />
        </View>
      ) : null}

      {!grant.isEligible && grant.ineligibleReason ? (
        <View
          style={{ backgroundColor: tokens.color.warning.surface }}
          className="rounded-xl p-2.5 mt-3 flex-row items-start"
        >
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={tokens.color.warning.default}
            style={{ marginTop: 1 }}
          />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[11px] font-semibold ml-1.5 flex-1 leading-relaxed"
          >
            {grant.ineligibleReason}
          </Text>
        </View>
      ) : null}
    </CreatorCard>
  );
}

export function GrantApplicationCard({
  application,
  onPress,
}: {
  application: GrantApplication;
  onPress: (application: GrantApplication) => void;
}) {
  const { tokens } = useTheme();
  const presentation = presentGrantApplicationState(application.state);
  const needsResponse = application.state === 'MoreInformationRequested';

  return (
    <CreatorCard
      onPress={() => onPress(application)}
      accessibilityLabel={[
        application.grantTitle,
        presentation.description,
        application.submittedAt ? `Submitted ${formatRelativeTime(application.submittedAt)}.` : null,
        needsResponse && application.respondByAt
          ? `Respond by ${formatRelativeTime(application.respondByAt)}.`
          : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginBottom: 12 }}
    >
      <View className="flex-row items-start justify-between">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black tracking-tight flex-1 mr-2"
          numberOfLines={2}
        >
          {application.grantTitle}
        </Text>
        <CreatorStatusChip presentation={presentation} size="small" />
      </View>

      {application.awardedAmount ? (
        <View className="mt-2.5">
          <AmountDisplay value={application.awardedAmount} size="medium" tone="credit" />
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold mt-0.5"
          >
            awarded
          </Text>
        </View>
      ) : null}

      {application.submittedAt ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2"
        >
          Submitted {formatRelativeTime(application.submittedAt)}
        </Text>
      ) : null}

      {needsResponse ? (
        <View
          style={{ backgroundColor: tokens.color.warning.surface }}
          className="rounded-xl p-3 mt-3"
        >
          <Text
            style={{ color: tokens.color.warning.default }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            They need more from you
          </Text>
          {(application.informationRequested ?? []).map((item, index) => (
            <Text
              key={index}
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-semibold leading-relaxed"
            >
              • {item}
            </Text>
          ))}
          {application.respondByAt ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-black mt-1.5"
            >
              Respond by {formatRelativeTime(application.respondByAt)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {application.reports.length > 0 ? (
        <View className="mt-3">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-black uppercase tracking-widest mb-1.5"
          >
            Reporting
          </Text>
          {application.reports.map((report) => (
            <View key={report.reportId} className="flex-row items-center justify-between py-1">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[11px] font-semibold flex-1 mr-2"
                numberOfLines={1}
              >
                {report.title}
              </Text>
              <Text
                style={{
                  color:
                    report.state === 'Overdue'
                      ? tokens.color.error.default
                      : report.state === 'Accepted'
                        ? tokens.color.success.default
                        : tokens.color.text.placeholder,
                }}
                className="text-[10px] font-black"
              >
                {report.state}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </CreatorCard>
  );
}
