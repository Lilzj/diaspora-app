// ─────────────────────────────────────────────────────────────────────────────
// The member's work profile — the Jobs module's candidate profile
//
// **Applying no longer depends on this screen — 14 Sep 2026.** It used to be
// the only way past `jobs.not-candidate`: a signed-in member tapped Apply, was
// told to "create your profile first", and had to write a headline here before
// any employer received anything. The member already had a profile — their
// account — and the employer now sees them by it. The server makes this record,
// private and empty, with a member's first application, so this is where a
// member adds to it rather than a gate they must pass.
//
// ── It reads what is stored ──────────────────────────────────────────────────
//
// It used to start blank, on the belief that the platform had no read route, and
// its whole-document save then wiped whatever the member had stored. The server
// has answered `GET /jobs/candidate/profile` since gap G-5 closed, so the form
// starts from the stored profile and sends every field back — including the
// salary expectation it does not show, which a blank save would have cleared.
//
// ── Why visibility is its own control ────────────────────────────────────────
//
// Because it is its own route, and that was a deliberate decision on the server:
// somebody who has just realised their employer can find them wants a single
// tap, not a form that also rewrites their work history. A profile is
// **created `Private`** and nothing but this control changes that.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { useCandidateProfile } from '@/hooks/jobs-hiring';
import { isCandidateProfileExistsError, jobsHiringErrorMessage } from '@/lib/jobs-hiring-api';
import type {
  CandidateProfileResponse,
  CandidateVisibility,
  ExperienceLevel,
  RemotePreference,
} from '@/types/jobs-hiring';
import { backOr } from '@/lib/navigation';
import { useAuthStore } from '@/store/auth';

/** The server's own ceiling on a headline (`JobLimits.MaxHeadline`). */
const HEADLINE_MAX_LENGTH = 200;

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'Entry', label: 'Entry' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Mid', label: 'Mid' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Principal', label: 'Principal' },
  { value: 'Director', label: 'Director' },
  { value: 'Executive', label: 'Executive' },
];

const REMOTE_PREFERENCES: { value: RemotePreference; label: string }[] = [
  { value: 'Flexible', label: 'Flexible' },
  { value: 'OnSiteOnly', label: 'On site only' },
  { value: 'HybridPreferred', label: 'Hybrid preferred' },
  { value: 'RemoteOnly', label: 'Remote only' },
];

const VISIBILITIES: { value: CandidateVisibility; label: string; detail: string }[] = [
  { value: 'Private', label: 'Private', detail: 'Nobody can find you. You can still apply.' },
  {
    value: 'VerifiedEmployers',
    label: 'Verified employers',
    detail: 'Only employers the platform has verified.',
  },
  { value: 'Members', label: 'Members', detail: 'Anyone signed in to Diaspora.' },
  { value: 'Public', label: 'Public', detail: 'Anyone at all.' },
];

