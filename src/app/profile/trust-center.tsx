// ── Where this screen's data comes from, after Wave D-4 ──────────────────────
//
// All of it from `/api/v1/trust`. Before, all of it from the device:
// verification statuses and country standings from a seeded `store/trust.ts`,
// feature gates from `TrustEngine.getFeatureUnlockRequirements` computing
// against `GOVERNANCE_CONFIG`, and the "Internal Risk Index" from
// `TrustEngine.calculateRiskScore()` — a number this file invented and then
// displayed to the member under an "Admin view" label.
//
// **The risk panel is now conditional and almost nobody sees it.** The server
// omits `riskScore` and `riskLevel` unless the caller holds
// `trust:verification:review`, on the stated grounds that *"a number the client
// receives is a number the member can read"*. So the panel renders for staff and
// is absent otherwise, rather than showing everyone a fabricated 12/100.
//
// The store is still hydrated from the profile — `useTrustProfile` does it —
// because `lib/trustEngine.ts` reads it synchronously from four create screens
// that cannot call a hook. One source, one direction: server → store → engine.
//
// Since 14–15 Sep 2026 the four create screens — jobs, guides, homes and items —
// no longer consult the engine at all. Each asks what the service taking the
// post asks: a feature on the member's access decision, granted to verified
// accounts. The engine was asked about a hard-coded 'GB' and held thresholds no
// service checked, so it locked screens whose posts the API accepted. The
// server's own requirements for those four are now empty, and this screen shows
// them as unlocked.

import React, { useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useFeatureRequirements, useMyVerifications, useTrustProfile, useTrustTimeline } from '@/hooks/trust';
import { useEmailIdentity } from '@/hooks/integrations';
import {
  isVerificationGranted,
  isVerificationInFlight,
  latestVerificationOfType,
  needsMemberAction,
} from '@/lib/trust-api';
import type { VerificationStatus } from '@/types/trust';
import { ACCOUNT_HEALTH_LABELS } from '@/types/trust';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { useAuthStore } from '@/store/auth';

/**
 * The country the gates are measured against.
 *
 * It used to be the literal `'GB'`, in one place and passed to the server —
 * which was the improvement that made this fixable, and this is the fix.
 *
 * Hard-coded, every member's unlock requirements were computed against Britain.
 * A member in Toronto read British thresholds, was told which British
 * requirements they had not met, and saw a Country Experience timeline measured
 * somewhere they had never lived. On a screen whose entire subject is where
 * somebody lives, that was the one value it could not afford to invent.
 *
 * `residenceCountry` comes from `GET /auth/me` — `UserProfileResponse` marks it
 * required — and is mapped in `store/auth.ts`. Null while the profile is still
 * loading, which the hook accepts: an unscoped answer is a worse gate than none,
 * but it is a great deal better than a confidently wrong one.
 */
function useGateCountry(): string | null {
  const { user } = useAuthStore();

  return user?.residenceCountry ?? null;
}

/** How a verification row reads, from its latest case. */
function rowState(status: VerificationStatus | null): { label: string; boxClass: string; textClass: string } {
  if (isVerificationGranted(status)) {
    return { label: '✓ Approved', boxClass: 'bg-surface-muted border-success-default', textClass: 'text-success-default' };
  }
  if (isVerificationInFlight(status)) {
    return { label: 'In review', boxClass: 'bg-surface-muted border-subtle', textClass: 'text-content-secondary' };
  }
  if (needsMemberAction(status)) {
    return { label: 'Action needed', boxClass: 'bg-surface-muted border-warning-default', textClass: 'text-warning-default' };
  }
  return { label: 'Verify', boxClass: 'bg-primary-500/10 border-primary-500/30', textClass: 'text-primary-500' };
}

