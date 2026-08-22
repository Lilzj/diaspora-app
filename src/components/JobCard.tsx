import React from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';
import type { JobOpportunity } from '@/types/job';
import { CommunityTrustBadge } from './CommunityTrustBadge';

interface JobCardProps {
  job: JobOpportunity;
  variant?: 'list' | 'featured';
}

export function JobCard({ job, variant = 'list' }: JobCardProps) {
  const { jobId, title, category, employmentType, salary, location, employer, benefitsFlags, urgency, publishedAt, expiresAt } = job;
  const { save, unsave, isSaved } = useSavedStore();
  const saved = isSaved(jobId);

  const handlePress = () => {
    router.push(`/job/${jobId}`);
  };

  const handleSaveToggle = (e: any) => {
    e.stopPropagation();
    if (saved) {
      unsave(jobId);
    } else {
      save(jobId, 'Job');
    }
  };

  const handleShare = (e: any) => {
    e.stopPropagation();
    Share.share({
      message: `Check out this opportunity: "${title}" at ${location.areaName} on Diaspora!`,
    });
  };

  // ── Quick apply — Remediation Wave B′ ──────────────────────────────────────
  //
  // The same fabrication the register recorded against `job/[id].tsx` as B′-04,
  // surviving one level down in the card. It asked "would you like to send your
  // community profile to {employer}?" and, on Apply Now, said:
  //
  //     Success
  //     Your application and profile were shared! The employer will contact you
  //     directly.
  //
  // Nothing was sent. Worse than the screen-level version, because this fires
  // from any job list — a member could "apply" to a dozen roles in a minute and
  // be waiting on all twelve.
  //
  // ── Why this navigates rather than posting from here ─────────────────────────
  //
  // `POST /api/v1/jobs/{jobId}/apply` is real and `job/[id].tsx` is already
  // wired to it through `useApplyToJob`. Duplicating that call here would
  // duplicate the part that matters most: the server's **first** check is
  // `jobs.not-candidate` — a member with no candidate profile cannot apply at
  // all, which is every member who has not built one — and the detail screen
  // answers that refusal by offering the profile screen that fixes it. A card in
  // a list has nowhere to put that, and a second copy of the flow is a second
  // place for the two to drift.
  //
  // There is also a plain honesty argument. `ApplyToJobRequest` carries a résumé,
  // a cover letter and the posting's screening answers; a one-tap apply from a
  // list sends none of them and cannot show the member what a posting requires
  // before they commit. Opening the posting is not a downgrade from applying —
  // it is the step that was being skipped.
  const handleQuickApply = (e: any) => {
    e.stopPropagation();
    router.push(`/job/${jobId}`);
  };

  // Helper to calculate days remaining
  const getDaysRemaining = () => {
    const expiry = new Date(expiresAt).getTime();
    const now = new Date().getTime();
    const diff = expiry - now;
    if (diff <= 0) return 'Expired';
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  };

  // Helper to get salary text
  const getSalaryDisplay = () => {
    const symbol = salary.currency === 'GBP' ? '£' : salary.currency === 'MUR' ? 'Rs ' : salary.currency;
    const freq = salary.frequency === 'hourly' ? 'hr' : salary.frequency === 'daily' ? 'day' : salary.frequency === 'weekly' ? 'wk' : 'mo';
    const range = salary.maxAmount ? `${salary.amount}-${salary.maxAmount}` : salary.amount;
    return `${symbol}${range}/${freq}`;
  };

  const formattedDistance = location.distanceKm != null
    ? location.distanceKm < 1
      ? `${(location.distanceKm * 1000).toFixed(0)}m away`
      : `${location.distanceKm.toFixed(1)}km away`
    : '';

  // Featured/Carousel View Layout
  if (variant === 'featured') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        className="w-[280px] bg-surface-card rounded-2xl p-4 mr-4 border border-subtle"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="bg-surface-background px-2 py-1 rounded-lg border border-faint">
            <Text className="text-[10px] font-bold text-content-muted uppercase">{employmentType}</Text>
          </View>
          <TouchableOpacity onPress={handleSaveToggle} className="w-8 h-8 rounded-full bg-surface-background items-center justify-center border border-faint">
            <Text className="text-xs">{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-base font-extrabold text-content-primary leading-snug mb-1" numberOfLines={2}>
          {title}
        </Text>

        <View className="flex-row items-center gap-1.5 mb-2 flex-wrap">
          <Text className="text-sm text-content-muted font-semibold" numberOfLines={1}>
            🏢 {employer.name}
          </Text>
          <CommunityTrustBadge
            profile={{
              isVerified: employer.isVerified,
              reputationLevel: employer.isVerified ? 'TrustedContributor' : undefined,
              providerVerified: employer.isVerified
            }}
            limit={1}
          />
        </View>

        <Text className="text-sm text-content-muted font-semibold mb-3">
          📍 {location.areaName} {formattedDistance ? `· ${formattedDistance}` : ''}
        </Text>

        <View className="flex-row flex-wrap gap-1 mb-3">
          {benefitsFlags.accommodationIncluded && (
            <View className="bg-primary-50 px-2 py-0.5 rounded-full">
              <Text className="text-[9px] font-bold text-primary-600">🛌 Accom.</Text>
            </View>
          )}
          {benefitsFlags.mealsIncluded && (
            <View className="bg-success-surface px-2 py-0.5 rounded-full">
              <Text className="text-[9px] font-bold text-success-default">🍲 Meals</Text>
            </View>
          )}
          {benefitsFlags.transportIncluded && (
            <View className="bg-info-surface px-2 py-0.5 rounded-full">
              <Text className="text-[9px] font-bold text-info-default">🚗 Transport</Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center justify-between border-t border-faint pt-3">
          <Text className="text-base font-black text-primary-500">{getSalaryDisplay()}</Text>
          <Text className="text-[10px] text-content-faint font-bold">{getDaysRemaining()}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // standard List View layout
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className="bg-surface-card rounded-[24px] p-5 mb-4 border border-subtle"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      {/* Top row: Urgency badge & Expiry countdown & Save icon */}
      <View className="flex-row items-center justify-between mb-3.5">
        <View className="flex-row items-center">
          {urgency === 'Urgent' && (
            <View className="bg-error-surface px-2.5 py-0.5 rounded-full border border-red-100 mr-2">
              <Text className="text-[9px] font-extrabold text-error-default uppercase">🔥 Urgent Hiring</Text>
            </View>
          )}
          {urgency === 'Ending Soon' && (
            <View className="bg-warning-surface px-2.5 py-0.5 rounded-full border border-amber-100 mr-2">
              <Text className="text-[9px] font-extrabold text-warning-default uppercase">⏳ Ending Soon</Text>
            </View>
          )}
          <View className="bg-surface-background px-2.5 py-0.5 rounded-full border border-subtle">
            <Text className="text-[10px] font-extrabold text-content-tertiary uppercase">{employmentType}</Text>
          </View>
        </View>

        <View className="flex-row items-center">
          <Text className="text-[10px] text-content-faint font-semibold mr-3">{getDaysRemaining()}</Text>
          <TouchableOpacity onPress={handleSaveToggle} className="p-1">
            <Text className="text-base">{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Opportunity details */}
      <View className="mb-3.5">
        <Text className="text-base font-extrabold text-content-primary leading-snug mb-1">{title}</Text>
        <View className="flex-row items-center flex-wrap mt-1.5 gap-1.5">
          <Text className="text-sm font-bold text-content-tertiary mr-1">{employer.name}</Text>
          <CommunityTrustBadge
            profile={{
              isVerified: employer.isVerified,
              reputationLevel: employer.isVerified ? 'TrustedContributor' : undefined,
              providerVerified: employer.isVerified
            }}
            limit={1}
          />
        </View>
        <Text className="text-sm text-content-muted font-semibold mt-1.5">
          📍 {location.areaName} · {location.cityName} {formattedDistance ? `· ${formattedDistance}` : ''}
        </Text>
      </View>

      {/* Perks flags */}
      <View className="flex-row flex-wrap gap-1.5 mb-4.5">
        {benefitsFlags.accommodationIncluded && (
          <View className="bg-primary-50 px-2 py-0.5 rounded-full border border-amber-100 flex-row items-center">
            <Text className="text-[9px] font-bold text-primary-600">🛌 Accommodation</Text>
          </View>
        )}
        {benefitsFlags.mealsIncluded && (
          <View className="bg-success-surface px-2 py-0.5 rounded-full border border-green-100 flex-row items-center">
            <Text className="text-[9px] font-bold text-success-default">🍲 Meals Provided</Text>
          </View>
        )}
        {benefitsFlags.transportIncluded && (
          <View className="bg-info-surface px-2 py-0.5 rounded-full border border-blue-100 flex-row items-center">
            <Text className="text-[9px] font-bold text-info-default">🚗 Transport Provided</Text>
          </View>
        )}
      </View>

      {/* Bottom row: Salary & Action buttons */}
      <View className="flex-row items-center justify-between border-t border-faint pt-4">
        <View>
          <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Salary</Text>
          <Text className="text-lg font-black text-primary-500 mt-0.5">{getSalaryDisplay()}</Text>
        </View>

        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleShare}
            className="w-10 h-10 bg-surface-background border border-subtle rounded-xl items-center justify-center active:bg-surface-muted"
          >
            <Text className="text-sm">↗️</Text>
          </TouchableOpacity>
          {/* "Quick Apply" promised a one-tap application this card cannot
              make. It opens the posting, where the wired apply lives. */}
          <TouchableOpacity
            onPress={handleQuickApply}
            className="bg-primary-500 px-4 py-2.5 rounded-xl justify-center items-center active:bg-primary-600"
            accessibilityRole="button"
            accessibilityLabel={`Apply for ${title}`}
            accessibilityHint="Opens the job posting, where you can send your application"
          >
            <Text className="text-white font-extrabold text-sm">Apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
