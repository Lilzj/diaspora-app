// ─────────────────────────────────────────────────────────────────────────────
// Post a job
//
// **Rebuilt 14 Sep 2026, after no member could post one.** This screen posted a
// six-step form to `POST /jobs` in a shape the server has never accepted — no
// employer, category key, job type, experience level or country — under a
// hard-coded employer, "Amara Kone", on every posting. Every submission was
// refused and nothing was ever published. It also collected responsibilities,
// requirements, perks, a contact phone and a simulated map pin, none of which
// the platform can store.
//
// It now follows the platform's own sequence — see `lib/job-postings-api.ts`:
// the member's employer, a draft, the pay, publish — and asks only for what
// that sequence keeps. The server decides whether this member may post; the
// device's trust engine used to lock the screen on its own for a hard-coded
// country.
//
// 14 Oct 2026: the category is a searchable list from the server's catalogue,
// the country is never asked (a job is posted where the member lives), and the
// town comes from the place catalogue through `TownPicker`, with its `areaId`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TownPicker } from '@/components/forms/TownPicker';
import { Input } from '@/components/Input';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { formatPay } from '@/lib/job-detail-api';
import {
  currencyForCountry,
  fetchJobCategories,
  jobPostingErrorMessage,
  jobPostingFormProblem,
  jobPostingRequirements,
  postJob,
  publishJobPosting,
  resolvePostingEmployer,
  toPostJobInput,
  type JobPostingForm,
} from '@/lib/job-postings-api';
import { useNotification } from '@/providers/notification-provider';
import { useAuthStore } from '@/store/auth';
import type { ExperienceLevel, JobType, SalaryPeriod, WorkplaceType } from '@/types/jobs-hiring';
import { backOr } from '@/lib/navigation';
import { CurrencyNote } from '@/components/CurrencyNote';
import { currencyForResidence } from '@/lib/member-currency';

const STEPS = ['The role', 'Details and pay', 'Where the work is', 'Review and publish'] as const;

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'FullTime', label: 'Full time' },
  { value: 'PartTime', label: 'Part time' },
  { value: 'Contract', label: 'Contract' },
  { value: 'Temporary', label: 'Temporary' },
  { value: 'Seasonal', label: 'Seasonal' },
  { value: 'Internship', label: 'Internship' },
  { value: 'Apprenticeship', label: 'Apprenticeship' },
  { value: 'Freelance', label: 'Freelance' },
  { value: 'Volunteer', label: 'Volunteer' },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'Entry', label: 'Entry' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Mid', label: 'Mid' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
];

// One word on a chip. "a day" and "a week" were cut to "a" on an Android 16
// phone: a short two-word label in a wrapping row measures narrower than it
// draws. The sentence the preview writes comes from `formatPay`, which the job
// page uses too, so the review shows what candidates will read.
const PAY_PERIODS: { value: SalaryPeriod; label: string }[] = [
  { value: 'Hourly', label: 'Hourly' },
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Yearly', label: 'Yearly' },
];


const WORKPLACES: { value: WorkplaceType; label: string }[] = [
  { value: 'OnSite', label: 'On site' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'Remote', label: 'Remote' },
];

/** Cached under the hiring root, so registering an employer refreshes it. */
const POSTING_EMPLOYER_KEY = ['jobs-hiring', 'posting', 'employer'] as const;

