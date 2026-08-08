// ─────────────────────────────────────────────────────────────────────────────
// Create a recurring event (§9, §10)
//
// The recurrence is edited as **data** through `<RecurrenceEditor>` and sent as
// a `RecurrenceRule`. Nothing on this screen expands the rule into dates: the
// preview says what the pattern is, and the exact dates come back from the
// server after saving, because occurrence identifiers minted on a device could
// not be referred to by anyone else's registration.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EMPTY_RECURRENCE,
  InlineRefusal,
  PrimaryButton,
  RecurrenceEditor,
  SecondaryButton,
  Section,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { useCommunityAccess, useCreateSeries, useMyOrganizations } from '@/hooks/community-life';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import type { RecurrenceRule } from '@/types/community-advanced';
import type { EventCategory } from '@/types/community-life';
import type { FinancialError } from '@/lib/financial-errors';

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'Bible Study', label: 'Bible study' },
  { value: 'Prayer Meeting', label: 'Prayer' },
  { value: 'Church Program', label: 'Church' },
  { value: 'Mosque Event', label: 'Mosque' },
  { value: 'Networking', label: 'Networking' },
  { value: 'Workshop', label: 'Workshop' },
  { value: 'Training', label: 'Training' },
  { value: 'Football Match', label: 'Football' },
  { value: 'Basketball', label: 'Basketball' },
  { value: 'Youth Program', label: 'Youth' },
  { value: 'Volunteer Activity', label: 'Volunteering' },
  { value: 'Other', label: 'Something else' },
];

export default function CreateSeriesScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId?: string }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const city = useLocationStore((state) => state.currentLocation?.cityName);

  const { data: organizations } = useMyOrganizations();
  const create = useCreateSeries();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Networking');
  const [startDate, setStartDate] = useState('');
  const [time, setTime] = useState('18:30');
  const [endTime, setEndTime] = useState('20:00');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [capacity, setCapacity] = useState('');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(EMPTY_RECURRENCE);
  const [showValidation, setShowValidation] = useState(false);

  const refusal = checkCommunityAccess(
    CommunityCapabilities.CreateSeries,
    accountState,
    isAuthenticated
  );

  const missing = [
    !title.trim() && 'a title',
    !description.trim() && 'a description',
    !startDate.trim() && 'a start date',
    !addressLine.trim() && 'an address',
  ].filter(Boolean) as string[];

  const submit = (publish: boolean) => {
    if (missing.length > 0) {
      setShowValidation(true);
      return;
    }

    trackCommunityEvent('community.series.created', {
      frequency: recurrence.frequency,
      organizationId: organizationId || undefined,
      category,
      isFree: !priceAmount.trim(),
    });

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
        category,
        startDate: startDate.trim(),
        time,
        endTime,
        timezone: 'BST',
        recurrence,
        cityName: city ?? 'London',
        areaName: areaName.trim(),
        addressLine: addressLine.trim(),
        organizationId: organizationId || undefined,
        priceAmount: priceAmount.trim() ? Number(priceAmount) : undefined,
        priceCurrency: priceAmount.trim() ? 'GBP' : undefined,
        capacity: capacity.trim() ? Number(capacity) : undefined,
        publish,
      },
      {
        onSuccess: (series) =>
          router.replace(`/community-life/series/${series.seriesId}` as never),
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
          nativeID={`field-${options.id}`}
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
          numberOfLines={options.multiline ? 4 : 1}
          keyboardType={options.keyboard ?? 'default'}
          placeholder={options.hint}
          placeholderTextColor={tokens.color.text.placeholder}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: isMissing ? tokens.color.border.error : tokens.color.border.default,
            color: tokens.color.text.primary,
            minHeight: options.multiline ? 96 : 48,
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
      title={seriesId ? 'Edit series' : 'New recurring event'}
      subtitle="Set it up once, and it repeats"
      gapKey="eventSeries"
      refusal={refusal}
      footer={
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
              missing.length > 0 ? `Still needs ${missing.join(', ')}` : 'Makes the series live'
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
      }
    >
      <View className="px-5 pt-4">
        {field('What is it called?', title, setTitle, {
          id: 'title',
          hint: 'Tuesday Evening Bible Study',
          required: true,
        })}

        {field('What happens?', description, setDescription, {
          id: 'description',
          hint: 'What people should expect, and anything they should bring.',
          multiline: true,
          required: true,
        })}

        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold mb-2">
          Kind of event
        </Text>
        <ChipRow
          accessibilityLabel="Kind of event"
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
        />

        <View className="h-4" />

        {field('First date', startDate, setStartDate, {
          id: 'startDate',
          hint: 'YYYY-MM-DD',
          required: true,
        })}

        <View className="flex-row">
          <View className="flex-1 mr-2">
            {field('Starts', time, setTime, { id: 'time', hint: '18:30' })}
          </View>
          <View className="flex-1 ml-2">
            {field('Ends', endTime, setEndTime, { id: 'endTime', hint: '20:00' })}
          </View>
        </View>

        <Section title="How often it repeats" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            <Card>
              <RecurrenceEditor rule={recurrence} onChange={setRecurrence} />
            </Card>
          </View>
        </Section>

        <Section title="Where" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            {field('Address', addressLine, setAddressLine, {
              id: 'addressLine',
              hint: '88 Queens Road',
              required: true,
            })}
            {field('Area', areaName, setAreaName, { id: 'areaName', hint: 'Peckham' })}
            <InlineRefusal
              icon="location-outline"
              reason={`This will be listed in ${city ?? 'London'}, from your Diaspora location.`}
            />
          </View>
        </Section>

        <Section title="Cost and places" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            {field('Price per date, in pounds', priceAmount, setPriceAmount, {
              id: 'price',
              hint: 'Leave empty if it is free',
              keyboard: 'number-pad',
            })}
            {field('Places per date', capacity, setCapacity, {
              id: 'capacity',
              hint: 'Leave empty for no limit',
              keyboard: 'number-pad',
            })}
          </View>
        </Section>

        {organizations.length > 0 ? (
          <Section
            title="Who is hosting"
            subtitle="Posting as an organisation puts it on their page"
            style={{ marginHorizontal: -20 }}
          >
            <View className="px-5">
              <ChipRow
                accessibilityLabel="Who is hosting"
                options={[
                  { value: '', label: 'Me' },
                  ...organizations.map((organization) => ({
                    value: organization.organizationId,
                    label: organization.name,
                  })),
                ]}
                value={organizationId}
                onChange={setOrganizationId}
              />
            </View>
          </Section>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
