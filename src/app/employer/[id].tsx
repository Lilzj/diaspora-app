import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
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
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Employer Profile" showBack />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
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
      </ScrollView>
    </SafeAreaView>
  );
}
