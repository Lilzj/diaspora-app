// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community onboarding (Frontend Phase 13, §9, §55)
//
// §9's flow: welcome, residence, primary community, interested communities,
// discovery, preferences, notification preferences, done.
//
// ── What this flow does not do, and why each omission is deliberate ──────────
//
// **It does not ask for residence again.** The existing `(auth)/choose-country`
// flow already collects it and writes it through the certified path. §3 says reuse;
// this step *displays* what the platform already knows and offers a way to change
// it, routing to the existing screen. A second residence picker would be a second
// source of truth for the same field.
//
// **It does not preselect anything.** §55 forbids automatically assigning
// nationality or community membership from location. A member in Mauritius is not
// pre-ticked into a Mauritian community, and a member whose profile says Nigerian
// nationality is not pre-ticked into the Nigerian community — because nationality
// is not membership, and §2 is explicit about it. Suggestions appear, with the
// reason the server gave, and every one of them starts unticked.
//
// **It does not require a community.** §9: "Do not force users to select a
// community if the product's existing identity rules do not require it." Skip is
// available on every step and is a first-class outcome, not a nag. A member who
// skips lands on a working app in `ALL_COMMUNITIES` mode.
//
// **It sends nothing it was not given.** The suggestion request carries the
// residence country and nothing else — not nationality, not language, not contacts,
// not an inferred attribute. If residence was skipped, it carries nothing at all.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityId, CommunityRef } from '@/types/community-directory';
import {
  useCommunityContext,
  useCommunityPreferences,
  useCommunitySuggestions,
  useMembershipAction,
  useSaveCommunityPreferences,
  useSetPrimaryCommunity,
} from '@/hooks/communities';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { useCommunityContextStore } from '@/store/community-context';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { defaultCommunityPreferences } from '@/types/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';
import {
  CommunityRow,
  CommunitySelectorSheet,
  MultiCommunityGapNotice,
} from '@/components/community-directory';

type StepKey =
  | 'welcome'
  | 'residence'
  | 'primary'
  | 'interested'
  | 'preferences'
  | 'notifications'
  | 'done';

const STEPS: StepKey[] = [
  'welcome',
  'residence',
  'primary',
  'interested',
  'preferences',
  'notifications',
  'done',
];

