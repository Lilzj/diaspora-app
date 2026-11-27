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
//
// ── One list for the tab in view (FARCH-004, 27 Nov 2026) ────────────────────
//
// Posts, Events and Members page, and the sheet drew them with `.map()` inside
// its scroll view, so every page a member asked for stayed mounted. The sheet's
// body is one FlashList now (`OrganizationSheetBody`): the identity row and the
// tab strip are its header, followed by what the tab in view draws above its
// rows; the rows are that tab's; and what a tab says in their place goes
// through the shared list state. Timeline and Roles are read in one go and draw
// themselves whole, above where rows would be.
//
// Two things changed with it. The sheet is given `scrollable={false}`, so its
// title row stays put while the list scrolls under it: the title scrolled away
// with the content before. And Events and Members still fetch only while they
// are the tab in view, but Posts' announcements are read for as long as the
// sheet is open, because `useAnnouncements` takes no switch; Timeline, the tab
// the sheet opens on, reads that query anyway.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';

import { ListState } from '@/components/ListState';
import { Sheet } from '@/components/overlays/AppModal';
import { useTheme } from '@/design-system';
import { useOrganizationCapabilities } from '@/hooks/community-life';
import { describeCreatorRole } from '@/lib/domain/organization-permissions';
import { trackCommunityEvent } from '@/lib/platform/community-analytics';
import type { OrganizationCapabilities } from '@/types/community-advanced';
import type { CreatorOrganization } from '@/types/creator';

import { useEventsTab } from './EventsTab';
import { useMembersTab } from './MembersTab';
import { NO_ROWS, organizationRowKey, organizationRowType, type OrganizationTabList } from './OrganizationRows';
import { usePostsTab } from './PostsTab';
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={organization.name}
      subtitle={`${organization.category} · ${capabilities.role ?? role.label}`}
      height="88%"
      // The body brings its own scrolling: one list, for the tab in view.
      scrollable={false}
      testID="organization-management-sheet"
    >
      <OrganizationSheetBody
        organization={organization}
        capabilities={capabilities}
        tab={tab}
        onTabChange={setTab}
        memberSearch={memberSearch}
        onMemberSearchChange={setMemberSearch}
        onClose={onClose}
      />
    </Sheet>
  );
}

interface OrganizationSheetBodyProps {
  organization: CreatorOrganization;
  capabilities: OrganizationCapabilities;
  tab: OrganizationTab;
  onTabChange: (tab: OrganizationTab) => void;
  /** Survives a tab switch, and is cleared when the sheet closes. §29. */
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  onClose: () => void;
}

/** Timeline and Roles draw themselves whole, above where rows would be: there is no row. */
function renderNoRow() {
  return null;
}

/**
 * The sheet's body, as one FlashList for the tab in view. A child of the sheet,
 * so it mounts as the sheet opens and its tabs read only while the sheet is
 * open, as they did.
 */
function OrganizationSheetBody({
  organization,
  capabilities,
  tab,
  onTabChange,
  memberSearch,
  onMemberSearchChange,
  onClose,
}: OrganizationSheetBodyProps) {
  const { tokens } = useTheme();

  // A route from inside a sheet has to close it first — pushing underneath an
  // open sheet leaves the member on a screen they cannot see.
  const openRoute = useCallback(
    (route: string) => {
      onClose();
      router.push(route as never);
    },
    [onClose]
  );

  const shared = { organizationId: organization.id, organizationName: organization.name, capabilities };
  const posts = usePostsTab({ ...shared, onOpenRoute: openRoute, active: tab === 'posts' });
  const events = useEventsTab({ ...shared, onOpenRoute: openRoute, active: tab === 'events' });
  const members = useMembersTab({
    ...shared,
    search: memberSearch,
    onSearchChange: onMemberSearchChange,
    active: tab === 'members',
  });

  const view: OrganizationTabList =
    tab === 'posts'
      ? posts
      : tab === 'events'
        ? events
        : tab === 'members'
          ? members
          : {
              header:
                tab === 'timeline' ? (
                  <TimelineTab
                    organizationId={organization.id}
                    organizationName={organization.name}
                    onOpenRoute={openRoute}
                  />
                ) : (
                  <RolesTab organizationId={organization.id} capabilities={capabilities} />
                ),
              rows: NO_ROWS,
              renderItem: renderNoRow,
              state: {},
              footer: null,
            };

  // The sheet pads its body. The list takes that back at the sides and the foot
  // and pads its content instead, so it scrolls to the sheet's edges as the
  // sheet's own scroll view did.
  const inset = tokens.spacing[6];

  return (
    <FlashList
      data={view.rows}
      renderItem={view.renderItem}
      keyExtractor={organizationRowKey}
      getItemType={organizationRowType}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -inset, marginBottom: -inset }}
      contentContainerStyle={{ paddingHorizontal: inset, paddingBottom: inset }}
      ListHeaderComponent={
        <>
          {/*
            ── Identity ──────────────────────────────────────────────────────────

            The name is *not* repeated here. `Sheet`'s own header already carries it
            as the title, with the category and role as the subtitle — and that
            header is the modal's accessible title, so it is the one that has to
            keep the name. Printing it again immediately below, which the first
            version did, gave the sheet the organisation's name twice in forty
            vertical pixels.

            What this row adds is what the header cannot: the logo, and the two
            facts that place the organisation.
          */}
          <View
            style={{ borderBottomColor: tokens.color.border.default }}
            className="flex-row items-center border-b pb-3.5 mb-3.5"
          >
            <Image
              source={{ uri: organization.logo }}
              accessibilityIgnoresInvertColors
              style={{ backgroundColor: tokens.color.surface.background }}
              className="w-10 h-10 rounded-2xl mr-3"
            />
            <View className="flex-1">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[11.5px] font-bold"
                numberOfLines={1}
              >
                {organization.membersCount.toLocaleString()} members · {organization.followersCount.toLocaleString()} followers
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[10px] font-semibold mt-0.5"
                numberOfLines={1}
              >
                {organization.location}
                {organization.verified ? ' · Verified' : ''}
              </Text>
            </View>

            {organization.verified ? (
              <View
                style={{ backgroundColor: tokens.color.success.surface }}
                className="w-6 h-6 rounded-full items-center justify-center"
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                <Text style={{ color: tokens.color.success.default }} className="text-[11px]">
                  ✓
                </Text>
              </View>
            ) : null}
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
                  onPress={() => onTabChange(entry.key)}
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
          {view.header}
        </>
      }
      ListEmptyComponent={<ListState {...view.state} />}
      ListFooterComponent={<>{view.footer}</>}
    />
  );
}
