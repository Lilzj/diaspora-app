// ─────────────────────────────────────────────────────────────────────────────
// Community impact (§34)
//
// The screen where §34 bites hardest: "Do not invent metrics. If metrics are
// unavailable, create a backend gap."
//
// So there is exactly one real figure on this screen — the member's own giving,
// from `GET /financial/giving/me`, which is a certified B15 route — and it is
// separated from everything else and marked as real. Every other figure is
// marked simulated, and the screen says plainly that the platform cannot
// measure them yet.
//
// The alternative would have been to show only the one real number, which would
// have been a screen nobody could review. §34's instruction is to build the
// complete UX and register the gap, which is what this is.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PartlyRealNotice,
  Section,
  Stat,
  VerifiedFigure,
} from '@/components/community';
import { AmountDisplay } from '@/components/financial';
import { useCommunityImpact, useGivingHistory } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { AnalyticsPeriod } from '@/types/community-advanced';
import type { Money } from '@/types/financial';

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All time' },
];

export default function CommunityImpactScreen() {
  const { scope, scopeId } = useLocalSearchParams<{
    scope?: 'member' | 'organization' | 'neighborhood' | 'country';
    scopeId?: string;
  }>();
  const { tokens } = useTheme();
  const [period, setPeriod] = useState<AnalyticsPeriod>('12m');

  const resolvedScope = scope ?? 'member';
  const { impact, isLoading, isError, error, refetch, isEnabled } = useCommunityImpact({
    scope: resolvedScope,
    scopeId,
    period,
  });

  const giving = useGivingHistory();

  useEffect(() => {
    trackCommunityEvent('community.impact.viewed', { scope: resolvedScope, period });
  }, [resolvedScope, period]);

  /**
   * The member's real giving total.
   *
   * Summed here from B15's own completed donation records rather than taken
   * from anywhere simulated. Only `Completed` donations count — a pending one
   * has not moved, and a failed one never will. Currencies are not converted:
   * the platform never converts, so a member with donations in two currencies
   * sees the one they gave most in and a note. Anything else would be inventing
   * an exchange rate.
   */
  const realGiving = useMemo(() => {
    const donations = (giving.history?.donations ?? []).filter((d) => d.status === 'Completed');
    if (donations.length === 0) return null;

    const byCurrency = new Map<string, Money>();
    for (const donation of donations) {
      const existing = byCurrency.get(donation.amount.currency);
      byCurrency.set(
        donation.amount.currency,
        existing
          ? {
              ...existing,
              minorUnits: existing.minorUnits + donation.amount.minorUnits,
              amount:
                (existing.minorUnits + donation.amount.minorUnits) / 10 ** existing.exponent,
            }
          : donation.amount
      );
    }

    const totals = [...byCurrency.values()].sort((a, b) => b.minorUnits - a.minorUnits);

    return {
      primary: totals[0],
      otherCurrencyCount: totals.length - 1,
      donationCount: donations.length,
      contributionCount: giving.history?.contributions.length ?? 0,
      nonMonetaryCount: giving.history?.nonMonetaryContributionCount ?? 0,
    };
  }, [giving.history]);

  return (
    <CommunityScreen
      title="Community impact"
      subtitle={impact?.scopeName}
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="Period"
          options={PERIODS}
          value={period}
          onChange={setPeriod}
        />

        {/* ── The real half ────────────────────────────────────────────────── */}
        {resolvedScope === 'member' ? (
          <Section title="What you have given" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              {!giving.canRead ? (
                <InlineRefusal
                  icon="lock-closed-outline"
                  reason="Sign in and verify your account to see your giving history."
                />
              ) : realGiving ? (
                <Card>
                  <AmountDisplay
                    value={realGiving.primary}
                    size="large"
                    accessibilityPrefix="Total you have given"
                  />
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-bold mt-1"
                  >
                    across {realGiving.donationCount}{' '}
                    {realGiving.donationCount === 1 ? 'donation' : 'donations'}
                    {realGiving.otherCurrencyCount > 0
                      ? ` · plus giving in ${realGiving.otherCurrencyCount} other ${
                          realGiving.otherCurrencyCount === 1 ? 'currency' : 'currencies'
                        }, shown separately in your wallet`
                      : ''}
                  </Text>

                  {realGiving.nonMonetaryCount > 0 ? (
                    <View className="flex-row items-center mt-2.5">
                      <Ionicons name="hand-left-outline" size={13} color={tokens.color.text.placeholder} />
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-[11px] font-bold ml-1.5"
                      >
                        {realGiving.nonMonetaryCount} contributions of goods, time or skills
                      </Text>
                    </View>
                  ) : null}

                  <View className="mt-3">
                    <VerifiedFigure label="Real — from your Diaspora giving" />
                  </View>
                </Card>
              ) : (
                <EmptyState
                  icon="heart-outline"
                  title="You have not given yet"
                  body="Anything you donate through Diaspora shows up here, with its receipt."
                />
              )}

              <View className="mt-3">
                <InlineRefusal
                  icon="eye-off-outline"
                  reason="Anonymous donations are not counted here. Diaspora does not record who made them, so there is nothing to add to your total — which is the point of giving anonymously."
                />
              </View>
            </View>
          </Section>
        ) : null}

        {/* ── The simulated half, marked ───────────────────────────────────── */}
        {impact ? (
          <>
            <View className="mt-6">
              <PartlyRealNotice
                gapKey="communityImpact"
                realPart={
                  resolvedScope === 'member'
                    ? 'what you have given, above — that comes from Diaspora’s giving platform'
                    : 'nothing on this section yet'
                }
                simulatedPart="every figure below — Diaspora has no way to measure community impact yet, so these are placeholders showing what the screen will look like"
              />
            </View>

            <Section title="Community" style={{ marginHorizontal: -20 }}>
              <View className="px-5 flex-row flex-wrap" style={{ gap: 10 }}>
                <View style={{ width: '47%' }}>
                  <Stat label="Members helped" value={impact.membersHelped} icon="people-outline" />
                </View>
                <View style={{ width: '47%' }}>
                  <Stat
                    label="Volunteer hours"
                    value={impact.volunteerHours}
                    icon="time-outline"
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <Stat
                    label="Events hosted"
                    value={impact.eventsHosted}
                    icon="calendar-outline"
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <Stat
                    label="Events attended"
                    value={impact.eventsAttended}
                    icon="checkmark-done-outline"
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <Stat
                    label="Polls taken part in"
                    value={impact.pollsParticipated}
                    icon="bar-chart-outline"
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <Stat
                    label="Initiatives supported"
                    value={impact.initiativesSupported}
                    icon="sparkles-outline"
                  />
                </View>
              </View>
            </Section>

            <View className="px-5 mt-6">
              <InlineRefusal
                icon="information-circle-outline"
                reason="A number nobody can reconcile is worse than no number at all. Diaspora will show real impact figures once the platform can measure them — and until then it says which ones it cannot."
              />
            </View>
          </>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
