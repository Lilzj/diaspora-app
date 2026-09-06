// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life cards (Frontend Phase 12)
//
// One card per domain object, each one an accessible button whose label reads
// as a sentence rather than as a pile of fragments. The rule throughout: a
// screen reader user should hear what a sighted user sees in one glance —
// "Repatriation fund for the Adeyemi family, 54 per cent of £4,000 raised, 67
// supporters, 21 days left" — not "Repatriation fund. 54. 4000. 67. 21."
//
// Two things every card holds to:
//
//   **A capacity or a total is never computed here.** `isFull`, `percentage`
//   and `supporterCount` all arrive decided. §17 and §51.
//
//   **State is an icon and a word.** No card communicates status with colour
//   alone. §46.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from '@/components/financial';
import {
  describeCampaign,
  describeMembership,
  describeOccurrence,
  describePoll,
  describeSeries,
  describeVolunteerApplication,
  isOrganiserOnlyCampaignState,
} from '@/lib/community-state';
import type {
  CommunityAnnouncement,
  CommunityMembership,
  CommunityPoll,
  CommunityRecommendation,
  EventOccurrence,
  EventSeries,
  FundraisingCampaign,
  MembershipProgramme,
  MembershipTier,
  VolunteerOpportunity,
} from '@/types/community-advanced';
import { Card, CommunityStatusBadge, ProgressBar,
  CommunityCover,
} from './CommunityPrimitives';
import { SimulatedFigure, VerifiedFigure } from './CommunityGapNotice';

const PLACEHOLDER = 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=300';

/** A date a member can read. Never a raw ISO string on a card. */
export function readableDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERSHIP
// ─────────────────────────────────────────────────────────────────────────────

