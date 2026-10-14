// ─────────────────────────────────────────────────────────────────────────────
// Registering an employer (Remediation Wave K)
//
// `POST /api/v1/jobs/employers` has existed since the Jobs module landed and had
// no client. A member could not become an employer on this platform from this
// application, which meant the entire employer half of the hiring workflow was
// unreachable regardless of what the backend could do.
//
// ── Three facts the form is shaped by ────────────────────────────────────────
//
// **The caller becomes the employer's first owner, and no route adds a second
// member.** So the account registering here is the only account that will ever
// be able to post, review, decide, interview or make an offer under this
// employer. That is stated on the screen rather than discovered later by a
// colleague who cannot get in.
//
// **`slug` is chosen here and never again.** `UpdateEmployerRequest` does not
// carry it. A handle is derived from the display name when omitted, and this
// form leaves it to the server rather than offering a field whose consequences
// are permanent and whose value most people do not have an opinion about.
//
// **`countryCode` is the member's country of residence, never typed.** Since
// 14 Oct 2026 an employer is registered in the country its owner lives in; the
// screen sends `residenceCountry` from the session and says plainly when the
// account has none, because the server requires it (`.Length(2)`).
//
// ── And one the screen cannot fix ────────────────────────────────────────────
//
// **No route lists the employers a member belongs to.** The profile itself can
// be read back — `GET /jobs/employers/{idOrSlug}`; this note wrongly said it
// could not ("NG-04") until 15 Sep 2026 — but the workspace resolves a *sole*
// membership only, so the identifier this registration returns is shown, and
// the member is sent straight on.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { useEmployerRegistration } from '@/hooks/jobs-hiring';
import { useAuthStore } from '@/store/auth';
import type { CompanySize, EmployerOrganizationType } from '@/types/jobs-hiring';

/**
 * The organisation types the server can parse.
 *
 * Candidates are entitled to know whether they are dealing with the employer or
 * an intermediary, which is why `RecruitmentAgency` and `StaffingFirm` are
 * separate values rather than a checkbox — the server derives `isIntermediary`
 * from this field and shows it on every job card.
 */
