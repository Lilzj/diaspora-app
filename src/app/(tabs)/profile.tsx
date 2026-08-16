import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useReputationStore } from '@/store/reputation';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import { useExploreStore } from '@/store/explore';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { reputation, loadReputation } = useReputationStore();
  const insets = useSafeAreaInsets();

  // Explore state progress
  const completedTutorials = useExploreStore((state) => state.completedTutorials);
  const totalTutorials = 10;
  const completionPercentage = Math.round((completedTutorials.length / totalTutorials) * 100);

  useEffect(() => {
    loadReputation();
    useExploreStore.getState().loadPersistedState(); // Load state
  }, []);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center justify-between">
        <Text className="text-2xl font-black text-content-primary tracking-tight">My Profile</Text>
        <TouchableOpacity onPress={() => { logout(); router.replace('/(auth)/login'); }} className="bg-surface-background p-2 rounded-xl border border-subtle">
          <Text className="text-xs font-bold text-error-default">Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Core Identity Panel */}
        <View className="bg-surface-card p-6 border-b border-faint items-center">
          <Avatar name={user?.fullName || 'Amara Kone'} size={84} />
          
          <View className="flex-row items-center mt-3.5">
            <Text className="text-xl font-black text-content-primary mr-2">{user?.fullName || 'Amara Kone'}</Text>
            <Text className="text-xs bg-[#E6F4EA] text-success-default px-2 py-0.5 rounded font-extrabold">✓ VERIFIED</Text>
          </View>
          <Text className="text-xs text-content-muted font-semibold mb-3">{(user as any)?.email || 'amara@diaspora.com'}</Text>

          {/* Reputation Badge */}
          {reputation && (
            <TouchableOpacity
              onPress={() => router.push('/profile/reputation')}
              className="bg-surface-background px-4 py-2.5 rounded-full flex-row items-center border border-subtle mb-6"
            >
              <ReputationBadge level={reputation.level} />
              <Text className="text-[10px] text-primary-500 font-extrabold ml-2 border-l border-subtle pl-2">
                REPUTATION DASHBOARD →
              </Text>
            </TouchableOpacity>
          )}

          {/* Profile Card — first, and first for a reason.

              This is where the profile icon that used to sit top-right on
              `/creator` went. It opened the creator profile, which is a
              *profile*, from a screen about your work — a second front door to
              something this tab owns. The header there now carries the
              content-health badge instead, which is the one genuinely urgent
              thing on that screen.

              Above Wallet because it is the identity everything below belongs
              to. */}
          <TouchableOpacity
            onPress={() => router.push('/creator/profile')}
            className="w-full bg-surface-card border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Profile. Your public page, your about section and your badges."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">👤</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Profile</Text>
                <Text className="text-xs text-content-muted mt-0.5">Your public page, about and badges</Text>
              </View>
            </View>
            <Text className="text-content-secondary font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Wallet Card — B15's financial surface. Placed above Creator Studio
              because money is the thing people come looking for, and because
              B13's billing notifications deep-link to /wallet, which has to be
              reachable without one. */}
          <TouchableOpacity
            onPress={() => router.push('/wallet')}
            className="w-full bg-secondary-50 border border-secondary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Wallet. See your balance, transactions and payments."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">👛</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Wallet</Text>
                <Text className="text-xs text-content-muted mt-0.5">Balance, transactions and payments</Text>
              </View>
            </View>
            <Text className="text-secondary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Grow Card — Phase 6's business surface. Sits below the wallet
              because it is the layer above it: the wallet is your money, this is
              what you sell and promote with it. One entry point rather than
              scattering promotion, plan and billing rows through the profile. */}
          <TouchableOpacity
            onPress={() => router.push('/monetization')}
            className="w-full bg-primary-50 border border-primary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Grow. Promotions, plans, advertising and billing for what you sell on Diaspora."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📈</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Grow</Text>
                <Text className="text-xs text-content-muted mt-0.5">Promotions, plans and advertising</Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Analytics Card — Frontend Phase 15. The one entry point into the
              analytics tree, and the hub behind it decides what this member is
              actually offered: a creator sees their reach, a seller sees listing
              performance, a platform administrator sees the platform. A dashboard
              they have no capability for is not rendered there at all. */}
          <TouchableOpacity
            onPress={() => router.push('/analytics')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Analytics. What Diaspora can tell you about your content, your money and your community."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📊</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Analytics</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Your content, your money, your community
                </Text>
              </View>
            </View>
            <Text className="text-content-muted font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Creator Studio — one card, because there is now one screen.

              This tab used to show two: "Creator" pointing at `/creator`, and
              "Creator Studio" pointing at `/profile/creator-dashboard`. They
              were two screens about the same work, and putting both here made
              the tab the place where a member first had to guess which one they
              wanted. */}
          <TouchableOpacity
            onPress={() => router.push('/creator')}
            className="w-full bg-secondary-50 border border-secondary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Creator Studio. Your standing, everything you have published, your organisations and your creator programme."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">🎨</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Creator Studio</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Your standing, your work, organisations and rewards
                </Text>
              </View>
            </View>
            <Text className="text-secondary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Trust & Safety Center Card */}
          <TouchableOpacity
            onPress={() => router.push('/profile/trust-center')}
            className="w-full bg-success-surface border border-[#CEEAD6] rounded-3xl p-4 flex-row items-center justify-between mb-3"
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">🛡️</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Trust & Safety Center</Text>
                <Text className="text-xs text-content-muted mt-0.5">Manage verifications, sessions & privacy</Text>
              </View>
            </View>
            <Text className="text-success-default font-extrabold text-xs font-black">VIEW →</Text>
          </TouchableOpacity>

          {/* Settings. `/settings` was in the notification route allow-list with
              no screen behind it, and the eight screens beneath it had no index
              — each was only reachable from whatever happened to link to it.
              Appearance (Light / Dark / System) lives there. */}
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-4"
            accessibilityRole="button"
            accessibilityLabel="Settings. Appearance, language, location, notifications and privacy."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">⚙️</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Settings</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Appearance, language, location, notifications and privacy
                </Text>
              </View>
            </View>
            <Text className="text-content-muted font-extrabold text-xs font-black">OPEN →</Text>
          </TouchableOpacity>

          {/* Explore Diaspora Hub Card */}
          <TouchableOpacity
            onPress={() => router.push('/explore')}
            className="w-full bg-info-surface border border-info-default/20 rounded-3xl p-4 flex-row items-center justify-between mb-4"
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">🚀</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Explore Diaspora Hub</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Interactive education ({completedTutorials.length}/{totalTutorials} Guides Completed)
                </Text>
                {/* Micro Progress Bar */}
                <View className="h-1.5 w-full bg-subtle rounded-full overflow-hidden mt-1.5">
                  <View
                    className="h-full bg-info-default rounded-full"
                    style={{ width: `${Math.min(100, completionPercentage)}%` }}
                  />
                </View>
              </View>
            </View>
            <Text className="text-info-default font-extrabold text-xs font-black">ENTER →</Text>
          </TouchableOpacity>

          {/* Frontend Phase 18 — Automations. §6 asks for one Automation Center
              rather than a management screen per module, and this is the single
              entry point into it. Placed here rather than under Settings
              because an automation is something a member *has*, like their
              saved items, not something they configure once. */}
          <TouchableOpacity
            onPress={() => router.push('/automation')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3"
            accessibilityRole="button"
            accessibilityLabel="Automations. Set things up once and let Diaspora watch for you."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">⚡</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Automations</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Set it up once and Diaspora watches for you
                </Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/*
            Removed: a "Profile 75% Complete" ring, a 2 yrs / helpful votes /
            #14 London Rank strip, a country-reputation grid, and three
            sub-tabs — My Contributions, Saved Collections, My Drafts.

            The figures were invented. `75%` was a literal, and so was the
            `strokeDashoffset` drawing the ring; `2 yrs` and `#14` were
            literals too. Only the helpful-vote count came from anywhere,
            and it fell back to a hard-coded 45.

            The tabs were duplicates. My Contributions and My Drafts are
            Creator Studio's Workspace, which lists everything published and
            every draft from the store that actually holds them — these read
            `mockGuides` and a `mockDrafts` array declared in this file.
            Both Saved rows pushed to `/saved`, a real screen reachable from
            Home and from the notification allow-list, so nothing lost a
            route.

            What a profile tab is for is above: who you are, and the way in
            to each surface that owns your work.
          */}
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
