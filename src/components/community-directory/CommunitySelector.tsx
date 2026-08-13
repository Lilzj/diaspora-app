// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community selector, switcher and filter (Frontend Phase 13,
// §10, §11, §15, §56)
//
// §10: a **reusable** selector that is not tied to a single screen. §15: **one**
// filtering model wherever a community filter appears, rather than a separate
// incompatible filter in each feature. Both are the same requirement seen from two
// angles, and this file is the answer to both.
//
// Three components:
//
//   `<CommunityScopeChip>`     the compact, always-visible affordance. Goes in a
//                              screen header and says what the current scope is.
//   `<CommunitySelectorSheet>` the full picker: modes, search, recents, my
//                              communities, all communities, cross-community.
//   `<CommunityFilterBar>`     §15's reusable filter — the horizontal mode chips a
//                              list screen puts above its results.
//
// Every one of them reads and writes the **same** store and resolves through the
// **same** `resolveScope`. There is no second filtering model in the codebase, and
// a screen that wanted one would have to reimplement scope resolution to get it —
// which is the friction that keeps §15 true.
//
// ── §56: polished, not overwhelming ──────────────────────────────────────────
//
// The sheet shows, in order: the current scope, then the member's own communities,
// then recents, then search results or the browsable directory. Cross-community
// mode is a switch at the top rather than a sixth list, because it is a *modifier*
// on a selection rather than a different kind of selection.
//
// The 1,000-community case (§77) is handled by not holding 1,000 rows: search is
// server-side, browse is paged, and the list is a `FlatList` so only the visible
// rows are mounted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  CommunityDirectoryEntry,
  CommunityId,
  CommunityMode,
  CommunityRef,
} from '@/types/community-directory';
import { communityModeLabel } from '@/lib/community/scope';
import {
  useCommunityContext,
  useCommunityDirectory,
} from '@/hooks/communities';
import { useCommunityContextStore } from '@/store/community-context';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { CommunityAvatar, CommunityRow, communityOriginLabel } from './CommunityIdentity';
import { MultiCommunityGapNotice } from './MultiCommunityGapNotice';

// ═════════════════════════════════════════════════════════════════════════════
// THE CHIP
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The always-visible scope affordance.
 *
 * Deliberately states the *scope*, not the community. In `CROSS_COMMUNITY` mode
 * over three communities it reads "Across 3 communities", because "Nigerian" would
 * be a lie about what the screen is showing — and a member who cannot tell which
 * scope produced a list cannot tell whether an empty list means anything.
 */
