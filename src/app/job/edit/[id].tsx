// ─────────────────────────────────────────────────────────────────────────────
// Edit a job
//
// **Added 14 Oct 2026.** An employer could close or remove their posting but
// not correct it: `PUT /jobs/{jobId}` had no caller. This screen loads the job
// through the page's own read (`useJob`, so it shares the page's cache) and
// saves through `toUpdateJobRequest`, which sends every field the form does not
// show back exactly as read — the route replaces the whole posting, and a field
// left out of the body is blanked, not kept. See `lib/job-detail-api.ts`.
//
// Not editable here, because the route does not take them: the category
// (`UpdateJobRequest` has no `categoryKey`), and the responsibilities,
// requirements, benefits and skills, which have their own routes. The place is
// sent back unchanged: re-filing a town needs the picker the create flow has.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useJob } from '@/hooks/job-detail';
import {
  EXPERIENCE_LABELS,
  JOB_EDIT_LIMITS,
  JOB_TYPE_LABELS,
  PAY_PERIOD_PHRASES,
  WORKPLACE_LABELS,
  jobEditErrorMessage,
  jobEditFormFrom,
  jobEditMissing,
  jobEditProblem,
  toUpdateJobRequest,
  updateJob,
  type JobEditForm,
} from '@/lib/job-detail-api';
import { useMemberCurrency } from '@/lib/member-currency';
import { backOr } from '@/lib/navigation';
import { useNotification } from '@/providers/notification-provider';
import type { JobResponse } from '@/types/jobs-hiring';

// The choices are the platform's own words for each value (`job-detail-api`),
// the ones the job page prints — not a second list. They cover every value the
// server stores, so a job posted as "Other" or "Principal" still shows its own
// choice selected rather than none.
function optionsOf<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

const JOB_TYPES = optionsOf(JOB_TYPE_LABELS);
const EXPERIENCE_LEVELS = optionsOf(EXPERIENCE_LABELS);
const WORKPLACES = optionsOf(WORKPLACE_LABELS);
// One word per chip — a two-word label in a wrapping row was cut to "a" on an
// Android 16 phone (see `job/create.tsx`). The period's own name is that word.
const PAY_PERIODS = (Object.keys(PAY_PERIOD_PHRASES) as (keyof typeof PAY_PERIOD_PHRASES)[]).map((value) => ({
  value,
  label: value,
}));

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, isNotFound, loadError, refresh } = useJob(id);

  if (isLoading) {
    return (
      <Frame>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F59300" />
        </View>
      </Frame>
    );
  }

  if (loadError) {
    return (
      <Frame>
        <EmptyState
          icon="📡"
          title="Could not open this job"
          description={loadError}
          action={<Button label="Try again" onPress={() => void refresh()} />}
        />
      </Frame>
    );
  }

  if (isNotFound || !job) {
    return (
      <Frame>
        <EmptyState icon="🔍" title="Job not found" description="This job is not there any more." />
      </Frame>
    );
  }

  // `canManage` is the server's answer; it refuses the save anyway.
  if (!job.canManage) {
    return (
      <Frame>
        <EmptyState icon="🔒" title="You can only edit your own job" description="This job is managed by another employer." />
      </Frame>
    );
  }

  if (job.status === 'Archived') {
    return (
      <Frame>
        <EmptyState icon="🗄️" title="This job has been removed" description="A removed job cannot be changed." />
      </Frame>
    );
  }

  // Keyed by revision, so a job refreshed underneath restarts the form from it.
  return <EditJobForm key={`${job.jobId}:${job.revision}`} job={job} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit job" showBack onBack={() => backOr()} />
      {children}
    </SafeAreaView>
  );
}

