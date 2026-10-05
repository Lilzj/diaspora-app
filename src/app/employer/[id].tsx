// ─────────────────────────────────────────────────────────────────────────────
// An employer's public profile — rebuilt 15 Sep 2026
//
// **This page never worked against a real server.** It called
// `GET /employers/{id}`, which no module serves, and read a fixture — a star
// rating, a reputation level, followers, "Community Verified" — that no employer
// has. Its header said the backend had no employer read ("NG-04"); the backend
// had added one, `GET /jobs/employers/{idOrSlug}`, and nothing re-read it.
//
// It now reads that route through `lib/employer-profile-api.ts`, and the
// employer's open jobs through `POST /jobs/search`. It opens by identifier or by
// slug. What it owes each reader:
//
//   * **A candidate** — who this employer is, whether the platform has verified
//     it, how it treats applicants (only once there is enough to say), where it
//     hires, how to reach it, and what it is hiring for now.
//   * **The employer's team** (`viewerRole`, the server's answer) — the same
//     page, plus what only they are shown and the ways into their hiring.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { JobCard } from '@/components/JobCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useTheme } from '@/design-system';
import { useEmployerJobs, useEmployerProfile } from '@/hooks/employer-profile';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import {
  employerContactLinks,
  employerStatusNotice,
  hiringRegionLines,
  onDiasporaSince,
  openJobsLabel,
  teamRoleSentence,
} from '@/lib/employer-profile-api';
import { employerKindLabel, employerResponsiveness } from '@/lib/job-detail-api';
import { backOr } from '@/lib/navigation';

