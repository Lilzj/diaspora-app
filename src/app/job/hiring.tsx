// ─────────────────────────────────────────────────────────────────────────────
// The employer's hiring workspace (Remediation Wave K)
//
// `GET /api/v1/jobs/employers/dashboard` and the decision, interview and offer
// routes have existed since the Jobs module landed. Until this screen the
// employer half of the hiring workflow had **no client at all**: a member could
// receive applications and had no way to read, answer, shortlist, interview or
// make an offer on any of them.
//
// ── The two numbers that lead, and why ───────────────────────────────────────
//
// `unviewedApplicationCount` and `staleApplicationCount` are first on the
// contract and first here. The most useful thing a hiring dashboard can do is
// say how many people are waiting on you — and the second number, applications
// unanswered past the platform's threshold, is the one that feeds this
// employer's **public** ghosting rate. Showing it to them before it shows to
// candidates is the fair order, and reordering this screen would quietly undo
// that decision.
//
// ── What this screen cannot offer, and why ───────────────────────────────────
//
// **No interview schedule and no offer list.** Neither collection has a list
// route: `POST /applications/{id}/interviews` and `POST /applications/{id}/
// offers` write them, and the employer dashboard returns
// `upcomingInterviewCount` and `outstandingOfferCount`, which are numbers. A
// "see the interviews" control would be a control with nothing behind it, so
// the counts are rendered as counts.
//
// **No application detail.** There is no `GET /applications/{id}`, so the
// timeline is only ever visible in the moment a decision writes it. What the
// decision returned is shown inline for exactly that reason.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import {
  useDecideApplication,
  useEmployerApplications,
  useEmployerDashboard,
} from '@/hooks/jobs-hiring';
import { hasResponsivenessEvidence } from '@/lib/jobs-hiring-api';
import type {
  ApplicationCardResponse,
  EmployerDecisionStatus,
  EmployerResponsivenessResponse,
} from '@/types/jobs-hiring';

/** What each decision is called on a button. The wire values are not display text. */
const DECISION_LABELS: Record<EmployerDecisionStatus, string> = {
  UnderReview: 'Start review',
  Shortlisted: 'Shortlist',
  InterviewScheduled: 'Move to interview',
  InterviewCompleted: 'Interview done',
  OfferExtended: 'Make an offer',
  Accepted: 'Hire',
  Rejected: 'Reject',
};

