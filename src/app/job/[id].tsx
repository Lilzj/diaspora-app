// ─────────────────────────────────────────────────────────────────────────────
// A job — rebuilt on the server's own shape, 15 Sep 2026
//
// This page read `GET /jobs/{id}` as the pre-backend `JobOpportunity` fixture,
// so a real posting showed "Employer (Community Member)", pay as " /mo" and the
// location "Unknown"; its owner was never recognised; and a posting with a
// single responsibility would have crashed it. `lib/job-detail-api.ts` has the
// whole account, and every rule the page applies.
//
// What the page owes each reader:
//
//   * **A candidate** — who is hiring, where, for what pay, whether it is still
//     open, and one clear way to apply, or the reason they cannot.
//   * **The employer's team** — that the job is theirs (`isOnEmployerTeam`, the
//     server's answer, not a comparison of identifiers), how it is doing, and a
//     way to publish, close or remove it. Until this page, a job could not be
//     closed from the app at all.
//   * **Diaspora staff** — the job as a member sees it, and a way to close or
//     remove it. `canManage` is true for staff on every job, which is why it is
//     not the owner check (6 Nov 2026).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Share, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { JobCard } from '@/components/JobCard';
import { ReportModal } from '@/components/ReportModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { PromoteEntry } from '@/components/monetization';
import { useTheme } from '@/design-system';
import { useExpressInterest, useJob, useManageJob, useSimilarJobs } from '@/hooks/job-detail';
import { useApplyToJob } from '@/hooks/jobs-hiring';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import { trackContentViewed } from '@/lib/analytics/content-events';
import { itemAnalyticsRoute } from '@/lib/analytics/item-pages';
import { ConversationHub } from '@/lib/conversation-hub';
import {
  JOB_TYPE_LABELS,
  WORKPLACE_LABELS,
  applicantCountLabel,
  applyStateOf,
  describeSchedule,
  placesLeftLabel,
  categoryLabel,
  describeSalary,
  employerKindLabel,
  employerResponsiveness,
  formatJobDate,
  isOnEmployerTeam,
  jobConversationSubtitle,
  jobPlaceLabel,
  jobStanding,
  openingsLabel,
  ownerActionsFor,
  workArrangementFacts,
  type CloseOutcome,
  type JobStanding,
} from '@/lib/job-detail-api';
import { fetchJobCategories } from '@/lib/job-postings-api';
import { jobsHiringErrorMessage } from '@/lib/jobs-hiring-api';
import { useNotification } from '@/providers/notification-provider';
import { useSavedStore } from '@/store/saved';
import type { JobDetailLineResponse, JobResponse } from '@/types/jobs-hiring';
import { backOr } from '@/lib/navigation';

