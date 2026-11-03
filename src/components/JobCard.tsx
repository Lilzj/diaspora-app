import React from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';
import type { JobOpportunity } from '@/types/job';
import type { JobSalaryResponse, JobType } from '@/types/jobs-hiring';
import { CommunityTrustBadge } from './CommunityTrustBadge';
import { placeOf } from '@/lib/listing-place';
import { JOB_TYPE_LABELS, describeSalary } from '@/lib/job-detail-api';
import { currencySymbol as symbolFor } from '@/lib/money';

interface JobCardProps {
  job: JobOpportunity;
  variant?: 'list' | 'featured';
}

export function JobCard({ job, variant = 'list' }: JobCardProps) {
  // ── This component crashed the Jobs tab (Android UAT, 31 Aug 2026) ────────
  //
  // It destructured `location`, `employer`, `salary` and `benefitsFlags` and
  // read straight through them — `location.distanceKm`, `employer.name`,
  // `salary.currency`, `benefitsFlags.mealsIncluded`. **The wire has none of
  // those.** `GET /jobs` returns a flat row:
  //
  //     { jobId, title, summary, employerName, employerLogoMediaId,
  //       isEmployerVerified, categoryKey, jobType, experienceLevel,
  //       countryCode, locationLabel, workplaceType, isRemote,
  //       salary: { isDisclosed, minimum, maximum, currencyCode, period,
  //                 isNegotiable, isUnpaid },
  //       tags, skills, status, publishedAt, closingAt, applicationCount, … }
  //
  // So `location` was `undefined` and `location.distanceKm` threw
  // `TypeError: Cannot read property 'distanceKm' of undefined` **during
  // render**, killing the process. `JobCard` is rendered by seven screens
  // including the **Discover → Jobs tab**, so the crash sat on a primary
  // navigation destination and fired the moment any job existed.
  //
  // It had never fired because the jobs table was empty. Found by seeding two
  // Mauritian postings through the real API and opening the tab.
  //
  // Everything below reads the wire first and the legacy nested shape second,
  // so fixtures that still use the old shape keep rendering. Nothing is
  // invented: an undisclosed salary says so, and an absent distance is omitted
  // rather than shown as zero.
  const anyJob = job as unknown as Record<string, any>;

  const jobId: string = anyJob.jobId ?? anyJob.id ?? '';
  const title: string = anyJob.title ?? '';
  const category = anyJob.category ?? anyJob.categoryKey ?? '';
  // The wire's `jobType` is a PascalCase value — "FullTime" printed as
  // "FULLTIME" under the job page's "Similar jobs". Worded as the page words it.
  const employmentType =
    anyJob.employmentType ?? JOB_TYPE_LABELS[anyJob.jobType as JobType] ?? anyJob.jobType ?? '';
  const urgency = anyJob.urgency;
  const publishedAt = anyJob.publishedAt;
  const expiresAt = anyJob.expiresAt ?? anyJob.closingAt;

  const salary = anyJob.salary ?? {};
  const location = anyJob.location ?? {};
  const benefitsFlags = anyJob.benefitsFlags ?? {};

  const employer = anyJob.employer ?? {
    name: anyJob.employerName ?? '',
    isVerified: anyJob.isEmployerVerified ?? false,
  };

  // `placeOf` owns the three shapes the list routes send — see
  // `lib/listing-place.ts`. It never throws and never invents.
  const { label: placeLabel, distance: formattedDistance } = placeOf(job as never);
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
      message: `Check out this opportunity: "${title}"${placeLabel ? ` in ${placeLabel}` : ''} on Diaspora!`,
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
  // The poster manages their job; a member who applied follows it (16 Oct 2026).
  // `GET /jobs` says which per viewer (`canManage`, `hasApplied`).
  const viewerState = job as { canManage?: boolean | null; hasApplied?: boolean | null };
  const actionLabel = viewerState.canManage ? 'Manage' : viewerState.hasApplied ? 'Applied' : 'Apply';

  const handleQuickApply = (e: any) => {
    e.stopPropagation();
    router.push(`/job/${jobId}`);
  };

  // Helper to calculate days remaining
  /**
   * How long is left, when the employer set a closing date.
   *
   * `GET /jobs` sends `closingAt: null` for a posting with no deadline, and
   * most have none. `new Date(null).getTime()` is **0** — the Unix epoch — so
   * `diff` was hugely negative and every open posting was labelled
   * **"Expired"**. Two jobs published minutes earlier both carried it.
   *
   * An absent closing date means the posting is open, not that it has lapsed,
   * so this returns nothing and the caller renders no badge at all.
   */
  const getDaysRemaining = (): string => {
    if (!expiresAt) return '';

    const expiry = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiry)) return '';

    const diff = expiry - Date.now();
    if (diff <= 0) return 'Expired';

    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  };

  // Helper to get salary text
  /**
   * The pay, or an honest statement that it was not given.
   *
   * The wire's salary is `{ isDisclosed, minimum, maximum, currencyCode,
   * period, isNegotiable, isUnpaid }`. This used to read `salary.currency`,
   * `salary.frequency`, `salary.amount` and `salary.maxAmount` — none of which
   * exist — and rendered `undefinedundefined/mo`.
   */
  const getSalaryDisplay = (): string => {
    // The wire record, worded exactly as the job page words it — "MUR 15,000 a
    // month" — so a card and the page it opens never disagree about the pay.
    if (typeof salary.isDisclosed === 'boolean') {
      return describeSalary(salary as JobSalaryResponse);
    }

    const currency = salary.currencyCode ?? salary.currency;
    const minimum = salary.minimum ?? salary.amount;
    const maximum = salary.maximum ?? salary.maxAmount;

    if (salary.isUnpaid) return 'Unpaid';
    if (salary.isDisclosed === false || minimum == null) return 'Salary not disclosed';

    const symbol = symbolFor(currency);

    const rawPeriod = String(salary.period ?? salary.frequency ?? '').toLowerCase();
    const freq = rawPeriod.includes('hour')
      ? 'hr'
      : rawPeriod.includes('day') || rawPeriod.includes('daily')
        ? 'day'
        : rawPeriod.includes('week')
          ? 'wk'
          : rawPeriod.includes('year') || rawPeriod.includes('annual')
            ? 'yr'
            : 'mo';

    const range = maximum != null ? `${minimum}-${maximum}` : `${minimum}`;
    return `${symbol}${range}/${freq}`;
  };



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
          📍 {placeLabel} {formattedDistance ? `· ${formattedDistance}` : ''}
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
          📍 {placeLabel} {formattedDistance ? `· ${formattedDistance}` : ''}
        </Text>
      </View>

      {/* Perks flags */}
      <View className="flex-row flex-wrap gap-1.5 mb-4">
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
      {/* The salary takes what the buttons leave and wraps; the buttons keep
          their size. An unbounded salary pushed Apply outside the card. */}
      <View className="flex-row items-center justify-between border-t border-faint pt-4">
        <View className="flex-1 min-w-0 mr-3">
          <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Salary</Text>
          <Text className="text-lg font-black text-primary-500 mt-0.5" numberOfLines={2}>{getSalaryDisplay()}</Text>
        </View>

        <View className="flex-row gap-2 shrink-0">
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
            accessibilityLabel={viewerState.canManage ? `Manage ${title}` : `Apply for ${title}`}
            accessibilityHint={
              viewerState.canManage ? 'Opens your posting and its applicants' : 'Opens the job posting, where you can send your application'
            }
          >
            <Text className="text-white font-extrabold text-sm">{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
