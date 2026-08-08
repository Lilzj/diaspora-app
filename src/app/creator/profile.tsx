// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator profile management (Frontend Phase 7, §6)
//
// The creator-facing view of a creator profile: what the member can change,
// what the platform decided, and what the public sees.
//
// §6 ends with "Do not expose private information. Respect identity and trust
// visibility rules." The way that is enforced here is structural rather than
// careful: this screen renders `CreatorProfile`, which is the private
// projection; the directory and the public profile render `PublicCreator`,
// which is a *different type* with the audience internals and the completeness
// score absent. A component holding a `PublicCreator` cannot print a private
// field because the field is not there to print.
//
// The discoverability toggle is the one control here with a privacy
// consequence, so it says what it does in full rather than being a switch with
// a two-word label.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorProgressBar,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  EducationBadge,
  RequirementList,
} from '@/components/creator-economy';
import {
  useCreatorAccess,
  useCreatorProfile,
  useCreatorReputation,
  useUpdateCreatorProfile,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatCount, presentCreatorStatus } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorRequirement } from '@/types/creator-economy';

const BIO_LIMIT = 600;

export default function CreatorProfileScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const profileQuery = useCreatorProfile();
  const reputationQuery = useCreatorReputation();
  const update = useUpdateCreatorProfile();
  const access = useCreatorAccess();

  const profile = profileQuery.data;

  const [bio, setBio] = useState('');
  const [isDiscoverable, setDiscoverable] = useState(true);
  const [isDirty, setDirty] = useState(false);

  // Seed the form once the profile arrives, and only once — re-seeding on every
  // refetch would throw away what somebody was in the middle of typing.
  useEffect(() => {
    if (!profile || isDirty) return;
    setBio(profile.bio ?? '');
    setDiscoverable(profile.isDiscoverable);
  }, [profile, isDirty]);

  useEffect(() => {
    trackCreatorEvent('creator.profile.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ManageProfile, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const save = useCallback(() => {
    update.mutate(
      { bio: bio.trim(), isDiscoverable },
      {
        onSuccess: () => {
          setDirty(false);
          trackCreatorEvent('creator.profile.updated');
        },
      }
    );
  }, [bio, isDiscoverable, update]);

  const openRequirement = useCallback((requirement: CreatorRequirement) => {
    if (requirement.actionRoute) router.push(requirement.actionRoute as never);
  }, []);

  const badges = reputationQuery.reputation?.badges ?? [];
  const earnedBadges = useMemo(() => badges.filter((badge) => badge.isEarned), [badges]);
  const lockedBadges = useMemo(() => badges.filter((badge) => !badge.isEarned), [badges]);

  const bioRemaining = BIO_LIMIT - bio.length;

  return (
    <CreatorScreen
      title="Creator profile"
      subtitle="What the community sees, and what you are working toward"
      gapKey="profile"
      isEnabled={profileQuery.isEnabled}
      refusal={refusal}
      isLoading={profileQuery.isLoading}
      error={profileQuery.error}
      onRetry={profileQuery.refetch}
      footer={
        isDirty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save your creator profile"
            accessibilityState={{ busy: update.isPending }}
            disabled={update.isPending}
            onPress={save}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {profile ? (
        <View className="px-5 pt-5">
          {/* ── Identity ─────────────────────────────────────────────────── */}
          <CreatorCard style={{ marginBottom: 20 }}>
            <View className="flex-row items-center">
              <View
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="w-14 h-14 rounded-full items-center justify-center mr-3.5"
              >
                <Text className="text-white text-xl font-black">
                  {profile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>

              <View className="flex-1">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-base font-black tracking-tight"
                  numberOfLines={1}
                >
                  {profile.displayName}
                </Text>
                {profile.handle ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-bold"
                  >
                    @{profile.handle}
                  </Text>
                ) : null}
                <View className="mt-1.5">
                  <CreatorStatusChip presentation={presentCreatorStatus(profile.status)} size="small" />
                </View>
              </View>
            </View>

            <View
              style={{ borderTopColor: tokens.color.border.default }}
              className="flex-row border-t mt-4 pt-4"
            >
              <AudienceFigure label="Followers" value={formatCount(profile.audience.followers)} />
              <AudienceFigure label="Published" value={String(profile.audience.totalContentPublished)} />
              <AudienceFigure label="Reach" value={formatCount(profile.audience.reach)} />
              <AudienceFigure label="Helpful" value={formatCount(profile.audience.totalHelpfulVotes)} />
            </View>
          </CreatorCard>

          {/* ── Completeness ─────────────────────────────────────────────── */}
          <CreatorSection
            title="Profile completeness"
            subtitle="Diaspora works this out — the app does not guess it"
          >
            <CreatorCard>
              <CreatorProgressBar
                progress={{
                  current: profile.completeness.percentage,
                  target: 100,
                  percentage: profile.completeness.percentage,
                  unit: '%',
                }}
                subject="Profile completeness"
                tone={profile.completeness.percentage >= 90 ? 'success' : 'brand'}
                showFigures={false}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black mt-2.5"
              >
                {profile.completeness.percentage}% complete
              </Text>

              {profile.completeness.missing.length > 0 ? (
                <View className="mt-2">
                  <RequirementList
                    requirements={profile.completeness.missing}
                    onAction={openRequirement}
                  />
                </View>
              ) : (
                <Text
                  style={{ color: tokens.color.success.default }}
                  className="text-[11px] font-bold mt-2"
                >
                  Nothing left to add.
                </Text>
              )}
            </CreatorCard>
          </CreatorSection>

          {/* ── Bio ──────────────────────────────────────────────────────── */}
          <CreatorSection
            title="About you"
            subtitle="Shown on your public profile and next to your guides"
          >
            <CreatorCard>
              <TextInput
                accessibilityLabel="Your creator bio"
                accessibilityHint={`Up to ${BIO_LIMIT} characters. ${bioRemaining} remaining.`}
                value={bio}
                onChangeText={(next) => {
                  setBio(next);
                  setDirty(true);
                }}
                multiline
                maxLength={BIO_LIMIT}
                placeholder="What do you write about, and why should somebody trust you on it?"
                placeholderTextColor={tokens.color.text.disabled}
                style={{ color: tokens.color.text.primary, minHeight: 110 }}
                className="text-sm font-medium leading-6"
                textAlignVertical="top"
              />
              <Text
                style={{
                  color: bioRemaining < 40 ? tokens.color.warning.default : tokens.color.text.placeholder,
                }}
                className="text-[10px] font-bold text-right mt-2"
              >
                {bioRemaining} left
              </Text>
            </CreatorCard>
          </CreatorSection>

          {/* ── Expertise ────────────────────────────────────────────────── */}
          <CreatorSection
            title="What you help with"
            subtitle="Diaspora uses these to put your work in front of the right people"
          >
            <CreatorCard>
              <TagRow label="Areas" values={profile.categories} emptyHint="No areas chosen yet" />
              <TagRow label="Expertise" values={profile.expertise} emptyHint="No expertise added yet" />
              <TagRow label="Languages" values={profile.languages} emptyHint="No languages added yet" isLast />
            </CreatorCard>
          </CreatorSection>

          {/* ── Badges ───────────────────────────────────────────────────── */}
          {badges.length > 0 ? (
            <CreatorSection
              title="Badges"
              subtitle={`${earnedBadges.length} earned, ${lockedBadges.length} to go`}
            >
              <View className="flex-row flex-wrap">
                {[...earnedBadges, ...lockedBadges].map((badge) => (
                  <View key={badge.badgeId} className="mb-2.5">
                    <EducationBadge
                      label={badge.label}
                      icon={badge.icon ?? '🎖️'}
                      isEarned={badge.isEarned}
                    />
                  </View>
                ))}
              </View>
            </CreatorSection>
          ) : null}

          {/* ── Next status ──────────────────────────────────────────────── */}
          {profile.nextStatus ? (
            <CreatorSection
              title={`Toward ${profile.nextStatus.label}`}
              subtitle="Diaspora decides when you get there — these are its requirements, not the app's"
            >
              <CreatorCard>
                <RequirementList
                  requirements={profile.nextStatus.requirements}
                  onAction={openRequirement}
                />
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Discoverability ──────────────────────────────────────────── */}
          <CreatorSection title="Privacy">
            <CreatorCard>
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-4">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-bold"
                  >
                    Appear in the creator directory
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-medium mt-1 leading-relaxed"
                  >
                    When this is on, people can find you by name, country and what you write about,
                    and see your public profile. Your published work stays visible either way — this
                    only controls whether *you* are listed.
                  </Text>
                </View>

                <Switch
                  accessibilityLabel="Appear in the creator directory"
                  accessibilityHint="When on, people can find your creator profile by searching"
                  value={isDiscoverable}
                  onValueChange={(next) => {
                    setDiscoverable(next);
                    setDirty(true);
                  }}
                  trackColor={{ false: tokens.color.neutral[300], true: tokens.color.primary[500] }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </CreatorCard>
          </CreatorSection>

          {/* ── Elsewhere ────────────────────────────────────────────────── */}
          <CreatorSection title="Managed elsewhere">
            <CreatorCard padded={false}>
              <LinkRow
                icon="person-outline"
                label="Name, photo and contact"
                hint="Your account profile"
                onPress={() => router.push('/edit-profile')}
              />
              <LinkRow
                icon="shield-checkmark-outline"
                label="Identity and verification"
                hint="Trust Centre — Diaspora is authoritative here"
                onPress={() => router.push('/profile/trust-center')}
              />
              <LinkRow
                icon="lock-closed-outline"
                label="Privacy settings"
                hint="What the rest of the platform shows about you"
                onPress={() => router.push('/profile/privacy-settings')}
                isLast
              />
            </CreatorCard>
          </CreatorSection>
        </View>
      ) : null}
    </CreatorScreen>
  );
}

function AudienceFigure({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-1" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-black uppercase tracking-widest mb-1"
      >
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
        className="text-sm font-black"
      >
        {value}
      </Text>
    </View>
  );
}

function TagRow({
  label,
  values,
  emptyHint,
  isLast = false,
}: {
  label: string;
  values: string[];
  emptyHint: string;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ borderBottomColor: tokens.color.border.default }}
      className={isLast ? 'py-3' : 'border-b py-3'}
      accessible
      accessibilityLabel={`${label}: ${values.length > 0 ? values.join(', ') : emptyHint}`}
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest mb-2"
      >
        {label}
      </Text>

      {values.length === 0 ? (
        <Text style={{ color: tokens.color.text.disabled }} className="text-[11px] font-semibold">
          {emptyHint}
        </Text>
      ) : (
        <View className="flex-row flex-wrap">
          {values.map((value) => (
            <View
              key={value}
              style={{ backgroundColor: tokens.color.surface.elevated }}
              className="rounded-full px-2.5 py-1 mr-1.5 mb-1.5"
            >
              <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
                {value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
      onPress={onPress}
      style={{
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      <View className="flex-1 mx-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
