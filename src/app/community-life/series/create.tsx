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
  PrimaryButton,
  RecurrenceEditor,
  SecondaryButton,
  Section,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TownPicker } from '@/components/forms/TownPicker';
import { useCommunityAccess, useCreateSeries, useMyOrganizations } from '@/hooks/community-life';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import type { RecurrenceRule } from '@/types/community-advanced';
import { useCommunityLifeCatalogue } from '@/hooks/community-life-catalogue';
import type { FinancialError } from '@/lib/financial-errors';
import { deviceTimeZone } from '@/lib/event-timezone';
import { useMemberCurrency } from '@/lib/member-currency';

// Kinds of event are the server's since 13 Oct 2026 (`useCommunityLifeCatalogue`);
// this screen kept twelve of its own, folded onto the server's keys.

export default function CreateSeriesScreen() {
  // `organizationId` lets a caller open this composer already bound to an
  // organisation — the Creator Studio management sheet does, from its Events
  // tab. The picker below is still shown and still changeable; this only sets
  // its initial value, and an id the member holds no role in is ignored
  // because the picker's options come from `useMyOrganizations`.
  const { seriesId, organizationId: initialOrganizationId } = useLocalSearchParams<{
    seriesId?: string;
    organizationId?: string;
  }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const locationCity = useLocationStore((state) => state.currentLocation?.cityName);
  // The town is searched in the residence country, so the series is filed there.
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry ?? null);

  const { data: organizations } = useMyOrganizations();
  const create = useCreateSeries();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // A server key (`networking`), from the server's list.
  const [category, setCategory] = useState<string>('networking');
  const { eventCategories, isLoading: catalogueLoading, isUnavailable: catalogueUnavailable } = useCommunityLifeCatalogue();
  const categoryOptions = eventCategories.map((c) => ({ key: c.key, label: c.name }));
  // The town, from the one shared search of towns in the member's country
  // (14 Oct 2026). It was the discovery location with a 'London' fallback,
  // which nobody could change. Prefilled from that location until chosen.
  const [chosenCity, setChosenCity] = useState<string | null>(null);
  const city = (chosenCity ?? locationCity ?? '').trim();
  const [startDate, setStartDate] = useState('');
  const [time, setTime] = useState('18:30');
  const [endTime, setEndTime] = useState('20:00');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  // In the member's own currency (13 Oct 2026); it was GBP for everyone.
  const memberCurrency = useMemberCurrency();
  const [capacity, setCapacity] = useState('');
  const [organizationId, setOrganizationId] = useState<string>(initialOrganizationId ?? '');
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
    !city && 'a town',
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
        category,
        startDate: startDate.trim(),
        time,
        endTime,
        // The zone the member is in (14 Oct 2026). It was 'BST' for everyone,
        // which is not even an IANA zone.
        timezone: deviceTimeZone(),
        recurrence,
        cityName: city,
        countryCode: residenceCountry ?? undefined,
        areaName: areaName.trim(),
        addressLine: addressLine.trim(),
        organizationId: organizationId || undefined,
        priceAmount: priceAmount.trim() ? Number(priceAmount) : undefined,
        priceCurrency: priceAmount.trim() ? memberCurrency.code : undefined,
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

        {/* The shared dropdown with search (14 Oct 2026); it was a chip row. */}
        <SearchableSelect
          label="Kind of event"
          placeholder="Choose a kind of event"
          searchPlaceholder="Search kinds of event"
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          isLoading={catalogueLoading}
          unavailableMessage={catalogueUnavailable ? 'Diaspora could not load the kinds of event just now.' : null}
          testID="series-category"
        />

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
              hint: 'The street address',
              required: true,
            })}
            <TownPicker
              label="Town"
              value={city}
              onChange={(town) => setChosenCity(town.cityName)}
              testID="series-town"
            />
            {field('Area', areaName, setAreaName, { id: 'areaName', hint: 'The neighbourhood' })}
          </View>
        </Section>

        <Section title="Cost and places" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            {field(`Price per date, in ${memberCurrency.code}`, priceAmount, setPriceAmount, {
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