export default function TrustCenterScreen() {
  const [activeTab, setActiveTab] = useState<'overview' | 'unlocks' | 'journey'>('overview');

  // `useTrustProfile` also hydrates `store/trust.ts` from the response, so
  // `lib/trustEngine.ts` — which cannot be a hook, because it is called from
  // submit handlers on four create screens — reads the same answer this screen
  // renders instead of its own seeded copy.
  const { profile, canSeeRisk, riskScore, riskLevel, isLoading, error } = useTrustProfile();
  // Each verification's latest case: tells "never started" from "in review".
  const { verifications } = useMyVerifications();
  const statusOf = (type: string): VerificationStatus | null =>
    latestVerificationOfType(verifications, type as never)?.status ?? null;
  const emailVerified = useEmailIdentity().email?.isVerified === true;
  const timeline = useTrustTimeline();
  const gateCountry = useGateCountry();
  const gates = useFeatureRequirements(gateCountry);

  const health = profile ? ACCOUNT_HEALTH_LABELS[profile.healthStatus.health] : null;
  const unlocks = gates.requirements;

  const getHealthColor = (h: string) => {
    switch (h) {
      case 'Excellent': return 'text-emerald-500 bg-surface-muted border-subtle';
      case 'Good': return 'text-success-default bg-surface-muted border-subtle';
      case 'Restricted': return 'text-warning-default bg-surface-muted border-subtle';
      case 'Suspended': return 'text-error-default bg-surface-muted border-subtle';
      default: return 'text-content-muted bg-surface-muted border-subtle';
    }
  };

  const getAccountStateColor = (state: string) => {
    switch (state) {
      case 'DiasporaVerified':
      case 'FullCommunityAccess':
        return 'text-emerald-500 bg-emerald-55 border-emerald-250';
      case 'LimitedAccess':
        return 'text-content-muted bg-surface-background border-subtle';
      case 'DiasporaVerificationPending':
      case 'VerificationUnderReview':
      case 'AppealPending':
        return 'text-amber-500 bg-surface-muted border-amber-250';
      case 'VerificationRejected':
      case 'RequiresMoreInformation':
      case 'Suspended':
        return 'text-error-default bg-surface-muted border-error-default/20';
      default:
        return 'text-content-muted bg-surface-muted border-subtle';
    }
  };

  const getAccountStateLabel = (state: string) => {
    switch (state) {
      case 'DiasporaVerified': return 'Verified';
      case 'FullCommunityAccess': return 'Full Access';
      case 'LimitedAccess': return 'Limited Access';
      case 'DiasporaVerificationPending': return 'Pending';
      case 'VerificationUnderReview': return 'Under Review';
      case 'AppealPending': return 'Appeal Pending';
      case 'VerificationRejected': return 'Rejected';
      case 'RequiresMoreInformation': return 'More Info';
      case 'Suspended': return 'Suspended';
      default: return state;
    }
  };

  const { user } = useAuthStore();
  const accountState = user?.accountState || 'LimitedAccess';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader 
        title="Trust & Safety Center" 
        showBack 
        rightAction={
          <TouchableOpacity onPress={() => router.push('/profile/community-guidelines')} className="p-2">
            <Text className="text-xs font-black text-primary-500 uppercase">Guidelines</Text>
          </TouchableOpacity>
        }
      />

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="profile">

        {/*
          A failed profile read is stated, not hidden behind stale-looking
          zeroes. Every number on this screen comes from that one call, so if it
          did not arrive there is nothing here to trust.
        */}
        {error !== null && (
          <View className="bg-surface-muted border-b border-error-default/20 p-4">
            <Text className="text-xs font-extrabold text-error-default mb-0.5">
              We could not load your trust profile
            </Text>
            <Text className="text-xs text-content-tertiary">{error}</Text>
          </View>
        )}


        {/* Account Safety / Community Access Status Banner */}
        <View className="bg-surface-card p-6 border-b border-faint">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-[10px] text-content-faint font-extrabold uppercase tracking-widest">Community Access Status</Text>
              <Text className="text-2xl font-black text-content-primary tracking-tight mt-0.5">Diaspora Verification</Text>
            </View>
            <View className={`px-3 py-1.5 rounded-xl border ${getAccountStateColor(accountState)}`}>
              <Text className="text-xs font-black uppercase tracking-wider">{getAccountStateLabel(accountState)}</Text>
            </View>
          </View>

          {accountState === 'LimitedAccess' ? (
            <View className="bg-amber-55 border border-subtle rounded-2xl p-4 mb-2">
              <Text className="text-xs font-extrabold text-warning-default mb-1">🔒 Limited Community Access Active</Text>
              <Text className="text-xs text-content-tertiary">
                Verify your identity and country residency to unlock providers, jobs, housing, and messaging.
              </Text>
            </View>
          ) : accountState === 'VerificationUnderReview' || accountState === 'DiasporaVerificationPending' ? (
            <View className="bg-amber-55 border border-amber-250 rounded-2xl p-4 mb-2">
              <Text className="text-xs font-extrabold text-warning-default mb-1">⏳ Verification Under Compliance Review</Text>
              <Text className="text-xs text-content-tertiary">
                Our safety agents are manually checking your uploaded documents. Check back soon.
              </Text>
            </View>
          ) : accountState === 'VerificationRejected' ? (
            <View className="bg-surface-muted border border-error-default/20 rounded-2xl p-4 mb-2">
              <Text className="text-xs font-extrabold text-error-default mb-1">⚠️ Verification Document Rejected</Text>
              <Text className="text-xs text-content-tertiary">
                Your submitted scan could not be verified. You can retry upload or file an appeal.
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-content-muted leading-relaxed mb-2">
              Your account has full verified community access. Thank you for maintaining trust.
            </Text>
          )}

          {/*
            The risk index, when the server sent one.

            It is staff-only: `GET /trust/profile` omits `riskScore` and
            `riskLevel` unless the caller holds `trust:verification:review`. For
            an ordinary member this block does not render at all, which is the
            correction — the previous version computed a score on the device and
            showed it to everyone.
          */}
          {canSeeRisk && riskLevel !== null && riskScore !== null && (
            <View className="bg-surface-background border border-subtle rounded-2xl p-3 flex-row justify-between items-center mt-2">
              <Text className="text-[10px] font-bold text-content-muted uppercase">🛡️ Internal Risk Index (Admin view)</Text>
              <Text className={`text-xs font-black ${riskLevel === 'Low' ? 'text-success-default' : riskLevel === 'Medium' ? 'text-warning-default' : 'text-error-default'}`}>
                {riskLevel} ({riskScore}/100)
              </Text>
            </View>
          )}

          {/* Account health, which the server does send to the member. */}
          {health !== null && (
            <View className={`border rounded-2xl p-3 flex-row justify-between items-center mt-2 ${getHealthColor(profile?.healthStatus.health ?? '')}`}>
              <Text className="text-[10px] font-bold uppercase">Account health</Text>
              <Text className="text-xs font-black uppercase">{health}</Text>
            </View>
          )}
        </View>

        {/* Tab Selector */}
        <View className="flex-row bg-surface-card border-b border-faint">
          {[
            { id: 'overview', label: 'Verifications' },
            { id: 'unlocks', label: 'Feature Gates' },
            { id: 'journey', label: 'Trust Journey' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id as any)}
                className={`flex-1 items-center py-4 border-b-2 ${active ? 'border-primary-500' : 'border-transparent'}`}
              >
                <Text className={`text-xs font-bold ${active ? 'text-primary-500' : 'text-content-muted'}`}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="p-6">
          
          {/* Tab 1: Verifications Overview */}
          {activeTab === 'overview' && (
            <View className="gap-6">
              
              {/* Layered Verifications Checklist */}
              <TourSpotlight spotlightKey="trust_status_card">
              <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-4">Verification Ranks</Text>
                
                <View className="gap-4">
                  {/* One state per row, from the member's own cases (20 Oct 2026):
                      the row said "Verify" and opened an empty form while a
                      submitted residency case sat in review. Government ID is
                      not offered: nothing on the platform depends on it. */}
                  {[
                    { id: 'Phone', label: 'Phone Linked', desc: 'Secure sign-in and account recovery', icon: '📱', route: '/verification/phone', status: statusOf('Phone') },
                    { id: 'Diaspora', label: 'Diaspora Verification', desc: 'Your nationality and where you live — unlocks publishing jobs, homes, listings and guides', icon: '🛡️', route: '/verification/diaspora', status: statusOf('Diaspora') },
                    { id: 'Country', label: 'Country Residency', desc: 'Proof of where you live now — Verified Resident badge, local posts for that country, and your confirmations count as a resident’s', icon: '🏠', route: '/verification/country', status: statusOf('Country') },
                    { id: 'Email', label: 'Email Verified', desc: 'The address you confirmed when you registered', icon: '✉️', route: '/settings/integrations/email', status: (emailVerified ? 'Approved' : statusOf('Email')) as VerificationStatus | null },
                  ].map((v) => {
                    const state = rowState(v.status);
                    return (
                      <View key={v.id} className="flex-row items-center justify-between border-b border-faint pb-3 last:border-b-0 last:pb-0">
                        <View className="flex-row items-center flex-1 mr-4">
                          <Text className="text-2xl mr-3">{v.icon}</Text>
                          <View className="flex-1">
                            <Text className="text-sm font-extrabold text-content-primary">{v.label}</Text>
                            <Text className="text-[10px] text-content-muted mt-0.5">{v.desc}</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          onPress={() => router.push(v.route as any)}
                          accessibilityRole="button"
                          accessibilityLabel={`${v.label}: ${state.label}`}
                          className={`px-3 py-1.5 rounded-xl border ${state.boxClass}`}
                        >
                          <Text className={`text-[10px] font-black uppercase ${state.textClass}`}>{state.label}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
              </TourSpotlight>

              {/* Country timelines and reputation details */}
              <TourSpotlight spotlightKey="trust_reputation_tiers">
              <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-4">Country Experience timeline</Text>
                
                {(profile?.experienceTimeline.length ?? 0) === 0 && (
                  <Text className="text-xs text-content-muted leading-relaxed">
                    {isLoading
                      ? 'Loading your country history…'
                      : 'No verified country history yet. Verify your residency to start one.'}
                  </Text>
                )}

                <View className="gap-4">
                  {(profile?.experienceTimeline ?? []).map((c) => {
                    const rep = profile?.countryReputations.find(r => r.countryCode === c.countryCode);
                    // No fallback star rating. `stars` used to default to 3 for
                    // a country with no standing, which drew three filled stars
                    // beside "0 pts".
                    const stars = rep ? rep.stars : 0;
                    return (
                      <View key={c.countryCode} className="border-b border-faint pb-3 last:border-b-0 last:pb-0">
                        <View className="flex-row justify-between items-start">
                          <View className="flex-row items-center">
                            <Text className="text-xl mr-3">{c.flag}</Text>
                            <View>
                              <Text className="text-sm font-extrabold text-content-primary">{c.countryName}</Text>
                              <Text className="text-[10px] text-content-muted mt-0.5">
                                {c.startYear} – {c.endYear || 'Present'} · {c.role}
                              </Text>
                            </View>
                          </View>
                          
                          <View className="items-end">
                            <Text className="text-xs font-black text-primary-500">{rep ? `${rep.points} pts` : '0 pts'}</Text>
                            <Text className="text-[10px] mt-0.5 text-amber-500">{'★'.repeat(stars)}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/*
                  The timeline above is Trust's answer — the countries a reviewer
                  confirmed. The screen behind this link is the member's own, and
                  the only place in the app they can say they have left one.
                  Without it a member who moved stayed a current resident of the
                  country they left, for ever.
                */}
                <TouchableOpacity
                  onPress={() => router.push('/profile/residence')}
                  className="mt-4 pt-4 border-t border-faint"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-extrabold text-primary-500">
                    Moved country? Update where you live →
                  </Text>
                </TouchableOpacity>
              </View>
              </TourSpotlight>

            </View>
          )}

          {/* Tab 2: Feature Unlocks */}
          {activeTab === 'unlocks' && (
            <View className="gap-4">
              {gates.isLoading && unlocks.length === 0 && (
                <View className="items-center py-8" accessibilityLabel="Loading your feature gates">
                  <ActivityIndicator />
                </View>
              )}
              {gates.error !== null && (
                <View className="bg-surface-muted border border-error-default/20 rounded-3xl p-5">
                  <Text className="text-xs font-extrabold text-error-default mb-1">
                    Feature gates unavailable
                  </Text>
                  <Text className="text-xs text-content-tertiary">{gates.error}</Text>
                </View>
              )}
              {unlocks.map((f) => (
                <View key={f.featureId} className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-sm font-black text-content-primary">{f.name}</Text>
                    <View className={`px-2 py-1 rounded-lg border ${f.isUnlocked ? 'bg-surface-muted border-success-default' : 'bg-surface-background border-subtle'}`}>
                      <Text className={`text-[9px] font-black uppercase ${f.isUnlocked ? 'text-success-default' : 'text-content-faint'}`}>
                        {f.isUnlocked ? '✓ Unlocked' : 'Locked'}
                      </Text>
                    </View>
                  </View>

                  {/* Requirements List */}
                  <View className="space-y-2 mt-2">
                    {f.requirements.map((r, idx) => (
                      <View key={idx} className="flex-row justify-between items-center py-1.5 border-t border-faint">
                        <Text className="text-xs text-content-tertiary font-medium">
                          {r.isMet ? '✅' : '❌'} {r.description}
                        </Text>
                        <Text className="text-[10px] font-bold text-content-muted">{r.currentProgress}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Tab 3: Visual Trust Journey */}
          {activeTab === 'journey' && (
            <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-6">Your diaspora progress timeline</Text>

              {timeline.isLoading && (
                <View className="items-center py-8" accessibilityLabel="Loading your trust journey">
                  <ActivityIndicator />
                </View>
              )}

              {timeline.isEmpty && (
                <Text className="text-xs text-content-muted leading-relaxed">
                  Your trust journey starts with your first verification.
                </Text>
              )}

              {timeline.error !== null && (
                <Text className="text-xs text-error-default leading-relaxed">{timeline.error}</Text>
              )}

              <View className="pl-4 border-l-2 border-subtle space-y-8 relative">
                {timeline.events.map((evt) => (
                  <View key={evt.eventId} className="relative mb-6">
                    {/* Event Circle Anchor */}
                    <View className="absolute -left-[27px] top-0 w-4 h-4 rounded-full bg-primary-500 border-2 border-white items-center justify-center shadow" />

                    <View className="flex-row items-center gap-1.5 mb-1">
                      <Text className="text-sm">{evt.icon}</Text>
                      <Text className="text-xs font-black text-content-primary">{evt.label}</Text>
                      {/*
                        An ISO instant, not the date string the seeded store
                        held. Sliced rather than formatted so a timezone library
                        is not dragged into this screen for one line.
                      */}
                      <Text className="text-[9px] text-content-faint font-bold ml-auto">
                        {evt.timestamp.slice(0, 10)}
                      </Text>
                    </View>
                    {evt.description !== null && evt.description !== undefined && (
                      <Text className="text-xs text-content-muted leading-relaxed pl-1">{evt.description}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/*
            The "Governance Controls" card stood here — privacy, trusted
            devices, the security audit log and appeals. All four are in
            Settings now.

            Nothing replaces it. A card whose only purpose was to say "that
            moved" is a redirect rendered as content: it takes a full section of
            a screen to tell the member about a screen they were not looking
            for. The Trust Centre states what Diaspora has verified about you,
            and stops there.

            The tour's `trust_privacy_toggles` step moved with it, to the
            governance section this page still owns.
          */}
        </View>

      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