export function CommunityScopeChip({
  onPress,
  compact = false,
}: {
  onPress: () => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const context = useCommunityContext();
  const flags = getCommunityFeatureFlags();

  if (!flags.multiCommunityEnabled) return null;

  const single =
    context.mode === 'SELECTED_COMMUNITY' || context.mode === 'PRIMARY_COMMUNITY'
      ? (context.activeCommunity ?? context.primaryCommunity)
      : null;

  const label = single
    ? single.name
    : communityModeLabel(context.mode, context.scope.communityIds.length);

  const accessibilityLabel = single
    ? `Community filter: ${single.name}, ${communityOriginLabel(single)}. Change community.`
    : `Community filter: ${label}. Change community.`;

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the community picker"
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: tokens.color.neutral[100],
        borderColor: tokens.color.border.default,
      }}
      className={`flex-row items-center self-start rounded-full border ${
        compact ? 'px-2 py-1' : 'px-3 py-1.5'
      }`}
      testID="community-scope-chip"
    >
      {single ? (
        <CommunityAvatar community={single} size={compact ? 16 : 20} />
      ) : (
        <Ionicons
          name={context.mode === 'ALL_COMMUNITIES' ? 'globe-outline' : 'people-circle-outline'}
          size={compact ? 13 : 15}
          color={tokens.color.text.secondary}
        />
      )}

      <Text
        style={{ color: tokens.color.text.primary }}
        className={`font-bold ml-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}
        numberOfLines={1}
      >
        {label}
      </Text>

      <Ionicons
        name="chevron-down"
        size={compact ? 11 : 13}
        color={tokens.color.text.placeholder}
        style={{ marginLeft: 4 }}
      />
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// THE SHEET
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The full community picker — §10, §11, §56.
 *
 * Writes through the store's actions, which persist the selection and emit the
 * §63 event. It does **not** invalidate any query: the scope token means every
 * community-sensitive cache is already keyed per scope, so switching reveals the
 * new scope's entry rather than needing the old one purged. That is the property
 * §42 asks for, and it is why this component contains no cache code.
 */
export function CommunitySelectorSheet({
  visible,
  onClose,
  title = 'Choose a community',
  /** When set, tapping a row calls this instead of switching the global context. */
  onSelect,
  /** Pre-selected ids, for a multi-select picker (comparison, cross-community). */
  selectedIds,
  multiSelect = false,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  onSelect?: (community: CommunityRef) => void;
  selectedIds?: readonly CommunityId[];
  multiSelect?: boolean;
}) {
  const { tokens } = useTheme();
  const context = useCommunityContext();
  const store = useCommunityContextStore();
  const flags = getCommunityFeatureFlags();

  const [query, setQuery] = useState('');

  const directory = useCommunityDirectory({
    query: query.trim() || undefined,
    limit: 40,
    includeJoined: true,
  });

  const selected = useMemo(
    () => new Set(selectedIds ?? (multiSelect ? store.selectedCommunityIds : [])),
    [multiSelect, selectedIds, store.selectedCommunityIds]
  );

  /**
   * Takes a `CommunityRef` rather than a directory entry, because the rows come
   * from three places — the directory page, the membership set and the recents
   * list — and only the first has a full `Community`. The action needs the id.
   */
  const handleRow = useCallback(
    (community: CommunityRef) => {
      if (onSelect) {
        onSelect(community);
        if (!multiSelect) onClose();
        return;
      }

      if (multiSelect) {
        store.toggleSelectedCommunityId(community.id);
        return;
      }

      store.switchTo(community.id);
      onClose();
    },
    [multiSelect, onClose, onSelect, store]
  );

  /**
   * The member's own communities, from the membership set rather than from the
   * directory page — so they appear even when a search has narrowed the directory
   * to something else, and even offline.
   */
  const myCommunities = useMemo(() => {
    const wanted = new Set([...context.myCommunityIds, ...context.interestedCommunityIds]);
    return context.availableCommunities.filter((ref) => wanted.has(ref.id));
  }, [context.availableCommunities, context.interestedCommunityIds, context.myCommunityIds]);

  const recents = useMemo(
    () =>
      store.recentCommunityIds
        .map((id) => context.availableCommunities.find((ref) => ref.id === id))
        .filter((ref): ref is CommunityRef => Boolean(ref)),
    [context.availableCommunities, store.recentCommunityIds]
  );

  const modes: CommunityMode[] = useMemo(() => {
    const list: CommunityMode[] = ['ALL_COMMUNITIES'];
    if (context.primaryMembership) list.push('PRIMARY_COMMUNITY');
    if (context.interestedCommunityIds.length > 0) list.push('INTERESTED_COMMUNITIES');
    return list;
  }, [context.interestedCommunityIds.length, context.primaryMembership]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      {/* The sheet is anchored to the bottom of a window that does not resize
          for the keyboard, so typing a search covered the results it was
          filtering — the field stayed visible and the answer did not. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={{ backgroundColor: tokens.color.surface.overlay }} className="flex-1 justify-end">
        <SafeAreaView
          edges={['bottom']}
          style={{ backgroundColor: tokens.color.surface.card, maxHeight: '88%' }}
          className="rounded-t-3xl"
        >
          {/* Header */}
          <View
            style={{ borderColor: tokens.color.border.default }}
            className="flex-row items-center justify-between px-4 py-3 border-b"
          >
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black"
              accessibilityRole="header"
            >
              {title}
            </Text>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Close the community picker"
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={tokens.color.text.secondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={directory.data?.items ?? []}
            keyExtractor={(entry) => entry.community.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            // §77: only the visible rows mount, so 1,200 communities cost the same
            // as 20 to scroll.
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            ListHeaderComponent={
              <View>
                {/* Search */}
                <View
                  style={{
                    backgroundColor: tokens.color.neutral[100],
                    borderColor: tokens.color.border.default,
                  }}
                  className="flex-row items-center rounded-xl border px-3 py-2 mb-4"
                >
                  <Ionicons name="search" size={15} color={tokens.color.text.placeholder} />
                  <TextInput
                    accessible
                    accessibilityLabel="Search communities"
                    placeholder="Search communities"
                    placeholderTextColor={tokens.color.text.placeholder}
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    style={{ color: tokens.color.text.primary }}
                    className="flex-1 ml-2 text-sm font-semibold"
                    testID="community-selector-search"
                  />
                  {query ? (
                    <TouchableOpacity
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel="Clear the search"
                      onPress={() => setQuery('')}
                    >
                      <Ionicons name="close-circle" size={15} color={tokens.color.text.placeholder} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Cross-community switch — a modifier, not a sixth list. */}
                {flags.crossCommunityDiscoveryEnabled && !onSelect ? (
                  <View
                    style={{
                      backgroundColor: tokens.color.neutral[50],
                      borderColor: tokens.color.border.default,
                    }}
                    className="flex-row items-center rounded-2xl border p-3 mb-4"
                  >
                    <Ionicons
                      name="git-network-outline"
                      size={18}
                      color={tokens.color.secondary[500]}
                    />
                    <View className="flex-1 ml-2.5">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-xs font-bold"
                      >
                        Look across several communities
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[10px] font-semibold mt-0.5 leading-relaxed"
                      >
                        Show content from more than one community at once, instead of switching
                        between them.
                      </Text>
                    </View>
                    <Switch
                      accessible
                      accessibilityRole="switch"
                      accessibilityLabel="Look across several communities"
                      value={context.mode === 'CROSS_COMMUNITY'}
                      onValueChange={(next) => {
                        if (next) store.enableCrossCommunity(context.myCommunityIds);
                        else store.setMode('SELECTED_COMMUNITY');
                      }}
                      testID="cross-community-switch"
                    />
                  </View>
                ) : null}

                {/* Modes */}
                {!onSelect ? (
                  <View className="mb-4">
                    <SectionLabel>Scope</SectionLabel>
                    {modes.map((mode) => (
                      <ModeRow
                        key={mode}
                        mode={mode}
                        count={
                          mode === 'INTERESTED_COMMUNITIES'
                            ? context.interestedCommunityIds.length
                            : undefined
                        }
                        isActive={context.mode === mode}
                        onPress={() => {
                          store.setMode(mode);
                          onClose();
                        }}
                      />
                    ))}
                  </View>
                ) : null}

                {/* My communities */}
                {myCommunities.length > 0 && !query ? (
                  <View className="mb-4">
                    <SectionLabel>My communities</SectionLabel>
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
                          isSelected={selected.has(ref.id) || context.activeCommunityId === ref.id}
                          onPress={() => handleRow(ref)}
                        />
                      );
                    })}
                  </View>
                ) : null}

                {/* Recents */}
                {recents.length > 0 && !query ? (
                  <View className="mb-4">
                    <SectionLabel>Recently visited</SectionLabel>
                    {recents.slice(0, 4).map((ref) => (
                      <CommunityRow
                        key={ref.id}
                        community={ref}
                        isSelected={selected.has(ref.id)}
                        onPress={() => handleRow(ref)}
                      />
                    ))}
                  </View>
                ) : null}

                <SectionLabel>{query ? 'Search results' : 'All communities'}</SectionLabel>

                {directory.unavailable === 'feature-disabled' ? (
                  <MultiCommunityGapNotice gapKey="communityDirectory" compact />
                ) : null}

                {directory.isLoading ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator color={tokens.color.primary[500]} />
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <CommunityRow
                community={item.community}
                membershipState={item.membershipState}
                isPrimary={item.isPrimary}
                isSelected={selected.has(item.community.id)}
                reason={item.reason}
                onPress={() => handleRow(item.community)}
              />
            )}
            ListEmptyComponent={
              directory.isLoading ? null : (
                <View className="py-8 items-center px-6">
                  <Ionicons
                    name="people-outline"
                    size={30}
                    color={tokens.color.text.placeholder}
                  />
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-bold mt-2 text-center"
                  >
                    {query ? 'No communities match that search' : 'No communities to show yet'}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-semibold mt-1 text-center leading-relaxed"
                  >
                    {query
                      ? 'Try a country, a region, or part of the community’s name.'
                      : 'Communities will appear here once they are available.'}
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              multiSelect ? (
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Done. ${selected.size} ${selected.size === 1 ? 'community' : 'communities'} selected.`}
                  onPress={onClose}
                  style={{ backgroundColor: tokens.color.primary[500] }}
                  className="rounded-2xl py-3 items-center mt-4"
                  testID="community-selector-done"
                >
                  <Text
                    style={{ color: tokens.color.text.inverse }}
                    className="text-sm font-black"
                  >
                    Done ({selected.size})
                  </Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </SafeAreaView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: tokens.color.text.placeholder }}
      className="text-[10px] font-black uppercase tracking-widest mb-2"
    >
      {children}
    </Text>
  );
}

