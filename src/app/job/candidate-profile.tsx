// ─────────────────────────────────────────────────────────────────────────────
// The candidate's professional profile (Remediation Wave K)
//
// **This screen is what makes applying possible at all.**
// `POST /api/v1/jobs/{jobId}/apply` begins with `RequireCandidateAsync`, which
// answers **403 `jobs.not-candidate`** for a member who has no profile
// (`JobAuthorizationService.cs:237-252`). No screen in this application could
// create one, so no member had one, so the apply button that shipped before this
// wave would have failed for every member on the platform.
//
// ── Two absences that shape the whole screen ─────────────────────────────────
//
// **There is no `GET /jobs/candidate/profile`.** A profile can be created and
// updated and never read back. So this form starts blank on a fresh session even
// for a member who filled it in last week, and it says so rather than pretending
// the blank fields are the stored ones. The dashboard's
// `profileCompletenessPercent` is the only thing the platform will tell a client
// about a stored profile, and it is a number.
//
// **The update is a whole-document save.** An omitted optional field is
// *cleared*, not left alone — and with no read route there is nothing to recover
// it from. So the form collects every field the request carries, every time.
//
// ── Why visibility is its own control ────────────────────────────────────────
//
// Because it is its own route, and that was a deliberate decision on the server:
// somebody who has just realised their employer can find them wants a single
// tap, not a form that also rewrites their work history and can fail validation
// on a headline. A profile is **created `Private`** and nothing but this control
// changes that.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { useCandidateDashboard, useCandidateProfile } from '@/hooks/jobs-hiring';
import { isCandidateProfileExistsError } from '@/lib/jobs-hiring-api';
import type {
  CandidateVisibility,
  ExperienceLevel,
  RemotePreference,
} from '@/types/jobs-hiring';

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

  // The dashboard is the only route that will say whether a profile exists. It
  // returns `candidateId: null` when there is none — which is what decides
  // whether this form creates or updates.
  const { dashboard, needsProfile, isLoading } = useCandidateDashboard();
  const { create, update, setVisibility, isSaving, error } = useCandidateProfile();

  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('Mid');
  const [remotePreference, setRemotePreference] = useState<RemotePreference>('Flexible');
  const [noticePeriodDays, setNoticePeriodDays] = useState('');

  const isCreating = needsProfile;

  const onSave = async () => {
    if (headline.trim().length === 0) {
      showAlert({
        type: 'error',
        title: 'Add a headline',
        message: 'One line about what you do. "Registered nurse, 8 years, ICU."',
      });
      return;
    }

    try {
      if (isCreating) {
        // Only four fields exist on the create request, and visibility is not
        // one of them — the profile is created private whatever this screen
        // does. Experience level and remote preference are on the *update*
        // request only, so a member who filled them in here has to save twice;
        // that is the contract rather than an oversight in the form.
        await create({
          headline: headline.trim(),
          summary: summary.trim() || null,
          countryCode: countryCode.trim().toUpperCase() || null,
          cityName: cityName.trim() || null,
        });
      } else {
        const notice = Number.parseInt(noticePeriodDays, 10);
        await update({
          headline: headline.trim(),
          summary: summary.trim() || null,
          countryCode: countryCode.trim().toUpperCase() || null,
          cityName: cityName.trim() || null,
          experienceLevel,
          remotePreference,
          noticePeriodDays: Number.isFinite(notice) ? notice : null,
          // Never disclosed to an employer, and this form does not collect it —
          // so it is sent as null rather than omitted, which on a whole-document
          // save means the same thing and says so.
          expectedSalaryMinimum: null,
          expectedSalaryCurrency: null,
          expectedSalaryPeriod: null,
          expectedSalaryFlexible: false,
          isOpenToWork: true,
        });
      }
    } catch (cause) {
      if (isCandidateProfileExistsError(cause)) {
        showAlert({
          type: 'info',
          title: 'You already have a profile',
          message: 'Pull down to refresh and edit it instead.',
        });
        return;
      }

      showAlert({
        type: 'error',
        title: 'Not saved',
        message: error ?? 'We could not save your profile just now.',
      });
      return;
    }

    showAlert({
      type: 'success',
      title: isCreating ? 'Profile created' : 'Profile saved',
      message: isCreating
        ? 'Your profile is private. You can now apply to roles.'
        : 'Your profile has been updated.',
    });
    router.back();
  };

  const onVisibility = async (visibility: CandidateVisibility) => {
    try {
      await setVisibility(visibility);
    } catch {
      showAlert({
        type: 'error',
        title: 'Not changed',
        message: 'We could not change who can see your profile.',
      });
      return;
    }

    showAlert({
      type: 'success',
      title: 'Visibility changed',
      message: `Your profile is now ${visibility === 'Private' ? 'hidden' : 'visible'}.`,
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={isCreating ? 'Create your profile' : 'Your profile'} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          {/* The honest note. This is not a caveat about the form — it is a
              fact about the platform, and a member who typed a summary last week
              and finds a blank box deserves to know why. */}
          {!isLoading && !isCreating ? (
            <View className="p-4 rounded-xl bg-info-surface mb-5">
              <Text className="text-xs font-bold text-info-default leading-relaxed">
                The platform does not let an app read a saved profile back, so these boxes start
                empty. Saving replaces everything on your profile with what is here.
                {typeof dashboard?.profileCompletenessPercent === 'number'
                  ? ` Your profile is ${dashboard.profileCompletenessPercent}% complete.`
                  : ''}
              </Text>
            </View>
          ) : null}

          <Input
            label="Headline"
            placeholder="Registered nurse, 8 years, ICU"
            value={headline}
            onChangeText={setHeadline}
            maxLength={160}
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
            placeholder="GB"
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
          {!isCreating ? (
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

          <Button
            label={isCreating ? 'Create profile' : 'Save profile'}
            className="mt-4"
            isLoading={isSaving}
            onPress={onSave}
          />

          {error ? (
            <Text className="text-xs font-bold text-error-default mt-3">{error}</Text>
          ) : null}
        </View>

        {/* Its own section because it is its own route, and its own decision.
            Hidden while creating: the profile does not exist yet, and the server
            answers `jobs.not-candidate` for a visibility change with nothing to
            change. */}
        {!isCreating ? (
          <View className="px-5 pt-8">
            <Text className="text-sm font-black uppercase tracking-widest text-content-strong mb-1">
              Who can see you
            </Text>
            <Text className="text-xs text-content-faint mb-4 leading-relaxed">
              Changing this takes effect immediately and does not touch anything else on your
              profile. Applying to a role always shares your details with that employer, whatever
              you choose here.
            </Text>

            {VISIBILITIES.map((option) => (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => onVisibility(option.value)}
                className="p-4 rounded-xl border border-subtle bg-surface-card mb-2"
              >
                <Text className="text-sm font-extrabold text-content-primary">{option.label}</Text>
                <Text className="text-xs text-content-muted mt-0.5">{option.detail}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
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
