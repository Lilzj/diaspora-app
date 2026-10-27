// ─────────────────────────────────────────────────────────────────────────────
// Creator Studio — one screen, four sections
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Two screens that overlapped in subject and disagreed in fact. `/creator` had
// standing, money, quick actions, recommendations, a 30-day summary and the
// programme rows. `/profile/creator-dashboard` — titled "Creator Studio" — had
// a welcome card, an achievements shelf, everything published, drafts, bulk
// actions, organisations and analytics.
//
// Five concerns appeared on both, and one of them appeared three times: a
// creator looking for "my published guides" could reach `/creator/content`,
// Studio's Workspace, or the Studio link on `/creator`, and the first two read
// different sources. Worse, profile completeness was answered twice — by
// `nextStatus.requirements` here and by a locally computed percentage there —
// so the app could tell a member they were 92% done and, on the next screen,
// show them three unmet requirements. Nothing said which was true.
//
// ── Why this route survived ──────────────────────────────────────────────────
//
// It has the shell. `CreatorScreen` handles the gap notice, the access refusal,
// the error, the retry and the pull-to-refresh; Studio had none of them and
// keeping its route would have meant rebuilding all five. It is also the parent
// of fourteen `/creator/*` routes, where the Studio route was an orphan under
// `/profile`, and it is the one registered in the creator gap register.
//
// ── The sections ─────────────────────────────────────────────────────────────
//
//   Overview       standing · money · badges · quick actions · what to do next
//                  · last 30 days           — every one of these designs is the
//                                             one that already shipped here
//   Workspace      everything published, drafts, bulk actions   (from Studio)
//   Organisations  publishing identity, organisation management (from Studio)
//   Programme      milestones · challenges · academy · grants · sponsored ·
//                  rewards · referrals · leaderboards
//
// **There is no Analytics section.** Analytics is a screen under Profile, and
// it is reached from the Overview summary's "All analytics" and from the
// Analytics tile in Quick actions. A tab for a destination that already has a
// front door is a tab that exists to be a tab.
//
// **There is no Elsewhere section.** It listed Creator Studio — now a section
// rather than a destination — plus Wallet, Monetization, Notifications and
// Messages, each of which is one tap away in the tab bar already.
//
// ── The header ───────────────────────────────────────────────────────────────
//
// The profile icon that used to sit top-right is gone; it opened the creator
// profile, which is what the Profile tab is for, and the header now carries
// Studio's content-health badge instead. That badge is the one thing on this
// screen that is genuinely urgent, and it was previously two taps away on a
// route most members never found.
//
// ── What this merge deliberately did not do ──────────────────────────────────
//
// Migrate Studio's stores. Workspace and Organisations still read zustand
// directly, synchronously, with no loading or error state. Being inside
// `CreatorScreen` closes the access gap for free — a member who may not be here
// is refused before any section renders — but a section that cannot fail also
// cannot tell you when it has. That migration is a separate piece of work and
// is described in `Creator-Studio-Merge-Plan.md`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorCardSkeleton,
  CreatorGapNotice,
  CreatorGapUnavailable,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  QuickAction,
  RecommendationCard,
  StatTile,
} from '@/components/creator-economy';
import { FinancialErrorView } from '@/components/financial';
import { BadgeShelf, BadgeSheet } from '@/components/creator/BadgeShelf';
import { ContentHealthBadge } from '@/components/creator/ContentHealthBadge';
import { ContentHealthCenterModal } from '@/components/creator/ContentHealthCenterModal';
import { OrganisationsSection } from '@/components/creator/sections/OrganisationsSection';
import { WorkspaceSection } from '@/components/creator/sections/WorkspaceSection';
import { useContentManagementStore } from '@/store/content-management';
import { useCreatorWorkspaceStore, type CreatorSection as SectionKey } from '@/store/creator-workspace';
import {
  useCommunityGrants,
  useCreatorAcademy,
  useCreatorAccess,
  useCreatorAnalytics,
  useCreatorChallenges,
  useCreatorMilestones,
  useCreatorPoints,
  useCreatorReferrals,
  useCreatorRevenue,
  useCreatorSponsoredContent,
  useCreatorProfile,
  useCreatorRecommendations,
  useCreatorVerification,
  useDismissRecommendation,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatPoints, presentCreatorStatus, presentVerificationState } from '@/lib/creator-economy';
