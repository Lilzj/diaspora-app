import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Share, type GestureResponderEvent } from 'react-native';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';
import type { JobCardResponse } from '@/types/jobs-hiring';
import { CommunityTrustBadge } from './CommunityTrustBadge';
import { placeOf } from '@/lib/platform/listing-place';
import { JOB_TYPE_LABELS, describeSalary, describeSchedule, lastOpenDay, placesLeftLabel } from '@/lib/api/job-detail-api';

interface JobCardProps {
  /** The card every job list sends: `GET /jobs`, an employer's jobs, similar jobs. */
  job: JobCardResponse;
  variant?: 'list' | 'featured';
}

// Memoised (FARCH-004, 27 Nov 2026): a card is drawn once per row of a long list,
// and a parent re-render that hands it the same props should not draw it again.
export const JobCard = memo(function JobCard({ job, variant = 'list' }: JobCardProps) {
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
  // ── Typed as the card since 24 Nov 2026 (RMD-009) ─────────────────────────
  //
  // That fix read every row through `any`, the wire's names first and a
  // pre-backend fixture's second, so the fixture went on type-checking here
  // long after no route sent it. Its names never arrived: the "Urgent Hiring"
  // and "Ending Soon" badges and the accommodation, meals and transport chips
  // could not show against a server, and they are gone. Every caller hands this
  // the card a job list sends (`GET /jobs`, an employer's jobs, similar jobs),
  // so it reads that card, and the type checker holds it to the contract.
  // Nothing is invented: an undisclosed salary says so, and an absent distance
  // is omitted rather than shown as zero.
  const { jobId, title } = job;
  // The wire's `jobType` is a PascalCase value — "FullTime" printed as
  // "FULLTIME" under the job page's "Similar jobs". Worded as the page words it.
  const employmentType = JOB_TYPE_LABELS[job.jobType] ?? job.jobType;
  const employer = { name: job.employerName, isVerified: job.isEmployerVerified };

  // `placeOf` owns the three shapes the list routes send — see
  // `lib/listing-place.ts`. It never throws and never invents.
  const { label: placeLabel, distance: formattedDistance } = placeOf(job as never);
  const { save, unsave, isSaved } = useSavedStore();
  const saved = isSaved(jobId);

  const handlePress = () => {
    router.push(`/job/${jobId}`);
  };

  const handleSaveToggle = (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (saved) {
      unsave(jobId);
    } else {
      save(jobId, 'Job');
    }
  };

  const handleShare = (e: GestureResponderEvent) => {
    e.stopPropagation();
    Share.share({
      message: `Check out this opportunity: "${title}"${placeLabel ? ` in ${placeLabel}` : ''} on Diaspora!`,
    }).catch((error: unknown) => {
      // A card has no alert of its own, so this is logged rather than shown. The
      // share sheet failing to open is otherwise a tap that does nothing.
      console.warn('[job-card] the share sheet could not be opened', error);
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
  // A simple job (5 Nov 2026) is answered with "I'm interested" on its page.
  const isSimple = job.postingMode === 'Simple';
  const simpleLine = isSimple
    ? [describeSchedule(job), placesLeftLabel(job)].filter(Boolean).join(' · ')
    : '';
  const actionLabel = job.canManage
    ? 'Manage'
    : job.hasApplied
      ? isSimple
        ? 'Interested'
        : 'Applied'
      : isSimple
        ? "I'm interested"
        : 'Apply';

  const handleQuickApply = (e: GestureResponderEvent) => {
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
    const closingAt = job.closingAt;
    if (!closingAt) return '';

    const expiry = new Date(closingAt).getTime();
    if (!Number.isFinite(expiry)) return '';

    const now = new Date();
    if (expiry <= now.getTime()) return 'Expired';

    // Calendar days to the last day it takes interest, as the job page counts
    // them. Rounding the hours up said "Expires in 2 days" on the evening
    // before a one-day job that closes at the end of tomorrow (6 Nov 2026).
    const last = lastOpenDay(closingAt);
    if (!last) return '';
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((last.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  };

  /**
   * The pay, worded exactly as the job page words it — "MUR 15,000 a month" —
   * so a card and the page it opens never disagree about the pay. An
   * undisclosed salary says so rather than showing a figure.
   *
   * This used to read `salary.currency`, `salary.frequency`, `salary.amount`
   * and `salary.maxAmount` — none of which exist — and rendered
   * `undefinedundefined/mo`.
   */
  const getSalaryDisplay = (): string => describeSalary(job.salary);



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

        {/* `mt-3` is the space the perks row took, which was always empty: no
            job card carries perks. */}
        <View className="flex-row items-center justify-between border-t border-faint pt-3 mt-3">
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
      {/* Top row: Job type & Expiry countdown & Save icon */}
      <View className="flex-row items-center justify-between mb-3.5">
        <View className="flex-row items-center">
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
        {simpleLine ? (
          <Text className="text-sm text-content-muted font-semibold mt-1">🗓 {simpleLine}</Text>
        ) : null}
      </View>

      {/* Bottom row: Salary & Action buttons */}
      {/* The salary takes what the buttons leave and wraps; the buttons keep
          their size. An unbounded salary pushed Apply outside the card.
          `mt-4` is the space the perks row took, which was always empty: no
          job card carries perks. */}
      <View className="flex-row items-center justify-between border-t border-faint pt-4 mt-4">
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
            accessibilityLabel={
              job.canManage ? `Manage ${title}` : isSimple ? `Say you are interested in ${title}` : `Apply for ${title}`
            }
            accessibilityHint={
              job.canManage ? 'Opens your posting and its applicants' : 'Opens the job posting, where you can send your application'
            }
          >
            <Text className="text-white font-extrabold text-sm">{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});