export function MembershipProgrammeCard({
  programme,
  onPress,
}: {
  programme: MembershipProgramme;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const state = describeMembership(programme.myStatus);

  const cheapest = programme.tiers
    .filter((tier) => tier.price)
    .sort((a, b) => (a.price?.minorUnits ?? 0) - (b.price?.minorUnits ?? 0))[0];
  const hasFree = programme.tiers.some((tier) => !tier.price);

  const priceLabel = hasFree
    ? 'Free to join'
    : cheapest?.price
      ? `From ${cheapest.price.symbol ?? ''}${cheapest.price.amount.toFixed(2)} ${cheapest.billingPeriod === 'Yearly' ? 'a year' : cheapest.billingPeriod === 'Monthly' ? 'a month' : ''}`.trim()
      : 'Membership available';

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${programme.organizationName}. ${programme.category}. ${priceLabel}. ${programme.memberCount} members. Your status: ${state.label}.`}
      accessibilityHint="Opens the membership details"
    >
      <View className="flex-row">
        <Image
          source={{ uri: programme.organizationLogo ?? PLACEHOLDER }}
          style={{ width: 52, height: 52, borderRadius: 14 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />

        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-black tracking-tight flex-1"
              numberOfLines={2}
            >
              {programme.organizationName}
            </Text>
            {programme.isVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={15}
                color={tokens.color.info.default}
                accessibilityLabel="Verified organisation"
              />
            ) : null}
          </View>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-bold mt-0.5"
          >
            {programme.category} · {programme.memberCount.toLocaleString()} members
          </Text>

          <View className="flex-row items-center mt-2">
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[11px] font-black flex-1"
            >
              {priceLabel}
            </Text>
            {programme.myStatus !== 'NotAMember' && programme.myStatus !== 'Eligible' ? (
              <CommunityStatusBadge state={state} size="small" />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

export function MembershipCard({
  membership,
  onPress,
}: {
  membership: CommunityMembership;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const state = describeMembership(membership.status);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${membership.organizationName}. ${membership.tierName}. ${state.label}. ${state.detail}`}
      accessibilityHint="Opens your membership"
    >
      <View className="flex-row items-center">
        <Image
          source={{ uri: membership.organizationLogo ?? PLACEHOLDER }}
          style={{ width: 44, height: 44, borderRadius: 12 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />

        <View className="flex-1 ml-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={1}
          >
            {membership.organizationName}
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-bold mt-0.5"
          >
            {membership.tierName}
            {membership.expiresAt ? ` · until ${readableDate(membership.expiresAt)}` : ''}
          </Text>
        </View>

        <CommunityStatusBadge state={state} size="small" />
      </View>
    </Card>
  );
}

/**
 * A tier, as a selectable option.
 *
 * `accessibilityRole="radio"` with `checked`, because choosing a tier is
 * choosing one of a set — a screen reader user needs to hear which is selected
 * and that selecting one deselects the others. A full tier is `disabled`, and
 * the reason is in the label rather than only in the styling.
 */
export function MembershipTierCard({
  tier,
  isSelected,
  onSelect,
}: {
  tier: MembershipTier;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { tokens } = useTheme();
  const unmet = tier.requirements.filter((r) => !r.isMet);
  const isDisabled = tier.isFull || unmet.length > 0;

  const priceLabel = tier.price
    ? `${tier.price.symbol ?? ''}${tier.price.amount.toFixed(2)} ${
        tier.billingPeriod === 'Yearly'
          ? 'a year'
          : tier.billingPeriod === 'Monthly'
            ? 'a month'
            : tier.billingPeriod === 'Quarterly'
              ? 'a quarter'
              : tier.billingPeriod === 'Lifetime'
                ? 'once, for life'
                : 'one off'
      }`
    : 'Free';

  const reason = tier.isFull
    ? 'This tier is full.'
    : unmet.length > 0
      ? `Outstanding: ${unmet.map((r) => r.label).join(', ')}.`
      : '';

  return (
    <Card
      onPress={isDisabled ? undefined : onSelect}
      accessibilityLabel={`${tier.name}. ${priceLabel}. ${tier.benefits.length} benefits. ${reason}`}
      style={{
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
        opacity: isDisabled ? tokens.opacity.disabled : 1,
      }}
    >
      <View
        accessible
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected, disabled: isDisabled }}
        accessibilityLabel={`${tier.name}, ${priceLabel}`}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <View className="flex-row items-center">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black tracking-tight"
              >
                {tier.name}
              </Text>
              {tier.isRecommended ? (
                <View
                  style={{ backgroundColor: tokens.color.primary[50] }}
                  className="rounded-full px-2 py-0.5 ml-2"
                >
                  <Text
                    style={{ color: tokens.color.primary[700] }}
                    className="text-[9px] font-black uppercase tracking-widest"
                  >
                    Popular
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold mt-1 leading-relaxed"
            >
              {tier.description}
            </Text>
          </View>

          <View className="items-end">
            {tier.price ? (
              <AmountDisplay value={tier.price} size="small" accessibilityPrefix={tier.name} />
            ) : (
              <Text
                style={{ color: tokens.color.success.default }}
                className="text-sm font-black tracking-tight"
              >
                Free
              </Text>
            )}
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold mt-0.5"
            >
              {tier.billingPeriod === 'Yearly'
                ? 'per year'
                : tier.billingPeriod === 'Monthly'
                  ? 'per month'
                  : tier.billingPeriod === 'Quarterly'
                    ? 'per quarter'
                    : tier.billingPeriod === 'Lifetime'
                      ? 'for life'
                      : 'one off'}
            </Text>
          </View>
        </View>

        {tier.benefits.length > 0 ? (
          <View className="mt-3">
            {tier.benefits.slice(0, 4).map((benefit) => (
              <View key={benefit.id} className="flex-row items-start mb-1.5">
                <Ionicons
                  name={benefit.isActive ? 'checkmark-circle' : 'ellipse-outline'}
                  size={13}
                  color={
                    benefit.isActive ? tokens.color.success.default : tokens.color.text.placeholder
                  }
                  style={{ marginTop: 1.5 }}
                />
                <Text
                  style={{
                    color: benefit.isActive
                      ? tokens.color.text.secondary
                      : tokens.color.text.placeholder,
                  }}
                  className="text-[11px] font-semibold ml-1.5 flex-1"
                >
                  {benefit.title}
                  {benefit.isActive ? '' : ' (coming soon)'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {reason ? (
          <View className="flex-row items-center mt-2">
            <Ionicons name="lock-closed-outline" size={12} color={tokens.color.warning.default} />
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[10px] font-bold ml-1 flex-1"
            >
              {reason}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export function SeriesCard({ series, onPress }: { series: EventSeries; onPress: () => void }) {
  const { tokens } = useTheme();
  const state = describeSeries(series.status);
  const next = series.nextOccurrence;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${series.title}. ${series.recurrence.description ?? 'Recurring event'}. ${
        next ? `Next on ${readableDate(next.date)} at ${next.time}.` : 'No upcoming date.'
      } Hosted by ${series.organizerName}. ${state.label}.`}
      accessibilityHint="Opens the event series"
    >
      <View className="flex-row">
        <Image
          source={{ uri: series.coverImage }}
          style={{ width: 72, height: 72, borderRadius: 14 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />

        <View className="flex-1 ml-3">
          <View className="flex-row items-center mb-1">
            <View
              style={{ backgroundColor: tokens.color.secondary[50] }}
              className="flex-row items-center rounded-full px-2 py-0.5"
            >
              <Ionicons name="repeat" size={10} color={tokens.color.secondary[600]} />
              <Text
                style={{ color: tokens.color.secondary[600] }}
                className="text-[9px] font-black uppercase tracking-widest ml-1"
              >
                Series
              </Text>
            </View>
            {series.status !== 'Published' ? (
              <View className="ml-1.5">
                <CommunityStatusBadge state={state} size="small" />
              </View>
            ) : null}
          </View>

          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={2}
          >
            {series.title}
          </Text>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-bold mt-1"
            numberOfLines={1}
          >
            {series.recurrence.description ?? 'Repeats'} · {series.location.areaName}
          </Text>

          {next ? (
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[11px] font-black mt-1"
            >
              Next: {readableDate(next.date)} at {next.time}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

export function OccurrenceRow({
  occurrence,
  onPress,
}: {
  occurrence: EventOccurrence;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const state = describeOccurrence(occurrence.status);

  const capacityLabel = occurrence.capacity
    ? occurrence.isFull
      ? 'Full'
      : `${occurrence.registeredCount} of ${occurrence.capacity} places taken`
    : `${occurrence.registeredCount} registered`;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${readableDate(occurrence.date)}, ${occurrence.time} to ${occurrence.endTime}. ${state.label}. ${capacityLabel}.${
        occurrence.originalDate ? ` Moved from ${readableDate(occurrence.originalDate)}.` : ''
      }`}
      accessibilityHint="Opens this occurrence"
      style={{ opacity: occurrence.status === 'Cancelled' ? 0.6 : 1 }}
    >
      <View className="flex-row items-center">
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-12 items-center rounded-xl py-2"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black tracking-tight"
          >
            {occurrence.date.slice(8, 10)}
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest"
          >
            {new Date(`${occurrence.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}
          </Text>
        </View>

        <View className="flex-1 ml-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className={`text-xs font-black ${occurrence.status === 'Cancelled' ? 'line-through' : ''}`}
          >
            {occurrence.time} – {occurrence.endTime}
          </Text>
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
            {capacityLabel}
          </Text>
          {occurrence.originalDate ? (
            <Text style={{ color: tokens.color.warning.default }} className="text-[10px] font-bold mt-0.5">
              Moved from {readableDate(occurrence.originalDate)}
            </Text>
          ) : null}
        </View>

        <CommunityStatusBadge state={state} size="small" />
      </View>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNDRAISING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A campaign card.
 *
 * The progress figures come out of `campaign.progress`, which is `Sourced` per
 * field, and the marker under the bar reflects `raised.source` — so a campaign
 * backed by a real B15 cause shows a verified badge and one that is not shows a
 * simulated badge, on the same screen, without either being mislabelled. §17.
 */
export function CampaignCard({
  campaign,
  onPress,
}: {
  campaign: FundraisingCampaign;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const state = describeCampaign(campaign.status);
  const { raised, target, percentage, supporterCount, daysRemaining } = campaign.progress;

  const money = `${raised.value.symbol ?? ''}${raised.value.amount.toLocaleString()}${
    target.value ? ` of ${target.value.symbol ?? ''}${target.value.amount.toLocaleString()}` : ''
  }`;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${campaign.title}. ${money} raised${
        percentage.value === null ? ', no target set' : `, ${percentage.value} per cent`
      }. ${supporterCount.value} supporters.${
        daysRemaining !== null && daysRemaining !== undefined ? ` ${daysRemaining} days left.` : ''
      } ${state.label}.`}
      accessibilityHint="Opens the campaign"
    >
      {/* The reference, not the empty `coverImage`. See `CommunityCover`. */}
      <View className="mb-3">
        <CommunityCover reference={campaign.coverImageReference} height={128} rounded />
      </View>

      <View className="flex-row items-center mb-1.5">
        {/* Organiser lifecycle is not a supporter's business. See
            `isOrganiserOnlyCampaignState`. */}
        {campaign.canManage || !isOrganiserOnlyCampaignState(campaign.status) ? (
          <CommunityStatusBadge state={state} size="small" />
        ) : null}
        {campaign.isVerified ? (
          <View className="flex-row items-center ml-2">
            <Ionicons name="shield-checkmark" size={12} color={tokens.color.info.default} />
            <Text
              style={{ color: tokens.color.info.default }}
              className="text-[9px] font-black uppercase tracking-widest ml-1"
            >
              Verified
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black tracking-tight"
        numberOfLines={2}
      >
        {campaign.title}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-semibold mt-1 leading-relaxed"
        numberOfLines={2}
      >
        {campaign.summary}
      </Text>

      <View className="mt-3">
        {/*
          A campaign with no target has no percentage — the server sends null,
          because a percentage of nothing is undefined rather than zero. No bar
          is drawn for one: a bar sitting at the far left says "almost nobody
          has given", which is a claim about the giving rather than about the
          absent target.
        */}
        {percentage.value !== null ? (
          <ProgressBar
            percentage={percentage.value}
            label={`${money} raised, ${percentage.value} per cent of the target`}
            tone={campaign.status === 'GoalReached' ? 'positive' : 'progress'}
          />
        ) : null}

        <View className="flex-row items-center justify-between mt-2">
          <View className="flex-1">
            <AmountDisplay value={raised.value} size="small" accessibilityPrefix="Raised" />
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
              {target.value
                ? `of ${target.value.symbol ?? ''}${target.value.amount.toLocaleString()} · ${supporterCount.value} supporters`
                : `${supporterCount.value} supporters`}
            </Text>
          </View>

          {daysRemaining !== null && daysRemaining !== undefined ? (
            <View className="items-end">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-black tracking-tight"
              >
                {daysRemaining}
              </Text>
              <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
                days left
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-2">
          {raised.source === 'simulated' ? (
            <SimulatedFigure label="Simulated total" />
          ) : (
            <VerifiedFigure label="Live from Diaspora giving" />
          )}
        </View>
      </View>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VOLUNTEERING
// ─────────────────────────────────────────────────────────────────────────────

export function OpportunityCard({
  opportunity,
  onPress,
}: {
  opportunity: VolunteerOpportunity;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const applicationState = describeVolunteerApplication(opportunity.myApplicationStatus);

  const placesLabel = opportunity.isFull
    ? 'Full'
    : opportunity.capacity
      ? `${Math.max(0, opportunity.capacity - opportunity.filledCount)} places left`
      : 'Places available';

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${opportunity.title}. ${opportunity.cause}, with ${opportunity.organizationName}. ${opportunity.location.areaName}. ${placesLabel}.${
        opportunity.myApplicationStatus !== 'NotApplied' ? ` Your application: ${applicationState.label}.` : ''
      }`}
      accessibilityHint="Opens the volunteer opportunity"
    >
      <View className="flex-row">
        <View
          style={{ backgroundColor: tokens.color.secondary[50] }}
          className="w-12 h-12 rounded-xl items-center justify-center"
        >
          <Ionicons name="hand-left-outline" size={20} color={tokens.color.secondary[500]} />
        </View>

        <View className="flex-1 ml-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={2}
          >
            {opportunity.title}
          </Text>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-bold mt-0.5"
            numberOfLines={1}
          >
            {opportunity.cause} · {opportunity.organizationName}
          </Text>

          <View className="flex-row items-center mt-1.5">
            <Ionicons name="location-outline" size={11} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-semibold ml-0.5 flex-1"
              numberOfLines={1}
            >
              {opportunity.location.areaName}, {opportunity.location.cityName}
            </Text>
          </View>

          <View className="flex-row items-center mt-2">
            <View
              style={{
                backgroundColor: opportunity.isFull
                  ? tokens.color.warning.surface
                  : tokens.color.success.surface,
              }}
              className="rounded-full px-2 py-0.5"
            >
              <Text
                style={{
                  color: opportunity.isFull
                    ? tokens.color.warning.default
                    : tokens.color.success.default,
                }}
                className="text-[9px] font-black uppercase tracking-widest"
              >
                {placesLabel}
              </Text>
            </View>

            {opportunity.myApplicationStatus !== 'NotApplied' ? (
              <View className="ml-1.5">
                <CommunityStatusBadge state={applicationState} size="small" />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POLLS
// ─────────────────────────────────────────────────────────────────────────────

export function PollCard({ poll, onPress }: { poll: CommunityPoll; onPress: () => void }) {
  const { tokens } = useTheme();
  const state = describePoll(poll.status);

  const typeLabel =
    poll.votingType === 'MultipleChoice'
      ? `Choose up to ${poll.maxSelections ?? poll.options.length}`
      : poll.votingType === 'OpenResponse'
        ? 'Written answer'
        : 'Choose one';

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${poll.question}. ${typeLabel}. ${poll.totalResponses} responses so far. ${state.label}.${
        poll.hasVoted ? ' You have voted.' : ''
      }`}
      accessibilityHint="Opens the poll"
    >
      <View className="flex-row items-center mb-2">
        <CommunityStatusBadge state={state} size="small" />
        {poll.isAnonymous ? (
          <View className="flex-row items-center ml-2">
            <Ionicons name="eye-off-outline" size={11} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest ml-1"
            >
              Anonymous
            </Text>
          </View>
        ) : null}
        {poll.hasVoted ? (
          <View className="flex-row items-center ml-2">
            <Ionicons name="checkmark-circle" size={11} color={tokens.color.success.default} />
            <Text
              style={{ color: tokens.color.success.default }}
              className="text-[9px] font-black uppercase tracking-widest ml-1"
            >
              Voted
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black tracking-tight leading-snug"
        numberOfLines={3}
      >
        {poll.question}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-bold mt-1.5"
      >
        {typeLabel} · {poll.totalResponses.toLocaleString()} responses
        {poll.organizationName ? ` · ${poll.organizationName}` : ''}
      </Text>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS & RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function AnnouncementCard({
  announcement,
  onPress,
}: {
  announcement: CommunityAnnouncement;
  onPress: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${announcement.isPinned ? 'Pinned. ' : ''}${announcement.title}. From ${announcement.scopeName}. ${announcement.body}`}
      accessibilityHint="Opens the announcement"
    >
      <View className="flex-row items-center mb-1.5">
        {announcement.isPinned ? (
          <Ionicons
            name="pin"
            size={12}
            color={tokens.color.primary[500]}
            style={{ marginRight: 4 }}
            accessibilityLabel="Pinned"
          />
        ) : null}
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-black uppercase tracking-widest flex-1"
          numberOfLines={1}
        >
          {announcement.scope} · {announcement.scopeName}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
          {readableDate(announcement.publishedAt)}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black tracking-tight"
        numberOfLines={2}
      >
        {announcement.title}
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold mt-1 leading-relaxed"
        numberOfLines={3}
      >
        {announcement.body}
      </Text>
    </Card>
  );
}

/**
 * A recommendation.
 *
 * The `reason` is the server's sentence, printed verbatim. §35 — the client
 * contributes no ranking, and it does not compose an explanation either,
 * because an explanation the client invented would be describing a decision it
 * did not make.
 */
export function RecommendationCard({
  recommendation,
  onPress,
  onDismiss,
}: {
  recommendation: CommunityRecommendation;
  onPress: () => void;
  onDismiss?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${recommendation.title}. ${recommendation.subtitle ?? ''}. Suggested because ${recommendation.reason}.`}
      accessibilityHint="Opens the suggestion"
      style={{ width: 240 }}
    >
      {recommendation.imageUrl ? (
        <Image
          source={{ uri: recommendation.imageUrl }}
          style={{ width: '100%', height: 96, borderRadius: 10, marginBottom: 10 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black tracking-tight"
        numberOfLines={2}
      >
        {recommendation.title}
      </Text>

      {recommendation.subtitle ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-0.5"
          numberOfLines={1}
        >
          {recommendation.subtitle}
        </Text>
      ) : null}

      <View className="flex-row items-start mt-2">
        <Ionicons
          name="sparkles-outline"
          size={11}
          color={tokens.color.primary[500]}
          style={{ marginTop: 1 }}
        />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-semibold ml-1 flex-1 leading-relaxed"
          numberOfLines={2}
        >
          {recommendation.reason}
        </Text>
      </View>

      {onDismiss ? (
        <Text
          accessibilityRole="button"
          accessibilityLabel={`Dismiss the suggestion ${recommendation.title}`}
          onPress={onDismiss}
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black uppercase tracking-wider mt-2.5"
        >
          Not interested
        </Text>
      ) : null}
    </Card>
  );
}
