// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Advertising dashboard (Frontend Phase 6)
//
// ⚠ THE WHOLE ADVERTISING SURFACE IS SIMULATED. MON-GAP-001. ⚠
//
// §13's advertising dashboard. There is no campaign aggregate in the certified
// backend — `Campaign` is a product *category* and nothing else — so every
// campaign here, its status, its spend and its performance come from the
// development adapter under `/monetization-gap/v0`.
//
// The screen is built in full anyway, because the flow is the deliverable: when
// a backend phase implements campaigns, this screen swaps one import and the
// notice disappears.
//
// In a release build `areMonetizationGapsEnabled()` is false, the queries never
// run, and this renders the honest "not available yet" state rather than an
// empty dashboard that looks like a member with no campaigns.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorView } from '@/components/financial';
import {
  CampaignRow,
  MonetizationEmpty,
  MonetizationGapNotice,
  MonetizationSection,
  SimulatedFigureBadge,
} from '@/components/monetization';
import { useCampaigns, usePerformanceSummary } from '@/hooks/monetization-gaps';
import { usePricing } from '@/providers/pricing-provider';
import { useRefreshControl } from '@/hooks/usePullToRefresh';

type Bucket = 'all' | 'live' | 'review' | 'finished';

const BUCKETS: { key: Bucket; label: string; statuses: string[] }[] = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'live', label: 'Running', statuses: ['Active', 'Scheduled', 'Approved', 'Paused'] },
  {
    key: 'review',
    label: 'Waiting',
    statuses: ['Draft', 'PendingPayment', 'Submitted', 'UnderReview'],
  },
  { key: 'finished', label: 'Finished', statuses: ['Completed', 'Cancelled', 'Rejected', 'Failed'] },
];