import { formatMoney } from '@/lib/money';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorRecommendation } from '@/types/creator-economy';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: '📊 Overview' },
  { key: 'workspace', label: '⚡ Workspace' },
  { key: 'organizations', label: '🏛️ Organisations' },
  { key: 'programme', label: '🏅 Programme' },
];

export default function CreatorStudioScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const workspaceStore = useCreatorWorkspaceStore();
  const contentStore = useContentManagementStore();

  // Every figure on this tab is read from its own real route (20 Oct 2026).
  // The dashboard summary was a simulation in test builds: a £42 balance in
  // GBP for a Mauritian member, invented 30-day figures and programme counts.
  const revenue = useCreatorRevenue();
  const milestones = useCreatorMilestones();
  const challenges = useCreatorChallenges();
  const academy = useCreatorAcademy();
  const grants = useCommunityGrants();
  const referrals = useCreatorReferrals();
  const sponsored = useCreatorSponsoredContent('live');

  // ── The four sections that are real, read from where they are real ───────
  //
  // Overview used to render *entirely* from `dashboard.summary`, which is
  // `gapApi` and therefore off in every release build — so a release build
  // showed one notice and nothing else. Four of its six sections do not need
  // the dashboard at all:
  //
  //   standing        GET /creators/me               certified
  //   verification    GET /creators/me/verification   certified
  //   points          the rewards balance             certified
  //   achievements    a static catalogue scored against real earned state
  //
  // Only the revenue tile, the suggestion rail and the headline figures are
  // genuinely simulated, and each now says so where it stands rather than
  // taking the whole tab down with it.
  const profile = useCreatorProfile();
  const verification = useCreatorVerification();
  const points = useCreatorPoints();

  // A separate query on purpose. The rail is the slowest thing on the screen
  // and the least important; making the headline wait for it would be the
  // waterfall §39 forbids.
  const recommendations = useCreatorRecommendations('dashboard', 6);

  // The deployment's own list of metrics it cannot compute, in the words the
  // platform uses for them. Read rather than hardcoded: a build that decides for
  // itself which figures are missing is wrong the first time a deployment gains
  // one, and always in the direction of denying something that works.
  const creatorAnalytics = useCreatorAnalytics({ period: '30d' });
  const unavailableMetricLabels = useMemo(() => {
    const served = new Map<string, string>(
      (creatorAnalytics.summary?.metrics ?? []).map(
        (metric: { key: string; label: string }) => [metric.key, metric.label] as const
      )
    );
    return (creatorAnalytics.unavailableMetrics ?? []).map(
      (key: string) => served.get(key) ?? key.replace(/_/g, ' ')
    );
  }, [creatorAnalytics.summary, creatorAnalytics.unavailableMetrics]);
  const dismiss = useDismissRecommendation();
  const access = useCreatorAccess();

  const [isRefreshing, setRefreshing] = useState(false);
  const [isBadgesOpen, setBadgesOpen] = useState(false);
  const [isHealthCentreOpen, setHealthCentreOpen] = useState(false);

  useEffect(() => {
    trackCreatorEvent('creator.dashboard.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      revenue.refetch(),
      milestones.refetch(),
      challenges.refetch(),
      recommendations.refetch(),
      // The three real reads refresh too. Pull-to-refresh that reloaded only
      // the simulated half would leave the standing card stale on the one
      // gesture a member makes when they think something is stale.
      profile.refetch(),
      verification.refetch(),
      points.refetch(),
    ]);
    setRefreshing(false);
  }, [revenue, milestones, challenges, recommendations, profile, verification, points]);

  const openRecommendation = useCallback((recommendation: CreatorRecommendation) => {
    trackCreatorEvent('creator.recommendation.tapped', {
      recommendationId: recommendation.recommendationId,
      kind: recommendation.kind,
      surface: 'dashboard',
    });
    router.push(recommendation.actionRoute as never);
  }, []);

  const counts = useMemo(
    () => ({
      claimableMilestones: milestones.milestones.filter((item) => item.state === 'Completed').length,
      activeChallenges: challenges.challenges.filter((item) =>
        ['Joined', 'InProgress'].includes(item.state)
      ).length,
      coursesInProgress: academy.courses.filter((course) => course.progress?.state === 'InProgress').length,
      openGrants: grants.grants.filter((grant) => ['Open', 'ClosingSoon'].includes(grant.state)).length,
      pendingReferrals: referrals.programme?.pendingRewards ?? 0,
      activeSponsoredContent: sponsored.items.length,
    }),
    [milestones.milestones, challenges.challenges, academy.courses, grants.grants, referrals.programme, sponsored.items]
  );
  const revenueSummary = revenue.canRead ? revenue.summary : null;
  // The 30-day tiles: the creator's real analytics, less what it cannot measure.
  const headline = useMemo(() => {
    const unavailable = new Set(creatorAnalytics.unavailableMetrics ?? []);
    return ((creatorAnalytics.summary?.metrics ?? []) as { key: string }[])
      .filter((metric) => !unavailable.has(metric.key))
      .slice(0, 4);
  }, [creatorAnalytics.summary, creatorAnalytics.unavailableMetrics]);
  const section = workspaceStore.activeSection;
  const healthStats = contentStore.getHealthStats();

  return (
    <CreatorScreen
      title="Creator Studio"
      subtitle="Your work, your standing, what you have earned"
      // ── The dashboard query gates Overview, not the screen ─────────────
      //
      // `gapKey`, `isEnabled`, `isLoading` and `error` all describe
      // `useCreatorDashboard`, which is Overview's data and nothing else.
      // Workspace and Organisations read local stores; Programme is a list of
      // routes. All three work when that query is unavailable, loading or
      // failed.
      //
      // They are deliberately *not* passed to the shell, because the shell
      // handles each by returning `frame(...)` — which renders the header and
      // the branch and **drops `sticky`**, the section switcher. A release
      // build without the gap flag would therefore open on Overview's
      // "unavailable" state with no way to reach the three sections that do
      // not need it. Same for a failed fetch, and same for the first second of
      // every cold load.
      //
      // So Overview renders its own three states below, and the shell keeps
      // only `refusal` — which genuinely gates the whole screen, because
      // somebody who may not be a creator has no business in Workspace either.
      refusal={refusal}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      showBack
      // ── The health badge only appears when something was assessed ──────
      //
      // `getHealthStats()` reads `store/content-management`, which is now filled
      // from the four `/mine` routes rather than from `mockCreatorContent`. An
      // empty list used to score **100**, and this badge rendered that as a
      // green "100%" beside the title: a perfect audit of nothing, on every
      // account, for members who had published nothing.
      //
      // The gate is `assessed`, not `items.length`. Now that the list is real,
      // a member with published items and no health data would otherwise be
      // graded 0% — a failing mark for content nothing examined, which is the
      // same fabrication pointing the other way. Nothing computes content
      // health on this platform, so in practice this badge does not appear.
      headerRight={
        healthStats.assessed > 0 ? (
          <ContentHealthBadge
            score={healthStats.overallScore}
            status={
              healthStats.actionRequired > 0
                ? 'action_required'
                : healthStats.needsAttention > 0
                  ? 'needs_attention'
                  : 'healthy'
            }
            recommendationCount={healthStats.needsAttention + healthStats.actionRequired}
            onPress={() => setHealthCentreOpen(true)}
            showDetails={false}
          />
        ) : undefined
      }
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="flex-row border-b px-4"
          accessibilityRole="tablist"
        >
          {SECTIONS.map((entry) => {
            const isActive = section === entry.key;
            return (
              <Pressable
                key={entry.key}
                onPress={() => workspaceStore.setActiveSection(entry.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={entry.label.replace(/^\S+\s/, '')}
                style={{
                  borderBottomColor: isActive ? tokens.color.primary[500] : 'transparent',
                }}
                className="flex-1 items-center py-3 border-b-2"
              >
                <Text
                  style={{ color: isActive ? tokens.color.text.brand : tokens.color.text.placeholder }}
                  className="text-[11px] font-black"
                  numberOfLines={1}
                >
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      <View className="px-5 pt-5">
        {/* ═══ OVERVIEW ═════════════════════════════════════════════════════ */}
        {/* ── What this used to claim, and why it was wrong ────────────────
            It rendered `<CreatorGapUnavailable gapKey="profile" />`, which draws
            *"Creator profile and status projection — Diaspora cannot do this
            yet."* over the whole Overview tab whenever the gap arm is off, which
            is every release build.

            `CREATOR-GAP-001` was closed by Remediation Wave C-03 and the register
            says so in its own entry: `GET /creators/me`, `PUT /creators/me` and
            `GET /creators/{id}` all answer, and `useCreatorProfile()` already
            reads them through the certified client. The only thing still on the
            development arm is `useCreatorDashboard` — the **headline figures**,
            which is `CREATOR-GAP-005`, not the profile.

            Found on a device, and only on a device: under Metro the gap arm is
            enabled, so this branch never renders and the screen shows simulated
            tiles instead. A release build was the one place the sentence was
            visible, and it denied a capability the member's own profile above it
            was being served from. */}
        {/* ── The gate this screen used to have, and why it was still wrong ──
            FD-04's first fix replaced a full-tab denial with a narrower
            *sentence* — and left the *structure*. Everything below still sat
            inside `dashboard.isEnabled && …`, and `useCreatorDashboard` is
            `gapApi`, so a release build rendered that one notice and nothing
            else: no standing card, no points, no achievements, no quick
            actions. Four sections that read certified routes were invisible
            because they shared a gate with the one that does not.

            The notice also sent the member to Programme "for your standing"
            while the standing card was four inches above it — advice that only
            made sense while the card was hidden.

            Each section now gates on its own source. */}
        {section === 'overview' && profile.isLoading ? (
          <CreatorCardSkeleton rows={2} />
        ) : null}

        {section === 'overview' && !profile.isLoading && profile.isError ? (
          <FinancialErrorView error={profile.error} onRetry={profile.refetch} />
        ) : null}

        {section === 'overview' && !profile.isLoading && !profile.isError ? (
          <>
            {/* ── Standing ─────────────────────────────────────────────────
                Read from `GET /creators/me`, not from the dashboard.
                CREATOR-GAP-001 was closed by Remediation Wave C-03 and this
                card was still invisible in every release build, because it sat
                inside the dashboard's gate rather than its own.

                It opens the member's own creator profile, which is where the
                rest of their standing lives. */}
            {profile.data ? (
              <TourSpotlight spotlightKey="creator_reputation_impact">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Your creator status: ${presentCreatorStatus(profile.data.status).label}. ${presentCreatorStatus(profile.data.status).description} Open your creator profile.`}
                  onPress={() => router.push('/creator/profile')}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                  }}
                  className="rounded-3xl border p-5 mb-4"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[10px] font-black uppercase tracking-widest mb-1.5"
                      >
                        Your standing
                      </Text>
                      <CreatorStatusChip presentation={presentCreatorStatus(profile.data.status)} />
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-[11px] font-semibold mt-2.5 leading-relaxed"
                      >
                        {presentCreatorStatus(profile.data.status).description}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={tokens.color.text.placeholder} />
                  </View>

                  {verification.verification && verification.verification.state !== 'Approved' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Creator verification: ${presentVerificationState(verification.verification.state).description}`}
                      onPress={() => router.push('/creator/verification')}
                      style={{ backgroundColor: tokens.color.surface.elevated }}
                      className="flex-row items-center rounded-2xl p-3 mt-4"
                    >
                      <Ionicons
                        name={presentVerificationState(verification.verification.state).icon as never}
                        size={16}
                        color={tokens.color.text.secondary}
                      />
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-[11px] font-bold ml-2 flex-1"
                      >
                        {presentVerificationState(verification.verification.state).description}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={tokens.color.text.placeholder} />
                    </Pressable>
                  ) : null}
                </Pressable>
              </TourSpotlight>
            ) : null}

            {/* ── Money and points ─────────────────────────────────────────── */}
            {/* The two halves have different provenance and are no longer
                rendered as though they shared one. **Points is real** — the
                rewards balance is a certified read, and `useCreatorPoints`
                says so in every build. **Revenue is
                not**, so its tile appears only on the development arm and
                Points takes the full width otherwise, rather than sitting
                beside an em dash. */}
            {points.data ? (
              <View
                className="flex-row -mx-1 mb-4"
                // Remounted when the second tile arrives: a width left over from
                // the one-tile layout squeezed it into a tall strip on first open.
                key={revenueSummary ? 'two' : 'one'}
              >
                <View className="flex-1 px-1">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${formatPoints(points.data.available)} available${
                      points.data.pending > 0 ? `, ${points.data.pending} pending` : ''
                    }. Open your rewards.`}
                    onPress={() => router.push('/creator/rewards')}
                    style={{ backgroundColor: tokens.color.secondary[500] }}
                    className="rounded-2xl p-4"
                  >
                    <Text className="text-white/70 text-[9px] font-black uppercase tracking-widest">
                      Points
                    </Text>
                    <Text
                      className="text-white text-2xl font-black tracking-tight mt-1"
                      style={{ fontVariant: ['tabular-nums'] }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {points.data.available.toLocaleString()}
                    </Text>
                    {points.data.pending > 0 ? (
                      <Text className="text-white/70 text-[10px] font-bold mt-0.5">
                        +{points.data.pending.toLocaleString()} pending
                      </Text>
                    ) : null}
                  </Pressable>
                </View>

                {revenueSummary ? (
                <View className="flex-1 px-1">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${revenueSummary.available.currency} ${revenueSummary.available.amount.toFixed(2)} available to withdraw. Open your revenue.`}
                    onPress={() => router.push('/creator/revenue')}
                    style={{ backgroundColor: tokens.color.primary[500] }}
                    className="rounded-2xl p-4"
                  >
                    <Text className="text-white/70 text-[9px] font-black uppercase tracking-widest">
                      Available
                    </Text>
                    <Text
                      className="text-white text-2xl font-black tracking-tight mt-1"
                      style={{ fontVariant: ['tabular-nums'] }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {/* The creator's own currency, from the server: never assumed. */}
                      {formatMoney(revenueSummary.available)}
                    </Text>
                    {revenueSummary.pending.minorUnits > 0 ? (
                      <Text className="text-white/70 text-[10px] font-bold mt-0.5">
                        {formatMoney(revenueSummary.pending)} pending
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
                ) : null}
              </View>
            ) : null}

            {/* ── Badges ───────────────────────────────────────────────────── */}
            <BadgeShelf onViewAll={() => setBadgesOpen(true)} />

            {/* ── Quick actions ────────────────────────────────────────────── */}
            <CreatorSection title="Quick actions" subtitle="The things creators do most">
              <View className="flex-row flex-wrap -mx-1">
                {[
                  { icon: 'create-outline', label: 'Write a guide', route: '/guide/create', tone: 'brand' as const },
                  { icon: 'megaphone-outline', label: 'Post update', route: '/update/create', tone: 'info' as const },
                  { icon: 'calendar-outline', label: 'Host event', route: '/community-life/event/create', tone: 'info' as const },
                  { icon: 'stats-chart-outline', label: 'Analytics', route: '/creator/analytics', tone: 'neutral' as const },
                  { icon: 'wallet-outline', label: 'Revenue', route: '/creator/revenue', tone: 'success' as const },
                  { icon: 'school-outline', label: 'Academy', route: '/creator/academy', tone: 'brand' as const },
                  { icon: 'people-outline', label: 'Invite', route: '/creator/referrals', tone: 'info' as const },
                  // Was `/creator/content`, a third surface for published work
                  // that redirects here now. The tile keeps its place and its
                  // label, and scrolls to the Workspace section rather than
                  // leaving the screen.
                  { icon: 'folder-open-outline', label: 'My content', route: null, tone: 'neutral' as const },
                ].map((action) => (
                  // `flex-row` on the cell, and it is load-bearing. `QuickAction`
                  // sets `flex-1` on its own root because its other caller wraps
                  // it in `QuickActionRow`, which is a flex row. In a *column*
                  // cell `flex-1` grows along the vertical axis instead, and with
                  // no bounded parent height the tile collapses to nothing — the
                  // icon circle keeps its explicit `w-10 h-10` and bleeds out of a
                  // zero-height card while the label disappears entirely.
                  //
                  // This has been broken in every release build for as long as
                  // the tiles have existed and nobody could see it: the whole
                  // section sat behind the dashboard's gate. Unhiding the section
                  // is what surfaced it.
                  <View key={action.label} className="w-1/4 px-1 mb-2 flex-row">
                    <QuickAction
                      icon={action.icon}
                      label={action.label}
                      tone={action.tone}
                      onPress={() => {
                        trackCreatorEvent('creator.quick_action.tapped', { surface: 'dashboard' });
                        if (action.route) {
                          router.push(action.route as never);
                        } else {
                          workspaceStore.setActiveSection('workspace');
                        }
                      }}
                    />
                  </View>
                ))}
              </View>
            </CreatorSection>

            {/* ── What the deployment says it cannot measure ────────────────
                This block used to read:

                  "Suggestions and your last 30 days are not measured yet.
                   Views, reach, saves and the suggestions built from them need
                   an audience measurement the platform does not record yet."

                Measured against the running platform on 22 Aug 2026 that was
                wrong about two of the three things it named.
                `GET /analytics/creators/me/summary` answers 200 with fourteen
                metrics, a comparison range and a series — `content_views` and
                `saves` among them. It also publishes `unavailableMetrics`, which
                on that date was `reach`, `followers`, `engagement_rate`,
                `profile_views` and `revenue`.

                So the denial is now the deployment's own, named metric by
                metric, and it disappears entirely on a deployment that computes
                them all. A hardcoded list would be wrong the first time one
                shipped — and only ever in the direction of denying something
                that works. */}
            {unavailableMetricLabels.length > 0 ? (
              <View
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border p-4 mb-4"
              >
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-sm font-black mb-1"
                >
                  Some figures are not measured yet
                </Text>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-xs leading-relaxed"
                >
                  {unavailableMetricLabels.join(', ')} {unavailableMetricLabels.length === 1 ? 'is' : 'are'} not
                  something this deployment records yet. Everything else on your
                  analytics — including your views and saves — is real.
                </Text>
              </View>
            ) : null}

            {/* ── What to do next ──────────────────────────────────────────── */}
            {recommendations.recommendations.length > 0 ? (
              <TourSpotlight spotlightKey="creator_drafts">
                <CreatorSection
                  title="What to do next"
                  subtitle="Suggested by Diaspora, in the order it suggests them"
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingRight: 8 }}
                  >
                    {recommendations.recommendations.map((recommendation) => (
                      <RecommendationCard
                        key={recommendation.recommendationId}
                        recommendation={recommendation}
                        onPress={openRecommendation}
                        onDismiss={(item) => {
                          trackCreatorEvent('creator.recommendation.dismissed', {
                            recommendationId: item.recommendationId,
                            kind: item.kind,
                            surface: 'dashboard',
                          });
                          dismiss.mutate(item.recommendationId);
                        }}
                      />
                    ))}
                  </ScrollView>
                </CreatorSection>
              </TourSpotlight>
            ) : recommendations.isLoading ? (
              <CreatorSection title="What to do next">
                <CreatorCardSkeleton rows={1} />
              </CreatorSection>
            ) : null}

            {/* ── Last 30 days ─────────────────────────────────────────────── */}
            {headline.length > 0 ? (
              <TourSpotlight spotlightKey="creator_stats">
                <CreatorSection
                  title="Last 30 days"
                  actionLabel="All analytics"
                  onAction={() => router.push('/creator/analytics')}
                >
                  <View className="flex-row flex-wrap -mx-1">
                    {headline.map((metric) => (
                      <View key={metric.key} className="w-1/2 px-1 mb-2">
                        <StatTile metric={metric as never} onPress={() => router.push('/creator/analytics')} />
                      </View>
                    ))}
                  </View>
                </CreatorSection>
              </TourSpotlight>
            ) : null}

          </>
        ) : null}

        {/* ═══ WORKSPACE ════════════════════════════════════════════════════ */}
        {section === 'workspace' ? <WorkspaceSection /> : null}

        {/* ═══ ORGANISATIONS ════════════════════════════════════════════════ */}
        {section === 'organizations' ? <OrganisationsSection /> : null}

        {/* ═══ PROGRAMME ════════════════════════════════════════════════════ */}
        {section === 'programme' ? (
          <CreatorSection title="Your creator programme">
            <ProgrammeRow
              icon="trophy-outline"
              label="Milestones"
              hint={
                counts?.claimableMilestones
                  ? `${counts.claimableMilestones} ready to claim`
                  : 'Track what you have achieved'
              }
              badge={counts?.claimableMilestones}
              onPress={() => router.push('/creator/milestones')}
            />
            <ProgrammeRow
              icon="flag-outline"
              label="Challenges"
              hint={
                counts?.activeChallenges
                  ? `${counts.activeChallenges} in progress`
                  : 'Time-limited goals with rewards'
              }
              badge={counts?.activeChallenges}
              onPress={() => router.push('/creator/challenges')}
            />
            <ProgrammeRow
              icon="school-outline"
              label="Creator Academy"
              hint={
                counts?.coursesInProgress
                  ? `${counts.coursesInProgress} ${counts.coursesInProgress === 1 ? 'course' : 'courses'} in progress`
                  : 'Courses on writing, safety and monetization'
              }
              onPress={() => router.push('/creator/academy')}
            />
            <ProgrammeRow
              icon="cash-outline"
              label="Community grants"
              hint={counts?.openGrants ? `${counts.openGrants} open now` : 'Funding for community work'}
              onPress={() => router.push('/creator/grants')}
            />
            <ProgrammeRow
              icon="megaphone-outline"
              label="Sponsored content"
              hint={counts.activeSponsoredContent ? `${counts.activeSponsoredContent} live` : 'Promote your best work'}
              onPress={() => router.push('/creator/sponsored')}
            />
            <ProgrammeRow
              icon="gift-outline"
              label="Rewards"
              hint="Spend your points"
              onPress={() => router.push('/creator/rewards')}
            />
            <ProgrammeRow
              icon="people-outline"
              label="Referrals"
              hint={
                counts?.pendingReferrals
                  ? `${counts.pendingReferrals} pending`
                  : 'Invite people and earn points'
              }
              badge={counts?.pendingReferrals}
              onPress={() => router.push('/creator/referrals')}
            />
            <ProgrammeRow
              icon="podium-outline"
              label="Leaderboards"
              hint="See where you stand"
              onPress={() => router.push('/creator/leaderboard')}
              isLast
            />
          </CreatorSection>
        ) : null}
      </View>

      <BadgeSheet visible={isBadgesOpen} onClose={() => setBadgesOpen(false)} />

      <ContentHealthCenterModal
        visible={isHealthCentreOpen}
        onClose={() => setHealthCentreOpen(false)}
        onSelectAction={(_, actionType) => {
          setHealthCentreOpen(false);
          if (actionType === 'photos' || actionType === 'edit') {
            router.push('/housing/create');
          } else {
            workspaceStore.setActiveSection('workspace');
          }
        }}
      />
    </CreatorScreen>
  );
}

/** One row in the programme list. Icon, label, hint, optional count, chevron. */
function ProgrammeRow({
  icon,
  label,
  hint,
  badge,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint: string;
  badge?: number;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}${badge ? `. ${badge} waiting` : ''}`}
      style={{ borderBottomColor: tokens.color.border.default }}
      className={`flex-row items-center py-3.5 ${isLast ? '' : 'border-b'}`}
    >
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-9 h-9 rounded-2xl items-center justify-center mr-3"
      >
        <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      </View>

      <View className="flex-1 mr-2">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-black">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>

      {badge ? (
        <View
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="min-w-5 h-5 rounded-full items-center justify-center px-1.5 mr-1.5"
        >
          <Text className="text-white text-[10px] font-black">{badge}</Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
