// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-5 — visa advisories for a destination.
//
// **A new screen, not a rewired one.** There was no visa screen and no fixture;
// `GET /api/v1/intelligence/countries/{code}/visas` had never been called.
//
// ── The rule this screen is built around ────────────────────────────────────
//
// `appliesToCountryCode: null` means **everybody**, and a client must render
// that difference. The endpoint's own documentation is blunt about why:
//
//   > "Visa-free for 90 days" shown to somebody whose nationality it does not
//   > cover is the kind of wrong answer that ends with a person at an airport.
//
// So the list is split into two labelled groups — rules for a stated nationality
// and rules that apply to everyone — and the nationality filter **widens** the
// request rather than narrowing the result. Post-filtering the response on
// `appliesToCountryCode === nationality` would discard the universal rules and
// tell most members that no rules exist for them.
//
// There is nothing here about *applying*. No case, no status, no fee, no
// submission — application processing is explicitly out of the module's scope,
// and the only thing this platform offers is the authority's own link.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ListEmpty, ListState } from '@/components/ListState';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useVisaAdvisories } from '@/hooks/country-intelligence';
import { PostedBy } from '@/components/intelligence/PostedBy';
import type { VisaAdvisoryResponse } from '@/types/country-intelligence';

// ── One row per rule (FARCH-004, 27 Nov 2026) ────────────────────────────────
//
// The list's items were the two groups, each drawing every one of its rules
// with `.map()`, so nothing inside a group was virtualised: every page the
// member scrolled into stayed mounted. A group's title and each of its rules
// are rows of their own now, and the space a group kept below itself is drawn
// before the next group's title and after the last rule. A title is its own
// words and a rule is the hook's own object, so a row is redrawn only when
// what it shows changes.

/** A group's title, or one rule. */
type VisaListRow = string | VisaAdvisoryResponse;

function renderVisaRow({ item }: ListRenderItemInfo<VisaListRow>) {
  return typeof item === 'string' ? (
    <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-2">
      {item}
    </Text>
  ) : (
    <VisaRow advisory={item} />
  );
}

const visaRowKey = (row: VisaListRow) => (typeof row === 'string' ? `title:${row}` : row.visaAdvisoryId);

/** A title is recycled into a title, and a rule into a rule. */
const visaRowType = (row: VisaListRow) => (typeof row === 'string' ? 'title' : 'rule');

/** The space a group kept below itself, drawn where the next group's title follows. */
function GroupGap({ trailingItem }: { trailingItem?: VisaListRow }) {
  return typeof trailingItem === 'string' ? <View className="h-5" /> : null;
}

export default function VisaAdvisoriesScreen() {
  const bottomInset = useBottomInset();

  // `country` is the **destination**. `nationality` is who is travelling, and
  // it widens the answer rather than narrowing it.
  const { country, nationality } = useLocalSearchParams<{
    country?: string;
    nationality?: string;
  }>();

  const results = useVisaAdvisories(country, { appliesTo: nationality });

  if (!country) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Entry rules" showBack />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-4xl mb-2">🛂</Text>
          <Text className="text-sm font-bold text-content-strong text-center">
            Choose a destination
          </Text>
          <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[280px]">
            Entry rules are always about one country. Open a country page to see
            the rules for it.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Two labelled groups rather than one list. The order matters: what applies to
  // this member specifically comes first, and what applies to everybody is never
  // hidden behind it.
  const sections: { title: string; rows: VisaAdvisoryResponse[] }[] = [
    nationality
      ? { title: `Rules naming ${nationality}`, rows: results.targeted }
      : { title: 'Rules for a stated nationality', rows: results.targeted },
    { title: 'Rules that apply to everybody', rows: results.universal },
  ].filter((section) => section.rows.length > 0);
  const rows = sections.flatMap((section): VisaListRow[] => [section.title, ...section.rows]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={`Entering ${country}`} showBack />

      {/* The error had the empty state's slot, and only showed when there were no rows. */}
      <ListState
        loading={results.isLoading}
        loadingLabel="Loading entry rules"
        error={
          results.error && sections.length === 0
            ? { icon: 'airplane-outline', title: 'Entry rules are unavailable', message: results.error }
            : null
        }
        onRetry={results.refresh}
      >
        <FlashList
          data={rows}
          keyExtractor={visaRowKey}
          getItemType={visaRowType}
          ItemSeparatorComponent={GroupGap}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          onEndReachedThreshold={0.4}
          onEndReached={results.loadMore}
          ListHeaderComponent={
            <View className="bg-surface-card border border-faint rounded-2xl p-4 mb-4">
              <Text className="text-[11px] text-content-muted leading-relaxed font-semibold">
                These are the rules as the issuing authority published them.
                Diaspora does not process applications and cannot check a case —
                each rule links to where the authority takes them.
              </Text>
            </View>
          }
          renderItem={renderVisaRow}
          // The space the last group kept below itself.
          ListFooterComponent={rows.length > 0 ? <View className="h-5" /> : null}
          ListEmptyComponent={
            <ListEmpty
              icon="airplane-outline"
              title="No published rules"
              message={`Nobody has published entry rules for ${country} yet. Check the destination’s own immigration service.`}
            />
          }
        />
      </ListState>
    </SafeAreaView>
  );
}

function VisaRow({ advisory }: { advisory: VisaAdvisoryResponse }) {
  return (
    <TouchableOpacity
      onPress={() => router.push(`/intelligence/visa/${advisory.visaAdvisoryId}`)}
      accessibilityRole="button"
      accessibilityLabel={advisory.title}
      className="bg-surface-card border border-faint rounded-2xl p-4 mb-3"
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-base font-extrabold text-content-primary flex-1 mr-2" numberOfLines={2}>
          {advisory.title}
        </Text>
        {/* `isOfficial` is what separates a government statement from something
            somebody typed in. It is required for publication, and it is carried
            anyway so an editor's draft list can show what is not yet publishable. */}
      </View>

      <Text className="text-[11px] font-bold text-content-faint mb-2">
        {advisory.appliesToCountryCode
          ? `For ${advisory.appliesToCountryCode} nationals`
          : 'Applies to everybody'}
        {advisory.visaCategory ? ` · ${advisory.visaCategory}` : ''}
      </Text>

      <Text className="text-sm text-content-muted mb-2" numberOfLines={2}>
        {advisory.summary}
      </Text>

      <View className="flex-row items-center justify-between border-t border-faint pt-2">
        <View className="flex-1 mr-2">
          <PostedBy
            postedByPlatform={advisory.postedByPlatform}
            authorityName={advisory.authorityName}
            isOfficial={advisory.isOfficial}
            compact
          />
        </View>
        {/* `isActive` is computed server-side "so two clients agree". A rule
            outside its effective window is shown as such rather than hidden,
            because somebody may have acted on it last month. */}
        {!advisory.isActive ? (
          <Text className="text-[10px] font-black text-error-default uppercase">Not in force</Text>
        ) : advisory.processingTime ? (
          <Text className="text-[11px] font-bold text-content-faint">
            ⏱ {advisory.processingTime}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
