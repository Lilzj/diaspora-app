// ─────────────────────────────────────────────────────────────────────────────
// The organisation management workspace
//
// ── Why the old sheet's tabs were blank ──────────────────────────────────────
//
// Not because nobody wrote the content — every tab had markup. Two faults, and
// the second hid the first.
//
//     <TouchableOpacity … className="flex-1 bg-black/60 justify-end">  ← backdrop
//       <TouchableOpacity … className="… max-h-[88%]">                 ← the card
//         <ScrollView className="flex-1">                              ← the body
//
// **The body had no height.** The card's height is `auto`, capped at 88% but
// never *given* a height, so `flex-1` on its child had nothing to grow into and
// resolved to zero. A zero-height scroll view draws nothing, which is the blank
// area under the tabs.
//
// **And it could not have scrolled anyway.** A `ScrollView` inside a
// `TouchableOpacity` loses the pan gesture to the touchable — the same fault
// that stopped `AchievementsModal` scrolling, fixed there by moving to `Sheet`.
//
// `Sheet` from `components/overlays/AppModal` is the primitive 35 hand-rolled
// bottom sheets were consolidated onto. It gives the body a real height, keeps
// the scroll, handles the safe area, the Android back button, the translucent
// status and navigation bars, and the assistive-technology modal flag. Using it
// is the fix for both faults, and it is why this file has no `Modal` in it.
//
// ── State across tabs — §29, §39 ─────────────────────────────────────────────
//
// The member search survives a tab switch and is cleared when the sheet closes.
// Switching organisations resets everything, because the alternative is
// organisation B opening on organisation A's search — §36.
//
// ── Lazy tabs — §40 ──────────────────────────────────────────────────────────
//
// Only the mounted tab fetches. `useOrganizationCapabilities` is the single
// call the sheet makes on open, because every tab's contents are gated on it
// and rendering a management control before it arrives would flash a button and
// withdraw it. `noOrganizationCapabilities` — all flags false — is what the
// hook returns until the server answers, so the first paint is read-only.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Sheet } from '@/components/overlays/AppModal';
import { useTheme } from '@/design-system';
import { useOrganizationCapabilities } from '@/hooks/community-life';
import { describeCreatorRole } from '@/lib/organization-permissions';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { CreatorOrganization } from '@/types/creator';

import { EventsTab } from './EventsTab';
import { MembersTab } from './MembersTab';
import { PostsTab } from './PostsTab';
import { RolesTab } from './RolesTab';
import { TimelineTab } from './TimelineTab';

export type OrganizationTab = 'timeline' | 'posts' | 'events' | 'members' | 'roles';

const TABS: { key: OrganizationTab; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'posts', label: 'Posts' },
  { key: 'events', label: 'Events' },
  { key: 'members', label: 'Members' },
  { key: 'roles', label: 'Roles' },
];

interface OrganizationManagementSheetProps {
  organization: CreatorOrganization | null;
  visible: boolean;
  onClose: () => void;
}

export function OrganizationManagementSheet({
  organization,
  visible,
  onClose,
}: OrganizationManagementSheetProps) {
  const { tokens } = useTheme();

  const [tab, setTab] = useState<OrganizationTab>('timeline');
  const [memberSearch, setMemberSearch] = useState('');

  const organizationId = organization?.id;

  // §36 — a different organisation is a different workspace. Without this,
  // opening B after A shows B's name over A's search term and A's open tab.
  useEffect(() => {
    setTab('timeline');
    setMemberSearch('');
  }, [organizationId]);

  const { capabilities } = useOrganizationCapabilities(visible ? organizationId : undefined);

  useEffect(() => {
    if (visible && organizationId) {
      trackCommunityEvent('community.organization_dashboard.viewed', {
        organizationId,
        state: capabilities.role ?? 'none',
      });
    }
  }, [visible, organizationId, capabilities.role]);

  if (!organization) return null;

  const role = describeCreatorRole(organization.userRole);

  // A route from inside a sheet has to close it first — pushing underneath an
  // open sheet leaves the member on a screen they cannot see.
  const openRoute = (route: string) => {
    onClose();
    router.push(route as never);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={organization.name}
      subtitle={`${organization.category} · ${capabilities.role ?? role.label}`}
      height="88%"
      testID="organization-management-sheet"
    >
      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <View
        style={{ borderBottomColor: tokens.color.border.default }}
        className="flex-row items-center border-b pb-3.5 mb-3.5"
      >
        <Image
          source={{ uri: organization.logo }}
          accessibilityIgnoresInvertColors
          style={{ backgroundColor: tokens.color.surface.background }}
          className="w-11 h-11 rounded-2xl mr-3"
        />
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black mr-1"
              numberOfLines={1}
            >
              {organization.name}
            </Text>
            {organization.verified ? (
              <Text style={{ color: tokens.color.success.default }} className="text-[11px]">
                ✓
              </Text>
            ) : null}
          </View>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-semibold mt-0.5"
            numberOfLines={1}
          >
            {organization.membersCount} members · {organization.location}
          </Text>
        </View>
      </View>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
        accessibilityRole="tablist"
        className="mb-4"
      >
        {TABS.map((entry) => {
          const isActive = tab === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => setTab(entry.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={entry.label}
              style={{
                backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.background,
                borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="rounded-xl border px-3.5 py-2 mr-2"
            >
              {/*
                `text-white` rather than `tokens.color.text.inverse` — the
                inverse token flips to near-black in dark, and this label sits
                on the brand fill, which does not. Every other selected chip in
                the app does the same.
              */}
              <Text
                style={isActive ? undefined : { color: tokens.color.text.secondary }}
                className={`text-[11.5px] font-black ${isActive ? 'text-white' : ''}`}
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {tab === 'timeline' ? (
        <TimelineTab
          organizationId={organization.id}
          organizationName={organization.name}
          onOpenRoute={openRoute}
        />
      ) : null}

      {tab === 'posts' ? (
        <PostsTab
          organizationId={organization.id}
          organizationName={organization.name}
          capabilities={capabilities}
          onOpenRoute={openRoute}
        />
      ) : null}

      {tab === 'events' ? (
        <EventsTab
          organizationId={organization.id}
          organizationName={organization.name}
          capabilities={capabilities}
          onOpenRoute={openRoute}
        />
      ) : null}

      {tab === 'members' ? (
        <MembersTab
          organizationId={organization.id}
          organizationName={organization.name}
          capabilities={capabilities}
          search={memberSearch}
          onSearchChange={setMemberSearch}
        />
      ) : null}

      {tab === 'roles' ? (
        <RolesTab organizationId={organization.id} capabilities={capabilities} />
      ) : null}
    </Sheet>
  );
}
