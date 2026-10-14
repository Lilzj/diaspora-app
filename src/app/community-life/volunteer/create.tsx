// ─────────────────────────────────────────────────────────────────────────────
// Create a volunteer opportunity (§21)
//
// Organizer-only, and refused server-side when the caller's organization
// capabilities do not include `canManageVolunteers`. The organisation picker
// only lists organizations the *server* said the caller has a role in.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  Section,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { useCreateOpportunity, useMyOrganizations } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useLocationStore } from '@/store/location';
import { TownPicker } from '@/components/forms/TownPicker';
import type { FinancialError } from '@/lib/financial-errors';

const CAUSES = [
  { value: 'Community Events', label: 'Events' },
  { value: 'Education', label: 'Education' },
  { value: 'Elder Care', label: 'Elder care' },
  { value: 'Food', label: 'Food' },
  { value: 'Health', label: 'Health' },
  { value: 'Legal Support', label: 'Legal' },
  { value: 'Other', label: 'Something else' },
];

interface DraftShift {
  label: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: string;
}

export default function CreateOpportunityScreen() {
  const { tokens } = useTheme();
  const locatedCity = useLocationStore((state) => state.currentLocation?.cityName);

  const { data: organizations, isLoading: isLoadingOrgs } = useMyOrganizations();
  const create = useCreateOpportunity();

  const [organizationId, setOrganizationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cause, setCause] = useState('Community Events');
  const [areaName, setAreaName] = useState('');
  // The town is the member's choice, prefilled from where they are browsing.
  // It used to fall back to 'London' silently when the location store was empty.
  const [cityName, setCityName] = useState(locatedCity ?? '');
  const [addressLine, setAddressLine] = useState('');
  const [minimumAge, setMinimumAge] = useState('');
  const [skills, setSkills] = useState('');
  const [deadline, setDeadline] = useState('');
  const [shifts, setShifts] = useState<DraftShift[]>([
    { label: 'Morning', date: '', startTime: '09:00', endTime: '13:00', capacity: '4' },
  ]);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    // Prefill once the location store hydrates; never overwrite a choice.
    if (locatedCity) setCityName((current) => current || locatedCity);
  }, [locatedCity]);

  useEffect(() => {
    if (!organizationId && organizations.length > 0) {
      setOrganizationId(organizations[0].organizationId);
    }
  }, [organizations, organizationId]);

  const missing = [
    !organizationId && 'an organisation',
    !title.trim() && 'a title',
    !description.trim() && 'a description',
    !cityName.trim() && 'a town',
    !addressLine.trim() && 'an address',
    shifts.some((shift) => !shift.date.trim()) && 'a date for every shift',
  ].filter(Boolean) as string[];

  const submit = (publish: boolean) => {
    if (missing.length > 0) {
      setShowValidation(true);
      return;
    }

    trackCommunityEvent('community.volunteer_opportunity.created', {
      organizationId,
      cause,
      shiftCount: shifts.length,
    });

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        cause,
        organizationId,
        cityName: cityName.trim(),
        areaName: areaName.trim(),
        addressLine: addressLine.trim(),
        startDate: shifts[0]?.date.trim() || undefined,
        requiredSkills: skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        minimumAge: minimumAge.trim() ? Number(minimumAge) : undefined,
        applicationDeadline: deadline.trim() || undefined,
        shifts: shifts.map((shift) => ({
          label: shift.label.trim() || 'Shift',
          date: shift.date.trim(),
          startTime: shift.startTime.trim(),
          endTime: shift.endTime.trim(),
          capacity: Number(shift.capacity) || 1,
        })),
        publish,
      },
      {
        onSuccess: (opportunity) =>
          router.replace(`/community-life/volunteer/${opportunity.opportunityId}` as never),
      }
    );
  };

  const field = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    options: {
      hint?: string;
      multiline?: boolean;
      keyboard?: 'default' | 'number-pad';
      required?: boolean;
      id: string;
    }
  ) => {
    const isMissing = showValidation && options.required && !value.trim();

    return (
      <View className="mb-4">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold mb-1"
          nativeID={`opp-${options.id}`}
        >
          {label}
          {options.required ? ' *' : ''}
        </Text>
        <TextInput
          accessibilityLabel={`${label}${options.required ? ', required' : ', optional'}`}
          accessibilityHint={options.hint}
          value={value}
          onChangeText={onChange}
          multiline={options.multiline}
          numberOfLines={options.multiline ? 5 : 1}
          keyboardType={options.keyboard ?? 'default'}
          placeholder={options.hint}
          placeholderTextColor={tokens.color.text.placeholder}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: isMissing ? tokens.color.border.error : tokens.color.border.default,
            color: tokens.color.text.primary,
            minHeight: options.multiline ? 110 : 48,
            textAlignVertical: options.multiline ? 'top' : 'center',
          }}
          className="rounded-xl border px-4 py-3 text-sm font-semibold"
        />
        {isMissing ? (
          <Text
            style={{ color: tokens.color.error.default }}
            className="text-[11px] font-bold mt-1"
            accessibilityLiveRegion="polite"
          >
            This one is needed.
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <CommunityScreen
      title="New opportunity"
      subtitle="Ask your community for help"
      isLoading={isLoadingOrgs}
      footer={
        organizations.length > 0 ? (
          <View>
            {create.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={create.error as FinancialError} />
              </View>
            ) : null}
            <PrimaryButton
              label="Publish"
              icon="megaphone-outline"
              busy={create.isPending}
              disabled={create.isPending}
              accessibilityHint={
                missing.length > 0 ? `Still needs ${missing.join(', ')}` : 'Makes it live'
              }
              onPress={() => submit(true)}
            />
            <View className="mt-2.5">
              <SecondaryButton
                label="Save as a draft"
                disabled={create.isPending}
                onPress={() => submit(false)}
              />
            </View>
          </View>
        ) : null
      }
    >
      {organizations.length === 0 && !isLoadingOrgs ? (
        <EmptyState
          icon="business-outline"
          title="You need an organisation"
          body="Volunteer opportunities are posted by an organisation, so somebody is accountable for the people who turn up. Register one, or ask an administrator to add you."
          action="Register an organisation"
          onAction={() => router.push('/community-life/org/create')}
        />
      ) : (
        <View className="px-5 pt-4">
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold mb-2">
            Posting as
          </Text>
          <ChipRow
            accessibilityLabel="Which organisation is posting"
            options={organizations.map((organization) => ({
              value: organization.organizationId,
              label: organization.name,
            }))}
            value={organizationId}
            onChange={setOrganizationId}
          />

          <View className="h-4" />

          {field('What do you need help with?', title, setTitle, {
            id: 'title',
            hint: 'Stewards for the Independence Day celebration',
            required: true,
          })}

          {field('What would they be doing?', description, setDescription, {
            id: 'description',
            hint: 'Be specific about the tasks, and say what training or briefing you provide.',
            multiline: true,
            required: true,
          })}

          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold mb-2">
            Cause
          </Text>
          <ChipRow accessibilityLabel="Cause" options={CAUSES} value={cause} onChange={setCause} />

          <Section title="Where" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <TownPicker
                label="Town or city *"
                value={cityName}
                onChange={(town) => setCityName(town.cityName)}
                testID="volunteer-town"
              />
              {showValidation && !cityName.trim() ? (
                <Text
                  style={{ color: tokens.color.error.default }}
                  className="text-[11px] font-bold mb-3"
                  accessibilityLiveRegion="polite"
                >
                  Choose the town.
                </Text>
              ) : null}
              {field('Address', addressLine, setAddressLine, {
                id: 'address',
                hint: 'The street address, or a landmark people can find',
                required: true,
              })}
              {field('Area', areaName, setAreaName, { id: 'area', hint: 'The neighbourhood' })}
            </View>
          </Section>

          <Section
            title="Shifts"
            subtitle="Each shift has its own places"
            style={{ marginHorizontal: -20 }}
          >
            <View className="px-5">
              {shifts.map((shift, index) => (
                <Card key={index} style={{ marginBottom: 12 }}>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[10px] font-black uppercase tracking-widest"
                    >
                      Shift {index + 1}
                    </Text>
                    {shifts.length > 1 ? (
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={tokens.color.error.default}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove shift ${index + 1}`}
                        onPress={() => setShifts(shifts.filter((_, i) => i !== index))}
                      />
                    ) : null}
                  </View>

                  {(
                    [
                      ['Name', 'label', 'Morning — gates'],
                      ['Date', 'date', 'YYYY-MM-DD'],
                      ['Starts', 'startTime', '09:00'],
                      ['Ends', 'endTime', '13:00'],
                      ['Places', 'capacity', '4'],
                    ] as const
                  ).map(([label, key, hint]) => (
                    <View key={key} className="mb-2.5">
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-bold mb-1"
                      >
                        {label}
                      </Text>
                      <TextInput
                        accessibilityLabel={`Shift ${index + 1} ${label.toLowerCase()}`}
                        value={shift[key]}
                        onChangeText={(text) =>
                          setShifts(
                            shifts.map((candidate, i) =>
                              i === index ? { ...candidate, [key]: text } : candidate
                            )
                          )
                        }
                        keyboardType={key === 'capacity' ? 'number-pad' : 'default'}
                        placeholder={hint}
                        placeholderTextColor={tokens.color.text.placeholder}
                        style={{
                          backgroundColor: tokens.color.surface.elevated,
                          borderColor:
                            showValidation && key === 'date' && !shift.date.trim()
                              ? tokens.color.border.error
                              : tokens.color.border.default,
                          color: tokens.color.text.primary,
                          minHeight: 44,
                        }}
                        className="rounded-lg border px-3 text-sm font-semibold"
                      />
                    </View>
                  ))}
                </Card>
              ))}

              <SecondaryButton
                label="Add another shift"
                icon="add"
                onPress={() =>
                  setShifts([
                    ...shifts,
                    { label: '', date: '', startTime: '09:00', endTime: '13:00', capacity: '4' },
                  ])
                }
              />
            </View>
          </Section>

          <Section title="Who can help" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              {field('Useful skills, separated by commas', skills, setSkills, {
                id: 'skills',
                hint: 'Crowd management, first aid',
              })}
              {field('Minimum age', minimumAge, setMinimumAge, {
                id: 'age',
                hint: '18',
                keyboard: 'number-pad',
              })}
              {field('Apply by', deadline, setDeadline, { id: 'deadline', hint: 'YYYY-MM-DD' })}

              <InlineRefusal
                icon="shield-outline"
                reason="Diaspora shows applicants whether their account is verified. Any check beyond that — a DBS certificate, a professional accreditation — is yours to make before you approve somebody."
              />
            </View>
          </Section>
        </View>
      )}
    </CommunityScreen>
  );
}