const ORGANIZATION_TYPES: { value: EmployerOrganizationType; label: string }[] = [
  { value: 'Company', label: 'Company' },
  { value: 'Startup', label: 'Startup' },
  { value: 'RecruitmentAgency', label: 'Recruitment agency' },
  { value: 'StaffingFirm', label: 'Staffing firm' },
  { value: 'NonProfit', label: 'Non-profit' },
  { value: 'Government', label: 'Government' },
  { value: 'Educational', label: 'Educational' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Individual', label: 'Individual' },
  { value: 'Other', label: 'Other' },
];

const COMPANY_SIZES: { value: CompanySize; label: string }[] = [
  { value: 'Micro', label: '1–9' },
  { value: 'Small', label: '10–49' },
  { value: 'Medium', label: '50–249' },
  { value: 'Large', label: '250–999' },
  { value: 'VeryLarge', label: '1,000–4,999' },
  { value: 'Enterprise', label: '5,000+' },
];

/**
 * Where a registration may send the member next.
 *
 * Posting a job needs an employer, so Post a job sends a member here and expects
 * them back. Only known screens are honoured — a route parameter is something
 * anyone can put in a link.
 */
const RETURN_ROUTES = new Set(['/job/create']);

export function afterRegistrationRoute(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  return value && RETURN_ROUTES.has(value) ? value : '/job/hiring';
}

/** Said when the account has no country of residence to register in. */
export const EMPLOYER_RESIDENCE_MISSING =
  'Your account has no country of residence, and an employer is registered in the country you live in. Set it in your profile, then come back.';

/**
 * What the form will not send without, by name — `RegisterEmployerRequest`
 * requires DisplayName, OrganizationType and CountryCode. The type always has
 * a value; the country is not a field, so it is named as the member's own.
 */
export function employerRegistrationMissing(input: {
  displayName: string;
  countryCode: string | null | undefined;
}): string[] {
  const missing: string[] = [];
  if (input.displayName.trim().length < 2) missing.push('Display name');
  if (!/^[A-Za-z]{2}$/.test((input.countryCode ?? '').trim())) missing.push('Country of residence');
  return missing;
}

export default function RegisterEmployerScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();
  const { register, isSaving, error } = useEmployerRegistration();
  const { next } = useLocalSearchParams<{ next?: string }>();

  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [organizationType, setOrganizationType] = useState<EmployerOrganizationType>('Company');
  const [companySize, setCompanySize] = useState<CompanySize | null>(null);
  // Not asked: an employer is registered where its owner lives.
  const countryCode = useAuthStore((state) => state.user?.residenceCountry) ?? '';
  const [description, setDescription] = useState('');

  const stillNeeded = employerRegistrationMissing({ displayName, countryCode });
  const hasNoResidence = stillNeeded.includes('Country of residence');

  const onSubmit = async () => {
    // The button is disabled while anything is missing; this is the backstop.
    if (stillNeeded.length > 0) return;

    try {
      await register({
        displayName: displayName.trim(),
        legalName: legalName.trim() || null,
        registrationNumber: registrationNumber.trim() || null,
        organizationType,
        companySize,
        foundedYear: null,
        countryCode: countryCode.trim().toUpperCase(),
        // Left to the server. The handle is permanent and derived from the name,
        // and `UpdateEmployerRequest` cannot change it afterwards.
        slug: null,
        description: description.trim() || null,
      });
    } catch {
      showAlert({
        type: 'error',
        title: 'Not registered',
        message: error ?? 'We could not register this employer just now.',
      });
      return;
    }

    const destination = afterRegistrationRoute(next);

    showAlert({
      type: 'success',
      title: 'Employer registered',
      message:
        destination === '/job/create'
          ? 'You are its first owner. Carry on posting your job.'
          : 'You are its first owner. Your hiring workspace is ready.',
    });
    router.replace(destination);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Register an employer" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          <View className="p-4 rounded-xl bg-info-surface mb-5">
            <Text className="text-xs font-bold text-info-default leading-relaxed">
              You will be this employer&apos;s first owner. The platform has no way to add a second
              person to the team yet, so this account is the only one that will be able to post
              roles and answer applicants.
            </Text>
          </View>

          <Input
            label="Display name"
            placeholder="Meridian Care Group"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={120}
          />

          {/* Separate from the display name deliberately: candidates recognise
              the trading name, registries hold the legal one, and verification
              checks against the registered one. */}
          <Input
            label="Registered name (optional)"
            placeholder="Meridian Care Group Ltd"
            value={legalName}
            onChangeText={setLegalName}
            maxLength={120}
          />

          <Input
            label="Company number (optional)"
            placeholder="Whatever your country issues"
            value={registrationNumber}
            onChangeText={setRegistrationNumber}
          />

          {/* No Country field since 14 Oct 2026: the member's residence. */}
          {hasNoResidence ? (
            <View className="p-4 rounded-xl bg-warning-surface mb-5">
              <Text className="text-xs font-bold text-warning-default leading-relaxed">
                {EMPLOYER_RESIDENCE_MISSING}
              </Text>
            </View>
          ) : null}

          <Text className="text-sm font-medium text-content-muted mb-2">What kind of employer</Text>
          <View className="flex-row flex-wrap gap-2 mb-1">
            {ORGANIZATION_TYPES.map((option) => (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: organizationType === option.value }}
                onPress={() => setOrganizationType(option.value)}
                className={`px-3.5 py-2 rounded-full border ${
                  organizationType === option.value
                    ? 'bg-primary-500 border-primary-500'
                    : 'border-line'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    organizationType === option.value ? 'text-white' : 'text-content-tertiary'
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {organizationType === 'RecruitmentAgency' || organizationType === 'StaffingFirm' ? (
            <Text className="text-[11px] text-content-faint mb-4 leading-relaxed">
              Your roles will be marked as agency listings. Candidates are entitled to know they
              are dealing with an intermediary.
            </Text>
          ) : (
            <View className="mb-4" />
          )}

          <Text className="text-sm font-medium text-content-muted mb-2">People (optional)</Text>
          <View className="flex-row flex-wrap gap-2 mb-5">
            {COMPANY_SIZES.map((option) => (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: companySize === option.value }}
                onPress={() =>
                  setCompanySize((current) => (current === option.value ? null : option.value))
                }
                className={`px-3.5 py-2 rounded-full border ${
                  companySize === option.value ? 'bg-primary-500 border-primary-500' : 'border-line'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    companySize === option.value ? 'text-white' : 'text-content-tertiary'
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="About the organisation (optional)"
            placeholder="What you do and who you hire"
            value={description}
            onChangeText={setDescription}
            multiline
            className="h-32 py-3"
            textAlignVertical="top"
          />

          {stillNeeded.length > 0 ? (
            <Text className="text-xs font-semibold text-content-muted mt-2">
              Still needed: {stillNeeded.join(', ')}
            </Text>
          ) : null}

          <Button
            label="Register employer"
            className="mt-2"
            isLoading={isSaving}
            disabled={stillNeeded.length > 0 || isSaving}
            onPress={onSubmit}
          />

          {error ? (
            <Text className="text-xs font-bold text-error-default mt-3">{error}</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