export default function CommunityOnboardingScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const context = useCommunityContext();
  const activeLocation = getActiveLocation(useLocationStore());
  const store = useCommunityContextStore();

  const [stepIndex, setStepIndex] = useState(0);
  const [primaryChoice, setPrimaryChoice] = useState<CommunityId | null>(null);
  const [interested, setInterested] = useState<CommunityId[]>([]);
  const [pickerFor, setPickerFor] = useState<'primary' | 'interested' | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useCommunitySuggestions(activeLocation.countryCode);
  const preferences = useCommunityPreferences();
  const savePreferences = useSaveCommunityPreferences();
  const membershipAction = useMembershipAction();
  const setPrimary = useSetPrimaryCommunity();

  const [draftPreferences, setDraftPreferences] = useState(
    () => preferences.data ?? defaultCommunityPreferences()
  );

  React.useEffect(() => {
    if (preferences.data) setDraftPreferences(preferences.data);
  }, [preferences.data]);

  React.useEffect(() => {
    trackCommunityEvent('community.onboarding.started');
  }, []);

  const step = STEPS[stepIndex];

  const advance = useCallback(() => {
    trackCommunityEvent('community.onboarding.step.completed', {
      stepKey: step,
      stepIndex,
      stepCount: STEPS.length,
    });
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, [step, stepIndex]);

  const skip = useCallback(() => {
    trackCommunityEvent('community.onboarding.skipped', { stepKey: step, stepIndex });
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, [step, stepIndex]);

  const finish = useCallback(async () => {
    setBusy(true);

    try {
      // Joining is what makes a primary community possible: the adapter refuses a
      // primary that is not a joined community, and a real contract must state the
      // same rule (GAP-005). So join first, then set primary.
      if (primaryChoice) {
        await membershipAction.mutateAsync({ communityId: primaryChoice, action: 'join' });
        await setPrimary.mutateAsync(primaryChoice);
        store.switchTo(primaryChoice, { mode: 'PRIMARY_COMMUNITY' });
      }

      // §8: interest is expressed, never inferred, and is not membership.
      for (const id of interested) {
        if (id === primaryChoice) continue;
        await membershipAction.mutateAsync({ communityId: id, action: 'express-interest' });
      }

      await savePreferences.mutateAsync(draftPreferences);

      trackCommunityEvent('community.onboarding.completed', {
        communityCount: interested.length + (primaryChoice ? 1 : 0),
      });
    } finally {
      setBusy(false);
      router.replace('/(tabs)');
    }
  }, [
    draftPreferences,
    interested,
    membershipAction,
    primaryChoice,
    savePreferences,
    setPrimary,
    store,
  ]);

  const suggestionRefs = useMemo(() => suggestions.data ?? [], [suggestions.data]);

  const communityById = useCallback(
    (id: CommunityId): CommunityRef | undefined =>
      context.availableCommunities.find((ref) => ref.id === id),
    [context.availableCommunities]
  );

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      {/* Progress + skip */}
      <View className="px-4 pt-2 pb-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text
            accessibilityRole="text"
            accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}`}
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            Step {stepIndex + 1} of {STEPS.length}
          </Text>

          {step !== 'done' ? (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Skip this step. You can choose communities later."
              onPress={skip}
            >
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold"
              >
                Skip
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ backgroundColor: tokens.color.neutral[200] }}
          className="h-1 rounded-full overflow-hidden"
        >
          <View
            style={{
              width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
              backgroundColor: tokens.color.primary[500],
            }}
            className="h-1 rounded-full"
          />
        </View>
      </View>

      <ScrollEndScrollView
        endNavigation={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}>
        {step === 'welcome' ? (
          <StepBody
            title="Your communities"
            body="Diaspora can show you what matters to the communities you belong to — guides, jobs, housing, events and the people who help. You can pick one main community, follow others, or skip this entirely and browse everything."
            icon="people-circle-outline"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold leading-relaxed"
            >
              A community is not the same as your nationality or where you live. You can live in
              Mauritius, belong to the Nigerian community, and follow the Ghanaian and Indian ones.
              Nothing here is published to your profile unless you choose to.
            </Text>
          </StepBody>
        ) : null}

        {step === 'residence' ? (
          <StepBody
            title="Where you live"
            body="This helps us suggest communities with people near you. It is not the same as your community, and we do not assume one from the other."
            icon="location-outline"
          >
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="flex-row items-center rounded-2xl border p-3"
            >
              <Text className="text-2xl">{activeLocation.flag}</Text>
              <View className="flex-1 ml-3">
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                  {activeLocation.countryName}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold mt-0.5"
                >
                  {activeLocation.displayName ?? activeLocation.cityName}
                </Text>
              </View>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Change where you live"
                onPress={() => router.push('/settings/location')}
              >
                <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          </StepBody>
        ) : null}

        {step === 'primary' ? (
          <StepBody
            title="Your main community"
            body="This shapes what you see first — your home feed, suggestions and notifications. You can change it whenever you like, or leave it unset."
            icon="star-outline"
          >
            {suggestions.isSimulated ? (
              <View className="mb-3">
                <MultiCommunityGapNotice gapKey="communityOnboardingSuggestions" compact />
              </View>
            ) : null}

            {suggestions.isLoading ? (
              <ActivityIndicator color={tokens.color.primary[500]} />
            ) : (
              <>
                {suggestionRefs.slice(0, 5).map((entry) => (
                  <CommunityRow
                    key={entry.community.id}
                    community={entry.community}
                    reason={entry.reason}
                    isSelected={primaryChoice === entry.community.id}
                    onPress={() =>
                      setPrimaryChoice((prev) =>
                        prev === entry.community.id ? null : entry.community.id
                      )
                    }
                  />
                ))}

                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Search all communities"
                  onPress={() => setPickerFor('primary')}
                  activeOpacity={0.8}
                  style={{ borderColor: tokens.color.border.default }}
                  className="flex-row items-center justify-center rounded-2xl border border-dashed p-3 mt-1"
                >
                  <Ionicons name="search" size={15} color={tokens.color.primary[600]} />
                  <Text
                    style={{ color: tokens.color.primary[600] }}
                    className="text-xs font-bold ml-1.5"
                  >
                    Search all communities
                  </Text>
                </TouchableOpacity>

                {suggestionRefs.length === 0 && !suggestions.isLoading ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-semibold leading-relaxed mt-2"
                  >
                    We have no suggestions for you yet. Search for a community, or skip and browse
                    later.
                  </Text>
                ) : null}
              </>
            )}
          </StepBody>
        ) : null}

        {step === 'interested' ? (
          <StepBody
            title="Communities you want to hear about"
            body="Following a community is not the same as joining it. You will see its content and updates without saying you belong."
            icon="bookmarks-outline"
          >
            {interested.map((id) => {
              const ref = communityById(id);
              if (!ref) return null;
              return (
                <CommunityRow
                  key={id}
                  community={ref}
                  isSelected
                  onPress={() => setInterested((prev) => prev.filter((existing) => existing !== id))}
                />
              );
            })}

            {suggestionRefs
              .filter(
                (entry) =>
                  entry.community.id !== primaryChoice && !interested.includes(entry.community.id)
              )
              .slice(0, 4)
              .map((entry) => (
                <CommunityRow
                  key={entry.community.id}
                  community={entry.community}
                  reason={entry.reason}
                  onPress={() => setInterested((prev) => [...prev, entry.community.id])}
                />
              ))}

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Search for more communities to follow"
              onPress={() => setPickerFor('interested')}
              activeOpacity={0.8}
              style={{ borderColor: tokens.color.border.default }}
              className="flex-row items-center justify-center rounded-2xl border border-dashed p-3 mt-1"
            >
              <Ionicons name="add" size={15} color={tokens.color.primary[600]} />
              <Text
                style={{ color: tokens.color.primary[600] }}
                className="text-xs font-bold ml-1.5"
              >
                Add another
              </Text>
            </TouchableOpacity>
          </StepBody>
        ) : null}

        {step === 'preferences' ? (
          <StepBody
            title="What others can see"
            body="Your communities can say a lot about you. Nothing below is shared unless you switch it on."
            icon="eye-off-outline"
          >
            <PreferenceSwitch
              label="Show my main community on my profile"
              hint="Other members would see which community you belong to."
              value={draftPreferences.showPrimaryCommunityOnProfile}
              onChange={(next) =>
                setDraftPreferences((prev) => ({ ...prev, showPrimaryCommunityOnProfile: next }))
              }
            />
            <PreferenceSwitch
              label="Show communities I follow"
              hint="Other members would see the communities you are interested in."
              value={draftPreferences.showInterestedCommunitiesOnProfile}
              onChange={(next) =>
                setDraftPreferences((prev) => ({
                  ...prev,
                  showInterestedCommunitiesOnProfile: next,
                }))
              }
            />
            <PreferenceSwitch
              label="Look across several communities by default"
              hint="Discovery reaches beyond the community you are currently in."
              value={draftPreferences.crossCommunityDiscoveryEnabled}
              onChange={(next) =>
                setDraftPreferences((prev) => ({ ...prev, crossCommunityDiscoveryEnabled: next }))
              }
            />
          </StepBody>
        ) : null}

        {step === 'notifications' ? (
          <StepBody
            title="What you want to be told about"
            body="You can set this in detail later. For now, choose how wide you want notifications to reach."
            icon="notifications-outline"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold leading-relaxed mb-3"
            >
              These sit on top of your existing notification settings — the channels, quiet hours and
              digest you have already chosen still apply.
            </Text>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Open detailed community notification settings"
              onPress={() => router.push('/community/settings')}
              activeOpacity={0.8}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="flex-row items-center rounded-2xl border p-3"
            >
              <Ionicons name="options-outline" size={17} color={tokens.color.text.secondary} />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-bold ml-3 flex-1"
              >
                Set these in detail
              </Text>
              <Ionicons name="chevron-forward" size={15} color={tokens.color.text.placeholder} />
            </TouchableOpacity>
          </StepBody>
        ) : null}

        {step === 'done' ? (
          <StepBody
            title="That’s it"
            body={
              primaryChoice
                ? 'Your home feed and suggestions will lean towards your main community. You can switch community from any screen, and change all of this in settings.'
                : 'You have not chosen a community, which is fine — you will see everything. You can pick one whenever you like.'
            }
            icon="checkmark-circle-outline"
          >
            <View
              style={{ backgroundColor: tokens.color.neutral[100] }}
              className="rounded-2xl p-3"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold leading-relaxed"
              >
                {primaryChoice
                  ? `Main community: ${communityById(primaryChoice)?.name ?? '—'}`
                  : 'Main community: none'}
                {interested.length > 0
                  ? `\nFollowing: ${interested
                      .map((id) => communityById(id)?.name)
                      .filter(Boolean)
                      .join(', ')}`
                  : ''}
              </Text>
            </View>
          </StepBody>
        ) : null}
      </ScrollEndScrollView>

      {/* Footer */}
      <View
        style={{ borderColor: tokens.color.border.default }}
        className="px-4 py-3 border-t"
      >
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={step === 'done' ? 'Finish and go to the app' : 'Continue'}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={step === 'done' ? () => void finish() : advance}
          activeOpacity={0.85}
          style={{ backgroundColor: tokens.color.primary[500], opacity: busy ? 0.6 : 1 }}
          className="rounded-2xl py-3.5 items-center"
          testID="community-onboarding-continue"
        >
          {busy ? (
            <ActivityIndicator color={tokens.color.text.inverse} />
          ) : (
            <Text style={{ color: tokens.color.text.inverse }} className="text-sm font-black">
              {step === 'done' ? 'Finish' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <CommunitySelectorSheet
        visible={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        title={pickerFor === 'primary' ? 'Choose your main community' : 'Follow a community'}
        onSelect={(community) => {
          if (pickerFor === 'primary') setPrimaryChoice(community.id);
          else setInterested((prev) => (prev.includes(community.id) ? prev : [...prev, community.id]));
          setPickerFor(null);
        }}
        selectedIds={pickerFor === 'primary' ? (primaryChoice ? [primaryChoice] : []) : interested}
      />
    </SafeAreaView>
  );
}

function StepBody({
  title,
  body,
  icon,
  children,
}: {
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  children?: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View>
      <View
        style={{ backgroundColor: tokens.color.primary[50] }}
        className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
      >
        <Ionicons name={icon} size={24} color={tokens.color.primary[600]} />
      </View>

      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.primary }}
        className="text-xl font-black"
      >
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed mt-2 mb-5"
      >
        {body}
      </Text>

      {children}
    </View>
  );
}

function PreferenceSwitch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="flex-row items-center rounded-2xl border p-3 mb-2"
    >
      <View className="flex-1 pr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold leading-relaxed mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Switch
        accessible
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}
