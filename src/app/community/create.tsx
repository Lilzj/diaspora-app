// ─────────────────────────────────────────────────────────────────────────────
// Start a community — 11 Sep 2026
//
// The founder becomes the community's Owner, and one of its administrators, the
// moment it is created: the product decision this screen exists for. It opens
// Pending — only the founder and Diaspora can see it, and nobody else can join
// until Diaspora opens it — which is how the platform answers somebody reserving
// "Nigerians in London" on a whim. The screen says so before the member commits,
// not after.
//
// Everything is decided by the server: the name's uniqueness, whether a national
// community has said where it is from, whether the member's identity is verified
// enough to found one. Its refusals are shown as it wrote them.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityType, ProposeCommunityInput } from '@/types/community-directory';
import { useProposeCommunity } from '@/hooks/communities';
import { communityTypeLabel } from '@/components/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { allCountries } from '@/mocks/countries';
import { backOr } from '@/lib/navigation';

const TYPES: CommunityType[] = [
  'NationalDiaspora',
  'RegionalDiaspora',
  'CityChapter',
  'EthnoLinguistic',
  'FaithCommunity',
  'InterestCommunity',
];

/** The two kinds the platform refuses without an origin — the directory's one filter. */
const NEEDS_ORIGIN: CommunityType[] = ['NationalDiaspora', 'RegionalDiaspora'];

const NAME_MIN = 2;
const NAME_MAX = 120;
const TAGLINE_MAX = 200;

