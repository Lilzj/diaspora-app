import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useSavedStore } from '@/store/saved';
import { Button } from '@/components/Button';
import { JobCard } from '@/components/JobCard';
import { apiClient } from '@/lib/apiClient';
import type { JobOpportunity } from '@/types/job';
import { ReportModal } from '@/components/ReportModal';
import { ConversationHub } from '@/lib/conversation-hub';
import { useAuthStore } from '@/store/auth';
import { PromoteEntry } from '@/components/monetization';

// Hyperlocal discovery
import { useLocationStore, getActiveLocation } from '@/store/location';
import { getDistanceKm } from '@/utils/geo';
import { DistanceBadge } from '@/components/DistanceBadge';
import { MapPreviewCard } from '@/components/MapPreviewCard';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<JobOpportunity | null>(null);
  const [similarJobs, setSimilarJobs] = useState<JobOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const { showAlert } = useNotification();

  const { save, unsave, isSaved } = useSavedStore();
  const saved = job ? isSaved(job.jobId) : false;
  const { user } = useAuthStore();
  const isOwner = job?.employer?.providerId === user?.userId;

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  useEffect(() => {
    const fetchJobDetails = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(`/jobs/${id}`);
        const jobData: JobOpportunity = response.data.data;
        
        // Calculate distance locally if needed
        if (jobData.location && jobData.location.latitude && jobData.location.longitude) {
          jobData.location.distanceKm = getDistanceKm(activeLocation.latitude, activeLocation.longitude, jobData.location.latitude, jobData.location.longitude);
        }
        
        setJob(jobData);

        // Fetch similar jobs sorted by proximity
        const similarRes = await apiClient.get('/jobs', {
          params: {
            category: jobData.category,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude
          }
        });
        const allJobs: JobOpportunity[] = similarRes.data.data;
        setSimilarJobs(allJobs.filter((j) => j.jobId !== jobData.jobId).slice(0, 2));
      } catch (err) {
        console.error('Failed to load job details', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchJobDetails();
    }
  }, [id, activeLocation]);

  const handleSaveToggle = () => {
    if (!job) return;
    if (saved) {
      unsave(job.jobId);
    } else {
      save(job.jobId, 'Job');
    }
  };

  const handleCall = () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This opportunity was posted by you.' });
      return;
    }
    if (!job?.employer?.contactPhone) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'No contact phone number provided by the employer.' });
      return;
    }
    Linking.openURL(`tel:${job.employer.contactPhone}`);
  };

  const handleEmail = () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This opportunity was posted by you.' });
      return;
    }
    if (!job?.employer?.contactEmail) {
      showAlert({ type: 'error', title: 'Unavailable', message: 'No contact email provided by the employer.' });
      return;
    }
    Linking.openURL(`mailto:${job.employer.contactEmail}?subject=Application for ${job.title}`);
  };

  const handleMessage = async () => {
    if (isOwner) {
      showAlert({ type: 'info', title: 'Your Listing', message: 'This opportunity was posted by you.' });
      return;
    }
    if (!job?.employer?.providerId) return;
    await ConversationHub.openOrCreateConversation({
      recipientId: job.employer.providerId,
      recipientName: job.employer.name,
      contextType: 'JobOpportunity',
      entityId: id,
      entityTitle: job.title,
      entitySubtitle: `${job.employer.name} · ${job.location?.areaName || ''}`,
      entityStatus: job.status || 'Active',
      deepLink: `/job/${id}`,
      campaignSource: 'job_detail',
    });
  };

  const handleShare = () => {
    if (!job) return;
    Share.share({
      message: `Check out the job opportunity: "${job.title}" at ${job.location?.areaName || 'location not specified'} on Diaspora!`,
    });
  };

  const handleApply = () => {
    if (!job) return;
    showAlert({
      type: 'question',
      title: 'Apply to Role',
      message: `Would you like to apply for "${job.title}"? Your Diaspora verified residency and community profile details will be shared with the employer.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply Now',
          onPress: () => {
            showAlert({
              type: 'success',
              title: 'Application Sent!',
              message: `Your profile details have been sent to ${job.employer?.name || 'Employer'}. They will reach out via your preferred method (${job.employer?.preferredContactMethod || 'message'}).`,
            });
          },
        },
      ],
    });
  };

  const handleReport = () => {
    setReportModalVisible(true);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-semibold text-content-muted mt-3">Loading details...</Text>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">🔍</Text>
        <Text className="text-base font-extrabold text-content-primary">Opportunity Not Found</Text>
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed max-w-[240px]">
          This opportunity may have expired, archived, or removed by the administrator.
        </Text>
        <Button label="Go back" className="mt-6 w-full" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const hasSalary = !!job.salary;
  const symbol = job.salary?.currency === 'GBP' ? '£' : job.salary?.currency === 'MUR' ? 'Rs ' : job.salary?.currency || '';
  const freq = job.salary?.frequency === 'hourly' ? 'hr' : job.salary?.frequency === 'daily' ? 'day' : job.salary?.frequency === 'weekly' ? 'wk' : 'mo';
  const range = job.salary?.maxAmount ? `${job.salary.amount}-${job.salary.maxAmount}` : job.salary?.amount || '';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Header */}
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-content-tertiary">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-content-primary" numberOfLines={1}>Job Details</Text>
        </View>
        
        <View className="flex-row gap-3">
          <TouchableOpacity onPress={handleSaveToggle} className="p-1">
            <Text className="text-lg">{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} className="p-1">
            <Text className="text-lg">↗️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {/* Main Header card */}
        <View className="bg-surface-card px-6 py-6 border-b border-subtle shadow-sm shadow-neutral-100">
          <View className="flex-row items-center justify-between mb-3">
            <View className="bg-surface-background border border-subtle px-3 py-1 rounded-full">
              <Text className="text-[10px] font-black text-content-tertiary uppercase">💼 {job.employmentType}</Text>
            </View>
            <Text className="text-xs text-content-faint font-bold bg-surface-background px-2 py-1 rounded border border-faint">
              {job.urgency === 'Urgent' ? '🔥 URGENT' : '🕒 ACTIVE'}
            </Text>
          </View>

          <Text className="text-2xl font-black text-content-primary leading-tight mb-2">{job.title}</Text>
          
          <TouchableOpacity
            onPress={() => job.employer?.providerId && router.push(`/employer/${job.employer.providerId}`)}
            className="flex-row items-center mb-4"
          >
            <Text className="text-sm font-extrabold text-primary-500 mr-1.5">{job.employer?.name || 'Employer'}</Text>
            {job.employer?.isVerified && (
              <View className="bg-info-surface px-1.5 py-0.5 rounded mr-2">
                <Text className="text-[10px] font-black text-info-default uppercase">✓ Verified Employer</Text>
              </View>
            )}
            <Text className="text-xs text-content-muted">({job.employer?.reputationLevel || 'Community Member'}) ›</Text>
          </TouchableOpacity>

          <View className="flex-row items-center justify-between border-t border-faint pt-4">
            <View>
              <Text className="text-xs text-content-muted font-bold uppercase tracking-wider">Salary Offer</Text>
              {hasSalary ? (
                <Text className="text-xl font-black text-primary-500 mt-0.5">{symbol}{range} <Text className="text-xs font-semibold text-content-muted">/{freq}</Text></Text>
              ) : (
                <Text className="text-sm font-bold text-content-muted mt-1">Competitive / Disclosed later</Text>
              )}
            </View>
            <View className="items-end">
              <Text className="text-xs text-content-muted font-bold uppercase tracking-wider mb-1">Location</Text>
              <View className="flex-row items-center gap-1.5">
                <Text className="text-sm font-extrabold text-content-strong">📍 {job.location?.areaName || 'Unknown'}</Text>
                {job.location?.distanceKm !== undefined && (
                  <DistanceBadge distanceKm={job.location.distanceKm} showCommuteTime={true} />
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Promotion. Renders only for the employer who posted this, and only
            once the certified placement read has answered — so a candidate never
            sees it and the owner never sees a flicker. */}
        {isOwner ? (
          <View className="px-6 mt-3">
            <PromoteEntry target="job" subjectId={id} title={job.title} isOwner={isOwner} />
          </View>
        ) : null}

        {/* Benefits Flags highlights */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-4">Included Perks & Amenities</Text>
          <View className="flex-col gap-3">
            {[
              { label: '🛌 Free On-Site Accommodation', value: job.benefitsFlags?.accommodationIncluded || false, desc: 'Shared or private room provided at no extra cost' },
              { label: '🍲 Meals Provided Daily', value: job.benefitsFlags?.mealsIncluded || false, desc: 'Fresh home-style cooking or restaurant meals covered during shifts' },
              { label: '🚗 Transport Provided', value: job.benefitsFlags?.transportIncluded || false, desc: 'Work vehicle or transit expenses fully reimbursed' },
            ].map((perk, i) => (
              <View key={i} className="flex-row items-start">
                <Text className="text-base mr-3">{perk.value ? '🟢' : '⚪'}</Text>
                <View className="flex-1">
                  <Text className={`text-sm font-bold ${perk.value ? 'text-content-strong' : 'text-content-faint line-through'}`}>{perk.label}</Text>
                  {perk.value && <Text className="text-xs text-content-muted mt-0.5 leading-relaxed">{perk.desc}</Text>}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Description */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-3">Job Description</Text>
          <Text className="text-sm text-content-secondary leading-relaxed">{job.description}</Text>
        </View>

        {/* Responsibilities */}
        {job.responsibilities && job.responsibilities.length > 0 && (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-4">Key Responsibilities</Text>
            {job.responsibilities.map((resp, idx) => (
              <View key={idx} className="flex-row items-start mb-2.5">
                <Text className="text-primary-500 font-extrabold mr-2.5">•</Text>
                <Text className="text-sm text-content-secondary leading-relaxed flex-1">{resp}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Requirements */}
        {job.requirements && job.requirements.length > 0 && (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-4">Requirements & Expectations</Text>
            {job.requirements.map((req, idx) => (
              <View key={idx} className="flex-row items-start mb-2.5">
                <Text className="text-[#0D7C66] font-extrabold mr-2.5">✓</Text>
                <Text className="text-sm text-content-secondary leading-relaxed flex-1">{req}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Map Preview Location */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-3">Work Location</Text>
          <Text className="text-xs text-content-tertiary font-semibold mb-3">
            📍 Address: {job.location?.addressLine || 'Address not specified'} · {job.location?.cityName || 'City not specified'}
            {job.location?.landmark ? `\n🏢 Near: ${job.location.landmark}` : ''}
          </Text>

          {/* Simulated Map interface card */}
          {job.location?.latitude && job.location?.longitude && (
            <MapPreviewCard
              center={activeLocation}
              pins={[{
                id: job.jobId,
                title: job.title,
                category: job.category,
                latitude: job.location.latitude,
                longitude: job.location.longitude,
                distanceKm: job.location.distanceKm || 0
              }]}
              radiusKm={5}
            />
          )}
        </View>

        {/* Contact Actions Overlay */}
        <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
          <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-4">Contact Employer</Text>
          
          <View className="flex-row justify-between mb-4">
            <TouchableOpacity
              onPress={handleCall}
              style={{ opacity: (!job?.employer?.contactPhone || isOwner) ? 0.65 : 1 }}
              className="items-center bg-surface-background border border-subtle p-3 rounded-2xl flex-1 mr-2 active:bg-surface-muted"
            >
              <Text className="text-xl mb-1">📞</Text>
              <Text className="text-xs text-content-secondary font-bold">Call Phone</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMessage}
              style={{ backgroundColor: '#F59300' }}
              className="items-center p-3 rounded-2xl flex-1 mr-2 active:opacity-85"
            >
              <Text className="text-xl mb-1">💬</Text>
              <Text className="text-xs text-white font-black">Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              style={{ opacity: (!job?.employer?.contactEmail || isOwner) ? 0.65 : 1 }}
              className="items-center bg-surface-background border border-subtle p-3 rounded-2xl flex-1 active:bg-surface-muted"
            >
              <Text className="text-xl mb-1">✉️</Text>
              <Text className="text-xs text-content-secondary font-bold">Send Email</Text>
            </TouchableOpacity>
          </View>

          <Button label="Apply Now via Profile" className="w-full" onPress={handleApply} />
        </View>

        {/* Report link */}
        <TouchableOpacity onPress={handleReport} className="items-center py-6 mb-3">
          <Text className="text-xs text-content-faint font-extrabold uppercase">Report / Audit this job listing</Text>
        </TouchableOpacity>

        {/* Suggested similar jobs */}
        {similarJobs.length > 0 && (
          <View className="p-6 mb-10 bg-surface-card border-t border-subtle">
            <Text className="text-sm font-black text-content-strong uppercase tracking-widest mb-4">Similar Opportunities</Text>
            {similarJobs.map((item) => (
              <JobCard key={item.jobId} job={item} />
            ))}
          </View>
        )}
      </ScrollEndScrollView>
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Job"
        contentId={job?.jobId || id}
        onSubmit={(data) => {
          console.log('Reported Job:', data);
        }}
      />
    </SafeAreaView>
  );
}
