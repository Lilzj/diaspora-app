// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community settings (Frontend Phase 13, §40, §41)
//
// Two halves on one screen, because they are one decision from a member's point of
// view: what my communities cause me to be told about, and what my communities tell
// other people about me.
//
// ── §40: notification preferences, as an overlay ─────────────────────────────
//
// §26 and §40 both forbid a second notification system. So this screen does **not**
// re-declare categories, channels, quiet hours or digests — all of those belong to
// B13 and are edited on the existing `settings/notifications` screen, which this one
// links to. What it adds is one field per category: *which communities* it applies
// to. That is the whole of Phase 13's contribution to notifications, and it is
// registered as GAP-012.
//
// The category list comes from B13's own vocabulary rather than from a Phase 13
// constant, so a category the platform adds appears here without a code change.
//
// ── §41: privacy, off by default ─────────────────────────────────────────────
//
// Every visibility switch starts off. `defaultCommunityPreferences()` encodes that,
// and `readCommunityPreferences()` merges partial records over it, so a missing
// field can never read as consent. A member who never opens this screen has
// published nothing about their communities.
//
// The reason is in the register at GAP-021: a diaspora community can imply
// nationality, immigration situation, religion or ethnicity. In some countries any
// one of those is dangerous to publish, and a default of "on" would publish it for
// everybody who never looked.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  CommunityNotificationScope,
  CommunityPreferences,
} from '@/types/community-directory';
import { defaultCommunityPreferences } from '@/types/community-directory';
import {
  useCommunityContext,
  useCommunityPreferences,
  useSaveCommunityPreferences,
} from '@/hooks/communities';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useBottomInset } from '@/components/layout/bottom-inset';
import {
  CommunityRow,
  CommunityUnavailablePanel,
  MembershipStatePill,
  MultiCommunityGapNotice,
} from '@/components/community-directory';
import { backOr } from '@/lib/navigation';

/**
 * The categories this overlay applies to.
 *
 * Keyed on **B13's** category keys, which is what makes this an overlay rather than
 * a parallel system. The labels are Phase 13's UI strings; the keys are not.
 */
const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: 'events', label: 'Events', hint: 'Gatherings, seminars, meet-ups' },
  { key: 'jobs', label: 'Jobs', hint: 'Openings and employer posts' },
  { key: 'housing', label: 'Housing', hint: 'Rooms, flats and host listings' },
  { key: 'marketplace', label: 'Marketplace', hint: 'Items for sale, swaps and giveaways' },
  { key: 'guides', label: 'Guides', hint: 'New and updated guides' },
  { key: 'updates', label: 'Community updates', hint: 'Local reports and alerts' },
  { key: 'organizations', label: 'Organisations', hint: 'Posts from groups you follow' },
  { key: 'providers', label: 'Service providers', hint: 'New and recommended providers' },
];

const SCOPES: { value: CommunityNotificationScope; label: string; hint: string }[] = [
  { value: 'primary-only', label: 'Main only', hint: 'Only my main community' },
  { value: 'my-communities', label: 'Mine', hint: 'Communities I have joined or follow' },
  {
    value: 'interested-included',
    label: 'Mine + following',
    hint: 'Also the communities I am interested in',
  },
  { value: 'all-communities', label: 'Everywhere', hint: 'Any community on Diaspora' },
  { value: 'none', label: 'None', hint: 'Nothing from this category' },
];

/** The default when a category has never been set. The least surprising one. */
const DEFAULT_SCOPE: CommunityNotificationScope = 'my-communities';

