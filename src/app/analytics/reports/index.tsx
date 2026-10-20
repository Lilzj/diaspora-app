// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Saved reports (Frontend Phase 15, §45)
//
// Saved, shared and favourite reports, each in its own list.
//
// ── Private only, and said so ────────────────────────────────────────────────
//
// `GET/POST/PUT/DELETE /analytics/reports` are served since 20 Oct 2026, and the
// server accepts one sharing level: private. Its shared list is always empty.
// So there is no "Shared with you" tab — it could only ever say "nothing has
// been shared with you", a claim about other people's actions that nobody can
// take — and the screen says why instead.
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
  AnalyticsHeader,
  AnalyticsSkeleton,
} from '@/components/analytics';
import { describeRange } from '@/lib/analytics/time-range';

type Scope = 'mine' | 'favorites';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'mine', label: 'Yours' },
  { value: 'favorites', label: 'Favourites' },
];

export default function SavedReportsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<Scope>('mine');

  const { reports, isLoading, isError, refetch } = useAnalyticsReports(scope);
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
        <Text
          testID="analytics-reports-sharing-note"
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold leading-relaxed mb-5"
        >
          Reports are private to you. Sharing a report with a community, an organisation or the whole platform is not available yet, so there is no shared list.
        </Text>

        {isLoading ? (
          <AnalyticsSkeleton rows={3} />
        ) : isError ? (
          // Unanswered is not "you have no reports".
          <AnalyticsEmptyState
            reason="backend-unavailable"
            title="Your reports could not be loaded"
            body="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : reports.length === 0 ? (
          <AnalyticsEmptyState
            reason="no-data"
            title={scope === 'favorites' ? 'No favourites yet' : 'You have not built a report yet'}
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
                    {report.query.metrics?.length ?? 0} figures · Private
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