export default function CreateJobScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();
  const client = useQueryClient();

  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);

  // Whether this member may post, as the Jobs service itself says: the
  // `jobs.post` feature on their access decision, which it grants to verified
  // accounts. Null until the session is restored — an unanswered question is
  // not a no, and the server still refuses a post it does not allow.
  //
  // This was the Trust module's capability list — government ID, residency,
  // 300 points and a year's residence — which the Jobs service never checked
  // and no member could meet. Decided 14 Sep 2026: a verified account is enough.
  const access = useAuthStore((state) => state.access);
  const mayPost = access ? access.grantedFeatures.includes('jobs.post') : null;

  const employer = useQuery({
    queryKey: POSTING_EMPLOYER_KEY,
    queryFn: resolvePostingEmployer,
    retry: false,
  });

  const categories = useQuery({
    queryKey: ['jobs', 'categories'],
    queryFn: fetchJobCategories,
    staleTime: 60 * 60 * 1000,
  });

  const [step, setStep] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [form, setForm] = useState<JobPostingForm>({
    categoryKey: null,
    jobType: 'FullTime',
    experienceLevel: 'Entry',
    title: '',
    description: '',
    payMinimum: '',
    payMaximum: '',
    payCurrency: currencyForCountry(residenceCountry),
    payPeriod: 'Monthly',
    vacancies: '1',
    countryCode: residenceCountry ?? '',
    cityName: '',
    areaId: null,
    workplaceType: 'OnSite',
    offersVisaSponsorship: false,
  });

  // The country is never asked for (14 Oct 2026): a job is posted in the
  // member's country of residence, and so is its pay. The session restores
  // asynchronously, so the country can arrive after the first render.
  useEffect(() => {
    setForm((current) =>
      current.countryCode === (residenceCountry ?? '')
        ? current
        : {
            ...current,
            countryCode: residenceCountry ?? '',
            payCurrency: currencyForCountry(residenceCountry),
          }
    );
  }, [residenceCountry]);

  const update = <K extends keyof JobPostingForm>(key: K, value: JobPostingForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // From the server's catalogue (`GET /jobs/categories`), never a list here.
  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((category) => ({ key: category.key, label: category.name })),
    [categories.data]
  );

  const categoryName = useMemo(
    () => categories.data?.find((category) => category.key === form.categoryKey)?.name ?? '',
    [categories.data, form.categoryKey]
  );

  /**
   * What this step is waiting for, by name.
   *
   * <p>
   * The rules were already here, already per-step, and already correct. They
   * were read in `next` — after the member had tapped — and shown as an alert
   * titled "Not yet", which is a refusal rather than an instruction. Reading
   * the same rules during render turns it into one.
   * </p>
   */
  const requiredByStep = jobPostingRequirements(form, step as 0 | 1 | 2);

  const stillNeeded = requiredByStep
    .filter((requirement) => !requirement.ok)
    .map((requirement) => requirement.label);

  const isLastStep = step === STEPS.length - 1;

  /**
   * What is wrong with a field that is filled in — a length, a number, a code.
   *
   * Every step at once on the last one, because a member can walk back, empty
   * the title and walk forward again: the step they are standing on would have
   * nothing to say about it, and Publish is the tap that cannot be taken back.
   */
  const valueProblem =
    stillNeeded.length > 0
      ? null
      : jobPostingFormProblem(form, isLastStep ? 'all' : (step as 0 | 1 | 2));

  const next = () => {
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const publish = async () => {
    if (employer.data?.kind !== 'one') return;

    const problem = jobPostingFormProblem(form, 'all');
    if (problem) {
      showAlert({ type: 'error', title: 'Not yet', message: problem });
      return;
    }

    setIsPublishing(true);
    try {
      const outcome = await postJob(employer.data.employerId, toPostJobInput(form));
      void client.invalidateQueries({ queryKey: ['jobs-hiring'] });

      if (outcome.kind === 'published') {
        showAlert({
          type: 'success',
          title: 'Job published',
          message: `"${outcome.job.title}" is live under ${employer.data.employerName} and open to applications.`,
          buttons: [
            { text: 'Done', style: 'cancel', onPress: () => backOr() },
            { text: 'View job', onPress: () => router.replace(`/job/${outcome.job.jobId}`) },
          ],
        });
        return;
      }

      // The draft exists. Saying "failed" here is how a member posts it twice.
      const draftId = outcome.job.jobId;
      showAlert({
        type: 'error',
        title: 'Saved, but not published',
        message: `Your job was saved as a draft and is not visible yet. ${jobPostingErrorMessage(outcome.cause)}`,
        buttons: [
          { text: 'Later', style: 'cancel', onPress: () => backOr() },
          {
            text: 'Publish again',
            onPress: async () => {
              try {
                await publishJobPosting(draftId);
                void client.invalidateQueries({ queryKey: ['jobs-hiring'] });
                router.replace(`/job/${draftId}`);
              } catch (cause) {
                showAlert({ type: 'error', title: 'Still not published', message: jobPostingErrorMessage(cause) });
              }
            },
          },
        ],
      });
    } catch (cause) {
      // Nothing was created.
      showAlert({ type: 'error', title: 'Not posted', message: jobPostingErrorMessage(cause) });
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Before the form ─────────────────────────────────────────────────────────

  if (employer.isLoading || categories.isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Post a job" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F59300" />
        </View>
      </SafeAreaView>
    );
  }

  if (mayPost === false) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Post a job" />
        <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: bottomInset }}>
          <Text className="text-lg font-black text-content-primary mb-2">Posting jobs is locked for now</Text>
          <Text className="text-sm text-content-muted mb-5 leading-relaxed">
            Posting a job needs a verified Diaspora account. Once your account is verified, you can
            post straight away.
          </Text>
          <Button label="Open Trust Centre" variant="outline" onPress={() => router.push('/profile/trust-center')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (employer.isError || categories.isError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Post a job" />
        <EmptyState
          icon="📡"
          title="Could not start a job post"
          description={jobPostingErrorMessage(employer.error ?? categories.error)}
          action={
            <Button
              label="Try again"
              onPress={() => {
                void employer.refetch();
                void categories.refetch();
              }}
            />
          }
        />
      </SafeAreaView>
    );
  }

  if (employer.data?.kind !== 'one') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Post a job" />
        <EmptyState
          icon="🏢"
          title="Post under an employer"
          description="Jobs on Diaspora belong to an employer, even when that is just you. Register one first — it takes a minute — and you will come straight back here."
          action={
            <View className="w-full gap-2">
              <Button
                label="Register an employer"
                onPress={() => router.push({ pathname: '/employer/register', params: { next: '/job/create' } })}
              />
              <Button label="Try again" variant="outline" onPress={() => void employer.refetch()} />
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  const employerName = employer.data.employerName;
  const payLabel = describePay(form);

  // ── The form ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-5 pt-3 pb-2 border-b border-faint bg-surface-card">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Post a job · {employerName}
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {step + 1} of {STEPS.length}
          </Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </View>
      </View>

      <ScreenHeader title={STEPS[step]} />

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView className="flex-1 px-5 pt-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 0 ? (
            <View className="pb-8">
              <SectionLabel>Category</SectionLabel>
              <SearchableSelect
                options={categoryOptions}
                value={form.categoryKey}
                onChange={(key) => update('categoryKey', key)}
                placeholder="Choose a category"
                searchPlaceholder="Search categories"
                isLoading={categories.isLoading}
                unavailableMessage="Job categories could not be loaded just now."
                testID="job-category"
              />

              <SectionLabel className="mt-2">Type of work</SectionLabel>
              <Chips options={JOB_TYPES} selected={form.jobType} onSelect={(value) => update('jobType', value)} />

              <SectionLabel className="mt-6">Experience needed</SectionLabel>
              <Chips
                options={EXPERIENCE_LEVELS}
                selected={form.experienceLevel}
                onSelect={(value) => update('experienceLevel', value)}
              />
            </View>
          ) : null}

          {step === 1 ? (
            <View className="pb-8">
              <Input
                label="Job title"
                placeholder="Care assistant, Curepipe"
                value={form.title}
                onChangeText={(value) => update('title', value)}
                maxLength={200}
              />
              <Input
                label="Description"
                placeholder="What the work is, the hours, and who you are looking for"
                value={form.description}
                onChangeText={(value) => update('description', value)}
                multiline
                className="h-32 py-3"
                textAlignVertical="top"
              />

              <SectionLabel>Pay (optional)</SectionLabel>
              <Text className="text-xs text-content-muted mb-3 leading-relaxed">
                Postings that state pay get more applicants. Diaspora does not know local pay rates
                and cannot tell you whether a rate is fair — you set it.
              </Text>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input
                    label="From"
                    placeholder="18000"
                    value={form.payMinimum}
                    onChangeText={(value) => update('payMinimum', value)}
                    keyboardType="numeric"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label="To (optional)"
                    placeholder="22000"
                    value={form.payMaximum}
                    onChangeText={(value) => update('payMaximum', value)}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              {/* No choice since 13 Oct 2026: pay is in the member's own currency. */}
              <CurrencyNote currency={currencyForResidence(residenceCountry)} />
              <View className="mt-3">
                <Chips options={PAY_PERIODS} selected={form.payPeriod} onSelect={(value) => update('payPeriod', value)} />
              </View>

              <View className="mt-6">
                <Input
                  label="How many people you are hiring"
                  placeholder="1"
                  value={form.vacancies}
                  onChangeText={(value) => update('vacancies', value)}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View className="pb-8">
              {/* No country field: the job is posted where the member lives. */}
              <TownPicker
                label="Town or city (optional)"
                value={form.cityName}
                onChange={(town) =>
                  setForm((current) => ({ ...current, cityName: town.cityName, areaId: town.areaId ?? null }))
                }
                testID="job-town"
              />
              {form.cityName ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setForm((current) => ({ ...current, cityName: '', areaId: null }))}
                  className="self-start -mt-2 mb-4"
                >
                  <Text className="text-xs font-bold text-primary-600">Leave the town out</Text>
                </TouchableOpacity>
              ) : null}

              <SectionLabel>Where the work happens</SectionLabel>
              <Chips
                options={WORKPLACES}
                selected={form.workplaceType}
                onSelect={(value) => update('workplaceType', value)}
              />

              <TouchableOpacity
                accessibilityRole="switch"
                accessibilityState={{ checked: form.offersVisaSponsorship }}
                onPress={() => update('offersVisaSponsorship', !form.offersVisaSponsorship)}
                className="flex-row items-center justify-between p-4 rounded-2xl border border-subtle bg-surface-card mt-6"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-sm font-bold text-content-primary">You will sponsor a work visa</Text>
                  <Text className="text-xs text-content-muted mt-0.5">
                    Shown to candidates as your promise. Diaspora does not check it.
                  </Text>
                </View>
                <Text className="text-lg">{form.offersVisaSponsorship ? '✅' : '⬜'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 3 ? (
            <View className="pb-8">
              <View className="bg-surface-card border border-line rounded-2xl p-4">
                <Text className="text-[10px] font-bold text-content-tertiary uppercase">
                  {JOB_TYPES.find((type) => type.value === form.jobType)?.label} · {categoryName}
                </Text>
                <Text className="text-base font-black text-content-primary mt-1">{form.title.trim() || 'Job title'}</Text>
                <Text className="text-xs text-content-muted font-bold mt-1">🏢 {employerName}</Text>
                <Text className="text-xs text-content-muted font-semibold mt-1">
                  📍 {[form.cityName.trim(), form.countryCode.trim().toUpperCase()].filter(Boolean).join(', ')} ·{' '}
                  {WORKPLACES.find((place) => place.value === form.workplaceType)?.label}
                </Text>
                <Text className="text-sm font-black text-primary-500 mt-3">{payLabel}</Text>
                <Text className="text-xs text-content-secondary mt-3 leading-relaxed" numberOfLines={6}>
                  {form.description.trim()}
                </Text>
              </View>

              <Text className="text-xs text-content-faint mt-4 leading-relaxed">
                Publishing makes this visible to every member and open to applications straight away.
                Applicants reach you in your hiring workspace, by name.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="px-5 py-4 border-t border-faint bg-surface-card" style={{ paddingBottom: Math.max(16, bottomInset) }}>
          {/* A missing field by name; a filled-in field that will not do, in
              the sentence that explains it. */}
          {stillNeeded.length > 0 ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">
              Still needed: {stillNeeded.join(', ')}
            </Text>
          ) : valueProblem ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">{valueProblem}</Text>
          ) : null}

          <View className="flex-row gap-2">
            {step > 0 ? (
              <Button label="Back" variant="outline" className="flex-1" onPress={() => setStep(step - 1)} />
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button
                label="Next"
                className="flex-1"
                disabled={stillNeeded.length > 0 || valueProblem !== null}
                onPress={next}
              />
            ) : (
              <Button
                label="Publish job"
                className="flex-1"
                isLoading={isPublishing}
                disabled={stillNeeded.length > 0 || valueProblem !== null}
                onPress={publish}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The pay exactly as the job page will print it — "MUR 15,000 a month" — or
 * "Pay not stated". It printed "MUR 15000" while the page grouped the digits.
 */
export function describePay(form: Pick<JobPostingForm, 'payMinimum' | 'payMaximum' | 'payCurrency' | 'payPeriod'>): string {
  const amount = (text: string): number | null => {
    const trimmed = text.trim().replace(/,/g, '');
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  };

  const minimum = amount(form.payMinimum);
  if (minimum === null) return 'Pay not stated';
  return formatPay({
    minimum,
    maximum: amount(form.payMaximum),
    currency: form.payCurrency,
    period: form.payPeriod,
  });
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3 ${className}`}>
      {children}
    </Text>
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
