import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useSavedStore } from '@/store/saved';
import { Button } from '@/components/Button';
import { ContactActionRow } from '@/components/ContactActionRow';
import { JobCard } from '@/components/JobCard';
import { apiClient } from '@/lib/apiClient';
import type { JobOpportunity } from '@/types/job';
import { ReportModal } from '@/components/ReportModal';
import { ConversationHub } from '@/lib/conversation-hub';
import { useAuthStore } from '@/store/auth';
import { PromoteEntry } from '@/components/monetization';
import { useApplyToJob } from '@/hooks/jobs-hiring';
import { isNotCandidateError, jobsHiringErrorMessage } from '@/lib/jobs-hiring-api';

// Hyperlocal discovery
import { useLocationStore, getActiveLocation } from '@/store/location';
import { getDistanceKm } from '@/utils/geo';
import { DistanceBadge } from '@/components/DistanceBadge';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { useEffectRefresh } from '@/hooks/usePullToRefresh';
import { readPage } from '@/lib/platform-envelope';
import { trackContentViewed } from '@/lib/analytics/content-events';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * One view, counted by the platform.
   *
   * `content.viewed` is registered, client-submittable and had no emitter
   * anywhere — which is why `content.views` reads AWAITING_SOURCE. No
   * throttling here on purpose: the server deduplicates one person per item
   * per day, and a second rule in the client would be a second definition of
   * the same word.
   */
  useEffect(() => {
    trackContentViewed({ contentType: 'job', contentId: id });
  }, [id]);
  const [job, setJob] = useState<JobOpportunity | null>(null);
  const [similarJobs, setSimilarJobs] = useState<JobOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  // This screen loads through `useEffect` + `apiClient`, so there is no
  // TanStack `refetch` to hand over. `refreshNonce` sits in the fetch
  // effect's dependency list and re-runs it.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(loading);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const { showAlert } = useNotification();

  const { save, unsave, isSaved } = useSavedStore();
  const saved = job ? isSaved(job.jobId) : false;
  const { user } = useAuthStore();
  const isOwner = job?.employer?.providerId === user?.userId;

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  // The real hiring client. Keyed by the route identifier rather than by the
  // loaded job, so the mutation exists before the fetch resolves and the button
  // never has to guard against a hook that is not there yet.
  const { apply, isApplying, error: applyError } = useApplyToJob(id ?? null);

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
        // `GET /jobs` answers a cursor page — `{ data: { items, nextCursor,
        // hasMore, totalCount, facets } }` — so reading `data.data` as an array
        // handed `.filter` an object. The throw was swallowed by the `catch`
        // below, which logged "Failed to load job details" for a job whose
        // details had already loaded, and left "Similar jobs" permanently empty.
        const allJobs = readPage<JobOpportunity>(similarRes.data).items;
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
  }, [id, activeLocation, refreshNonce]);

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
      recipientId: job.employer.ownerUserId ?? '',
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

  /**
   * Remediation Wave K.
   *
   * Wave B′ replaced a fake success alert with a real `POST /jobs/{id}/apply`
   * through a bare `apiClient` call. It sent a genuine request — and it could
   * not have succeeded for anybody, because the very first thing that handler
   * does is `RequireCandidateAsync`, which answers **403 `jobs.not-candidate`**
   * for a member with no candidate profile. No screen in this application could
   * create one, so every member had none, so every application was refused and
   * the catch below reported it as "you may have already applied".
   *
   * This now goes through `useApplyToJob`, which reads the server's actual
   * refusal and says which one it was. The missing profile is a **fixable**
   * refusal rather than a dead end, so it offers the screen that fixes it.
   *
   * The success path is unchanged in one crucial respect and stronger in
   * another: it still only fires when the server confirmed the application, and
   * it now says where to go and see it — `/job/applications`, which this wave
   * built and which previously did not exist.
   */
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
          onPress: async () => {
            try {
              // Every field on `ApplyToJobRequest` is optional, so an empty
              // application is a valid one: the server falls back to the
              // candidate's default résumé and refuses outright when a posting
              // requires one and there is none, rather than sending it without.
              await apply();
            } catch (cause) {
              // A candidate with no profile cannot apply. That is the first
              // check on the server and it is the one every member of this
              // platform would have hit, so it gets a route out rather than an
              // apology.
              if (isNotCandidateError(cause)) {
                showAlert({
                  type: 'question',
                  title: 'Create your profile first',
                  message:
                    'Employers need a professional profile to consider you. It takes a minute and starts private.',
                  buttons: [
                    { text: 'Not now', style: 'cancel' },
                    {
                      text: 'Create profile',
                      onPress: () => router.push('/job/candidate-profile'),
                    },
                  ],
                });
                return;
              }

              // A failed application must never be reported as a sent one. Each
              // refusal is something the member needs to know — whether to wait,
              // to move on, or to add a CV — so the server's own sentence is
              // used rather than a guess that covers all of them.
              showAlert({
                type: 'error',
                title: 'Application not sent',
                message: applyError ?? jobsHiringErrorMessage(cause),
              });
              return;
            }

            showAlert({
              type: 'success',
              title: 'Application Sent',
              message: `Your application went to ${job.employer?.name || 'the employer'}. You can see whether they have opened it under "My applications".`,
              buttons: [
                { text: 'Done', style: 'cancel' },
                { text: 'My applications', onPress: () => router.push('/job/applications') },
              ],
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

      <ScrollEndScrollView
        refreshControl={refreshControl} className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
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
          
          <View className="mb-4">
            <ContactActionRow
              actions={[
                {
                  label: 'Call',
                  icon: 'call-outline',
                  onPress: handleCall,
                  disabled: !job?.employer?.contactPhone || isOwner,
                  accessibilityHint: job?.employer?.contactPhone
                    ? 'Calls the employer'
                    : 'No phone number on this listing',
                },
                {
                  label: 'Message',
                  icon: 'chatbubble-outline',
                  onPress: handleMessage,
                  isPrimary: true,
                  accessibilityHint: 'Opens a conversation with the employer',
                },
                {
                  label: 'Email',
                  icon: 'mail-outline',
                  onPress: handleEmail,
                  disabled: !job?.employer?.contactEmail || isOwner,
                  accessibilityHint: job?.employer?.contactEmail
                    ? 'Emails the employer'
                    : 'No email address on this listing',
                },
              ]}
            />
          </View>

          <Button
            label="Apply Now via Profile"
            className="w-full"
            isLoading={isApplying}
            loadingLabel="Sending your application…"
            onPress={handleApply}
          />

          {/* The tracker this wave built. Reachable from the one screen a
              member is standing on when they wonder what happened to the last
              five applications they sent. */}
          <Button
            label="My applications"
            variant="ghost"
            size="sm"
            className="w-full mt-2"
            onPress={() => router.push('/job/applications')}
          />
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
        // Two corrections deep. It was `console.log` behind a form that
        // confirmed a report nobody received; then it was an honest refusal,
        // because no content source claimed `CommunityContentType.Job`. One
        // does now — `JobContentSource` — so this form reaches
        // `POST /community/reports` like every other subject, and the
        // confirmation adds the thing that matters on a job board: do not pay a
        // fee to apply while it is being reviewed.
      />
    </SafeAreaView>
  );
}