export default function CandidateProfileScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();

  const { profile, isLoading, loadError, refresh, create, update, setVisibility, isSaving } =
    useCandidateProfile();

  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [countryCode, setCountryCode] = useState('');
  // The hint is the member's own country of residence, not 'GB' for everyone.
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry ?? null);
  const [cityName, setCityName] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('Entry');
  const [remotePreference, setRemotePreference] = useState<RemotePreference>('Flexible');
  const [noticePeriodDays, setNoticePeriodDays] = useState('');

  // Filled from the stored profile when it arrives, and again whenever it is a
  // newer revision — never while the member is typing into the same one.
  const loadedRevision = profile ? `${profile.candidateId}:${profile.revision}` : null;
  useEffect(() => {
    if (!profile) return;
    setHeadline(profile.headline ?? '');
    setSummary(profile.summary ?? '');
    setCountryCode(profile.countryCode ?? '');
    setCityName(profile.cityName ?? '');
    setExperienceLevel(profile.experienceLevel);
    setRemotePreference(profile.remotePreference);
    setNoticePeriodDays(profile.noticePeriodDays != null ? String(profile.noticePeriodDays) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedRevision]);

  const hasProfile = profile !== null;

  const onSave = async () => {
    try {
      if (!hasProfile) {
        await create({
          headline: headline.trim() || null,
          summary: summary.trim() || null,
          countryCode: countryCode.trim().toUpperCase() || null,
          cityName: cityName.trim() || null,
        });
      } else {
        await update(wholeDocument(profile, {
          headline,
          summary,
          countryCode,
          cityName,
          experienceLevel,
          remotePreference,
          noticePeriodDays,
        }));
      }
    } catch (cause) {
      if (isCandidateProfileExistsError(cause)) {
        // Somebody applied for a job in another tab or on another device, which
        // makes the profile. Read it and let them save onto it.
        refresh();
        showAlert({
          type: 'info',
          title: 'You already have a work profile',
          message: 'It has been loaded. Check your details and save again.',
        });
        return;
      }

      showAlert({ type: 'error', title: 'Not saved', message: jobsHiringErrorMessage(cause) });
      return;
    }

    showAlert({ type: 'success', title: 'Work profile saved', message: 'Your changes are saved.' });
    backOr();
  };

  const onVisibility = async (visibility: CandidateVisibility) => {
    try {
      await setVisibility(visibility);
    } catch (cause) {
      showAlert({ type: 'error', title: 'Not changed', message: jobsHiringErrorMessage(cause) });
      return;
    }

    showAlert({
      type: 'success',
      title: 'Visibility changed',
      message: `Your work profile is now ${visibility === 'Private' ? 'hidden' : 'visible'}.`,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Work profile" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F59300" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // A failed read is not "no profile". Offering to create one here would answer
  // `already-exists` for a member who has one, or save blanks over it.
  if (loadError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Work profile" />
        <View className="px-5 pt-6">
          <Text className="text-sm text-content-muted mb-4">{loadError}</Text>
          <Button label="Try again" onPress={refresh} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Work profile" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          <View className="p-4 rounded-xl bg-surface-muted mb-5">
            <Text className="text-xs font-bold text-info-default leading-relaxed">
              You can apply for jobs without filling this in. Employers see your name and whether
              your Diaspora account is verified. Anything you add here helps you stand out.
            </Text>
          </View>

          <Input
            label="Headline (optional)"
            placeholder="Registered nurse, 8 years, ICU"
            value={headline}
            onChangeText={setHeadline}
            maxLength={HEADLINE_MAX_LENGTH}
          />

          <Input
            label="About you (optional)"
            placeholder="What you have done and what you are looking for"
            value={summary}
            onChangeText={setSummary}
            multiline
            className="h-32 py-3"
            textAlignVertical="top"
          />

          <Input
            label="Country (optional)"
            placeholder={residenceCountry ?? 'Two letters, e.g. MU'}
            value={countryCode}
            onChangeText={setCountryCode}
            autoCapitalize="characters"
            maxLength={2}
          />

          <Input
            label="City (optional)"
            placeholder="Manchester"
            value={cityName}
            onChangeText={setCityName}
          />

          {/* Neither field exists on the create request. Offering them on the
              first save would collect two answers and discard both. */}
          {hasProfile ? (
            <>
              <Text className="text-sm font-medium text-content-muted mb-2">Experience</Text>
              <ChipRow
                options={EXPERIENCE_LEVELS}
                selected={experienceLevel}
                onSelect={setExperienceLevel}
              />

              <Text className="text-sm font-medium text-content-muted mb-2 mt-5">
                How you want to work
              </Text>
              <ChipRow
                options={REMOTE_PREFERENCES}
                selected={remotePreference}
                onSelect={setRemotePreference}
              />

              <View className="mt-5">
                <Input
                  label="Notice period in days (optional)"
                  placeholder="30"
                  value={noticePeriodDays}
                  onChangeText={setNoticePeriodDays}
                  keyboardType="number-pad"
                />
              </View>
            </>
          ) : null}

          <Button label="Save" className="mt-4" isLoading={isSaving} onPress={onSave} />
        </View>

        {/* Its own section because it is its own route, and its own decision.
            Hidden until a profile exists: the server answers `jobs.not-candidate`
            for a visibility change with nothing to change. */}
        {hasProfile ? (
          <View className="px-5 pt-8">
            <Text className="text-sm font-black uppercase tracking-widest text-content-strong mb-1">
              Who can find you
            </Text>
            <Text className="text-xs text-content-faint mb-4 leading-relaxed">
              Changing this takes effect immediately and does not touch anything else on your work
              profile. An employer you apply to always sees your application, whatever you choose
              here.
            </Text>

            {VISIBILITIES.map((option) => {
              const selected = profile?.visibility === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: isSaving }}
                  disabled={isSaving}
                  onPress={() => onVisibility(option.value)}
                  className={`p-4 rounded-xl border mb-2 ${
                    selected ? 'border-primary-500 bg-surface-card' : 'border-subtle bg-surface-card'
                  }`}
                >
                  <Text className="text-sm font-extrabold text-content-primary">
                    {option.label}
                    {selected ? '  ✓' : ''}
                  </Text>
                  <Text className="text-xs text-content-muted mt-0.5">{option.detail}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The update request: what the member edited, and everything else as stored.
 *
 * `PUT /jobs/candidate/profile` clears whatever it is not sent. The salary
 * expectation and the open-to-work flag are not on this form, so they are sent
 * back as the server holds them rather than as blanks.
 */
export function wholeDocument(
  profile: CandidateProfileResponse,
  edited: {
    headline: string;
    summary: string;
    countryCode: string;
    cityName: string;
    experienceLevel: ExperienceLevel;
    remotePreference: RemotePreference;
    noticePeriodDays: string;
  }
) {
  const notice = Number.parseInt(edited.noticePeriodDays, 10);

  return {
    headline: edited.headline.trim() || null,
    summary: edited.summary.trim() || null,
    countryCode: edited.countryCode.trim().toUpperCase() || null,
    cityName: edited.cityName.trim() || null,
    experienceLevel: edited.experienceLevel,
    remotePreference: edited.remotePreference,
    noticePeriodDays: Number.isFinite(notice) ? notice : null,
    expectedSalaryMinimum: profile.salaryExpectation?.minimum ?? null,
    expectedSalaryCurrency: profile.salaryExpectation?.currencyCode ?? null,
    expectedSalaryPeriod: profile.salaryExpectation?.period ?? null,
    expectedSalaryFlexible: profile.salaryExpectation?.isFlexible ?? false,
    isOpenToWork: profile.isOpenToWork,
    baseRevision: profile.revision ?? null,
  };
}

function ChipRow<T extends string>({
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
            selected === option.value ? 'bg-primary-500 border-primary-500' : 'border-line'
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              selected === option.value ? 'text-white' : 'text-content-tertiary'
            }`}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
