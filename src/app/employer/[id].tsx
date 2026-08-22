// ─────────────────────────────────────────────────────────────────────────────
// NG-04, verified in Remediation Wave K — and the audit was half wrong.
//
// **There is no `GET /employers/{id}` on the backend.** `Diaspora.Modules.Jobs`
// maps exactly three employer routes — `POST /jobs/employers`,
// `PUT /jobs/employers/{employerId}` and `GET /jobs/employers/dashboard`
// (`Api/EmployerEndpoints.cs`) — and no other module serves the path either.
// The register at `config/analytics-gaps.ts:830` states "`GET /employers/{id}`
// is a real employer profile"; that is not true of any deployment.
//
// The audit's second clause — that this screen already renders from the employer
// object embedded in the job response — is **false**. It calls
// `GET /employers/{id}` below, and the only thing that has ever answered is the
// development fixture in `mocks/handlers/jobs.ts`. Against a real API this
// screen 404s.
//
// **Wave K deliberately does not fix it**, because the fix is a backend route
// and inventing a client-side one would be another path waiting to be pointed at
// something that does not exist. What a candidate genuinely can see of an
// employer today is `JobResponse.employer` — a `JobEmployerSummaryResponse`
// carrying the name, the organisation type, whether it is an intermediary, the
// verification badge and the three responsiveness figures — which is embedded in
// the job detail and needs no extra request. That is the honest ceiling, and
// rebuilding this screen on it belongs with the wave that moves job browse and
// detail off the `JobOpportunity` fixture.
//
// The one change made here is that the not-found state now says which of the two
// it is, rather than implying the employer does not exist.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { JobCard } from '@/components/JobCard';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/apiClient';
import type { JobOpportunity } from '@/types/job';
import { useBottomInset } from '@/components/layout/bottom-inset';

interface EmployerProfile {
  providerId: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  rating: number;
  reputationLevel: string;
  contactPhone?: string;
  contactEmail?: string;
  preferredContactMethod: string;
  location: string;
  description: string;
  followerCount: number;
  verificationDate: string;
}

export default function EmployerProfileScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<EmployerProfile | null>(null);
  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEmployerProfile = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(`/employers/${id}`);
        setProfile(response.data.data.employer);
        setJobs(response.data.data.jobs);
      } catch (err) {
        console.error('Failed to load employer profile', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchEmployerProfile();
    }
  }, [id]);

  const handleCall = () => {
    if (!profile?.contactPhone) return;
    Linking.openURL(`tel:${profile.contactPhone}`);
  };

  const handleEmail = () => {
    if (!profile?.contactEmail) return;
    Linking.openURL(`mailto:${profile.contactEmail}`);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-semibold text-content-muted mt-3">Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">👤</Text>
        <Text className="text-base font-extrabold text-content-primary">Employer Profile Not Found</Text>
        {/* Honest about which failure this is. The platform has no route that
            reads an employer profile, so this is very often "we cannot look
            this up" rather than "this employer does not exist" — and telling a
            candidate the second when the first is true is the platform blaming
            an employer for its own gap. */}
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed max-w-[260px]">
          Employer profiles are not something this platform can look up yet. You can see the
          employer&apos;s name, verification and response record on any of their job listings.
        </Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Employer Profile" showBack />

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* Profile Card */}
        <View className="bg-surface-card px-6 py-6 border-b border-subtle shadow-sm items-center">
          <View className="w-20 h-20 rounded-full bg-surface-muted items-center justify-center mb-3 border-2 border-primary-500">
            <Text className="text-3xl font-extrabold text-primary-500">{profile.name.substring(0, 1)}</Text>
          </View>

          <Text className="text-xl font-black text-content-primary mb-1">{profile.name}</Text>
          
          <View className="flex-row items-center mb-4">
            {profile.isVerified && (
              <View className="bg-success-surface px-2 py-0.5 rounded border border-green-150 mr-2">
                <Text className="text-[9px] font-black text-success-default uppercase">✓ Community Verified</Text>
              </View>
            )}
            <Text className="text-xs text-content-muted font-bold bg-surface-background border border-faint px-2.5 py-0.5 rounded-full">
              ★ {profile.rating} Rating
            </Text>
          </View>

          <Text className="text-xs text-content-faint font-extrabold uppercase tracking-wider mb-3">
            Reputation: {profile.reputationLevel}
          </Text>

          <Text className="text-sm text-content-tertiary text-center leading-relaxed max-w-[260px] mb-5">
            {profile.description}
          </Text>

          {/* Followers count row */}
          <View className="flex-row gap-6 border-t border-faint pt-4 w-full justify-around mb-2">
            <View className="items-center">
              <Text className="text-base font-black text-content-primary">{profile.followerCount}</Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase mt-0.5">Followers</Text>
            </View>
            <View className="items-center">
              <Text className="text-base font-black text-content-primary">{jobs.length}</Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase mt-0.5">Active Jobs</Text>
            </View>
            <View className="items-center">
              <Text className="text-base font-black text-content-primary">{profile.location}</Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase mt-0.5">City Base</Text>
            </View>
          </View>
        </View>

        {/* Contact actions */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-3">Contact Channels</Text>
          <View className="flex-row gap-3">
            {profile.contactPhone && (
              <TouchableOpacity
                onPress={handleCall}
                className="flex-1 bg-surface-background border border-subtle py-3.5 rounded-xl items-center active:bg-surface-muted"
              >
                <Text className="text-xs font-bold text-content-strong">📞 Call Phone</Text>
              </TouchableOpacity>
            )}
            {profile.contactEmail && (
              <TouchableOpacity
                onPress={handleEmail}
                className="flex-1 bg-surface-background border border-subtle py-3.5 rounded-xl items-center active:bg-surface-muted"
              >
                <Text className="text-xs font-bold text-content-strong">✉️ Send Email</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Other open jobs by this employer */}
        <View className="p-6 mb-10 mt-3 bg-surface-card border-y border-subtle">
          <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-4">
            Opportunities by {profile.name}
          </Text>

          {jobs.length > 0 ? (
            jobs.map((item) => (
              <JobCard key={item.jobId} job={item} />
            ))
          ) : (
            <View className="items-center py-8">
              <Text className="text-xs text-content-muted font-bold">No active job listings currently.</Text>
            </View>
          )}
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