export default function StartCommunityScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const propose = useProposeCommunity();

  const [name, setName] = useState('');
  const [type, setType] = useState<CommunityType | null>(null);
  const [visibility, setVisibility] = useState<ProposeCommunityInput['visibility']>('Public');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [regionName, setRegionName] = useState('');
  const [tagline, setTagline] = useState('');

  const needsOrigin = type !== null && NEEDS_ORIGIN.includes(type);
  const country = allCountries.find((entry) => entry.code === countryCode) ?? null;

  const matches = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (query.length < 2 || country) return [];
    return allCountries.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 6);
  }, [countryQuery, country]);

  const trimmedName = name.trim();

  // What the form still needs, in words — shown rather than a disabled button
  // that gives no reason.
  const missing =
    trimmedName.length < NAME_MIN
      ? 'Give your community a name.'
      : type === null
        ? 'Choose what kind of community it is.'
        : type === 'NationalDiaspora' && !countryCode
          ? 'Choose the country its members are from.'
          : type === 'RegionalDiaspora' && !countryCode && !regionName.trim()
            ? 'Say which country or region its members are from.'
            : null;

  const submit = () => {
    if (missing || type === null) return;

    propose.mutate(
      {
        name: trimmedName,
        type,
        visibility,
        originCountryCode: needsOrigin ? (countryCode ?? undefined) : undefined,
        originRegionName: type === 'RegionalDiaspora' ? regionName.trim() || undefined : undefined,
        tagline: tagline.trim() || undefined,
      },
      {
        onSuccess: (membership) => {
          showAlert({
            type: 'success',
            title: 'Your community is waiting for review',
            message:
              'You are its owner. Only you can see it until Diaspora opens it, and then members can find and join it.',
          });
          router.replace(`/community/${membership.communityId}` as never);
        },
        onError: (error) =>
          showAlert({
            type: 'error',
            title: 'Your community was not created',
            message: error instanceof Error ? error.message : 'Please try again.',
          }),
      }
    );
  };

  const chip = (selected: boolean) => ({
    backgroundColor: selected ? tokens.color.primary[500] : tokens.color.surface.card,
    borderColor: selected ? tokens.color.primary[500] : tokens.color.surface.border,
  });

  const chipText = (selected: boolean) => ({
    color: selected ? tokens.color.text.inverse : tokens.color.text.primary,
  });

  const inputStyle = {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.border,
    color: tokens.color.text.primary,
  };

  const label = (text: string) => (
    <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black mb-2 mt-5">
      {text}
    </Text>
  );

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black ml-2"
        >
          Start a community
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollEndScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{ backgroundColor: tokens.color.info.surface }}
            className="rounded-xl px-3 py-3"
          >
            <Text style={{ color: tokens.color.info.default }} className="text-xs font-bold">
              You will be the owner, and you can give members roles such as moderator and
              administrator. Diaspora reviews new communities before anyone else can find or join
              them.
            </Text>
          </View>

          {label('Name')}
          <TextInput
            accessibilityLabel="Community name"
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            placeholder="Nigerians in Leeds"
            placeholderTextColor={tokens.color.text.placeholder}
            style={inputStyle}
            className="rounded-xl border px-3 py-3 text-sm font-bold"
          />

          {label('What kind of community is it?')}
          <View className="flex-row flex-wrap">
            {TYPES.map((option) => (
              <TouchableOpacity
                key={option}
                accessible
                accessibilityRole="radio"
                accessibilityState={{ selected: type === option }}
                onPress={() => setType(option)}
                style={chip(type === option)}
                className="rounded-full border px-3 py-2 mr-2 mb-2"
              >
                <Text style={chipText(type === option)} className="text-xs font-black">
                  {communityTypeLabel(option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {needsOrigin ? (
            <>
              {label(
                type === 'NationalDiaspora'
                  ? 'Where are its members from?'
                  : 'Where are its members from? A country, a region, or both.'
              )}

              {country ? (
                <View
                  style={inputStyle}
                  className="flex-row items-center rounded-xl border px-3 py-3"
                >
                  <Text className="text-base mr-2">{country.flag}</Text>
                  <Text style={{ color: tokens.color.text.primary }} className="flex-1 text-sm font-bold">
                    {country.name}
                  </Text>
                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Choose a different country"
                    onPress={() => {
                      setCountryCode(null);
                      setCountryQuery('');
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color={tokens.color.text.placeholder} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput
                    accessibilityLabel="Search for a country"
                    value={countryQuery}
                    onChangeText={setCountryQuery}
                    placeholder="Search countries"
                    placeholderTextColor={tokens.color.text.placeholder}
                    style={inputStyle}
                    className="rounded-xl border px-3 py-3 text-sm font-bold"
                  />
                  {matches.map((entry) => (
                    <TouchableOpacity
                      key={entry.code}
                      accessible
                      accessibilityRole="button"
                      onPress={() => {
                        setCountryCode(entry.code);
                        setCountryQuery(entry.name);
                      }}
                      className="flex-row items-center px-3 py-2"
                    >
                      <Text className="text-base mr-2">{entry.flag}</Text>
                      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
                        {entry.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {type === 'RegionalDiaspora' ? (
                <TextInput
                  accessibilityLabel="Region"
                  value={regionName}
                  onChangeText={setRegionName}
                  placeholder="West Africa"
                  placeholderTextColor={tokens.color.text.placeholder}
                  style={inputStyle}
                  className="rounded-xl border px-3 py-3 text-sm font-bold mt-2"
                />
              ) : null}
            </>
          ) : null}

          {label('Who can find it once it is open?')}
          {(
            [
              ['Public', 'Anyone can find it in the directory and ask to join.'],
              ['Unlisted', 'Kept out of the directory. People join through a link you share.'],
            ] as const
          ).map(([option, description]) => (
            <TouchableOpacity
              key={option}
              accessible
              accessibilityRole="radio"
              accessibilityState={{ selected: visibility === option }}
              onPress={() => setVisibility(option)}
              style={chip(visibility === option)}
              className="rounded-xl border px-3 py-3 mb-2"
            >
              <Text style={chipText(visibility === option)} className="text-sm font-black">
                {option}
              </Text>
              <Text style={chipText(visibility === option)} className="text-xs font-bold mt-0.5">
                {description}
              </Text>
            </TouchableOpacity>
          ))}

          {label('Tagline (optional)')}
          <TextInput
            accessibilityLabel="Tagline"
            value={tagline}
            onChangeText={setTagline}
            maxLength={TAGLINE_MAX}
            placeholder="One sentence about who it is for"
            placeholderTextColor={tokens.color.text.placeholder}
            style={inputStyle}
            className="rounded-xl border px-3 py-3 text-sm font-bold"
          />

          {missing ? (
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold mt-5">
              {missing}
            </Text>
          ) : null}

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(missing) || propose.isPending }}
            disabled={Boolean(missing) || propose.isPending}
            onPress={submit}
            style={{
              backgroundColor:
                missing || propose.isPending
                  ? tokens.color.surface.border
                  : tokens.color.primary[500],
            }}
            className="rounded-xl items-center py-3.5 mt-4"
          >
            {propose.isPending ? (
              <ActivityIndicator color={tokens.color.text.inverse} />
            ) : (
              <Text style={{ color: tokens.color.text.inverse }} className="text-sm font-black">
                Create community
              </Text>
            )}
          </TouchableOpacity>
        </ScrollEndScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
