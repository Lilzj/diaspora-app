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
// **`countryCode` must be exactly two characters.** The validator applies
// `.Length(2)` before any database round trip, so a three-letter code is a 400
// and not a normalisation.
//
// ── And one the screen cannot fix ────────────────────────────────────────────
//
// **There is no route that reads an employer profile back.** NG-04. The
// identifier this registration returns is the only handle the client will ever
// have on it, and nothing can look it up again — so it is shown, and the member
// is sent straight to the workspace that resolves their sole membership.
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
import { useEmployerRegistration } from '@/hooks/jobs-hiring';
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

export default function RegisterEmployerScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();
  const { register, isSaving, error } = useEmployerRegistration();

  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [organizationType, setOrganizationType] = useState<EmployerOrganizationType>('Company');
  const [companySize, setCompanySize] = useState<CompanySize | null>(null);
  const [countryCode, setCountryCode] = useState('');
  const [description, setDescription] = useState('');

  const onSubmit = async () => {
    if (displayName.trim().length < 2) {
      showAlert({
        type: 'error',
        title: 'Add a name',
        message: 'The trading name candidates will recognise.',
      });
      return;
    }

    // Checked here as well as on the server, because the server's answer is a
    // 400 after a round trip and this one is instant. The server remains the
    // authority — a form that only checked locally would be a second opinion.
    if (countryCode.trim().length !== 2) {
      showAlert({
        type: 'error',
        title: 'Check the country',
        message: 'Use the two-letter country code, like GB or DE.',
      });
      return;
    }

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

    showAlert({
      type: 'success',
      title: 'Employer registered',
      message: 'You are its first owner. Your hiring workspace is ready.',
    });
    router.replace('/job/hiring');
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

          <Input
            label="Country"
            placeholder="GB"
            value={countryCode}
            onChangeText={setCountryCode}
            autoCapitalize="characters"
            maxLength={2}
          />

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

          <Button
            label="Register employer"
            className="mt-2"
            isLoading={isSaving}
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