export default function CampaignsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const [bucket, setBucket] = useState<Bucket>('all');
  const { campaigns, isLoading, isError, error, refetch, isEnabled } = useCampaigns();
  const performance = usePerformanceSummary();

  const filtered = useMemo(() => {
    const spec = BUCKETS.find((entry) => entry.key === bucket);
    if (!spec || spec.statuses.length === 0) return campaigns;
    return campaigns.filter((campaign) => spec.statuses.includes(String(campaign.status)));
  }, [campaigns, bucket]);

  // A release build cannot reach the adapter at all. Saying so is the whole
  // point of the switch — an empty dashboard would read as "you have no
  // campaigns", which is a different and false statement.
  if (!isEnabled) {
    return (
      <Shell>
        <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
          <MonetizationGapNotice gapKey="campaigns" />
          <View className="mt-5">
            <MonetizationEmpty
              icon="albums-outline"
              title="Advertising is not open yet"
              message="Diaspora cannot run advertising campaigns yet. In the meantime you can promote an individual listing, job, property or event, which does work today."
              action={{
                label: 'Promote something instead',
                onPress: () => router.push('/monetization/promote'),
              }}
            />
          </View>
        </ScrollEndScrollView>
      </Shell>
    );
  }

  if (isError && error) {
    return (
      <Shell>
        <FinancialErrorView error={error} onRetry={refetch} />
      </Shell>
    );
  }

  // The spinner used to be given a literal `false`, so the refetch ran but
  // the control snapped straight back and the pull read as inert.
  const refreshControl = useRefreshControl(refetch);

  return (
    <Shell>
      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        <MonetizationGapNotice gapKey="campaigns" />

        {/* The rollup. Simulated, and marked twice — once here and once by the
            notice above. */}
        {performance.summary ? (
          <View className="mt-5">
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Across your campaigns: shown ${performance.summary.totalImpressions.toLocaleString()} times, tapped ${performance.summary.totalClicks.toLocaleString()} times, ${performance.summary.totalConversions.toLocaleString()} results, ${pricing.describe(
                performance.summary.totalSpend
              )} spent. These figures are simulated.`}
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
            >
              <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                {[
                  { label: 'Shown', value: performance.summary.totalImpressions.toLocaleString() },
                  { label: 'Tapped', value: performance.summary.totalClicks.toLocaleString() },
                  { label: 'Results', value: performance.summary.totalConversions.toLocaleString() },
                  { label: 'Spent', value: pricing.format(performance.summary.totalSpend) },
                ].map((metric) => (
                  <View key={metric.label} style={{ flexBasis: '45%', flexGrow: 1 }}>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[10px] font-black uppercase tracking-widest"
                    >
                      {metric.label}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-lg font-black tracking-tight mt-0.5"
                    >
                      {metric.value}
                    </Text>
                  </View>
                ))}
              </View>

              {performance.summary.costPerResult ? (
                <View
                  style={{ borderTopColor: tokens.color.border.default }}
                  className="flex-row items-center justify-between border-t mt-3 pt-3"
                >
                  <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
                    Cost per result
                  </Text>
                  <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                    {pricing.format(performance.summary.costPerResult)}
                  </Text>
                </View>
              ) : null}

              <View className="mt-3">
                <SimulatedFigureBadge label="Not real figures" />
              </View>
            </View>
          </View>
        ) : null}

        {/* Create. The primary action on an advertising dashboard. */}
        <TouchableOpacity
          onPress={() => router.push('/monetization/campaigns/create')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create a campaign"
          accessibilityHint="Opens the campaign builder."
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="flex-row items-center justify-center rounded-full h-14 mt-5"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF' }} className="text-sm font-black tracking-tight ml-1.5">
            Create a campaign
          </Text>
        </TouchableOpacity>

        <View className="mt-8">
          <MonetizationSection title="Your campaigns">
            {campaigns.length > 0 ? (
              <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
                {BUCKETS.map((entry) => {
                  const isSelected = bucket === entry.key;
                  const count =
                    entry.statuses.length === 0
                      ? campaigns.length
                      : campaigns.filter((campaign) => entry.statuses.includes(String(campaign.status)))
                          .length;

                  return (
                    <TouchableOpacity
                      key={entry.key}
                      onPress={() => setBucket(entry.key)}
                      activeOpacity={0.8}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${entry.label}, ${count} ${count === 1 ? 'campaign' : 'campaigns'}`}
                      style={{
                        backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                      }}
                      className="flex-row items-center rounded-full border px-3.5 py-2"
                    >
                      <Text
                        style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
                        className="text-xs font-black"
                      >
                        {entry.label}
                      </Text>
                      {count > 0 ? (
                        <Text
                          style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.placeholder }}
                          className="text-xs font-bold ml-1.5"
                        >
                          {count}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {isLoading ? (
              <View accessible accessibilityLabel="Loading your campaigns." style={{ gap: 10 }}>
                {[0, 1].map((index) => (
                  <View
                    key={index}
                    style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
                    className="rounded-2xl h-32"
                  />
                ))}
              </View>
            ) : filtered.length === 0 ? (
              <MonetizationEmpty
                icon="albums-outline"
                title={campaigns.length === 0 ? 'No campaigns yet' : 'Nothing in here'}
                message={
                  campaigns.length === 0
                    ? 'A campaign puts your business in front of people across Diaspora — the home feed, search, category directories and more.'
                    : 'Try another tab.'
                }
                action={
                  campaigns.length === 0
                    ? {
                        label: 'Create your first campaign',
                        onPress: () => router.push('/monetization/campaigns/create'),
                      }
                    : undefined
                }
              />
            ) : (
              <View style={{ gap: 10 }}>
                {filtered.map((campaign) => (
                  <CampaignRow
                    key={campaign.campaignId}
                    campaign={campaign}
                    onPress={() => router.push(`/monetization/campaigns/${campaign.campaignId}`)}
                  />
                ))}
              </View>
            )}
          </MonetizationSection>
        </View>
      </ScrollEndScrollView>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Advertising" showBack />
      {children}
    </SafeAreaView>
  );
}