export default function CommunitySettingsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const context = useCommunityContext();
  const preferences = useCommunityPreferences();
  const save = useSaveCommunityPreferences();

  const [draft, setDraft] = useState<CommunityPreferences>(
    () => preferences.data ?? defaultCommunityPreferences()
  );
  const [dirty, setDirty] = useState(false);

  React.useEffect(() => {
    if (preferences.data && !dirty) setDraft(preferences.data);
  }, [dirty, preferences.data]);

  const scopeFor = (categoryKey: string): CommunityNotificationScope =>
    draft.notifications.find((entry) => entry.categoryKey === categoryKey)?.scope ?? DEFAULT_SCOPE;

  const setScope = (categoryKey: string, scope: CommunityNotificationScope) => {
    setDirty(true);
    setDraft((prev) => {
      const others = prev.notifications.filter((entry) => entry.categoryKey !== categoryKey);
      return { ...prev, notifications: [...others, { categoryKey, scope }] };
    });
    trackCommunityEvent('community.notification_preferences.updated', {
      notificationScope: scope,
    });
  };

  const setFlag = (key: keyof CommunityPreferences, value: boolean) => {
    setDirty(true);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const myCommunities = useMemo(() => {
    const wanted = new Set([...context.myCommunityIds, ...context.interestedCommunityIds]);
    return context.availableCommunities.filter((ref) => wanted.has(ref.id));
  }, [context.availableCommunities, context.interestedCommunityIds, context.myCommunityIds]);

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
          className="text-lg font-black ml-2 flex-1"
        >
          Community settings
        </Text>
      </View>

      <ScrollEndScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}>
        {/* My communities */}
        <SectionCard
          title="My communities"
          hint="What you belong to, follow and are interested in."
        >
          {context.isLoading ? (
            <ActivityIndicator color={tokens.color.primary[500]} />
          ) : context.hasNoCommunities ? (
            <View>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-semibold leading-relaxed mb-3"
              >
                You have not chosen any communities yet. You do not have to — everything is
                browsable without one.
              </Text>
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Choose communities"
                onPress={() => router.push('/community/onboarding')}
                activeOpacity={0.85}
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="rounded-2xl py-2.5 items-center"
              >
                <Text style={{ color: tokens.color.text.inverse }} className="text-xs font-black">
                  Choose communities
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {myCommunities.map((ref) => {
                const membership = context.membershipSet.memberships.find(
                  (m) => m.communityId === ref.id
                );
                return (
                  <CommunityRow
                    key={ref.id}
                    community={ref}
                    membershipState={membership?.state ?? 'None'}
                    isPrimary={context.primaryMembership?.communityId === ref.id}
                    onPress={() => router.push(`/community/${ref.slug}`)}
                    trailing={
                      membership ? (
                        <View className="items-end">
                          <MembershipStatePill state={membership.state} size="xs" />
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[8px] font-bold mt-1"
                          >
                            {membership.visibility === 'Public'
                              ? 'Visible to all'
                              : membership.visibility === 'CommunityOnly'
                                ? 'Community only'
                                : 'Private'}
                          </Text>
                        </View>
                      ) : undefined
                    }
                  />
                );
              })}

              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Find more communities"
                onPress={() => router.push('/community')}
                activeOpacity={0.8}
                style={{ borderColor: tokens.color.border.default }}
                className="flex-row items-center justify-center rounded-2xl border border-dashed p-2.5 mt-1"
              >
                <Ionicons name="search" size={14} color={tokens.color.primary[600]} />
                <Text
                  style={{ color: tokens.color.primary[600] }}
                  className="text-[11px] font-bold ml-1.5"
                >
                  Find more communities
                </Text>
              </TouchableOpacity>
            </>
          )}
        </SectionCard>

        {/* §41 privacy */}
        <SectionCard
          title="What others can see"
          hint="Your communities can imply a lot about you. Everything here is off unless you turn it on."
        >
          <PrivacySwitch
            label="Show my main community on my profile"
            hint="Other members would see which community you belong to."
            value={draft.showPrimaryCommunityOnProfile}
            onChange={(next) => setFlag('showPrimaryCommunityOnProfile', next)}
          />
          <PrivacySwitch
            label="Show communities I follow"
            hint="Other members would see which communities you are interested in."
            value={draft.showInterestedCommunitiesOnProfile}
            onChange={(next) => setFlag('showInterestedCommunitiesOnProfile', next)}
          />
          <PrivacySwitch
            label="Show my moderator or ambassador roles"
            hint="Only applies where you hold a role. Your name would appear in that community’s directory."
            value={draft.showCommunityRolesOnProfile}
            onChange={(next) => setFlag('showCommunityRolesOnProfile', next)}
          />

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Open your full privacy settings"
            onPress={() => router.push('/profile/privacy-settings')}
            activeOpacity={0.8}
            className="flex-row items-center justify-center py-2.5 mt-1"
          >
            <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
              All privacy settings
            </Text>
            <Ionicons name="chevron-forward" size={13} color={tokens.color.primary[600]} />
          </TouchableOpacity>
        </SectionCard>

        {/* Discovery */}
        <SectionCard title="Discovery" hint="How far Diaspora looks when it shows you things.">
          <PrivacySwitch
            label="Look across several communities by default"
            hint="Discovery can reach beyond the community you are currently in."
            value={draft.crossCommunityDiscoveryEnabled}
            onChange={(next) => setFlag('crossCommunityDiscoveryEnabled', next)}
          />
        </SectionCard>

        {/* §40 notification overlay */}
        <SectionCard
          title="Notifications by community"
          hint="Which communities each kind of notification covers. Your channels, quiet hours and digest are set separately."
        >
          {preferences.isSimulated ? (
            <View className="mb-3">
              <MultiCommunityGapNotice gapKey="communityNotificationPreferences" compact />
            </View>
          ) : null}

          {CATEGORIES.map((category) => {
            const current = scopeFor(category.key);

            return (
              <View
                key={category.key}
                style={{ borderColor: tokens.color.border.default }}
                className="border-b py-3"
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                  {category.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-semibold mt-0.5 mb-2"
                >
                  {category.hint}
                </Text>

                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`Which communities ${category.label} notifications cover`}
                  className="flex-row flex-wrap"
                >
                  {SCOPES.map((scope) => {
                    const isActive = current === scope.value;

                    return (
                      <TouchableOpacity
                        key={scope.value}
                        accessible
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isActive, checked: isActive }}
                        accessibilityLabel={`${category.label}: ${scope.label}. ${scope.hint}.`}
                        onPress={() => setScope(category.key, scope.value)}
                        activeOpacity={0.7}
                        style={{
                          backgroundColor: isActive
                            ? tokens.color.primary[500]
                            : tokens.color.neutral[100],
                        }}
                        className="rounded-full px-2.5 py-1 mr-1.5 mb-1.5"
                      >
                        <Text
                          style={{
                            color: isActive
                              ? tokens.color.text.inverse
                              : tokens.color.text.secondary,
                          }}
                          className="text-[10px] font-bold"
                        >
                          {scope.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* §40's "primary only" with no primary would mean "nothing", and
                    saying so is better than silently delivering none. */}
                {current === 'primary-only' && !context.primaryMembership ? (
                  <Text
                    style={{ color: tokens.color.warning.default }}
                    className="text-[10px] font-bold mt-1"
                  >
                    You have no main community set, so this currently means no notifications.
                  </Text>
                ) : null}
              </View>
            );
          })}

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Open your notification channels, quiet hours and digest settings"
            onPress={() => router.push('/settings/notifications')}
            activeOpacity={0.8}
            className="flex-row items-center justify-center py-3 mt-1"
          >
            <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
              Channels, quiet hours and digest
            </Text>
            <Ionicons name="chevron-forward" size={13} color={tokens.color.primary[600]} />
          </TouchableOpacity>
        </SectionCard>

        {preferences.unavailable === 'feature-disabled' ? (
          <CommunityUnavailablePanel
            reason="feature-disabled"
            subject="Community settings"
            gapKey="communityPreferencesPersistence"
            compact
          />
        ) : null}
      </ScrollEndScrollView>

      {/* Save */}
      {dirty ? (
        <View style={{ borderColor: tokens.color.border.default }} className="px-4 py-3 border-t">
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Save community settings"
            accessibilityState={{ busy: save.isPending, disabled: save.isPending }}
            disabled={save.isPending}
            onPress={() =>
              save.mutate(draft, {
                onSuccess: () => setDirty(false),
              })
            }
            activeOpacity={0.85}
            style={{ backgroundColor: tokens.color.primary[500], opacity: save.isPending ? 0.6 : 1 }}
            className="rounded-2xl py-3.5 items-center"
            testID="community-settings-save"
          >
            {save.isPending ? (
              <ActivityIndicator color={tokens.color.text.inverse} />
            ) : (
              <Text style={{ color: tokens.color.text.inverse }} className="text-sm font-black">
                Save
              </Text>
            )}
          </TouchableOpacity>

          {save.isError ? (
            <Text
              accessibilityRole="alert"
              style={{ color: tokens.color.error.default }}
              className="text-[11px] font-bold mt-2 text-center"
            >
              Those settings were not saved. Nothing has changed.
            </Text>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mb-5">
      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black"
      >
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold leading-relaxed mt-0.5 mb-3"
      >
        {hint}
      </Text>
      {children}
    </View>
  );
}

function PrivacySwitch({
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
