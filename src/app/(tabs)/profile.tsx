import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { grantsCommunityAccess } from '@/lib/access-state';
import { useMyReputation } from '@/hooks/trust';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import { useExploreStore } from '@/store/explore';

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();

  /**
   * Whether the platform actually considers this member verified.
   *
   * `grantsCommunityAccess` is the predicate the rest of the app already uses —
   * `DiasporaVerified` or `FullCommunityAccess` — so the badge cannot disagree
   * with what `FeatureGate` opens. Writing a fresh comparison here is how two
   * screens end up with two definitions of the same word.
   *
   * The badge above was hardcoded, so it appeared for everybody, including
   * members the platform had not verified at all.
   */
  const isVerifiedMember = user ? grantsCommunityAccess(user.accountState) : false;
  // The shared cache, so opening the reputation screen from here costs no
  // second request. This tab used to fill a store of its own (FE-11).
  const { reputation } = useMyReputation();
  const insets = useSafeAreaInsets();

  // Explore state progress
  const completedTutorials = useExploreStore((state) => state.completedTutorials);
  const totalTutorials = 10;
  const completionPercentage = Math.round((completedTutorials.length / totalTutorials) * 100);

  useEffect(() => {
    useExploreStore.getState().loadPersistedState(); // Load state
  }, []);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center justify-between">
        <Text className="text-2xl font-black text-content-primary tracking-tight">My Profile</Text>
        {/* Remediation Wave A: `signOut` now invalidates the server session
            before it clears the local one, so it is awaited. Navigating first
            would unmount this screen mid-request. */}
        <TouchableOpacity
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/login');
          }}
          className="bg-surface-background p-2 rounded-xl border border-subtle"
        >
          <Text className="text-xs font-bold text-error-default">Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Core Identity Panel */}
        <View className="bg-surface-card p-6 border-b border-faint items-center">
          {/* ── Three invented values, on the screen that says who you are ──
            *
            * This block read:
            *
            *     user?.fullName || 'Amara Kone'
            *     ✓ VERIFIED                      (hardcoded, unconditional)
            *     user?.email || 'amara@diaspora.com'
            *
            * `GET /auth/me` serves `fullName`, `email`, `accessState` and
            * `isPhoneVerified`. It answered `email: null` for every seeded
            * member, so **every member with no email saw amara@diaspora.com as
            * their own address** — a stranger's, on their identity screen. The
            * name fell back the same way.
            *
            * The badge was worse: it was not a fallback at all. It rendered for
            * anyone, verified or not, which is a trust claim the platform never
            * made about them. It now reads the access state the platform
            * actually returns, and says nothing when that state is not verified
            * rather than guessing at a friendlier word. */}
          <Avatar name={user?.fullName ?? 'Member'} size={84} />

          <View className="flex-row items-center mt-3.5">
            <Text className="text-xl font-black text-content-primary mr-2">
              {user?.fullName ?? 'Your profile'}
            </Text>
            {isVerifiedMember ? (
              <Text className="text-xs bg-surface-muted text-success-default px-2 py-0.5 rounded font-extrabold">
                ✓ VERIFIED
              </Text>
            ) : null}
          </View>

          {/* Absence is rendered as absence. A member who has not given an email
            * address has none, and the phone number is what they signed up with
            * — so that is what identifies them here. */}
          <Text className="text-xs text-content-muted font-semibold mb-3">
            {user?.email ?? user?.phone ?? ''}
          </Text>

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

          {/* Purchases & tenancies.
              Placed beside Wallet because it answers the neighbouring question:
              the wallet says what a member spent, this says what they got.

              It exists at all because `GET /marketplace/reservations` and
              `GET /housing/reservations` had served a member's own transactions
              since those modules shipped and **no screen called either** — so
              somebody could buy something or move into a property and find no
              record of it in the app. It is also the only honest home for "rate
              this": both review routes gate on a completed transaction, so the
              control belongs beside the transaction. */}
          <TouchableOpacity
            onPress={() => router.push('/my-transactions')}
            className="w-full bg-surface-card border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Purchases and tenancies. What you have bought and where you rent."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">🧾</Text>
              <View>
                <Text className="text-sm font-bold text-content-primary">Purchases & tenancies</Text>
                <Text className="text-xs text-content-muted mt-0.5">What you bought, where you rent, and rating them</Text>
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
            className="w-full bg-surface-muted border border-secondary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
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
            className="w-full bg-surface-muted border border-primary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
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
            className="w-full bg-surface-muted border border-secondary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
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
            className="w-full bg-surface-muted border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3"
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
            accessibilityLabel="Settings. Appearance, language, notifications and privacy."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">⚙️</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Settings</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Appearance, language, notifications and privacy
                </Text>
              </View>
            </View>
            <Text className="text-content-muted font-extrabold text-xs font-black">OPEN →</Text>
          </TouchableOpacity>

          {/* Remediation Wave K — the hiring workflow's two entry points.
              `Diaspora.Modules.Jobs` has served applications, decisions,
              interviews and offers since it landed, and nothing in this
              application reached any of it: a member could apply and then had
              no way to see what happened, and no way to become an employer at
              all. Both live here rather than under Settings because an
              application is something a member *has*, like their saved items. */}
          <TouchableOpacity
            onPress={() => router.push('/job/applications')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3"
            accessibilityRole="button"
            accessibilityLabel="My applications. Roles you have applied to, and whether the employer has opened them."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">📄</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">My applications</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  What you applied to, and whether anyone has opened it
                </Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Viewings — 15 Sep 2026. Both sides of the diary: requests for the
              member's homes, which nothing in the app used to show a landlord,
              and the member's own requests to see a home. */}
          <TouchableOpacity
            onPress={() => router.push('/housing/viewings')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3"
            accessibilityRole="button"
            accessibilityLabel="Viewings. Requests to see your homes, and homes you asked to see."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">🗓️</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Viewings</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Requests to see your homes, and homes you asked to see
                </Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* The work profile. Its only way in used to be a refusal on Apply —
              "Create your profile first" — so a member who made one could never
              find it again. Applying needs no profile now; this is where a member
              adds a headline or changes who can find them. */}
          <TouchableOpacity
            onPress={() => router.push('/job/candidate-profile')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3"
            accessibilityRole="button"
            accessibilityLabel="Work profile. An optional headline for employers, and who can find you."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">💼</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Work profile</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  An optional headline for employers, and who can find you
                </Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* One entry, two destinations, because the platform has no route
              that lists the employers a member belongs to — the dashboard
              resolves a sole membership and refuses otherwise. So the workspace
              is offered, and it explains itself when there is nothing behind
              it rather than this screen guessing. */}
          <TouchableOpacity
            onPress={() => router.push('/job/hiring')}
            className="w-full bg-surface-background border border-subtle rounded-3xl p-4 flex-row items-center justify-between mb-3"
            accessibilityRole="button"
            accessibilityLabel="Hiring. Review applicants, shortlist, interview and make offers."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">🏢</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">Hiring</Text>
                <Text className="text-xs text-content-muted mt-0.5">
                  Applicants, shortlisting, interviews and offers
                </Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Explore Diaspora Hub Card */}
          <TouchableOpacity
            onPress={() => router.push('/explore')}
            className="w-full bg-surface-muted border border-info-default/20 rounded-3xl p-4 flex-row items-center justify-between mb-4"
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
