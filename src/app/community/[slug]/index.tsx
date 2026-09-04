// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community profile (Frontend Phase 13, §32, §33, §37)
//
// §32's profile. Identity, origin, lifecycle, description, statistics, the eight
// content sections, moderators, ambassadors, rules — and §33's membership actions.
//
// Three things this screen is careful about:
//
//   **Every action is offered by `offerableMembershipActions`, never by a role
//   check.** That function decides whether offering a button would be *coherent*
//   (do not offer Join to a member); the server decides whether it is *permitted*.
//   §33 and §62. A member whose membership was revoked is offered nothing at all,
//   and is told why in the server's own words.
//
//   **Role-gated links are hidden, not disabled.** The moderation queue link
//   appears only when the server reported `canViewModerationQueue`. §34's reasoning:
//   a greyed-out "Review reports" tells somebody they are nearly a moderator, and
//   the frontend has no business implying anything about a community's governance.
//
//   **The section list adapts to what the community actually has.** §32 says the
//   exact sections should depend on actual capabilities. A community with no
//   country of origin has no projectable content, so its content sections say so
//   rather than rendering eight empty lists — which would read as "this community
//   does nothing" when the truth is "the filter cannot express this community yet".
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityMembershipAction } from '@/types/community-directory';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityContext,
  useCommunityNotices,
  useCommunityRoleHolders,
  useCommunityStatistics,
  useMembershipAction,
  useSetPrimaryCommunity,
} from '@/hooks/communities';
import { canPerform, offerableMembershipActions } from '@/lib/community/access';
import { membershipStateLabel } from '@/lib/community/scope';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useConnectivityStore } from '@/lib/connectivity';
import {
  CommunityAvatar,
  CommunityContentSection,
  CommunityMetricFigure,
  CommunityNoticeCard,
  CommunityOfflineBanner,
  CommunityRoleHolderCard,
  CommunityUnavailablePanel,
  MembershipStatePill,
  MultiCommunityGapNotice,
  communityOriginLabel,
  communityStatusLabel,
  communityTypeLabel,
} from '@/components/community-directory';
import type { CommunityContentDomain } from '@/lib/community-directory-api';
import { useBottomInset } from '@/components/layout/bottom-inset';

const SECTIONS: { domain: CommunityContentDomain; route: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { domain: 'guide', route: 'guides', icon: 'book-outline' },
    { domain: 'event', route: 'events', icon: 'calendar-outline' },
    { domain: 'job', route: 'jobs', icon: 'briefcase-outline' },
    { domain: 'housing', route: 'housing', icon: 'home-outline' },
    { domain: 'marketplace', route: 'marketplace', icon: 'cart-outline' },
    { domain: 'provider', route: 'providers', icon: 'construct-outline' },
    { domain: 'organization', route: 'organizations', icon: 'business-outline' },
    { domain: 'update', route: 'updates', icon: 'megaphone-outline' },
  ];

