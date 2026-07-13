import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSavedStore } from '@/store/saved';
import { Button } from '@/components/Button';
import { JobCard } from '@/components/JobCard';
import { apiClient } from '@/lib/apiClient';
import type { JobOpportunity } from '@/types/job';
import { ReportModal } from '@/components/ReportModal';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<JobOpportunity | null>(null);
  const [similarJobs, setSimilarJobs] = useState<JobOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const { save, unsave, isSaved } = useSavedStore();
  const saved = job ? isSaved(job.jobId) : false;

  useEffect(() => {
    const fetchJobDetails = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(`/jobs/${id}`);
        const jobData: JobOpportunity = response.data.data;
        setJob(jobData);

        // Fetch similar jobs (same category, different ID)
        const similarRes = await apiClient.get('/jobs', {
          params: { category: jobData.category }
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
  }, [id]);

  const handleSaveToggle = () => {
    if (!job) return;
    if (saved) {
      unsave(job.jobId);
    } else {
      save(job.jobId, 'Job');
    }
  };

  const handleCall = () => {
    if (!job?.employer?.contactPhone) return;
    Linking.openURL(`tel:${job.employer.contactPhone}`);
  };

  const handleEmail = () => {
    if (!job?.employer?.contactEmail) return;
    Linking.openURL(`mailto:${job.employer.contactEmail}?subject=Application for ${job.title}`);
  };

  const handleWhatsApp = () => {
    if (!job?.employer?.contactPhone) return;
    const phoneClean = job.employer.contactPhone.replace(/\+/g, '');
    Linking.openURL(`https://wa.me/${phoneClean}?text=Hello, I am interested in your job posting: "${job.title}"`);
  };

  const handleShare = () => {
    if (!job) return;
    Share.share({
      message: `Check out the job opportunity: "${job.title}" at ${job.location?.areaName || 'location not specified'} on Diaspora!`,
    });
  };

  const handleApply = () => {
    if (!job) return;
    if (Platform.OS === 'web') {
      const confirm = window.confirm(`Would you like to apply for "${job.title}"? Your Diaspora verified residency and community profile details will be shared with the employer.`);
      if (confirm) {
        alert(`Application Sent!\nYour profile details have been sent to ${job.employer?.name || 'Employer'}. They will reach out via your preferred method (${job.employer?.preferredContactMethod || 'message'}).`);
      }
    } else {
      Alert.alert(
        'Apply to Role',
        `Would you like to apply for "${job.title}"? Your Diaspora verified residency and community profile details will be shared with the employer.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Apply',
            onPress: () => {
              Alert.alert(
                'Application Sent!',
                `Your profile details have been sent to ${job.employer?.name || 'Employer'}. They will reach out via your preferred method (${job.employer?.preferredContactMethod || 'message'}).`
              );
            },
          },
        ]
      );
    }
  };

  const handleReport = () => {
    setReportModalVisible(true);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#FF6B00" />
        <Text className="text-sm font-semibold text-neutral-500 mt-3">Loading details...</Text>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-4xl mb-3">🔍</Text>
        <Text className="text-base font-extrabold text-neutral-850">Opportunity Not Found</Text>
        <Text className="text-xs text-neutral-400 text-center mt-1.5 leading-relaxed max-w-[240px]">
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
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-neutral-600">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-neutral-900" numberOfLines={1}>Job Details</Text>
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

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Main Header card */}
        <View className="bg-white px-6 py-6 border-b border-neutral-200 shadow-sm shadow-neutral-100">
          <View className="flex-row items-center justify-between mb-3">
            <View className="bg-neutral-50 border border-neutral-200 px-3 py-1 rounded-full">
              <Text className="text-[10px] font-black text-neutral-600 uppercase">💼 {job.employmentType}</Text>
            </View>
            <Text className="text-xs text-neutral-400 font-bold bg-neutral-50 px-2 py-1 rounded border border-neutral-100">
              {job.urgency === 'Urgent' ? '🔥 URGENT' : '🕒 ACTIVE'}
            </Text>
          </View>

          <Text className="text-2xl font-black text-neutral-900 leading-tight mb-2">{job.title}</Text>
          
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
            <Text className="text-xs text-neutral-450">({job.employer?.reputationLevel || 'Community Member'}) ›</Text>
          </TouchableOpacity>

          <View className="flex-row items-center justify-between border-t border-neutral-50 pt-4">
            <View>
              <Text className="text-xs text-neutral-450 font-bold uppercase tracking-wider">Salary Offer</Text>
              {hasSalary ? (
                <Text className="text-xl font-black text-primary-500 mt-0.5">{symbol}{range} <Text className="text-xs font-semibold text-neutral-500">/{freq}</Text></Text>
              ) : (
                <Text className="text-sm font-bold text-neutral-500 mt-1">Competitive / Disclosed later</Text>
              )}
            </View>
            <View className="items-end">
              <Text className="text-xs text-neutral-450 font-bold uppercase tracking-wider">Location</Text>
              <Text className="text-sm font-extrabold text-neutral-800 mt-0.5">📍 {job.location?.areaName || 'Unknown'}</Text>
            </View>
          </View>
        </View>

        {/* Benefits Flags highlights */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-4">Included Perks & Amenities</Text>
          <View className="flex-col gap-3">
            {[
              { label: '🛌 Free On-Site Accommodation', value: job.benefitsFlags?.accommodationIncluded || false, desc: 'Shared or private room provided at no extra cost' },
              { label: '🍲 Meals Provided Daily', value: job.benefitsFlags?.mealsIncluded || false, desc: 'Fresh home-style cooking or restaurant meals covered during shifts' },
              { label: '🚗 Transport Provided', value: job.benefitsFlags?.transportIncluded || false, desc: 'Work vehicle or transit expenses fully reimbursed' },
            ].map((perk, i) => (
              <View key={i} className="flex-row items-start">
                <Text className="text-base mr-3">{perk.value ? '🟢' : '⚪'}</Text>
                <View className="flex-1">
                  <Text className={`text-sm font-bold ${perk.value ? 'text-neutral-800' : 'text-neutral-400 line-through'}`}>{perk.label}</Text>
                  {perk.value && <Text className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{perk.desc}</Text>}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Description */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-3">Job Description</Text>
          <Text className="text-sm text-neutral-700 leading-relaxed">{job.description}</Text>
        </View>

        {/* Responsibilities */}
        {job.responsibilities && job.responsibilities.length > 0 && (
          <View className="bg-white p-6 mt-3 border-y border-neutral-200">
            <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-4">Key Responsibilities</Text>
            {job.responsibilities.map((resp, idx) => (
              <View key={idx} className="flex-row items-start mb-2.5">
                <Text className="text-primary-500 font-extrabold mr-2.5">•</Text>
                <Text className="text-sm text-neutral-700 leading-relaxed flex-1">{resp}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Requirements */}
        {job.requirements && job.requirements.length > 0 && (
          <View className="bg-white p-6 mt-3 border-y border-neutral-200">
            <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-4">Requirements & Expectations</Text>
            {job.requirements.map((req, idx) => (
              <View key={idx} className="flex-row items-start mb-2.5">
                <Text className="text-[#0D7C66] font-extrabold mr-2.5">✓</Text>
                <Text className="text-sm text-neutral-700 leading-relaxed flex-1">{req}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Map Preview Location */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-3">Work Location</Text>
          <Text className="text-xs text-neutral-600 font-semibold mb-3">
            📍 Address: {job.location?.addressLine || 'Address not specified'} · {job.location?.cityName || 'City not specified'}
            {job.location?.landmark ? `\n🏢 Near: ${job.location.landmark}` : ''}
          </Text>

          {/* Simulated Map interface card */}
          <View className="h-40 bg-neutral-100 rounded-2xl overflow-hidden border border-neutral-200 items-center justify-center">
            <Text className="text-4xl mb-1">🗺️</Text>
            <Text className="text-xs font-bold text-neutral-700">GPS Location Pin</Text>
            <Text className="text-xs text-neutral-500 font-bold uppercase mt-0.5">{job.location?.areaName || 'Unknown'} Region</Text>
          </View>
        </View>

        {/* Contact Actions Overlay */}
        <View className="bg-white p-6 mt-3 border-y border-neutral-200">
          <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-4">Contact Employer</Text>
          
          <View className="flex-row justify-between mb-4">
            <TouchableOpacity
              disabled={!job?.employer?.contactPhone}
              onPress={handleCall}
              className="items-center bg-neutral-50 border border-neutral-200 p-3 rounded-2xl flex-1 mr-2 active:bg-neutral-100"
            >
              <Text className="text-xl mb-1">📞</Text>
              <Text className="text-xs text-neutral-700 font-bold">Call Phone</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={!job?.employer?.contactPhone}
              onPress={handleWhatsApp}
              className="items-center bg-neutral-50 border border-neutral-200 p-3 rounded-2xl flex-1 mr-2 active:bg-neutral-100"
            >
              <Text className="text-xl mb-1">💬</Text>
              <Text className="text-xs text-neutral-700 font-bold">WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={!job?.employer?.contactEmail}
              onPress={handleEmail}
              className="items-center bg-neutral-50 border border-neutral-200 p-3 rounded-2xl flex-1 active:bg-neutral-100"
            >
              <Text className="text-xl mb-1">✉️</Text>
              <Text className="text-xs text-neutral-700 font-bold">Send Email</Text>
            </TouchableOpacity>
          </View>

          <Button label="Apply Now via Profile" className="w-full" onPress={handleApply} />
        </View>

        {/* Report link */}
        <TouchableOpacity onPress={handleReport} className="items-center py-6 mb-3">
          <Text className="text-xs text-neutral-400 font-extrabold uppercase">Report / Audit this job listing</Text>
        </TouchableOpacity>

        {/* Suggested similar jobs */}
        {similarJobs.length > 0 && (
          <View className="p-6 mb-10 bg-white border-t border-neutral-200">
            <Text className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-4">Similar Opportunities</Text>
            {similarJobs.map((item) => (
              <JobCard key={item.jobId} job={item} />
            ))}
          </View>
        )}
      </ScrollView>
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
