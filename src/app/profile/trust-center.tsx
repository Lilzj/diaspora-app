import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTrustStore } from '@/store/trust';
import { TrustEngine } from '@/lib/trustEngine';
import { REPUTATION_LEVEL_ICONS, REPUTATION_LEVEL_LABELS } from '@/types/reputation';
import type { VerificationType } from '@/types/trust';
import { useAuthStore } from '@/store/auth';

export default function TrustCenterScreen() {
  const trustStore = useTrustStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'unlocks' | 'journey'>('overview');

  const health = trustStore.healthStatus.health;
  const verifications = trustStore.verifications;

  // Evaluate feature unlock statuses
  const unlocks = TrustEngine.getFeatureUnlockRequirements('GB');
  
  // Calculate Internal Risk Score for display (in sandbox simulation)
  const riskDetails = TrustEngine.calculateRiskScore();

  const getHealthColor = (h: string) => {
    switch (h) {
      case 'Excellent': return 'text-emerald-500 bg-emerald-50 border-emerald-200';
      case 'Good': return 'text-success-default bg-[#E6F4EA] border-[#CEEAD6]';
      case 'Restricted': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'Suspended': return 'text-error-default bg-error-surface border-[#FFE3E3]';
      default: return 'text-neutral-500 bg-neutral-100 border-neutral-200';
    }
  };

  const getAccountStateColor = (state: string) => {
    switch (state) {
      case 'DiasporaVerified':
      case 'FullCommunityAccess':
        return 'text-emerald-500 bg-emerald-55 border-emerald-250';
      case 'LimitedAccess':
        return 'text-neutral-500 bg-neutral-50 border-neutral-200';
      case 'DiasporaVerificationPending':
      case 'VerificationUnderReview':
      case 'AppealPending':
        return 'text-amber-500 bg-amber-50 border-amber-250';
      case 'VerificationRejected':
      case 'RequiresMoreInformation':
      case 'Suspended':
        return 'text-error-default bg-[#FFF5F5] border-error-default/20';
      default:
        return 'text-neutral-500 bg-neutral-100 border-neutral-200';
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
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
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
        
        {/* Account Safety / Community Access Status Banner */}
        <View className="bg-white p-6 border-b border-neutral-100">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-widest">Community Access Status</Text>
              <Text className="text-2xl font-black text-neutral-900 tracking-tight mt-0.5">Diaspora Verification</Text>
            </View>
            <View className={`px-3 py-1.5 rounded-xl border ${getAccountStateColor(accountState)}`}>
              <Text className="text-xs font-black uppercase tracking-wider">{getAccountStateLabel(accountState)}</Text>
            </View>
          </View>

          {accountState === 'LimitedAccess' ? (
            <View className="bg-amber-55 border border-amber-200 rounded-2xl p-4 mb-2">
              <Text className="text-xs font-extrabold text-amber-600 mb-1">🔒 Limited Community Access Active</Text>
              <Text className="text-xs text-neutral-600">
                Verify your identity and country residency to unlock providers, jobs, housing, and messaging.
              </Text>
            </View>
          ) : accountState === 'VerificationUnderReview' || accountState === 'DiasporaVerificationPending' ? (
            <View className="bg-amber-55 border border-amber-250 rounded-2xl p-4 mb-2">
              <Text className="text-xs font-extrabold text-amber-600 mb-1">⏳ Verification Under Compliance Review</Text>
              <Text className="text-xs text-neutral-600">
                Our safety agents are manually checking your uploaded documents. Check back soon.
              </Text>
            </View>
          ) : accountState === 'VerificationRejected' ? (
            <View className="bg-[#FFF5F5] border border-error-default/20 rounded-2xl p-4 mb-2">
              <Text className="text-xs font-extrabold text-error-default mb-1">⚠️ Verification Document Rejected</Text>
              <Text className="text-xs text-neutral-600">
                Your submitted scan could not be verified. You can retry upload or file an appeal.
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-neutral-500 leading-relaxed mb-2">
              Your account has full verified community access. Thank you for maintaining trust.
            </Text>
          )}

          {/* Internal Developer Risk Score (Mock-exposed only in Sandbox) */}
          <View className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 flex-row justify-between items-center mt-2">
            <Text className="text-[10px] font-bold text-neutral-500 uppercase">🛡️ Internal Risk Index (Admin view)</Text>
            <Text className={`text-xs font-black ${riskDetails.level === 'Low' ? 'text-emerald-600' : riskDetails.level === 'Medium' ? 'text-amber-600' : 'text-error-default'}`}>
              {riskDetails.level} ({riskDetails.scoreValue}/100)
            </Text>
          </View>
        </View>

        {/* Tab Selector */}
        <View className="flex-row bg-white border-b border-neutral-100">
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
                <Text className={`text-xs font-bold ${active ? 'text-primary-500' : 'text-neutral-500'}`}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="p-6">
          
          {/* Tab 1: Verifications Overview */}
          {activeTab === 'overview' && (
            <View className="gap-6">
              
              {/* Layered Verifications Checklist */}
              <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
                <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-4">Verification Ranks</Text>
                
                <View className="gap-4">
                  {[
                    { id: 'Phone', label: 'Phone Linked', desc: 'Secure login & SMS bindings', icon: '📱', route: '/verification/phone', approved: verifications.Phone === 'Approved' },
                    { id: 'Country', label: 'Diaspora Verification', desc: 'Nationality & Residence document audit', icon: '🛡️', route: '/verification/diaspora', approved: accountState === 'DiasporaVerified' || accountState === 'FullCommunityAccess' },
                    { id: 'Identity', label: 'Stripe Biometric Match', desc: 'Biometric face matching check', icon: '🆔', route: '/verification/identity', approved: verifications.Identity === 'Approved' },
                    { id: 'Email', label: 'Email Verified', desc: 'Future verification channel', icon: '✉️', route: null, approved: verifications.Email === 'Approved' },
                  ].map((v) => {
                    const approved = v.approved;
                    return (
                      <View key={v.id} className="flex-row items-center justify-between border-b border-neutral-50 pb-3 last:border-b-0 last:pb-0">
                        <View className="flex-row items-center flex-1 mr-4">
                          <Text className="text-2xl mr-3">{v.icon}</Text>
                          <View className="flex-1">
                            <Text className="text-sm font-extrabold text-neutral-850">{v.label}</Text>
                            <Text className="text-[10px] text-neutral-500 mt-0.5">{v.desc}</Text>
                          </View>
                        </View>
                        
                        {v.route ? (
                          <TouchableOpacity
                            onPress={() => router.push(v.route as any)}
                            className={`px-3 py-1.5 rounded-xl border ${approved ? 'bg-success-surface border-success-default text-success-default' : 'bg-primary-500/10 border-primary-500/30'}`}
                          >
                            <Text className={`text-[10px] font-black uppercase ${approved ? 'text-success-default' : 'text-primary-500'}`}>
                              {approved ? '✓ Approved' : 'Verify'}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <View className="bg-neutral-100 border border-neutral-200 px-3 py-1.5 rounded-xl">
                            <Text className="text-[10px] text-neutral-400 font-extrabold uppercase">Unverified</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Country timelines and reputation details */}
              <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
                <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-4">Country Experience timeline</Text>
                
                <View className="gap-4">
                  {trustStore.experienceTimeline.map((c) => {
                    const rep = trustStore.countryReputations.find(r => r.countryCode === c.countryCode);
                    const stars = rep ? rep.stars : 3;
                    return (
                      <View key={c.countryCode} className="border-b border-neutral-50 pb-3 last:border-b-0 last:pb-0">
                        <View className="flex-row justify-between items-start">
                          <View className="flex-row items-center">
                            <Text className="text-xl mr-3">{c.flag}</Text>
                            <View>
                              <Text className="text-sm font-extrabold text-neutral-850">{c.countryName}</Text>
                              <Text className="text-[10px] text-neutral-500 mt-0.5">
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
              </View>

            </View>
          )}

          {/* Tab 2: Feature Unlocks */}
          {activeTab === 'unlocks' && (
            <View className="gap-4">
              {unlocks.map((f) => (
                <View key={f.featureId} className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-sm font-black text-neutral-850">{f.name}</Text>
                    <View className={`px-2 py-1 rounded-lg border ${f.isUnlocked ? 'bg-success-surface border-success-default' : 'bg-neutral-50 border-neutral-200'}`}>
                      <Text className={`text-[9px] font-black uppercase ${f.isUnlocked ? 'text-success-default' : 'text-neutral-400'}`}>
                        {f.isUnlocked ? '✓ Unlocked' : 'Locked'}
                      </Text>
                    </View>
                  </View>

                  {/* Requirements List */}
                  <View className="space-y-2 mt-2">
                    {f.requirements.map((r, idx) => (
                      <View key={idx} className="flex-row justify-between items-center py-1.5 border-t border-neutral-50">
                        <Text className="text-xs text-neutral-600 font-medium">
                          {r.isMet ? '✅' : '❌'} {r.description}
                        </Text>
                        <Text className="text-[10px] font-bold text-neutral-500">{r.currentProgress}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Tab 3: Visual Trust Journey */}
          {activeTab === 'journey' && (
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
              <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-6">Your diaspora progress timeline</Text>

              <View className="pl-4 border-l-2 border-primary-200 space-y-8 relative">
                {trustStore.trustJourney.map((evt, idx) => (
                  <View key={evt.eventId} className="relative mb-6">
                    {/* Event Circle Anchor */}
                    <View className="absolute -left-[27px] top-0 w-4 h-4 rounded-full bg-primary-500 border-2 border-white items-center justify-center shadow" />
                    
                    <View className="flex-row items-center gap-1.5 mb-1">
                      <Text className="text-sm">{evt.icon}</Text>
                      <Text className="text-xs font-black text-neutral-900">{evt.label}</Text>
                      <Text className="text-[9px] text-neutral-400 font-bold ml-auto">{evt.timestamp}</Text>
                    </View>
                    <Text className="text-xs text-neutral-500 leading-relaxed pl-1">{evt.description}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Navigation Action Links */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mt-6 gap-3">
            <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Governance Controls</Text>
            
            {[
              { label: 'Privacy Configuration Settings', desc: 'Define visibility boundaries & precise tracking', route: '/profile/privacy-settings' },
              { label: 'Trusted Devices & Sessions', desc: 'Secure logged devices & active connections', route: '/profile/account-security' },
              { label: 'Security Auditing logs', desc: 'Secure record of logins and settings updates', route: '/profile/audit-log' },
              { label: 'Policy Appeals Centre', desc: 'Submit and appeal moderation suspensions', route: '/profile/appeals' },
            ].map((node, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => router.push(node.route as any)}
                className="flex-row justify-between items-center py-3 border-b border-neutral-50 last:border-b-0 last:pb-0"
              >
                <View className="flex-1 mr-4">
                  <Text className="text-xs font-extrabold text-neutral-800">{node.label}</Text>
                  <Text className="text-[10px] text-neutral-500 mt-0.5">{node.desc}</Text>
                </View>
                <Text className="text-neutral-300 text-lg">›</Text>
              </TouchableOpacity>
            ))}
          </View>

        </View>

        <View className="h-36" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
