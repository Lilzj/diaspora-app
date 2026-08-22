// ─────────────────────────────────────────────────────────────────────────────
// A fundraising campaign (§14, §17)
//
// The most carefully-marked screen in the phase, because it is where a real
// financial figure and a simulated one sit side by side.
//
//   `progress.raised`, `.target`, `.percentage` and `.supporterCount` come from
//   B15's `DonationCause` whenever the campaign carries a `causeCode`, and are
//   marked verified. Where it does not, they are marked simulated. §17.
//
//   Updates, milestones, fund usage and the supporter list are simulated
//   throughout and marked as such.
//
//   The donate button is drawn from `campaign.canDonate` — the *server's*
//   decision — and is additionally absent when there is no `causeCode`, because
//   a campaign with nowhere certified to collect must not appear to take money.
//
// GAP-020: there is no realtime channel for campaign progress, so the figure is
// re-read on a timer and the screen says so rather than implying a live feed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  CommunityStatusPanel,
  DetailRow,
  EmptyState,
  InlineRefusal,
  PeriodicUpdateNote,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  Section,
  SimulatedFigure,
  VerifiedFigure,
  readableDate,
} from '@/components/community';
import { AmountDisplay } from '@/components/financial';
import {
  useCampaign,
  useCampaignAction,
  useCampaignFundUsage,
  useCampaignMilestones,
  useCampaignSupporters,
  useCampaignUpdates,
  useCommunityAccess,
} from '@/hooks/community-life';
import { describeCampaign } from '@/lib/community-state';
import { bucketProgress, moneyProps, trackCommunityEvent } from '@/lib/community-analytics';

type Tab = 'story' | 'updates' | 'supporters' | 'transparency';