function EditJobForm({ job }: { job: JobResponse }) {
  const bottomInset = useBottomInset();
  const client = useQueryClient();
  const { showAlert, showToast } = useNotification();
  const memberCurrency = useMemberCurrency();

  const initial = useMemo(() => jobEditFormFrom(job), [job]);
  const [form, setForm] = useState<JobEditForm>(initial);
  const [isSaving, setIsSaving] = useState(false);

  const update = <K extends keyof JobEditForm>(key: K, value: JobEditForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const isChanged = JSON.stringify(form) !== JSON.stringify(initial);
  const stillNeeded = jobEditMissing(form);
  const valueProblem = stillNeeded.length > 0 ? null : jobEditProblem(form, job);

  // The job's own currency, never chosen. Only a job that stated no pay before
  // takes the member's residence currency, as posting does.
  const currency = job.salary.currencyCode ?? memberCurrency.code;

  const save = async () => {
    setIsSaving(true);
    try {
      await updateJob(job.jobId, toUpdateJobRequest(job, form, memberCurrency.code));
      // Every list that shows this job — the page, the hiring workspace, search.
      void client.invalidateQueries();
      showToast({ type: 'success', title: 'Job updated', message: 'Your changes are saved.' });
      backOr(`/job/${job.jobId}`);
    } catch (cause) {
      // The form stays as typed; nothing was saved.
      showAlert({ type: 'error', title: 'Not saved', message: jobEditErrorMessage(cause) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit job" showBack onBack={() => backOr(`/job/${job.jobId}`)} />

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView className="flex-1 px-5 pt-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="pb-8">
            <Input
              label="Job title"
              value={form.title}
              onChangeText={(value) => update('title', value)}
              maxLength={JOB_EDIT_LIMITS.maxTitle}
            />
            <Input
              label="Description"
              value={form.description}
              onChangeText={(value) => update('description', value)}
              multiline
              className="h-40 py-3"
              textAlignVertical="top"
            />
            <Input
              label="Summary (optional)"
              placeholder="The one line shown on job cards"
              value={form.summary}
              onChangeText={(value) => update('summary', value)}
              maxLength={JOB_EDIT_LIMITS.maxSummary}
              multiline
              className="h-20 py-3"
              textAlignVertical="top"
            />
            <Text className="text-xs text-content-muted -mt-2 mb-5 leading-relaxed">
              Leave it empty and Diaspora uses the first sentence of the description.
            </Text>

            <SectionLabel>Type of work</SectionLabel>
            <Chips options={JOB_TYPES} selected={form.jobType} onSelect={(value) => update('jobType', value)} />

            <SectionLabel className="mt-6">Experience needed</SectionLabel>
            <Chips
              options={EXPERIENCE_LEVELS}
              selected={form.experienceLevel}
              onSelect={(value) => update('experienceLevel', value)}
            />

            <SectionLabel className="mt-6">Pay (optional)</SectionLabel>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Input
                  label="From"
                  value={form.salaryMinimum}
                  onChangeText={(value) => update('salaryMinimum', value)}
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1">
                <Input
                  label="To (optional)"
                  value={form.salaryMaximum}
                  onChangeText={(value) => update('salaryMaximum', value)}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <Text className="text-xs font-bold text-content-secondary mb-3">Pay is in {currency}.</Text>
            <Chips options={PAY_PERIODS} selected={form.salaryPeriod} onSelect={(value) => update('salaryPeriod', value)} />
            <Toggle
              label="Pay is negotiable"
              checked={form.salaryNegotiable}
              onToggle={() => update('salaryNegotiable', !form.salaryNegotiable)}
            />
            <Text className="text-xs text-content-muted mt-2 leading-relaxed">
              Clear both figures to stop stating pay.
            </Text>

            <View className="mt-6">
              <Input
                label="How many people you are hiring"
                value={form.vacancyCount}
                onChangeText={(value) => update('vacancyCount', value)}
                keyboardType="number-pad"
              />
            </View>

            <SectionLabel>Where the work happens</SectionLabel>
            <Chips options={WORKPLACES} selected={form.workplaceType} onSelect={(value) => update('workplaceType', value)} />
            {form.workplaceType !== 'OnSite' ? (
              <View className="mt-4">
                <Input
                  label="Remote policy (optional)"
                  placeholder="Within the EU; must overlap 09:00–13:00 UTC"
                  value={form.remotePolicy}
                  onChangeText={(value) => update('remotePolicy', value)}
                  maxLength={JOB_EDIT_LIMITS.maxRemotePolicy}
                />
              </View>
            ) : null}

            <Toggle
              label="You will sponsor a work visa"
              hint="Shown to candidates as your promise. Diaspora does not check it."
              checked={form.offersVisaSponsorship}
              onToggle={() => update('offersVisaSponsorship', !form.offersVisaSponsorship)}
            />
            {/* The server turns relocation off for a fully remote role, so it is
                not offered there rather than shown and silently dropped. */}
            {form.workplaceType !== 'Remote' ? (
              <Toggle
                label="You will help with relocation"
                hint="Shown to candidates as your promise. Diaspora does not check it."
                checked={form.offersRelocationAssistance}
                onToggle={() => update('offersRelocationAssistance', !form.offersRelocationAssistance)}
              />
            ) : null}
          </View>
        </ScrollView>

        <View className="px-5 py-4 border-t border-faint bg-surface-card" style={{ paddingBottom: Math.max(16, bottomInset) }}>
          {stillNeeded.length > 0 ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">Still needed: {stillNeeded.join(', ')}</Text>
          ) : valueProblem ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">{valueProblem}</Text>
          ) : null}
          <Button
            label="Save changes"
            isLoading={isSaving}
            disabled={!isChanged || stillNeeded.length > 0 || valueProblem !== null || isSaving}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3 ${className}`}>
      {children}
    </Text>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      onPress={onToggle}
      className="flex-row items-center justify-between p-4 rounded-2xl border border-subtle bg-surface-card mt-4"
    >
      <View className="flex-1 mr-3">
        <Text className="text-sm font-bold text-content-primary">{label}</Text>
        {hint ? <Text className="text-xs text-content-muted mt-0.5">{hint}</Text> : null}
      </View>
      <Text className="text-lg">{checked ? '✅' : '⬜'}</Text>
    </TouchableOpacity>
  );
}

function Chips<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === option.value }}
          onPress={() => onSelect(option.value)}
          className={`px-3.5 py-2 rounded-full border ${
            selected === option.value ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
          }`}
        >
          <Text className={`text-xs font-bold ${selected === option.value ? 'text-white' : 'text-content-secondary'}`}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
