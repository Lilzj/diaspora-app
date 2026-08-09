// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Wallet analytics (Frontend Phase 15, §30 · §68)
//
// **The most connected screen in this phase, and the one where §5 earns its
// keep.**
//
// Every figure here is computed from B15's real ledger — the member's own
// statement, which the wallet screens already read. That makes each one
// `backend`-sourced and `client-derived`: the records are the platform's, the
// arithmetic is this device's, and a member is entitled to know both. A single
// "simulated / not simulated" marker could not express that, and either answer
// would have been a lie.
//
// ── Three rules, inherited rather than reimplemented ─────────────────────────
//
//   **No currency is summed with another.** A member holding GBP and NGN gets
//   two sections. The platform does not convert, so a single total would need an
//   exchange rate this client has no authority to pick — and `lib/money.ts`
//   refuses to add mismatched currencies, which is what makes the rule hold
//   rather than merely being stated here.
//
//   **The arithmetic is minor-unit integer arithmetic**, through the existing
//   money module. §68 forbids recreating financial calculations and the nearest
//   thing to recreating one is redoing it in floating point.
//
//   **A truncated period says so.** The client reads at most eight ledger pages
//   — §51 — and where that stops short of the range, the screen says the figures
//   cover only the most recent entries rather than presenting a partial total as
//   a total. That cap is the whole substance of FRONTEND-PHASE15-GAP-018.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { usePrimaryWallet } from '@/hooks/financial';
import { useAnalyticsAccess, useAnalyticsControls, useWalletAnalytics } from '@/hooks/analytics';
import { describeTimezone } from '@/lib/analytics/time-range';
import {
  AnalyticsEmptyState,
  AnalyticsScreen,
  AnalyticsSection,
  MetricGrid,
  RangePicker,
  useMetricDefinitionSheet,
} from '@/components/analytics';
import type { AnalyticsSubject } from '@/types/analytics';

export default function WalletAnalyticsScreen() {
  const { tokens } = useTheme();
  const pricing = usePricing();
  const definitionSheet = useMetricDefinitionSheet();

  const { wallet, isLoading: walletLoading } = usePrimaryWallet();

  const subject = useMemo<AnalyticsSubject>(() => ({ type: 'creator', id: null }), []);
  const access = useAnalyticsAccess(subject);

  const controls = useAnalyticsControls({
    initialPreset: 'last30d',
    initialComparison: 'none',
    reportingTimezone: access.access.reportingTimezone,
  });

  const walletAnalytics = useWalletAnalytics(wallet?.walletId, controls.range);

  // One section per currency the member actually transacted in. Never assumed,
  // never defaulted — §57.
  const sections = useMemo(
    () =>
      walletAnalytics.currencies.map((currency) => ({
        currency,
        metrics: walletAnalytics.metricsFor(currency),
      })),
    [walletAnalytics]
  );

  const dataset = useMemo(
    () =>
      walletAnalytics.aggregate
        ? {
            subject,
            range: controls.range,
            comparison: 'none' as const,
            // LIVE, and correctly so: these are real records read a moment ago.
            // Marking a real figure as development data would teach a reviewer
            // that the marker is noise.
            status: 'LIVE' as const,
            metrics: sections.flatMap((section) => section.metrics),
            series: [],
            breakdowns: [],
            funnels: [],
            retention: null,
            leaderboards: [],
            insights: [],
            freshness: {
              computedAt: new Date().toISOString(),
              sourceName: 'Your Diaspora wallet',
              methodology: `Added up on this device from ${walletAnalytics.aggregate.entriesRead} of your own statement entries.`,
              limitations: walletAnalytics.isTruncated
                ? [
                    'This period has more entries than can be added up on your phone, so the figures cover only the most recent ones.',
                  ]
                : undefined,
            },
            unavailableMetrics: [],
            gapKey: null,
          }
        : null,
    [walletAnalytics.aggregate, walletAnalytics.isTruncated, sections, subject, controls.range]
  );

  return (
    <AnalyticsScreen
      title="Your money"
      subtitle="From your own statement"
      dataset={dataset}
      isLoading={walletLoading || walletAnalytics.isLoading}
      error={walletAnalytics.isError ? walletAnalytics.error : null}
      onRetry={walletAnalytics.refetch}
      onRefresh={walletAnalytics.refetch}
      timezoneNote={describeTimezone(controls.range)}
      sticky={
        <RangePicker
          range={controls.range}
          preset={controls.preset}
          access={access.access}
          onChangePreset={controls.setPreset}
          onChangeCustom={controls.setCustomRange}
          locale={pricing.locale}
        />
      }
    >
      {!wallet && !walletLoading ? (
        <AnalyticsEmptyState
          reason="no-data"
          title="You do not have a wallet yet"
          body="Once you have one, what comes in and goes out will be summarised here."
          actionLabel="Open your wallet"
          onAction={() => router.push('/wallet')}
        />
      ) : null}

      {sections.length === 0 && wallet && !walletAnalytics.isLoading ? (
        <AnalyticsEmptyState
          reason="no-activity"
          title="Nothing moved in this period"
          body="Your wallet had no entries between these dates. Try a longer period."
        />
      ) : null}

      {sections.map((section) => (
        <AnalyticsSection
          key={section.currency}
          title={section.currency}
          subtitle={
            sections.length > 1
              ? 'Diaspora does not convert between currencies, so each is shown on its own.'
              : undefined
          }
        >
          <MetricGrid
            metrics={section.metrics}
            locale={pricing.locale}
            onPressMetric={definitionSheet.open}
          />
        </AnalyticsSection>
      ))}

      {walletAnalytics.isTruncated ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel="This period has more entries than can be added up on your phone. The figures above cover only the most recent ones. Open your full statement to see everything."
          style={{ backgroundColor: tokens.color.warning.surface }}
          className="rounded-2xl p-4 mb-6 flex-row items-start"
        >
          <Ionicons name="information-circle-outline" size={16} color={tokens.color.warning.default} />
          <View className="flex-1 ml-2.5">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[12px] font-semibold leading-relaxed"
            >
              This period has more entries than your phone will add up in one go, so the figures
              above cover only the most recent ones.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your full statement"
              onPress={() => router.push('/wallet/statement')}
              className="mt-2"
            >
              <Text
                style={{ color: tokens.color.primary[500] }}
                className="text-[11px] font-black uppercase tracking-wider"
              >
                Open your full statement
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {sections.length > 0 ? (
        <AnalyticsSection title="Where these come from">
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel="These figures are added up on this device from your real Diaspora statement. Diaspora holds the records; your phone does the arithmetic. Nothing here is estimated or simulated."
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-4"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[12px] font-semibold leading-relaxed"
            >
              These are added up on this device from your real Diaspora statement. Diaspora holds
              the records; your phone does the arithmetic. Nothing here is estimated or made up.
            </Text>
          </View>
        </AnalyticsSection>
      ) : null}

      {definitionSheet.sheet}
    </AnalyticsScreen>
  );
}
