// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation Center (Frontend Phase 18, §6 · §67)
//
// The central automation management experience §6 asks for, at `/automation`.
//
// ── §6's instruction, and what it rules out ──────────────────────────────────
//
// *"Do not create multiple automation management screens across modules."*
//
// So this is the only list of automations in the application. A member with a
// job alert, a community welcome rule and a calendar automation sees all three
// here, in one list, with one set of controls — not three module-specific
// screens that each know about a third of their automations.
//
// The contextual entry points on an event, a job or a listing create an
// automation and then bring the member *here* to manage it. That is the
// difference between an entry point and a second management screen.
//
// ── Why the empty state is three different screens ───────────────────────────
//
// "You have no automations" is only one of the reasons this list can be empty,
// and the other two need different sentences:
//
//   * The member genuinely has none  → offer templates. An invitation.
//   * The platform has no registry   → say so, and name the gap. Not their
//                                      problem, and offering "create one"
//                                      would lead to a screen that cannot save.
//   * A filter excluded everything   → say which filter, and offer to clear it.
//
// A single "Nothing here" would be wrong in two of the three cases, and in the
// second it would be a lie about whose fault it is.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import {
  FloatingFooter,
  useBottomInset,
  useFloatingFooter,
} from '@/components/layout/bottom-inset';
import { useTheme } from '@/design-system';
import {
  useAutomationAccess,
  useAutomations,
  useAutomationSupport,
  useAvailableScopes,
  useScopeFor,
} from '@/hooks/automation';
import { AutomationErrorNotice, AutomationRow, ScopePicker } from '@/components/automation';
import { can, evaluateQuota } from '@/lib/automation/access';
import { trackAutomationEvent } from '@/lib/automation/events';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import {
  DEFAULT_AUTOMATION_FILTERS,
  type AutomationDefinition,
  type AutomationFilterTab,
  type AutomationOwnerKind,
} from '@/types/automation';

const TABS: { value: AutomationFilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'draft', label: 'Drafts' },
];