export default function EmployerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();

  const { employer, isLoading, isNotFound, loadError, refresh } = useEmployerProfile(id);
  const jobs = useEmployerJobs(employer?.employerId);
  const refreshControl = useRefreshControl([refresh, jobs.refresh]);

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Employer" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={tokens.color.primary[500]} />
          <Text className="text-sm font-semibold text-content-muted mt-3">Loading this employer…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not "not found". Telling a candidate a named organisation does not exist,
  // because a request timed out, is the platform making a claim it cannot back.
  if (loadError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Employer" />
        <EmptyState
          icon="⚠️"
          title="We could not load this employer"
          description={`${loadError} Check your connection and try again.`}
          action={<Button label="Try again" onPress={() => void refresh()} />}
        />
      </SafeAreaView>
    );
  }

  if (isNotFound || !employer) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Employer" />
        <EmptyState
          icon="🔍"
          title="This employer is not on Diaspora"
          description="The link may be wrong, or the profile may have been removed."
          action={<Button label="Go back" variant="outline" onPress={() => backOr()} />}
        />
      </SafeAreaView>
    );
  }

  const statusNotice = employerStatusNotice(employer);
  const teamSentence = teamRoleSentence(employer);
  const responsiveness = employerResponsiveness(employer.responsiveness);
  const regions = hiringRegionLines(employer.hiringRegions);
  const contacts = employerContactLinks(employer);
  const since = onDiasporaSince(employer.registeredAt);
  const initial = employer.displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Employer" />

      <ScrollEndScrollView refreshControl={refreshControl} className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {/* Who they are. */}
        <View className="mx-4 mt-4 p-5 rounded-2xl bg-surface-card border border-subtle">
          <View className="flex-row items-center">
            {/* An initial, not a logo: the logo is a media id, and a link to it is
                minted per reader by Media — a request this page does not make yet. */}
            <View
              className="w-14 h-14 rounded-full bg-primary-50 items-center justify-center"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Text className="text-2xl font-black text-primary-600">{initial}</Text>
            </View>
            <View className="flex-1 ml-4">
              <Text className="text-xl font-black text-content-primary leading-tight" accessibilityRole="header">
                {employer.displayName}
              </Text>
              <Text className="text-xs font-semibold text-content-muted mt-1">{employerKindLabel(employer)}</Text>
            </View>
          </View>

          <View className="flex-row flex-wrap items-center gap-2 mt-3">
            {/* The chip is the server's `isVerified`; the badge beside it is Trust's
                own label, printed only when Trust granted one. */}
            {employer.isVerified ? (
              <View className="bg-info-surface px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-black uppercase text-info-default">✓ Verified employer</Text>
              </View>
            ) : (
              <View className="bg-surface-muted px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-black uppercase text-content-muted">Not verified by Diaspora</Text>
              </View>
            )}
            {employer.isIntermediary ? (
              <View className="bg-warning-surface px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-black uppercase text-warning-default">Recruiter or agency</Text>
              </View>
            ) : null}
          </View>

          {employer.isVerified && employer.verificationBadge ? (
            <Text className="text-xs font-bold text-info-default mt-2">{employer.verificationBadge}</Text>
          ) : null}

          {employer.tagline ? (
            <Text className="text-sm text-content-secondary mt-3 leading-relaxed">{employer.tagline}</Text>
          ) : null}

          {employer.isIntermediary ? (
            <Text className="text-xs text-content-muted mt-2 leading-relaxed">
              Jobs posted here are for other employers, so you would be dealing with a recruiter rather than the
              employer directly.
            </Text>
          ) : null}
        </View>

        {statusNotice ? (
          <View className="mx-4 mt-3 p-4 rounded-2xl border bg-warning-surface border-warning-default">
            <Text className="text-sm font-bold text-warning-default">
              {employer.status === 'Closed' ? 'Closed' : 'Suspended'}
            </Text>
            <Text className="text-sm text-content-secondary mt-1 leading-relaxed">{statusNotice}</Text>
          </View>
        ) : null}

        {/* The team's view. `viewerRole` is set only for a member. */}
        {teamSentence ? (
          <View className="mx-4 mt-3 p-4 rounded-2xl bg-surface-card border border-subtle">
            <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary">Your employer</Text>
            <Text className="text-sm text-content-secondary mt-1">{teamSentence}</Text>
            {employer.legalName || employer.registrationNumber ? (
              <Text className="text-xs text-content-muted mt-2 leading-relaxed">
                {[
                  employer.legalName ? `Registered as ${employer.legalName}` : '',
                  employer.registrationNumber ? `number ${employer.registrationNumber}` : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
                . Only your team sees this.
              </Text>
            ) : null}
            <Text className="text-xs text-content-muted mt-2 leading-relaxed">
              Everyone else sees this page without your team or registration details.
            </Text>
            <View className="gap-2 mt-4">
              <Button label="See applicants" variant="outline" onPress={() => router.push('/job/hiring')} />
              <Button label="Post a job" variant="outline" onPress={() => router.push('/job/create')} />
            </View>
          </View>
        ) : null}

        {employer.description || employer.foundedYear || since ? (
          <Section title="About">
            {employer.description ? (
              <Text className="text-sm text-content-secondary leading-relaxed">{employer.description}</Text>
            ) : null}
            {employer.foundedYear ? (
              <Text className="text-sm text-content-secondary mt-2">Founded in {employer.foundedYear}</Text>
            ) : null}
            {since ? <Text className="text-xs text-content-muted mt-2">{since}</Text> : null}
          </Section>
        ) : null}

        {/* Measured, never claimed — and only once there is enough to measure. */}
        <Section title="How they treat applicants">
          {responsiveness.length > 0 ? (
            <>
              {responsiveness.map((line) => (
                <Text key={line} className="text-sm text-content-secondary mb-1.5">
                  {line}
                </Text>
              ))}
              <Text className="text-xs text-content-faint mt-1">
                Measured by Diaspora from {employer.responsiveness.decidedCount} decided{' '}
                {employer.responsiveness.decidedCount === 1 ? 'application' : 'applications'}.
              </Text>
            </>
          ) : (
            <Text className="text-sm text-content-muted leading-relaxed">
              Not enough applications yet to show how quickly this employer replies.
            </Text>
          )}
        </Section>

        {regions.length > 0 ? (
          <Section title="Where they hire">
            {regions.map((line) => (
              <Text key={line} className="text-sm text-content-secondary mb-1.5">
                {line}
              </Text>
            ))}
          </Section>
        ) : null}

        {contacts.length > 0 ? (
          <Section title="Contact">
            <View className="flex-row flex-wrap gap-2">
              {contacts.map((link) => (
                <Button
                  key={link.kind}
                  label={link.label}
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                  onPress={() => void Linking.openURL(link.url)}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {/* What they are hiring for now. A failure here is this section's, not the page's. */}
        <View className="px-4 pt-6 pb-10">
          <Text className="text-xs font-black uppercase tracking-widest text-content-tertiary mb-3">
            {openJobsLabel(employer.openJobCount)}
          </Text>

          {jobs.isLoading ? (
            <ActivityIndicator color={tokens.color.primary[500]} />
          ) : jobs.error ? (
            <View className="p-4 rounded-2xl bg-surface-card border border-subtle">
              <Text className="text-sm text-content-secondary">We could not load this employer’s jobs.</Text>
              <Button label="Try again" variant="outline" size="sm" className="mt-3" onPress={() => void jobs.refresh()} />
            </View>
          ) : jobs.jobs.length > 0 ? (
            <>
              {jobs.jobs.map((job) => (
                // `JobCard` reads the wire card shape first; see its header.
                <JobCard key={job.jobId} job={job as never} />
              ))}
              {jobs.hasMore ? (
                <Button
                  label="Show more jobs"
                  variant="ghost"
                  isLoading={jobs.isFetchingMore}
                  onPress={jobs.loadMore}
                />
              ) : null}
            </>
          ) : (
            <Text className="text-sm text-content-muted">
              {employer.viewerRole
                ? 'None of your jobs are open right now.'
                : 'This employer is not hiring through Diaspora right now.'}
            </Text>
          )}
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
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
