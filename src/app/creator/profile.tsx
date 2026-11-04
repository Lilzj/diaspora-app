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

import { TagEditor } from '@/components/forms/TagEditor';
import { usePhotoSource, type PhotoSource } from '@/hooks/photo-source';
import { Image } from 'expo-image';
import { useMediaUpload, toLocalFile } from '@/hooks/media';
import { setProfileAvatar } from '@/lib/auth-api';
import { setCreatorCover } from '@/lib/creator/certified-client';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { useGuideCategories } from '@/hooks/guides';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import { BadgeShelf, BadgeSheet } from '@/components/creator/BadgeShelf';
import { MyReputationPanel } from '@/components/creator/ReputationPanel';
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
import { profileFieldFor, requirementRoute, type ProfileField } from '@/lib/creator/profile-fields';

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
  // The three lists the server keeps and this screen only displayed (20 Oct 2026).
  const [categories, setCategories] = useState<string[]>([]);
  const [expertise, setExpertise] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const { selectable: guideCategories } = useGuideCategories();
  const scrollRef = useRef<ScrollView>(null);
  // The fields the completeness requirements name, measured against the scroll
  // content when an Edit profile button is pressed (Android UAT, 3 Nov 2026).
  // `onLayout` gave each anchor's y within its own section, so every button
  // scrolled to about the same place near the top and opened nothing.
  const fieldAnchors = useRef<Partial<Record<ProfileField, View | null>>>({});
  const bioInput = useRef<TextInput>(null);
  const expertiseInput = useRef<TextInput>(null);
  const languagesInput = useRef<TextInput>(null);
  const [areasOpenRequest, setAreasOpenRequest] = useState(0);
  const [isBadgesOpen, setBadgesOpen] = useState(false);
  const [isDirty, setDirty] = useState(false);

  // Seed the form once the profile arrives, and only once — re-seeding on every
  // refetch would throw away what somebody was in the middle of typing.
  useEffect(() => {
    if (!profile || isDirty) return;
    setBio(profile.bio ?? '');
    setDisplayName(profile.displayName);
    setCategories(profile.categories ?? []);
    setExpertise(profile.expertise ?? []);
    setLanguages(profile.languages ?? []);
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
      {
        bio: bio.trim(),
        displayName: displayName.trim(),
        categories,
        expertise,
        languages,
        isDiscoverable: profile?.isDiscoverable ?? true,
      },
      {
        onSuccess: () => {
          setDirty(false);
          trackCreatorEvent('creator.profile.updated');
        },
      }
    );
  }, [bio, displayName, categories, expertise, languages, profile?.isDiscoverable, update]);

  // Photo and cover, real since 20 Oct 2026: the picked image is uploaded
  // (`POST /media/uploads/direct`), then set (`PUT /auth/profile/avatar`,
  // `PUT /creators/me/cover`). It said "Photos are not stored yet".
  const avatarUpload = useMediaUpload({ kind: 'image' });
  const coverUpload = useMediaUpload({ kind: 'image' });
  const [imageBusy, setImageBusy] = useState<'avatar' | 'cover' | null>(null);
  // The new photo, shown at once: the creator profile catches up when its event lands.
  const [freshAvatar, setFreshAvatar] = useState<string | null>(null);

  // Camera or gallery, asked (Android UAT, 3 Nov 2026). A profile photo is
  // usually of the member, so its camera faces them; a cover faces away.
  const photoSource = usePhotoSource();

  const setFrom = useCallback(
    async (which: 'avatar' | 'cover', source: PhotoSource) => {
      const picked = await photoSource.launch(source, {
        allowsEditing: true,
        aspect: which === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.8,
        cameraType: which === 'avatar' ? 'front' : 'back',
      });
      if (!picked?.[0]) return;

      setImageBusy(which);
      try {
        const asset = await (which === 'avatar' ? avatarUpload : coverUpload).upload(toLocalFile(picked[0]));
        if (!asset) {
          showAlert({ type: 'error', title: 'Not uploaded', message: 'The photo could not be uploaded. Please try again.' });
          return;
        }
        if (which === 'avatar') {
          const saved = await setProfileAvatar(asset.mediaId);
          setFreshAvatar(saved.avatarUrl);
          void useAuthStore.getState().syncAccess();
        } else {
          await setCreatorCover(asset.mediaId);
        }
        await profileQuery.refetch();
      } catch {
        showAlert({ type: 'error', title: 'Not saved', message: 'Your photo could not be saved. Please try again.' });
      } finally {
        setImageBusy(null);
      }
    },
    [avatarUpload, coverUpload, photoSource, profileQuery, showAlert]
  );

  const pickAndSet = useCallback(
    async (which: 'avatar' | 'cover') =>
      photoSource.ask(which === 'avatar' ? 'Your profile photo' : 'Your cover image', (source) => void setFrom(which, source)),
    [photoSource, setFrom]
  );

  const onChangePhoto = useCallback(() => void pickAndSet('avatar'), [pickAndSet]);

  // A requirement whose action is this screen moves the member to the field
  // that meets it and opens it: the bio and the two word lists are focused, the
  // areas list opens, and the cover asks for a photo.
  const openRequirement = useCallback((requirement: CreatorRequirement) => {
    const route = requirement.actionRoute;
    if (!route) return;
    if (route.split('?')[0] !== '/creator/profile') {
      router.push(requirementRoute(route) as never);
      return;
    }

    const field = profileFieldFor(requirement.key);
    if (!field) return;

    const scroll = scrollRef.current as (ScrollView & { getInnerViewRef?: () => unknown }) | null;
    const content = scroll?.getInnerViewRef?.();
    const anchor = fieldAnchors.current[field];
    if (scroll && content && anchor) {
      anchor.measureLayout(
        content as never,
        (_x, y) => scroll.scrollTo({ y: Math.max(0, y - 16), animated: true }),
        () => undefined,
      );
    }

    if (field === 'cover') {
      void pickAndSet('cover');
      return;
    }
    if (field === 'categories') {
      setAreasOpenRequest((count) => count + 1);
      return;
    }
    // After the scroll has run, so the keyboard does not fight it.
    const input = field === 'bio' ? bioInput : field === 'expertise' ? expertiseInput : languagesInput;
    setTimeout(() => input.current?.focus(), 350);
  }, [pickAndSet]);

  // Reputation and badges are one read since 20 Oct 2026,
  // `GET /creators/me/reputation`, on this screen and on Creator Studio's
  // Overview alike — so the two can no longer show different counts.
  const bioRemaining = BIO_LIMIT - bio.length;

  return (
    <CreatorScreen
      title="Creator profile"
      scrollRef={scrollRef}
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
                accessibilityHint="Take a photo, or choose one from your phone"
                onPress={onChangePhoto}
                disabled={imageBusy !== null}
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="w-14 h-14 rounded-full items-center justify-center mr-3.5 overflow-hidden"
              >
                {imageBusy === 'avatar' ? (
                  <ActivityIndicator color="#fff" />
                ) : freshAvatar ?? profile.avatarUrl ? (
                  <Image source={{ uri: (freshAvatar ?? profile.avatarUrl) as string }} style={{ width: 56, height: 56 }} contentFit="cover" />
                ) : (
                  <Text className="text-white text-xl font-black">
                    {(displayName || profile.displayName).charAt(0).toUpperCase()}
                  </Text>
                )}
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

          {/* ── Cover ────────────────────────────────────────────────────── */}
          <CreatorSection title="Cover image" subtitle="Shown across the top of your public profile">
            <View ref={(node) => { fieldAnchors.current.cover = node; }} collapsable={false} />
            <Pressable
              onPress={() => void pickAndSet('cover')}
              disabled={imageBusy !== null}
              accessibilityRole="button"
              accessibilityLabel={profile.coverImageUrl ? 'Change your cover image' : 'Add a cover image'}
              style={{ backgroundColor: tokens.color.surface.background, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden items-center justify-center"
            >
              {imageBusy === 'cover' ? (
                <View style={{ height: 140 }} className="items-center justify-center">
                  <ActivityIndicator />
                </View>
              ) : profile.coverImageUrl ? (
                <Image source={{ uri: profile.coverImageUrl }} style={{ width: '100%', height: 140 }} contentFit="cover" />
              ) : (
                <View style={{ height: 140 }} className="items-center justify-center">
                  <Ionicons name="image-outline" size={26} color={tokens.color.text.secondary} />
                  <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold mt-1.5">
                    Add a cover image
                  </Text>
                </View>
              )}
            </Pressable>
          </CreatorSection>

          {/* ── Bio ──────────────────────────────────────────────────────── */}
          <View ref={(node) => { fieldAnchors.current.bio = node; }} collapsable={false} />
          <CreatorSection
            title="About you"
            subtitle="Shown on your public profile and next to your guides"
          >
            <CreatorCard>
              <TextInput
                ref={bioInput}
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
            <View ref={(node) => { fieldAnchors.current.categories = node; }} collapsable={false} />
            <CreatorCard>
              <View className="mb-4">
                <SearchableSelect
                  multiple
                  label="Areas you write about"
                  placeholder="Choose areas"
                  searchPlaceholder="Search areas"
                  options={guideCategories.map((category) => ({ key: category.key, label: category.name }))}
                  value={categories}
                  onChange={(next) => {
                    setCategories(next.slice(0, 8));
                    setDirty(true);
                  }}
                  testID="creator-areas"
                  openRequest={areasOpenRequest}
                />
              </View>
              <View ref={(node) => { fieldAnchors.current.expertise = node; }} collapsable={false} />
              <TagEditor
                inputRef={expertiseInput}
                label="Expertise"
                values={expertise}
                onChange={(next) => {
                  setExpertise(next);
                  setDirty(true);
                }}
                placeholder="e.g. Work permits, renting"
                max={12}
                testID="creator-expertise"
              />
              <View ref={(node) => { fieldAnchors.current.languages = node; }} collapsable={false} />
              <TagEditor
                inputRef={languagesInput}
                label="Languages you write in"
                values={languages}
                onChange={(next) => {
                  setLanguages(next);
                  setDirty(true);
                }}
                placeholder="e.g. English, French"
                max={8}
                testID="creator-languages"
              />
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
          <MyReputationPanel />
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