export default function AutomationCenterScreen() {
  const { tokens } = useTheme();

  // The CTA floats over the list, so the list has to end above it. Measuring it
  // rather than estimating: the control grows by ~42pt when the quota warning
  // appears, and the 120pt that used to be hard-coded here covered the short
  // form and not the tall one.
  const footer = useFloatingFooter();
  const bottomInset = useBottomInset({ footerHeight: footer.height });

  // §45: the Center shows one scope at a time rather than merging them. A
  // member's personal automations and the community ones they help run have
  // different audiences and different permissions, and a single merged list
  // would make "who does this reach?" a per-row question.
  const [ownerKind, setOwnerKind] = useState<AutomationOwnerKind>('user');

  const scope = useScopeFor(ownerKind);
  const { access } = useAutomationAccess(scope);
  const { support } = useAutomationSupport();
  const { kinds } = useAvailableScopes();

  const [tab, setTab] = useState<AutomationFilterTab>('all');

  const filters = useMemo(() => ({ ...DEFAULT_AUTOMATION_FILTERS, tab }), [tab]);

  const { automations, isLoading, isFetchingMore, hasMore, loadMore, error, refetch } =
    useAutomations(scope, filters);

  // A list a member opens to see whether anything has run since. Pulling is the
  // gesture they already try.
  const refreshControl = useRefreshControl(refetch);

  useEffect(() => {
    trackAutomationEvent('automation.center.viewed', { automationCount: automations.length });
    // Once per mount rather than on every change to `automations`: the list
    // re-resolves whenever connectivity flips, and an event per flip would make
    // "how many people opened this screen" uncountable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCount = useMemo(
    () => automations.filter((automation) => automation.status === 'ACTIVE').length,
    [automations]
  );

  const quota = evaluateQuota(activeCount, access);
  const canCreate = can('create-personal', access);

  const openAutomation = useCallback((automation: AutomationDefinition) => {
    router.push(`/automation/${automation.id}` as never);
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: AutomationDefinition }) => (
      <AutomationRow automation={item} onPress={() => openAutomation(item)} />
    ),
    [openAutomation]
  );

  return (
    // `bottom` is deliberately absent: the footer and the list each offset
    // themselves from `insets.bottom`, and a root that also padded by it would
    // count the gesture bar twice.
    <SafeAreaView
      className="flex-1"
      edges={['top', 'left', 'right']}
      style={{ backgroundColor: tokens.color.surface.background }}
    >
      <ScreenHeader
        title="Automations"
        showBack
        rightAction={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Automation settings"
            onPress={() => router.push('/automation/settings' as never)}
            className="w-12 h-12 items-center justify-center"
          >
            <Ionicons name="options-outline" size={20} color={tokens.color.text.primary} />
          </Pressable>
        }
      />

      <View className="px-4">
        <View className="mt-2">
          <ScopePicker scopes={kinds} selected={ownerKind} onSelect={setOwnerKind} compact />
        </View>

        <Summary
          activeCount={activeCount}
          totalCount={automations.length}
          canExecute={support ? support.hasExecutionEngine : false}
        />

        <TabBar tab={tab} onChange={setTab} />
      </View>

      {isLoading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color={tokens.color.primary[500]} />
        </View>
      ) : error ? (
        <ScrollView className="flex-1 px-4 pt-2" contentContainerStyle={{ paddingBottom: bottomInset }}>
          {/* A gap and a network failure read very differently here, and
              `blame` is what makes the difference visible: a platform gap gets
              no retry button, because pressing it would fail identically for
              ever. §77. */}
          <AutomationErrorNotice
            /* Was: "Diaspora cannot store automations yet" / "this part of
               Diaspora is still being built". Automations are stored — the
               registry answers, `POST /automations` persists a definition and
               it comes back with a `nextRunAt`. A `platform` blame here means
               something the platform owns went wrong on *this* request, not
               that the capability is absent, so the wording says that. */
            message={
              error.blame === 'platform'
                ? 'Your automations could not be loaded'
                : error.message
            }
            hint={
              error.blame === 'platform'
                ? (error.recoveryHint
                  ?? 'This is on the platform rather than on your setup. Anything you have already saved is untouched.')
                : error.recoveryHint
            }
            blame={error.blame}
            onRetry={error.blame !== 'platform' ? refetch : undefined}
          />

          <BrowseTemplatesCard />
        </ScrollView>
      ) : automations.length === 0 ? (
        <ScrollView className="flex-1 px-4 pt-2" contentContainerStyle={{ paddingBottom: bottomInset }}>
          <EmptyForTab tab={tab} onClearFilter={() => setTab('all')} />
          {tab === 'all' ? <BrowseTemplatesCard /> : null}
        </ScrollView>
      ) : (
        <FlashList
          data={automations}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          // §67: virtualized and paged. A member with two hundred automations
          // scrolls rather than waits, and pages arrive twenty at a time.
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset }}
          refreshControl={refreshControl}
          ListFooterComponent={
            isFetchingMore ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={tokens.color.primary[500]} />
              </View>
            ) : null
          }
        />
      )}

      {canCreate ? (
        <FloatingFooter
          {...footer.props}
          style={{ shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 }}
        >
          {quota.isNearLimit || quota.isAtLimit ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={
                quota.isAtLimit
                  ? `You have used all ${quota.limit} of your automations.`
                  : `${quota.remaining} of your ${quota.limit} automations left.`
              }
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-xl px-3 py-2 mb-2"
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[11px] font-black text-center"
              >
                {/* §55: warn before the limit rather than refusing at it. */}
                {quota.isAtLimit
                  ? `You have used all ${quota.limit} automations. Turn one off to add another.`
                  : `${quota.remaining} of ${quota.limit} left`}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create an automation"
            accessibilityState={{ disabled: quota.isAtLimit }}
            disabled={quota.isAtLimit}
            onPress={() => router.push('/automation/templates' as never)}
            style={{
              backgroundColor: quota.isAtLimit
                ? tokens.color.text.disabled
                : tokens.color.primary[500],
            }}
            className="rounded-2xl py-4 items-center flex-row justify-center"
          >
            <Ionicons name="add" size={18} color={tokens.color.text.inverse} />
            <Text style={{ color: tokens.color.text.inverse }} className="text-sm font-black ml-1.5">
              Create an automation
            </Text>
          </Pressable>
        </FloatingFooter>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * The two counts at the top.
 *
 * "Active" and "total" rather than a progress figure — Phase 16 established the
 * reasoning and it holds here: a progress bar implies a target, and there is no
 * number of automations somebody is supposed to reach. Having none is a
 * perfectly good way to use this application.
 */
function Summary({
  activeCount,
  totalCount,
  canExecute,
}: {
  activeCount: number;
  totalCount: number;
  canExecute: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        canExecute
          ? `${activeCount} active of ${totalCount} automations.`
          : `${activeCount} active of ${totalCount} automations. This deployment is not running them at the moment.`
      }
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.surface.border }}
      className="rounded-2xl border px-4 py-3 mb-3 mt-2"
    >
      <View className="flex-row items-center">
        <Text style={{ color: tokens.color.text.primary }} className="text-lg font-black">
          {activeCount}
        </Text>
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold ml-1.5">
          active
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-xs font-bold ml-2">
          · {totalCount} in total
        </Text>
      </View>

      {/* Said once, at the top, rather than on every row. A member should learn
          this in one place and then read their list normally.

          `canExecute` is now read from the deployment's own capability and
          catalogue documents rather than from a hardcoded `false`, so this line
          appears only when the served catalogue really carries no available
          trigger or no available action. The wording changed with it: it used to
          say "Diaspora cannot run automations automatically yet", which was a
          claim about the platform, and the platform runs them. */}
      {!canExecute ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium mt-1.5 leading-relaxed"
        >
          This deployment is not running automations at the moment. Anything you set up here is
          saved and will start running when it is.
        </Text>
      ) : null}
    </View>
  );
}