export default function CampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();
  const access = useCommunityAccess();

  const { campaign, isLoading, isError, error, refetch, isEnabled } = useCampaign(id);
  const { data: updates } = useCampaignUpdates(id);
  const { data: milestones } = useCampaignMilestones(id);
  const { data: fundUsage } = useCampaignFundUsage(id);
  const { supporters, hasNextPage, fetchNextPage } = useCampaignSupporters(id);
  const action = useCampaignAction();

  const [tab, setTab] = useState<Tab>('story');

  useEffect(() => {
    if (campaign) {
      trackCommunityEvent('community.fundraiser.viewed', {
        campaignId: campaign.campaignId,
        campaignCategory: campaign.category,
        status: campaign.status,
        organizationId: campaign.organizationId ?? undefined,
        ...bucketProgress(campaign.progress.percentage.value),
      });
    }
  }, [campaign?.campaignId]);

  const state = describeCampaign(campaign?.status ?? 'Draft');
  const isRealMoney = campaign?.progress.raised.source === 'backend';

  const onShare = async () => {
    if (!campaign) return;
    trackCommunityEvent('community.fundraiser.shared', {
      campaignId: campaign.campaignId,
      campaignCategory: campaign.category,
    });
    try {
      await Share.share({
        message: `${campaign.title} — ${campaign.summary}`,
      });
    } catch {
      // A dismissed share sheet is not an error worth showing anybody.
    }
  };

  return (
    <CommunityScreen
      title={campaign?.title ?? 'Campaign'}
      subtitle={campaign?.organizerName}
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      footer={
        campaign ? (
          campaign.canDonate && campaign.causeCode ? (
            <PrimaryButton
              label="Donate"
              icon="heart-outline"
              disabled={!access.canDonate}
              accessibilityHint={
                access.canDonate
                  ? 'Opens the donation form'
                  : 'Verify your account to donate'
              }
              onPress={() =>
                router.push(`/community-life/campaign/donate?campaignId=${campaign.campaignId}` as never)
              }
            />
          ) : (
            <InlineRefusal
              icon="pause-circle-outline"
              reason={
                !campaign.causeCode
                  ? 'This campaign is not connected to a Diaspora giving cause yet, so it cannot take donations. Diaspora never collects money outside its own payment platform.'
                  : `${state.detail}`
              }
            />
          )
        ) : null
      }
    >
      {!campaign ? (
        <EmptyState
          icon="heart-outline"
          title="Campaign not found"
          body="It may have been closed or removed."
        />
      ) : (
        <View>
          <Image
            source={{ uri: campaign.coverImage }}
            style={{ width: '100%', height: 200 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />

          <View className="px-5 pt-4">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-xl font-black tracking-tight"
            >
              {campaign.title}
            </Text>

            <View className="flex-row items-center mt-2">
              <Ionicons name="people-outline" size={13} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold ml-1.5 flex-1"
                numberOfLines={1}
              >
                {campaign.organizerName} · for {campaign.beneficiaryName}
              </Text>
              {campaign.isVerified ? (
                <Ionicons
                  name="shield-checkmark"
                  size={14}
                  color={tokens.color.info.default}
                  accessibilityLabel="Verified campaign"
                />
              ) : null}
            </View>

            {/* ── The money ──────────────────────────────────────────────── */}
            <Card style={{ marginTop: 16 }}>
              <View className="flex-row items-end justify-between mb-3">
                <View className="flex-1">
                  <AmountDisplay
                    value={campaign.progress.raised.value}
                    size="large"
                    accessibilityPrefix="Raised so far"
                  />
                  {campaign.progress.target.value ? (
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-bold mt-0.5"
                    >
                      of {campaign.progress.target.value.symbol ?? ''}
                      {campaign.progress.target.value.amount.toLocaleString()} target
                    </Text>
                  ) : null}
                </View>

                {/*
                  A campaign with no target has no percentage, and the server
                  sends null rather than nought — a percentage of nothing is
                  undefined, not zero. An em dash says "there is no target" where
                  a 0% would say "nobody has given", which is a different claim
                  and, on a campaign that has raised thousands, a false one.
                */}
                <View className="items-end">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-lg font-black tracking-tight"
                  >
                    {campaign.progress.percentage.value === null
                      ? '—'
                      : `${campaign.progress.percentage.value}%`}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold"
                  >
                    {campaign.progress.percentage.value === null ? 'no target set' : 'of target'}
                  </Text>
                </View>
              </View>

              {/* No target, no bar. A bar drawn at zero is a claim about giving. */}
              {campaign.progress.percentage.value !== null ? (
                <ProgressBar
                  percentage={campaign.progress.percentage.value}
                  label={`${campaign.progress.raised.value.symbol ?? ''}${campaign.progress.raised.value.amount.toLocaleString()} raised${
                    campaign.progress.target.value
                      ? ` of ${campaign.progress.target.value.symbol ?? ''}${campaign.progress.target.value.amount.toLocaleString()}`
                      : ''
                  }, ${campaign.progress.percentage.value} per cent`}
                  tone={campaign.status === 'GoalReached' ? 'positive' : 'progress'}
                  height={10}
                />
              ) : null}

              <View className="flex-row items-center justify-between mt-3">
                <View className="flex-row items-center">
                  <Ionicons name="people-outline" size={13} color={tokens.color.text.placeholder} />
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[11px] font-bold ml-1.5"
                  >
                    {campaign.progress.supporterCount.value.toLocaleString()} supporters
                  </Text>
                </View>

                {campaign.progress.daysRemaining !== null &&
                campaign.progress.daysRemaining !== undefined ? (
                  <View className="flex-row items-center">
                    <Ionicons name="time-outline" size={13} color={tokens.color.text.placeholder} />
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-[11px] font-bold ml-1.5"
                    >
                      {campaign.progress.daysRemaining} days left
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Provenance, at the figure rather than at the screen */}
              <View className="mt-3">
                {isRealMoney ? (
                  <VerifiedFigure label="Real — Diaspora giving" />
                ) : (
                  <SimulatedFigure label="Simulated total" />
                )}
                {isRealMoney ? <PeriodicUpdateNote what="The amount raised" /> : null}
              </View>
            </Card>

            {/*
              The hybrid marker is gone, and its absence is the change.

              Remediation Wave C-04: this page used to carry a `PartlyRealNotice`
              saying that the amount raised was real and that "the campaign page
              itself, its status, its updates, milestones, supporter list and
              fund breakdown" were simulated. B15.1 now serves every one of
              those, so the notice would be telling a member their campaign is
              made up when it is not — and a provenance marker that is wrong in
              the reassuring direction is worse than none. `SimulatedFigure`
              still guards the money if a development build ever answers here,
              because that check reads the figure's own `source` rather than a
              belief about the screen.
            */}
            <View className="mt-3">
              <CommunityStatusPanel state={state} extra={campaign.reviewNote ?? undefined} />
            </View>

            {/* Tabs */}
            <View className="mt-5">
              <ChipRow
                accessibilityLabel="Campaign sections"
                options={[
                  { value: 'story' as const, label: 'Story' },
                  { value: 'updates' as const, label: `Updates (${updates.length})` },
                  { value: 'supporters' as const, label: 'Supporters' },
                  { value: 'transparency' as const, label: 'Where it goes' },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
          </View>

          {/* ── Story ─────────────────────────────────────────────────────── */}
          {tab === 'story' ? (
            <View className="px-5 mt-4">
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-sm font-semibold leading-relaxed"
              >
                {campaign.story}
              </Text>

              <Card style={{ marginTop: 20 }}>
                <DetailRow label="Cause" icon="pricetag-outline" value={campaign.category} />
                <DetailRow label="For" icon="person-outline" value={campaign.beneficiaryName} />
                <DetailRow label="Organiser" icon="business-outline" value={campaign.organizerName} />
                {campaign.locationLabel ? (
                  <DetailRow label="Where" icon="location-outline" value={campaign.locationLabel} />
                ) : null}
                <DetailRow label="Started" icon="calendar-outline" value={readableDate(campaign.createdAt)} />
                {campaign.progress.deadline ? (
                  <DetailRow
                    label="Deadline"
                    icon="time-outline"
                    value={readableDate(campaign.progress.deadline)}
                  />
                ) : null}
              </Card>

              <View className="mt-4">
                <SecondaryButton label="Share this campaign" icon="share-outline" onPress={onShare} />
              </View>
            </View>
          ) : null}

          {/* ── Updates ───────────────────────────────────────────────────── */}
          {tab === 'updates' ? (
            <View className="px-5 mt-4">
              {updates.length === 0 ? (
                <EmptyState
                  icon="megaphone-outline"
                  title="No updates yet"
                  body="The organiser has not posted an update since this started."
                />
              ) : (
                updates.map((update) => (
                  <View key={update.updateId} className="mb-3">
                    <Card>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[10px] font-black uppercase tracking-widest"
                      >
                        {readableDate(update.publishedAt)}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-sm font-black tracking-tight mt-1"
                      >
                        {update.title}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-xs font-semibold mt-1.5 leading-relaxed"
                      >
                        {update.body}
                      </Text>
                    </Card>
                  </View>
                ))
              )}

              {campaign.canManage ? (
                <View className="mt-2">
                  <SecondaryButton
                    label="Post an update"
                    icon="create-outline"
                    onPress={() =>
                      router.push(
                        `/community-life/campaign/update?campaignId=${campaign.campaignId}` as never
                      )
                    }
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ── Supporters ────────────────────────────────────────────────── */}
          {tab === 'supporters' ? (
            <View className="px-5 mt-4">
              <InlineRefusal
                icon="eye-off-outline"
                reason="Anonymous supporters are shown without a name because Diaspora does not record who they are. There is nothing to reveal."
              />

              <View className="mt-3">
                {supporters.length === 0 ? (
                  <EmptyState
                    icon="people-outline"
                    title="No supporters listed"
                    body="Be the first, or they may all have given anonymously."
                  />
                ) : (
                  supporters.map((supporter, index) => (
                    <View
                      key={`${supporter.userId ?? 'anon'}-${index}`}
                      className="flex-row items-center py-3"
                      style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.border.default }}
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${supporter.displayName}${
                        supporter.amount
                          ? `, ${supporter.amount.symbol ?? ''}${supporter.amount.amount}`
                          : ''
                      }${supporter.message ? `. ${supporter.message}` : ''}`}
                    >
                      <View
                        style={{ backgroundColor: tokens.color.surface.elevated }}
                        className="w-9 h-9 rounded-full items-center justify-center"
                      >
                        <Ionicons
                          name={supporter.isAnonymous ? 'eye-off-outline' : 'person-outline'}
                          size={15}
                          color={tokens.color.text.placeholder}
                        />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-xs font-bold"
                        >
                          {supporter.displayName}
                        </Text>
                        {supporter.message ? (
                          <Text
                            style={{ color: tokens.color.text.secondary }}
                            className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                          >
                            {supporter.message}
                          </Text>
                        ) : null}
                      </View>
                      {supporter.amount ? (
                        <AmountDisplay
                          value={supporter.amount}
                          size="small"
                          accessibilityPrefix="Gave"
                        />
                      ) : null}
                    </View>
                  ))
                )}

                {hasNextPage ? (
                  <View className="mt-3">
                    <SecondaryButton label="Show more supporters" onPress={() => void fetchNextPage()} />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* ── Transparency ──────────────────────────────────────────────── */}
          {tab === 'transparency' ? (
            <View className="px-5 mt-4">
              {milestones.length > 0 ? (
                <View className="mb-5">
                  <Text
                    accessibilityRole="header"
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black tracking-tight mb-2.5"
                  >
                    Milestones
                  </Text>
                  {milestones.map((milestone) => (
                    <View
                      key={milestone.milestoneId}
                      className="flex-row items-center py-2"
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${milestone.label}, ${milestone.target.symbol ?? ''}${milestone.target.amount}. ${milestone.isReached ? 'Reached.' : 'Not reached yet.'}`}
                    >
                      <Ionicons
                        name={milestone.isReached ? 'checkmark-circle' : 'ellipse-outline'}
                        size={17}
                        color={
                          milestone.isReached
                            ? tokens.color.success.default
                            : tokens.color.text.placeholder
                        }
                      />
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-xs font-bold ml-2 flex-1"
                      >
                        {milestone.label}
                      </Text>
                      <AmountDisplay value={milestone.target} size="small" />
                    </View>
                  ))}
                </View>
              ) : null}

              {/*
                An over-report is surfaced rather than smoothed away. The lines
                are the organiser's own figures and the platform will not quietly
                adjust them, but a supporter reading this page is entitled to
                know they do not add up against what the cause actually raised.
              */}
              {fundUsage?.isOverReported ? (
                <View className="mb-3">
                  <InlineRefusal
                    icon="alert-circle-outline"
                    reason="The organiser has reported spending more than this campaign has raised. Diaspora shows their figures as given and does not adjust them."
                  />
                </View>
              ) : null}

              {fundUsage && fundUsage.lines.length > 0 ? (
                <View>
                  <Text
                    accessibilityRole="header"
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black tracking-tight mb-2.5"
                  >
                    Where the money goes
                  </Text>
                  {fundUsage.lines.map((line) => (
                    <Card key={line.id} style={{ marginBottom: 10 }}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text
                            style={{ color: tokens.color.text.primary }}
                            className="text-xs font-bold"
                          >
                            {line.label}
                          </Text>
                          {line.note ? (
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[11px] font-semibold mt-0.5"
                            >
                              {line.note}
                            </Text>
                          ) : null}
                        </View>
                        <View className="items-end">
                          <AmountDisplay
                            value={line.allocated}
                            size="small"
                            accessibilityPrefix={`${line.label} allocated`}
                          />
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[10px] font-bold mt-0.5"
                          >
                            {line.spent
                              ? `${line.spent.symbol ?? ''}${line.spent.amount.toLocaleString()} spent`
                              : 'not spent yet'}
                          </Text>
                          {/*
                            A figure somebody typed and a figure the platform can
                            prove are not the same claim. `isPlatformVerified` is
                            true only where a settled payout backs the spend, so
                            the two are never drawn identically — and a spend with
                            no proof says so rather than saying nothing.
                          */}
                          {line.spent ? (
                            <View className="flex-row items-center mt-0.5">
                              <Ionicons
                                name={
                                  line.isPlatformVerified
                                    ? 'shield-checkmark'
                                    : 'information-circle-outline'
                                }
                                size={10}
                                color={
                                  line.isPlatformVerified
                                    ? tokens.color.success.default
                                    : tokens.color.text.placeholder
                                }
                              />
                              <Text
                                style={{
                                  color: line.isPlatformVerified
                                    ? tokens.color.success.default
                                    : tokens.color.text.placeholder,
                                }}
                                className="text-[9px] font-black uppercase tracking-widest ml-1"
                              >
                                {line.isPlatformVerified ? 'Payout verified' : "Organiser's figure"}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Card>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="pie-chart-outline"
                  title="No breakdown published"
                  body="The organiser has not published how the money will be spent."
                />
              )}

              {/*
                No simulation footer here any more. Milestones carry the
                server's own reached-ness, and every line of the breakdown says
                whether a settled payout backs it — see the badge on each row,
                which is a stronger and truer statement than a blanket label.
              */}
            </View>
          ) : null}

          {/* Organizer controls */}
          {campaign.canManage ? (
            <View className="px-5 mt-8">
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black tracking-tight mb-3"
              >
                Manage
              </Text>

              {campaign.status === 'Draft' || campaign.status === 'Rejected' ? (
                <PrimaryButton
                  label="Submit for review"
                  icon="paper-plane-outline"
                  busy={action.isPending}
                  onPress={() => {
                    trackCommunityEvent('community.campaign.submitted', {
                      campaignId: campaign.campaignId,
                      campaignCategory: campaign.category,
                      ...moneyProps(campaign.progress.target.value),
                    });
                    action.mutate({ campaignId: campaign.campaignId, action: 'submit' });
                  }}
                />
              ) : null}

              {campaign.status === 'PendingReview' ? (
                <InlineRefusal
                  icon="hourglass-outline"
                  reason="Diaspora is reviewing this campaign. You will be told as soon as it is decided."
                />
              ) : null}

              {campaign.status === 'Active' ? (
                <SecondaryButton
                  label="Pause donations"
                  icon="pause-outline"
                  disabled={action.isPending}
                  onPress={() => action.mutate({ campaignId: campaign.campaignId, action: 'pause' })}
                />
              ) : null}

              {campaign.status === 'Paused' ? (
                <PrimaryButton
                  label="Resume donations"
                  icon="play-outline"
                  busy={action.isPending}
                  onPress={() => action.mutate({ campaignId: campaign.campaignId, action: 'resume' })}
                />
              ) : null}

              {['Active', 'Paused', 'GoalReached', 'DeadlineReached'].includes(campaign.status) ? (
                <View className="mt-3">
                  <SecondaryButton
                    label="Close this campaign"
                    icon="lock-closed-outline"
                    disabled={action.isPending}
                    onPress={() => action.mutate({ campaignId: campaign.campaignId, action: 'close' })}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </CommunityScreen>
  );
}