function ModeRow({
  mode,
  count,
  isActive,
  onPress,
}: {
  mode: CommunityMode;
  count?: number;
  isActive: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const label = communityModeLabel(mode, count);

  const icon: keyof typeof Ionicons.glyphMap =
    mode === 'ALL_COMMUNITIES'
      ? 'globe-outline'
      : mode === 'PRIMARY_COMMUNITY'
        ? 'star-outline'
        : 'bookmarks-outline';

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${label}${isActive ? ', currently selected' : ''}`}
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: isActive ? tokens.color.primary[50] : tokens.color.surface.card,
        borderColor: isActive ? tokens.color.primary[400] : tokens.color.border.default,
      }}
      className="flex-row items-center rounded-2xl border p-3 mb-2"
      testID={`community-mode-row-${mode}`}
    >
      <Ionicons
        name={icon}
        size={18}
        color={isActive ? tokens.color.primary[600] : tokens.color.text.secondary}
      />
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-bold ml-3 flex-1"
      >
        {label}
      </Text>
      {isActive ? (
        <Ionicons name="checkmark-circle" size={18} color={tokens.color.primary[500]} />
      ) : null}
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// THE FILTER BAR — §15
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §15's reusable community filter.
 *
 * The **same** model wherever a community filter appears: Guides, Jobs,
 * Marketplace, Housing, Events, Providers, Organizations, Updates, Search, Saved
 * and the map all mount this component and read the same store. §15 forbids
 * "separate incompatible community filters in each feature" and the way that is
 * prevented is that there is only one component to mount.
 *
 * Horizontally scrollable rather than wrapping, so it costs one row of vertical
 * space on a list screen — and the "More" chip opens the full sheet rather than
 * this bar growing to hold 1,200 communities.
 */
export function CommunityFilterBar({
  onOpenSelector,
  compact = false,
}: {
  onOpenSelector?: () => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const context = useCommunityContext();
  const store = useCommunityContextStore();
  const flags = getCommunityFeatureFlags();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!flags.multiCommunityEnabled) return null;

  const openSelector = onOpenSelector ?? (() => setSheetOpen(true));

  const chips: { key: string; label: string; isActive: boolean; onPress: () => void }[] = [
    {
      key: 'all',
      label: 'All communities',
      isActive: context.mode === 'ALL_COMMUNITIES',
      onPress: () => store.clearScope(),
    },
  ];

  if (context.primaryMembership) {
    const primary = context.primaryCommunity;
    chips.push({
      key: 'primary',
      label: primary ? primary.name : 'My community',
      isActive: context.mode === 'PRIMARY_COMMUNITY',
      onPress: () => store.setMode('PRIMARY_COMMUNITY'),
    });
  }

  if (context.interestedCommunityIds.length > 0) {
    chips.push({
      key: 'interested',
      label: communityModeLabel('INTERESTED_COMMUNITIES', context.interestedCommunityIds.length),
      isActive: context.mode === 'INTERESTED_COMMUNITIES',
      onPress: () => store.setMode('INTERESTED_COMMUNITIES'),
    });
  }

  if (flags.crossCommunityDiscoveryEnabled && context.myCommunityIds.length > 1) {
    chips.push({
      key: 'cross',
      label: communityModeLabel('CROSS_COMMUNITY', context.scope.communityIds.length),
      isActive: context.mode === 'CROSS_COMMUNITY',
      onPress: () => store.enableCrossCommunity(context.myCommunityIds),
    });
  }

  // The active single community, when it is not one of the chips above.
  if (context.mode === 'SELECTED_COMMUNITY' && context.activeCommunity) {
    chips.push({
      key: 'selected',
      label: context.activeCommunity.name,
      isActive: true,
      onPress: openSelector,
    });
  }

  return (
    <View testID="community-filter-bar">
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={chips}
        keyExtractor={(chip) => chip.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: compact ? 6 : 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityState={{ selected: item.isActive }}
            accessibilityLabel={`Filter by ${item.label}${item.isActive ? ', currently applied' : ''}`}
            onPress={item.onPress}
            activeOpacity={0.7}
            style={{
              backgroundColor: item.isActive ? tokens.color.primary[500] : tokens.color.neutral[100],
              borderColor: item.isActive ? tokens.color.primary[500] : tokens.color.border.default,
            }}
            className="flex-row items-center rounded-full border px-3 py-1.5 mr-2"
            testID={`community-filter-chip-${item.key}`}
          >
            <Text
              style={{
                color: item.isActive ? tokens.color.text.inverse : tokens.color.text.secondary,
              }}
              className="text-[11px] font-bold"
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Choose a different community"
            onPress={openSelector}
            activeOpacity={0.7}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-full border px-3 py-1.5"
            testID="community-filter-chip-more"
          >
            <Ionicons name="options-outline" size={13} color={tokens.color.text.secondary} />
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-bold ml-1"
            >
              Choose
            </Text>
          </TouchableOpacity>
        }
      />

      {onOpenSelector ? null : (
        <CommunitySelectorSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
      )}
    </View>
  );
}
