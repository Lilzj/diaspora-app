// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator Dashboard (Frontend Phase 7, §5)
//
// The central creator control surface. Everything in the creator economy is
// reachable from here, and this screen owns none of it.
//
// §39 is the constraint that shaped the whole thing: "The Creator Dashboard
// must not become an enormous API waterfall." So the first paint is **two**
// queries — the dashboard summary and the recommendation rail — and every
// deeper dataset is fetched by the screen that shows it. The summary carries
// section *counts*, which is what lets this screen decide not to show the
// grants section without having fetched a grant.
//
// The two queries run in parallel rather than in sequence, and neither blocks
// the other's render: the rail appears when it appears, and a slow
// recommendation service cannot stop a creator from seeing their points.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorCardSkeleton,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  QuickAction,
  RecommendationCard,
  StatTile,
} from '@/components/creator-economy';
import {
  useCreatorAccess,
  useCreatorDashboard,
  useCreatorRecommendations,
  useDismissRecommendation,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatPoints, presentCreatorStatus, presentVerificationState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorRecommendation } from '@/types/creator-economy';

export default function CreatorDashboardScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const dashboard = useCreatorDashboard();
  // A separate query on purpose. The rail is the slowest thing on the screen
  // and the least important; making the headline wait for it would be the
  // waterfall §39 forbids.
  const recommendations = useCreatorRecommendations('dashboard', 6);
  const dismiss = useDismissRecommendation();
  const access = useCreatorAccess();

  const [isRefreshing, setRefreshing] = useState(false);

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
    await Promise.allSettled([dashboard.refetch(), recommendations.refetch()]);
    setRefreshing(false);
  }, [dashboard, recommendations]);

  const openRecommendation = useCallback((recommendation: CreatorRecommendation) => {
    trackCreatorEvent('creator.recommendation.tapped', {
      recommendationId: recommendation.recommendationId,
      kind: recommendation.kind,
      surface: 'dashboard',
    });
    router.push(recommendation.actionRoute as never);
  }, []);

  const summary = dashboard.summary;
  const counts = summary?.counts;

  return (
    <CreatorScreen
      title="Creator"
      subtitle="Your work, your standing, what you have earned"
      gapKey="profile"
      gapDetail="Your creator status, the headline figures and the suggestions below come from a development adapter. Your wallet balance, your published content and your verification are real."
      isEnabled={dashboard.isEnabled}
      refusal={refusal}
      isLoading={dashboard.isLoading}
      error={dashboard.error}
      onRetry={dashboard.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      showBack
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Creator settings and profile"
          onPress={() => router.push('/creator/profile')}
          hitSlop={8}
          className="w-11 h-11 items-center justify-center"
        >
          <Ionicons name="person-circle-outline" size={23} color={tokens.color.text.primary} />
        </Pressable>
      }
    >
      <View className="px-5 pt-5">
        {/* ── Status ─────────────────────────────────────────────────────── */}
        {summary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Your creator status: ${summary.statusLabel}. ${presentCreatorStatus(summary.status).description} Open your creator profile.`}
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
                <CreatorStatusChip presentation={presentCreatorStatus(summary.status)} />
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-semibold mt-2.5 leading-relaxed"
                >
                  {presentCreatorStatus(summary.status).description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.color.text.placeholder} />
            </View>

            {summary.verificationState !== 'Approved' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Creator verification: ${presentVerificationState(summary.verificationState).description}`}
                onPress={() => router.push('/creator/verification')}
                style={{ backgroundColor: tokens.color.surface.elevated }}
                className="flex-row items-center rounded-2xl p-3 mt-4"
              >
                <Ionicons
                  name={presentVerificationState(summary.verificationState).icon as never}
                  size={16}
                  color={tokens.color.text.secondary}
                />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[11px] font-bold ml-2 flex-1"
                >
                  {presentVerificationState(summary.verificationState).description}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={tokens.color.text.placeholder} />
              </Pressable>
            ) : null}
          </Pressable>
        ) : null}

        {/* ── Money and points ───────────────────────────────────────────── */}
        {summary ? (
          <View className="flex-row -mx-1 mb-4">
            <View className="flex-1 px-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatPoints(summary.points.available)} available${
                  summary.points.pending > 0 ? `, ${summary.points.pending} pending` : ''
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
                  {summary.points.available.toLocaleString()}
                </Text>
                {summary.points.pending > 0 ? (
                  <Text className="text-white/70 text-[10px] font-bold mt-0.5">
                    +{summary.points.pending.toLocaleString()} pending
                  </Text>
                ) : null}
              </Pressable>
            </View>

            <View className="flex-1 px-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  summary.revenue
                    ? `${summary.revenue.available.currency} ${summary.revenue.available.amount.toFixed(2)} available to withdraw. Open your revenue.`
                    : 'Open your revenue'
                }
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
                  {summary.revenue
                    ? `${summary.revenue.available.symbol ?? ''}${summary.revenue.available.amount.toFixed(2)}`
                    : '—'}
                </Text>
                {summary.revenue && summary.revenue.pending.minorUnits > 0 ? (
                  <Text className="text-white/70 text-[10px] font-bold mt-0.5">
                    {summary.revenue.pending.symbol ?? ''}
                    {summary.revenue.pending.amount.toFixed(2)} pending
                  </Text>
                ) : null}
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ── Quick actions ──────────────────────────────────────────────── */}
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
              { icon: 'folder-open-outline', label: 'My content', route: '/creator/content', tone: 'neutral' as const },
            ].map((action) => (
              <View key={action.route} className="w-1/4 px-1 mb-2">
                <QuickAction
                  icon={action.icon}
                  label={action.label}
                  tone={action.tone}
                  onPress={() => {
                    trackCreatorEvent('creator.quick_action.tapped', { surface: 'dashboard' });
                    router.push(action.route as never);
                  }}
                />
              </View>
            ))}
          </View>
        </CreatorSection>

        {/* ── What to do next ────────────────────────────────────────────── */}
        {recommendations.recommendations.length > 0 ? (
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
        ) : recommendations.isLoading ? (
          <CreatorSection title="What to do next">
            <CreatorCardSkeleton rows={1} />
          </CreatorSection>
        ) : null}

        {/* ── Performance ────────────────────────────────────────────────── */}
        {summary && summary.headline.length > 0 ? (
          <CreatorSection
            title="Last 30 days"
            actionLabel="All analytics"
            onAction={() => router.push('/creator/analytics')}
          >
            <View className="flex-row flex-wrap -mx-1">
              {summary.headline.map((metric) => (
                <View key={metric.key} className="w-1/2 px-1 mb-2">
                  <StatTile metric={metric} onPress={() => router.push('/creator/analytics')} />
                </View>
              ))}
            </View>
          </CreatorSection>
        ) : null}

        {/* ── Programme ──────────────────────────────────────────────────── */}
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
            hint={
              counts?.activeSponsoredContent
                ? `${counts.activeSponsoredContent} active`
                : 'Promote your best work'
            }
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

        {/* ── Elsewhere on the platform ──────────────────────────────────── */}
        <CreatorSection
          title="Elsewhere"
          subtitle="These live outside the creator programme and are unchanged"
        >
          <CreatorCard padded={false}>
            <ProgrammeRow
              icon="grid-outline"
              label="Creator Studio"
              hint="Manage everything you have published"
              onPress={() => router.push('/profile/creator-dashboard')}
            />
            <ProgrammeRow
              icon="wallet-outline"
              label="Wallet"
              hint="Your balance, statement and giving"
              onPress={() => router.push('/wallet')}
            />
            <ProgrammeRow
              icon="briefcase-outline"
              label="Monetization"
              hint="Subscriptions, promotions and billing"
              onPress={() => router.push('/monetization')}
            />
            <ProgrammeRow
              icon="notifications-outline"
              label="Notifications"
              hint={counts?.unreadNotifications ? `${counts.unreadNotifications} unread` : 'Your inbox'}
              badge={counts?.unreadNotifications}
              onPress={() => router.push('/notifications')}
            />
            <ProgrammeRow
              icon="chatbubbles-outline"
              label="Messages"
              hint="Conversations about your work"
              onPress={() => router.push('/(tabs)/messages')}
              isLast
            />
          </CreatorCard>
        </CreatorSection>

        {summary ? (
          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mb-4"
          >
            Figures generated {new Date(summary.generatedAt).toLocaleTimeString()}
          </Text>
        ) : null}
      </View>
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
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.${badge ? ` ${badge} waiting.` : ''}`}
      onPress={onPress}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
      >
        <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      </View>

      <View className="flex-1 mr-2">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
          numberOfLines={1}
        >
          {hint}
        </Text>
      </View>

      {badge && badge > 0 ? (
        <View
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="min-w-5 h-5 rounded-full items-center justify-center px-1.5 mr-2"
        >
          <Text className="text-white text-[10px] font-black">{badge}</Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