export default function HiringWorkspaceScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();

  // No `employerId`. A recruiter who belongs to exactly one employer should not
  // have to name it — the server resolves the sole membership, and refuses with
  // `jobs.employer.not-found` when there is more than one rather than picking.
  // That refusal is surfaced rather than papered over: the member has to choose,
  // and no route on this module lists the employers they belong to.
  const dashboard = useEmployerDashboard();
  const employerId = dashboard.dashboard?.employerId ?? null;

  const [unviewedOnly, setUnviewedOnly] = useState(false);

  const applicants = useEmployerApplications(employerId, {
    activeOnly: true,
    unviewedOnly,
    // Oldest first when clearing the backlog. The people who have waited longest
    // are the ones a responsiveness figure is about.
    oldestFirst: unviewedOnly,
  });

  const { decide, isDeciding, allowedFrom } = useDecideApplication();

  const onDecide = useCallback(
    async (application: ApplicationCardResponse, status: EmployerDecisionStatus) => {
      try {
        await decide(application.applicationId, {
          status,
          // Stated explicitly on every request. The server's default is `true`,
          // so leaving it unset publishes a reason to the candidate — which is
          // usually right and must never be an accident. Nothing here collects a
          // reason yet, so nothing is published.
          reason: null,
          reasonVisibleToCandidate: false,
        });
      } catch {
        // The server refuses a move the transition table does not permit, and a
        // caller who is not a recruiter of this employer. Neither is something to
        // swallow: an employer who thinks they shortlisted somebody and did not
        // is an employer who never gets back to them.
        showAlert({
          type: 'error',
          title: 'Not saved',
          message: 'We could not record that decision. Someone else may have moved this application.',
        });
      }
    },
    [decide, showAlert]
  );

  if (dashboard.isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Hiring" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F59300" />
          <Text className="text-sm font-semibold text-content-muted mt-3">Loading your hiring…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (dashboard.error || !dashboard.dashboard) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Hiring" />
        <EmptyState
          icon="🏢"
          title="No hiring workspace"
          description={
            dashboard.error ??
            'You are not a member of an employer on this platform, or you belong to more than one and we cannot tell which you meant.'
          }
          action={
            <View className="w-full gap-2">
              {/* The route out. The platform has no way to list the employers a
                  member belongs to, so this screen genuinely cannot tell "you
                  have none" from "you have several" — and registering is the
                  useful answer to the first. */}
              <Button
                label="Register an employer"
                onPress={() => router.push('/employer/register')}
              />
              <Button label="Try again" variant="outline" onPress={dashboard.refresh} />
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  const summary = dashboard.dashboard;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={summary.employerName} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefreshing}
            onRefresh={() => {
              dashboard.refresh();
              applicants.refresh();
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* People waiting on you. First, deliberately. */}
        <View className="mx-4 mt-4 p-4 rounded-2xl bg-surface-card border border-subtle">
          <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
            Waiting on you
          </Text>
          <View className="flex-row mt-3 gap-6">
            <Stat label="Not opened" value={summary.unviewedApplicationCount} emphasise />
            <Stat label="Unanswered" value={summary.staleApplicationCount} emphasise />
            <Stat label="Active" value={summary.activeApplicationCount} />
          </View>
          <Text className="text-[11px] text-content-faint mt-3 leading-relaxed">
            Applications left unanswered past the platform threshold count towards the response
            record candidates can see on your profile.
          </Text>
        </View>

        <Responsiveness responsiveness={summary.responsiveness} />

        <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
          <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
            Coming up
          </Text>
          <View className="flex-row mt-3 gap-6">
            <Stat label="Interviews" value={summary.upcomingInterviewCount} />
            <Stat label="Offers out" value={summary.outstandingOfferCount} />
            <Stat label="Open roles" value={summary.openCount} />
          </View>
          {/* Counts, not lists, because no route lists either. Saying so is
              better than a chevron that opens an empty screen. */}
          <Text className="text-[11px] text-content-faint mt-3 leading-relaxed">
            Interviews and offers are shown as totals — the platform has no route that lists them
            for an employer yet.
          </Text>
        </View>

        {/* The analytics half of hiring — `GET /analytics/employers/me`. Until
            13 Sep 2026 nothing in the app led to the employer dashboard at all;
            this workspace is where an employer would look for it. */}
        <TouchableOpacity
          onPress={() => router.push('/analytics/employer')}
          accessibilityRole="button"
          accessibilityLabel="How your jobs are doing. Views, applications and your top jobs."
          className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle flex-row items-center"
        >
          <View className="flex-1">
            <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
              How your jobs are doing
            </Text>
            <Text className="text-[13px] text-content-secondary mt-1">
              Views, applications and your top jobs
            </Text>
          </View>
          <Text className="text-xl font-bold text-content-tertiary">›</Text>
        </TouchableOpacity>

        {/* The response record above is published on this profile. Until 15 Sep
            2026 the profile page called a route that did not exist, so an
            employer had no way to see what candidates see. */}
        <TouchableOpacity
          onPress={() => router.push(`/employer/${summary.employerId}`)}
          accessibilityRole="button"
          accessibilityLabel="Your public profile. What candidates see about your employer."
          className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle flex-row items-center"
        >
          <View className="flex-1">
            <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
              Your public profile
            </Text>
            <Text className="text-[13px] text-content-secondary mt-1">
              What candidates see about {summary.employerName}
            </Text>
          </View>
          <Text className="text-xl font-bold text-content-tertiary">›</Text>
        </TouchableOpacity>

        <View className="flex-row items-center justify-between px-4 pt-6 pb-2">
          <Text className="text-sm font-black uppercase tracking-widest text-content-strong">
            Applicants
          </Text>
          <TouchableOpacity
            onPress={() => setUnviewedOnly((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ selected: unviewedOnly }}
            className={`px-3 py-1.5 rounded-full border ${
              unviewedOnly ? 'bg-primary-500 border-primary-500' : 'border-line'
            }`}
          >
            <Text
              className={`text-[11px] font-bold ${
                unviewedOnly ? 'text-white' : 'text-content-tertiary'
              }`}
            >
              Not opened
            </Text>
          </TouchableOpacity>
        </View>

        {applicants.error ? (
          <View className="mx-4 p-4 rounded-xl bg-surface-muted border border-error-default">
            <Text className="text-sm font-bold text-error-default">{applicants.error}</Text>
          </View>
        ) : null}

        {applicants.isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#F59300" />
          </View>
        ) : null}

        {applicants.isEmpty ? (
          <EmptyState
            icon="🗂"
            title={unviewedOnly ? 'Everything has been opened' : 'No active applicants'}
            description={
              unviewedOnly
                ? 'Every application still under consideration has been opened by someone on your team.'
                : 'Applications to your open roles appear here.'
            }
          />
        ) : null}

        <View className="px-4">
          {applicants.applications.map((application) => (
            <ApplicantRow
              key={application.applicationId}
              application={application}
              decisions={allowedFrom(application.status)}
              isDeciding={isDeciding}
              onDecide={(status) => onDecide(application, status)}
            />
          ))}
        </View>

        {applicants.hasMore ? (
          <View className="px-4 py-4">
            <Button
              label={applicants.isFetchingMore ? 'Loading…' : 'Show more'}
              variant="outline"
              isLoading={applicants.isFetchingMore}
              onPress={applicants.loadMore}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, emphasise }: { label: string; value: number; emphasise?: boolean }) {
  return (
    <View>
      <Text
        className={`text-2xl font-black ${
          emphasise && value > 0 ? 'text-warning-default' : 'text-content-primary'
        }`}
      >
        {value}
      </Text>
      <Text className="text-[10px] font-bold uppercase tracking-wider text-content-faint mt-0.5">
        {label}
      </Text>
    </View>
  );
}

/**
 * The employer's measured responsiveness.
 *
 * **Every rate is nullable and null means "not enough evidence".** A rate
 * computed from one or two events is noise presented as a fact about a named
 * organisation, and the platform generated it — so the whole block is omitted
 * rather than rendered with zeroes, and each figure is checked individually
 * because they cross their thresholds at different times.
 */
function Responsiveness({
  responsiveness,
}: {
  responsiveness: EmployerResponsivenessResponse;
}) {
  const figures = useMemo(
    () =>
      [
        hasResponsivenessEvidence(responsiveness.averageResponseHours)
          ? { label: 'Typical reply', value: `${Math.round(responsiveness.averageResponseHours)}h` }
          : null,
        hasResponsivenessEvidence(responsiveness.ghostingRate)
          ? {
              label: 'Never answered',
              value: `${Math.round(responsiveness.ghostingRate * 100)}%`,
            }
          : null,
        hasResponsivenessEvidence(responsiveness.offerAcceptanceRate)
          ? {
              label: 'Offers accepted',
              value: `${Math.round(responsiveness.offerAcceptanceRate * 100)}%`,
            }
          : null,
      ].filter((figure): figure is { label: string; value: string } => figure !== null),
    [responsiveness]
  );

  if (figures.length === 0) {
    return (
      <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
        <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
          Your response record
        </Text>
        {/* Not "0%". The platform has not measured enough to say anything, and
            printing a zero would be it publishing a figure it does not have. */}
        <Text className="text-sm text-content-muted mt-2 leading-relaxed">
          Not enough decided applications yet for the platform to publish a response record.
          {responsiveness.decidedCount > 0
            ? ` ${responsiveness.decidedCount} decided so far.`
            : ''}
        </Text>
      </View>
    );
  }

  return (
    <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
      <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">
        Your response record
      </Text>
      <View className="flex-row mt-3 gap-6">
        {figures.map((figure) => (
          <View key={figure.label}>
            <Text className="text-xl font-black text-content-primary">{figure.value}</Text>
            <Text className="text-[10px] font-bold uppercase tracking-wider text-content-faint mt-0.5">
              {figure.label}
            </Text>
          </View>
        ))}
      </View>
      <Text className="text-[11px] text-content-faint mt-3">
        From {responsiveness.decidedCount} decided applications. Candidates can see this.
      </Text>
    </View>
  );
}

/**
 * The name an employer knows an applicant by.
 *
 * Their account name. A server that could not resolve the account sends null,
 * and an erased member has no name to show — so the row says "Applicant" then
 * rather than falling back to a headline, which is a description, not a person.
 */
export function applicantLabel(application: Pick<ApplicationCardResponse, 'applicantName'>): string {
  const name = application.applicantName?.trim();
  return name ? name : 'Applicant';
}

function ApplicantRow({
  application,
  decisions,
  isDeciding,
  onDecide,
}: {
  application: ApplicationCardResponse;
  decisions: readonly EmployerDecisionStatus[];
  isDeciding: boolean;
  onDecide: (status: EmployerDecisionStatus) => void;
}) {
  return (
    <View className="bg-surface-card rounded-2xl border border-subtle p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          {/* Who applied, by the name on their account — 14 Sep 2026. This read
              the headline and nothing else, so an applicant who had written none
              was "Applicant". The headline is now a second line, when there is
              one. `applicantName` is null only when the account can no longer be
              found, and then the row says so rather than inventing a name. */}
          <View className="flex-row items-center flex-wrap">
            <Text className="text-base font-extrabold text-content-primary" numberOfLines={1}>
              {applicantLabel(application)}
            </Text>
            {application.applicantIsVerified === true ? (
              <View
                accessibilityLabel="Verified account"
                className="ml-2 px-2 py-0.5 rounded-full bg-surface-muted"
              >
                <Text className="text-[10px] font-black uppercase text-success-default">
                  ✓ Verified
                </Text>
              </View>
            ) : null}
          </View>
          {application.candidateHeadline ? (
            <Text className="text-xs font-semibold text-content-secondary mt-0.5" numberOfLines={2}>
              {application.candidateHeadline}
            </Text>
          ) : null}
          <Text className="text-xs font-semibold text-content-muted mt-0.5">
            {application.jobTitle}
          </Text>
        </View>

        {!application.hasBeenViewed ? (
          <View className="px-2 py-1 rounded-full bg-surface-muted">
            <Text className="text-[10px] font-black uppercase text-warning-default">New</Text>
          </View>
        ) : null}
      </View>

      {/* `daysWaiting` is null once decided, so this line is about people still
          waiting and nobody else. */}
      {typeof application.daysWaiting === 'number' ? (
        <Text className="text-[11px] font-bold text-content-faint mt-2">
          Waiting {application.daysWaiting} {application.daysWaiting === 1 ? 'day' : 'days'}
        </Text>
      ) : null}

      {/* Only the moves the domain permits from this status. A terminal
          application renders no controls at all, rather than seven disabled
          ones. The server is still the authority and still refuses. */}
      {decisions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {decisions.map((status) => (
            <Button
              key={status}
              label={DECISION_LABELS[status]}
              variant={status === 'Rejected' ? 'ghost' : 'outline'}
              size="sm"
              disabled={isDeciding}
              onPress={() => onDecide(status)}
            />
          ))}
        </View>
      ) : (
        <Text className="text-[11px] font-bold text-content-faint mt-3">
          No further action — this application has been decided.
        </Text>
      )}
    </View>
  );
}
