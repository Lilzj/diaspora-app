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
import { BadgeShelf, BadgeSheet } from '@/components/creator/BadgeShelf';
import { useNotification } from '@/providers/notification-provider';
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
  useUpdateCreatorProfile,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatCount, presentCreatorStatus } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorRequirement } from '@/types/creator-economy';

const BIO_LIMIT = 600;

export default function CreatorProfileScreen() {
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const profileQuery = useCreatorProfile();
  const update = useUpdateCreatorProfile();
  const access = useCreatorAccess();

  const profile = profileQuery.data;

  const [bio, setBio] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isBadgesOpen, setBadgesOpen] = useState(false);
  const [isDirty, setDirty] = useState(false);

  // Seed the form once the profile arrives, and only once — re-seeding on every
  // refetch would throw away what somebody was in the middle of typing.
  useEffect(() => {
    if (!profile || isDirty) return;
    setBio(profile.bio ?? '');
    setDisplayName(profile.displayName);
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
      // `isDiscoverable` is carried through unchanged: the switch that set it
      // moved to Settings → Privacy, and omitting the field here would have
      // this save quietly reset it.
      { bio: bio.trim(), displayName: displayName.trim(), isDiscoverable: profile?.isDiscoverable ?? true },
      {
        onSuccess: () => {
          setDirty(false);
          trackCreatorEvent('creator.profile.updated');
        },
      }
    );
  }, [bio, displayName, profile?.isDiscoverable, update]);

  // Diaspora has no avatar upload yet. Saying so beats a control that opens a
  // picker and then drops the result on the floor — see the gap register.
  const onChangePhoto = useCallback(() => {
    showAlert({
      type: 'info',
      title: 'Photos are not stored yet',
      message:
        'Diaspora cannot upload a profile photo in this build. Your initial is shown instead, and your photo will appear here once that is ready.',
    });
  }, [showAlert]);

  const openRequirement = useCallback((requirement: CreatorRequirement) => {
    if (requirement.actionRoute) router.push(requirement.actionRoute as never);
  }, []);

  // The catalogue, not `reputation.badges`.
  //
  // This screen used to read the reputation adapter's six badges and render
  // "4 earned, 2 to go", while Creator Studio's Overview showed twelve from a
  // different list. Two counts for one thing, and neither a subset of the
  // other — the six were creator-reputation tiers, the twelve were about using
  // the whole app.
  //
  // `config/badges.ts` is now the single catalogue and both screens read it.
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change your profile photo"
                accessibilityHint="Diaspora cannot store photos yet"
                onPress={onChangePhoto}
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="w-14 h-14 rounded-full items-center justify-center mr-3.5"
              >
                <Text className="text-white text-xl font-black">
                  {(displayName || profile.displayName).charAt(0).toUpperCase()}
                </Text>
                <View
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                  }}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border items-center justify-center"
                >
                  <Ionicons name="camera-outline" size={11} color={tokens.color.text.secondary} />
                </View>
              </Pressable>

              <View className="flex-1">
                {/*
                  Editable in place. This was a read-only name with a "Name,
                  photo and contact" row further down the page that opened
                  `/edit-profile` — a separate screen to change one field that
                  was already on screen, with a Save button that only navigated
                  back. The field is here; the page is gone.
                */}
                <TextInput
                  accessibilityLabel="Your display name"
                  value={displayName}
                  onChangeText={(next) => {
                    setDisplayName(next);
                    setDirty(true);
                  }}
                  placeholder="Your name"
                  placeholderTextColor={tokens.color.text.disabled}
                  style={{ color: tokens.color.text.primary, paddingVertical: 0 }}
                  className="text-base font-black tracking-tight"
                  numberOfLines={1}
                />
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

            {/*
              The phone number, read-only — as it was on `/edit-profile`. It is
              the account's verified identifier and changing it is a
              verification flow, not a text field, so it is shown rather than
              edited. Kept because a member looking for "my contact details"
              should find them here now that the screen holding them is gone.
            */}
            {user?.phone ? (
              <View
                style={{ borderTopColor: tokens.color.border.default }}
                className="flex-row items-center justify-between border-t mt-4 pt-4"
              >
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-bold"
                >
                  Phone
                </Text>
                <View className="flex-row items-center">
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[12px] font-bold mr-1.5"
                  >
                    {user.phone}
                  </Text>
                  <Ionicons
                    name="lock-closed-outline"
                    size={12}
                    color={tokens.color.text.disabled}
                  />
                </View>
              </View>
            ) : null}

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
          {/*
            The same shelf Creator Studio renders, and the same sheet behind its
            "View all". This screen used to wrap every badge into a grid, which
            was fine at six and a wall at thirty-two — and it had no sheet, so
            the descriptions and progress figures were nowhere on this screen at
            all. Two presentations of one list, only one of which scaled.
          */}
          <BadgeShelf title="🎖️ Badges" onViewAll={() => setBadgesOpen(true)} />

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

          {/*
            Two sections stood here.

            **Privacy — "Appear in the creator directory".** A single switch, on
            a page about presenting yourself, duplicating the visibility
            controls in Settings → Privacy. A member deciding who can see them
            should find every such decision in one place rather than one of them
            on the page they happened to be editing.

            **Managed elsewhere** — three links out. "Name, photo and contact"
            opened `/edit-profile`, a stub whose Save only navigated back; those
            fields are editable in the identity card above now. "Identity and
            verification" pointed at the Trust Centre, which is already one tap
            from Profile. "Privacy settings" was the third door into the screen
            Settings now owns.

            A section whose entire content is links to other screens is a
            navigation failure being papered over. Removing it is the fix.
          */}
        </View>
      ) : null}

      <BadgeSheet visible={isBadgesOpen} onClose={() => setBadgesOpen(false)} />
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
