// ─────────────────────────────────────────────────────────────────────────────
// Create a fundraising campaign (§15)
//
// A campaign is created as a **draft** and cannot collect anything until it has
// been reviewed and published, at which point the backend attaches it to a
// Diaspora giving cause. That ordering is the contract, and this screen states
// it before the member starts writing rather than after they finish.
//
// The terms checkbox is not decoration: a campaign asks strangers for money, and
// §15 requires the terms step. The server refuses a submission without it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  Section,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { useCurrencies } from '@/hooks/financial';
import { useLocationStore } from '@/store/location';
import { useCreateCampaign, useMyOrganizations } from '@/hooks/community-life';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { CampaignCategory } from '@/types/community-advanced';
import type { BeneficiaryType } from '@/types/financial';
import type { FinancialError } from '@/lib/financial-errors';
import { backOr } from '@/lib/navigation';
import { CurrencyNote } from '@/components/CurrencyNote';
import { useMemberCurrency } from '@/lib/member-currency';

const CATEGORIES: { value: CampaignCategory; label: string }[] = [
  { value: 'Medical', label: 'Medical' },
  { value: 'Education', label: 'Education' },
  { value: 'Emergency', label: 'Emergency' },
  { value: 'Funeral', label: 'Funeral' },
  { value: 'Repatriation', label: 'Repatriation' },
  { value: 'Community Project', label: 'Community' },
  { value: 'Legal Support', label: 'Legal' },
  { value: 'Religious', label: 'Religious' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Disaster Relief', label: 'Disaster relief' },
  { value: 'Other', label: 'Something else' },
];

/**
 * Who the money is for.
 *
 * **`Member` is labelled "Me" rather than "A person", because "a person" is
 * more than this screen can deliver.** A member beneficiary has to be named by
 * id — `DonationCause` inherits it from the campaign, and the platform can only
 * credit a Diaspora member who has a wallet — and there is no member search on
 * this client to name anybody else with. The screen sent `beneficiaryName` as
 * free text and no id at all, so every "a person" campaign was created with a
 * null beneficiary: donations completed, and nothing was ever attributed to
 * anyone. An option the platform cannot honour is the same defect as a filter
 * that can only come back empty.
 *
 * Naming somebody other than yourself needs a member picker and a member-search
 * route, neither of which exists. Until one does, this offers the one member
 * this client can identify.
 */
const BENEFICIARIES: { value: BeneficiaryType; label: string }[] = [
  { value: 'Member', label: 'Me' },
  { value: 'Organization', label: 'An organisation' },
  { value: 'Community', label: 'The community' },
];

export default function CreateCampaignScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.userId);

  /**
   * Where the campaign is, and what it collects in.
   *
   * **Both were hardcoded to Britain.** `countryCode: 'GB'` and
   * `currency: 'GBP'`, on a form used by members anywhere. A member in
   * Mauritius created a British campaign, and the giving screen — which lists
   * causes by the viewer's own country — then hid it from them and from
   * everyone around them. "No cause near you is taking money at the moment",
   * about a campaign they had just published themselves.
   *
   * The country comes from the same store the giving screen filters on, so the
   * two now agree by construction rather than by coincidence.
   *
   * The currency is the organiser's own, from their country of residence — the
   * owner's decision of 13 Oct 2026 that members never choose one. It was a
   * chip row over the served catalogue; the catalogue now only answers whether
   * that currency can be collected in yet.
   */
  const country = useLocationStore((state) => state.currentLocation?.countryCode);
  const { data: currencies } = useCurrencies();

  const currencyOptions = useMemo(
    () =>
      (currencies ?? [])
        .filter((fact) => fact.isActive)
        .map((fact) => ({ value: fact.code, label: `${fact.symbol} ${fact.code}` })),
    [currencies]
  );

  const memberCurrency = useMemberCurrency();
  const currency = memberCurrency.code;
  // Unknown until the catalogue answers, and then whether it lists this currency.
  const currencySupported =
    currencyOptions.length === 0 || currencyOptions.some((option) => option.value === currency);

  // A media reference, never a URL. This form used to send a hardcoded Unsplash
  // photo for every campaign on the platform, into a field the contract
  // documents as an identifier.
  const [coverImage, setCoverImage] = useState<string | null>(null);

  const accountState = useAuthStore((state) => state.user?.accountState);

  const { data: organizations } = useMyOrganizations();
  const create = useCreateCampaign();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [story, setStory] = useState('');
  const [category, setCategory] = useState<CampaignCategory>('Community Project');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>('Community');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const refusal = checkCommunityAccess(
    CommunityCapabilities.CreateCampaign,
    accountState,
    isAuthenticated
  );

  const missing = [
    !title.trim() && 'a title',
    !summary.trim() && 'a short summary',
    !story.trim() && 'the story',
    !targetAmount.trim() && 'a target',
    !beneficiaryName.trim() && 'who it is for',
    !acceptedTerms && 'the fundraising terms',
    !currencySupported && `a currency Diaspora can collect (${currency} is not available yet)`,
  ].filter(Boolean) as string[];

  const onSave = () => {
    if (missing.length > 0) {
      setShowValidation(true);
      return;
    }

    trackCommunityEvent('community.campaign.created', {
      campaignCategory: category,
      organizationId: organizationId || undefined,
      hasDeadline: Boolean(deadline.trim()),
      currency,
    });

    create.mutate(
      {
        title: title.trim(),
        summary: summary.trim(),
        story: story.trim(),
        // Empty string is this codebase's "no media reference" — the api client
        // maps it to an omitted field, and the response mapper uses the same
        // value for the same reason.
        coverImage: coverImage ?? '',
        category,
        targetAmount: Number(targetAmount),
        currency,
        deadline: deadline.trim() || null,
        beneficiaryType,
        // Named, not described. `beneficiaryName` is a label; the attribution
        // runs on the id, and without it a completed donation credits nobody.
        beneficiaryId: beneficiaryType === 'Member' ? userId : undefined,
        beneficiaryName: beneficiaryName.trim(),
        organizationId: organizationId || undefined,
        countryCode: country ?? undefined,
        acceptedTerms,
      },
      {
        onSuccess: (campaign) =>
          router.replace(`/community-life/campaign/${campaign.campaignId}` as never),
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
      keyboard?: 'default' | 'decimal-pad';
      required?: boolean;
      id: string;
      maxLength?: number;
    }
  ) => {
    const isMissing = showValidation && options.required && !value.trim();

    return (
      <View className="mb-4">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-bold mb-1"
          nativeID={`campaign-${options.id}`}
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
          numberOfLines={options.multiline ? 6 : 1}
          keyboardType={options.keyboard ?? 'default'}
          maxLength={options.maxLength}
          placeholder={options.hint}
          placeholderTextColor={tokens.color.text.placeholder}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: isMissing ? tokens.color.border.error : tokens.color.border.default,
            color: tokens.color.text.primary,
            minHeight: options.multiline ? 132 : 48,
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
      title="Start a campaign"
      subtitle="Saved as a draft first"
      refusal={refusal}
      footer={
        <View>
          {create.isError ? (
            <View className="mb-3">
              <FinancialErrorInline error={create.error as FinancialError} />
            </View>
          ) : null}
          <PrimaryButton
            label="Save draft"
            icon="save-outline"
            busy={create.isPending}
            disabled={create.isPending}
            accessibilityHint={
              missing.length > 0
                ? `Still needs ${missing.join(', ')}`
                : 'Saves the campaign so you can submit it for review'
            }
            onPress={onSave}
          />
        </View>
      }
    >
      <View className="px-5 pt-4">
        <InlineRefusal
          icon="information-circle-outline"
          reason="Your campaign is saved as a draft. Nothing is public until you submit it and Diaspora has reviewed it — and it can only take donations once it has been connected to a Diaspora giving cause."
        />

        <View className="h-5" />

        {field('What are you raising money for?', title, setTitle, {
          id: 'title',
          hint: 'Repatriation fund for the Adeyemi family',
          required: true,
          maxLength: 90,
        })}

        {field('One line for the card', summary, setSummary, {
          id: 'summary',
          hint: 'Bringing Mr Adeyemi home to Lagos after 31 years in London.',
          required: true,
          maxLength: 160,
        })}

        {/* The shared dropdown with search (14 Oct 2026); it was a chip row. */}
        <SearchableSelect
          label="Cause"
          placeholder="What kind of cause"
          searchPlaceholder="Search causes"
          options={CATEGORIES.map((option) => ({ key: option.value, label: option.label }))}
          value={category}
          onChange={(key) => setCategory(key as CampaignCategory)}
          testID="campaign-category"
        />

        {field('The full story', story, setStory, {
          id: 'story',
          hint: 'What happened, what the money is for, and how it will be spent. People give to a story they understand.',
          multiline: true,
          required: true,
        })}

        <Section title="A picture" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            {/* Optional, and honestly so. A campaign with no picture renders a
                placeholder rather than a blank rectangle — see `CommunityCover`. */}
            <ImagePickerInput
              label="Cover image"
              value={coverImage}
              onChangeImage={setCoverImage}
              aspect={[16, 9]}
            />
          </View>
        </Section>

        <Section title="The target" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            <CurrencyNote currency={memberCurrency} />
            {!currencySupported ? (
              <Text className="text-xs font-bold text-error-default mb-3">
                Diaspora cannot collect money in {currency} yet, so a campaign cannot be started from your country.
              </Text>
            ) : null}
            {field(`How much, in ${currency || 'your currency'}`, targetAmount, setTargetAmount, {
              id: 'target',
              hint: '4000',
              keyboard: 'decimal-pad',
              required: true,
            })}
            {/* A date, picked, rather than a format a member has to know. `YYYY-MM-DD`
                as a placeholder asks somebody to type a machine's date format from
                memory and offers no feedback when they get it wrong — and the
                deadline is what decides when a campaign stops collecting. The
                picker already existed and this screen was not using it; it emits
                the same `YYYY-MM-DD` the request expects, so nothing downstream
                changes. */}
            <DatePickerInput
              label="Deadline (optional)"
              value={deadline}
              onChangeDate={setDeadline}
              placeholder="No deadline"
            />
          </View>
        </Section>

        <Section title="Who it is for" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            <ChipRow
              accessibilityLabel="Who benefits"
              options={BENEFICIARIES}
              value={beneficiaryType}
              onChange={setBeneficiaryType}
            />
            <View className="h-3" />
            {field('Their name', beneficiaryName, setBeneficiaryName, {
              id: 'beneficiary',
              hint: 'The Adeyemi family',
              required: true,
            })}
          </View>
        </Section>

        {organizations.length > 0 ? (
          <Section
            title="Running it as"
            subtitle="An organisation campaign is administered by that organisation"
            style={{ marginHorizontal: -20 }}
          >
            <View className="px-5">
              <ChipRow
                accessibilityLabel="Who is running the campaign"
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

        {/* Terms — a real gate, refused server-side too */}
        <Section title="Before you submit" style={{ marginHorizontal: -20 }}>
          <View className="px-5">
            <Card
              style={{
                borderColor:
                  showValidation && !acceptedTerms
                    ? tokens.color.border.error
                    : tokens.color.border.default,
              }}
            >
              <View className="flex-row items-start">
                <Switch
                  accessibilityLabel="I accept the fundraising terms"
                  accessibilityHint="Required before a campaign can be submitted"
                  value={acceptedTerms}
                  onValueChange={setAcceptedTerms}
                  trackColor={{
                    false: tokens.color.surface.elevated,
                    true: tokens.color.primary[500],
                  }}
                />
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-semibold ml-3 flex-1 leading-relaxed"
                >
                  I confirm the money raised will be used for what I have described, that I have the
                  beneficiary's permission to fundraise for them, and that I will publish an update
                  saying how it was spent. Diaspora may ask for evidence before publishing.
                </Text>
              </View>
            </Card>

            {showValidation && !acceptedTerms ? (
              <Text
                style={{ color: tokens.color.error.default }}
                className="text-[11px] font-bold mt-1.5"
                accessibilityLiveRegion="polite"
              >
                You need to accept the terms before saving.
              </Text>
            ) : null}

            <View className="mt-4">
              <SecondaryButton label="Cancel" onPress={() => backOr()} />
            </View>
          </View>
        </Section>
      </View>
    </CommunityScreen>
  );
}
