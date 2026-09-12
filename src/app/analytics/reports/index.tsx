// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Saved reports (Frontend Phase 15, §45)
//
// Saved, shared and favourite reports, each in its own list.
//
// ── The one thing the sharing control does not claim ─────────────────────────
//
// A report's `sharing` field is offered — private, community, organization,
// platform — and choosing one does **not** grant anybody access. The server
// decides who may run a report, and it must re-authorize the query inside it
// against the *caller*, on every run.
//
// That distinction is the subtlest authorization surface in this phase and is
// worth stating plainly: a report built by an administrator and shared into a
// community must not run with administrative visibility for a member. Otherwise a
// saved report becomes a way to launder an authorization failure into an object.
// The copy on this screen says the server decides, because it does.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useTheme } from '@/design-system';
import { useAnalyticsReports, useReportMutations } from '@/hooks/analytics';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import {
  AnalyticsChipRow,
  AnalyticsEmptyState,
  AnalyticsGapNotice,
  AnalyticsHeader,
  AnalyticsSkeleton,
} from '@/components/analytics';
import { describeRange } from '@/lib/analytics/time-range';

type Scope = 'mine' | 'shared' | 'favorites';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'mine', label: 'Yours' },
  { value: 'favorites', label: 'Favourites' },
  { value: 'shared', label: 'Shared with you' },
];

export default function SavedReportsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<Scope>('mine');

  const { reports, isLoading, isEnabled, refetch } = useAnalyticsReports(scope);
  const { update, remove } = useReportMutations();

  useEffect(() => {
    trackAnalyticsEvent('analytics.report.viewed');
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <AnalyticsHeader
        title="Reports"
        subtitle="Questions you have saved"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Build a new report"
            onPress={() => router.push('/analytics/reports/build')}
            hitSlop={8}
            className="w-11 h-11 items-center justify-center"
          >
            <Ionicons name="add" size={22} color={tokens.color.text.primary} />
          </Pressable>
        }
      />

      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderBottomColor: tokens.color.border.default,
        }}
        className="border-b px-5 py-3"
      >
        <AnalyticsChipRow
          accessibilityLabel="Which reports"
          options={SCOPES}
          value={scope}
          onChange={setScope}
        />
      </View>

      <ScrollEndScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {isEnabled ? (
          <View className="mb-5">
            <AnalyticsGapNotice
              gapKey="savedReports"
              compact
              detail="Reports are held for this session only — Diaspora has nowhere to store them yet, so they will not survive a restart and cannot really be shared with anybody."
            />
          </View>
        ) : null}

        {isLoading ? (
          <AnalyticsSkeleton rows={3} />
        ) : !isEnabled ? (
          // `useAnalyticsReports` is gated on `areAnalyticsGapsEnabled()`, so in
          // a release build nothing is ever fetched. The titles below then
          // asserted "You have not built a report yet" and — worse, because it
          // is a claim about other people — "Nothing has been shared with you".
          // Diaspora has nowhere to store a report yet, which is a different
          // sentence entirely.
          <AnalyticsEmptyState
            reason="no-data"
            title="Not available yet"
            body="Diaspora has nowhere to keep saved reports yet, so there is nothing to list here and nothing can be shared with you."
          />
        ) : reports.length === 0 ? (
          <AnalyticsEmptyState
            reason="no-data"
            title={
              scope === 'shared'
                ? 'Nothing has been shared with you'
                : scope === 'favorites'
                  ? 'No favourites yet'
                  : 'You have not built a report yet'
            }
            body={
              scope === 'mine'
                ? 'Build one to save a set of figures, a period and a comparison you want to come back to.'
                : 'Reports you mark as favourites will show up here.'
            }
            actionLabel={scope === 'mine' ? 'Build a report' : undefined}
            onAction={scope === 'mine' ? () => router.push('/analytics/reports/build') : undefined}
          />
        ) : (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border overflow-hidden"
          >
            {reports.map((report, index) => (
              <View
                key={report.reportId}
                style={{
                  borderTopColor: tokens.color.border.default,
                  borderTopWidth: index === 0 ? 0 : 1,
                }}
                className="flex-row items-center px-4 py-3.5"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${report.name}. ${describeRange(report.query.range)}. Double tap to run.`}
                  onPress={() =>
                    router.push({
                      pathname: '/analytics/reports/build',
                      params: { reportId: report.reportId },
                    })
                  }
                  className="flex-1 mr-2"
                >
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-bold"
                  >
                    {report.name}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-semibold mt-0.5"
                  >
                    {describeRange(report.query.range)} ·{' '}
                    {report.query.metrics?.length ?? 0} figures ·{' '}
                    {report.sharing === 'private' ? 'Private' : `Shared: ${report.sharing}`}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: report.isFavorite }}
                  accessibilityLabel={
                    report.isFavorite ? 'Remove from favourites' : 'Add to favourites'
                  }
                  onPress={() =>
                    update.mutate({
                      reportId: report.reportId,
                      input: { isFavorite: !report.isFavorite },
                    })
                  }
                  hitSlop={8}
                  className="w-9 h-9 items-center justify-center"
                >
                  <Ionicons
                    name={report.isFavorite ? 'star' : 'star-outline'}
                    size={17}
                    color={
                      report.isFavorite ? tokens.color.primary[500] : tokens.color.text.placeholder
                    }
                  />
                </Pressable>

                {report.isOwnedByCaller ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${report.name}`}
                    onPress={() => remove.mutate(report.reportId)}
                    hitSlop={8}
                    className="w-9 h-9 items-center justify-center"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={tokens.color.text.placeholder}
                    />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