function TabBar({
  tab,
  onChange,
}: {
  tab: AutomationFilterTab;
  onChange: (tab: AutomationFilterTab) => void;
}) {
  const { tokens } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-3"
      accessibilityRole="tablist"
    >
      {TABS.map((entry) => {
        const selected = tab === entry.value;
        return (
          <Pressable
            key={entry.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={entry.label}
            onPress={() => onChange(entry.value)}
            style={{
              backgroundColor: selected ? tokens.color.primary[500] : tokens.color.surface.card,
              borderColor: selected ? tokens.color.primary[500] : tokens.color.surface.border,
            }}
            className="rounded-full border px-3.5 py-2 mr-2"
          >
            <Text
              style={{ color: selected ? tokens.color.text.inverse : tokens.color.text.secondary }}
              className="text-[11px] font-black"
            >
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** See the file header: three empty states, because there are three reasons. */
function EmptyForTab({
  tab,
  onClearFilter,
}: {
  tab: AutomationFilterTab;
  onClearFilter: () => void;
}) {
  const { tokens } = useTheme();

  if (tab !== 'all') {
    return (
      <View className="items-center py-12 px-6">
        <Text style={{ color: tokens.color.text.primary }} className="text-base font-black mb-1">
          Nothing in this list
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-medium text-center leading-relaxed mb-4"
        >
          You have automations, but none of them are in this group right now.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show all automations"
          onPress={onClearFilter}
          style={{ borderColor: tokens.color.surface.border }}
          className="rounded-xl border px-4 py-2.5"
        >
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black">
            Show all
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="items-center py-12 px-6">
      <Ionicons name="sparkles-outline" size={40} color={tokens.color.primary[500]} />
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black mt-4 mb-1 text-center"
      >
        Let Diaspora do the watching
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium text-center leading-relaxed"
      >
        Set something up once and it keeps an eye out for you — a job in the right place, a home in
        your budget, a reminder before an event starts.
      </Text>
    </View>
  );
}

function BrowseTemplatesCard() {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Browse ready-made automations"
      accessibilityHint="Opens a list of automations you can set up in a few taps"
      onPress={() => router.push('/automation/templates' as never)}
      style={{ backgroundColor: tokens.color.primary[500] }}
      className="rounded-2xl p-4 mt-4 flex-row items-center"
    >
      <Ionicons name="albums-outline" size={20} color={tokens.color.text.inverse} />
      <View className="flex-1 ml-3">
        <Text style={{ color: tokens.color.text.inverse }} className="text-sm font-black">
          Browse ready-made ones
        </Text>
        <Text
          style={{ color: tokens.color.text.inverse, opacity: 0.85 }}
          className="text-[11px] font-semibold mt-0.5"
        >
          Set one up in a few taps
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.inverse} />
    </Pressable>
  );
}