/** Statuses a promotion could still send anybody to. */
const PROMOTABLE = new Set<JobResponse['status']>(['Published', 'Open', 'ReceivingApplications', 'Interviewing', 'OfferMade']);

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();

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

  const { job, isLoading, isNotFound, loadError, refresh } = useJob(id);
  const similarJobs = useSimilarJobs(job);
  const manage = useManageJob(job?.jobId ?? id);
  // Above the early returns, like every hook here: the order may not change.
  const interest = useExpressInterest(job);
  const refreshControl = useRefreshControl(refresh);

  // Only for the category's name. The catalogue is shared with Post a job, and a
  // page that cannot reach it prints the key made readable instead.
  const categories = useQuery({ queryKey: ['jobs', 'categories'], queryFn: fetchJobCategories, staleTime: 60 * 60 * 1000 });

  // The real hiring client. Keyed by the route identifier rather than by the
  // loaded job, so the mutation exists before the read resolves.
  const { apply, isApplying } = useApplyToJob(id ?? null);

  const { save, unsave, isSaved } = useSavedStore();
  const [reportModalVisible, setReportModalVisible] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Job" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={tokens.color.primary[500]} />
          <Text className="text-sm font-semibold text-content-muted mt-3">Loading this job…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // A failed read is not a missing job. It used to say "Opportunity Not Found"
  // for both, which is how a cold start straight after an install told a member
  // a live job had been removed.
  if (loadError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Job" />
        <EmptyState
          icon="⚠️"
          title="We could not load this job"
          description={`${loadError} Check your connection and try again.`}
          action={<Button label="Try again" onPress={() => void refresh()} />}
        />
      </SafeAreaView>
    );
  }

  if (isNotFound || !job) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Job" />
        <EmptyState
          icon="🔍"
          title="This job is not available"
          description="It may have been removed, or the link may be wrong."
          action={<Button label="Go back" variant="outline" onPress={() => backOr()} />}
        />
      </SafeAreaView>
    );
  }

  const standing = jobStanding(job);
  const applyState = applyStateOf(job);
  const actions = ownerActionsFor(job);
  const place = jobPlaceLabel(job.location);
  const category = categoryLabel(job.categoryKey, categories.data ?? []);
  const saved = isSaved(job.jobId);
  // Whose job it is, and who may manage it, are two answers (6 Nov 2026). Staff
  // may close or remove any job, but it is still somebody else's: they see the
  // job as a member does, and can say they are interested like anyone.
  const onTeam = isOnEmployerTeam(job);
  const staffOnly = job.canManage && !onTeam;
  const canMessage = !onTeam && Boolean(job.employer.ownerUserId);

  // A simple job (5 Nov 2026) is answered with "I'm interested", says when the
  // work is, and counts its places off.
  const isSimple = job.postingMode === 'Simple';
  const schedule = describeSchedule(job);
  const places = placesLeftLabel(job);
  const arrangement = workArrangementFacts(job);

  const handleInterest = async () => {
    try {
      await interest.express();
    } catch (cause) {
      // Nothing is said to have been sent unless it was.
      showAlert({ type: 'error', title: 'Not sent', message: jobsHiringErrorMessage(cause) });
    }
  };

  const closingDate = job.closingAt ? new Date(job.closingAt) : null;
  const facts = [
    // A simple job says its places on their own line just above.
    isSimple && places ? '' : openingsLabel(job),
    job.publishedAt ? `Posted ${formatJobDate(job.publishedAt)}` : '',
    closingDate && !Number.isNaN(closingDate.getTime())
      ? `${closingDate.getTime() > Date.now() ? 'Closes' : 'Closed'} ${formatJobDate(job.closingAt)}`
      : '',
  ].filter(Boolean);

  const handleSaveToggle = () => {
    if (saved) {
      unsave(job.jobId);
    } else {
      save(job.jobId, 'Job');
    }
  };

  const handleShare = () => {
    Share.share({
      message: `"${job.title}" at ${job.employer.displayName}${place ? ` in ${place}` : ''}, on Diaspora.`,
    });
  };

  // An employer is not a person. The message goes to the member who owns it, and
  // the button is absent rather than broken when the server does not say who.
  const handleMessage = async () => {
    if (!job.employer.ownerUserId) return;
    await ConversationHub.openOrCreateConversation({
      recipientId: job.employer.ownerUserId,
      recipientName: job.employer.displayName,
      contextType: 'JobOpportunity',
      entityId: job.jobId,
      entityTitle: job.title,
      entitySubtitle: jobConversationSubtitle(job),
      entityStatus: job.status,
      deepLink: `/job/${job.jobId}`,
      campaignSource: 'job_detail',
    });
  };

  /**
   * Applying needs only the account — 14 Sep 2026. The server creates the
   * candidate profile with a first application, and the employer sees the
   * applicant by their account, so the confirmation says exactly that. The
   * success alert fires only once the server has confirmed the application.
   */
  const handleApply = () => {
    showAlert({
      type: 'question',
      title: 'Apply for this job?',
      message: `"${job.title}". The employer will see your name, whether your Diaspora account is verified, and anything you have added to your work profile.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply now',
          onPress: async () => {
            try {
              // Every field on `ApplyToJobRequest` is optional, so an empty
              // application is a valid one: the server falls back to the
              // candidate's default résumé and refuses outright when a posting
              // requires one and there is none.
              await apply();
            } catch (cause) {
              // A failed application must never be reported as a sent one.
              showAlert({ type: 'error', title: 'Application not sent', message: jobsHiringErrorMessage(cause) });
              return;
            }

            showAlert({
              type: 'success',
              title: 'Application Sent',
              message: `Your application went to ${job.employer.displayName}. You can see whether they have opened it under "My applications".`,
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

  const runManagement = async (work: () => Promise<void>, success: { title: string; message: string }) => {
    try {
      await work();
    } catch (cause) {
      // Nothing changed on the server, so nothing is said to have changed.
      showAlert({ type: 'error', title: 'Nothing was changed', message: manage.errorMessage(cause) });
      return;
    }
    showAlert({ type: 'success', ...success });
  };

  const confirmFillPlace = () => {
    const left = Math.max(0, job.remainingVacancies - 1);
    showAlert({
      type: 'question',
      title: 'Count one place as filled?',
      message:
        left === 0
          ? 'That is the last place, so the job closes and stops taking interest.'
          : `${left} ${left === 1 ? 'place stays' : 'places stay'} open after this.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '1 place filled',
          onPress: () =>
            void runManagement(manage.fillPlace, {
              title: left === 0 ? 'All places filled' : 'Place filled',
              message: left === 0 ? 'The job is closed.' : `${left} ${left === 1 ? 'place' : 'places'} left.`,
            }),
        },
      ],
    });
  };

  const confirmPublish = () => {
    showAlert({
      type: 'question',
      title: 'Publish this job?',
      message: `"${job.title}" will be visible to everyone on Diaspora and open to applications.`,
      buttons: [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Publish',
          onPress: () =>
            void runManagement(manage.publish, {
              title: 'Job published',
              message: `"${job.title}" is live and open to applications.`,
            }),
        },
      ],
    });
  };

  const close = (outcome: CloseOutcome) =>
    void runManagement(() => manage.close(outcome), {
      title: 'Job closed',
      message:
        outcome === 'filled'
          ? `"${job.title}" is marked as filled and no longer takes applications.`
          : `"${job.title}" no longer takes applications.`,
    });

  const confirmClose = () => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Keep it open', style: 'cancel' },
    ];
    // Only the employer knows whether somebody was hired; staff only take a job down.
    if (onTeam && actions.closeOutcomes.includes('filled')) {
      buttons.push({ text: 'Someone was hired', onPress: () => close('filled') });
    }
    if (actions.closeOutcomes.includes('withdrawn')) {
      buttons.push({ text: 'No longer hiring', style: 'destructive', onPress: () => close('withdrawn') });
    }

    showAlert({
      type: 'question',
      title: 'Close this job?',
      message:
        'It stops taking applications and leaves search. Anyone who opens it will see it is closed. You cannot reopen it from the app.',
      buttons,
    });
  };

  const confirmArchive = () => {
    showAlert({
      type: 'warning',
      title: 'Remove this job from Diaspora?',
      message: `It comes off every public part of Diaspora. ${
        onTeam ? 'Your team' : `${job.employer.displayName}'s team`
      } can still open this page. You cannot undo this from the app.`,
      buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            void runManagement(manage.archive, {
              title: 'Job removed',
              message: `"${job.title}" is no longer shown anywhere on Diaspora.`,
            }),
        },
      ],
    });
  };

  const analyticsRoute = itemAnalyticsRoute('Job', job.jobId);

  // The profile opens by the employer profile's own id — never the owner's user
  // id, which is a person rather than the organisation.
  const openEmployer = () => router.push(`/employer/${job.employer.employerId}`);
  const responsiveness = employerResponsiveness(job.employer);
  const guides = job.guides.filter((guide) => Boolean(guide.title?.trim()));
  const website = job.employer.websiteUrl?.trim();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader
        title="Job"
        rightAction={
          <View className="flex-row items-center">
            {/* Saving is a job seeker's bookmark. The team keeps its own jobs
                under My jobs. */}
            {!onTeam ? (
              <TouchableOpacity
                onPress={handleSaveToggle}
                className="w-11 h-11 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={saved ? 'Remove from saved' : 'Save this job'}
              >
                <Ionicons
                  name={saved ? 'heart' : 'heart-outline'}
                  size={22}
                  color={saved ? tokens.color.error.default : tokens.color.text.primary}
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleShare}
              className="w-11 h-11 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Share this job"
            >
              <Ionicons name="share-outline" size={22} color={tokens.color.text.primary} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollEndScrollView refreshControl={refreshControl} className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {/* The job at a glance. */}
        <View className="mx-4 mt-4 p-5 rounded-2xl bg-surface-card border border-subtle">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-[11px] font-black uppercase tracking-widest text-content-tertiary" numberOfLines={1}>
              {[JOB_TYPE_LABELS[job.jobType] ?? job.jobType, category].filter(Boolean).join(' · ')}
            </Text>
            <StandingPill standing={standing} />
          </View>

          <Text className="text-2xl font-black text-content-primary leading-tight mt-3" accessibilityRole="header">
            {job.title}
          </Text>

          <View className="flex-row flex-wrap items-center mt-2 gap-2">
            <TouchableOpacity
              onPress={openEmployer}
              accessibilityRole="link"
              accessibilityLabel={`${job.employer.displayName}. Opens the employer's profile.`}
            >
              <Text className="text-sm font-extrabold text-primary-500">{job.employer.displayName}</Text>
            </TouchableOpacity>
            {job.employer.isVerified ? (
              <View className="bg-surface-muted px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-black uppercase text-info-default">✓ Verified employer</Text>
              </View>
            ) : null}
          </View>

          {place ? (
            <View className="flex-row items-center mt-3">
              <Ionicons name="location-outline" size={16} color={tokens.color.text.secondary} />
              <Text className="text-sm font-semibold text-content-secondary ml-1.5 flex-1">
                {place} · {WORKPLACE_LABELS[job.workArrangement.workplaceType] ?? job.workArrangement.workplaceType}
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-center mt-2">
            <Ionicons name="cash-outline" size={16} color={tokens.color.text.secondary} />
            <Text className="text-lg font-black text-content-primary ml-1.5 flex-1">{describeSalary(job.salary)}</Text>
          </View>

          {schedule ? (
            <View className="flex-row items-center mt-2">
              <Ionicons name="calendar-outline" size={16} color={tokens.color.text.secondary} />
              <Text className="text-sm font-semibold text-content-secondary ml-1.5 flex-1">{schedule}</Text>
            </View>
          ) : null}

          {isSimple && places ? (
            <View className="flex-row items-center mt-2">
              <Ionicons name="people-outline" size={16} color={tokens.color.text.secondary} />
              <Text className="text-sm font-semibold text-content-secondary ml-1.5 flex-1">{places}</Text>
            </View>
          ) : null}

          <Text className="text-xs font-semibold text-content-muted mt-3">{facts.join(' · ')}</Text>
        </View>

        {/* Why it cannot be applied to, when it cannot. */}
        {standing.explanation && standing.tone !== 'open' ? (
          <View className={`mx-4 mt-3 p-4 rounded-2xl border ${TONE_CARD[standing.tone]}`}>
            <Text className={`text-sm font-bold ${TONE_TEXT[standing.tone]}`}>{standing.label}</Text>
            <Text className="text-sm text-content-secondary mt-1 leading-relaxed">{standing.explanation}</Text>
          </View>
        ) : null}

        {/* The owner's view: the employer's team, the server's answer. */}
        {onTeam ? (
          <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
            <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">Your job</Text>
            <Text className="text-sm text-content-secondary mt-1">You manage this job for {job.employer.displayName}.</Text>

            {/* Applications only. The posting's own view and save counters read 0
                for every job: `JobPosting.RecordView` has no caller, and members
                save through bookmarks rather than the Jobs save route. Views are
                measured by Analytics, so the link goes there instead of printing
                an unmeasured figure as a zero. */}
            <View className="flex-row items-end justify-between mt-3">
              <Figure value={job.engagement.applicationCount} label="Applications" />
              {analyticsRoute ? (
                <TouchableOpacity
                  onPress={() => router.push(analyticsRoute as never)}
                  accessibilityRole="link"
                  className="py-1"
                >
                  <Text className="text-sm font-bold text-primary-500">How this job is doing ›</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View className="gap-2 mt-4">
              <Button label="See applicants" variant="outline" onPress={() => router.push('/job/hiring')} />
              {/* Added 14 Oct 2026: a posting could be closed or removed but never corrected.
                  A removed job cannot be changed, so it is not offered there. */}
              {job.status !== 'Archived' ? (
                <Button label="Edit job" variant="outline" onPress={() => router.push(`/job/edit/${job.jobId}`)} />
              ) : null}
              {actions.canPublish ? (
                <Button label="Publish" isLoading={manage.isWorking} onPress={confirmPublish} />
              ) : null}
              {isSimple && job.remainingVacancies > 0 && actions.closeOutcomes.length > 0 ? (
                <Button label="1 place filled" isLoading={manage.isWorking} onPress={confirmFillPlace} />
              ) : null}
              {actions.closeOutcomes.length > 0 ? (
                <Button label="Close to applications" variant="outline" disabled={manage.isWorking} onPress={confirmClose} />
              ) : null}
              {actions.canArchive ? (
                <Button label="Remove from Diaspora" variant="ghost" disabled={manage.isWorking} onPress={confirmArchive} />
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Staff on somebody else's job: moderation only. Applicants, editing,
            places and promotion are the employer's. */}
        {staffOnly && (actions.closeOutcomes.length > 0 || actions.canArchive) ? (
          <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
            <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">Diaspora staff</Text>
            <Text className="text-sm text-content-secondary mt-1">
              This job is {job.employer.displayName}&apos;s. As staff you can close it or take it off Diaspora.
            </Text>
            <View className="gap-2 mt-4">
              {actions.closeOutcomes.length > 0 ? (
                <Button label="Close to applications" variant="outline" disabled={manage.isWorking} onPress={confirmClose} />
              ) : null}
              {actions.canArchive ? (
                <Button label="Remove from Diaspora" variant="ghost" disabled={manage.isWorking} onPress={confirmArchive} />
              ) : null}
            </View>
          </View>
        ) : null}

        {onTeam && PROMOTABLE.has(job.status) ? (
          <View className="mx-4 mt-3">
            <PromoteEntry target="job" subjectId={job.jobId} title={job.title} isOwner />
          </View>
        ) : null}

        <Section title="About this job">
          <Text className="text-sm text-content-secondary leading-relaxed">{job.description || job.summary}</Text>
        </Section>

        <DetailLines title="What you will do" lines={job.responsibilities} />
        <DetailLines title="What they are looking for" lines={job.requirements} markEssential />
        <DetailLines title="Benefits" lines={job.benefits} />

        {job.skills.length > 0 ? (
          <Section title="Skills">
            <View className="flex-row flex-wrap gap-2">
              {job.skills.map((skill) => (
                <View key={skill.key} className="px-3 py-1.5 rounded-full bg-surface-muted">
                  <Text className="text-xs font-bold text-content-secondary">
                    {skill.name}
                    {skill.isEssential ? ' · essential' : ''}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* On a simple job "Where" is all the poster said, and the top of the
            page already says it. */}
        {!isSimple || arrangement.some((fact) => fact.label !== 'Where') ? (
          <Section title="How the work is arranged">
            {arrangement.map((fact) => (
              <View key={fact.label} className="flex-row py-1.5">
                <Text className="w-36 text-sm text-content-muted">{fact.label}</Text>
                <Text className="flex-1 text-sm font-semibold text-content-primary">{fact.value}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {/* A job seeker's look at who is hiring (6 Nov 2026: Zoe was shown her
            own reply speed, as "this employer", on her own job). The team's
            way to its own profile is the employer's name at the top. Staff
            still see it: they read the job as a member does. */}
        {!onTeam ? (
          <Section title="About the employer">
            <Text className="text-base font-bold text-content-primary">{job.employer.displayName}</Text>
            <Text className="text-xs text-content-muted mt-0.5">{employerKindLabel(job.employer)}</Text>
            {job.employer.verificationBadge ? (
              <Text className="text-xs font-bold text-info-default mt-1">{job.employer.verificationBadge}</Text>
            ) : null}
            {job.employer.tagline ? (
              <Text className="text-sm text-content-secondary mt-2 leading-relaxed">{job.employer.tagline}</Text>
            ) : null}
            {job.employer.isIntermediary ? (
              <Text className="text-sm text-content-secondary mt-2 leading-relaxed">
                This is a recruiter or agency, so you would be dealing with them rather than the employer directly.
              </Text>
            ) : null}
            {responsiveness.length > 0 ? (
              responsiveness.map((line) => (
                <Text key={line} className="text-sm text-content-secondary mt-2">
                  {line}
                </Text>
              ))
            ) : (
              <Text className="text-xs text-content-faint mt-2 leading-relaxed">
                Not enough applications yet to show how quickly this employer replies.
              </Text>
            )}
            <TouchableOpacity onPress={openEmployer} className="mt-3" accessibilityRole="link">
              <Text className="text-sm font-bold text-primary-500">See their profile and open jobs ›</Text>
            </TouchableOpacity>
            {website && /^https?:\/\//i.test(website) ? (
              <TouchableOpacity
                onPress={() => void Linking.openURL(website)}
                className="mt-3"
                accessibilityRole="link"
                accessibilityLabel={`Open ${job.employer.displayName}'s website`}
              >
                <Text className="text-sm font-bold text-primary-500">Visit their website ›</Text>
              </TouchableOpacity>
            ) : null}
          </Section>
        ) : null}

        {guides.length > 0 ? (
          <Section title="Guides for this job">
            {guides.map((guide) => (
              <TouchableOpacity
                key={guide.guideId}
                onPress={() => router.push(`/guide/${guide.guideId}`)}
                className="py-2"
                accessibilityRole="link"
              >
                <Text className="text-sm font-bold text-primary-500">{guide.title}</Text>
                {guide.label || guide.summary ? (
                  <Text className="text-xs text-content-muted mt-0.5" numberOfLines={2}>
                    {guide.label || guide.summary}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </Section>
        ) : null}

        {/* A simple job: "I'm interested", which messages the poster. No CV, no profile. */}
        {isSimple && applyState.kind !== 'manage' ? (
          <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
            {applyState.kind === 'applied' ? (
              <>
                <Text className="text-base font-bold text-content-primary">You said you are interested</Text>
                <Text className="text-sm text-content-muted mt-1 leading-relaxed">
                  {job.employer.displayName} has your message. Carry on in your messages to arrange the work.
                </Text>
                {canMessage ? (
                  <Button label="Open messages" icon="chatbubble-outline" className="mt-3" onPress={() => void handleMessage()} />
                ) : null}
              </>
            ) : applyState.kind === 'open' ? (
              <>
                {places ? <Text className="text-sm text-content-muted">{places}</Text> : null}
                <Button
                  label="I'm interested"
                  className="mt-3"
                  isLoading={interest.isSending}
                  loadingLabel="Sending…"
                  onPress={() => void handleInterest()}
                  testID="job-interested"
                />
                <Text className="text-xs text-content-muted mt-2 leading-relaxed">
                  Sends {job.employer.displayName} a message in Diaspora. You need no CV or work profile.
                </Text>
              </>
            ) : (
              <>
                <Text className="text-base font-bold text-content-primary">Not taking interest</Text>
                <Text className="text-sm text-content-muted mt-1 leading-relaxed">{applyState.reason}</Text>
              </>
            )}
          </View>
        ) : null}

        {/* Applying — or why not. The employer's team sees none of it. */}
        {!isSimple && applyState.kind !== 'manage' ? (
          <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
            {applyState.kind === 'applied' ? (
              <>
                <Text className="text-base font-bold text-content-primary">You have applied to this job</Text>
                <Text className="text-sm text-content-muted mt-1 leading-relaxed">
                  Follow what has happened to your application under My applications.
                </Text>
                <Button label="My applications" className="mt-3" onPress={() => router.push('/job/applications')} />
              </>
            ) : applyState.kind === 'open' ? (
              <>
                <Text className="text-sm text-content-muted">{applicantCountLabel(job.engagement.applicationCount)}</Text>
                <Button
                  label="Apply now"
                  className="mt-3"
                  isLoading={isApplying}
                  loadingLabel="Sending your application…"
                  onPress={handleApply}
                />
                <Button
                  label="My applications"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onPress={() => router.push('/job/applications')}
                />
              </>
            ) : (
              <>
                <Text className="text-base font-bold text-content-primary">Not taking applications</Text>
                <Text className="text-sm text-content-muted mt-1 leading-relaxed">{applyState.reason}</Text>
              </>
            )}

            {canMessage ? (
              <Button
                label="Message the employer"
                variant="outline"
                icon="chatbubble-outline"
                className="mt-3"
                onPress={() => void handleMessage()}
              />
            ) : null}
          </View>
        ) : null}

        {/* Not for the employer: nobody reports their own job (13 Oct 2026). They
            already have Close and Remove above. */}
        {!job.canManage ? (
          <TouchableOpacity
            onPress={() => setReportModalVisible(true)}
            className="items-center py-6"
            accessibilityRole="button"
          >
            <Text className="text-xs text-content-faint font-extrabold uppercase">Report this job</Text>
          </TouchableOpacity>
        ) : null}

        {similarJobs.length > 0 ? (
          <View className="px-4 pb-10">
            <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary mb-3">Similar jobs</Text>
            {similarJobs.map((item) => (
              // `JobCard` reads the wire card shape first; see its header.
              <JobCard key={item.jobId} job={item as never} />
            ))}
          </View>
        ) : null}
      </ScrollEndScrollView>

      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Job"
        contentId={job.jobId}
      />
    </SafeAreaView>
  );
}

const TONE_PILL: Record<JobStanding['tone'], string> = {
  open: 'bg-surface-muted',
  paused: 'bg-surface-muted',
  closed: 'bg-surface-muted',
  private: 'bg-surface-muted',
};

const TONE_TEXT: Record<JobStanding['tone'], string> = {
  open: 'text-success-default',
  paused: 'text-warning-default',
  closed: 'text-content-secondary',
  private: 'text-info-default',
};

const TONE_CARD: Record<JobStanding['tone'], string> = {
  open: 'bg-surface-muted border-success-default',
  paused: 'bg-surface-muted border-warning-default',
  closed: 'bg-surface-card border-subtle',
  private: 'bg-surface-muted border-info-default',
};

/** The standing, in words as well as colour. */
function StandingPill({ standing }: { standing: JobStanding }) {
  return (
    <View className={`px-2.5 py-1 rounded-full ${TONE_PILL[standing.tone]}`}>
      <Text className={`text-[10px] font-black uppercase tracking-wider ${TONE_TEXT[standing.tone]}`}>{standing.label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
      <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary mb-3">{title}</Text>
      {children}
    </View>
  );
}

/**
 * Bulleted lines. Each is `{ lineId, text, isEssential }` — rendering the object
 * itself, as this page did, throws.
 */
function DetailLines({
  title,
  lines,
  markEssential = false,
}: {
  title: string;
  lines: JobDetailLineResponse[];
  markEssential?: boolean;
}) {
  const shown = lines.filter((line) => line.text?.trim());
  if (shown.length === 0) return null;

  return (
    <Section title={title}>
      {shown.map((line) => (
        <View key={line.lineId} className="flex-row items-start mb-2">
          <Text className="text-primary-500 font-extrabold mr-2.5">•</Text>
          <Text className="flex-1 text-sm text-content-secondary leading-relaxed">
            {line.text}
            {markEssential ? (line.isEssential ? ' (essential)' : ' (nice to have)') : ''}
          </Text>
        </View>
      ))}
    </Section>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View>
      <Text className="text-xl font-black text-content-primary">{value}</Text>
      <Text className="text-[10px] font-bold uppercase tracking-wider text-content-faint mt-0.5">{label}</Text>
    </View>
  );
}
