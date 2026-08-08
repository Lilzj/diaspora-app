// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Referral earnings (Frontend Phase 7, §18)
//
// §18's warning is the design brief for this screen: "Do not assume every
// signup is a qualifying referral."
//
// So four separate figures — invited, joined, qualified, rewarded — rather than
// one, the qualification rule is shown in the platform's own words rather than
// summarised, and every referral row carries the *reason* it is in the state it
// is in. A member looking at this should be able to answer "why have I not been
// paid for Ibrahim?" without contacting support.
//
// One thing this screen cannot do: copy to the clipboard. There is no clipboard
// dependency in this app and adding one for a simulated feature would be a
// dependency added for a gap. The code is `selectable`, so a long press copies
// it, and the share sheet — which is the thing people actually use — is real.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  ReferralRow,
  ReferralStats,
} from '@/components/creator-economy';
import {
  useCreatorAccess,
  useCreatorReferrals,
  useReferralHistory,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatPoints } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';

export default function CreatorReferralsScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const programme = useCreatorReferrals();
  const history = useReferralHistory();
  const access = useCreatorAccess();

  const [isRefreshing, setRefreshing] = useState(false);

  useEffect(() => {
    trackCreatorEvent('creator.referral.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const shareRefusal = checkCreatorAccess(CreatorCapabilities.ShareReferral, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([programme.refetch(), history.refetch()]);
    setRefreshing(false);
  }, [history, programme]);

  const share = useCallback(async () => {
    const data = programme.programme;
    if (!data) return;

    trackCreatorEvent('creator.referral.shared', { method: 'share_sheet' });

    try {
      await Share.share({
        message: `I use Diaspora to find my way around after moving. Join with my link and we both get something: ${data.shareUrl}`,
        url: data.shareUrl,
      });
    } catch {
      // A cancelled share sheet is not a failure and needs no message. Anything
      // else that goes wrong here is not worth interrupting somebody over.
    }
  }, [programme.programme]);

  const data = programme.programme;

  return (
    <CreatorScreen
      title="Invite people"
      subtitle="What you have earned by bringing people in"
      gapKey="referrals"
      gapDetail="The referral code, the counts and every referral below are simulated. Diaspora has no referral programme yet — no code is issued at signup and no reward is owed."
      isEnabled={programme.isEnabled}
      refusal={refusal}
      isLoading={programme.isLoading}
      error={programme.error}
      onRetry={programme.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      footer={
        data && shareRefusal.allowed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share your invite link"
            onPress={share}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center flex-row justify-center"
          >
            <Ionicons name="share-outline" size={17} color="#FFFFFF" />
            <Text className="text-white text-xs font-black uppercase tracking-wider ml-2">
              Share your link
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {data ? (
        <View className="px-5 pt-5">
          {/* ── The code ─────────────────────────────────────────────────── */}
          <View
            style={{ backgroundColor: tokens.color.secondary[500] }}
            className="rounded-3xl p-5"
            accessible
            accessibilityLabel={`Your invite code is ${data.code.split('').join(' ')}. ${data.rewardDescription}`}
          >
            <Text className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-2">
              Your invite code
            </Text>

            <Text
              selectable
              className="text-white text-3xl font-black tracking-widest"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {data.code}
            </Text>

            <Text
              selectable
              className="text-white/70 text-[11px] font-semibold mt-2.5"
              numberOfLines={1}
              onPress={() => trackCreatorEvent('creator.referral.code_copied', { method: 'long_press' })}
            >
              {data.shareUrl}
            </Text>

            <Text className="text-white/80 text-[12px] font-semibold mt-4 leading-relaxed">
              {data.rewardDescription}
            </Text>

            {typeof data.totalPointsEarned === 'number' && data.totalPointsEarned > 0 ? (
              <View className="flex-row items-center mt-4 pt-4 border-t border-white/20">
                <Ionicons name="sparkles-outline" size={15} color="#FFFFFF" />
                <Text className="text-white text-[12px] font-bold ml-2">
                  {formatPoints(data.totalPointsEarned)} earned so far
                </Text>
              </View>
            ) : null}
          </View>

          {!shareRefusal.allowed ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-2xl p-3.5 mt-4 flex-row items-start"
            >
              <Ionicons
                name="information-circle-outline"
                size={15}
                color={tokens.color.warning.default}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold ml-2 flex-1 leading-relaxed"
              >
                {shareRefusal.message}
              </Text>
            </View>
          ) : null}

          {/* ── The four figures ─────────────────────────────────────────── */}
          <CreatorSection
            title="How it is going"
            subtitle="These are four different things — an invitation is not a reward"
          >
            <ReferralStats programme={data} />
          </CreatorSection>

          {/* ── What qualifies ───────────────────────────────────────────── */}
          <CreatorSection
            title="What counts"
            subtitle="Diaspora's rule, in Diaspora's words"
          >
            <CreatorCard>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-semibold leading-relaxed"
              >
                {data.qualificationDescription}
              </Text>

              {data.pendingRewards > 0 ? (
                <View
                  style={{ backgroundColor: tokens.color.info.surface }}
                  className="flex-row items-center rounded-xl p-3 mt-3.5"
                >
                  <Ionicons name="hourglass-outline" size={15} color={tokens.color.info.default} />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[11px] font-semibold ml-2 flex-1 leading-relaxed"
                  >
                    {data.pendingRewards} {data.pendingRewards === 1 ? 'reward is' : 'rewards are'}{' '}
                    waiting on somebody finishing their first week.
                  </Text>
                </View>
              ) : null}
            </CreatorCard>
          </CreatorSection>

          {/* ── Terms ────────────────────────────────────────────────────── */}
          <CreatorSection title="The terms">
            <CreatorCard>
              {data.terms.map((term, index) => (
                <View key={index} className="flex-row items-start mb-2 last:mb-0">
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[12px] font-bold mr-2"
                  >
                    •
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[12px] font-medium flex-1 leading-relaxed"
                  >
                    {term}
                  </Text>
                </View>
              ))}
            </CreatorCard>
          </CreatorSection>

          {/* ── History ──────────────────────────────────────────────────── */}
          <CreatorSection title="Everyone you invited" count={history.referrals.length}>
            {history.isLoading ? (
              <View className="py-10 items-center">
                <ActivityIndicator size="small" color={tokens.color.primary[500]} />
              </View>
            ) : history.referrals.length === 0 ? (
              <CreatorEmptyState
                icon="person-add-outline"
                title="Nobody yet"
                body="Share your link and the people who join will appear here, with where each one has got to."
              />
            ) : (
              <CreatorCard padded={false}>
                <View className="px-4">
                  {history.referrals.map((referral) => (
                    <ReferralRow key={referral.referralId} referral={referral} />
                  ))}
                </View>

                {history.hasNextPage ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Load more referrals"
                    accessibilityState={{ busy: history.isFetchingNextPage }}
                    disabled={history.isFetchingNextPage}
                    onPress={() => history.fetchNextPage()}
                    className="py-4 items-center"
                  >
                    <Text
                      style={{ color: tokens.color.primary[500] }}
                      className="text-[11px] font-black uppercase tracking-wider"
                    >
                      {history.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Text>
                  </Pressable>
                ) : null}
              </CreatorCard>
            )}
          </CreatorSection>

          {/* ── Where the points land ────────────────────────────────────── */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your rewards to see your points balance"
            onPress={() => router.push('/creator/rewards')}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-2xl border p-4 mb-6"
          >
            <Ionicons name="sparkles-outline" size={17} color={tokens.color.text.secondary} />
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-bold ml-3 flex-1"
            >
              Referral points land in your rewards balance
            </Text>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </Pressable>
        </View>
      ) : null}
    </CreatorScreen>
  );
}