export default function CommunityProfileScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const isOnline = useConnectivityStore((s) => s.isOnline);

  const community = useCommunity(slug);
  const context = useCommunityContext();
  const capabilities = useCommunityCapabilities(community.data?.id);
  const statistics = useCommunityStatistics(community.data?.id, '30d');
  const notices = useCommunityNotices(community.data?.id);
  const moderators = useCommunityRoleHolders(community.data?.id, 'Moderator');
  const ambassadors = useCommunityRoleHolders(community.data?.id, 'Ambassador');

  const membershipAction = useMembershipAction();
  const setPrimary = useSetPrimaryCommunity();

  const [pendingAction, setPendingAction] = useState<CommunityMembershipAction | null>(null);

  const membership = useMemo(
    () =>
      community.data
        ? (context.membershipSet.memberships.find(
            (m) => m.communityId === community.data!.id
          ) ?? null)
        : null,
    [community.data, context.membershipSet.memberships]
  );

  React.useEffect(() => {
    if (community.data) {
      trackCommunityEvent('community.viewed', { communityId: community.data.id });
    }
  }, [community.data]);

  const offers = useMemo(
    () =>
      offerableMembershipActions({
        community: community.data,
        membership,
        hasPrimary: Boolean(context.primaryMembership),
      }),
    [community.data, context.primaryMembership, membership]
  );

  const run = (action: CommunityMembershipAction) => {
    if (!community.data) return;
    setPendingAction(action);

    if (action === 'set-primary' || action === 'clear-primary') {
      setPrimary.mutate(action === 'set-primary' ? community.data.id : null, {
        onSettled: () => setPendingAction(null),
      });
      return;
    }

    membershipAction.mutate(
      { communityId: community.data.id, action },
      { onSettled: () => setPendingAction(null) }
    );
  };

  // ── Loading and unavailable ────────────────────────────────────────────────

  if (community.isLoading) {
    return (
      <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
        <CommunityUnavailablePanel reason="loading" subject="this community" />
      </SafeAreaView>
    );
  }

  if (!community.data || community.unavailable) {
    return (
      <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
        <ScreenHeader onBack={() => router.back()} title="Community" />
        <CommunityUnavailablePanel
          reason={community.unavailable ?? 'not-found'}
          subject="this community"
          detail={community.data?.statusReason}
          gapKey="communityProfile"
          onAction={
            community.unavailable === 'not-found'
              ? () => router.replace('/community')
              : community.unavailable === 'error' || community.unavailable === 'offline'
                ? () => void community.refetch()
                : undefined
          }
        />
      </SafeAreaView>
    );
  }

  const record = community.data;
  const canProject = Boolean(record.origin.countryCode);
  const showModerationLink = canPerform('view-moderation-queue', capabilities.data);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <ScreenHeader onBack={() => router.back()} title={record.name} />

      <ScrollEndScrollView contentContainerStyle={{ paddingBottom: bottomInset }} showsVerticalScrollIndicator={false}>
        {!isOnline ? (
          <View className="px-4 mb-3">
            <CommunityOfflineBanner savedAt={context.hydratedFrom} />
          </View>
        ) : null}

        {/* Identity */}
        <View className="px-4">
          <View className="flex-row items-start">
            <CommunityAvatar community={record} size={64} showStatusDot />

            <View className="flex-1 ml-3">
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.primary }}
                className="text-xl font-black"
              >
                {record.name}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-bold mt-0.5"
              >
                {communityTypeLabel(record.type)} · {communityOriginLabel(record)}
              </Text>

              <View className="flex-row items-center flex-wrap mt-2">
                <MembershipStatePill
                  state={membership?.state ?? 'Discovering'}
                  isPrimary={membership?.isPrimary}
                  showDiscovering
                />
                {record.status !== 'Active' ? (
                  <View
                    style={{ backgroundColor: tokens.color.warning.surface }}
                    className="px-2 py-0.5 rounded-full ml-1.5"
                  >
                    <Text
                      style={{ color: tokens.color.warning.default }}
                      className="text-[8px] font-black uppercase tracking-wider"
                    >
                      {communityStatusLabel(record.status)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {record.tagline ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-bold mt-3"
            >
              {record.tagline}
            </Text>
          ) : null}

          {record.description ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mt-2"
            >
              {record.description}
            </Text>
          ) : null}

          {/* §74/§75: the server's own reason, verbatim. */}
          {record.statusReason ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${communityStatusLabel(record.status)}. ${record.statusReason}`}
              style={{
                backgroundColor: tokens.color.warning.surface,
                borderColor: `${tokens.color.warning.default}44`,
              }}
              className="rounded-2xl border p-3 mt-3"
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[9px] font-black uppercase tracking-widest mb-1"
              >
                {communityStatusLabel(record.status)}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold leading-relaxed"
              >
                {record.statusReason}
              </Text>
            </View>
          ) : null}

          {record.supportedLanguages && record.supportedLanguages.length > 1 ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold mt-3"
            >
              Members post in {record.supportedLanguages.join(', ')}
            </Text>
          ) : null}
        </View>

        {/* §33 actions */}
        <View className="px-4 mt-4">
          <View className="flex-row flex-wrap -mx-1">
            {offers.has('join') ? (
              <ActionButton
                label={membership?.requiresApproval ? 'Ask to join' : 'Join'}
                icon="person-add-outline"
                primary
                busy={pendingAction === 'join'}
                onPress={() => run('join')}
              />
            ) : null}

            {offers.has('leave') ? (
              <ActionButton
                label="Leave"
                icon="exit-outline"
                busy={pendingAction === 'leave'}
                onPress={() => run('leave')}
              />
            ) : null}

            {offers.has('follow') ? (
              <ActionButton
                label="Follow"
                icon="notifications-outline"
                busy={pendingAction === 'follow'}
                onPress={() => run('follow')}
              />
            ) : null}

            {offers.has('unfollow') ? (
              <ActionButton
                label="Unfollow"
                icon="notifications-off-outline"
                busy={pendingAction === 'unfollow'}
                onPress={() => run('unfollow')}
              />
            ) : null}

            {offers.has('express-interest') ? (
              <ActionButton
                label="I’m interested"
                icon="bookmark-outline"
                busy={pendingAction === 'express-interest'}
                onPress={() => run('express-interest')}
              />
            ) : null}

            {offers.has('remove-interest') ? (
              <ActionButton
                label="Remove interest"
                icon="bookmark"
                busy={pendingAction === 'remove-interest'}
                onPress={() => run('remove-interest')}
              />
            ) : null}

            {offers.has('set-primary') ? (
              <ActionButton
                label="Make this my main community"
                icon="star-outline"
                busy={pendingAction === 'set-primary'}
                onPress={() => run('set-primary')}
              />
            ) : null}

            {offers.has('clear-primary') ? (
              <ActionButton
                label="No longer my main community"
                icon="star"
                busy={pendingAction === 'clear-primary'}
                onPress={() => run('clear-primary')}
              />
            ) : null}

            {offers.has('cancel-application') ? (
              <ActionButton
                label="Cancel my application"
                icon="close-circle-outline"
                busy={pendingAction === 'cancel-application'}
                onPress={() => run('cancel-application')}
              />
            ) : null}
          </View>

          {/* Where nothing is offered, say why rather than showing an empty row. */}
          {offers.size === 0 ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={
                membership?.stateReason ??
                `${membershipStateLabel(membership?.state ?? 'None')}. There is nothing to do here.`
              }
              style={{ backgroundColor: tokens.color.neutral[100] }}
              className="rounded-2xl p-3"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold leading-relaxed"
              >
                {membership?.stateReason ??
                  (record.status === 'Pending'
                    ? 'This community is still being set up. You will be able to join once its moderators are confirmed.'
                    : record.status === 'Archived'
                      ? 'This community has closed. Its guides and posts stay readable.'
                      : 'There is nothing to do here at the moment.')}
              </Text>
            </View>
          ) : null}

          {membershipAction.isError ? (
            <Text
              accessibilityRole="alert"
              style={{ color: tokens.color.error.default }}
              className="text-[11px] font-bold mt-2"
            >
              That did not go through. It may or may not have worked — check before trying again.
            </Text>
          ) : null}
        </View>

        {/* Pinned notices */}
        {(notices.data ?? []).filter((n) => n.isPinned).length > 0 ? (
          <View className="px-4 mt-5">
            {/*
              Its own marker. This screen carried one notice for the whole
              profile, which covered every section while every section was
              simulated. B18 connected the profile, so that notice correctly
              renders nothing — and a community notice is exactly the kind of
              thing a member acts on, so an unmarked simulated one is worse than
              an unmarked simulated statistic. GAP-018.
            */}
            <View className="mb-3">
              <MultiCommunityGapNotice gapKey="communityGovernance" compact />
            </View>

            {(notices.data ?? [])
              .filter((notice) => notice.isPinned)
              .map((notice) => (
                <CommunityNoticeCard key={notice.id} notice={notice} />
              ))}
          </View>
        ) : null}

        {/* Statistics preview */}
        <View className="px-4 mt-5">
          <SectionHeading
            title="This community in numbers"
            actionLabel="All figures"
            onAction={() => router.push(`/community/${slug}/statistics`)}
          />

          {statistics.unavailable ? (
            <CommunityUnavailablePanel
              reason={statistics.unavailable}
              subject="this community’s figures"
              gapKey="communityStatistics"
              compact
              onAction={
                statistics.unavailable === 'statistics-unavailable'
                  ? () => void statistics.refetch()
                  : undefined
              }
            />
          ) : statistics.isLoading ? (
            <View className="py-4 items-center">
              <ActivityIndicator color={tokens.color.primary[500]} />
            </View>
          ) : (
            <View className="flex-row flex-wrap -mx-1">
              {(statistics.data?.metrics ?? []).slice(0, 4).map((metric) => (
                <View key={metric.key} className="w-1/2 px-1 mb-2">
                  <View
                    style={{
                      backgroundColor: tokens.color.surface.card,
                      borderColor: tokens.color.border.default,
                    }}
                    className="rounded-2xl border p-3"
                  >
                    <CommunityMetricFigure metric={metric} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Governance links — hidden, not disabled, when not permitted. */}
        <View className="px-4 mt-5">
          <SectionHeading title="About this community" />

          <NavRow
            icon="document-text-outline"
            label="Community rules"
            onPress={() => router.push(`/community/${slug}/rules`)}
          />
          <NavRow
            icon="shield-half-outline"
            label={`Moderators${moderators.data?.length ? ` (${moderators.data.length})` : ''}`}
            onPress={() => router.push(`/community/${slug}/moderators`)}
          />
          <NavRow
            icon="ribbon-outline"
            label={`Ambassadors${ambassadors.data?.length ? ` (${ambassadors.data.length})` : ''}`}
            onPress={() => router.push(`/community/${slug}/ambassadors`)}
          />
          <NavRow
            icon="rocket-outline"
            label="Community initiatives"
            onPress={() => router.push(`/community/${slug}/initiatives`)}
          />

          {showModerationLink ? (
            <NavRow
              icon="flag-outline"
              label="Moderation queue"
              badge="Moderator"
              onPress={() => router.push(`/community/${slug}/moderation`)}
            />
          ) : null}
        </View>

        {/* Ambassadors preview */}
        {(ambassadors.data?.length ?? 0) > 0 ? (
          <View className="px-4 mt-5">
            <SectionHeading
              title="People who help here"
              actionLabel="See all"
              onAction={() => router.push(`/community/${slug}/ambassadors`)}
            />

            {/*
              Named people, and none of them real. The role directory is
              GAP-017 and still comes from the adapter; the profile notice that
              used to cover this went quiet when B18 connected the profile.
              Presenting invented people as members of somebody's community is
              the least acceptable thing on this screen to leave unmarked.
            */}
            <View className="mb-3">
              <MultiCommunityGapNotice gapKey="communityRoleDirectory" compact />
            </View>

            {(ambassadors.data ?? []).slice(0, 2).map((holder) => (
              <CommunityRoleHolderCard key={holder.userId} holder={holder} />
            ))}
          </View>
        ) : null}

        {/* Content sections */}
        <View className="mt-5">
          {!canProject ? (
            <View className="px-4 mb-4">
              <MultiCommunityGapNotice
                gapKey="communityScopedContent"
                detail={`${record.name} covers more than one country, and Diaspora can only match content to a community by the country each person or business came from. Until content can say which community it is for, this community’s guides, jobs and listings cannot be gathered here.`}
              />
            </View>
          ) : null}

          {canProject
            ? SECTIONS.map(({ domain, route }) => (
                <View key={domain} className="mb-5">
                  <CommunityContentSection
                    domain={domain}
                    limit={2}
                    hideScopeNote={domain !== 'guide'}
                    onSeeAll={() => router.push(`/community/${slug}/${route}`)}
                  />
                </View>
              ))
            : null}
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Local pieces
// ═════════════════════════════════════════════════════════════════════════════

function ScreenHeader({ onBack, title }: { onBack: () => void; title: string }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center px-4 pt-2 pb-3">
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
      </TouchableOpacity>
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black ml-2 flex-1"
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}

function SectionHeading({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center justify-between mb-2">
      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black"
      >
        {title}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  primary = false,
  busy = false,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View className="px-1 mb-2">
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          backgroundColor: primary ? tokens.color.primary[500] : tokens.color.surface.card,
          borderColor: primary ? tokens.color.primary[500] : tokens.color.border.default,
          opacity: busy ? 0.6 : 1,
        }}
        className="flex-row items-center rounded-full border px-3.5 py-2"
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color={primary ? tokens.color.text.inverse : tokens.color.text.secondary}
          />
        ) : (
          <Ionicons
            name={icon}
            size={14}
            color={primary ? tokens.color.text.inverse : tokens.color.text.secondary}
          />
        )}
        <Text
          style={{ color: primary ? tokens.color.text.inverse : tokens.color.text.primary }}
          className="text-[11px] font-bold ml-1.5"
        >
          {label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function NavRow({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: string;
  onPress: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}. ${badge} only.` : label}
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="flex-row items-center rounded-2xl border p-3 mb-2"
    >
      <Ionicons name={icon} size={17} color={tokens.color.text.secondary} />
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-bold ml-3 flex-1"
      >
        {label}
      </Text>
      {badge ? (
        <View
          style={{ backgroundColor: tokens.color.info.surface }}
          className="px-2 py-0.5 rounded-full mr-1.5"
        >
          <Text
            style={{ color: tokens.color.info.default }}
            className="text-[8px] font-black uppercase tracking-wider"
          >
            {badge}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color={tokens.color.text.placeholder} />
    </TouchableOpacity>
  );
}
